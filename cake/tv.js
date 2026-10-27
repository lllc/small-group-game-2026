// Host screen (TV): creates the room, runs the clock, grabs and scoring
const $ = (id) => document.getElementById(id);

let code = null;
let room = null;
let audioCtx = null;
let beatN = -1, beatK = 0;

function buildTicks() {
  let s = "";
  for (let i = 0; i < 60; i++) {
    const a = (i * 6 * Math.PI) / 180;
    const big = i % 5 === 0;
    const r1 = big ? 78 : 84;
    s += `<line x1="${100 + r1 * Math.sin(a)}" y1="${100 - r1 * Math.cos(a)}" x2="${100 + 88 * Math.sin(a)}" y2="${100 - 88 * Math.cos(a)}" class="${big ? "tick big" : "tick"}"/>`;
  }
  [[0, "0"], [15, "15"], [30, "30"], [45, "45"]].forEach(([k, label]) => {
    const a = (k * 6 * Math.PI) / 180;
    s += `<text x="${100 + 64 * Math.sin(a)}" y="${100 - 64 * Math.cos(a) + 6}" class="lbl">${label}</text>`;
  });
  $("ticks").innerHTML = s;
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

// 120 BPM beat, lined up so the last beat lands exactly on 0 (60 s)
function scheduleBeats() {
  const cur = room.current;
  if (!cur.beat || !audioCtx) return;
  if (beatN !== cur.n) { beatN = cur.n; beatK = 0; }
  const now = serverNow();
  while (beatK <= 40) {
    const t = cur.startAt + 40000 + beatK * 500;
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

// decide the result of the round: early press, or everyone pressed, or 3 s after grab
function maybeFinalize() {
  const cur = room.current;
  const grab = cur.startAt + CAKE.ROUND_MS;
  if (cur.early) { finalize(cur.n, { early: cur.early, ranking: [] }); return; }

  const players = room.players || {};
  const pr = (room.presses && room.presses[cur.n]) || {};
  const ranking = Object.entries(pr)
    .filter(([u, t]) => t >= grab && players[u])
    .map(([u, t]) => ({ uid: u, name: players[u].name, avatar: players[u].avatar, diff: t - grab }))
    .sort((a, b) => a.diff - b.diff);

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
}

// clock drawing: fade in from 40 s, fade out after the hide time
function frame() {
  requestAnimationFrame(frame);
  if (!room || room.status !== "round" || !room.current) return;
  const cur = room.current;
  const e = (serverNow() - cur.startAt) / 1000;
  const clock = $("clock");

  if (e < 0) {
    $("prep").textContent = Math.ceil(-e);
    clock.style.opacity = 0;
    $("status").textContent = "";
    return;
  }
  $("prep").textContent = "";
  $("hand").setAttribute("transform", `rotate(${(e / 60) * 360} 100 100)`);
  const alpha = Math.max(0, Math.min((e - CAKE.SHOW_FROM) / 0.5, 1 - (e - cur.hide) / 1.5, 1));
  clock.style.opacity = alpha.toFixed(3);

  let text = "";
  if (e >= 60) text = "搶！";
  else if (e >= cur.hide) text = "憑感覺…";
  $("status").textContent = text;
}

function render() {
  if (!room) return;
  const status = room.status || "lobby";
  const cur = room.current;
  const rounds = room.rounds || CAKE.DEFAULT_ROUNDS;
  const players = Object.entries(room.players || {});

  $("roundInfo").textContent = cur ? `第 ${cur.n} 局 / 共 ${rounds} 局` : `共 ${rounds} 局`;
  $("lobby").classList.toggle("hidden", status !== "lobby");
  $("stage").classList.toggle("hidden", status !== "round");
  $("result").classList.toggle("hidden", status !== "result");
  $("final").classList.toggle("hidden", status !== "finished");

  if (status === "lobby") renderLobby(players);
  if (status === "round" && cur) {
    const pressed = room.presses && room.presses[cur.n] ? Object.keys(room.presses[cur.n]).length : 0;
    $("pressed").textContent = e60(cur) ? `已撳 ${pressed} / ${players.length}` : "";
  }
  if (status === "result" && cur) renderResult(players, cur, rounds);
  if (status === "finished") renderFinal(players);
}

function e60(cur) {
  return serverNow() >= cur.startAt + CAKE.ROUND_MS - 1000;
}

function renderLobby(players) {
  $("playerCount").textContent = `${players.length} / ${CAKE.MAX_PLAYERS}`;
  $("players").innerHTML = players.map(([u, p]) =>
    `<div class="pl ${p.ready ? "ready" : ""}"><span class="av">${esc(p.avatar)}</span><span>${esc(p.name)}</span><span class="rd">${p.ready ? "✓ 準備好" : "未準備"}</span></div>`
  ).join("") || '<p class="hint">等待玩家加入…</p>';
  const allReady = players.length > 0 && players.every(([u, p]) => p.ready);
  $("startBtn").disabled = !allReady;
  $("startHint").textContent = players.length === 0 ? "等待玩家加入" : allReady ? "" : "等待全部玩家準備好";
}

function renderResult(players, cur, rounds) {
  const res = room.results && room.results[cur.n];
  const grab = cur.startAt + CAKE.ROUND_MS;
  $("nextBtn").textContent = cur.n >= rounds ? "看總結果" : "下一局";
  if (!res) {
    $("resultTitle").textContent = "計算中…";
    $("ranking").innerHTML = "";
    return;
  }
  if (res.early) {
    $("resultTitle").textContent = `${res.early.name} 早撳咗！${fmt(res.early.t - grab)}，本局唔計分`;
    $("ranking").innerHTML = "";
    return;
  }
  const r = res.ranking || [];
  $("resultTitle").textContent = r.length ? `🏆 ${r[0].name} 最準！${fmt(r[0].diff)}` : "本局冇人撳";
  const got = new Set(r.map(x => x.uid));
  const rows = r.map((x, i) => `<li><span>${i + 1}</span><span class="av">${esc(x.avatar)}</span><span>${esc(x.name)}</span><b>${fmt(x.diff)}</b></li>`);
  players.filter(([u]) => !got.has(u)).forEach(([u, p]) => rows.push(`<li class="miss"><span>－</span><span class="av">${esc(p.avatar)}</span><span>${esc(p.name)}</span><b>未撳</b></li>`));
  $("ranking").innerHTML = rows.join("");
}

function renderFinal(players) {
  const scores = computeScores(room);
  const rows = players
    .map(([u, p]) => ({ p, s: scores[u] || 0 }))
    .sort((a, b) => b.s - a.s);
  $("board").innerHTML = rows.map((x, i) =>
    `<li><span>${i + 1}</span><span class="av">${esc(x.p.avatar)}</span><span>${esc(x.p.name)}</span><b>${x.s} 分</b></li>`
  ).join("");
}

function joinTv() {
  history.replaceState(null, "", "?room=" + code);
  $("roomCode").textContent = code;
  const url = new URL("play.html", location.href);
  url.search = "?room=" + code;
  $("joinUrl").textContent = url.href;
  new QRCode($("qr"), { text: url.href, width: 220, height: 220 });
  buildTicks();

  roomRef(code).on("value", s => { room = s.val(); render(); });
  setInterval(tick, 100);
  requestAnimationFrame(frame);

  $("startBtn").onclick = startGame;
  $("nextBtn").onclick = nextRound;
}

initCake(() => {
  const p = new URLSearchParams(location.search).get("room");
  if (p) { code = p; joinTv(); }
  else createRoom().then(c => { code = c; joinTv(); });
});
