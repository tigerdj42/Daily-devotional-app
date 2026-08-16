/* app.js — Daily Devotional main application logic
   Runs entirely client-side. No build step.
   Depends on: commentary.js (window.commentaryData), firebase-config.js (window.FB)
*/

/* ══════════════════════════════════════════════════════════
   FAMILY CONFIG — edit these two things and redeploy.
   ══════════════════════════════════════════════════════════
   `id` is the Firestore key for that person's reflections. Once
   someone has saved reflections, DO NOT change their id or those
   entries will look empty. Names and emoji are safe to change.
*/
const PROFILES = [
  { id: 'shaun', name: 'Shaun', emoji: '👨' },
  { id: 'wife',  name: 'Wife',  emoji: '👩' },
];

/* Shared passcode. Not a security boundary — it only stops someone
   tapping the wrong profile by accident. */
const SHARED_PIN = '1234';
/* ════════════════════════════════════════════════════════ */

/* ── CONSTANTS ───────────────────────────────────────────── */
const LS_PROFILE = 'currentProfile';
const START_DATE = new Date('2026-08-17T00:00:00+08:00'); // SGT midnight
const TOTAL_DAYS = 130;
const LS_DARK    = 'devotional_dark';
const LS_NOTIF_DISMISSED = 'notif_banner_dismissed';
const LS_IOS_DISMISSED   = 'ios_banner_dismissed';
const LS_FONT_SCALE      = 'fontScale';
const BIBLE_API  = 'https://bible-api.com';

/* NT chapter layout: [bookName, chapCount] */
const NT_BOOKS = [
  ['Matthew',16,28],['Mark',8,16],['Luke',10,24],['John',8,21],
  ['Acts',12,28],['Romans',7,16],['1+Corinthians',8,16],['2+Corinthians',6,13],
  ['Galatians',3,6],['Ephesians',3,6],['Philippians',2,4],['Colossians',2,4],
  ['1+Thessalonians',3,5],['2+Thessalonians',2,3],['1+Timothy',3,6],
  ['2+Timothy',2,4],['Titus',1,3],['Philemon',1,1],['Hebrews',7,13],
  ['James',3,5],['1+Peter',3,5],['2+Peter',2,3],['1+John',3,5],
  ['2+John',1,1],['3+John',1,1],['Jude',1,1],['Revelation',11,22]
];
// [apiName, displayName, startDay, endDay]  — computed at init
let BOOK_META = [];

/* ── APP STATE ───────────────────────────────────────────── */
let state = {
  profile: null,      // { id, name, emoji } — the chosen PROFILES entry
  currentDay: 1,
  completedDays: new Set(),
  isDark: false,
  notifEnabled: false,
  vapidKey: null,
};

/* ── MILESTONE DEFINITIONS ───────────────────────────────── */
const MILESTONES = [
  { id: 'streak-7',    check: d => d >= 7,   icon: '🔥', title: '7-Day Streak!',    body: 'A full week of daily reading. The word is taking root.' },
  { id: 'streak-30',   check: d => d >= 30,  icon: '⭐', title: '30 Days Strong!',  body: 'A month of faithfulness. Your consistency is bearing fruit.' },
  { id: 'pct-25',      check: d => d >= 33,  icon: '📖', title: 'Quarter of the Way!', body: 'You have read 25% of the New Testament together.' },
  { id: 'pct-50',      check: d => d >= 65,  icon: '🏅', title: 'Halfway There!',   body: 'You are halfway through the New Testament. Keep going!' },
  { id: 'pct-75',      check: d => d >= 98,  icon: '🌟', title: '75% Complete!',    body: 'Three-quarters done. The finish line is in sight.' },
  { id: 'complete',    check: d => d >= 130, icon: '🏆', title: 'You Did It!',      body: 'You have read the entire New Testament together. Well done, good and faithful servant.' },
];

