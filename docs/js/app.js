const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DAYS = 31;
let currentUser = null;
let deleteTargetId = null;

function getDB() {
    const raw = localStorage.getItem('mcr_db');
    if (!raw) {
        const init = {
            users: [{ id: 1, username: 'brigadier', passwordHash: '', fullName: 'Бригадир', role: 'brigadier' }],
            records: {},
            months: {},
            nextId: 2
        };
        localStorage.setItem('mcr_db', JSON.stringify(init));
        return init;
    }
    return JSON.parse(raw);
}

function saveDB(db) {
    localStorage.setItem('mcr_db', JSON.stringify(db));
}

async function initBrigadierPassword() {
    const db = getDB();
    const brig = db.users.find(u => u.role === 'brigadier');
    if (!brig.passwordHash) {
        brig.passwordHash = await sha256('brigadier123');
        saveDB(db);
    }
}

function getRecordKey(empId, year, month, day) {
    return `${empId}_${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

function getMonthKey(year, month) {
    return `${year}-${String(month).padStart(2,'0')}`;
}

function isMonthClosed(year, month) {
    const db = getDB();
    const mk = getMonthKey(year, month);
    return db.months[mk] && db.months[mk].closed;
}

// AUTH
document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const hash = await sha256(password);
    const db = getDB();
    const user = db.users.find(u => u.username === username && u.passwordHash === hash);

    if (!user) {
        document.getElementById('login-error').textContent = 'Неверный логин или пароль';
        document.getElementById('login-error').style.display = 'block';
        return;
    }

    currentUser = { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
    sessionStorage.setItem('mcr_session', JSON.stringify(currentUser));

    if (user.role === 'brigadier') {
        showBrigadier();
    } else {
        showEmployee();
    }
});

function logout() {
    currentUser = null;
    sessionStorage.removeItem('mcr_session');
    document.getElementById('page-brigadier').style.display = 'none';
    document.getElementById('page-employee').style.display = 'none';
    document.getElementById('page-login').style.display = 'flex';
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('login-error').style.display = 'none';
}

function checkSession() {
    const s = sessionStorage.getItem('mcr_session');
    if (s) {
        currentUser = JSON.parse(s);
        if (currentUser.role === 'brigadier') showBrigadier();
        else showEmployee();
    }
}

// BRIGADIER
function showBrigadier() {
    document.getElementById('page-login').style.display = 'none';
    document.getElementById('page-employee').style.display = 'none';
    document.getElementById('page-brigadier').style.display = 'block';
    document.getElementById('brig-name').textContent = currentUser.fullName;
    initMonthSelectors();
    renderTable();
    renderEmployees();
    renderMonthControl();
}

function showBrigTab(tabId, el) {
    document.querySelectorAll('#page-brigadier [id^="tab-"]').forEach(t => t.style.display = 'none');
    document.getElementById(tabId).style.display = 'block';
    document.querySelectorAll('.sidebar .nav-link').forEach(l => l.classList.remove('active'));
    if (el) el.classList.add('active');
}

function initMonthSelectors() {
    const now = new Date();
    const ms = document.getElementById('selMonth');
    const ys = document.getElementById('selYear');
    ms.innerHTML = '';
    ys.innerHTML = '';
    for (let m = 0; m < 12; m++) {
        ms.innerHTML += `<option value="${m+1}" ${m+1===now.getMonth()+1?'selected':''}>${MONTHS_RU[m]}</option>`;
    }
    for (let y = 2024; y <= 2030; y++) {
        ys.innerHTML += `<option value="${y}" ${y===now.getFullYear()?'selected':''}>${y}</option>`;
    }
}

function getSelectedYear() { return parseInt(document.getElementById('selYear').value); }
function getSelectedMonth() { return parseInt(document.getElementById('selMonth').value); }

function changeMonth(dir) {
    let m = getSelectedMonth() + dir;
    let y = getSelectedYear();
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    document.getElementById('selMonth').value = m;
    document.getElementById('selYear').value = y;
    renderTable();
    renderMonthControl();
}

function renderTable() {
    const year = getSelectedYear();
    const month = getSelectedMonth();
    const db = getDB();
    const employees = db.users.filter(u => u.role === 'employee');
    const closed = isMonthClosed(year, month);

    document.getElementById('month-status').innerHTML = closed
        ? '<span class="badge-closed"><i class="bi bi-lock"></i> Месяц закрыт</span>'
        : '';

    document.getElementById('table-actions').style.display = closed ? 'none' : 'flex';

    let html = '<table class="table table-bordered table-hover time-table mb-0"><thead><tr class="sticky-header-row"><th>ФИО</th>';
    for (let d = 1; d <= DAYS; d++) html += `<th>${d}</th>`;
    html += '<th class="cell-total">Часы</th><th class="cell-break">Перерывы</th><th>Итого без перерывов</th></tr></thead><tbody>';

    employees.forEach(emp => {
        let totalH = 0, totalB = 0;
        html += `<tr data-emp-id="${emp.id}"><td class="employee-row-name">${emp.fullName}</td>`;
        for (let d = 1; d <= DAYS; d++) {
            const key = getRecordKey(emp.id, year, month, d);
            const rec = db.records[key] || {};
            const h = rec.hours || 0;
            const bh = rec.breakHours || 0;
            totalH += h;
            totalB += bh;
            html += `<td class="cell-hours">`;
            if (closed) {
                html += h > 0 ? `<span>${h}</span>` : '';
            } else {
                html += `<input type="number" min="0" max="24" step="0.5" value="${h||''}" data-emp-id="${emp.id}" data-day="${d}" class="hours-input">`;
            }
            html += `</td>`;
        }
        const net = totalH - totalB;
        html += `<td class="cell-total total-hours">${totalH}</td>`;
        html += `<td class="cell-break total-breaks">${totalB}</td>`;
        html += `<td class="cell-total net-hours">${Math.max(0,net)}</td>`;
        html += '</tr>';
    });

    html += '</tbody></table>';
    document.getElementById('table-container').innerHTML = html;

    document.querySelectorAll('.hours-input').forEach(inp => {
        inp.addEventListener('input', function() {
            recalcRow(this.closest('tr'));
        });
    });
}

function recalcRow(tr) {
    let totalH = 0;
    const db = getDB();
    const year = getSelectedYear();
    const month = getSelectedMonth();
    tr.querySelectorAll('.hours-input').forEach(inp => {
        const v = parseFloat(inp.value) || 0;
        totalH += v;
    });
    let totalB = 0;
    const empId = parseInt(tr.dataset.empId);
    for (let d = 1; d <= DAYS; d++) {
        const key = getRecordKey(empId, year, month, d);
        const rec = db.records[key];
        if (rec && rec.breakHours) totalB += rec.breakHours;
    }
    tr.querySelector('.total-hours').textContent = totalH;
    tr.querySelector('.total-breaks').textContent = totalB;
    tr.querySelector('.net-hours').textContent = Math.max(0, totalH - totalB);
}

function saveAllRecords() {
    const db = getDB();
    const year = getSelectedYear();
    const month = getSelectedMonth();
    document.querySelectorAll('.hours-input').forEach(inp => {
        const empId = parseInt(inp.dataset.empId);
        const day = parseInt(inp.dataset.day);
        const hours = parseFloat(inp.value) || 0;
        const key = getRecordKey(empId, year, month, day);
        if (hours > 0) {
            if (!db.records[key]) db.records[key] = { hours: 0, hasBreak: false, breakHours: 0 };
            db.records[key].hours = hours;
        } else {
            delete db.records[key];
        }
    });
    saveDB(db);
    renderTable();
    showToast('Данные сохранены', 'success');
}

function openBreakModal() {
    const db = getDB();
    const employees = db.users.filter(u => u.role === 'employee');
    const sel = document.getElementById('break-employee');
    sel.innerHTML = employees.map(e => `<option value="${e.id}">${e.fullName}</option>`).join('');
    loadBreaks();
    new bootstrap.Modal(document.getElementById('breakModal')).show();
}

function loadBreaks() {
    const empId = parseInt(document.getElementById('break-employee').value);
    const year = getSelectedYear();
    const month = getSelectedMonth();
    const db = getDB();
    let html = '<table class="table table-bordered table-sm"><thead><tr><th>Дата</th><th>Часы</th><th>Перерыв</th><th>Часы перерыва</th></tr></thead><tbody>';
    for (let d = 1; d <= DAYS; d++) {
        const key = getRecordKey(empId, year, month, d);
        const rec = db.records[key] || {};
        html += `<tr>
            <td>${d}</td>
            <td>${rec.hours || ''}</td>
            <td><input type="checkbox" class="form-check-input" data-day="${d}" ${rec.hasBreak?'checked':''}></td>
            <td><input type="number" min="0" max="4" step="0.5" class="form-control form-control-sm" style="width:70px" data-day="${d}" value="${rec.breakHours||''}" placeholder="0"></td>
        </tr>`;
    }
    html += '</tbody></table>';
    document.getElementById('break-table-container').innerHTML = html;
}

function saveBreaks() {
    const empId = parseInt(document.getElementById('break-employee').value);
    const year = getSelectedYear();
    const month = getSelectedMonth();
    const db = getDB();
    const checkboxes = document.querySelectorAll('#break-table-container input[type="checkbox"]');
    const numberInputs = document.querySelectorAll('#break-table-container input[type="number"]');

    checkboxes.forEach((cb, i) => {
        const day = parseInt(cb.dataset.day);
        const key = getRecordKey(empId, year, month, day);
        const hasBreak = cb.checked;
        const breakHours = parseFloat(numberInputs[i].value) || 0;
        if (db.records[key]) {
            db.records[key].hasBreak = hasBreak;
            db.records[key].breakHours = breakHours;
        } else if (hasBreak || breakHours > 0) {
            db.records[key] = { hours: 0, hasBreak, breakHours };
        }
    });

    saveDB(db);
    renderTable();
    bootstrap.Modal.getInstance(document.getElementById('breakModal')).hide();
    showToast('Перерывы сохранены', 'success');
}

// EMPLOYEES CRUD
function renderEmployees() {
    const db = getDB();
    const employees = db.users.filter(u => u.role === 'employee');
    let html = '<table class="table table-hover mb-0"><thead><tr><th>ФИО</th><th>Логин</th><th>Действия</th></tr></thead><tbody>';
    employees.forEach(e => {
        html += `<tr><td>${e.fullName}</td><td><code>${e.username}</code></td><td>
            <button class="btn btn-sm btn-outline-primary" onclick="editEmployee(${e.id})"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteEmployee(${e.id},'${e.fullName.replace(/'/g,"\\'")}')"><i class="bi bi-trash"></i></button>
        </td></tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('employees-list').innerHTML = html;
}

