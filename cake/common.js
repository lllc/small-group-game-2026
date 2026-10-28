// Shared settings and Firebase helpers for 搶蛋糕
const CAKE = {
  LEAD_MS: 3000,        // countdown before the round clock starts
  ROUND_MS: 20000,      // clock runs from 40 s to 60 s, so a round lasts 20 s
  CLOCK_START: 40,      // the second hand starts at 40 s
  FADE_S: 5,            // clock fades out over 5 s, starting at the hide time
  COUNT_STEPS: 6,       // countdown numbers shown, e.g. 10,9,8,7,6,5
  MAX_PLAYERS: 15,
  DEFAULT_ROUNDS: 3,
  // round 1: fades from 50 s (10..5); round 2: from 45 s (15..10); round 3: like round 1 + 120 BPM beat
  ROUND_RULES: [
    { hide: 50, beat: true },
    { hide: 45, beat: true },
    { hide: 45, beat: false }
  ],
  rule(n) {
    return CAKE.ROUND_RULES[Math.min(n - 1, CAKE.ROUND_RULES.length - 1)];
  }
};

let db = null, uid = null, offset = 0, initDone = false;

function cakeConfigOk() {
  const c = window.FIREBASE_CONFIG;
  return c && c.apiKey && !String(c.apiKey).startsWith("YOUR_");
}

function initCake(onReady) {
  if (!cakeConfigOk()) {
    document.body.innerHTML = '<div class="msg">請先喺 cake/config.js 填入 Firebase 設定</div>';
    return;
  }
  firebase.initializeApp(window.FIREBASE_CONFIG);
  db = firebase.database();
  // offset between this device's clock and Firebase server time
  db.ref(".info/serverTimeOffset").on("value", s => { offset = s.val() || 0; });
  firebase.auth().onAuthStateChanged(u => {
    if (u) {
      uid = u.uid;
      if (!initDone) { initDone = true; onReady(); }
    } else {
      firebase.auth().signInAnonymously().catch(e => alert("登入失敗：" + e.message));
    }
  });
}

function serverNow() { return Date.now() + offset; }
function roomRef(code) { return db.ref("rooms/" + code); }

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// milliseconds -> "+0.38 秒" / "-10.00 秒"
function fmt(ms) {
  return (ms >= 0 ? "+" : "") + (ms / 1000).toFixed(2) + " 秒";
}

// number of round wins per player
function computeScores(room) {
  const s = {};
  Object.values(room.results || {}).forEach(r => {
    if (r && r.winner) s[r.winner] = (s[r.winner] || 0) + 1;
  });
  return s;
}

// small inline avatar picture for a stored avatar code
function avHtml(code) { return '<span class="av">' + avatarSvg(code) + "</span>"; }
const CROWN = '<img class="crown" alt="" src="img/crown.png">';
const CAKE_IMG = (n) => "img/cake-" + Math.min(Math.max(n, 1), 3) + ".png";
