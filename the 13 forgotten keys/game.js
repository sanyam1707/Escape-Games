/* The 13 Forgotten Keys. Vanilla JS. All text and numbers come from game.json; puzzle rules live in logic.js. */
(() => {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DEBUG = new URLSearchParams(location.search).get("debug") === "1" && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
const L = window.Logic;

let G = null;                       // game.json
const ART = { cut: new Set(), singles: new Set() };
let S = null;                       // run state
const Room = { viewer: null, els: {}, def: null, fallback: false, moved: false, downAt: null };

function freshState() {
  return { mode: "title", room: 0, wards: 0, time: G.config.timerSeconds, hintsLeft: G.config.hintsPerGame, done: new Set(), items: [], keys: [], notes: [],
    held: null, hintUsed: {}, wrongs: {}, lockUntil: {}, seen: new Set(), pauseMenu: false, lastAct: performance.now(), phase: "", choice: null, ending: null, sightHold: 0, tray: false };
}

/* ====================== art helpers (real art if present, else drawn fallbacks) ====================== */
const keySvg = (c, cls = "") => `<svg class="${cls}" viewBox="0 0 40 100"><circle cx="20" cy="16" r="12" fill="none" stroke="${c}" stroke-width="5"/><rect x="17" y="28" width="6" height="58" rx="2" fill="${c}"/><rect x="23" y="60" width="13" height="6" fill="${c}"/><rect x="23" y="74" width="9" height="6" fill="${c}"/></svg>`;
const itemSvg = (label, cls = "") => `<svg class="${cls}" viewBox="0 0 100 100"><rect x="8" y="8" width="84" height="84" rx="16" fill="#1b1410" stroke="#C8A24A" stroke-width="3"/><text x="50" y="55" text-anchor="middle" font-size="15" fill="#E8DCC0" font-family="Display, Georgia, serif">${esc(label)}</text></svg>`;
const SYM = {
  moon: '<path d="M26 6a14 14 0 1 0 8 24A12 12 0 0 1 26 6z"/>', key: '<circle cx="12" cy="12" r="6"/><path d="M16 16l18 18M26 26l4-4M31 31l4-4"/>',
  wave: '<path d="M4 15q6-8 12 0t12 0 8 0M4 27q6-8 12 0t12 0 8 0"/>', flame: '<path d="M20 4c2 8 10 12 10 22a10 10 0 0 1-20 0c0-6 4-8 5-14 2 2 3 4 3 6 2-4 2-9 2-14z"/>',
  leaf: '<path d="M8 32C8 14 18 6 34 6c0 16-8 26-24 26M8 34L24 18"/>', eye: '<path d="M3 20q17-18 34 0q-17 18-34 0z"/><circle cx="20" cy="20" r="5"/>',
};
const symSvg = (n) => `<svg viewBox="0 0 40 40" class="sym-w"><g class="sym">${SYM[n]}</g></svg>`;
const hasArt = (n) => ART.cut.has(n);
const keyDef = (id) => G.keys.find((k) => k.id === id);
const itemDef = (id) => G.items[id];
const itemName = (id) => (id === "lantern_shell" && S.done.has("r1_light")) ? "Lit Lantern" : (itemDef(id) || {}).title;
function sprite(id, cls = "spr") {
  if (hasArt(id)) return `<img class="${cls}" src="assets/cut/${id}.png?v=${ART.v}" alt="">`;
  const k = keyDef(id); if (k) return keySvg(k.color, cls);
  return itemSvg(String(itemName(id) || id).split(" ").pop().slice(0, 9), cls);
}
function inspectArt(h) {
  if (hasArt(h.img)) return `<img src="assets/cut/${h.img}.png?v=${ART.v}" alt="${esc(h.title)}">`;
  return `<div class="fbimg">${esc(h.title)}</div>`;
}

/* ====================== audio: narrate() and music ====================== */
const Pref = { // sound switches, remembered between visits
  load() { try { return JSON.parse(localStorage.getItem("13fk.audio")) || {}; } catch (e) { return {}; } },
  save() { try { localStorage.setItem("13fk.audio", JSON.stringify({ music: Music.on, voice: Voice.on, sfx: Sfx.on })); } catch (e) { /* private mode */ } },
};
const Voice = { on: true, list: [], busy: false };
function loadVoices() { try { Voice.list = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)); } catch (e) { /* no speech */ } }
if ("speechSynthesis" in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
function pickVoice(g) {
  const fem = /female|zira|samantha|susan|hazel|aria|jenny|karen|moira|tessa|fiona|victoria|libby|sonia|emma/i, mal = /(^|\s)male|david|mark|daniel|george|james|fred|guy|ryan|oliver|alex|thomas|ryan/i;
  return Voice.list.find((v) => (g === "f" ? fem : mal).test(v.name)) || Voice.list[0] || null;
}
/* narrate(lineOrText): one entry point. A line object picks pitch/rate per speaker; optional audioFile plays a file instead. */
const voiceCache = {}; // preloaded recorded lines
function preloadVoice(line) { const f = line && line.audioFile; if (f && !voiceCache[f]) { try { const a = new Audio(); a.preload = "auto"; a.src = f; voiceCache[f] = a; } catch (e) { /* ignore */ } } }
function speakBrowser(line) { // fallback voice, only for lines without a recording (or if the file cannot play)
  if (!("speechSynthesis" in window)) return; const ch = (G && G.characters[line.speaker]) || {};
  const u = new SpeechSynthesisUtterance(line.text.replace(/\s*\(.*?\)\s*$/, ""));
  u.pitch = ch.pitch || 1; u.rate = ch.rate || 1; u.volume = ch.volume || 1; const v = pickVoice(ch.gender || "m"); if (v) u.voice = v;
  u.onstart = () => Music.duck(true); u.onend = u.onerror = () => Music.duck(false);
  speechSynthesis.speak(u);
}
function narrate(x, force) {
  cancelVoice();
  if (!Voice.on && !force) return;
  const line = typeof x === "string" ? { speaker: "narrator", text: x } : x;
  if (line.audioFile) {
    try {
      const a = voiceCache[line.audioFile] || new Audio(line.audioFile); a.currentTime = 0; Voice.audio = a;
      a.onplay = () => Music.duck(true); a.onended = () => { Music.duck(false); if (Voice.audio === a) Voice.audio = null; };
      a.onerror = () => { if (Voice.audio === a) { Voice.audio = null; speakBrowser(line); } };
      const p = a.play(); if (p && p.catch) p.catch(() => { if (Voice.audio === a) { Voice.audio = null; speakBrowser(line); } });
      return;
    } catch (e) { /* fall back to browser voice */ }
  }
  speakBrowser(line);
}
function cancelVoice() { try { speechSynthesis.cancel(); if (Voice.audio) { Voice.audio.onended = Voice.audio.onerror = Voice.audio.onplay = null; Voice.audio.pause(); Voice.audio = null; } } catch (e) { /* ignore */ } Music.duck(false); }

const Music = {
  started: false, on: true, el: null, ac: null, master: null, vol: .16, // low, so it sits under the voices
  async start() {
    if (this.started) return; this.started = true;
    const a = new Audio(); a.src = a.canPlayType('audio/ogg; codecs="vorbis"') ? "assets/audio/bgm.ogg" : "assets/audio/bgm.mp3"; a.loop = true; a.volume = this.vol; this.el = a;
    try { if (this.on) await a.play(); } catch (e) { this.el = null; if (this.on) this.synth(); }
  },
  synth() { // fallback when assets/audio/bgm.mp3 is missing: low drone plus a slow music box
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ac = (this.ac = new AC()), m = (this.master = ac.createGain()); m.gain.value = .13; m.connect(ac.destination); if (!this.on) ac.suspend();
    [[55, .5], [82.41, .25], [110.2, .1]].forEach(([f, g]) => { const o = ac.createOscillator(), gg = ac.createGain(); o.frequency.value = f; gg.gain.value = g; o.connect(gg).connect(m); o.start(); });
    const scale = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];
    this.iv = setInterval(() => {
      if (!this.on || Math.random() > .7) return; const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
      o.type = "triangle"; o.frequency.value = scale[Math.floor(Math.random() * scale.length)];
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.3, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + 2.2);
      o.connect(g).connect(m); o.start(t); o.stop(t + 2.3);
    }, 1300);
  },
  setOn(v) { this.on = v; if (this.el) v ? this.el.play().catch(() => {}) : this.el.pause(); if (this.ac) v ? this.ac.resume() : this.ac.suspend(); },
  duck(d) { if (this.el) this.el.volume = d ? this.vol * .4 : this.vol; if (this.master) this.master.gain.setTargetAtTime(d ? .04 : .13, this.ac.currentTime, .1); },
};

/* Sound effects: a few short synthesised sounds, only where they help. Names: pickup, unlock, solve, wrong, door. */
const Sfx = {
  on: true, ac: null,
  play(name) {
    if (!this.on) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const ac = this.ac || (this.ac = new AC()); if (ac.state === "suspended") ac.resume();
      const t = ac.currentTime, out = ac.createGain(); out.gain.value = .22; out.connect(ac.destination);
      const tone = (f, t0, d, type = "sine", v = 1, f2) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t + t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + t0 + d);
        g.gain.setValueAtTime(0, t + t0); g.gain.linearRampToValueAtTime(v, t + t0 + .01); g.gain.exponentialRampToValueAtTime(.001, t + t0 + d); o.connect(g).connect(out); o.start(t + t0); o.stop(t + t0 + d + .05); };
      ({
        pickup() { tone(880, 0, .35, "triangle", .6); tone(1318, .07, .4, "sine", .4); },
        unlock() { tone(180, 0, .09, "square", .5); tone(120, .1, .12, "square", .4); tone(1046, .2, .5, "sine", .4); },
        solve() { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * .11, .6, "triangle", .5)); },
        wrong() { tone(150, 0, .4, "sawtooth", .5, 70); },
        door() { tone(90, 0, .9, "sawtooth", .35, 55); tone(260, 0, .7, "triangle", .12, 120); },
      })[name]();
    } catch (e) { /* no audio */ }
  },
};
{ const p = Pref.load(); if (p.music === false) Music.on = false; if (p.voice === false) Voice.on = false; if (p.sfx === false) Sfx.on = false; }

