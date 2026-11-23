const mariadb = require('mariadb');
const crypto = require('crypto');

// Almacena en memoria los pools de conexiones activas: Map<id, { pool, info }>
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

// Prueba sin dejar la conexion abierta
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

// Abre una conexión persistente (pool) y la registra con un ID único
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

// Obtiene el pool activo para ejecutar consultas en los siguientes módulos
function getPool(id) {
    const entry = activeConnections.get(id);
    if (!entry) throw new Error('| Conexion no encontrada o cerrada.');
    return entry.pool;
}

// Cierra una conexión específica
async function closeConnection(id) {
    const entry = activeConnections.get(id);
    if (!entry) return false;
    await entry.pool.end();
    activeConnections.delete(id);
    return true;
}

// Lista las conexiones activas (sin exponer passwords)
function listActiveConnections() {
    return Array.from(activeConnections.values()).map(entry => entry.info);
}

module.exports = {
    testConnection,
    openConnection,
    getPool,
    closeConnection,
    listActiveConnections
};