/* ── DOM REFS ────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const dom = {
  screens: {
    auth:  $('screen-auth'),
    main:  $('screen-main'),
  },
  // profile picker
  pickerStepProfile: $('picker-step-profile'),
  pickerStepPin:     $('picker-step-pin'),
  profileList:       $('profile-list'),
  pinProfileName:    $('pin-profile-name'),
  pinDots:           $('pin-dots'),
  pinError:          $('pin-error'),
  pinBack:           $('pin-back'),
  pinDelete:         $('pin-delete'),
  // header
  hamburgerBtn:      $('hamburger-btn'),
  mobileHeaderTitle: $('mobile-header-title'),
  mobileHeaderSub:   $('mobile-header-sub'),
  headerDayBadge:    $('header-day-badge'),
  headerDayText:     $('header-day-text'),
  btnDarkToggle:     $('btn-dark-toggle'),
  darkIcon:          $('dark-icon'),
  btnSettings:       $('btn-settings'),
  // sidebar
  sidebar:           $('sidebar'),
  mobileOverlay:     $('mobile-overlay'),
  btnCloseSidebar:   $('btn-close-sidebar'),
  progressFrac:      $('progress-frac'),
  progressBarFill:   $('progress-bar-fill'),
  progressSub:       $('progress-sub'),
  sidebarList:       $('sidebar-list'),
  sidebarUserAv:     $('sidebar-user-av'),
  sidebarUserName:   $('sidebar-user-name'),
  // main
  mainScroll:        $('main-scroll'),
  notifBanner:       $('notif-banner'),
  btnNotifEnable:    $('btn-notif-enable'),
  btnNotifDismiss:   $('btn-notif-dismiss'),
  iosInstallBanner:  $('ios-install-banner'),
  btnIosDismiss:     $('btn-ios-dismiss'),
  voiceBar:          $('voice-bar'),
  btnListen:         $('btn-listen'),
  dayHeader:         $('day-header'),
  mainDayBadge:      $('main-day-badge'),
  mainDayDate:       $('main-day-date'),
  mainDayTitle:      $('main-day-title'),
  missedBanner:      $('missed-banner'),
  bibleContent:      $('bible-content'),
  commentaryWhat:    $('commentary-what'),
  kvText:            $('kv-text'),
  kvRef:             $('kv-ref'),
  commentaryBody:    $('commentary-body'),
  prayerBody:        $('prayer-body'),
  thoughtsGrid:      $('thoughts-grid'),
  // modals
  modalMilestone:    $('modal-milestone'),
  milestoneIcon:     $('milestone-icon'),
  milestoneTitle:    $('milestone-modal-title'),
  milestoneBody:     $('milestone-modal-body'),
  btnMilestoneClose: $('btn-milestone-close'),
  modalSettings:     $('modal-settings'),
  btnSettingsClose:  $('btn-settings-close'),
  toggleDark:        $('toggle-dark'),
  toggleNotif:       $('toggle-notif'),
  settingsAccountName:  $('settings-account-name'),
  btnSwitchProfile:  $('btn-switch-profile'),
};

/* ── FONT SCALE ──────────────────────────────────────────── */
function applyFontScale(scale) {
  document.documentElement.style.setProperty('--font-scale', scale);
  localStorage.setItem(LS_FONT_SCALE, scale);
  document.querySelectorAll('.font-size-btn').forEach(btn => {
    btn.classList.toggle('selected', parseFloat(btn.dataset.scale) === scale);
  });
}

/* ── BOOT ────────────────────────────────────────────────── */
(async function boot() {
  buildBookMeta();
  applyDarkMode(localStorage.getItem(LS_DARK) === 'true');
  applyFontScale(parseFloat(localStorage.getItem(LS_FONT_SCALE) || '1'));
  registerServiceWorker();

  window.FB.init();
  wireProfilePicker();
  wireSettingsEvents();

  /* Silent anonymous session — no UI, no redirect, no popup. It only
     exists so Firestore rules can require an authenticated caller. */
  try {
    await window.FB.ensureSession();
  } catch (e) {
    console.error('[auth] anonymous session failed:', e);
    showPickerError('Could not connect. Check your connection and reload. (' + (e.code || e.message) + ')');
    return;
  }

  /* Already chose a profile on this device? Go straight in. */
  const saved = readSavedProfile();
  if (saved) {
    state.profile = saved;
    loadProfileData();
  } else {
    showProfilePicker();
  }
})();

/* ── PROFILE PERSISTENCE ─────────────────────────────────── */
function readSavedProfile() {
  try {
    const raw = localStorage.getItem(LS_PROFILE);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    /* Re-resolve against PROFILES so renamed/removed entries stay correct. */
    return PROFILES.find(p => p.id === saved.id) || null;
  } catch { return null; }
}

function saveProfileChoice(profile) {
  localStorage.setItem(LS_PROFILE, JSON.stringify({ id: profile.id, name: profile.name }));
}

/* ── PROFILE PICKER + PIN ────────────────────────────────── */
let pinEntry = '';
let pendingProfile = null;

function showProfilePicker() {
  showScreen('auth');
  pinEntry = '';
  pendingProfile = null;
  dom.pickerStepPin.classList.add('hidden');
  dom.pickerStepProfile.classList.remove('hidden');
  dom.pinError.textContent = '';
}

function showPickerError(msg) {
  showScreen('auth');
  dom.pinError.textContent = msg;
  dom.pickerStepPin.classList.remove('hidden');
  dom.pickerStepProfile.classList.add('hidden');
}

function wireProfilePicker() {
  /* Build one button per profile */
  dom.profileList.innerHTML = '';
  PROFILES.forEach((p, idx) => {
    const btn = document.createElement('button');
    btn.className = 'profile-btn' + (idx % 2 === 1 ? ' alt' : '');
    btn.innerHTML =
      `<span class="profile-emoji" aria-hidden="true">${p.emoji}</span>
       <span class="profile-name">${escHtml(p.name)}</span>`;
    btn.addEventListener('click', () => beginPin(p));
    dom.profileList.appendChild(btn);
  });

  /* PIN pad */
  document.querySelectorAll('.pin-key[data-key]').forEach(k => {
    k.addEventListener('click', () => pushPinDigit(k.dataset.key));
  });
  dom.pinDelete.addEventListener('click', () => {
    pinEntry = pinEntry.slice(0, -1);
    renderPinDots();
  });
  dom.pinBack.addEventListener('click', showProfilePicker);

  /* Hardware keyboard (desktop convenience) */
  document.addEventListener('keydown', e => {
    if (dom.pickerStepPin.classList.contains('hidden')) return;
    if (/^[0-9]$/.test(e.key)) pushPinDigit(e.key);
    else if (e.key === 'Backspace') { pinEntry = pinEntry.slice(0, -1); renderPinDots(); }
    else if (e.key === 'Escape') showProfilePicker();
  });
}

