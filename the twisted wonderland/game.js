/* The Twisted Wonderland - core game. All text and numbers come from game.json. */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const h = (tag, cls, content, attrs) => {
  const e = document.createElement(tag); if (cls) e.className = cls;
  if (content != null) { if (content instanceof Node) e.append(content); else if (Array.isArray(content)) e.append(...content); else e.innerHTML = content; }
  if (attrs) for (const k in attrs) { if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); }
  return e;
};
const rad = (d) => (d * Math.PI) / 180, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DEBUG = new URLSearchParams(location.search).get('debug') === '1' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
let G, view = null;
const S = { phase: 'title', room: 0, wits: 0, hintsLeft: 3, time: 600, holds: new Set(), rooms: {}, items: {}, clues: [], grin: [], rules: [], held: null, muted: false, opt: Object.assign({ music: true, voice: true, sfx: true }, JSON.parse(localStorage.getItem('tw_opt') || '{}')), choice: null, lastTap: Date.now(), idleN: 0 };
const ART = new Set(); window.artUrl = (u) => (ART.has(u) ? u : null);

/* ---------- icons (inline SVG, 24x24 stroke) ---------- */
const ICON = {
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/><circle cx="12" cy="12" r="7"/>',
  door: '<path d="M5 21V10a7 7 0 0 1 14 0v11M3 21h18"/><circle cx="15" cy="14" r="1"/>',
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v4M21 12v3"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h5v17H6a2 2 0 0 0-2 2zM20 5a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 1 2 2z"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  close: '<path d="M5 5l14 14M19 5L5 19"/>',
  check: '<path d="M4 12l6 6L20 6"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  crank: '<path d="M5 19l7-7M12 12a4 4 0 1 0 5-5l-3 1-1 3zM17 3l4 4"/>',
  vial: '<path d="M9 3h6M10 3v5l-4 9a3 3 0 0 0 3 4h6a3 3 0 0 0 3-4l-4-9V3M8 15h8"/>',
  scroll: '<path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H8a2 2 0 0 1-2-2V4zM6 4a2 2 0 0 0-2 2v1h2M10 9h6M10 13h6"/>',
  cards: '<rect x="4" y="5" width="11" height="15" rx="2"/><path d="M9 3l9 2 2 14-4 1M9 12l2 2 2-2"/>',
  slate: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h5"/>',
  chalk: '<path d="M5 19l10-10 3 3L8 22z"/><path d="M15 9l2-2 3 3-2 2"/>',
  lantern: '<path d="M9 3h6M8 6h8l1 3v8l-1 3H8l-1-3V9zM12 10v6"/>',
  mirror: '<ellipse cx="12" cy="10" rx="6" ry="8"/><path d="M12 18v4M9 22h6"/>',
  mallet: '<path d="M4 20l9-9M12 5l6 6-3 3-6-6z"/>',
  hand: '<path d="M8 12V5a1.5 1.5 0 0 1 3 0v6m0 0V4a1.5 1.5 0 0 1 3 0v8m0 0V6a1.5 1.5 0 0 1 3 0v9a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2l-3-5a1.5 1.5 0 0 1 2.5-1.5L8 15"/>',
  arrows: '<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>',
};
const ITEM_ICON = { gear_case: 'cog', crank: 'crank', vial5: 'vial', vial8: 'vial', name_cards: 'cards', house_rules: 'scroll', clue_slate: 'slate', chalk: 'chalk', lantern: 'lantern', mirror_guide: 'mirror', mallet: 'mallet', poem_scroll: 'scroll', clock_key: 'key', verdict_slate: 'slate' };
const KIND_ICON = { LEARN: 'eye', INSPECT: 'search', USE: 'key', PANEL: 'cog', AUTO: 'door' };
const svg = (n, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}">${ICON[n]}</svg>`;
const glyph = (id) => ART.has(`assets/cut/${id}.png`) ? `<img src="assets/cut/${id}.png" alt="">` : svg(ITEM_ICON[id] || 'star', 'gl');
const T = (k, v) => { let s = G.ui[k]; if (s == null) { console.warn('missing ui key', k); return k; } return v ? s.replace(/\{(\w+)\}/g, (m, x) => v[x]) : s; };
const item = (id) => G.items.find((i) => i.id === id);
const roomObj = () => G.rooms[S.room];
const Rm = (i = S.room) => S.rooms[G.rooms[i].id];
const newRoomState = () => ({ done: {}, placed: {}, wrong: 0, penalty: 0, hints: 0, solved: false, rewarded: false, intro: false, disc: false, score: 0, ps: {}, lockUntil: 0 });

/* ---------- validation ---------- */
function validate(g) {
  const err = [], ids = new Set(), keys = new Set(Object.keys(g.dialogue)), items = new Set(g.items.map((i) => i.id)), rooms = new Set(g.rooms.map((r) => r.id));
  g.hotspots.forEach((x) => { if (ids.has(x.id)) err.push('duplicate hotspot ' + x.id); ids.add(x.id); if (!rooms.has(x.room)) err.push(x.id + ' unknown room'); });
  g.hotspots.forEach((x) => {
    x.after.forEach((a) => { if (!ids.has(a)) err.push(`${x.id}: after "${a}" does not exist`); });
    if (x.item && !items.has(x.item)) err.push(`${x.id}: item ${x.item} missing`);
    (x.use || []).forEach((i) => { if (!items.has(i)) err.push(`${x.id}: use item ${i} missing`); });
    if (x.panel && !g.panels[x.panel]) err.push(`${x.id}: panel ${x.panel} missing`);
  });
  const seen = {}; const visit = (id, path) => { if (path.includes(id)) { err.push('after cycle: ' + [...path, id].join(' > ')); return; } if (seen[id]) return; seen[id] = 1; (g.hotspots.find((x) => x.id === id)?.after || []).forEach((a) => visit(a, [...path, id])); };
  g.hotspots.forEach((x) => visit(x.id, []));
  const used = new Set([...g.opening, ...g.idle, ...g.ending.lines]); g.rooms.forEach((r) => Object.values(r.dialogue).flat().forEach((k) => used.add(k)));
  used.forEach((k) => { if (!keys.has(k)) err.push('dialogue key missing: ' + k); });
  keys.forEach((k) => { if (!used.has(k)) err.push('dialogue key unused: ' + k); if (typeof g.dialogue[k].pausesTimer !== 'boolean') err.push(k + ': pausesTimer'); if (!g.characters[g.dialogue[k].speaker]) err.push(k + ': speaker'); });
  g.items.forEach((i) => { if (!g.hotspots.some((x) => x.item === i.id)) err.push('item never found: ' + i.id); });
  g.rooms.forEach((r) => { if (!window.PANELS[r.panel]) err.push('no panel code for ' + r.panel); });
  return err;
}

