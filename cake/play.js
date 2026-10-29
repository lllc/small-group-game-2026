// Player phone: join, ready, and grab the cake
const $ = (id) => document.getElementById(id);

let code = null;
let room = null;
let me = null;
let selAnimal = Math.floor(Math.random() * ANIMALS.length),
  selColor = DEFAULT_COLOR;
let pressedFor = -1;

function msg(text) {
  $("msg").textContent = text;
  $("msg").classList.remove("hidden");
}

function buildAvatars() {
  const code = () => selAnimal + "-" + selColor;
  $("avatarPick").innerHTML =
    `<div class="big-av av">${avatarSvg(code())}</div>` +
    `<div class="swatches">${PALETTE.map((c, i) => `<button type="button" class="${i === selColor ? "sel" : ""}" data-c="${i}" aria-label="背景色 ${i + 1}" style="background:${c}"></button>`).join("")}</div>` +
    `<div class="animals">${ANIMALS.map((x, i) => `<button type="button" class="${i === selAnimal ? "sel" : ""}" data-a="${i}" aria-label="動物 ${i + 1}">${avatarSvg(i + "-" + selColor)}</button>`).join("")}</div>`;
  $("avatarPick")
    .querySelectorAll("button")
    .forEach((b) => {
      b.onclick = () => {
        if (b.dataset.c !== undefined) selColor = +b.dataset.c;
        else selAnimal = +b.dataset.a;
        buildAvatars();
      };
    });
}

function join() {
  const name = $("name").value.trim().slice(0, 8);
  if (!name) {
    alert("請寫你個名");
    return;
  }
  roomRef(code)
    .child("players")
    .transaction((p) => {
      p = p || {};
      if (!p[uid] && Object.keys(p).length >= CAKE.MAX_PLAYERS) return; // full, abort
      p[uid] = { name, avatar: selAnimal + "-" + selColor, ready: false };
      return p;
    })
    .then((res) => {
      if (!res.committed) alert("房間人數已滿，或者未能加入");
    });
}

function toggleReady() {
  roomRef(code)
    .child("players/" + uid + "/ready")
    .set(!me.ready);
}

// phone press: the time is recorded as is; early (negative) and late (positive) both count
function press() {
  const cur = room && room.current;
  if (!cur || room.status !== "round" || !me) return;
  if (pressedFor === cur.n) return;
  pressedFor = cur.n;
  render();

  roomRef(code)
    .child("presses/" + cur.n + "/" + uid)
    .set(serverNow());
}

function myResultText(res, cur) {
  if (!res) return "計算中…";
  const list = res.ranking || [];
  const idx = list.findIndex((x) => x.uid === uid);
  if (idx < 0) return "你今局未撳";
  return `第 ${idx + 1} 名　${fmt(list[idx].diff)}${idx === 0 ? "　" + CROWN + "+1 分" : ""}`;
}

function render() {
  if (!room) return;
  me = (room.players && room.players[uid]) || null;
  const status = room.status || "lobby";
  const cur = room.current;
  const rounds = room.rounds || CAKE.DEFAULT_ROUNDS;

  if (!me) {
    $("joinPanel").classList.toggle("hidden", status !== "lobby");
    $("lobbyPanel").classList.add("hidden");
    $("gamePanel").classList.add("hidden");
    if (status !== "lobby") msg("遊戲已經開始，請等下一場");
    return;
  }
  $("msg").classList.add("hidden");
  $("joinPanel").classList.add("hidden");

  if (status === "lobby") {
    pressedFor = -1; // a new game starts at round 1 again
    $("lobbyPanel").classList.remove("hidden");
    $("gamePanel").classList.add("hidden");
    $("myAvatar").innerHTML = avatarSvg(me.avatar);
    $("myName").textContent = me.name;
    $("readyBtn").textContent = me.ready ? "取消準備" : "我準備好";
    $("readyBtn").classList.toggle("on", !!me.ready);
    const players = Object.values(room.players || {});
    $("lobbyInfo").textContent =
      `已有 ${players.length} 人，${players.filter((p) => p.ready).length} 人準備好`;
    return;
  }

  $("lobbyPanel").classList.add("hidden");
  $("gamePanel").classList.remove("hidden");

  if (status === "round" && cur) {
    const done = pressedFor === cur.n;
    $("gameInfo").textContent = `第 ${cur.n} 局 / 共 ${rounds} 局`;
    $("pressBtn").disabled = done;
    $("pressBtn").textContent = done ? "已撳 ✓" : "搶！";
    $("pressHint").textContent = done ? "等待結果…" : "愈接近 0 秒愈好";
    $("myResult").textContent = "";
  } else if (status === "result" && cur) {
    const res = room.results && room.results[cur.n];
    $("gameInfo").textContent = `第 ${cur.n} 局結果`;
    $("pressBtn").disabled = true;
    $("pressBtn").textContent = "本局完結";
    $("pressHint").textContent =
      cur.n >= rounds ? "稍後睇總結果" : "等待下一局";
    $("myResult").innerHTML = myResultText(res, cur);
  } else if (status === "finished") {
    const scores = computeScores(room);
    const all = Object.entries(room.players || {})
      .map(([u]) => ({ u, s: scores[u] || 0 }))
      .sort((a, b) => b.s - a.s);
    const rank = all.findIndex((x) => x.u === uid) + 1;
    $("gameInfo").textContent = "總結果";
    $("pressBtn").disabled = true;
    $("pressBtn").textContent = "遊戲完結";
    $("pressHint").textContent = "等主持再開一場，唔使重新掃 QR";
    $("myResult").textContent = `你得 ${scores[uid] || 0} 分，排第 ${rank} 名`;
  }
}

function start() {
  code = new URLSearchParams(location.search).get("room");
  if (!code) {
    msg("請掃描 TV 上面嘅 QR code");
    return;
  }
  buildAvatars();
  $("joinBtn").onclick = join;
  $("readyBtn").onclick = toggleReady;
  $("pressBtn").onclick = press;
  roomRef(code).on("value", (s) => {
    room = s.val();
    if (!room) {
      msg("搵唔到呢個房間");
      return;
    }
    render();
  });
}

initCake(start);