function beginPin(profile) {
  pendingProfile = profile;
  pinEntry = '';
  dom.pinProfileName.textContent = profile.name;
  dom.pinError.textContent = '';
  dom.pickerStepProfile.classList.add('hidden');
  dom.pickerStepPin.classList.remove('hidden');
  renderPinDots();
}

function renderPinDots() {
  const len = SHARED_PIN.length;
  dom.pinDots.innerHTML = '';
  for (let i = 0; i < len; i++) {
    const dot = document.createElement('span');
    dot.className = 'pin-dot' + (i < pinEntry.length ? ' filled' : '');
    dom.pinDots.appendChild(dot);
  }
}

function pushPinDigit(d) {
  if (pinEntry.length >= SHARED_PIN.length) return;
  pinEntry += d;
  dom.pinError.textContent = '';
  renderPinDots();

  if (pinEntry.length === SHARED_PIN.length) {
    /* Small delay so the last dot is visibly filled before we move on. */
    setTimeout(submitPin, 150);
  }
}

function submitPin() {
  if (pinEntry !== SHARED_PIN) {
    dom.pinError.textContent = 'Incorrect PIN — try again';
    pinEntry = '';
    renderPinDots();
    if (navigator.vibrate) navigator.vibrate(120);
    return;
  }
  state.profile = pendingProfile;
  saveProfileChoice(pendingProfile);
  loadProfileData();
}

function switchProfile() {
  localStorage.removeItem(LS_PROFILE);
  state.profile = null;
  state.completedDays = new Set();
  closeSettings();
  showProfilePicker();
}

/* ── BUILD BOOK META ─────────────────────────────────────── */
function buildBookMeta() {
  let dayCount = 0;
  let chapterCount = 0;
  for (const [apiName, , chapCount] of NT_BOOKS) {
    const displayName = apiName.replace(/\+/g, ' ');
    const daysNeeded = chapCount / 2;
    const startDay = dayCount + 1;
    const startChap = chapterCount + 1;
    BOOK_META.push({ apiName, displayName, chapCount, startDay, endDay: dayCount + daysNeeded, startChap });
    dayCount += daysNeeded;
    chapterCount += chapCount;
  }
}

/* ── CHAPTER → BOOK LOOKUP ───────────────────────────────── */
function chapToBook(globalChap) {
  let running = 0;
  for (const b of BOOK_META) {
    if (globalChap <= running + b.chapCount) {
      return { book: b.apiName, localChap: globalChap - running, displayBook: b.displayName };
    }
    running += b.chapCount;
  }
  return null;
}

function dayToChapters(day) {
  const c1 = (day - 1) * 2 + 1;
  const c2 = c1 + 1;
  return [chapToBook(c1), chapToBook(c2)];
}

/* ── TODAY'S DAY NUMBER ──────────────────────────────────── */
function todayDayNumber() {
  const now = new Date();
  const sgtnow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
  const sgtstart = new Date(START_DATE.toLocaleString('en-US', { timeZone: 'Asia/Singapore' }));
  sgtstart.setHours(0, 0, 0, 0);
  sgtnow.setHours(0, 0, 0, 0);
  const diff = Math.floor((sgtnow - sgtstart) / 86400000) + 1;
  return Math.max(1, Math.min(diff, TOTAL_DAYS));
}

/* ── SCREEN SWITCHING ────────────────────────────────────── */
function showScreen(name) {
  Object.values(dom.screens).forEach(s => s.classList.remove('active'));
  dom.screens[name].classList.add('active');
}

/* ── DARK MODE ───────────────────────────────────────────── */
function applyDarkMode(on) {
  state.isDark = on;
  document.documentElement.setAttribute('data-theme', on ? 'dark' : 'light');
  dom.darkIcon.textContent = on ? '☀' : '☾';
  localStorage.setItem(LS_DARK, on);
  if (dom.toggleDark) dom.toggleDark.checked = on;
}

/* ── SERVICE WORKER ──────────────────────────────────────── */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    /* Relative path + scope: the app is served from a project subpath on
       GitHub Pages (/Daily-devotional-app/), so '/sw.js' would 404. */
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(console.warn);
  }
}

/* ── LOAD DATA FOR THE CHOSEN PROFILE ────────────────────── */
async function loadProfileData() {
  try {
    await loadCompletedDays();
    state.currentDay = todayDayNumber();
    showMainApp();
  } catch (e) {
    /* Never strand the user on the picker with no explanation. */
    console.error('[app] loadProfileData error:', e);
    showPickerError('Could not load your reflections: ' + (e.message || e.code || 'unknown error'));
  }
}

async function loadCompletedDays() {
  /* We infer completion from whether this profile has a reflection for each
     day. A single failed read must not blank the whole app, so failures
     count as "not completed" rather than rejecting the batch. */
  const today = todayDayNumber();
  const checks = [];
  for (let d = 1; d <= today; d++) {
    checks.push(
      window.FB.getReflection(state.profile.id, d)
        .then(r => (r ? d : null))
        .catch(e => { console.warn('[app] reflection read failed for day', d, e); return null; })
    );
  }
  const results = await Promise.all(checks);
  state.completedDays = new Set(results.filter(Boolean));
}