/* ====================== HUD ====================== */
function fmt(t) { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); }
function renderHUD() {
  $("#wards-n").textContent = S.wards; $("#clock").textContent = fmt(S.time);
  $("#keys-n").textContent = S.keys.length + "/13"; $("#book-n").textContent = S.items.length + S.notes.length;
  $("#pips").innerHTML = Array.from({ length: G.config.hintsPerGame }, (_, i) => `<b class="${i < S.hintsLeft ? "" : "off"}"></b>`).join("");
  const hb = $("#btn-hint"); hb.disabled = S.hintsLeft <= 0; hb.querySelector("span").textContent = S.hintsLeft > 0 ? "Hint" : "No hints left";
  hb.title = S.hintsLeft > 0 ? `Hint costs ${G.config.hintCost} Wards` : G.ui.noHints;
  const r = G.rooms[S.room]; document.documentElement.style.setProperty("--accent", r.accent);
  $("#room-name").textContent = `Room ${r.n}: ${r.name}`; $("#obj-text").textContent = r.objective;
  // Find strip: FIND items of the current room only
  const finds = r.hotspots.filter((h) => h.kind === "FIND" && h.item);
  $("#find-strip").innerHTML = finds.length ? `<div class="cap">Find in this room</div>` + finds.map((h) => { const got = S.items.includes(h.item);
    return `<div class="fs ${got ? "got" : ""}"><i>${got ? "&#10003;" : "?"}</i>${got ? esc(itemName(h.item)) : "&nbsp;?&nbsp;"}</div>`; }).join("") : "";
  const hold = $("#holding"); hold.hidden = !S.held; if (S.held) $("#holding-name").textContent = "Holding: " + (keyDef(S.held) ? keyDef(S.held).name : itemName(S.held));
}
function addWards(n) {
  const before = S.wards; S.wards = Math.max(0, S.wards + n); if (S.wards === before) return;
  const w = $("#wards"); w.classList.remove("gain"); void w.offsetWidth; if (n > 0) w.classList.add("gain"); renderHUD();
}
function toast(msg, kind = "") { const t = $("#toast"); t.textContent = msg; t.className = kind; t.hidden = false; clearTimeout(toast.id); toast.id = setTimeout(() => (t.hidden = true), 2600); }
function bump(sel) { const b = $(sel); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }

/* ====================== timer ====================== */
function timerPaused() { return S.mode !== "play" || S.pauseMenu || (Dlg.cur && Dlg.cur.pausesTimer) || S.introCard; }
let lastTick = performance.now();
setInterval(() => {
  const now = performance.now(), dt = (now - lastTick) / 1000; lastTick = now;
  if (!S || S.mode === "title") return;
  const c = $("#clock"); c.classList.toggle("paused", timerPaused() && S.mode === "play");
  if (!timerPaused()) { S.time -= dt; if (S.time <= 0) { S.time = 0; renderHUD(); timeUp(); return; } c.textContent = fmt(S.time); c.classList.toggle("low", S.time < 60); }
  // idle prompt (only when nothing else is going on)
  if (S.mode === "play" && !Dlg.cur && !currentModal && !S.pauseMenu && now - S.lastAct > G.config.idleSeconds * 1000) { S.lastAct = now; say(G.idle); }
}, 200);
document.addEventListener("pointerdown", () => { if (S) S.lastAct = performance.now(); }, true);

/* ====================== dialogue ====================== */
const Dlg = { queue: [], cur: null, running: false, tap: null, skip: false };
function say(lines, opts = {}) {
  if (!lines || !lines.length) return Promise.resolve();
  return new Promise((res) => { Dlg.queue.push({ lines, res, opts }); if (!Dlg.running) pump(); });
}
async function pump() {
  Dlg.running = true;
  while (Dlg.queue.length) {
    const job = Dlg.queue.shift(); Dlg.skip = false;
    for (const line of job.lines) {
      if (Dlg.skip) break;
      Dlg.cur = line; showLine(line, job.opts); narrate(line); preloadVoice(job.lines[job.lines.indexOf(line) + 1] || (Dlg.queue[0] && Dlg.queue[0].lines[0]));
      await new Promise((r) => (Dlg.tap = r));
      cancelVoice();
    }
    Dlg.cur = null; job.res();
  }
  Dlg.running = false; Dlg.cur = null; const d = $("#dlg"); d.hidden = true; document.body.classList.remove("dlg-on");
}
function bustHTML(line) {
  const ch = G.characters[line.speaker] || {};
  if (line.speaker === "warden") return `<div class="wk"><svg viewBox="0 0 40 60"><path d="M20 2a14 14 0 0 0-6 26.6L9 58h22l-5-29.4A14 14 0 0 0 20 2z"/></svg></div>`;
  if (line.speaker === "narrator") return "";
  const id = line.speaker === "mara" || line.speaker === "teo" || line.speaker === "odette" ? `${line.speaker}_${line.mood || ch.moods[0]}` : "g_" + line.speaker;
  if (hasArt(id)) return `<img src="assets/cut/${id}.png?v=${ART.v}" alt="">`;
  return `<div class="init">${esc(ch.initial || "?")}</div>`;
}
function showLine(line, opts) {
  const d = $("#dlg"), ch = G.characters[line.speaker] || {};
  d.hidden = false; d.style.setProperty("--spk", ch.color || "#C8A24A"); document.body.classList.add("dlg-on");
  d.className = (line.pausesTimer ? "pausing " : "") + (opts.flash ? "flash " : "") + (opts.noHud ? "nohud" : "");
  d.innerHTML = `<button class="skip">Skip</button>${line.speaker === "narrator" ? "" : `<div class="bust">${bustHTML(line)}</div>`}
    <div class="txt">${line.speaker === "narrator" ? "" : `<div class="who">${esc(ch.name || line.speaker)}</div>`}<div class="line ${line.speaker === "narrator" ? "nar" : ""}">${esc(line.text)}</div><div class="more">Tap to continue</div></div>`;
}
$("#dlg").addEventListener("click", (e) => {
  if (e.target.closest(".skip")) { Dlg.skip = true; }
  if (Dlg.tap) { const t = Dlg.tap; Dlg.tap = null; t(); }
});
function clearDialogue() { Dlg.queue.forEach((j) => j.res()); Dlg.queue = []; Dlg.skip = true; if (Dlg.tap) { const t = Dlg.tap; Dlg.tap = null; t(); } }
const grp = (key, r = S.room) => G.rooms[r].dialogue[key] || [];

/* ====================== modal stack ====================== */
let modalChain = Promise.resolve(), currentModal = null;
function modal(build) {
  const run = () => new Promise((resolve) => {
    const root = $("#modal-root"); let closed = false, node;
    const close = (val) => { if (closed) return; closed = true; node.remove(); if (currentModal && currentModal.node === node) currentModal = null; document.body.classList.toggle("modal-on", !!root.firstChild); resolve(val); };
    node = build(close); currentModal = { node, close }; root.appendChild(node); document.body.classList.add("modal-on");
  });
  const p = modalChain.then(run); modalChain = p.catch(() => {}); return p;
}
$("#modal-root").addEventListener("click", (e) => { if (e.target.id === "modal-root" && currentModal) currentModal.close(); });
const closeAllModals = () => { $("#modal-root").innerHTML = ""; currentModal = null; modalChain = Promise.resolve(); document.body.classList.remove("modal-on"); };
function xbtn(close) { const b = el("button", "xbtn", "&times;"); b.setAttribute("aria-label", "Close"); b.onclick = () => close(); return b; }

/* generic card: title, art, text, tag, optional extra buttons */
function card(o) {
  return modal((close) => {
    const c = el("div", "card " + (o.cls || ""));
    c.append(xbtn(close));
    c.insertAdjacentHTML("beforeend", `<h2>${esc(o.title)}</h2>${o.art ? `<div class="art">${o.art}</div>` : ""}<p>${esc(o.text || "")}</p>${o.tag ? `<span class="tag ${o.pts ? "pts" : ""}">${esc(o.tag)}</span>` : ""}`);
    const row = el("div", "row"); (o.buttons || []).forEach((b) => { const x = el("button", "btn " + (b.cls || ""), esc(b.label)); x.onclick = () => { close(); b.fn && b.fn(); }; row.append(x); });
    const ok = el("button", "btn", esc(o.ok || "OK")); ok.onclick = () => close(); row.append(ok); c.append(row);
    return c;
  });
}

