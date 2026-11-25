const express = require('express');
const path = require('path');
const connManager = require('./src/connectionManager');
const dbExplorer = require('./src/dbExplorer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (req, res) => {
    res.json({ ok: true, message: 'Node.js + Express server active' });
});

app.post('/api/connections/test', async (req, res) => {
    try {
        const result = await connManager.testConnection(req.body);
        res.json(result);
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

app.post('/api/connections/connect', async (req, res) => {
    try {
        const data = await connManager.openConnection(req.body);
        res.json({ ok: true, ...data });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

app.get('/api/connections', (req, res) => {
    res.json({ ok: true, connections: connManager.listActiveConnections() });
});

app.get('/api/connections/:id', (req, res) => {
    try {
        const info = connManager.getConnectionInfo(req.params.id);
        res.json({ ok: true, info });
    } catch (err) {
        res.status(404).json({ ok: false, error: err.message });
    }
});

app.delete('/api/connections/:id', async (req, res) => {
    try {
        const closed = await connManager.closeConnection(req.params.id);
        res.json({ ok: closed });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Workspace: list databases
app.get('/api/connections/:id/databases', async (req, res) => {
    try {
        const databases = await dbExplorer.listDatabases(req.params.id);
        res.json({ ok: true, databases });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

// Workspace: list objects inside a database
app.get('/api/connections/:id/databases/:db/objects', async (req, res) => {
    try {
        const objects = await dbExplorer.listDatabaseObjects(req.params.id, req.params.db);
        res.json({ ok: true, objects });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

// Workspace: list server users
app.get('/api/connections/:id/users', async (req, res) => {
    try {
        const users = await dbExplorer.listUsers(req.params.id);
        res.json({ ok: true, users });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

// Workspace: execute SQL query (with automatic pagination)
app.post('/api/connections/:id/query', async (req, res) => {
    try {
        const { sql, database, page, pageSize } = req.body;
        if (!sql || !sql.trim()) {
            return res.status(400).json({ ok: false, error: 'SQL query cannot be empty.' });
        }
        const result = await dbExplorer.executeQuery(
            req.params.id,
            sql,
            database,
            Number(page) || 1,
            Number(pageSize) || 500
        );
        res.json({ ok: true, result });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

// Workspace: browse table or view with pagination
app.get('/api/connections/:id/databases/:db/objects/:name/data', async (req, res) => {
    try {
        const page = Number(req.query.page) || 1;
        const pageSize = Number(req.query.pageSize) || 500;
        const result = await dbExplorer.browseTableData(
            req.params.id,
            req.params.db,
            req.params.name,
            page,
            pageSize
        );
        res.json({ ok: true, result });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Database Manager running on http://0.0.0.0:${PORT}`);
});