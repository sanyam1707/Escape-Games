/* Final-room effects: synthesized sound (WebAudio, no files) and canvas / CSS screen effects.
   The game calls window.FX. Everything is a no-op when sound is off or an element is missing. */
(function () {
"use strict";
const FX = window.FX = {};
let on = true, ac = null, master = null, hbT = null, glintT = null, warT = null, cv = null, g = null, W = 0, H = 0, raf = 0, mode = null;
const parts = [], slashes = [], $ = id => document.getElementById(id), rnd = (a, b) => a + Math.random() * (b - a);

/* ---------------- sound ---------------- */
function A() {
  if (!on) return null;
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = .6; master.connect(ac.destination); } catch (e) { return null; } }
  if (ac.state === "suspended") ac.resume();
  if (!loaded) { loaded = true; SAMPLES.forEach(n => fetch(`assets/audio/sfx/${n}.mp3`).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).then(d => { buf[n] = d; }).catch(() => {})); }
  return ac;
}
/* CC0 recorded sounds (assets/audio/CREDITS.txt); every one falls back to a synthesized sound until it has loaded */
const SAMPLES = ["coins", "bookOpen", "bookClose", "page", "door", "steps", "wrong", "slice", "draw", "clang", "cloth", "click", "creak"], buf = {}; let loaded = false;
function play(n, v = .8, rate = 1) {
  const c = A(); if (!c || !buf[n]) return false;
  const s = c.createBufferSource(), gn = c.createGain(); s.buffer = buf[n]; s.playbackRate.value = rate; gn.gain.value = v; s.connect(gn); gn.connect(master); s.start(); return true;
}
function tone(f, o = {}) {
  const c = A(); if (!c) return; const { t = 0, d = .25, type = "sine", v = .2, to = null, a = .005 } = o;
  const os = c.createOscillator(), gn = c.createGain(), t0 = c.currentTime + t;
  os.type = type; os.frequency.setValueAtTime(f, t0); if (to) os.frequency.exponentialRampToValueAtTime(to, t0 + d);
  gn.gain.setValueAtTime(.0001, t0); gn.gain.exponentialRampToValueAtTime(v, t0 + a); gn.gain.exponentialRampToValueAtTime(.0001, t0 + d);
  os.connect(gn); gn.connect(master); os.start(t0); os.stop(t0 + d + .05);
}
function noise(d, o = {}) {
  const c = A(); if (!c) return; const { t = 0, v = .2, type = "bandpass", f = 1000, q = 1, to = null } = o;
  const n = Math.floor(c.sampleRate * d), buf = c.createBuffer(1, n, c.sampleRate), data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(), fl = c.createBiquadFilter(), gn = c.createGain(), t0 = c.currentTime + t;
  s.buffer = buf; fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t0); if (to) fl.frequency.exponentialRampToValueAtTime(to, t0 + d);
  gn.gain.setValueAtTime(v, t0); gn.gain.exponentialRampToValueAtTime(.0001, t0 + d);
  s.connect(fl); fl.connect(gn); gn.connect(master); s.start(t0);
}
const SND = {
  bookOpen() { play("bookOpen") || tone(300, { d: .15, v: .08 }); },
  bookClose() { play("bookClose") || tone(240, { d: .15, v: .08 }); },
  page() { play("page", .7) || tone(500, { d: .08, v: .05 }); },
  click() { play("click", .6) || tone(700, { d: .05, v: .06 }); },
  door() { play("creak", .7); play("door", .9); setTimeout(() => play("steps", .8), 450); },
  pick() { if (play("coins", .8)) return; tone(880, { d: .09, v: .1, type: "triangle" }); tone(1320, { t: .06, d: .12, v: .08, type: "triangle" }); },
  buzz() { play("wrong", .9); tone(120, { d: .28, type: "sawtooth", v: .12, to: 80 }); },
  chime() { [523, 659, 784, 1047].forEach((f, i) => { tone(f, { t: i * .09, d: .9, v: .16 }); tone(f * 2, { t: i * .09, d: .6, v: .05 }); }); },
  banner() { play("cloth", .8); [392, 494, 587].forEach((f, i) => tone(f, { t: i * .12, d: 1.2, v: .13, type: "triangle", a: .05 })); noise(.6, { type: "lowpass", f: 600, v: .1 }); },
  thud() { tone(90, { d: .4, v: .6, to: 38 }); noise(.25, { type: "lowpass", f: 250, v: .35 }); },
  sting() { tone(233, { d: .9, type: "sawtooth", v: .07 }); tone(247, { d: .9, type: "sawtooth", v: .07 }); tone(110, { d: 1.1, type: "sawtooth", v: .09, to: 90 }); },
  slash() { play("slice", .9); noise(.3, { type: "highpass", f: 1800, to: 9000, v: .28 }); tone(2000, { d: .22, type: "sawtooth", v: .05, to: 500 }); },
  clash() { play("clang", .9); play("draw", .5); noise(.2, { type: "bandpass", f: 3600, q: 2, v: .4 }); [2100, 3150, 4300].forEach((f, i) => tone(f, { d: .55 - i * .1, type: "triangle", v: .08 })); tone(180, { d: .15, v: .25, to: 90 }); },
  glint() { tone(4200, { d: .35, type: "triangle", v: .05 }); tone(5600, { t: .05, d: .3, type: "triangle", v: .03 }); },
  ping(i = 0) { const f = 440 * Math.pow(2, i / 6); tone(f, { d: .8, type: "triangle", v: .18 }); tone(f * 2, { d: .5, v: .06 }); },
  link(i = 0) { tone(1300 + i * 170, { d: .09, type: "square", v: .05 }); noise(.08, { type: "highpass", f: 4000, v: .12 }); tone(160, { t: .02, d: .18, v: .2, to: 80 }); },
  reveal() { tone(70, { d: 1.2, type: "sawtooth", v: .25, to: 50 }); tone(140, { d: 1, type: "sawtooth", v: .12, to: 100 }); noise(.7, { type: "lowpass", f: 500, v: .2 }); },
  swell() { [261, 329, 392, 523, 659].forEach((f, i) => tone(f, { t: i * .06, d: 3, v: .09, a: .7 })); },
  roar() { tone(95, { d: 1.8, type: "sawtooth", v: .3, to: 42 }); tone(190, { d: 1.6, type: "sawtooth", v: .12, to: 80 }); noise(1.7, { type: "bandpass", f: 320, to: 110, q: .8, v: .35 }); },
  fire() { noise(1.6, { type: "lowpass", f: 420, v: .3 }); for (let i = 0; i < 9; i++) noise(.05, { t: rnd(0, 1.5), type: "highpass", f: 3000, v: .15 }); },
  horn() { tone(110, { d: 2, type: "sawtooth", v: .22, a: .3 }); tone(165, { d: 2, type: "sawtooth", v: .1, a: .4 }); },
  poison() { for (let i = 0; i < 6; i++) tone(rnd(200, 420), { t: i * .09, d: .12, v: .1, to: rnd(500, 800) }); },
  wind() { noise(2.2, { type: "bandpass", f: 500, to: 1400, q: .6, v: .3 }); },
};
FX.snd = (name, i) => { const f = SND[name]; if (f) f(i); };
FX.setOn = v => { on = !!v; if (!on) FX.stopAll(); };
FX.death = kind => { stopLoops(); ({ blade: () => { SND.slash(); setTimeout(SND.thud, 160); }, cup: SND.poison, wyrmfire: () => { SND.roar(); SND.fire(); }, frost: SND.wind }[kind] || (() => {}))(); };