/* ---------- audio: browser voice + one BGM ---------- */
let bgm = null, voice = null;
let vAud = null; const preloaded = {};
function speak(text, who, file) {
  if (!S.opt.voice) return;
  if (file) { // recorded line; browser voice only when it fails to play
    stopSpeak(); vAud = preloaded[file] || new Audio(file); vAud.currentTime = 0; const me = vAud;
    me.onerror = () => { if (vAud === me) { vAud = null; speak(text, who); } };
    me.play().catch(() => { if (vAud === me) { vAud = null; speak(text, who); } }); return;
  }
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text), c = G.characters[who] || G.characters.narrator;
    u.pitch = c.pitch; u.rate = c.rate; u.volume = c.volume || 1; u.lang = 'en-US';
    if (!voice) voice = speechSynthesis.getVoices().find((v) => /^en/i.test(v.lang) && /natural|google|samantha|zira|aria/i.test(v.name)) || speechSynthesis.getVoices().find((v) => /^en/i.test(v.lang));
    if (voice) u.voice = voice; speechSynthesis.speak(u);
  } catch (e) { /* silent */ }
}
const stopSpeak = () => { if (vAud) { vAud.onerror = null; vAud.pause(); vAud = null; } try { speechSynthesis.cancel(); } catch (e) { /* */ } };
const preload = (f) => { if (f && !preloaded[f]) { const a = new Audio(f); a.preload = 'auto'; preloaded[f] = a; } };
function startBgm() {
  if (bgm) return; bgm = new Audio('assets/audio/bgm.ogg'); bgm.loop = true; bgm.volume = 0.12; bgm.muted = !S.opt.music;
  bgm.addEventListener('error', () => (bgm = null)); bgm.play().catch(() => {});
}
function bgmMood() { if (bgm) bgm.volume = roomObj().finalPuzzle ? 0.16 : 0.12; }
function setOpt(k, v) {
  S.opt[k] = v; try { localStorage.setItem('tw_opt', JSON.stringify(S.opt)); } catch (e) { /* */ }
  if (k === 'music' && bgm) bgm.muted = !v; if (k === 'voice' && !v) stopSpeak();
}
/* sound effects: tiny synth (no files). Only where they help: tap, find, right, wrong, reward, hint, time up. */
let ac = null;
function sfx(name) {
  if (!S.opt.sfx) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume();
    const T0 = ac.currentTime, note = (f, t, d, type = 'sine', v = 0.06) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, T0 + t); g.gain.setValueAtTime(0.0001, T0 + t); g.gain.exponentialRampToValueAtTime(v, T0 + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, T0 + t + d); o.connect(g).connect(ac.destination); o.start(T0 + t); o.stop(T0 + t + d + 0.05); };
    const P = { tap: [[520, 0, 0.07, 'triangle', 0.04]], find: [[660, 0, 0.12], [880, 0.1, 0.18]], good: [[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.25]], wrong: [[180, 0, 0.18, 'sawtooth', 0.05], [140, 0.15, 0.25, 'sawtooth', 0.05]], reward: [[523, 0, 0.15], [659, 0.12, 0.15], [784, 0.24, 0.15], [1047, 0.36, 0.4]], hint: [[440, 0, 0.1], [587, 0.1, 0.2]], timeup: [[330, 0, 0.3, 'triangle'], [247, 0.3, 0.3, 'triangle'], [165, 0.6, 0.6, 'triangle']] };
    (P[name] || []).forEach((n) => note(...n));
  } catch (e) { /* silent */ }
}

/* ---------- timer ---------- */
const hold = (r) => S.holds.add(r), release = (r) => S.holds.delete(r);
let lastTick = performance.now();
const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
setInterval(() => {
  const now = performance.now(), dt = (now - lastTick) / 1000; lastTick = now;
  if (S.phase !== 'play' || S.holds.size) return;
  S.time -= dt; if (S.time <= 0) { S.time = 0; hudTimer(); return timeUp(); }
  hudTimer();
  if (idleCheck()) return;
}, 250);
function hudTimer() {
  const t = $('#timer'); if (!t) return; const txt = fmt(S.time); if (t.dataset.v !== txt) { t.dataset.v = txt; t.innerHTML = svg('clock') + txt; }
  const low = S.time <= G.config.lastMinuteSec; t.classList.toggle('low', low && S.phase === 'play');
  if (low && S.phase === 'play' && !S.lastMin) { S.lastMin = true; FX.fxLastMinute(true); }
}
function hudWits(bump) { const w = $('#wits'); w.innerHTML = svg('star') + S.wits + `<small>${T('wits')}</small>`; if (bump) { w.classList.remove('bump'); void w.offsetWidth; w.classList.add('bump'); } }
function hudHint() { const b = $('#hintBtn'); b.innerHTML = svg('bulb') + T('hint') + `<span class="badge">${S.hintsLeft}</span>`; b.disabled = S.hintsLeft <= 0; b.setAttribute('aria-label', T('hint') + ' ' + T('hintsLeft', { n: S.hintsLeft })); }
function hudAll() {
  const r = roomObj(); hudTimer(); hudWits(); hudHint(); $('#goal').innerHTML = `<b>${T('goal')}</b>${r.objective}`;
  $('#bookBtn').innerHTML = svg('book') + T('book'); $('#pauseBtn').innerHTML = svg('pause'); $('#pauseBtn').setAttribute('aria-label', T('pause'));
  const f = $('#find'); f.innerHTML = '';
  const finds = G.hotspots.filter((x) => x.room === r.id && x.kind === 'FIND');
  if (finds.length) { f.append(h('span', '', T('findHere'))); finds.forEach((x) => f.append(h('span', 'fchip' + (Rm().done[x.id] ? ' got' : ''), Rm().done[x.id] ? svg('check') : '?'))); }
  const hd = $('#held'); if (S.held) { hd.className = 'held on'; hd.innerHTML = T('holding', { name: item(S.held).name }); hd.append(h('button', '', T('putAway'), { onclick: () => { S.held = null; hudAll(); refreshHotspots(); } })); } else hd.className = 'held';
}
function addWits(n, quiet) {
  const before = S.wits; S.wits = Math.max(0, S.wits + n); const d = S.wits - before; Rm().score += d; hudWits(true);
  if (d && !quiet) sfx(d > 0 ? 'good' : 'wrong'); if (d) floatText((d > 0 ? '+' : '') + d, d > 0 ? '#ffe27a' : '#ff8a8a');
}
function floatText(txt, col) {
  const r = $('#wits').getBoundingClientRect(), e = h('div', '', txt); Object.assign(e.style, { position: 'fixed', left: r.left + r.width / 2 + 'px', top: r.bottom + 'px', color: col, font: '700 22px Lora', zIndex: 50, pointerEvents: 'none', transition: 'all 1.1s ease-out', textShadow: '0 2px 6px #000' });
  document.body.append(e); requestAnimationFrame(() => { e.style.transform = 'translateY(40px)'; e.style.opacity = 0; }); setTimeout(() => e.remove(), 1200);
}
function toast(t) { const e = h('div', 'toast', t); $('#toast').append(e); setTimeout(() => e.remove(), 3100); }

