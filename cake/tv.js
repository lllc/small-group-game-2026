// Host screen (TV): creates the room, runs the clock, grabs and scoring
const $ = (id) => document.getElementById(id);

let code = null;
let room = null;
let audioCtx = null;
let beatN = -1, beatK = 0;

function buildTicks() {
  let s = "";
  for (let i = 0; i < 12; i++) {
    const a = (i * 30 * Math.PI) / 180, top = i === 0;
    s += `<circle cx="${100 + 78 * Math.sin(a)}" cy="${100 - 78 * Math.cos(a)}" r="${top ? 6 : 4}" class="${top ? "dot goal" : "dot"}"/>`;
  }
  $("ticks").innerHTML = s;
}

// ---- table scene: players sit round a table, the cake is in the middle ----
function seatPos(i, n) {
  const a = ((-90 + (360 * i) / n) * Math.PI) / 180;
  return { x: 50 + 40 * Math.cos(a), y: 50 + 40 * Math.sin(a) };
}

function buildScene(root, list) {
  const n = list.length, av = n <= 6 ? 15 : n <= 10 ? 13 : 11;
  root.style.setProperty("--av", "calc(var(--u) * " + av + ")");
  root._idx = {};
  root._pos = list.map((p, i) => { root._idx[p.uid] = i; return seatPos(i, n); });
  root.innerHTML = '<div class="tbl"></div><div class="cake"><img alt="" src=""></div>' +
    list.map((p, i) => {
      const s = root._pos[i];
      return `<div class="seat" data-uid="${esc(p.uid)}" style="left:${s.x}%;top:${s.y}%"><div class="av">${avatarSvg(p.avatar)}<i class="tag"></i></div><div class="nm">${esc(p.name)}</div></div>`;
    }).join("");
}

// m: { pressed:Set, winner:uid|null, dim:bool, cake:round number }
function renderTable(root, list, m) {
  const key = list.map((p) => p.uid + "|" + p.name + "|" + p.avatar).join(",");
  if (root._key !== key) { buildScene(root, list); root._key = key; }
  root.querySelectorAll(".seat").forEach((s) => {
    const u = s.dataset.uid;
    s.classList.toggle("pressed", m.pressed.has(u) && m.winner !== u);
    s.classList.toggle("winner", m.winner === u);
    s.classList.toggle("dim", !!m.dim && !m.pressed.has(u));
  });
  const cake = root.querySelector(".cake");
  const img = cake.querySelector("img"), src = CAKE_IMG(m.cake);
  if (img.getAttribute("src") !== src) img.setAttribute("src", src);
  if (m.winner && root._idx[m.winner] !== undefined) {
    const p = root._pos[root._idx[m.winner]];
    cake.style.left = 50 + (p.x - 50) * 0.62 + "%";
    cake.style.top = 50 + (p.y - 50) * 0.62 + "%";
  } else { cake.style.left = "50%"; cake.style.top = "50%"; }
}

function playerList() {
  return Object.entries(room.players || {}).map(([u, p]) => ({ uid: u, name: p.name, avatar: p.avatar }));
}

// press marks stay hidden until the grab moment, so nobody can tell when the others pressed
function renderStageTable() {
  const cur = room.current;
  const pr = (room.presses && room.presses[cur.n]) || {};
  const list = playerList();
  const shown = e60(cur) ? new Set(Object.keys(pr)) : new Set();
  renderTable($("scene"), list, { pressed: shown, winner: null, cake: cur.n });
  $("pressed").textContent = e60(cur) ? `已撳 ${shown.size} / ${list.length}` : "";
}

function unlockAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function beep(when) {
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.frequency.value = 1000;
  g.gain.setValueAtTime(0.3, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.06);
  o.connect(g).connect(audioCtx.destination);
  o.start(when);
  o.stop(when + 0.07);
}

// 120 BPM beat from the start of the round, last beat lands exactly on 0 (60 s)
function scheduleBeats() {
  const cur = room.current;
  if (!cur.beat || !audioCtx) return;
  if (beatN !== cur.n) { beatN = cur.n; beatK = 0; }
  const now = serverNow();
  while (beatK <= CAKE.ROUND_MS / 500) {
    const t = cur.startAt + beatK * 500;
    if (t > now + 200) break;
    if (t >= now - 100) beep(audioCtx.currentTime + Math.max(0, (t - now) / 1000));
    beatK++;
  }
}

