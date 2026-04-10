let tasks = [];
let currentSort = 'priority';
let isDarkMode = false;

// ---------------------------------------------------------------------------
// Queue offline — tâches en attente de sync vers Firestore
// ---------------------------------------------------------------------------

// const OFFLINE_QUEUE_KEY = 'offline_queue';
// const LOCAL_TASKS_KEY   = 'local_tasks';

function getOfflineQueue() {
    try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'); }
    catch { return []; }
}

function saveOfflineQueue(queue) {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

function isOnline() {
    return navigator.onLine;
}

async function syncOfflineQueue() {
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    const remaining = [];
    for (const op of queue) {
        try {
            if (op.type === 'add') {
                const firestoreId = await window.fbAddTask(op.task);
                const t = tasks.find(t => t.id === op.task.id);
                if (t) t.firestoreId = firestoreId;
            } else if (op.type === 'update') {
                await window.fbUpdateTask(op.firestoreId, op.data);
            } else if (op.type === 'delete') {
                await window.fbDeleteTask(op.firestoreId);
            }
        } catch (e) {
            remaining.push(op);
        }
    }

    saveOfflineQueue(remaining);
    localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(tasks));
    if (remaining.length === 0) showSyncBanner('Synchronisation terminée ✓');
}

function showSyncBanner(message, isError = false) {
    let banner = document.getElementById('sync-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'sync-banner';
        banner.style.cssText = `
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            padding: 10px 24px; border-radius: 30px; font-size: 14px; font-weight: 600;
            color: white; z-index: 9999; transition: opacity 0.4s ease;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        `;
        document.body.appendChild(banner);
    }
    banner.style.background = isError ? '#e53e3e' : '#38a169';
    banner.textContent = message;
    banner.style.opacity = '1';
    setTimeout(() => { banner.style.opacity = '0'; }, 3000);
}

window.addEventListener('online', () => {
    showSyncBanner('Connexion rétablie — synchronisation...');
    syncOfflineQueue().then(() => renderTasks());
});

window.addEventListener('offline', () => {
    showSyncBanner('Hors ligne — les tâches seront synchronisées à la reconnexion', true);
});

// ---------------------------------------------------------------------------
// Notifications & rappels
// ---------------------------------------------------------------------------

async function requestNotificationPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
}

// Calcule le timestamp de notification selon le choix de rappel et la due date
function computeNotifyAt(dueDate, reminder) {
    if (!dueDate || reminder === 'none') return null;

    // dueDate est au format YYYY-MM-DD — on considère minuit heure locale
    const [year, month, day] = dueDate.split('-').map(Number);

    if (reminder === '15min') {
        // Due date à minuit + 23h45 = 23h45 le jour J
        const d = new Date(year, month - 1, day, 23, 45);
        return d.getTime();
    }
    if (reminder === '1hour') {
        const d = new Date(year, month - 1, day, 23, 0);
        return d.getTime();
    }
    if (reminder === 'morning') {
        const d = new Date(year, month - 1, day, 9, 0);
        return d.getTime();
    }
    if (reminder === 'day_before') {
        const d = new Date(year, month - 1, day - 1, 9, 0);
        return d.getTime();
    }
    return null;
}

// Envoie tous les rappels actifs au Service Worker
function syncRemindersToSW() {
    if (!navigator.serviceWorker.controller) return;

    const reminders = tasks
        .filter(t => t.reminder && t.reminder !== 'none' && t.dueDate && t.status !== 'completed')
        .map(t => ({
            taskId: t.id,
            title: `⏰ ${t.title}${t.dueDate ? ' — échéance : ' + t.dueDate : ''}`,
            notifyAt: computeNotifyAt(t.dueDate, t.reminder),
            fired: false
        }))
        .filter(r => r.notifyAt && r.notifyAt > Date.now());

    navigator.serviceWorker.controller.postMessage({
        type: 'SCHEDULE_REMINDERS',
        reminders
    });
}

