const STORAGE_KEY = 'db_manager_saved_connections';
const form = document.getElementById('conn-form');
const savedList = document.getElementById('saved-list');
const activeList = document.getElementById('active-list');
const activeBadge = document.getElementById('active-badge');

const toast = document.getElementById('toast');
const toastBox = document.getElementById('toast-box');
const toastText = document.getElementById('toast-text');
const toastClose = document.getElementById('toast-close');
let toastTimer = null;

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

function hideToast() {
    if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
    }
    toast.classList.add('opacity-0', 'translate-y-2', 'pointer-events-none');
    toast.classList.remove('opacity-100', 'translate-y-0', 'pointer-events-auto');
}

// type: 'info' | 'success' | 'error'
function showToast(text, type = 'success') {
    if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
    }

    const styles = {
        info: 'bg-[#0d1024]/95 text-violet-100 border-indigo-400/40 shadow-indigo-950/60',
        success: 'bg-[#071f1a]/95 text-emerald-200 border-emerald-400/50 shadow-emerald-950/60',
        error: 'bg-[#240b14]/95 text-rose-200 border-rose-400/50 shadow-rose-950/60'
    };

    toastText.textContent = text;
    toastBox.className = `flex items-start justify-between gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm backdrop-blur-md ${styles[type] || styles.info}`;

    toast.classList.remove('opacity-0', 'translate-y-2', 'pointer-events-none');
    toast.classList.add('opacity-100', 'translate-y-0', 'pointer-events-auto');

    if (type !== 'info') {
        toastTimer = setTimeout(hideToast, 4000);
    }
}

toastClose.addEventListener('click', hideToast);

function loadSavedConnections() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
}

function saveConnectionProfile(profile) {
    const list = loadSavedConnections();
    const index = list.findIndex(c => c.name === profile.name);
    // Save profile without password for security
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
        savedList.innerHTML = '<p class="text-slate-500">No saved connections yet.</p>';
        return;
    }

    savedList.innerHTML = '';
    list.forEach(conn => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between bg-[#05060c] border border-indigo-900/60 p-3 rounded-lg hover:border-violet-400/50 transition';
        div.innerHTML = `
            <div class="cursor-pointer flex-1" data-action="load">
                <p class="font-medium text-violet-100">${conn.name}</p>
                <p class="text-xs text-slate-400">${conn.user}@${conn.host}:${conn.port}</p>
            </div>
            <button data-action="delete" class="text-xs text-rose-400 hover:text-rose-300 px-2 py-1">
                Delete
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

    activeBadge.textContent = `${list.length} ${list.length === 1 ? 'active session' : 'active sessions'}`;
    if (list.length === 0) {
        activeList.innerHTML = '<p class="text-slate-500">No active sessions.</p>';
        return;
    }

    activeList.innerHTML = '';
    list.forEach(conn => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between gap-2 bg-[#05060c] border border-violet-500/40 p-3 rounded-lg hover:border-violet-400 transition';
        div.innerHTML = `
            <div class="cursor-pointer flex-1 min-w-0" data-open>
                <p class="font-medium text-violet-300 truncate">${conn.name}</p>
                <p class="text-xs text-slate-400 truncate">${conn.user}@${conn.host}:${conn.port}</p>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
                <button data-open class="text-xs bg-violet-600/80 hover:bg-violet-500 text-white px-2.5 py-1 rounded transition">
                    Open
                </button>
                <button data-disconnect class="text-xs bg-rose-950/80 hover:bg-rose-900 border border-rose-500/30 text-rose-200 px-2.5 py-1 rounded transition">
                    Disconnect
                </button>
            </div>
        `;
        div.querySelectorAll('[data-open]').forEach(el => {
            el.addEventListener('click', () => {
                window.location.href = `/workspace.html?id=${conn.id}`;
            });
        });
        div.querySelector('[data-disconnect]').addEventListener('click', async () => {
            await fetch(`/api/connections/${conn.id}`, { method: 'DELETE' });
            refreshActiveConnections();
            showToast(`Disconnected from ${conn.name}`, 'info');
            toastTimer = setTimeout(hideToast, 2500);
        });
        activeList.appendChild(div);
    });
}

// Test Connection button
document.getElementById('btn-test').addEventListener('click', async () => {
    showToast('Testing connection...', 'info');
    try {
        const res = await fetch('/api/connections/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(getFormData())
        });
        const data = await res.json();
        if (data.ok) {
            showToast(`Connection successful. MariaDB ${data.version} (${data.currentUser})`, 'success');
        } else {
            showToast(`Error: ${data.error}`, 'error');
        }
    } catch (err) {
        showToast(`Network error: ${err.message}`, 'error');
    }
});

// Save and Connect button
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = getFormData();
    showToast('Connecting...', 'info');

    try {
        const res = await fetch('/api/connections/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.ok) {
            saveConnectionProfile(payload);
            window.location.href = `/workspace.html?id=${data.info.id}`;
        } else {
            showToast(`Error connecting: ${data.error}`, 'error');
        }
    } catch (err) {
        showToast(`Network error: ${err.message}`, 'error');
    }
});

document.getElementById('btn-new').addEventListener('click', () => {
    form.reset();
    document.getElementById('host').value = '127.0.0.1';
    document.getElementById('port').value = 6333;
    hideToast();
});

// Initialize
renderSavedConnections();
refreshActiveConnections();