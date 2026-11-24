/* The Kingdom Beyond the Door: engine. All text and numbers come from game.json. */
'use strict';
(() => {
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const DEBUG = /[?&]debug=1/.test(location.search) && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const isMobile = () => innerWidth < 700;
let G, C, T0;           // game.json, config
const missing = new Set();
const S = {
  phase: 'title', roomIndex: 0, done: new Set(), bag: [], found: new Set(), casebook: [], shards: [], score: 0,
  brk: { items: 0, shards: 0, steps: 0, time: 0, pen: 0 }, penaltiesByPanel: {}, wrongCount: {}, hintsUsed: {},
  timerRemaining: 0, timerOn: false, paused: false, dlgPause: false, soundOn: true, musicOn: true, selectedItem: null,
  idleSince: 0, lockSeen: {}, shardReady: {}, shardTaken: {}, ended: false, ps: {}, panel: null, busy: false
};
const restart = () => { const q = new URLSearchParams(location.search); q.delete('room'); q.delete('carry'); const t = q.toString(); location.href = location.pathname + (t ? '?' + t : ''); };
const T = (k, vars) => {
  let s = k.split('.').reduce((o, p) => (o == null ? o : o[p]), G.ui);
  if (s == null) { if (!missing.has(k)) { missing.add(k); console.warn('missing ui text', k); } return k; }
  for (const v in vars || {}) s = s.replace('{' + v + '}', vars[v]);
  return s;
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// pause-aware wait (the lockout, bell patterns and beams freeze under the pause menu)
const wait = ms => new Promise(res => {
  let left = ms, last = performance.now();
  const t = setInterval(() => { const n = performance.now(); if (!S.paused) left -= n - last; last = n; if (left <= 0) { clearInterval(t); res(); } }, 30);
});
const room = () => G.rooms[S.roomIndex];

/* ---------- events ---------- */
const L = {};
const ev = {
  on(n, f) { (L[n] = L[n] || []).push(f); },
  emit(n) {
    if (/^(done|dialogueEnd|roomSolved):/.test(n)) S.done.add(n);
    (L[n] || []).forEach(f => f());
    refresh();
  }
};

/* ---------- art fallbacks ---------- */
const SHARD_COLOR = { shard_bell: '#E0A030', shard_lantern: '#E8D48B', shard_hearth: '#D9512C', shard_dance: '#4FA86B', shard_ice: '#4C9BD6', shard_tale: '#8E6BC1' };
const ICONS = {
  bag: '<path d="M6 8h12l2 12H4zM9 8a3 3 0 016 0"/>', casebook: '<path d="M4 5h7a2 2 0 012 2v12a2 2 0 00-2-2H4zM20 5h-7a2 2 0 00-2 2v12a2 2 0 012-2h7z"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3.5"/>', hint: '<path d="M9 4h6M10 4v2M14 4v2M7 8h10l-1 12H8zM12 11v5"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 010 6"/>', music: '<path d="M9 18V6l10-2v12M9 18a3 3 0 11-6 0 3 3 0 016 0zM19 16a3 3 0 11-6 0 3 3 0 016 0z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>', ember: '<path d="M12 3c3 4 6 6 6 11a6 6 0 01-12 0c0-3 2-4 3-7 1 2 2 2 3-4z"/>'
};
const svgIcon = (n, cls) => `<svg class="${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;
const icon = n => (n === 'pause' ? svgIcon('pause') : `<img src="assets/cut/ui_${n}.png" data-fb="icon:${n}" alt="">`);
const spriteImg = id => `<img src="${esc((G.items[id] || {}).sprite || '')}" data-fb="item:${id}" alt="">`;
function itemFallback(id) {
  const it = G.items[id] || { name: id };
  const d = el('div', 'fb' + (SHARD_COLOR[id] ? ' diamond' : ''), SHARD_COLOR[id] ? '' : esc(it.name.split(' ').map(w => w[0]).join('').slice(0, 3)));
  if (SHARD_COLOR[id]) d.style.background = `linear-gradient(135deg,#fff8,${SHARD_COLOR[id]})`;
  return d;
}
function badge(who) {
  const ch = G.characters[who];
  const b = el('div', 'badge2', esc(ch.name[0]));
  b.style.background = ch.accent;
  return b;
}
document.addEventListener('error', e => {
  const t = e.target;
  if (!t || t.tagName !== 'IMG' || !t.dataset.fb) return;
  const [kind, id] = t.dataset.fb.split(':');
  if (kind === 'bust' && t.dataset.alt) { t.src = t.dataset.alt; delete t.dataset.alt; return; }
  const src = t.getAttribute('src');
  if (!missing.has(src)) { missing.add(src); console.warn('missing art', src); }
  const rep = kind === 'item' ? itemFallback(id) : kind === 'bust' ? badge(id) : kind === 'icon' ? el('span', '', svgIcon(id)) : null;
  if (rep) { if (kind === 'icon') { t.replaceWith(rep.firstChild); } else t.replaceWith(rep); }
}, true);
const imgOk = src => new Promise(res => { const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = src; });

/* ---------- audio ---------- */
let AC;
function ac() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* silent */ } }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(freq, o = {}) {
  const a = ac(); if (!a || !S.soundOn) return;
  const { dur = 0.9, gain = 0.25, type = 'sine' } = o, t = a.currentTime; const vol = gain * 0.45;
  const os = a.createOscillator(), g = a.createGain();
  os.type = type; os.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  os.connect(g); g.connect(a.destination); os.start(t); os.stop(t + dur + 0.05);
}
const bellNote = f => { tone(f); tone(f * 2, { type: 'triangle', gain: 0.06 }); };
const chime = () => [659.25, 880, 1174.7].forEach((f, i) => setTimeout(() => tone(f, { dur: 0.5, gain: 0.12 }), i * 110));
const lullaby = () => (G.panels.bells.freqHz).forEach((f, i) => setTimeout(() => bellNote(f), i * 400));
const SFX = {
  tap() { tone(660, { dur: 0.07, gain: 0.05, type: 'triangle' }); },
  tick() { tone(1000, { dur: 0.05, gain: 0.07, type: 'square' }); },
  pick() { [880, 1175, 1568].forEach((f, i) => setTimeout(() => tone(f, { dur: 0.35, gain: 0.1 }), i * 70)); },
  page() { noise(0.2, 'bandpass', 2500, 0.3); tone(330, { dur: 0.12, gain: 0.04 }); },
  use() { tone(200, { dur: 0.12, gain: 0.1, type: 'square' }); setTimeout(chime, 130); },
  coin() { tone(1318, { dur: 0.18, gain: 0.07, type: 'triangle' }); setTimeout(() => tone(1760, { dur: 0.25, gain: 0.07, type: 'triangle' }), 70); },
  whoosh() { noise(0.7, 'bandpass', 900, 0.4); },
  panel() { noise(0.25, 'lowpass', 1200, 0.35); tone(392, { dur: 0.3, gain: 0.05 }); },
  hint() { tone(523, { dur: 0.6, gain: 0.1 }); setTimeout(() => tone(784, { dur: 0.8, gain: 0.1 }), 120); },
  shardAppear() { [1046, 1318, 1568, 2093].forEach((f, i) => setTimeout(() => tone(f, { dur: 0.9, gain: 0.07 }), i * 90)); },
  shard() { [523, 659, 784, 1046, 1568].forEach((f, i) => setTimeout(() => tone(f, { dur: 1.1, gain: 0.1 }), i * 80)); noise(0.5, 'highpass', 5000, 0.15); },
  lose() { tone(196, { dur: 0.6, gain: 0.1, type: 'sawtooth' }); setTimeout(() => tone(147, { dur: 1, gain: 0.1, type: 'sawtooth' }), 320); },
  win() { [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => setTimeout(() => tone(f, { dur: 1.4, gain: 0.11 }), i * 190)); }
};
const sfx = n => { try { if (SFX[n]) SFX[n](); } catch (e) { /* sound is optional */ } };
const Music = {
  a: null,
  start() {
    if (this.a) return;
    const a = new Audio('assets/audio/bgm.mp3'); a.loop = true; a.volume = 0.13;
    a.onerror = () => { this.a = null; };
    this.a = a; this.sync();
  },
  sync() { if (!this.a) return; if (S.musicOn && !S.paused) this.a.play().catch(() => {}); else this.a.pause(); },
  duck(on) { if (this.a) this.a.volume = on ? 0.04 : 0.13; }
};
// Voice: plays the recorded line (line.audioFile) and falls back to the browser voice only when a line has no file.
// One voice at a time; pause/resume keep the position; the next line is preloaded while the current one plays.
const Voice = {
  a: null, pre: {},
  pick(g) {
    const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
    const f = /female|zira|samantha|hazel|susan|aria|jenny|libby|sonia|karen|moira/i, m = /\bmale\b|david|mark|daniel|guy|george|ryan|alex|james|oliver/i;
    return vs.find(v => (g === 'female' ? f : m).test(v.name) && (g === 'female' || !/female/i.test(v.name))) || vs[0] || null;
  },
  preload(file) { if (file && !this.pre[file]) { const a = new Audio(); a.preload = 'auto'; a.src = file; this.pre[file] = a; } },
  speak(line, who) {
    this.stop();
    if (!S.soundOn) return;
    const text = typeof line === 'string' ? line : line.text, file = typeof line === 'string' ? null : line.audioFile;
    if (file) {
      const a = this.pre[file] || new Audio(file); delete this.pre[file]; this.a = a; a.currentTime = 0; a.volume = 0.95;
      a.onplaying = () => Music.duck(true); a.onended = () => { if (this.a === a) { this.a = null; Music.duck(false); } };
      a.onerror = () => { if (this.a === a) { this.a = null; this.synth(text, who); } };
      a.play().catch(() => { /* blocked until the next tap: stay silent, never double up with the browser voice */ });
      return;
    }
    this.synth(text, who);
  },
  synth(text, who) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const ch = G.characters[who] || G.characters.narrator, u = new SpeechSynthesisUtterance(text);
    u.volume = 0.8; u.pitch = ch.voice.pitch; u.rate = ch.voice.rate; u.lang = 'en-GB';
    const v = this.pick(ch.voice.gender); if (v) u.voice = v;
    u.onstart = () => Music.duck(true); u.onend = u.onerror = () => Music.duck(false);
    speechSynthesis.speak(u);
  },
  pause() { if (this.a) this.a.pause(); if ('speechSynthesis' in window) speechSynthesis.pause(); },
  resume() { if (!S.soundOn) return; if (this.a) this.a.play().catch(() => {}); if ('speechSynthesis' in window) speechSynthesis.resume(); },
  stop() { if (this.a) { this.a.pause(); this.a = null; } if ('speechSynthesis' in window) speechSynthesis.cancel(); Music.duck(false); }
};

/* ---------- score, timer, HUD ---------- */
const fmt = s => { s = Math.ceil(s); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
function pop(n) {
  if (!n) return;
  const p = el('span', 'pop ' + (n > 0 ? 'up' : 'down'), (n > 0 ? '+' : '') + n);
  $('#embers').appendChild(p); setTimeout(() => p.remove(), 750);
}
function setScore(v) { S.score = v; $('#emberTxt').textContent = v; }
function addScore(n, key) { setScore(S.score + n); S.brk[key] += n; pop(n); if (n > 0) sfx('coin'); }
function penalize(amount, panelId) {
  let a = amount;
  if (panelId) { const used = S.penaltiesByPanel[panelId] || 0; a = Math.min(amount, C.penaltyWrongCapPerPuzzle - used); S.penaltiesByPanel[panelId] = used + Math.max(a, 0); }
  a = Math.max(0, Math.min(a, S.score));
  if (!a) return;
  setScore(S.score - a); S.brk.pen -= a; pop(-a);
}
function updateClock() { $('#clockTxt').textContent = fmt(S.timerRemaining); $('#clock').classList.toggle('low', S.timerRemaining <= 60 && S.timerRemaining > 0); }
let lastTick = performance.now();
setInterval(() => {
  const n = performance.now(), dt = (n - lastTick) / 1000; lastTick = n;
  if (!S.timerOn || S.paused || S.dlgPause || S.ended || S.phase !== 'play') return;
  S.timerRemaining = Math.max(0, S.timerRemaining - dt); updateClock();
  const sec = Math.ceil(S.timerRemaining); if (sec <= 10 && sec > 0 && sec !== S.lastSec) { S.lastSec = sec; sfx('tick'); }
  if (S.timerRemaining <= 0) timeUp();
  if (S.phase === 'play' && !S.panel && !D.cur && !openCount() && Date.now() - S.idleSince > C.idleSeconds * 1000) { S.idleSince = Date.now(); Dialogue.play(G.idleDialogue); }
}, 200);
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 2200);
}