/* ---------- dialogue (never advances by itself) ---------- */
const D = { q: [], cur: null, res: [], onLine: null };
function say(keys, opts = {}) {
  const lines = [].concat(keys).map((k) => ({ k, ...G.dialogue[k] }));
  return new Promise((res) => { D.q.push(...lines); D.res.push(res); if (opts.onLine) D.onLine = opts.onLine; if (!D.cur) nextLine(); });
}
function bust(who) {
  const c = G.characters[who], url = c.bust && `assets/cut/${c.bust}.png`;
  return ART.has(url) ? `<img src="${url}" alt="">` : c.initials;
}
function nextLine() {
  stopSpeak(); $('#dlg').innerHTML = ''; const l = D.q.shift(); document.body.classList.toggle('talking', !!l);
  if (!l) { D.cur = null; release('dlg'); $('#dlg').classList.remove('block'); D.onLine = null; D.res.splice(0).forEach((r) => r()); return; }
  D.cur = l; if (l.pausesTimer) hold('dlg'); else release('dlg');
  $('#dlg').classList.toggle('block', l.pausesTimer || S.phase !== 'play');
  const c = G.characters[l.speaker], url = c.bust && `assets/cut/${c.bust}.png`, hasImg = ART.has(url);
  const b = h('div', 'dbox' + (hasImg ? ' has-bust' : ''), (hasImg ? `<img class="bust-img" src="${url}" alt="">` : `<div class="bust" style="background:${c.color}">${c.initials}</div>`) + `<div class="who">${c.name}</div><p>${l.text}</p><div class="more"><span></span><i>${T('tapContinue')} ▸</i></div>`, { role: 'dialog', 'aria-label': c.name });
  const skip = h('button', 'skipbtn', T('skip')); skip.addEventListener('click', (e) => { e.stopPropagation(); skipDialogue(); }); $('.more span', b).append(skip);
  b.addEventListener('click', () => nextLine()); $('#dlg').append(b); speak(l.text, l.speaker, l.audioFile); preload(D.q[0] && D.q[0].audioFile); if (D.onLine) D.onLine(l.k);
}
function skipDialogue() { D.q = []; nextLine(); }

/* ---------- modals / cards ---------- */
const M = [];
function openModal(node, o = {}) {
  const back = h('div', 'mback'), m = { back, onClose: o.onClose, node }; back.append(node);
  back.addEventListener('pointerdown', (e) => { if (e.target === back && o.dismiss !== false) closeModal(m); }); M.push(m); $('#modals').append(back);
  if (!node.querySelector('.xbtn') && o.dismiss !== false) node.prepend(xbtn(m)); return m;
}
const xbtn = (m) => h('button', 'xbtn', svg('close'), { 'aria-label': T('close'), onclick: () => closeModal(m) });
function closeModal(m) { const i = M.indexOf(m); if (i < 0) return; M.splice(i, 1); m.back.remove(); m.onClose && m.onClose(); }
const closeAllModals = () => [...M].reverse().forEach(closeModal);
function card(o) { // returns a promise that resolves when closed
  return new Promise((res) => {
    const n = h('div', 'card', ''); let html = '';
    if (o.glyph) html += `<div class="glyph-big">${glyph(o.glyph)}</div>`;
    if (o.kicker) html += `<p class="sub">${o.kicker}</p>`;
    html += `<h3>${o.title}</h3>`; (o.body || []).forEach((p) => (html += `<p>${p}</p>`));
    if (o.rule) html += `<div class="rule-block"><b>${T('ruleNew')}</b>${o.rule}</div>`;
    if (o.foot) html += `<div class="foot">${svg('check', 'gl')}${o.foot}</div>`;
    n.innerHTML = html; if (o.extra) n.append(o.extra);
    const ok = h('div', 'center', h('button', 'btn', o.button || T('done'))); n.append(ok);
    const m = openModal(n, { onClose: () => res(m) }); ok.firstChild.onclick = () => closeModal(m); o.onOpen && o.onOpen(m);
  });
}
function flyToBook(id, from) {
  const to = $('#bookBtn').getBoundingClientRect(), e = h('div', 'fly', glyph(id)); e.style.left = from.x + 'px'; e.style.top = from.y + 'px'; document.body.append(e);
  requestAnimationFrame(() => { e.style.transform = `translate(${to.left + to.width / 2 - from.x}px, ${to.top + to.height / 2 - from.y}px) scale(.4)`; e.style.opacity = 0.2; }); setTimeout(() => e.remove(), 900);
}

