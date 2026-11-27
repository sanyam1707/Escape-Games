'use strict';
/* Secrets of the Pharaoh - all text and numbers come from game.json */
(async function () {
  const $ = (s) => document.querySelector(s);
  const E = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
  const angDiff = (a, b) => ((b - a + 540) % 360) - 180;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const DEBUG = false;

  let G;
  try { G = await (await fetch('game.json')).json(); } catch (e) { document.body.innerHTML = '<p style="color:#fff;padding:20px">Could not load game.json. Run with: python -m http.server</p>'; return; }
  const T = (k) => G.ui[k];
  const CFG = G.config;
  const DLG = {}; G.dialogue.forEach((d) => DLG[d.id] = d);

  /* ---------- validate ---------- */
  function validate() {
    const err = [], ids = new Set();
    for (const d of G.dialogue) if (typeof d.pausesTimer !== 'boolean') err.push('dialogue missing pausesTimer: ' + d.id);
    const needLine = (id, where) => { if (id && !DLG[id]) err.push('missing dialogue ' + id + ' in ' + where); };
    G.rooms.forEach((R) => {
      const mine = new Set(R.hotspots.map((h) => h.id));
      (R.enter || []).concat(R.right || [], R.wrong || [], [R.discuss, R.hint]).forEach((id) => needLine(id, 'room ' + R.id));
      R.hotspots.forEach((h) => {
        if (ids.has(h.id)) err.push('duplicate hotspot ' + h.id); ids.add(h.id);
        needLine(h.line, h.id);
        (h.after || []).forEach((a) => { if (!mine.has(a)) err.push(h.id + ' after unknown ' + a); });
        if (h.item && !G.items[h.item]) err.push(h.id + ' unknown item ' + h.item);
        if (h.needs && !G.items[h.needs]) err.push(h.id + ' unknown needs ' + h.needs);
        if (h.panel && !G.puzzles[h.panel] && !['tiles', 'offering', 'canopic', 'dial', 'doors', 'plates'].includes(h.panel)) err.push('unknown panel ' + h.panel);
      });
      const st = {}, byId = Object.fromEntries(R.hotspots.map((h) => [h.id, h]));
      const dfs = (id) => { if (st[id] === 2) return; if (st[id] === 1) { err.push('cycle at ' + id); return; } st[id] = 1; ((byId[id] || {}).after || []).forEach(dfs); st[id] = 2; };
      R.hotspots.forEach((h) => dfs(h.id));
      if (R.reward && R.reward.item && !G.items[R.reward.item]) err.push('unknown reward item ' + R.reward.item);
    });
    ['open.1', 'open.2', 'open.3', 'open.4', 'idle.1', 'r7.enter.3', 'r7.d4', 'r7.d3', 'r7.d2', 'r7.d1', 'r7.wrong', 'r7.right', 'r7.hint.1', 'r7.hint.2', 'r7.hint.3', 'end.4a', 'end.4b'].forEach((id) => needLine(id, 'core'));
    return err;
  }
  const verr = validate();
  if (verr.length) { console.error('VALIDATE FAILED', verr); const d = E('pre', '', 'game.json errors:\n' + verr.join('\n')); d.style.cssText = 'position:fixed;z-index:999;inset:0;background:#300;color:#fff;padding:16px;overflow:auto;font:13px monospace'; document.body.append(d); return; }

  /* ---------- assets with fallbacks ---------- */
  const HAS = new Set();
  const urls = [G.assets.title, G.assets.briefing, G.assets.seshkara].concat(G.assets.cut.map((c) => 'assets/cut/' + c + '.png'), G.rooms.map((r) => r.pano));
  await Promise.all(urls.map((u) => fetch(u, { method: 'HEAD' }).then((r) => { if (r.ok) HAS.add(u); }).catch(() => { })));

  const GL = {
    sun: '<circle cx="24" cy="24" r="7"/><path d="M24 5v6M24 37v6M5 24h6M37 24h6M11 11l4 4M33 33l4 4M37 11l-4 4M11 37l4-4"/>',
    ripple: '<path d="M6 14q4.500-6 9 0t9 0 9 0 9 0M6 24q4.500-6 9 0t9 0 9 0 9 0M6 34q4.500-6 9 0t9 0 9 0 9 0"/>',
    heart: '<path d="M24 41C8 29 7 15 16 12c4-1 8 1 8 5 0-4 4-6 8-5 9 3 8 17-8 29z"/>',
    falcon: '<path d="M12 40V26q0-13 13-13 8 0 11 6l7 4-7 3q-1 7-6 9v5z"/><circle cx="27" cy="20" r="1.800" fill="currentColor"/><path d="M18 31q4 3 9 0"/>',
    serpent: '<path d="M30 9c-9 0-14 4-14 9s14 6 14 12-7 9-15 9"/><circle cx="32" cy="9" r="3" fill="currentColor"/><path d="M36 9l5-2M36 9l5 2"/>',
    jackal: '<path d="M15 20L18 4l8 12M34 20L30 4l-4 12"/><path d="M12 20h26l-3 14-11 8-11-8z"/><circle cx="19" cy="27" r="1.800" fill="currentColor"/><circle cx="31" cy="27" r="1.800" fill="currentColor"/><path d="M25 32v5"/>',
    bolt: '<path d="M6 8v32M42 8v32"/><rect x="9" y="20" width="30" height="8" rx="2"/><circle cx="13" cy="24" r="2.500"/><path d="M33 20v-5M33 28v5"/>',
    reed: '<path d="M15 41c0-14 2-24 8-33 1 12 0 23-8 33M27 41c0-9 4-17 10-22"/><ellipse cx="34" cy="34" rx="6" ry="5"/><path d="M28 31l-3-3M40 31l3-3M28 37l-3 3M40 37l3 3"/>',
    heart_eye: '<path d="M24 41C8 29 7 15 16 12c4-1 8 1 8 5 0-4 4-6 8-5 9 3 8 17-8 29z"/><circle cx="24" cy="24" r="3.500" fill="currentColor"/><path d="M14 24q10-9 20 0"/>'
  };
  const glyph = (n, cls) => `<svg class="${cls || 'g'}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${GL[n] || ''}</svg>`;
  const ICONS = {
    paper: '<rect x="12" y="7" width="26" height="34" rx="3" fill="#e8dcb5" stroke="#8a6c22" stroke-width="2"/><path d="M17 15h16M17 21h16M17 27h12M17 33h10" stroke="#6b5420" stroke-width="2"/>',
    stone: '<path d="M10 42V18q0-10 14-10t14 10v24z" fill="#8d8472" stroke="#4b4338" stroke-width="2"/><path d="M17 20h14M17 26h14M17 32h9" stroke="#3b342b" stroke-width="2.500"/>',
    bronze: '<circle cx="24" cy="24" r="16" fill="#b27a2c" stroke="#5e3d0c" stroke-width="2.500"/><circle cx="24" cy="24" r="9" fill="none" stroke="#f0cf6a" stroke-width="2"/>',
    key: '<path d="M24 24v18M16 33h16M24 24c-6 0-9-4-9-8a9 9 0 0 1 18 0c0 4-3 8-9 8z" fill="none" stroke="#e1a63c" stroke-width="4" stroke-linecap="round"/>',
    jar: '<path d="M16 14h16l3 6v16q0 6-11 6t-11-6V20z" fill="#b0793f" stroke="#5e3d0c" stroke-width="2"/><rect x="15" y="8" width="18" height="7" rx="3" fill="#d9b25a" stroke="#5e3d0c" stroke-width="2"/><path d="M24 24c-3-2-5 1-3 4l3 4 3-4c2-3 0-6-3-4z" fill="#8b1a2b"/>',
    scarab: '<ellipse cx="24" cy="26" rx="11" ry="14" fill="#3a7d83" stroke="#14393d" stroke-width="2"/><path d="M24 12v28M13 22h22" stroke="#14393d" stroke-width="2"/><circle cx="24" cy="10" r="4" fill="#3a7d83" stroke="#14393d" stroke-width="2"/>'
  };
  function itemIcon(id) {
    const u = 'assets/cut/' + id + '.png', it = G.items[id];
    if (HAS.has(u)) { const i = E('img', 'itemico'); i.src = u; i.alt = it.name; i.draggable = false; return i; }
    const s = E('div', 'itemico'); s.innerHTML = `<svg viewBox="0 0 48 48" width="100%" height="100%">${ICONS[it.icon] || ICONS.bronze}</svg>`; return s;
  }

  // HUD icons: use the painted art when the file exists, keep the SVG otherwise
  document.querySelectorAll('img[data-ico]').forEach((i) => { const u = 'assets/cut/' + i.dataset.ico + '.png'; if (HAS.has(u)) { i.src = u; i.hidden = false; i.draggable = false; const f = i.parentElement.querySelector('.fb'); if (f) f.style.display = 'none'; i.parentElement.classList.add('art'); } });

  /* ---------- state ---------- */
  const S = {
    phase: 'title', room: 0, score: 0, hints: CFG.hintsTotal, time: CFG.timerSeconds, items: [], used: new Set(), done: new Set(), clues: [], truths: [],
    pause: new Set(), wrongN: {}, roomDone: {}, held: null, idle: 0, lockUntil: 0, ps: {}, r7h: 0, newBadge: 0, sound: true, started: false, hintPlaying: false, secrets: new Set(), seen: new Set()
  };
  const cam = { yaw: 0, pitch: 0, hfov: 100, vy: 0, vp: 0, manual: false };
  let viewer = null, hots = [], exitHot = null, shownSec = -1;
  const modals = [];
  let menuOpen = false;
  const R = () => G.rooms[S.room];

  /* ---------- UI helpers ---------- */
  function toast(msg, cls) {
    const t = E('div', 'toast ' + (cls || ''), msg); const box = $('#toasts'); box.append(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.remove(), 3400);
  }
  function addScore(n, x, y) {
    const before = S.score; S.score = Math.max(0, S.score + n); const d = S.score - before; $('#scoreV').textContent = S.score;
    $('#score').classList.remove('bump'); void $('#score').offsetWidth; $('#score').classList.add('bump');
    if (d !== 0) { fx.sfx(d > 0 ? 'gain' : 'bad'); const f = E('div', 'float' + (d < 0 ? ' neg' : ''), (d > 0 ? '+' : '') + d + ' ' + T('ankhs')); const r = $('#score').getBoundingClientRect(); f.style.left = (x != null ? x - 40 : r.left) + 'px'; f.style.top = (y != null ? y : r.bottom + 6) + 'px'; $('#app').append(f); setTimeout(() => f.remove(), 1200); }
    refreshHint();
  }
  function refreshHint() {
    $('#hintN').textContent = S.hints; $('#hintN').classList.toggle('zero', S.hints <= 0);
    $('#bHint').classList.toggle('dim', S.hints <= 0 || S.score < CFG.score.hint);
  }
  const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  function updateBlock() { document.body.classList.toggle('modal-open', modals.length > 0); $('#stage').classList.toggle('off', modals.length > 0 || menuOpen || S.phase !== 'play'); }
  const frozen = () => S.pause.size > 0 || modals.length > 0 || S.hintPlaying || menuOpen;

  function openCard(o) {
    const back = E('div', 'back'), card = E('div', 'card ' + (o.cls || '')), x = E('button', 'xbtn', '<svg class="ico"><use href="#i-x"/></svg>');
    x.setAttribute('aria-label', T('close'));
    if (o.title) card.append(E('h2', '', o.title)); if (o.sub) card.append(E('div', 'sub', o.sub));
    card.append(x); const body = E('div', 'body'); card.append(body); back.append(card); $('#layer').append(back);
    const m = { back, card, body, closed: false, restart: o.restart, close() { if (m.closed) return; m.closed = true; back.remove(); modals.splice(modals.indexOf(m), 1); if (o.onClose) o.onClose(); updateBlock(); } };
    back.addEventListener('pointerdown', (e) => { if (e.target === back) m.close(); });
    x.onclick = () => m.close(); modals.push(m); updateBlock(); return m;
  }
  const closeAll = () => { while (modals.length) modals[modals.length - 1].close(); };

  /* ---------- narration ---------- */
  const VA = new Audio(); VA.preload = 'auto';
  function narrate(text, sp, obj) { // recorded file when the line has one, browser voice otherwise
    if (!fx.opt.voice || !S.started) return null;
    if (obj && obj.audioFile) { try { speechSynthesis.cancel(); } catch (e) { } VA.onended = null; VA.src = obj.audioFile; VA.play().catch(() => { }); return VA; }
    if (!('speechSynthesis' in window)) return null;
    try {
      speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text), spk = G.speakers[sp] || G.speakers.narrator;
      u.pitch = spk.pitch; u.rate = spk.rate; const vs = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
      const fem = /female|zira|samantha|aria|hazel|susan|jenny|karen|serena|victoria/i, mal = /male|david|mark|daniel|guy|george|alex|fred|james|ryan/i;
      const pick = vs.find((v) => (spk.gender === 'f' ? fem : mal).test(v.name) && (spk.gender === 'f' || !/female/i.test(v.name))); if (pick) u.voice = pick;
      speechSynthesis.speak(u);
    } catch (e) { }
  }
  const stopSpeech = () => { VA.onended = null; VA.pause(); try { speechSynthesis.cancel(); } catch (e) { } };

  /* ---------- dialogue ---------- */
  const D = { q: [], cur: null, timer: 0 };
  function bust(sp, mood) {
    const spk = G.speakers[sp], b = $('#dBust'); b.innerHTML = ''; b.style.background = '';
    const ALIAS = { worried: 'scared', scared: 'worried', calm: 'cheerful', cheerful: 'calm', determined: 'calm', surprised: 'scared' }, MOODS = ['calm', 'cheerful', 'determined', 'worried', 'scared', 'surprised'];
    const u = [mood, ALIAS[mood], ...MOODS].filter(Boolean).map((m) => 'assets/cut/' + sp + '_' + m + '.png').concat('assets/cut/' + sp + '.png').find((x) => HAS.has(x));
    b.className = u ? 'art' : 'badge';
    if (u) { const i = E('img'); i.src = u; i.alt = ''; i.draggable = false; b.append(i); } else { b.style.background = spk.color; b.textContent = spk.initial; }
  }
  function say(ids, o) {
    o = o || {};
    return new Promise((res) => {
      if (D.cur && !D.cur.line.pausesTimer && !D.cur.hold) endSeq(true);
      D.q.push({ ids: [].concat(ids), res, amb: o.amb, hint: o.hint, hold: o.hold, i: 0 }); pump();
    });
  }
  function pump() {
    if (D.cur || !D.q.length) return;
    const s = D.q.shift(); D.cur = s; S.hintPlaying = !!s.hint; showLine();
  }
  function showLine() {
    const s = D.cur, line = DLG[s.ids[s.i]]; s.line = line; clearTimeout(D.timer);
    const spk = G.speakers[line.speaker];
    bust(line.speaker, line.mood); $('#dName').textContent = spk.name; $('#dText').textContent = line.text; $('#dlg').hidden = false;
    $('#dlg').classList.toggle('amb', !!s.amb); $('#dSkip').hidden = !!s.amb; document.body.classList.add('dlg-open');
    if (line.pausesTimer) S.pause.add('dlg'); else S.pause.delete('dlg');
    const au = narrate(line.text, line.speaker, line), nx = DLG[s.ids[s.i + 1]]; if (nx && nx.audioFile) new Audio().src = nx.audioFile; // warm the cache for the next line
    if (s.amb) { D.timer = setTimeout(advance, au ? 12000 : 2200 + line.text.length * 55); if (au) au.onended = () => { clearTimeout(D.timer); D.timer = setTimeout(advance, 700); }; }
    updateBlock();
  }
  function advance() { stopSpeech(); const s = D.cur; if (!s) return; s.i++; if (s.i >= s.ids.length) endSeq(); else showLine(); }
  function endSeq(silent) {
    const s = D.cur; if (!s) return; clearTimeout(D.timer); D.cur = null; S.hintPlaying = false; S.pause.delete('dlg');
    if (!silent) { $('#dlg').hidden = true; document.body.classList.remove('dlg-open'); }
    stopSpeech(); s.res(); if (!silent) pump(); updateBlock();
  }
  $('#dlg').addEventListener('click', (e) => { if (e.target.id === 'dSkip') return; if (D.cur && !D.cur.amb) advance(); });
  $('#dSkip').addEventListener('click', (e) => { e.stopPropagation(); endSeq(); });

  /* ---------- projection and camera ---------- */
  function basis() {
    const y0 = rad(cam.yaw), p0 = rad(cam.pitch);
    return { r: [Math.cos(y0), 0, -Math.sin(y0)], u: [-Math.sin(p0) * Math.sin(y0), Math.cos(p0), -Math.sin(p0) * Math.cos(y0)], f: [Math.cos(p0) * Math.sin(y0), Math.sin(p0), Math.cos(p0) * Math.cos(y0)] };
  }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  function proj(yaw, pitch, B) {
    const W = innerWidth, H = innerHeight, f = (W / 2) / Math.tan(rad(cam.hfov) / 2), yw = rad(yaw), pt = rad(pitch);
    const d = [Math.cos(pt) * Math.sin(yw), Math.sin(pt), Math.cos(pt) * Math.cos(yw)], z = dot(d, B.f);
    if (z <= 0.05) return null;
    return { x: W / 2 + dot(d, B.r) / z * f, y: H / 2 - dot(d, B.u) / z * f };
  }
  function unproj(x, y) {
    const W = innerWidth, H = innerHeight, f = (W / 2) / Math.tan(rad(cam.hfov) / 2), B = basis(), a = (x - W / 2) / f, b = (H / 2 - y) / f;
    const d = [0, 1, 2].map((i) => B.r[i] * a + B.u[i] * b + B.f[i]);
    return { yaw: deg(Math.atan2(d[0], d[2])), pitch: deg(Math.asin(d[1] / Math.hypot(...d))) };
  }
  const baseHfov = () => innerWidth / innerHeight < 0.9 ? 68 : 100;
  function limits() { const vf = 2 * deg(Math.atan(Math.tan(rad(cam.hfov) / 2) * innerHeight / innerWidth)); return 88 - vf / 2; }
  function loadPano(room) {
    if (viewer) { try { viewer.destroy(); } catch (e) { } viewer = null; }
    $('#pano').innerHTML = ''; document.documentElement.style.setProperty('--accent', room.accent);
    if (!HAS.has(room.pano) || typeof pannellum === 'undefined') return;
    cam.hfov = baseHfov();
    try {
      viewer = pannellum.viewer('pano', { type: 'equirectangular', panorama: room.pano, autoLoad: true, showControls: false, showFullscreenCtrl: false, showZoomCtrl: false, mouseZoom: false, draggable: false, keyboardZoom: false, doubleClickZoom: false, disableKeyboardCtrl: true, hfov: cam.hfov, minHfov: 30, maxHfov: 130, yaw: cam.yaw, pitch: cam.pitch, compass: false });
    } catch (e) { console.warn('pannellum failed', e); viewer = null; }
  }
  function syncCam() {
    cam.yaw = ((cam.yaw + 540) % 360) - 180; cam.pitch = clamp(cam.pitch, -limits(), limits());
    if (viewer) { try { viewer.setYaw(cam.yaw, false); viewer.setPitch(cam.pitch, false); viewer.setHfov(cam.hfov, false); } catch (e) { } }
  }

  /* ---------- hotspots ---------- */
  function hsEl(h) {
    const k = h.kind.toLowerCase(), box = E('div', 'hs ' + k), i = E('i'); box.append(i);
    if (h.kind === 'FIND') i.append(itemIcon(h.item));
    else if (h.kind === 'STONE') i.innerHTML = glyph(h.glyph, '');
    else i.innerHTML = '<svg class="ico"><use href="#' + ({ LEARN: 'i-star', INSPECT: 'i-eye', USE: 'i-hand', PANEL: 'i-ankh', EXIT: 'i-door' }[h.kind]) + '"/></svg>';
    $('#hs').append(box); return box;
  }
  function buildHots() {
    $('#hs').innerHTML = ''; hots = []; exitHot = null; const r = R();
    r.hotspots.forEach((h) => hots.push({ h, el: hsEl(h), vis: false }));
    if (S.room === 6) r.stones.forEach((s) => hots.push({ h: Object.assign({ kind: 'STONE', label: s.name }, s), el: hsEl({ kind: 'STONE', glyph: s.glyph }), vis: true }));
    if (S.roomDone[S.room] && r.exit) showExit(true);
    refreshHots();
  }
  function showExit(instant) {
    const r = R(); if (!r.exit || exitHot) return;
    const h = { id: 'r' + r.id + '.exit', kind: 'EXIT', label: r.exit.label, yaw: r.exit.yaw, pitch: r.exit.pitch }, el = hsEl(h);
    if (!instant) el.classList.add('fadein'); exitHot = { h, el, vis: true }; hots.push(exitHot);
  }
  function unlocked(h) { return (h.after || []).every((a) => S.done.has(a)); }
  function visible(h) {
    if (h.kind === 'EXIT' || h.kind === 'STONE') return true;
    if (!unlocked(h)) return false;
    if (S.roomDone[S.room] && h.kind === 'PANEL') return false;
    return !(h.kind === 'FIND' || h.kind === 'USE' || h.kind === 'PANEL') || !S.done.has(h.id);
  }
  function refreshHots() {
    hots.forEach((o) => { o.vis = visible(o.h); o.el.style.display = o.vis ? '' : 'none'; if (o.h.kind === 'LEARN') o.el.classList.toggle('done', S.done.has(o.h.id)); });
    const r = R(); const panel = r.hotspots.find((h) => h.kind === 'PANEL');
    $('#objT').textContent = exitHot ? T('takeExit') : (S.roomDone[S.room] ? r.objective : (panel && unlocked(panel) ? r.objectiveReady : r.objective));
    // strip
    const finds = r.hotspots.filter((h) => h.kind === 'FIND'), st = $('#strip'); st.innerHTML = ''; st.hidden = !finds.length;
    if (finds.length) { st.append(E('small', '', T('findStrip'))); finds.forEach((h) => { const got = S.done.has(h.id), c = E('div', 'sl' + (got ? ' got' : '')); if (got) c.append(itemIcon(h.item)); else c.textContent = '?'; c.title = got ? G.items[h.item].name : '?'; st.append(c); }); }
  }
  function tapAt(x, y) {
    if (D.cur && D.cur.line.pausesTimer) { advance(); return; }
    const B = basis(), s = clamp(90 / cam.hfov, 0.75, 1.4); let best = null, bd = 1e9;
    for (const o of hots) {
      if (!o.vis) continue; const p = proj(o.h.yaw, o.h.pitch, B); if (!p) continue;
      const d = Math.hypot(p.x - x, p.y - y), rad_ = (o.h.kind === 'STONE' ? 56 : 36) * s; if (d < rad_ && d < bd) { bd = d; best = o; }
    }
    if (DEBUG) { const u = unproj(x, y); const t = 'yaw ' + u.yaw.toFixed(1) + ' pitch ' + u.pitch.toFixed(1); $('#dbg').hidden = false; $('#dbg').textContent = t; console.log(t); }
    if (best) hit(best);
  }
  function hit(o) {
    const h = o.h; S.idle = 0; S.quiet = 0; $('#banner').hidden = true;
    if (S.held && h.kind !== 'USE' && h.kind !== 'EXIT') { toast(T('useNothing')); return; }
    switch (h.kind) {
      case 'FIND': return doFind(o);
      case 'LEARN': return doLearn(h);
      case 'INSPECT': return doInspect(h);
      case 'USE': return doUse(o);
      case 'PANEL': return openPanel(h);
      case 'EXIT': return goNext();
      case 'STONE': return tapStone(o);
    }
  }

  /* ---------- items, clues, truths ---------- */
  function newBadge() { S.newBadge++; $('#bookN').textContent = S.newBadge; $('#bookN').hidden = false; }
  function giveItem(id) { S.items.push(id); newBadge(); }
  function itemCard(id, label) {
    const it = G.items[id], m = openCard({ title: it.name, sub: it.material, cls: 'itemcard' });
    const hero = E('div', 'hero'); hero.append(itemIcon(id)); m.body.append(hero, E('div', 'papyrus', it.text), E('div', 'saved', label)); return m;
  }
  function fly(from, id) {
    const f = E('div', 'flyer'); f.append(itemIcon(id)); f.style.left = from.x - 22 + 'px'; f.style.top = from.y - 22 + 'px'; $('#app').append(f);
    const b = $('#bBook').getBoundingClientRect(); requestAnimationFrame(() => { f.style.transform = `translate(${b.left + 22 - from.x}px,${b.top + 22 - from.y}px) scale(.4)`; f.style.opacity = '.2'; }); setTimeout(() => f.remove(), 900);
  }
  function doFind(o) {
    const h = o.h; S.done.add(h.id); giveItem(h.item);
    const p = proj(h.yaw, h.pitch, basis()); if (p) fly(p, h.item);
    addScore(CFG.score.item, p && p.x, p && p.y); refreshHots(); itemCard(h.item, T('savedItem')); if (h.line) say(h.line);
  }
  function doLearn(h) {
    const first = !S.done.has(h.id); S.done.add(h.id);
    if (first) { S.clues.push({ title: h.title, text: h.text }); newBadge(); }
    const m = openCard({ title: h.title, sub: h.label });
    m.body.append(E('div', 'papyrus', h.text));
    if (h.glyphs) m.body.append(E('div', 'glyphrow', h.glyphs.map((g) => glyph(g)).join('')));
    m.body.append(E('div', 'saved', T('savedNote'))); refreshHots(); if (first && h.line) say(h.line);
  }
  function doInspect(h) {
    const first = !S.done.has(h.id); S.done.add(h.id); let v = 0;
    const m = openCard({ title: h.title, sub: h.label }), view = E('div', 'view'), dots = E('div', 'dots'), row = E('div', 'row'), note = E('div', 'msg ok');
    const prev = E('button', 'btn ghost', T('inspectPrev')), next = E('button', 'btn', T('inspectNext')); row.append(prev, next);
    m.body.append(view, dots, note, row);
    const render = () => {
      view.innerHTML = h.views[v]; dots.innerHTML = h.views.map((_, i) => '<i class="' + (i === v ? 'on' : '') + '"></i>').join('');
      prev.disabled = v === 0; next.disabled = v === h.views.length - 1;
      if (v === h.views.length - 1) {
        if (S.secrets.has(h.id)) { note.textContent = '"' + h.secret + '"'; } else {
          note.textContent = T('tapSecret'); const b = E('button', 'secretspot', '<svg class="ico" style="width:24px;height:24px"><use href="#i-eye"/></svg>'); view.append(b);
          b.onclick = () => { S.secrets.add(h.id); addScore(CFG.score.secret); S.clues.push({ title: h.title + ' (secret)', text: h.secret }); newBadge(); b.remove(); note.textContent = '"' + h.secret + '"'; toast(T('secretFound') + ' +' + CFG.score.secret, 'good'); };
        }
      } else note.textContent = '';
    };
    prev.onclick = () => { v--; render(); }; next.onclick = () => { v++; render(); }; render(); refreshHots(); if (first && h.line) say(h.line);
  }
  function doUse(o) {
    const h = o.h;
    if (S.held !== h.needs) { toast(S.held ? T('useNothing') : T('needItem')); return; }
    S.done.add(h.id); if (!h.keep) { S.items.splice(S.items.indexOf(h.needs), 1); S.used.add(h.needs); } else S.used.add('_' + h.needs);
    S.held = null; $('#holdchip').hidden = true; refreshHots(); toast(G.items[h.needs].name + ' - ' + T('usedUp').toLowerCase(), 'good'); if (h.line) say(h.line);
  }
  function setHeld(id) { S.held = id; const c = $('#holdchip'); c.hidden = !id; if (id) c.textContent = T('holding') + ': ' + G.items[id].name + '  (' + T('stopHolding') + ')'; }
  $('#holdchip').onclick = () => setHeld(null);

  /* ---------- casebook ---------- */
  function openBook(tab) {
    if (S.phase !== 'play' && S.phase !== 'intro') return; if (modals.some((m) => m.isBook)) return;
    S.newBadge = 0; $('#bookN').hidden = true; tab = tab || 'items';
    const m = openCard({ cls: 'book' }); m.isBook = true; const tabs = E('div', 'tabs'), bk = E('div', 'bk');
    const tI = E('button', 'tab', T('tabItems')), tT = E('button', 'tab', T('tabTruths')); tabs.append(tI, tT); m.body.append(tabs, bk);
    const items = () => {
      bk.innerHTML = ''; tI.classList.add('on'); tT.classList.remove('on');
      if (!S.items.length) { bk.append(E('div', 'empty', T('noItems'))); return; }
      S.items.forEach((id) => {
        const it = G.items[id], r = E('div', 'irow' + (S.used.has('_' + id) ? ' used' : '')), ic = itemIcon(id), tx = E('div', '', `<h4>${it.name}</h4><small>${it.material}</small><p>${it.text}</p>`);
        r.append(ic, tx);
        if (it.usable && !S.used.has('_' + id)) { const b = E('button', 'btn', T('hold')); b.style.cssText = 'margin-top:8px;min-height:40px;padding:4px 14px;font-size:13px'; b.onclick = () => { setHeld(id); m.close(); toast(T('holdHelp'), 'good'); }; tx.append(b); }
        bk.append(r);
      });
    };
    const truths = () => {
      bk.innerHTML = ''; tT.classList.add('on'); tI.classList.remove('on');
      if (!S.truths.length) bk.append(E('div', 'empty', T('noTruths')));
      S.truths.forEach((t, n) => bk.append(E('div', 'truth', `<b>${t + 1}</b><span>${G.truths[t]}</span>`)));
      if (S.clues.length) { bk.append(E('h5', '', T('notes'))); S.clues.forEach((c) => bk.append(E('div', 'note', `<b>${c.title}</b>${c.text}`))); }
    };
    tI.onclick = items; tT.onclick = truths; (tab === 'truths' ? truths : items)();
  }
  $('#bBook').onclick = () => openBook();

  /* ---------- hints ---------- */
  function useHint() {
    if (S.phase !== 'play') return;
    if (S.hints <= 0) { toast(T('hintNone'), 'bad'); return; }
    if (S.score < CFG.score.hint) { toast(T('hintPoor'), 'bad'); return; }
    if (S.roomDone[S.room] && S.room !== 6) { toast(T('hintDone'), 'good'); return; }
    S.hints--; addScore(-CFG.score.hint); toast(T('hintUsed'), 'good');
    const id = S.room === 6 ? 'r7.hint.' + Math.min(++S.r7h, 3) : R().hint; say(id, { hint: true });
  }
  $('#bHint').onclick = useHint;

  /* ---------- lockout and wrong answers ---------- */
  function applyLock(btn, label) {
    if (Date.now() >= S.lockUntil) return; btn.disabled = true;
    const iv = setInterval(() => {
      const left = Math.ceil((S.lockUntil - Date.now()) / 1000);
      if (!btn.isConnected || left <= 0) { clearInterval(iv); if (btn.isConnected) { btn.disabled = false; btn.textContent = label; } return; }
      btn.textContent = T('locked').replace('{s}', left);
    }, 200); btn.textContent = T('locked').replace('{s}', Math.ceil((S.lockUntil - Date.now()) / 1000));
  }
  function wrong(btns, msgEl, text) {
    const r = R(); S.wrongN[S.room] = (S.wrongN[S.room] || 0) + 1; addScore(-CFG.score.wrong);
    S.lockUntil = Date.now() + CFG.lockoutMs; btns.forEach((b) => applyLock(b, b.dataset.label));
    if (msgEl) { msgEl.className = 'msg'; msgEl.textContent = text || ''; }
    say(r.wrong[Math.min(S.wrongN[S.room] - 1, r.wrong.length - 1)]);
  }
  const mkConfirm = (label) => { const b = E('button', 'btn', label || T('confirm')); b.dataset.label = b.textContent; return b; };

  /* ---------- panels ---------- */
  const PANELS = {};
  function openPanel(h) {
    const fn = PANELS[h.panel]; let m; const make = () => { m && m.body.replaceChildren(); fn(m.body, h, m); };
    m = openCard({ title: h.label, restart() { delete S.ps[h.panel]; make(); } }); make();
  }
  function solve(h, m) { S.done.add(h.id); m.close(); roomSolved(); }

  PANELS.doors = (b, h, m) => {
    const P = G.puzzles.doors; let sel = null; b.append(E('p', 'help', T('doorsHelp')));
    const g = E('div', 'pgrid doors'), msg = E('div', 'msg'), ok = mkConfirm(); ok.disabled = true;
    const names = ['Left door', 'Middle door', 'Right door'];
    P.doors.forEach((d, i) => { const o = E('button', 'opt door', `<div class="arch">${glyph(d)}</div>${names[i]}`); o.onclick = () => { sel = i; g.querySelectorAll('.opt').forEach((x, j) => x.classList.toggle('sel', j === i)); ok.disabled = Date.now() < S.lockUntil; applyLock(ok, ok.dataset.label); msg.textContent = ''; }; g.append(o); });
    ok.onclick = () => {
      if (sel === null) return;
      if (sel === P.answer) return solve(h, m);
      const tip = P.wrong[P.doors[sel]]; fx.puff(innerWidth / 2, innerHeight * 0.6); wrong([ok], msg, tip);
    };
    b.append(g, msg, E('div', 'row')); b.lastChild.append(ok); applyLock(ok, ok.dataset.label);
  };
  PANELS.plates = (b, h, m) => {
    const P = G.puzzles.plates; let sel = null; b.append(E('p', 'help', T('platesHelp')));
    const g = E('div', 'pgrid plates'), msg = E('div', 'msg'), ok = mkConfirm(); ok.disabled = true;
    P.plates.forEach((pl, i) => { const o = E('button', 'opt plate', `<span class="lab">${'ABC'[i]}</span>` + pl.map((s) => `<div style="text-align:center">${glyph(s)}<div style="font-size:11px;color:#5a4210">${G.glyphNames[s]}</div></div>`).join('')); o.onclick = () => { sel = i; g.querySelectorAll('.opt').forEach((x, j) => x.classList.toggle('sel', j === i)); ok.disabled = Date.now() < S.lockUntil; msg.textContent = ''; }; g.append(o); });
    ok.onclick = () => { if (sel === null) return; if (sel === P.answer) return solve(h, m); wrong([ok], msg, ''); };
    b.append(g, msg, E('div', 'row')); b.lastChild.append(ok); applyLock(ok, ok.dataset.label);
  };
  const JARC = { Stomach: '#c9805a', Liver: '#8b3a3a', Lungs: '#5b8fb0', Gut: '#a8933f' };
  const jarSVG = (n) => `<svg viewBox="0 0 54 66"><path d="M12 18h30l5 10v22q0 12-20 12T7 50V28z" fill="${JARC[n]}" stroke="#2a1d05" stroke-width="2.500"/><rect x="10" y="6" width="34" height="14" rx="6" fill="#d9b25a" stroke="#2a1d05" stroke-width="2.500"/><path d="M18 36h18M18 44h18" stroke="rgba(0,0,0,.35)" stroke-width="3"/></svg>${n}`;
  PANELS.canopic = (b, h, m) => {
    const P = G.puzzles.canopic, st = S.ps.canopic || (S.ps.canopic = { place: [null, null, null, null], sel: null });
    b.append(E('p', 'help', T('grid')));
    const pl = E('div', 'plinths'), shelf = E('div', 'jarsrow'), msg = E('div', 'msg'), ok = mkConfirm(T('seal')), rl = E('div', 'rules');
    // each rule is checked live as soon as the jars it talks about are on plinths: 1 ok, 0 broken, null not enough jars yet
    const pos = () => Object.fromEntries(P.jars.map((n, j) => [n, st.place.indexOf(j)]));
    const RULES = [
      (q) => (q.Liver < 0 || q.Stomach < 0 || q.Lungs < 0) ? null : +(Math.abs(q.Liver - q.Stomach) === 1 && Math.abs(q.Liver - q.Lungs) === 1 && q.Liver > Math.min(q.Stomach, q.Lungs) && q.Liver < Math.max(q.Stomach, q.Lungs)),
      (q) => q.Gut < 0 ? null : +(q.Gut === 0 || q.Gut === 3),
      (q) => (q.Lungs < 0 || q.Stomach < 0) ? null : +(q.Lungs > q.Stomach),
      (q) => q.Lungs < 0 ? null : +(q.Lungs !== 3)];
    const drawRules = () => { const q = pos(); rl.innerHTML = P.rules.map((t, i) => { const r = RULES[i](q); return `<div class="rule ${r === 1 ? 'ok' : r === 0 ? 'bad' : ''}"><i>${r === 1 ? '✔' : r === 0 ? '✖' : '○'}</i><span>${t}</span></div>`; }).join(''); };
    const draw = () => {
      pl.innerHTML = ''; shelf.innerHTML = '';
      P.plinths.forEach((n, i) => {
        const j = st.place[i], o = E('div', 'opt plinth' + (st.sel !== null ? ' hl' : ''), ''); o.dataset.i = i; o.tabIndex = 0;
        if (j !== null) o.append(E('span', 'jar', jarSVG(P.jars[j])));
        o.append(E('span', '', n));
        o.onclick = () => { if (st.sel !== null) { st.place[i] = st.sel; st.sel = null; } else st.place[i] = null; draw(); }; pl.append(o);
      });
      P.jars.forEach((n, j) => {
        const placed = st.place.includes(j), o = E('button', 'jar' + (st.sel === j ? ' sel' : '') + (placed ? ' ph' : ''), jarSVG(n)); o.dataset.j = j;
        o.addEventListener('pointerdown', (e) => startDrag(e, j, o)); shelf.append(o);
      });
      ok.disabled = st.place.includes(null) || Date.now() < S.lockUntil; drawRules();
    };
    // drag a jar onto a plinth; a plain tap still selects the jar (then tap a plinth)
    function startDrag(e, j, src) {
      if (st.place.includes(j)) return; e.preventDefault(); const x0 = e.clientX, y0 = e.clientY; let ghost = null, over = null;
      const mv = (ev) => {
        if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) { ghost = E('div', 'jar ghost', jarSVG(P.jars[j])); document.body.append(ghost); src.classList.add('sel'); }
        if (!ghost) return; ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
        const t = document.elementsFromPoint(ev.clientX, ev.clientY).find((n) => n.classList && n.classList.contains('plinth')); if (over !== t) { over && over.classList.remove('drop'); over = t || null; over && over.classList.add('drop'); }
      };
      const up = (ev) => {
        document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
        if (!ghost) { st.sel = st.sel === j ? null : j; draw(); return; }
        ghost.remove(); if (over) { st.place[+over.dataset.i] = j; st.sel = null; } draw();
      };
      document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
    }
    ok.onclick = () => {
      const good = st.place.every((j, i) => P.jars[j] === P.answer[i]);
      if (good) return solve(h, m);
      Object.assign(st, { place: [null, null, null, null], sel: null }); wrong([ok], msg, 'The jars slide back to the shelf.'); draw(); applyLock(ok, ok.dataset.label);
    };
    b.append(E('div', 'sub2', 'Plinths'), pl, E('div', 'sub2', 'Shelf'), shelf, E('div', 'sub2', P.rulesHead), rl, msg, E('div', 'row')); b.lastChild.append(ok); draw(); applyLock(ok, ok.dataset.label);
  };
  const ankhSVG = (rot, frac, kind) => {
    const barY = 90 - frac * 44, col = kind === 'goal' ? 'none' : '#17110a', stroke = kind === 'goal' ? '#f5dc8a' : '#17110a', dash = kind === 'goal' ? 'stroke-dasharray="4 4"' : '', op = kind === 'goal' ? 1 : 0.8;
    return `<svg viewBox="0 0 100 100"><g transform="rotate(${rot} 50 50)" fill="none" stroke="${stroke}" stroke-width="6" stroke-linecap="${kind === 'goal' ? 'butt' : 'round'}" opacity="${op}" ${dash}><ellipse cx="50" cy="28" rx="14" ry="18"/><path d="M50 46V90"/><path d="M30 ${barY}H70"/></g></svg>`;
  };
  PANELS.dial = (b, h, m) => {
    const P = G.puzzles.dial, st = S.ps.dial || (S.ps.dial = { dir: 0, h: 0 }); b.append(E('p', 'help', T('dialHelp')));
    const walls = E('div', 'walls'), live = E('figure'), goal = E('figure'), msg = E('div', 'msg'), ok = mkConfirm();
    const w1 = E('div', 'wall', ankhSVG(0, P.bar[1], 'goal')), w2 = E('div', 'wall');
    goal.append(w1, E('figcaption', '', T('targetShape'))); live.append(w2, E('figcaption', '', T('liveShadow'))); walls.append(goal, live);
    const dg = E('div', 'dialgrid'), hg = E('div', 'hts');
    const draw = () => { w2.innerHTML = ankhSVG((st.dir - 2) * 45, P.bar[st.h]); dg.querySelectorAll('.opt').forEach((o, i) => o.classList.toggle('sel', i === st.dir)); hg.querySelectorAll('.opt').forEach((o, i) => o.classList.toggle('sel', i === st.h)); };
    T('dirs').forEach((d, i) => { const o = E('button', 'opt', d); o.onclick = () => { st.dir = i; draw(); }; dg.append(o); });
    T('heights').forEach((d, i) => { const o = E('button', 'opt', d); o.onclick = () => { st.h = i; draw(); }; hg.append(o); });
    ok.onclick = () => { if (st.dir === P.answer.dir && st.h === P.answer.height) { w2.classList.add('lit'); setTimeout(() => solve(h, m), 700); return; } wrong([ok], msg, ''); };
    b.append(walls, E('div', 'sub2', 'Statue faces'), dg, E('div', 'sub2', 'Disc height'), hg, msg, E('div', 'row')); b.lastChild.append(ok); draw(); applyLock(ok, ok.dataset.label);
  };
  PANELS.tiles = (b, h, m) => {
    const P = G.puzzles.tiles, N = P.size, traps = new Set(P.traps), nums = P.numbers;
    const st = S.ps.tiles || (S.ps.tiles = { pos: null, flags: [], trapSeen: [], steps: [] }); b.append(E('p', 'help', T('flagHelp')));
    const g = E('div', 'tiles'), msg = E('div', 'msg'), ent = E('div', 'entry', T('stepsBack')); const cells = {};
    const name = (r, c) => 'ABCDE'[c] + r;
    const adj = (r, c) => { if (!st.pos) return r === N; return Math.abs(st.pos.r - r) + Math.abs(st.pos.c - c) === 1; };
    const draw = () => {
      for (let r = 1; r <= N; r++) for (let c = 0; c < N; c++) {
        const id = name(r, c), t = cells[id], here = st.pos && st.pos.r === r && st.pos.c === c;
        t.className = 'tile' + (nums[id] ? ' num' : '') + (here ? ' here' : '') + (st.trapSeen.includes(id) ? ' trap' : '') + (st.flags.includes(id) ? ' flag' : '') + (st.steps.includes(id) ? ' step' : '') + (adj(r, c) && !here ? ' near' : '') + (r === 1 ? ' goal' : '');
        t.textContent = st.trapSeen.includes(id) ? 'X' : (nums[id] || '');
      }
      ent.className = 'entry' + (st.pos ? '' : ' here'); ent.textContent = st.pos ? T('stepsBack') : 'You are at the entry';
    };
    const step = (r, c) => {
      const id = name(r, c); if (Date.now() < S.lockUntil) { msg.textContent = T('locked').replace('{s}', Math.ceil((S.lockUntil - Date.now()) / 1000)); return; }
      if (st.flags.includes(id)) { msg.textContent = 'Remove the flag first (press and hold).'; return; }
      if (!adj(r, c)) { msg.className = 'msg'; msg.textContent = 'Step onto a tile next to you.'; return; }
      msg.textContent = '';
      if (traps.has(id)) {
        st.trapSeen.push(id); st.pos = null; st.steps = []; const b2 = cells[id].getBoundingClientRect(); fx.puff(b2.left + b2.width / 2, b2.top + b2.height / 2, '#c9a66b');
        wrong([], msg, 'A trap! You are back at the entry.'); draw(); return;
      }
      st.pos = { r, c }; st.steps.push(id); draw(); if (r === 1) setTimeout(() => solve(h, m), 500);
    };
    for (let r = 1; r <= N; r++) for (let c = 0; c < N; c++) {
      const t = E('button', 'tile'); cells[name(r, c)] = t; let timer = 0, fired = false;
      t.addEventListener('pointerdown', () => { fired = false; timer = setTimeout(() => { fired = true; const id = name(r, c), i = st.flags.indexOf(id); if (i >= 0) st.flags.splice(i, 1); else st.flags.push(id); draw(); }, 500); });
      const end = () => clearTimeout(timer); t.addEventListener('pointerleave', end); t.addEventListener('pointercancel', end);
      t.addEventListener('pointerup', () => { end(); if (!fired) step(r, c); }); t.addEventListener('contextmenu', (e) => e.preventDefault()); g.append(t);
    }
    b.append(g, ent, msg); draw();
  };
  PANELS.offering = (b, h, m) => {
    const P = G.puzzles.offering, st = S.ps.offering || (S.ps.offering = { fare: null, heart: null }); b.append(E('div', 'help', P.rules.map((r, i) => (i + 1) + '. ' + r).join('  ')));
    const list = E('div', 'offer'), hg = E('div', 'hearts'), msg = E('div', 'msg'), ok = mkConfirm();
    S.items.forEach((id) => { const it = G.items[id], o = E('button', 'opt fare', ''); o.append(itemIcon(id)); o.append(E('span', '', `${it.name}<small>${it.material}</small>`)); o.onclick = () => { st.fare = id; draw(); }; o.dataset.id = id; list.append(o); });
    P.hearts.forEach((hh) => { const o = E('button', 'opt', hh[1]); o.dataset.id = hh[0]; o.onclick = () => { st.heart = hh[0]; draw(); }; hg.append(o); });
    const draw = () => { list.querySelectorAll('.opt').forEach((o) => o.classList.toggle('sel', o.dataset.id === st.fare)); hg.querySelectorAll('.opt').forEach((o) => o.classList.toggle('sel', o.dataset.id === st.heart)); };
    ok.onclick = () => {
      if (!st.fare || !st.heart) { msg.className = 'msg'; msg.textContent = T('pickFirst'); return; }
      if (st.fare === P.fare && st.heart === P.heart) return solve(h, m);
      const why = st.fare !== P.fare ? (P.bad[G.items[st.fare].material] || '') : 'The river does not know that heart.';
      wrong([ok], msg, why);
    };
    b.append(E('div', 'sub2', T('chooseFare')), list, E('div', 'sub2', T('chooseHeart')), hg, msg, E('div', 'row')); b.lastChild.append(ok); draw(); applyLock(ok, ok.dataset.label);
  };

  /* ---------- room flow ---------- */
  async function roomSolved() {
    const r = R(), idx = S.room; S.roomDone[idx] = true; refreshHots();
    await say(r.right.concat([r.discuss]), { hold: true });
    if (S.room !== idx || S.phase !== 'play') return;
    addScore(CFG.score.roomReward); if (r.reward.toast) toast(r.reward.toast, 'good');
    if (r.reward.item) { giveItem(r.reward.item); await sleep(300); itemCard(r.reward.item, T('reward')); }
    if (r.reward.truth != null) { S.truths.push(r.reward.truth); newBadge(); toast(T('newTruth'), 'good'); }
    if (r.exit) showExit();
    refreshHots();
    if (!r.exit) { await sleep(1600); await goNext(); }
  }
  async function transition(fn) {
    const f = $('#fade'); f.style.opacity = 1; await sleep(650); await fn(); f.style.opacity = 0;
  }
  async function goNext() {
    if (S.room >= 6) return; closeAll(); setHeld(null);
    await transition(async () => { await loadRoom(S.room + 1); });
    playEnter();
  }
  async function loadRoom(i) {
    S.room = i; const st0 = G.rooms[i].start || {}; cam.yaw = st0.yaw || 0; cam.pitch = st0.pitch != null ? st0.pitch : (i === 6 ? 0 : 8); S.quiet = 0; const r = R(); loadPano(r);
    if (i === 6) { cam.yaw = -49; C.yaw = -49; }
    buildHots(); $('#objR').textContent = T('objective'); $('#dTitle').textContent = T('danger'); $('#sand').style.opacity = i === 6 ? 0.25 : 0.55;
    if (i === 6) { $('#strip').hidden = true; $('#objT').textContent = r.objective; }
    cam.vy = cam.vp = 0; syncCam(); await sleep(400);
  }
  async function playEnter() {
    const r = R(); S.idle = 0; const b = $('#banner'); b.innerHTML = `<h3>${r.id}. ${r.name}</h3><p>${r.objective}</p>`; b.hidden = false;
    const x = E('button', 'xbtn', '<svg class="ico"><use href="#i-x"/></svg>'); x.onclick = () => b.hidden = true; b.append(x);
    await say(r.enter, { hold: true });
    if (S.room === 6) {
      C.on = true; await say('r7.enter.3', { hold: true }); C.graceLeft = CFG.chase.graceSec; b.hidden = true;
    }
  }

  /* ---------- Room 7 chase ---------- */
  const C = { on: false, over: false, dist: 6, yaw: -49, unseen: 0, stare: 0, graceLeft: Infinity, said: new Set(), next: 0, busy: false, cracking: new Set(), glyphOut: 0 };
  function seshEl() {
    const s = $('#seshk'); s.innerHTML = ''; const w = E('div', 'sesh');
    if (HAS.has(G.assets.seshkara)) { const i = E('img'); i.src = G.assets.seshkara; w.append(i); } else w.innerHTML = '<div class="body"></div><div class="mask"></div><div class="eye a"></div><div class="eye b"></div>';
    w.append(E('div', 'gl', R().order.map((id) => glyph(R().stones.find((x) => x.id === id).glyph, '')).join(''))); s.append(w); s.style.display = 'block'; return w;
  }
  let seshW = null;
  function chaseFrame(dt) {
    const sk = $('#seshk');
    if (S.room !== 6 || !C.on) { if (sk.style.display !== 'none') sk.style.display = 'none'; $('#danger').hidden = true; return; }
    $('#danger').hidden = C.over;
    if (!seshW || !seshW.isConnected) seshW = seshEl();
    const B = basis(), p = proj(C.yaw, -18, B), scale = 1 + (6 - C.dist) * 0.35, k = (innerHeight * 0.30 * clamp(90 / cam.hfov, 0.85, 1.1) * scale) / 300;
    sk.style.display = 'block'; if (p) { seshW.style.display = ''; seshW.style.transform = `translate(${p.x}px,${p.y}px) scale(${k})`; seshW.style.setProperty('--k', k); } else seshW.style.display = 'none';
    const ch = CFG.chase, seen = Math.abs(angDiff(cam.yaw, C.yaw)) <= 0.5 * ch.seenFraction * cam.hfov, side = angDiff(cam.yaw, C.yaw) > 0 ? 'r' : 'l';
    // danger bar: fills as he gets closer and creeps up while he is out of view
    const run = !(C.over || frozen() || C.busy || C.graceLeft > 0);
    const close = clamp((ch.startDistance - C.dist + (!seen && C.graceLeft <= 0 ? C.unseen / ch.stepSec : 0)) / ch.startDistance, 0, 1);
    $('#dFill').style.width = Math.max(close * 100, 4) + '%';
    $('#danger').classList.toggle('hot', !seen && close > 0.3 || close > 0.6); $('#danger').classList.toggle('seen', seen);
    $('#dState').textContent = seen ? T('inView') : (side === 'r' ? T('lookRight') + ' ▶' : '◀ ' + T('lookLeft')); $('#dState').style.color = seen ? '' : (close > 0.5 ? '#ff8a70' : '#f0cf6a');
    seshW.style.setProperty('--near', close.toFixed(2));
    const eb = seen ? '' : side + Math.round(close * 4); if (eb !== C.eb) { C.eb = eb; fx.edge(seen ? '' : side, close); }
    C.mt = (C.mt || 0) + dt; if (C.mt > 0.12 && p && !C.over) { C.mt = 0; fx.mist(p.x, p.y - 140 * k); }
    C.mo = (C.mo || 0) + dt; if (C.mo > 3) { C.mo = 0; fx.motes(close > 0.5 ? '#ff9a8a' : '#e8dcb5'); }
    if (!run) { if (C.graceLeft > 0 && !(C.over || frozen() || C.busy)) C.graceLeft -= dt; return; }
    if (seen) {
      C.unseen = 0; C.stare += dt;
      if (C.stare >= ch.pushSec) { C.stare = 0; if (C.dist < ch.startDistance) { C.dist++; fx.stare(p && p.x, p && p.y - 100 * k); fx.near(C.dist); } }
    } else {
      C.stare = 0; C.unseen += dt;
      if (C.unseen >= ch.stepSec) { C.unseen = 0; stepCloser(); }
    }
  }
  function stepCloser() {
    const ch = CFG.chase; C.dist--; const opts = CFG.alcoves.filter((a) => Math.abs(angDiff(cam.yaw, a)) >= ch.minJumpDeg && a !== C.yaw); const a = opts[Math.floor(Math.random() * opts.length)];
    if (a != null) C.yaw = a; fx.step(angDiff(cam.yaw, C.yaw) > 0 ? 'r' : 'l'); fx.near(C.dist); ambient(); if (C.dist <= 0) die();
  }
  function ambient() { const id = { 4: 'r7.d4', 3: 'r7.d3', 2: 'r7.d2', 1: 'r7.d1' }[C.dist]; if (id && !C.said.has(id)) { C.said.add(id); say(id, { amb: true }); } }
  function tapStone(o) {
    if (!C.on || C.over || C.busy || C.cracking.has(o.h.id) || o.el.classList.contains('gone')) return;
    const p = proj(o.h.yaw, o.h.pitch, basis()) || { x: innerWidth / 2, y: innerHeight / 2 }, ok = R().order[C.next] === o.h.id;
    C.cracking.add(o.h.id); o.el.classList.add('crack'); fx.crack(p.x, p.y); setTimeout(() => fx.crack(p.x, p.y), CFG.chase.crackMs * 0.5);
    setTimeout(() => {
      C.cracking.delete(o.h.id); o.el.classList.remove('crack');
      if (C.over) return;
      if (!ok) { addScore(-CFG.score.wrong); fx.wrongStone(p.x, p.y); say('r7.wrong', { amb: true }); C.dist -= CFG.chase.wrongLunge; fx.near(Math.max(C.dist, 0)); ambient(); if (C.dist <= 0) die(); return; }
      o.el.classList.add('gone'); o.vis = false; C.next++; fx.rightStone(p.x, p.y);
      const gl = seshW && seshW.querySelectorAll('.gl svg'); if (gl && gl[C.next - 1]) gl[C.next - 1].classList.add('out');
      if (C.next >= 4) fourth(); else say('r7.right', { amb: true });
    }, CFG.chase.crackMs);
  }
  async function fourth() {
    C.over = true; C.busy = true; addScore(CFG.score.finalReward); const p = proj(C.yaw, -5, basis()) || { x: innerWidth / 2, y: innerHeight / 2 };
    fx.fourth(p.x, p.y); fx.near(6); if (seshW) seshW.classList.add('crumble'); await sleep(2300); S.pause.add('ending'); closeAll(); cinematic();
  }
  async function die() {
    if (C.over) return; C.over = true; endSeq(); fx.death(); await sleep(1700); endScreen('death');
  }

  /* ---------- ending ---------- */
  async function cinematic() {
    for (const step of G.cinematic) {
      if (typeof step === 'string') {
        await new Promise((res) => { const c = E('div', 'scr cine', `<div class="box">${step}<small>tap to continue</small></div>`); c.onclick = () => { c.remove(); res(); }; $('#screens').append(c); });
      } else await say(step.say);
    }
    S.pause.delete('ending'); const w = fx.win(); endScreen('win', w);
  }
  function endScreen(kind, extra) {
    if (S.phase === 'end') return; S.phase = 'end'; stopSpeech(); closeAll(); updateBlock(); $('#hud').hidden = true; endSeq(); $('#dlg').hidden = true; const e = G.endScreens[kind];
    if (kind === 'timeup') fx.timeUp();
    const delay = kind === 'timeup' ? 3200 : 0;
    setTimeout(() => {
      const s = E('div', 'scr end ' + kind, `<h1>${e.title}</h1><p>${e.text}</p>` + (kind === 'win' ? `<div class="big-score">${S.score} ${T('ankhs')}</div>` : ''));
      const b = E('button', 'btn big', e.button); b.onclick = () => location.reload(); s.append(b); $('#screens').append(s);
    }, delay);
  }

  /* ---------- pause ---------- */
  function openPause() {
    if (menuOpen || S.phase === 'title' || S.phase === 'end') return; menuOpen = true; S.pause.add('menu'); updateBlock(); try { speechSynthesis.cancel(); } catch (e) { } if (!VA.paused && !VA.ended) { VA.pause(); VA.dataset.resume = 1; }
    const m = $('#pausemenu'); m.hidden = false; m.innerHTML = '';
    const c = E('div', 'card'); c.append(E('h2', '', T('paused')), E('p', '', T('pauseResumeHint')));
    const rs = E('button', 'btn', T('resume')); rs.onclick = closePause; c.append(rs);
    const top = modals[modals.length - 1];
    if (top && top.restart) { const b = E('button', 'btn ghost', T('restartPanel')); b.onclick = () => { top.restart(); toast(T('restarted')); closePause(); }; c.append(b); }
    [['music', 'Music'], ['sfx', 'Sound effects'], ['voice', 'Narration']].forEach(([k, name]) => {
      const b = E('button', 'btn ghost'), L = () => { b.innerHTML = (HAS.has('assets/cut/icon_sound.png') ? '<img class="sndico" src="assets/cut/icon_sound.png" alt="">' : '') + name + ': ' + (fx.opt[k] ? 'On' : 'Off'); b.style.opacity = fx.opt[k] ? 1 : 0.7; };
      L(); b.onclick = () => { fx.opt[k] = !fx.opt[k]; fx.save(); L(); if (k === 'voice' && !fx.opt.voice) stopSpeech(); if (k === 'music') fx.music(); }; c.append(b);
    });
    const re = E('button', 'btn ghost', fx.reduce ? T('reduceOn') : T('reduceOff')); re.onclick = () => { fx.setReduce(!fx.reduce); re.textContent = fx.reduce ? T('reduceOn') : T('reduceOff'); }; c.append(re);
    m.append(c);
  }
  function closePause() { menuOpen = false; if (VA.dataset.resume && fx.opt.voice) { delete VA.dataset.resume; VA.play().catch(() => { }); } S.pause.delete('menu'); $('#pausemenu').hidden = true; updateBlock(); }
  $('#bPause').onclick = () => (menuOpen ? closePause() : openPause());
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (menuOpen) closePause(); else if (modals.length) modals[modals.length - 1].close(); else openPause(); return; }
    if (S.phase !== 'play' || modals.length || menuOpen) return;
    const a = 6; if (e.key === 'ArrowLeft') cam.yaw -= a; if (e.key === 'ArrowRight') cam.yaw += a; if (e.key === 'ArrowUp') cam.pitch += a; if (e.key === 'ArrowDown') cam.pitch -= a;
    if (e.key === 'b' || e.key === 'B') openBook();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.phase === 'play') openPause(); });

  /* ---------- input (drag to look, tap to interact) ---------- */
  (function () {
    const st = $('#stage'); let d = null, moved = 0;
    st.addEventListener('pointerdown', (e) => { d = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY }; moved = 0; cam.vy = cam.vp = 0; S.idle = 0; st.setPointerCapture(e.pointerId); st.classList.add('grabbing'); });
    st.addEventListener('pointermove', (e) => {
      if (!d || e.pointerId !== d.id) return; const k = cam.hfov / innerWidth, dx = e.clientX - d.lx, dy = e.clientY - d.ly; d.lx = e.clientX; d.ly = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 8) { cam.yaw -= dx * k; cam.pitch += dy * k; cam.vy = -dx * k * 30; cam.vp = dy * k * 30; cam.manual = true; }
    });
    const up = (e) => { if (!d || e.pointerId !== d.id) return; st.classList.remove('grabbing'); if (moved <= 8) { cam.vy = cam.vp = 0; tapAt(e.clientX, e.clientY); } d = null; };
    st.addEventListener('pointerup', up); st.addEventListener('pointercancel', () => { d = null; st.classList.remove('grabbing'); });
    st.addEventListener('wheel', (e) => { cam.hfov = clamp(cam.hfov + e.deltaY * 0.05, 50, 110); e.preventDefault(); }, { passive: false });
  })();
  addEventListener('resize', () => { if (!cam.manual) cam.hfov = baseHfov(); });

  /* ---------- main loop ---------- */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (S.phase === 'play' && S.pause.size === 0) {
      S.time -= dt; if (S.time <= 0) { S.time = 0; timeUp(); }
      S.quiet = (S.quiet || 0) + dt; S.idle += dt; if (S.idle >= CFG.idleSec && S.room !== 6 && !D.cur) { S.idle = 0; say('idle.1'); }
    }
    const sec = Math.ceil(S.time);
    if (sec !== shownSec) {
      shownSec = sec; $('#timerV').textContent = fmt(S.time); $('#timer').classList.toggle('low', S.time <= 60);
      const p = 1 - S.time / CFG.timerSeconds; $('#sandbar').style.setProperty('--p', (p * 100).toFixed(1) + '%'); $('#sand').style.height = (p * 20).toFixed(1) + '%';
    }
    if (Math.abs(cam.vy) > 0.05 || Math.abs(cam.vp) > 0.05) { cam.yaw += cam.vy * dt; cam.pitch += cam.vp * dt; const f = Math.pow(0.04, dt); cam.vy *= f; cam.vp *= f; }
    syncCam(); if (viewer) { try { cam.yaw = viewer.getYaw(); cam.pitch = viewer.getPitch(); } catch (e) { } }
    const B = basis(), s = clamp(90 / cam.hfov, 0.75, 1.4);
    for (const o of hots) {
      if (!o.vis) { if (o.ar) o.ar.style.display = 'none'; continue; } const p = proj(o.h.yaw, o.h.pitch, B);
      const off = !p || p.x < 0 || p.x > innerWidth || p.y < 0 || p.y > innerHeight, pend = o.h.kind !== 'STONE' && !S.done.has(o.h.id);
      if (pend && off && S.phase === 'play' && S.quiet > 25 && !modals.length && !menuOpen) {
        if (!o.ar) { o.ar = E('div', 'ar', '<svg class="ico"><use href="#i-arrow"/></svg>'); $('#hs').append(o.ar); }
        const dy = angDiff(cam.yaw, o.h.yaw), right = dy > 0, ty = clamp(innerHeight / 2 - (o.h.pitch - cam.pitch) * (innerHeight / (cam.hfov * innerHeight / innerWidth * 1.1)), 150, innerHeight - 190);
        o.ar.style.display = ''; o.ar.style.left = (right ? innerWidth - 46 : 6) + 'px'; o.ar.style.top = ty + 'px'; o.ar.classList.toggle('l', !right);
      } else if (o.ar) o.ar.style.display = 'none';
      if (!p || p.x < -100 || p.x > innerWidth + 100 || p.y < -100 || p.y > innerHeight + 100) { o.el.style.visibility = 'hidden'; continue; }
      o.el.style.visibility = ''; o.el.style.transform = `translate(${p.x}px,${p.y}px)`; o.el.style.setProperty('--s', s);
    }
    chaseFrame(dt);
    if (DEBUG && S.phase === 'play' && $('#dbg').hidden) { }
    requestAnimationFrame(frame);
  }
  function timeUp() {
    if (S.phase !== 'play') return; C.over = true; endSeq(); closeAll(); closePause(); endScreen('timeup');
  }

  /* ---------- start flow ---------- */
  function screen(cls, html) { const s = E('div', 'scr ' + cls, html); $('#screens').append(s); return s; }
  const emblem = '<svg class="emblem" viewBox="0 0 48 48"><ellipse cx="24" cy="27" rx="12" ry="15" fill="#3a7d83" stroke="#d4a017" stroke-width="2"/><path d="M24 12v30M12 22h24" stroke="#d4a017" stroke-width="2"/><circle cx="24" cy="9" r="4.500" fill="#3a7d83" stroke="#d4a017" stroke-width="2"/><path d="M12 22q-9-6-8-14M36 22q9-6 8-14" fill="none" stroke="#d4a017" stroke-width="2"/></svg>';
  function waitClick(btn) { return new Promise((res) => btn.addEventListener('click', res, { once: true })); }
  async function startFlow() {
    // 1 Tap to Start
    const t = screen('title', (HAS.has(G.assets.title) ? '' : emblem) + `<h1>${G.title}</h1><p class="tag">${G.tagline}</p>`);
    if (HAS.has(G.assets.title)) t.style.backgroundImage = `linear-gradient(rgba(0,0,0,.25),rgba(0,0,0,.55)),url(${G.assets.title})`;
    const sb = E('button', 'btn big', T('start')); t.append(sb); await waitClick(sb); S.started = true; fx.music();
    S.pause.add('intro'); S.phase = 'intro'; $('#app').classList.add('started', 'pre');
    const M = G.mission, br = screen('brief', (HAS.has(G.assets.briefing) ? '' : '<div class="fallback"></div>') + `<div class="txt"><div class="kick">${M.kicker}</div><h2>${M.heading}</h2>${M.paras.map((p) => '<p>' + p + '</p>').join('')}</div>`);
    br.style.animation = 'none'; if (HAS.has(G.assets.briefing)) br.style.backgroundImage = `url(${G.assets.briefing})`;
    t.remove();
    loadRoom(0).then(() => { $('#hs').style.display = 'none'; $('#pano').classList.add('blur'); });
    $('#strip').hidden = true; $('#objective').hidden = true; $('#bBook').disabled = true; $('#bHint').disabled = true;
    const bb = E('button', 'btn', T('begin')); br.querySelector('.txt').append(bb); narrate(M.paras.join(' '), 'narrator', M); await waitClick(bb); stopSpeech(); br.remove();
    // 3 spotlight tutorial
    $('#app').classList.remove('pre'); $('#hud').hidden = false; $('#objective').hidden = true; await tutorial();
    // 4 opening narration over blurred room
    $('#bBook').disabled = false; $('#bHint').disabled = false; $('#objective').hidden = false; refreshHots(); S.phase = 'intro';
    await say(['open.1', 'open.2', 'open.3', 'open.4']);
    // 5 play
    $('#pano').classList.remove('blur'); $('#hs').style.display = ''; S.pause.delete('intro'); S.phase = 'play'; updateBlock(); fx.calm(); S.idle = 0; refreshHint();
    playEnter();
  }
  async function tutorial() {
    const tut = E('div', ''); tut.id = 'tut'; const spot = E('div'); spot.id = 'spot'; const card = E('div'); card.id = 'tutcard'; const skip = E('button', 'btn ghost', T('skip')); tut.append(spot, card); $('#screens').append(tut);
    const sel = { stage: null, book: '#bBook', score: '#score', hint: '#bHint' };
    await new Promise((res) => {
      let i = 0; const show = () => {
        const s = G.tutorial[i]; let r;
        if (s.target === 'stage') { const w = innerWidth, h = innerHeight; r = { left: w * 0.12, top: h * 0.3, width: w * 0.76, height: h * 0.32 }; } else { const b = $(sel[s.target]).getBoundingClientRect(); r = { left: b.left - 6, top: b.top - 6, width: b.width + 12, height: b.height + 12 }; }
        Object.assign(spot.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
        card.innerHTML = `<div class="n">${i + 1} / ${G.tutorial.length}</div><p>${s.text}</p>`; const nx = E('button', 'btn', i === G.tutorial.length - 1 ? T('begin') : T('next')); nx.onclick = () => { stopSpeech(); if (++i >= G.tutorial.length) res(); else show(); }; const rw = E('div', 'row'); rw.append(nx, skip); card.append(rw);
        const below = r.top + r.height / 2 < innerHeight / 2; card.style.top = below ? Math.min(r.top + r.height + 18, innerHeight - 220) + 'px' : ''; card.style.bottom = below ? '' : '24px'; narrate(s.text, 'narrator', s);
      }; skip.onclick = () => { stopSpeech(); res(); }; show();
    });
    tut.remove();
  }

  /* ---------- boot ---------- */
  fx.init(CFG.particleCap); $('#scoreV').textContent = 0; refreshHint(); $('#timerV').textContent = fmt(S.time);
  const fade = E('div'); fade.id = 'fade'; fade.style.cssText = 'position:absolute;inset:0;z-index:76;background:#000;opacity:0;pointer-events:none;transition:opacity .6s'; $('#app').append(fade);
  requestAnimationFrame(frame);
  const qr = DEBUG && /[?&]room=(\d)/.exec(location.search);
  if (qr) { // debug shortcut: ?debug=1&room=N starts in room N with earlier rewards
    const n = +qr[1] - 1; S.started = true; S.phase = 'play'; $('#hud').hidden = false;
    G.rooms.slice(0, n).forEach((r, i) => { S.roomDone[i] = true; if (r.reward && r.reward.item) S.items.push(r.reward.item); if (r.reward && r.reward.truth != null) S.truths.push(r.reward.truth); r.hotspots.forEach((h) => S.done.add(h.id)); });
    G.rooms.slice(0, n).forEach((r) => r.hotspots.forEach((h) => { if (h.item && !(h.kind === 'FIND' && ['sun_disc', 'dial_handle'].includes(h.item))) S.items.push(h.item); }));
    S.score = 100; $('#scoreV').textContent = 100; refreshHint(); loadRoom(n).then(() => playEnter());
  } else startFlow();
})();