/* ====================== rooms and hotspots ====================== */
const RM = () => G.rooms[S.room];
const hasThing = (id) => S.items.includes(id) || S.keys.includes(id);
const afterOk = (h) => h.after.every((a) => S.done.has(a));
function isVisible(h) {
  if (h.kind === "AUTO" || h.noTap || h.bookOnly) return false;
  if (!afterOk(h)) return false;
  if (h.kind === "INSPECT" || h.once) return true;
  return !S.done.has(h.id);
}
function refreshHotspots() {
  RM().hotspots.forEach((h) => { const d = Room.els[h.id]; if (!d) return; d.classList.toggle("gone", !isVisible(h)); d.classList.toggle("seen", S.done.has(h.id)); });
  renderHUD();
}
function fallbackPano(accent) {
  const c = document.createElement("canvas"); c.width = 2048; c.height = 1024; const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, 1024); g.addColorStop(0, "#0b0f1a"); g.addColorStop(.5, "#1a2036"); g.addColorStop(1, "#0a0c12"); x.fillStyle = g; x.fillRect(0, 0, 2048, 1024);
  const t = x.createRadialGradient(1024, 512, 50, 1024, 512, 900); t.addColorStop(0, accent + "55"); t.addColorStop(1, accent + "00"); x.fillStyle = t; x.fillRect(0, 0, 2048, 1024);
  x.strokeStyle = "#ffffff18"; x.fillStyle = "#ffffff44"; x.font = "28px Georgia";
  for (let yaw = -180; yaw < 180; yaw += 30) { const px = (yaw + 180) / 360 * 2048; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, 1024); x.stroke(); x.fillText(yaw, px + 6, 520); }
  return c.toDataURL("image/jpeg", .8);
}
const probeImage = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = src; });

async function loadRoom(i) {
  S.room = i; const def = (Room.def = RM());
  if (Room.viewer) { try { Room.viewer.destroy(); } catch (e) { /* ignore */ } Room.viewer = null; }
  Room.els = {}; const host = $("#pano"); host.innerHTML = ""; const box = el("div"); box.style.cssText = "width:100%;height:100%"; host.append(box);
  const ok = await probeImage(def.panorama); Room.fallback = !ok; document.body.classList.toggle("labels", !!(DEBUG && S.labels));
  const hotSpots = def.hotspots.filter((h) => h.kind !== "AUTO" && !h.noTap && !h.bookOnly).map((h) => ({
    id: h.id, pitch: h.pitch, yaw: h.yaw, type: "custom", cssClass: "hs k-" + h.kind.toLowerCase(),
    createTooltipFunc: (div) => buildHotspot(div, h), clickHandlerFunc: () => onHotspot(h),
  }));
  // Pick hfov from the screen shape so the vertical field of view stays about 96 degrees: Pannellum cannot pitch past 90 - vfov/2.
  const asp = innerWidth / innerHeight, hf = clamp(2 * Math.atan(Math.tan(48 * Math.PI / 180) * asp) * 180 / Math.PI, 45, 100);
  Room.viewer = pannellum.viewer(box, { type: "equirectangular", panorama: ok ? def.panorama : fallbackPano(def.accent), autoLoad: true, showControls: false, hfov: hf,
    minHfov: hf * .6, maxHfov: hf, yaw: def.startYaw || 0, pitch: 0, compass: false, hotSpots, mouseZoom: true, draggable: true, friction: .12, keyboardZoom: false });
  await new Promise((res) => { Room.viewer.on("load", res); Room.viewer.on("error", res); setTimeout(res, 8000); });
  refreshHotspots();
}
function buildHotspot(div, h) {
  Room.els[h.id] = div; const b = el("div", "hsb"); b.setAttribute("role", "button"); b.setAttribute("aria-label", h.name);
  if (h.kind === "FIND") { const id = h.item || h.key; b.innerHTML = sprite(id, "spr"); }
  else b.innerHTML = '<div class="dot"></div>';
  b.addEventListener("pointerup", () => onHotspot(h)); // touch fallback: Pannellum cancels some touch clicks; _busy dedupes the click that may follow
  b.insertAdjacentHTML("beforeend", `<span class="lbl">${esc(h.name)}</span>`); div.append(b); div.classList.toggle("gone", !isVisible(h));
}
document.addEventListener("pointerdown", (e) => { Room.downAt = [e.clientX, e.clientY]; Room.moved = false; }, true);
document.addEventListener("pointermove", (e) => { if (Room.downAt && Math.hypot(e.clientX - Room.downAt[0], e.clientY - Room.downAt[1]) > 8) Room.moved = true; }, true);
document.addEventListener("pointerup", () => { Room.downAt = null; setTimeout(() => (Room.moved = false), 60); }, true);

async function onHotspot(h) {
  if (!S || S.mode !== "play" || Room.moved || S.pauseMenu || currentModal || h._busy) return;
  h._busy = true;
  try {
    ({ FIND: doFind, LEARN: doLearn, INSPECT: doInspect, USE: doUse, PANEL: doPanel })[h.kind](h);
  } finally { setTimeout(() => (h._busy = false), 300); }
}
function complete(h) { S.done.add(h.id); refreshHotspots(); }
async function runThen(h) { for (const g of h.then || []) await say(grp(g)); }

/* --- FIND --- */
function fly(fromEl, html) {
  if (!fromEl) return; const r = fromEl.getBoundingClientRect(), b = $("#btn-book").getBoundingClientRect(), f = el("div", "flyer", html);
  f.style.left = r.left + r.width / 2 - 30 + "px"; f.style.top = r.top + r.height / 2 - 30 + "px"; document.body.append(f);
  requestAnimationFrame(() => { f.style.transform = `translate(${b.left + b.width / 2 - (r.left + r.width / 2)}px,${b.top + b.height / 2 - (r.top + r.height / 2)}px) scale(.3)`; f.style.opacity = ".2"; });
  setTimeout(() => { f.remove(); bump("#btn-book"); }, 800);
}
async function doFind(h) {
  const P = G.config.points, isKey = !!h.key, id = h.item || h.key, pts = isKey ? P.keyB : P.item;
  fly(Room.els[h.id] && Room.els[h.id].querySelector(".spr"), sprite(id, "spr"));
  Sfx.play("pickup"); if (isKey) S.keys.push(id); else S.items.push(id);
  addWards(pts); complete(h);
  const d = isKey ? keyDef(id) : itemDef(id);
  await card({ title: isKey ? d.name : d.title, art: sprite(id, "spr"), cls: "gold", text: isKey ? `${h.text} ${d.power}` : d.text, tag: `+${pts} Wards  ·  ${isKey ? "Added to your Key Ring" : "Added to your Book"}`, pts: true });
  if (isKey && d.flashback) await flashback(d.flashback);
  await runThen(h);
}
/* --- LEARN --- */
async function doLearn(h) {
  if (h.needs && !hasThing(h.needs)) { await card({ title: h.name, text: h.text || "You need something to read this.", tag: "Needs: " + [].concat(h.needs).map(itemName).join(", ") }); return; }
  addNote({ id: h.id, title: h.note.title, text: h.note.text, tag: h.note.tag || "clue" }); complete(h);
  if (h.ghost) await say([{ speaker: h.ghost, mood: "", text: h.note.text.replace(/^"|"$/g, ""), pausesTimer: false, audioFile: h.audioFile }]);
  const syms = h.cardSyms ? `<div class="sc" style="background:none;border:0"><div class="ss">${h.cardSyms.map(symSvg).join("")}</div></div>` : "";
  await card({ title: h.note.title, art: syms, text: h.note.text, tag: G.ui.saved, cls: h.note.tag === "diary" ? "" : "violet" });
  await runThen(h);
  if (h.id === "r7_note") startSight();
}
function addNote(n) { if (!S.notes.find((x) => x.id === n.id)) { S.notes.push(n); renderHUD(); bump("#btn-book"); } }
/* --- INSPECT --- */
async function doInspect(h) {
  const P = G.config.points; let z = false; complete(h);
  await modal((close) => {
    const c = el("div", "card inspect"); c.append(xbtn(close));
    c.insertAdjacentHTML("beforeend", `<h2>${esc(h.title)}</h2><div class="stage"><div class="inner">${inspectArt(h)}</div><div class="reticle"></div></div><p class="p1">${esc(h.text1)}</p><div class="sec"></div>`);
    const row = el("div", "row"), more = el("button", "btn", "Look closer"), ok = el("button", "btn ghost", "Done"); ok.onclick = () => close(); row.append(more, ok); c.append(row);
    more.onclick = () => {
      if (z) return; z = true; const [cx, cy, s] = h.zoom, st = c.querySelector(".stage");
      c.querySelector(".inner").style.transform = `translate(${-(cx - 50) * s}%, ${-(cy - 50) * s}%) scale(${s})`; st.classList.add("z2");
      c.querySelector(".p1").textContent = h.text2; more.hidden = true;
      if (h.secret && !S.done.has(h.id + ":secret")) {
        S.done.add(h.id + ":secret"); addWards(P.secret); addNote({ id: h.id + ":s", title: "Secret: " + h.title, text: h.secret, tag: "secret" });
        c.querySelector(".sec").innerHTML = `<div class="secret">Secret found: <b>${esc(h.secret)}</b> &nbsp;+${P.secret} Wards &middot; ${G.ui.saved}</div>`;
      }
    };
    return c;
  });
  await runThen(h);
}
/* --- USE --- */
const combineFor = (a, b) => RM().hotspots.find((h) => h.combine && ((h.combine.hold === a && h.combine.target === b) || (h.combine.hold === b && h.combine.target === a)) && afterOk(h) && !S.done.has(h.id));
async function doUse(h) {
  if (S.held !== h.needs) { // must be held from the Book / Key Ring; a wrong or empty hand never consumes the target
    if (S.held) toast("That does not work here.", "bad"); else await card({ title: h.name, text: h.useHint });
    return;
  }
  S.held = null; await runUse(h);
}
async function runUse(h) {
  Sfx.play(h.goto != null ? "door" : "unlock"); complete(h); S.held = null; renderHUD();
  await card({ title: h.result.title, text: h.result.text, cls: "gold", tag: h.goto != null ? "" : "" });
  await runThen(h);
  if (h.goto != null) await goRoom(h.goto);
}
async function doCombine(h) { S.held = null; await runUse(h); }

