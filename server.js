const express = require('express');
const path = require('path');
const connManager = require('./src/connectionManager');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Estado del servidor
app.get('/api/status', (req, res) => {
    res.json({ ok: true, message: 'Servidor Node.js + Express activo en Docker' });
});

// Probar credenciales sin abrir sesion
app.post('/api/connections/test', async (req, res) => {
    try {
        const result = await connManager.testConnection(req.body);
        res.json(result);
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

// Abrir una nueva conexion (soporta multiples simultaneas)
app.post('/api/connections/connect', async (req, res) => {
    try {
        const data = await connManager.openConnection(req.body);
        res.json({ ok: true, ...data });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

// Listar conexiones activas en el servidor
app.get('/api/connections', (req, res) => {
    res.json({ ok: true, connections: connManager.listActiveConnections() });
});

// Cerrar una conexion especifica
app.delete('/api/connections/:id', async (req, res) => {
    try {
        const closed = await connManager.closeConnection(req.params.id);
        res.json({ ok: closed });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Database Manager corriendo en http://0.0.0.0:${PORT}`);
});