document.getElementById('add-emp-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const fullName = document.getElementById('add-fullname').value.trim();
    const username = document.getElementById('add-username').value.trim();
    const password = document.getElementById('add-password').value;
    if (!fullName || !username || !password) return;

    const db = getDB();
    if (db.users.find(u => u.username === username)) {
        showToast('Логин уже занят', 'error');
        return;
    }

    db.users.push({
        id: db.nextId++,
        username,
        passwordHash: await sha256(password),
        fullName,
        role: 'employee'
    });
    saveDB(db);
    bootstrap.Modal.getInstance(document.getElementById('addEmployeeModal')).hide();
    this.reset();
    renderEmployees();
    renderTable();
    showToast(`Сотрудник ${fullName} добавлен`, 'success');
});

function editEmployee(id) {
    const db = getDB();
    const emp = db.users.find(u => u.id === id);
    if (!emp) return;
    document.getElementById('edit-emp-id').value = id;
    document.getElementById('edit-fullname').value = emp.fullName;
    document.getElementById('edit-username').value = emp.username;
    document.getElementById('edit-password').value = '';
    new bootstrap.Modal(document.getElementById('editEmployeeModal')).show();
}

document.getElementById('edit-emp-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const id = parseInt(document.getElementById('edit-emp-id').value);
    const fullName = document.getElementById('edit-fullname').value.trim();
    const username = document.getElementById('edit-username').value.trim();
    const password = document.getElementById('edit-password').value;
    const db = getDB();
    const emp = db.users.find(u => u.id === id);
    if (!emp) return;
    if (db.users.find(u => u.username === username && u.id !== id)) {
        showToast('Логин уже занят', 'error');
        return;
    }
    emp.fullName = fullName;
    emp.username = username;
    if (password) emp.passwordHash = await sha256(password);
    saveDB(db);
    bootstrap.Modal.getInstance(document.getElementById('editEmployeeModal')).hide();
    renderEmployees();
    renderTable();
    showToast('Сотрудник обновлён', 'success');
});