function cancelReminderInSW(taskId) {
    if (!navigator.serviceWorker.controller) return;
    navigator.serviceWorker.controller.postMessage({
        type: 'CANCEL_REMINDER',
        taskId
    });
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Persistance
// ---------------------------------------------------------------------------

async function loadTasks() {
    const darkModeStored = localStorage.getItem('darkMode');
    if (darkModeStored === 'true') {
        isDarkMode = true;
        document.body.classList.add('dark-mode');
        document.getElementById('dark-mode-btn').textContent = '☀️ Light Mode';
    }

    if (isOnline()) {
        try {
            tasks = await window.fbLoadTasks();
            localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(tasks));
        } catch (e) {
            tasks = JSON.parse(localStorage.getItem(LOCAL_TASKS_KEY) || '[]');
        }
    } else {
        tasks = JSON.parse(localStorage.getItem(LOCAL_TASKS_KEY) || '[]');
        showSyncBanner('Mode hors ligne — données locales chargées', true);
    }

    sortTasks();
    renderTasks();

    // Demander la permission et programmer les rappels
    const granted = await requestNotificationPermission();
    if (granted) syncRemindersToSW();
}

// ---------------------------------------------------------------------------
// Stats & tri
// ---------------------------------------------------------------------------

function updateStats() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const pending = total - completed;
    document.getElementById('total-tasks').textContent = total;
    document.getElementById('pending-tasks').textContent = pending;
    document.getElementById('completed-tasks').textContent = completed;

    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    document.getElementById('progress-fill').style.width = `${progress}%`;
    document.getElementById('progress-text').textContent = `${progress}% Complete`;
}

function sortTasks() {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    tasks.sort((a, b) => {
        if (currentSort === 'priority') {
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        } else if (currentSort === 'dueDate') {
            if (!a.dueDate && !b.dueDate) return 0;
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return new Date(a.dueDate) - new Date(b.dueDate);
        }
        return 0;
    });
}

function toggleDarkMode() {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode', isDarkMode);
    document.getElementById('dark-mode-btn').textContent = isDarkMode ? '☀️ Light Mode' : '🌙 Dark Mode';
    localStorage.setItem('darkMode', isDarkMode);
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

const REMINDER_LABELS = {
    none: '',
    '15min': '🔔 15 min avant',
    '1hour': '🔔 1h avant',
    morning: '🔔 Matin du jour J',
    day_before: '🔔 La veille'
};

function renderTasks(filteredTasks = tasks) {
    const tasksContainer = document.getElementById('tasks');
    tasksContainer.innerHTML = '';
    updateStats();

    if (filteredTasks.length === 0) {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'empty-state';
        emptyEl.innerHTML = '<p>No tasks found. Add a new task or adjust filters.</p>';
        tasksContainer.appendChild(emptyEl);
        return;
    }

    filteredTasks.forEach((task, index) => {
        const taskEl = document.createElement('div');
        taskEl.className = `task ${task.status === 'completed' ? 'completed' : ''} ${!task.firestoreId ? 'pending-sync' : ''}`;
        taskEl.dataset.id = task.id;

        const reminderLabel = task.reminder && task.reminder !== 'none'
            ? `<span class="reminder-badge">${REMINDER_LABELS[task.reminder] || ''}</span>`
            : '';

        const cardContent = document.createElement('div');
        cardContent.innerHTML = `
            <h3>${escapeHtml(task.title)}${!task.firestoreId ? ' <span class="sync-badge" title="En attente de synchronisation">⏳</span>' : ''}</h3>
            <p>${escapeHtml(task.desc)}</p>
            <p class="priority ${task.priority}"><span class="priority-icon" aria-hidden="true"></span>${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)} Priority</p>
            <p class="due-date">Due: ${task.dueDate || 'No due date'} ${reminderLabel}</p>
            <p class="status ${task.status}">${task.status.charAt(0).toUpperCase() + task.status.slice(1)}</p>
        `;
        while (cardContent.firstChild) taskEl.appendChild(cardContent.firstChild);

        const taskButtons = document.createElement('div');
        taskButtons.className = 'task-buttons';

        const completeBtn = document.createElement('button');
        completeBtn.className = 'complete-btn';
        completeBtn.textContent = task.status === 'completed' ? 'Mark Pending' : 'Mark Completed';
        completeBtn.setAttribute('aria-label',
            task.status === 'completed'
                ? `Marquer comme en attente : ${escapeHtml(task.title)}`
                : `Marquer comme complétée : ${escapeHtml(task.title)}`
        );
        completeBtn.addEventListener('click', () => toggleComplete(task.id));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.setAttribute('aria-label', `Supprimer : ${escapeHtml(task.title)}`);
        deleteBtn.addEventListener('click', () => confirmDelete(task.id));

        taskButtons.appendChild(completeBtn);
        taskButtons.appendChild(deleteBtn);
        taskEl.appendChild(taskButtons);
        tasksContainer.appendChild(taskEl);

        setTimeout(() => {
            taskEl.style.opacity = '1';
            taskEl.style.transform = 'translateY(0) scale(1)';
        }, index * 100);
    });
}

// ---------------------------------------------------------------------------
// CRUD avec support offline + rappels
// ---------------------------------------------------------------------------

async function addTask() {
    const title    = document.getElementById('task-title').value.trim();
    const desc     = document.getElementById('task-desc').value.trim();
    const priority = document.getElementById('task-priority').value;
    const dueDate  = document.getElementById('task-due-date').value;
    const reminder = document.getElementById('task-reminder').value;

    if (!title) {
        const titleInput = document.getElementById('task-title');
        titleInput.classList.add('input-error');
        titleInput.focus();
        setTimeout(() => titleInput.classList.remove('input-error'), 2000);
        return;
    }

    const taskData = {
        id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        title, desc, priority, dueDate, reminder,
        status: 'pending',
        firestoreId: null
    };

    if (isOnline()) {
        try {
            const firestoreId = await window.fbAddTask(taskData);
            taskData.firestoreId = firestoreId;
        } catch (e) {
            const queue = getOfflineQueue();
            queue.push({ type: 'add', task: taskData });
            saveOfflineQueue(queue);
            showSyncBanner('Sauvegardé localement — sera synchronisé en ligne', true);
        }
    } else {
        const queue = getOfflineQueue();
        queue.push({ type: 'add', task: taskData });
        saveOfflineQueue(queue);
        showSyncBanner('Hors ligne — tâche sauvegardée localement ⏳', true);
    }

    tasks.push(taskData);
    localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(tasks));
    sortTasks();
    renderTasks();
    syncRemindersToSW();

    document.getElementById('task-title').value = '';
    document.getElementById('task-desc').value = '';
    document.getElementById('task-due-date').value = '';
    document.getElementById('task-reminder').value = 'none';
}