/* --- PANEL --- */
async function doPanel(h) {
  const need = [].concat(h.needs || []).filter((n) => !hasThing(n));
  if (need.length) { await card({ title: h.name, text: h.text || "You need something first.", tag: "Needs: " + need.map(itemName).join(", ") }); return; }
  if (h.once) complete(h); // read-only clue panel: counts as done when read, but its tap stays so it can be re-read
  await Panels[h.panel](h);
}
function makePanel(title, h, extra) {
  return (close) => {
    const p = el("div", "panel"), head = el("header"), body = el("div", "body"), foot = el("footer");
    head.append(el("h2", "", esc(title)), xbtn(close));
    const hint = el("button", "btn ghost hintb", `Hint (-${G.config.hintCost})`); hint.onclick = () => useHint(); foot.append(hint);
    p.append(head, body, foot); extra({ p, body, foot, close }); return p;
  };
}
/* A panel puzzle was solved: close it, award, play the right narration, then (and only then) mark done so rewards appear. */
async function finishPuzzle(h, close) {
  close(); Sfx.play("solve");
  if (h.points === "final") addWards(G.config.points.final);
  for (const g of h.preRight || []) await say(grp(g));
  await say(grp(h.right));
  complete(h); await autoRun(); await runThen(h);
  if (h.id === "r7_turn") await doPanel(RM().hotspots.find((x) => x.id === "r7_choice"));
}
function lockLeft(pid) { return Math.max(0, (S.lockUntil[pid] || 0) - performance.now()); }
function wrongAnswer(pid, prefix, fxN) {
  const P = G.config.points, n = S.wrongs[pid] || 0; S.wrongs[pid] = n + 1; Sfx.play("wrong");
  if (n < P.wrongCapPerPuzzle / P.wrong) addWards(-P.wrong);
  S.lockUntil[pid] = performance.now() + P.wrongLockoutMs;
  if (prefix) say(grp(prefix + Math.min(n + 1, 3)));
  if (S.room === 6) fx.wrong(Math.min(n + 1, 3));
  return n + 1;
}
function lockButton(btn, pid, label) { // shows a 3 second lockout on a submit button
  const tick = () => { const l = lockLeft(pid); btn.disabled = l > 0; btn.textContent = l > 0 ? `Wait ${Math.ceil(l / 1000)}...` : label; if (l > 0) setTimeout(tick, 250); }; tick();
}
const clueBox = (html) => `<div class="clues">${html}</div>`;

/* ---------- drag or tap helper (cards onto chairs, keys onto locks) ---------- */
function dnd(root, { sourceSel, targetSel, onDrop, idOf = (e) => e.dataset.id, ghost }) {
  let sel = null, drag = null;
  const clearSel = () => { root.querySelectorAll(".sel").forEach((e) => e.classList.remove("sel")); sel = null; };
  const down = (e) => {
    const s = e.target.closest(sourceSel); if (!s) return;
    drag = { s, x: e.clientX, y: e.clientY, on: false, g: null };
  };
  const move = (e) => {
    if (!drag) return;
    if (!drag.on && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) { drag.on = true; drag.g = el("div", "dragghost", ghost(drag.s)); document.body.append(drag.g); }
    if (drag.on) { drag.g.style.left = e.clientX + "px"; drag.g.style.top = e.clientY + "px";
      root.querySelectorAll(targetSel).forEach((t) => t.classList.remove("over")); const t = document.elementFromPoint(e.clientX, e.clientY), tt = t && t.closest(targetSel); if (tt) tt.classList.add("over"); }
  };
  const up = (e) => {
    if (!drag) return; const d = drag; drag = null;
    if (d.on) { d.g.remove(); const t = document.elementFromPoint(e.clientX, e.clientY), tt = t && t.closest(targetSel); root.querySelectorAll(targetSel).forEach((x) => x.classList.remove("over")); clearSel(); if (tt) onDrop(idOf(d.s), tt); }
    else { const was = d.s.classList.contains("sel"); clearSel(); if (!was) { d.s.classList.add("sel"); sel = idOf(d.s); } }
  };
  const cancel = () => { if (drag && drag.g) drag.g.remove(); drag = null; };
  const click = (e) => { const t = e.target.closest(targetSel); if (t && sel && !e.target.closest(sourceSel)) { const id = sel; clearSel(); onDrop(id, t); } };
  root.addEventListener("pointerdown", down); root.addEventListener("pointermove", move); root.addEventListener("pointerup", up); root.addEventListener("pointercancel", cancel); root.addEventListener("click", click);
  return () => { cancel(); ["pointerdown", "pointermove", "pointerup", "pointercancel", "click"].forEach((n, i) => root.removeEventListener(n, [down, move, up, cancel, click][i])); };
}

/* ====================== puzzle panels ====================== */
const Panels = {};

/* Room 1: Torch Sweep. Drag the lantern light across the wall; tallies show only under the light. */
Panels.torch = (h) => modal(makePanel("The Dark Wall", h, ({ body, foot, close }) => {
  const ev = G.puzzles.pins.evidence, lit = new Set();
  body.innerHTML = `<p class="note">Drag the lantern light across the wall. Something was scratched here.</p><div class="wall"><div class="dark"></div><div class="lamp">&#128367;</div></div><div class="msg"></div>`;
  const wall = $(".wall", body), dark = $(".dark", wall), lamp = $(".lamp", wall), msg = $(".msg", body), tallies = [];
  for (let i = 1; i <= 5; i++) { const x = 10 + (i - 1) * 20;
    wall.insertAdjacentHTML("beforeend", `<div class="sock" style="left:${x}%"></div>`);
    if (ev[i]) { const t = el("div", "tally", "<i></i>".repeat(ev[i])); t.style.left = x + "%"; wall.append(t); tallies.push({ i, t, x }); }
    else { const s = el("div", "scrape"); s.style.left = x + "%"; wall.append(s); tallies.push({ i, t: s, x, scrape: true }); } }
  const done = el("button", "btn", "I see them"); done.disabled = true; foot.prepend(done);
  const move = (px, py) => {
    const r = wall.getBoundingClientRect(), x = clamp(px - r.left, 0, r.width), y = clamp(py - r.top, 0, r.height);
    lamp.style.left = x + "px"; lamp.style.top = y + "px"; dark.style.background = `radial-gradient(circle at ${x}px ${y}px, transparent 0, transparent 40px, rgba(4,5,9,.97) 120px)`;
    tallies.forEach((o) => { const cx = r.width * o.x / 100, cy = r.height * .5, near = Math.hypot(x - cx, y - cy) < 80; o.t.style.opacity = near ? 1 : 0; if (near && !o.scrape) lit.add(o.i); });
    if (lit.size >= 3) { done.disabled = false; msg.textContent = "Three pins have marks. Pins 3 and 5 were scraped away."; }
  };
  wall.addEventListener("pointermove", (e) => move(e.clientX, e.clientY)); wall.addEventListener("pointerdown", (e) => move(e.clientX, e.clientY));
  requestAnimationFrame(() => { const r = wall.getBoundingClientRect(); move(r.left + 40, r.top + r.height / 2); });
  done.onclick = () => { close(); addNote({ id: "n_pins", title: "Scratch marks", tag: "clue", text: "Pin 1 has 4 marks, pin 2 has 2 marks, pin 4 has 1 mark. Pins 3 and 5 are scraped away." }); complete(h); runThen(h); };
}));

/* Room 1: Pin Tumbler. Tap a pin to cycle its height 1 to 5. */
Panels.pins = (h) => modal(makePanel("Pin Tumbler Lock", h, ({ body, foot, close }) => {
  const P = G.puzzles.pins, val = [0, 0, 0, 0, 0];
  body.innerHTML = clueBox(`<b>Scratch marks:</b> pin 1 = 4, pin 2 = 2, pin 4 = 1. Pins 3 and 5 were scraped away.<br><b>Diary page 1:</b> "Pins rise as the family does. Tall in the middle, short at the end."`) +
    `<p class="small">Each height from 1 to 5 is used once. Tap a pin to change its height.</p><div class="pins"></div><div class="msg"></div>`;
  const pins = $(".pins", body), msg = $(".msg", body), go = el("button", "btn", "Turn the key"); foot.prepend(go);
  const draw = () => { pins.innerHTML = val.map((v, i) => `<div class="pin" data-i="${i}"><div class="col"><div class="rod ${v ? "" : "none"}" style="height:${v ? v * 28 + 10 : 22}px">${v || "?"}</div></div><label>Pin ${i + 1}</label></div>`).join(""); };
  pins.onclick = (e) => { const p = e.target.closest(".pin"); if (!p) return; const i = +p.dataset.i; val[i] = val[i] % 5 + 1; draw(); msg.textContent = ""; };
  draw(); lockButton(go, "pins", "Turn the key");
  go.onclick = () => {
    if (lockLeft("pins")) return; if (val.includes(0)) { msg.className = "msg"; msg.textContent = "Set every pin first."; return; }
    if (L.pinsOk(val, P)) return finishPuzzle(h, close);
    msg.className = "msg bad"; msg.textContent = "The pins jam. Wrong order."; wrongAnswer("pins", h.wrongKey); lockButton(go, "pins", "Turn the key");
  };
}));