function deleteEmployee(id, name) {
    deleteTargetId = id;
    document.getElementById('delete-name').textContent = name;
    new bootstrap.Modal(document.getElementById('deleteModal')).show();
}

function confirmDelete() {
    if (!deleteTargetId) return;
    const db = getDB();
    db.users = db.users.filter(u => u.id !== deleteTargetId);
    Object.keys(db.records).forEach(key => {
        if (key.startsWith(deleteTargetId + '_')) delete db.records[key];
    });
    saveDB(db);
    bootstrap.Modal.getInstance(document.getElementById('deleteModal')).hide();
    renderEmployees();
    renderTable();
    showToast('Сотрудник удалён', 'success');
    deleteTargetId = null;
}

// MONTH CONTROL
function renderMonthControl() {
    const year = getSelectedYear();
    const month = getSelectedMonth();
    const closed = isMonthClosed(year, month);
    const container = document.getElementById('month-control');
    container.innerHTML = `
        <p>Текущий месяц: <strong>${MONTHS_RU[month-1]} ${year}</strong></p>
        ${closed
            ? '<p><span class="badge bg-danger">Месяц закрыт для редактирования</span></p><button class="btn btn-success" onclick="toggleMonth(false)"><i class="bi bi-unlock"></i> Открыть месяц</button>'
            : '<p><span class="badge bg-success">Месяц открыт для редактирования</span></p><button class="btn btn-danger" onclick="toggleMonth(true)"><i class="bi bi-lock"></i> Закрыть месяц</button>'
        }
    `;
}