/* ── MAIN APP INIT ───────────────────────────────────────── */
function showMainApp() {
  showScreen('main');
  wireMainEvents();
  renderSidebar();
  renderDay(state.currentDay);
  showNotifBannerIfNeeded();
}

/* ── MAIN EVENTS ─────────────────────────────────────────── */
function wireMainEvents() {
  /* Dark mode */
  dom.btnDarkToggle.addEventListener('click', () => applyDarkMode(!state.isDark));
  dom.toggleDark.addEventListener('change', () => applyDarkMode(dom.toggleDark.checked));

  /* Settings modal */
  dom.btnSettings.addEventListener('click', openSettings);
  dom.btnSettingsClose.addEventListener('click', closeSettings);
  dom.modalSettings.addEventListener('click', e => { if (e.target === dom.modalSettings) closeSettings(); });

  /* Milestone modal */
  dom.btnMilestoneClose.addEventListener('click', closeMilestoneModal);
  dom.modalMilestone.addEventListener('click', e => { if (e.target === dom.modalMilestone) closeMilestoneModal(); });

  /* Sidebar drawer (mobile) */
  dom.hamburgerBtn.addEventListener('click', openDrawer);
  dom.btnCloseSidebar.addEventListener('click', closeDrawer);
  dom.mobileOverlay.addEventListener('click', closeDrawer);

  /* Notifications */
  dom.btnNotifEnable.addEventListener('click', requestPushPermission);
  dom.btnNotifDismiss.addEventListener('click', () => {
    dom.notifBanner.classList.add('hidden');
    localStorage.setItem(LS_NOTIF_DISMISSED, '1');
  });
  dom.btnIosDismiss.addEventListener('click', () => {
    dom.iosInstallBanner.classList.add('hidden');
    localStorage.setItem(LS_IOS_DISMISSED, '1');
  });
  dom.toggleNotif.addEventListener('change', () => {
    if (dom.toggleNotif.checked) requestPushPermission();
    else unsubscribePush();
  });

  /* Sign out */
  dom.btnSwitchProfile.addEventListener('click', switchProfile);

  /* Settings save */
  wireSettingsEvents();
}

/* ── DRAWER ──────────────────────────────────────────────── */
function openDrawer() {
  dom.sidebar.classList.add('drawer-open');
  dom.mobileOverlay.classList.add('open');
  dom.mobileOverlay.removeAttribute('aria-hidden');
  dom.hamburgerBtn.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  dom.sidebar.classList.remove('drawer-open');
  dom.mobileOverlay.classList.remove('open');
  dom.mobileOverlay.setAttribute('aria-hidden', 'true');
  dom.hamburgerBtn.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

/* ── SIDEBAR RENDER ──────────────────────────────────────── */
function renderSidebar() {
  const today = todayDayNumber();
  const name = state.profile?.name || '';
  /* Alternate the avatar accent by position in PROFILES. */
  const isAlt = PROFILES.findIndex(p => p.id === state.profile?.id) % 2 === 1;

  /* User avatar */
  dom.sidebarUserAv.textContent = name ? name[0].toUpperCase() : '?';
  dom.sidebarUserAv.classList.toggle('wife', isAlt);
  dom.sidebarUserName.textContent = name;

  /* Progress */
  const done = state.completedDays.size;
  dom.progressFrac.textContent = `${done} / ${TOTAL_DAYS} days`;
  dom.progressBarFill.style.width = `${Math.round((done / TOTAL_DAYS) * 100)}%`;

  const daysLeft = TOTAL_DAYS - today + 1;
  if (daysLeft > 0) {
    const finish = new Date(START_DATE);
    finish.setDate(finish.getDate() + TOTAL_DAYS - 1);
    dom.progressSub.textContent = `${daysLeft} days to go · finishes ${finish.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}`;
  } else {
    dom.progressSub.textContent = 'Plan complete!';
  }

  /* Book groups */
  const list = dom.sidebarList;
  list.innerHTML = '';

  /* Build groups keyed by book */
  const groups = [];
  let currentGroup = null;

  for (let d = 1; d <= TOTAL_DAYS; d++) {
    const [ch1] = dayToChapters(d);
    if (!ch1) continue;
    const bookDisplay = ch1.displayBook;

    if (!currentGroup || currentGroup.book !== bookDisplay) {
      currentGroup = { book: bookDisplay, days: [] };
      groups.push(currentGroup);
    }
    currentGroup.days.push(d);
  }

  /* Milestone chips: days that trigger them */
  const milestoneDays = new Set([7, 33, 65, 98, 130]);

  for (const group of groups) {
    const bookMeta = BOOK_META.find(b => b.displayName === group.book);
    const bookDone = group.days.filter(d => state.completedDays.has(d)).length;
    const bookTotal = group.days.length;
    const bookPct = bookTotal ? Math.round((bookDone / bookTotal) * 100) : 0;

    const groupEl = document.createElement('div');
    groupEl.className = 'book-group';
    groupEl.innerHTML = `
      <div class="book-group-header">
        <div class="book-group-name">
          <span>${group.book}</span>
          <span class="book-group-count">${bookDone}/${bookTotal}</span>
        </div>
        <div class="book-bar"><div class="book-bar-fill" style="width:${bookPct}%; background:var(--gold);"></div></div>
      </div>`;

    for (const d of group.days) {
      const [c1, c2] = dayToChapters(d);
      const isCurrent = d === state.currentDay;
      const isDone = state.completedDays.has(d);
      const isMissed = d < today && !isDone;
      const isFuture = d > today;

      let dotClass = 'dot-future';
      if (isDone) dotClass = 'dot-done';
      else if (isCurrent) dotClass = 'dot-active';
      else if (isMissed) dotClass = 'dot-missed';

      const dayDate = new Date(START_DATE);
      dayDate.setDate(dayDate.getDate() + d - 1);
      const dateStr = dayDate.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });

      const chapLabel = c2
        ? `${c1.displayBook} ${c1.localChap} & ${c2.displayBook !== c1.displayBook ? c2.displayBook + ' ' : ''}${c2.localChap}`
        : `${c1.displayBook} ${c1.localChap}`;

      const row = document.createElement('div');
      row.className = `day-row${isCurrent ? ' is-active' : ''}`;
      row.setAttribute('role', 'listitem');
      row.setAttribute('aria-label', `Day ${d}: ${chapLabel}`);
      row.dataset.day = d;
      row.innerHTML = `
        <span class="dot ${dotClass}" aria-hidden="true"></span>
        <div class="day-row-info">
          <div class="day-row-num">Day ${d} · ${dateStr}</div>
          <div class="day-row-chaps">${chapLabel}</div>
        </div>`;

      row.addEventListener('click', () => {
        state.currentDay = d;
        closeDrawer();
        renderDay(d);
        updateSidebarActive(d);
      });

      groupEl.appendChild(row);

      /* Milestone chip after the row that triggers it */
      if (milestoneDays.has(d)) {
        const m = MILESTONES.find(ml => ml.check(d) && !ml.check(d - 1));
        if (m && d <= today) {
          const chip = document.createElement('div');
          chip.className = 'milestone-chip';
          chip.innerHTML = `<span class="milestone-chip-icon">${m.icon}</span><span class="milestone-chip-text">${m.title}</span>`;
          groupEl.appendChild(chip);
        }
      }
    }

    list.appendChild(groupEl);
  }
}

