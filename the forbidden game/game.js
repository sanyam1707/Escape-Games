"use strict";
// The Forbidden Game. All text/numbers come from game.json. Puzzle rules: logic.js. Panels: panels.js.
const $ = s => document.querySelector(s);
const Q = new URLSearchParams(location.search);
const DEBUG = false; // production build
let G, viewer;
const HAS = new Set();
const S = { phase: "boot", timeLeft: 0, pips: 0, peril: 0, perilAcc: 0, hints: 0, voice: true, pauses: new Set(), idle: 0,
  roomIdx: 0, room: null, done: new Set(), items: [], held: null, clues: [], rules: [], tiles: [], wrongs: 0, bank: {}, ps: {},
  intro: {}, busy: false, panel: null, exitOpen: false, skipSeq: false };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k]);
const hasArt = n => HAS.has(n);
function sprite(name, glyph) {
  if (HAS.has(name)) { const i = new Image(); i.src = `${G.art.cutDir}${name}.png`; i.alt = ""; i.draggable = false; return i; }
  const s = document.createElement("span"); s.className = "fb"; s.textContent = glyph || "◆"; return s;
}

/* ---------- validate(): data errors fail loudly; missing art is a warning (fallbacks cover it) ---------- */
async function validate(g) {
  const errors = [], warnings = [], ids = new Set(), files = [];
  const line = id => g.dialogue[id];
  for (const [id, d] of Object.entries(g.dialogue)) {
    if (typeof d.pausesTimer !== "boolean") errors.push(`dialogue ${id}: pausesTimer missing`);
    if (!g.speakers[d.speaker]) errors.push(`dialogue ${id}: unknown speaker ${d.speaker}`);
  }
  for (const o of [...g.opening, ...g.ending]) if (o.pausesTimer !== true || !g.speakers[o.speaker]) errors.push(`${o.id}: needs pausesTimer true and a known speaker`);
  const given = new Set();
  g.rooms.forEach((r, ri) => {
    const hs = r.hotspots, rid = new Set(hs.map(h => h.id));
    for (const h of hs) {
      if (ids.has(h.id)) errors.push(`duplicate hotspot id ${h.id}`);
      ids.add(h.id);
      for (const a of h.after) if (!rid.has(a)) errors.push(`${h.id}: unknown after '${a}'`);
      if (h.line && !line(h.line)) errors.push(`${h.id}: missing line ${h.line}`);
      if (h.kind === "PANEL" && !g.puzzles[h.id]) errors.push(`${h.id}: no puzzle data`);
      if (h.kind === "USE" && !g.items[h.needs]) errors.push(`${h.id}: unknown item ${h.needs}`);
      if (h.kind === "USE" && !given.has(h.needs)) errors.push(`${h.id}: item ${h.needs} is not given by an earlier room`);
      if (h.gives && !g.items[h.gives]) errors.push(`${h.id}: unknown gives ${h.gives}`);
      if (h.gives) given.add(h.gives);
      if (["FIND", "LEARN", "INSPECT"].includes(h.kind) && !h.card) errors.push(`${h.id}: needs a card`);
    }
    const st = {}; // 1 visiting, 2 done: after cycles
    const visit = (id, path) => {
      if (st[id] === 2) return; if (st[id] === 1) return errors.push(`after cycle: ${[...path, id].join(" > ")}`);
      st[id] = 1; (hs.find(h => h.id === id)?.after || []).forEach(a => rid.has(a) && visit(a, [...path, id])); st[id] = 2;
    };
    hs.forEach(h => visit(h.id, []));
    if (!hs.some(h => h.terminal)) errors.push(`room ${r.id}: no terminal AUTO hotspot`);
    if (r.reward && r.reward.helper) given.add(r.reward.helper);
    if (ri < g.rooms.length - 1 && !r.exit) errors.push(`room ${r.id}: no exit`);
    for (const id of [...r.enter, ...r.right]) if (!line(id)) errors.push(`room ${r.id}: missing line ${id}`);
    files.push(r.file);
  });
  for (const [id, p] of Object.entries(g.puzzles)) for (const b of p.bank) if (!line(b)) errors.push(`puzzle ${id}: missing bank line ${b}`);
  files.push(g.art.startArt, g.art.briefingBg);
  g.cutNames.forEach(n => HAS.has(n) || warnings.push(`missing cut art (fallback used): ${n}`));
  await Promise.all(files.map(f => fetch(f, { method: "HEAD" }).then(x => x.ok || warnings.push("missing file (fallback used): " + f), () => warnings.push("missing file (fallback used): " + f))));
  return { errors, warnings };
}

/* ---------- voice: the one narrate() ---------- */
let audio = null;
const AUD = {}; // recorded lines, loaded ahead of time
const lineOf = x => (typeof x === "string" ? G.dialogue[x] : x);
function preload(x) { const f = lineOf(x)?.audioFile; if (f && !AUD[f]) { const a = new Audio(f); a.preload = "auto"; AUD[f] = a; } }
function stopNarration() { try { speechSynthesis.cancel(); } catch {} if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio.currentTime = 0; audio = null; } } // never two voices at once
function speak(e, speaker) { // browser voice: only for lines that have no recorded file
  const sp = G.speakers[e.speaker || speaker];
  if (!("speechSynthesis" in window) || !sp || sp.voiced === false) return;
  const u = new SpeechSynthesisUtterance(e.text); u.pitch = sp.pitch; u.rate = sp.rate; u.lang = "en-US"; speechSynthesis.speak(u);
}
function narrate(x, speaker) {
  const e = typeof x === "string" ? G.dialogue[x] || { text: x, speaker } : x;
  stopNarration();
  if (!S.voice) return;
  if (e.audioFile) {
    const a = AUD[e.audioFile] || (AUD[e.audioFile] = new Audio(e.audioFile)); a.currentTime = 0; audio = a;
    a.onerror = () => { if (audio === a) { audio = null; speak(e, speaker); } };
    a.play().catch(err => { if (audio === a && err.name !== "NotAllowedError") { audio = null; speak(e, speaker); } });
    return;
  }
  speak(e, speaker);
}

/* ---------- timer, Pips, Peril ---------- */
const mmss = s => `${Math.floor(Math.max(0, Math.ceil(s)) / 60)}:${String(Math.max(0, Math.ceil(s)) % 60).padStart(2, "0")}`;
function setPause(reason, on) { on ? S.pauses.add(reason) : S.pauses.delete(reason); }
let last = performance.now();
setInterval(() => {
  const now = performance.now(), dt = (now - last) / 1000; last = now;
  if (S.phase !== "play" || S.pauses.size) return;
  S.timeLeft -= dt; S.idle += dt;
  if (!cur && !S.busy && $("#card").hidden) { S.perilAcc += dt; if (S.perilAcc >= G.config.perilStepSeconds) { S.perilAcc = 0; addPeril(1); } }
  if (S.idle >= G.config.idleSeconds && !cur && !S.panel && !S.busy) { S.idle = 0; say(["idle"]); pulseNext(); showWhat(G.ui.what.play, 5000); }
  $("#time").textContent = mmss(S.timeLeft);
  if (S.timeLeft <= 0) timeUp();
}, 200);
addEventListener("pointerdown", () => (S.idle = 0), true);