function makeRound(n) {
  const rule = CAKE.rule(n);
  return { n, startAt: serverNow() + CAKE.LEAD_MS, hide: rule.hide, beat: rule.beat };
}

async function createRoom() {
  for (;;) {
    const c = String(1000 + Math.floor(Math.random() * 9000));
    const snap = await roomRef(c).once("value");
    if (!snap.exists()) {
      await roomRef(c).set({ status: "lobby", rounds: CAKE.DEFAULT_ROUNDS });
      return c;
    }
  }
}

function startGame() {
  unlockAudio();
  roomRef(code).update({ status: "round", current: makeRound(1) });
}

function nextRound() {
  unlockAudio();
  const cur = room.current;
  if (cur.n >= (room.rounds || CAKE.DEFAULT_ROUNDS)) {
    roomRef(code).child("status").set("finished");
  } else {
    roomRef(code).update({ status: "round", current: makeRound(cur.n + 1) });
  }
}

// decide the result of the round: everyone pressed, or 3 s after the grab moment.
// Early presses count too (negative diff); the winner is closest to 0 by absolute value.
function maybeFinalize() {
  const cur = room.current;
  const grab = cur.startAt + CAKE.ROUND_MS;

  const players = room.players || {};
  const pr = (room.presses && room.presses[cur.n]) || {};
  const ranking = Object.entries(pr)
    .filter(([u]) => players[u])
    .map(([u, t]) => ({ uid: u, name: players[u].name, avatar: players[u].avatar, diff: t - grab }))
    .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff) || a.diff - b.diff);

  const allIn = Object.keys(players).length > 0 && ranking.length >= Object.keys(players).length;
  if (allIn || serverNow() >= grab + 3000) finalize(cur.n, { ranking });
}

function finalize(n, data) {
  const statusRef = roomRef(code).child("status");
  statusRef.transaction(s => (s === "round" ? "result" : undefined)).then(res => {
    if (res.committed) {
      const winner = data.ranking && data.ranking[0] ? data.ranking[0].uid : null;
      roomRef(code).child("results/" + n).set({ ...data, winner });
    }
  });
}

function tick() {
  if (!room || room.status !== "round" || !room.current) return;
  scheduleBeats();
  maybeFinalize();
  renderStageTable();
}

// clock drawing: visible from the start, second hand runs 40 -> 60,
// fades out over FADE_S seconds starting at cur.hide, with a countdown number
function frame() {
  requestAnimationFrame(frame);
  if (!room || room.status !== "round" || !room.current) return;
  const cur = room.current;
  const e = (serverNow() - cur.startAt) / 1000;
  const clock = $("clock");
  const c = CAKE.CLOCK_START + Math.max(0, e);   // clock reading in seconds

  clock.style.opacity = 1;
  $("hand").setAttribute("transform", `rotate(${(c / 60) * 360} 100 100)`);

  if (e >= 0) {
    clock.style.opacity = Math.max(0, Math.min(1, 1 - (c - cur.hide) / CAKE.FADE_S)).toFixed(3);
  }

  // countdown number: 60 - hide down to (60 - hide) - (steps - 1), then blank
  let count = e < 0 ? Math.ceil(-e) : "";
  $("count").classList.toggle("prep", e < 0);
  const sec = Math.floor(c);
  if (e >= 0 && c < 60 && sec >= cur.hide && sec < cur.hide + CAKE.COUNT_STEPS) count = 60 - sec;
  $("count").textContent = count;

  let text = "";
  if (e < 0) text = "準備…";
  else if (c >= 60) text = "搶！";
  else if (sec >= cur.hide + CAKE.COUNT_STEPS) text = "憑感覺…";
  $("status").textContent = text;
}

function render() {
  if (!room) return;
  const status = room.status || "lobby";
  const cur = room.current;
  const rounds = room.rounds || CAKE.DEFAULT_ROUNDS;
  const players = Object.entries(room.players || {});

  $("roundInfo").innerHTML = cur ? `<img class="rimg" alt="" src="${CAKE_IMG(cur.n)}">第 ${cur.n} 局 / 共 ${rounds} 局` : `共 ${rounds} 局`;
  $("lobby").classList.toggle("hidden", status !== "lobby");
  $("stage").classList.toggle("hidden", status !== "round");
  $("result").classList.toggle("hidden", status !== "result");
  $("final").classList.toggle("hidden", status !== "finished");

  if (status === "lobby") renderLobby(players);
  if (status === "round" && cur) renderStageTable();
  if (status === "result" && cur) renderResult(players, cur, rounds);
  if (status === "finished") renderFinal(players);
}