/* ---------- layer stack (Esc closes the top one) ---------- */
const stack = [];
const openCount = () => stack.length;
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !stack.length && S.selectedItem) { selectItem(null); toast(T('putBack')); return; }
  if (e.key === 'Escape' && stack.length) { e.preventDefault(); stack[stack.length - 1].close(); }
  if ((e.key === ' ' || e.key === 'Enter') && D.cur && !stack.length && document.activeElement === document.body) { e.preventDefault(); Dialogue.tap(); }
});
function layer(node, { cls = '', dismiss = true, onClose, keepVoice = false } = {}) {
  const w = el('div', 'wrap ' + cls); w.appendChild(node);
  let closed = false, resolve; const p = new Promise(r => { resolve = r; });
  const it = { close() { if (closed) return; closed = true; stack.splice(stack.indexOf(it), 1); w.remove(); document.body.classList.toggle('modal', stack.length > 0); if (onClose) onClose(); resolve(); }, el: w, done: p };
  if (dismiss) w.addEventListener('pointerdown', e => { if (e.target === w) it.close(); });
  stack.push(it); $('#layers').appendChild(w); if (!keepVoice) Voice.stop();
  return it;
}
const xbtn = () => `<button class="xbtn" aria-label="${T('close')}">&times;</button>`;
function card(html, { cls = '', wrapCls = 'card', buttons = [], dismiss = true } = {}) {
  const box = el('div', 'cardbox glass ' + cls, xbtn() + html);
  if (buttons.length) { const row = el('div', 'btns'); buttons.forEach(b => { const x = el('button', 'btn ' + (b.primary ? 'primary' : 'sec'), esc(b.label)); x.setAttribute('aria-label', b.label); x.onclick = () => { it.close(); if (b.fn) b.fn(); }; row.appendChild(x); }); box.appendChild(row); }
  const it = layer(box, { cls: wrapCls, dismiss });
  $('.xbtn', box).onclick = () => it.close();
  return it;
}
const itemCard = (id, added = true) => card(`<div class="sprite">${spriteImg(id)}</div><h2>${esc(G.items[id].name)}</h2><p>${esc(G.items[id].desc)}</p>${added ? `<p class="added">${T('addedBag')}</p>` : ''}`, { buttons: [{ label: T('ok'), primary: true }] }).done;
function chartHTML() {
  const d = G.panels.guests.dishes, yn = b => (b ? T('yes') : T('no'));
  return `<table><tr><th>${T('chart.dish')}</th><th>${T('chart.servings')}</th><th>${T('chart.warm')}</th><th>${T('chart.texture')}</th><th>${T('chart.sweet')}</th><th>${T('chart.contains')}</th></tr>` +
    Object.values(d).map(x => `<tr><td>${esc(x.name)}</td><td>${x.servings}</td><td>${yn(x.warm)}</td><td>${esc(x.texture)}</td><td>${yn(x.sweet)}</td><td>${esc(x.contains)}</td></tr>`).join('') + '</table>';
}
function pageCard(pid, { chart = false, saved = true } = {}) {
  sfx('page');
  const p = G.clues[pid] || G.notes[pid];
  return card(`<h2>${esc(p.title)}</h2><div class="txt">${esc(p.text)}</div>${chart ? chartHTML() : ''}<div class="foot">${saved ? '&#128214; ' + T('savedNotes') : ''}</div>`,
    { cls: 'page', buttons: [{ label: T('close'), primary: true }] }).done;
}

/* ---------- dialogue ---------- */
const D = { q: [], cur: null, typing: null };
const Dialogue = {
  play(idOrObj) {
    return new Promise(res => {
      const d = typeof idOrObj === 'string' ? { id: idOrObj, ...G.dialogues[idOrObj] } : idOrObj;
      if (!d.lines) { res(); return; }
      D.q.push({ d, res }); if (!D.cur) this.next();
    });
  },
  next() {
    const n = D.q.shift(); if (!n) return;
    D.cur = { ...n, i: 0 }; S.dlgPause = !!n.d.pausesTimer;
    const box = $('#dlg'); box.classList.remove('hidden', 'last'); document.body.classList.add('dlg-open');
    box.dataset.l = ''; box.dataset.r = ''; $$slots().forEach(s => { s.innerHTML = ''; delete s.dataset.k; });
    this.line();
  },
  line() {
    const cur = D.cur, ln = cur.d.lines[cur.i], ch = G.characters[ln.who], box = $('#dlg');
    const nar = !ch || ch.side === 'none';
    box.classList.toggle('nar', nar); box.classList.toggle('last', cur.i === cur.d.lines.length - 1);
    const np = $('.nameplate', box);
    if (nar) { np.classList.add('hidden'); box.dataset.l = ''; box.dataset.r = ''; }
    else {
      box.dataset[ch.side === 'left' ? 'l' : 'r'] = '1';
      setBust(ch.side, ln.who, ln.mood);
      $$slots().forEach(s => s.classList.toggle('dim', !s.classList.contains(ch.side)));
      np.classList.remove('hidden', 'left', 'right'); np.classList.add(ch.side); np.textContent = ch.name; np.style.color = ch.accent;
    }
    $('.dorn', box).style.color = '#CFE3FF';
    typeText(ln.text);
    Voice.speak(ln, ln.who);
    const nx = cur.d.lines[cur.i + 1]; if (nx) Voice.preload(nx.audioFile);
  },
  tap() {
    if (!D.cur) return;
    if (D.typing) { finishType(); return; }
    sfx('tap');
    Voice.stop();
    if (D.cur.i < D.cur.d.lines.length - 1) { D.cur.i++; this.line(); } else this.end();
  },
  end() {
    const c = D.cur; if (!c) return;
    clearInterval(D.typing); D.typing = null; Voice.stop();
    D.cur = null; S.dlgPause = false; S.idleSince = Date.now();
    if (!D.q.length) { $('#dlg').classList.add('hidden'); document.body.classList.remove('dlg-open'); }
    c.res(); if (c.d.id) ev.emit('dialogueEnd:' + c.d.id);
    if (!D.cur) this.next();
  }
};
const $$slots = () => [...document.querySelectorAll('#dlg .slot')];
function setBust(side, who, mood) {
  const slot = $('#dlg .slot.' + side), key = who + ':' + mood;
  if (slot.dataset.k === key) return;
  slot.dataset.k = key;
  [...slot.children].forEach(c => { c.classList.add('out'); setTimeout(() => c.remove(), 130); });
  const ch = G.characters[who], src = ch.busts[mood] || ch.busts.neutral || ch.busts.calm;
  slot.style.setProperty('--bc', ch.accent);
  let n;
  if (src) { n = new Image(); n.dataset.fb = 'bust:' + who; n.dataset.alt = ch.busts.neutral || ch.busts.calm || ''; if (n.dataset.alt === src) delete n.dataset.alt; n.alt = ''; n.src = src; if (ch.flip) n.style.scale = '-1 1'; }
  else n = badge(who);
  slot.appendChild(n);
  $('#dlg').dataset[side === 'left' ? 'l' : 'r'] = '1';
}
function typeText(text) {
  clearInterval(D.typing);
  const t = $('#dlg .dtext'); t.style.fontSize = '';
  t.innerHTML = '<span class="r"></span><span class="h"></span>';
  const r = $('.r', t), h = $('.h', t); h.textContent = text;
  const box = $('#dlg'); let size = parseFloat(getComputedStyle(t).fontSize);
  while (box.scrollHeight > box.clientHeight + 1 && size > 15) { size -= 1; t.style.fontSize = size + 'px'; }
  let n = 0; D.typing = setInterval(() => {
    n++; r.textContent = text.slice(0, n); h.textContent = text.slice(n);
    if (n >= text.length) { clearInterval(D.typing); D.typing = null; }
  }, C.typewriterMsPerChar);
  D.fullText = text;
}
function finishType() {
  clearInterval(D.typing); D.typing = null;
  const t = $('#dlg .dtext'); $('.r', t).textContent = D.fullText; $('.h', t).textContent = '';
}

