/* Cruz public site: profile, arcade, leaderboard and Study. Talks to /api/board, /api/score, /api/music and /api/study. */
(() => {
"use strict";
if (window.__cruzSite) return;
window.__cruzSite = true;

/* ---------- small helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,15}$/;
const today = () => new Date().toLocaleDateString("en-CA");
let colors = {};
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ["bg", "surface", "surface-2", "fg", "muted", "accent", "good", "bad", "gold"]) colors[k] = cs.getPropertyValue("--" + k).trim();
}
readColors();

const ICON = {
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>',
  on: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  off: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 6 6M22 9l-6 6"/></svg>',
  flame: '<svg viewBox="0 0 24 24"><path d="M12 2c1 3.5-1.5 5-1.5 7.5 0 1.4 1 2.5 2.3 2.5 1.5 0 2.4-1.2 2.2-3 2.3 1.8 4 4.4 4 7.2A7 7 0 0 1 12 23a7 7 0 0 1-7-6.8c0-5 5-7.6 7-14.2Z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};

/* ---------- theme ---------- */
const themeBtn = $("#themeBtn");
function effectiveDark() {
  const t = document.documentElement.getAttribute("data-theme");
  if (t) return t === "dark";
  return matchMedia("(prefers-color-scheme: dark)").matches;
}
function paintThemeBtn() { themeBtn.innerHTML = effectiveDark() ? ICON.sun : ICON.moon; }
function applyTheme(t) {
  const r = document.documentElement;
  r.setAttribute("data-theme", t); r.classList.remove("light", "dark"); r.classList.add(t); r.style.colorScheme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#12110f" : "#f3eee6");
}
let savedTheme = null; try { savedTheme = localStorage.getItem("theme"); } catch {}
if (savedTheme === "dark" || savedTheme === "light") applyTheme(savedTheme);
themeBtn.addEventListener("click", () => {
  const next = effectiveDark() ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem("theme", next); } catch {}
  paintThemeBtn(); readColors(); sfx.click();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { paintThemeBtn(); readColors(); });
paintThemeBtn();

/* ---------- sound ---------- */
const sfx = (() => {
  let ctx = null, muted = store.get("cruz.muted", false);
  const btn = $("#muteBtn");
  function paint() { btn.innerHTML = muted ? ICON.off : ICON.on; btn.setAttribute("aria-pressed", String(muted)); btn.setAttribute("aria-label", muted ? "Turn sound on" : "Mute sound"); }
  function ac() {
    if (muted) return null;
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    } catch { return null; }
  }
  function tone(freq, dur, { type = "square", vol = 0.06, to = null, delay = 0 } = {}) {
    const a = ac(); if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.05, delay = 0) {
    const a = ac(); if (!a) return;
    const t = a.currentTime + delay;
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 1200; s.buffer = buf; g.gain.value = vol;
    s.connect(f).connect(g).connect(a.destination); s.start(t);
  }
  btn.addEventListener("click", () => { muted = !muted; store.set("cruz.muted", muted); paint(); if (!muted) api.click(); });
  paint();
  const api = {
    click() { tone(660, 0.05, { type: "triangle", vol: 0.04 }); },
    jump() { tone(360, 0.14, { to: 720, vol: 0.05 }); },
    land() { noise(0.06, 0.04); },
    point() { tone(880, 0.07, { vol: 0.04 }); tone(1320, 0.1, { vol: 0.04, delay: 0.07 }); },
    eat() { tone(520, 0.06, { type: "triangle", vol: 0.07, to: 900 }); },
    die() { tone(330, 0.32, { type: "sawtooth", to: 70, vol: 0.06 }); noise(0.25, 0.06); },
    best() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, { type: "triangle", vol: 0.07, delay: i * 0.09 })); },
    right() { tone(660, 0.08, { type: "triangle", vol: 0.06 }); tone(990, 0.12, { type: "triangle", vol: 0.06, delay: 0.08 }); },
    wrong() { tone(220, 0.18, { type: "square", vol: 0.04, to: 160 }); },
    flip() { noise(0.05, 0.03); tone(500, 0.05, { type: "sine", vol: 0.03 }); },
    combo(n) { tone(600 + n * 60, 0.09, { type: "triangle", vol: 0.06 }); },
  };
  return api;
})();

/* ---------- fx layer: confetti + bursts ---------- */
const fx = (() => {
  const cv = $("#fx"), c = cv.getContext("2d");
  let parts = [], running = false;
  function size() { const r = devicePixelRatio || 1; cv.width = innerWidth * r; cv.height = innerHeight * r; c.setTransform(r, 0, 0, r, 0, 0); }
  addEventListener("resize", size); size();
  function loop() {
    c.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter((p) => p.life > 0);
    for (const p of parts) {
      p.vy += 520 * 0.016; p.vx *= 0.99; p.x += p.vx * 0.016; p.y += p.vy * 0.016; p.rot += p.vr * 0.016; p.life -= 0.016;
      c.save(); c.globalAlpha = clamp(p.life / 0.6, 0, 1); c.translate(p.x, p.y); c.rotate(p.rot);
      c.fillStyle = p.color; c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)) + 1); c.restore();
    }
    if (parts.length) requestAnimationFrame(loop); else { running = false; c.clearRect(0, 0, innerWidth, innerHeight); }
  }
  return {
    confetti(x, y, n = 120) {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const pal = [colors.accent, colors.gold, colors.good, colors.fg, "#e86fa3", "#4f8de0"];
      for (let i = 0; i < n; i++) {
        const a = rand(-Math.PI, 0), s = rand(240, 620);
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, w: rand(5, 9), h: rand(8, 13), rot: rand(0, 6), vr: rand(-10, 10), life: rand(1.4, 2.4), color: pal[i % pal.length] });
      }
      if (!running) { running = true; requestAnimationFrame(loop); }
    },
  };
})();

/* ---------- streak ---------- */
function bumpStreak() {
  const s = store.get("cruz.streak", { last: "", count: 0 });
  const t = today();
  if (s.last === t) return s;
  const y = new Date(); y.setDate(y.getDate() - 1);
  s.count = s.last === y.toLocaleDateString("en-CA") ? s.count + 1 : 1;
  s.last = t; store.set("cruz.streak", s); paintStreak(); return s;
}
function paintStreak() {
  const s = store.get("cruz.streak", { last: "", count: 0 });
  const y = new Date(); y.setDate(y.getDate() - 1);
  const alive = s.last === today() || s.last === y.toLocaleDateString("en-CA");
  const chip = $("#streakChip");
  if (!alive || !s.count) { chip.hidden = true; return; }
  chip.hidden = false;
  chip.innerHTML = `${ICON.flame}<span><b class="tnum">${s.count}-day</b> streak${s.last === today() ? "" : " · play today to keep it"}</span>`;
}
paintStreak();