function updateSidebarActive(day) {
  document.querySelectorAll('.day-row').forEach(r => {
    r.classList.toggle('is-active', parseInt(r.dataset.day) === day);
  });
}

/* ── RENDER A DAY ────────────────────────────────────────── */
async function renderDay(day) {
  const today = todayDayNumber();
  const [c1, c2] = dayToChapters(day);
  if (!c1) return;

  const dayDate = new Date(START_DATE);
  dayDate.setDate(dayDate.getDate() + day - 1);
  const dateStr = dayDate.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const chapLabel = c2
    ? `${c1.displayBook} ${c1.localChap} & ${c2.displayBook !== c1.displayBook ? c2.displayBook + ' ' : ''}${c2.localChap}`
    : `${c1.displayBook} ${c1.localChap}`;

  /* Header */
  dom.mainDayBadge.textContent = `Day ${day}`;
  dom.mainDayDate.textContent = dateStr;
  dom.mainDayTitle.textContent = chapLabel;
  dom.mobileHeaderTitle.textContent = `Day ${day}`;
  dom.mobileHeaderSub.textContent = chapLabel;
  dom.headerDayBadge.textContent = `Day ${day}`;
  dom.headerDayText.textContent = chapLabel;

  /* Missed banner */
  dom.missedBanner.classList.toggle('hidden', day >= today);

  /* Commentary */
  const commentary = window.commentaryData?.[day - 1];
  if (commentary) {
    dom.commentaryWhat.textContent = commentary.whatIsHappening;
    dom.kvText.textContent = `"${commentary.keyVerse.text}"`;
    dom.kvRef.textContent = commentary.keyVerse.reference;
    dom.commentaryBody.textContent = commentary.commentary;
    dom.prayerBody.textContent = commentary.prayer;
  }

  /* Bible text (skeleton while loading) */
  dom.bibleContent.innerHTML = skeletonHtml();
  const chapters = c2 ? [c1, c2] : [c1];
  const texts = await Promise.all(chapters.map(c => fetchChapter(c.book, c.localChap)));
  renderBibleContent(chapters, texts);

  /* Scroll to top */
  dom.mainScroll.scrollTo({ top: 0, behavior: 'smooth' });

  /* Reflections — a Firestore failure here must not blank the reading. */
  try {
    await renderThoughts(day);
  } catch (e) {
    console.error('[app] renderThoughts failed:', e);
    dom.thoughtsGrid.innerHTML =
      `<p class="thought-empty">Could not load reflections. ${escHtml(e.message || '')}</p>`;
  }

  /* Check milestones */
  if (day === today) checkMilestones(day);
}

/* ── BIBLE FETCH ─────────────────────────────────────────── */
function bibleApiUrl(book, chap) {
  return `${BIBLE_API}/${book}+${chap}?translation=web`;
}