/* looping danger sounds: heartbeat by level, sword glints at level 2 */
function beat() { tone(62, { d: .22, v: .5, to: 38 }); tone(58, { t: .17, d: .2, v: .35, to: 36 }); }
function stopLoops() { clearInterval(hbT); clearInterval(glintT); hbT = glintT = null; }
FX.danger = level => {
  stopLoops(); if (!level || !on) return;
  beat(); hbT = setInterval(beat, level === 1 ? 1000 : 620);
  if (level >= 2) glintT = setInterval(() => { SND.glint(); burst(rnd(0, W), rnd(H * .2, H * .8), { n: 6, color: "#dfe9ff", speed: 2, life: 18, g: 0 }); }, 2600);
};

/* ---------------- canvas ---------------- */
function ensure() {
  if (cv) return true; cv = $("fxc"); if (!cv) return false; g = cv.getContext("2d");
  const size = () => { const d = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; cv.width = W * d; cv.height = H * d; g.setTransform(d, 0, 0, d, 0, 0); };
  size(); addEventListener("resize", size); return true;
}
function burst(x, y, o = {}) {
  if (!ensure()) return;
  for (let i = 0; i < (o.n || 40); i++) {
    const a = o.arc ? rnd(-Math.PI, 0) : rnd(0, Math.PI * 2), s = (o.speed || 5) * rnd(.3, 1.1);
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (o.up || 0), life: (o.life || 50) * rnd(.6, 1.3), max: o.life || 50, c: o.color || "#ffd36a", r: o.r || 2.2, gv: o.g == null ? .12 : o.g });
  }
  loop();
}
function slash(x1, y1, x2, y2, color) { if (!ensure()) return; slashes.push({ x1, y1, x2, y2, t: 0, c: color || "#ffffff" }); loop(); }
function loop() { if (!raf) raf = requestAnimationFrame(frame); }
function frame() {
  raf = 0; if (!cv) return;
  g.clearRect(0, 0, W, H); g.globalCompositeOperation = "lighter";
  if (mode === "war") { for (let i = 0; i < 3; i++) parts.push({ x: rnd(0, W), y: H + 6, vx: rnd(-.6, .6), vy: rnd(-4.2, -1.6), life: rnd(50, 110), max: 110, c: Math.random() < .5 ? "#ff8a2a" : "#ffc457", r: rnd(1.5, 4), gv: -.01 });
    if (Math.random() < .8) parts.push({ x: rnd(0, W), y: -6, vx: rnd(-1, 1), vy: rnd(1, 3), life: 160, max: 160, c: "#ff9a3a", r: rnd(1, 2.6), gv: .01 }); }
  if (mode === "justice") { for (let i = 0; i < 2; i++) parts.push({ x: rnd(0, W), y: H + 6, vx: rnd(-.3, .3), vy: rnd(-1.6, -.5), life: rnd(120, 220), max: 220, c: Math.random() < .7 ? "#ffd36a" : "#fff3c2", r: rnd(1.2, 3.2), gv: 0 }); }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.x += p.vx; p.y += p.vy; p.vy += p.gv; p.life--;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    g.globalAlpha = Math.min(1, p.life / p.max * 1.6); g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
  }
  for (let i = slashes.length - 1; i >= 0; i--) {
    const s = slashes[i]; s.t++; if (s.t > 14) { slashes.splice(i, 1); continue; }
    const k = s.t / 14, ex = s.x1 + (s.x2 - s.x1) * Math.min(1, k * 2.2), ey = s.y1 + (s.y2 - s.y1) * Math.min(1, k * 2.2);
    g.globalAlpha = 1 - k; g.strokeStyle = s.c; g.lineCap = "round"; g.lineWidth = 7 * (1 - k) + 1; g.shadowColor = s.c; g.shadowBlur = 18;
    g.beginPath(); g.moveTo(s.x1 + (ex - s.x1) * Math.max(0, k * 1.2 - .2), s.y1 + (ey - s.y1) * Math.max(0, k * 1.2 - .2)); g.lineTo(ex, ey); g.stroke(); g.shadowBlur = 0;
  }
  g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
  if (parts.length || slashes.length || mode) raf = requestAnimationFrame(frame); else g.clearRect(0, 0, W, H);
}

