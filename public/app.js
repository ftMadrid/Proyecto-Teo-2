const STORAGE_KEY = 'db_manager_saved_connections';
const form = document.getElementById('conn-form');
const statusMsg = document.getElementById('status-msg');
const savedList = document.getElementById('saved-list');
const activeList = document.getElementById('active-list');
const activeBadge = document.getElementById('active-badge');
const dbPreview = document.getElementById('db-preview');

function getFormData() {
    return {
        name: document.getElementById('name').value.trim(),
        host: document.getElementById('host').value.trim(),
        port: Number(document.getElementById('port').value),
        user: document.getElementById('user').value.trim(),
        password: document.getElementById('password').value,
        database: document.getElementById('database').value.trim()
    };
}

function showStatus(text, isError = false) {
    statusMsg.textContent = text;
    statusMsg.className = `text-sm px-4 py-2.5 rounded-lg ${
        isError
            ? 'bg-rose-950 text-rose-300 border border-rose-800'
            : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
    }`;
}

function loadSavedConnections() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
}

function saveConnectionProfile(profile) {
    const list = loadSavedConnections();
    const index = list.findIndex(c => c.name === profile.name);
    // Guardamos el perfil sin la contraseña por seguridad, o reemplaza si ya existe el nombre
    const toStore = { ...profile, password: '' };
    if (index >= 0) list[index] = toStore;
    else list.push(toStore);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    renderSavedConnections();
}

function deleteSavedProfile(name) {
    const list = loadSavedConnections().filter(c => c.name !== name);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    renderSavedConnections();
}

function fillForm(profile) {
    document.getElementById('name').value = profile.name || '';
    document.getElementById('host').value = profile.host || '127.0.0.1';
    document.getElementById('port').value = profile.port || 6333;
    document.getElementById('user').value = profile.user || '';
    document.getElementById('database').value = profile.database || '';
    document.getElementById('password').value = '';
    document.getElementById('password').focus();
}

function renderSavedConnections() {
    const list = loadSavedConnections();
    if (list.length === 0) {
        savedList.innerHTML = '<p class="text-slate-500">No hay conexiones guardadas aún.</p>';
        return;
    }

    savedList.innerHTML = '';
    list.forEach(conn => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between bg-slate-950 border border-slate-800 p-3 rounded-lg hover:border-slate-700';
        div.innerHTML = `
            <div class="cursor-pointer flex-1" data-action="load">
                <p class="font-medium text-slate-200">${conn.name}</p>
                <p class="text-xs text-slate-500">${conn.user}@${conn.host}:${conn.port}</p>
            </div>
            <button data-action="delete" class="text-xs text-rose-400 hover:text-rose-300 px-2 py-1">
                Eliminar
            </button>
        `;
        div.querySelector('[data-action="load"]').addEventListener('click', () => fillForm(conn));
        div.querySelector('[data-action="delete"]').addEventListener('click', () => deleteSavedProfile(conn.name));
        savedList.appendChild(div);
    });
}

async function refreshActiveConnections() {
    const res = await fetch('/api/connections');
    const data = await res.json();
    const list = data.connections || [];

    activeBadge.textContent = `${list.length} ${list.length === 1 ? 'conexión activa' : 'conexiones activas'}`;
    if (list.length === 0) {
        activeList.innerHTML = '<p class="text-slate-500">Ninguna sesión abierta.</p>';
        return;
    }

    activeList.innerHTML = '';
    list.forEach(conn => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between bg-slate-950 border border-emerald-900/50 p-3 rounded-lg';
        div.innerHTML = `
            <div>
                <p class="font-medium text-emerald-400">${conn.name}</p>
                <p class="text-xs text-slate-500">${conn.user}@${conn.host}:${conn.port}</p>
            </div>
            <button class="text-xs bg-rose-950 hover:bg-rose-900 text-rose-300 px-2.5 py-1 rounded">
                Desconectar
            </button>
        `;
        div.querySelector('button').addEventListener('click', async () => {
            await fetch(`/api/connections/${conn.id}`, { method: 'DELETE' });
            refreshActiveConnections();
        });
        activeList.appendChild(div);
    });
}

// Botón Probar Conexión
document.getElementById('btn-test').addEventListener('click', async () => {
    showStatus('Probando conexión...');
    const res = await fetch('/api/connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getFormData())
    });
    const data = await res.json();
    if (data.ok) {
        showStatus(`Conexión exitosa. MariaDB ${data.version} (${data.currentUser})`);
    } else {
        showStatus(`Error: ${data.error}`, true);
    }
});

// Botón Guardar y Conectar
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = getFormData();
    showStatus('Conectando...');

    const res = await fetch('/api/connections/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.ok) {
        showStatus(`Conectado a ${data.info.name}`);
        saveConnectionProfile(payload);
        refreshActiveConnections();

        // Mostrar bases de datos obtenidas
        dbPreview.classList.remove('hidden');
        document.getElementById('preview-title').textContent = data.info.name;
        document.getElementById('preview-version').textContent = `MariaDB ${data.info.version}`;
        document.getElementById('db-tags').innerHTML = data.databases
            .map(db => `<span class="px-3 py-1 bg-slate-800 border border-slate-700 rounded-md text-xs text-slate-200">${db}</span>`)
            .join('');
    } else {
        showStatus(`Error al conectar: ${data.error}`, true);
    }
});

document.getElementById('btn-new').addEventListener('click', () => {
    form.reset();
    document.getElementById('host').value = '127.0.0.1';
    document.getElementById('port').value = 6333;
    statusMsg.className = 'hidden';
});

// Inicializar
renderSavedConnections();
refreshActiveConnections();