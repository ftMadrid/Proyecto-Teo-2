const params = new URLSearchParams(window.location.search);
const connId = params.get('id');

if (!connId) {
    window.location.href = '/';
}

const connNameLabel = document.getElementById('conn-name-label');
const activeDbLabel = document.getElementById('active-db-label');
const dbTree = document.getElementById('db-tree');
const sqlInput = document.getElementById('sql-input');
const lineNumbers = document.getElementById('line-numbers');
const resultsMeta = document.getElementById('results-meta');
const resultsContainer = document.getElementById('results-container');

const btnSaveSql = document.getElementById('btn-save-sql');
const btnImportSql = document.getElementById('btn-import-sql');
const sqlFileInput = document.getElementById('sql-file-input');

const toast = document.getElementById('toast');
const toastBox = document.getElementById('toast-box');
const toastText = document.getElementById('toast-text');
const toastClose = document.getElementById('toast-close');
let toastTimer = null;

let activeDatabase = '';
let currentFileName = 'query.sql';

function hideToast() {
    if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
    }
    toast.classList.add('opacity-0', 'translate-y-2', 'pointer-events-none');
    toast.classList.remove('opacity-100', 'translate-y-0', 'pointer-events-auto');
}

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

function setActiveDatabase(dbName) {
    activeDatabase = dbName || '';
    activeDbLabel.textContent = activeDatabase || 'None selected';
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Sync line numbers with textarea
function updateLineNumbers() {
    const lines = sqlInput.value.split('\n').length;
    let text = '';
    for (let i = 1; i <= lines; i++) {
        text += i + '\n';
    }
    lineNumbers.textContent = text;
}

sqlInput.addEventListener('input', updateLineNumbers);
sqlInput.addEventListener('scroll', () => {
    lineNumbers.scrollTop = sqlInput.scrollTop;
});

// Shortcuts: Ctrl/Cmd+Enter to run, Tab to indent
sqlInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runQuery();
        return;
    }
    if (e.key === 'Tab') {
        e.preventDefault();
        const start = sqlInput.selectionStart;
        const end = sqlInput.selectionEnd;
        sqlInput.value = sqlInput.value.substring(0, start) + '    ' + sqlInput.value.substring(end);
        sqlInput.selectionStart = sqlInput.selectionEnd = start + 4;
        updateLineNumbers();
    }
});

// Load active connection metadata
async function initConnection() {
    try {
        const res = await fetch(`/api/connections/${connId}`);
        const data = await res.json();
        if (!data.ok) {
            showToast('Session expired or not found.', 'error');
            setTimeout(() => { window.location.href = '/'; }, 1200);
            return;
        }
        connNameLabel.textContent = data.info.name;
        if (data.info.database) {
            setActiveDatabase(data.info.database);
        }
        await loadTree();
    } catch (err) {
        showToast(`Failed to load connection: ${err.message}`, 'error');
    }
}