/* Room 2: Ward plates (read-only) */
Panels.plates = (h) => modal(makePanel("The Ward Plates", h, ({ body, foot, close }) => {
  const F = G.puzzles.filing;
  body.innerHTML = `<p class="note">The mirror shows the marks the right way round. Each plate blocks some teeth.</p><div class="plates">${F.plates.map((pl, i) =>
    `<div class="plate"><div class="disc">${i + 1}</div><div class="tt">${Array.from({ length: F.teeth }, (_, t) => `<b class="${pl.includes(t + 1) ? "x" : ""}">${t + 1}</b>`).join("")}</div></div>`).join("")}</div>
    <p class="small">Red teeth are blocked by that plate. ${G.ui.saved}.</p>`;
  addNote({ id: "n_plates", title: "Ward plates", tag: "clue", text: F.plates.map((p, i) => `Plate ${i + 1} blocks teeth ${p.join(" and ")}.`).join(" ") });
  foot.prepend(Object.assign(el("button", "btn", "Got it"), { onclick: () => close() }));
}));

/* Room 2: key blank filing */
Panels.filing = (h) => modal(makePanel("File the Key Blank", h, ({ body, foot, close }) => {
  const F = G.puzzles.filing, filed = new Set();
  body.innerHTML = clueBox(`<b>Plates:</b> ${F.plates.map((p, i) => `plate ${i + 1} blocks ${p.join(" and ")}`).join("; ")}.<br><b>Diary page 2:</b> File away any tooth a plate blocks. Never file the thumb tooth, number ${F.thumb}.`) +
    `<p class="small">Tap a tooth to file it. Tap again to undo.</p><div class="teeth"><div class="keyshaft"></div>${Array.from({ length: F.teeth }, (_, i) =>
      `<div class="tooth ${i + 1 === F.thumb ? "thumb" : ""}" data-t="${i + 1}"><div class="bar"></div><div class="cut"></div><span>${i + 1}</span><button aria-label="Tooth ${i + 1}"></button></div>`).join("")}</div><div class="msg"></div>`;
  const msg = $(".msg", body), go = el("button", "btn", "Try the key"); foot.prepend(go);
  body.querySelector(".teeth").onclick = (e) => { const t = e.target.closest(".tooth"); if (!t) return; const n = +t.dataset.t; filed.has(n) ? filed.delete(n) : filed.add(n); t.classList.toggle("filed", filed.has(n)); msg.textContent = ""; };
  lockButton(go, "filing", "Try the key");
  go.onclick = () => {
    if (lockLeft("filing")) return;
    if (L.filingOk([...filed], F)) return finishPuzzle(h, close);
    msg.className = "msg bad"; msg.textContent = "The key jams in the wards."; wrongAnswer("filing", h.wrongKey); lockButton(go, "filing", "Try the key");
  };
}));

/* Room 3: place cards. Drag (or tap) a name card, then a chair. */
Panels.seats = (h) => modal(makePanel("The Place-Card Lock", h, ({ body, foot, close }) => {
  const S3 = G.puzzles.seats, seat = {}, names = Object.fromEntries(S3.guests.map((g) => [g.id, g.name]));
  const clues = G.rooms[2].hotspots.filter((x) => x.ghost).map((x) => `<b>${esc(x.name)}:</b> ${esc(x.note.text)}`).join("<br>");
  body.innerHTML = clueBox(clues) + `<p class="small">Drag a card onto a chair, or tap a card then a chair. Chair 1 is nearest the fire.</p>
    <div class="chairs"><div class="fire">&#128293;</div>${[1, 2, 3, 4, 5].map((c) => `<div class="chair"><div class="slot" data-t="${c}"></div><label>${c}</label></div>`).join("")}</div><div class="cardrow"></div><div class="msg"></div>`;
  const row = $(".cardrow", body), msg = $(".msg", body), go = el("button", "btn", "Seat them"), clr = el("button", "btn ghost", "Clear"); foot.prepend(go, clr);
  const draw = () => {
    body.querySelectorAll(".slot").forEach((s) => { const g = Object.keys(seat).find((k) => seat[k] === +s.dataset.t); s.innerHTML = g ? `<span class="pc" data-id="${g}">${names[g]}</span>` : ""; });
    row.innerHTML = S3.guests.filter((g) => !seat[g.id]).map((g) => `<span class="pc" data-id="${g.id}">${g.name}</span>`).join("");
  };
  draw();
  dnd(body, { sourceSel: ".pc", targetSel: ".slot", ghost: (s) => `<span class="pc">${s.textContent}</span>`,
    onDrop: (id, t) => { const c = +t.dataset.t; Object.keys(seat).forEach((k) => { if (seat[k] === c) delete seat[k]; }); seat[id] = c; draw(); msg.textContent = ""; } });
  clr.onclick = () => { Object.keys(seat).forEach((k) => delete seat[k]); draw(); };
  lockButton(go, "seats", "Seat them");
  go.onclick = () => {
    if (lockLeft("seats")) return; if (Object.keys(seat).length < 5) { msg.className = "msg"; msg.textContent = "Seat all five guests first."; return; }
    if (L.seatsOk(seat, S3)) return finishPuzzle(h, close);
    msg.className = "msg bad"; msg.textContent = "A ghost frowns. Someone is in the wrong seat."; wrongAnswer("seats", h.wrongKey); lockButton(go, "seats", "Seat them");
  };
}));

/* Room 4: chime levers */
Panels.levers = (h) => modal(makePanel("The Chime Levers", h, ({ body, foot, close }) => {
  const LV = G.puzzles.levers; let lev = LV.start.slice(), presses = 0, won = false;
  body.innerHTML = clueBox(`<b>Diary page 4:</b> Each chime lever wakes its neighbours too. Leave every lever up and the case sleeps.`) + `<p class="small">Get all four levers UP. Pressing a lever flips it and its neighbours.</p><div class="levers"></div><div class="msg"></div>`;
  const box = $(".levers", body), msg = $(".msg", body), reset = el("button", "btn ghost", "Reset"); foot.prepend(reset);
  const draw = () => { box.innerHTML = lev.map((v, i) => `<div class="lever ${v ? "up" : "down"}"><div class="slot"><div class="knob"></div><button data-i="${i}" aria-label="Lever ${i + 1}"></button></div><span>${i + 1}</span><div class="st">${v ? "up" : "down"}</div></div>`).join(""); };
  draw();
  reset.onclick = () => { lev = LV.start.slice(); presses = 0; msg.textContent = ""; draw(); };
  box.onclick = async (e) => {
    const b = e.target.closest("button"); if (!b || won) return; lev = L.leverPress(lev, +b.dataset.i); presses++; draw(); msg.className = "msg"; msg.textContent = `Presses: ${presses}`;
    if (L.leversWon(lev)) { won = true; await sleep(450); return finishPuzzle(h, close); }
    if (presses >= LV.slipPresses) { msg.className = "msg bad"; msg.textContent = "The case slips! The levers reset."; wrongAnswer("levers", h.wrongKey); lev = LV.start.slice(); presses = 0; await sleep(700); draw(); }
  };
}));

/* Room 5: tide lock, two buckets */
Panels.basin = (h) => modal(makePanel("The Tide Lock", h, ({ body, foot, close }) => {
  const B = G.puzzles.basin; let s = { a: 0, b: 0 };
  const bucket = (cap, v, cls, label) => { const H = 100, w = v / cap * H; return `<div class="bucket ${cls}"><svg viewBox="0 0 100 120"><path d="M14 18h72l-8 94H22z" fill="#2a1d14" stroke="#C8A24A" stroke-width="3"/><clipPath id="c${cap}"><path d="M17 20h66l-7.4 90H24.4z"/></clipPath><rect clip-path="url(#c${cap})" x="0" y="${112 - w}" width="100" height="${w}" fill="#3E8E85" opacity=".9"/><text x="50" y="70" text-anchor="middle" font-size="26" fill="#E8DCC0" font-family="Display">${v}/${cap}</text></svg>${label}</div>`; };
  body.innerHTML = clueBox(`<b>Diary page 5:</b> The tide stops at the fourth notch. Five buckets I had, then three.`) + `<p class="small">Put exactly 4 in the big bucket, then pour it into the basin.</p><div class="bucketwrap"></div>
    <div class="btnrow"><button class="btn ghost" data-a="fillA">Fill 5</button><button class="btn ghost" data-a="fillB">Fill 3</button><button class="btn ghost" data-a="pourAB">Pour 5 &rarr; 3</button><button class="btn ghost" data-a="pourBA">Pour 3 &rarr; 5</button><button class="btn ghost" data-a="emptyA">Empty 5</button><button class="btn ghost" data-a="emptyB">Empty 3</button></div><div class="msg"></div>`;
  const wrap = $(".bucketwrap", body), msg = $(".msg", body), go = el("button", "btn", "Pour 5 into basin"); foot.prepend(go);
  const draw = () => { wrap.innerHTML = bucket(B.capA, s.a, "", "Big bucket") + bucket(B.capB, s.b, "sm", "Small bucket"); };
  draw();
  body.querySelector(".btnrow").onclick = (e) => { const a = e.target.closest("button"); if (!a) return; s = L.bucketStep(s, a.dataset.a, B); draw(); msg.className = "msg"; msg.textContent = ""; };
  lockButton(go, "basin", "Pour 5 into basin");
  go.onclick = () => {
    if (lockLeft("basin")) return; if (s.a === 0) { msg.textContent = "The big bucket is empty."; return; }
    if (L.bucketWin(s, B)) return finishPuzzle(h, close);
    msg.className = "msg bad"; msg.textContent = `${s.a} is not four. The basin spits it back.`; wrongAnswer("basin", h.wrongKey); s.a = 0; draw(); lockButton(go, "basin", "Pour 5 into basin");
  };
}));

