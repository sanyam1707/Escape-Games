/* The Eternal Timeline. Vanilla JS. All text and numbers come from game.json. */
(() => {
'use strict';
const P = window.Puzzles, FX = window.FX;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const ico = (id) => `<svg><use href="#${id}"/></svg>`;
const cap = (t, e) => { try { t.setPointerCapture(e.pointerId); } catch (_) {} };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k]);
const mmss = (s) => { s = Math.ceil(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const DEBUG = false;

let G, UI, CFG, S, viewer = null;
const HS = {};            // hotspot id -> { div, h }
const T = { pauses: new Set(), started: false, last: 0 };
const D = { job: null, queue: [], i: 0, timer: 0 };
const V = Object.assign({ music: true, sfx: true, voice: true, voices: [], speaking: null }, JSON.parse(localStorage.getItem('et_audio') || '{}'));
const saveAudio = () => { try { localStorage.setItem('et_audio', JSON.stringify({ music: V.music, sfx: V.sfx, voice: V.voice })); } catch (_) {} };
let cardQueue = [], cardOpen = null, panelCleanup = null;

/* =========================================================== state */
function freshState() {
  return { phase: 'start', playing: false, over: false, ending: false, score: 0, hints: CFG.hintsPerGame, time: CFG.timerSeconds,
    room: 0, done: new Set(), items: [], used: new Set(), cards: [], marks: 0, pen: {}, wrongN: {}, lock: {}, exitOpen: false,
    hold: null, panel: null, p: {}, lastTap: performance.now(), bookTab: 'clues', unlocks: new Set(['start']), idleSaid: 0 };
}
const room = () => G.rooms[S.room];
const isPaused = () => document.body.classList.contains('paused');

/* =========================================================== sprites and fallbacks */
const FALLBACK = {
  lantern: '<svg viewBox="0 0 64 64"><path d="M22 14a10 10 0 0 1 20 0" fill="none" stroke="#8a6a2b" stroke-width="3"/><rect x="18" y="14" width="28" height="6" rx="2" fill="#8a6a2b"/><rect x="20" y="20" width="24" height="26" rx="4" fill="#E9B25A" opacity=".85" stroke="#5a4318" stroke-width="2"/><rect x="16" y="46" width="32" height="8" rx="2" fill="#6a4a14"/></svg>',
  crank: '<svg viewBox="0 0 64 64"><path d="M10 50h22V22h22" fill="none" stroke="#7a5a3a" stroke-width="7" stroke-linejoin="round"/><circle cx="54" cy="22" r="5" fill="#a07a50"/></svg>',
  key: '<svg viewBox="0 0 64 64"><circle cx="18" cy="32" r="10" fill="none" stroke="#9a9a90" stroke-width="5"/><path d="M28 32h30M50 32v10M42 32v8" stroke="#9a9a90" stroke-width="5" fill="none"/></svg>',
  lens_red: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#8a6a2b"/><circle cx="32" cy="32" r="20" fill="#c9371f"/></svg>',
  lens_green: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#8a6a2b"/><circle cx="32" cy="32" r="20" fill="#3f7a32"/></svg>',
  sight: '<svg viewBox="0 0 64 64"><rect x="6" y="24" width="52" height="16" rx="4" fill="#b88a3a" transform="rotate(-20 32 32)"/><circle cx="48" cy="20" r="6" fill="#2a1a3a" /></svg>',
  ring: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="none" stroke="#D9962B" stroke-width="8"/></svg>',
  print: '<svg viewBox="0 0 60 80"><rect width="60" height="80" fill="#8d7448"/><circle cx="30" cy="34" r="7" fill="#1a1208"/><path d="M18 74c0-20 4-28 12-28s12 8 12 28Z" fill="#1a1208"/></svg>'
};
function sprite(name) {
  const img = new Image(); img.alt = ''; img.draggable = false; img.src = `assets/cut/${name}.png`;
  img.onerror = () => { const k = name.startsWith('print') ? 'print' : name; if (FALLBACK[k]) { const d = el('div', '', FALLBACK[k]); img.replaceWith(d.firstChild); } else img.remove(); };
  return img;
}

function watchSVG(marks, opt = {}) {
  const cx = 100, cy = 106; let s = '<svg viewBox="0 0 200 208" class="watch" aria-hidden="true">';
  s += '<rect x="88" y="2" width="24" height="16" rx="4" fill="#8a6a2b" stroke="#3b2a0c"/><rect x="94" y="0" width="12" height="6" rx="2" fill="#b88a3a"/>';
  s += `<circle cx="${cx}" cy="${cy}" r="96" fill="#9a7430"/><circle cx="${cx}" cy="${cy}" r="91" fill="#4a3612"/><circle cx="${cx}" cy="${cy}" r="87" fill="#d8cdb4" opacity=".08"/><circle cx="${cx}" cy="${cy}" r="84" fill="#10171a" stroke="#2a2010" stroke-width="2"/>`;
  for (let h = 1; h <= 12; h++) { const a = h * 30 * Math.PI / 180, r1 = h % 3 ? 74 : 70, r2 = 80; s += `<line x1="${cx + r1 * Math.sin(a)}" y1="${cy - r1 * Math.cos(a)}" x2="${cx + r2 * Math.sin(a)}" y2="${cy - r2 * Math.cos(a)}" stroke="#8a7a58" stroke-width="${h % 3 ? 2 : 3.5}"/>`; }
  for (let n = 1; n <= 7; n++) {
    const a = n * 30 * Math.PI / 180, x = cx + 56 * Math.sin(a), y = cy - 56 * Math.cos(a), lit = n <= marks;
    s += lit ? `<circle cx="${x}" cy="${y}" r="13" fill="#F3C77D" opacity=".3"/><circle cx="${x}" cy="${y}" r="7.5" fill="#F3C77D" stroke="#fff3d2" stroke-width="1.5"/>` : `<circle cx="${x}" cy="${y}" r="6.5" fill="none" stroke="#6a5a3a" stroke-width="1.5" stroke-dasharray="2.5 2.5"/>`;
  }
  s += `<g class="hh${opt.spin ? ' fast' : ''}"><line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - 34}" stroke="#c9b88a" stroke-width="4.5" stroke-linecap="round"/></g>`;
  s += `<g class="hm${opt.spin ? ' fast' : ''}"><line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - 56}" stroke="#e8dcb8" stroke-width="3" stroke-linecap="round"/></g>`;
  s += `<circle cx="${cx}" cy="${cy}" r="5" fill="#b88a3a"/></svg>`;
  return s;
}

/* =========================================================== toasts, score */
function toast(msg, cls = '') { const t = el('div', 'toast ' + cls, msg); $('#toasts').append(t); setTimeout(() => t.remove(), 3100); }
function floatAt(x, y, txt, cls) { const f = el('div', 'floatpts ' + cls, txt); f.style.left = x + 'px'; f.style.top = y + 'px'; document.body.append(f); setTimeout(() => f.remove(), 1200); }
function addScore(n) {
  const before = S.score; S.score = Math.max(0, S.score + n); const d = S.score - before;
  $('#score').textContent = S.score; if (d) { const b = $('#score'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); const r = b.getBoundingClientRect(); floatAt(r.left, r.bottom + 4, (d > 0 ? '+' : '−') + Math.abs(d), d > 0 ? 'plus' : 'minus'); }
}
function renderWatch() { $('#watchBtn').innerHTML = watchSVG(S.marks); }

/* =========================================================== timer */
function setPause(reason, on) { on ? T.pauses.add(reason) : T.pauses.delete(reason); $('#clock').classList.toggle('paused', T.pauses.size > 0); }
function tick() {
  const now = performance.now(), dt = (now - T.last) / 1000; T.last = now;
  if (!T.started || T.pauses.size || S.over) return;
  S.time = Math.max(0, S.time - dt); renderClock();
  if (S.time <= 0) timeUp();
}
function renderClock() { $('#time').textContent = mmss(S.time); $('#clock').classList.toggle('low', S.time <= 60 && S.time > 0); }

/* =========================================================== audio: voice and drone */
function loadVoices() { V.voices = ('speechSynthesis' in window) ? speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)) : []; }
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
const FEM = /zira|hazel|susan|aria|jenny|samantha|karen|female|woman|moira|tessa|fiona|libby|sonia|catherine|serena|victoria|google uk english female|natasha|emma|amy|ivy|salli|joanna/i;
const MAL = /david|mark|george|guy|ryan|daniel|alex|male|james|thomas|fred|brian|arthur|oliver|rishi|google uk english male|matthew|joey/i;
function voiceFor(kind) {
  if (!V.voices.length) return null;
  const re = kind === 'female' ? FEM : kind === 'male' ? MAL : null;
  return (re && V.voices.find(v => re.test(v.name) && !(kind === 'male' && /female/i.test(v.name)))) || V.voices.find(v => /en-(gb|us)/i.test(v.lang)) || V.voices[0];
}
let voiceEl = null; const preloaded = {};
function cancelSpeech() {
  if ('speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch (e) {} }
  if (voiceEl) { voiceEl.onended = voiceEl.onerror = null; voiceEl.pause(); voiceEl = null; }
  V.speaking = null;
}
function preloadVoice(entry) { if (entry && entry.audioFile && !preloaded[entry.audioFile]) { const a = new Audio(); a.preload = 'auto'; a.src = entry.audioFile; preloaded[entry.audioFile] = a; } }
function speakFallback(entry) {
  return; // no browser voice: lines without a recording (the hint lines) stay silent
  if (!('speechSynthesis' in window)) return;
  const text = entry.t.replace(/[()]/g, ''), c = G.characters[entry.sp] || G.characters.narrator;
  try { const u = new SpeechSynthesisUtterance(text); const v = voiceFor(c.voice); if (v) u.voice = v; u.rate = c.rate; u.pitch = c.pitch; V.speaking = u; speechSynthesis.speak(u); } catch (e) {}
}
// plays the recorded file when the line has one, else the browser voice. onEnd fires when a recording finishes.
function narrate(entry, onEnd) {
  cancelSpeech();
  if (!V.voice || !entry) return;
  if (!entry.audioFile) return speakFallback(entry);
  const a = preloaded[entry.audioFile] || new Audio(entry.audioFile); a.currentTime = 0; voiceEl = a;
  a.onended = () => { if (voiceEl === a) { voiceEl = null; if (onEnd) onEnd(); } };
  a.onerror = () => { if (voiceEl === a) { voiceEl = null; speakFallback(entry); } };
  a.play().catch(() => { if (voiceEl === a) { voiceEl = null; speakFallback(entry); } });
}
function pauseVoice() { if (voiceEl) voiceEl.pause(); else if ('speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch (e) {} } }
function resumeVoice() { if (voiceEl) voiceEl.play().catch(() => {}); else if (D.job && V.voice) narrate(D.job.lines[D.i]); }
let bgm = null, actx = null;
function startAudio() {
  if (bgm) return;
  bgm = new Audio('assets/audio/bgm.mp3'); bgm.loop = true; bgm.volume = 0.2; bgm.muted = !V.music;   // CC0 track, kept quiet
  bgm.addEventListener('error', () => { bgm = null; });
  bgm.play().catch(() => {});
}
function setMusic(on) { V.music = on; if (bgm) bgm.muted = !on; saveAudio(); }
function setVoice(on) { V.voice = on; if (!on) cancelSpeech(); saveAudio(); }
function setSfx(on) { V.sfx = on; saveAudio(); }
/* sound effects: a few tiny synthesized sounds, only where they help */
function tone(f, dur, o = {}) {
  if (!V.sfx) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume();
    const t0 = actx.currentTime + (o.at || 0), osc = actx.createOscillator(), g = actx.createGain();
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t0); if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(o.vol || 0.12, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(actx.destination); osc.start(t0); osc.stop(t0 + dur + 0.05);
  } catch (_) {}
}
function sfx(name) {
  ({
    pick: () => { tone(660, .18); tone(990, .28, { at: .08 }); },
    ok: () => { tone(523, .25); tone(659, .25, { at: .12 }); tone(784, .45, { at: .24 }); },
    bad: () => tone(150, .35, { type: 'triangle', to: 90, vol: .18 }),
    mark: () => { tone(880, 1.2, { vol: .1 }); tone(1320, 1.0, { vol: .05, at: .02 }); },
    ring: () => tone(300, .12, { type: 'triangle', vol: .12 }),
    door: () => tone(110, .5, { type: 'triangle', to: 55, vol: .18 }),
    timeup: () => tone(300, 1.6, { type: 'sawtooth', to: 60, vol: .08 })
  }[name] || (() => {}))();
}

/* =========================================================== dialogue */
function setBust(sp, mood) {
  const b = $('#dlg .bust'); b.innerHTML = ''; const c = G.characters[sp];
  if (sp === 'narrator' || !c) { b.classList.add('none'); return; }
  b.classList.remove('none');
  const m = c.moods.includes(mood) ? mood : c.moods[0];
  const img = new Image(); img.alt = c.name; img.src = `assets/cut/${sp}_${m}.png`;
  img.onerror = () => { b.innerHTML = ''; const i = el('div', 'ini', c.name[0]); i.style.background = c.color; b.append(i); };
  b.append(img);
}
function say(lines, opts = {}) {
  lines = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
  if (S.over) return;
  if (!lines.length) { if (opts.onDone) opts.onDone(); return; }
  const modal = !!opts.modal || lines.some(l => l.pt);
  const job = { lines, opts, modal };
  if (D.job) {
    if (!modal && D.job.modal) { if (!opts.drop) D.queue.push(job); return; }
    if (modal && D.job.modal) { D.queue.push(job); return; }
    endJob();               // a new line replaces a lingering ambient one
  }
  startJob(job);
}
function startJob(job) {
  D.job = job; D.i = 0; showLine();
  $('#dlg').classList.add('on'); $('#dlgcatch').classList.toggle('on', job.modal); document.body.classList.add('dlg-open'); document.body.classList.toggle('talk', job.modal);
}
function showLine() {
  const job = D.job, ln = job.lines[D.i], c = G.characters[ln.sp] || G.characters.narrator;
  clearTimeout(D.timer);
  const d = $('#dlg'); d.classList.toggle('narrator', ln.sp === 'narrator');
  $('.who', d).textContent = c.name; const l = $('.line', d); l.textContent = ln.t; l.classList.toggle('narr', ln.sp === 'narrator');
  setBust(ln.sp, ln.mood);
  $('.more', d).textContent = D.i < job.lines.length - 1 ? UI.tap : '';
  setPause('dlg', !!ln.pt);
  const last = D.i === job.lines.length - 1, auto = !job.modal && last && !job.opts.onDone, hasAudio = !!(ln.audioFile && V.voice);
  const hide = (ms) => { clearTimeout(D.timer); D.timer = setTimeout(() => { if (D.job === job) endJob(); }, ms); };
  narrate(ln, () => { if (auto) hide(1800); });                       // recorded line: hide shortly after it ends
  if (auto) hide(hasAudio ? 25000 : clamp(ln.t.length * 70, 4000, 8000)); // safety timeout / text-length fallback
  preloadVoice(job.lines[D.i + 1]);
}
function advance() {
  if (!D.job) return; cancelSpeech();
  if (D.i < D.job.lines.length - 1) { D.i++; showLine(); } else endJob();
}
function endJob() {
  const job = D.job; if (!job) return;
  clearTimeout(D.timer); cancelSpeech(); D.job = null;
  $('#dlg').classList.remove('on'); $('#dlgcatch').classList.remove('on'); document.body.classList.remove('dlg-open', 'talk');
  setPause('dlg', false);
  if (job.opts.onDone) job.opts.onDone();
  if (!D.job && D.queue.length) startJob(D.queue.shift());
  document.dispatchEvent(new CustomEvent('dialogue-finished'));
}
function dropDialogue() { clearTimeout(D.timer); D.queue = []; const j = D.job; D.job = null; $('#dlg').classList.remove('on'); $('#dlgcatch').classList.remove('on'); document.body.classList.remove('dlg-open', 'talk'); setPause('dlg', false); cancelSpeech(); return j; }

/* =========================================================== cards */
function addCard(id) { if (!S.cards.includes(id)) { S.cards.push(id); S.unlocks.add(id); } refreshBook(); }
function showCard(o) {
  if (cardOpen) { cardQueue.push(o); return; }
  const wrap = $('#cards'); wrap.innerHTML = '';
  const c = el('div', 'card' + (o.cls ? ' ' + o.cls : ''));
  c.append(el('div', 'kind', o.kind));
  c.append(el('h3', '', o.title));
  if (o.art) { const a = el('div', 'art'); a.append(sprite(o.art)); c.append(a); }
  if (o.text) c.append(el('div', 'ctext' + (o.mono ? ' mono' : ''), o.text));
  if (o.foot) c.append(el('div', 'saved', o.foot));
  const x = el('button', 'xbtn cx', ico('i-close')); x.setAttribute('aria-label', UI.close); c.append(x);
  const f = el('div', 'cfoot'); const ok = el('button', 'btn primary', o.button || 'OK'); f.append(ok); c.append(f);
  wrap.append(c); wrap.classList.add('on');
  cardOpen = o; setPause('card', !!o.pauses);
  const close = () => { if (cardOpen !== o) return; cardOpen = null; wrap.classList.remove('on'); wrap.innerHTML = ''; cancelSpeech(); setPause('card', false); if (o.onClose) o.onClose(); const n = cardQueue.shift(); if (n) showCard(n); };
  x.onclick = close; ok.onclick = close; wrap.onclick = (e) => { if (e.target === wrap && !o.noOutside) close(); };
  o._close = close;
}
function closeCard() { if (cardOpen && cardOpen._close) cardOpen._close(); }
function clueCard(id, onClose) { const c = G.cards[id]; addCard(id); showCard({ kind: 'Clue', title: c.title, text: c.text, mono: id === 'r6_lid', foot: UI.learnSaved, onClose }); }

/* =========================================================== hotspots */
function available(h) { return (h.after || []).every(a => S.done.has(a)); }
function refreshHotspots() {
  const r = room();
  r.hotspots.forEach(h => { const e = HS[h.id]; if (!e) return; const on = !S.done.has(h.id) && available(h); e.div.classList.toggle('off', !on); e.div.setAttribute('aria-hidden', !on); });
  const ex = HS.__exit; if (ex) ex.div.classList.toggle('off', !S.exitOpen);
}
function buildHotspotEl(div, h) {
  div.setAttribute('role', 'button'); div.setAttribute('aria-label', h.label || h.id);
  const inner = el('div', 'hsi');
  if (h.kind === 'FIND') inner.append(sprite(h.item));
  else if (h.kind === 'PANEL') inner.innerHTML = ico('i-eye');
  else if (h.kind === 'USE') inner.innerHTML = ico('i-socket');
  else if (h.kind === 'AUTO') inner.innerHTML = ico('i-door');
  div.append(inner);
  let down = null;
  div.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  div.addEventListener('pointerup', (e) => {
    if (!down) return; const d = Math.hypot(e.clientX - down.x, e.clientY - down.y), t = performance.now() - down.t; down = null;
    if (d < 12 && t < 900) onHotspot(h, div);
  });
}
function buildRoomViewer(idx, done) {
  const r = G.rooms[idx];
  if (viewer) { try { viewer.destroy(); } catch (e) {} viewer = null; }
  $('#pano').innerHTML = ''; for (const k in HS) delete HS[k];
  const list = r.hotspots.map(h => ({ ...h }));
  if (r.exit) list.push({ id: '__exit', kind: 'AUTO', label: r.exit.label, yaw: r.exit.yaw, pitch: r.exit.pitch, exit: true });
  const hotSpots = list.map(h => ({ id: h.id, pitch: h.pitch, yaw: h.yaw, type: 'custom', cssClass: `hs ${h.kind} off`, createTooltipFunc: (div) => { HS[h.id] = { div, h }; buildHotspotEl(div, h); } }));
  const a = innerWidth / innerHeight, hf = clamp(2 * Math.atan(Math.tan(35 * Math.PI / 180) * a) * 180 / Math.PI, 64, 100);
  viewer = pannellum.viewer('pano', { type: 'equirectangular', panorama: r.pano, autoLoad: true, yaw: r.yaw, pitch: r.pitch, hfov: hf, minHfov: 38, maxHfov: Math.min(112, hf + 22), showControls: false, showFullscreenCtrl: false, showZoomCtrl: false, mouseZoom: true, keyboardZoom: false, compass: false, hotSpots, friction: 0.12 });
  viewer.on('load', () => { refreshHotspots(); if (done) done(); });
  viewer.on('error', () => { if (done) done(); });
  if (DEBUG) $('#pano').addEventListener('click', (e) => { if (!viewer) return; const [p, y] = viewer.mouseEventToCoords(e); const t = `yaw ${y.toFixed(1)}  pitch ${p.toFixed(1)}`; console.log(t); let d = $('#dbgcoord'); if (!d) { d = el('div'); d.id = 'dbgcoord'; document.body.append(d); } d.textContent = t; });
}
function onHotspot(h, div) {
  if (!S.playing || S.over || S.ending || isPaused() || (D.job && D.job.modal) || cardOpen || S.panel) return;
  S.lastTap = performance.now();
  if (h.exit) return nextRoom();
  if (h.kind === 'FIND') return pickup(h, div);
  if (h.kind === 'LEARN') return learn(h);
  if (h.kind === 'PANEL') return openPuzzle(h);
  if (h.kind === 'USE') return useTarget(h);
}
function pickup(h, div) {
  const it = G.items[h.item]; S.done.add(h.id); S.items.push(h.item);
  const from = div.getBoundingClientRect(), to = $('#bookBtn').getBoundingClientRect();
  const fly = sprite(h.item); fly.classList.add('flysprite'); fly.style.left = from.left + 'px'; fly.style.top = from.top + 'px'; document.body.append(fly);
  requestAnimationFrame(() => requestAnimationFrame(() => { fly.style.left = to.left + 'px'; fly.style.top = to.top + 'px'; fly.style.transform = 'scale(.4)'; fly.style.opacity = .4; }));
  setTimeout(() => fly.remove(), 800);
  refreshAll(); addScore(CFG.itemPoints); sfx('pick');
  setTimeout(() => showCard({ kind: 'Item', title: it.name, text: it.desc, art: h.item, foot: `${UI.itemAdded}  +${CFG.itemPoints}`, onClose: () => say(h.say) }), 600);
}
function learn(h) {
  const c = G.cards[h.card]; addCard(h.card);
  showCard({ kind: 'Clue', title: c.title, text: c.text, mono: h.card === 'r6_lid', foot: UI.learnSaved, onClose: () => completeHotspot(h, true) });
}
function useTarget(h) {
  if (S.hold === h.needs) { sfx('pick'); S.used.add(h.needs); setHold(null); return completeHotspot(h); }
  if (S.hold) { toast(UI.wrongTarget); return; }
  toast(UI.pickItem); openBook('items');
}
function completeHotspot(h, cardShown) {
  S.done.add(h.id); refreshAll();
  const pz = h.panel ? G.puzzles[h.panel] : null, r = room(), isFinal = r.final === h.id;
  const cardId = h.card || (pz && pz.card), discuss = h.discuss || (pz && pz.discuss) || [], sayL = h.say || [];
  const steps = [];
  if (cardId && !cardShown) steps.push(next => clueCard(cardId, next));
  if (sayL.length && h.kind !== 'FIND') steps.push((next, last) => say(sayL, { modal: !last, onDone: next }));
  if (discuss.length) steps.push(next => say(discuss, { modal: true, onDone: next }));
  if (isFinal) steps.push(next => say(r.right, { modal: true, onDone: next }), next => { awardMark(); next(); });
  const run = (i) => { if (i >= steps.length) return; steps[i](() => run(i + 1), i === steps.length - 1); };
  run(0);
}
function awardMark() {
  S.marks++; addScore(CFG.roomRewardPoints); renderWatch(); sfx('mark');
  const w = $('#watchBtn'); w.classList.remove('pulse'); void w.offsetWidth; w.classList.add('pulse');
  toast(fmt(UI.markLit, { n: S.marks }), 'gold');
  setTimeout(() => { S.exitOpen = true; refreshHotspots(); toast(UI.exitOpen); }, 900);
}
function refreshAll() { refreshHotspots(); renderFind(); refreshBook(); renderHint(); }

/* =========================================================== HUD */
function renderObjective() { const r = room(); $('#objTag').textContent = `${UI.room.toUpperCase()} ${S.room + 1}`; $('#objText').textContent = r.objective; $('#objective').style.borderLeftColor = r.accent; $('#objTag').style.color = r.accent; document.documentElement.style.setProperty('--accent', r.accent); }
function renderFind() {
  const box = $('#findstrip'), r = room(); box.innerHTML = '';
  const finds = r.hotspots.filter(h => h.kind === 'FIND'); if (!finds.length) return;
  box.append(el('span', 'cap', UI.findStrip));
  finds.forEach(h => { const got = S.done.has(h.id); const s = el('div', 'slot' + (got ? ' got' : ''), got ? '' : '?'); s.title = got ? G.items[h.item].name : '?'; if (got) s.append(sprite(h.item)); box.append(s); });
}
function renderHint() { $('#hintCount').textContent = S.hints; $('#hintBtn').style.opacity = S.hints <= 0 ? .45 : 1; }
function setHold(id) {
  S.hold = id; const hd = $('#holding'); hd.hidden = !id; hd.innerHTML = '';
  if (!id) return;
  hd.append(sprite(id)); hd.append(el('span', '', `${UI.holding}: <b>${G.items[id].name}</b>`));
  const b = el('button', 'btn sm ghost', UI.putAway); b.onclick = () => setHold(null); hd.append(b);
}
function useHint() {
  if (S.over || S.ending || !S.playing) return;
  if (S.hints <= 0) { toast(UI.noHints); return; }
  if (S.score < CFG.hintCost) { toast(UI.notEnough); return; }   // a hint costs Threads: refuse when you cannot pay
  let line = null;
  if (S.panel) line = panelHint(S.panel.id);
  else if (S.exitOpen) line = UI.hintExitVoice;
  else if (room().id === 'r7') line = { sp: 'tess', mood: 'calm', t: G.puzzles.knot.hint1.t };
  else {
    const r = room(); const avail = r.hotspots.filter(h => !S.done.has(h.id) && available(h));
    const next = avail.find(h => !h.optional) || avail[0];
    line = next ? (next.hintVoice || { sp: 'tess', mood: 'calm', t: next.hintText }) : null;
  }
  if (!line) { toast(UI.noHints); return; }
  S.hints--; addScore(-CFG.hintCost); renderHint(); say(line);
}
function panelHint(id) {
  if (id === 'knot1') return G.puzzles.knot.hint1;
  if (id === 'knot2') return G.puzzles.knot.question.hint;
  if (id === 'knot3') return null;
  const h = room().hotspots.find(x => x.id === id), pz = h && G.puzzles[h.panel];
  return pz && pz.hint;
}

/* =========================================================== panels */
function openPanel(o) {
  closePanel(); cancelSpeech();
  const layer = $('#panels'); layer.innerHTML = '';
  if (!o.sheet) { const back = el('div'); back.style.cssText = 'position:absolute;inset:0;'; back.onclick = () => closePanel(); layer.append(back); }
  const p = el('div', 'panel surface' + (o.sheet ? ' sheet nodock' : '')); const head = el('div', 'phead', `<h2>${o.title}</h2>`);
  const x = el('button', 'xbtn', ico('i-close')); x.setAttribute('aria-label', UI.close); x.onclick = () => closePanel(); head.append(x);
  const body = el('div', 'pbody'); p.append(head, body); layer.append(p);
  S.panel = { id: o.id, close: o.onClose }; S.lastTap = performance.now();
  o.build(body, () => closePanel());
  renderKbtn(); syncOverlay();
}
function closePanel() {
  if (!S.panel) return; const cb = S.panel.close; S.panel = null; $('#panels').innerHTML = ''; syncOverlay(); if (cb) cb(); renderKbtn();
}
function openPuzzle(h) {
  const pz = G.puzzles[h.panel];
  if (pz.type === 'sight') return openSight(h, pz);
  const builders = { torch: buildTorch, dial: buildDial, gears: buildGears, grid: buildGrid, lens: buildLens, cipher: buildCipher };
  const type = h.panel === 'torch' ? 'torch' : pz.type;
  openPanel({ id: h.id, title: pz.title, build: (body, close) => builders[type](body, h, pz, close) });
}

/* wrong answers */
function wrongAnswer({ cap, key, bank, btns }) {
  const lose = Math.min(CFG.wrongPenalty, Math.max(0, CFG.wrongCapPerPuzzle - (S.pen[cap] || 0)));
  if (lose > 0) { S.pen[cap] = (S.pen[cap] || 0) + lose; addScore(-lose); }
  S.wrongN[key] = (S.wrongN[key] || 0) + 1; sfx('bad');
  say(bank[Math.min(S.wrongN[key] - 1, bank.length - 1)]);
  lockBtns(btns, key, true);
}
function lockBtns(btns, key, start) {
  if (start) S.lock[key] = performance.now() + CFG.wrongLockoutSeconds * 1000;
  const labels = btns.map(b => b.dataset.l || (b.dataset.l = b.textContent));
  const upd = () => {
    const left = Math.ceil((S.lock[key] - performance.now()) / 1000);
    btns.forEach((b, i) => { if (!b.isConnected) return; if (left > 0) { b.disabled = true; b.classList.add('off'); b.textContent = `${labels[i]} (${left})`; } else { b.disabled = false; b.classList.remove('off'); b.textContent = labels[i]; } });
    if (left > 0 && btns.some(b => b.isConnected)) setTimeout(upd, 250);
  };
  if (S.lock[key] && S.lock[key] > performance.now()) upd();
}
function solvedPanel(h, delay = 700) { sfx('ok'); setTimeout(() => { if (S.panel && S.panel.id === h.id) closePanel(); completeHotspot(h); }, delay); }

/* ---- Torch Sweep ---- */
function buildTorch(body, h, pz) {
  const st = (S.p.torch ||= { rev: {}, read: {} });
  body.append(el('div', 'tip', pz.tip));
  const wall = el('div', 'wall'), cv = el('canvas'), dark = el('div', 'dark'), ring = el('div', 'beamring');
  wall.append(cv); const carves = pz.carvings.map(c => { const b = el('button', 'carve' + (c.tablet ? ' tablet' : ''), c.text); b.style.left = c.x + '%'; b.style.top = c.y + '%'; b.dataset.id = c.id; wall.append(b); return { c, b }; });
  wall.append(dark, ring); const prog = el('div', 'progress'); const msg = el('div', 'msg'); body.append(wall, prog, msg);
  let bx = 0, by = 0, R = 60;
  const paint = () => {
    const w = wall.clientWidth, hh = wall.clientHeight; if (!w) return; cv.width = w; cv.height = hh; const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, w, hh); g.addColorStop(0, '#202729'); g.addColorStop(1, '#14191b'); c.fillStyle = g; c.fillRect(0, 0, w, hh);
    for (let i = 0; i < 2600; i++) { const x = Math.random() * w, y = Math.random() * hh, a = Math.random() * .12; c.fillStyle = Math.random() < .5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 2})`; c.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 2); }
    c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 1; for (let i = 0; i < 26; i++) { let x = Math.random() * w, y = Math.random() * hh; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (Math.random() - .5) * 40; y += Math.random() * 28; c.lineTo(x, y); } c.stroke(); }
    R = Math.max(60, w / 6); ring.style.width = ring.style.height = R * 2 + 'px'; if (!bx) setBeam(w / 2, hh / 2); else setBeam(bx, by);
  };
  const upd = () => { const n = Object.keys(st.read).length; prog.textContent = fmt(pz.readCount, { n, total: pz.carvings.length }); };
  function setBeam(x, y) {
    bx = x; by = y; ring.style.left = x + 'px'; ring.style.top = y + 'px';
    dark.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(0,0,0,0) ${R * .3}px, rgba(0,0,0,.4) ${R * .7}px, rgba(3,5,6,.97) ${R}px)`;
    const W = wall.clientWidth, H = wall.clientHeight;
    carves.forEach(({ c, b }) => {
      const d = Math.hypot(c.x / 100 * W - x, c.y / 100 * H - y);
      if (d < R * .8) st.rev[c.id] = true;
      b.classList.toggle('rev', !!st.rev[c.id]); b.classList.toggle('under', !st.rev[c.id] && d < R); b.classList.toggle('lit', !!st.rev[c.id] && d < R); b.classList.toggle('read', !!st.read[c.id]);
    });
  }
  const move = (e) => { const r = wall.getBoundingClientRect(); setBeam(clamp(e.clientX - r.left, 0, r.width), clamp(e.clientY - r.top - (e.pointerType === 'touch' ? 40 : 0), 0, r.height)); };
  wall.addEventListener('pointerdown', move); wall.addEventListener('pointermove', move);
  carves.forEach(({ c, b }) => b.addEventListener('click', () => {
    if (!st.rev[c.id]) return; st.read[c.id] = true; b.classList.add('read'); msg.textContent = c.text; msg.className = 'msg ok'; upd();
    if (Object.keys(st.read).length === pz.carvings.length) { msg.textContent = G.cards[pz.card].text; solvedPanel(h, 900); }
  }));
  new ResizeObserver(paint).observe(wall); requestAnimationFrame(paint); upd();
}

