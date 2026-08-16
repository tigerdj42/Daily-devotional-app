# Daily Devotional App — Deployment Guide

NT reading plan · Matthew to Revelation · 2 chapters/day · 130 days  
17 Aug 2026 – ~24 Dec 2026

---

## What you'll need

| Service | Cost | Purpose |
|---|---|---|
| GitHub Pages | Free | Hosts the app |
| Firebase (Spark plan) | Free | Auth, Firestore, sync |
| Cloudflare Workers | Free | Push notification scheduler |

---

## Step 1 — Firebase setup

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
2. Enable **Authentication** → Sign-in methods → **Google**.
3. Enable **Firestore** → Start in **production mode**.
4. Set these Firestore security rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{uid} {
      allow read, write: if request.auth.uid == uid;
    }

    match /pair/{pairId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update: if request.auth != null
        && (resource.data.husbandUid == request.auth.uid
            || resource.data.wifeUid == request.auth.uid
            || resource.data.husbandUid == null
            || resource.data.wifeUid == null);
    }

    match /reflections/{uid}/{day} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == uid;
    }

    match /milestones/{uid}/{id} {
      allow read, write: if request.auth.uid == uid;
    }

    match /subscriptions/{uid} {
      allow read, write: if request.auth.uid == uid;
    }
  }
}
```

5. Go to **Project Settings** → **Your apps** → Add a **Web app**.
6. Copy the config object — you'll paste it into the app's Settings modal on first launch.

### Generate VAPID keys (for push notifications)

Install `web-push` temporarily:

```bash
npx web-push generate-vapid-keys
```

Save both keys — you'll need them for Cloudflare and the app.

---

## Step 2 — Generate app icons

The app needs two icon files in an `icons/` folder:
- `icons/icon-192.png` — 192 × 192 px
- `icons/icon-512.png` — 512 × 512 px

Any square image works. A simple gold cross or the letter D on a warm gold background looks great.

---

## Step 3 — Deploy to GitHub Pages

1. Create a new **public** GitHub repository (or use an existing one).
2. Copy all files from this folder into the repository root:

```
index.html
app.js
styles.css
commentary.js
firebase-config.js
sw.js
manifest.json
cloudflare-worker.js    ← only needed for reference; not served by GitHub
README.md
icons/
  icon-192.png
  icon-512.png
```

3. Push to GitHub:

```bash
git init
git add .
git commit -m "Initial deployment"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

4. Go to **Settings → Pages** in your GitHub repo → set Source to `main` branch, root folder → **Save**.
5. Your app will be live at `https://YOUR_USERNAME.github.io/YOUR_REPO/`.

> **Important for service workers:** GitHub Pages serves over HTTPS, which is required for service workers and push notifications. If you use a custom domain, it must also use HTTPS.

---

## Step 4 — First launch: enter Firebase config

1. Open the app URL on your phone.
2. Tap **⚙ Enter Firebase config**.
3. Paste each field from the Firebase config object you copied in Step 1.
4. Paste your **VAPID Public Key** in the last field.
5. Tap **Save & connect** — the page reloads and you can sign in with Google.

---

## Step 5 — Deploy Cloudflare Worker (push notifications)

### Create a `wrangler.toml` file

```toml
name = "devotional-push"
main = "cloudflare-worker.js"
compatibility_date = "2024-01-01"

[triggers]
crons = ["0 0 * * *", "0 13 * * *"]
```

### Deploy

```bash
npm install -g wrangler
wrangler login
wrangler deploy
```

### Set environment variables in Cloudflare

```bash
wrangler secret put FIREBASE_PROJECT_ID
# paste your Firebase project ID

wrangler secret put FIREBASE_SERVICE_ACCOUNT_KEY
# paste the base64-encoded service account key (see below)

wrangler secret put VAPID_SUBJECT
# paste: mailto:your@email.com

wrangler secret put VAPID_PUBLIC_KEY
# paste the VAPID public key

wrangler secret put VAPID_PRIVATE_KEY
# paste the VAPID private key
```

### Generate the service account key

1. Firebase Console → **Project Settings → Service accounts**.
2. Click **Generate new private key** → download the JSON file.
3. Base64-encode it:

```bash
base64 -i serviceAccount.json | tr -d '\n'
```

Paste the output as the value of `FIREBASE_SERVICE_ACCOUNT_KEY`.

---

## Step 6 — Add to Home Screen (iPhone)

Push notifications on iPhone Safari require the app to be installed as a PWA:

1. Open the app URL in **Safari** on iPhone.
2. Tap the **Share** button (box with upward arrow).
3. Scroll down → tap **Add to Home Screen** → tap **Add**.
4. Open the app from the home screen icon.
5. Go to **Settings → Notifications** → tap **Enable**.

---

## Updating the app

For any future changes (bug fixes, text edits, etc.):

```bash
git add .
git commit -m "Update: describe what changed"
git push
```

GitHub Pages deploys automatically within a minute. Existing visitors will pick up the new service worker on their next visit.

---

## File overview

| File | Purpose |
|---|---|
| `index.html` | App shell — all screens, modals, DOM structure |
| `app.js` | All client-side logic: auth flow, day rendering, Bible fetch, TTS, reflections, milestones, push |
| `styles.css` | Design system, layout, dark mode, all component styles |
| `commentary.js` | Pre-generated devotional content for all 130 days |
| `firebase-config.js` | Firebase init + Firestore helpers (credentials entered at runtime) |
| `sw.js` | Service worker: offline caching + push notification handler |
| `manifest.json` | PWA manifest for "Add to Home Screen" |
| `cloudflare-worker.js` | Scheduled push notification sender (runs on Cloudflare, not GitHub Pages) |
| `icons/` | App icons (192 and 512 px) — you create these |
