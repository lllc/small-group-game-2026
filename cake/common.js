// Shared settings and Firebase helpers for 搶蛋糕
const CAKE = {
  LEAD_MS: 3000,        // countdown before the round clock starts
  ROUND_MS: 60000,      // one full clock turn; 0 (60 s) is the grab moment
  SHOW_FROM: 40,        // clock appears at 40 s
  MAX_PLAYERS: 15,
  DEFAULT_ROUNDS: 3,
  // round 1: clock hides at 50 s; round 2: 45 s; round 3: 45 s + 120 BPM beat
  ROUND_RULES: [
    { hide: 50, beat: false },
    { hide: 45, beat: false },
    { hide: 45, beat: true }
  ],
  AVATARS: ["🍰", "🐶", "🐱", "🐼", "🦊", "🐸", "🐵", "🦁", "🐯", "🐻", "🐰", "🐨", "🐙", "🦄", "🐳"],
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