/* ---------------- screen effects ---------------- */
function anim(el, cls, ms) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms); }
FX.flash = (color = "#fff", ms = 450) => { const f = $("flash"); if (!f) return; f.style.setProperty("--fc", color); f.style.setProperty("--fm", ms + "ms"); anim(f, "go", ms + 50); };
FX.ring = (color = "#ffd36a") => { const r = el("div", "fx-ring"); r.style.setProperty("--rc", color); document.body.appendChild(r); setTimeout(() => r.remove(), 1300); };
FX.shake = (level = 1) => { ["stage", "screenEnding", "screenDeath"].forEach(id => { const e = $(id); if (e) { e.style.animation = "none"; void e.offsetWidth; e.style.animation = `quake${level} ${level === 3 ? 900 : level === 2 ? 600 : 380}ms ease-out`; setTimeout(() => { e.style.animation = ""; }, 950); } }); };
function el(t, c, h) { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
FX.splash = (text, sub) => {
  const s = $("splash"); if (!s) return; s.innerHTML = `<b>${text}</b>${sub ? `<span>${sub}</span>` : ""}`; s.hidden = false; anim(s, "go", 2300); clearTimeout(s._t); s._t = setTimeout(() => { s.hidden = true; }, 2300);
};

/* wrong: darkness, blade streaks, shake, flash, heartbeat. Gets worse with the level. */
FX.wrong = level => {
  SND.thud(); SND.sting(); SND.slash(); FX.danger(level);
  FX.shake(level === 1 ? 1 : 2); FX.flash("#cfe3ff", 260);
  const n = level === 1 ? 2 : 4; for (let i = 0; i < n; i++) setTimeout(() => { const y = rnd(H * .15, H * .75); slash(rnd(-40, W * .3), y, rnd(W * .7, W + 40), y + rnd(-160, 160), "#e8f0ff"); if (i) SND.slash(); }, i * 110);
  if (level >= 2) setTimeout(() => SND.clash(), 260);
};
/* right: gold shockwave, sparks, bright flash, chime */
FX.right = () => {
  SND.chime(); FX.flash("#ffe7a3", 500); FX.ring("#ffd36a"); ensure();
  burst(W / 2, H / 2, { n: 70, speed: 7, color: "#ffd36a", life: 60, g: .06 }); burst(W / 2, H / 2, { n: 30, speed: 4, color: "#fff6d6", life: 40, g: 0 });
};
/* step 1: the accused steps out of the dark */
FX.reveal = (node, name, sub) => {
  const r = $("reveal"); if (!r) return; r.innerHTML = ""; const card = el("div", "rv-card"); if (node) card.appendChild(node); card.appendChild(el("b", "", name)); if (sub) card.appendChild(el("span", "", sub)); r.appendChild(card);
  r.hidden = false; anim(r, "go", 2600); SND.reveal(); FX.shake(2); FX.flash("#ffffff", 300); setTimeout(() => { r.hidden = true; }, 2600);
};
/* step 2: the links of the chain lock one by one */
FX.chain = (n = 4) => { for (let i = 0; i < n; i++) setTimeout(() => { SND.link(i); ensure(); burst(W / 2, H * (.22 + i * .17), { n: 18, speed: 3.5, color: "#ffd36a", life: 30 }); slash(W * .3, H * (.2 + i * .17), W * .7, H * (.2 + i * .17), "#ffe9a8"); }, 160 + i * 230); };
/* blade pressed in the Oath-Lock */
FX.blade = (i, node, color) => { SND.ping(i); if (!node) return; const r = node.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, { n: 26, speed: 4, color: color || "#ffd36a", life: 36, g: .02 }); };
/* step 3: the six banners light in the order the houses swore */
FX.ceremony = (nodes, colors, done) => {
  const c = $("ceremony"); if (!c) return done && done(); c.innerHTML = ""; c.hidden = false; c.classList.remove("rise"); void c.offsetWidth; c.classList.add("rise");
  const rays = el("div", "cer-rays"); c.appendChild(rays); const row = el("div", "cer-row"); c.appendChild(row);
  nodes.forEach((n, i) => { const w = el("div", "cer-shield"); w.style.setProperty("--d", i * .38 + "s"); w.style.setProperty("--hc", colors[i] || "#ffd36a"); w.appendChild(n); row.appendChild(w);
    setTimeout(() => { SND.ping(i * 2); const r = w.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, { n: 34, speed: 5, color: colors[i] || "#ffd36a", life: 44, g: .03 }); }, 250 + i * 380); });
  setTimeout(() => { SND.swell(); FX.flash("#fff1c0", 700); FX.shake(1); }, 250 + nodes.length * 380);
  setTimeout(() => { c.classList.add("out"); setTimeout(() => { c.hidden = true; c.classList.remove("out"); done && done(); }, 700); }, 3500);
};

