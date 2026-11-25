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

        // Tables and Views
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

        // Procedures and Functions from system table mysql.proc
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
            // Fallback if user has no read privilege on mysql.proc
            const procStatus = await conn.query('SHOW PROCEDURE STATUS WHERE Db = ?', [dbName]);
            procedures = procStatus.map(r => r.Name);
            const funcStatus = await conn.query('SHOW FUNCTION STATUS WHERE Db = ?', [dbName]);
            functions = funcStatus.map(r => r.Name);
        }

        // Triggers
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

// Execute SQL query from the SQL Editor
async function executeQuery(connId, sql, database) {
    const pool = getPool(connId);
    let conn;
    const start = Date.now();
    try {
        conn = await pool.getConnection();
        if (database && database.trim() !== '') {
            await conn.query(`USE ${safeId(database.trim())}`);
        }
        const raw = await conn.query(sql);
        const durationMs = Date.now() - start;

        if (Array.isArray(raw)) {
            const rows = normalizeRows(raw);
            const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
            return {
                type: 'resultset',
                columns,
                rows,
                rowCount: rows.length,
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
        if (conn) conn.release();
    }
}

module.exports = {
    listDatabases,
    listDatabaseObjects,
    listUsers,
    executeQuery
};