function confirmDelete(id) {
    if (confirm('Are you sure you want to delete this task?')) {
        deleteTask(id);
    }
}

function deleteTask(id) {
    const taskEl = document.querySelector(`.task[data-id="${id}"]`);
    if (taskEl) taskEl.classList.add('fade-out');

    setTimeout(async () => {
        const task = tasks.find(t => String(t.id) === String(id));
        if (task) {
            cancelReminderInSW(task.id);
            if (task.firestoreId) {
                if (isOnline()) {
                    try { await window.fbDeleteTask(task.firestoreId); }
                    catch (e) {
                        const queue = getOfflineQueue();
                        queue.push({ type: 'delete', firestoreId: task.firestoreId });
                        saveOfflineQueue(queue);
                    }
                } else {
                    const queue = getOfflineQueue();
                    queue.push({ type: 'delete', firestoreId: task.firestoreId });
                    saveOfflineQueue(queue);
                }
            } else {
                const queue = getOfflineQueue().filter(op => op.task?.id !== id);
                saveOfflineQueue(queue);
            }
        }

        tasks = tasks.filter(t => String(t.id) !== String(id));
        localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(tasks));
        renderTasks();
    }, 300);
}

function toggleSort() {
    currentSort = currentSort === 'priority' ? 'dueDate' : 'priority';
    document.getElementById('sort-btn').textContent = `Sort by ${currentSort === 'priority' ? 'Priority' : 'Due Date'}`;
    sortTasks();
    renderTasks();
}

async function toggleComplete(id) {
    const task = tasks.find(t => String(t.id) === String(id));
    if (!task) return;

    task.status = task.status === 'completed' ? 'pending' : 'completed';

    // Annuler le rappel si tâche complétée
    if (task.status === 'completed') cancelReminderInSW(task.id);
    else syncRemindersToSW();

    if (task.firestoreId) {
        if (isOnline()) {
            try { await window.fbUpdateTask(task.firestoreId, { status: task.status }); }
            catch (e) {
                const queue = getOfflineQueue();
                queue.push({ type: 'update', firestoreId: task.firestoreId, data: { status: task.status } });
                saveOfflineQueue(queue);
            }
        } else {
            const queue = getOfflineQueue();
            queue.push({ type: 'update', firestoreId: task.firestoreId, data: { status: task.status } });
            saveOfflineQueue(queue);
        }
    }

    localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(tasks));
    renderTasks();
}