/* ---- Dial (door, safe, bell box) ---- */
function buildDial(body, h, pz) {
  const st = (S.p[h.id] ||= { vals: Array(pz.digits).fill(0) });
  const syms = pz.symbols.includes(' ') ? pz.symbols.split(' ') : [...pz.symbols];
  const ans = pz.numeral ? pz.answer.map(n => syms[n - 1]) : pz.answer.map(String);
  const wrap = el('div', 'dial-wrap'); wrap.append(el('div', 'dial-label', pz.label));
  const dial = el('div', 'dial'); const syEls = [];
  st.vals.forEach((v, i) => {
    const w = el('div', 'wheel'); const up = el('button', '', ico('i-up')), dn = el('button', '', ico('i-down')); up.setAttribute('aria-label', 'Up'); dn.setAttribute('aria-label', 'Down');
    const sy = el('div', 'sym' + (pz.numeral ? ' num' : ''), syms[v]); syEls.push(sy);
    const set = (d) => { st.vals[i] = (st.vals[i] + d + syms.length) % syms.length; sy.textContent = syms[st.vals[i]]; };
    up.onclick = () => set(1); dn.onclick = () => set(-1); sy.onclick = () => set(1);
    w.append(up, sy, dn); dial.append(w);
  });
  const go = el('button', 'btn primary', pz.enter); const row = el('div', 'row'); row.append(go);
  wrap.append(dial, row); body.append(wrap);
  go.onclick = () => {
    const guess = st.vals.map(v => syms[v]);
    if (guess.join('|') === ans.join('|')) { go.disabled = true; solvedPanel(h, 500); } else wrongAnswer({ cap: pz.cap, key: h.id, bank: pz.wrong, btns: [go] });
  };
  lockBtns([go], h.id, false);
}