/* ---------- panorama view (Pannellum, with a gradient fallback) ---------- */
function makeView(room) {
  return new Promise((resolve) => {
    if (view) { view.destroy(); view = null; } $('#pano').innerHTML = '';
    const portrait = innerHeight > innerWidth, hfov = portrait ? 78 : 100; let done = false;
    const fallback = (why) => {
      if (done) return; done = true; $('#pano').innerHTML = ''; const el = $('#pano'); el.style.background = `radial-gradient(ellipse at 50% 60%, ${room.accent}88, #151020 75%)`;
      el.append(h('div', 'pano-fallback', `[no panorama: ${room.panorama}] ${why || ''}`));
      const v = { y: room.startYaw, p: room.startPitch, hf: hfov, yaw: () => v.y, pitch: () => v.p, hfov: () => v.hf, destroy() { el.removeEventListener('pointerdown', dn); removeEventListener('pointermove', mv); removeEventListener('pointerup', up); el.style.background = ''; }, coords(e) { const f = innerWidth / 2 / Math.tan(rad(v.hf) / 2); return { yaw: v.y + (Math.atan((e.clientX - innerWidth / 2) / f) * 180) / Math.PI, pitch: v.p - (Math.atan((e.clientY - innerHeight / 2) / f) * 180) / Math.PI }; } };
      let drag = null; const dn = (e) => (drag = [e.clientX, e.clientY, v.y, v.p]), mv = (e) => { if (!drag) return; v.y = drag[2] - (e.clientX - drag[0]) * 0.2; v.p = Math.max(-80, Math.min(80, drag[3] + (e.clientY - drag[1]) * 0.2)); }, up = () => (drag = null);
      el.addEventListener('pointerdown', dn); addEventListener('pointermove', mv); addEventListener('pointerup', up); view = v; resolve(v);
    };
    try {
      const p = pannellum.viewer('pano', { type: 'equirectangular', panorama: room.panorama, autoLoad: true, showControls: false, hfov, minHfov: 55, maxHfov: 115, yaw: room.startYaw, pitch: room.startPitch, mouseZoom: true, keyboardZoom: false, doubleClickZoom: false, compass: false, friction: 0.18 });
      const v = { yaw: () => p.getYaw(), pitch: () => p.getPitch(), hfov: () => p.getHfov(), destroy: () => { try { p.destroy(); } catch (e) { /* */ } }, look: (y, t) => { p.setYaw(y, false); p.setPitch(t, false); }, coords: (e) => { const c = p.mouseEventToCoords(e); return { pitch: c[0], yaw: c[1] }; } };
      p.on('load', () => { if (done) return; done = true; view = v; resolve(v); }); p.on('error', (m) => { v.destroy(); fallback(m); }); setTimeout(() => { if (!done) { v.destroy(); fallback('timeout'); } }, 15000);
    } catch (e) { fallback(String(e)); }
  });
}

/* ---------- hotspots ---------- */
const hsEls = {};
function buildHotspots() {
  const hs = $('#hs'); hs.innerHTML = ''; Object.keys(hsEls).forEach((k) => delete hsEls[k]);
  G.hotspots.filter((x) => x.room === roomObj().id).forEach((x) => {
    const icon = x.kind === 'FIND' ? glyph(x.item) : svg(KIND_ICON[x.kind]);
    const b = h('button', `hs hs-${x.kind}`, `<span class="ic">${icon}</span>`, { 'aria-label': `${x.kind}: ${x.label}` });
    b.addEventListener('click', (e) => { e.stopPropagation(); onHotspot(x); }); hs.append(b); hsEls[x.id] = b;
  });
  refreshHotspots();
}
function hsVisible(x) {
  const R = Rm(); if (R.done[x.id]) return false; if (!x.after.every((a) => R.done[a])) return false;
  if (x.exit || x.ending) return R.rewarded; return true;
}
function refreshHotspots() {
  const play = S.phase === 'play';
  G.hotspots.filter((x) => x.room === roomObj().id).forEach((x) => { const b = hsEls[x.id]; if (!b) return; b.classList.toggle('on', play && hsVisible(x)); b.classList.toggle('ready', x.kind === 'USE' && !!S.held && x.use.includes(S.held)); });
}
function layout() {
  if (view) {
    const W = innerWidth, H = innerHeight, y0 = rad(view.yaw()), p0 = rad(view.pitch()), f = W / 2 / Math.tan(rad(view.hfov()) / 2), sp = Math.sin(p0), cp = Math.cos(p0);
    G.hotspots.forEach((x) => {
      const b = hsEls[x.id]; if (!b) return; const yw = rad(x.yaw), pt = rad(x.pitch);
      const dx = Math.cos(pt) * Math.sin(yw - y0), dy = Math.sin(pt), dz = Math.cos(pt) * Math.cos(yw - y0), y1 = dy * cp - dz * sp, z1 = dy * sp + dz * cp;
      if (z1 <= 0.05) { b.classList.add('off-screen'); return; } const sx = W / 2 + (f * dx) / z1, sy = H / 2 - (f * y1) / z1;
      const off = sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40; b.classList.toggle('off-screen', off); if (!off) b.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
    });
  }
  requestAnimationFrame(layout);
}

/* ---------- hotspot actions ---------- */
const canAct = () => S.phase === 'play' && !M.length && !(D.cur && $('#dlg').classList.contains('block'));
async function onHotspot(x) {
  if (!canAct()) return; sfx(x.kind === 'FIND' ? 'find' : 'tap'); S.lastTap = Date.now(); const R = Rm(), room = roomObj(), el = hsEls[x.id], r = el.getBoundingClientRect(), at = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  if (x.kind === 'LEARN') {
    R.done[x.id] = true; S.clues.push({ room: room.id, title: x.title, text: x.text }); if (x.writesRule) addRule(room); refreshHotspots();
    await card({ title: x.title, body: [x.text], rule: x.writesRule && room.twistedRule, foot: T('savedNote'), kicker: `${T('roomWord')} ${S.room + 1}` });
  } else if (x.kind === 'FIND') {
    const it = item(x.item); R.done[x.id] = true; S.items[it.id] = room.id; addWits(G.config.scoring.find); if (x.writesRule) addRule(room); refreshHotspots(); hudAll();
    await card({ kicker: T('foundTitle') + '  ' + T('findPlus', { n: G.config.scoring.find }), title: it.name, glyph: it.id, body: [x.text, `<span class="sub">${it.text}</span>`], rule: x.writesRule && room.twistedRule, foot: T('foundSaved') }); flyToBook(it.id, at);
  } else if (x.kind === 'INSPECT') inspect(x);
  else if (x.kind === 'USE') useSpot(x);
  else if (x.kind === 'PANEL') openPanel(x.panel);
  else if (x.exit) goRoom(S.room + 1);
  else if (x.ending) ending();
  hudAll(); refreshHotspots();
}
function addRule(room) { if (!S.rules.some((r) => r.room === room.id)) S.rules.push({ room: room.id, title: room.twistedRuleTitle, text: room.twistedRule }); }
function inspect(x) {
  const R = Rm(), room = roomObj(); const n = h('div', 'card'); let turned = false;
  const grin = '<svg viewBox="0 0 100 60" class="grin-svg"><path d="M8 18Q50 78 92 18"/><path d="M20 30l4 9M36 38l3 10M50 41v11M64 38l-3 10M80 30l-4 9"/></svg>';
  const view1 = h('div', 'inspect-view', svg('search')), p = h('p', '', x.view1), btn = h('button', 'btn', T('grinTurn')), foot = h('div', 'foot');
  n.append(h('p', 'sub', T('grinTitle')), h('h3', '', x.title), view1, p, h('div', 'center', btn), foot);
  btn.onclick = () => {
    if (turned) return; turned = true; view1.classList.add('flip'); setTimeout(() => { view1.innerHTML = grin; view1.classList.remove('flip'); view1.style.transform = 'none'; p.textContent = x.view2; if (x.art && ART.has(`assets/cut/${x.art}.png`)) view1.innerHTML = `<img src="assets/cut/${x.art}.png" alt="">`; }, 250);
    R.done[x.id] = true; S.grin.push({ room: room.id, text: x.grinNote }); addWits(G.config.scoring.grin); foot.innerHTML = svg('check', 'gl') + T('grinFound', { n: G.config.scoring.grin }); btn.remove(); hudAll(); refreshHotspots();
  };
  openModal(n);
}
function useSpot(x) {
  const R = Rm(); R.placed[x.id] = R.placed[x.id] || [];
  if (!S.held) { openBook('items'); toast(T('useHowTo')); return; }
  if (!x.use.includes(S.held) || R.placed[x.id].includes(S.held)) { toast(T('wrongTool')); return; }
  const it = item(S.held); R.placed[x.id].push(S.held); S.held = null; const left = x.use.length - R.placed[x.id].length;
  if (left > 0) { toast(T('placedMore', { name: it.name, n: left })); hudAll(); refreshHotspots(); return; }
  R.done[x.id] = true; hudAll(); refreshHotspots(); openPanel(x.panel);
}