function filterTasks() {
    const search   = document.getElementById('search').value.toLowerCase();
    const priority = document.getElementById('filter-priority').value;
    const dueDate  = document.getElementById('filter-due-date').value;
    const status   = document.getElementById('filter-status').value;

    const filtered = tasks.filter(task => {
        const matchesSearch   = task.title.toLowerCase().includes(search) || task.desc.toLowerCase().includes(search);
        const matchesPriority = !priority || task.priority === priority;
        const matchesDueDate  = !dueDate  || task.dueDate  === dueDate;
        const matchesStatus   = !status   || task.status   === status;
        return matchesSearch && matchesPriority && matchesDueDate && matchesStatus;
    });
    renderTasks(filtered);
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

document.getElementById('add-task-btn').addEventListener('click', addTask);
document.getElementById('search').addEventListener('input', filterTasks);
document.getElementById('filter-priority').addEventListener('change', filterTasks);
document.getElementById('filter-due-date').addEventListener('change', filterTasks);
document.getElementById('filter-status').addEventListener('change', filterTasks);
document.getElementById('sort-btn').addEventListener('click', toggleSort);
document.getElementById('dark-mode-btn').addEventListener('click', toggleDarkMode);

window.addEventListener('load', () => {
    loadTasks();
});

// ---------------------------------------------------------------------------
// Queue offline — tâches en attente de sync vers Firestore
// ---------------------------------------------------------------------------

const OFFLINE_QUEUE_KEY = 'offline_queue';
const LOCAL_TASKS_KEY   = 'local_tasks';

function getOfflineQueue() {
    try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'); }
    catch { return []; }
}

function saveOfflineQueue(queue) {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

function isOnline() {
    return navigator.onLine;
}

// Synchronise la queue locale vers Firestore dès qu'on est en ligne
async function syncOfflineQueue() {
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    const remaining = [];
    for (const op of queue) {
        try {
            if (op.type === 'add') {
                const firestoreId = await window.fbAddTask(op.task);
                // Mettre à jour le firestoreId dans le tableau local
                const t = tasks.find(t => t.id === op.task.id);
                if (t) t.firestoreId = firestoreId;
            } else if (op.type === 'update') {
                await window.fbUpdateTask(op.firestoreId, op.data);
            } else if (op.type === 'delete') {
                await window.fbDeleteTask(op.firestoreId);
            }
        } catch (e) {
            // Toujours offline ou erreur — on garde l'opération en queue
            remaining.push(op);
        }
    }

    saveOfflineQueue(remaining);
    // Sauvegarder l'état local mis à jour
    localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(tasks));

    if (remaining.length === 0) {
        showSyncBanner('Synchronisation terminée ✓');
    }
}

// Bannière de statut connexion
function showSyncBanner(message, isError = false) {
    let banner = document.getElementById('sync-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'sync-banner';
        banner.style.cssText = `
            position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            padding: 10px 24px; border-radius: 30px; font-size: 14px; font-weight: 600;
            color: white; z-index: 9999; transition: opacity 0.4s ease;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        `;
        document.body.appendChild(banner);
    }
    banner.style.background = isError ? '#e53e3e' : '#38a169';
    banner.textContent = message;
    banner.style.opacity = '1';
    setTimeout(() => { banner.style.opacity = '0'; }, 3000);
}

// Écouter les changements de connexion
window.addEventListener('online', () => {
    showSyncBanner('Connexion rétablie — synchronisation...');
    syncOfflineQueue().then(() => renderTasks());
});

window.addEventListener('offline', () => {
    showSyncBanner('Hors ligne — les tâches seront synchronisées à la reconnexion', true);
});

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Persistance
// ---------------------------------------------------------------------------

async function loadTasks() {
    const darkModeStored = localStorage.getItem('darkMode');
    if (darkModeStored === 'true') {
        isDarkMode = true;
        document.body.classList.add('dark-mode');
        document.getElementById('dark-mode-btn').textContent = '☀️ Light Mode';
    }

    if (isOnline()) {
        try {
            tasks = await window.fbLoadTasks();
            // Mettre à jour le cache local
            localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(tasks));
        } catch (e) {
            console.error('Erreur Firestore, fallback local', e);
            tasks = JSON.parse(localStorage.getItem(LOCAL_TASKS_KEY) || '[]');
        }
    } else {
        // Offline — charger depuis le cache local
        tasks = JSON.parse(localStorage.getItem(LOCAL_TASKS_KEY) || '[]');
        showSyncBanner('Mode hors ligne — données locales chargées', true);
    }

    sortTasks();
    renderTasks();
}