function addPips(n) {
  S.pips = GameLogic.clampPips(S.pips + n); $("#pips").textContent = S.pips;
  if (!n) return; const f = document.createElement("div"); f.className = "floatpips" + (n < 0 ? " neg" : ""); f.textContent = (n > 0 ? "+" : "") + n;
  $("#hud-pips").appendChild(f); setTimeout(() => f.remove(), 1200);
}
/* ---------- Danger (the Peril) as a percentage; the room itself shows it ---------- */
const SVGNS = "http://www.w3.org/2000/svg";
let dangerUpdate = () => {}, dangerResize = () => {};
const DANGER_LOOP = { peril_vines: "creak", peril_spiders: "skitter", peril_dust: "rumble", peril_water: "water", peril_sand: "wind", peril_fog: "drone", peril_cracks: "creak" };
const pct = () => Math.round(S.peril / G.config.perilSteps * 100);
function addPeril(n) { S.peril = Math.min(G.config.perilSteps, S.peril + n); sfx("rumble"); drawPeril(); if (S.peril >= G.config.perilSteps) endRun(G.ui.caught, { name: S.room.perilName }); }
function drawPeril() {
  const p = pct(), c = $("#hud-danger"), dv = Math.max(S.peril / G.config.perilSteps, S.boost || 0); $("#danger-pct").textContent = p + "%";
  c.dataset.lv = p >= 70 ? "hot" : p >= 40 ? "mid" : "low"; c.querySelector("i").style.width = p + "%";
  $("#perilfx").style.setProperty("--pf", dv >= .6 ? (dv * 100 - 50) / 50 : 0); dangerUpdate(dv);
  const lp = DANGER_LOOP[S.room.peril]; if (lp) loopSet(lp, dv * .45);
}
function endRun(t, vars = {}) { // time up, or Danger reached 100%
  if (S.phase === "over") return;
  S.phase = "over"; loopStopAll(); stopNarration(); cur = null; $("#dlg").hidden = true; $("#panel").hidden = true; $("#card").hidden = true; $("#casebook").hidden = true;
  $("#tu-title").textContent = t.title; $("#tu-line").textContent = fmt(t.line, vars); $("#tu-btn").textContent = t.button; $("#tu-review").textContent = t.review;
  $("#timeup").hidden = false; sfx("sting");
}
const timeUp = () => { endRun(G.ui.timeUp); $("#time").textContent = "0:00"; fx("vines sealed"); };

// seeded organic vines: a wavy stem that grows, with leaves that pop in along it. p = 0..1
const VINES = [ // x,y in screen fractions, a = degrees clockwise from "up", len as fraction of height
  { x: .03, y: 1.03, a: 8, len: 1.0, s: 1, g: "A" }, { x: .97, y: 1.03, a: -8, len: .95, s: 2, g: "A" }, { x: -.03, y: .62, a: 75, len: .5, s: 3, g: "A" },
  { x: 1.03, y: .58, a: -75, len: .5, s: 4, g: "A" }, { x: .27, y: 1.03, a: -4, len: .5, s: 5, g: "A" }, { x: .78, y: 1.03, a: 5, len: .45, s: 6, g: "A" },
  { x: .12, y: -.03, a: 178, len: .7, s: 7, g: "B" }, { x: .9, y: -.03, a: -178, len: .72, s: 8, g: "B" }, { x: -.03, y: .25, a: 100, len: .5, s: 9, g: "B" }, { x: 1.03, y: .3, a: -100, len: .5, s: 10, g: "B" }];
const LEAF = "M0 0C6 -9 20 -11 32 0C20 11 6 9 0 0Z", GREENS = ["#3f8f48", "#2f7a3c", "#58a850", "#2a6a37"];
function makeVines(svg, W, H, scale = 1) {
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.replaceChildren(); const out = [];
  for (const v of VINES) {
    let x = v.x * W, y = v.y * H, a = v.a; const n = Math.round(v.len * H / 12), pts = [], leaves = [];
    for (let i = 0; i < n; i++) {
      pts.push([x, y]); a += Math.sin(i * .11 + v.s) * 2.2 + Math.cos(i * .047 + v.s * 2) * 1.1;
      const r = a * Math.PI / 180; x += Math.sin(r) * 12; y -= Math.cos(r) * 12;
      if (i > 5 && i % 3 === 0) leaves.push({ x, y, rot: Math.atan2(-Math.cos(r), Math.sin(r)) * 180 / Math.PI + (i % 6 ? 52 : -52), sc: (.55 + ((i * 37 + v.s * 11) % 10) / 14) * scale, t: i / n, c: GREENS[(i + v.s) % 4] });
    }
    let d = `M${pts[0][0]} ${pts[0][1]}`; for (let i = 1; i < pts.length - 1; i++) d += `Q${pts[i][0]} ${pts[i][1]} ${(pts[i][0] + pts[i + 1][0]) / 2} ${(pts[i][1] + pts[i + 1][1]) / 2}`;
    const g = document.createElementNS(SVGNS, "g"), mk = (cls, w) => { const e = document.createElementNS(SVGNS, "path"); e.setAttribute("d", d); e.setAttribute("class", cls); g.appendChild(e); return e; };
    const stem = mk("vstem"), hi = mk("vhi"), len = stem.getTotalLength(); [stem, hi].forEach(e => { e.style.strokeDasharray = len; e.style.strokeDashoffset = len; });
    const ls = leaves.map(l => { const e = document.createElementNS(SVGNS, "path"); e.setAttribute("d", LEAF); e.setAttribute("class", "vleaf"); e.style.fill = l.c; e.style.transformOrigin = "0 0"; g.appendChild(e); return { ...l, e }; });
    svg.appendChild(g); out.push({ stem, hi, len, ls, g: v.g, p: -1 });
  }
  return out;
}
function setVine(v, p) {
  p = Math.max(0, Math.min(1, p)); if (v.p === p) return; v.p = p;
  v.stem.style.strokeDashoffset = v.hi.style.strokeDashoffset = v.len * (1 - p);
  v.ls.forEach(l => (l.e.style.transform = `translate(${l.x}px,${l.y}px) rotate(${l.rot}deg) scale(${p >= l.t ? l.sc : 0})`));
}
function tween(fn, ms) { const t0 = performance.now(); const f = t => { const k = Math.min(1, (t - t0) / ms); fn(k); if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); }
let cutVines = [], cutSize = "";
function growVines(cls) { // cutscene vines: bursting through the floor, then sealing the door and window
  const svg = $("#fx .vinesvg"), size = innerWidth + "x" + innerHeight;
  if (cutSize !== size || cls.includes("vines") && !cls.includes("sealed")) { cutVines = makeVines(svg, innerWidth, innerHeight); cutSize = size; }
  const grow = grp => tween(k => cutVines.filter(v => v.g === grp).forEach(v => setVine(v, k)), 2600);
  if (cls.includes("vines") && !cls.includes("sealed")) grow("A");
  if (cls.includes("sealed")) { if (cutVines[0].p < 1) grow("A"); grow("B"); }
}