/* ---------- Book ---------- */
function openBook(tab = 'items') {
  if (!canAct()) return; const n = h('div', 'card'), body = h('div', ''), tabs = h('div', 'tabs'); let sel = null;
  const draw = () => {
    tabs.innerHTML = ''; [['items', 'tabItems'], ['clues', 'tabClues'], ['grin', 'tabGrin'], ['rules', 'tabRules'], ['progress', 'tabProgress']].forEach(([k, t]) => tabs.append(h('button', 'tab' + (k === tab ? ' sel' : ''), T(t), { onclick: () => { tab = k; sel = null; draw(); } })));
    body.innerHTML = ''; const R = Rm(), rid = roomObj().id;
    if (tab === 'items') {
      const mine = G.items.filter((i) => S.items[i.id] === rid); if (!mine.length) body.append(h('p', 'sub', T('emptyItems')));
      const g = h('div', 'items'); mine.forEach((i) => g.append(h('button', 'item' + (sel === i.id ? ' sel' : ''), glyph(i.id) + `<span>${i.name}</span>`, { onclick: () => { sel = i.id; draw(); } }))); body.append(g);
      if (sel) {
        const i = item(sel), spot = G.hotspots.find((x) => x.room === rid && x.kind === 'USE' && x.use.includes(sel) && hsVisible(x) && !(R.placed[x.id] || []).includes(sel)), d = h('div', 'item-detail', `<b>${i.name}</b><p>${i.text}</p>`);
        if (spot) d.append(h('button', 'btn small', T('useItem'), { onclick: () => { S.held = sel; closeModal(m); hudAll(); refreshHotspots(); } })); body.append(d);
      }
    } else if (tab === 'clues') { if (!S.clues.length) body.append(h('p', 'sub', T('emptyClues'))); [...S.clues].reverse().forEach((c) => body.append(h('div', 'entry', `<b>${c.title}</b>${c.text}`))); }
    else if (tab === 'grin') { if (!S.grin.length) body.append(h('p', 'sub', T('emptyGrin'))); S.grin.forEach((c) => body.append(h('div', 'entry', `<b>${T('roomWord')} ${G.rooms.findIndex((r) => r.id === c.room) + 1}</b>${c.text}`))); }
    else if (tab === 'rules') { if (!S.rules.length) body.append(h('p', 'sub', T('emptyRules'))); S.rules.forEach((c) => body.append(h('div', 'entry', `<b>${T('roomWord')} ${G.rooms.findIndex((r) => r.id === c.room) + 1}: ${c.title}</b>${c.text}`))); }
    else {
      const done = G.rooms.filter((r) => S.rooms[r.id] && S.rooms[r.id].rewarded).length;
      [T('progressRooms', { a: done, b: G.rooms.length }), T('progressHints', { n: S.hintsLeft }), T('progressGrin', { a: S.grin.length, b: G.rooms.length }), T('progressItems', { a: Object.keys(S.items).length, b: G.items.length }), `${T('wits')}: ${S.wits}`].forEach((t) => body.append(h('div', 'entry', t)));
    }
  };
  n.append(h('h3', '', T('book')), tabs, body); const m = openModal(n); draw();
}

