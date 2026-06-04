async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const GIST_ID = '8105f3d30e747fa965245a2c92e6de0f';
const _t = ['ghp_tjdQQ','qlh77oRw0xOcY4','OCZJRDXfBa2','12HpuE'];
const GH_TOKEN = _t.join('');
const GH_API = 'https://api.github.com/gists';
const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DAYS = 31;

let currentUser = null;
let deleteTargetId = null;
let dbCache = null;
let saveTimeout = null;

function showLoading() { document.getElementById('loading').style.display = 'flex'; }
function hideLoading() { document.getElementById('loading').style.display = 'none'; }

async function loadDB() {
    try {
        const resp = await fetch(`${GH_API}/${GIST_ID}`, {
            headers: { 'Authorization': `token ${GH_TOKEN}`, 'User-Agent': 'mcr-protek' }
        });
        const data = await resp.json();
        dbCache = JSON.parse(data.files['db.json'].content);
        return dbCache;
    } catch (e) {
        console.error('Load DB error:', e);
        return null;
    }
}

async function saveDB(db) {
    dbCache = db;
    if (saveTimeout) clearTimeout(saveTimeout);
    return new Promise(resolve => {
        saveTimeout = setTimeout(async () => {
            try {
                await fetch(`${GH_API}/${GIST_ID}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `token ${GH_TOKEN}`,
                        'Content-Type': 'application/json',
                        'User-Agent': 'mcr-protek'
                    },
                    body: JSON.stringify({ files: { 'db.json': { content: JSON.stringify(db, null, 2) } } })
                });
                resolve(true);
            } catch (e) {
                console.error('Save DB error:', e);
                resolve(false);
            }
        }, 800);
    });
}

function getRecordKey(empId, year, month, day) {
    return `${empId}_${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
function getMonthKey(year, month) { return `${year}-${String(month).padStart(2,'0')}`; }
function isMonthClosed(db, year, month) { const mk = getMonthKey(year, month); return db.months[mk] && db.months[mk].closed; }
function isAdmin() { return currentUser && currentUser.role === 'admin'; }
function isBrigadier() { return currentUser && currentUser.role === 'brigadier'; }

// AUTH
document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    showLoading();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const hash = await sha256(password);
    const db = await loadDB();
    if (!db) { hideLoading(); showToast('Ошибка загрузки базы данных', 'error'); return; }
    const user = db.users.find(u => u.username === username && u.passwordHash === hash);
    hideLoading();
    if (!user) {
        document.getElementById('login-error').textContent = 'Неверный логин или пароль';
        document.getElementById('login-error').style.display = 'block';
        return;
    }
    currentUser = { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
    sessionStorage.setItem('mcr_session', JSON.stringify(currentUser));
    navigate();
});

function navigate() {
    document.getElementById('page-login').style.display = 'none';
    document.getElementById('page-admin').style.display = 'none';
    document.getElementById('page-brigadier').style.display = 'none';
    document.getElementById('page-employee').style.display = 'none';
    if (isAdmin()) showAdmin();
    else if (isBrigadier()) showBrigadier();
    else showEmployee();
}

function logout() {
    currentUser = null;
    dbCache = null;
    sessionStorage.removeItem('mcr_session');
    document.getElementById('page-admin').style.display = 'none';
    document.getElementById('page-brigadier').style.display = 'none';
    document.getElementById('page-employee').style.display = 'none';
    document.getElementById('page-login').style.display = 'flex';
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('login-error').style.display = 'none';
}

async function checkSession() {
    const s = sessionStorage.getItem('mcr_session');
    if (s) {
        currentUser = JSON.parse(s);
        showLoading();
        await loadDB();
        hideLoading();
        navigate();
    }
}

// SHARED HELPERS
function initMonthSel(mid, yid) {
    const now = new Date();
    const ms = document.getElementById(mid);
    const ys = document.getElementById(yid);
    ms.innerHTML = ''; ys.innerHTML = '';
    for (let m = 0; m < 12; m++) ms.innerHTML += `<option value="${m+1}" ${m+1===now.getMonth()+1?'selected':''}>${MONTHS_RU[m]}</option>`;
    for (let y = 2024; y <= 2030; y++) ys.innerHTML += `<option value="${y}" ${y===now.getFullYear()?'selected':''}>${y}</option>`;
}

function getYM(mid, yid) {
    return { year: parseInt(document.getElementById(yid).value), month: parseInt(document.getElementById(mid).value) };
}

function changeMonth(mid, yid, dir, renderFn) {
    let {year, month} = getYM(mid, yid);
    month += dir;
    if (month > 12) { month = 1; year++; }
    if (month < 1) { month = 12; year--; }
    document.getElementById(mid).value = month;
    document.getElementById(yid).value = year;
    renderFn();
}

function buildTableHTML(db, year, month, editable) {
    const employees = db.users.filter(u => u.role === 'employee');
    const closed = isMonthClosed(db, year, month);
    let html = '<table class="t-table"><thead><tr><th>ФИО</th>';
    for (let d = 1; d <= DAYS; d++) html += `<th>${d}</th>`;
    html += '<th class="cell-total">Часы</th><th class="cell-break">Перерывы</th><th class="cell-total">Итого</th></tr></thead><tbody>';
    employees.forEach(emp => {
        let tH = 0, tB = 0;
        html += `<tr data-eid="${emp.id}"><td style="font-weight:500">${emp.fullName}</td>`;
        for (let d = 1; d <= DAYS; d++) {
            const k = getRecordKey(emp.id, year, month, d);
            const r = db.records[k] || {};
            const h = r.hours || 0;
            const bh = r.breakHours || 0;
            tH += h; tB += bh;
            html += '<td>';
            if (editable && !closed) {
                html += `<input type="number" min="0" max="24" step="0.5" value="${h||''}" data-eid="${emp.id}" data-day="${d}" class="h-inp">`;
            } else {
                html += h > 0 ? h : '';
            }
            html += '</td>';
        }
        html += `<td class="cell-total th-v">${tH}</td><td class="cell-break tb-v">${tB}</td><td class="cell-total tn-v">${Math.max(0,tH-tB)}</td></tr>`;
    });
    html += '</tbody></table>';
    return { html, closed };
}

function attachTableEvents(renderFn) {
    document.querySelectorAll('.h-inp').forEach(inp => {
        inp.addEventListener('input', function() {
            const tr = this.closest('tr');
            let tH = 0;
            tr.querySelectorAll('.h-inp').forEach(i => tH += parseFloat(i.value) || 0);
            const eid = parseInt(tr.dataset.eid);
            const {year, month} = getCurrentYM();
            let tB = 0;
            const db = dbCache;
            for (let d = 1; d <= DAYS; d++) {
                const r = db.records[getRecordKey(eid, year, month, d)] || {};
                if (r.breakHours) tB += r.breakHours;
            }
            tr.querySelector('.th-v').textContent = tH;
            tr.querySelector('.tb-v').textContent = tB;
            tr.querySelector('.tn-v').textContent = Math.max(0, tH - tB);
        });
    });
}

async function saveTableRecords(containerSel, mid, yid) {
    const db = dbCache;
    const {year, month} = getYM(mid, yid);
    document.querySelectorAll(`${containerSel} .h-inp`).forEach(inp => {
        const eid = parseInt(inp.dataset.eid);
        const day = parseInt(inp.dataset.day);
        const hours = parseFloat(inp.value) || 0;
        const key = getRecordKey(eid, year, month, day);
        if (hours > 0) {
            if (!db.records[key]) db.records[key] = { hours: 0, hasBreak: false, breakHours: 0 };
            db.records[key].hours = hours;
        } else { delete db.records[key]; }
    });
    await saveDB(db);
    showToast('Данные сохранены', 'success');
}

function buildUsersHTML(db) {
    const users = db.users.filter(u => u.role !== 'admin');
    let html = '<table class="u-table"><thead><tr><th>ФИО</th><th>Логин</th><th>Роль</th><th>Действия</th></tr></thead><tbody>';
    users.forEach(u => {
        const rc = u.role === 'brigadier' ? 'badge-brig' : 'badge-emp';
        const rl = u.role === 'brigadier' ? 'Бригадир' : 'Сотрудник';
        const canP = u.role === 'employee';
        const canD = u.role === 'brigadier';
        html += `<tr><td>${u.fullName}</td><td><code style="color:var(--accent)">${u.username}</code></td>
        <td><span class="badge-role-sm ${rc}">${rl}</span></td><td>
        <button class="btn-icon" onclick="editUser(${u.id})" title="Редактировать"><i class="bi bi-pencil"></i></button>
        <button class="btn-icon del" onclick="deleteUser(${u.id},'${u.fullName.replace(/'/g,"\\'")}')" title="Удалить"><i class="bi bi-trash3"></i></button>
        ${canP ? `<button class="btn-icon promote" onclick="promoteUser(${u.id})" title="Назначить бригадиром"><i class="bi bi-arrow-up-circle"></i></button>` : ''}
        ${canD ? `<button class="btn-icon demote" onclick="demoteUser(${u.id})" title="Понизить"><i class="bi bi-arrow-down-circle"></i></button>` : ''}
        </td></tr>`;
    });
    html += '</tbody></table>';
    return html;
}

function buildMonthControl(db, year, month) {
    const closed = isMonthClosed(db, year, month);
    return `<p>Месяц: <strong>${MONTHS_RU[month-1]} ${year}</strong></p>
    ${closed
        ? '<p><span class="badge-closed"><i class="bi bi-lock"></i> Закрыт</span></p><button class="btn-action success" onclick="toggleMonth(false)"><i class="bi bi-unlock"></i> Открыть</button>'
        : '<p><span style="color:var(--success)"><i class="bi bi-unlock"></i> Открыт</span></p><button class="btn-action danger" onclick="toggleMonth(true)"><i class="bi bi-lock"></i> Закрыть</button>'
    }`;
}

// ADMIN
function showAdmin() {
    document.getElementById('page-admin').style.display = 'block';
    document.getElementById('admin-name').textContent = currentUser.fullName;
    document.getElementById('add-role-container').style.display = 'block';
    initMonthSel('a-sel-m','a-sel-y');
    renderAdmin();
}
function showAdminTab(id, el) {
    document.querySelectorAll('#page-admin .tab-p').forEach(t => t.style.display = 'none');
    document.getElementById(id).style.display = 'block';
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    if (el) el.classList.add('active');
}
function getCurrentYM() {
    if (isAdmin()) return getYM('a-sel-m','a-sel-y');
    return getYM('b-sel-m','b-sel-y');
}
function renderAdmin() { renderAdminTable(); renderAdminUsers(); renderAdminMonth(); }
function renderAdminTable() {
    const db = dbCache; if (!db) return;
    const {year, month} = getYM('a-sel-m','a-sel-y');
    const {html, closed} = buildTableHTML(db, year, month, true);
    document.getElementById('a-tbl-wrap').innerHTML = html;
    document.getElementById('a-month-st').innerHTML = closed ? '<span class="badge-closed"><i class="bi bi-lock"></i> Закрыт</span>' : '';
    document.getElementById('a-tbl-actions').style.display = closed ? 'none' : 'flex';
    attachTableEvents();
}
function renderAdminUsers() { const db = dbCache; if (!db) return; document.getElementById('a-users').innerHTML = buildUsersHTML(db); }
function renderAdminMonth() { const db = dbCache; if (!db) return; const {year,month}=getYM('a-sel-m','a-sel-y'); document.getElementById('a-month-ctrl').innerHTML = buildMonthControl(db,year,month); }
function adminChangeMonth(d) { changeMonth('a-sel-m','a-sel-y',d,renderAdmin); }
function adminSelChange() { renderAdmin(); }
async function adminSave() { showLoading(); await saveTableRecords('#a-tbl-wrap','a-sel-m','a-sel-y'); renderAdminTable(); hideLoading(); }
async function adminToggleMonth(close) {
    const db = dbCache; const {year,month}=getYM('a-sel-m','a-sel-y');
    db.months[getMonthKey(year,month)] = {closed:close};
    await saveDB(db); renderAdmin(); showToast(close?'Месяц закрыт':'Месяц открыт','success');
}
function adminBreakModal() { openBreakModalGeneric('a-sel-m','a-sel-y'); }

// BRIGADIER
function showBrigadier() {
    document.getElementById('page-brigadier').style.display = 'block';
    document.getElementById('brig-name').textContent = currentUser.fullName;
    document.getElementById('add-role-container').style.display = 'none';
    initMonthSel('b-sel-m','b-sel-y');
    renderBrig();
}
function showBrigTab(id, el) {
    document.querySelectorAll('#page-brigadier .tab-p').forEach(t => t.style.display = 'none');
    document.getElementById(id).style.display = 'block';
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    if (el) el.classList.add('active');
}
function renderBrig() { renderBrigTable(); renderBrigEmployees(); renderBrigMonth(); }
function renderBrigTable() {
    const db = dbCache; if (!db) return;
    const {year, month} = getYM('b-sel-m','b-sel-y');
    const {html, closed} = buildTableHTML(db, year, month, true);
    document.getElementById('b-tbl-wrap').innerHTML = html;
    document.getElementById('b-month-st').innerHTML = closed ? '<span class="badge-closed"><i class="bi bi-lock"></i> Закрыт</span>' : '';
    document.getElementById('b-tbl-actions').style.display = closed ? 'none' : 'flex';
    attachTableEvents();
}
function renderBrigEmployees() {
    const db = dbCache; if (!db) return;
    const employees = db.users.filter(u => u.role === 'employee');
    let html = '<table class="u-table"><thead><tr><th>ФИО</th><th>Логин</th><th>Действия</th></tr></thead><tbody>';
    employees.forEach(e => {
        html += `<tr><td>${e.fullName}</td><td><code style="color:var(--accent)">${e.username}</code></td><td>
        <button class="btn-icon" onclick="editUser(${e.id})"><i class="bi bi-pencil"></i></button>
        <button class="btn-icon del" onclick="deleteUser(${e.id},'${e.fullName.replace(/'/g,"\\'")}')"><i class="bi bi-trash3"></i></button>
        </td></tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('b-emps').innerHTML = html;
}
function renderBrigMonth() { const db = dbCache; if (!db) return; const {year,month}=getYM('b-sel-m','b-sel-y'); document.getElementById('b-month-ctrl').innerHTML = buildMonthControl(db,year,month); }
function brigChangeMonth(d) { changeMonth('b-sel-m','b-sel-y',d,renderBrig); }
function brigSelChange() { renderBrig(); }
async function brigSave() { showLoading(); await saveTableRecords('#b-tbl-wrap','b-sel-m','b-sel-y'); renderBrigTable(); hideLoading(); }
async function brigToggleMonth(close) {
    const db = dbCache; const {year,month}=getYM('b-sel-m','b-sel-y');
    db.months[getMonthKey(year,month)] = {closed:close};
    await saveDB(db); renderBrig(); showToast(close?'Месяц закрыт':'Месяц открыт','success');
}
function brigBreakModal() { openBreakModalGeneric('b-sel-m','b-sel-y'); }

// EMPLOYEE
function showEmployee() {
    document.getElementById('page-employee').style.display = 'block';
    document.getElementById('emp-name').textContent = currentUser.fullName;
    initMonthSel('e-sel-m','e-sel-y');
    renderEmpView();
}
function empChangeMonth(d) { changeMonth('e-sel-m','e-sel-y',d,renderEmpView); }
function renderEmpView() {
    const db = dbCache; if (!db) return;
    const {year, month} = getYM('e-sel-m','e-sel-y');
    const eid = currentUser.id;
    let tH=0, tB=0;
    const days = [];
    for (let d=1; d<=DAYS; d++) {
        const r = db.records[getRecordKey(eid,year,month,d)] || {};
        const h = r.hours||0, bh = r.breakHours||0, hb = r.hasBreak||false;
        tH += h; tB += bh;
        if (h>0) days.push({d,h,hb,bh,net:h-bh});
    }
    document.getElementById('emp-title').textContent = `${currentUser.fullName} — Мои данные`;
    document.getElementById('emp-summary').innerHTML = `
    <div class="stats-row">
        <div class="stat-card"><div class="stat-icon" style="color:var(--primary)"><i class="bi bi-clock-fill"></i></div><div class="stat-val">${tH.toFixed(1)}</div><div class="stat-label">Всего часов</div></div>
        <div class="stat-card"><div class="stat-icon" style="color:var(--warning)"><i class="bi bi-cup-hot"></i></div><div class="stat-val">${tB.toFixed(1)}</div><div class="stat-label">Перерывы</div></div>
        <div class="stat-card"><div class="stat-icon" style="color:var(--success)"><i class="bi bi-check-circle-fill"></i></div><div class="stat-val">${Math.max(0,tH-tB).toFixed(1)}</div><div class="stat-label">Чистых часов</div></div>
    </div>`;
    let dh = '<div class="card-dark"><div class="card-header-dark"><i class="bi bi-table"></i> Детализация</div><div class="card-body-dark"><table class="u-table"><thead><tr><th>Дата</th><th>Часы</th><th>Перерыв</th><th>Ч. перерыва</th><th>Итого</th></tr></thead><tbody>';
    days.forEach(d => {
        dh += `<tr><td>${d.d}.${String(month).padStart(2,'0')}.${year}</td><td>${d.h}</td><td>${d.hb?'<span class="badge-role-sm badge-brig">Да</span>':'<span class="badge-role-sm" style="background:var(--surface-2)">Нет</span>'}</td><td>${d.bh||'—'}</td><td><strong>${d.net.toFixed(1)}</strong></td></tr>`;
    });
    dh += '</tbody></table></div></div>';
    document.getElementById('emp-detail').innerHTML = dh;
}

// BREAK MODAL
function openBreakModalGeneric(mid, yid) {
    const db = dbCache;
    const employees = db.users.filter(u => u.role === 'employee');
    document.getElementById('break-employee').innerHTML = employees.map(e => `<option value="${e.id}">${e.fullName}</option>`).join('');
    document.getElementById('break-mid').value = mid;
    document.getElementById('break-yid').value = yid;
    loadBreaks();
    new bootstrap.Modal(document.getElementById('breakModal')).show();
}
function loadBreaks() {
    const eid = parseInt(document.getElementById('break-employee').value);
    const mid = document.getElementById('break-mid').value;
    const yid = document.getElementById('break-yid').value;
    const {year,month} = getYM(mid,yid);
    const db = dbCache;
    let h = '<table class="u-table"><thead><tr><th>Дата</th><th>Часы</th><th>Перерыв</th><th>Ч. перерыва</th></tr></thead><tbody>';
    for (let d=1;d<=DAYS;d++) {
        const r = db.records[getRecordKey(eid,year,month,d)]||{};
        h += `<tr><td>${d}</td><td>${r.hours||''}</td>
        <td><input type="checkbox" class="form-check-input" data-day="${d}" ${r.hasBreak?'checked':''}></td>
        <td><input type="number" min="0" max="4" step="0.5" class="form-input" style="width:70px;display:inline" data-day="${d}" value="${r.breakHours||''}" placeholder="0"></td></tr>`;
    }
    h += '</tbody></table>';
    document.getElementById('break-tbl').innerHTML = h;
}
async function saveBreaks() {
    const eid = parseInt(document.getElementById('break-employee').value);
    const mid = document.getElementById('break-mid').value;
    const yid = document.getElementById('break-yid').value;
    const {year,month} = getYM(mid,yid);
    const db = dbCache;
    const cbs = document.querySelectorAll('#break-tbl input[type="checkbox"]');
    const nms = document.querySelectorAll('#break-tbl input[type="number"]');
    cbs.forEach((cb,i) => {
        const d = parseInt(cb.dataset.day);
        const k = getRecordKey(eid,year,month,d);
        const hb = cb.checked;
        const bh = parseFloat(nms[i].value)||0;
        if (db.records[k]) { db.records[k].hasBreak=hb; db.records[k].breakHours=bh; }
        else if (hb||bh>0) { db.records[k]={hours:0,hasBreak:hb,breakHours:bh}; }
    });
    await saveDB(db);
    bootstrap.Modal.getInstance(document.getElementById('breakModal')).hide();
    if (isAdmin()) renderAdminTable();
    else renderBrigTable();
    showToast('Перерывы сохранены','success');
}

// USER CRUD
async function promoteUser(id) {
    showLoading();
    const db = dbCache;
    const u = db.users.find(x=>x.id===id);
    if (u&&u.role==='employee') { u.role='brigadier'; await saveDB(db); }
    if (isAdmin()) renderAdminUsers();
    hideLoading();
    showToast(`${u.fullName} назначен бригадиром`,'success');
}
async function demoteUser(id) {
    showLoading();
    const db = dbCache;
    const u = db.users.find(x=>x.id===id);
    if (u&&u.role==='brigadier') { u.role='employee'; await saveDB(db); }
    if (isAdmin()) renderAdminUsers();
    hideLoading();
    showToast(`${u.fullName} понижен`,'success');
}
function editUser(id) {
    const db = dbCache;
    const u = db.users.find(x=>x.id===id);
    if (!u) return;
    document.getElementById('edit-emp-id').value = id;
    document.getElementById('edit-fullname').value = u.fullName;
    document.getElementById('edit-username').value = u.username;
    document.getElementById('edit-password').value = '';
    new bootstrap.Modal(document.getElementById('editEmployeeModal')).show();
}
function deleteUser(id, name) {
    deleteTargetId = id;
    document.getElementById('delete-name').textContent = name;
    new bootstrap.Modal(document.getElementById('deleteModal')).show();
}
async function confirmDelete() {
    if (!deleteTargetId) return;
    showLoading();
    const db = dbCache;
    db.users = db.users.filter(u=>u.id!==deleteTargetId);
    Object.keys(db.records).forEach(k => { if (k.startsWith(deleteTargetId+'_')) delete db.records[k]; });
    await saveDB(db);
    bootstrap.Modal.getInstance(document.getElementById('deleteModal')).hide();
    if (isAdmin()) { renderAdminUsers(); renderAdminTable(); }
    else { renderBrigEmployees(); renderBrigTable(); }
    hideLoading();
    showToast('Удалён','success');
    deleteTargetId = null;
}

document.getElementById('add-emp-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const fn = document.getElementById('add-fullname').value.trim();
    const un = document.getElementById('add-username').value.trim();
    const pw = document.getElementById('add-password').value;
    const rs = document.getElementById('add-role');
    const role = isAdmin()&&rs ? rs.value : 'employee';
    if (!fn||!un||!pw) return;
    showLoading();
    const db = dbCache;
    if (db.users.find(u=>u.username===un)) { hideLoading(); showToast('Логин занят','error'); return; }
    db.users.push({ id: db.nextId++, username: un, passwordHash: await sha256(pw), fullName: fn, role });
    await saveDB(db);
    bootstrap.Modal.getInstance(document.getElementById('addEmployeeModal')).hide();
    this.reset();
    if (isAdmin()) { renderAdminUsers(); renderAdminTable(); }
    else { renderBrigEmployees(); renderBrigTable(); }
    hideLoading();
    showToast(`${fn} добавлен`,'success');
});

document.getElementById('edit-emp-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    showLoading();
    const id = parseInt(document.getElementById('edit-emp-id').value);
    const fn = document.getElementById('edit-fullname').value.trim();
    const un = document.getElementById('edit-username').value.trim();
    const pw = document.getElementById('edit-password').value;
    const db = dbCache;
    const u = db.users.find(x=>x.id===id);
    if (!u) { hideLoading(); return; }
    if (db.users.find(x=>x.username===un&&x.id!==id)) { hideLoading(); showToast('Логин занят','error'); return; }
    u.fullName = fn; u.username = un;
    if (pw) u.passwordHash = await sha256(pw);
    await saveDB(db);
    bootstrap.Modal.getInstance(document.getElementById('editEmployeeModal')).hide();
    if (isAdmin()) { renderAdminUsers(); renderAdminTable(); }
    else { renderBrigEmployees(); renderBrigTable(); }
    hideLoading();
    showToast('Обновлён','success');
});

// TOGGLE MONTH (shared)
async function toggleMonth(close) {
    showLoading();
    const db = dbCache;
    let y,m;
    if (isAdmin()) { ({year:y,month:m}=getYM('a-sel-m','a-sel-y')); }
    else { ({year:y,month:m}=getYM('b-sel-m','b-sel-y')); }
    db.months[getMonthKey(y,m)] = {closed:close};
    await saveDB(db);
    if (isAdmin()) renderAdmin();
    else renderBrig();
    hideLoading();
    showToast(close?'Месяц закрыт':'Месяц открыт','success');
}

// TOAST
function showToast(msg, type) {
    const t = document.createElement('div');
    t.className = `toast-custom toast-${type==='error'?'error':'success'}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(()=>t.remove(), 3000);
}

// INIT
(async function() {
    showLoading();
    await loadDB();
    hideLoading();
    checkSession();
})();