/* Room 6: Cow-and-Bull safe */
Panels.safe = (h) => modal(makePanel("The Iron Safe", h, ({ body, foot, close }) => {
  const SF = G.puzzles.safe, dial = [0, 1, 2];
  const cards = G.rooms[5].hotspots.filter((x) => x.cardSyms).map((x, i) => `<div class="sc"><div class="ss">${x.cardSyms.map(symSvg).join("")}</div>${x.cardRight} right place, ${x.cardWrong} wrong place</div>`).join("");
  body.innerHTML = `<p class="small">Odette's old guesses. "Right place" = right symbol, right dial. "Wrong place" = in the code, but on another dial.</p><div class="safecards">${cards}</div><div class="dials"></div><div class="msg"></div>`;
  const dials = $(".dials", body), msg = $(".msg", body), go = el("button", "btn", "Try the code"); foot.prepend(go);
  const draw = () => { dials.innerHTML = dial.map((v, i) => `<div class="dial"><button class="arr" data-i="${i}" data-d="-1">&#9650;</button><div class="face">${symSvg(SF.symbols[v])}</div><button class="arr" data-i="${i}" data-d="1">&#9660;</button></div>`).join(""); };
  draw();
  dials.onclick = (e) => { const b = e.target.closest(".arr"); if (!b) return; const i = +b.dataset.i; dial[i] = (dial[i] + +b.dataset.d + 6) % 6; draw(); };
  lockButton(go, "safe", "Try the code");
  go.onclick = () => {
    if (lockLeft("safe")) return; const guess = dial.map((v) => SF.symbols[v]);
    if (new Set(guess).size < 3) { msg.className = "msg"; msg.textContent = "All three symbols must be different."; return; }
    if (guess.every((g, i) => g === SF.answer[i])) return finishPuzzle(h, close);
    const r = L.cowBull(guess, SF.answer); msg.className = "msg bad"; msg.textContent = `The safe grumbles: ${r.right} in the right place, ${r.wrong} in the wrong place.`;
    wrongAnswer("safe", h.wrongKey); lockButton(go, "safe", "Try the code");
  };
}));

/* Room 7 part 2: five locks. Drag keys from the Key Ring tray onto the locks. */
const lockColors = ["#F2B24A", "#8FB4D9", "#B7A1E8", "#9AA0A8", "#3E8E85"];
Panels.locks = (h) => modal(makePanel("The Five Locks", h, ({ p, body, foot, close }) => {
  const K = G.puzzles.locks, ok = new Set(); S.phase = "locks";
  const shuf = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const perm = S.lockPerm || (S.lockPerm = shuf(K.inscriptions.map((_, i) => i))); // shuffled once per game so the answer is not "every other key, in line order"
  body.innerHTML = `<p class="small">Open the Key Ring below and drag a key onto each lock. Read what each lock says.</p><div class="locks">${perm.map((i) => [i, K.inscriptions[i]]).map(([i, t]) => `<div class="lockc"><div class="lk" data-t="${i}" style="--lc:${lockColors[i]}"><svg viewBox="0 0 40 40" fill="none" stroke="#C8A24A" stroke-width="3"><rect x="9" y="18" width="22" height="16" rx="3"/><path d="M13 18v-5a7 7 0 0 1 14 0v5"/></svg></div><p>${esc(t)}</p></div>`).join("")}</div><div class="msg">Tap <b>Key Ring</b> to open your keys.</div>`;
  const msg = $(".msg", body), tray = el("div", "keytray"); tray.hidden = true;
  const keyList = (S.trayOrder && S.trayOrder.length === S.keys.length ? S.trayOrder : (S.trayOrder = shuf(S.keys.slice()))).filter((k) => k !== "k_master");
  tray.innerHTML = keyList.map((k) => `<div class="k" data-id="${k}">${sprite(k, "")}<span>${esc(keyDef(k).name.replace(" Key", ""))}</span></div>`).join("");
  $("#app").append(tray); S.tray = tray;
  let dispose = () => {}; const cleanup = () => { document.body.classList.remove("tray-on"); dispose(); tray.remove(); S.tray = null; S.toggleTray = null; };
  const obs = new MutationObserver(() => { if (!p.isConnected) { cleanup(); obs.disconnect(); } }); obs.observe($("#modal-root"), { childList: true });
  S.toggleTray = () => { tray.hidden = !tray.hidden; document.body.classList.toggle("tray-on", !tray.hidden); msg.textContent = tray.hidden ? "Tap Key Ring to open your keys." : "Drag a key onto a lock. (Or tap a key, then a lock.)"; };
  dispose = dnd($("#app"), { sourceSel: ".keytray .k", targetSel: ".lk", ghost: (s) => s.querySelector("img,svg").outerHTML, onDrop: async (id, t) => {
    const i = +t.dataset.t; if (ok.has(i) || lockLeft("locks")) return;
    if (L.locksOk(i, id, K)) { Sfx.play("unlock"); ok.add(i); t.classList.add("ok"); t.innerHTML = sprite(id, ""); const r = t.getBoundingClientRect(); fx.lockGlow(i, lockColors[i], r.left + r.width / 2, r.top + r.height / 2);
      tray.querySelector(`[data-id="${id}"]`).style.opacity = .3; msg.className = "msg"; msg.textContent = `Lock ${i + 1} holds.`;
      if (ok.size === 5) { S.toggleTray = null; return finishPuzzle(h, close); } }
    else { const n = wrongAnswer("locks", h.wrongKey); msg.className = "msg bad"; msg.textContent = "That key does not fit."; }
  } });
  const go = el("button", "btn ghost", "Key Ring"); go.onclick = () => S.toggleTray && S.toggleTray(); foot.prepend(go);
}));

/* Room 7 part 3: the last turn */
Panels.turn = async (h) => {
  if (!h._opened) { h._opened = true; say(grp("s_warden")); say(grp("s_reply")); }
  const key = keyDef("k_master");
  return modal(makePanel("The Last Turn", h, ({ body, close }) => {
    body.innerHTML = `<p class="note">The Master Key is in the great lock. Which way will you turn it?</p><div class="turn">
      <button class="arrow cliff" data-w="cliff"><svg viewBox="0 0 24 24"><path d="M12 4l-8 8 8 8v-5h8V9h-8z"/></svg>Toward the cliff</button>
      <div class="mk">${sprite("k_master", "mk")}</div>
      <button class="arrow sea" data-w="sea"><svg viewBox="0 0 24 24"><path d="M12 4l8 8-8 8v-5H4V9h8z"/></svg>Toward the sea</button></div><div class="msg"></div>`;
    const msg = $(".msg", body); const mk = $(".mk", body);
    body.querySelector(".turn").onclick = async (e) => {
      const b = e.target.closest(".arrow"); if (!b || lockLeft("turn")) return;
      if (b.dataset.w === "cliff") { fx.cliffTurn(); mk.style.transition = "transform 1s"; mk.style.transform = "rotate(-90deg)"; await sleep(700); return finishPuzzle(h, close); }
      // Turning toward the sea is the losing ending: no retry.
      mk.style.transition = "transform .6s"; mk.style.transform = "rotate(90deg)"; fx.seaTurn(); msg.className = "msg bad"; msg.textContent = "Ink floods the cave...";
      await sleep(900); close(); await say(grp("s_sea")); startEnding("L");
    };
  }));
};

/* Closing choice (no Wards change) */
Panels.choice = (h) => modal(makePanel("The Closing Choice", h, ({ body, close }) => {
  const E = G.endings;
  body.innerHTML = `<p class="note">The Warden is sealed. Thirteen hooks wait on the great lock. What will Mara and Teo do?</p><div class="choices">
    <button class="choice" data-c="A"><b>${esc(E.A.choice)}</b><span>Hang every key on its hook. The house sleeps, and the keys are gone for good. Even the Memory Key.</span></button>
    <button class="choice b" data-c="B"><b>${esc(E.B.choice)}</b><span>Hang twelve keys and keep the Memory Key. Mara and Teo keep what they remember. One hook stays empty.</span></button></div>`;
  body.querySelector(".choices").onclick = (e) => { const b = e.target.closest(".choice"); if (!b) return; close(); complete(h); startEnding(b.dataset.c); };
}));

/* ====================== reward (Key A), rooms, doors ====================== */
async function autoRun() {
  for (const h of RM().hotspots) {
    if (h.kind !== "AUTO" || S.done.has(h.id) || h._busy || !afterOk(h)) continue;
    h._busy = true; const P = G.config.points;
    if (h.key) {
      S.keys.push(h.key); const k = keyDef(h.key), pts = h.points === "keyA" ? P.keyA : 0; if (pts) addWards(pts);
      complete(h);
      await card({ title: k.name, art: sprite(h.key, "spr"), cls: k.type === "M" ? "violet" : "gold", text: `${h.text} ${k.power}`, tag: pts ? `+${pts} Wards  ·  Added to your Key Ring` : "Added to your Key Ring", pts: true });
    }
    await runThen(h);
    if (RM().hotspots.some((x) => x.goto != null && x.after.includes(h.id))) toast("A way forward has appeared.", "good");
    if (h.id === "r7_master") { const t = RM().hotspots.find((x) => x.id === "r7_turn"); await doPanel(t); }
  }
}
async function goRoom(n) {
  const f = $("#fade") || (() => { const d = el("div"); d.id = "fade"; d.style.cssText = "position:absolute;inset:0;z-index:75;background:#05070d;opacity:0;pointer-events:none;transition:opacity .5s"; $("#app").append(d); return d; })();
  f.style.opacity = 1; await sleep(550);
  try { await loadRoom(n); } finally { f.style.opacity = 0; } // clear the black BEFORE the intro card and dialogue, which sit under it
  await enterRoom();
}
async function enterRoom() {
  const r = RM(); renderHUD(); $("#sight").hidden = true; S.phase = "";
  if (!S.seen.has(r.id)) {
    S.seen.add(r.id);
    S.introCard = true; await card({ title: `Room ${r.n}: ${r.name}`, text: r.intro, tag: "Objective: " + r.objective, cls: "gold" }); S.introCard = false;
  }
  if (r.id === "r7") { S.phase = "sight"; }
  await say(grp("enter"));
  // Room 7: the sight ring appears only after the player reads the carved note (see doLearn), never on entry
}

