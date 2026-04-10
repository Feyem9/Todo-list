/**
 * Cloudflare Worker — Todo List Notification Service
 *
 * Cron : toutes les heures
 * - Lit les tâches depuis Firestore
 * - Vérifie si un rappel est dû dans la prochaine heure
 * - Envoie une Web Push Notification à chaque abonné concerné
 */

// ---------------------------------------------------------------------------
// Helpers VAPID — signature des notifications Web Push
// ---------------------------------------------------------------------------

async function importVapidKey(privateKeyB64) {
  const raw = base64UrlDecode(privateKeyB64);
  return crypto.subtle.importKey(
    'pkcs8',
    raw,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

function base64UrlDecode(str) {
  const padded = str + '='.repeat((4 - str.length % 4) % 4);
  const b64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  bytes.forEach(b => str += String.fromCharCode(b));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function buildVapidHeaders(endpoint, vapidPublicKey, vapidPrivateKey, subject) {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const now = Math.floor(Date.now() / 1000);

  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: now + 12 * 3600,
    sub: subject
  })));

  const signingInput = `${header}.${payload}`;
  const key = await importVapidKey(vapidPrivateKey);
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${base64UrlEncode(signature)}`;

  return {
    Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
    'Content-Type': 'application/json',
    TTL: '86400'
  };
}

// ---------------------------------------------------------------------------
// Firestore REST API
// ---------------------------------------------------------------------------

async function getFirestoreToken(serviceAccountJson) {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);

  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claimSet = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  })));

  const signingInput = `${header}.${claimSet}`;
  const pemKey = sa.private_key;

  // Import RSA private key
  const pemBody = pemKey.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const keyBuffer = base64UrlDecode(pemBody);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${base64UrlEncode(sig)}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

async function fetchTasks(projectId, token) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/tasks`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!data.documents) return [];

  return data.documents.map(doc => {
    const f = doc.fields || {};
    return {
      id: f.id?.stringValue,
      title: f.title?.stringValue,
      dueDate: f.dueDate?.stringValue,
      reminder: f.reminder?.stringValue,
      status: f.status?.stringValue
    };
  });
}

async function fetchSubscriptions(projectId, token) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/push_subscriptions`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!data.documents) return [];

  return data.documents.map(doc => {
    const f = doc.fields || {};
    return JSON.parse(f.subscription?.stringValue || '{}');
  });
}

// ---------------------------------------------------------------------------
// Calcul du moment de notification
// ---------------------------------------------------------------------------

function computeNotifyAt(dueDate, reminder) {
  if (!dueDate || reminder === 'none' || !reminder) return null;
  const [year, month, day] = dueDate.split('-').map(Number);

  const times = {
    '15min':     new Date(year, month - 1, day, 23, 45),
    '1hour':     new Date(year, month - 1, day, 23, 0),
    'morning':   new Date(year, month - 1, day, 9, 0),
    'day_before': new Date(year, month - 1, day - 1, 9, 0)
  };
  return times[reminder]?.getTime() || null;
}

// ---------------------------------------------------------------------------
// Envoi Web Push
// ---------------------------------------------------------------------------

async function sendPushNotification(subscription, payload, vapidPublicKey, vapidPrivateKey) {
  const headers = await buildVapidHeaders(
    subscription.endpoint,
    vapidPublicKey,
    vapidPrivateKey,
    'mailto:admin@todo-list.app'
  );

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  return res.status;
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

export default {
  // Cron trigger — toutes les heures
  async scheduled(event, env, ctx) {
    ctx.waitUntil(processReminders(env));
  },

  // HTTP trigger — pour tester manuellement
  async fetch(request, env, ctx) {
    if (request.method === 'POST' && new URL(request.url).pathname === '/test') {
      ctx.waitUntil(processReminders(env));
      return new Response('Reminders processing started', { status: 200 });
    }

    // Endpoint pour sauvegarder les abonnements push depuis le frontend
    if (request.method === 'POST' && new URL(request.url).pathname === '/subscribe') {
      const body = await request.json();
      const token = await getFirestoreToken(env.FIREBASE_SERVICE_ACCOUNT);
      const projectId = env.FIREBASE_PROJECT_ID;

      await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/push_subscriptions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fields: {
              subscription: { stringValue: JSON.stringify(body.subscription) },
              createdAt: { integerValue: Date.now().toString() }
            }
          })
        }
      );

      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    return new Response('Todo Notification Worker', { status: 200 });
  }
};

async function processReminders(env) {
  const token = await getFirestoreToken(env.FIREBASE_SERVICE_ACCOUNT);
  const projectId = env.FIREBASE_PROJECT_ID;

  const [tasks, subscriptions] = await Promise.all([
    fetchTasks(projectId, token),
    fetchSubscriptions(projectId, token)
  ]);

  if (subscriptions.length === 0) return;

  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  for (const task of tasks) {
    if (task.status === 'completed') continue;

    const notifyAt = computeNotifyAt(task.dueDate, task.reminder);
    if (!notifyAt) continue;

    // Envoyer si le rappel est dû dans la prochaine heure
    if (notifyAt >= now && notifyAt <= now + oneHour) {
      const payload = {
        title: '📋 Todo List — Rappel',
        body: `⏰ ${task.title} — échéance : ${task.dueDate}`,
        icon: '/icons/icon.svg',
        tag: `reminder-${task.id}`
      };

      for (const sub of subscriptions) {
        if (sub.endpoint) {
          await sendPushNotification(sub, payload, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
        }
      }
    }
  }
}