// Build Database Explorer tree
async function loadTree() {
    dbTree.innerHTML = '<p class="text-xs text-slate-400">Loading objects...</p>';
    try {
        const res = await fetch(`/api/connections/${connId}/databases`);
        const data = await res.json();
        if (!data.ok) {
            dbTree.innerHTML = `<p class="text-xs text-rose-300">${escapeHtml(data.error)}</p>`;
            return;
        }

        dbTree.innerHTML = '';

        // Databases root section
        const dbSectionTitle = document.createElement('div');
        dbSectionTitle.className = 'text-[11px] font-semibold uppercase tracking-wider text-violet-300/60 px-1 pt-1 pb-1';
        dbSectionTitle.textContent = `Databases (${data.databases.length})`;
        dbTree.appendChild(dbSectionTitle);

        data.databases.forEach(dbName => {
            const dbNode = document.createElement('div');
            dbNode.className = 'select-none';

            const header = document.createElement('button');
            header.type = 'button';
            header.className = 'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-violet-500/15 text-left text-violet-100 transition';
            header.innerHTML = `
                <span class="arrow text-[10px] text-violet-400 transition-transform">&#9654;</span>
                <span class="truncate font-medium">${escapeHtml(dbName)}</span>
            `;

            const childrenBox = document.createElement('div');
            childrenBox.className = 'hidden pl-4 mt-1 space-y-1 border-l border-violet-500/20 ml-3';

            let loaded = false;
            header.addEventListener('click', async () => {
                setActiveDatabase(dbName);
                const isHidden = childrenBox.classList.contains('hidden');
                childrenBox.classList.toggle('hidden');
                header.querySelector('.arrow').style.transform = isHidden ? 'rotate(90deg)' : '';

                if (!loaded) {
                    loaded = true;
                    childrenBox.innerHTML = '<p class="text-xs text-slate-500 px-2 py-1">Loading...</p>';
                    await loadDatabaseChildren(dbName, childrenBox);
                }
            });

            dbNode.appendChild(header);
            dbNode.appendChild(childrenBox);
            dbTree.appendChild(dbNode);
        });

        // Server Users section
        const usersDivider = document.createElement('hr');
        usersDivider.className = 'border-violet-500/20 my-3';
        dbTree.appendChild(usersDivider);

        const usersBtn = document.createElement('button');
        usersBtn.type = 'button';
        usersBtn.className = 'w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-violet-500/15 text-violet-200 text-xs font-semibold transition';
        usersBtn.innerHTML = '<span>Server Users (mysql.user)</span><span class="arrow text-[10px] text-violet-400">&#9654;</span>';

        const usersBox = document.createElement('div');
        usersBox.className = 'hidden pl-3 mt-1 space-y-1 border-l border-violet-500/20 ml-3';

        let usersLoaded = false;
        usersBtn.addEventListener('click', async () => {
            const isHidden = usersBox.classList.contains('hidden');
            usersBox.classList.toggle('hidden');
            usersBtn.querySelector('.arrow').style.transform = isHidden ? 'rotate(90deg)' : '';

            if (!usersLoaded) {
                usersLoaded = true;
                usersBox.innerHTML = '<p class="text-xs text-slate-500 px-2 py-1">Loading users...</p>';
                const uRes = await fetch(`/api/connections/${connId}/users`);
                const uData = await uRes.json();
                if (!uData.ok) {
                    usersBox.innerHTML = `<p class="text-xs text-rose-300 px-2">${escapeHtml(uData.error)}</p>`;
                    return;
                }
                usersBox.innerHTML = '';
                uData.users.forEach(u => {
                    const item = document.createElement('button');
                    item.type = 'button';
                    item.className = 'w-full text-left text-xs text-slate-300 hover:text-violet-200 hover:bg-violet-500/10 px-2 py-1 rounded truncate';
                    item.textContent = `${u.user}@${u.host}`;
                    item.addEventListener('click', () => {
                        sqlInput.value = `SHOW GRANTS FOR '${u.user}'@'${u.host}';`;
                        updateLineNumbers();
                        runQuery();
                    });
                    usersBox.appendChild(item);
                });
            }
        });

        dbTree.appendChild(usersBtn);
        dbTree.appendChild(usersBox);
    } catch (err) {
        dbTree.innerHTML = `<p class="text-xs text-rose-300">${escapeHtml(err.message)}</p>`;
    }
}

function createCategoryNode(label, items, onItemClick) {
    const wrapper = document.createElement('div');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'w-full flex items-center justify-between px-2 py-1 rounded hover:bg-violet-500/10 text-xs text-violet-200/80 transition';
    btn.innerHTML = `
        <span class="flex items-center gap-1.5">
            <span class="arrow text-[9px] text-violet-400 transition-transform">&#9654;</span>
            <span>${label}</span>
        </span>
        <span class="text-[10px] text-slate-500">${items.length}</span>
    `;

    const listBox = document.createElement('div');
    listBox.className = 'hidden pl-4 mt-0.5 space-y-0.5';

    if (items.length === 0) {
        listBox.innerHTML = '<p class="text-[11px] text-slate-500 px-2 py-0.5 italic">Empty</p>';
    } else {
        items.forEach(item => {
            const name = typeof item === 'string' ? item : item.name;
            const itemBtn = document.createElement('button');
            itemBtn.type = 'button';
            itemBtn.className = 'w-full text-left text-xs text-slate-300 hover:text-white hover:bg-violet-500/15 px-2 py-1 rounded truncate transition';
            itemBtn.textContent = name;
            itemBtn.addEventListener('click', () => onItemClick(item));
            listBox.appendChild(itemBtn);
        });
    }

    btn.addEventListener('click', () => {
        const isHidden = listBox.classList.contains('hidden');
        listBox.classList.toggle('hidden');
        btn.querySelector('.arrow').style.transform = isHidden ? 'rotate(90deg)' : '';
    });

    wrapper.appendChild(btn);
    wrapper.appendChild(listBox);
    return wrapper;
}