/* ====================== Room 7 part 1: sightline ====================== */
function startSight() {
  const C = G.config.sight, h = RM().hotspots.find((x) => x.id === "r7_sights"); if (S.done.has(h.id)) return;
  S.phase = "sight"; $("#sight").hidden = false; fx.sightRing(0); S.sightHold = 0; let last = performance.now(), busy = false;
  const loop = (now) => {
    if (S.room !== 6 || S.done.has(h.id) || !Room.viewer) { $("#sight").hidden = true; return; }
    const dt = now - last; last = now;
    if (!busy && S.mode === "play" && !S.pauseMenu && !currentModal) {
      const d = L.angDist(Room.viewer.getYaw(), Room.viewer.getPitch(), C.yaw, C.pitch);
      fx.sightRing(clamp(1 - (d - C.toleranceDeg) / (C.rangeDeg - C.toleranceDeg), 0, 1));
      S.sightHold = d <= C.toleranceDeg ? S.sightHold + dt : 0;
      if (S.sightHold >= C.holdMs) {
        busy = true; fx.lockOn(); $("#sight").hidden = true;
        sleep(600).then(async () => { await finishPuzzle(h, () => {}); S.phase = "locks"; Room.viewer.lookAt(RM().hotspots.find((x) => x.id === "r7_lock").pitch, 0, Room.viewer.getHfov(), 1500); });
        return;
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/* ====================== flashbacks ====================== */
async function flashback(id) {
  const f = G.flashbacks[id]; $("#sepia").classList.add("on");
  await say([{ speaker: "narrator", mood: "", text: f.caption, pausesTimer: false, audioFile: f.captionAudioFile }, ...f.lines], { flash: true });
  $("#sepia").classList.remove("on");
  addNote({ id: "fb_" + id, title: "Memory: " + (keyDef(G.keys.find((k) => k.flashback === id).id).name), text: f.lines.map((l) => l.text).join(" "), tag: "memory", fb: id });
}

/* ====================== hints ====================== */
function useHint() {
  if (!S || S.mode !== "play") return;
  if (S.hintsLeft <= 0) { toast(G.ui.noHints, "bad"); return; }
  if (S.wards < G.config.hintCost) { toast(G.ui.notEnoughWards, "bad"); return; }
  const r = RM(), ph = r.phases;
  for (let i = 1; i <= 3; i++) {
    const k = "hint" + i; if (S.hintUsed[r.id + k]) continue;
    if (ph && ph[i - 1] !== S.phase) continue;
    S.hintUsed[r.id + k] = true; S.hintsLeft--; addWards(-G.config.hintCost); say(r.dialogue[k]); renderHUD(); return;
  }
  toast("No more hints for this room.");
}
$("#btn-hint").onclick = useHint;

/* ====================== Book and Key Ring ====================== */
function holdToggle(id) {
  const c = S.held && combineFor(S.held, id);
  if (c) { closeTop(); doCombine(c); return; }
  S.held = S.held === id ? null : id; renderHUD();
}
const closeTop = () => currentModal && currentModal.close();
$("#holding-x").onclick = () => { S.held = null; renderHUD(); };
function openBook(tab = "items") {
  if (S.mode !== "play" || currentModal) return;
  modal((close) => {
    const p = el("div", "panel"), head = el("header"), body = el("div", "body"), tabs = el("div", "tabs");
    head.append(el("h2", "", "Your Book"), xbtn(close));
    ["items", "notes", "progress"].forEach((t) => { const b = el("button", "tab" + (t === tab ? " on" : ""), t[0].toUpperCase() + t.slice(1)); b.onclick = () => { tab = t; draw(); }; tabs.append(b); });
    const draw = () => {
      tabs.querySelectorAll(".tab").forEach((b, i) => b.classList.toggle("on", ["items", "notes", "progress"][i] === tab)); body.innerHTML = "";
      if (tab === "items") {
        if (!S.items.length) body.innerHTML = `<div class="empty">Nothing yet. Tap objects in the room to find things.</div>`;
        else { body.innerHTML = `<p class="small">Tap an item to hold it. Then tap what to use it on.</p>`; const g = el("div", "grid");
          S.items.forEach((id) => { const c = el("button", "cell" + (S.held === id ? " held" : ""), `${sprite(id, "")}<span>${esc(itemName(id))}</span>`); c.onclick = () => { holdToggle(id); if (currentModal) draw(); }; g.append(c); }); body.append(g); }
      } else if (tab === "notes") {
        if (!S.notes.length) body.innerHTML = `<div class="empty">Clues, diary pages and memories you find will be saved here.</div>`;
        S.notes.forEach((n) => { const d = el("div", "noteitem", `<span class="tg">${esc(n.tag)}</span><b>${esc(n.title)}</b>${esc(n.text)}`);
          if (n.fb) { const r = el("button", "btn replay", "Replay memory"); r.onclick = () => { close(); flashback(n.fb); }; d.append(r); } body.append(d); });
      } else {
        const g = el("div", "prog");
        G.rooms.forEach((r, i) => { const ka = S.keys.filter((k) => keyDef(k).room === r.n).length, un = i > S.room;
          g.append(el("div", "r" + (i === S.room ? " cur" : "") + (un ? " lock" : ""), `<b>${r.n}. ${un ? "???" : esc(r.name)}</b><span>${un ? "locked" : ka + " key" + (ka === 1 ? "" : "s")}</span>`)); });
        g.append(el("div", "r", `<b>Keys on the ring</b><span>${S.keys.length} / 13</span>`)); g.append(el("div", "r", `<b>Hints left</b><span>${S.hintsLeft} / 3</span>`)); body.append(g);
      }
    };
    p.append(head, tabs, body); draw(); return p;
  });
}
$("#btn-book").onclick = () => openBook();

function ringHTML(opts = {}) {
  const n = G.keys.length;
  return `<div class="ring">${G.keys.map((k, i) => { const a = i / n * Math.PI * 2 - Math.PI / 2, x = 50 + 39 * Math.cos(a), y = 50 + 39 * Math.sin(a), on = S.keys.includes(k.id) && !(opts.skip && opts.skip === k.id);
    return `<button class="hook ${on ? "on" : ""} ${opts.skip === k.id ? "empty-b" : ""}" data-k="${k.id}" style="left:${x}%;top:${y}%" aria-label="${esc(k.name)}">${on ? sprite(k.id, "") : ""}<small>${i + 1}</small></button>`; }).join("")}
    <div class="centre"><div><b>${opts.count != null ? opts.count : S.keys.length}</b>of 13 keys</div></div></div>`;
}
function openKeyRing() {
  if (S.mode !== "play") return;
  if (S.toggleTray) { S.toggleTray(); return; }
  if (currentModal) return;
  modal((close) => {
    const p = el("div", "panel"), head = el("header"), body = el("div", "body");
    head.append(el("h2", "", "The Key Ring"), xbtn(close)); body.innerHTML = ringHTML() + `<p class="small" style="text-align:center">Tap a key to see its power.</p>`;
    body.onclick = (e) => { const b = e.target.closest(".hook.on"); if (!b) return; close(); keyDetail(keyDef(b.dataset.k)); };
    p.append(head, body); return p;
  });
}
function keyDetail(k) {
  const buttons = [];
  if (k.flashback) buttons.push({ label: "Replay memory", cls: "ghost", fn: () => flashback(k.flashback) });
  if (k.type !== "M") buttons.push({ label: S.held && combineFor(S.held, k.id) ? "Use on " + itemName(S.held) : S.held === k.id ? "Put away" : "Hold this key", fn: () => holdToggle(k.id) });
  card({ title: k.name, art: sprite(k.id, ""), cls: "gold", text: k.power, tag: k.type === "B" ? "Memory key" : k.type === "A" ? "Door key" : "Master key", buttons });
}
$("#btn-keys").onclick = openKeyRing;

/* ====================== pause ====================== */
function openPause() {
  if (S.pauseMenu || S.mode === "title" || S.mode === "over") return;
  S.pauseMenu = true; document.body.classList.add("paused"); try { speechSynthesis.pause(); if (Voice.audio) Voice.audio.pause(); } catch (e) { /* ignore */ }
  const p = $("#pause"); p.hidden = false;
  p.innerHTML = `<div class="box"><h2>${G.ui.paused}</h2><button class="btn" id="p-res">Resume</button><button class="btn ghost" id="p-mus"></button><button class="btn ghost" id="p-nar"></button><button class="btn ghost" id="p-sfx"></button><button class="btn ghost" id="p-quit">Quit to title</button></div>`;
  $("#p-res").onclick = closePause;
  const lab = () => { $("#p-mus").textContent = "Music: " + (Music.on ? "On" : "Off"); $("#p-nar").textContent = "Narration: " + (Voice.on ? "On" : "Off"); $("#p-sfx").textContent = "Sound effects: " + (Sfx.on ? "On" : "Off"); Pref.save(); };
  $("#p-mus").onclick = () => { Music.setOn(!Music.on); lab(); };
  $("#p-nar").onclick = () => { Voice.on = !Voice.on; if (!Voice.on) cancelVoice(); lab(); };
  $("#p-sfx").onclick = () => { Sfx.on = !Sfx.on; lab(); if (Sfx.on) Sfx.play("pickup"); };
  lab();
  $("#p-quit").onclick = () => location.reload();
}
function closePause() { S.pauseMenu = false; document.body.classList.remove("paused"); $("#pause").hidden = true; try { speechSynthesis.resume(); if (Voice.audio && Voice.on) Voice.audio.play(); } catch (e) { /* ignore */ } }
$("#btn-pause").onclick = openPause;
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !S) return;
  if (S.pauseMenu) closePause(); else if (currentModal) currentModal.close(); else openPause();
});

/* ====================== start flow ====================== */
function screen(html, cls = "") { const s = $("#screen"); s.innerHTML = ""; const d = el("div", "scr " + cls, html); s.append(d); return d; }
const clearScreen = () => ($("#screen").innerHTML = "");
const KEYHOLE = `<svg class="keyhole" viewBox="0 0 40 60"><path d="M20 2a14 14 0 0 0-6 26.6L9 58h22l-5-29.4A14 14 0 0 0 20 2z"/></svg>`;
const SILH = `<svg class="silh" viewBox="0 0 400 120" preserveAspectRatio="none"><path d="M0 120V80l60-10 40 6 30-30 20 4 10-22 14 22 16-6 20 16 50-6 40 20 30-14 70 6 20-12 50 16V120z" fill="#0a0e18"/><path d="M180 70l6-26 8 26zM220 62h30v22h-30z" fill="#05070d"/><rect x="228" y="70" width="4" height="6" fill="#F2B24A"/></svg>`;
function showTitle() {
  S.mode = "title"; $("#hud").hidden = true;
  const bg = ART.singles.has("tap_to_start.jpg") ? `<div class="bg" style="background-image:url(assets/sheets/tap_to_start.jpg)"></div><div class="shade" style="opacity:.55"></div>` : SILH;
  const d = screen(`${bg}<div class="in">${ART.singles.has("tap_to_start.jpg") ? "" : KEYHOLE}<h1 class="title"><small>A Wardlow House mystery</small>The 13<br>Forgotten Keys</h1><div class="tapline">${G.ui.tapToStart}</div></div>`, "title-scr");
  d.style.cursor = "pointer";
  d.onclick = () => { Music.start(); narrate("", true); showMission(); };
}
function showMission() {
  S.mode = "mission"; const m = G.missionInfo;
  const bg = ART.singles.has("briefing_bg.jpg") ? `<div class="bg" style="background-image:url(assets/sheets/briefing_bg.jpg)"></div>` : SILH;
  const d = screen(`${bg}<div class="shade"></div><div class="in mission"><h1>${esc(m.heading)}</h1>${m.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}<button class="btn">${esc(m.button)}</button></div>`);
  narrate({ speaker: "narrator", text: m.heading + ". " + m.paragraphs.join(" "), audioFile: m.audioFile }); preloadVoice(G.opening[0]);
  d.querySelector(".btn").onclick = () => { cancelVoice(); startTutorial(); };
}
async function startTutorial() {
  clearScreen(); $("#hud").hidden = false; S.mode = "tutorial"; renderHUD();
  await loadRoom(0); $("#pano").classList.add("blur");
  const steps = G.tutorial, tut = $("#tut"); tut.hidden = false; let i = 0;
  await new Promise((done) => {
    const draw = () => {
      const s = steps[i], t = $(s.target); const r = s.target === "#pano" ? { left: innerWidth * .15, top: innerHeight * .3, width: innerWidth * .7, height: innerHeight * .3 } : t.getBoundingClientRect();
      const pad = 6, below = r.top + r.height / 2 < innerHeight / 2;
      tut.innerHTML = `<div class="hole" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + 2 * pad}px;height:${r.height + 2 * pad}px"></div>
        <div class="tcard" style="${below ? `top:${Math.min(r.top + r.height + 24, innerHeight - 250)}px` : `bottom:${innerHeight - r.top + 24}px`}"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>
        <div class="row"><button class="btn ghost" id="t-skip">Skip</button><div class="dots">${steps.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div><button class="btn" id="t-next">${i === steps.length - 1 ? "Got it" : "Next"}</button></div></div>`;
      $("#t-next").onclick = () => (++i >= steps.length ? done() : draw()); $("#t-skip").onclick = done;
    };
    draw();
  });
  tut.hidden = true; await startOpening();
}
async function startOpening() {
  S.mode = "opening"; await say(G.opening, { noHud: false });
  // play begins: sharpen, clock starts
  const pano = $("#pano"); pano.classList.add("sharpen"); pano.classList.remove("blur"); S.mode = "play"; S.lastAct = performance.now(); lastTick = performance.now();
  setTimeout(() => pano.classList.remove("sharpen"), G.config.sharpenMs + 100);
  await enterRoom();
}

/* ====================== endings ====================== */
async function startEnding(c) {
  S.mode = "ending"; S.choice = c; const E = G.endings[c]; S.ending = c; fx[E.fx](); document.body.classList.add("ending");
  await say(E.lines, { noHud: true }); showWin(c);
}
function showWin(c) {
  if (c === "L") return showLoss();
  const E = G.endings[c]; $("#hud").hidden = true; $("#find-strip").innerHTML = "";
  screen(`<div class="in endcard"><div class="sub">${c === "A" ? "Ending A" : "Ending B"}</div><h1>${esc(E.name)}</h1>${ringHTML({ skip: c === "B" ? "k_memory" : null, count: c === "B" ? 12 : 13 })}
    <div class="lab">Wards</div><div class="big">${S.wards}</div><button class="btn" id="again">Play again</button></div>`).style.background = "radial-gradient(ellipse at 50% 30%, #1d2a4acc, #0a0e18ee)";
  $("#again").onclick = () => location.reload();
}
function showLoss() {
  const E = G.endings.L; $("#hud").hidden = true; $("#find-strip").innerHTML = "";
  screen(`<div class="in endcard"><div class="sub">The Warden walks free</div><h1>${esc(E.name)}</h1><p class="q">The Master Key turned toward the sea.</p><div class="lab">Wards</div><div class="big">${S.wards}</div><button class="btn" id="again">Try again</button></div>`).style.background = "radial-gradient(ellipse at 50% 30%, #0b1020dd, #020308f2)";
  $("#again").onclick = () => location.reload();
}
async function timeUp() {
  if (S.mode === "over") return; S.mode = "over"; closeAllModals(); clearDialogue(); cancelVoice(); S.pauseMenu = false; closePause(); $("#sight").hidden = true; document.body.classList.remove("dlg-on");
  fx.tide(); await sleep(2500); $("#hud").hidden = true;
  screen(`<div class="in endcard"><div class="sub">Time is up</div><h1>The Tide Came In</h1><p class="q">${esc(G.ui.timeUpLine)}</p><div class="lab">Wards so far</div><div class="big">${S.wards}</div><button class="btn" id="again">Try again</button></div>`).style.background = "transparent";
  narrate({ speaker: "narrator", text: G.ui.timeUpLine, audioFile: G.ui.timeUpAudioFile }); $("#again").onclick = () => location.reload();
}

/* ====================== debug (localhost + ?debug=1 only) ====================== */
function setupDebug() {
  const bar = $("#debugbar"); bar.hidden = false;
  bar.innerHTML = `<span id="dbg-pos">yaw/pitch: click the room</span> <select id="dbg-room">${G.rooms.map((r, i) => `<option value="${i}">R${r.n}</option>`).join("")}</select><button id="dbg-go">jump</button><button id="dbg-t">-60s</button><button id="dbg-lab">labels</button><button id="dbg-val">validate</button>`;
  $("#dbg-go").onclick = () => debugJump(+$("#dbg-room").value); $("#dbg-t").onclick = () => (S.time = Math.max(1, S.time - 60));
  $("#dbg-lab").onclick = () => document.body.classList.toggle("labels"); $("#dbg-val").onclick = () => alert(L.validate(G).join("\n") || "validate(): no errors");
  $("#pano").addEventListener("click", (e) => { if (Room.viewer && !Room.moved) { const [p, y] = Room.viewer.mouseEventToCoords(e); $("#dbg-pos").textContent = `yaw ${y.toFixed(1)}  pitch ${p.toFixed(1)}`; console.log("yaw", y.toFixed(1), "pitch", p.toFixed(1)); } });
}
async function debugJump(n) { // grant everything from earlier rooms and start playing in room n
  closeAllModals(); clearDialogue(); clearScreen(); $("#hud").hidden = false; $("#tut").hidden = true;
  for (let i = 0; i < n; i++) G.rooms[i].hotspots.forEach((h) => { S.done.add(h.id); if (h.item && !S.items.includes(h.item)) S.items.push(h.item); if (h.key && !S.keys.includes(h.key)) S.keys.push(h.key); });
  S.seen.add(G.rooms[n].id); S.mode = "play"; $("#pano").classList.remove("blur"); await loadRoom(n); await say(grp("enter"));
}

/* ====================== boot ====================== */
async function boot() {
  try {
    G = await (await fetch("game.json")).json();
  } catch (e) { document.body.innerHTML = `<p class="boot">Could not load game.json. Start a local server: <code>python -m http.server</code> and open http://localhost:8000</p>`; return; }
  const errs = L.validate(G); if (errs.length) console.error("validate():", errs);
  try { const m = await (await fetch("assets/cut/manifest.json", { cache: "no-store" })).json(); ART.v = m.v || 0; m.cut.forEach((n) => ART.cut.add(n)); m.singles.forEach((n) => ART.singles.add(n)); } catch (e) { /* no art yet: fallbacks */ }
  S = freshState(); fx.init($("#fx"), $("#fx-ink"), $("#app"), $("#sight"));
  if (DEBUG) { setupDebug(); window.__G = { G, S, Room, say, card, loadRoom, goRoom, debugJump, fx, L, get modal() { return currentModal; }, onHotspot, refreshHotspots, Dlg, finishPuzzle, startEnding, timeUp }; }
  showTitle();
}
boot();
})();
