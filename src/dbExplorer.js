const { getPool } = require('./connectionManager');

// Escape identifiers safely for backticks
function safeId(name) {
    return '`' + String(name).replace(/`/g, '``') + '`';
}

// Convert BigInt values returned by MariaDB driver so JSON.stringify never fails
function normalizeValue(val) {
    if (typeof val === 'bigint') return Number(val);
    if (Buffer.isBuffer(val)) return val.toString('utf8');
    if (val instanceof Date) return val.toISOString();
    return val;
}

function normalizeRows(rows) {
    if (!Array.isArray(rows)) return rows;
    return rows.map(row => {
        const clean = {};
        for (const [k, v] of Object.entries(row)) {
            clean[k] = normalizeValue(v);
        }
        return clean;
    });
}

// Inspect SQL outside strings, comments and parentheses to check if safe to paginate
function analyzeSqlForPagination(sql) {
    const src = String(sql || '');
    let i = 0;
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let firstWord = '';
    let hasTopLevelLimit = false;
    let hasTopLevelInto = false;
    let hasTopLevelLock = false;
    let firstSemicolonIdx = -1;
    let hasCodeAfterSemicolon = false;

    while (i < src.length) {
        const ch = src[i];
        const next = src[i + 1];

        if (inSingle) {
            if (ch === '\\') { i += 2; continue; }
            if (ch === "'" && next === "'") { i += 2; continue; }
            if (ch === "'") inSingle = false;
            i++;
            continue;
        }
        if (inDouble) {
            if (ch === '\\') { i += 2; continue; }
            if (ch === '"' && next === '"') { i += 2; continue; }
            if (ch === '"') inDouble = false;
            i++;
            continue;
        }
        if (inBacktick) {
            if (ch === '`' && next === '`') { i += 2; continue; }
            if (ch === '`') inBacktick = false;
            i++;
            continue;
        }

        // Skip line comments (-- or #)
        if ((ch === '-' && next === '-') || ch === '#') {
            while (i < src.length && src[i] !== '\n') i++;
            continue;
        }

        // Skip block comments (/* ... */)
        if (ch === '/' && next === '*') {
            i += 2;
            while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
            i += 2;
            continue;
        }

        if (ch === "'") { inSingle = true; i++; continue; }
        if (ch === '"') { inDouble = true; i++; continue; }
        if (ch === '`') { inBacktick = true; i++; continue; }

        if (/\s/.test(ch)) { i++; continue; }

        if (ch === ';' && depth === 0) {
            if (firstSemicolonIdx === -1) firstSemicolonIdx = i;
            i++;
            continue;
        }

        if (firstSemicolonIdx !== -1) {
            hasCodeAfterSemicolon = true;
            break;
        }

        if (ch === '(') { depth++; i++; continue; }
        if (ch === ')') { depth = Math.max(0, depth - 1); i++; continue; }

        if (/[a-zA-Z_]/.test(ch)) {
            let start = i;
            while (i < src.length && /[a-zA-Z0-9_$]/.test(src[i])) i++;
            const word = src.slice(start, i).toUpperCase();

            if (!firstWord) firstWord = word;

            if (depth === 0) {
                if (word === 'LIMIT') hasTopLevelLimit = true;
                else if (word === 'INTO') hasTopLevelInto = true;
                else if (word === 'FOR' || word === 'LOCK') hasTopLevelLock = true;
            }
            continue;
        }

        i++;
    }

    const isSelect = firstWord === 'SELECT' || firstWord === 'WITH';
    const cleanSql = (firstSemicolonIdx !== -1 ? src.slice(0, firstSemicolonIdx) : src).trim();
    const canPaginate = isSelect && !hasTopLevelLimit && !hasTopLevelInto && !hasTopLevelLock && !hasCodeAfterSemicolon && cleanSql.length > 0;

    return { isSelect, canPaginate, cleanSql };
}

// List all databases
async function listDatabases(connId) {
    const pool = getPool(connId);
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query('SHOW DATABASES');
        return rows.map(r => Object.values(r)[0]);
    } finally {
        if (conn) conn.release();
    }
}

// List tables, views, procedures, functions and triggers (no information_schema)
async function listDatabaseObjects(connId, dbName) {
    const pool = getPool(connId);
    let conn;
    try {
        conn = await pool.getConnection();
        const escapedDb = safeId(dbName);

        const tableRows = await conn.query(`SHOW FULL TABLES FROM ${escapedDb}`);
        const tables = [];
        const views = [];
        for (const row of tableRows) {
            const values = Object.values(row);
            const name = values[0];
            const type = String(values[1] || '').toUpperCase();
            if (type === 'VIEW') views.push(name);
            else tables.push(name);
        }

        let procedures = [];
        let functions = [];
        try {
            const procRows = await conn.query(
                'SELECT name, type FROM mysql.proc WHERE db = ? ORDER BY name',
                [dbName]
            );
            for (const p of procRows) {
                if (String(p.type).toUpperCase() === 'PROCEDURE') procedures.push(p.name);
                else if (String(p.type).toUpperCase() === 'FUNCTION') functions.push(p.name);
            }
        } catch (err) {
            const procStatus = await conn.query('SHOW PROCEDURE STATUS WHERE Db = ?', [dbName]);
            procedures = procStatus.map(r => r.Name);
            const funcStatus = await conn.query('SHOW FUNCTION STATUS WHERE Db = ?', [dbName]);
            functions = funcStatus.map(r => r.Name);
        }

        let triggers = [];
        try {
            const trigRows = await conn.query(`SHOW TRIGGERS FROM ${escapedDb}`);
            triggers = trigRows.map(r => ({
                name: r.Trigger,
                table: r.Table,
                event: r.Event,
                timing: r.Timing
            }));
        } catch (err) {
            triggers = [];
        }

        return { tables, views, procedures, functions, triggers };
    } finally {
        if (conn) conn.release();
    }
}

