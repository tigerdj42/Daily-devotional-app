/* firebase-config.js
   Firebase v10 (compat mode via CDN).

   No Google Sign-In: identity comes from the in-app profile picker
   (see PROFILES in app.js), so there are no popups or redirects — which
   is what broke sign-in inside an iOS standalone PWA.

   Firebase Auth is still loaded, but ONLY for a silent anonymous session.
   That session is never shown to the user; it exists so the Firestore
   rules can require `request.auth != null` instead of being open to the
   whole internet. Data is keyed by profile id, not by the anonymous uid,
   so a different uid per device does not affect syncing.
*/

window.FB = (() => {

  /* ── hardcoded config ──────────────────────────────────── */
  const HARDCODED_CONFIG = {
    apiKey: "AIzaSyCyAw0TqXRcwKLieUcwZzck89EXqr3wG7Q",
    authDomain: "daily-devotional-app-56935.firebaseapp.com",
    projectId: "daily-devotional-app-56935",
    storageBucket: "daily-devotional-app-56935.firebasestorage.app",
    messagingSenderId: "1020388462347",
    appId: "1:1020388462347:web:31a407aec5a7ff16bbdc0e",
    measurementId: "G-CKMQ8DY67D"
  };

  /* ── state ──────────────────────────────────────────────── */
  let _app = null;
  let _auth = null;
  let _db = null;
  let _initialized = false;

  /* ── init ───────────────────────────────────────────────── */
  function init() {
    if (_initialized) return true;

    try {
      if (firebase.apps.length === 0) {
        _app = firebase.initializeApp(HARDCODED_CONFIG);
      } else {
        _app = firebase.app();
      }
      _auth = firebase.auth();
      _db   = firebase.firestore();
      _initialized = true;
      return true;
    } catch (e) {
      console.error('[FB] init failed:', e);
      return false;
    }
  }

  /* ── silent anonymous session ───────────────────────────── */
  /* Resolves once an anonymous user exists. Purely a security gate —
     no UI, no redirect, no popup, so it works in an iOS standalone PWA. */
  function ensureSession() {
    if (!_auth) return Promise.reject(new Error('Firebase not initialized'));
    if (_auth.currentUser) return Promise.resolve(_auth.currentUser);

    return new Promise((resolve, reject) => {
      const unsub = _auth.onAuthStateChanged(user => {
        if (user) { unsub(); resolve(user); }
      });
      _auth.signInAnonymously().catch(err => { unsub(); reject(err); });
    });
  }

  /* ── reflections ────────────────────────────────────────── */
  /* Firestore document paths need an EVEN number of segments, so each
     profile's days live in a `days` subcollection. */
  function getReflection(profileId, day) {
    return _db.doc(`reflections/${profileId}/days/${day}`).get()
      .then(snap => snap.exists ? snap.data() : null);
  }

  function saveReflection(profileId, day, text, name) {
    /* `name` is stored on the document so the Our Thoughts panel can
       label each reflection without any auth display name. */
    return _db.doc(`reflections/${profileId}/days/${day}`).set({
      text,
      name,
      profileId,
      dayNumber: day,
      savedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  /* ── milestones ─────────────────────────────────────────── */
  function getMilestone(profileId, id) {
    return _db.doc(`milestones/${profileId}/items/${id}`).get()
      .then(snap => snap.exists && snap.data().reached === true);
  }

  function saveMilestone(profileId, id) {
    return _db.doc(`milestones/${profileId}/items/${id}`).set({
      reached: true,
      reachedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  /* ── push subscriptions ─────────────────────────────────── */
  function savePushSubscription(profileId, sub) {
    const { endpoint, keys } = sub.toJSON ? sub.toJSON() : sub;
    return _db.doc(`subscriptions/${profileId}`).set({
      endpoint,
      keys,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  function deletePushSubscription(profileId) {
    return _db.doc(`subscriptions/${profileId}`).delete();
  }

  /* ── settings helpers ───────────────────────────────────── */
  function getStoredConfig() { return HARDCODED_CONFIG; }

  /* ── public API ─────────────────────────────────────────── */
  return {
    init,
    ensureSession,
    getStoredConfig,
    getReflection,
    saveReflection,
    getMilestone,
    saveMilestone,
    savePushSubscription,
    deletePushSubscription
  };

})();