/* ---------- panels ---------- */
function openPanel(name) {
  const R = Rm(), P = G.panels[name], room = roomObj(); R.ps[name] = R.ps[name] || {};
  const node = h('div', 'card panel'), body = h('div', 'panel-body');
  node.append(h('h3', '', P.title), h('p', 'goal panel-goal', P.goal), body); if (P.clue) node.append(h('p', 'panel-clue', P.clue));
  const hb = h('button', 'hintin', svg('bulb') + T('hint') + `<span class="badge">${S.hintsLeft}</span>`, { onclick: askHint, 'aria-label': T('hint') });
  node.append(hb);
  let m, cleanup;
  const fx = room.finalPuzzle ? { courtOpen: FX.fxCourtOpen, courtClose: FX.fxCourtClose, cardLit: FX.fxCardLit, half: FX.fxHalf, wrong: FX.fxWrong, allLit: FX.fxAllLit } : {};
  const api = {
    st: R.ps[name], T, toast, fx,
    wrong: (o) => { node.classList.remove('shake'); void node.offsetWidth; node.classList.add('shake'); doWrong(o); },
    solved: () => { closeModal(m); roomSolved(); },
    lock: (btn, label, cb, secs) => lockBtn(btn, label, cb, secs),
  };
  m = openModal(node, { onClose: () => { cleanup && cleanup(); refreshHotspots(); } });
  cleanup = window.PANELS[name](body, P, api);
  const jb = body.querySelector('.btn:not(.ghost):not(.small)'); if (jb && R.lockUntil > Date.now()) lockBtn(jb, jb.textContent, null, (R.lockUntil - Date.now()) / 1000);
  if (!R.disc) { R.disc = true; say(room.dialogue.disc); }
}
function lockBtn(btn, label, cb, secs = G.config.scoring.lockoutSec) {
  const R = Rm(); R.lockUntil = Date.now() + secs * 1000; btn.disabled = true; let n = Math.ceil(secs); btn.textContent = T('lockout', { n });
  const iv = setInterval(() => { n--; if (n <= 0) { clearInterval(iv); btn.textContent = label; btn.disabled = false; cb && cb(); } else btn.textContent = T('lockout', { n }); }, 1000);
}
function doWrong(o = {}) {
  const R = Rm(), sc = G.config.scoring, room = roomObj(); R.wrong++;
  if (R.penalty - sc.wrong <= -sc.wrongCapPerPuzzle) { R.penalty -= sc.wrong; addWits(sc.wrong); }
  const lines = room.dialogue.wrong, idx = o.first ? 0 : o.idx != null ? o.idx : (R.wrong - 1) % lines.length; say(lines[idx]);
}
async function roomSolved() {
  const R = Rm(), room = roomObj(); R.solved = true; G.hotspots.filter((x) => x.room === room.id && x.kind === 'PANEL').forEach((x) => (R.done[x.id] = true));
  closeAllModals(); refreshHotspots(); hudAll(); FX.fxCourtClose();
  await say(room.dialogue.right); // the reward waits for the narration to finish or be skipped
  R.rewarded = true; sfx('reward'); const amt = room.finalPuzzle ? G.config.scoring.finalPuzzle : G.config.scoring.roomReward; addWits(amt); toast(T(room.finalPuzzle ? 'rewardToastFinal' : 'rewardToast', { n: amt })); refreshHotspots(); hudAll();
}

/* ---------- hints ---------- */
function askHint() {
  if (!canAct() && !(M.length && S.phase === 'play')) return; if (S.hintsLeft <= 0) return toast(T('hintNone'));
  if (S.wits < -G.config.scoring.hint) return toast(T('hintNeed', { n: -G.config.scoring.hint }));
  const n = h('div', 'card'); n.append(h('h3', '', T('hint')), h('p', '', T('hintCost', { n: -G.config.scoring.hint })));
  const yes = h('button', 'btn', T('hintAsk')), no = h('button', 'btn ghost', T('hintCancel')); n.append(h('div', 'btn-row', [yes, no]));
  const m = openModal(n); no.onclick = () => closeModal(m);
  yes.onclick = () => {
    if (S.wits < -G.config.scoring.hint) { toast(T('hintNeed', { n: -G.config.scoring.hint })); return closeModal(m); }
    closeModal(m); const R = Rm(), room = roomObj(); S.hintsLeft--; sfx('hint'); addWits(G.config.scoring.hint, true); const k = room.dialogue.hint[Math.min(R.hints, room.dialogue.hint.length - 1)]; R.hints++; hudHint(); say(k);
  };
}

/* ---------- rooms ---------- */
async function loadRoom(i) {
  S.room = i; const room = G.rooms[i]; if (!S.rooms[room.id]) S.rooms[room.id] = newRoomState();
  document.documentElement.style.setProperty('--accent', room.accent); await makeView(room); buildHotspots(); hudAll(); bgmMood();
}
async function goRoom(i) {
  S.phase = 'trans'; $('#fade').classList.add('on'); await sleep(480); await loadRoom(i); $('#fade').classList.remove('on'); S.phase = 'play'; S.lastTap = Date.now(); refreshHotspots(); await roomIntro();
}
async function roomIntro() {
  const R = Rm(), room = roomObj(); if (R.intro) return; R.intro = true;
  await card({ kicker: `${T('roomWord')} ${S.room + 1} / ${G.rooms.length}`, title: room.name, body: [`<b>${T('goal')}:</b> ${room.objective}`] }); await say(room.dialogue.enter);
}
function restartRoom() {
  const R = Rm(), room = roomObj(); S.wits = Math.max(0, S.wits - R.score);
  G.items.forEach((i) => { if (S.items[i.id] === room.id) delete S.items[i.id]; }); ['clues', 'grin', 'rules'].forEach((k) => (S[k] = S[k].filter((c) => c.room !== room.id)));
  const hints = R.hints; S.rooms[room.id] = Object.assign(newRoomState(), { intro: true, hints }); S.held = null; closeAllModals(); skipDialogue(); buildHotspots(); hudAll(); FX.fxReset(); S.lastMin = false;
}

/* ---------- idle prompts ---------- */
document.addEventListener('pointerdown', () => (S.lastTap = Date.now()), true);
function idleCheck() {
  if (S.phase !== 'play' || M.length || D.cur || Date.now() - S.lastTap < G.config.idleSec * 1000) return false;
  S.lastTap = Date.now(); say(G.idle[S.idleN++ % G.idle.length]); return true;
}

/* ---------- pause ---------- */
let pauseScr = null;
function pauseGame() {
  if (pauseScr || !['play'].includes(S.phase)) return; hold('pause'); stopSpeak();
  pauseScr = h('div', 'screen pause'); const b = (t, f, c = '') => h('button', 'btn ' + c, t, { onclick: f });
  const tog = (k, key) => { const t = b('', () => { setOpt(k, !S.opt[k]); sfx('tap'); upd(); }, 'ghost'), upd = () => (t.textContent = `${T(key)}: ${T(S.opt[k] ? 'optOn' : 'optOff')}`); upd(); return t; };
  pauseScr.append(h('h2', '', T('paused')), b(T('resume'), resumeGame), b(T('restartRoom'), () => { resumeGame(); restartRoom(); }, 'ghost'), tog('music', 'optMusic'), tog('voice', 'optVoice'), tog('sfx', 'optSfx')); $('#screens').append(pauseScr);
}
function resumeGame() { if (!pauseScr) return; pauseScr.remove(); pauseScr = null; release('pause'); lastTick = performance.now(); if (D.cur) speak(D.cur.text, D.cur.speaker, D.cur.audioFile); }