/* ---------- panorama + hotspots ---------- */
let viewer = null, loaded = false;
const shown = new Map();
async function panoSrc(r) {
  if (await imgOk(r.pano)) return r.pano;
  console.warn('missing panorama', r.pano);
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 1024); g.addColorStop(0, '#0B1530'); g.addColorStop(0.6, r.accent + '66'); g.addColorStop(1, '#0B1530');
  x.fillStyle = g; x.fillRect(0, 0, 2048, 1024);
  x.fillStyle = '#c9801c'; x.beginPath(); x.moveTo(930, 800); x.lineTo(930, 480); x.arc(1024, 480, 94, Math.PI, 0); x.lineTo(1118, 800); x.fill();
  x.fillStyle = '#EAF2FF'; x.font = '600 64px Georgia'; x.textAlign = 'center'; x.fillText(r.name, 1024, 900);
  return c.toDataURL('image/jpeg', 0.8);
}
async function setupRoom(i) {
  S.roomIndex = i; const r = G.rooms[i];
  document.documentElement.style.setProperty('--accent', r.accent);
  $('#roomName').textContent = r.name;
  const src = await panoSrc(r);
  if (viewer) { try { viewer.destroy(); } catch (e) { /* ignore */ } viewer = null; }
  loaded = false; shown.clear();
  await new Promise(res => {
    viewer = pannellum.viewer('pano', {
      type: 'equirectangular', panorama: src, autoLoad: true, showControls: false, showFullscreenCtrl: false, showZoomCtrl: false,
      hfov: isMobile() ? 100 : 90, minHfov: 60, maxHfov: 110, yaw: 0, pitch: 0, autoRotate: 0, compass: false, keyboardZoom: false, mouseZoom: true
    });
    viewer.on('load', () => { loaded = true; res(); });
    viewer.on('error', e => { console.error('pano error', e); res(); });
    setTimeout(res, 10000);
  });
  refresh();
}
const hsList = () => {
  const r = room(), l = [...r.hotspots];
  if (r.shard) l.push({ id: 'shard:' + r.id, kind: 'SHARD', label: G.items[r.shard].name, yaw: r.shardYaw, pitch: r.shardPitch, after: [] });
  if (r.exit) l.push({ id: 'exit:' + r.id, kind: 'EXIT', label: T('exitLabel'), yaw: r.exit.yaw, pitch: r.exit.pitch, after: [] });
  return l;
};
function hsVisible(h) {
  const r = room();
  if (h.kind === 'SHARD') return !!S.shardReady[r.id] && !S.shardTaken[r.id];
  if (h.kind === 'EXIT') return !!S.shardTaken[r.id];
  if (!h.after.every(a => S.done.has(a))) return false;
  const dn = S.done.has('done:' + h.id);
  if (h.kind === 'FIND' || h.kind === 'LEARN') return !dn;
  if (h.kind === 'USE') return !dn || !!(h.thenPanel && !S.done.has('done:' + h.thenPanel));
  if (h.kind === 'PANEL') return !S.done.has('done:' + h.panel);
  return true;
}
function hsNode(h) {
  const d = el('div', 'hs'); d.setAttribute('role', 'button'); d.setAttribute('aria-label', h.label); d.title = h.label;
  if (h.kind === 'FIND') { d.classList.add('item'); d.innerHTML = spriteImg(h.item); }
  else if (h.kind === 'SHARD') { d.classList.add('shard'); d.innerHTML = spriteImg(room().shard); }
  else if (h.kind === 'EXIT') d.classList.add('exit');
  else d.classList.add('orb', h.kind.toLowerCase());
  if (h.kind === 'USE' && !S.done.has('done:' + h.id)) d.classList.add('locked');
  if (DEBUG && !hsVisible(h)) d.classList.add('dbg');
  return d;
}
function syncHotspots() {
  if (!viewer || !loaded) return;
  const showAll = DEBUG && /markers=1/.test(location.search);
  for (const h of hsList()) {
    const vis = showAll || hsVisible(h);
    if (vis && !shown.has(h.id)) {
      shown.set(h.id, 1);
      viewer.addHotSpot({
        id: h.id, pitch: h.pitch, yaw: h.yaw, type: 'custom', cssClass: 'hsx',
        createTooltipFunc: div => { const n = hsNode(h); div.appendChild(n); div.__n = n; },
        clickHandlerFunc: (e) => onHotspot(h, (e.currentTarget && e.currentTarget.__n) || e.target)
      });
    } else if (!vis && shown.has(h.id)) { shown.delete(h.id); try { viewer.removeHotSpot(h.id); } catch (e) { /* ignore */ } }
  }
}
function updateObjective() {
  const r = room(), o = r.objectives.find(x => !x.until || !S.done.has(x.until));
  $('#objective').textContent = o ? o.text : '';
}
function updateStrip() {
  const s = $('#strip'); s.innerHTML = '';
  room().findStrip.forEach(id => {
    const c = el('div', 'sc' + (S.found.has(id) ? ' got' : ''), S.found.has(id) ? spriteImg(id) : '?');
    s.appendChild(c);
  });
  s.classList.toggle('hidden', S.phase === 'title' || S.phase === 'mission' || (S.panel && room().id === 'room7'));
}
const hintsLeft = () => C.hintsPerRoom - (S.hintsUsed[room().id] || 0);
function updateHud() {
  $('#hintBadge').textContent = hintsLeft(); $('#hintBtn').classList.toggle('off', hintsLeft() <= 0);
  $('#bagBadge').textContent = S.bag.length;
}
function refresh() { if (!G) return; updateObjective(); updateStrip(); updateHud(); syncHotspots(); if (DEBUG) debugOverlay(); }
function fly(from, ms = 450) {
  return new Promise(res => {
    const a = from.getBoundingClientRect(), b = $('#bagBtn').getBoundingClientRect(), c = from.cloneNode(true);
    Object.assign(c.style, { position: 'fixed', left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px', zIndex: 35, transition: `all ${ms}ms ease-in`, pointerEvents: 'none', animation: 'none', transform: 'none', margin: 0 });
    document.body.appendChild(c);
    requestAnimationFrame(() => requestAnimationFrame(() => Object.assign(c.style, { left: b.left + 12 + 'px', top: b.top + 12 + 'px', width: '24px', height: '24px', opacity: 0.3 })));
    setTimeout(() => { c.remove(); res(); }, ms);
  });
}
const addItem = id => { if (!S.bag.includes(id)) S.bag.push(id); S.found.add(id); };
const addNote = id => { if (!S.casebook.includes(id)) S.casebook.push(id); };
function selectItem(id) {
  S.selectedItem = id;
  const c = $('#selChip'), g = $('#ghost');
  if (!id) { c.classList.add('hidden'); g.classList.add('hidden'); return; }
  c.innerHTML = `<span class="sp">${spriteImg(id)}</span><span class="tx"><b>${esc(G.items[id].name)}</b><i>${T('tapWhere')}</i></span><button class="cancel" aria-label="${T('cancel')}"><span>&times;</span>${T('cancel')}</button>`;
  $('button', c).onclick = () => { selectItem(null); toast(T('putBack')); }; c.classList.remove('hidden');
  g.innerHTML = spriteImg(id); g.classList.remove('hidden');
}
document.addEventListener('pointermove', e => { const g = $('#ghost'); g.style.left = e.clientX + 'px'; g.style.top = e.clientY + 'px'; });
document.addEventListener('pointerdown', e => {
  if (e.target.closest && e.target.closest('button,.hs') && !e.target.closest('.bell,.st,.tile,.mapnode,.shardbtn,.choice,.dish,.cell')) sfx('tap');
}, true);
document.addEventListener('pointerdown', () => { ac(); Music.start(); }, { once: true, capture: true });
document.addEventListener('pointerdown', e => { S.idleSince = Date.now(); const g = $('#ghost'); g.style.left = e.clientX + 'px'; g.style.top = e.clientY + 'px'; });
async function onHotspot(h, node) {
  if (S.busy || D.cur || S.panel || stack.length || S.paused) return;
  S.busy = true; document.body.classList.add('busy');
  try { await act(h, node); } catch (e) { console.error(e); }
  S.busy = false; document.body.classList.remove('busy');
}
async function act(h, node) {
  const r = room();
  if (h.kind === 'FIND') {
    sfx('pick'); await fly(node); addItem(h.item); addScore(C.pointsItem, 'items'); ev.emit('done:' + h.id);
    await itemCard(h.item); if (h.dialogue) await Dialogue.play(h.dialogue);
  } else if (h.kind === 'LEARN') {
    for (const p of [h.page, ...(h.extraPages || [])]) { addNote(p); refresh(); await pageCard(p, { chart: !!h.showChart && p === h.page }); }
    ev.emit('done:' + h.id);
    if (h.dialogue) await Dialogue.play(h.dialogue);
    if (h.then) await Dialogue.play(h.then);
  } else if (h.kind === 'USE') {
    if (h.thenPanel && S.done.has('done:' + h.id)) { openPanel(h.thenPanel); return; }
    if (S.selectedItem !== h.needs) {
      if (node && node.classList) { node.classList.remove('shake'); void node.offsetWidth; node.classList.add('shake'); }
      tone(140, { type: 'triangle', dur: 0.25, gain: 0.08 });
      if (S.selectedItem) toast(T('wrongTarget'));
      else if (h.locked && !S.lockSeen[h.id]) { S.lockSeen[h.id] = 1; await Dialogue.play(h.locked); }
      else toast(T('lockedToast'));
      return;
    }
    const nm = G.items[h.needs].name;
    sfx('use');
    if (h.consumes) S.bag = S.bag.filter(x => x !== h.needs);
    selectItem(null); ev.emit('done:' + h.id);
    if (h.dialogue) await Dialogue.play(h.dialogue); else if (!h.thenPanel) toast(T('itemUsed', { item: nm, target: h.label }));
    if (h.thenPanel) openPanel(h.thenPanel);
  } else if (h.kind === 'PANEL') { if (!S.done.has('done:' + h.panel)) openPanel(h.panel); }
  else if (h.kind === 'SHARD') {
    S.shardTaken[r.id] = true; sfx('shard'); await fly(node, 600); addItem(r.shard); S.shards.push(r.shard); addScore(C.pointsRoom, 'shards');
    ev.emit('done:' + h.id); await itemCard(r.shard); toast(T('wayForward'));
  } else if (h.kind === 'EXIT') { if (S.roomIndex + 1 < G.rooms.length) enterRoom(S.roomIndex + 1); }
}

/* ---------- hints ---------- */
function askHint() {
  if (D.cur || stack.length && !S.panel) return;
  if (hintsLeft() <= 0) { toast(T('noHints')); return; }
  if (S.score < C.penaltyHint) { toast(T('notEnoughEmbers')); return; }
  card(`<h2>${T('hintTitle')}</h2><p>${T('hintText', { n: C.penaltyHint })}</p>`, { buttons: [{ label: T('useHint'), primary: true, fn: useHint }, { label: T('notNow') }] });
}
function useHint() {
  if (S.score < C.penaltyHint) { toast(T('notEnoughEmbers')); return; }
  const r = room(), k = S.hintsUsed[r.id] || 0; S.hintsUsed[r.id] = k + 1;
  sfx('hint'); penalize(C.penaltyHint); refresh(); Dialogue.play(r.hints[k]);
}

/* ---------- the Book ---------- */
let bookIt = null;
function openBook(tab = 'items', top = false) {
  if (bookIt) return;
  const box = el('div', 'sheet glass');
  box.innerHTML = `<header><h2>${T('book.title')}</h2><button class="sqbtn" data-a="pause" aria-label="${T('pause')}">${icon('pause')}</button><button class="sqbtn" data-a="close" aria-label="${T('close')}">${svgIcon('close')}</button></header>
  <div class="tabs">${['items', 'notes', 'progress'].map(t => `<button class="tab" data-t="${t}">${T('book.' + t)}</button>`).join('')}</div><div class="content"></div>`;
  bookIt = layer(box, { cls: 'book' + (top ? ' top' : ''), onClose: () => { bookIt = null; } });
  $('[data-a=close]', box).onclick = () => bookIt.close();
  $('[data-a=pause]', box).onclick = openPause;
  const content = $('.content', box);
  const render = t => {
    box.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    content.innerHTML = '';
    if (t === 'items') {
      if (!S.bag.length) { content.innerHTML = `<div class="empty">${T('book.emptyItems')}</div>`; return; }
      const g = el('div', 'grid'), det = el('div', 'detail');
      if (S.selectedItem) content.appendChild(el('p', 'caption', T('book.tryTogether', { item: esc(G.items[S.selectedItem].name) })));
      const show = id => {
        g.querySelectorAll('.cell').forEach(x => x.classList.toggle('sel', x.dataset.id === id));
        const it = G.items[id];
        det.innerHTML = `<b>${esc(it.name)}</b><p>${esc(it.desc)}</p>`;
        const row = el('div', 'btns');
        if (S.selectedItem === id) row.appendChild(btn(T('book.putBack'), 'sec', () => { selectItem(null); render('items'); }));
        else row.appendChild(btn(T('book.use'), 'primary', () => { selectItem(id); bookIt.close(); }));
        det.appendChild(row);
      };
      S.bag.forEach(id => {
        const c = el('button', 'cell', `<div class="sp">${spriteImg(id)}</div>${esc(G.items[id].name)}`);
        c.dataset.id = id;
        c.onclick = () => { if (S.selectedItem && S.selectedItem !== id) tryCombine(S.selectedItem, id); else show(id); };
        g.appendChild(c);
      });
      content.append(g, det);
      show(S.selectedItem && S.bag.includes(S.selectedItem) ? S.selectedItem : S.bag[0]);
    } else if (t === 'notes') {
      const ids = [...Object.keys(G.clues), ...Object.keys(G.notes)].filter(i => S.casebook.includes(i));
      if (!ids.length) { content.innerHTML = `<div class="empty">${T('book.emptyNotes')}</div>`; return; }
      ids.forEach(id => {
        const p = G.clues[id] || G.notes[id];
        const b = el('button', 'note', `<b>${esc(p.title)}</b><span>${esc(p.clue || '')}</span><em>${T('book.roomTag', { n: p.room })}</em>`);
        b.onclick = () => pageCard(id, { saved: false, chart: id === 'C3' }); content.appendChild(b);
      });
    } else {
      const ring = el('div', 'ring');
      G.panels.heart.order.forEach(id => { ring.appendChild(el('div', 'shardslot', S.shards.includes(id) ? spriteImg(id) : '')); });
      content.appendChild(ring);
      const clues = S.casebook.filter(i => G.clues[i]).length;
      content.appendChild(el('p', 'empty', T('book.clues', { n: clues, t: Object.keys(G.clues).length })));
      const ul = el('ul', 'rlist');
      G.rooms.forEach((r, i) => { ul.appendChild(el('li', i > S.roomIndex ? 'lock' : '', `<i>${i < S.roomIndex ? '&#10003;' : i === S.roomIndex ? '&#9679;' : '&#128274;'}</i>${esc(r.name)}`)); });
      content.appendChild(ul);
      content.appendChild(el('div', 'bigscore', `${S.score}<small>${esc(C.scoreName)}</small>`));
    }
  };
  box.querySelectorAll('.tab').forEach(b => { b.onclick = () => render(b.dataset.t); });
  render(tab);
}
async function tryCombine(a, b) {
  const c = G.combines.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  if (!c || !S.bag.includes(c.a) || !S.bag.includes(c.b)) { toast(T('noCombine')); return; }
  S.bag = S.bag.filter(x => x !== c.a && x !== c.b); addItem(c.produces); selectItem(null);
  bookIt.close(); if (c.sound === 'lullaby') lullaby();
  ev.emit('done:' + c.event); await itemCard(c.produces); if (c.dialogue) await Dialogue.play(c.dialogue);
}

/* ---------- pause ---------- */
let pauseIt = null;
function openPause() {
  if (pauseIt) return;
  S.paused = true; Music.sync(); if (S.panel) S.panel.root.classList.add('paused');
  const box = el('div', 'pausebox glass');
  const sBtn = el('button', 'btn sec'), mBtn = el('button', 'btn sec');
  const lab = () => { sBtn.textContent = T('pauseMenu.sound') + ': ' + T(S.soundOn ? 'on' : 'off'); mBtn.textContent = T('pauseMenu.music') + ': ' + T(S.musicOn ? 'on' : 'off'); };
  lab();
  sBtn.onclick = () => { S.soundOn = !S.soundOn; if (!S.soundOn) Voice.stop(); lab(); };
  mBtn.onclick = () => { S.musicOn = !S.musicOn; Music.sync(); lab(); };
  const rs = el('button', 'btn primary', T('pauseMenu.resume')); rs.onclick = () => pauseIt.close();
  const cb = el('button', 'btn sec', T('pauseMenu.casebook')); cb.onclick = () => { if (bookIt) return; openBook('notes', true); };
  const rt = el('button', 'btn sec', T('pauseMenu.restart'));
  rt.onclick = () => card(`<h2>${T('pauseMenu.restartAsk')}</h2>`, { wrapCls: 'conf', buttons: [{ label: T('yes'), primary: true, fn: () => restart() }, { label: T('no') }] });
  box.appendChild(el('h2', '', T('pause'))); [rs, sBtn, mBtn, cb, rt].forEach(b => box.appendChild(b));
  Voice.pause();
  pauseIt = layer(box, { cls: 'pause', dismiss: false, keepVoice: true, onClose: () => { pauseIt = null; S.paused = false; Voice.resume(); Music.sync(); if (S.panel) S.panel.root.classList.remove('paused'); } });
  const x = el('button', 'xbtn', '&times;'); x.setAttribute('aria-label', T('close')); x.onclick = () => pauseIt.close(); box.appendChild(x); box.style.position = 'relative';
}

/* ---------- rooms ---------- */
const objectiveCard = r => {
  const o = r.objectives.find(x => !x.until || !S.done.has(x.until));
  return card(`<h2 style="color:${r.accent}">${esc(r.name)}</h2><p>${esc(o ? o.text : '')}</p><div class="rule" style="background:${r.accent}"></div>`, { buttons: [{ label: T('letsGo'), primary: true }] }).done;
};
async function enterRoom(i, first) {
  if (!first) {
    S.busy = true; sfx('whoosh'); $('#fade').classList.add('on'); await wait(320);
    await setupRoom(i); $('#fade').classList.remove('on'); await wait(320); S.busy = false;
  }
  selectItem(null); S.idleSince = Date.now();
  await Dialogue.play(G.rooms[i].enter);
  await objectiveCard(G.rooms[i]);
  if (first) S.timerOn = true;
  S.idleSince = Date.now();
}

/* ---------- start flow ---------- */
function bgScreen(id, file) {
  const s = el('div', 'screen'); s.id = id;
  const bg = el('div', 'bg'); s.appendChild(bg);
  imgOk(file).then(ok => { if (ok) bg.style.backgroundImage = `url(${file})`; else { bg.classList.add('fallback'); s.insertBefore(el('div', 'door-fb'), bg.nextSibling); } });
  document.body.appendChild(s); return s;
}
function showTitle() {
  const t = G.start.tapToStart, s = bgScreen('title', 'assets/sheets/title_art.jpg');
  s.appendChild(el('div', 'shade'));
  s.appendChild(el('div', 'inner', `<h1>${esc(t.title)}</h1><div class="rule"></div><p>${esc(t.subtitle)}</p><button class="btn primary big" aria-label="${esc(t.button)}">${esc(t.button)}</button>`));
  let go = false; const start = () => { if (go) return; go = true; ac(); Music.start(); s.remove(); showMission(); };
  s.onclick = start;
}
function showMission() {
  S.phase = 'mission'; const m = G.start.mission, s = bgScreen('mission', 'assets/sheets/briefing_bg.jpg');
  s.appendChild(el('div', 'shade'));
  s.appendChild(el('div', 'col', `<h1>${esc(m.heading)}</h1>${m.paragraphs.map(p => `<p>${esc(p)}</p>`).join('')}<button class="btn primary" aria-label="${esc(m.button)}">${esc(m.button)}</button>`));
  Voice.speak({ text: m.paragraphs.join(' '), audioFile: m.audioFile }, 'narrator');
  $('.btn', s).onclick = () => { Voice.stop(); s.remove(); startTutorial(); };
}
function startTutorial() {
  S.phase = 'tutorial';
  ['#hud', '#strip', '#bagBtn', '#hintBtn'].forEach(q => $(q).classList.remove('hidden'));
  $('#pano').style.setProperty('--blur', C.blurPx + 'px'); $('#pano').classList.add('blur');
  updateClock(); refresh();
  const steps = G.start.tutorial, root = el('div', ''); root.id = 'tut';
  const hole = el('div', 'hole'), tc = el('div', 'tcard glass'); root.append(hole, tc); document.body.appendChild(root);
  let i = 0, spark = null;
  const end = () => { root.remove(); if (spark) spark.remove(); openingNarration(); };
  const show = () => {
    const st = steps[i]; if (spark) { spark.remove(); spark = null; }
    let r;
    if (st.target === 'glowDemo') { spark = el('div', 'sparkle'); document.body.appendChild(spark); r = spark.getBoundingClientRect(); }
    else if (st.target === 'screen') r = { left: 10, top: 10, width: innerWidth - 20, height: innerHeight - 20, right: innerWidth - 10, bottom: innerHeight - 10 };
    else { const e = st.target === 'bagButton' ? $('#bagBtn') : st.target === 'pauseButton' ? $('#pauseBtn') : $('#hud'); r = e.getBoundingClientRect(); }
    const p = st.target === 'screen' ? 0 : 8;
    Object.assign(hole.style, { left: r.left - p + 'px', top: r.top - p + 'px', width: r.width + 2 * p + 'px', height: r.height + 2 * p + 'px' });
    const last = i === steps.length - 1;
    tc.innerHTML = `<h2>${esc(st.title)}</h2><p>${esc(st.text)}</p>${i === 0 ? '<div style="height:36px;position:relative"><div class="hand" style="left:calc(50% - 15px);top:3px"></div></div>' : ''}<div class="dots">${steps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div><div class="row"><button class="btn sec" data-k="skip" aria-label="${T('skip')}">${T('skip')}</button><button class="btn primary" data-k="next" aria-label="${last ? T('gotIt') : T('next')}">${last ? T('gotIt') : T('next')}</button></div>`;
    tc.firstChild; $('.dots', tc).style.alignSelf = 'center';
    const w = Math.min(300, innerWidth - 24); tc.style.width = w + 'px';
    tc.style.left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2)) + 'px';
    const below = r.top + r.height / 2 < innerHeight / 2 || st.target === 'topBar';
    tc.style.top = st.target === 'screen' ? Math.round(innerHeight / 2 - 90) + 'px' : below ? r.bottom + p + 16 + 'px' : 'auto';
    tc.style.bottom = !below && st.target !== 'screen' ? innerHeight - r.top + p + 16 + 'px' : 'auto';
    $('[data-k=skip]', tc).onclick = end; $('[data-k=next]', tc).onclick = () => { if (last) end(); else { i++; show(); } };
  };
  show();
}
async function openingNarration() {
  S.phase = 'openNarration';
  await Dialogue.play(G.start.openNarration);
  const p = $('#pano'); p.style.transition = `filter ${C.blurSharpenMs}ms ease`; p.classList.remove('blur');
  await wait(C.blurSharpenMs); p.style.transition = '';
  S.phase = 'play'; S.idleSince = Date.now();
  await enterRoom(0, true);
}

