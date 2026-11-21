const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (req, res) => {
    res.json({ ok: true, message: 'Servidor Node.js + Express activo en Docker' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Database Manager corriendo en http://0.0.0.0:${PORT}`);
});
