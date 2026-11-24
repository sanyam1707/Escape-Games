'use strict';
(() => {
const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let G, S, viewer = null;
const U = k => (G.ui && k in G.ui ? G.ui[k] : (console.warn('missing ui text:', k), k));
const cut = new Set();
const cfg = () => G.config;
const R = () => G.rooms[S.ri];
const DEBUG = /[?&]debug=1/.test(location.search) && /^(localhost|127\.|\[::1\])/.test(location.hostname);

/* ---------- state ---------- */
function fresh(keep) {
  return Object.assign({
    phase: 'start', ri: -1, done: new Set(), score: 0, hints: cfg().hints, time: cfg().timerSeconds,
    notes: [], oaths: [], horn: [], facts: [], wrongs: {}, lockUntil: 0, menu: false, dlg: 0, freeze: false,
    sock: [null, null, null, null], path: [], forge: { sword_plain: 0, sword_fine: 0, shield_plain: 0, shield_banded: 0 },
    won: {}, stepSaid: {}, trailTested: null, lordSel: null, cardSel: null, mapPlaced: {}, mapDone: false, disp: {}, cleared: {}, seen: {}, panoOk: {},
    b: null, frost: 0, stage: 1, heard: {}, r7base: 0, idleShown: false, lastTap: Date.now(), r7: {}
  }, keep || {});
}

/* ---------- art helpers ---------- */
const alias = n => (G.art.alias && G.art.alias[n]) || n;
const art = (n, fb, cls = '') => { n = alias(n); return cut.has(n) ? `<img class="art ${cls}" src="assets/cut/${n}.png" alt="" draggable="false">` : fb; };
const portrait = id => { const sp = G.speakers[id] || G.speakers.narrator; return art(sp.bust, `<span class="ini">${sp.initial}</span>`); };
const ICON = {
  leaf: '<path d="M5 19C5 9 11 4 20 4c0 9-5 15-15 15zM5 19L15 9"/>',
  moon: '<path d="M16 3a9 9 0 1 0 5 13A8 8 0 0 1 16 3z"/>',
  star: '<path d="M12 2l2.8 6.6 7.2.6-5.5 4.7 1.7 7-6.2-3.8-6.2 3.8 1.7-7L2 9.2l7.2-.6z"/>',
  thorn: '<path d="M4 21L8 6l3 15M10 21l4-17 4 17M16 21l4-11 2 11z"/>'
};
const svg = n => `<svg viewBox="0 0 24 24">${ICON[n]}</svg>`;
function preloadCut() {
  return Promise.all(G.art.cut.map(n => new Promise(r => { const i = new Image(); i.onload = () => { cut.add(n); r(); }; i.onerror = r; i.src = `assets/cut/${n}.png`; })));
}
const imgOk = u => new Promise(r => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = u; });
function fallbackCanvas(label, accent, kind) {
  const c = document.createElement('canvas'); c.width = 2048; c.height = kind === 'map' ? 1365 : 1024; const x = c.getContext('2d');
  if (kind === 'map') {
    const g = x.createLinearGradient(0, 0, c.width, c.height); g.addColorStop(0, '#e8dcc0'); g.addColorStop(1, '#c9b283'); x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = '#6b4a1a'; x.lineWidth = 8;
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; x.beginPath(); x.moveTo(c.width / 2, c.height / 2); x.lineTo(c.width / 2 + Math.cos(a) * 900, c.height / 2 + Math.sin(a) * 600); x.stroke(); }
    x.beginPath(); x.arc(c.width / 2, c.height / 2, 70, 0, 7); x.stroke();
  } else {
    const g = x.createLinearGradient(0, 0, 0, c.height); g.addColorStop(0, '#0e1218'); g.addColorStop(.5, accent); g.addColorStop(.52, '#10141a'); g.addColorStop(1, '#05070a');
    x.fillStyle = g; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#0a0d12';
    for (let i = 0; i < 8; i++) x.fillRect(i * 256 + 40, 480, 120, 120);
    x.fillStyle = '#e8dcc055'; x.font = '90px Georgia'; x.textAlign = 'center'; x.fillText(label, c.width / 2, 300);
  }
  return c.toDataURL('image/jpeg', .8);
}

/* ---------- validate ---------- */
function validate() {
  const errs = [], ids = new Set();
  G.rooms.forEach(r => {
    const mine = new Set(r.hotspots.map(h => h.id));
    r.hotspots.forEach(h => {
      if (ids.has(h.id)) errs.push('duplicate id ' + h.id); ids.add(h.id);
      (h.after || []).forEach(a => { if (!mine.has(a)) errs.push(`${h.id}: unknown after ${a}`); });
      if (h.say && !G.dialogue[h.say]) errs.push(`${h.id}: missing line ${h.say}`);
      if (h.kind === 'INSPECT' && !(h.views && h.views.length)) errs.push(h.id + ': no views');
    });
    const seen = {}, visit = (id, path) => {
      if (path.includes(id)) { errs.push('cycle ' + path.concat(id).join('>')); return; } if (seen[id]) return; seen[id] = 1;
      (r.hotspots.find(h => h.id === id).after || []).forEach(a => mine.has(a) && visit(a, path.concat(id)));
    };
    mine.forEach(id => visit(id, []));
    r.objective.forEach(o => (o.needs || []).forEach(n => { if (!mine.has(n) && !(r.pseudo || []).includes(n)) errs.push(`room ${r.n} objective needs unknown ${n}`); }));
  });
  Object.entries(G.dialogue).forEach(([k, l]) => { if (!G.speakers[l.s]) errs.push(`${k}: unknown speaker ${l.s}`); if (typeof l.p !== 'boolean') errs.push(`${k}: pausesTimer missing`); });
  if (errs.length) { console.error('validate():', errs); if (DEBUG) alert('validate() found ' + errs.length + ' problems. See console.'); }
  return errs;
}

/* ---------- sound + narration ---------- */
let bgm = null, actx = null, lp = null, voices = [];
function startBgm() {
  try {
    bgm = new Audio(G.art.bgm); bgm.loop = true; bgm.volume = BGV;
    bgm.addEventListener('ended', () => { bgm.currentTime = 0; if (S.music && !S.menu) bgm.play().catch(() => {}); });
    bgm.addEventListener('error', () => { bgm = null; });
    if (S.music) bgm.play().catch(() => {});
  } catch (e) { bgm = null; }
}
function bgmLevel(v) { if (bgm) bgm.volume = v; }
function frostFilter(level) {
  if (!bgm) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (!lp) { const src = actx.createMediaElementSource(bgm); lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000; src.connect(lp); lp.connect(actx.destination); }
    lp.frequency.value = [20000, 2500, 700][level] || 700;
  } catch (e) { /* no filter: music stays as is */ }
}
function tone(f) {
  if (!S.fx) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain(), fl = actx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = 900;
    g.gain.setValueAtTime(.0001, actx.currentTime); g.gain.exponentialRampToValueAtTime(.25, actx.currentTime + .08); g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + .9);
    o.connect(fl); fl.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + 1);
  } catch (e) { /* silent */ }
}

/* ---------- sound effects (synthesised with Web Audio, no files) ---------- */
let sfxMaster = null, noiseBuf = null;
function AC() {
  actx = actx || new (window.AudioContext || window.webkitAudioContext)();
  if (!sfxMaster) { sfxMaster = actx.createGain(); sfxMaster.gain.value = .55; sfxMaster.connect(actx.destination); }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function sOsc(type, f0, f1, dur, peak, delay = 0, lpf = 0, attack = .01) {
  const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  let node = o; if (lpf) { const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lpf; o.connect(f); node = f; }
  node.connect(g); g.connect(sfxMaster); o.start(t); o.stop(t + dur + .05);
}
function sNoise(dur, peak, type, f0, f1, delay = 0, attack = .005) {
  if (!noiseBuf) { noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t = actx.currentTime + delay, s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain(); s.buffer = noiseBuf; f.type = type;
  f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfxMaster); s.start(t, Math.random()); s.stop(t + dur + .05);
}
const SFX = {
  tick: () => sOsc('square', 1200, 900, .04, .03),
  tap: () => sOsc('sine', 620, 420, .09, .1),
  chime: () => { sOsc('sine', 880, 880, .6, .12); sOsc('sine', 1319, 1319, .6, .09, .07); },
  coin: () => { sOsc('triangle', 988, 988, .1, .1); sOsc('triangle', 1319, 1319, .25, .1, .08); },
  wrong: () => { sOsc('sawtooth', 170, 80, .35, .12, 0, 700); sNoise(.2, .05, 'lowpass', 300, 150); },
  nope: () => sOsc('sine', 220, 150, .15, .08),
  success: () => [523, 659, 784, 1047].forEach((f, i) => sOsc('triangle', f, f, .35, .1, i * .09)),
  fanfare: () => { [262, 330, 392, 523].forEach((f, i) => { sOsc('sawtooth', f, f, 1.3, .07, i * .08, 1400, .08); }); sOsc('triangle', 1047, 1047, 1.2, .06, .4); },
  door: () => { sNoise(.6, .25, 'lowpass', 260, 90); sOsc('sine', 70, 38, .6, .3); },
  stone: () => { sNoise(.14, .2, 'lowpass', 500, 200); sOsc('sine', 130, 70, .14, .2); },
  clack: () => { sOsc('square', 320, 140, .07, .07); sNoise(.04, .06, 'highpass', 2500, 2500); },
  snap: () => { sOsc('sine', 1300, 600, .07, .1); sOsc('sine', 2000, 900, .05, .05, .04); },
  arrow: () => sNoise(.28, .1, 'bandpass', 2600, 700),
  thump: () => { sOsc('sine', 130, 45, .3, .28); sNoise(.15, .12, 'lowpass', 400, 150); },
  fire: () => { sNoise(.6, .14, 'bandpass', 600, 220); sNoise(.5, .06, 'highpass', 3000, 1500); },
  hit: () => { sNoise(.1, .14, 'lowpass', 1100, 400); sOsc('sine', 220, 80, .12, .14); },
  shatter: () => { sNoise(.3, .1, 'highpass', 3000, 6500); [2093, 2637, 3136].forEach((f, i) => sOsc('sine', f, f, .3, .04, i * .03)); },
  boom: () => { sOsc('sine', 85, 28, .9, .4); sNoise(.8, .22, 'lowpass', 260, 70); },
  horn: () => { sOsc('sawtooth', 196, 196, .7, .08, 0, 650, .12); sOsc('sawtooth', 247, 247, .7, .05, 0, 650, .12); },
  roar: () => { sNoise(1, .18, 'lowpass', 500, 90); sOsc('sawtooth', 75, 45, 1, .16, 0, 400, .1); },
  frost: () => { sOsc('sine', 1700, 300, .7, .08); sNoise(.5, .06, 'highpass', 4000, 1500); },
  burn: () => { sNoise(.35, .12, 'bandpass', 1600, 400); sOsc('sawtooth', 420, 110, .25, .06, 0, 900); },
  swell: () => { [220, 277, 330, 440].forEach(f => sOsc('sawtooth', f, f, 1.5, .05, 0, 1100, .7)); },
  choir: () => { [330, 392, 494, 659].forEach((f, i) => sOsc('sine', f, f, 2.8, .05, i * .1, 0, 1.1)); },
  wind: () => sNoise(1.8, .06, 'bandpass', 350, 900, 0, .8),
  shimmer: () => [1760, 2093, 2637, 3136].forEach((f, i) => sOsc('sine', f, f, .8, .04, i * .12)),
  flap: () => [0, .14, .28].forEach(d => sNoise(.1, .07, 'bandpass', 900, 500, d)),
  lose: () => { sOsc('sawtooth', 230, 105, 1, .12, 0, 800, .05); sOsc('sine', 115, 52, 1.1, .2); },
  beep: () => sOsc('sine', 1000, 1000, .09, .08)
};
function sfx(n) { if (!S || !S.fx || !S.tapped) return; try { AC(); SFX[n] && SFX[n](); } catch (e) { /* no audio: stay silent */ } }
const BGV = .12;
// keeps the music playing and looping: restart it if the browser stopped it
setInterval(() => { if (bgm && S && S.music && !S.menu && S.phase !== 'start' && bgm.paused) bgm.play().catch(() => {}); }, 3000);

let speakTok = 0, vo = null, voPaused = false;
const voPre = {};   // preloaded recordings, kept so the browser does not drop them
function preloadVoice(file) { if (file && !voPre[file]) { const a = new Audio(); a.preload = 'auto'; a.src = file; voPre[file] = a; } }
function speakTTS(text, spId) {
  if (!('speechSynthesis' in window)) return;
  const sp = G.speakers[spId] || G.speakers.narrator, tok = ++speakTok;
  speechSynthesis.cancel();
  // Chrome drops a speak() sent right after cancel(), so wait a moment and check we are still the latest line.
  setTimeout(() => {
    if (tok !== speakTok || S.menu) return;
    try { speechSynthesis.resume(); } catch (e) {}
    const u = new SpeechSynthesisUtterance(text); u.pitch = sp.pitch; u.rate = sp.rate;
    voices = voices.length ? voices : speechSynthesis.getVoices();
    const v = voices.find(v => /^en[-_]/i.test(v.lang)); if (v) u.voice = v;
    speechSynthesis.speak(u);
  }, 120);
}
// Plays the recorded file when the line has one (never two voices at once); otherwise the browser voice.
function narrate(text, spId, file) {
  if (!S.voice || !S.tapped) return;
  stopVoice();
  if (!file) return speakTTS(text, spId);
  vo = vo || new Audio(); const tok = speakTok; voPaused = false;
  vo.onerror = () => { if (tok === speakTok) speakTTS(text, spId); };
  vo.src = file; vo.play().catch(() => { if (tok === speakTok) speakTTS(text, spId); });
}
const stopVoice = () => { speakTok++; voPaused = false; if ('speechSynthesis' in window) speechSynthesis.cancel(); if (vo) { vo.onerror = null; vo.pause(); } };

/* ---------- toast, score, lockout ---------- */
function toast(msg) { const t = $('#toast'); t.hidden = true; void t.offsetWidth; t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 3300); }
function pop(txt, neg) { const p = el('div', 'pop' + (neg ? ' neg' : ''), txt); $('#renown').appendChild(p); setTimeout(() => p.remove(), 1400); }
function award(n) { S.score += n; pop('+' + n); hud(); if (n >= 50) sfx('fanfare'); else if (n > 0 && n < 30) sfx('coin'); }
function penalize(n = cfg().wrongCost) {
  if (n === cfg().wrongCost) sfx('wrong'); const lost = Math.min(n, S.score); S.score = Math.max(0, S.score - n); pop('-' + n, true); hud(); return lost; }