/* ---- Gear Train ---- */
function gearPath(n, r) {
  const ro = r + .62, ri = r - .62, s = Math.PI * 2 / n; const pt = (rad, a) => `${(rad * Math.sin(a)).toFixed(2)} ${(-rad * Math.cos(a)).toFixed(2)}`;
  let d = `M${pt(ri, -.5 * s)}`;
  for (let i = 0; i < n; i++) { const a = i * s; d += ` L${pt(ro, a - .24 * s)} L${pt(ro, a + .24 * s)} L${pt(ri, a + .5 * s)}`; }
  return d + 'Z';
}
function gearSVG(cfg, mid, spinDir, bad) {
  const gear = (cx, n, cls, dir) => {
    const r = n / 2;
    return `<g class="gear ${cls}${bad ? ' bad' : ''}" transform="translate(${cx} 0)"><g class="rot${spinDir ? ' spin' : ''}" style="--dir:${dir > 0 ? '360deg' : '-360deg'}"><path d="${gearPath(n, r)}"/><circle class="hub" r="${Math.max(1, r * .28)}"/></g><text>${n}</text></g>`;
  };
  let s = `<svg viewBox="-9 -15 80 31" role="img">`;
  s += `<rect class="slot-out" x="${cfg.motor / 2}" y="-12" width="${cfg.gap - cfg.motor / 2 - cfg.drum / 2}" height="24" rx="2"/>`;
  s += gear(0, cfg.motor, 'motor', 1) + gear(cfg.gap, cfg.drum, 'drum', mid.length % 2 === 0 ? -1 : 1);
  let x = cfg.motor / 2;
  mid.forEach((n, i) => { s += gear(x + n / 2, n, 'mid', i % 2 === 0 ? -1 : 1); x += n; });
  s += `<text class="lbl" x="0" y="13">${cfg.labels.motor} ↻</text><text class="lbl" x="${cfg.gap}" y="15">${cfg.labels.drum}</text>`;
  if (!mid.length) s += `<text class="lbl" x="${cfg.gap / 2}" y="1">${cfg.labels.yourTrain}</text>`;
  return s + '</svg>';
}
function buildGears(body, h, pz) {
  const st = (S.p.gears ||= { mid: [] }); const L = pz.labels;
  body.append(el('div', 'tip', pz.tip));
  const box = el('div', 'gears'), sum = el('div', 'sumline'), tray = el('div', 'tray'), msg = el('div', 'msg'); const row = el('div', 'row');
  const test = el('button', 'btn primary', L.test), clr = el('button', 'btn ghost', L.clear); row.append(clr, test);
  body.append(box, sum, tray, msg, row);
  const render = (spin, bad) => {
    box.innerHTML = gearSVG(pz, st.mid, spin, bad); const t = st.mid.reduce((a, b) => a + b, 0);
    sum.className = 'sumline'; sum.textContent = `${pz.motor / 2} + ${st.mid.length ? st.mid.join(' + ') : '…'} + ${pz.drum / 2} = ${pz.motor / 2 + t + pz.drum / 2} / ${pz.gap}`;
    $$('.gchip', tray).forEach(c => c.classList.toggle('on', st.mid.includes(+c.dataset.n)));
  };
  pz.loose.forEach(n => {
    const c = el('button', 'gchip', `<svg viewBox="-8 -8 16 16"><path d="${gearPath(Math.max(8, n), 5.5)}" fill="currentColor"/><circle r="1.6" fill="#10171a"/></svg><b>${n}</b>`); c.dataset.n = n;
    c.onclick = () => { if (st.locked) return; const i = st.mid.indexOf(n); if (i >= 0) st.mid.splice(i, 1); else if (st.mid.length < 4) st.mid.push(n); msg.textContent = ''; render(); };
    tray.append(c);
  });
  clr.onclick = () => { if (st.locked) return; st.mid = []; msg.textContent = ''; render(); };
  test.onclick = () => {
    const res = P.gearTest(pz, st.mid); msg.textContent = L[res]; msg.className = 'msg ' + (res === 'works' ? 'ok' : 'bad');
    if (res === 'noGear') return;
    if (res === 'works') { st.locked = true; test.disabled = true; render(true); sum.classList.add('ok'); solvedPanel(h, 2200); return; }
    sum.classList.add('bad'); render(false, true); wrongAnswer({ cap: pz.cap, key: h.id, bank: pz.wrong, btns: [test] });
  };
  render(); lockBtns([test], h.id, false);
}