async function fetchChapter(book, chap) {
  const cacheKey = `chapter_${book}_${chap}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch { /* fall through */ }
  }

  try {
    const res = await fetch(bibleApiUrl(book, chap));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    localStorage.setItem(cacheKey, JSON.stringify(data));
    return data;
  } catch (e) {
    console.warn('[bible-api]', e);
    return null;
  }
}

/* ── BIBLE RENDER ────────────────────────────────────────── */
function skeletonHtml() {
  return `
    <div class="passage-loading">
      <div class="skeleton skel-title" style="width:55%; margin-bottom:20px;"></div>
      <div class="skel-para">
        ${Array.from({ length: 8 }, (_, i) =>
          `<div class="skeleton skel-line" style="width:${70 + Math.random() * 28}%"></div>`
        ).join('')}
      </div>
    </div>`;
}

function renderBibleContent(chapters, texts) {
  dom.bibleContent.innerHTML = '';

  chapters.forEach((ch, idx) => {
    if (idx > 0) {
      const sep = document.createElement('div');
      sep.className = 'chapter-sep';
      sep.innerHTML = `
        <div class="chapter-sep-line"></div>
        <span class="chapter-sep-label">${ch.displayBook} · Chapter ${ch.localChap}</span>
        <div class="chapter-sep-line"></div>`;
      dom.bibleContent.appendChild(sep);
    } else {
      /* First chapter separator */
      const sep = document.createElement('div');
      sep.className = 'chapter-sep';
      sep.innerHTML = `
        <div class="chapter-sep-line"></div>
        <span class="chapter-sep-label">${ch.displayBook} · Chapter ${ch.localChap}</span>
        <div class="chapter-sep-line"></div>`;
      dom.bibleContent.appendChild(sep);
    }

    const passage = document.createElement('div');
    passage.className = 'bible-passage';

    const data = texts[idx];
    if (!data || !data.verses) {
      passage.innerHTML = `<span style="color:var(--text-3); font-style:italic; font-family:'Inter',sans-serif; font-size:14px;">
        Could not load text. Check your connection and try again.
      </span>`;
    } else {
      const frag = document.createDocumentFragment();
      for (const v of data.verses) {
        const sup = document.createElement('sup');
        sup.className = 'vn';
        sup.setAttribute('aria-hidden', 'true');
        sup.textContent = v.verse;

        const txt = document.createTextNode(v.text.trim() + ' ');
        frag.appendChild(sup);
        frag.appendChild(txt);
      }

      /* Translation note */
      const note = document.createElement('p');
      note.className = 'translation-note';
      note.textContent = 'World English Bible (WEB)';
      frag.appendChild(note);

      passage.appendChild(frag);
    }

    dom.bibleContent.appendChild(passage);
  });
}

/* ── REFLECTIONS / THOUGHTS ──────────────────────────────── */
async function renderThoughts(day) {
  dom.thoughtsGrid.innerHTML = '';

  /* One card per family member, in PROFILES order. */
  const refs = await Promise.all(
    PROFILES.map(p =>
      window.FB.getReflection(p.id, day)
        .catch(e => { console.warn('[app] reflection read failed for', p.id, e); return null; })
    )
  );

  PROFILES.forEach((p, idx) => {
    const reflection = refs[idx];
    dom.thoughtsGrid.appendChild(buildThoughtCard({
      profileId: p.id,
      /* Prefer the name saved on the document (Step 6), falling back to
         the configured name for profiles that haven't written yet. */
      name: reflection?.name || p.name,
      alt: idx % 2 === 1,
      reflection,
      isMe: p.id === state.profile.id,
      day
    }));
  });
}

function buildThoughtCard({ profileId, name, alt, reflection, isMe, day }) {
  const card = document.createElement('div');
  card.className = 'thought-card';

  const avEl = document.createElement('div');
  avEl.className = `thought-av${alt ? ' wife' : ''}`;
  avEl.textContent = name ? name[0].toUpperCase() : '?';
  avEl.setAttribute('aria-hidden', 'true');

  const header = document.createElement('div');
  header.className = 'thought-header';
  header.appendChild(avEl);

  const info = document.createElement('div');
  info.innerHTML = `<div class="thought-av-name">${escHtml(name)}</div>
                    <div class="thought-av-role">${isMe ? 'You' : 'Reading together'}</div>`;
  header.appendChild(info);
  card.appendChild(header);

  if (isMe) {
    const ta = document.createElement('textarea');
    ta.className = 'thought-textarea';
    ta.placeholder = 'What stood out to you today? A verse, a thought, a question…';
    ta.value = reflection?.text || '';
    ta.setAttribute('aria-label', 'My reflection');
    card.appendChild(ta);

    const footer = document.createElement('div');
    footer.className = 'thought-footer';

    const timeEl = document.createElement('span');
    timeEl.className = 'thought-time';
    if (reflection?.savedAt) {
      const d = reflection.savedAt.toDate ? reflection.savedAt.toDate() : new Date(reflection.savedAt);
      timeEl.textContent = `Saved ${d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}`;
    }

    const saveBtn = document.createElement('button');
    saveBtn.className = 'save-btn';
    saveBtn.textContent = 'Save';

    saveBtn.addEventListener('click', async () => {
      const text = ta.value.trim();
      if (!text) return;
      saveBtn.disabled = true;
      saveBtn.classList.add('saving');
      saveBtn.textContent = 'Saving…';
      try {
        await window.FB.saveReflection(profileId, day, text, state.profile.name);
        state.completedDays.add(day);
        renderSidebar();
        saveBtn.textContent = 'Saved ✓';
        timeEl.textContent = `Saved ${new Date().toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}`;
        setTimeout(() => { saveBtn.disabled = false; saveBtn.classList.remove('saving'); saveBtn.textContent = 'Save'; }, 2000);
      } catch (e) {
        console.error(e);
        saveBtn.disabled = false; saveBtn.classList.remove('saving'); saveBtn.textContent = 'Save';
      }
    });

    footer.appendChild(timeEl);
    footer.appendChild(saveBtn);
    card.appendChild(footer);
  } else {
    /* Partner — read-only */
    const body = document.createElement('p');
    if (reflection?.text) {
      body.className = 'thought-read';
      body.textContent = `"${reflection.text}"`;
      const meta = document.createElement('p');
      meta.className = 'thought-read-meta';
      if (reflection.savedAt) {
        const d = reflection.savedAt.toDate ? reflection.savedAt.toDate() : new Date(reflection.savedAt);
        meta.textContent = `Shared ${d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}`;
      }
      card.appendChild(body);
      card.appendChild(meta);
    } else {
      body.className = 'thought-empty';
      body.textContent = 'No reflection yet today.';
      card.appendChild(body);
    }
  }

  return card;
}

/* ── MILESTONES ──────────────────────────────────────────── */
async function checkMilestones(currentDay) {
  for (const m of MILESTONES) {
    if (!m.check(currentDay)) continue;
    try {
      const already = await window.FB.getMilestone(state.profile.id, m.id);
      if (!already) {
        await window.FB.saveMilestone(state.profile.id, m.id);
        showMilestoneModal(m);
        break; // show one at a time
      }
    } catch {}
  }
}

function showMilestoneModal(m) {
  dom.milestoneIcon.textContent = m.icon;
  dom.milestoneTitle.textContent = m.title;
  dom.milestoneBody.textContent = m.body;
  dom.modalMilestone.classList.add('open');
  dom.modalMilestone.setAttribute('aria-hidden', 'false');
}

function closeMilestoneModal() {
  dom.modalMilestone.classList.remove('open');
  dom.modalMilestone.setAttribute('aria-hidden', 'true');
}

/* ── SETTINGS MODAL ──────────────────────────────────────── */
function wireSettingsEvents() {
  document.querySelectorAll('.font-size-btn').forEach(btn => {
    btn.addEventListener('click', () => applyFontScale(parseFloat(btn.dataset.scale)));
  });
}

function openSettings() {
  dom.toggleDark.checked = state.isDark;
  dom.toggleNotif.checked = state.notifEnabled;

  const currentScale = parseFloat(localStorage.getItem(LS_FONT_SCALE) || '1');
  document.querySelectorAll('.font-size-btn').forEach(btn => {
    btn.classList.toggle('selected', parseFloat(btn.dataset.scale) === currentScale);
  });

  if (state.profile) {
    dom.settingsAccountName.textContent = state.profile.name || '';
  }

  dom.modalSettings.classList.add('open');
  dom.modalSettings.setAttribute('aria-hidden', 'false');
}

function closeSettings() {
  dom.modalSettings.classList.remove('open');
  dom.modalSettings.setAttribute('aria-hidden', 'true');
}

/* ── PUSH NOTIFICATIONS ──────────────────────────────────── */
function showNotifBannerIfNeeded() {
  if (localStorage.getItem(LS_NOTIF_DISMISSED)) return;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  if (Notification.permission === 'granted') { state.notifEnabled = true; return; }
  if (Notification.permission === 'denied') return;

  /* iOS Safari: only supported when installed as PWA */
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.navigator.standalone;

  if (isIOS && !isStandalone) {
    if (!localStorage.getItem(LS_IOS_DISMISSED)) {
      dom.iosInstallBanner.classList.remove('hidden');
    }
    return;
  }

  dom.notifBanner.classList.remove('hidden');
}

async function requestPushPermission() {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      dom.toggleNotif.checked = false;
      return;
    }
    dom.notifBanner.classList.add('hidden');
    state.notifEnabled = true;
    dom.toggleNotif.checked = true;

    const sw = await navigator.serviceWorker.ready;
    const vapidKey = localStorage.getItem('vapid_key');
    if (!vapidKey) { console.warn('No VAPID key stored — skipping push subscription'); return; }

    const sub = await sw.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey)
    });

    await window.FB.savePushSubscription(state.profile.id, sub);
  } catch (e) {
    console.warn('[push]', e);
    dom.toggleNotif.checked = false;
    state.notifEnabled = false;
  }
}

async function unsubscribePush() {
  try {
    const sw = await navigator.serviceWorker.ready;
    const sub = await sw.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    await window.FB.deletePushSubscription(state.profile.id);
    state.notifEnabled = false;
  } catch (e) { console.warn('[push unsubscribe]', e); }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

/* ── VOICE / TTS ─────────────────────────────────────────── */
let ttsState = { active: false, paused: false, utterances: [], idx: 0 };

function buildTTSSections(day, chapters, texts) {
  const commentary = window.commentaryData?.[day - 1];
  const sections = [];

  /* Day intro */
  sections.push({ label: 'Introduction', text: `Day ${day}. Today we read ${commentary?.chapters || ''}.` });

  /* Bible chapters */
  chapters.forEach((ch, i) => {
    const data = texts[i];
    if (!data?.verses) return;
    const chapText = data.verses.map(v => v.text.trim()).join(' ');
    sections.push({ label: `${ch.displayBook} ${ch.localChap}`, text: chapText });
  });

  /* Commentary */
  if (commentary) {
    sections.push({ label: "What's happening", text: commentary.whatIsHappening });
    sections.push({ label: 'Key verse', text: `${commentary.keyVerse.reference}: ${commentary.keyVerse.text}` });
    sections.push({ label: 'Commentary', text: commentary.commentary });
    sections.push({ label: 'Prayer', text: commentary.prayer });
  }

  return sections;
}

function renderVoiceBar(active) {
  if (!active) {
    dom.voiceBar.className = 'voice-bar voice-bar-idle';
    dom.voiceBar.innerHTML = `
      <button id="btn-listen" class="listen-btn" aria-label="Listen to today's reading">
        <span>▶</span> Listen to today's reading
      </button>
      <span class="listen-hint">Reads passage + commentary aloud</span>`;
    dom.voiceBar.querySelector('#btn-listen').addEventListener('click', startTTS);
    return;
  }

  dom.voiceBar.className = 'voice-bar voice-bar-active';
  dom.voiceBar.innerHTML = `
    <div class="voice-section-label">
      <div id="vp-pulse" class="voice-pulse" aria-hidden="true"></div>
      <div>
        <div class="voice-now-reading">Now reading</div>
        <div id="vp-section-name" class="voice-section-name"></div>
      </div>
    </div>
    <div class="voice-progress-track"><div id="vp-fill" class="voice-progress-fill" style="width:0%"></div></div>
    <div class="voice-controls-right">
      <select id="vp-speed" class="voice-speed-select" aria-label="Playback speed">
        <option value="0.8">0.8×</option>
        <option value="1.0" selected>1.0×</option>
        <option value="1.2">1.2×</option>
        <option value="1.5">1.5×</option>
      </select>
      <button id="vp-play-pause" class="voice-ctrl-btn" aria-label="Pause">⏸</button>
      <button id="vp-stop" class="voice-ctrl-btn stop-btn" aria-label="Stop">⏹</button>
    </div>`;

  document.getElementById('vp-play-pause').addEventListener('click', toggleTTSPause);
  document.getElementById('vp-stop').addEventListener('click', stopTTS);
  document.getElementById('vp-speed').addEventListener('change', e => {
    const rate = parseFloat(e.target.value);
    if (ttsState.currentUtterance) ttsState.currentUtterance.rate = rate;
    ttsState.rate = rate;
  });
}

function updateVoiceProgress(sectionName, pct) {
  const nameEl = document.getElementById('vp-section-name');
  const fillEl = document.getElementById('vp-fill');
  const pulse  = document.getElementById('vp-pulse');
  if (nameEl) nameEl.textContent = sectionName;
  if (fillEl) fillEl.style.width = `${pct}%`;
  if (pulse)  pulse.classList.toggle('paused', ttsState.paused);
}

async function startTTS() {
  if (!window.speechSynthesis) return;

  const [c1, c2] = dayToChapters(state.currentDay);
  const chapters = c2 ? [c1, c2] : [c1];
  const texts = await Promise.all(chapters.map(c => fetchChapter(c.book, c.localChap)));

  ttsState.sections = buildTTSSections(state.currentDay, chapters, texts);
  ttsState.idx = 0;
  ttsState.paused = false;
  ttsState.active = true;
  ttsState.rate = 1.0;

  renderVoiceBar(true);
  speakSection(0);
}

function speakSection(idx) {
  if (idx >= ttsState.sections.length) { stopTTS(); return; }

  const section = ttsState.sections[idx];
  const utt = new SpeechSynthesisUtterance(section.text);
  utt.rate = ttsState.rate || 1.0;

  const pct = Math.round(((idx + 1) / ttsState.sections.length) * 100);
  updateVoiceProgress(section.label, pct);

  ttsState.currentUtterance = utt;
  utt.onend = () => speakSection(idx + 1);
  utt.onerror = e => { if (e.error !== 'interrupted') console.warn('[tts]', e); };

  window.speechSynthesis.speak(utt);
}

function toggleTTSPause() {
  if (!ttsState.active) return;
  const btn = document.getElementById('vp-play-pause');
  if (ttsState.paused) {
    window.speechSynthesis.resume();
    ttsState.paused = false;
    if (btn) btn.textContent = '⏸';
  } else {
    window.speechSynthesis.pause();
    ttsState.paused = true;
    if (btn) btn.textContent = '▶';
  }
  const pulse = document.getElementById('vp-pulse');
  if (pulse) pulse.classList.toggle('paused', ttsState.paused);
}

function stopTTS() {
  window.speechSynthesis.cancel();
  ttsState.active = false;
  ttsState.paused = false;
  renderVoiceBar(false);
}

/* Wire initial listen button */
document.getElementById('btn-listen')?.addEventListener('click', startTTS);

/* ── UTILITIES ───────────────────────────────────────────── */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