/* ---------- server API ---------- */
const plat = { owner: false, boards: { dino: [], snake: [] }, boardReady: { dino: false, snake: false }, studyOn: true };
const boardListeners = new Set();
function onBoardsChanged() { for (const f of boardListeners) f(); }
async function api(path, body) {
  const res = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  let data = null; try { data = await res.json(); } catch {}
  if (!res.ok) throw { status: res.status, message: data?.error || "Something went wrong." };
  return data;
}
async function loadBoard(g) {
  try {
    const d = await api("/api/board?game=" + g);
    plat.boards[g] = Array.isArray(d?.rows) ? d.rows : [];
    plat.boardReady[g] = true;
  } catch { if (plat.boardReady[g] !== true) plat.boardReady[g] = "error"; }
  onBoardsChanged();
}
function refreshBoards() { return Promise.all([loadBoard("dino"), loadBoard("snake")]); }
async function initPlatform() {
  refreshBoards();
  setInterval(() => { if (document.visibilityState === "visible") { if (route === "board") loadBoard(boardGame); else if (route === "home") loadBoard(game); } }, 8000);
  try { const m = await api("/api/music"); paintTrack(m?.url || ""); } catch {}
}
/* ---------- music player (YouTube, owner sets the link in /admin) ---------- */
function ytParts(raw) {
  let u; try { u = new URL(raw); } catch { return null; }
  const host = u.hostname.replace(/^www\./, "");
  if (!["music.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"].includes(host)) return null;
  let id = host === "youtu.be" ? u.pathname.split("/").filter(Boolean)[0] || "" : /^\/(embed|shorts)\//.test(u.pathname) ? u.pathname.split("/")[2] || "" : u.searchParams.get("v") || "";
  const list = u.searchParams.get("list") || "";
  id = /^[\w-]{6,}$/.test(id) ? id : ""; const pl = /^[\w-]+$/.test(list) ? list : "";
  return id || pl ? { video: id, list: pl } : null;
}
let ytApi = null;
function loadYouTube() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  ytApi = ytApi || new Promise((ok) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev && prev(); ok(); };
    const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(s);
  });
  return ytApi;
}
function paintTrack(url) {
  const card = $("#trackCard"), parts = ytParts(url);
  if (!parts) { card.hidden = true; return; }
  card.hidden = false;
  const link = $("#trackLink"), art = $("#trackArt"), empty = $("#trackArtEmpty");
  const setArt = (src) => { if (!src) return; art.src = src; art.hidden = false; empty.hidden = true; };
  const setVideo = (id) => { if (id) { link.href = "https://music.youtube.com/watch?v=" + id; setArt("https://i.ytimg.com/vi/" + id + "/hqdefault.jpg"); } };
  link.href = url; setVideo(parts.video);
  const watch = parts.video ? "https://www.youtube.com/watch?v=" + parts.video : "https://www.youtube.com/playlist?list=" + parts.list;
  fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(watch)).then((r) => (r.ok ? r.json() : null)).then((d) => {
    if (!d) return; if (d.title) link.textContent = d.title; if (!parts.video && d.thumbnail_url) setArt(d.thumbnail_url);
  }).catch(() => {});
  let player = null, playing = false;
  const playBtn = $("#trackPlay"), prevBtn = $("#trackPrev"), nextBtn = $("#trackNext");
  const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>', ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
  loadYouTube().then(() => {
    player = new window.YT.Player($("#ytHost"), {
      width: "200", height: "112", videoId: parts.video || undefined,
      playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1, origin: location.origin, list: parts.list || undefined },
      events: {
        onReady: () => { playBtn.disabled = prevBtn.disabled = nextBtn.disabled = false; },
        onStateChange: (e) => {
          playing = e.data === window.YT.PlayerState.PLAYING;
          playBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY; playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
          card.classList.toggle("playing", playing);
          const d = e.target.getVideoData ? e.target.getVideoData() : null;
          if (d && d.title) link.textContent = d.title;
          if (d && d.video_id) setVideo(d.video_id);
        },
      },
    });
  }).catch(() => {});
  playBtn.addEventListener("click", () => { if (!player) return; playing ? player.pauseVideo() : player.playVideo(); });
  prevBtn.addEventListener("click", () => { if (!player) return; parts.list ? player.previousVideo() : player.seekTo(0, true); });
  nextBtn.addEventListener("click", () => { if (!player) return; parts.list ? player.nextVideo() : player.seekTo(0, true); });
}

/* ---------- Discord status ---------- */
const DISCORD_ID = "549099852680658952";
async function loadPresence() {
  try {
    const r = await fetch("https://discord.c99.nl/api/user/" + DISCORD_ID);
    if (!r.ok) return;
    const d = await r.json();
    if (!d || !d.status) return;
    const g = d.game || {}, name = (g.name || "").trim();
    let act = "";
    if (g.type === 4) act = (g.state || "").trim();
    else if (name) act = ({ 0: "Playing ", 1: "Streaming ", 2: "Listening to ", 3: "Watching ", 5: "Competing in " }[g.type] || "") + name;
    const label = ({ online: "Online", idle: "Idle", dnd: "Busy" }[d.status] || "Offline") + (act ? " · " + act : "");
    $("#presenceDot").className = ["online", "idle", "dnd"].includes(d.status) ? d.status : "";
    $("#presenceText").textContent = label;
    $("#presence").hidden = false;
  } catch {}
}
loadPresence();
setInterval(() => { if (document.visibilityState === "visible") loadPresence(); }, 30000);

/* ---------- scores ---------- */
const keyFor = (name) => name.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
function myName() { const n = store.get("cruz.player.name", ""); return NAME_RE.test(n) ? n : ""; }
function localBest(g) { return store.get("cruz.best." + g, 0); }
function rankFor(g, score, name) {
  const lk = keyFor(name || "");
  return plat.boards[g].filter((r) => r.id !== lk && r.score > score).length + 1;
}
async function submitScore(g, name, score) {
  if (!NAME_RE.test(name) || score < 1) return "local";
  try {
    const d = await api("/api/score", { game: g, name, score });
    loadBoard(g);
    return d?.status === "kept" ? "kept" : "saved";
  } catch (e) { return e?.status === 429 ? "wait" : "failed"; }
}

/* ======================================================
   GAMES
   ====================================================== */
const canvas = $("#game"), g2 = canvas.getContext("2d"), stage = $("#stage"), overlay = $("#overlay");
let W = 600, H = 220, DPR = 1;
let game = store.get("cruz.game", "dino") === "snake" ? "snake" : "dino";
let current = null;

function fit() {
  DPR = Math.min(2, devicePixelRatio || 1);
  W = stage.clientWidth;
  H = game === "dino" ? clamp(Math.round(W * 0.36), 190, 260) : Math.min(W, 460);
  canvas.style.height = H + "px";
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  g2.setTransform(DPR, 0, 0, DPR, 0, 0);
  current?.resize?.();
}
new ResizeObserver(() => { const w = stage.clientWidth; if (w && Math.abs(w - W) > 1) fit(); }).observe(stage);

function setScore(n) { $("#scoreNow").textContent = n; }
function paintBest() { $("#scoreBest").textContent = localBest(game); }
function toast(text) { const t = document.createElement("div"); t.className = "toast"; t.textContent = text; stage.appendChild(t); setTimeout(() => t.remove(), 1200); }

