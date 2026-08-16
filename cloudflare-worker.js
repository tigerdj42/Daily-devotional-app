/* cloudflare-worker.js — Push Notification Scheduler
   Deploy to Cloudflare Workers (free tier).
   Reads push subscriptions from Firestore via the Firebase REST API,
   sends Web Push notifications at:
     - 08:00 SGT daily  (morning reminder to everyone)
     - 21:00 SGT daily  (evening nudge to users with no reflection today)

   Environment variables (set in Cloudflare Workers dashboard):
     FIREBASE_PROJECT_ID     — your Firebase project ID
     FIREBASE_SERVICE_ACCOUNT_KEY  — JSON of the service account private key (base64-encoded)
     VAPID_SUBJECT           — mailto: or https: URL (e.g. mailto:your@email.com)
     VAPID_PUBLIC_KEY        — URL-safe base64 VAPID public key
     VAPID_PRIVATE_KEY       — URL-safe base64 VAPID private key

   Cron triggers (set in wrangler.toml or Cloudflare dashboard):
     0 0 * * *    — 08:00 SGT (UTC+8 = 00:00 UTC)
     0 13 * * *   — 21:00 SGT (UTC+8 = 13:00 UTC)
*/

export default {
  async scheduled(event, env, ctx) {
    const utcHour = new Date(event.scheduledTime).getUTCHours();
    const isMorning = utcHour === 0;
    const isEvening = utcHour === 13;

    if (!isMorning && !isEvening) return;

    ctx.waitUntil(sendNotifications(env, isMorning));
  }
};

/* ── MAIN ─────────────────────────────────────────────────── */
async function sendNotifications(env, isMorning) {
  const accessToken = await getFirestoreAccessToken(env);

  /* Fetch all push subscriptions */
  const subscriptions = await getSubscriptions(env, accessToken);

  const todaySGT = getTodaySGT();

  const tasks = subscriptions.map(async ({ uid, endpoint, keys }) => {
    if (!isMorning) {
      /* Evening: skip if user already has a reflection for today */
      const hasReflection = await checkReflection(env, accessToken, uid, todaySGT.dayNumber);
      if (hasReflection) return;
    }

    const payload = isMorning
      ? {
          title: 'Good morning ✦',
          body: `Day ${todaySGT.dayNumber} is ready — ${todaySGT.chapters}. Take 10 minutes with God's word today.`,
          tag: 'devotional-morning',
          url: '/'
        }
      : {
          title: 'Still time to reflect 🕯',
          body: `You haven't written your reflection for Day ${todaySGT.dayNumber} yet. It only takes a moment.`,
          tag: 'devotional-evening',
          url: '/'
        };

    try {
      await sendWebPush(env, endpoint, keys, payload);
    } catch (e) {
      console.error(`[push] failed for uid=${uid}:`, e.message);
    }
  });

  await Promise.allSettled(tasks);
}

/* ── FIRESTORE ACCESS TOKEN ───────────────────────────────── */
async function getFirestoreAccessToken(env) {
  /* Decode the base64-encoded service account key */
  const saKeyJson = atob(env.FIREBASE_SERVICE_ACCOUNT_KEY);
  const sa = JSON.parse(saKeyJson);

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };

  /* Build JWT */
  const jwt = await buildJWT(sa.private_key, payload);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });

  const data = await res.json();
  if (!data.access_token) throw new Error('Could not get Firestore access token: ' + JSON.stringify(data));
  return data.access_token;
}

async function buildJWT(privateKeyPem, payload) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encode = obj => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const input = `${encode(header)}.${encode(payload)}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${input}.${sigB64}`;
}

function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0))).buffer;
}