/* endings */
FX.justice = (nodes, colors) => {
  FX.stopMode(); mode = "justice"; const r = $("rays"); if (r) { r.className = "rays gold"; r.hidden = false; } ensure(); loop(); SND.swell(); setTimeout(SND.horn, 1800);
  const c = $("ceremony"); if (c) { c.innerHTML = ""; c.hidden = false; c.className = "ceremony stay"; const row = el("div", "cer-row"); c.appendChild(row);
    nodes.forEach((n, i) => { const w = el("div", "cer-shield"); w.style.setProperty("--d", .8 + i * .5 + "s"); w.style.setProperty("--hc", colors[i] || "#ffd36a"); w.appendChild(n); row.appendChild(w); setTimeout(() => { SND.ping(i * 2); const b = w.getBoundingClientRect(); burst(b.left + b.width / 2, b.top + b.height / 2, { n: 30, speed: 4.5, color: colors[i] || "#ffd36a", life: 44, g: .03 }); }, 900 + i * 500); }); }
  FX.ring("#ffd36a");
};
FX.war = () => {
  FX.stopMode(); mode = "war"; const r = $("rays"); if (r) { r.className = "rays fire"; r.hidden = false; } ensure(); loop();
  SND.roar(); FX.flash("#ffb04a", 900); FX.shake(3); setTimeout(SND.fire, 400);
  const fight = () => {
    if (mode !== "war") return; const x = rnd(W * .15, W * .85), y = rnd(H * .25, H * .75);
    slash(x - 120, y - 90, x + 120, y + 90, "#ffffff"); slash(x + 120, y - 90, x - 120, y + 90, "#ffd9a0");
    setTimeout(() => { SND.clash(); burst(x, y, { n: 44, speed: 8, color: "#ffe2a0", life: 26, g: .25 }); FX.shake(1); }, 120);
    warT = setTimeout(fight, rnd(600, 1200));
  };
  fight(); const roar = () => { if (mode !== "war") return; SND.roar(); FX.flash("#ff9a3a", 600); FX.shake(2); setTimeout(roar, rnd(5200, 7000)); }; setTimeout(roar, 4500);
};
FX.stopMode = () => { mode = null; clearTimeout(warT); const r = $("rays"); if (r) r.hidden = true; };
FX.stopAll = () => {
  stopLoops(); FX.stopMode(); parts.length = 0; slashes.length = 0; if (g) g.clearRect(0, 0, W, H);
  ["ceremony", "splash", "reveal"].forEach(id => { const e = $(id); if (e) { e.hidden = true; e.innerHTML = ""; } });
};
})();
