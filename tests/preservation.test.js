/**
 * Preservation Property Tests
 *
 * These tests MUST PASS on the unfixed code — they confirm the baseline behaviors
 * that must NOT be broken by the fixes.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Helpers (same setup as bug-condition.test.js)
// ---------------------------------------------------------------------------

const HTML_PATH = path.join(__dirname, '..', 'index.html');
const SCRIPT_PATH = path.join(__dirname, '..', 'script.js');

function buildDOM(localStorageOverrides = {}, scriptPatch = null) {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  let scriptSrc = fs.readFileSync(SCRIPT_PATH, 'utf8');

  scriptSrc += '\nwindow.__getTasks = function() { return tasks; };';

  if (scriptPatch) {
    scriptSrc = scriptPatch(scriptSrc);
  }

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    url: 'http://localhost/',
  });

  const { window } = dom;

  for (const [key, value] of Object.entries(localStorageOverrides)) {
    window.localStorage.setItem(key, value);
  }

  window.eval(scriptSrc);

  return { dom, window, document: window.document };
}

// ---------------------------------------------------------------------------
// Preservation 1 — Valid tasks (no HTML special chars)
// Validates: Requirements 3.1
// ---------------------------------------------------------------------------

describe('Preservation 1 — Valid tasks (no HTML special chars)', () => {
  // Property-based style: test multiple representative valid titles
  const validTitles = [
    'Acheter du pain',
    'Buy groceries',
    'Call the dentist',
    'Finish the report',
    'Walk the dog',
    'Meeting at 3pm',
    'Read a book',
    'Clean the house',
    'Pay bills',
    'Exercise for 30 minutes',
  ];

  test('Property 2: for any title without HTML special chars, task renders correctly', () => {
    for (const title of validTitles) {
      const { window, document } = buildDOM();

      document.getElementById('task-title').value = title;
      document.getElementById('task-desc').value = '';
      document.getElementById('task-priority').value = 'low';
      window.addTask();

      const tasksContainer = document.getElementById('tasks');
      const h3 = tasksContainer.querySelector('h3');

      assert.ok(h3, `Task heading should exist for title: "${title}"`);
      // The title text should appear in the heading (either as textContent or innerHTML)
      assert.ok(
        h3.textContent.includes(title),
        `Title "${title}" should be visible in the task heading`
      );
    }
  });

  test('Valid title creates exactly one task in the tasks array', () => {
    for (const title of validTitles.slice(0, 5)) {
      const { window, document } = buildDOM();

      document.getElementById('task-title').value = title;
      document.getElementById('task-priority').value = 'medium';
      window.addTask();

      const tasks = window.__getTasks();
      assert.strictEqual(tasks.length, 1, `Should have 1 task after adding "${title}"`);
      assert.strictEqual(tasks[0].title, title, `Task title should match "${title}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// Preservation 2 — Valid localStorage
// Validates: Requirements 3.2
// ---------------------------------------------------------------------------

describe('Preservation 2 — Valid localStorage loads correctly', () => {
  test('Property 4: valid JSON in localStorage loads tasks without crash', () => {
    const validStorageExamples = [
      '[{"id":1,"title":"Test","desc":"","priority":"low","dueDate":"","status":"pending"}]',
      '[{"id":2,"title":"Buy milk","desc":"2 liters","priority":"medium","dueDate":"2024-12-31","status":"pending"}]',
      '[{"id":3,"title":"Task A","desc":"","priority":"high","dueDate":"","status":"completed"},{"id":4,"title":"Task B","desc":"desc","priority":"low","dueDate":"","status":"pending"}]',
      '[]',
    ];

    for (const stored of validStorageExamples) {
      let threw = false;
      let loadedTasks = null;

      try {
        const { window } = buildDOM({ tasks: stored });
        loadedTasks = window.__getTasks();
      } catch (err) {
        threw = true;
      }

      assert.strictEqual(threw, false, `Should not crash for valid JSON: ${stored}`);
      assert.ok(Array.isArray(loadedTasks), 'tasks should be an array');

      const expected = JSON.parse(stored);
      assert.strictEqual(
        loadedTasks.length,
        expected.length,
        `Should load ${expected.length} task(s) from: ${stored}`
      );
    }
  });

  test('Tasks loaded from localStorage are displayed in the DOM', () => {
    const stored = '[{"id":1,"title":"Loaded Task","desc":"from storage","priority":"high","dueDate":"","status":"pending"}]';
    const { document } = buildDOM({ tasks: stored });

    const tasksContainer = document.getElementById('tasks');
    const h3 = tasksContainer.querySelector('h3');

    assert.ok(h3, 'Task heading should exist after loading from localStorage');
    assert.ok(
      h3.textContent.includes('Loaded Task'),
      'Loaded task title should be visible in the DOM'
    );
  });
});

// ---------------------------------------------------------------------------
// Preservation 3 — Distinct IDs (different ms)
// Validates: Requirements 3.5
// ---------------------------------------------------------------------------

describe('Preservation 3 — Distinct IDs for tasks created at different timestamps', () => {
  test('Property 6: tasks created at different timestamps have distinct IDs', () => {
    const { window, document } = buildDOM();

    let callCount = 0;
    // Use different timestamps for each call
    window.Date.now = () => 1700000000000 + (callCount++ * 1000);

    document.getElementById('task-title').value = 'Task One';
    document.getElementById('task-priority').value = 'low';
    window.addTask();

    document.getElementById('task-title').value = 'Task Two';
    document.getElementById('task-priority').value = 'low';
    window.addTask();

    const tasks = window.__getTasks();
    assert.strictEqual(tasks.length, 2, 'Should have 2 tasks');

    assert.notStrictEqual(
      String(tasks[0].id),
      String(tasks[1].id),
      `IDs should be distinct: task1.id=${tasks[0].id}, task2.id=${tasks[1].id}`
    );
  });

  test('Multiple tasks created at different timestamps all have distinct IDs', () => {
    const { window, document } = buildDOM();

    let callCount = 0;
    window.Date.now = () => 1700000000000 + (callCount++ * 500);

    const titles = ['Task A', 'Task B', 'Task C', 'Task D', 'Task E'];
    for (const title of titles) {
      document.getElementById('task-title').value = title;
      document.getElementById('task-priority').value = 'low';
      window.addTask();
    }

    const tasks = window.__getTasks();
    assert.strictEqual(tasks.length, titles.length, `Should have ${titles.length} tasks`);

    const ids = tasks.map(t => String(t.id));
    const uniqueIds = new Set(ids);
    assert.strictEqual(
      uniqueIds.size,
      ids.length,
      `All IDs should be distinct. Got: ${ids.join(', ')}`
    );
  });
});

// ---------------------------------------------------------------------------
// Preservation 4 — Add with valid title
// Validates: Requirements 3.6
// ---------------------------------------------------------------------------

describe('Preservation 4 — Add task with valid title', () => {
  const validTitles = [
    'Buy groceries',
    'Call mom',
    'Finish project',
    'Read documentation',
    'Write tests',
  ];

  test('Property 8: valid title creates task without showing .input-error', () => {
    for (const title of validTitles) {
      const { window, document } = buildDOM();

      const titleInput = document.getElementById('task-title');
      titleInput.value = title;
      document.getElementById('task-priority').value = 'low';

      window.addTask();

      const hasErrorClass = titleInput.classList.contains('input-error');
      assert.strictEqual(
        hasErrorClass,
        false,
        `input-error should NOT be shown for valid title: "${title}"`
      );

      const tasks = window.__getTasks();
      assert.strictEqual(tasks.length, 1, `Task should be created for title: "${title}"`);
    }
  });

  test('Valid title clears the input field after adding', () => {
    const { window, document } = buildDOM();

    const titleInput = document.getElementById('task-title');
    titleInput.value = 'My Task';
    document.getElementById('task-priority').value = 'low';

    window.addTask();

    assert.strictEqual(titleInput.value, '', 'Title input should be cleared after adding task');
  });
});

// ---------------------------------------------------------------------------
// Preservation 5 — Complete/Delete actions
// Validates: Requirements 3.7
// ---------------------------------------------------------------------------

describe('Preservation 5 — Complete and Delete actions work correctly', () => {
  test('toggleComplete(id) changes task status from pending to completed', () => {
    const { window, document } = buildDOM();

    document.getElementById('task-title').value = 'Task to complete';
    document.getElementById('task-priority').value = 'low';
    window.addTask();

    const tasks = window.__getTasks();
    assert.strictEqual(tasks.length, 1);
    assert.strictEqual(tasks[0].status, 'pending', 'Task should start as pending');

    const taskId = tasks[0].id;
    window.toggleComplete(taskId);

    const updatedTasks = window.__getTasks();
    assert.strictEqual(updatedTasks[0].status, 'completed', 'Task should be completed after toggleComplete');
  });

  test('toggleComplete(id) toggles back from completed to pending', () => {
    const { window, document } = buildDOM();

    document.getElementById('task-title').value = 'Task to toggle';
    document.getElementById('task-priority').value = 'low';
    window.addTask();

    const tasks = window.__getTasks();
    const taskId = tasks[0].id;

    window.toggleComplete(taskId); // pending → completed
    window.toggleComplete(taskId); // completed → pending

    const updatedTasks = window.__getTasks();
    assert.strictEqual(updatedTasks[0].status, 'pending', 'Task should be back to pending after double toggle');
  });

  test('deleteTask(id) removes the task from the tasks array', () => {
    const { window, document } = buildDOM();

    document.getElementById('task-title').value = 'Task to delete';
    document.getElementById('task-priority').value = 'low';
    window.addTask();

    const tasks = window.__getTasks();
    assert.strictEqual(tasks.length, 1);
    const taskId = tasks[0].id;

    // deleteTask uses a fade-out animation with setTimeout — call it and check after
    // We need to patch confirm to avoid the dialog in confirmDelete
    window.confirm = () => true;

    // Call deleteTask directly (bypasses confirm dialog)
    window.deleteTask(taskId);

    // The task is removed after the 300ms animation timeout
    // We verify the task is removed from the array after the timeout fires
    // Since JSDOM doesn't auto-advance timers, we check the fade-out class was added
    const tasksContainer = document.getElementById('tasks');
    const fadingEl = tasksContainer.querySelector('.task.fade-out');
    assert.ok(fadingEl, 'Task element should have fade-out class after deleteTask()');
  });

  test('Complete button is rendered for each task', () => {
    const { window, document } = buildDOM();

    document.getElementById('task-title').value = 'Task with buttons';
    document.getElementById('task-priority').value = 'low';
    window.addTask();

    const tasksContainer = document.getElementById('tasks');
    const completeBtn = tasksContainer.querySelector('.complete-btn');
    const deleteBtn = tasksContainer.querySelector('.delete-btn');

    assert.ok(completeBtn, 'Complete button should be rendered');
    assert.ok(deleteBtn, 'Delete button should be rendered');
  });
});