/* overlay states */
function showStart() {
  const name = myName();
  overlay.hidden = false;
  overlay.innerHTML = `
    <form class="card" id="startForm">
      <span class="kicker">${game === "dino" ? "Dinosaur run" : "Snake"}</span>
      <label class="sub" for="pname">Name on the board</label>
      <input id="pname" maxlength="16" autocomplete="nickname" value="${esc(name)}" placeholder="Your name">
      <button class="btn" type="submit">Play</button>
      <span class="sub">${game === "dino" ? "Jump the cacti, duck the birds." : "Eat, grow, don't bite yourself."}</span>
      <span class="err" id="nameErr" hidden>Use 1–16 letters or numbers.</span>
    </form>`;
  $("#startForm").addEventListener("submit", onStart);
}
function onStart(e) {
  e.preventDefault();
  const n = $("#pname").value.trim().replace(/\s+/g, " ");
  if (!NAME_RE.test(n)) { $("#nameErr").hidden = false; return; }
  store.set("cruz.player.name", n);
  overlay.hidden = true; overlay.innerHTML = "";
  sfx.click();
  current.start();
  canvas.focus?.();
}
async function showOver(score) {
  const name = myName();
  const prev = localBest(game);
  const isBest = score > prev && score > 0;
  if (isBest) { store.set("cruz.best." + game, score); paintBest(); }
  if (score > 0) bumpStreak();
  const top = plat.boards[game][0]?.score || 0;
  const rank = rankFor(game, score, name);
  const boardTop = score > 0 && score >= top && plat.boardReady[game] === true;
  overlay.hidden = false;
  overlay.innerHTML = `
    <div class="card">
      <span class="kicker">Game over</span>
      <span class="big tnum" id="ovScore">0</span>
      ${isBest ? `<span class="best-flag">${boardTop ? "Top of the board" : "New personal best"}</span>` : `<span class="sub tnum">Best ${prev}</span>`}
      <span class="sub" id="ovRank">${plat.boardReady[game] === true && score > 0 ? `That's #${rank} on the board` : ""}</span>
      <div class="btn-row">
        <button class="btn" type="button" id="againBtn">Play again</button>
        <a class="btn ghost" href="#board" style="display:inline-grid;place-items:center;text-decoration:none">Board</a>
      </div>
      <span class="sub" id="ovSave"></span>
    </div>`;
  // count-up
  const el = $("#ovScore"), t0 = performance.now(), dur = Math.min(900, 300 + score * 2);
  (function up(now) { const k = clamp((now - t0) / dur, 0, 1); el.textContent = Math.round(score * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(up); })(t0);
  $("#againBtn").addEventListener("click", () => { overlay.hidden = true; overlay.innerHTML = ""; sfx.click(); current.start(); });
  $("#againBtn").focus({ preventScroll: true });
  if (isBest) {
    setTimeout(() => { const r = stage.getBoundingClientRect(); fx.confetti(r.left + r.width / 2, r.top + r.height * 0.45, boardTop ? 200 : 120); sfx.best(); }, 250);
  }
  if (score > 0 && name) {
    const res = await submitScore(game, name, score);
    const s = $("#ovSave"); if (!s) return;
    s.textContent = { saved: "Saved to the board", kept: "Your board best stays higher", wait: "Saved a moment ago, try again shortly", failed: "Couldn't reach the board", local: "" }[res] || "";
  }
}

/* key routing */
function typing(t) { return t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable); }
addEventListener("keydown", (e) => {
  if (route !== "home" || typing(e.target)) return;
  if (current?.key(e, true)) e.preventDefault();
});
addEventListener("keyup", (e) => { if (route === "home") current?.key(e, false); });
addEventListener("blur", () => current?.release?.());

/* ---------- DINO ---------- */
function makeDino() {
  const GRAV = 2800, JUMP = 760;
  let s, raf = 0, last = 0, held = { up: false, down: false }, parts = [], clouds = [], groundOff = 0;
  function reset() {
    s = { status: "idle", y: 0, vy: 0, duck: false, score: 0, dist: 0, obs: [], spawnIn: 0.9, phase: 0, squash: 0, blink: 2, airborne: false, fullJump: false, flash: 0, nextMilestone: 100 };
    parts = []; clouds = Array.from({ length: 4 }, (_, i) => ({ x: (i + 0.3) * W / 3.2, y: rand(18, H * 0.38), s: rand(0.7, 1.2) }));
  }
  const groundY = () => H - 34;
  const speed = () => Math.min(700, 260 + s.score * 0.22);
  function jump(full) { if (s.status === "play" && s.y <= 1) { s.vy = JUMP; s.fullJump = !!full; s.airborne = true; sfx.jump(); dust(DINO_X + 18, 6, 3); } }
  const DINO_X = 46;
  function dust(x, n, sp = 1) {
    for (let i = 0; i < n; i++) parts.push({ x: x + rand(-4, 4), y: groundY() - rand(0, 3), vx: rand(-80, -20) * sp, vy: rand(-60, -10) * sp, r: rand(1.5, 3), life: rand(0.3, 0.55), max: 0.55, kind: "dust" });
  }
  function burst(x, y) {
    for (let i = 0; i < 26; i++) { const a = rand(0, Math.PI * 2), v = rand(80, 320); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, r: rand(2, 4), life: rand(0.5, 0.9), max: 0.9, kind: "chunk" }); }
  }
  function spawn() {
    const right = s.obs.reduce((m, o) => Math.max(m, o.x + o.w), 0);
    if (s.obs.length && W + 10 - right < 250) return false;
    if (s.score > 140 && Math.random() < 0.35) {
      const low = Math.random() < 0.6;
      s.obs.push({ kind: "bird", x: W + 10, w: 42, h: 24, y: low ? 30 : 76, flap: rand(0, 6) });
      return true;
    }
    const r = Math.random();
    if (r < 0.45) s.obs.push({ kind: "cactus", x: W + 10, w: 18, h: 34, y: 0, arms: [0.45, 0.6] });
    else if (r < 0.8) s.obs.push({ kind: "cactus", x: W + 10, w: 22, h: 46, y: 0, arms: [0.35, 0.55] });
    else { s.obs.push({ kind: "cactus", x: W + 10, w: 16, h: 30, y: 0, arms: [0.5, 0.65] }, { kind: "cactus", x: W + 28, w: 20, h: 40, y: 0, arms: [0.4, 0.6] }); }
    return true;
  }
  function hitbox() {
    const gy = groundY();
    if (s.duck) return { x: DINO_X + 6, y: gy - 24, w: 48, h: 22 };
    return { x: DINO_X + 12, y: gy - s.y - 46, w: 24, h: 44 };
  }
  function hits() {
    const a = hitbox(), gy = groundY();
    return s.obs.some((o) => {
      const b = o.kind === "bird" ? { x: o.x + 6, y: gy - o.y - o.h + 6, w: o.w - 12, h: o.h - 10 } : { x: o.x + 3, y: gy - o.h + 4, w: o.w - 6, h: o.h - 4 };
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    });
  }
  function update(dt) {
    if (s.status !== "play") { s.blink -= dt; if (s.blink < -0.12) s.blink = rand(2, 4); updateParts(dt); return; }
    const sp = speed();
    s.duck = held.down && s.y <= 1;
    if (!s.duck) {
      if (held.down && s.y > 1) s.vy = Math.min(s.vy, -1000);
      s.vy -= GRAV * dt;
      if (!held.up && !s.fullJump && s.vy > 300) s.vy = 300;
      if (s.vy <= 0) s.fullJump = false;
      s.y += s.vy * dt;
      if (s.y <= 0) { if (s.airborne) { s.squash = 1; dust(DINO_X + 20, 7, 1.3); sfx.land(); } s.y = 0; s.vy = 0; s.airborne = false; }
    } else { s.y = 0; s.vy = 0; }
    const before = Math.sin(s.phase);
    s.phase += sp * dt / 24;
    if (s.y <= 0 && Math.sign(Math.sin(s.phase)) !== Math.sign(before)) dust(DINO_X + 14, 1, 0.6);
    s.squash = Math.max(0, s.squash - dt * 6);
    s.blink -= dt; if (s.blink < -0.12) s.blink = rand(2, 4);
    s.dist += sp * dt; groundOff += sp * dt;
    s.score = Math.min(99999, Math.floor(s.dist / 22));
    setScore(s.score);
    if (s.score >= s.nextMilestone) { s.nextMilestone += 100; s.flash = 1; sfx.point(); }
    s.flash = Math.max(0, s.flash - dt * 1.6);
    for (const o of s.obs) { o.x -= sp * dt; if (o.kind === "bird") { o.x -= 30 * dt; o.flap += dt * 10; } }
    s.obs = s.obs.filter((o) => o.x > -80);
    for (const c of clouds) { c.x -= sp * 0.08 * dt; if (c.x < -80) { c.x = W + rand(20, 120); c.y = rand(18, H * 0.38); } }
    s.spawnIn -= dt;
    if (s.spawnIn <= 0) s.spawnIn = spawn() ? (rand(300, 470) + sp * 0.15) / sp : 0.05;
    updateParts(dt);
    if (hits()) {
      s.status = "dead"; s.duck = false; sfx.die();
      const hb = hitbox(); burst(hb.x + hb.w / 2, hb.y + hb.h / 2);
      stage.classList.remove("shake"); void stage.offsetWidth; stage.classList.add("shake");
      setTimeout(() => showOver(s.score), 520);
    }
  }
  function updateParts(dt) {
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.kind === "chunk" ? 900 : 140) * dt; p.life -= dt; }
    parts = parts.filter((p) => p.life > 0);
  }
  /* drawing */
  function rr(x, y, w, h, r) { g2.beginPath(); g2.roundRect(x, y, w, h, r); g2.fill(); }
  function hills(par, amp, base, alpha, freq) {
    const gy = groundY();
    g2.save(); g2.globalAlpha = alpha; g2.fillStyle = colors.muted;
    g2.beginPath(); g2.moveTo(0, gy);
    for (let x = 0; x <= W + 10; x += 10) {
      const wx = x + groundOff * par;
      g2.lineTo(x, gy - base - amp * (0.6 * Math.sin(wx * freq) + 0.4 * Math.sin(wx * freq * 2.3 + 1.3)));
    }
    g2.lineTo(W, gy); g2.closePath(); g2.fill(); g2.restore();
  }
  function cloud(c) {
    g2.save(); g2.globalAlpha = 0.18; g2.fillStyle = colors.muted;
    g2.beginPath();
    g2.ellipse(c.x, c.y, 22 * c.s, 8 * c.s, 0, 0, Math.PI * 2);
    g2.ellipse(c.x + 14 * c.s, c.y - 5 * c.s, 14 * c.s, 9 * c.s, 0, 0, Math.PI * 2);
    g2.ellipse(c.x - 12 * c.s, c.y - 2 * c.s, 11 * c.s, 7 * c.s, 0, 0, Math.PI * 2);
    g2.fill(); g2.restore();
  }
  function drawDino() {
    const gy = groundY(), dead = s.status === "dead";
    const sq = s.squash, sx = 1 + 0.12 * sq, sy = 1 - 0.14 * sq;
    const lift = s.airborne ? Math.min(0.25, s.vy / 3000) : 0;
    g2.save();
    g2.translate(DINO_X + 24, gy - s.y); g2.scale(sx, sy); g2.rotate(-lift * 0.5); g2.translate(-24, 0);
    g2.fillStyle = colors.fg;
    const legA = s.y > 0 || dead ? 0.25 : Math.sin(s.phase) * 0.6;
    const bob = s.y > 0 || dead ? 0 : Math.abs(Math.cos(s.phase)) * 1.5;
    if (s.duck) {
      leg(16, -10, legA, 9); leg(28, -10, -legA, 9);
      rr(2, -24 - bob, 40, 15, 7);                // body
      g2.beginPath(); g2.moveTo(4, -20 - bob); g2.lineTo(-10, -15 - bob); g2.lineTo(4, -12 - bob); g2.fill(); // tail
      rr(34, -27 - bob, 24, 14, 5);                // head
      eye(50, -23 - bob, dead);
    } else {
      leg(15, -16, legA, 15); leg(25, -16, -legA, 15);
      rr(6, -38 - bob, 26, 24, 8);                 // body
      g2.beginPath(); g2.moveTo(9, -33 - bob); g2.lineTo(-8, -22 - bob + Math.sin(s.phase * 0.5) * 2); g2.lineTo(9, -18 - bob); g2.fill(); // tail
      rr(20, -50 - bob, 12, 18, 4);                // neck
      rr(21, -56 - bob, 25, 15, 5);                // head
      rr(29, -45 - bob, 13, 5, 2);                 // jaw
      rr(30, -29 - bob, 7, 3, 1.5);                // arm
      eye(37, -51 - bob, dead);
      if (dead) { g2.fillStyle = colors.surface; rr(38, -45 - bob, 6, 3, 1); }
    }
    g2.restore();
  }
  function leg(x, y, a, len) {
    g2.save(); g2.translate(x, y); g2.rotate(a);
    rr(-3, 0, 6, len, 3); rr(-3, len - 3, 9, 4, 2); g2.restore();
  }
  function eye(x, y, dead) {
    g2.save();
    if (dead) {
      g2.strokeStyle = colors.surface; g2.lineWidth = 1.6; g2.beginPath();
      g2.moveTo(x - 2.5, y - 2.5); g2.lineTo(x + 2.5, y + 2.5); g2.moveTo(x + 2.5, y - 2.5); g2.lineTo(x - 2.5, y + 2.5); g2.stroke();
    } else if (s.blink < 0) {
      g2.fillStyle = colors.surface; g2.fillRect(x - 2.5, y - 0.5, 5, 1.4);
    } else {
      g2.fillStyle = colors.surface; g2.beginPath(); g2.arc(x, y, 2.6, 0, Math.PI * 2); g2.fill();
      g2.fillStyle = colors.fg; g2.beginPath(); g2.arc(x + 0.9, y, 1.2, 0, Math.PI * 2); g2.fill();
    }
    g2.restore();
  }
  function cactus(o) {
    const gy = groundY(), cx = o.x + o.w / 2, tw = Math.max(6, o.w * 0.36);
    g2.fillStyle = colors.fg;
    rr(cx - tw / 2, gy - o.h, tw, o.h + 2, tw / 2);
    const ah = o.h * 0.3;
    // left arm
    const ly = gy - o.h * o.arms[0];
    rr(o.x, ly - ah, tw * 0.8, ah, tw * 0.4); rr(o.x, ly - tw * 0.7, cx - o.x, tw * 0.7, tw * 0.35);
    // right arm
    const ry = gy - o.h * o.arms[1] + o.h * 0.2;
    rr(o.x + o.w - tw * 0.8, ry - ah * 1.2, tw * 0.8, ah * 1.2, tw * 0.4); rr(cx, ry - tw * 0.7, o.x + o.w - cx, tw * 0.7, tw * 0.35);
  }
  function bird(o) {
    const gy = groundY(), x = o.x, y = gy - o.y - o.h / 2, f = Math.sin(o.flap);
    g2.fillStyle = colors.fg;
    g2.beginPath(); g2.ellipse(x + 22, y + 2, 14, 6, 0, 0, Math.PI * 2); g2.fill();
    g2.beginPath(); g2.arc(x + 9, y, 5.5, 0, Math.PI * 2); g2.fill();
    g2.beginPath(); g2.moveTo(x + 4, y - 1); g2.lineTo(x - 4, y + 1.5); g2.lineTo(x + 4, y + 3); g2.fill(); // beak
    g2.beginPath(); g2.moveTo(x + 34, y); g2.lineTo(x + 44, y - 4); g2.lineTo(x + 42, y + 5); g2.fill(); // tail
    g2.beginPath(); g2.moveTo(x + 14, y); g2.quadraticCurveTo(x + 22, y - 16 * f, x + 30, y); g2.lineTo(x + 24, y + 2); g2.fill(); // wing
    g2.fillStyle = colors.surface; g2.beginPath(); g2.arc(x + 8, y - 1.5, 1.4, 0, Math.PI * 2); g2.fill();
  }
  function draw() {
    const gy = groundY();
    g2.clearRect(0, 0, W, H);
    g2.fillStyle = colors.surface; g2.fillRect(0, 0, W, H);
    clouds.forEach(cloud);
    hills(0.08, 18, 20, 0.07, 0.006);
    hills(0.22, 12, 6, 0.1, 0.012);
    // ground
    g2.fillStyle = colors.fg; g2.globalAlpha = 0.55; g2.fillRect(0, gy, W, 1.5); g2.globalAlpha = 0.35;
    const step = 37, off = groundOff % step;
    for (let x = -off; x < W; x += step) { const k = Math.floor((x + groundOff) / step); const h = (k * 9301 + 49297) % 233280 / 233280; g2.fillRect(x, gy + 6 + h * 12, 4 + h * 10, 1.5); }
    g2.globalAlpha = 1;
    for (const o of s.obs) (o.kind === "bird" ? bird : cactus)(o);
    for (const p of parts) {
      g2.globalAlpha = clamp(p.life / p.max, 0, 1) * (p.kind === "dust" ? 0.45 : 0.9);
      g2.fillStyle = p.kind === "dust" ? colors.muted : colors.fg;
      g2.beginPath(); g2.arc(p.x, p.y, p.r, 0, Math.PI * 2); g2.fill();
    }
    g2.globalAlpha = 1;
    drawDino();
    if (s.flash > 0) {
      g2.save(); g2.globalAlpha = s.flash; g2.fillStyle = colors.accent; g2.font = `600 ${18 + (1 - s.flash) * 8}px Outfit, system-ui`; g2.textAlign = "right";
      g2.fillText(String(s.nextMilestone - 100), W - 16, 32 - (1 - s.flash) * 10); g2.restore();
    }
  }
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000); last = now;
    update(dt); draw(); raf = requestAnimationFrame(frame);
  }
  return {
    mount() { reset(); last = performance.now(); raf = requestAnimationFrame(frame); setScore(0); },
    unmount() { cancelAnimationFrame(raf); },
    resize() { if (s && s.status !== "play") draw(); },
    start() { reset(); s.status = "play"; setScore(0); },
    release() { held.up = held.down = false; },
    jump, duck(v) { held.down = v; if (v && s.status === "play" && s.y > 1) s.vy = Math.min(s.vy, -1000); },
    key(e, down) {
      if (["Space", "ArrowUp", "KeyW"].includes(e.code)) { held.up = down; if (down && !e.repeat) jump(false); return s.status === "play"; }
      if (["ArrowDown", "KeyS"].includes(e.code)) { held.down = down; return s.status === "play"; }
      return false;
    },
    pointer() { jump(true); },
  };
}

/* ---------- SNAKE ---------- */
function makeSnake() {
  const N = 15, MAX = N * N - 3;
  let s, raf = 0, last = 0, parts = [], pops = [];
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  function reset() {
    const body = [[7, 7], [6, 7], [5, 7]];
    s = { status: "idle", body, prev: body.map((c) => [...c]), dir: "right", queue: [], acc: 0, step: 0.15, food: null, score: 0, pulse: 0, combo: 0, lastEat: -9, t: 0, deathT: 0 };
    placeFood(); parts = []; pops = [];
  }
  function placeFood() {
    const free = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!s.body.some((b) => b[0] === x && b[1] === y)) free.push([x, y]);
    s.food = free.length ? free[Math.floor(Math.random() * free.length)] : null; s.pulse = 0;
  }
  function turn(d) {
    const lastDir = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
    const [ax, ay] = DIRS[lastDir], [bx, by] = DIRS[d];
    if (ax === -bx && ay === -by) return;
    if (d === lastDir) return;
    if (s.queue.length < 2) s.queue.push(d);
  }
  const cell = () => Math.min(W, H) / N;
  const ox = () => (W - cell() * N) / 2;
  function center([x, y]) { const c = cell(); return [ox() + x * c + c / 2, y * c + c / 2]; }
  function tick() {
    if (s.queue.length) s.dir = s.queue.shift();
    const [dx, dy] = DIRS[s.dir], head = s.body[0], next = [head[0] + dx, head[1] + dy];
    const eating = s.food && next[0] === s.food[0] && next[1] === s.food[1];
    const bodyCheck = eating ? s.body : s.body.slice(0, -1);
    if (next[0] < 0 || next[1] < 0 || next[0] >= N || next[1] >= N || bodyCheck.some((b) => b[0] === next[0] && b[1] === next[1])) {
      die(); return;
    }
    s.prev = s.body.map((c) => [...c]);
    s.body.unshift(next);
    if (eating) {
      s.prev.push([...s.prev[s.prev.length - 1]]);
      s.score++; setScore(s.score);
      s.combo = s.t - s.lastEat < 3.2 ? s.combo + 1 : 1; s.lastEat = s.t;
      s.combo > 1 ? sfx.combo(s.combo) : sfx.eat();
      const [cx, cy] = center(next);
      for (let i = 0; i < 14; i++) { const a = rand(0, Math.PI * 2), v = rand(40, 160); parts.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rand(1.5, 3.2), life: rand(0.3, 0.6), max: 0.6, c: i % 3 ? colors.bad : colors.good }); }
      pops.push({ x: cx, y: cy, text: s.combo > 1 ? `+1 ×${s.combo}` : "+1", life: 0.8 });
      if (s.score % 10 === 0) sfx.point();
      s.step = Math.max(0.072, 0.15 - s.score * 0.0025);
      if (s.score >= MAX) { s.food = null; die(true); return; }
      placeFood();
    } else s.body.pop();
  }
  function die(won) {
    s.status = "dead"; s.deathT = 0;
    if (!won) sfx.die();
    stage.classList.remove("shake"); void stage.offsetWidth; stage.classList.add("shake");
    s.body.forEach((b, i) => { const [cx, cy] = center(b); if (i % 2 === 0) for (let k = 0; k < 3; k++) { const a = rand(0, Math.PI * 2), v = rand(40, 200); parts.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rand(2, 3.5), life: rand(0.5, 0.9), max: 0.9, c: colors.accent }); } });
    setTimeout(() => showOver(s.score), 600);
  }
  function update(dt) {
    s.t += dt; s.pulse += dt;
    if (s.status === "play") { s.acc += dt; while (s.acc >= s.step && s.status === "play") { s.acc -= s.step; tick(); } }
    else s.deathT += dt;
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; p.life -= dt; }
    parts = parts.filter((p) => p.life > 0);
    for (const p of pops) { p.y -= 30 * dt; p.life -= dt; }
    pops = pops.filter((p) => p.life > 0);
  }
  function draw() {
    const c = cell(), x0 = ox();
    g2.clearRect(0, 0, W, H);
    g2.fillStyle = colors.surface; g2.fillRect(0, 0, W, H);
    g2.fillStyle = colors.fg; g2.globalAlpha = 0.035;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if ((x + y) % 2 === 0) g2.fillRect(x0 + x * c, y * c, c, c);
    g2.globalAlpha = 1;
    // food
    if (s.food) {
      const [fx, fy] = center(s.food), k = 1 + Math.sin(s.pulse * 6) * 0.08, pop = Math.min(1, s.pulse * 5);
      g2.fillStyle = colors.bad; g2.beginPath(); g2.arc(fx, fy + c * 0.04, c * 0.32 * k * pop, 0, Math.PI * 2); g2.fill();
      g2.fillStyle = colors.good; g2.beginPath(); g2.ellipse(fx + c * 0.1, fy - c * 0.3 * pop, c * 0.12, c * 0.06, -0.6, 0, Math.PI * 2); g2.fill();
      g2.fillStyle = colors.surface; g2.globalAlpha = 0.5; g2.beginPath(); g2.arc(fx - c * 0.1, fy - c * 0.05, c * 0.07, 0, Math.PI * 2); g2.fill(); g2.globalAlpha = 1;
    }
    // body (interpolated)
    const t = s.status === "play" ? clamp(s.acc / s.step, 0, 1) : 1;
    const pts = s.body.map((b, i) => { const p = s.prev[i] || b; return center([p[0] + (b[0] - p[0]) * t, p[1] + (b[1] - p[1]) * t]); });
    const fade = s.status === "dead" ? Math.max(0, 1 - s.deathT * 1.6) : 1;
    if (fade > 0) {
      g2.save(); g2.globalAlpha = fade; g2.lineCap = "round"; g2.lineJoin = "round";
      g2.strokeStyle = colors.accent; g2.lineWidth = c * 0.72;
      g2.beginPath(); pts.forEach(([x, y], i) => (i ? g2.lineTo(x, y) : g2.moveTo(x, y))); if (pts.length === 1) g2.lineTo(pts[0][0] + 0.1, pts[0][1]); g2.stroke();
      g2.strokeStyle = colors.surface; g2.globalAlpha = fade * 0.18; g2.lineWidth = c * 0.22;
      g2.beginPath(); pts.forEach(([x, y], i) => (i ? g2.lineTo(x, y) : g2.moveTo(x, y))); g2.stroke();
      g2.globalAlpha = fade;
      const [hx, hy] = pts[0], [dx, dy] = DIRS[s.dir];
      g2.fillStyle = colors.accent; g2.beginPath(); g2.arc(hx, hy, c * 0.44, 0, Math.PI * 2); g2.fill();
      const px = -dy, py = dx;
      for (const side of [-1, 1]) {
        const ex = hx + dx * c * 0.14 + px * side * c * 0.19, ey = hy + dy * c * 0.14 + py * side * c * 0.19;
        g2.fillStyle = colors.surface; g2.beginPath(); g2.arc(ex, ey, c * 0.12, 0, Math.PI * 2); g2.fill();
        g2.fillStyle = colors.fg; g2.beginPath(); g2.arc(ex + dx * c * 0.04, ey + dy * c * 0.04, c * 0.06, 0, Math.PI * 2); g2.fill();
      }
      g2.restore();
    }
    for (const p of parts) { g2.globalAlpha = clamp(p.life / p.max, 0, 1); g2.fillStyle = p.c; g2.beginPath(); g2.arc(p.x, p.y, p.r, 0, Math.PI * 2); g2.fill(); }
    g2.globalAlpha = 1;
    for (const p of pops) { g2.globalAlpha = clamp(p.life / 0.5, 0, 1); g2.fillStyle = colors.fg; g2.font = "600 13px Outfit, system-ui"; g2.textAlign = "center"; g2.fillText(p.text, p.x, p.y - c * 0.5); }
    g2.globalAlpha = 1;
  }
  function frame(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; update(dt); draw(); raf = requestAnimationFrame(frame); }
  let touch = null;
  const tStart = (e) => { if (s.status !== "play") return; touch = [e.clientX, e.clientY]; };
  const tMove = (e) => {
    if (!touch) return;
    const dx = e.clientX - touch[0], dy = e.clientY - touch[1];
    if (Math.hypot(dx, dy) < 24) return;
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
    touch = [e.clientX, e.clientY];
  };
  const tEnd = () => { touch = null; };
  return {
    mount() { reset(); last = performance.now(); raf = requestAnimationFrame(frame); setScore(0); canvas.addEventListener("pointerdown", tStart); canvas.addEventListener("pointermove", tMove); addEventListener("pointerup", tEnd); },
    unmount() { cancelAnimationFrame(raf); canvas.removeEventListener("pointerdown", tStart); canvas.removeEventListener("pointermove", tMove); removeEventListener("pointerup", tEnd); },
    start() { reset(); s.status = "play"; setScore(0); },
    turn(d) { if (s.status === "play") turn(d); },
    key(e, down) {
      if (!down) return false;
      const map = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
      const d = map[e.code]; if (!d || s.status !== "play") return false;
      turn(d); return true;
    },
    pointer() {},
  };
}

/* game switching */
function selectGame(g) {
  current?.unmount();
  game = g; store.set("cruz.game", g);
  $$(".seg [data-game]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.game === g)));
  $("#dinoPad").hidden = g !== "dino"; $("#snakePad").hidden = g !== "snake";
  $("#keysHint").innerHTML = g === "dino" ? "<kbd>Space</kbd> or <kbd>↑</kbd> jump · hold for higher · <kbd>↓</kbd> duck" : "<kbd>Arrows</kbd> or <kbd>WASD</kbd> · swipe on phones";
  current = g === "dino" ? makeDino() : makeSnake();
  fit(); current.mount(); paintBest(); showStart(); paintBoardNote();
}
$$(".seg [data-game]").forEach((b) => b.addEventListener("click", () => { if (b.dataset.game !== game) { sfx.click(); selectGame(b.dataset.game); } }));
canvas.addEventListener("pointerdown", (e) => { if (game === "dino") { e.preventDefault(); current.pointer(); } });
const jb = $("#jumpBtn"), db = $("#duckBtn");
jb.addEventListener("pointerdown", (e) => { e.preventDefault(); current.jump?.(true); });
db.addEventListener("pointerdown", (e) => { e.preventDefault(); current.duck?.(true); });
for (const ev of ["pointerup", "pointercancel", "pointerleave"]) db.addEventListener(ev, () => current.duck?.(false));
$$("#snakePad [data-dir]").forEach((b) => b.addEventListener("pointerdown", (e) => { e.preventDefault(); current.turn?.(b.dataset.dir); }));

function paintBoardNote() {
  const n = $("#boardNote");
  const top = plat.boards[game][0];
  n.textContent = top ? `Board leader: ${top.name} · ${top.score}` : "";
}
boardListeners.add(paintBoardNote);

/* ======================================================
   BOARD VIEW
   ====================================================== */
let boardGame = game;
$$("[data-board]").forEach((b) => b.addEventListener("click", () => { boardGame = b.dataset.board; sfx.click(); renderBoard(); }));
function renderBoard() {
  $$("[data-board]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.board === boardGame)));
  const body = $("#boardBody"), rows = plat.boards[boardGame], ready = plat.boardReady[boardGame];
  const me = keyFor(myName());
  if (!rows.length && ready !== true) {
    body.innerHTML = `<div class="empty-state">${ready === "error" ? "The board couldn't load. It'll try again in a few seconds." : "Loading the board…"}</div>`;
  } else if (!rows.length) {
    body.innerHTML = `<div class="empty-state">No scores yet. Finish a run and your name lands here first.</div>`;
  } else {
    const top = rows[0].score || 1;
    const pod = [rows[1], rows[0], rows[2]].map((r, i) => {
      const cls = ["p2", "p1", "p3"][i], num = [2, 1, 3][i];
      if (!r) return `<div class="step ${cls} empty"><div class="medal">${num}</div><div class="who">Open spot</div></div>`;
      return `<div class="step ${cls}" style="animation-delay:${i * 60}ms"><div class="medal">${num}</div><div class="who">${esc(r.name)}${r.id === me ? '<span class="you-tag">You</span>' : ""}</div><div class="pts tnum">${r.score}</div></div>`;
    }).join("");
    const rest = rows.slice(3).map((r, i) => `
      <li class="${r.id === me ? "me" : ""}">
        <span class="bar" style="width:${Math.max(4, (r.score / top) * 100)}%"></span>
        <span class="rk tnum">${i + 4}</span>
        <span class="nm">${esc(r.name)}${r.id === me ? '<span class="you-tag">You</span>' : ""}</span>
        <span class="sc tnum">${r.score}</span>
        ${plat.owner ? `<button class="x" type="button" data-del="${esc(r.id)}" aria-label="Remove ${esc(r.name)}">${ICON.x}</button>` : "<span></span>"}
      </li>`).join("");
    const ownerTop = plat.owner ? `<ul class="rows" style="margin-bottom:10px">${rows.slice(0, 3).map((r, i) => `<li><span class="rk tnum">${i + 1}</span><span class="nm">${esc(r.name)}</span><span class="sc tnum">${r.score}</span><button class="x" type="button" data-del="${esc(r.id)}" aria-label="Remove ${esc(r.name)}">${ICON.x}</button></li>`).join("")}</ul>` : "";
    body.innerHTML = `<div class="podium">${pod}</div>${ownerTop}${rest ? `<ol class="rows">${rest}</ol>` : ""}`;
  }
  const name = myName();
  const mine = rows.find((r) => r.id === me);
  $("#myBest").innerHTML = name
    ? `<span>Playing as <b>${esc(name)}</b></span><span>Your best here <b class="tnum">${localBest(boardGame)}</b></span>${mine ? `<span>Board rank <b class="tnum">#${rows.indexOf(mine) + 1}</b></span>` : ""}`
    : "";
}
boardListeners.add(() => { if (route === "board") renderBoard(); });
/* ======================================================
   STUDY
   ====================================================== */
const study = (() => {
  const src = { pdfText: "", pdfName: "", pdfImages: [], pics: [] };
  let tab = "quiz", ctl = null;
  const imgLimit = 4;
  const notes = $("#notes");
  notes.value = store.get("cruz.study.notes", "");
  let saveT; notes.addEventListener("input", () => { clearTimeout(saveT); saveT = setTimeout(() => store.set("cruz.study.notes", notes.value.slice(0, 20000)), 400); });

  function setCountOptions() {
    const sel = $("#qCount");
    sel.innerHTML = tab === "cards" ? [8, 12, 20].map((n) => `<option value="${n}"${n === 12 ? " selected" : ""}>${n} cards</option>`).join("") : [5, 10, 15].map((n) => `<option value="${n}">${n} questions</option>`).join("");
    $("#genBtn").textContent = tab === "cards" ? "Make flashcards" : "Write quiz";
  }

  /* tabs */
  $$("[data-tab]").forEach((b) => b.addEventListener("click", () => openTab(b.dataset.tab)));
  function openTab(t) {
    tab = t;
    $$("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
    for (const k of ["quiz", "cards", "review"]) $("#tab-" + k).hidden = k !== t;
    $("#sourcePanel").hidden = t === "review";
    setCountOptions();
    if (t === "review") renderReview();
  }

  /* sources */
  function chips() {
    const list = [];
    if (src.pdfName) list.push({ label: src.pdfName, kill: () => { src.pdfText = ""; src.pdfName = ""; src.pdfImages = []; } });
    src.pics.forEach((f, i) => list.push({ label: f.name, kill: () => src.pics.splice(i, 1) }));
    const box = $("#srcChips"); box.innerHTML = "";
    list.forEach((c) => {
      const el = document.createElement("span"); el.className = "chip";
      el.innerHTML = `<span>${esc(c.label)}</span><button type="button" aria-label="Remove ${esc(c.label)}">${ICON.x}</button>`;
      el.querySelector("button").addEventListener("click", () => { c.kill(); chips(); });
      box.appendChild(el);
    });
  }
  function err(msg) { const e = $("#genErr"); e.hidden = !msg; e.textContent = msg || ""; }
  function loadScript(url) { return new Promise((ok, no) => { const s = document.createElement("script"); s.src = url; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); }
  async function pdfjs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js");
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    return window.pdfjsLib;
  }
  $("#pdfIn").addEventListener("change", async (e) => {
    const f = e.target.files?.[0]; e.target.value = ""; err("");
    if (!f) return;
    if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) { err("That file isn't a PDF."); return; }
    busy(true, "Reading the PDF");
    try {
      const lib = await pdfjs();
      const doc = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false }).promise;
      const lines = [];
      for (let i = 1; i <= Math.min(doc.numPages, 25); i++) {
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        const t = tc.items.map((it) => it.str || "").join(" ").replace(/\s+/g, " ").trim();
        if (t) lines.push(t);
      }
      src.pdfText = lines.join("\n").slice(0, 40000);
      src.pdfImages = [];
      if (src.pdfText.length < 300 && imgLimit) {
        for (let i = 1; i <= Math.min(doc.numPages, Math.min(3, imgLimit)); i++) {
          const page = await doc.getPage(i), base = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: Math.min(2, 1400 / base.width) });
          const cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height;
          await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
          src.pdfImages.push(shrink(cv));
        }
      }
      if (!src.pdfText && !src.pdfImages.length) { err(imgLimit ? "That PDF had nothing to read." : "That PDF looks scanned. Add photos of the pages instead."); src.pdfName = ""; }
      else src.pdfName = `${f.name} · ${doc.numPages} page${doc.numPages > 1 ? "s" : ""}`;
    } catch { err("That PDF couldn't be read."); }
    busy(false); chips();
  });
  function shrink(cv) {
    const max = 1400, k = Math.min(1, max / Math.max(cv.width, cv.height));
    let out = cv;
    if (k < 1) { out = document.createElement("canvas"); out.width = Math.round(cv.width * k); out.height = Math.round(cv.height * k); out.getContext("2d").drawImage(cv, 0, 0, out.width, out.height); }
    let q = 0.78, url = out.toDataURL("image/jpeg", q);
    while (url.length > 680000 && q > 0.35) { q -= 0.1; url = out.toDataURL("image/jpeg", q); }
    return url.length > 680000 ? null : url;
  }
  async function readPicture(file) {
    const bmp = await createImageBitmap(file);
    const cv = document.createElement("canvas"); cv.width = bmp.width; cv.height = bmp.height;
    cv.getContext("2d").drawImage(bmp, 0, 0); bmp.close?.();
    const url = shrink(cv); if (!url) throw new Error("too big");
    return url;
  }
  $("#picIn").addEventListener("change", async (e) => {
    const files = [...(e.target.files || [])].filter((f) => /^image\//.test(f.type)); e.target.value = ""; err("");
    const room = Math.max(0, imgLimit - src.pics.length);
    if (files.length > room) err(`Up to ${imgLimit} photos at a time.`);
    busy(true, "Reading photos");
    for (const f of files.slice(0, room)) {
      try { src.pics.push({ name: f.name, url: await readPicture(f) }); } catch { err(`${f.name} couldn't be read.`); }
    }
    busy(false); chips();
  });

  function material() {
    const text = [notes.value.trim(), src.pdfText].filter(Boolean).join("\n\n").slice(0, 60000);
    const images = [...src.pdfImages.filter(Boolean), ...src.pics.map((p) => p.url)].slice(0, imgLimit);
    return { text, images };
  }
  function busy(on, label = "Writing") {
    $("#genStatus").hidden = !on; $("#genText").textContent = label;
    $("#genBtn").disabled = on;
  }
  $("#stopBtn").addEventListener("click", () => ctl?.abort());
  $("#genBtn").addEventListener("click", generate);

  async function generate() {
    err("");
    const m = material(), n = Number($("#qCount").value);
    if (m.text.length < 20 && !m.images.length) { err("Add notes, a PDF or photos first."); return; }
    ctl = new AbortController();
    busy(true, tab === "cards" ? "Making flashcards" : "Writing questions");
    try {
      const res = await fetch("/api/study", {
        method: "POST", signal: ctl.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: tab === "cards" ? "cards" : "quiz", count: n, text: m.text, images: m.images }),
      });
      let out = null; try { out = await res.json(); } catch {}
      if (!res.ok) throw { message: out?.error || "Something went wrong reaching Claude. Try again." };
      if (tab === "cards") {
        const cards = (Array.isArray(out?.cards) ? out.cards : []).filter((c) => c && c.front && c.back);
        if (cards.length < 3) throw { message: "That material didn't give enough to work with. Add more notes." };
        bumpStreak(); deck.start(cards);
      } else {
        const qs = (Array.isArray(out?.questions) ? out.questions : []).filter((q) => q && q.prompt && Array.isArray(q.options) && q.options.length === 4);
        if (!qs.length) throw { message: "That material didn't give enough to work with. Add more notes." };
        quiz.start(qs.slice(0, n));
      }
    } catch (e) {
      if (e?.name !== "AbortError") err(e?.message || "Something went wrong reaching Claude. Try again.");
    } finally { busy(false); ctl = null; }
  }
  function shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function cleanQuiz(out) {
    const res = [];
    for (const q of Array.isArray(out?.questions) ? out.questions : []) {
      const prompt = String(q?.prompt ?? "").trim(), options = Array.isArray(q?.options) ? q.options.map((o) => String(o ?? "").trim()) : [], answer = Number(q?.answer);
      if (!prompt || options.length !== 4 || options.some((o) => !o) || !Number.isInteger(answer) || answer < 0 || answer > 3) continue;
      const order = shuffle([0, 1, 2, 3]);
      res.push({ prompt, options: order.map((i) => options[i]), answer: order.indexOf(answer), explanation: String(q?.explanation ?? "").trim() });
    }
    return shuffle(res);
  }

  /* ----- missed questions (this device) ----- */
  const missed = {
    all() { return store.get("cruz.study.missed", []); },
    add(q, picked) {
      const list = this.all().filter((m) => m.prompt !== q.prompt);
      list.unshift({ ...q, picked, at: Date.now() }); store.set("cruz.study.missed", list.slice(0, 100)); paintCount();
    },
    remove(prompt) { store.set("cruz.study.missed", this.all().filter((m) => m.prompt !== prompt)); paintCount(); },
    clear() { store.set("cruz.study.missed", []); paintCount(); },
  };
  function paintCount() { $("#missCount").textContent = missed.all().length; }
  paintCount();

  /* ----- quiz ----- */
  const quiz = (() => {
    let qs = [], i = 0, right = 0, streak = 0, bestStreak = 0, wrongs = [], fromReview = false;
    const root = $("#tab-quiz");
    function empty() {
      root.innerHTML = `<div class="empty-state">Your quiz appears here. Add material above and choose <b>Write quiz</b>.</div>`;
    }
    function start(list, review = false) {
      qs = list; i = 0; right = 0; streak = 0; bestStreak = 0; wrongs = []; fromReview = review;
      openTab("quiz"); render();
      root.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    function render() {
      const q = qs[i];
      root.innerHTML = `
        <div class="qhead"><span class="note tnum">${i + 1} of ${qs.length}</span><div class="progress"><i style="width:${(i / qs.length) * 100}%"></i></div><span class="combo tnum" id="combo">${streak > 1 ? ICON.flame + streak + " in a row" : ""}</span></div>
        <p class="qtext">${esc(q.prompt)}</p>
        <div class="opts" role="group" aria-label="Answers">${q.options.map((o, k) => `<button type="button" class="opt" data-k="${k}"><span class="key">${"ABCD"[k]}</span><span>${esc(o)}</span></button>`).join("")}</div>
        <div id="after"></div>`;
      $$(".opt", root).forEach((b) => b.addEventListener("click", () => answer(Number(b.dataset.k))));
    }
    function answer(k) {
      const q = qs[i], ok = k === q.answer;
      $$(".opt", root).forEach((b) => { b.disabled = true; const n = Number(b.dataset.k); if (n === q.answer) b.classList.add("right"); else if (n === k) b.classList.add("wrong"); });
      if (ok) {
        right++; streak++; bestStreak = Math.max(bestStreak, streak);
        streak > 1 ? sfx.combo(streak) : sfx.right();
        const c = $("#combo"); if (streak > 1) { c.innerHTML = ICON.flame + streak + " in a row"; c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump"); }
        if (fromReview) missed.remove(q.prompt);
        if (streak === 5) { const r = c.getBoundingClientRect(); fx.confetti(r.left + r.width / 2, r.top, 60); }
      } else {
        sfx.wrong(); streak = 0; $("#combo").innerHTML = ""; wrongs.push({ ...q, picked: k }); missed.add(q, k);
      }
      $("#after").innerHTML = `
        ${q.explanation ? `<div class="explain"><b>${ok ? "Right." : "Not quite."}</b>${esc(q.explanation)}</div>` : `<div class="explain"><b>${ok ? "Right." : "Not quite."}</b>The answer is ${esc(q.options[q.answer])}.</div>`}
        <div class="next-row"><button class="btn" type="button" id="nextQ">${i + 1 < qs.length ? "Next" : "See results"}</button></div>`;
      $("#nextQ").addEventListener("click", () => { sfx.click(); if (++i < qs.length) render(); else finish(); });
      $("#nextQ").focus({ preventScroll: true });
    }
    function finish() {
      bumpStreak();
      const pct = right / qs.length, C = 2 * Math.PI * 62;
      const prevBest = store.get("cruz.study.bestPct", 0);
      const isBest = pct > prevBest && qs.length >= 5;
      if (isBest) store.set("cruz.study.bestPct", pct);
      root.innerHTML = `
        <div class="result">
          <svg class="ring" viewBox="0 0 150 150" role="img" aria-label="${right} of ${qs.length} correct">
            <circle class="trk" cx="75" cy="75" r="62"/><circle class="val" id="ringVal" cx="75" cy="75" r="62" stroke-dasharray="${C}" stroke-dashoffset="${C}"/>
            <text x="75" y="82">${right}</text><text class="of" x="75" y="102">of ${qs.length}</text>
          </svg>
          ${pct === 1 ? `<span class="best-flag" style="font-size:.8125rem;font-weight:600;color:var(--accent-ink);background:var(--accent);padding:4px 10px;border-radius:999px">Perfect round</span>` : isBest ? `<span class="best-flag" style="font-size:.8125rem;font-weight:600;color:var(--accent-ink);background:var(--accent);padding:4px 10px;border-radius:999px">Your best score yet</span>` : ""}
          <div class="stats"><div><b class="tnum">${Math.round(pct * 100)}%</b><span>Score</span></div><div><b class="tnum">${bestStreak}</b><span>Best run</span></div><div><b class="tnum">${wrongs.length}</b><span>Missed</span></div></div>
          <div class="btn-row">
            ${wrongs.length ? `<button class="btn" type="button" id="retryMissed">Retry the ${wrongs.length} missed</button>` : ""}
            ${fromReview ? "" : `<button class="btn ${wrongs.length ? "ghost" : ""}" type="button" id="newQuiz">New quiz from same notes</button>`}
            ${wrongs.length ? `<button class="btn ghost" type="button" id="toCards">Flashcards from missed</button>` : ""}
          </div>
          ${wrongs.length ? `<div class="review">${wrongs.map(rvCard).join("")}</div>` : ""}
        </div>`;
      requestAnimationFrame(() => requestAnimationFrame(() => { $("#ringVal").style.strokeDashoffset = C * (1 - pct); }));
      if (pct === 1 || isBest) setTimeout(() => { const r = $(".ring").getBoundingClientRect(); fx.confetti(r.left + r.width / 2, r.top + r.height / 2, pct === 1 ? 180 : 100); sfx.best(); }, 600);
      $("#retryMissed")?.addEventListener("click", () => start(shuffle(wrongs.map(({ picked, ...q }) => q)), true));
      $("#newQuiz")?.addEventListener("click", generate);
      $("#toCards")?.addEventListener("click", () => { openTab("cards"); deck.start(wrongs.map((q) => ({ front: q.prompt, back: q.options[q.answer] + (q.explanation ? " — " + q.explanation : "") }))); });
    }
    empty();
    return { start, empty };
  })();
  function rvCard(q) {
    return `<div class="rv"><p>${esc(q.prompt)}</p><div class="ans">${q.picked != null ? `<span class="yours">${esc(q.options[q.picked])}</span>` : ""}<span class="corr">${esc(q.options[q.answer])}</span></div>${q.explanation ? `<div class="why">${esc(q.explanation)}</div>` : ""}</div>`;
  }

  /* ----- flashcards ----- */
  const deck = (() => {
    let cards = [], queue = [], known = 0, again = [], flipped = false, total = 0;
    const root = $("#tab-cards");
    function empty() { root.innerHTML = `<div class="empty-state">Your deck appears here. Add material above and choose <b>Make flashcards</b>.</div>`; }
    function start(list) {
      cards = list; queue = shuffle(list); known = 0; again = []; total = list.length;
      openTab("cards"); render();
    }
    function render() {
      if (!queue.length) return done();
      const c = queue[0]; flipped = false;
      root.innerHTML = `
        <div class="qhead"><span class="note tnum">${total - queue.length + 1} of ${total}</span><div class="progress"><i style="width:${((total - queue.length) / total) * 100}%"></i></div><span class="note tnum">${known} known</span></div>
        <div class="deck"><button type="button" class="flash" id="flash" aria-label="Flip card">
          <div class="face"><span class="tag">Question</span><span class="fq">${esc(c.front)}</span></div>
          <div class="face back"><span class="tag">Answer</span><span class="fa">${esc(c.back)}</span></div>
        </button></div>
        <div class="deck-tools"><span class="note">Tap the card or press <kbd>Space</kbd> to flip</span>
          <div class="btn-row"><button class="btn again" type="button" id="again">Again</button><button class="btn gotit" type="button" id="gotit">Got it</button></div></div>`;
      $("#flash").addEventListener("click", flip);
      $("#again").addEventListener("click", () => mark(false));
      $("#gotit").addEventListener("click", () => mark(true));
    }
    function flip() { flipped = !flipped; $("#flash")?.classList.toggle("flipped", flipped); sfx.flip(); }
    function mark(ok) {
      const el = $("#flash"); if (!el) return;
      const c = queue.shift();
      if (ok) { known++; sfx.right(); } else { again.push(c); sfx.wrong(); }
      el.classList.add(ok ? "out-right" : "out-left");
      setTimeout(render, 260);
    }
    function done() {
      bumpStreak();
      const all = known === total;
      root.innerHTML = `<div class="result">
        <div class="stats"><div><b class="tnum">${known}</b><span>Known</span></div><div><b class="tnum">${again.length}</b><span>Again</span></div></div>
        <div class="btn-row">${again.length ? `<button class="btn" type="button" id="redoAgain">Study the ${again.length} again</button>` : ""}<button class="btn ${again.length ? "ghost" : ""}" type="button" id="redoAll">Shuffle the whole deck</button></div>
      </div>`;
      if (all) setTimeout(() => { const r = root.getBoundingClientRect(); fx.confetti(r.left + r.width / 2, r.top + 40, 100); sfx.best(); }, 200);
      $("#redoAgain")?.addEventListener("click", () => { const a = again; total = a.length; queue = shuffle(a); known = 0; again = []; render(); });
      $("#redoAll").addEventListener("click", () => start(cards));
    }
    addEventListener("keydown", (e) => {
      if (route !== "study" || tab !== "cards" || typing(e.target) || !$("#flash")) return;
      if (e.code === "Space") { e.preventDefault(); flip(); }
      else if (e.code === "ArrowRight") mark(true);
      else if (e.code === "ArrowLeft") mark(false);
    });
    empty();
    return { start };
  })();

  /* ----- review tab ----- */
  function renderReview() {
    const list = missed.all(), root = $("#tab-review");
    if (!list.length) { root.innerHTML = `<div class="empty-state">No missed questions saved. Anything you get wrong in a quiz lands here so you can practice it later. Kept on this device only.</div>`; return; }
    root.innerHTML = `
      <div class="rv-tools"><span class="note">${list.length} missed question${list.length > 1 ? "s" : ""} · kept on this device</span>
        <div class="btn-row"><button class="btn" type="button" id="practice">Practice these</button><button class="btn ghost" type="button" id="rvCards">As flashcards</button><button class="btn ghost" type="button" id="rvClear">Clear</button></div></div>
      <div id="rvConfirm" class="unavail" hidden>Clear all saved missed questions? <button class="btn" type="button" id="rvYes" style="min-height:32px;margin-left:8px">Clear</button></div>
      <div class="review">${list.map(rvCard).join("")}</div>`;
    $("#practice").addEventListener("click", () => quiz.start(shuffle(list.slice(0, 20).map(({ picked, at, ...q }) => q)), true));
    $("#rvCards").addEventListener("click", () => deck.start(list.map((q) => ({ front: q.prompt, back: q.options[q.answer] + (q.explanation ? " — " + q.explanation : "") }))));
    $("#rvClear").addEventListener("click", () => { $("#rvConfirm").hidden = false; });
    $("#rvYes")?.addEventListener("click", () => { missed.clear(); renderReview(); });
  }

  setCountOptions();
  return {
    onSample() {},
    renderReview,
  };
})();

/* ======================================================
   ROUTING
   ====================================================== */
let route = "home";
function go() {
  const h = location.hash.replace("#", "");
  route = h === "board" || h === "study" ? h : "home";
  $("#view-home").hidden = route !== "home";
  $("#view-board").hidden = route !== "board";
  $("#view-study").hidden = route !== "study";
  if (route === "board") { boardGame = game; renderBoard(); }
  if (route === "home") { fit(); }
  scrollTo(0, 0);
}
addEventListener("hashchange", go);

selectGame(game);
go();
initPlatform();
// until the platform answers, Study waits; if it never does, show the fallback
})();