/* ---------- panel shell ---------- */
const SYM = {
  leaf: '<path d="M5 19C5 10 10 5 19 5c0 9-5 14-14 14zM5 19l8-8"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  moon: '<path d="M20 14A8 8 0 1110 4a7 7 0 0010 10z"/>', snowflake: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 4l3 2 3-2M9 20l3-2 3 2"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>', shell: '<path d="M12 20C5 20 3 14 5 10c2-4 6-6 7-6s5 2 7 6c2 4 0 10-7 10zM12 20V8M8 18l-2-8M16 18l2-8"/>',
  fish: '<path d="M3 12c4-6 11-6 14 0-3 6-10 6-14 0zM17 12l4-4v8z"/><circle cx="8" cy="11" r=".8"/>',
  hare: '<circle cx="12" cy="15" r="5"/><path d="M9 11C8 4 10 3 10.5 4S11 8 11 11M15 11c1-7-1-8-1.500-7S13 8 13 11"/><circle cx="10.500" cy="14.500" r=".6"/><circle cx="13.500" cy="14.500" r=".6"/>',
  heron: '<path d="M8 21l3-6c-3-1-3-5-1-8 1-2 4-2 5 0l5 1-5 1c0 3 1 5 3 7l-3 5"/><circle cx="12.500" cy="6.500" r=".5"/>',
  otter: '<circle cx="12" cy="13" r="6"/><circle cx="7.500" cy="8" r="1.600"/><circle cx="16.500" cy="8" r="1.600"/><path d="M10 15h4M3 14h4M21 14h-4"/><circle cx="10" cy="12" r=".6"/><circle cx="14" cy="12" r=".6"/>',
  mouse: '<circle cx="12" cy="14" r="5"/><circle cx="6.500" cy="8.500" r="2.500"/><circle cx="17.500" cy="8.500" r="2.500"/><path d="M11 16.500l1 1 1-1"/>',
  squirrel: '<circle cx="9" cy="13" r="4"/><path d="M13 20c8 0 9-12 3-14 4 3 0 8-3 9M7 9L6 5l3 2"/>',
  robin: '<path d="M5 14a7 7 0 0114 0c0 4-3 6-7 6s-7-2-7-6zM19 12l3 1-3 1"/><circle cx="9" cy="12" r=".7"/><path d="M8 16c2 2 6 2 8 0"/>',
  hedgehog: '<path d="M3 17c0-8 5-11 10-11s8 4 8 11zM5 12l-2-1M8 8L7 5M12 6V3M16 7l1-3M19 10l2-2"/><circle cx="6" cy="15" r=".7"/>'
};
const sym = n => `<svg viewBox="0 0 24 24">${SYM[n] || ''}</svg>`;
const GUEST_ANIMAL = { bram: 'heron', hale: 'otter', nell: 'hare', tilly: 'mouse', pip: 'squirrel', wren: 'robin', moss: 'hedgehog' };
const PANELS = {};
function flash() { const f = el('div', 'flash'); document.body.appendChild(f); setTimeout(() => f.remove(), 300); }
function openPanel(id) {
  if (S.panel) return;
  sfx('panel');
  const def = G.panels[id], root = el('div', 'panel');
  root.innerHTML = `<div class="phead"><h2>${esc(def.title)}</h2><button class="sqbtn" data-a="hint" aria-label="${T('hint')}">${icon('hint')}</button><button class="sqbtn" data-a="pause" aria-label="${T('pause')}">${icon('pause')}</button><button class="sqbtn" data-a="close" aria-label="${T('close')}">${svgIcon('close')}</button></div><div class="pbody"></div><div class="pfoot"></div>`;
  const ctx = { id, def, root, body: $('.pbody', root), foot: $('.pfoot', root), alive: true, locked: false };
  ctx.wrong = async () => {
    penalize(C.penaltyWrong, id); const n = S.wrongCount[id] = (S.wrongCount[id] || 0) + 1;
    flash(); tone(110, { type: 'sawtooth', dur: 0.3, gain: 0.08 }); ctx.locked = true;
    const chip = el('div', 'lockchip glass'); document.body.appendChild(chip);
    for (let k = C.lockoutSeconds; k > 0; k--) { chip.textContent = T('wait') + ' ' + Array.from({ length: C.lockoutSeconds - k + 1 }, (_, j) => C.lockoutSeconds - j).join('...'); await wait(1000); }
    chip.remove(); ctx.locked = false;
    if (def.wrong && ctx.alive) Dialogue.play(def.wrong[Math.min(n - 1, 2)]);
  };
  ctx.solved = async () => { if (!ctx.alive) return; chime(); closePanel(true); await wait(550); panelSolved(id); };
  S.panel = ctx; document.body.classList.add('has-panel');
  const it = { close: () => closePanel(false) }; ctx.it = it; stack.push(it);
  $('[data-a=close]', root).onclick = it.close; $('[data-a=pause]', root).onclick = openPause; $('[data-a=hint]', root).onclick = askHint;
  $('#app').appendChild(root); root.style.zIndex = 50; Voice.stop();
  PANELS[def.type](ctx); refresh();
}
function closePanel(solved) {
  const c = S.panel; if (!c) return;
  c.alive = false; S.panel = null; stack.splice(stack.indexOf(c.it), 1);
  document.body.classList.remove('has-panel');
  if (solved) { c.root.classList.add('closing'); setTimeout(() => c.root.remove(), 550); } else c.root.remove();
  refresh();
}
async function panelSolved(id) {
  const r = room(), step = k => { addScore(C.pointsFinalStep, 'steps'); ev.emit('done:' + k); };
  if (id === 'jigsaw') { ev.emit('done:jigsaw'); await Dialogue.play('r6_discuss_jigsaw'); return; }
  if (id === 'seal') { step('seal'); await Dialogue.play('r7_confession'); return; }
  if (id === 'heart') { step('heart'); await Dialogue.play('r7_after_heart'); return; }
  if (id === 'choice') { step('choice'); ending(); return; }
  ev.emit('done:' + id); ev.emit('roomSolved:' + r.id);
  await Dialogue.play(r.right); S.shardReady[r.id] = true; sfx('shardAppear'); refresh();
}
const btn = (label, cls, fn) => { const b = el('button', 'btn ' + cls, esc(label)); b.setAttribute('aria-label', label); b.onclick = fn; return b; };

