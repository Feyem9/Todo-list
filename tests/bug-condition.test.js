/**
 * Bug Condition Exploration Tests
 *
 * These tests MUST FAIL on the unfixed code — failure confirms the bugs exist.
 * They encode the EXPECTED (correct) behavior; they will pass once bugs are fixed.
 *
 * Validates: Requirements 1.1, 1.2, 2.1, 3.1, 4.1, 5.1, 6.1
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HTML_PATH = path.join(__dirname, '..', 'index.html');
const SCRIPT_PATH = path.join(__dirname, '..', 'script.js');

/**
 * Build a fresh JSDOM environment with the app's HTML and script loaded.
 * Injects a __getTasks() helper to access the tasks array (window.tasks is
 * shadowed by the DOM element with id="tasks").
 */
function buildDOM(localStorageOverrides = {}, scriptPatch = null) {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  let scriptSrc = fs.readFileSync(SCRIPT_PATH, 'utf8');

  // Append a helper to expose the tasks array (avoids window.tasks DOM clash)
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

  // Seed localStorage BEFORE the script runs
  for (const [key, value] of Object.entries(localStorageOverrides)) {
    window.localStorage.setItem(key, value);
  }

  // Execute script.js in the JSDOM context
  window.eval(scriptSrc);

  return { dom, window, document: window.document };
}

// ---------------------------------------------------------------------------
// Bug 1 — XSS via innerHTML non échappé
// ---------------------------------------------------------------------------

describe('Bug 1 — XSS via innerHTML', () => {
  test('isBugCondition_XSS: <img onerror> title must NOT inject an img element into the DOM', () => {
    const { window, document } = buildDOM();

    // Track whether the onerror handler fires
    let scriptExecuted = false;
    window.alert = () => { scriptExecuted = true; };

    // Simulate adding a task with an XSS title
    document.getElementById('task-title').value = '<img src=x onerror=alert(1)>';
    document.getElementById('task-desc').value = '';
    document.getElementById('task-priority').value = 'low';
    window.addTask();

    const tasksContainer = document.getElementById('tasks');
    const imgElements = tasksContainer.querySelectorAll('img');

    // EXPECTED (correct) behavior: no img element injected, no script executed
    assert.strictEqual(scriptExecuted, false,
      'COUNTEREXAMPLE: onerror script was executed (XSS via innerHTML)');
    assert.strictEqual(imgElements.length, 0,
      'COUNTEREXAMPLE: <img> element was injected into DOM (XSS via innerHTML)');
  });

  test('isBugCondition_XSS: <b>Important</b> title must be shown as plain text, not bold', () => {
    const { window, document } = buildDOM();

    document.getElementById('task-title').value = '<b>Important</b>';
    document.getElementById('task-desc').value = '';
    document.getElementById('task-priority').value = 'low';
    window.addTask();

    const tasksContainer = document.getElementById('tasks');
    const boldElements = tasksContainer.querySelectorAll('b');

    // EXPECTED (correct) behavior: no <b> element injected
    assert.strictEqual(boldElements.length, 0,
      'COUNTEREXAMPLE: <b> element was injected — HTML interpreted instead of plain text');

    // Also verify the literal text is visible
    const h3 = tasksContainer.querySelector('h3');
    assert.ok(h3, 'Task heading should exist');
    assert.strictEqual(h3.textContent, '<b>Important</b>',
      'Title should be displayed as literal text, not rendered HTML');
  });
});

// ---------------------------------------------------------------------------
// Bug 2 — JSON.parse sans try/catch
// ---------------------------------------------------------------------------

describe('Bug 2 — Corrupted JSON in localStorage', () => {
  test('isBugCondition_JSON: corrupted localStorage must not crash the app', () => {
    let threw = false;
    let errorMessage = '';

    try {
      const { window } = buildDOM({ tasks: '{invalid}' });
      // If we reach here, the app didn't crash — check tasks is []
      // Use length check to avoid cross-realm Array prototype comparison issues
      const tasks = window.__getTasks();
      assert.strictEqual(tasks.length, 0,
        'tasks should be reset to [] on corrupted JSON');
    } catch (err) {
      threw = true;
      errorMessage = err.message;
    }

    // EXPECTED (correct) behavior: no crash
    assert.strictEqual(threw, false,
      `COUNTEREXAMPLE: app crashed with SyntaxError: ${errorMessage}`);
  });

  test('isBugCondition_JSON: "undefined" string in localStorage must not crash', () => {
    let threw = false;
    let errorMessage = '';

    try {
      const { window } = buildDOM({ tasks: 'undefined' });
      // Use length check to avoid cross-realm Array prototype comparison issues
      const tasks = window.__getTasks();
      assert.strictEqual(tasks.length, 0,
        'tasks should be reset to [] on invalid JSON');
    } catch (err) {
      threw = true;
      errorMessage = err.message;
    }

    assert.strictEqual(threw, false,
      `COUNTEREXAMPLE: app crashed with: ${errorMessage}`);
  });
});

// ---------------------------------------------------------------------------
// Bug 3 — Double render / standalone renderTasks() at startup
// ---------------------------------------------------------------------------