function lock() { S.lockUntil = Date.now() + cfg().lockout * 1000; document.body.classList.add('lockout'); setTimeout(() => document.body.classList.remove('lockout'), cfg().lockout * 1000); }
const locked = () => Date.now() < S.lockUntil;
function shakePanel() { const b = $('#panel .pbox'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }
function wrong(counter, prefix, extra) {
  penalize(); lock(); shakePanel();
  S.wrongs[counter] = (S.wrongs[counter] || 0) + 1;
  return say(extra ? [extra, `${prefix}.${Math.min(3, S.wrongs[counter])}`] : `${prefix}.${Math.min(3, S.wrongs[counter])}`);
}
function note(id, text) { if (!S.notes.some(n => n.id === id)) S.notes.push({ id, text, room: R() ? R().n : 0, lord: null }); }

/* ---------- HUD ---------- */
const fmt = t => { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
function hud() {
  $('#scoreN').textContent = S.score; $('#hintN').textContent = S.hints; $('#timeN').textContent = fmt(S.time);
  $('#clock').classList.toggle('low', S.time <= 60);
  $('#hintBtn').classList.toggle('off', S.hints <= 0);
}
function objective() {
  if (S.ri < 0) return; const all = R().objective, steps = all.filter(o => o.needs).length, o = all.find(o => !o.needs || !o.needs.every(n => S.done.has(n)));
  $('#objective').textContent = o ? (o.needs ? `${U('step')} ${all.indexOf(o) + 1}/${steps}: ${o.text}` : o.text) : '';
  const req = R().hotspots.filter(h => (h.kind === 'INSPECT' || h.kind === 'LEARN') && h.id !== 'r5_raven');
  const found = req.filter(h => S.done.has(h.id)).length;
  $('#strip').innerHTML = req.length ? `<b>${U('cluesFound')} ${found}/${req.length}</b>` + req.map(h => `<i class="${S.done.has(h.id) ? 'got' : ''}">${S.done.has(h.id) ? '✓ ' + esc(h.label) : '?'}</i>`).join('') : '';
  if (S.ri === 4) battleHud();
}
const clockOn = () => S.phase === 'play' && !S.menu && !S.dlg && !S.freeze;
let lastTick = performance.now();
setInterval(() => {
  const now = performance.now(), dt = (now - lastTick) / 1000; lastTick = now;
  if (clockOn()) { const before = Math.ceil(S.time); S.time -= dt; hud(); if (S.time <= 10 && Math.ceil(S.time) < before && S.time > 0) sfx('beep'); if (S.time <= 0) { S.time = 0; hud(); endScreen('timeup'); } }
  if (S.phase === 'play' && !S.menu && !S.dlg && !S.idleShown && S.ri === 0 && !$('#panel').offsetParent && Date.now() - S.lastTap > cfg().idleSeconds * 1000) { S.idleShown = true; say('idle'); }
}, 200);
addEventListener('pointerdown', () => { if (S) S.lastTap = Date.now(); }, true);

/* ---------- dialogue ---------- */
let dlg = null; const dq = [];
function say(keys, o = {}) {
  return new Promise(res => {
    const lines = [].concat(keys).map(k => typeof k === 'string' ? (G.dialogue[k] || (console.warn('no line', k), null)) : k).filter(Boolean);
    if (!lines.length) return res();
    const seq = { lines, i: 0, res, block: !!o.block || lines.some(l => l.p), keep: !!o.keep };
    if (dlg && !dlg.block) endSeq(true);
    if (dlg) dq.push(seq); else startSeq(seq);
  });
}
function startSeq(seq) { dlg = seq; showLine(); }
function showLine() {
  const l = dlg.lines[dlg.i], sp = G.speakers[l.s] || G.speakers.narrator;
  S.dlg = l.p ? 1 : 0;
  $('#catch').hidden = !(dlg.block || l.p);
  $('#speech .port').innerHTML = l.bust ? art(l.bust, `<span class="ini">${sp.initial}</span>`) : portrait(l.s);
  $('#speech .who').textContent = l.name || sp.name; $('#speech .line').textContent = l.t;
  $('#speech .tap').textContent = U('tapContinue'); $('#speech').hidden = false;
  narrate(l.t, l.s, l.audioFile);
  preloadVoice((dlg.lines[dlg.i + 1] || {}).audioFile);
}
function endSeq(silentNext) {
  const seq = dlg; if (!seq) return; dlg = null; S.dlg = 0; stopVoice();
  $('#speech').hidden = true; $('#catch').hidden = true;
  seq.res();
  if (!silentNext || true) { const n = dq.shift(); if (n) startSeq(n); }
}
function advance() { if (!dlg) return; if (++dlg.i >= dlg.lines.length) endSeq(); else showLine(); }
addEventListener('pointerdown', e => {
  const t = e.target.closest ? e.target : null; if (!t) return;
  if (t.closest('.spot')) sfx('tap'); else if (t.closest('.btn,.x,.card1,.cs-card,.disc,.ban,.peg,.cell,.piece,.tfact,.lord,.slot,#speech')) sfx('tick');
}, true);
$('#speech').addEventListener('click', e => { if (e.target.closest('.skip')) endSeq(); else advance(); });
$('#catch').addEventListener('click', advance);

/* ---------- panel / pause ---------- */
let panelClose = null;
function openPanel(title, body, opts = {}) {
  closePanel(true);
  $('#ptitle').textContent = title; const b = $('#pbody'); b.innerHTML = ''; b.appendChild(body);
  $('#panel').hidden = false; $('#panel').querySelector('.pbox').scrollTop = 0; panelClose = opts.onClose || null;
}
function closePanel(quiet) {
  if ($('#panel').hidden && !panelClose) return;
  $('#panel').hidden = true; stopVoice(); if (dlg && !dlg.block && !dlg.keep) endSeq();
  const f = panelClose; panelClose = null; if (f && !quiet) f();
}
$('#panel .x').onclick = () => closePanel();
$('#panel').addEventListener('pointerdown', e => { if (e.target.id === 'panel') closePanel(); });
$('#book .x').onclick = () => { $('#book').hidden = true; };
$('#book').addEventListener('pointerdown', e => { if (e.target.id === 'book') $('#book').hidden = true; });
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('#book').hidden) $('#book').hidden = true; else if (!$('#panel').hidden) closePanel();
});
function setPause(on) {
  if (on && (S.phase === 'start' || S.phase === 'info' || S.phase === 'over')) return;
  S.menu = on; if (on) pauseLabels(); $('#pausemenu').hidden = !on; document.body.classList.toggle('paused', on);
  $('#panel').style.visibility = on ? 'hidden' : '';
  $('#battleHud').style.visibility = $('#s7hud').style.visibility = on ? 'hidden' : '';
  if (on) { if (vo && !vo.paused && !vo.ended) { vo.pause(); voPaused = true; } else { stopVoice(); try { speechSynthesis.pause(); } catch (e) {} } }
  else { try { speechSynthesis.resume(); } catch (e) {} if (voPaused && S.voice) { voPaused = false; vo.play().catch(() => {}); } else if (dlg) showLine(); }
  if (bgm) { if (on) bgm.pause(); else if (S.music) bgm.play().catch(() => {}); }
}
$('#pauseBtn').onclick = () => setPause(true);
$('#pmResume').onclick = () => setPause(false);
$('#pmBook').onclick = () => openBook();
$('#pmMusic').onclick = () => { S.music = !S.music; if (bgm) { if (S.music) bgm.play().catch(() => {}); else bgm.pause(); } pauseLabels(); };
$('#pmFx').onclick = () => { S.fx = !S.fx; pauseLabels(); if (S.fx) sfx('tap'); };
$('#pmVoice').onclick = () => { S.voice = !S.voice; if (!S.voice) stopVoice(); pauseLabels(); };
$('#pmRestart').onclick = () => { if ($('#pmRestart').dataset.sure) { delete $('#pmRestart').dataset.sure; setPause(false); restartGame(); } else { $('#pmRestart').dataset.sure = 1; $('#pmRestart').textContent = U('restartSure'); } };
function pauseLabels() {
  $('#pmResume').textContent = U('resume'); $('#pmBook').textContent = U('book'); $('#pmRestart').textContent = U('restart'); delete $('#pmRestart').dataset.sure;
  $('#pmMusic').textContent = S.music ? U('musicOn') : U('musicOff');
  $('#pmFx').textContent = S.fx ? U('fxOn') : U('fxOff');
  $('#pmVoice').textContent = S.voice ? U('voiceOn') : U('voiceOff');
}