/* bells: the five bells change places every round, so the player must follow the symbol and its note, not the position */
PANELS.bells = ctx => {
  const d = ctx.def, st = S.ps.bells || (S.ps.bells = { round: 0, layout: {} });
  ctx.body.innerHTML = '<div class="rnd"></div><p class="status"></p><div class="bells"></div><div class="pdots"></div>';
  const rnd = $('.rnd', ctx.body), status = $('.status', ctx.body), row = $('.bells', ctx.body), dots = $('.pdots', ctx.body);
  const els = {};
  let input = [], live = false, token = 0;
  const pat = () => d.rounds[st.round];
  const arrange = () => {
    if (!st.layout[st.round]) { // a new order each round that never matches the previous one
      let o; const prev = st.layout[st.round - 1] || d.symbols;
      do { o = [...d.symbols].sort(() => Math.random() - 0.5); } while (o.some((x, i) => x === prev[i]) && d.symbols.length > 2);
      st.layout[st.round] = o;
    }
    row.innerHTML = '';
    st.layout[st.round].forEach(sy => {
      const b = el('button', 'bell curve', `<div class="dome">${sym(sy)}</div><div class="clap"></div>`); b.setAttribute('aria-label', sy); b.onclick = () => tap(sy);
      els[sy] = b; row.appendChild(b);
    });
  };
  const light = async (sy, cls, ms) => { els[sy].classList.add(cls); if (cls === 'lit') bellNote(d.freqHz[d.symbols.indexOf(sy)]); await wait(ms); els[sy].classList.remove(cls); };
  const draw = () => { rnd.textContent = T('bells.round', { n: st.round + 1, t: d.rounds.length }); dots.innerHTML = pat().map((_, k) => `<i class="${k < input.length ? 'on' : ''}"></i>`).join(''); };
  async function demo() {
    const my = ++token; live = false; input = []; arrange(); draw(); status.textContent = T('bells.watch'); await wait(700);
    for (const sy of pat()) { if (!ctx.alive || my !== token) return; await light(sy, 'lit', 450); await wait(250); }
    if (!ctx.alive || my !== token) return; status.textContent = T('bells.turn'); live = true;
  }
  async function tap(sy) {
    if (!live || ctx.locked) return;
    const p = pat();
    if (p[input.length] !== sy) { live = false; light(sy, 'bad', 700); await ctx.wrong(); if (ctx.alive) demo(); return; }
    input.push(sy); light(sy, 'lit', 300); draw();
    if (input.length === p.length) { live = false; await wait(700); if (!ctx.alive) return; st.round++; if (st.round >= d.rounds.length) { st.round = d.rounds.length - 1; ctx.solved(); } else demo(); }
  }
  ctx.foot.appendChild(btn(T('bells.again'), 'sec', () => { if (!ctx.locked) demo(); }));
  demo();
};

/* mirrors */
PANELS.mirrors = ctx => {
  const d = ctx.def, N = d.size, st = S.ps.mirrors || (S.ps.mirrors = { ...Object.fromEntries(Object.keys(d.mirrors).map(k => [k, d.start])) });
  const at = (r, c) => Object.entries(d.mirrors).find(([, p]) => p[0] === r && p[1] === c);
  const ice = (r, c) => d.ice.some(p => p[0] === r && p[1] === c);
  let s = `<svg class="grid5" viewBox="-1 -0.7 7 6.2" role="img" aria-label="${T('mirrors.caption')}">`;
  for (let r = 1; r <= N; r++) for (let c = 1; c <= N; c++) s += `<rect x="${c - 1}" y="${r - 1}" width="1" height="1" fill="#14224A" stroke="rgba(170,200,255,.35)" stroke-width=".03"/>`;
  for (let k = 1; k <= N; k++) s += `<text x="${k - 0.5}" y="-0.25" fill="#A9B9D6" font-size=".28" text-anchor="middle">${k}</text><text x="-0.2" y="${k - 0.4}" fill="#A9B9D6" font-size=".28" text-anchor="end">${k}</text>`;
  d.ice.forEach(([r, c]) => { s += `<rect x="${c - 0.9}" y="${r - 0.9}" width=".8" height=".8" rx=".1" fill="#cfe8fb" stroke="#fff" stroke-width=".04"/><path d="M${c - 0.8} ${r - 0.3}l.3-.3.2.2.3-.3" stroke="#8fb8d8" stroke-width=".04" fill="none"/>`; });
  s += `<circle cx="-0.55" cy="${d.sourceRow - 0.5}" r=".3" fill="#ffd98a"/><path d="M-0.3 ${d.sourceRow - 0.5}H0" stroke="#F2B134" stroke-width=".08"/><circle id="lamp" cx="${N + 0.55}" cy="${d.lampRow - 0.5}" r=".3" fill="#2a2f3f" stroke="#8c6a30" stroke-width=".05"/>`;
  Object.entries(d.mirrors).forEach(([k, [r, c]]) => {
    s += `<g class="mirror" data-k="${k}"><rect x="${c - 1}" y="${r - 1}" width="1" height="1" fill="rgba(143,200,255,.12)"/><line class="bar" x1="${c - 0.8}" y1="${r - 0.2}" x2="${c - 0.2}" y2="${r - 0.8}" stroke="#bfe6ff" stroke-width=".12" stroke-linecap="round" style="transform:rotate(${st[k] === '/' ? 0 : 90}deg)"/><text x="${c - 0.88}" y="${r - 0.75}" fill="#F2B134" font-size=".2">${k}</text></g>`;
  });
  s += '<polyline id="beam" fill="none" stroke="#F2B134" stroke-width=".1" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 .08px #F2B134)"/></svg>';
  ctx.body.innerHTML = `<div class="sq">${s}<p class="caption">${T('mirrors.caption')}</p></div>`;
  const svg = $('svg', ctx.body), beam = $('#beam', svg);
  svg.querySelectorAll('.mirror').forEach(g => g.onclick = () => {
    if (ctx.locked || ctx.busy) return; const k = g.dataset.k; st[k] = st[k] === '/' ? '\\' : '/';
    $('.bar', g).style.transform = `rotate(${st[k] === '/' ? 0 : 90}deg)`; tone(880, { dur: 0.15, gain: 0.05 }); beam.setAttribute('points', '');
  });
  function trace() {
    let r = d.sourceRow, c = 1, dr = 0, dc = 1; const pts = [[0, r - 0.5]];
    for (let n = 0; n < 80; n++) {
      if (c < 1 || c > N || r < 1 || r > N) { const pr = r - dr, pc = c - dc; pts.push([pc - 0.5 + dc * 0.5, pr - 0.5 + dr * 0.5]); return { pts, ok: dc === 1 && pr === d.lampRow && pc === N }; }
      if (ice(r, c)) { pts.push([c - 0.5 - dc * 0.5, r - 0.5 - dr * 0.5]); return { pts, ok: false }; }
      const m = at(r, c);
      if (m) { pts.push([c - 0.5, r - 0.5]); [dr, dc] = st[m[0]] === '/' ? [-dc, -dr] : [dc, dr]; }
      r += dr; c += dc;
    }
    return { pts, ok: false };
  }
  ctx.foot.appendChild(btn(d.button, 'primary', async () => {
    if (ctx.locked || ctx.busy) return; ctx.busy = true;
    const { pts, ok } = trace(); beam.setAttribute('points', pts.map(p => p.join(',')).join(' '));
    const len = beam.getTotalLength(); beam.style.transition = 'none'; beam.style.strokeDasharray = len; beam.style.strokeDashoffset = len; void beam.getBoundingClientRect();
    beam.style.transition = `stroke-dashoffset ${len * 70}ms linear`; beam.style.strokeDashoffset = 0; tone(330, { dur: len * 0.07, gain: 0.05, type: 'triangle' });
    await wait(len * 70 + 100); ctx.busy = false; if (!ctx.alive) return;
    if (ok) { $('#lamp', svg).setAttribute('fill', '#F2B134'); ctx.solved(); } else { await ctx.wrong(); beam.setAttribute('points', ''); }
  }));
};