let dRaf = 0;
function canvasLayer(h, draw) { // a full-screen canvas redrawn every frame; returns update(d)
  const c = document.createElement("canvas"); c.className = "dcanvas"; h.append(c); const x = c.getContext("2d"); let d = 0, last = performance.now();
  const fit = () => { c.width = innerWidth; c.height = innerHeight; }; fit(); dangerResize = () => { fit(); drawPeril(); };
  cancelAnimationFrame(dRaf);
  const loop = t => { const dt = Math.min(.05, (t - last) / 1000); last = t; if (!S.pauses.has("menu")) { x.clearRect(0, 0, c.width, c.height); if (d > 0) draw(x, c.width, c.height, t / 1000, dt, d); } dRaf = requestAnimationFrame(loop); };
  dRaf = requestAnimationFrame(loop);
  return nd => { d = nd; };
}
// one drawn scene effect per room; each returns update(d) with d = 0..1
const dEl = (cls, html = "") => { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; return d; };
const DG = {
  peril_vines(h) {
    const svg = document.createElementNS(SVGNS, "svg"); svg.setAttribute("class", "dvines"); h.append(svg); let vs = [];
    const build = () => (vs = makeVines(svg, innerWidth, innerHeight, 1.5)); build(); dangerResize = () => { build(); drawPeril(); };
    return d => vs.forEach(v => setVine(v, d * 1.04));
  },
  peril_spiders(h) {
    const sp = [8, 27, 49, 71, 91].map(x => { const e = dEl("spd", `<i></i><b>${sprite("peril_spiders", "🕷").outerHTML}</b>`); e.style.left = x + "%"; h.append(e); return e; });
    return d => sp.forEach((e, i) => { const k = Math.max(0, Math.min(1, d * 2.4 - i * .2)); e.style.transform = `translateY(${-50 + k * (320 + (i % 3) * 90)}px)`; e.style.opacity = 1; });
  },
  peril_dust(h) { // stampede: rising dust puffs, a hazy ground and a trembling view
    const base = dEl("dust"); h.append(base); const parts = [];
    const upd = canvasLayer(h, (x, W, H, t, dt, d) => {
      const want = d > 0 ? 8 + d * 50 : 0; while (parts.length < want) parts.push({ x: Math.random() * W, y: H * (.35 + Math.random() * .75), r: 50 + Math.random() * 110, v: 40 + Math.random() * 70, life: Math.random() * .6 });
      for (const p of parts) {
        p.y -= p.v * dt * (.6 + d * 1.6); p.x += Math.sin(t + p.r) * 14 * dt; p.life += dt * .16;
        if (p.y < H * .2 || p.life > 1) { p.y = H + p.r; p.x = Math.random() * W; p.life = 0; }
        const al = Math.sin(Math.min(1, p.life) * Math.PI) * (.2 + d * .45), g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, `rgba(238,205,150,${al})`); g.addColorStop(1, "rgba(238,205,150,0)"); x.fillStyle = g; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 7); x.fill();
      }
    });
    return d => { base.style.opacity = Math.min(1, d * 1.3); upd(d); const r = d > .05 ? Math.min(3.2, d * 3.5) : 0; const pano = $("#pano"); pano.style.setProperty("--rum", r); pano.classList.toggle("rumble", r > 0); };
  },
  peril_water(h) {
    const w = dEl("water", `<svg viewBox="0 0 400 20" preserveAspectRatio="none"><path d="M0 10Q25 0 50 10T100 10T150 10T200 10T250 10T300 10T350 10T400 10T450 10T500 10T550 10T600 10T650 10T700 10T750 10T800 10V20H0Z"/></svg><div></div>`);
    h.append(w); return d => (w.style.height = (d > 0 ? 6 + d * 44 : 0) + "%");
  },
  peril_sand(h) { // sandstorm: thickening haze, drifting dust clouds and fast wind streaks
    const ps = [];
    return canvasLayer(h, (x, W, H, t, dt, d) => {
      x.fillStyle = `rgba(201,140,60,${.12 + d * .4})`; x.fillRect(0, 0, W, H);
      const wall = x.createLinearGradient(0, 0, W, 0); wall.addColorStop(0, `rgba(140,85,30,${.1 + .5 * d})`); wall.addColorStop(.7, "rgba(140,85,30,0)"); x.fillStyle = wall; x.fillRect(0, 0, W, H);
      for (let k = 0; k < 6; k++) {
        const bx = ((t * (90 + k * 35) + k * 420) % (W + 700)) - 350, by = H * (.15 + .13 * k) + Math.sin(t * .7 + k) * 60, r = 150 + k * 35, g = x.createRadialGradient(bx, by, 0, bx, by, r);
        g.addColorStop(0, `rgba(190,130,60,${.16 + d * .34})`); g.addColorStop(1, "rgba(190,130,60,0)"); x.fillStyle = g; x.beginPath(); x.arc(bx, by, r, 0, 7); x.fill();
      }
      const want = 140 + d * 420; while (ps.length < want) ps.push({ x: Math.random() * W, y: Math.random() * H, v: 700 + Math.random() * 1100, l: 40 + Math.random() * 120 });
      x.lineWidth = 2.2;
      for (const p of ps) { p.x += p.v * dt * (.6 + d); if (p.x > W + 80) { p.x = -80; p.y = Math.random() * H; } x.strokeStyle = `rgba(255,236,196,${.3 + d * .4})`; x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x - p.l * (.6 + d), p.y + p.l * .08); x.stroke(); }
    });
  },
  peril_fog(h) { // real fog: soft drifting clouds, a thick ground bank, and the view blurs as it thickens
    const veil = dEl("fogveil"), ground = dEl("fogground");
    const blobs = Array.from({ length: 9 }, (_, i) => { const b = dEl("fogb"), z = 40 + ((i * 37) % 30); b.style.cssText = `width:${z}vmax;height:${z * .6}vmax;left:${(i * 13) % 90 - 10}%;top:${25 + ((i * 29) % 60)}%;animation-duration:${18 + i * 3}s;animation-delay:-${i * 2}s`; return b; });
    h.append(veil, ...blobs, ground);
    return d => { veil.style.setProperty("--fb", (d * 2.5).toFixed(2) + "px"); veil.style.background = `rgba(200,180,230,${(d * .4).toFixed(2)})`; blobs.forEach((b, i) => (b.style.opacity = Math.max(0, Math.min(1, d * 1.8 - i * .05)))); ground.style.opacity = Math.min(1, d * 2); };
  },
  peril_cracks(h) { // Room 7: the giant dice hang in the dark, lower as danger rises, and crash down at the end
    const spec = [[8, 150, .42], [24, 112, .55], [50, 96, .1], [76, 124, .55], [92, 142, .4]]; // the middle stays clear: the Keeper and the hub are tapped there
    const ds = spec.map(([x, sz, fy], i) => {
      const e = dEl("gd", `<div class="gsway" style="animation-delay:-${i * .9}s"><i class="gchain"></i><div class="gcube" style="--s:${sz}px;animation-duration:${16 + i * 3}s">${cubeFaces()}</div></div>`);
      e.style.left = x + "%"; e.style.marginLeft = -sz / 2 + "px"; e.style.setProperty("--s", sz + "px"); h.append(e); return { e, sz, fy };
    });
    return d => {
      const H = innerHeight;
      ds.forEach(({ e, sz, fy }, i) => { const k = Math.max(0, Math.min(1.3, d * 1.7 - i * .12)), y0 = -(sz + 60), y1 = H * fy; e.style.transform = `translateY(${y0 + k * (y1 - y0)}px)`; });
      const r = d > .45 ? Math.min(3.2, (d - .4) * 5) : 0, pano = $("#pano"); pano.style.setProperty("--rum", r); pano.classList.toggle("rumble", r > 0);
    };
  }
};
function buildDanger(room) {
  const h = $("#danger"); loopStopAll(); cancelAnimationFrame(dRaf); $("#pano").classList.remove("rumble"); h.replaceChildren(); dangerResize = () => {}; dangerUpdate = (DG[room.peril] || (() => () => {}))(h);
  $("#danger-ico").replaceChildren(sprite(room.peril, "⚠")); drawPeril();
}
addEventListener("resize", () => dangerResize());

