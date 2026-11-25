const mariadb = require('mariadb');
const crypto = require('crypto');

// Stores active connection pools in memory: Map<id, { pool, info }>
const activeConnections = new Map();

function buildConfig({ host, port, user, password, database }) {
    const config = {
        host: host || '127.0.0.1',
        port: Number(port) || 3306,
        user,
        password,
        connectTimeout: 5000,
        connectionLimit: 5
    };
    if (database && database.trim() !== '') {
        config.database = database.trim();
    }
    return config;
}

// Quick test without keeping the connection open
async function testConnection(params) {
    let conn;
    try {
        conn = await mariadb.createConnection(buildConfig(params));
        const [row] = await conn.query('SELECT VERSION() AS version, USER() AS currentUser');
        return { ok: true, version: row.version, currentUser: row.currentUser };
    } finally {
        if (conn) await conn.end();
    }
}

// Open a persistent pool and register it with a unique ID
async function openConnection(params) {
    const config = buildConfig(params);
    const pool = mariadb.createPool(config);

    let conn;
    try {
        conn = await pool.getConnection();
        const [meta] = await conn.query('SELECT VERSION() AS version');
        const dbRows = await conn.query('SHOW DATABASES');
        const databases = dbRows.map(r => Object.values(r)[0]);

        const id = crypto.randomUUID();
        const info = {
            id,
            name: params.name || `${config.user}@${config.host}:${config.port}`,
            host: config.host,
            port: config.port,
            user: config.user,
            database: config.database || null,
            version: meta.version,
            connectedAt: new Date().toISOString()
        };

        activeConnections.set(id, { pool, info });
        return { info, databases };
    } catch (err) {
        await pool.end();
        throw err;
    } finally {
        if (conn) conn.release();
    }
}

function getPool(id) {
    const entry = activeConnections.get(id);
    if (!entry) throw new Error('Connection not found or closed.');
    return entry.pool;
}

function getConnectionInfo(id) {
    const entry = activeConnections.get(id);
    if (!entry) throw new Error('Connection not found or closed.');
    return entry.info;
}

async function closeConnection(id) {
    const entry = activeConnections.get(id);
    if (!entry) return false;
    await entry.pool.end();
    activeConnections.delete(id);
    return true;
}

function listActiveConnections() {
    return Array.from(activeConnections.values()).map(entry => entry.info);
}

module.exports = {
    testConnection,
    openConnection,
    getPool,
    getConnectionInfo,
    closeConnection,
    listActiveConnections
};