/* ---- Alibi Grid ---- */
function buildGrid(body, h, pz) {
  const st = (S.p.grid ||= { year: 0, cells: pz.years.map(() => ({})), solved: pz.years.map(() => false), final: false });
  const L = pz.labels; const view = el('div'); view.style.cssText = 'display:flex;flex-direction:column;gap:12px'; body.append(view);
  const render = () => { view.innerHTML = ''; st.solved.every(Boolean) ? renderFinal() : renderYear(); };
  function renderYear() {
    const tabs = el('div', 'ytabs'); pz.years.forEach((y, i) => { const t = el('button', 'ytab' + (i === st.year ? ' on' : '') + (st.solved[i] ? ' ok' : ''), y.year); t.onclick = () => { st.year = i; render(); }; tabs.append(t); }); view.append(tabs);
    const y = pz.years[st.year], ul = el('ul', 'clues'); y.clues.forEach(c => ul.append(el('li', '', c.t))); view.append(ul);
    const tb = el('table', 'grid'); tb.innerHTML = '<tr><th></th>' + pz.places.map(p => `<th>${p}</th>`).join('') + '</tr>';
    pz.people.forEach(p => { const tr = el('tr'); tr.append(el('th', 'rowh', p));
      pz.places.forEach(pl => { const k = p + '|' + pl, td = el('td'), c = el('button', 'cell'); const draw = () => { const v = st.cells[st.year][k] || 0; c.className = 'cell t' + v; c.textContent = v === 1 ? '✓' : v === 2 ? '✕' : ''; }; draw();
        c.onclick = () => { if (st.solved[st.year]) return; st.cells[st.year][k] = ((st.cells[st.year][k] || 0) + 1) % 3; draw(); }; c.setAttribute('aria-label', `${p} ${pl}`); td.append(c); tr.append(td); });
      tb.append(tr); });
    view.append(tb);
    const msg = el('div', 'msg', pz.tip), chk = el('button', 'btn primary', st.solved[st.year] ? L.solved : L.check); chk.disabled = st.solved[st.year]; const row = el('div', 'row'); row.append(chk); view.append(msg, row);
    chk.onclick = () => {
      const ticks = {}; let bad = false, n = 0;
      pz.people.forEach(p => { const set = pz.places.filter(pl => st.cells[st.year][p + '|' + pl] === 1); n += set.length; if (set.length === 1) ticks[p] = set[0]; else bad = true; });
      if (!n) { msg.textContent = pz.tip; msg.className = 'msg'; return; }
      if (!bad && P.gridOk(y, ticks)) { st.solved[st.year] = true; toast(`${y.year}: ${L.solved}`, 'gold'); if (st.solved.every(Boolean)) { setTimeout(render, 500); } else { st.year = st.solved.indexOf(false); render(); } }
      else { msg.textContent = L.bad; msg.className = 'msg bad'; wrongAnswer({ cap: pz.cap, key: h.id + ':grid', bank: pz.wrongGrid, btns: [chk] }); }
    };
    lockBtns([chk], h.id + ':grid', false);
  }
  function renderFinal() {
    view.append(el('div', 'tip', L.allSet));
    const sm = el('div', 'summ'); pz.years.forEach(y => sm.append(el('div', '', `<b>${y.year}</b>` + pz.people.map(p => `${p}: ${y.solution[p]}`).join('<br>')))); view.append(sm);
    view.append(el('div', 'dial-label', L.final));
    const names = el('div', 'names'), btns = []; pz.people.forEach(p => { const b = el('button', 'btn', p); btns.push(b); names.append(b);
      b.onclick = () => { if (p === pz.answer) { btns.forEach(x => (x.disabled = true)); solvedPanel(h, 500); } else wrongAnswer({ cap: pz.cap, key: h.id + ':final', bank: pz.wrongFinal, btns }); }; });
    view.append(names); lockBtns(btns, h.id + ':final', false);
  }
  render();
}