/* ---------- start flow: Tap to Start > Mission Info > tutorial > opening > play ---------- */
const screen = (cls) => { const s = h('div', 'screen ' + cls); $('#screens').append(s); return s; };
function clockSVG(cls = '') {
  let ticks = ''; for (let i = 0; i < 12; i++) ticks += `<line x1="100" y1="14" x2="100" y2="${i % 3 ? 22 : 30}" transform="rotate(${i * 30} 100 100)"/>`;
  return `<svg viewBox="0 0 200 200" class="${cls}" fill="none" stroke="#e2b640" stroke-width="4" stroke-linecap="round"><circle cx="100" cy="100" r="92"/><circle cx="100" cy="100" r="84" stroke-width="1.5"/>${ticks}<path d="M100 100V46M100 100l36 20" stroke-width="6"/><path d="M118 8l-14 38 22 22-18 30 14 26 -10 36" stroke="#fff3b0" stroke-width="3"/><circle cx="100" cy="100" r="6" fill="#e2b640"/></svg>`;
}
function tapToStart() {
  return new Promise((res) => {
    const s = screen('title'); if (ART.has('assets/sheets/title_key.jpg')) s.append(h('div', 'art', '', { style: 'background-image:url(assets/sheets/title_key.jpg)' }), h('div', 'shade'));
    else s.append(h('div', 'clock', clockSVG()));
    s.append(h('h1', '', `<span>THE</span>${G.ui.gameTitle.replace(/^The /, '')}`), h('p', '', T('tagline')), h('div', 'tap', T('tapStart')));
    s.addEventListener('click', () => { // this tap unlocks audio
      try { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance('')); speechSynthesis.getVoices(); } catch (e) { /* */ }
      s.style.transition = 'opacity .5s'; s.style.opacity = 0; setTimeout(() => s.remove(), 500); res();
    }, { once: true });
  });
}
function missionInfo() {
  return new Promise((res) => {
    const s = screen('mission'), m = G.mission;
    if (ART.has('assets/sheets/briefing_bg.jpg')) s.append(h('div', 'art', '', { style: 'background-image:url(assets/sheets/briefing_bg.jpg)' })); else s.append(h('div', 'sil', clockSVG()));
    s.append(h('div', 'shade')); const t = h('div', 'text', `<div class="kick">${m.kicker}</div><h2>${m.heading}</h2>${m.paragraphs.map((p) => `<p>${p}</p>`).join('')}`);
    const b = h('button', 'btn', T('begin')); t.append(b); s.append(t); speak(m.paragraphs.join(' '), 'narrator', m.audioFile);
    b.onclick = () => { stopSpeak(); s.remove(); res(); };
  });
}
function tutorial() {
  return new Promise((res) => {
    const s = screen('tut'), spot = h('div', 'spot'), steps = G.tutorial; let i = 0; s.append(spot);
    $('#hud').classList.remove('off'); $('#pauseBtn').classList.remove('off');
    const kinds = ['FIND', 'LEARN', 'INSPECT', 'USE', 'PANEL', 'AUTO'];
    const rectOf = (t) => {
      const ids = { book: ['#bookBtn'], pause: ['#pauseBtn'], stats: ['#timer', '#wits'] }[t]; if (!ids) return null;
      const rs = ids.map((q) => $(q).getBoundingClientRect()); return { l: Math.min(...rs.map((r) => r.left)), t: Math.min(...rs.map((r) => r.top)), r: Math.max(...rs.map((r) => r.right)), b: Math.max(...rs.map((r) => r.bottom)) };
    };
    const card = h('div', 'card'); s.append(card);
    const draw = () => {
      const st = steps[i], r = rectOf(st.target); card.innerHTML = '';
      if (r) { Object.assign(spot.style, { display: 'block', left: r.l - 6 + 'px', top: r.t - 6 + 'px', width: r.r - r.l + 12 + 'px', height: r.b - r.t + 12 + 'px' }); } else spot.style.display = 'none';
      card.append(h('p', 'sub', `${i + 1} / ${steps.length}`));
      if (i === 0) card.append(h('div', 'dragdemo', svg('arrows')));
      card.append(h('p', '', st.text));
      if (i === 1) card.append(h('div', 'legend-k', kinds.map((k) => `<span><i class="ic k-${k}">${k === 'FIND' ? svg('star') : svg(KIND_ICON[k])}</i>${T('kind' + k)}</span>`).join('')));
      const next = h('button', 'btn small', i === steps.length - 1 ? T('begin') : T('next')), skip = h('button', 'skipbtn', T('skip'));
      card.append(h('div', 'dots', steps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')), h('div', 'tut-row', [skip, next]));
      next.onclick = () => (++i >= steps.length ? end() : draw()); skip.onclick = end;
    };
    const end = () => { s.remove(); res(); }; draw();
  });
}
async function opening() {
  const sk = h('button', 'skipbtn float', T('skip'), { onclick: skipDialogue }); document.body.append(sk); $('#pauseBtn').classList.add('off');
  await say(G.opening); sk.remove();
}
async function beginPlay() {
  S.phase = 'play'; $('#pano').classList.remove('blur'); $('#hud').classList.remove('off', 'dim'); $('#pauseBtn').classList.remove('off'); await sleep(G.config.unblurSec * 1000); release('pre');
  lastTick = performance.now(); S.lastTap = Date.now(); startBgm(); refreshHotspots(); await roomIntro();
}
async function startFlow() {
  await tapToStart(); hold('pre'); $('#pano').classList.add('blur'); const loading = loadRoom(0);
  await missionInfo(); await loading; S.phase = 'pre'; await tutorial(); await opening(); await beginPlay();
}

/* ---------- end of game ---------- */
async function timeUp() {
  if (S.phase === 'over') return; S.phase = 'over'; closeAllModals(); skipDialogue(); stopSpeak(); FX.fxTimeUp(); sfx('timeup'); $('#hs').innerHTML = ''; await sleep(2400);
  const s = screen('endscr lose'); s.append(h('h2', '', T('loseTitle')), h('p', 'lbl', T('loseWits')), h('div', 'big', String(S.wits)), h('button', 'btn', T('tryAgain'), { onclick: () => location.reload() }));
}
async function ending() {
  S.phase = 'ending'; hold('ending'); closeAllModals(); $('#hud').classList.add('off'); $('#pauseBtn').classList.add('off'); $('#hs').innerHTML = ''; $('#pano').className = 'deep'; FX.fxCourtClose(); FX.fxLastMinute(false);
  const s = screen('cine'), grin = h('div', 'grin-cards'); s.append(grin); document.body.append(h('button', 'skipbtn float', T('skip'), { id: 'cineSkip', onclick: skipDialogue }));
  const show = (on) => { grin.innerHTML = ''; if (!on) return; G.rooms.slice(0, 6).forEach((r, k) => { const g = S.grin.find((x) => x.room === r.id); grin.append(h('div', 'gc', g ? g.text : '?', { style: `--r:${(k % 2 ? 2 : -2) + k - 2}deg;--d:${k * 0.12}s` })); }); };
  await say(G.ending.lines, { onLine: (k) => show(G.ending.grinNotesDuring.includes(k)) }); show(false); $('#cineSkip').remove(); s.remove();
  const cs = screen('endscr'); cs.append(h('h2', '', T('choiceHeading')), h('p', 'endtext', T('choiceSub')));
  const box = h('div', 'choices'); G.ending.choices.forEach((c) => box.append(h('button', 'choice', c.title, { onclick: () => pick(c, cs) }))); cs.append(box);
}
function pick(c, cs) {
  S.choice = c; try { localStorage.setItem('tw_choice', c.id); } catch (e) { /* */ } cs.remove();
  const s = screen('endscr'); s.append(h('h2', '', c.title), h('p', 'endtext', c.summary), h('div', 'seedcard', `<b>${T('sequelLabel')}</b>${c.seed}`), h('button', 'btn', T('next'), { onclick: () => { s.remove(); win(); } }));
}
function win() {
  sfx('reward');
  const s = screen('endscr'); s.append(h('h2', '', T('winTitle')), h('p', 'endtext', T('winSub')), h('p', 'lbl', T('winWits')), h('div', 'big', String(S.wits)), h('p', 'lbl', T('winChoice')), h('p', 'endtext', S.choice.title), h('button', 'btn', T('tryAgain'), { onclick: () => location.reload() }));
}

/* ---------- boot ---------- */
async function boot() {
  try { G = await (await fetch('game.json')).json(); } catch (e) { document.body.append(h('pre', '', 'Cannot load game.json. Run: python -m http.server  (then open http://localhost:8000)')); return; }
  const errs = validate(G); if (errs.length) { console.error('validate():', errs); if (DEBUG) document.body.prepend(h('pre', '', errs.join('\n'), { style: 'position:fixed;z-index:999;background:#400;color:#fff;font:12px monospace;padding:8px;top:0' })); }
  S.hintsLeft = G.config.hintsTotal; S.time = G.config.timerSec; S.rooms[G.rooms[0].id] = newRoomState();
  const urls = ['assets/sheets/title_key.jpg', 'assets/sheets/briefing_bg.jpg', ...G.items.map((i) => `assets/cut/${i.id}.png`), ...Object.values(G.characters).filter((c) => c.bust).map((c) => `assets/cut/${c.bust}.png`)];
  await Promise.all(urls.map((u) => new Promise((r) => { const i = new Image(); i.onload = () => { ART.add(u); r(); }; i.onerror = r; i.src = u; })));
  $('#bookBtn').onclick = () => openBook(); $('#hintBtn').onclick = askHint; $('#pauseBtn').onclick = pauseGame; hudAll();
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (pauseScr) resumeGame(); else if (M.length) closeModal(M[M.length - 1]); else if (S.phase === 'play') pauseGame(); }
    else if ((e.key === 'Enter' || e.key === ' ') && D.cur && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); nextLine(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
  layout(); if (DEBUG) debugTools();
  const qp = new URLSearchParams(location.search), jump = DEBUG ? +qp.get('room') : 0;
  if (jump >= 1 && jump <= G.rooms.length) debugStart(jump - 1, qp.get('carry') === '1'); else startFlow();
}
/* debug: ?debug=1&room=4 starts in room 4; add &carry=1 to carry everything from rooms 1-3 (items, notes, rules, Wits) */
async function debugStart(n, carry) {
  S.rooms = {}; G.rooms.forEach((r) => (S.rooms[r.id] = newRoomState()));
  if (carry) G.rooms.slice(0, n).forEach((r) => {
    const R = S.rooms[r.id]; R.intro = R.disc = R.solved = R.rewarded = true; addRule(r);
    G.hotspots.filter((x) => x.room === r.id).forEach((x) => {
      R.done[x.id] = true; if (x.item) { S.items[x.item] = r.id; S.wits += G.config.scoring.find; }
      if (x.kind === 'LEARN') S.clues.push({ room: r.id, title: x.title, text: x.text });
      if (x.kind === 'INSPECT') { S.grin.push({ room: r.id, text: x.grinNote }); S.wits += G.config.scoring.grin; }
    }); S.wits += G.config.scoring.roomReward;
  });
  S.room = n; await loadRoom(n); S.phase = 'play'; $('#pano').classList.remove('blur'); $('#hud').classList.remove('off'); $('#pauseBtn').classList.remove('off'); release('pre'); lastTick = performance.now(); hudAll(); refreshHotspots(); startBgm(); roomIntro();
}
function debugTools() {
  const d = $('#dbg'); d.hidden = false; const info = h('div', '', 'debug: click the room'); d.append(info);
  $('#stage').addEventListener('click', (e) => { if (!view) return; const c = view.coords(e); info.textContent = `yaw ${c.yaw.toFixed(1)}  pitch ${c.pitch.toFixed(1)}`; console.log(`yaw: ${c.yaw.toFixed(1)}, pitch: ${c.pitch.toFixed(1)}`); });
  const btn = (t, f) => d.append(h('button', '', t, { onclick: f }));
  ['fxCourtOpen', 'fxCardLit', 'fxHalf', 'fxWrong', 'fxAllLit', 'fxTimeUp'].forEach((n) => btn(n.slice(2), () => FX[n](innerWidth / 2, innerHeight / 2)));
  btn('lastMin', () => FX.fxLastMinute(true)); btn('fxReset', FX.fxReset); btn('+60s', () => (S.time += 60)); btn('t=5s', () => (S.time = 5));
  btn('solve', () => { if (S.phase === 'play') { closeAllModals(); G.hotspots.filter((x) => x.room === roomObj().id && x.kind !== 'AUTO').forEach((x) => { Rm().done[x.id] = true; if (x.item) S.items[x.item] = roomObj().id; }); roomSolved(); } });
  G.rooms.forEach((r, i) => btn('R' + (i + 1), async () => { closeAllModals(); skipDialogue(); S.phase = 'play'; release('pre'); await goRoom(i); }));
  window.__g = { yaw: () => view.yaw(), look: (y, p) => view.look && view.look(y, p), S, G, say, openPanel, openBook, ending, win, goRoom };
}
boot();
})();