/* ---------- dialogue: one line at a time, taps drive it, nothing auto-advances ---------- */
let cur = null, holdT = 0;
function say(items, { cut = false } = {}) {
  return new Promise(done => {
    let i = 0;
    const end = () => { duckMusic(false); stopNarration(); clearTimeout(holdT); setPause("dialogue", false); cur = null; $("#dlg").hidden = true; document.dispatchEvent(new CustomEvent("dialogue-finished")); done(); };
    const show = () => {
      if (i >= items.length) return end();
      const e = typeof items[i] === "string" ? G.dialogue[items[i]] : items[i], sp = G.speakers[e.speaker];
      duckMusic(true); clearTimeout(holdT); const hold = e.pausesTimer ? Math.max(1200, e.text.length * 65 + 400) : 0; // paused only while the line is being spoken
      setPause("dialogue", hold > 0); if (hold) holdT = setTimeout(() => setPause("dialogue", false), hold);
      $("#dlg").classList.toggle("cut", cut);
      $("#dlg-card").textContent = e.card || ""; $("#dlg-name").textContent = sp.name; $("#dlg-text").textContent = e.text;
      portrait(sp); if (e.fx !== undefined && cut) fx(e.fx);
      $("#dlg").hidden = false; narrate(e); preload(items[i + 1]);
      if (hold > 0 && audio) { // stop the clock exactly when the recorded line ends (30 s safety)
        clearTimeout(holdT); holdT = setTimeout(() => setPause("dialogue", false), 30000);
        audio.onended = () => { clearTimeout(holdT); setPause("dialogue", false); };
      }
    };
    if (cur) cur.end(); // a new sequence replaces a running one
    cur = { next() { stopNarration(); i++; show(); }, end };
    show();
  });
}
function portrait(sp) {
  const p = $("#dlg-port"); p.textContent = sp.name.replace(/^The /, "")[0];
  if (!sp.portrait || !HAS.has(sp.portrait)) return;
  p.replaceChildren(sprite(sp.portrait));
}
// fx classes drive the drawn cutscene effects in style.css
const FXSOUND = { rain: "thunder", glow: "chime", dice: "dice", flash: "whoosh", vines: "rustle", sealed: "rumble", goldglow: "chime", seventh: "chime" };
function fx(classes) { if (classes) classes.split(" ").forEach(c => { if (FXSOUND[c] && !fx.last?.includes(c)) sfx(FXSOUND[c]); }); fx.last = classes || ""; if (classes && classes.includes("rain")) loopSet("rain", .45); else loopStop("rain"); const f = $("#fx"); f.hidden = !classes; f.className = classes || ""; if (classes) { void f.offsetWidth; f.className = classes; if (/vines|sealed/.test(classes)) growVines(classes); } }
$("#dlg").addEventListener("click", e => { if (e.target.id !== "dlg-skip") cur?.next(); });
$("#dlg-skip").addEventListener("click", () => { if (S.phase === "ending") S.skipSeq = true; cur?.end(); });

/* ---------- panorama with fallback ---------- */
function fallbackPano(room) {
  const c = document.createElement("canvas"); c.width = 2048; c.height = 1024; const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, 1024); g.addColorStop(0, "#120c07"); g.addColorStop(.5, room.accent); g.addColorStop(1, "#120c07");
  x.fillStyle = g; x.fillRect(0, 0, 2048, 1024); x.fillStyle = "#0006"; x.fillRect(1024 - 70, 380, 140, 300); x.beginPath(); x.arc(1324, 400, 90, 0, 7); x.fill();
  return c.toDataURL("image/jpeg", .8);
}
function loadRoom(room, yaw = room.startYaw || 0) {
  return new Promise(res => {
    const img = new Image(); img.onload = () => go(room.file); img.onerror = () => go(fallbackPano(room)); img.src = room.file;
    function go(url) {
      try { viewer?.destroy(); } catch {}
      viewer = pannellum.viewer("pano", { type: "equirectangular", panorama: url, autoLoad: true, showControls: false, compass: false, hfov: 100, minHfov: 60, maxHfov: 120, yaw, pitch: 0 });
      viewer.on("load", res); setTimeout(res, 5000);
    }
  });
}

/* ---------- start flow: Tap to Start > Mission Info > tutorial > opening > play ---------- */
let roomReady;
function startFlow() {
  audioInit();
  S.phase = "mission"; S.room = G.rooms[0];
  roomReady = loadRoom(S.room); $("#pano").classList.add("blur");
  $("#start").hidden = true; $("#mission").hidden = false;
  narrate({ speaker: G.mission.speaker, text: [G.mission.heading, ...G.mission.paragraphs].join(" "), audioFile: G.mission.audioFile }); // read once; Begin stops it
}
function prepHud() { // real HUD values behind the tutorial so the spotlight points at real things
  const r = S.room; document.documentElement.style.setProperty("--accent", r.accent);
  $("#hud-obj").textContent = r.objective; $("#time").textContent = mmss(G.config.timerSeconds); $("#hints").textContent = G.config.hintsTotal; S.peril = 0; buildDanger(r); renderFind();
}
async function tutorial() {
  stopNarration(); $("#mission").hidden = true; await roomReady;
  S.phase = "tutorial"; prepHud(); $("#hud").hidden = false; $("#tut").hidden = false;
  const T = G.tutorial, cards = T.cards; let i = 0; $("#tut-skip").textContent = T.skip;
  await new Promise(done => {
    const show = () => {
      const c = cards[i], el = c.target && $(c.target), card = $("#tut-card"), spot = $("#spot");
      $("#tut-text").textContent = c.text; $("#tut-next").textContent = i === cards.length - 1 ? T.done : T.next;
      $("#tut-dots").innerHTML = cards.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("");
      $("#tut").classList.toggle("notarget", !el);
      const art = $("#tut-art"); art.className = c.art || ""; art.innerHTML = c.art === "drag" ? `<div class="dragdemo"><span class="trail"></span><span class="touch"></span></div>`
        : c.art === "kinds" ? `<div class="kindsdemo">${T.kinds.map(([k, l]) => `<div><div class="hs hs-${k}">${k === "FIND" ? sprite("item_lantern", "◆").outerHTML : { LEARN: "i", USE: "✋" }[k] || ""}</div><small>${l}</small></div>`).join("")}</div>` : "";
      const r = el?.getBoundingClientRect();
      if (r) { Object.assign(spot.style, { left: r.left - 6 + "px", top: r.top - 6 + "px", width: r.width + 12 + "px", height: r.height + 12 + "px" }); }
      card.style.top = card.style.bottom = "auto"; // keep the card away from the thing it points at
      if (r && r.top > innerHeight / 2) card.style.top = "120px"; else card.style.bottom = r ? "24px" : "120px";
    };
    $("#tut-next").onclick = () => (++i < cards.length ? show() : done());
    $("#tut-skip").onclick = done; show();
  });
  stopNarration(); $("#tut").hidden = true; opening();
}
async function opening() {
  S.phase = "opening"; $("#hud").hidden = true; $("#danger").hidden = true; await say(G.opening, { cut: true });
  fx(""); $("#hud").hidden = false; play();
}
function play() {
  S.phase = "play"; S.timeLeft = G.config.timerSeconds; S.hints = G.config.hintsTotal; last = performance.now();
  $("#hints").textContent = S.hints; $("#pips").textContent = S.pips; $("#time").textContent = mmss(S.timeLeft);
  $("#pano").classList.remove("blur"); // sharpens over ~1.2 s, timer starts now
  enterRoom();
}