/* ---- Tinted Lens ---- */
function buildLens(body, h, pz) {
  const st = (S.p.lens ||= { found: {}, sel: null }); const L = pz.labels;
  body.append(el('div', 'tip', pz.tip));
  const grid = el('div', 'prints'), pics = {};
  pz.prints.forEach(p => {
    const w = el('div', 'print'), pic = el('div', 'pic'); pic.append(sprite('print_' + p.id.toLowerCase())); pic.append(el('div', 'stamp', p.year));
    pic.append(el('div', 'mark r', `${p.digit}<small>${L.digit}</small>`), el('div', 'mark g', `${p.place}<small>${L.place}</small>`));
    const bd = el('div', 'badges'), r = el('div', 'badge r'), g = el('div', 'badge g'); bd.append(r, g); w.append(pic, bd); grid.append(w); pics[p.id] = { w, pic, r, g, p };
  });
  const lenses = el('div', 'lenses'), lensEls = {};
  [['red', 'lens_red', L.red], ['green', 'lens_green', L.green]].forEach(([k, spr, name]) => { const b = el('button', 'lens'); b.append(sprite(spr)); b.append(el('span', '', name)); b.dataset.k = k; lensEls[k] = b; lenses.append(b); });
  const msg = el('div', 'msg', L.lensHome); body.append(grid, el('div'), lenses, el('div', '', '&nbsp;'), msg);
  const paint = () => { pz.prints.forEach(p => { const e = pics[p.id], f = st.found[p.id] || {}; e.r.className = 'badge r' + (f.red ? ' got' : ''); e.r.textContent = f.red ? `${L.digit} ${p.digit}` : `${L.digit} ?`; e.g.className = 'badge g' + (f.green ? ' got' : ''); e.g.textContent = f.green ? `${L.place} ${p.place}` : `${L.place} ?`; });
    Object.entries(lensEls).forEach(([k, b]) => b.classList.toggle('sel', st.sel === k)); };
  const apply = (lensK, pid) => {
    const f = (st.found[pid] ||= {}); f[lensK] = true; st.sel = null; paint();
    if (pz.prints.every(p => (st.found[p.id] || {}).red && (st.found[p.id] || {}).green)) { msg.textContent = L.done; msg.className = 'msg ok'; st.done = true; S.done.add(h.id); refreshAll(); toast(L.done, 'gold'); }
  };
  const printAt = (x, y) => { const t = document.elementsFromPoint(x, y).find(n => n.closest && n.closest('.print')); if (!t) return null; const w = t.closest('.print'); return Object.keys(pics).find(id => pics[id].w === w); };
  Object.entries(lensEls).forEach(([k, b]) => {
    let drag = null, ghost = null;
    b.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: false }; cap(b, e); });
    b.addEventListener('pointermove', (e) => {
      if (!drag) return; if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) { drag.moved = true; ghost = el('div', 'lensghost'); ghost.append(sprite(k === 'red' ? 'lens_red' : 'lens_green')); document.body.append(ghost); }
      if (!drag.moved) return; ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
      const id = printAt(e.clientX, e.clientY); Object.values(pics).forEach(p => { p.w.classList.remove('peekR', 'peekG'); }); if (id) pics[id].w.classList.add(k === 'red' ? 'peekR' : 'peekG');
    });
    const end = (e) => {
      if (!drag) return; const d = drag; drag = null;
      if (ghost) { ghost.remove(); ghost = null; } Object.values(pics).forEach(p => p.w.classList.remove('peekR', 'peekG'));
      if (d.moved) { const id = printAt(e.clientX, e.clientY); if (id) apply(k, id); } else { st.sel = st.sel === k ? null : k; paint(); }
    };
    b.addEventListener('pointerup', end); b.addEventListener('pointercancel', () => { drag = null; if (ghost) ghost.remove(); });
  });
  Object.keys(pics).forEach(id => pics[id].w.addEventListener('click', () => { if (st.sel) apply(st.sel, id); }));
  paint();
  if (st.done) { msg.textContent = L.done; msg.className = 'msg ok'; }
}

/* ---- Cipher Wheel ---- */
function buildCipher(body, h, pz) {
  const st = (S.p.cipher ||= { k: 0 }), L = pz.labels, N = 26, step = 360 / N, C = 150;
  body.append(el('div', 'tip', pz.tip)); const wrap = el('div', 'cipher'); body.append(wrap);
  const A = (i) => String.fromCharCode(65 + i);
  let svg = `<svg class="wheelsvg" viewBox="0 0 300 300"><circle cx="${C}" cy="${C}" r="144" fill="#141d21" stroke="#D9962B" stroke-width="2"/><circle cx="${C}" cy="${C}" r="108" fill="#0d1316" stroke="#6a4a14" stroke-width="1.5"/>`;
  for (let i = 0; i < N; i++) svg += `<g transform="rotate(${i * step} ${C} ${C})"><text class="wl" x="${C}" y="${C - 126}" fill="#9FC4C9" data-i="${i}">${A(i)}</text><circle cx="${C}" cy="${C - 126}" r="14" fill="transparent" data-i="${i}" class="hit"/></g>`;
  svg += `<g id="innerg"><circle cx="${C}" cy="${C}" r="104" fill="#241a0a" stroke="#D9962B" stroke-width="1.5"/><circle cx="${C}" cy="${C}" r="66" fill="#0b1013" stroke="#6a4a14"/>`;
  for (let i = 0; i < N; i++) svg += `<text class="wl" transform="rotate(${i * step} ${C} ${C})" x="${C}" y="${C - 86}" fill="${i === 0 ? '#F3C77D' : '#E8DCB8'}" style="font-size:${i === 0 ? 20 : 15}px">${A(i)}</text>`;
  svg += `</g><path d="M${C} 4 l-7 -8 h14z" fill="#F3C77D" transform="translate(0 10)"/><text class="wl" x="${C}" y="${C - 8}" fill="#9FC4C9" style="font-size:12px;letter-spacing:.1em">${L.inner} A →</text><text class="wl" id="under" x="${C}" y="${C + 14}" fill="#F3C77D" style="font-size:26px"></text></svg>`;
  wrap.innerHTML = svg;
  const carved = el('div', 'carved', `<small>${L.carved}</small>${pz.cipherText}`), out = el('div', 'readout', '&nbsp;'); const row = el('div', 'row');
  const lb = el('button', 'btn sm ghost', '◀ ' + L.left), rb = el('button', 'btn sm ghost', L.right + ' ▶'), read = el('button', 'btn primary', L.read); row.append(lb, read, rb);
  wrap.append(carved, out, row);
  const svgEl = $('svg', wrap), ig = $('#innerg', wrap), under = $('#under', wrap); let deg = st.k * step;
  const setDeg = (d, snap) => { deg = d; ig.style.transform = `rotate(${d}deg)`; ig.style.transformOrigin = `${C}px ${C}px`; if (snap) { st.k = ((Math.round(d / step) % N) + N) % N; deg = Math.round(d / step) * step; ig.style.transition = 'transform .2s'; ig.style.transform = `rotate(${deg}deg)`; setTimeout(() => (ig.style.transition = ''), 220); } under.textContent = A(((Math.round(d / step) % N) + N) % N); };
  setDeg(deg, true);
  const ang = (e) => { const r = svgEl.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI; };
  let drag = null;
  svgEl.addEventListener('pointerdown', (e) => { drag = { a: ang(e), d0: deg, x: e.clientX, y: e.clientY, moved: false, t: e.target }; cap(svgEl, e); });
  svgEl.addEventListener('pointermove', (e) => { if (!drag) return; if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true; if (drag.moved) setDeg(drag.d0 + (ang(e) - drag.a)); });
  svgEl.addEventListener('pointerup', (e) => {
    if (!drag) return; const d = drag; drag = null;
    if (d.moved) setDeg(deg, true); else if (d.t && d.t.dataset && d.t.dataset.i != null) setDeg(+d.t.dataset.i * step + Math.round((deg - st.k * step) / 360) * 360, true);
    out.innerHTML = '&nbsp;';
  });
  lb.onclick = () => { setDeg(deg - step, true); out.innerHTML = '&nbsp;'; }; rb.onclick = () => { setDeg(deg + step, true); out.innerHTML = '&nbsp;'; };
  read.onclick = () => {
    const text = P.cipherDecode(pz.cipherText, st.k); out.textContent = text;
    if (text === pz.plain) { read.disabled = true; out.classList.add('ok'); solvedPanel(h, 1800); } else wrongAnswer({ cap: pz.cap, key: h.id, bank: pz.wrong, btns: [read] });
  };
  lockBtns([read], h.id, false);
}