async function loadDatabaseChildren(dbName, container) {
    try {
        const res = await fetch(`/api/connections/${connId}/databases/${encodeURIComponent(dbName)}/objects`);
        const data = await res.json();
        if (!data.ok) {
            container.innerHTML = `<p class="text-xs text-rose-300 px-2">${escapeHtml(data.error)}</p>`;
            return;
        }

        const { tables, views, procedures, functions, triggers } = data.objects;
        container.innerHTML = '';

        container.appendChild(createCategoryNode('Tables', tables, (table) => {
            setActiveDatabase(dbName);
            sqlInput.value = `SELECT * FROM \`${dbName}\`.\`${table}\` LIMIT 100;`;
            updateLineNumbers();
            runQuery();
        }));

        container.appendChild(createCategoryNode('Views', views, (view) => {
            setActiveDatabase(dbName);
            sqlInput.value = `SELECT * FROM \`${dbName}\`.\`${view}\` LIMIT 100;`;
            updateLineNumbers();
            runQuery();
        }));

        container.appendChild(createCategoryNode('Procedures', procedures, (proc) => {
            setActiveDatabase(dbName);
            sqlInput.value = `SHOW CREATE PROCEDURE \`${dbName}\`.\`${proc}\`;`;
            updateLineNumbers();
            runQuery();
        }));

        container.appendChild(createCategoryNode('Functions', functions, (fn) => {
            setActiveDatabase(dbName);
            sqlInput.value = `SHOW CREATE FUNCTION \`${dbName}\`.\`${fn}\`;`;
            updateLineNumbers();
            runQuery();
        }));

        container.appendChild(createCategoryNode('Triggers', triggers, (trig) => {
            setActiveDatabase(dbName);
            sqlInput.value = `SHOW CREATE TRIGGER \`${dbName}\`.\`${trig.name}\`;`;
            updateLineNumbers();
            runQuery();
        }));
    } catch (err) {
        container.innerHTML = `<p class="text-xs text-rose-300 px-2">${escapeHtml(err.message)}</p>`;
    }
}

