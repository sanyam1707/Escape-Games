'use strict';
/* 360 base engine. All text and numbers come from game.json. Puzzle types live in puzzles/*.js and register with G360. */
window.G360 = {
  panels: {}, checks: {}, kinds: {}, hooks: { frame: [], roomLoaded: [], roomEntered: [] }, api: null,
  panel(name, fn, check) { this.panels[name] = fn; if (check) this.checks[name] = check; },   // fn(body, hotspot, modal, P, api)
  kind(name, def) { this.kinds[name] = def; },                                               // custom hotspot kind: {icon|html(h), hit(o), always, once}
  on(ev, fn) { this.hooks[ev].push(fn); }
};
(async function () {
  const $ = (s) => document.querySelector(s);
  const E = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
  const angDiff = (a, b) => ((b - a + 540) % 360) - 180;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const DEBUG = false;
  const fail = (msg) => { const d = E('pre', '', msg); d.style.cssText = 'position:fixed;z-index:999;inset:0;background:#300;color:#fff;padding:16px;overflow:auto;font:13px monospace;white-space:pre-wrap'; document.body.append(d); };

  let G;
  try { G = await (await fetch('game.json')).json(); } catch (e) { fail('Could not load game.json. Run with: python -m http.server'); return; }
  const CFG = Object.assign({ timerSeconds: 300, hintsTotal: 3, hintsPerRoom: 0, lockoutMs: 3000, idleSec: 40, timerOverlay: false, particleCap: { phone: 60, desktop: 120 } }, G.config);
  CFG.score = Object.assign({ item: 5, secret: 5, roomReward: 30, finalReward: 50, wrong: 10, hint: 25 }, (G.config || {}).score);
  const T = (k) => (G.ui[k] != null ? G.ui[k] : k);
  const TF = (k) => T(k).replace('{cost}', CFG.score.hint).replace('{score}', T('scoreName'));
  const DLG = {}; G.dialogue.forEach((d) => DLG[d.id] = d);
  const LAST = G.rooms.length - 1;
  document.title = G.title; document.documentElement.style.setProperty('--accent', (G.rooms[0] || {}).accent || '#D9A441');
  $('#bBook').setAttribute('aria-label', T('casebook')); $('#bHint').setAttribute('aria-label', T('hint')); $('#bPause').setAttribute('aria-label', T('pause')); $('#score').title = T('scoreName');

  /* ---------- load puzzle modules named in game.json ---------- */
  const loadScript = (src) => new Promise((res) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { console.error('module failed: ' + src); res(); }; document.head.append(s); });
  for (const m of (G.modules || [])) await loadScript('puzzles/' + m + '.js');

  /* ---------- validate ---------- */
  function validate() {
    const err = [], ids = new Set();
    for (const d of G.dialogue) if (typeof d.pausesTimer !== 'boolean') err.push('dialogue missing pausesTimer: ' + d.id);
    const needLine = (id, where) => { if (id && !DLG[id]) err.push('missing dialogue ' + id + ' in ' + where); };
    (G.opening || []).forEach((id) => needLine(id, 'opening')); if (!(G.opening || []).length) err.push('G.opening is empty'); needLine(G.idle, 'idle');
    if (G.rooms.length < 1) err.push('no rooms');
    G.rooms.forEach((R) => {
      const mine = new Set(R.hotspots.map((h) => h.id));
      (R.enter || []).concat(R.right || [], R.wrong || [], [R.discuss], [].concat(R.hint || [])).forEach((id) => needLine(id, 'room ' + R.id));
      if (!R.wrong || !R.wrong.length) err.push('room ' + R.id + ' has no wrong lines');
      R.hotspots.forEach((h) => {
        if (ids.has(h.id)) err.push('duplicate hotspot ' + h.id); ids.add(h.id);
        needLine(h.line, h.id);
        (h.after || []).forEach((a) => { if (!mine.has(a)) err.push(h.id + ' after unknown ' + a); });
        if (h.item && !G.items[h.item]) err.push(h.id + ' unknown item ' + h.item);
        if (h.needs && !G.items[h.needs]) err.push(h.id + ' unknown needs ' + h.needs);
        if (h.kind === 'PANEL') { if (!G360.panels[h.panel]) err.push(h.id + ' unknown panel module ' + h.panel + ' (add it to "modules")'); if (!G.puzzles[h.puzzle || h.panel]) err.push(h.id + ' missing puzzles.' + (h.puzzle || h.panel)); }
        else if (!['FIND', 'LEARN', 'INSPECT', 'USE', 'EXIT'].includes(h.kind) && !G360.kinds[h.kind]) err.push(h.id + ' unknown kind ' + h.kind);
      });
      const st = {}, byId = Object.fromEntries(R.hotspots.map((h) => [h.id, h]));
      const dfs = (id) => { if (st[id] === 2) return; if (st[id] === 1) { err.push('cycle at ' + id); return; } st[id] = 1; ((byId[id] || {}).after || []).forEach(dfs); st[id] = 2; };
      R.hotspots.forEach((h) => dfs(h.id));
      if (!R.hotspots.some((h) => h.kind === 'PANEL') && !R.noPanel) err.push('room ' + R.id + ' has no PANEL (set "noPanel": true for a deduction room)');
      if (R.reward && R.reward.item && !G.items[R.reward.item]) err.push('unknown reward item ' + R.reward.item);
      if (R.reward && R.reward.truth != null && !(G.truths || [])[R.reward.truth]) err.push('unknown reward truth ' + R.reward.truth);
    });
    return err;
  }
  const verr = validate();
  if (verr.length) { console.error('VALIDATE FAILED', verr); fail('game.json errors:\n' + verr.join('\n')); return; }

  /* ---------- assets with fallbacks ---------- */
  const HAS = new Set();
  const A = G.assets || {};
  const urls = [A.title, A.briefing].filter(Boolean).concat((A.cut || []).map((c) => 'assets/cut/' + c + '.png'), G.rooms.map((r) => r.pano));
  await Promise.all(urls.map((u) => fetch(u, { method: 'HEAD' }).then((r) => { if (r.ok) HAS.add(u); }).catch(() => { })));

  const GL = G.glyphs || {};   // name -> inner SVG paths on a 48x48 box (drawn by the game, never painted in art)
  const glyph = (n, cls) => `<svg class="${cls || 'g'}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${GL[n] || ''}</svg>`;
  const ICONS = Object.assign({
    paper: '<rect x="12" y="7" width="26" height="34" rx="3" fill="#e8dcb5" stroke="#8a6c22" stroke-width="2"/><path d="M17 15h16M17 21h16M17 27h12M17 33h10" stroke="#6b5420" stroke-width="2"/>',
    stone: '<path d="M10 42V18q0-10 14-10t14 10v24z" fill="#8d8472" stroke="#4b4338" stroke-width="2"/><path d="M17 20h14M17 26h14M17 32h9" stroke="#3b342b" stroke-width="2.500"/>',
    coin: '<circle cx="24" cy="24" r="16" fill="#b27a2c" stroke="#5e3d0c" stroke-width="2.500"/><circle cx="24" cy="24" r="9" fill="none" stroke="#f0cf6a" stroke-width="2"/>',
    key: '<path d="M24 24v18M16 33h16M24 24c-6 0-9-4-9-8a9 9 0 0 1 18 0c0 4-3 8-9 8z" fill="none" stroke="#e1a63c" stroke-width="4" stroke-linecap="round"/>',
    box: '<rect x="9" y="16" width="30" height="22" rx="3" fill="#a9733a" stroke="#4a2d0c" stroke-width="2"/><path d="M9 24h30M21 24v5h6v-5" stroke="#4a2d0c" stroke-width="2" fill="none"/>',
    gem: '<path d="M24 8l12 10-12 22L12 18z" fill="#3a7d83" stroke="#14393d" stroke-width="2"/><path d="M12 18h24M24 8v32" stroke="#14393d" stroke-width="1.500"/>'
  }, G.iconSvg || {});
  function itemIcon(id) {
    const u = 'assets/cut/' + id + '.png', it = G.items[id];
    if (HAS.has(u)) { const i = E('img', 'itemico'); i.src = u; i.alt = it.name; i.draggable = false; return i; }
    const s = E('div', 'itemico'); s.innerHTML = `<svg viewBox="0 0 48 48" width="100%" height="100%">${ICONS[it.icon] || ICONS.coin}</svg>`; return s;
  }
  document.querySelectorAll('img[data-ico]').forEach((i) => { const u = 'assets/cut/' + i.dataset.ico + '.png'; if (HAS.has(u)) { i.src = u; i.hidden = false; i.draggable = false; const f = i.parentElement.querySelector('.fb'); if (f) f.style.display = 'none'; i.parentElement.classList.add('art'); } });

  /* ---------- state ---------- */
  const S = {
    phase: 'title', room: 0, score: 0, hints: CFG.hintsTotal, time: CFG.timerSeconds, items: [], used: new Set(), done: new Set(), clues: [], truths: [],
    pause: new Set(), wrongN: {}, hintAt: {}, roomDone: {}, held: null, idle: 0, lockUntil: 0, ps: {}, newBadge: 0, started: false, hintPlaying: false, secrets: new Set(), quiet: 0
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
    if (d !== 0) { if (d < 0) fx.sfx('bad'); const f = E('div', 'float' + (d < 0 ? ' neg' : ''), (d > 0 ? '+' : '') + d + ' ' + T('scoreName')); const r = $('#score').getBoundingClientRect(); f.style.left = (x != null ? x - 40 : r.left) + 'px'; f.style.top = (y != null ? y : r.bottom + 6) + 'px'; $('#app').append(f); setTimeout(() => f.remove(), 1200); }
    refreshHint();
  }
  function refreshHint() {
    $('#hintN').textContent = S.hints; $('#hintN').classList.toggle('zero', S.hints <= 0);
    $('#bHint').classList.toggle('dim', S.hints <= 0 || S.score < CFG.score.hint);
  }
  const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  function updateBlock() {
    document.body.classList.toggle('modal-open', modals.length > 0); $('#stage').classList.toggle('off', modals.length > 0 || menuOpen || S.phase !== 'play');
    if (modals.length || menuOpen) Snd.pauseVoice(); else Snd.resumeVoice();   // a panel, card or menu holds the voice line; closing continues it
  }
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

  /* ---------- dialogue ---------- */
  const D = { q: [], cur: null, timer: 0, tok: 0 };
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
  function pump() { if (D.cur || !D.q.length) return; const s = D.q.shift(); D.cur = s; S.hintPlaying = !!s.hint; showLine(); }
  function showLine() {
    const s = D.cur, line = DLG[s.ids[s.i]], tok = ++D.tok; s.line = line; clearTimeout(D.timer);
    const spk = G.speakers[line.speaker];
    bust(line.speaker, line.mood); $('#dName').textContent = spk.name; $('#dText').textContent = line.text; $('#dlg').hidden = false;
    $('#dlg').classList.toggle('amb', !!s.amb); $('#dSkip').hidden = !!s.amb; document.body.classList.add('dlg-open');
    if (line.pausesTimer) S.pause.add('dlg'); else S.pause.delete('dlg');
    const p = Snd.narrate(line, spk), nx = DLG[s.ids[s.i + 1]]; Snd.preload(nx);
    if (s.amb) { // ambient lines (shown over play) advance on their own; story lines always wait for a tap
      const hasAudio = !!line.audioFile && Snd.voiceOn;
      D.timer = setTimeout(advance, hasAudio ? 12000 : 2200 + line.text.length * 55);
      if (hasAudio) p.then(() => { if (D.tok === tok && D.cur === s) { clearTimeout(D.timer); D.timer = setTimeout(advance, 700); } });
    }
    updateBlock();
  }
  function advance() { Snd.cancelVoice(); const s = D.cur; if (!s) return; s.i++; if (s.i >= s.ids.length) endSeq(); else showLine(); }
  function endSeq(silent) {
    const s = D.cur; if (!s) return; clearTimeout(D.timer); D.cur = null; S.hintPlaying = false; S.pause.delete('dlg');
    if (!silent) { $('#dlg').hidden = true; document.body.classList.remove('dlg-open'); }
    Snd.cancelVoice(); s.res(); if (!silent) pump(); updateBlock();
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
    $('#pano').innerHTML = ''; document.documentElement.style.setProperty('--accent', room.accent || '#D9A441');
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
  const KIND_ICON = { LEARN: 'i-star', INSPECT: 'i-eye', USE: 'i-hand', PANEL: 'i-panel', EXIT: 'i-door' };
  function hsEl(h) {
    const k = h.kind.toLowerCase(), box = E('div', 'hs ' + k), i = E('i'), K = G360.kinds[h.kind];
    box.append(i);
    if (h.kind === 'FIND') i.append(itemIcon(h.item));
    else if (K && K.html) i.innerHTML = K.html(h);
    else i.innerHTML = '<svg class="ico"><use href="#' + ((K && K.icon) || KIND_ICON[h.kind] || 'i-star') + '"/></svg>';
    $('#hs').append(box); return box;
  }
  function buildHots() {
    $('#hs').innerHTML = ''; hots = []; exitHot = null; const r = R();
    r.hotspots.forEach((h) => hots.push({ h, el: hsEl(h), vis: false }));
    if (S.roomDone[S.room] && r.exit) showExit(true);
    refreshHots();
  }
  function showExit(instant) {
    const r = R(); if (!r.exit || exitHot) return;
    const h = { id: 'r' + r.id + '.exit', kind: 'EXIT', label: r.exit.label, yaw: r.exit.yaw, pitch: r.exit.pitch }, el = hsEl(h);
    if (!instant) el.classList.add('fadein'); exitHot = { h, el, vis: true }; hots.push(exitHot);
  }
  const unlocked = (h) => (h.after || []).every((a) => S.done.has(a));
  function visible(h) {
    const K = G360.kinds[h.kind];
    if (h.kind === 'EXIT' || (K && K.always)) return true;
    if (!unlocked(h)) return false;
    if (S.roomDone[S.room] && h.kind === 'PANEL') return false;
    return !(['FIND', 'USE', 'PANEL'].includes(h.kind) || (K && K.once)) || !S.done.has(h.id);
  }
  function refreshHots() {
    hots.forEach((o) => { o.vis = visible(o.h); o.el.style.display = o.vis ? '' : 'none'; if (o.h.kind === 'LEARN') o.el.classList.toggle('done', S.done.has(o.h.id)); });
    const r = R(), panel = r.hotspots.find((h) => h.kind === 'PANEL');
    $('#objT').textContent = exitHot ? T('takeExit') : (S.roomDone[S.room] ? r.objective : (panel && unlocked(panel) && r.objectiveReady ? r.objectiveReady : r.objective));
    const finds = r.hotspots.filter((h) => h.kind === 'FIND'), st = $('#strip'); st.innerHTML = ''; st.hidden = !finds.length;
    if (finds.length) { st.append(E('small', '', T('findStrip'))); finds.forEach((h) => { const got = S.done.has(h.id), c = E('div', 'sl' + (got ? ' got' : '')); if (got) c.append(itemIcon(h.item)); else c.textContent = '?'; c.title = got ? G.items[h.item].name : '?'; st.append(c); }); }
  }
  function tapAt(x, y) {
    if (D.cur && D.cur.line.pausesTimer) { advance(); return; }
    const B = basis(), s = clamp(90 / cam.hfov, 0.75, 1.4); let best = null, bd = 1e9;
    for (const o of hots) {
      if (!o.vis) continue; const p = proj(o.h.yaw, o.h.pitch, B); if (!p) continue;
      const d = Math.hypot(p.x - x, p.y - y), rr = (o.h.hitRadius || 36) * s; if (d < rr && d < bd) { bd = d; best = o; }
    }
    if (DEBUG) { const u = unproj(x, y); const t = 'yaw ' + u.yaw.toFixed(1) + ' pitch ' + u.pitch.toFixed(1); $('#dbg').hidden = false; $('#dbg').textContent = t; console.log(t); }
    if (best) hit(best);
  }
  function hit(o) {
    const h = o.h; S.idle = 0; S.quiet = 0; $('#banner').hidden = true;
    if (S.held && h.kind !== 'USE' && h.kind !== 'EXIT') { toast(T('useNothing')); return; }
    const K = G360.kinds[h.kind]; if (K && K.hit) return K.hit(o, api);
    switch (h.kind) {
      case 'FIND': return doFind(o);
      case 'LEARN': return doLearn(h);
      case 'INSPECT': return doInspect(h);
      case 'USE': return doUse(o);
      case 'PANEL': return openPanel(h);
      case 'EXIT': return goNext();
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
    const h = o.h; S.done.add(h.id); giveItem(h.item); Snd.fx('key');
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
    const m = openCard({ cls: 'book' }); m.isBook = true; const tabs = E('div', 'tabs'), bk = E('div', 'bk'), hasT = (G.truths || []).length > 0;
    const tI = E('button', 'tab', T('tabItems')), tT = E('button', 'tab', T('tabTruths')); tabs.append(tI); if (hasT) tabs.append(tT); m.body.append(tabs, bk);
    const items = () => {
      bk.innerHTML = ''; tI.classList.add('on'); tT.classList.remove('on');
      if (!S.items.length) { bk.append(E('div', 'empty', T('noItems'))); }
      S.items.forEach((id) => {
        const it = G.items[id], r = E('div', 'irow' + (S.used.has('_' + id) ? ' used' : '')), ic = itemIcon(id), tx = E('div', '', `<h4>${it.name}</h4><small>${it.material}</small><p>${it.text}</p>`);
        r.append(ic, tx);
        if (it.usable && !S.used.has('_' + id)) { const b = E('button', 'btn', T('hold')); b.style.cssText = 'margin-top:8px;min-height:40px;padding:4px 14px;font-size:13px'; b.onclick = () => { setHeld(id); m.close(); toast(T('holdHelp'), 'good'); }; tx.append(b); }
        bk.append(r);
      });
      if (!hasT && S.clues.length) { bk.append(E('h5', '', T('notes'))); S.clues.forEach((c) => bk.append(E('div', 'note', `<b>${c.title}</b>${c.text}`))); }
    };
    const truths = () => {
      bk.innerHTML = ''; tT.classList.add('on'); tI.classList.remove('on');
      if (!S.truths.length) bk.append(E('div', 'empty', T('noTruths')));
      S.truths.forEach((t) => bk.append(E('div', 'truth', `<b>${t + 1}</b><span>${G.truths[t]}</span>`)));
      if (S.clues.length) { bk.append(E('h5', '', T('notes'))); S.clues.forEach((c) => bk.append(E('div', 'note', `<b>${c.title}</b>${c.text}`))); }
    };
    tI.onclick = items; tT.onclick = truths; (tab === 'truths' && hasT ? truths : items)();
  }
  $('#bBook').onclick = () => openBook();

  /* ---------- hints ---------- */
  function useHint() {
    if (S.phase !== 'play') return;
    if (S.hints <= 0) { toast(T('hintNone'), 'bad'); return; }
    if (S.score < CFG.score.hint) { toast(TF('hintPoor'), 'bad'); return; }
    if (S.roomDone[S.room]) { toast(T('hintDone'), 'good'); return; }
    const used = S.hintAt[S.room] || 0;
    if (CFG.hintsPerRoom && used >= CFG.hintsPerRoom) { toast(T('hintNone'), 'bad'); return; }
    S.hintAt[S.room] = used + 1; S.hints--; addScore(-CFG.score.hint); toast(TF('hintUsed'), 'good');
    const hs = [].concat(R().hint); say(hs[Math.min(used, hs.length - 1)], { hint: true });
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
  function wrong(btns, msgEl, text, o) {   // o.free = no points lost and no lockout (rooms the plan marks as penalty-free)
    o = o || {}; const r = R(); S.wrongN[S.room] = (S.wrongN[S.room] || 0) + 1;
    if (!o.free) { addScore(-CFG.score.wrong); S.lockUntil = Date.now() + (o.lockoutMs || CFG.lockoutMs); btns.forEach((b) => applyLock(b, b.dataset.label)); } else fx.sfx('bad');
    if (msgEl) { msgEl.className = 'msg'; msgEl.textContent = text || ''; }
    say(r.wrong[Math.min(S.wrongN[S.room] - 1, r.wrong.length - 1)]);
  }
  const mkConfirm = (label) => { const b = E('button', 'btn', label || T('confirm')); b.dataset.label = b.textContent; return b; };

  /* ---------- panels (puzzle modules register with G360.panel) ---------- */
  function openPanel(h) {
    const fn = G360.panels[h.panel], P = G.puzzles[h.puzzle || h.panel]; let m; const make = () => { m.body.replaceChildren(); fn(m.body, h, m, P, api); };
    m = openCard({ title: h.label, restart() { delete S.ps[h.id]; make(); } }); make(); return m;
  }
  function solve(h, m) {   // a room is solved when ALL its PANEL hotspots are done (rooms may have two panels)
    S.done.add(h.id); Snd.fx('chime'); if (m) m.close();
    if (R().hotspots.some((x) => x.kind === 'PANEL' && !S.done.has(x.id))) { refreshHots(); return; }
    roomSolved();
  }

  /* ---------- room flow ---------- */
  async function roomSolved() {
    const r = R(), idx = S.room, last = idx === LAST; S.roomDone[idx] = true; refreshHots();
    await say(r.right.concat([r.discuss]), { hold: true });
    if (S.room !== idx || S.phase !== 'play') return;           // the reward waits for the narration (finished or skipped)
    addScore(last ? CFG.score.finalReward : CFG.score.roomReward); if (r.reward && r.reward.toast) toast(r.reward.toast, 'good');
    if (r.reward && r.reward.item) { giveItem(r.reward.item); if (!last) { await sleep(300); itemCard(r.reward.item, T('reward')); } }
    if (r.reward && r.reward.truth != null) { S.truths.push(r.reward.truth); newBadge(); toast(T('newTruth'), 'good'); }
    if (last) { await sleep(1200); S.pause.add('ending'); closeAll(); return cinematic(); }
    if (r.exit) showExit();
    refreshHots();
    if (!r.exit) { await sleep(1600); await goNext(); }
  }
  async function transition(fn) { const f = $('#fade'); f.style.opacity = 1; await sleep(650); await fn(); f.style.opacity = 0; }
  async function goNext() {
    if (S.room >= LAST) return; closeAll(); setHeld(null);
    await transition(async () => { await loadRoom(S.room + 1); });
    playEnter();
  }
  async function loadRoom(i) {
    S.room = i; const st0 = G.rooms[i].start || {}; cam.yaw = st0.yaw || 0; cam.pitch = st0.pitch != null ? st0.pitch : 8; S.quiet = 0; const r = R(); loadPano(r);
    buildHots(); $('#objR').textContent = T('objective');
    cam.vy = cam.vp = 0; syncCam(); G360.hooks.roomLoaded.forEach((f) => f(r, i, api)); await sleep(400);
  }
  async function playEnter() {
    const r = R(); S.idle = 0; const b = $('#banner'); b.innerHTML = `<h3>${r.id}. ${r.name}</h3><p>${r.objective}</p>`; b.hidden = false;
    const x = E('button', 'xbtn', '<svg class="ico"><use href="#i-x"/></svg>'); x.onclick = () => b.hidden = true; b.append(x);
    await say(r.enter, { hold: true });
    G360.hooks.roomEntered.forEach((f) => f(r, S.room, api));
  }

  /* ---------- ending ---------- */
  async function cinematic() {
    for (let step of (G.cinematic || [])) {
      if (step && step.ending) step = S.ending || step.fallback || '';   // {ending:true, fallback:'..'}: closing line set by the 'story' panel
      if (typeof step === 'string') {
        await new Promise((res) => { const c = E('div', 'scr cine', `<div class="box">${step}<small>${T('tapContinue')}</small></div>`); c.onclick = () => { c.remove(); res(); }; $('#screens').append(c); });
      } else await say(step.say);
    }
    S.pause.delete('ending'); const w = fx.win(); endScreen('win', w);
  }
  function endScreen(kind) {
    if (S.phase === 'end') return; S.phase = 'end'; Snd.cancelVoice(); closeAll(); updateBlock(); $('#hud').hidden = true; endSeq(); $('#dlg').hidden = true; Snd.stopMusic(); const e = G.endScreens[kind] || G.endScreens.timeup;
    if (kind === 'timeup') fx.timeUp();
    const delay = kind === 'timeup' ? 3200 : 0;
    setTimeout(() => {
      const s = E('div', 'scr end ' + kind, `<h1>${e.title}</h1><p>${e.text}</p>` + (kind === 'win' ? `<div class="big-score">${S.score} ${T('scoreName')}</div>` : ''));
      const b = E('button', 'btn big', e.button); b.onclick = () => location.reload(); s.append(b); $('#screens').append(s);
    }, delay);
  }

  /* ---------- pause ---------- */
  function openPause() {
    if (menuOpen || S.phase === 'title' || S.phase === 'end') return; menuOpen = true; S.pause.add('menu'); updateBlock();
    const m = $('#pausemenu'); m.hidden = false; m.innerHTML = '';
    const c = E('div', 'card'); c.append(E('h2', '', T('paused')), E('p', '', T('pauseResumeHint')));
    const rs = E('button', 'btn', T('resume')); rs.onclick = closePause; c.append(rs);
    const top = modals[modals.length - 1];
    if (top && top.restart) { const b = E('button', 'btn ghost', T('restartPanel')); b.onclick = () => { top.restart(); toast(T('restarted')); closePause(); }; c.append(b); }
    const snd = E('button', 'btn ghost'), vo = E('button', 'btn ghost');
    const L = () => { snd.textContent = Snd.soundOn ? T('soundOn') : T('soundOff'); vo.textContent = Snd.voiceOn ? T('voiceOn') : T('voiceOff'); };
    snd.onclick = () => { Snd.setSound(!Snd.soundOn); L(); }; vo.onclick = () => { Snd.setVoice(!Snd.voiceOn); L(); };
    L(); c.append(snd, vo); m.append(c);
  }
  function closePause() { menuOpen = false; S.pause.delete('menu'); $('#pausemenu').hidden = true; updateBlock(); }
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
    if (S.phase === 'play' && S.pause.size === 0) {   // open panels and clue cards never stop the clock; only S.pause entries do (menu, intro, ending, pausing dialogue)
      S.time -= dt; if (S.time <= 0) { S.time = 0; timeUp(); }
      S.quiet += dt; S.idle += dt; if (G.idle && S.idle >= CFG.idleSec && !D.cur && !modals.length) { S.idle = 0; say(G.idle); }
    }
    const sec = Math.ceil(S.time);
    if (sec !== shownSec) {
      shownSec = sec; $('#timerV').textContent = fmt(S.time); $('#timer').classList.toggle('low', S.time <= 60);
      const p = 1 - S.time / CFG.timerSeconds; $('#sandbar').style.setProperty('--p', (p * 100).toFixed(1) + '%');
    }
    if (Math.abs(cam.vy) > 0.05 || Math.abs(cam.vp) > 0.05) { cam.yaw += cam.vy * dt; cam.pitch += cam.vp * dt; const f = Math.pow(0.04, dt); cam.vy *= f; cam.vp *= f; }
    syncCam(); if (viewer) { try { cam.yaw = viewer.getYaw(); cam.pitch = viewer.getPitch(); } catch (e) { } }
    const B = basis(), s = clamp(90 / cam.hfov, 0.75, 1.4);
    for (const o of hots) {
      if (!o.vis) { if (o.ar) o.ar.style.display = 'none'; continue; } const p = proj(o.h.yaw, o.h.pitch, B);
      const off = !p || p.x < 0 || p.x > innerWidth || p.y < 0 || p.y > innerHeight, pend = !(G360.kinds[o.h.kind] && G360.kinds[o.h.kind].always) && !S.done.has(o.h.id);
      if (CFG.guide && pend && off && S.phase === 'play' && S.quiet > 25 && !modals.length && !menuOpen) {
        if (!o.ar) { o.ar = E('div', 'ar', '<svg class="ico"><use href="#i-arrow"/></svg>'); $('#hs').append(o.ar); }
        const dy = angDiff(cam.yaw, o.h.yaw), right = dy > 0, ty = clamp(innerHeight / 2 - (o.h.pitch - cam.pitch) * (innerHeight / (cam.hfov * innerHeight / innerWidth * 1.1)), 150, innerHeight - 190);
        o.ar.style.display = ''; o.ar.style.left = (right ? innerWidth - 46 : 6) + 'px'; o.ar.style.top = ty + 'px'; o.ar.classList.toggle('l', !right);
      } else if (o.ar) o.ar.style.display = 'none';
      if (!p || p.x < -100 || p.x > innerWidth + 100 || p.y < -100 || p.y > innerHeight + 100) { o.el.style.visibility = 'hidden'; continue; }
      o.el.style.visibility = ''; o.el.style.transform = `translate(${p.x}px,${p.y}px)`; o.el.style.setProperty('--s', s);
    }
    G360.hooks.frame.forEach((f) => f(dt, api));
    requestAnimationFrame(frame);
  }
  function timeUp() { if (S.phase !== 'play') return; endSeq(); closeAll(); closePause(); endScreen('timeup'); }

  /* ---------- start flow (fixed order: tap to start, mission page, tutorial, opening narration, play) ---------- */
  function screen(cls, html) { const s = E('div', 'scr ' + cls, html); $('#screens').append(s); return s; }
  const emblem = G.emblemSvg || '<svg class="emblem" viewBox="0 0 48 48"><circle cx="24" cy="24" r="19" fill="none" stroke="currentColor" stroke-width="2"/><path d="M24 9l4.500 10H39l-8.500 6.500L34 36l-10-7-10 7 3.500-10.500L9 19h10.500z" fill="currentColor"/></svg>';
  const waitClick = (btn) => new Promise((res) => btn.addEventListener('click', res, { once: true }));
  async function startFlow() {
    const t = screen('title', (HAS.has(A.title) ? '' : emblem) + `<h1>${G.title}</h1><p class="tag">${G.tagline}</p>`);
    if (HAS.has(A.title)) t.style.backgroundImage = `linear-gradient(rgba(0,0,0,.25),rgba(0,0,0,.55)),url(${A.title})`;
    const sb = E('button', 'btn big', T('start')); t.append(sb); await waitClick(sb); S.started = true; Snd.start(); Snd.setRoom(0, A.music);
    S.pause.add('intro'); S.phase = 'intro'; $('#app').classList.add('started', 'pre');
    const M = G.mission, br = screen('brief', (HAS.has(A.briefing) ? '' : '<div class="fallback"></div>') + `<div class="txt"><div class="kick">${M.kicker}</div><h2>${M.heading}</h2>${M.paras.map((p) => '<p>' + p + '</p>').join('')}</div>`);
    br.style.animation = 'none'; if (HAS.has(A.briefing)) br.style.backgroundImage = `url(${A.briefing})`;
    t.remove();
    loadRoom(0).then(() => { $('#hs').style.display = 'none'; $('#pano').classList.add('blur'); });
    $('#strip').hidden = true; $('#objective').hidden = true; $('#bBook').disabled = true; $('#bHint').disabled = true;
    const bb = E('button', 'btn', T('begin')); br.querySelector('.txt').append(bb); Snd.narrate({ text: M.paras.join(' '), audioFile: M.audioFile }, G.speakers.narrator); await waitClick(bb); Snd.cancelVoice(); br.remove();
    $('#app').classList.remove('pre'); $('#hud').hidden = false; $('#objective').hidden = true; await tutorial();
    $('#bBook').disabled = false; $('#bHint').disabled = false; $('#objective').hidden = false; refreshHots(); S.phase = 'intro';
    await say(G.opening);
    $('#pano').classList.remove('blur'); $('#hs').style.display = ''; S.pause.delete('intro'); S.phase = 'play'; updateBlock(); fx.calm(); S.idle = 0; refreshHint();
    playEnter();
  }
  async function tutorial() {
    const tut = E('div', ''); tut.id = 'tut'; const spot = E('div'); spot.id = 'spot'; const card = E('div'); card.id = 'tutcard'; const skip = E('button', 'btn ghost', T('skip')); tut.append(spot, card); $('#screens').append(tut);
    const sel = { stage: null, book: '#bBook', score: '#score', hint: '#bHint', timer: '#timer' };
    await new Promise((res) => {
      let i = 0; const show = () => {
        const s = G.tutorial[i]; let r;
        if (s.target === 'stage') { const w = innerWidth, h = innerHeight; r = { left: w * 0.12, top: h * 0.3, width: w * 0.76, height: h * 0.32 }; } else { const b = $(sel[s.target]).getBoundingClientRect(); r = { left: b.left - 6, top: b.top - 6, width: b.width + 12, height: b.height + 12 }; }
        Object.assign(spot.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
        card.innerHTML = `<div class="n">${i + 1} / ${G.tutorial.length}</div><p>${s.text}</p>`; const nx = E('button', 'btn', i === G.tutorial.length - 1 ? T('begin') : T('next')); nx.onclick = () => { Snd.cancelVoice(); if (++i >= G.tutorial.length) res(); else show(); }; const rw = E('div', 'row'); rw.append(nx, skip); card.append(rw);
        const below = r.top + r.height / 2 < innerHeight / 2; card.style.top = below ? Math.min(r.top + r.height + 18, innerHeight - 220) + 'px' : ''; card.style.bottom = below ? '' : '24px'; Snd.narrate(s, G.speakers.narrator);
      }; skip.onclick = () => { Snd.cancelVoice(); res(); }; show();
    });
    tut.remove();
  }

  /* ---------- api for puzzle modules ---------- */
  const api = { $, E, G, S, CFG, T, TF, fx, Snd, glyph, toast, say, sleep, clamp, addScore, solve, wrong, mkConfirm, applyLock, openCard, closeAll, R, roomSolved, itemIcon, giveItem, refreshHots, loadRoom, endScreen, cam, proj, basis, angDiff, frozen, HAS, hots: () => hots };
  G360.api = api;

  /* ---------- boot ---------- */
  fx.init(CFG.particleCap); $('#scoreV').textContent = 0; refreshHint(); $('#timerV').textContent = fmt(S.time);
  const fade = E('div'); fade.id = 'fade'; fade.style.cssText = 'position:absolute;inset:0;z-index:76;background:#000;opacity:0;pointer-events:none;transition:opacity .6s'; $('#app').append(fade);
  const skipAll = async () => { for (let n = 0; n < 60 && (D.cur || D.q.length); n++) { endSeq(); await sleep(20); } };
  requestAnimationFrame(frame);
  const qr = DEBUG && /[?&]room=(\d+)/.exec(location.search);
  if (qr) { // debug shortcut: ?debug=1&room=N starts in room N with earlier rewards
    const n = +qr[1] - 1; S.started = true; S.phase = 'play'; $('#hud').hidden = false;
    G.rooms.slice(0, n).forEach((r, i) => { S.roomDone[i] = true; if (r.reward && r.reward.item) S.items.push(r.reward.item); if (r.reward && r.reward.truth != null) S.truths.push(r.reward.truth); r.hotspots.forEach((h) => { S.done.add(h.id); if (h.kind === 'FIND' && h.item) S.items.push(h.item); }); });
    S.score = 100; $('#scoreV').textContent = 100; refreshHint(); loadRoom(n).then(() => playEnter());
  } else startFlow();
})();