/* ---- Sightline (overlay on the live view) ---- */
let sightTimer = 0;
function openSight(h, pz) {
  cancelSpeech();
  const st = (S.p.sight ||= { reads: [] }), ui = $('#sightui'), L = pz.labels, need = ['chapel', 'station', 'gate'];
  closePanel(); const tags = {};
  S.panel = { id: h.id, close: closeSight }; document.body.classList.add('sighting'); ui.classList.add('on');
  $('#sightTip').textContent = pz.tip; const readBtn = $('#sightRead'); readBtn.textContent = L.read;
  viewer.setHfov(58, 800);
  pz.landmarks.forEach(lm => viewer.addHotSpot({ id: 'lm_' + lm.id, pitch: lm.pitch, yaw: lm.yaw, type: 'custom', cssClass: 'lmhs', createTooltipFunc: (div) => { const t = el('div', 'lmtag', lm.name); div.append(t); tags[lm.id] = t; } }));
  const big = $('#sightBig'), reads = $('#sightReads'); let aimed = null;
  const paintReads = () => { $('#sightProg').textContent = fmt(L.progress, { n: need.filter(k => st.reads.includes(k)).length }); reads.innerHTML = ''; st.reads.forEach(id => { const lm = pz.landmarks.find(x => x.id === id); reads.append(el('div', 'rchip', `${lm.name}<b>${lm.roman}</b>`)); tags[id] && tags[id].classList.add('read'); }); };
  paintReads();
  const loop = () => {
    if (!viewer) return; const y = viewer.getYaw(), p = viewer.getPitch();
    aimed = pz.landmarks.filter(lm => P.underWire(pz, lm, y, p)).sort((a, b) => P.angDiff(a.yaw, y) - P.angDiff(b.yaw, y))[0] || null;
    $('#wire').classList.toggle('aim', !!aimed); $('#scope').classList.toggle('aim', !!aimed); readBtn.classList.toggle('off', !aimed);
    pz.landmarks.forEach(lm => tags[lm.id] && tags[lm.id].classList.toggle('aim', aimed === lm));
    if (!big.dataset.keep) big.textContent = aimed ? aimed.name : L.aim;
  };
  sightTimer = setInterval(loop, 80); loop();
  readBtn.onclick = () => {
    if (!aimed) return; if (!st.reads.includes(aimed.id)) st.reads.push(aimed.id);
    big.textContent = `${aimed.name}: ${aimed.roman}`; big.dataset.keep = 1; setTimeout(() => delete big.dataset.keep, 2500); paintReads();
    if (need.every(n => st.reads.includes(n))) { toast(L.done, 'gold'); setTimeout(() => { if (S.panel && S.panel.id === h.id) closePanel(); }, 1500); }
  };
  $('#sightX').onclick = () => closePanel(); renderKbtn(); syncOverlay();
}
function closeSight() {
  clearInterval(sightTimer); const ui = $('#sightui'); ui.classList.remove('on'); document.body.classList.remove('sighting'); $('#sightX').style.boxShadow = '';
  const pz = G.puzzles.sight, st = S.p.sight;
  pz.landmarks.forEach(lm => { try { viewer.removeHotSpot('lm_' + lm.id); } catch (e) {} });
  const a = innerWidth / innerHeight; try { viewer.setHfov(clamp(2 * Math.atan(Math.tan(35 * Math.PI / 180) * a) * 180 / Math.PI, 64, 100), 600); } catch (e) {}
  if (st && ['chapel', 'station', 'gate'].every(n => st.reads.includes(n))) {
    const h = room().hotspots.find(x => x.panel === 'sight');
    G.cards.r5_read = G.cards.r5_read || { title: 'Ring readings', text: 'Chapel spire: IV. Station stack: IX. Gate lamp: II.' };
    sfx('ok'); setTimeout(() => clueCard('r5_read', () => completeHotspot(h, true)), 200);
  }
}

/* =========================================================== Room 7: The Knot */
function renderKbtn() {
  let b = $('#kbtn'); const r7 = room().id === 'r7', st = S.p.knot;
  if (!b) { b = el('button', 'btn primary'); b.id = 'kbtn'; b.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);bottom:calc(var(--bar) + 12px);z-index:41;pointer-events:auto'; $('#hud').append(b); b.onclick = () => openKnotPart(); }
  b.hidden = !(r7 && S.playing && st && st.part && !S.panel && !S.ending && !(D.job && D.job.modal));
  if (st) b.textContent = st.part === 1 ? G.puzzles.knot.title : st.part === 2 ? G.puzzles.knot.question.title : G.puzzles.knot.choice.title;
}
document.addEventListener('dialogue-finished', () => renderKbtn());
function openKnotPart() { const p = S.p.knot && S.p.knot.part; if (p === 1) openTower(); else if (p === 2) openQuestion(); else if (p === 3) openChoice(); }
function startKnot() { S.p.knot = { posts: P.towerStart(G.puzzles.knot.rings.length), moves: 0, illegal: 0, part: 1, slow: false }; FX.fxIdle(true); openTower(); }
function openTower() {
  const pz = G.puzzles.knot, st = S.p.knot, n = pz.rings.length;
  openPanel({ id: 'knot1', title: pz.title, sheet: true, build: (body) => {
    body.append(el('div', 'tip', pz.tip)); const tower = el('div', 'tower'), info = el('div', 'msg'); body.append(tower, info);
    const colors = ['#8f8566', '#b9ad82', '#e0d3a0', '#F3C77D']; let sel = null, drag = null, ghost = null; const postEls = [];
    const render = () => {
      postEls.forEach((pe, i) => { pe.innerHTML = ''; pe.classList.remove('target'); [...st.posts[i]].reverse().forEach((v, k) => { const top = k === 0; const r = el('div', 'ring' + (sel === i && top ? ' lift' : ''), pz.rings[n - v]); r.style.width = (42 + v / n * 52) + '%'; r.style.background = `linear-gradient(180deg, ${colors[v - 1]}, #6a5a30)`; pe.append(r); }); });
      info.textContent = `${pz.labels.moves}: ${st.moves}` + (sel !== null ? '  ·  ' + pz.labels.selected : '');
    };
    pz.posts.forEach((name, i) => {
      const p = el('div', 'post'); p.dataset.name = name; p.dataset.i = i; postEls.push(p); tower.append(p);
      p.addEventListener('pointerdown', (e) => {
        if (st.part !== 1) return;
        if (sel !== null) { attempt(sel, i); return; }
        if (!st.posts[i].length) return; sel = i; FX.fxLift(); render(); drag = { x: e.clientX, y: e.clientY, from: i, moved: false }; cap(p, e);
        postEls.forEach((q, j) => q.classList.toggle('target', j !== i));
      });
      p.addEventListener('pointermove', (e) => {
        if (!drag) return; if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 10) { drag.moved = true; const top = st.posts[drag.from][st.posts[drag.from].length - 1]; ghost = el('div', 'ring ringghost', pz.rings[n - top]); ghost.style.width = (42 + top / n * 52) * 1.2 + 'px'; ghost.style.background = `linear-gradient(180deg, ${colors[top - 1]}, #6a5a30)`; document.body.append(ghost); }
        if (drag.moved) { ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px'; }
      });
      p.addEventListener('pointerup', (e) => {
        if (!drag) return; const d = drag; drag = null; if (ghost) { ghost.remove(); ghost = null; }
        if (d.moved) { const t = document.elementsFromPoint(e.clientX, e.clientY).find(x => x.classList && x.classList.contains('post')); if (t) attempt(d.from, +t.dataset.i); else { sel = null; render(); } }
      });
    });
    function attempt(from, to) {
      sel = null; drag = null; if (from === to) { render(); return; }
      if (P.towerLegal(st.posts, from, to)) {
        st.posts[to].push(st.posts[from].pop()); st.moves++; render();
        const r = postEls[to].getBoundingClientRect(); postEls[to].classList.add('glow'); setTimeout(() => postEls[to].classList.remove('glow'), 900); sfx('ring'); FX.fxDrop(r.left + r.width / 2, r.top + 30); FX.fxProgress(st.posts[2].length);
        if (P.towerWon(st.posts, n)) { st.part = 2; part1Done(); }
      } else {
        st.illegal++; sfx('bad'); FX.fxIllegal(); const top = postEls[from].querySelector('.ring'); if (top) { top.classList.add('bounce'); setTimeout(() => top.classList.remove('bounce'), 450); }
        render(); if (st.illegal === 6 && !st.slow) { st.slow = true; say(pz.slow); } else say(pz.illegal[Math.min(st.illegal - 1, pz.illegal.length - 1)]);
      }
    }
    render();
  } });
}
function part1Done() {
  sfx('ok'); const pz = G.puzzles.knot; if (!S.part1Paid) { S.part1Paid = true; addScore(CFG.finalPart1Points); } FX.fxPart1(); closePanel();
  say([...pz.part1Right, pz.question.ask], { modal: true, onDone: openQuestion });
}
function openQuestion() {
  const q = G.puzzles.knot.question; S.p.knot.part = 2;
  openPanel({ id: 'knot2', title: q.title, sheet: true, build: (body) => {
    body.append(el('div', 'dial-label', q.text)); const box = el('div', 'opts'), btns = [];
    q.options.forEach(o => { const b = el('button', 'btn opt', `<b>${o.id}</b><span>${o.t}</span>`); b.dataset.l = ''; btns.push(b); box.append(b);
      b.onclick = () => {
        if (o.id === q.answer) { btns.forEach(x => (x.disabled = true)); addScore(CFG.finalPart2Points); sfx('ok'); FX.fxRight(); S.p.knot.part = 3; setTimeout(() => { closePanel(); say(q.right, { modal: true, onDone: () => say([G.puzzles.knot.choice.intro, G.puzzles.knot.choice.after], { modal: true, onDone: openChoice }) }); }, 700); }
        else { btns.forEach(x => (x.disabled = true)); FX.fxWrong(); wrongQ(); }
      }; });
    body.append(box); lockBtnsQ(btns);
  } });
}
function wrongQ() { // a wrong answer sends the player back to Room 6; the exit leads to a fresh Room 7
  const q = G.puzzles.knot.question, lose = Math.min(CFG.wrongPenalty, Math.max(0, CFG.wrongCapPerPuzzle - (S.pen[q.cap] || 0)));
  if (lose > 0) { S.pen[q.cap] = (S.pen[q.cap] || 0) + lose; addScore(-lose); }
  S.wrongN.q = (S.wrongN.q || 0) + 1; S.knotRetry = true; sfx('bad'); closePanel();
  say(q.wrong[Math.min(S.wrongN.q - 1, q.wrong.length - 1)], { modal: true, onDone: retreatToR6 });
}
function retreatToR6() {
  S.playing = false; FX.fxIdle(false); S.p.knot = null; renderKbtn();
  curtain(true, () => { S.room = 5; buildRoomViewer(5, () => { curtain(false); renderObjective(); renderFind(); S.exitOpen = true; refreshAll(); S.playing = true; S.lastTap = performance.now(); toast(UI.exitOpen); }); });
}
function openChoice() {
  const c = G.puzzles.knot.choice; S.p.knot.part = 3;
  openPanel({ id: 'knot3', title: c.title, sheet: true, onClose: () => FX.fxHover(null), build: (body) => {
    const view = el('div'); view.style.cssText = 'display:flex;flex-direction:column;gap:12px'; body.append(view);
    const choose = () => { view.innerHTML = ''; const g = el('div', 'choices'); c.options.forEach(o => { const b = el('button', 'btn choice ' + o.id, `<h3>${o.t}</h3><p>${o.sub}</p>`); b.onpointerenter = () => FX.fxHover(o.id); b.onpointerleave = () => FX.fxHover(null); b.onfocus = () => FX.fxHover(o.id); b.onblur = () => FX.fxHover(null); b.onclick = () => confirmIt(o); g.append(b); }); view.append(g); };
    const confirmIt = (o) => { view.innerHTML = ''; FX.fxHover(o.id); const w = el('div', 'confirm', `<h3>${c.confirm}</h3><div class="dial-label"><b>${o.t}</b></div>`); const r = el('div', 'row'); const ok = el('button', 'btn primary', UI.confirm), back = el('button', 'btn ghost', UI.back); r.append(back, ok); w.append(r); view.append(w); ok.onclick = () => { FX.fxHover(null); closePanel(); startEnding(o.id); }; back.onclick = () => { FX.fxHover(null); choose(); }; };
    choose();
  } });
}
function startEnding(id) {
  const e = G.endings[id]; S.ending = true; setPause('end', true); dropDialogue(); closePanel(); renderKbtn();
  S.marks = 7; renderWatch(); toast(fmt(UI.markLit, { n: 7 }), 'gold'); addCard('page7'); S.unlocks.add('end');
  FX.fxIdle(false); id === 'cut' ? FX.fxEndCut() : FX.fxEndHold();
  const box = $('#ending'), tx = $('#etext'); let i = 0; box.classList.add('on');
  const show = () => { tx.classList.remove('fade'); void tx.offsetWidth; tx.classList.add('fade'); tx.textContent = e.lines[i].t; narrate(e.lines[i]); };
  const finish = () => { cancelSpeech(); box.classList.remove('on'); showEnd(e.title); };
  box.onclick = (ev) => { if (ev.target.id === 'endSkip') return; if (++i >= e.lines.length) finish(); else show(); };
  $('#endSkip').onclick = (ev) => { ev.stopPropagation(); finish(); };
  setTimeout(show, 1200);
}