function e60(cur) {
  return serverNow() >= cur.startAt + CAKE.ROUND_MS;
}

function renderLobby(players) {
  $("playerCount").textContent = `${players.length} / ${CAKE.MAX_PLAYERS}`;
  $("players").innerHTML = players.map(([u, p]) =>
    `<div class="pl ${p.ready ? "ready" : ""}">${avHtml(p.avatar)}<span>${esc(p.name)}</span><span class="rd">${p.ready ? "✓ 準備好" : "未準備"}</span></div>`
  ).join("") || '<p class="hint">等待玩家加入…</p>';
  const allReady = players.length > 0 && players.every(([u, p]) => p.ready);
  $("startBtn").disabled = !allReady;
  $("startHint").textContent = players.length === 0 ? "等待玩家加入" : allReady ? "" : "等待全部玩家準備好";
}

function renderResult(players, cur, rounds) {
  const res = room.results && room.results[cur.n];
  $("nextBtn").textContent = cur.n >= rounds ? "看總結果" : "下一局";
  const list = playerList();
  if (!res) {
    $("resultTitle").textContent = "計算中…";
    $("ranking").innerHTML = "";
    renderTable($("scene2"), list, { pressed: new Set(), winner: null, cake: cur.n });
    return;
  }
  const r = res.ranking || [];
  $("resultTitle").innerHTML = r.length ? `${CROWN}${esc(r[0].name)} 最準！${fmt(r[0].diff)}` : "本局冇人撳";
  const got = new Set(r.map(x => x.uid));
  const rows = r.map((x, i) => `<li><span>${i + 1}</span>${avHtml(x.avatar)}<span>${esc(x.name)}</span><b>${fmt(x.diff)}</b></li>`);
  players.filter(([u]) => !got.has(u)).forEach(([u, p]) => rows.push(`<li class="miss"><span>－</span>${avHtml(p.avatar)}<span>${esc(p.name)}</span><b>未撳</b></li>`));
  $("ranking").classList.toggle("dense", rows.length > 9);
  $("ranking").innerHTML = rows.join("");
  renderTable($("scene2"), list, { pressed: got, winner: r.length ? r[0].uid : null, dim: true, cake: cur.n });
}

function renderFinal(players) {
  const scores = computeScores(room);
  const rows = players
    .map(([u, p]) => ({ p, s: scores[u] || 0 }))
    .sort((a, b) => b.s - a.s);
  $("board").innerHTML = rows.map((x, i) =>
    `<li><span>${i + 1}</span>${avHtml(x.p.avatar)}<span>${esc(x.p.name)}</span><b>${x.s} 分</b></li>`
  ).join("");
}

function joinTv() {
  history.replaceState(null, "", "?room=" + code);
  $("roomCode").textContent = code;
  const url = new URL("play.html", location.href);
  url.search = "?room=" + code;
  $("joinUrl").textContent = url.href;
  new QRCode($("qr"), { text: url.href, width: 640, height: 640 });
  buildTicks();

  roomRef(code).on("value", s => { room = s.val(); render(); });
  setInterval(tick, 100);
  requestAnimationFrame(frame);

  $("startBtn").onclick = startGame;
  $("nextBtn").onclick = nextRound;
  $("againBtn").onclick = playAgain;
}

// same room, same players: wipe the finished game and go back to the lobby
function playAgain() {
  const players = {};
  Object.entries(room.players || {}).forEach(([u, p]) => {
    players[u] = { ...p, ready: false };
  });
  beatN = -1; beatK = 0;
  roomRef(code).set({ status: "lobby", rounds: room.rounds || CAKE.DEFAULT_ROUNDS, players });
}

initCake(() => {
  const p = new URLSearchParams(location.search).get("room");
  if (p) { code = p; joinTv(); }
  else createRoom().then(c => { code = c; joinTv(); });
});