// List server users from system table mysql.user
async function listUsers(connId) {
    const pool = getPool(connId);
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query('SELECT User AS user, Host AS host FROM mysql.user ORDER BY User, Host');
        return normalizeRows(rows);
    } finally {
        if (conn) conn.release();
    }
}

// Execute SQL query from the SQL Editor with automatic pagination (500 rows default)
async function executeQuery(connId, sql, database, page = 1, pageSize = 500) {
    const pool = getPool(connId);
    let conn;
    const start = Date.now();
    const safePage = Math.max(1, Math.floor(Number(page)) || 1);
    const safeSize = Math.max(1, Math.min(Math.floor(Number(pageSize)) || 500, 2000));
    const offset = (safePage - 1) * safeSize;

    const analysis = analyzeSqlForPagination(sql);
    const applySelectLimit = analysis.isSelect && !analysis.canPaginate;

    try {
        conn = await pool.getConnection();
        if (database && database.trim() !== '') {
            await conn.query(`USE ${safeId(database.trim())}`);
        }

        try {
            await conn.query('SET SESSION max_statement_time = 15');
        } catch (e) {
            // Ignore if unsupported
        }

        let queryToRun = sql;
        if (analysis.canPaginate) {
            queryToRun = `${analysis.cleanSql}\nLIMIT ${safeSize + 1} OFFSET ${offset}`;
        } else if (applySelectLimit) {
            await conn.query(`SET SESSION sql_select_limit = ${safeSize + 1}`);
        }

        const raw = await conn.query(queryToRun);
        const durationMs = Date.now() - start;

        if (Array.isArray(raw)) {
            if (analysis.canPaginate) {
                const hasMore = raw.length > safeSize;
                const sliced = hasMore ? raw.slice(0, safeSize) : raw;
                const rows = normalizeRows(sliced);
                const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
                return {
                    type: 'resultset',
                    columns,
                    rows,
                    rowCount: rows.length,
                    paginated: true,
                    page: safePage,
                    pageSize: safeSize,
                    offset,
                    hasMore,
                    durationMs
                };
            }

            const truncated = applySelectLimit && raw.length > safeSize;
            const sliced = truncated ? raw.slice(0, safeSize) : raw;
            const rows = normalizeRows(sliced);
            const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
            return {
                type: 'resultset',
                columns,
                rows,
                rowCount: rows.length,
                paginated: false,
                truncated,
                limit: safeSize,
                durationMs
            };
        }

        return {
            type: 'ok',
            affectedRows: normalizeValue(raw.affectedRows || 0),
            insertId: normalizeValue(raw.insertId || 0),
            warningStatus: normalizeValue(raw.warningStatus || 0),
            durationMs
        };
    } finally {
        if (conn) {
            if (applySelectLimit) {
                try {
                    await conn.query('SET SESSION sql_select_limit = DEFAULT');
                } catch (e) {
                    // Ignore cleanup error
                }
            }
            try {
                await conn.query('SET SESSION max_statement_time = 0');
            } catch (e) {
                // Ignore cleanup error
            }
            conn.release();
        }
    }
}

// Browse table or view data with real pagination (LIMIT / OFFSET)
async function browseTableData(connId, dbName, objectName, page = 1, pageSize = 500) {
    const pool = getPool(connId);
    let conn;
    const start = Date.now();
    const safePage = Math.max(1, Math.floor(Number(page)) || 1);
    const safeSize = Math.max(1, Math.min(Math.floor(Number(pageSize)) || 500, 2000));
    const offset = (safePage - 1) * safeSize;

    try {
        conn = await pool.getConnection();
        try {
            await conn.query('SET SESSION max_statement_time = 15');
        } catch (e) {
            // Ignore if unsupported
        }

        const sql = `SELECT * FROM ${safeId(dbName)}.${safeId(objectName)} LIMIT ${safeSize + 1} OFFSET ${offset}`;
        const raw = await conn.query(sql);
        const durationMs = Date.now() - start;

        const hasMore = raw.length > safeSize;
        const sliced = hasMore ? raw.slice(0, safeSize) : raw;
        const rows = normalizeRows(sliced);
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

        return {
            type: 'resultset',
            columns,
            rows,
            rowCount: rows.length,
            paginated: true,
            page: safePage,
            pageSize: safeSize,
            offset,
            hasMore,
            durationMs,
            displaySql: `SELECT * FROM ${safeId(dbName)}.${safeId(objectName)};`
        };
    } finally {
        if (conn) {
            try {
                await conn.query('SET SESSION max_statement_time = 0');
            } catch (e) {
                // Ignore cleanup error
            }
            conn.release();
        }
    }
}

module.exports = {
    listDatabases,
    listDatabaseObjects,
    listUsers,
    executeQuery,
    browseTableData
};