/* ---------- a room: dice roll, enter lines, hotspots ---------- */
const FACES = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const ORI = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] }; // rotation that shows each face to the front
const cubeFaces = () => [1, 6, 3, 4, 2, 5].map(n => `<div class="face f${n}">${Array.from({ length: 9 }, (_, k) => `<i class="${FACES[n].includes(k) ? "p" : ""}"></i>`).join("")}</div>`).join("");
const cubeHTML = () => `<div class="cube">${cubeFaces()}</div>`;
async function diceRoll(r) {
  const f1 = 1 + Math.floor(Math.random() * 6), f2 = 1 + Math.floor(Math.random() * 6), dr = $("#dice-roll");
  dr.innerHTML = `<div class="scrim"></div><div class="stage"><div class="dw dw1" style="--fx:${ORI[f1][0]};--fy:${ORI[f1][1]}">${cubeHTML()}</div><div class="dw dw2" style="--fx:${ORI[f2][0]};--fy:${ORI[f2][1]}">${cubeHTML()}</div><div class="floor"></div></div>
    <div class="banner"><span class="bico"></span><div><small>${G.ui.rollBy}</small><b>${fmt(G.ui.perilIs, { name: r.perilName })}</b></div></div>`;
  dr.querySelector(".bico").appendChild(sprite(r.peril, "⚠")); dr.className = ""; dr.hidden = false; sfx("dice");
  await sleep(3000); dr.className = "out"; await sleep(500); dr.hidden = true;
}
async function enterRoom() {
  const r = S.room; S.peril = 0; S.boost = 0; S.perilAcc = 0; S.busy = false; S.exitOpen = false; S.idle = 0;
  document.documentElement.style.setProperty("--accent", r.accent);
  $("#hud-obj").textContent = r.objective; $("#danger").hidden = false; buildDanger(r); renderFind(); updateWhat();
  await diceRoll(r); // AUTO: the room's dice roll names the Peril
  S.done.add(r.hotspots[0].id); afterChange();
  await say(r.enter);
  if (r.objectiveCard) await cardAsync({ title: `${r.id}. ${r.title}`, text: r.objectiveCard });
  showWhat(G.ui.what.play, G.config.whatSeconds * 1000);
}
// the "what do I do" line is a short hint, never a permanent bar
let whatT;
function showWhat(t, ms) { const e = $("#what"); e.textContent = t; e.hidden = false; clearTimeout(whatT); if (ms) whatT = setTimeout(() => (e.hidden = true), ms); }
function updateWhat() {
  const c = $("#holdchip"); c.hidden = !S.held; if (S.held) { c.textContent = fmt(G.ui.holdChip, { name: G.items[S.held].name }); showWhat(G.ui.what.holding, 5000); }
}
$("#holdchip").onclick = () => { S.held = null; updateWhat(); };

/* ---------- hotspots ---------- */
let hsIds = [];
const KIND_GLYPH = { LEARN: "i", INSPECT: "", USE: "✋", PANEL: "", EXIT: "➜" };
function afterChange() { renderHotspots(); renderFind(); const t = S.room.hotspots.find(h => h.terminal && !S.done.has(h.id) && GameLogic.visible(h, S.done)); if (t && !S.busy) runTerminal(t); }
function renderHotspots() {
  if (!viewer) return;
  hsIds.forEach(id => { try { viewer.removeHotSpot(id); } catch {} }); hsIds = [];
  const add = h => {
    hsIds.push(h.id);
    viewer.addHotSpot({ id: h.id, pitch: h.pitch, yaw: h.yaw, type: "custom", cssClass: `hs hs-${h.kind}${S.done.has(h.id) ? " donehs" : ""}`,
      createTooltipFunc: div => {
        div.dataset.hs = h.id; div.setAttribute("role", "button"); div.setAttribute("aria-label", h.label); div.title = DEBUG ? h.id : "";
        if (h.kind === "FIND") div.appendChild(sprite(G.items[h.gives].sprite, G.items[h.gives].glyph)); else div.textContent = S.done.has(h.id) ? "✓" : KIND_GLYPH[h.kind]; if (S.done.has(h.id)) div.classList.add("tick");
      }, clickHandlerFunc: () => tapHotspot(h) });
  };
  for (const h of S.room.hotspots) {
    if (h.kind === "AUTO" || !GameLogic.visible(h, S.done)) continue;
    if (S.done.has(h.id) && ["FIND", "USE", "PANEL"].includes(h.kind)) continue;
    add(h);
  }
  if (S.exitOpen && S.room.exit) add({ id: "exit", kind: "EXIT", label: S.room.exit.label, ...S.room.exit });
}
function renderFind() {
  const hs = S.room.hotspots.filter(h => ["FIND", "LEARN", "INSPECT"].includes(h.kind));
  $("#find").innerHTML = `<small>${G.ui.found}</small><div>` + hs.map(h => `<i class="${S.done.has(h.id) ? "ok" : ""}">${S.done.has(h.id) ? "✓" : "?"}</i>`).join("") + "</div>";
}
async function tapHotspot(h) {
  if (S.phase !== "play" || S.busy || S.panel || !$("#card").hidden || !$("#casebook").hidden) return;
  S.idle = 0; sfx("tap");
  if (h.kind === "EXIT") return nextRoom();
  if (h.kind === "FIND") return complete(h, document.querySelector(`[data-hs="${h.id}"]`));
  if (h.kind === "LEARN") return complete(h);
  if (h.kind === "INSPECT") return openInspect(h);
  if (h.kind === "PANEL") return openPanel(h);
  if (h.kind === "USE") {
    if (!S.held) return cardAsync({ title: h.label, text: G.ui.needItem });
    if (S.held !== h.needs) return toast(G.ui.wrongItem);
    S.items = S.items.filter(i => i !== S.held); S.held = null; updateWhat();
    S.done.add(h.id); sfx("latch"); sfx("solve"); afterChange(); return cardAsync({ title: h.card.title, text: h.card.text });
  }
}
// FIND / LEARN / INSPECT finished: +5 Pips once, save, card, line. No silent pickups.
async function complete(h, from) {
  if (S.done.has(h.id)) return;
  S.done.add(h.id); addPips(G.config.pips.item); sfx(h.gives ? "pickup" : "learn");
  if (h.kind !== "FIND") S.clues.push({ id: h.id, title: h.card.title, text: h.card.text });
  if (h.gives) { S.items.push(h.gives); if (from) fly(from, G.items[h.gives]); }
  if (h.line) say([h.line]);
  afterChange();
  await cardAsync({ title: h.card.title, text: h.card.text, sprite: h.gives && G.items[h.gives], sub: h.gives ? G.ui.added : G.ui.saved });
}
function fly(from, item) {
  const r = from.getBoundingClientRect(), t = $("#btn-book").getBoundingClientRect(), d = sprite(item.sprite, item.glyph);
  d.className = "flyer " + (d.className || ""); d.style.cssText = `left:${r.left}px;top:${r.top}px;width:46px;height:46px`; document.body.appendChild(d);
  requestAnimationFrame(() => { d.style.transform = `translate(${t.left - r.left}px,${t.top - r.top}px) scale(.4)`; d.style.opacity = .2; });
  setTimeout(() => d.remove(), 800);
}

