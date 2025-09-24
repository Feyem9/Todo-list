let tasks = [];
let currentSort = 'priority';
let isDarkMode = false;

function loadTasks() {
    const stored = localStorage.getItem('tasks');
    if (stored) {
        tasks = JSON.parse(stored);
    }
    const darkModeStored = localStorage.getItem('darkMode');
    if (darkModeStored === 'true') {
        isDarkMode = true;
        document.body.classList.add('dark-mode');
        document.getElementById('dark-mode-btn').textContent = '☀️ Light Mode';
    }
    sortTasks();
}

function saveTasks() {
    localStorage.setItem('tasks', JSON.stringify(tasks));
    localStorage.setItem('darkMode', isDarkMode);
}

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
    saveTasks();
}

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
        taskEl.innerHTML = `
            <h3>${task.title}</h3>
            <p>${task.desc}</p>
            <p class="priority ${task.priority}"><span class="priority-icon"></span>${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)} Priority</p>
            <p class="due-date">Due: ${task.dueDate || 'No due date'}</p>
            <p class="status ${task.status}">${task.status.charAt(0).toUpperCase() + task.status.slice(1)}</p>
            <div class="task-buttons">
                <button class="complete-btn" onclick="toggleComplete(${task.id})">${task.status === 'completed' ? 'Mark Pending' : 'Mark Completed'}</button>
                <button class="delete-btn" onclick="confirmDelete(${task.id})">Delete</button>
            </div>
        `;
        tasksContainer.appendChild(taskEl);
        // Stagger animation
        setTimeout(() => {
            taskEl.style.opacity = '1';
            taskEl.style.transform = 'translateY(0) scale(1)';
        }, index * 100);
    });
}

function addTask() {
    const title = document.getElementById('task-title').value.trim();
    const desc = document.getElementById('task-desc').value.trim();
    const priority = document.getElementById('task-priority').value;
    const dueDate = document.getElementById('task-due-date').value;
    if (!title) return;
    const task = {
        id: Date.now(),
        title,
        desc,
        priority,
        dueDate,
        status: 'pending'
    };
    tasks.push(task);
    saveTasks();
    renderTasks();
    // Clear form
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
    const taskEl = document.querySelector(`.task:has(button[onclick="confirmDelete(${id})"])`);
    taskEl.classList.add('fade-out');
    setTimeout(() => {
        tasks = tasks.filter(t => t.id !== id);
        saveTasks();
        renderTasks();
    }, 300);
}

function toggleSort() {
    currentSort = currentSort === 'priority' ? 'dueDate' : 'priority';
    document.getElementById('sort-btn').textContent = `Sort by ${currentSort === 'priority' ? 'Priority' : 'Due Date'}`;
    sortTasks();
    renderTasks();
}

function toggleComplete(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.status = task.status === 'completed' ? 'pending' : 'completed';
        saveTasks();
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

document.getElementById('add-task-btn').addEventListener('click', addTask);
document.getElementById('search').addEventListener('input', filterTasks);
document.getElementById('filter-priority').addEventListener('change', filterTasks);
document.getElementById('filter-due-date').addEventListener('change', filterTasks);
document.getElementById('filter-status').addEventListener('change', filterTasks);
document.getElementById('sort-btn').addEventListener('click', toggleSort);
document.getElementById('dark-mode-btn').addEventListener('click', toggleDarkMode);

// Load and render on start
loadTasks();
renderTasks();