/* ---------- panorama + projection ---------- */
const hfovNow = () => innerWidth < innerHeight ? 88 : 100;
async function loadPano(room) {
  const ok = await imgOk(room.pano); S.panoOk[room.n] = ok;
  const src = ok ? room.pano : fallbackCanvas(room.name, room.accent, 'room');
  room.src = src;
  if (viewer) { try { viewer.destroy(); } catch (e) {} viewer = null; }
  $('#pano').innerHTML = '';
  await new Promise(res => {
    viewer = pannellum.viewer('pano', {
      type: 'equirectangular', panorama: src, autoLoad: true, showControls: false, compass: false, hfov: hfovNow(), minHfov: 50, maxHfov: 110,
      yaw: room.yaw, pitch: room.pitch, mouseZoom: false, keyboardZoom: false, doubleClickZoom: false, draggable: true
    });
    viewer.on('load', res); viewer.on('error', res); setTimeout(res, 8000);
  });
}
addEventListener('resize', () => { if (viewer) viewer.setHfov(hfovNow(), false); });
function project(yaw, pitch) {
  if (!viewer) return null;
  const st = $('#stage'), W = st.clientWidth, H = st.clientHeight, d = Math.PI / 180;
  const f = (W / 2) / Math.tan(viewer.getHfov() * d / 2), dy = (yaw - viewer.getYaw()) * d, p = pitch * d, q = viewer.getPitch() * d;
  const x = Math.cos(p) * Math.sin(dy), y = Math.sin(p), z = Math.cos(p) * Math.cos(dy);
  const y2 = y * Math.cos(q) - z * Math.sin(q), z2 = y * Math.sin(q) + z * Math.cos(q);
  if (z2 <= .05) return null;
  return { x: W / 2 + f * x / z2, y: H / 2 - f * y2 / z2, z: z2, W, H };
}
const projSet = new Set();
function place(e, yaw, pitch, scale = 1) { e.__y = yaw; e.__p = pitch; e.__s = scale; projSet.add(e); }
function unplace(e) { projSet.delete(e); e.remove(); }
const tweens = []; let last = performance.now();
function frame(now) {
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  if (!S.menu) { tickBattle(dt); tickR7(dt); }
  for (let i = tweens.length - 1; i >= 0; i--) {
    const t = tweens[i]; if (S.menu) break; t.t += dt; const k = clamp(t.t / t.d, 0, 1);
    place(t.el, t.a[0] + (t.b[0] - t.a[0]) * k, t.a[1] + (t.b[1] - t.a[1]) * k, t.el.__s);
    if (k >= 1) { tweens.splice(i, 1); unplace(t.el); t.end && t.end(); }
  }
  if (viewer) projSet.forEach(e => {
    const p = project(e.__y, e.__p);
    if (!p || p.x < -80 || p.y < -80 || p.x > p.W + 80 || p.y > p.H + 80) { e.style.display = 'none'; return; }
    e.style.display = ''; e.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%) scale(${e.__s * clamp(1 / p.z, .6, 1.6) ** .3})`;
  });
  requestAnimationFrame(frame);
}

/* ---------- hotspots ---------- */
const visible = h => (h.after || []).every(a => S.done.has(a)) && !(h.king != null && S.stage >= 3);
function renderSpots() {
  const box = $('#spots'); [...box.querySelectorAll('.spot')].forEach(unplace);
  if (S.ri < 0 || S.phase !== 'play') return;
  R().hotspots.forEach(h => {
    if (!visible(h)) return;
    const b = el('button', 'spot ' + h.kind.toLowerCase() + (S.done.has(h.id) ? ' done' : ''));
    b.setAttribute('aria-label', h.label || h.id); b.dataset.id = h.id;
    b.onclick = e => { e.stopPropagation(); onSpot(h); };
    box.appendChild(b); place(b, h.yaw, h.pitch);
  });
  objective();
}
function onSpot(h) {
  if (S.menu || dlg && dlg.block) return;
  if (h.kind === 'INSPECT') return openInspect(h);
  if (h.kind === 'LEARN') return openLearn(h);
  if (h.kind === 'PANEL') return openPanelFor(h);
  if (h.id === 'r7_horn') return startStage1();
  if (h.king != null) return openTrail();
}
let clueTok = 0;
const clueSay = (line, o) => { const t = ++clueTok; say(line, o).then(() => { if (t === clueTok) stepCheck(); }); };
function stepCheck() {
  if (S.phase !== 'play' || S.ri < 0) return;
  R().objective.forEach((o, i) => {
    const key = S.ri + ':' + i;
    if (o.then && o.needs.every(n => S.done.has(n)) && !S.stepSaid[key]) { S.stepSaid[key] = 1; say(o.then); }
  });
}
function openLearn(h) {
  let text = h.text;
  if (h.dynamic === 'raven') return openRaven();
  const b = el('div'); b.appendChild(el('div', 'parch', esc(text))); b.appendChild(el('div', 'saved', U('saved')));
  if (!S.done.has(h.id)) { S.done.add(h.id); note(h.id, h.note); sfx('chime'); renderSpots(); }
  openPanel(h.title, b);
  if (h.say) clueSay(h.say, { keep: true }); else stepCheck();
}
function openInspect(h) {
  // One spoken line, clue saved. No close-up screen.
  const text = h.views[h.views.length - 1].t;
  if (!S.done.has(h.id)) {
    S.done.add(h.id); S.notes.push({ id: h.id, text: h.note || text, room: R().n, lord: h.lord || null });
    toast(U('clueSaved')); sfx('chime'); renderSpots();
  }
  clueSay(h.say || { s: 'elowen', t: text, p: false });
}
function openPanelFor(h) {
  const fn = { sockets: panelSockets, stones: panelStones, forge: panelForge, council: panelCouncil, map: panelMap, dispatch: panelDispatch }[h.panel];
  const b = el('div'); fn(b, h); openPanel(h.title, b);
}

function clueBox() {
  const ns = S.notes.filter(n => n.room === R().n && n.id !== 'map'); if (!ns.length) return '';
  return `<div class="clues"><b>${U('learned')}</b>${ns.map(n => `<div>• ${esc(n.text)}</div>`).join('')}</div>`;
}
/* ---------- drag / tap-to-place helper ---------- */
function pickDrop(root, itemSel, dropSel, cb) {
  let sel = null;
  const clear = () => { root.querySelectorAll('.sel').forEach(e => e.classList.remove('sel')); sel = null; };
  root.addEventListener('pointerdown', e => {
    const it = e.target.closest(itemSel); if (!it || !root.contains(it) || locked()) return;
    const sx = e.clientX, sy = e.clientY; let ghost = null;
    const move = ev => {
      if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) { ghost = it.cloneNode(true); ghost.classList.add('ghost'); document.body.appendChild(ghost); it.classList.add('drag'); }
      if (ghost) { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; }
    };
    const up = ev => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      if (ghost) {
        ghost.remove(); it.classList.remove('drag');
        const d = document.elementsFromPoint(ev.clientX, ev.clientY).find(x => x.matches && x.matches(dropSel) && root.contains(x));
        clear(); if (d) cb(it.dataset.id, d.dataset.id);
      } else if (sel === it) clear(); else { clear(); sel = it; it.classList.add('sel'); }
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  });
  root.addEventListener('click', e => {
    const d = e.target.closest(dropSel);
    if (d && sel && root.contains(d) && !e.target.closest(itemSel)) { const id = sel.dataset.id; clear(); cb(id, d.dataset.id); }
  });
}

/* ---------- Room 1: crest sockets ---------- */
function panelSockets(b) {
  const K = G.sockets, name = id => K.crests.find(c => c.id === id);
  const discHtml = id => `<button class="disc" data-id="${id}" aria-label="${name(id).name}">${art('crest_' + id, name(id).letter)}</button>`;
  const labeled = id => `<div class="dw">${discHtml(id)}<small>${S.done.has(name(id).spot) ? name(id).king : '?'}</small></div>`;
  const draw = () => {
    b.innerHTML = `<div class="hint">${esc(U('socketHint'))}</div>${clueBox()}<div class="sockets">${S.sock.map((c, i) => `<div class="socket lockable" data-id="${i}"><small>${K.numerals[i]}</small>${c ? discHtml(c).replace('class="disc"', 'class="disc placed"') : ''}</div>`).join('')}</div>
      <div class="tray">${K.order.filter(c => !S.sock.includes(c)).map(labeled).join('')}</div><div class="msg"></div>`;
  };
  draw();
  b.addEventListener('click', e => { const p = e.target.closest('.placed'); if (p && !locked()) { S.sock[S.sock.indexOf(p.dataset.id)] = null; draw(); } });
  pickDrop(b, '.tray .disc', '.socket', async (c, i) => {
    if (S.sock[i]) return; S.sock[i] = c; sfx('clack'); draw();
    if (S.sock.every(Boolean)) {
      await sleep(500);
      if (Rules.sockets(G, S.sock)) { S.done.add('r1_sockets'); roomSolved(); }
      else { b.querySelector('.msg').textContent = U('socketWrong'); wrong('r1', 'r1.wrong'); await sleep(cfg().lockout * 1000 - 200); S.sock = [null, null, null, null]; if (b.isConnected) draw(); }
    }
  });
}

/* ---------- Room 2: stones ---------- */
function panelStones(b) {
  const rows = G.stones.rows, treeIds = ['r2_tree1', 'r2_tree2', 'r2_tree3', 'r2_tree4'];
  const okStone = (r, c) => {
    const s = rows[r][c]; if (s === 'thorn') return false;
    if (r === 0 && s !== 'leaf') return false; if (r === rows.length - 1 && s !== 'star') return false;
    if (r > 0) { const pc = S.path[r - 1]; if (rows[r - 1][pc] === s || Math.abs(c - pc) > 1) return false; if (r > 1) { const a = pc - S.path[r - 2], d = c - pc; if (a !== 0 && a === d) return false; } }
    return true;
  };
  const draw = () => {
    const stuck = S.path.length < rows.length && ![0, 1, 2].some(c => okStone(S.path.length, c));
    let h = `<div class="hint">${esc(U('stoneHint'))}</div><ol class="rules">${G.stones.rules.map((r, i) => `<li class="${S.done.has(treeIds[i]) ? '' : 'hid'}">${S.done.has(treeIds[i]) ? esc(r) : '???'}</li>`).join('')}</ol><div class="stones">`;
    for (let r = rows.length - 1; r >= 0; r--) {
      h += '<div class="srow">';
      rows[r].forEach((s, c) => {
        const on = S.path[r] === c, can = r === S.path.length && okStone(r, c), undo = r === S.path.length - 1 && on;
        h += `<button class="stone lockable${on ? ' path' : ''}${!can && !undo && !on ? ' dim' : ''}" data-r="${r}" data-c="${c}" aria-label="${s}">${svg(s)}${on ? `<span class="n">${r + 1}</span>` : ''}</button>`;
      });
      h += '</div>';
    }
    h += `</div><div class="msg">${stuck ? U('stoneStuck') : ''}</div><div class="row"><button class="btn lockable" id="walk" ${S.path.length === rows.length ? '' : 'disabled'}>${U('walk')}</button><button class="btn lockable" id="reset">${U('reset')}</button></div>`;
    b.innerHTML = h;
    b.querySelectorAll('.stone').forEach(s => s.onclick = () => {
      const r = +s.dataset.r, c = +s.dataset.c;
      sfx('stone');
      if (r === S.path.length - 1 && S.path[r] === c) S.path.pop();
      else if (r === S.path.length && (r === 0 || Math.abs(c - S.path[r - 1]) <= 1)) S.path.push(c);
      draw();
    });
    b.querySelector('#reset').onclick = () => { S.path = []; draw(); };
    b.querySelector('#walk').onclick = async () => {
      if (Rules.stones(G, S.path) === null) { S.done.add('r2_stones'); roomSolved(); return; }
      S.path = []; draw(); b.querySelector('.msg').textContent = U('stoneWrong'); await wrong('r2', 'r2.wrong');
    };
  };
  draw();
}

/* ---------- Room 3: forge ---------- */
function panelForge(b) {
  const F = G.forge;
  const draw = () => {
    let iron = 0, dark = 0; F.items.forEach(it => { iron += S.forge[it.id] * it.iron; dark += S.forge[it.id] * it.dark; });
    let sw = 0, sh = 0, fine = 0; F.items.forEach(it => { const n = S.forge[it.id]; if (it.kind === 'sword') { sw += n; if (it.fine) fine += n; } else sh += n; });
    b.innerHTML = `<div class="hint">${esc(U('forgeHint'))}</div>${clueBox()}<div class="info totals">${U('forgeTotals').replace('{0}', sw).replace('{1}', sh).replace('{2}', fine)}</div><div class="bins"><div class="bin">${U('iron')}<b>${F.ore.iron - iron}</b></div><div class="bin">${U('darksteel')}<b>${F.ore.darksteel - dark}</b></div></div>` +
      F.items.map(it => `<div class="frow"><div class="ico">${art(it.cut, esc(it.name))}</div><div class="nm">${esc(it.name)}<small>${it.iron} ${U('iron')}${it.dark ? ' + ' + it.dark + ' ' + U('darksteel') : ''}</small></div>
      <button class="btn sm lockable" data-i="${it.id}" data-d="-1">-</button><span class="n">${S.forge[it.id]}</span><button class="btn sm lockable" data-i="${it.id}" data-d="1" ${iron + it.iron > F.ore.iron || dark + it.dark > F.ore.darksteel ? 'disabled' : ''}>+</button></div>`).join('') +
      `<div class="msg"></div><div class="row"><button class="btn primary big lockable" id="go">${U('forgeGo')}</button></div>`;
    b.querySelectorAll('[data-d]').forEach(x => x.onclick = () => { S.forge[x.dataset.i] = Math.max(0, S.forge[x.dataset.i] + +x.dataset.d); draw(); });
    b.querySelector('#go').onclick = async () => {
      const r = Rules.forge(G, S.forge);
      if (r === null) { S.done.add('r3_board'); roomSolved(); return; }
      b.querySelector('.msg').textContent = U('forge_' + r); await wrong('r3', 'r3.wrong');
    };
  };
  draw();
}

/* ---------- Room 4: council ---------- */
function panelCouncil(b) {
  const C = G.council;
  const draw = () => {
    b.innerHTML = `<div class="hint">${esc(U('councilHint'))}</div><div class="lords">${C.lords.map(l => `<button class="btn lord${S.won[l.id] ? ' won' : ''}${S.lordSel === l.id ? ' sel' : ''}" data-l="${l.id}"><span class="p">${portrait(l.id)}</span>${esc(l.name)}${S.won[l.id] ? ' ✓' : ''}</button>`).join('')}</div>
      <div class="clues"><b>${U('noticed')}</b>${S.lordSel ? S.notes.filter(n => n.lord === S.lordSel).map(n => `<div>• ${esc(n.text)}</div>`).join('') : `<div>${U('pickLord')}</div>`}</div><div class="cards">${S.lordSel && S.won[S.lordSel] ? `<div class="hint">${U('lordDone')}</div>` : S.lordSel ? C.options[S.lordSel].map(k => `<button class="card1${S.cardSel === k ? ' sel' : ''}" data-c="${k}"><span>${esc(C.cards[k])}</span></button>`).join('') : ''}</div>
      <div class="msg"></div>`;
    b.querySelectorAll('[data-l]').forEach(x => x.onclick = () => { S.lordSel = x.dataset.l; S.cardSel = null; draw(); });
    b.querySelectorAll('[data-c]').forEach(x => x.onclick = () => { if (locked()) return; S.cardSel = x.dataset.c; speak(); });
    const speak = async () => {
      const l = S.lordSel, c = S.cardSel;
      if (S.won[l]) { b.querySelector('.msg').textContent = U('lordWon'); return; }
      if (Rules.council(G, l, c)) {
        S.won[l] = true; S.cardSel = null; sfx('chime'); draw();
        if (C.lords.every(x => S.won[x.id])) { S.done.add('r4_table'); roomSolved(`r4.won.${l}`); } else say(`r4.won.${l}`);
      } else {
        const line = G.dialogue[`r4.wrong.${l}`]; b.querySelector('.msg').textContent = `${line.t}`; S.cardSel = null;
        penalize(); lock(); shakePanel(); S.wrongs.r4 = (S.wrongs.r4 || 0) + 1; say(`r4.wrong.${Math.min(3, S.wrongs.r4)}`); setTimeout(() => b.isConnected && (draw(), b.querySelector('.msg').textContent = line.t), 50);
      }
    };
  };
  draw();
}

/* ---------- Room 6: map + dispatch ---------- */
let mapUrl = null;
async function mapSrc() { if (!mapUrl) mapUrl = (await imgOk(G.art.map)) ? G.art.map : fallbackCanvas('', '', 'map'); return mapUrl; }
function panelMap(b) {
  const draw = () => {
    const placed = S.mapPlaced, done = S.mapDone, bg = i => `background-image:url(${mapUrl});background-size:300% 200%;background-position:${(i % 3) * 50}% ${Math.floor(i / 3) * 100}%`;
    b.innerHTML = `<div class="hint">${esc(U(done ? 'mapDone' : 'mapHint'))}</div><div class="board">${[0, 1, 2, 3, 4, 5].map(i => `<div class="cell" data-id="${i}">${placed[i] ? `<div class="piece" style="${bg(i)}"></div>` : ''}</div>`).join('')}</div>` +
      (done ? `<div class="legend">${G.dispatch.hosts.map(h => `<span>${esc(h.name)}</span><b>${h.road} ${U('leagues')}</b>`).join('')}</div>` : `<div class="tray">${[3, 0, 5, 2, 4, 1].filter(i => !placed[i]).map(i => `<div class="piece" data-id="${i}" style="${bg(i)}"></div>`).join('')}</div>`);
  };
  mapSrc().then(() => { draw(); });
  pickDrop(b, '.tray .piece', '.cell', (p, c) => {
    if (p === c) { sfx('snap'); S.mapPlaced[p] = true; if (Object.keys(S.mapPlaced).length === 6) { S.mapDone = true; S.done.add('r6_map'); note('map', U('mapNote')); award(0); renderSpots(); toast(U('mapRestored')); say('r6.map').then(stepCheck); } draw(); }
    else { sfx('nope'); toast(U('pieceNo')); }
  });
}
function panelDispatch(b) {
  const D = G.dispatch;
  const ban = h => `<div class="ban" data-id="${h.id}">${art(h.art, '', '')}<span>${esc(h.name)}</span><span>${h.days} ${U('days')}</span></div>`;
  const draw = () => {
    const at = d => D.hosts.find(h => S.disp[h.id] === d);
    b.innerHTML = `<div class="hint">${esc(U('dispatchHint'))}</div><div class="pegs">${Array.from({ length: D.pegs }, (_, i) => `<div class="peg lockable" data-id="${i + 1}">${U('day')} ${i + 1}${at(i + 1) ? `<div class="ban placed" data-id="${at(i + 1).id}">${art(at(i + 1).art, '')}<span>${esc(at(i + 1).name)}</span><span>${at(i + 1).days} ${U('days')}</span></div>` : ''}</div>`).join('')}</div>
      <div class="tray">${D.hosts.filter(h => !S.disp[h.id]).map(ban).join('')}</div><div class="msg"></div><div class="row"><button class="btn primary big lockable" id="send" ${D.hosts.every(h => S.disp[h.id]) ? '' : 'disabled'}>${U('send')}</button></div>`;
    b.querySelector('#send').onclick = async () => {
      const bad = Rules.dispatch(G, S.disp);
      if (!bad.length) { S.done.add('r6_rail'); roomSolved(); return; }
      const x = bad[0]; b.querySelector('.msg').textContent = `${x.host.name}: ` + (x.diff < 0 ? U('early') : U('late'));
      await wrong('r6', 'r6.wrong', { s: 'oswin', t: `${x.host.name}: ${x.diff < 0 ? U('early') : U('late')}`, p: false });
    };
  };
  draw();
  b.addEventListener('click', e => { const p = e.target.closest('.placed'); if (p && !locked()) { delete S.disp[p.dataset.id]; draw(); } });
  pickDrop(b, '.tray .ban', '.peg', (h, d) => { if (D.hosts.some(x => S.disp[x.id] === +d)) return; S.disp[h] = +d; sfx('clack'); draw(); });
}

/* ---------- reward flow ---------- */
let solving = false;
async function roomSolved(lastLine) {
  if (solving) return; solving = true; closePanel(true); sfx('success');
  const r = R(), n = r.n; $('#flash').classList.remove('on'); void $('#flash').offsetWidth; $('#flash').classList.add('on');
  const lines = [`r${n}.right.1`, `r${n}.right.2`];
  if (lastLine) lines.unshift(lastLine);
  lines.push(r.reward.marshal ? 'r6.marshal' : `r${n}.oath`);
  await say(lines, { block: true });
  const rw = r.reward;
  await oathScreen(rw);
  award(cfg().oathPoints);
  if (rw.oath) S.oaths.push(rw.oath);
  S.horn[n - 1] = G.horn[rw.horn]; S.facts[n - 1] = G.ashfall[rw.fact];
  S.cleared[S.ri] = true; solving = false; objective(); renderSpots();
  toast(rw.oath ? U('oathWon').replace('{0}', G.oaths.find(o => o.id === rw.oath).name) : U('hornWon'));
  if (S.ri === 4) { $('#battleHud').hidden = true; }
  showNext();
}
function oathScreen(rw) {
  const o = rw.oath ? G.oaths.find(x => x.id === rw.oath) : null, box = $('#oathScreen');
  const artName = o ? o.art : 'horn_highmere', letter = o ? o.letter : 'H';
  box.querySelector('.flag').innerHTML = art(artName, `<div class="cssflag">${letter}</div>`);
  box.querySelector('h2').textContent = o ? o.title : U('hornTitle');
  box.querySelector('p').textContent = o ? o.gives : U('hornLine').replace('{0}', G.horn[rw.horn]);
  box.querySelector('.tap').textContent = U('tapContinue');
  sfx('fanfare'); setTimeout(() => sfx('flap'), 400); box.className = ''; box.querySelector('.mast').classList.toggle('hasart', cut.has(alias(artName))); box.hidden = false; void box.offsetWidth; box.classList.add('go'); bgmLevel(BGV * .6);
  return new Promise(res => {
    const t0 = Date.now();
    box.onclick = () => { if (Date.now() - t0 < 1800) return; box.onclick = null; box.hidden = true; bgmLevel(BGV); res(); };
  });
}
function showNext() {
  const nx = G.rooms[S.ri + 1]; if (!nx) return;
  const b = $('#next'); b.textContent = U('goOn').replace('{0}', nx.name); b.hidden = false;
  b.onclick = () => { b.hidden = true; enterRoom(S.ri + 1); };
}

/* ---------- Book ---------- */
let bookTab = 'oaths';
function openBook() {
  const tabs = ['oaths', 'horn', 'ashfall'].concat(S.ri >= 3 ? ['lords'] : [], S.mapDone ? ['map'] : [], ['notes']);
  if (!tabs.includes(bookTab)) bookTab = 'oaths';
  const t = $('#tabs'); t.innerHTML = '';
  tabs.forEach(k => { const x = el('button', 'btn' + (k === bookTab ? ' on' : ''), U('tab_' + k)); x.onclick = () => { bookTab = k; openBook(); }; t.appendChild(x); });
  const body = $('#bookBody'); let h = '';
  if (bookTab === 'oaths') h = `<div class="oaths">${G.oaths.map(o => { const w = S.oaths.includes(o.id); return `<div class="oath${w ? '' : ' lock'}"><div class="flag">${art(o.art, `<div class="cssb">${o.letter}</div>`)}</div><b>${esc(o.name)}</b><br>${w ? esc(o.gives) : U('notSworn')}</div>`; }).join('')}</div>`;
  if (bookTab === 'horn') h = `<div class="hint">${U('hornHint')}</div><div class="slots">${G.horn.map((_, i) => `<div class="slotn${S.horn[i] ? ' on' : ''}">${S.horn[i] || '?'}</div>`).join('')}</div>`;
  if (bookTab === 'ashfall') h = `<div class="facts">${G.ashfall.map((f, i) => `<p class="${S.facts[i] ? '' : 'lock'}"><b>${i + 1}.</b> ${S.facts[i] ? esc(f) : '???'}</p>`).join('')}</div>`;
  if (bookTab === 'lords') h = `<div class="notes">${G.council.lords.map(l => `<p><small>${esc(l.name)}</small>${S.notes.filter(n => n.lord === l.id).map(n => esc(n.text)).join('<br>') || '???'}</p>`).join('')}</div>`;
  if (bookTab === 'map') h = `<div class="mapimg" style="background-image:url(${mapUrl})"></div><div class="legend">${G.dispatch.hosts.map(x => `<span>${esc(x.name)}</span><b>${x.road} ${U('leagues')}</b>`).join('')}</div>`;
  if (bookTab === 'notes') h = `<div class="notes">${S.notes.length ? S.notes.map(n => `<p><small>${n.room ? G.rooms[n.room - 1].name : ''}</small>${esc(n.text)}</p>`).join('') : `<p>${U('noNotes')}</p>`}</div>`;
  body.innerHTML = h; $('#book').hidden = false;
}
$('#bookBtn').onclick = () => { if (S.phase === 'play') openBook(); };

/* ---------- hint ---------- */
$('#hintBtn').onclick = () => {
  if (S.phase !== 'play' || S.menu) return;
  if (S.cleared[S.ri] && S.ri < 6) return say('hint.done');
  if (S.hints <= 0) return say('hint.none');
  if (S.score < cfg().hintCost) return toast(U('hintNoRenown').replace('{0}', U('renown')));
  S.hints--; penalize(cfg().hintCost); hud(); sfx('chime');
  say(S.ri === 6 ? `r7.hint.s${Math.min(3, S.stage)}` : `r${R().n}.hint`);
};

/* ---------- rooms ---------- */
async function enterRoom(i) {
  const r = G.rooms[i]; S.ri = i; solving = false;
  sfx('door'); $('#fade').classList.add('on'); await sleep(260);
  bat.sprites.forEach(x => unplace(x.el)); bat.sprites = []; if (S.b) S.b.running = false; $('#fx').innerHTML = ''; document.querySelectorAll('.slot,.sidelabel').forEach(unplace);
  $('#next').hidden = true; $('#battleHud').hidden = true; $('#s7hud').hidden = true; $('#courtBtn').hidden = $('#choiceBtn').hidden = true;
  document.documentElement.style.setProperty('--accent', r.accent);
  await loadPano(r); S.phase = 'play'; renderSpots(); objective(); hud();
  $('#fade').classList.remove('on');
  if (i === 5) await mapSrc();
  if (i === 4) initBattle();
  if (i === 6) initR7();
  if (!S.seen[i]) {
    S.seen[i] = 1;
    const keys = Object.keys(G.dialogue).filter(k => k.startsWith(`r${r.n}.enter.`)).sort();
    await say(keys, { block: true });
    const b = el('div'); b.appendChild(el('div', 'parch', esc(r.goal)));
    openPanel(`${U('room')} ${r.n}: ${r.name}`, b, i === 4 ? { onClose: () => { if (S.b && !S.b.read && !S.cleared[4]) openRaven(); } } : {});
    if (i === 6) say('r7.s1.start');
  }
}

/* ---------- Room 5 battle ---------- */
const SIDES = ['N', 'E', 'S', 'W'];
const bat = { sprites: [], slotEls: {} };
const foeName = (t, n) => n > 1 ? G.battle.enemies[t].plural : G.battle.enemies[t].name;
function newBattle() { return { wave: 0, wall: cfg().wallStrength, placed: { N: [null, null, null], E: [null, null, null], S: [null, null, null], W: [null, null, null] }, tool: 'archer', read: false, running: false, t: 0 }; }
function initBattle() { S.b = S.b || newBattle(); battleHud(); slotsRender(); }
const enemySummary = s => { const m = G.battle.waves[S.b.wave].sides[s]; return m ? Object.entries(m).map(([t, n]) => `${n} ${foeName(t, n)}`).join(', ') : ''; };
function slotsRender() {
  document.querySelectorAll('.slot,.sidelabel').forEach(unplace); bat.slotEls = {};
  const b = S.b, R5 = G.rooms[4]; if (!b || S.phase !== 'play' || S.ri !== 4 || S.cleared[4] || (!b.read && !b.running)) return;
  SIDES.forEach(s => {
    if (!b.running) {
      const foes = enemySummary(s), lab = el('div', 'sidelabel' + (foes ? ' hot' : ''), `${G.battle.names[s]}${foes ? `<small>${esc(foes)}</small>` : ''}`);
      $('#spots').appendChild(lab); place(lab, R5.sides[s], -1);
    }
    for (let j = 0; j < 3; j++) {
      const id = b.placed[s][j], d = id && G.battle.defenders.find(x => x.id === id);
      if (b.running && !id) continue;
      const e = el(b.running ? 'div' : 'button', 'slot' + (id ? ' full' : '') + (b.running ? ' fight' : ''), id ? art(d.cut, `<span class="ic">${esc(d.name)}</span>`) : '+');
      if (!b.running) { e.setAttribute('aria-label', `${G.battle.names[s]} ${j + 1}`); e.onclick = ev => { ev.stopPropagation(); if (S.menu || dlg && dlg.block) return; slotTap(s, j); }; }
      $('#spots').appendChild(e); place(e, R5.sides[s] + (j - 1) * 13, -6); bat.slotEls[s + j] = e;
    }
  });
}
function slotTap(s, j) {
  const b = S.b, cur = b.placed[s][j];
  if (b.tool === 'remove' || (cur && cur === b.tool)) { b.placed[s][j] = null; }
  else {
    const d = G.battle.defenders.find(x => x.id === b.tool), spent = Rules.cost(G, b.placed) - (cur ? G.battle.defenders.find(x => x.id === cur).cost : 0);
    if (spent + d.cost > G.battle.waves[b.wave].budget) { toast(U('noBudget')); return; }
    b.placed[s][j] = d.id;
  }
  slotsRender(); battleHud();
}
function ravenReport() {
  const w = G.battle.waves[S.b.wave];
  return Object.entries(w.sides).map(([s, m]) => `${G.battle.names[s]}: ` + Object.entries(m).map(([t, n]) => `${n} ${foeName(t, n)}`).join(', ')).join('\n');
}
function openRaven() {
  const w = G.battle.waves[S.b.wave], b = el('div');
  b.appendChild(el('div', 'parch', esc(`${U('wave')} ${S.b.wave + 1}/${G.battle.waves.length}: ${w.name}\n${U('budget')}: ${w.budget}\n\n${ravenReport()}\n\n${U('ravenTip')}`)));
  const go = el('div', 'row'); const gb = el('button', 'btn primary big', U('btnBuild')); gb.onclick = () => closePanel(); go.appendChild(gb); b.appendChild(go);
  if (!S.stepSaid.raven) { S.stepSaid.raven = 1; say('r5.raven'); }
  S.b.read = true; S.done.add('r5_raven'); note('r5_raven-' + S.b.wave, `${U('wave')} ${S.b.wave + 1}: ` + ravenReport().replace(/\n/g, '; '));
  openPanel(G.rooms[4].hotspots.find(h => h.id === 'r5_raven').title, b); slotsRender(); renderSpots(); battleHud();
}
const wallBar = () => `<div class="wallbar">${Array.from({ length: cfg().wallStrength }, (_, i) => `<i class="${i < S.b.wall ? '' : 'x'}"></i>`).join('')}</div>`;
function battleHud() {
  const box = $('#battleHud'), b = S.b; if (!b || S.ri !== 4 || S.cleared[4]) { box.hidden = true; return; }
  box.hidden = false; const w = G.battle.waves[b.wave], spent = Rules.cost(G, b.placed);
  let h = `<div class="info">${U('wave')} ${b.wave + 1}/${G.battle.waves.length}: ${esc(w.name)} · ${U('wall')} ${wallBar()}</div>`;
  if (b.running) h += fightLine();
  else if (b.read) {
    h += `<div class="info">${U('budget')}: ${w.budget - spent} / ${w.budget}</div><div class="hint tip">${esc(U('buildTip'))}</div><div class="bar">` +
      G.battle.defenders.map(d => `<button class="btn tool${b.tool === d.id ? ' sel' : ''}" data-t="${d.id}">${art(d.cut, '')}${esc(d.name)} ${d.cost}</button>`).join('') +
      `<button class="btn tool${b.tool === 'remove' ? ' sel' : ''}" data-t="remove">${U('remove')}</button></div><div class="bar"><button class="btn tool" id="rep">${U('raven')}</button><button class="btn primary big" id="startWave">${U('startWave')}</button></div>`;
  } else h += `<div class="info">${U('readRaven')}</div>`;
  box.innerHTML = h;
  box.querySelectorAll('[data-t]').forEach(x => x.onclick = () => { b.tool = x.dataset.t; battleHud(); });
  const rp = box.querySelector('#rep'); if (rp) rp.onclick = openRaven;
  const sw = box.querySelector('#startWave'); if (sw) sw.onclick = startWave;
}
function fightLine() {
  const b = S.b, left = bat.sprites.filter(x => !x.dead).length;
  return `<div class="info">${U('volley')} ${Math.min(b.applied + 1, cfg().volleys)}/${cfg().volleys} · ${U('foes')}: <b>${left}</b></div>`;
}
function startWave() {
  const b = S.b; closePanel(true); b.running = true; b.t = 0; b.fired = 0; b.applied = 0; b.breached = false;
  b.sim = Rules.sim(G, b.wave, b.placed);
  const V = cfg().volleys, vs = cfg().volleySeconds; b.lastApply = (V - 1) * vs + vs * .5 + .65; b.arriveAt = b.lastApply + 1.2; b.T = b.arriveAt + 1.8;
  bat.sprites = []; const R5 = G.rooms[4];
  for (const [s, list] of Object.entries(b.sim.sides)) list.forEach((e, k) => {
    const def = G.battle.enemies[e.type], sp = el('div', 'sprite foe' + (def.air ? ' air' : ''));
    sp.innerHTML = `<div class="hpbar"><i></i></div><div class="walk" style="animation-delay:${-Math.random() * .6}s">${art(def.cut, `<div class="blob${def.air ? ' air' : ''}" style="background:${def.color}">${def.name[6] || def.name[0]}</div>`)}</div>`;
    sp.style.width = (def.hp > 8 ? 120 : def.air ? 84 : 72) + 'px'; $('#fx').appendChild(sp);
    const n = list.length, lat = (k - (n - 1) / 2) * Math.min(7, 26 / n);
    const x = { el: sp, e, side: s, yaw: R5.sides[s] + lat, air: def.air, row: (k % 2) * 1.6, max: def.hp, cy: 0, cp: 0 };
    bat.sprites.push(x); place(sp, x.yaw, def.air ? 25 : 3, .35);
  });
  slotsRender(); battleHud(); say(G.battle.waves[b.wave].intro); sfx('horn');
}
const slotPos = (side, j) => [G.rooms[4].sides[side] + (j - 1) * 13, -6];
function burst(yaw, pitch, color, n = 8) {
  const e = el('div', 'burst'); for (let i = 0; i < n; i++) { const a = Math.PI * 2 * i / n, s = el('i'); s.style.setProperty('--dx', Math.cos(a) * 38 + 'px'); s.style.setProperty('--dy', Math.sin(a) * 38 + 'px'); s.style.background = color; e.appendChild(s); }
  $('#fx').appendChild(e); place(e, yaw, pitch, 1); setTimeout(() => unplace(e), 700);
}
function floatNum(yaw, pitch, txt, cls) { const e = el('div', 'dmgnum ' + (cls || ''), `<span>${txt}</span>`); $('#fx').appendChild(e); place(e, yaw, pitch, 1); setTimeout(() => unplace(e), 1100); }
function fireVolley(v) {
  const b = S.b;
  for (const [s, row] of Object.entries(b.placed)) {
    let k = 0; const mine = bat.sprites.filter(x => x.side === s);
    row.forEach((id, j) => {
      if (!id) return; const d = G.battle.defenders.find(x => x.id === id); if (d.once && v > 1) return;
      let tg = mine.filter(x => x.e.hist[v - 1] > x.e.hist[v] && (d.air || !x.air)); if (!tg.length) tg = mine.filter(x => x.e.hist[v - 1] > 0 && (d.air || !x.air)); if (!tg.length) return;
      const t = tg[k++ % tg.length], pe = el('div', 'proj', art(id === 'archer' ? 'arrow' : id === 'ballista' ? 'bolt' : 'flame', `<div class="shot${d.once ? ' fl' : ''}"></div>`));
      $('#fx').appendChild(pe); pe.__s = 1;
      sfx(id === 'archer' ? 'arrow' : id === 'ballista' ? 'thump' : 'fire');
      const se = bat.slotEls[s + j]; if (se) { se.classList.remove('recoil'); void se.offsetWidth; se.classList.add('recoil'); }
      tweens.push({ el: pe, t: 0, d: .6, a: slotPos(s, j), b: [t.cy || t.yaw, (t.cp || 0) + 2], end: () => burst(t.cy || t.yaw, (t.cp || 0) + 2, d.once ? '#ff9a30' : '#e8dcc0', 6) });
    });
  }
}
function applyVolley(v) {
  let hit = false, died = false;
  bat.sprites.forEach(x => {
    if (x.dead) return; const before = x.e.hist[v - 1], after = x.e.hist[v];
    if (after < before) {
      hit = true;
      const w = x.el.querySelector('.walk'); w.classList.add('hit'); setTimeout(() => w.classList.remove('hit'), 200);
      x.el.querySelector('.hpbar i').style.width = Math.max(0, after / x.max * 100) + '%';
      floatNum(x.cy, x.cp + 6, '-' + (before - after), '');
    }
    if (after <= 0) { died = true; x.dead = true; x.el.classList.add('dead'); burst(x.cy, x.cp, x.air ? '#c7b5e8' : '#bfe4f5', 10); setTimeout(() => unplace(x.el), 700); }
  });
  if (hit) sfx('hit'); if (died) setTimeout(() => sfx('shatter'), 120);
  battleHud();
}
function tickBattle(dt) {
  const b = S.b; if (!b || !b.running) return;
  b.t += dt; const V = cfg().volleys, vs = cfg().volleySeconds;
  while (b.fired < V && b.t >= b.fired * vs + vs * .5) fireVolley(++b.fired);
  while (b.applied < V && b.t >= b.applied * vs + vs * .5 + .65) applyVolley(++b.applied);
  const u = clamp(b.t / b.arriveAt, 0, 1);
  bat.sprites.forEach(x => {
    if (x.dead) return; const far = x.air ? 25 : 3, near = x.air ? 12 : -2;
    x.cy = x.yaw; x.cp = far + (near - far) * u + x.row; place(x.el, x.cy, x.cp, .35 + u * .95);
  });
  if (!b.breached && b.t >= b.arriveAt) {
    b.breached = true; if (b.sim.wallDmg > 0) sfx('boom');
    bat.sprites.filter(x => !x.dead).forEach(x => { x.el.querySelector('.walk').classList.add('slam'); floatNum(x.cy, x.cp + 8, '-' + G.battle.enemies[x.e.type].wall + ' ' + U('wall'), 'bad'); });
    if (b.sim.wallDmg > 0) { const st = $('#stage'); st.classList.remove('shake'); void st.offsetWidth; st.classList.add('shake'); const h = $('#hurt'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on'); }
  }
  if (b.t >= b.T) endWave();
}
function endWave() {
  const b = S.b; b.running = false; bat.sprites.forEach(x => unplace(x.el)); bat.sprites = [];
  const w = G.battle.waves[b.wave], all = Object.values(b.sim.sides).flat(), beaten = all.filter(e => e.killV).length, dmg = b.sim.wallDmg;
  b.wall = Math.max(0, b.wall - dmg);
  const lost = b.wall <= 0, last = b.wave >= G.battle.waves.length - 1;
  const title = lost ? U('resLost') : last ? U('resFinal') : dmg > 0 ? U('resBreach') : U('resHeld');
  const tip = lost ? U('resLostLine') : last ? U('resFinalLine') : dmg > 0 ? G.dialogue[`r5.leak.${Math.min(3, (S.wrongs.r5 = (S.wrongs.r5 || 0) + 1))}`].t : '';
  const body = el('div', 'res');
  body.innerHTML = `<div class="parch">${esc(U('resStats').replace('{0}', beaten).replace('{1}', all.length))}\n${esc(U('resWall'))}: ${b.wall} / ${cfg().wallStrength}\n${tip ? '\n' + esc(tip) : ''}${!lost && !last ? '\n\n' + esc(U('resNext')) : ''}</div>`;
  const row = el('div', 'row'), btn = el('button', 'btn primary big', lost ? U('btnRetry') : last ? U('btnOath') : U('btnNext')); row.appendChild(btn); body.appendChild(row);
  let done = false;
  const proceed = () => {
    if (done) return; done = true;
    if (lost) { retryR5(); return; }
    if (last) { b.read = false; S.done.add('r5_oath'); slotsRender(); battleHud(); roomSolved(); return; }
    b.wave++; b.read = false; b.placed = newBattle().placed; S.done.delete('r5_raven'); slotsRender(); renderSpots(); battleHud();
    say(G.battle.waves[b.wave].intro); openRaven();
  };
  btn.onclick = () => { closePanel(true); proceed(); };
  slotsRender(); openPanel(title, body, { onClose: proceed }); $('#battleHud').hidden = true;
}

/* ---------- Room 7 ---------- */
function initR7() { S.r7base = S.score; S.r7 = { notes: [], idx: 0, active: false }; r7ui(); }
const NOTE_F = { Low: 110, Mid: 165, High: 247 };
let dragon = null;
function startStage1() {
  if (S.stage !== 1 || S.r7.active) return; S.r7.active = true; S.r7.idx = 0; closePanel(true);
  const e = el('div', 'proj dragonring', art('dragon_fly', '<div class="dragonshape"></div>')); $('#fx').appendChild(e); e.style.pointerEvents = 'none';
  dragon = { el: e, t: 0 }; place(e, 0, 50, 1); r7ui(); toast(U('keepRing')); sfx('roar');
}
function tickR7(dt) {
  tickS3(dt);
  if (!dragon) return; dragon.t += dt;
  const yaw = dragon.t * 8, pitch = 48 + 10 * Math.sin(dragon.t * .6); dragon.yaw = yaw; dragon.pitch = pitch; place(dragon.el, yaw, pitch, 1);
  if (viewer && !dlg) { const k = Math.min(1, dt * 1.6), dy = ((yaw - viewer.getYaw() + 540) % 360) - 180; viewer.setYaw(viewer.getYaw() + dy * k, false); viewer.setPitch(viewer.getPitch() + (pitch - 12 - viewer.getPitch()) * k, false); }
}
function dragonInRing() {
  if (!dragon) return false; const p = project(dragon.yaw, dragon.pitch); if (!p) return false;
  return Math.hypot(p.x - p.W / 2, p.y - p.H / 2) < 150;
}
function dragonDir() {
  if (!dragon || !viewer) return ''; let d = ((dragon.yaw - viewer.getYaw() + 540) % 360) - 180;
  return Math.abs(d) < 25 ? (dragon.pitch > viewer.getPitch() + 25 ? U('lookUp') : '') : d < 0 ? U('lookLeft') : U('lookRight');
}
function r7ui() {
  const box = $('#s7hud'); box.innerHTML = ''; box.hidden = true; $('#courtBtn').hidden = true; $('#choiceBtn').hidden = true; document.querySelectorAll('.reticle,#compass').forEach(x => x.remove());
  if (S.ri !== 6) return;
  if (S.stage === 1 && S.r7.active) {
    box.hidden = false; const rt = el('div', 'reticle'); document.body.appendChild(rt);
    box.innerHTML = `<div class="info" id="dirhint">${U('keepRing')}</div><div class="dots">${G.horn.map((_, i) => `<i class="${i < S.r7.idx ? 'on' : ''}"></i>`).join('')}</div><div class="bar">${['Low', 'Mid', 'High'].map(n => `<button class="btn big lockable" data-n="${n}">${U('note' + n)}</button>`).join('')}</div>`;
    box.querySelectorAll('[data-n]').forEach(x => x.onclick = () => hornNote(x.dataset.n));
  }
  if (S.stage === 2) { $('#courtBtn').textContent = U('court'); $('#courtBtn').hidden = false; $('#courtBtn').onclick = () => openTrail(); }
  if (S.stage === 4) { $('#choiceBtn').textContent = U('lastChoice'); $('#choiceBtn').hidden = false; $('#choiceBtn').onclick = openChoice; }
}
setInterval(() => { const d = $('#dirhint'); if (d && dragon) d.textContent = dragonDir() || U('keepRing'); }, 300);
async function hornNote(n) {
  if (locked() || S.menu) return;
  if (!dragonInRing()) { toast(U('keepRing')); return; }
  tone(NOTE_F[n]);
  if (G.horn[S.r7.idx] === n) {
    S.r7.idx++; r7ui();
    if (S.r7.idx >= G.horn.length) {
      S.stage = 2; S.r7.active = false; S.done.add('r7_horn'); award(cfg().stepPoints); document.querySelectorAll('.reticle').forEach(x => x.remove());
      if (dragon) { unplace(dragon.el); dragon = null; }
      r7ui(); renderSpots(); await say('r7.s1.right', { block: true }); await say('r7.s2.start', { block: true }); openTrail();
    }
  } else {
    S.r7.idx = 0; penalize(); lock(); S.wrongs.s1 = (S.wrongs.s1 || 0) + 1; r7ui(); say(`r7.s1.wrong.${Math.min(3, S.wrongs.s1)}`);
  }
}
function mistake() {
  sfx('frost');
  S.frost++; $('#frost').className = S.frost >= 2 ? 'f2' : S.frost === 1 ? 'f1' : ''; frostFilter(Math.min(2, S.frost));
  if (S.frost >= G.frost.maxMistakes) { S.freeze = true; clearS3(); endScreen('frost'); return true; } return false;
}
function openTrail() {
  const T = G.trail, b = el('div'), culprit = Rules.trail(G)[0];
  if (!S.trailTested) S.trailTested = T.tests.map(() => false);
  const draw = () => {
    const t = S.trailTested, left = t.filter(x => !x).length;
    let h = `<div class="hint">${esc(U('trailHint'))}</div><div class="suspects">${T.suspects.map(s => `<div class="sus"><div class="p">${portrait(s.id)}</div><b>${esc(s.name)}</b><small>${esc(s.role)}</small></div>`).join('')}</div>`;
    h += T.tests.map((x, i) => `<div class="trow${t[i] ? ' open' : ''}"><button class="btn tfact" data-t="${i}">${esc(G.ashfall[x.fact])}${t[i] ? '' : `<em>${U('tapTest')}</em>`}</button>` +
      (t[i] ? `<div class="tcells">${T.suspects.map(s => { const ok = x.can.includes(s.id); return `<div class="tc ${ok ? 'yes' : 'no'}"><b>${ok ? '✓' : '✗'}</b><span>${esc(x.why[s.id])}</span></div>`; }).join('')}</div>` : '') + '</div>').join('');
    h += `<div class="hint">${left ? U('trailLeft').replace('{0}', left) : U('trailAll')}</div><div class="accuse">${T.suspects.map(s => `<button class="btn lockable" data-a="${s.id}">${U('accuse')}<br>${esc(s.name)}</button>`).join('')}</div>`;
    b.innerHTML = h;
    b.querySelectorAll('[data-t]').forEach(x => x.onclick = () => { S.trailTested[+x.dataset.t] = true; sfx(G.trail.tests[+x.dataset.t].can.length === 1 ? 'chime' : 'tap'); draw(); });
    b.querySelectorAll('[data-a]').forEach(x => x.onclick = () => accuse(x.dataset.a));
  };
  draw(); openPanel(U('trailTitle'), b);
  async function accuse(id) {
    if (locked() || S.stage !== 2) return;
    if (id === culprit) {
      S.stage = 3; closePanel(true); S.done.add('r7_court'); award(cfg().stepPoints); renderSpots();
      await say([{ s: 'varric', t: G.dialogue['r7.s2.right'].t, p: false, bust: 'bust_varric' }], { block: true });
      r7ui(); startStage3();
    } else {
      penalize(); lock(); shakePanel(); S.wrongs.s2 = (S.wrongs.s2 || 0) + 1;
      if (mistake()) return;
      say(`r7.s2.wrong.${Math.min(3, S.wrongs.s2)}`);
    }
  }
}
/* Step 3: frost spirits fly in; tap them, Vyrmrath burns each one. */
let s3 = null;
function clearS3() { if (s3) s3.spirits.forEach(x => x.el.remove()); s3 = null; document.querySelectorAll('#compass').forEach(x => x.remove()); }
function s3hud() {
  const F = G.frost; $('#s7hud').hidden = false;
  $('#s7hud').innerHTML = `<div class="info">${U('wave')} ${Math.min(s3.wave + 1, F.waves.length)}/${F.waves.length} · ${U('spiritsBroken')}: <b>${s3.broke}</b></div><div class="info tip">${esc(U('s3tip'))}</div>`;
}
function startStage3() {
  s3 = { wave: 0, spawned: 0, broke: 0, spirits: [], spawnT: 0, pause: 1.5 };
  const comp = el('div', ''); comp.id = 'compass'; comp.innerHTML = '<b><i></i></b>'; document.body.appendChild(comp);
  s3hud(); say('r7.s3.start');
}
function spawnSpirit() {
  const vy = viewer ? viewer.getYaw() : 0, yaw = vy + (Math.random() * 2 - 1) * 110;
  const e = el('button', 'spirit', art('wraith', '<div class="blob air" style="background:#c7b5e8">F</div>')); e.setAttribute('aria-label', 'Frost spirit');
  const x = { el: e, yaw, age: 0, cp: 20, dead: false };
  e.onclick = ev => { ev.stopPropagation(); killSpirit(x); };
  $('#spots').appendChild(e); place(e, yaw, 20, .5); s3.spirits.push(x);
}
function killSpirit(x) {
  if (x.dead || S.menu || S.freeze || !s3) return; x.dead = true;
  const vy = viewer.getYaw(), vp = viewer.getPitch(), pe = el('div', 'proj', art('flame', '<div class="shot fl"></div>'));
  $('#fx').appendChild(pe); pe.__s = 1.4; unplace(x.el);
  tweens.push({ el: pe, t: 0, d: .35, a: [vy, vp + 35], b: [x.yaw, x.cp], end: () => burst(x.yaw, x.cp, '#ff9a30', 12) });
  burst(x.yaw, x.cp, '#bfe4f5', 8); s3.broke++; s3hud(); sfx('burn');
}
function tickS3(dt) {
  if (!s3 || S.menu || S.freeze || S.dlg || !viewer) return;
  const F = G.frost;
  if (s3.pause > 0) s3.pause -= dt;
  else if (s3.spawned < F.waves[s3.wave]) { s3.spawnT -= dt; if (s3.spawnT <= 0) { spawnSpirit(); s3.spawned++; s3.spawnT = F.spawnEvery; } }
  let near = null;
  for (const x of s3.spirits) {
    if (x.dead) continue; x.age += dt; const k = x.age / F.life;
    x.cp = 20 - 26 * k; place(x.el, x.yaw, x.cp, .5 + k * 1.1);
    if (!near || x.age > near.age) near = x;
    if (k >= 1) {
      x.dead = true; unplace(x.el); floatNum(x.yaw, x.cp, U('frostHit'), 'bad'); $('#hurt').classList.remove('on'); void $('#hurt').offsetWidth; $('#hurt').classList.add('on');
      if (mistake()) return; say('r7.s3.late');
    }
  }
  const c = $('#compass b'); if (c) { c.style.visibility = near ? '' : 'hidden'; if (near) c.style.transform = `rotate(${near.yaw - viewer.getYaw()}deg)`; }
  s3.spirits = s3.spirits.filter(x => !x.dead || x.el.isConnected);
  if (s3.spawned >= F.waves[s3.wave] && !s3.spirits.some(x => !x.dead)) {
    s3.wave++; s3.spawned = 0;
    if (s3.wave >= F.waves.length) return finishStage3();
    s3.pause = 2.5; s3hud(); toast(`${U('wave')} ${s3.wave + 1}/${F.waves.length}`);
  }
}
function finishStage3() {
  clearS3(); award(cfg().stepPoints); S.stage = 4; S.done.add('r7_frost'); S.freeze = true;
  $('#s7hud').hidden = true; $('#frost').className = ''; frostFilter(0);
  $('#flash').classList.add('on'); r7ui(); renderSpots(); say({ s: 'narrator', t: G.endings.choiceText, p: false, audioFile: G.endings.choiceAudio }, { block: true }).then(openChoice);
}
/* ---------- the last choice + endings (screen effects) ---------- */
const CHOICE_ICON = {
  take: '<svg viewBox="0 0 64 64"><path d="M8 48V22l12 12 12-20 12 20 12-12v26z" fill="currentColor"/><rect x="8" y="50" width="48" height="6" fill="currentColor"/></svg>',
  break: '<svg viewBox="0 0 64 64"><path d="M32 4c4 10-6 14-2 24 4 8 14 6 12 20-2 8-8 12-10 12 6-8-2-12-6-16-6-6-2-14 2-20-8 4-14 12-10 22 2 6 6 10 6 10C12 52 8 40 14 28 20 16 30 14 32 4z" fill="currentColor"/></svg>',
  spare: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M32 6v52M8 19l48 26M8 45l48-26M32 14l-6-6M32 14l6-6M32 50l-6 6M32 50l6 6"/></svg>'
};
function emit(layer, cls, n, o = {}) {
  for (let i = 0; i < n; i++) {
    const p = el('i', cls); p.style.left = Math.random() * 100 + '%'; p.style.setProperty('--dx', (Math.random() * 80 - 40) + 'px');
    p.style.setProperty('--s', (o.min || .5) + Math.random() * (o.max || 1.2)); p.style.animationDuration = (o.dur || 5) * (.6 + Math.random() * .9) + 's'; p.style.animationDelay = (-Math.random() * (o.dur || 5)) + 's'; layer.appendChild(p);
  }
}
function openChoice() {
  const box = $('#choiceScreen'), E = G.endings, cards = box.querySelector('.cs-cards');
  box.querySelector('h2').textContent = E.choiceTitle; box.querySelector('p').textContent = E.choiceText; cards.innerHTML = '';
  box.querySelectorAll('.cs-fx').forEach(x => x.remove()); const fxl = el('div', 'cs-fx'); box.insertBefore(fxl, box.firstChild); emit(fxl, 'snow', 22, { dur: 9 });
  E.choices.forEach((x, k) => {
    const c = el('button', 'cs-card ' + x.id, `<span class="ic">${CHOICE_ICON[x.id]}</span><b>${esc(x.label)}</b><small>${esc(x.sub)}</small><span class="cs-p"></span>`);
    c.style.animationDelay = (.3 + k * .25) + 's'; emit(c.querySelector('.cs-p'), x.id === 'break' ? 'ember' : x.id === 'take' ? 'mote' : 'snow', 9, { dur: 4, min: .4, max: .8 });
    c.onclick = () => { if (box.classList.contains('picked')) return; box.classList.add('picked'); c.classList.add('chosen'); sfx('swell'); box.querySelector('.cs-wipe').className = 'cs-wipe ' + x.id; setTimeout(() => { box.hidden = true; box.classList.remove('picked'); ending(x.id); }, 1100); };
    cards.appendChild(c);
  });
  box.hidden = false; box.className = ''; $('#frost').className = '';
}
$('#choiceScreen .x').onclick = () => { $('#choiceScreen').hidden = true; };
function cineFx(names, tint) {
  const L = $('#cine .fxlayer'); L.innerHTML = ''; $('#cine').dataset.tint = tint;
  const snd = { fire: 'boom', crack: 'boom', rays: 'choir', frostfade: 'wind', raven: 'flap', dissolve: 'shimmer', frostline: 'wind', queen: 'shimmer', banners: 'fanfare', sidebanners: 'fanfare' };
  names.some(n => snd[n] && (sfx(snd[n]), true));
  const has = n => names.includes(n);
  if (has('glow')) L.appendChild(el('div', 'fx-glow'));
  if (has('rays')) L.appendChild(el('div', 'fx-rays'));
  if (has('frostfade')) L.appendChild(el('div', 'fx-frostfade'));
  if (has('motes')) emit(L, 'mote', 26, { dur: 7 });
  if (has('embers')) emit(L, 'ember', 34, { dur: 5 });
  if (has('snow')) emit(L, 'snow', 30, { dur: 8 });
  if (has('fire')) { L.appendChild(el('div', 'fx-fireflash')); L.appendChild(el('div', 'fx-fireglow')); $('#cine').classList.remove('shake'); void $('#cine').offsetWidth; $('#cine').classList.add('shake'); }
  if (has('crack')) { L.appendChild(el('div', 'fx-whiteflash')); L.appendChild(el('div', 'fx-crack', '<svg viewBox="0 0 100 100" preserveAspectRatio="none"><path pathLength="1" d="M50 0 L46 18 L56 30 L44 46 L54 60 L47 78 L52 100"/><path pathLength="1" d="M46 18 L30 26 L22 40 M56 30 L72 36 L80 52 M44 46 L28 58 M54 60 L70 70 L78 86"/></svg>')); $('#cine').classList.remove('shake'); void $('#cine').offsetWidth; $('#cine').classList.add('shake'); }
  const banners = (kind) => {
    const row = el('div', 'fx-banners ' + kind);
    G.oaths.forEach((o, i) => { const d = el('div', 'fxban', art(o.art, `<div class="cssflag">${o.letter}</div>`)); d.style.animationDelay = (i * .25) + 's'; row.appendChild(d); }); L.appendChild(row);
  };
  if (has('banners')) banners('kneel'); if (has('sidebanners')) banners('side');
  if (has('raven')) L.appendChild(el('div', 'fx-raven', '<svg viewBox="0 0 64 40"><path d="M2 22C12 20 18 10 30 4c-2 8 4 12 12 12 6 0 12-4 20-2-6 4-8 8-14 10-4 6-12 12-22 10-6-2-10-6-12-10z" fill="#0a0d12"/></svg><span class="letter"></span>'));
  if (has('queen')) L.appendChild(el('div', 'fx-queen', '<i></i><i></i><i></i>'));
  if (has('dissolve')) { L.appendChild(el('div', 'fx-bust dissolve', art('bust_malachar', '<div class="cssflag">M</div>'))); emit(L, 'shard', 18, { dur: 4 }); }
  if (has('walk')) L.appendChild(el('div', 'fx-bust walk', art('bust_malachar', '<div class="cssflag">M</div>')));
  if (has('frostline')) L.appendChild(el('div', 'fx-frostline'));
}
async function ending(id) {
  S.freeze = true; S.phase = 'ending'; const E = G.endings[id], bonus = Math.floor(S.time) * cfg().timePoints; S.bonus = bonus; S.score += bonus; hud();
  $('#choiceBtn').hidden = true; $('#cine').hidden = false; bgmLevel(BGV * .6);
  const beat = $('#cine .beat'); let i = 0;
  const show = () => { beat.style.animation = 'none'; void beat.offsetWidth; beat.style.animation = ''; beat.textContent = E.beats[i]; $('#cine .tap').textContent = U('tapContinue'); cineFx(E.fx[i], E.tint); narrate(E.beats[i], 'narrator', (E.audioFiles || [])[i]); preloadVoice((E.audioFiles || [])[i + 1]); };
  await new Promise(res => { show(); $('#cine').onclick = e => { if (e.target.closest('.skip')) return res(); if (++i >= E.beats.length) res(); else show(); }; $('#cine .skip').onclick = () => res(); });
  $('#cine').hidden = true; $('#cine .fxlayer').innerHTML = ''; stopVoice(); bgmLevel(BGV); endScreen('win', E);
}

/* ---------- end screens ---------- */
function endScreen(kind, E) {
  sfx(kind === 'win' ? 'fanfare' : 'lose');
  S.freeze = true; const box = $('#end .endbox'), sc = G.screens;
  if (kind === 'win') {
    box.innerHTML = `<h2>${esc(E.title)}</h2><p>${U('renown')}</p><p class="bigscore">${S.score}</p><p>${U('timeLeft')}: ${fmt(S.time)} (+${S.bonus})</p><p>${U('oathsWon')}: ${S.oaths.length}/5</p><button class="btn primary big" id="again">${sc.win.button}</button>`;
    S.phase = 'over';
  } else {
    box.innerHTML = `<h2>${esc(sc[kind].title)}</h2><button class="btn primary big" id="again">${sc[kind].button}</button>`; if (kind === 'timeup') S.phase = 'over';
  }
  $('#end').hidden = false; stopVoice();
  $('#again').onclick = () => {
    $('#end').hidden = true;
    if (kind === 'frost') retryR7(); else if (kind === 'wall') retryR5(); else restartGame();
  };
}
function retryR7() {
  S.freeze = false; S.frost = 0; S.stage = 1; S.score = S.r7base; ['r7_horn', 'r7_court', 'r7_frost'].forEach(x => S.done.delete(x)); S.heard = {}; S.trailTested = null; S.wrongs.s1 = S.wrongs.s2 = 0;
  $('#frost').className = ''; frostFilter(0); clearS3(); S.trailTested = null; if (dragon) { unplace(dragon.el); dragon = null; }
  document.querySelectorAll('#compass,.reticle').forEach(x => x.remove()); S.r7 = { notes: [], idx: 0, active: false }; hud(); r7ui(); renderSpots(); say('r7.s1.start');
}
function retryR5() { S.freeze = false; S.b = newBattle(); S.done.delete('r5_raven'); S.wrongs.r5 = 0; bat.sprites.forEach(x => unplace(x.el)); bat.sprites = []; renderSpots(); slotsRender(); battleHud(); say(G.battle.waves[0].intro); openRaven(); }
function restartGame() {
  stopVoice(); closePanel(true); $('#book').hidden = true; $('#end').hidden = true; $('#cine').hidden = true; $('#frost').className = ''; frostFilter(0);
  $('#choiceScreen').hidden = true; document.querySelectorAll('#compass,.reticle,.slot,.sidelabel').forEach(x => projSet.delete(x) || x.remove());
  if (dragon) { unplace(dragon.el); dragon = null; } clearS3(); bat.sprites.forEach(x => unplace(x.el)); bat.sprites = []; dlg = null; dq.length = 0; $('#speech').hidden = true; $('#catch').hidden = true;
  S = fresh({ music: S.music, fx: S.fx, voice: S.voice, tapped: true }); S.phase = 'play'; $('#hud').hidden = false; hud(); enterRoom(0);
}

/* ---------- start flow ---------- */
function buildStatic() {
  document.querySelectorAll('[data-u]').forEach(e => e.textContent = U(e.dataset.u));
  $('#gameTitle').textContent = cfg().title; $('#tapText').textContent = U('tapStart');
  document.title = cfg().title;
  imgOk(G.art.title).then(ok => { if (ok) $('#start').style.backgroundImage = `url(${G.art.title})`; else $('#start').classList.add('nogate'); });
  imgOk(G.art.briefing).then(ok => { const i = $('#info'); if (ok) i.style.backgroundImage = `url(${G.art.briefing})`; else i.style.backgroundImage = 'radial-gradient(ellipse at 50% 80%,#2b3340,#10151c 75%)'; });
  const m = G.mission; $('#info h1').textContent = m.heading; $('#info .paras').innerHTML = m.paras.map(p => `<p>${esc(p)}</p>`).join(''); $('#infoGo').textContent = m.button;
  pauseLabels();
}
function tapStart() {
  if (S.phase !== 'start') return; S.tapped = true; S.phase = 'info'; $('#start').hidden = true;
  startBgm(); $('#info').hidden = false; S.ri = 0; document.documentElement.style.setProperty('--accent', G.rooms[0].accent);
  const prep = loadPano(G.rooms[0]); // room 1 loads behind the info page
  narrate([G.mission.heading].concat(G.mission.paras).join('. '), 'narrator', G.mission.audioFile); preloadVoice(G.tutorial[0].audioFile);
  $('#infoGo').onclick = async () => { stopVoice(); $('#info').hidden = true; await prep; tutorial(); };
}
$('#start').addEventListener('click', tapStart);
function tutorial() {
  S.phase = 'tutorial'; $('#pano').classList.add('blur'); $('#hud').hidden = false; hud(); $('#objective').textContent = '';
  document.body.classList.add('tut'); $('#tut').hidden = false; let i = 0; const T = G.tutorial;
  const show = () => {
    document.querySelectorAll('.ring').forEach(x => x.classList.remove('ring'));
    const t = T[i]; $('#tut h3').textContent = t.title; $('#tut p').textContent = t.text; $('#tutNext').textContent = i === T.length - 1 ? U('done') : U('next');
    $('#tut .dots').innerHTML = T.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    if (t.target) { const x = $(t.target); x && x.classList.add('ring'); }
    narrate(t.text, 'narrator', t.audioFile); preloadVoice((T[i + 1] || {}).audioFile);
  };
  const end = () => { document.querySelectorAll('.ring').forEach(x => x.classList.remove('ring')); document.body.classList.remove('tut'); $('#tut').hidden = true; stopVoice(); opening(); };
  $('#tutNext').onclick = () => { if (++i >= T.length) end(); else show(); }; $('#tutSkip').onclick = end; show();
}
async function opening() {
  S.phase = 'opening';
  await say(['open.1', 'open.2', 'open.3', 'open.4'], { block: true });
  $('#pano').classList.remove('blur'); $('#pano').style.transitionDuration = cfg().unblurSeconds + 's';
  $('#heroes').hidden = false; $('.hero.l').innerHTML = art('bust_elowen', ''); $('.hero.r').innerHTML = art('bust_brann', '');
  await sleep(cfg().unblurSeconds * 1000); $('#heroes').hidden = true;
  S.phase = 'play'; S.lastTap = Date.now(); S.freeze = false; await enterRoom(0);
}

/* ---------- boot ---------- */
async function boot() {
  G = await (await fetch('game.json')).json();
  S = fresh({ music: true, fx: true, voice: true }); S.tapped = false; validate(); buildStatic(); await preloadCut();
  if ('speechSynthesis' in window) { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => { voices = speechSynthesis.getVoices(); }; }
  requestAnimationFrame(frame); hud();
  
}
boot();
})();
