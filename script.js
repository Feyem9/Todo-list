let tasks = [];
let currentSort = 'priority';
let isDarkMode = false;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Persistance — Firestore (via window.fb* exposés par firebase.js)
// ---------------------------------------------------------------------------

async function loadTasks() {
    // Dark mode (toujours depuis localStorage — pas de BD nécessaire)
    const darkModeStored = localStorage.getItem('darkMode');
    if (darkModeStored === 'true') {
        isDarkMode = true;
        document.body.classList.add('dark-mode');
        document.getElementById('dark-mode-btn').textContent = '☀️ Light Mode';
    }

    try {
        tasks = await window.fbLoadTasks();
    } catch (e) {
        console.error('Erreur chargement Firestore, fallback localStorage', e);
        try {
            tasks = JSON.parse(localStorage.getItem('tasks') || '[]');
        } catch (_) {
            tasks = [];
        }
    }

    sortTasks();
    renderTasks();
}

async function saveTasks() {
    // Le dark mode reste en localStorage
    localStorage.setItem('darkMode', isDarkMode);
    // Les tâches sont sauvegardées individuellement via fbAddTask / fbUpdateTask / fbDeleteTask
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
        taskEl.className = `task ${task.status === 'completed' ? 'completed' : ''}`;
        taskEl.dataset.id = task.id;

        const cardContent = document.createElement('div');
        cardContent.innerHTML = `
            <h3>${escapeHtml(task.title)}</h3>
            <p>${escapeHtml(task.desc)}</p>
            <p class="priority ${task.priority}"><span class="priority-icon" aria-hidden="true"></span>${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)} Priority</p>
            <p class="due-date">Due: ${task.dueDate || 'No due date'}</p>
            <p class="status ${task.status}">${task.status.charAt(0).toUpperCase() + task.status.slice(1)}</p>
        `;
        while (cardContent.firstChild) {
            taskEl.appendChild(cardContent.firstChild);
        }

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
        title,
        desc,
        priority,
        dueDate,
        status: 'pending'
    };

    try {
        const firestoreId = await window.fbAddTask(taskData);
        taskData.firestoreId = firestoreId;
    } catch (e) {
        console.error('Erreur ajout Firestore', e);
    }

    tasks.push(taskData);
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
        if (task && task.firestoreId) {
            try {
                await window.fbDeleteTask(task.firestoreId);
            } catch (e) {
                console.error('Erreur suppression Firestore', e);
            }
        }
        tasks = tasks.filter(t => String(t.id) !== String(id));
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
    if (task) {
        task.status = task.status === 'completed' ? 'pending' : 'completed';
        if (task.firestoreId) {
            try {
                await window.fbUpdateTask(task.firestoreId, { status: task.status });
            } catch (e) {
                console.error('Erreur mise à jour Firestore', e);
            }
        }
        renderTasks();
    }
}

function filterTasks() {
    const search = document.getElementById('search').value.toLowerCase();
    const priority = document.getElementById('filter-priority').value;
    const dueDate = document.getElementById('filter-due-date').value;
    const status = document.getElementById('filter-status').value;

    let filtered = tasks.filter(task => {
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

// Démarrage — attendre que firebase.js soit prêt
window.addEventListener('load', () => {
    loadTasks();
});