/* ---------- wrong answers and hints ---------- */
function nextBank(pid) { const b = G.puzzles[pid].bank, i = S.bank[pid] ?? 0; S.bank[pid] = i + 1; return b[Math.min(i, b.length - 1)]; }
async function wrong(pid, extra = []) {
  S.timeLeft -= G.config.wrongSeconds; addPips(G.config.pips.wrong); S.wrongs++; sfx("wrong"); addPeril(1); if (S.phase !== "play") return;
  $("#time").textContent = mmss(S.timeLeft); $("#hud-time").classList.add("bad"); setTimeout(() => $("#hud-time").classList.remove("bad"), 600);
  const lines = [nextBank(pid)]; if (S.wrongs % 3 === 0) lines.push(`tease_${((S.wrongs / 3 - 1) % 3) + 1}`); // Keeper tease on every third wrong
  await say([...lines, ...extra]);
}
function nextTarget() { return S.room.hotspots.find(h => h.kind !== "AUTO" && !S.done.has(h.id) && GameLogic.visible(h, S.done)); }
function pulseNext() { const t = nextTarget(), e = t && document.querySelector(`[data-hs="${t.id}"]`); e?.classList.add("pulse"); setTimeout(() => e?.classList.remove("pulse"), 4000); } // idle help is free
function useHint(panelId) {
  if (S.phase !== "play" || S.busy) return;
  if (S.hints <= 0) return say(["hints_out"]);
  const t = panelId ? S.room.hotspots.find(h => h.id === panelId) : S.room.hotspots.find(h => h.kind !== "AUTO" && !S.done.has(h.id) && GameLogic.visible(h, S.done));
  if (!t) return toast(G.ui.noHint || "Nothing to hint right now.");
  if (S.pips + G.config.pips.hint < 0) return toast(G.ui.noPips); // hint costs Pips; Pips never go below 0
  S.hints--; $("#hints").textContent = S.hints; $("#panel-hints").textContent = S.hints; addPips(G.config.pips.hint);
  if (t.kind === "PANEL") say([nextBank(t.id)]);
  else { say([{ speaker: "zoya", text: fmt(G.ui.hintLook, { label: t.label }), pausesTimer: true, audioFile: t.hintAudio }]); const e = document.querySelector(`[data-hs="${t.id}"]`); e?.classList.add("pulse"); setTimeout(() => e?.classList.remove("pulse"), 4000); }
}
$("#btn-hint").onclick = () => useHint();
$("#panel-hint").onclick = () => useHint(S.panel?.h.id);

/* ---------- cards, toast ---------- */
let cardResolve = null;
function cardAsync({ title, text, sprite: it, sub, speak }) {
  return new Promise(res => {
    cardResolve?.(); cardResolve = res;
    $("#card-title").textContent = title; $("#card-text").textContent = text; $("#card-sub").textContent = sub || "";
    sfx("card"); $("#card-img").replaceChildren(...(it ? [sprite(it.sprite, it.glyph)] : [])); $("#card-ok").textContent = G.ui.close; $("#card").hidden = false;
    if (speak) narrate(speak);
  });
}
function closeCard() { if ($("#card").hidden) return; $("#card").hidden = true; stopNarration(); const r = cardResolve; cardResolve = null; r?.(); }
$("#card-x").onclick = $("#card-ok").onclick = closeCard;
$("#card").onclick = e => { if (e.target.id === "card") closeCard(); };
addEventListener("keydown", e => { if (e.key === "Escape") { if (!$("#card").hidden) closeCard(); else if (S.panel) $("#panel-x").click(); else if (!$("#casebook").hidden) $("#casebook").hidden = true; } });
function toast(t, ms = 1800) { const e = $("#toast"); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (e.hidden = true), ms); }

/* ---------- panels and inspect views ---------- */
let panelTimers = [], panelDead = true;
function shell(title, h) {
  stopNarration();
  $("#panel .plank").classList.remove("threat1", "threat2", "threat3");
  S.panel = { h }; panelDead = false; panelTimers = [];
  $("#panel-title").textContent = title; $("#panel-body").innerHTML = ""; $("#panel-what").textContent = G.ui.what.panel;
  $("#panel-hint").hidden = h.kind !== "PANEL"; $("#panel-hints").textContent = S.hints; $("#panel").hidden = false;
}
function closePanel() { panelDead = true; panelTimers.forEach(clearTimeout); $("#panel").hidden = true; S.panel = null; }
$("#panel-x").onclick = () => S.panel && closePanel();
$("#panel").onclick = e => { if (e.target.id === "panel") closePanel(); };
function openPanel(h) {
  const p = G.puzzles[h.id]; shell(p.title, h);
  const api = { state: (S.ps[h.id] ??= {}), wrong: extra => wrong(h.id, extra), threat, shatter, say, dead: () => panelDead,
    later: (fn, ms) => panelTimers.push(setTimeout(() => !panelDead && fn(), ms)),
    solved: () => { if (panelDead) return; sfx("solve"); closePanel(); S.done.add(h.id); if (p.type === "jigsaw") S.items = S.items.filter(i => !i.startsWith("piece_")); if (p.type === "sentence") addPips(G.config.pips.final); afterChange(); } };
  if (p.intro && !S.intro[h.id]) { S.intro[h.id] = 1; say([p.intro]); }
  P[p.type]($("#panel-body"), p, api);
}
function openInspect(h) {
  shell(h.label, h); let ok = false;
  buildInspect($("#panel-body"), h, { complete: () => (ok = true), close: () => closeInspect() });
  $("#panel-what").textContent = G.ui.what.inspect || "Turn it to see every side.";
  function closeInspect() { closePanel(); if (ok) complete(h); }
  S.panel.onX = closeInspect;
}
$("#panel-x").onclick = () => { const p = S.panel; if (!p) return; p.onX ? p.onX() : closePanel(); };
$("#panel").onclick = e => { if (e.target.id === "panel") $("#panel-x").click(); };