/* =========================================================== Book */
function openBook(tab) { if (!S.playing || S.over || S.ending || (D.job && D.job.modal)) return; if (tab) S.bookTab = tab; cancelSpeech(); $('#book').classList.add('on'); syncOverlay(); renderBook(); }
function syncOverlay() { document.body.classList.toggle('overlay', !!S.panel || $('#book').classList.contains('on')); }
function closeBook() { $('#book').classList.remove('on'); syncOverlay(); }
function refreshBook() { if ($('#book').classList.contains('on')) renderBook(); }
function canUse(id) { return room().hotspots.some(h => h.kind === 'USE' && h.needs === id && !S.done.has(h.id) && available(h)); }
function renderBook() {
  const b = $('#book'); b.innerHTML = '';
  const head = el('div', 'phead'); const im = sprite('icon_book'); head.append(im); head.append(el('h2', '', 'Timeline Book'));
  const x = el('button', 'xbtn', ico('i-close')); x.setAttribute('aria-label', UI.close); x.onclick = closeBook; head.append(x); b.append(head);
  const tabs = el('div', 'tabs'); const counts = { clues: S.cards.length, items: S.items.length };
  ['clues', 'items', 'timeline'].forEach(k => { const t = el('button', 'tab' + (S.bookTab === k ? ' on' : ''), UI.tabs[k] + (counts[k] != null ? ` <span class="n">${counts[k]}</span>` : '')); t.onclick = () => { S.bookTab = k; renderBook(); }; tabs.append(t); });
  b.append(tabs); const body = el('div', 'pbody'); b.append(body);
  if (S.bookTab === 'clues') {
    if (!S.cards.length) body.append(el('div', 'empty', UI.noClues));
    const l = el('div', 'list'); S.cards.forEach(id => { const c = G.cards[id]; const e = el('button', 'entry', `<div class="ico">${ico('i-book')}</div><div class="grow"><h4>${c.title}</h4><p>${c.text.length > 90 ? c.text.slice(0, 88) + '…' : c.text}</p></div>`); e.onclick = () => showCard({ kind: 'Clue', title: c.title, text: c.text, mono: id === 'r6_lid', foot: UI.learnSaved }); l.append(e); }); body.append(l);
  } else if (S.bookTab === 'items') {
    if (!S.items.length) body.append(el('div', 'empty', UI.noItems));
    const l = el('div', 'list'); S.items.forEach(id => { const it = G.items[id], used = S.used.has(id); const e = el('div', 'entry' + (used ? ' used' : '')); const ic = el('div', 'ico'); ic.append(sprite(id)); e.append(ic); e.append(el('div', 'grow', `<h4>${it.name}</h4><p>${it.desc}</p>`));
      if (used) e.append(el('span', 'tagr', UI.used)); else if (canUse(id)) { const u = el('button', 'btn sm primary', UI.use); u.onclick = () => { setHold(id); closeBook(); toast(`${UI.holding}: ${it.name}`); }; e.append(u); }
      l.append(e); }); body.append(l);
  } else {
    const tl = G.timeline, t = el('div', 'tl'); const line = el('div', 'line');
    tl.years.concat(S.unlocks.has('end') ? [tl.future] : []).forEach(y => { const lock = !S.unlocks.has(y.unlock); line.append(el('div', 'node' + (y.y === 2019 ? ' now' : '') + (lock ? ' lock' : ''), `<div class="y">${lock ? '????' : y.y}</div><div class="t">${lock ? '' : y.t}</div>`)); });
    t.append(line); body.append(t); body.append(el('div', 'tip', UI.bookEmptyTimeline));
    body.append(el('div', 'watchbox', watchSVG(S.marks) + `<div class="cap">${UI.marks}: ${S.marks} / 7</div>`));
  }
}

/* =========================================================== rooms: enter, next */
function curtain(on, cb) { const c = $('#curtain'); c.classList.toggle('on', on); setTimeout(() => cb && cb(), 420); }
function nextRoom() {
  if (S.over || S.room >= G.rooms.length - 1) return; sfx('door'); S.playing = false; S.exitOpen = false; closeBook(); setHold(null);
  curtain(true, () => { S.room++; S.playing = false; buildRoomViewer(S.room, () => { curtain(false); enterRoom(); }); });
}
function enterRoom() {
  renderObjective(); renderFind(); renderHint(); refreshHotspots(); S.lastTap = performance.now();
  const r = room(), first = S.room === 0;
  const go = () => {
    const after = () => { S.playing = true; S.lastTap = performance.now(); if (r.id === 'r7') startKnot(); renderKbtn(); };
    if (r.enter && r.enter.length && !(r.id === 'r7' && S.knotRetry)) { S.playing = false; say(r.enter, { modal: true, onDone: after }); } else after();
  };
  if (first) return go();
  S.playing = false; setPause('card', true);
  showCard({ cls: 'roomcard', kind: `${UI.room} ${S.room + 1}`, title: r.name, button: UI.enterRoom, pauses: true, noOutside: true, onClose: go });
}

/* =========================================================== idle and pulse */
setInterval(() => {
  if (!S || !S.playing || S.over || S.ending || isPaused() || D.job || cardOpen || S.panel || $('#book').classList.contains('on')) return;
  const idle = (performance.now() - S.lastTap) / 1000;
  const pulse = idle >= CFG.hotspotPulseAfterSeconds; $$('.hs').forEach(e => e.classList.toggle('pulse', pulse));
  if (idle >= CFG.idlePromptSeconds && room().id !== 'r7') { S.lastTap = performance.now(); say(UI.idleVoice, { drop: true }); }
}, 1000);
document.addEventListener('pointerdown', () => { if (S) { S.lastTap = performance.now(); $$('.hs.pulse').forEach(e => e.classList.remove('pulse')); } }, true);