/* guests */
PANELS.guests = ctx => {
  const d = ctx.def, st = S.ps.guests || (S.ps.guests = { placed: {} });
  let sel = null, bad = new Set();
  const gl = (d.guestOrder || d.guests.map(g => g.id)).map(id => d.guests.find(g => g.id === id)), dl = d.dishOrder || Object.keys(d.dishes);
  ctx.body.innerHTML = '<div class="gwrap"><div class="glist"></div><div class="tray"></div></div>';
  const list = $('.glist', ctx.body), tray = $('.tray', ctx.body);
  const left = k => d.dishes[k].servings - Object.values(st.placed).filter(x => x === k).length;
  const serve = btn(d.button, 'primary', async () => {
    if (ctx.locked) return;
    bad = new Set(d.guests.filter(g => st.placed[g.id] !== g.answer).map(g => g.id));
    if (!bad.size) { ctx.solved(); return; }
    render(); list.querySelectorAll('.gcard.bad').forEach(c => c.classList.add('shake')); await ctx.wrong();
  });
  ctx.foot.append(btn(T('chartBtn'), 'sec', () => pageCard('C3', { saved: false, chart: true })), serve);
  function place(gid, k) { if (left(k) <= 0 && st.placed[gid] !== k) return; st.placed[gid] = k; sel = null; bad.clear(); tone(520, { dur: 0.15, gain: 0.08 }); render(); }
  function render() {
    list.innerHTML = '';
    gl.forEach(g => {
      const k = st.placed[g.id], c = el('div', 'gcard' + (bad.has(g.id) ? ' bad' : ''), `<div class="av">${sym(GUEST_ANIMAL[g.id])}</div><div class="tx"><b>${esc(g.name)}</b><i>${esc(g.says)}</i></div><div class="dz${k ? ' has' : ''}">${k ? esc(d.dishes[k].name) : T('guests.drop')}</div>`);
      c.dataset.g = g.id; c.setAttribute('role', 'button');
      c.onclick = () => { if (ctx.locked) return; if (sel) place(g.id, sel); else if (k) { delete st.placed[g.id]; bad.clear(); render(); } };
      list.appendChild(c);
    });
    tray.innerHTML = '';
    dl.map(k => [k, d.dishes[k]]).forEach(([k, x]) => {
      const n = left(k), b = el('button', 'dish' + (sel === k ? ' sel' : '') + (n <= 0 ? ' zero' : ''), `<span class="ds"></span>${esc(x.name)}<span class="left">x${n}</span>`);
      b.setAttribute('aria-label', x.name);
      let sx, sy, ghost = null;
      b.onpointerdown = e => { if (ctx.locked || n <= 0) return; sx = e.clientX; sy = e.clientY; b.setPointerCapture(e.pointerId); };
      b.onpointermove = e => {
        if (sx == null) return;
        if (!ghost && Math.hypot(e.clientX - sx, e.clientY - sy) > 8) { ghost = el('div', 'dish', esc(x.name)); ghost.style.cssText = 'position:fixed;z-index:90;pointer-events:none;transform:translate(-50%,-50%)'; document.body.appendChild(ghost); }
        if (ghost) { ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px'; list.querySelectorAll('.gcard').forEach(c => { const r = c.getBoundingClientRect(); c.classList.toggle('over', e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom); }); }
      };
      b.onpointerup = e => {
        if (sx == null) return; sx = null;
        if (ghost) { ghost.remove(); const t = [...list.querySelectorAll('.gcard')].find(c => { const r = c.getBoundingClientRect(); return e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom; }); ghost = null; if (t) place(t.dataset.g, k); else render(); }
        else { sel = sel === k ? null : k; render(); }
      };
      tray.appendChild(b);
    });
    serve.disabled = d.guests.some(g => !st.placed[g.id]);
  }
  render();
};

/* fauns */
const STATUE = { bells: '<path d="M8 6h8l1 8H7zM12 14v3"/>', lyre: '<path d="M7 5c-3 8 0 13 5 13s8-5 5-13M12 5v13M9 8v8M15 8v8"/>', flute: '<path d="M3 15L21 9M5 14l1-3M9 12.500l1-3"/>', drum: '<ellipse cx="12" cy="9" rx="8" ry="3"/><path d="M4 9v7c0 2 8 3 8 3s8-1 8-3V9"/>', horn: '<path d="M3 14c6 0 9-1 13-6l5 1-1 6c-3 4-9 5-17 4z"/>' };
const statueSVG = (id, woken) => `<svg viewBox="0 0 80 120"><path d="M16 118V62q0-22 24-22t24 22v56z" fill="${woken ? '#c58a54' : '#bfe0f5'}" stroke="${woken ? '#f2b134' : '#eaf6ff'}" stroke-width="2" class="${woken ? '' : 'ice'}"/><circle cx="40" cy="26" r="14" fill="${woken ? '#d9a06a' : '#d4ecfa'}" stroke="${woken ? '#f2b134' : '#eaf6ff'}" stroke-width="2"/>${id === 'horn' ? '<path d="M30 16q10-22 30-12-8 4-18 14z" fill="#d94a4a"/>' : ''}${id === 'flute' ? '<path d="M32 36q8 14 16 0" fill="#eee"/>' : ''}<g transform="translate(24 62) scale(1.35)" fill="none" stroke="${woken ? '#3b2508' : '#14305a'}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${STATUE[id]}</g></svg>`;
PANELS.fauns = ctx => {
  const d = ctx.def, st = S.ps.fauns || (S.ps.fauns = { woken: [] }), notes = { bells: 784, lyre: 659, flute: 587, drum: 262, horn: 392 };
  ctx.body.innerHTML = `<div class="arc"></div><div class="slots5"></div><p class="caption">${T('fauns.caption')}</p>`;
  const arc = $('.arc', ctx.body), slots = $('.slots5', ctx.body);
  function render() {
    arc.innerHTML = ''; slots.innerHTML = '';
    d.statues.forEach(s => {
      const w = st.woken.includes(s.id), c = el('div', 'stat', `<button class="st" aria-label="${esc(s.name)}">${statueSVG(s.id, w)}</button><div class="nm">${esc(s.name.split(' ')[0])}</div><button class="cnt" aria-label="${T('fauns.count')} ${esc(s.name)}">&#127827; ${T('fauns.count')}</button>`);
      $('.st', c).onclick = () => hit(s.id, c); $('.cnt', c).onclick = () => showCount(s); arc.appendChild(c);
    });
    for (let i = 0; i < d.solution.length; i++) slots.appendChild(el('i', st.woken[i] ? 'on' : '', st.woken[i] ? i + 1 : i + 1));
  }
  async function hit(id, c) {
    if (ctx.locked || st.woken.includes(id)) return;
    if (d.solution[st.woken.length] === id) { st.woken.push(id); tone(notes[id], { dur: 0.7, gain: 0.2 }); render(); if (st.woken.length === d.solution.length) ctx.solved(); return; }
    $('.st', c).classList.add('shake'); st.woken = []; await ctx.wrong(); if (ctx.alive) render();
  }
  let cc = null;
  function showCount(s) {
    if (cc) cc.remove();
    let b = ''; for (let i = 0; i < s.berries; i++) { const a = i / s.berries * Math.PI * 2 - Math.PI / 2; b += `<circle cx="${50 + 30 * Math.cos(a)}" cy="${50 + 30 * Math.sin(a)}" r="9" fill="#c9302c" stroke="#ff9a8a" stroke-width="2"/>`; }
    cc = el('div', 'countcard glass', `<svg viewBox="0 0 100 100" width="150" height="150"><circle cx="50" cy="50" r="30" fill="none" stroke="#2F5D50" stroke-width="5"/>${b}</svg><span class="caption">${esc(s.name.split(' ')[0])}</span>`);
    document.body.appendChild(cc); const mine = cc; mine.onclick = () => mine.remove(); wait(3000).then(() => mine.remove());
    ctx.root.addEventListener('remove', () => mine.remove());
    const chk = setInterval(() => { if (!ctx.alive) { mine.remove(); clearInterval(chk); } }, 200);
  }
  render();
};

/* tiles */
PANELS.tiles = ctx => {
  const d = ctx.def, st = S.ps.tiles || (S.ps.tiles = { k: 0 }), cols = d.columns;
  const path = d.solution.map(s => ({ c: cols.indexOf(s[0]), r: +s[1] }));
  let h = `<div class="sq" style="position:relative"><div class="compass">&#9728; ${T('tiles.east')} &nbsp;&middot;&nbsp; &#9790; ${T('tiles.west')} &nbsp;&middot;&nbsp; &uarr; ${T('tiles.north')}</div><div class="tgrid" style="position:relative;margin-top:8px">`;
  for (let r = 5; r >= 1; r--) { h += `<div class="tlab">${r}</div>`; for (let c = 0; c < 5; c++) h += `<button class="tile" data-r="${r}" data-c="${c}" aria-label="${cols[c]}${r}">${sym(d.rowsTopToBottom[5 - r][c])}</button>`; }
  h += '<div></div>' + [...cols].map(l => `<div class="tlab shore">${l}</div>`).join('') + `<div class="token"></div></div><p class="caption">${T('tiles.caption')}</p></div>`;
  ctx.body.innerHTML = h;
  const grid = $('.tgrid', ctx.body), token = $('.token', grid), tiles = [...grid.querySelectorAll('.tile')];
  const tileAt = (r, c) => tiles.find(t => +t.dataset.r === r && +t.dataset.c === c);
  const place = e => { const g = grid.getBoundingClientRect(), r = e.getBoundingClientRect(); token.style.left = r.left - g.left + r.width / 2 - 15 + 'px'; token.style.top = r.top - g.top + r.height / 2 - 15 + 'px'; };
  const shore = () => place($('.shore:nth-of-type(3)', grid) || grid.lastElementChild);
  const lastShore = () => [...grid.querySelectorAll('.shore')][2];
  requestAnimationFrame(() => { st.k ? (tiles.forEach(t => { if (path.slice(0, st.k).some(p => p.r === +t.dataset.r && p.c === +t.dataset.c)) t.classList.add('ok'); }), place(tileAt(path[st.k - 1].r, path[st.k - 1].c))) : place(lastShore()); });
  tiles.forEach(t => t.onclick = async () => {
    if (ctx.locked) return; const r = +t.dataset.r, c = +t.dataset.c, prev = st.k ? path[st.k - 1] : { r: 0, c };
    if (r !== prev.r + 1 || Math.abs(c - prev.c) > 1 && st.k) { t.classList.add('shake'); setTimeout(() => t.classList.remove('shake'), 260); return; }
    const want = path[st.k];
    if (want.r === r && want.c === c) { st.k++; t.classList.add('ok'); place(t); tone(500 + st.k * 80, { dur: 0.3, gain: 0.1 }); if (st.k === path.length) ctx.solved(); }
    else { t.classList.add('crack'); place(lastShore()); st.k = 0; await ctx.wrong(); tiles.forEach(x => x.classList.remove('crack', 'ok')); }
  });
  ctx.foot.appendChild(btn(T('tiles.poem'), 'sec', () => pageCard('N_warden', { saved: false })));
};

/* jigsaw */
PANELS.jigsaw = async ctx => {
  const d = ctx.def, st = S.ps.jigsaw || (S.ps.jigsaw = { placed: [], order: [...Array(9).keys()].sort(() => Math.random() - 0.5) });
  const ok = await imgOk(d.image); if (!ctx.alive) return;
  const fw = Math.min(innerWidth * 0.92, 520, (innerHeight - 160) * 0.95 / 1.45 * 1.5), fh = fw * 2 / 3, pw = fw / 3, ph = fh / 3, sc = 0.5, gap = 6;
  const trayY = fh + 16, perRow = 5, th = 2 * (ph * sc + gap);
  ctx.body.innerHTML = `<div class="jwrap" style="position:relative;width:${fw}px;height:${trayY + th}px"><div class="jframe" style="width:${fw}px;position:absolute;left:0;top:0"></div></div>`;
  const wrap = $('.jwrap', ctx.body), frame = $('.jframe', wrap);
  for (let i = 0; i < 9; i++) { const s = el('div', 'jslot'); Object.assign(s.style, { left: (i % 3) * pw + 'px', top: Math.floor(i / 3) * ph + 'px', width: pw + 'px', height: ph + 'px' }); frame.appendChild(s); }
  const pieces = [];
  const look = (p, i, s) => {
    const c = i % 3, r = Math.floor(i / 3); p.style.width = pw * s + 'px'; p.style.height = ph * s + 'px';
    if (ok) { p.style.backgroundImage = `url(${d.image})`; p.style.backgroundSize = `${fw * s}px ${fh * s}px`; p.style.backgroundPosition = `${-c * pw * s}px ${-r * ph * s}px`; }
    else { p.style.background = `linear-gradient(135deg,hsl(${i * 40} 45% 38%),hsl(${i * 40 + 30} 50% 22%))`; p.textContent = i + 1; p.style.fontSize = 28 * s + 'px'; }
  };
  const trayPos = k => [(k % perRow) * (pw * sc + gap), trayY + Math.floor(k / perRow) * (ph * sc + gap)];
  let tk = 0;
  st.order.forEach(i => {
    const p = el('div', 'jpiece'); wrap.appendChild(p); pieces[i] = p;
    if (st.placed.includes(i)) { look(p, i, 1); p.style.left = (i % 3) * pw + 'px'; p.style.top = Math.floor(i / 3) * ph + 'px'; p.classList.add('placed'); p.style.zIndex = 1; return; }
    const home = trayPos(tk++); look(p, i, sc); p.style.left = home[0] + 'px'; p.style.top = home[1] + 'px'; p.style.transition = 'left .2s,top .2s';
    let drag = false;
    p.onpointerdown = e => { if (ctx.locked) return; drag = true; p.setPointerCapture(e.pointerId); p.style.transition = 'none'; look(p, i, 1); p.style.zIndex = 20; move(e); };
    const move = e => { const r = wrap.getBoundingClientRect(); p.style.left = e.clientX - r.left - pw / 2 + 'px'; p.style.top = e.clientY - r.top - ph / 2 + 'px'; };
    p.onpointermove = e => { if (drag) move(e); };
    p.onpointerup = async () => {
      if (!drag) return; drag = false; const x = parseFloat(p.style.left), y = parseFloat(p.style.top), tx = (i % 3) * pw, ty = Math.floor(i / 3) * ph;
      if (Math.hypot(x - tx, y - ty) <= d.snapPx) {
        p.style.left = tx + 'px'; p.style.top = ty + 'px'; p.classList.add('placed'); p.style.zIndex = 1; p.onpointerdown = null; st.placed.push(i); tone(700, { dur: 0.12, gain: 0.1 });
        if (st.placed.length === 9) { frame.classList.add('done'); await wait(800); ctx.solved(); }
      } else { p.style.transition = 'left .2s,top .2s'; look(p, i, sc); p.style.left = home[0] + 'px'; p.style.top = home[1] + 'px'; p.style.zIndex = ''; }
    };
  });
};

/* route */
PANELS.route = ctx => {
  const d = ctx.def, st = S.ps.route || (S.ps.route = { route: ['door'] });
  const edge = (a, b) => d.edges.some(e => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a));
  ctx.body.innerHTML = '<div class="mapwrap"><svg viewBox="0 0 100 100" preserveAspectRatio="none"></svg></div><p class="yroute"></p>';
  const map = $('.mapwrap', ctx.body), svg = $('svg', map), yr = $('.yroute', ctx.body);
  imgOk('assets/sheets/mural.jpg').then(o => { if (o) map.style.backgroundImage = 'url(assets/sheets/mural.jpg)'; });
  const nodes = {};
  Object.entries(d.nodes).forEach(([id, [name, x, y]]) => {
    const n = el('button', 'mapnode', `<i></i><span>${esc(name)}</span>`); n.style.left = x * 100 + '%'; n.style.top = y * 100 + '%'; n.setAttribute('aria-label', name);
    n.onclick = () => tap(id, n); map.appendChild(n); nodes[id] = n;
  });
  const set = btn(d.button, 'primary', go), clr = btn(d.clear, 'sec', () => { st.route = ['door']; render(); });
  ctx.foot.append(btn(T('route.rhymes'), 'sec', () => pageCard('N_route', { saved: false })), clr, set);
  function render(color) {
    const P = id => d.nodes[id].slice(1).map(v => v * 100);
    svg.innerHTML = d.edges.map(([a, b]) => `<line x1="${P(a)[0]}" y1="${P(a)[1]}" x2="${P(b)[0]}" y2="${P(b)[1]}" stroke="rgba(234,242,255,.4)" stroke-width="1"/>`).join('') +
      st.route.slice(1).map((id, k) => `<line x1="${P(st.route[k])[0]}" y1="${P(st.route[k])[1]}" x2="${P(id)[0]}" y2="${P(id)[1]}" stroke="${color || '#F2B134'}" stroke-width="2.2" stroke-linecap="round"/>`).join('');
    Object.entries(nodes).forEach(([id, n]) => n.classList.toggle('on', st.route.includes(id)));
    yr.textContent = T('route.yours') + ' ' + st.route.map(id => d.nodes[id][0]).join(' > ');
    set.disabled = st.route[st.route.length - 1] !== 'palace';
  }
  function tap(id, n) {
    if (ctx.locked) return; const last = st.route[st.route.length - 1];
    if (id === last && st.route.length > 1) st.route.pop();
    else if (!st.route.includes(id) && edge(last, id)) st.route.push(id);
    else { n.classList.add('shake'); setTimeout(() => n.classList.remove('shake'), 260); return; }
    tone(600, { dur: 0.1, gain: 0.08 }); render();
  }
  async function go() {
    if (ctx.locked) return;
    if (st.route.join() === d.solution.join()) { render('#ffd36a'); ctx.solved(); return; }
    render('#E0563F'); await ctx.wrong(); st.route = ['door']; if (ctx.alive) render();
  }
  render();
};