// Room 7: every wrong word cracks the board more; the third one shatters it
function threat(n) {
  S.boost = n / 3; drawPeril(); sfx("rumble");
  const pl = $("#panel .plank"); pl.classList.remove("threat1", "threat2", "threat3"); void pl.offsetWidth; pl.classList.add("threat" + n);
}
async function shatter() {
  if (S.phase !== "play") return;
  S.phase = "shatter"; S.boost = 1.25; $("#danger").classList.add("slam"); drawPeril(); sfx("thunder"); sfx("sting");
  document.body.classList.add("quake"); const f = $("#shatterfx"); f.hidden = false; f.className = ""; void f.offsetWidth; f.className = "go";
  await sleep(1500); if (S.panel) closePanel();
  await sleep(1100); document.body.classList.remove("quake"); f.hidden = true; endRun(G.ui.shattered);
}

/* ---------- Casebook: Clues, Items, Rule Pages, Tiles ---------- */
let cbTab = 0;
function openCasebook(tab = cbTab) {
  if (S.phase === "boot" || S.phase === "start") return;
  if ($("#casebook").hidden) { sfx("casebook"); stopNarration(); } cbTab = tab; const c = G.ui.casebook; $("#cb-title").textContent = c.title; $("#casebook").hidden = false;
  const cover = $("#cb-cover"); cover.hidden = !HAS.has("casebook_cover"); if (!cover.hidden) cover.src = G.art.cutDir + "casebook_cover.png";
  $("#cb-tabs").innerHTML = c.tabs.map((t, i) => `<button class="btn tab ${i === tab ? "on" : ""}" data-t="${i}">${t}</button>`).join("");
  $("#cb-tabs").querySelectorAll("button").forEach(b => (b.onclick = () => openCasebook(+b.dataset.t)));
  const body = $("#cb-body"); body.innerHTML = "";
  if (tab === 0) body.innerHTML = S.clues.length ? S.clues.map(k => `<div class="entry"><b>${k.title}</b><p>${k.text}</p></div>`).join("") : `<p class="empty">${c.emptyClues}</p>`;
  if (tab === 1) {
    if (!S.items.length) body.innerHTML = `<p class="empty">${c.emptyItems}</p>`;
    S.items.forEach(id => {
      const it = G.items[id], d = document.createElement("div"); d.className = "entry item" + (S.held === id ? " held" : "");
      d.innerHTML = `<span class="ico"></span><div><b>${it.name}</b><p>${it.desc}</p></div>`; d.querySelector(".ico").appendChild(sprite(it.sprite, it.glyph));
      if (!id.startsWith("piece_")) { const b = document.createElement("button"); b.className = "btn"; b.textContent = S.held === id ? c.holding : c.hold; b.onclick = () => { S.held = S.held === id ? null : id; updateWhat(); $("#casebook").hidden = true; }; d.appendChild(b); }
      body.appendChild(d);
    });
  }
  if (tab === 2) body.innerHTML = S.rules.length ? S.rules.map(n => `<div class="entry"><b>${fmt(G.ui.rulePage, { n })} · ${G.rules[n - 1].tile}</b><p>${G.rules[n - 1].text}</p></div>`).join("") : `<p class="empty">${c.emptyPages}</p>`;
  if (tab === 3) {
    body.innerHTML = `<div class="tilegrid">${G.rules.map(r => `<div class="tilecell ${S.tiles.includes(r.tile) ? "won" : ""}"><span class="ico"></span><b>${S.tiles.includes(r.tile) ? r.tile : "?"}</b></div>`).join("")}</div>`;
    body.querySelectorAll(".tilecell").forEach((d, i) => d.querySelector(".ico").appendChild(sprite(G.rules[i].sprite, "◉")));
  }
}
$("#btn-book").onclick = () => (S.phase === "tutorial" ? 0 : openCasebook());
$("#cb-x").onclick = () => ($("#casebook").hidden = true);
$("#casebook").onclick = e => { if (e.target.id === "casebook") $("#casebook").hidden = true; };

/* ---------- finishing a room: effect, final narration, then rewards ---------- */
async function runTerminal(h) {
  S.busy = true; S.done.add(h.id); renderHotspots();
  if (h.patience) await patience(h); else { toast(h.fx, 2600); await sleep(1400); }
  if (S.phase !== "play") return;
  await say(S.room.right); // the reward waits for the dialogue-finished event, not a fixed delay
  if (S.phase !== "play") return;
  if (S.room.reward) await reward(S.room); else await ending();
  S.busy = false;
}
function patience(h) {
  return new Promise(res => {
    const ov = document.createElement("div"); ov.id = "patience"; ov.innerHTML = `<div class="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44"/><circle cx="50" cy="50" r="44" class="fill" pathLength="1"/></svg></div><p>${G.ui.patience}</p>`;
    document.body.appendChild(ov); say(["r6_patience"]);
    let t = 0; const fill = ov.querySelector(".fill"), iv = setInterval(() => {
      if (S.pauses.has("menu")) return; t += .1; fill.style.strokeDashoffset = 1 - t / h.patience;
      if (t >= h.patience) { clearInterval(iv); ov.remove(); res(); }
    }, 100);
    ov.onpointerdown = () => { t = 0; toast(G.ui.patience); }; // touching resets the calm
  });
}
async function reward(room) {
  const rule = G.rules[room.id - 1];
  addPips(G.config.pips.page); S.rules.push(rule.n);
  sfx("page"); await cardAsync({ title: fmt(G.ui.rulePage, { n: rule.n }), text: rule.text, sub: G.ui.saved, speak: { speaker: "keeper", text: rule.text, audioFile: rule.audioFile } });
  S.tiles.push(rule.tile); sfx("chime");
  await cardAsync({ title: fmt(G.ui.tileWon, { tile: rule.tile }), text: rule.text, sprite: { sprite: rule.sprite, glyph: "◉" } });
  if (room.reward.helper) {
    const it = G.items[room.reward.helper]; S.items.push(room.reward.helper); sfx("pickup");
    await cardAsync({ title: fmt(G.ui.gotItem, { name: it.name }), text: it.desc, sprite: it, sub: G.ui.added });
  }
  S.exitOpen = true; sfx("door"); renderHotspots(); toast(G.ui.toastDoor, 2600);
}
async function nextRoom() {
  S.busy = true; $("#fade").classList.add("on"); await sleep(600);
  S.roomIdx++; S.room = G.rooms[S.roomIdx]; await loadRoom(S.room);
  $("#fade").classList.remove("on"); enterRoom();
}