// ---------------------------------------------------------------------------
// Stats & tri
// ---------------------------------------------------------------------------

function updateStats() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const pending = total - completed;
    document.getElementById('total-tasks').textContent = total;
    document.getElementById('pending-tasks').textContent = pending;
    document.getElementById('completed-tasks').textContent = completed;

    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    document.getElementById('progress-fill').style.width = `${progress}%`;
    document.getElementById('progress-text').textContent = `${progress}% Complete`;
}

function sortTasks() {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    tasks.sort((a, b) => {
        if (currentSort === 'priority') {
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        } else if (currentSort === 'dueDate') {
            if (!a.dueDate && !b.dueDate) return 0;
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return new Date(a.dueDate) - new Date(b.dueDate);
        }
        return 0;
    });
}

function toggleDarkMode() {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode', isDarkMode);
    document.getElementById('dark-mode-btn').textContent = isDarkMode ? '☀️ Light Mode' : '🌙 Dark Mode';
    localStorage.setItem('darkMode', isDarkMode);
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

function renderTasks(filteredTasks = tasks) {
    const tasksContainer = document.getElementById('tasks');
    tasksContainer.innerHTML = '';
    updateStats();

    if (filteredTasks.length === 0) {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'empty-state';
        emptyEl.innerHTML = '<p>No tasks found. Add a new task or adjust filters.</p>';
        tasksContainer.appendChild(emptyEl);
        return;
    }

    filteredTasks.forEach((task, index) => {
        const taskEl = document.createElement('div');
        taskEl.className = `task ${task.status === 'completed' ? 'completed' : ''} ${!task.firestoreId ? 'pending-sync' : ''}`;
        taskEl.dataset.id = task.id;

        const cardContent = document.createElement('div');
        cardContent.innerHTML = `
            <h3>${escapeHtml(task.title)}${!task.firestoreId ? ' <span class="sync-badge" title="En attente de synchronisation">⏳</span>' : ''}</h3>
            <p>${escapeHtml(task.desc)}</p>
            <p class="priority ${task.priority}"><span class="priority-icon" aria-hidden="true"></span>${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)} Priority</p>
            <p class="due-date">Due: ${task.dueDate || 'No due date'}</p>
            <p class="status ${task.status}">${task.status.charAt(0).toUpperCase() + task.status.slice(1)}</p>
        `;
        while (cardContent.firstChild) taskEl.appendChild(cardContent.firstChild);

        const taskButtons = document.createElement('div');
        taskButtons.className = 'task-buttons';

        const completeBtn = document.createElement('button');
        completeBtn.className = 'complete-btn';
        completeBtn.textContent = task.status === 'completed' ? 'Mark Pending' : 'Mark Completed';
        completeBtn.setAttribute('aria-label',
            task.status === 'completed'
                ? `Marquer comme en attente : ${escapeHtml(task.title)}`
                : `Marquer comme complétée : ${escapeHtml(task.title)}`
        );
        completeBtn.addEventListener('click', () => toggleComplete(task.id));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.setAttribute('aria-label', `Supprimer : ${escapeHtml(task.title)}`);
        deleteBtn.addEventListener('click', () => confirmDelete(task.id));

        taskButtons.appendChild(completeBtn);
        taskButtons.appendChild(deleteBtn);
        taskEl.appendChild(taskButtons);
        tasksContainer.appendChild(taskEl);

        setTimeout(() => {
            taskEl.style.opacity = '1';
            taskEl.style.transform = 'translateY(0) scale(1)';
        }, index * 100);
    });
}

// ---------------------------------------------------------------------------
// CRUD avec support offline
// ---------------------------------------------------------------------------

async function addTask() {
    const title = document.getElementById('task-title').value.trim();
    const desc = document.getElementById('task-desc').value.trim();
    const priority = document.getElementById('task-priority').value;
    const dueDate = document.getElementById('task-due-date').value;

    if (!title) {
        const titleInput = document.getElementById('task-title');
        titleInput.classList.add('input-error');
        titleInput.focus();
        setTimeout(() => titleInput.classList.remove('input-error'), 2000);
        return;
    }

    const taskData = {
        id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        title, desc, priority, dueDate,
        status: 'pending',
        firestoreId: null
    };

    if (isOnline()) {
        try {
            const firestoreId = await window.fbAddTask(taskData);
            taskData.firestoreId = firestoreId;
        } catch (e) {
            // Échec réseau — mettre en queue
            const queue = getOfflineQueue();
            queue.push({ type: 'add', task: taskData });
            saveOfflineQueue(queue);
            showSyncBanner('Sauvegardé localement — sera synchronisé en ligne', true);
        }
    } else {
        // Offline — mettre en queue directement
        const queue = getOfflineQueue();
        queue.push({ type: 'add', task: taskData });
        saveOfflineQueue(queue);
        showSyncBanner('Hors ligne — tâche sauvegardée localement ⏳', true);
    }

    tasks.push(taskData);
    localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(tasks));
    sortTasks();
    renderTasks();

    document.getElementById('task-title').value = '';
    document.getElementById('task-desc').value = '';
    document.getElementById('task-due-date').value = '';
}