/* =========================================================== start flow */
function show(id, on = true) { $('#' + id).classList.toggle('on', on); }
function imgOk(url, ok) { const i = new Image(); i.onload = () => ok(url); i.src = url; }
function buildStart() {
  $('#start').addEventListener('click', onStart, { once: true });
  imgOk('assets/sheets/tap_to_start.jpg', (u) => { $('#startBg').style.backgroundImage = `url(${u})`; });
  imgOk('assets/sheets/briefing_bg.jpg', (u) => { $('#missionBg').style.backgroundImage = `url(${u})`; });
}
function onStart() {
  S.phase = 'mission'; startAudio(); show('start', false);
  $('#hud').classList.remove('on'); 
  buildRoomViewer(0, () => {});
  const m = G.mission, c = $('#missionCopy'); c.innerHTML = `<h1>${m.heading}</h1>` + m.paras.map(p => `<p>${p}</p>`).join('');
  const b = el('button', 'btn primary go', m.button); c.append(b); show('mission');
  narrate(m.voice);
  const toTut = () => { cancelSpeech(); show('mission', false); runTutorial(); };
  b.onclick = toTut;
}
function runTutorial() {
  S.phase = 'tutorial'; const steps = G.tutorial; let i = 0; document.body.classList.add('tutorial'); show('tutorial');
  renderObjective(); renderFind(); renderHint(); renderWatch();
  const spot = $('#spot'), card = $('#tutcard');
  const rectOf = (k) => {
    if (k === 'book') return $('#bookBtn').getBoundingClientRect(); if (k === 'pause') return $('#pauseBtn').getBoundingClientRect(); if (k === 'top') return $('#topbar').getBoundingClientRect();
    const s = Math.min(260, innerWidth * .6); return { left: innerWidth / 2 - s / 2, top: innerHeight * .4 - s / 2, width: s, height: s, right: innerWidth / 2 + s / 2, bottom: innerHeight * .4 + s / 2 };
  };
  const render = () => {
    const st = steps[i], r = rectOf(st.spot), pad = 8;
    spot.style.left = r.left - pad + 'px'; spot.style.top = r.top - pad + 'px'; spot.style.width = r.width + pad * 2 + 'px'; spot.style.height = r.height + pad * 2 + 'px';
    const low = (r.top + r.height / 2) > innerHeight / 2; card.style.top = low ? 'calc(70px + var(--sat))' : 'auto'; card.style.bottom = low ? 'auto' : 'calc(var(--bar) + 24px)';
    if (st.spot === 'center' && !low) { card.style.top = 'auto'; card.style.bottom = 'calc(var(--bar) + 24px)'; }
    $('#demoHand').style.display = i === 0 ? 'block' : 'none'; $('#demoGlow').style.display = i === 1 ? 'block' : 'none';
    $('#demoHand').style.left = innerWidth / 2 - 30 + 'px'; $('#demoHand').style.top = innerHeight * .4 - 30 + 'px'; $('#demoGlow').style.left = innerWidth / 2 - 32 + 'px'; $('#demoGlow').style.top = innerHeight * .4 - 32 + 'px';
    $('#hintBtn').classList.toggle('attn', st.spot === 'top');
    card.innerHTML = `<div class="step">${i + 1} / ${steps.length}</div><h3>${st.title}</h3><p>${st.text}</p><div class="row"></div>`;
    const row = $('.row', card); const sk = el('button', 'btn sm ghost', UI.skip), nx = el('button', 'btn sm primary', i === steps.length - 1 ? G.mission.button : UI.next); row.append(sk, nx);
    nx.onclick = () => { if (++i >= steps.length) end(); else render(); }; sk.onclick = end;
  };
  const end = () => { show('tutorial', false); document.body.classList.remove('tutorial'); $('#hintBtn').classList.remove('attn'); runOpening(); };
  render();
}
function runOpening() {
  S.phase = 'opening'; document.body.classList.remove('tutorial'); show('tutorial', false); renderObjective(); renderFind(); renderHint(); renderWatch();
  say(G.opening, { modal: true, onDone: beginPlay });
}
function beginPlay() {
  S.phase = 'play'; const p = $('#pano'); p.style.transition = `filter ${CFG.sharpenSeconds}s ease`; p.classList.remove('blur');
  $('#hud').classList.add('on'); T.started = true; T.last = performance.now(); setPause('intro', false);
  S.playing = true; S.lastTap = performance.now(); refreshHotspots(); renderClock(); toast(`${UI.room} 1: ${room().name}`);
}

/* =========================================================== pause, end, time up */
function buildPause() {
  const p = $('#pause'); p.innerHTML = `<h2>${UI.paused}</h2><p>${UI.pausedNote}</p>`;
  const rs = el('button', 'btn primary', UI.resume), re = el('button', 'btn', UI.restart);
  const ask = el('div', 'ask', `<p>${UI.restartAsk}</p>`), yes = el('button', 'btn', UI.yes), no = el('button', 'btn ghost', UI.no); ask.append(yes, no);
  p.append(rs);
  [['music', setMusic], ['sfx', setSfx], ['voice', setVoice]].forEach(([k, fn]) => {
    const b = el('button', 'btn ghost'); const label = () => (b.textContent = `${UI[k]}: ${V[k] ? UI.on : UI.off}`); label();
    b.onclick = () => { fn(!V[k]); label(); }; p.append(b);
  });
  p.append(re, ask);
  rs.onclick = resume; re.onclick = () => { ask.classList.add('on'); re.hidden = true; }; no.onclick = () => { ask.classList.remove('on'); re.hidden = false; }; yes.onclick = () => location.reload();
}
function pauseGame() { if (S.over || isPaused() || S.phase === 'start' || S.phase === 'mission') return; buildPause(); document.body.classList.add('paused'); setPause('menu', true); pauseVoice(); show('pause'); }
function resume() { show('pause', false); document.body.classList.remove('paused'); setPause('menu', false); resumeVoice(); }
function showEnd(title) {
  const e = $('#end'); e.className = 'screen on'; e.innerHTML = `<h2>${title}</h2><div class="wbig">${watchSVG(S.marks)}</div><div class="stats"><div class="stat surface"><div class="k">${UI.threads}</div><div class="v">${S.score}</div></div><div class="stat surface"><div class="k">${UI.timeLeft}</div><div class="v">${mmss(S.time)}</div></div></div><div class="sub">${UI.marks}: ${S.marks} / 7</div><div class="other">${UI.otherEnding}</div>`;
  const b = el('button', 'btn primary', UI.playAgain); b.onclick = () => location.reload(); e.append(b);
}
function timeUp() {
  S.over = true; sfx('timeup'); dropDialogue(); closeCard(); closePanel(); closeBook(); cancelSpeech(); FX.fxTimeUp(); renderKbtn();
  setTimeout(() => {
    const e = $('#end'); e.className = 'screen on timeup'; const line = G.endings.timeUp.line;
    e.innerHTML = `<div class="inkclock">${watchSVG(S.marks, { spin: true })}</div><h2>${UI.timeUp}</h2><div class="tutext">${line}</div>`; const b = el('button', 'btn primary', UI.tryAgain); b.onclick = () => location.reload(); e.append(b); narrate(G.endings.timeUp.voice);
  }, 2200);
}

/* =========================================================== debug */
function debugTools() {
  const bar = el('div'); bar.id = 'debugbar'; document.body.append(bar);
  const add = (t, f) => { const b = el('button', '', t); b.onclick = f; bar.append(b); };
  Object.entries(FX.TESTS).forEach(([k, f]) => add(k, f));
  add('skipIntro', () => { renderObjective(); renderFind(); dropDialogue(); closeCard(); show('start', false); show('mission', false); show('tutorial', false); document.body.classList.remove('tutorial'); if (!viewer) buildRoomViewer(0, () => {}); S.phase = 'opening'; beginPlay(); });
  add('+60s', () => { S.time = Math.max(1, S.time - 540); });
  const jump = (n, ids = [], carry = true) => {
    dropDialogue(); closeCard(); closePanel(); S.done = new Set(); S.items = []; S.cards = []; S.p = {}; S.used = new Set();
    if (carry) G.rooms.slice(0, n).forEach(r => r.hotspots.forEach(h => { S.done.add(h.id); if (h.item) S.items.push(h.item); if (h.card) S.cards.push(h.card); }));
    G.rooms[n].hotspots.forEach(h => { if (ids.includes(h.id)) { S.done.add(h.id); if (h.item) S.items.push(h.item); if (h.card) S.cards.push(h.card); } });
    S.room = n; S.phase = 'play'; S.marks = carry ? n : 0; S.exitOpen = false; S.hold = null; S.over = false; S.playing = false;
    if (!T.started) { document.body.classList.remove('tutorial'); show('start', false); show('mission', false); show('tutorial', false); $('#pano').classList.remove('blur'); $('#hud').classList.add('on'); T.started = true; setPause('intro', false); }
    buildRoomViewer(n, () => { renderObjective(); renderFind(); renderWatch(); refreshAll(); S.playing = true; if (G.rooms[n].id === 'r7') startKnot(); });
  };
  window.__ET = { voice: () => voiceEl, jump, get S() { return S; }, G, room, say, completeHotspot, nextRoom, FX, awardMark, openBook, viewer: () => viewer, HS, addScore, timeUp, openPuzzle, onHotspot, buildRoomViewer, enterRoom };
}
function validate() {
  const errs = P.validate(G);
  G.rooms.forEach(r => { if (!r.pano) errs.push(r.id + ': no pano'); if (r.id !== 'r7' && !r.exit) errs.push(r.id + ': no exit'); });
  if (errs.length) { console.error('game.json problems:\n' + errs.join('\n')); if (DEBUG) { const d = el('div'); d.id = 'dbgerr'; d.textContent = UI.debugBad + '\n' + errs.join('\n'); document.body.append(d); } }
  return errs;
}

/* =========================================================== boot */
fetch('game.json', { cache: 'no-store' }).then(r => r.json()).then(json => {
  G = json; UI = G.ui; CFG = G.config; S = freshState(); validate();
  FX.init(); setPause('intro', true); renderWatch(); renderHint(); $('#score').textContent = 0; renderClock();
  $('#hintBtn').onclick = useHint;
  $('#bookBtn').onclick = () => ($('#book').classList.contains('on') ? closeBook() : openBook());
  $('#watchBtn').onclick = () => { if ($('#book').classList.contains('on') && S.bookTab === 'timeline') closeBook(); else openBook('timeline'); };
  $('#pauseBtn').onclick = pauseGame;
  $('#dlg').innerHTML = '<div class="bust"></div><div class="txt"><div class="who"></div><div class="line"></div></div><div class="more"></div><button class="skip"></button>';
  $('#dlg .skip').textContent = UI.skip; $('#dlg .skip').onclick = (e) => { e.stopPropagation(); endJob(); };
  $('#dlg').onclick = advance; $('#dlgcatch').onclick = advance; $('#endSkip').textContent = UI.skip;
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (isPaused()) return resume(); if (cardOpen) return closeCard(); if (S.panel) return closePanel(); if ($('#book').classList.contains('on')) return closeBook();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.playing && !S.over && !S.ending) pauseGame(); });
  setInterval(tick, 200); T.last = performance.now();
  buildStart(); if (DEBUG) { debugTools(); const q = new URLSearchParams(location.search), rm = parseInt(q.get('room'), 10);
    if (rm >= 1 && rm <= G.rooms.length) { startAudio(); window.__ET.jump(rm - 1, [], q.get('carry') === '1'); } }
}).catch(err => { document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:0;z-index:999;background:#300;color:#fff;padding:20px;white-space:pre-wrap">Could not load game.json.\nRun the game from a local server: python -m http.server\n\n${err}</pre>`); });
})();