/* ---------- ending cinematic and end screens ---------- */
async function ending() {
  S.phase = "ending"; loopStopAll(); S.skipSeq = false; setPause("ending", true); $("#hud").hidden = true; $("#danger").hidden = true; $("#perilfx").style.setProperty("--pf", 0);
  let scene = "room7";
  for (const b of G.ending) {
    if (S.skipSeq) break;
    if (b.scene !== scene) {
      scene = b.scene; $("#fade").classList.add("on"); await sleep(500);
      $("#pano").classList.toggle("dawn", scene === "dawn"); await loadRoom(G.rooms[scene === "dawn" ? 0 : 6], scene === "dawn" ? G.rooms[0].startYaw : 0);
      $("#fade").classList.remove("on");
    }
    await say([b], { cut: true });
  }
  fx("");
  const t = G.endTitle, tc = $("#titlecard"); tc.querySelector("h1").textContent = t.title; tc.querySelector("p").textContent = t.sub; tc.querySelector("button").textContent = G.ui.keepIt || "Continue"; tc.hidden = false;
  await new Promise(r => (tc.querySelector("button").onclick = r)); tc.hidden = true;
  win();
}
function win() {
  const bonus = Math.ceil(Math.max(0, S.timeLeft)) * G.config.pips.perSecond; addPips(bonus);
  const w = G.ui.win; $("#win-title").textContent = w.title; $("#win-line").textContent = w.line;
  $("#win-stats").innerHTML = `<p><b>${w.pips}:</b> ${S.pips}</p><p><b>${w.time}:</b> ${mmss(S.timeLeft)} (+${bonus})</p><p><b>${w.tiles}:</b> ${S.tiles.join(" · ")}</p>`;
  $("#win-again").textContent = w.again; $("#win-book").textContent = w.book; $("#win").hidden = false; S.phase = "won"; $("#hud").hidden = false; $("#danger").hidden = true;
}

/* ---------- menus ---------- */
function pause(on) {
  setPause("menu", on); loopsMute(on); $("#pausemenu").hidden = !on; document.body.classList.toggle("paused", on);
  try { on ? speechSynthesis.pause() : speechSynthesis.resume(); } catch {}
  if (audio) on ? audio.pause() : audio.play().catch(() => {});
}
function drawPauseMenu() { const p = G.ui.pause; $("#pm-title").textContent = p.title; $("#pm-resume").textContent = p.resume; $("#pm-restart").textContent = p.restart; $("#pm-voice").textContent = S.voice ? p.voiceOn : p.voiceOff; $("#pm-sound").textContent = soundOn ? p.soundOn : p.soundOff; $("#pm-music").textContent = musicOn ? p.musicOn : p.musicOff; }
$("#btn-pause").onclick = () => { drawPauseMenu(); pause(true); };
$("#pm-resume").onclick = () => pause(false);
$("#pm-voice").onclick = () => { S.voice = !S.voice; if (!S.voice) stopNarration(); drawPauseMenu(); };
$("#pm-music").onclick = () => { setMusic(!musicOn); drawPauseMenu(); };
$("#pm-sound").onclick = () => { setSound(!soundOn); if (!soundOn) loopStopAll(); else if (S.phase === "play") drawPeril(); drawPauseMenu(); };
$("#pm-restart").onclick = $("#tu-btn").onclick = $("#win-again").onclick = () => location.reload();
$("#tu-review").onclick = () => openCasebook(2);
$("#win-book").onclick = () => openCasebook(0);

/* ---------- debug: ?debug=1 (localhost only). &room=N jumps with earlier rooms done ---------- */
async function debugJump(n) {
  S.roomIdx = n - 1; S.room = G.rooms[n - 1]; S.phase = "play"; S.timeLeft = G.config.timerSeconds; S.hints = G.config.hintsTotal;
  for (let i = 0; i < n - 1; i++) {
    G.rooms[i].hotspots.forEach(h => { S.done.add(h.id); if (h.gives) S.items.push(h.gives); });
    const rule = G.rules[i]; S.rules.push(rule.n); S.tiles.push(rule.tile);
    S.items = S.items.filter(id => !G.rooms[i].hotspots.some(h => h.needs === id)); // used helpers are gone
  }
  if (n > 1) S.items.push(G.rooms[n - 2].reward.helper);
  S.items = S.items.filter(id => !G.rooms.some(r => r.hotspots.some(h => h.needs === id && S.done.has(h.id))));
  $("#start").hidden = true; $("#hud").hidden = false; $("#fx").hidden = true; await loadRoom(S.room); play();
}
(async function boot() {
  G = await (await fetch("game.json", { cache: "no-store" })).json();
  if (G.art.bundled) G.cutNames.forEach(n => HAS.add(n)); // production build: every file is known to be there
  else await Promise.all(G.cutNames.map(n => fetch(`${G.art.cutDir}${n}.png`, { method: "HEAD" }).then(r => r.ok && HAS.add(n), () => {})));
  const { errors, warnings } = G.art.bundled ? { errors: [], warnings: [] } : await validate(G);
  errors.forEach(e => console.error("validate:", e)); warnings.forEach(w => console.warn("validate:", w));
  document.documentElement.style.setProperty("--blur", G.config.blurPx + "px");
  $("#pano").style.setProperty("transition-duration", G.config.sharpenSeconds + "s");
  $("#start-title").textContent = G.start.title; $("#start-tag").textContent = G.start.tagline; $("#btn-start").textContent = G.start.button;
  const m = G.mission; $("#m-kicker").textContent = m.kicker; $("#m-head").textContent = m.heading; $("#btn-begin").textContent = m.button;
  $("#m-paras").replaceChildren(...m.paragraphs.map(t => Object.assign(document.createElement("p"), { textContent: t })));
  $("#dlg-tap").textContent = G.ui.dialogueTap; $("#dlg-skip").textContent = G.ui.skip;
  buildFx();
  $("#btn-start").onclick = startFlow; $("#btn-begin").onclick = tutorial; S.phase = "start";
  if (DEBUG) {
    window.__S = S; window.__G = G;
    const d = $("#debug"); d.hidden = false;
    d.textContent = `debug on. validate: ${errors.length} error(s), ${warnings.length} warning(s)\n${[...errors, ...warnings].join("\n")}\nclick the panorama to print yaw/pitch`;
    $("#pano").addEventListener("click", e => { if (!viewer) return; const [pitch, yaw] = viewer.mouseEventToCoords(e); const l = `yaw ${yaw.toFixed(1)}  pitch ${pitch.toFixed(1)}`; console.log(l); d.textContent += "\n" + l; });
    if (Q.get("room")) debugJump(+Q.get("room"));
  }
})();
function buildFx() { // cutscene scenery drawn by the game: rain drops, board cells, dice
  const rain = $("#fx .rain"); rain.innerHTML = Array.from({ length: 90 }, () => `<i style="left:${Math.random() * 105 - 3}%;animation-duration:${(.45 + Math.random() * .5).toFixed(2)}s;animation-delay:-${(Math.random() * 1.2).toFixed(2)}s;height:${30 + Math.random() * 60 | 0}px;opacity:${(.25 + Math.random() * .5).toFixed(2)}"></i>`).join("");
  $("#fx .board").innerHTML = Array.from({ length: 36 }, (_, k) => `<i style="--d:${(k % 6) + Math.floor(k / 6)}" class="${(k + Math.floor(k / 6)) % 2 ? "alt" : ""}"></i>`).join("");
  $("#fx .d1").innerHTML = cubeHTML(); $("#fx .d2").innerHTML = cubeHTML();
}