function toggleMonth(close) {
    const year = getSelectedYear();
    const month = getSelectedMonth();
    const db = getDB();
    const mk = getMonthKey(year, month);
    db.months[mk] = { closed: close };
    saveDB(db);
    renderTable();
    renderMonthControl();
    showToast(close ? 'Месяц закрыт' : 'Месяц открыт', 'success');
}

// EMPLOYEE VIEW
function showEmployee() {
    document.getElementById('page-login').style.display = 'none';
    document.getElementById('page-brigadier').style.display = 'none';
    document.getElementById('page-employee').style.display = 'block';
    document.getElementById('emp-name').textContent = currentUser.fullName;

    const now = new Date();
    const ms = document.getElementById('selMonthEmp');
    const ys = document.getElementById('selYearEmp');
    ms.innerHTML = '';
    ys.innerHTML = '';
    for (let m = 0; m < 12; m++) ms.innerHTML += `<option value="${m+1}" ${m+1===now.getMonth()+1?'selected':''}>${MONTHS_RU[m]}</option>`;
    for (let y = 2024; y <= 2030; y++) ys.innerHTML += `<option value="${y}" ${y===now.getFullYear()?'selected':''}>${y}</option>`;

    renderEmployeeView();
}

function changeMonthEmp(dir) {
    let m = parseInt(document.getElementById('selMonthEmp').value) + dir;
    let y = parseInt(document.getElementById('selYearEmp').value);
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    document.getElementById('selMonthEmp').value = m;
    document.getElementById('selYearEmp').value = y;
    renderEmployeeView();
}