// Execute SQL query (uses selected text if any, otherwise full editor)
async function runQuery() {
    const selected = sqlInput.value.substring(sqlInput.selectionStart, sqlInput.selectionEnd).trim();
    const sql = selected || sqlInput.value.trim();

    if (!sql) {
        showToast('Write a SQL query before executing.', 'error');
        return;
    }

    resultsMeta.textContent = 'Executing...';
    try {
        const res = await fetch(`/api/connections/${connId}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql, database: activeDatabase })
        });
        const data = await res.json();

        if (!data.ok) {
            resultsMeta.textContent = 'Error';
            resultsContainer.innerHTML = `
                <div class="p-4">
                    <div class="bg-[#240b14]/90 border border-rose-400/40 text-rose-200 rounded-lg p-4 text-xs sql-font whitespace-pre-wrap">${escapeHtml(data.error)}</div>
                </div>
            `;
            showToast('SQL execution failed.', 'error');
            return;
        }

        renderQueryResult(data.result);
    } catch (err) {
        resultsMeta.textContent = 'Network error';
        showToast(`Network error: ${err.message}`, 'error');
    }
}

function renderQueryResult(result) {
    if (result.type === 'resultset') {
        resultsMeta.textContent = `${result.rowCount} rows | ${result.durationMs} ms`;

        if (result.rows.length === 0) {
            resultsContainer.innerHTML = `
                <div class="p-4 text-xs text-slate-400">
                    Query executed successfully. 0 rows returned (${result.durationMs} ms).
                </div>
            `;
            return;
        }

        const thead = result.columns
            .map(col => `<th class="sticky top-0 bg-[#0d1024] text-left px-3 py-2 text-xs font-semibold text-violet-200 border-b border-r border-violet-500/20 whitespace-nowrap">${escapeHtml(col)}</th>`)
            .join('');

        const tbody = result.rows.map(row => {
            const cells = result.columns.map(col => {
                const val = row[col];
                if (val === null || val === undefined) {
                    return '<td class="px-3 py-1.5 text-xs border-b border-r border-violet-500/10 text-slate-500 italic">NULL</td>';
                }
                return `<td class="px-3 py-1.5 text-xs border-b border-r border-violet-500/10 text-slate-200 whitespace-nowrap max-w-md truncate" title="${escapeHtml(val)}">${escapeHtml(val)}</td>`;
            }).join('');
            return `<tr class="hover:bg-violet-500/10 transition-colors">${cells}</tr>`;
        }).join('');

        resultsContainer.innerHTML = `
            <table class="w-full border-collapse sql-font">
                <thead><tr>${thead}</tr></thead>
                <tbody>${tbody}</tbody>
            </table>
        `;
    } else {
        resultsMeta.textContent = `OK | ${result.durationMs} ms`;
        resultsContainer.innerHTML = `
            <div class="p-4">
                <div class="bg-[#071f1a]/80 border border-emerald-400/40 text-emerald-200 rounded-lg p-4 text-xs space-y-1 sql-font">
                    <p>Query executed successfully.</p>
                    <p>Affected rows: ${result.affectedRows}</p>
                    <p>Insert ID: ${result.insertId}</p>
                    <p>Duration: ${result.durationMs} ms</p>
                </div>
            </div>
        `;
        showToast(`Query OK (${result.affectedRows} rows affected)`, 'success');
    }
}

// Save current SQL editor content to PC as .sql file
btnSaveSql.addEventListener('click', () => {
    const sql = sqlInput.value;
    if (!sql.trim()) {
        showToast('SQL Editor is empty.', 'error');
        return;
    }

    const inputName = prompt('Save SQL file as:', currentFileName);
    if (!inputName || !inputName.trim()) return;

    let fileName = inputName.trim();
    if (!fileName.toLowerCase().endsWith('.sql')) {
        fileName += '.sql';
    }
    currentFileName = fileName;

    const blob = new Blob([sql], { type: 'application/sql;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Saved ${fileName}`, 'success');
});

// Import a .sql file from PC into the SQL editor
btnImportSql.addEventListener('click', () => {
    sqlFileInput.click();
});

sqlFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        sqlInput.value = event.target.result || '';
        currentFileName = file.name;
        updateLineNumbers();
        showToast(`Imported ${file.name}`, 'success');
    };
    reader.onerror = () => {
        showToast('Failed to read file.', 'error');
    };
    reader.readAsText(file);

    // Reset input so selecting the same file again still triggers change
    sqlFileInput.value = '';
});

// Resizable split divider between SQL Editor and Results
const splitDivider = document.getElementById('split-divider');
const rightPane = document.getElementById('right-pane');
const editorPane = document.getElementById('editor-pane');
let isResizing = false;

splitDivider.addEventListener('mousedown', () => {
    isResizing = true;
    document.body.classList.add('select-none', 'cursor-row-resize');
});

document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const rect = rightPane.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const percent = Math.max(20, Math.min(80, (offsetY / rect.height) * 100));
    editorPane.style.height = `${percent}%`;
});

document.addEventListener('mouseup', () => {
    if (!isResizing) return;
    isResizing = false;
    document.body.classList.remove('select-none', 'cursor-row-resize');
});

// Buttons
document.getElementById('btn-run').addEventListener('click', runQuery);
document.getElementById('btn-refresh-tree').addEventListener('click', loadTree);
document.getElementById('btn-clear-sql').addEventListener('click', () => {
    sqlInput.value = '';
    updateLineNumbers();
    sqlInput.focus();
});
document.getElementById('btn-exit').addEventListener('click', () => {
    window.location.href = '/';
});

// Init
updateLineNumbers();
initConnection();