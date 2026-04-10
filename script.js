let tasks = [];
let currentSort = 'priority';
let isDarkMode = false;

// ---------------------------------------------------------------------------
// Queue offline
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

function isOnline() { return navigator.onLine; }

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
        } catch (e) { remaining.push(op); }
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
            position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
            padding:10px 24px;border-radius:30px;font-size:14px;font-weight:600;
            color:white;z-index:9999;transition:opacity 0.4s ease;
            box-shadow:0 4px 16px rgba(0,0,0,0.2);
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

async function subscribeToPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
        sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: 'BFE0UtWdKTVEdgzUC4xVeXGg9mvtQ5EgzUGHuyX1Uw7xJxOkvyOnxesccKt0ykSpnnDjVxF_FncwnurGq45s8ac'
        });
        try {
            await fetch('https://todo-notification-worker.todolist-feyem.workers.dev/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription: sub.toJSON() })
            });
        } catch (e) { console.error('Erreur envoi abonnement push', e); }
    }
}

function computeNotifyAt(dueDate, reminder) {
    if (!dueDate || reminder === 'none' || !reminder) return null;
    const [year, month, day] = dueDate.split('-').map(Number);
    const times = {
        '15min':      new Date(year, month - 1, day, 23, 45),
        '1hour':      new Date(year, month - 1, day, 23, 0),
        'morning':    new Date(year, month - 1, day, 9, 0),
        'day_before': new Date(year, month - 1, day - 1, 9, 0)
    };
    return times[reminder]?.getTime() || null;
}

function syncRemindersToSW() {
    if (!navigator.serviceWorker.controller) return;
    const reminders = tasks
        .filter(t => t.reminder && t.reminder !== 'none' && t.dueDate && t.status !== 'completed')
        .map(t => ({
            taskId: t.id,
            title: `⏰ ${t.title} — échéance : ${t.dueDate}`,
            notifyAt: computeNotifyAt(t.dueDate, t.reminder),
            fired: false
        }))
        .filter(r => r.notifyAt && r.notifyAt > Date.now());
    navigator.serviceWorker.controller.postMessage({ type: 'SCHEDULE_REMINDERS', reminders });
}

function cancelReminderInSW(taskId) {
    if (!navigator.serviceWorker.controller) return;
    navigator.serviceWorker.controller.postMessage({ type: 'CANCEL_REMINDER', taskId });
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
    updateNotifButton();
}

function updateNotifButton() {
    const btn = document.getElementById('notif-btn');
    if (!btn) return;
    if (Notification.permission === 'granted') {
        btn.textContent = '🔔 Rappels activés ✓';
        btn.disabled = true;
    }
}

// ---------------------------------------------------------------------------
// Stats & tri
// ---------------------------------------------------------------------------

function updateStats() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    document.getElementById('total-tasks').textContent = total;
    document.getElementById('pending-tasks').textContent = total - completed;
    document.getElementById('completed-tasks').textContent = completed;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    document.getElementById('progress-fill').style.width = `${progress}%`;
    document.getElementById('progress-text').textContent = `${progress}% Complete`;
}

function sortTasks() {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    tasks.sort((a, b) => {
        if (currentSort === 'priority') return priorityOrder[b.priority] - priorityOrder[a.priority];
        if (currentSort === 'dueDate') {
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
    '15min': '🔔 15 min avant', '1hour': '🔔 1h avant',
    'morning': '🔔 Matin du jour J', 'day_before': '🔔 La veille'
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
            ? `<span class="reminder-badge">${REMINDER_LABELS[task.reminder] || ''}</span>` : '';

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
// CRUD
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
        status: 'pending', firestoreId: null
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
    if (confirm('Are you sure you want to delete this task?')) deleteTask(id);
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
        return (task.title.toLowerCase().includes(search) || task.desc.toLowerCase().includes(search))
            && (!priority || task.priority === priority)
            && (!dueDate  || task.dueDate  === dueDate)
            && (!status   || task.status   === status);
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
document.getElementById('notif-btn').addEventListener('click', async () => {
    const granted = await requestNotificationPermission();
    if (granted) {
        await subscribeToPush();
        syncRemindersToSW();
        showSyncBanner('🔔 Notifications activées !');
        document.getElementById('notif-btn').textContent = '🔔 Rappels activés ✓';
        document.getElementById('notif-btn').disabled = true;
    } else {
        showSyncBanner('Notifications refusées — vérifie les paramètres du navigateur', true);
    }
});

window.addEventListener('load', () => { loadTasks(); });