/* ── FIRESTORE HELPERS ────────────────────────────────────── */
async function getSubscriptions(env, token) {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/subscriptions`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();

  if (!data.documents) return [];

  return data.documents.map(doc => {
    const uid = doc.name.split('/').pop();
    const fields = doc.fields || {};
    return {
      uid,
      endpoint: fields.endpoint?.stringValue,
      keys: {
        p256dh: fields.keys?.mapValue?.fields?.p256dh?.stringValue,
        auth:   fields.keys?.mapValue?.fields?.auth?.stringValue
      }
    };
  }).filter(s => s.endpoint && s.keys.p256dh && s.keys.auth);
}

async function checkReflection(env, token, uid, dayNumber) {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/reflections/${uid}/${dayNumber}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return res.status === 200;
}

/* ── SGT TODAY HELPER ─────────────────────────────────────── */
function getTodaySGT() {
  /* NT chapter layout for the label — we just send day number,
     app computes chapters. This is informational only for the notification body. */
  const START = new Date('2026-08-17T00:00:00+08:00');
  const now = new Date();
  const sgt = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
  const start = new Date(START.toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
  start.setHours(0, 0, 0, 0);
  sgt.setHours(0, 0, 0, 0);
  const dayNumber = Math.max(1, Math.min(Math.floor((sgt - start) / 86400000) + 1, 130));

  /* Chapter label: day N → NT chapters 2N-1 and 2N */
  const NT_CHAPTERS = buildNTChapterList();
  const c1 = NT_CHAPTERS[dayNumber * 2 - 2];
  const c2 = NT_CHAPTERS[dayNumber * 2 - 1];
  const chapters = c2
    ? `${c1.book} ${c1.chap}${c1.book !== c2.book ? ' & ' + c2.book : ' & '}${c2.chap}`
    : `${c1.book} ${c1.chap}`;

  return { dayNumber, chapters };
}

function buildNTChapterList() {
  const BOOKS = [
    ['Matthew',28],['Mark',16],['Luke',24],['John',21],
    ['Acts',28],['Romans',16],['1 Corinthians',16],['2 Corinthians',13],
    ['Galatians',6],['Ephesians',6],['Philippians',4],['Colossians',4],
    ['1 Thessalonians',5],['2 Thessalonians',3],['1 Timothy',6],
    ['2 Timothy',4],['Titus',3],['Philemon',1],['Hebrews',13],
    ['James',5],['1 Peter',5],['2 Peter',3],['1 John',5],
    ['2 John',1],['3 John',1],['Jude',1],['Revelation',22]
  ];
  const list = [];
  for (const [book, count] of BOOKS) {
    for (let c = 1; c <= count; c++) list.push({ book, chap: c });
  }
  return list;
}

/* ── WEB PUSH ─────────────────────────────────────────────── */
async function sendWebPush(env, endpoint, keys, payloadObj) {
  const payloadStr = JSON.stringify(payloadObj);
  const payloadBytes = new TextEncoder().encode(payloadStr);

  /* Encrypt using RFC 8291 (AES-128-GCM) */
  const encrypted = await encryptPayload(payloadBytes, keys.p256dh, keys.auth);

  /* Build VAPID Authorization header */
  const origin = new URL(endpoint).origin;
  const vapidAuth = await buildVAPIDAuth(env, origin);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization:    vapidAuth,
      'Content-Type':   'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL':            '86400',
      ...encrypted.headers
    },
    body: encrypted.body
  });

  if (!res.ok && res.status !== 201) {
    const text = await res.text().catch(() => '');
    throw new Error(`Push returned ${res.status}: ${text}`);
  }
}

async function buildVAPIDAuth(env, audience) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { aud: audience, sub: env.VAPID_SUBJECT, iat: now, exp: now + 43200 };

  const header  = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64url(JSON.stringify(claims));
  const sigInput = `${header}.${payload}`;

  const privateKey = await crypto.subtle.importKey(
    'raw',
    urlB64ToBuffer(env.VAPID_PRIVATE_KEY),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(sigInput)
  );

  const token = `${sigInput}.${b64urlBuf(sig)}`;
  return `vapid t=${token}, k=${env.VAPID_PUBLIC_KEY}`;
}

/* AES-128-GCM payload encryption per RFC 8291 */
async function encryptPayload(plaintext, p256dhB64, authB64) {
  const receiverPublicKey = await crypto.subtle.importKey(
    'raw', urlB64ToBuffer(p256dhB64),
    { name: 'ECDH', namedCurve: 'P-256' }, true, []
  );

  const senderKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']
  );

  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: receiverPublicKey },
    senderKeyPair.privateKey, 256
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const authSecret = urlB64ToBuffer(authB64);

  /* HKDF extract + expand */
  const prk = await hkdf(authSecret, sharedSecret, 'Content-Encoding: auth\x00', 32);
  const senderPublicKeyRaw = await crypto.subtle.exportKey('raw', senderKeyPair.publicKey);
  const receiverPublicKeyRaw = await crypto.subtle.exportKey('raw', receiverPublicKey);

  const keyInfoBuf = concat([
    textEncode('Content-Encoding: aesgcm\x00'),
    new Uint8Array([0, 65]),
    new Uint8Array(receiverPublicKeyRaw),
    new Uint8Array([0, 65]),
    new Uint8Array(senderPublicKeyRaw)
  ]);

  const nonceInfoBuf = concat([
    textEncode('Content-Encoding: nonce\x00'),
    new Uint8Array([0, 65]),
    new Uint8Array(receiverPublicKeyRaw),
    new Uint8Array([0, 65]),
    new Uint8Array(senderPublicKeyRaw)
  ]);

  const contentKey = await hkdf(salt, prk, keyInfoBuf, 16);
  const nonce      = await hkdf(salt, prk, nonceInfoBuf, 12);

  const importedKey = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);
  const padded = concat([new Uint8Array([0, 0]), plaintext]); // 2-byte padding length
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, importedKey, padded);

  /* RFC 8291 header: salt(16) + rs(4) + idlen(1) + senderPublicKey(65) */
  const rs = 4096;
  const rsBuf = new Uint8Array(4);
  new DataView(rsBuf.buffer).setUint32(0, rs);

  const bodyParts = concat([
    salt,
    rsBuf,
    new Uint8Array([65]),
    new Uint8Array(senderPublicKeyRaw),
    new Uint8Array(ciphertext)
  ]);

  return {
    headers: {
      'Crypto-Key': `dh=${b64urlBuf(senderPublicKeyRaw)}`,
      Encryption:   `salt=${b64urlBuf(salt)}`
    },
    body: bodyParts
  };
}

/* Helpers */
async function hkdf(salt, ikm, info, length) {
  const saltKey = await crypto.subtle.importKey('raw', salt, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: ikm instanceof ArrayBuffer ? ikm : ikm.buffer,
      info: info instanceof Uint8Array ? info : textEncode(info) },
    saltKey, length * 8
  );
  return new Uint8Array(bits);
}

function concat(arrays) {
  const total = arrays.reduce((n, a) => n + a.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { result.set(new Uint8Array(a instanceof ArrayBuffer ? a : a.buffer), offset); offset += a.byteLength; }
  return result;
}

function textEncode(str) { return new TextEncoder().encode(str); }

function urlB64ToBuffer(b64) {
  const padding = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + padding);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0))).buffer;
}

function b64url(str) {
  return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlBuf(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer || buf);
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
