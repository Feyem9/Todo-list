const CACHE_NAME = 'todo-list-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/script.js',
  '/firebase.js',
  '/styles.css',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap'
];

// ---------------------------------------------------------------------------
// Installation & activation
// ---------------------------------------------------------------------------

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ---------------------------------------------------------------------------
// Fetch — Cache First pour les assets statiques
// ---------------------------------------------------------------------------

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('firebase.googleapis.com')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match('/index.html');
      });
    })
  );
});

// ---------------------------------------------------------------------------
// Notifications — vérification périodique des rappels
// ---------------------------------------------------------------------------

const REMINDERS_KEY = 'task_reminders';

// Reçoit les rappels depuis script.js via postMessage
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SCHEDULE_REMINDERS') {
    // Stocker les rappels dans le cache du SW
    self.reminders = event.data.reminders || [];
  }
  if (event.data && event.data.type === 'CANCEL_REMINDER') {
    if (self.reminders) {
      self.reminders = self.reminders.filter(r => r.taskId !== event.data.taskId);
    }
  }
});

// Vérifier les rappels toutes les minutes
setInterval(() => {
  checkReminders();
}, 60 * 1000);

function checkReminders() {
  if (!self.reminders || self.reminders.length === 0) return;

  const now = Date.now();
  self.reminders.forEach(reminder => {
    if (!reminder.fired && reminder.notifyAt <= now) {
      reminder.fired = true;
      self.registration.showNotification('📋 Todo List — Rappel', {
        body: reminder.title,
        icon: '/icons/icon.svg',
        badge: '/icons/icon.svg',
        tag: `reminder-${reminder.taskId}`,
        requireInteraction: true,
        data: { taskId: reminder.taskId },
        actions: [
          { action: 'open', title: 'Ouvrir' },
          { action: 'dismiss', title: 'Ignorer' }
        ]
      });
    }
  });
}

// Clic sur la notification → ouvrir l'app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) return clientList[0].focus();
      return clients.openWindow('/');
    })
  );
});

// Réception des push notifications depuis Cloudflare Worker
self.addEventListener('push', event => {
  if (!event.data) return;

  let data;
  try { data = event.data.json(); }
  catch { data = { title: '📋 Todo List', body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(data.title || '📋 Todo List — Rappel', {
      body: data.body,
      icon: '/icons/icon.svg',
      badge: '/icons/icon.svg',
      tag: data.tag || 'todo-reminder',
      requireInteraction: true,
      actions: [
        { action: 'open', title: 'Ouvrir' },
        { action: 'dismiss', title: 'Ignorer' }
      ]
    })
  );
});