/* seal */
PANELS.seal = ctx => {
  const d = ctx.def, st = S.ps.seal || (S.ps.seal = { q: 0 });
  ctx.body.innerHTML = '<div class="seal">&#10052;</div><div class="pdots"></div><div class="qtext"></div><div class="choices"></div>';
  const dots = $('.pdots', ctx.body), q = $('.qtext', ctx.body), ch = $('.choices', ctx.body);
  ctx.foot.appendChild(btn(T('pauseMenu.casebook'), 'sec', () => openBook('notes')));
  function render() {
    const Q = d.questions[st.q]; dots.innerHTML = d.questions.map((_, k) => `<i class="${k < st.q ? 'on' : ''}"></i>`).join(''); q.textContent = Q.q; ch.innerHTML = '';
    Q.choices.forEach((t, i) => {
      const b = el('button', 'choice', esc(t));
      b.onclick = async () => {
        if (ctx.locked) return;
        if (i === Q.answer) { b.classList.add('good'); tone(660, { dur: 0.4, gain: 0.15 }); await wait(600); if (!ctx.alive) return; st.q++; if (st.q >= d.questions.length) { $('.seal', ctx.body).classList.add('melt'); st.q = d.questions.length - 1; await wait(700); ctx.solved(); } else render(); }
        else { b.classList.add('gone'); b.disabled = true; ctx.wrong(); }
      }; ch.appendChild(b);
    });
  }
  render();
};

