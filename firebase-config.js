/* firebase-config.js
   Firebase v10 (compat mode via CDN).
   Hardcoded configuration to prevent manual configuration setup prompts.
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

  /* ── auth ───────────────────────────────────────────────── */
  function signInWithGoogle() {
    if (!_auth) throw new Error('Firebase not initialized');
    const provider = new firebase.auth.GoogleAuthProvider();
    return _auth.signInWithPopup(provider)
      .then(result => ({
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName
      }));
  }

  function signOut() {
    if (!_auth) return Promise.resolve();
    return _auth.signOut();
  }

  function onAuthChange(fn) {
    if (!_auth) { fn(null); return () => {}; }
    return _auth.onAuthStateChanged(fn);
  }

  /* ── user profile ───────────────────────────────────────── */
  function getProfile(uid) {
    return _db.doc(`users/${uid}`).get()
      .then(snap => snap.exists ? snap.data() : null);
  }

  function saveProfile(uid, { name, role }) {
    return _db.doc(`users/${uid}`).set({ name, role, createdAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }

  /* ── pair linking ───────────────────────────────────────── */
  async function getPairId(uid) {
    /* check husband slot */
    const hSnap = await _db.collection('pair')
      .where('husbandUid', '==', uid).limit(1).get();
    if (!hSnap.empty) return hSnap.docs[0].id;

    /* check wife slot */
    const wSnap = await _db.collection('pair')
      .where('wifeUid', '==', uid).limit(1).get();
    if (!wSnap.empty) return wSnap.docs[0].id;

    return null;
  }

  async function createOrJoinPair(uid, role) {
    /* already in a pair? */
    const existing = await getPairId(uid);
    if (existing) return existing;

    if (role === 'husband') {
      /* create new pair, husband slot */
      const ref = await _db.collection('pair').add({
        husbandUid: uid,
        wifeUid: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return ref.id;
    } else {
      /* wife: find an open slot (husbandUid exists, wifeUid is null) */
      const open = await _db.collection('pair')
        .where('wifeUid', '==', null).limit(1).get();
      if (!open.empty) {
        const pairRef = open.docs[0].ref;
        await pairRef.update({ wifeUid: uid });
        return open.docs[0].id;
      }
      /* no open slot — create wife-first pair */
      const ref = await _db.collection('pair').add({
        husbandUid: null,
        wifeUid: uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return ref.id;
    }
  }

  async function getPartnerUid(uid, pairId) {
    const snap = await _db.doc(`pair/${pairId}`).get();
    if (!snap.exists) return null;
    const data = snap.data();
    if (data.husbandUid === uid) return data.wifeUid || null;
    if (data.wifeUid === uid) return data.husbandUid || null;
    return null;
  }

  /* ── reflections ────────────────────────────────────────── */
  function getReflection(uid, day) {
    return _db.doc(`reflections/${uid}/${day}`).get()
      .then(snap => snap.exists ? snap.data() : null);
  }

  function saveReflection(uid, day, text) {
    return _db.doc(`reflections/${uid}/${day}`).set({
      text,
      dayNumber: day,
      savedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  function getPartnerReflection(partnerUid, day) {
    if (!partnerUid) return Promise.resolve(null);
    return getReflection(partnerUid, day);
  }

  /* ── milestones ─────────────────────────────────────────── */
  function getMilestone(uid, id) {
    return _db.doc(`milestones/${uid}/${id}`).get()
      .then(snap => snap.exists && snap.data().reached === true);
  }

  function saveMilestone(uid, id) {
    return _db.doc(`milestones/${uid}/${id}`).set({
      reached: true,
      reachedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  /* ── push subscriptions ─────────────────────────────────── */
  function savePushSubscription(uid, sub) {
    const { endpoint, keys } = sub.toJSON ? sub.toJSON() : sub;
    return _db.doc(`subscriptions/${uid}`).set({
      endpoint,
      keys,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  function deletePushSubscription(uid) {
    return _db.doc(`subscriptions/${uid}`).delete();
  }

  /* ── settings helpers ───────────────────────────────────── */
  function applyConfig() {
    _initialized = false;
    _app = null; _auth = null; _db = null;
    return init();
  }

  function getStoredConfig() { return HARDCODED_CONFIG; }

  /* ── public API ─────────────────────────────────────────── */
  return {
    init,
    applyConfig,
    getStoredConfig,
    signInWithGoogle,
    signOut,
    onAuthChange,
    getProfile,
    saveProfile,
    getPairId,
    createOrJoinPair,
    getPartnerUid,
    getReflection,
    saveReflection,
    getPartnerReflection,
    getMilestone,
    saveMilestone,
    savePushSubscription,
    deletePushSubscription
  };

})();