function confirmDelete(id) {
    if (confirm('Are you sure you want to delete this task?')) {
        deleteTask(id);
    }
}

function deleteTask(id) {
    const taskEl = document.querySelector(`.task[data-id="${id}"]`);
    if (taskEl) taskEl.classList.add('fade-out');

    setTimeout(async () => {
        const task = tasks.find(t => String(t.id) === String(id));

        if (task) {
            if (task.firestoreId) {
                if (isOnline()) {
                    try {
                        await window.fbDeleteTask(task.firestoreId);
                    } catch (e) {
                        const queue = getOfflineQueue();
                        queue.push({ type: 'delete', firestoreId: task.firestoreId });
                        saveOfflineQueue(queue);
                    }
                } else {
                    const queue = getOfflineQueue();
                    queue.push({ type: 'delete', firestoreId: task.firestoreId });
                    saveOfflineQueue(queue);
                }
            } else {
                // Tâche jamais synchronisée — retirer de la queue offline aussi
                const queue = getOfflineQueue().filter(op => op.task?.id !== id);
                saveOfflineQueue(queue);
            }
        }

        tasks = tasks.filter(t => String(t.id) !== String(id));
        localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(tasks));
        renderTasks();
    }, 300);
}

function toggleSort() {
    currentSort = currentSort === 'priority' ? 'dueDate' : 'priority';
    document.getElementById('sort-btn').textContent = `Sort by ${currentSort === 'priority' ? 'Priority' : 'Due Date'}`;
    sortTasks();
    renderTasks();
}

async function toggleComplete(id) {
    const task = tasks.find(t => String(t.id) === String(id));
    if (!task) return;

    task.status = task.status === 'completed' ? 'pending' : 'completed';

    if (task.firestoreId) {
        if (isOnline()) {
            try {
                await window.fbUpdateTask(task.firestoreId, { status: task.status });
            } catch (e) {
                const queue = getOfflineQueue();
                queue.push({ type: 'update', firestoreId: task.firestoreId, data: { status: task.status } });
                saveOfflineQueue(queue);
            }
        } else {
            const queue = getOfflineQueue();
            queue.push({ type: 'update', firestoreId: task.firestoreId, data: { status: task.status } });
            saveOfflineQueue(queue);
        }
    }

    localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(tasks));
    renderTasks();
}

function filterTasks() {
    const search = document.getElementById('search').value.toLowerCase();
    const priority = document.getElementById('filter-priority').value;
    const dueDate = document.getElementById('filter-due-date').value;
    const status = document.getElementById('filter-status').value;

    const filtered = tasks.filter(task => {
        const matchesSearch = task.title.toLowerCase().includes(search) || task.desc.toLowerCase().includes(search);
        const matchesPriority = !priority || task.priority === priority;
        const matchesDueDate = !dueDate || task.dueDate === dueDate;
        const matchesStatus = !status || task.status === status;
        return matchesSearch && matchesPriority && matchesDueDate && matchesStatus;
    });
    renderTasks(filtered);
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

document.getElementById('add-task-btn').addEventListener('click', addTask);
document.getElementById('search').addEventListener('input', filterTasks);
document.getElementById('filter-priority').addEventListener('change', filterTasks);
document.getElementById('filter-due-date').addEventListener('change', filterTasks);
document.getElementById('filter-status').addEventListener('change', filterTasks);
document.getElementById('sort-btn').addEventListener('click', toggleSort);
document.getElementById('dark-mode-btn').addEventListener('click', toggleDarkMode);

window.addEventListener('load', () => {
    loadTasks();
});