function renderEmployeeView() {
    const year = parseInt(document.getElementById('selYearEmp').value);
    const month = parseInt(document.getElementById('selMonthEmp').value);
    const db = getDB();
    const empId = currentUser.id;

    let totalH = 0, totalB = 0;
    const dayData = [];
    for (let d = 1; d <= DAYS; d++) {
        const key = getRecordKey(empId, year, month, d);
        const rec = db.records[key] || {};
        const h = rec.hours || 0;
        const bh = rec.breakHours || 0;
        const hb = rec.hasBreak || false;
        totalH += h;
        totalB += bh;
        if (h > 0) dayData.push({ day: d, hours: h, hasBreak: hb, breakHours: bh, net: h - bh });
    }

    document.getElementById('emp-title').textContent = currentUser.fullName + ' — Мои данные';
    document.getElementById('emp-summary').innerHTML = `
        <div class="card"><div class="card-header bg-primary text-white"><i class="bi bi-bar-chart"></i> Сводка за ${MONTHS_RU[month-1]} ${year}</div>
        <div class="card-body"><div class="row text-center">
            <div class="col-md-4"><div class="p-3 bg-light rounded-3"><i class="bi bi-clock-fill text-primary" style="font-size:2rem"></i><h3 class="mt-2 mb-0">${totalH.toFixed(1)}</h3><small class="text-muted">Всего часов</small></div></div>
            <div class="col-md-4"><div class="p-3 bg-light rounded-3"><i class="bi bi-cup-hot text-warning" style="font-size:2rem"></i><h3 class="mt-2 mb-0">${totalB.toFixed(1)}</h3><small class="text-muted">Часов перерывов</small></div></div>
            <div class="col-md-4"><div class="p-3 bg-light rounded-3"><i class="bi bi-check-circle-fill text-success" style="font-size:2rem"></i><h3 class="mt-2 mb-0">${Math.max(0,totalH-totalB).toFixed(1)}</h3><small class="text-muted">Чистых часов</small></div></div>
        </div></div></div>`;

    let detailHtml = '<div class="card"><div class="card-header" style="background:var(--primary-color);color:#fff"><i class="bi bi-table"></i> Детализация по дням</div><div class="card-body p-0"><div class="table-container"><table class="table table-bordered table-hover mb-0"><thead><tr><th>Дата</th><th>Часы</th><th>Перерыв</th><th>Часы перерыва</th><th>Итого за день</th></tr></thead><tbody>';
    dayData.forEach(d => {
        detailHtml += `<tr><td>${d.day}.${String(month).padStart(2,'0')}.${year}</td><td>${d.hours}</td><td>${d.hasBreak?'<span class="badge bg-warning text-dark">Да</span>':'<span class="badge bg-secondary">Нет</span>'}</td><td>${d.breakHours||'-'}</td><td><strong>${d.net.toFixed(1)}</strong></td></tr>`;
    });
    detailHtml += '</tbody></table></div></div></div>';
    document.getElementById('emp-detail').innerHTML = detailHtml;
}

function showToast(msg, type) {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type==='error'?'danger':'success'} alert-dismissible fade show position-fixed`;
    alert.style.cssText = 'top:20px;right:20px;z-index:9999;min-width:250px';
    alert.innerHTML = `${msg}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
    document.body.appendChild(alert);
    setTimeout(() => alert.remove(), 3000);
}

// INIT
(async function() {
    await initBrigadierPassword();
    checkSession();
})();