describe('Bug 3 — Redundant standalone renderTasks() call at startup', () => {
  test('isBugCondition_DoubleRender: no standalone top-level renderTasks() call should exist', () => {
    const scriptSrc = fs.readFileSync(SCRIPT_PATH, 'utf8');

    // The bug: script.js ends with `loadTasks(); renderTasks();`
    // The correct behavior: loadTasks() should call renderTasks() internally,
    // and there should be NO standalone renderTasks() call at global scope.
    const lines = scriptSrc.split('\n');
    // Only match truly top-level calls (no leading whitespace)
    const topLevelRenderCalls = lines.filter(line => line === 'renderTasks();');

    // EXPECTED (correct) behavior: no standalone top-level renderTasks() call
    assert.strictEqual(topLevelRenderCalls.length, 0,
      `COUNTEREXAMPLE: Found ${topLevelRenderCalls.length} standalone top-level renderTasks() call(s) — ` +
      'this is a redundant render on startup. renderTasks() should be called from within loadTasks() instead.'
    );
  });

  test('isBugCondition_DoubleRender: loadTasks() must call renderTasks() internally', () => {
    const scriptSrc = fs.readFileSync(SCRIPT_PATH, 'utf8');

    // Extract the loadTasks function body
    const loadTasksMatch = scriptSrc.match(/function loadTasks\(\)\s*\{([\s\S]*?)\n\}/);
    assert.ok(loadTasksMatch, 'loadTasks function should exist in script.js');

    const loadTasksBody = loadTasksMatch[1];

    // EXPECTED (correct) behavior: loadTasks() calls renderTasks() internally
    const callsRenderInternally = loadTasksBody.includes('renderTasks()');
    assert.strictEqual(callsRenderInternally, true,
      'COUNTEREXAMPLE: loadTasks() does NOT call renderTasks() internally — ' +
      'the render is only triggered by the standalone global call, which is the bug'
    );
  });
});

// ---------------------------------------------------------------------------
// Bug 4 — Sélecteur :has() fragile
// ---------------------------------------------------------------------------

describe('Bug 4 — Fragile :has() selector in deleteTask()', () => {
  test('isBugCondition_Selector: task element must be locatable via data-id attribute', () => {
    const { window, document } = buildDOM();

    document.getElementById('task-title').value = 'Task with data-id';
    document.getElementById('task-priority').value = 'low';
    window.addTask();

    const tasks = window.__getTasks();
    assert.strictEqual(tasks.length, 1, 'Should have 1 task after addTask');

    const taskId = tasks[0].id;

    // EXPECTED (correct) behavior: task element has data-id attribute
    const taskEl = document.querySelector(`.task[data-id="${taskId}"]`);
    assert.notStrictEqual(taskEl, null,
      `COUNTEREXAMPLE: No .task element with data-id="${taskId}" found — ` +
      'data-id attribute is missing from task elements (Bug 4: fragile selector)'
    );
  });

  test('isBugCondition_Selector: deleteTask() must use data-id selector, not :has()', () => {
    const scriptSrc = fs.readFileSync(SCRIPT_PATH, 'utf8');

    // EXPECTED (correct) behavior: deleteTask uses data-id, not :has()
    const usesHasSelector = scriptSrc.includes(':has(button[onclick=');
    assert.strictEqual(usesHasSelector, false,
      'COUNTEREXAMPLE: deleteTask() still uses the fragile :has(button[onclick=...]) selector — ' +
      'should use .task[data-id="..."] instead'
    );
  });
});

// ---------------------------------------------------------------------------
// Bug 5 — ID collision via Date.now()
// ---------------------------------------------------------------------------

describe('Bug 5 — ID collision when tasks created in same millisecond', () => {
  test('isBugCondition_ID: two tasks created with same Date.now() must have different IDs', () => {
    const { window, document } = buildDOM();

    // Mock Date.now() to always return the same value
    const fixedTime = 1700000000000;
    window.Date.now = () => fixedTime;

    // Create first task
    document.getElementById('task-title').value = 'Task One';
    document.getElementById('task-priority').value = 'low';
    window.addTask();

    // Create second task (same millisecond)
    document.getElementById('task-title').value = 'Task Two';
    document.getElementById('task-priority').value = 'low';
    window.addTask();

    const tasks = window.__getTasks();
    assert.strictEqual(tasks.length, 2, 'Should have 2 tasks');

    const [task1, task2] = tasks;

    // EXPECTED (correct) behavior: IDs must be different
    assert.notStrictEqual(
      String(task1.id),
      String(task2.id),
      `COUNTEREXAMPLE: task1.id === task2.id === ${task1.id} ` +
      '(ID collision when Date.now() returns the same value for both tasks)'
    );
  });
});

// ---------------------------------------------------------------------------
// Bug 6 — No feedback on empty title
// ---------------------------------------------------------------------------

describe('Bug 6 — No visual feedback on empty title submission', () => {
  test('isBugCondition_EmptyTitle: clicking Add Task with empty title must show error feedback', () => {
    const { window, document } = buildDOM();

    const titleInput = document.getElementById('task-title');
    titleInput.value = ''; // empty title

    window.addTask();

    // EXPECTED (correct) behavior: input-error class added to title field
    const hasErrorClass = titleInput.classList.contains('input-error');
    assert.strictEqual(hasErrorClass, true,
      'COUNTEREXAMPLE: No visual feedback shown — input-error class was NOT added to #task-title'
    );
  });

  test('isBugCondition_EmptyTitle: whitespace-only title must also show error feedback', () => {
    const { window, document } = buildDOM();

    const titleInput = document.getElementById('task-title');
    titleInput.value = '   '; // whitespace only

    window.addTask();

    const hasErrorClass = titleInput.classList.contains('input-error');
    assert.strictEqual(hasErrorClass, true,
      'COUNTEREXAMPLE: No visual feedback shown for whitespace-only title — input-error class was NOT added'
    );
  });
});