/* heart: three chances. Every wrong shard lets more frost in; the third one freezes the Heart and the run is lost. */
function noise(dur, type, f, gain) {
  const a = ac(); if (!a || !S.soundOn) return;
  const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf; fl.type = type; fl.frequency.value = f; g.gain.value = gain * 0.45; src.connect(fl); fl.connect(g); g.connect(a.destination); src.start();
}
const sfxCrack = () => { noise(0.25, 'highpass', 3000, 0.5); tone(1800, { dur: 0.15, gain: 0.1, type: 'triangle' }); };
const sfxRumble = () => { tone(70, { dur: 1.2, gain: 0.3, type: 'sawtooth' }); tone(48, { dur: 1.5, gain: 0.3 }); noise(0.8, 'lowpass', 400, 0.6); };
const sfxShatter = () => { noise(0.9, 'highpass', 2000, 0.7); [1400, 1900, 2600, 3300].forEach((f, i) => setTimeout(() => tone(f, { dur: 0.6, gain: 0.1, type: 'triangle' }), i * 70)); sfxRumble(); };
// ice fracture: radial cracks from an impact point that thin toward the tips, with side branches and web rings; drawn outward from the impact
function crackSVG(level, animate) {
  const W = innerWidth, H = innerHeight, diag = Math.hypot(W, H), P = [];
  const hit = (cx, cy, R, n) => {
    const nodes = [];
    for (let k = 0; k < n; k++) {
      let ang = (k / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5, x = cx, y = cy;
      const steps = 9, L = R * (0.65 + Math.random() * 0.5), ring = [];
      for (let i = 0; i < steps; i++) {
        const t = i / steps, len = (L / steps) * (0.7 + Math.random() * 0.6);
        ang += (Math.random() - 0.5) * 0.38; const nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
        P.push([x, y, nx, ny, Math.max(0.7, 3 * (1 - t) * (1 - t) + 0.6), Math.hypot(nx - cx, ny - cy) / diag]);
        if (i >= 2 && Math.random() < 0.4) { // side branch, thin and short
          let ba = ang + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5), bx = nx, by = ny;
          for (let j = 0; j < 3; j++) { const bl = (L / steps) * (0.5 - j * 0.1), ex = bx + Math.cos(ba) * bl, ey = by + Math.sin(ba) * bl; P.push([bx, by, ex, ey, Math.max(0.5, 1.4 - j * 0.4), Math.hypot(ex - cx, ey - cy) / diag]); bx = ex; by = ey; ba += (Math.random() - 0.5) * 0.5; }
        }
        x = nx; y = ny; ring.push([x, y]);
      }
      nodes.push(ring);
    }
    if (level >= 2) for (const si of [2, 5]) for (let k = 0; k < n; k++) { // web rings between neighbouring cracks
      if (Math.random() < 0.25) continue; const p = nodes[k][si], q = nodes[(k + 1) % n][si];
      P.push([p[0], p[1], q[0], q[1], 0.9, Math.hypot(p[0] - cx, p[1] - cy) / diag + 0.03]);
    }
  };
  const cx = W / 2 + (Math.random() - 0.5) * W * 0.1, cy = H * 0.42;
  hit(cx, cy, diag * (level >= 3 ? 0.8 : 0.42), level >= 3 ? 13 : 8);
  if (level >= 3) hit(W * (0.2 + Math.random() * 0.6), H * (0.65 + Math.random() * 0.2), diag * 0.35, 7);
  const lines = P.map(([x1, y1, x2, y2, w, d]) => `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" pathLength="1" stroke-width="${w.toFixed(2)}" style="animation-delay:${animate ? Math.round(d * 900) : 0}ms"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs><radialGradient id="cg"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#9fd4ff" stop-opacity="0"/></radialGradient></defs><circle cx="${cx}" cy="${cy}" r="${level >= 3 ? 70 : 38}" fill="url(#cg)"/>${lines}</svg>`;
}
function addCracks(host, level, animate = true) {
  const old = host.querySelector('.fx-cracks'); if (old) old.remove();
  const c = el('div', 'fx-cracks' + (animate ? '' : ' static'), crackSVG(level, animate));
  host.appendChild(c); return c;
}
PANELS.heart = ctx => {
  const d = ctx.def, MAX = 3, st = S.ps.heart || (S.ps.heart = { placed: [], errors: 0 });
  const pos = i => { const a = i / 6 * Math.PI * 2 - Math.PI / 2; return [100 + 62 * Math.cos(a), 110 + 62 * Math.sin(a)]; };
  ctx.body.innerHTML = '<div class="chances"></div><p class="status"></p><svg class="hsvg" viewBox="0 0 200 220"></svg><div class="shardrow"></div>';
  const svg = $('svg', ctx.body), row = $('.shardrow', ctx.body), ch = $('.chances', ctx.body), status = $('.status', ctx.body);
  status.textContent = T('heart.warn'); ctx.root.dataset.frost = st.errors; if (st.errors > 1) addCracks(ctx.root, 2, false);
  ctx.foot.appendChild(btn(T('heart.rhyme'), 'sec', () => pageCard('N_heart', { saved: false })));
  const chances = () => { ch.setAttribute('aria-label', T('heart.chances') + ' ' + (MAX - st.errors)); ch.innerHTML = Array.from({ length: MAX }, (_, i) => `<i class="${i < MAX - st.errors ? '' : 'out'}"></i>`).join(''); };
  async function hurt(btn0) {
    st.errors++; st.placed = []; penalize(C.penaltyWrong, 'heart'); const lv = st.errors, root = ctx.root;
    ctx.locked = true; chances();
    const fl = el('div', 'fx-flash lv' + lv); document.body.appendChild(fl); setTimeout(() => fl.remove(), 1200);
    root.classList.remove('fxshake', 's1', 's2', 's3'); void root.offsetWidth; root.classList.add('fxshake', 's' + lv); root.dataset.frost = lv;
    if (lv === 1) { sfxCrack(); svg.classList.add('cold'); }
    if (lv === 2) { sfxCrack(); setTimeout(sfxRumble, 150); addCracks(root, 2); svg.classList.add('cold'); }
    if (lv < MAX) {
      render(); await wait(700); ctx.locked = false;
      if (ctx.alive) Dialogue.play(d.wrong[lv - 1]);
      return;
    }
    // third error: the Heart shatters, the frost closes in from the edges, the run is lost
    sfxShatter(); addCracks(root, 3); svg.classList.add('shatter');
    row.querySelectorAll('.shardbtn').forEach(b => { b.style.transition = 'transform 1.2s ease-in,opacity 1.2s'; b.style.transform = `translate(${(Math.random() - 0.5) * 300}px,${-80 - Math.random() * 300}px) rotate(${(Math.random() - 0.5) * 540}deg)`; b.style.opacity = 0; });
    await wait(500);
    const ir = el('div', 'fx-freeze' + (window.CSS && CSS.registerProperty ? '' : ' plain')); document.body.appendChild(ir);
    const tt = el('div', 'fx-title', T('heart.lost')); document.body.appendChild(tt);
    await wait(3200); ir.remove(); tt.remove(); heartLost();
  }
  function render() {
    chances();
    let s = '<path d="M60 20h80l42 30v110l-42 40H60l-42-40V50z" fill="#14224A" stroke="#B98A3E" stroke-width="4"/><path d="M85 10h30M100 10V0" stroke="#B98A3E" stroke-width="4"/>';
    d.order.forEach((id, i) => { const [x, y] = pos(i), on = st.placed.includes(id); s += `<circle cx="${x}" cy="${y}" r="15" fill="${on ? SHARD_COLOR[id] : '#070d20'}" stroke="${on ? '#fff' : '#B98A3E'}" stroke-width="2" style="${on ? 'filter:drop-shadow(0 0 8px ' + SHARD_COLOR[id] + ')' : ''}"/>`; });
    s += `<circle cx="100" cy="110" r="13" fill="#05070f" stroke="#555" stroke-width="2"/>`; svg.innerHTML = s;
    row.innerHTML = '';
    (d.shardOrder || d.order).forEach(id => {
      const b = el('button', 'shardbtn' + (st.placed.includes(id) ? ' used' : ''), spriteImg(id) + `<span class="snm">${esc(G.items[id].name.replace(' Shard', ''))}</span>`); b.setAttribute('aria-label', G.items[id].name);
      b.onclick = async () => {
        if (ctx.locked) return;
        if (d.order[st.placed.length] === id) { st.placed.push(id); tone(500 + st.placed.length * 90, { dur: 0.5, gain: 0.15 }); render(); if (st.placed.length === d.order.length) { await wait(500); ctx.solved(); } }
        else hurt(b);
      }; row.appendChild(b);
    });
    if (!S.shards.length && !DEBUG) row.innerHTML = '';
  }
  render();
};
function heartLost() {
  sfx('lose');
  S.phase = 'lost'; S.timerOn = false; S.ended = true; closeAll(); Voice.stop();
  const t = G.endScreens.heartFail, sc = el('div', 'endscr frostscr'); document.body.appendChild(sc);
  sc.innerHTML += `<div class="endcard glass"><h1>${esc(t.title)}</h1><p>${esc(t.line)}</p><div class="total">${S.score}</div><div>${esc(C.scoreName)}</div></div>`;
  $('.endcard', sc).appendChild(btn(t.button, 'primary', () => restart()));
}

/* choice */
PANELS.choice = ctx => {
  const d = ctx.def, rb = G.characters.rook.busts.hopeful;
  ctx.body.innerHTML = `${rb ? `<img class="rookbust" data-fb="bust:rook" src="${rb}" alt="Rook">` : ''}<div class="insc">${esc(d.inscription)}</div><div class="choices"></div>`;
  d.choices.forEach(c => {
    const b = el('button', 'choice', esc(c.label));
    b.onclick = () => { if (ctx.locked) return; if (c.correct) { b.classList.add('good'); ctx.solved(); } else { b.classList.add('shake'); ctx.wrong(); } };
    $('.choices', ctx.body).appendChild(b);
  });
};

/* ---------- ending, win, time up ---------- */
function closeAll() { [...stack].reverse().forEach(i => i.close()); D.q = []; if (D.cur) Dialogue.end(); }
async function ending() {
  S.ended = true; S.phase = 'ending';
  const bonus = Math.floor(S.timerRemaining) * C.pointsPerSecondLeft; addScore(bonus, 'time');
  document.body.classList.add('cinema');
  const cine = el('div', 'cine', `<div class="cbg"></div><div class="cwrap"><div class="cframe"><div class="cimg"></div><div class="cemb"></div></div><p class="ctap">${T('tapContinue')}</p></div><button id="cSkip" aria-label="${T('skip')}">${T('skip')}</button><div class="dots"></div>`);
  $('#app').appendChild(cine);
  for (let k = 0; k < 14; k++) { const e = el('i'); e.style.cssText = `left:${Math.random() * 100}%;animation-delay:-${Math.random() * 9}s;animation-duration:${6 + Math.random() * 6}s`; $('.cemb', cine).appendChild(e); }
  let skipped = false; $('#cSkip').onclick = () => { skipped = true; Dialogue.end(); };
  cine.addEventListener('pointerdown', e => { if (e.target.id !== 'cSkip') Dialogue.tap(); });
  const sts = G.ending.stills;
  for (let i = 0; i < sts.length && !skipped; i++) {
    const s = sts[i]; $('.dots', cine).innerHTML = sts.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    sfx('whoosh'); const fr = $('.cframe', cine); fr.classList.remove('in'); void fr.offsetWidth; fr.classList.add('in');
    imgOk(s.file).then(ok => { const u = ok ? `url(${s.file})` : ''; $('.cbg', cine).style.backgroundImage = u; $('.cimg', cine).style.backgroundImage = u; });
    await Dialogue.play({ pausesTimer: true, lines: [{ who: s.who || 'narrator', mood: s.mood || null, text: s.text, audioFile: s.audioFile }] });
  }
  cine.remove(); document.body.classList.remove('cinema'); winScreen();
}
function winScreen() {
  sfx('win');
  S.phase = 'win'; const w = G.endScreens.win, b = S.brk;
  const sc = el('div', 'endscr blur'); document.body.appendChild(sc);
  imgOk(G.ending.stills[1].file).then(ok => { if (ok) sc.style.backgroundImage = `url(${G.ending.stills[1].file})`; });
  const row = (k, v) => `<span>${T('win.' + k)}</span><b class="${v < 0 ? 'neg' : ''}">${v}</b>`;
  sc.innerHTML += `<div class="endcard glass"><h1>${esc(w.title)}</h1><div class="total">0</div><div>${esc(C.scoreName)}</div><div class="bk">${row('items', b.items)}${row('shards', b.shards)}${row('steps', b.steps)}${row('time', b.time)}${row('pen', b.pen)}</div></div>`;
  const card = $('.endcard', sc), t0 = performance.now(), tot = $('.total', sc);
  const step = () => { const p = Math.min(1, (performance.now() - t0) / 1200); tot.textContent = Math.round(S.score * p); if (p < 1) requestAnimationFrame(step); }; step();
  card.appendChild(btn(w.button, 'primary', () => restart()));
}
function timeUp() {
  if (S.phase === 'timeUp') return;
  sfx('lose');
  S.phase = 'timeUp'; S.timerOn = false; closeAll(); Voice.stop();
  const t = G.endScreens.timeUp, sc = el('div', 'endscr frostscr'); document.body.appendChild(sc);
  sc.innerHTML += `<div class="endcard glass"><h1>${esc(t.title)}</h1><div class="total">${S.score}</div><div>${esc(C.scoreName)}</div><p>${esc(t.line)}</p></div>`;
  $('.endcard', sc).appendChild(btn(t.button, 'primary', () => restart()));
}

/* ---------- validate + debug ---------- */
function validate() {
  const errs = [], ev2 = new Set(), hs = {};
  G.rooms.forEach(r => { r.hotspots.forEach(h => { hs[h.id] = h; ev2.add('done:' + h.id); }); ev2.add('roomSolved:' + r.id); });
  Object.keys(G.panels).forEach(p => ev2.add('done:' + p)); Object.keys(G.dialogues).forEach(d => ev2.add('dialogueEnd:' + d)); G.combines.forEach(c => ev2.add('done:' + c.event));
  const dlg = (id, w) => { if (id && !G.dialogues[id]) errs.push(`missing dialogue ${id} (${w})`); };
  const page = (id, w) => { if (id && !G.clues[id] && !G.notes[id]) errs.push(`missing page ${id} (${w})`); };
  Object.entries(G.dialogues).forEach(([k, d]) => d.lines.forEach(l => { if (!G.characters[l.who]) errs.push(`bad speaker ${l.who} in ${k}`); }));
  Object.entries(G.panels).forEach(([k, p]) => { if (!PANELS[p.type]) errs.push(`no panel type ${p.type}`); (p.wrong || []).forEach(d => dlg(d, k)); });
  G.rooms.forEach(r => {
    [r.enter, r.right, ...r.hints].forEach(d => dlg(d, r.id));
    if (r.shard && !G.items[r.shard]) errs.push('missing shard ' + r.shard);
    r.objectives.forEach(o => { if (o.until && !ev2.has(o.until)) errs.push(`objective until ${o.until} unknown`); });
    r.findStrip.forEach(i => { if (!G.items[i]) errs.push('findStrip item ' + i); });
    r.hotspots.forEach(h => {
      dlg(h.locked, h.id);
      h.after.forEach(a => { if (!ev2.has(a)) errs.push(`${h.id}: unknown after ${a}`); });
      if (h.item && !G.items[h.item]) errs.push(`${h.id}: item ${h.item}`); if (h.needs && !G.items[h.needs]) errs.push(`${h.id}: needs ${h.needs}`);
      [h.page, ...(h.extraPages || [])].forEach(p => page(p, h.id)); dlg(h.dialogue, h.id); dlg(h.then, h.id);
      [h.panel, h.thenPanel].forEach(p => { if (p && !G.panels[p]) errs.push(`${h.id}: panel ${p}`); });
    });
  });
  const needs = e => {
    const [k, id] = e.split(/:(.+)/); if (k !== 'done') return [];
    if (hs[id]) return hs[id].after;
    const h = Object.values(hs).find(x => x.panel === id || x.thenPanel === id);
    return h ? (h.kind === 'USE' ? ['done:' + h.id] : h.after) : [];
  };
  const seen = {}, visit = e => { if (seen[e] === 1) { errs.push('cycle at ' + e); return; } if (seen[e] === 2) return; seen[e] = 1; needs(e).forEach(visit); seen[e] = 2; };
  [...ev2].forEach(visit);
  errs.forEach(e => console.error('validate:', e));
  if (!errs.length) console.log('validate(): ok');
  if (DEBUG && errs.length) { const b = $('#debug'); b.className = 'err'; b.textContent = 'validate() errors:\n' + errs.join('\n'); }
  return errs;
}
function debugOverlay() {
  const d = $('#debug'); if (d.classList.contains('err')) return; d.classList.remove('hidden');
  d.textContent = `${room().id} score ${S.score} t ${Math.ceil(S.timerRemaining)}\nbag: ${S.bag.join(',')}\ndone: ${[...S.done].filter(x => x.startsWith('done:')).join(' ')}`;
}
function debugInit() {
  window.__game = { S, G, ev, openPanel, enterRoom, panelSolved, room, act, hsList, validate, timeUp, ending, viewer: () => viewer, Voice };
  $('#pano').addEventListener('click', e => { if (!viewer) return; const [p, y] = viewer.mouseEventToCoords(e); console.log(`yaw ${y.toFixed(1)}, pitch ${p.toFixed(1)}`); toast(`yaw ${y.toFixed(1)}, pitch ${p.toFixed(1)}`); });
  document.addEventListener('keydown', e => {
    if (e.key === 'n' || e.key === 'N') { if (S.roomIndex + 1 < G.rooms.length) enterRoom(S.roomIndex + 1); }
    if (e.key === 's' || e.key === 'S') { if (S.panel) S.panel.solved(); }
    if (e.key === 't' || e.key === 'T') { S.timerRemaining = 10; updateClock(); }
  });
}

/* ---------- debug jump: skips the start flow; carry=1 also gives everything earlier rooms would have given ---------- */
async function debugJump(i, carry) {
  if (carry) {
    const used = new Set();
    G.rooms.slice(0, i).forEach(r => {
      r.hotspots.forEach(h => {
        S.done.add('done:' + h.id); if (h.panel) S.done.add('done:' + h.panel); if (h.thenPanel) S.done.add('done:' + h.thenPanel);
        if (h.kind === 'FIND') { addItem(h.item); addScore(C.pointsItem, 'items'); }
        if (h.kind === 'LEARN') [h.page, ...(h.extraPages || [])].forEach(addNote);
        if (h.kind === 'USE' && h.consumes) used.add(h.needs);
      });
      (r.combineEvents || []).forEach(e => S.done.add('done:' + e));
      if (r.shard) { addItem(r.shard); S.shards.push(r.shard); S.shardTaken[r.id] = true; addScore(C.pointsRoom, 'shards'); }
      S.done.add('roomSolved:' + r.id);
    });
    S.bag = S.bag.filter(x => !used.has(x) && x !== 'winding_key' && x !== 'music_box');
  }
  ['#hud', '#strip', '#bagBtn', '#hintBtn'].forEach(q => $(q).classList.remove('hidden'));
  await setupRoom(i); S.phase = 'play'; S.timerOn = true; refresh(); await enterRoom(i, true);
}

/* ---------- boot ---------- */
async function boot() {
  G = await (await fetch('game.json', { cache: 'no-store' })).json(); C = G.config;
  Object.entries(G.theme.colors).forEach(([k, v]) => document.documentElement.style.setProperty('--' + k, v));
  document.documentElement.style.setProperty('--ft', `"${G.theme.fonts.title}",${G.theme.fonts.fallbackTitle}`);
  document.documentElement.style.setProperty('--fb', `"${G.theme.fonts.body}",${G.theme.fonts.fallbackBody}`);
  const snow = $('#snow');
  for (let i = 0; i < (isMobile() ? 40 : 80); i++) { const f = el('i', 'flake'); const sz = 3 + Math.random() * 3; f.style.cssText = `left:${Math.random() * 100}%;width:${sz}px;height:${sz}px;animation-duration:${8 + Math.random() * 8}s;animation-delay:-${Math.random() * 16}s;--dx:${Math.random() * 80 - 40}px`; snow.appendChild(f); }
  S.timerRemaining = C.timerSeconds; updateClock(); setScore(0);
  $('#pauseBtn').innerHTML = icon('pause'); $('#pauseBtn').onclick = openPause;
  $('#bagBtn').insertAdjacentHTML('afterbegin', icon('bag')); $('#bagBtn').onclick = () => { if (D.cur || S.busy || S.panel) return; openBook(); };
  $('#hintBtn').insertAdjacentHTML('afterbegin', icon('hint')); $('#hintBtn').onclick = askHint;
  $('#dlg').onclick = e => { if (e.target.id !== 'dlgSkip') Dialogue.tap(); };
  $('#dlgSkip').onclick = e => { e.stopPropagation(); Dialogue.end(); };
  $('.hud-left').onclick = () => { const o = $('#objective').textContent; if (o) toast(T('goal', { text: o })); };
  let dn = null;
  $('#pano').addEventListener('pointerdown', e => { dn = [e.clientX, e.clientY, e.target.closest('.hs') ? 1 : 0]; });
  $('#pano').addEventListener('pointerup', e => { if (dn && !dn[2] && S.selectedItem && Math.hypot(e.clientX - dn[0], e.clientY - dn[1]) < 6 && !D.cur) { selectItem(null); toast(T('putBack')); } dn = null; });
  validate(); if (DEBUG) debugInit();
  const Q = new URLSearchParams(location.search), jump = DEBUG ? parseInt(Q.get('room'), 10) : NaN;
  if (jump >= 1 && jump <= G.rooms.length) { await debugJump(jump - 1, Q.get('carry') === '1'); return; }
  await setupRoom(0); showTitle();
}
boot().catch(e => { console.error(e); document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;z-index:999;padding:20px">Could not load the game. Run it with a local server: python -m http.server</p>'); });
})();
