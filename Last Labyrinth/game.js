/* game.js - The Last Labyrinth engine. Everything (text, ids, numbers, hotspots, puzzle data) comes from game.json. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const DEBUG = /[?&]debug=1/.test(location.search) && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const ROOMS = 'assets/rooms/', CUT = 'assets/cut/', SHEETS = 'assets/sheets/';
  let D, UI, CFG;

  const S = {
    gesture: false, playing: false, ended: false, won: false, time: 0, score: 0, hints: 0, room: 0,
    done: new Set(), items: [], used: new Set(), notes: [], marks: 0, hintLog: [], hold: null, pstate: {}, wrongN: {}, hintN: {},
    finished: {}, rewarded: {}, panel: null, pauseMenu: false, dlgPause: false, cinematic: false, transition: false, soundOn: true, musicOn: true, sfxOn: true,
    lastTap: 0, lastIdle: 0, roomReady: false, secrets: 0, choice: null,
  };
  const room = () => D.rooms[S.room];
  const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => ({ lockout: CFG.lockoutMs / 1000, wrong: CFG.points.wrong, hints: CFG.hintsTotal, hint: CFG.points.hint, time: Math.round(CFG.timerSeconds / 60), ...v }[k] ?? m));
  const maxScore = () => { const P = CFG.points; let finds = 0, secrets = 0; D.rooms.forEach((r) => r.hotspots.forEach((h) => { if (h.kind === 'FIND' || h.gives) finds++; if (h.secret) secrets++; })); return finds * P.find + secrets * P.secret + D.rooms.filter((r) => !r.final).length * P.room + P.final1 + P.choice; };

  /* ================= art with fallbacks ================= */
  const SVG = {
    journal: '<path d="M11 15h11c2 0 3 1 3 3v16c-1-1-2-1-3-1H11zM37 15H26c-2 0-3 1-3 3v16c1-1 2-1 3-1h11z" fill="#e8dfc8" stroke="#1b1407" stroke-width="2"/>',
    hint: '<path d="M24 9c-6 0-9 4-9 9 0 4 3 6 4 9h10c1-3 4-5 4-9 0-5-3-9-9-9z" fill="#e8c25a" stroke="#1b1407" stroke-width="2"/><rect x="19" y="30" width="10" height="6" rx="2" fill="#b8923a" stroke="#1b1407" stroke-width="2"/>',
    pause: '<rect x="14" y="13" width="7" height="22" rx="2" fill="#e8dfc8"/><rect x="27" y="13" width="7" height="22" rx="2" fill="#e8dfc8"/>',
    close: '<path d="M15 15l18 18M33 15L15 33" stroke="#e8dfc8" stroke-width="5" stroke-linecap="round"/>',
    clock: '<circle cx="24" cy="24" r="12" fill="none" stroke="#e8dfc8" stroke-width="3"/><path d="M24 17v8l5 3" stroke="#e8dfc8" stroke-width="3" fill="none" stroke-linecap="round"/>',
    tally: '<path d="M14 14v20M20 14v20M26 14v20M32 14v20M11 28L36 18" stroke="#e8dfc8" stroke-width="3" stroke-linecap="round"/>',
    sound: '<path d="M13 20h6l8-6v20l-8-6h-6z" fill="#e8dfc8"/><path d="M32 18c3 3 3 9 0 12" stroke="#e8dfc8" stroke-width="3" fill="none" stroke-linecap="round"/>',
    lock: '<rect x="14" y="22" width="20" height="14" rx="3" fill="#e8dfc8"/><path d="M18 22v-5a6 6 0 0112 0v5" stroke="#e8dfc8" stroke-width="4" fill="none"/>',
  };
  const GLYPH = {
    LEARN: '<svg viewBox="0 0 24 24"><path d="M12 5.5v1.5M12 10v9" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>',
    INSPECT: '<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M15 15l6 6" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
    USE: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2.8"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/></svg>',
    PANEL: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="13" y="4" width="7" height="7" rx="1.5" fill="currentColor" opacity=".6"/><rect x="4" y="13" width="7" height="7" rx="1.5" fill="currentColor" opacity=".6"/><rect x="13" y="13" width="7" height="7" rx="1.5" fill="currentColor"/></svg>',
    EXIT: '<svg viewBox="0 0 24 24"><path d="M9 4l9 8-9 8" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  function icon(name) {
    const s = el('span', 'ico'), img = new Image(); img.alt = ''; img.draggable = false;
    img.onerror = () => { s.innerHTML = `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#3a4045" stroke="#B8923A" stroke-width="3"/>${SVG[name] || ''}</svg>`; };
    img.src = CUT + 'icon_' + name + '.png'; s.appendChild(img); return s;
  }
  const tile = (label) => el('div', 'tile', esc(label || ''));
  function sprite(name, label) {
    const w = el('span', 'spr'); if (!name) { w.appendChild(tile(label)); return w; }
    const img = new Image(); img.alt = label || ''; img.draggable = false; img.onerror = () => { w.innerHTML = ''; w.appendChild(tile(label)); };
    img.src = CUT + name + '.png'; w.appendChild(img); return w;
  }
  const itemName = (id) => D.items[id].name;
  function bust(who, mood) {
    const w = el('div', 'bust'); const sp = D.speakers[who]; if (!sp || sp.hidden) return null;
    const key = (who === 'ren' || who === 'tali') ? `${who}_${mood || 'neutral'}` : who;
    const img = new Image(); img.draggable = false; img.alt = sp.name;
    img.onerror = () => { w.innerHTML = `<div class="badge">${esc(sp.name[0] === 'T' && who === 'keeper' ? 'K' : sp.name[0])}<small>${esc(who === 'ren' || who === 'tali' ? (mood || 'neutral') : '')}</small></div>`; };
    img.src = CUT + key + '.png'; w.appendChild(img); return w;
  }
  const probe = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = src; });

  /* ================= toast, score, hud ================= */
  let toastT;
  function toast(text, kind) { const t = $('#toast'); t.textContent = text; t.className = 'on ' + (kind || ''); clearTimeout(toastT); toastT = setTimeout(() => (t.className = ''), 2800); }
  function addScore(n) {
    const before = S.score; S.score = Math.max(0, S.score + n); const d = S.score - before; $('#score').textContent = S.score;
    const t = $('#tallies'); t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump');
    if (n) { const r = t.getBoundingClientRect(); const p = el('div', 'pop' + (n < 0 ? ' neg' : ''), (n > 0 ? '+' : '-') + Math.abs(n)); p.style.left = r.left + 6 + 'px'; p.style.top = r.bottom + 4 + 'px'; document.body.appendChild(p); setTimeout(() => p.remove(), 1300); }
    return d;
  }
  function updateHud() {
    const R = room(); document.documentElement.style.setProperty('--accent', R.accent);
    $('#objective').innerHTML = `<b>${esc(UI.objective)}</b>${esc(R.objective)}`;
    $('#hintCount').textContent = S.hints; $('#btnHint').classList.toggle('none', S.hints <= 0); $('#score').textContent = S.score;
    updateStrip(); updateHold();
  }
  const roomFinds = (R) => R.hotspots.filter((h) => h.kind === 'FIND' || h.gives).map((h) => h.item || h.gives);
  function updateStrip() {
    const R = room(), box = $('#findStrip'); box.innerHTML = ''; const ids = roomFinds(R); if (!ids.length) return;
    box.appendChild(el('span', '', esc(UI.findStrip)));
    ids.forEach((id) => { const got = S.items.includes(id), s = el('div', 'slot' + (got ? ' got' : ''), got ? '' : '?'); if (got) s.appendChild(sprite(id, itemName(id))); s.title = got ? itemName(id) : '?'; box.appendChild(s); });
  }
  function updateHold() {
    const c = $('#holdChip'); if (!S.hold) { c.classList.add('hidden'); return; }
    c.classList.remove('hidden'); c.innerHTML = ''; const ic = el('span', 'ico'); ic.appendChild(sprite(S.hold, itemName(S.hold))); c.append(ic, el('span', '', esc(UI.holding + ': ' + itemName(S.hold))));
    const b = el('button', '', esc(UI.putBack)); b.onclick = () => { S.hold = null; updateHold(); }; c.appendChild(b);
  }

  /* ================= narration (browser voice) ================= */
  let voices = [];
  const loadVoices = () => { voices = (window.speechSynthesis && speechSynthesis.getVoices()) || []; };
  if (window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  function pickVoice(sp, who) {
    const en = voices.filter((v) => /^en/i.test(v.lang)); if (!en.length) return null;
    const F = /female|zira|samantha|susan|hazel|aria|jenny|karen|victoria|tessa|moira|fiona|libby|sonia|catherine/i, M = /\bmale\b|david|mark|daniel|alex|george|guy|ryan|james|fred|tom|thomas|oliver|arthur/i;
    const pool = en.filter((v) => (sp.gender === 'f' ? F.test(v.name) : M.test(v.name) && !F.test(v.name)));
    const list = pool.length ? pool : en; return list[who === 'narrator' && list.length > 1 ? 1 : 0];
  }
  // narrate(textOrLine, who): speaks one line. Starts only after the first tap, never advances anything by itself.
  // Recorded line (audioFile) when present, else the browser voice. One shared element: voices never overlap.
  const VA = new Audio(), preloaded = {};
  function narrate(t, who) {
    if (!S.gesture || !S.soundOn) return;
    const text = typeof t === 'string' ? t : t.text; who = who || (typeof t === 'object' && t.who) || 'narrator';
    const sp = D.speakers[who] || D.speakers.narrator; if (sp.mute) return;
    stopSpeech();
    if (t.audioFile) { VA.src = t.audioFile; VA.play().catch(() => {}); return; }
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text); u.pitch = sp.pitch; u.rate = sp.rate; const v = pickVoice(sp, who); if (v) u.voice = v; speechSynthesis.speak(u);
  }
  const stopSpeech = () => { VA.pause(); if (window.speechSynthesis) speechSynthesis.cancel(); };
  const preload = (f) => { if (f && !preloaded[f]) { preloaded[f] = 1; new Audio().src = f; } };

  /* ================= dialogue ================= */
  const DLG = { q: [], cur: null };
  function say(lines, opts) {
    return new Promise((res) => {
      if (!lines || !lines.length) return res();
      opts = opts || {};
      if (opts.interrupt && DLG.cur && DLG.cur.opts.idle) finishSeq();
      DLG.q.push({ lines, res, opts, i: 0 }); if (!DLG.cur) nextSeq();
    });
  }
  function nextSeq() { const s = DLG.q.shift(); if (!s) { DLG.cur = null; S.dlgPause = false; $('#dlg').classList.add('hidden'); $('#dlgCatch').classList.add('hidden'); return; } DLG.cur = s; showLine(); }
  function showLine() {
    const s = DLG.cur, ln = s.lines[s.i], sp = D.speakers[ln.who] || D.speakers.narrator; S.dlgPause = !!ln.pausesTimer;
    const dlg = $('#dlg'); dlg.classList.remove('hidden'); dlg.className = ''; dlg.innerHTML = '';
    const bu = bust(ln.who, ln.mood);
    const box = el('div', 'box'), col = el('div', 'col'), head = el('div', 'head'); head.appendChild(el('div', 'name' + (sp.hidden ? ' nar' : ''), esc(sp.name)));
    const sk = el('button', 'skip', esc(UI.skip)); sk.onclick = (e) => { e.stopPropagation(); finishSeq(); }; head.appendChild(sk);
    col.append(head, el('div', 'txt', esc(ln.text)), el('div', 'more', esc(UI.tapContinue)));
    if (bu) box.appendChild(bu); box.appendChild(col);
    box.onclick = advance; dlg.appendChild(box);
    const c = $('#dlgCatch'); c.classList.toggle('hidden', !ln.pausesTimer); c.onclick = advance;
    if (s.opts.onLine) s.opts.onLine(s.i); narrate(ln); preload((s.lines[s.i + 1] || {}).audioFile);
  }
  function advance() { const s = DLG.cur; if (!s) return; stopSpeech(); s.i++; if (s.i >= s.lines.length) finishSeq(); else showLine(); }
  function finishSeq() { const s = DLG.cur; if (!s) return; stopSpeech(); DLG.cur = null; S.dlgPause = false; if (s.opts.onEnd) s.opts.onEnd(); s.res(); nextSeq(); }
  function clearDialogue() { DLG.q = []; if (DLG.cur) finishSeq(); }

  /* ================= cards ================= */
  const cardQ = []; let cardOpen = null;
  function showCard(build, opts) { return new Promise((res) => { cardQ.push({ build, opts: opts || {}, res }); if (!cardOpen) nextCard(); }); }
  function nextCard() {
    const layer = $('#cardLayer'), c = cardQ.shift();
    if (!c) { cardOpen = null; layer.classList.add('hidden'); layer.innerHTML = ''; return; }
    layer.classList.remove('hidden'); layer.innerHTML = '';
    const card = el('div', 'card ' + (c.opts.cls || '')), x = el('button', 'x', '✕'); x.setAttribute('aria-label', UI.close); card.appendChild(x);
    const close = () => { stopSpeech(); layer.innerHTML = ''; cardOpen = null; c.res(); nextCard(); };
    cardOpen = { close }; x.onclick = close; layer.onclick = (e) => { if (e.target === layer) close(); }; c.build(card, close); layer.appendChild(card);
  }
  const doneBtn = (close) => { const r = el('div', 'row'), b = el('button', 'btn', esc(UI.done)); b.onclick = close; r.appendChild(b); return r; };
  function noteCard(id) {
    const n = D.notes[id];
    return showCard((card) => { card.append(el('div', 'kick', esc(UI.newNote) + ' · ' + id), el('h2', '', esc(n.title)), el('div', 'note', esc(n.text)), el('div', 'teach', `<b>${esc(UI.teaches)}</b> ${esc(n.teaches)}`), el('div', 'saved', '✓ ' + esc(UI.savedNote))); card.appendChild(doneBtn(() => cardOpen.close())); });
  }
  function itemCard(id, kicker, line2) {
    const it = D.items[id];
    return showCard((card) => { const big = el('div', 'big'); big.appendChild(sprite(id, it.name)); card.append(el('div', 'kick', esc(kicker)), el('h2', '', esc(it.name)), big, el('div', 'teach', esc(it.desc)), el('div', 'saved', '✓ ' + esc(line2))); card.appendChild(doneBtn(() => cardOpen.close())); }, { cls: 'tiny' });
  }
  function flyToJournal(fromX, fromY, name) {
    const f = el('div', 'fly'); f.appendChild(sprite(name, itemName(name))); f.style.left = fromX - 32 + 'px'; f.style.top = fromY - 32 + 'px'; document.body.appendChild(f);
    const r = $('#btnJournal').getBoundingClientRect(); requestAnimationFrame(() => { f.style.transform = `translate(${r.left + r.width / 2 - fromX}px,${r.top + r.height / 2 - fromY}px) scale(.3)`; f.style.opacity = '.2'; }); setTimeout(() => f.remove(), 900);
  }
  function gain(id) { if (!S.items.includes(id)) S.items.push(id); updateStrip(); }

  /* ================= validate ================= */
  function validate(d) {
    const e = [], ids = new Set(), all = [];
    if (d.rooms.length !== 7) e.push('need 7 rooms');
    d.rooms.forEach((r) => {
      if (!d.puzzles) e.push('no puzzles');
      [...r.enter, ...r.wrong, ...r.hints, ...r.right, ...(r.choiceLines || [])].forEach((l) => { if (typeof l.pausesTimer !== 'boolean') e.push(`${r.id}: line without pausesTimer: ${l.text}`); });
      r.hotspots.forEach((h) => { if (ids.has(h.id)) e.push('duplicate id ' + h.id); ids.add(h.id); all.push(h); });
    });
    [...d.opening, d.idle, ...d.secretReact, ...d.endings.A.lines, ...d.endings.B.lines].forEach((l) => { if (typeof l.pausesTimer !== 'boolean') e.push('line without pausesTimer: ' + l.text); });
    const byId = Object.fromEntries(all.map((h) => [h.id, h]));
    all.forEach((h) => {
      (h.after || []).forEach((a) => { if (a !== '@reward' && !byId[a]) e.push(`${h.id}: unknown after ${a}`); });
      if (h.item && !d.items[h.item]) e.push(`${h.id}: unknown item ${h.item}`); if (h.gives && !d.items[h.gives]) e.push(`${h.id}: unknown item ${h.gives}`);
      (h.needs || []).forEach((n) => { if (!d.items[n]) e.push(`${h.id}: unknown needed item ${n}`); });
      if (h.note && !d.notes[h.note]) e.push(`${h.id}: unknown note ${h.note}`);
      [h.panel, h.opens].forEach((p) => { if (p && p !== 'choiceIntro' && !d.puzzles[p]) e.push(`${h.id}: unknown panel ${p}`); });
    });
    const state = {}; const visit = (id, path) => { if (state[id] === 2) return; if (state[id] === 1) { e.push('cycle: ' + [...path, id].join(' > ')); return; } state[id] = 1; (byId[id].after || []).forEach((a) => a !== '@reward' && byId[a] && visit(a, [...path, id])); state[id] = 2; };
    all.forEach((h) => visit(h.id, []));
    d.rooms.forEach((r) => { if (!byId[r.finish]) e.push(r.id + ': unknown finish ' + r.finish); [...r.reward.items].forEach((i) => { if (!d.items[i]) e.push('reward item ' + i); }); r.reward.notes.forEach((n) => { if (!d.notes[n]) e.push('reward note ' + n); }); });
    return e;
  }

  /* ================= panorama + hotspots ================= */
  let viewer = null; const HS = new Map(); const pano = () => $('#pano');
  function fallbackPano(R) {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 1024; const x = c.getContext('2d');
    let g = x.createLinearGradient(0, 0, 0, 1024); g.addColorStop(0, '#0d0f12'); g.addColorStop(.5, R.accent); g.addColorStop(.52, '#1b1d20'); g.addColorStop(1, '#0a0a0c'); x.fillStyle = g; x.fillRect(0, 0, 2048, 1024);
    x.fillStyle = 'rgba(0,0,0,.45)'; for (let i = 0; i < 28; i++) { const w = 60 + (i * 37) % 80, h = 120 + (i * 53) % 220; x.fillRect(i * 74 % 2048, 512 - h, w, h); }
    x.fillStyle = '#e8dfc8'; x.font = 'bold 70px sans-serif'; x.textAlign = 'center'; for (let i = 0; i < 4; i++) x.fillText(R.name, 256 + i * 512, 360);
    return c.toDataURL('image/jpeg', .8);
  }
  async function loadRoom(i, opts) {
    opts = opts || {}; const R = D.rooms[i]; S.room = i; S.roomReady = false; S.transition = true;
    if (!opts.first) { $('#fade').classList.add('on'); await sleep(520); }
    HS.forEach((o) => o.node.remove()); HS.clear(); if (viewer) { try { viewer.destroy(); } catch (e) { /* ignore */ } viewer = null; } pano().innerHTML = '';
    let src = ROOMS + R.file, ok = await probe(src); if (!ok) { src = fallbackPano(R); if (DEBUG) console.warn('panorama missing', R.file); }
    const portrait = innerWidth < innerHeight;
    viewer = pannellum.viewer('pano', { type: 'equirectangular', panorama: src, autoLoad: true, showControls: false, mouseZoom: true, doubleClickZoom: false, keyboardZoom: false, compass: false, hfov: portrait ? CFG.pano.hfovPortrait : CFG.pano.hfov, minHfov: CFG.pano.minHfov, maxHfov: CFG.pano.maxHfov, yaw: R.startYaw || 0, pitch: 0, friction: .15 });
    await new Promise((res) => { let d = false; const fin = () => { if (!d) { d = true; res(); } }; viewer.on('load', fin); viewer.on('error', () => { if (DEBUG) console.warn('pannellum error'); fin(); }); setTimeout(fin, 25000); });
    S.roomReady = true; S.transition = false;
    $('#darkveil').classList.toggle('on', !!R.dark && !S.done.has('h6_sconce'));
    updateHud(); refreshHotspots(); $('#fade').classList.remove('on');
    const nx = D.rooms[i + 1]; if (nx) probe(ROOMS + nx.file);
  }
  const isVisible = (h) => h.kind !== 'AUTO' && (h.kind === 'EXIT' ? true : !S.done.has(h.id)) && (h.after || []).every((a) => (a === '@reward' ? S.rewarded[room().id] : S.done.has(a)));
  function makeNode(h) {
    const n = el('div', 'hs k-' + h.kind), inn = el('div', 'hs-in'); n.appendChild(inn);
    if (h.kind === 'FIND') inn.appendChild(sprite(h.item, itemName(h.item))); else { const o = el('div', 'orb', GLYPH[h.kind]); inn.append(o); }
    $('#hotspots').appendChild(n); return n;
  }
  function refreshHotspots() {
    const R = room(); const want = R.hotspots.filter(isVisible);
    HS.forEach((o, id) => { if (!want.find((h) => h.id === id)) { o.node.remove(); HS.delete(id); } });
    want.forEach((h) => { if (!HS.has(h.id)) HS.set(h.id, { h, node: makeNode(h), x: 0, y: 0, vis: false, r: 30 }); });
    if (DEBUG) $('#debugBar').dataset.hs = [...HS.keys()].join(',');
  }
  function frame() {
    requestAnimationFrame(frame); if (!viewer || !S.roomReady || !HS.size) return;
    const p = pano(), W = p.clientWidth, H = p.clientHeight, hfov = viewer.getHfov(), hf = hfov * Math.PI / 180, f = (W / 2) / Math.tan(hf / 2);
    const yaw0 = viewer.getYaw(), p0 = viewer.getPitch() * Math.PI / 180, cp = Math.cos(p0), sp = Math.sin(p0), zoom = Math.max(.75, Math.min(1.6, 100 / hfov));
    HS.forEach((o) => {
      const h = o.h, dy = (h.yaw - yaw0) * Math.PI / 180, pp = h.pitch * Math.PI / 180;
      const x = Math.cos(pp) * Math.sin(dy), y = Math.sin(pp), z = Math.cos(pp) * Math.cos(dy), y2 = y * cp - z * sp, z2 = y * sp + z * cp;
      if (z2 <= .05) { o.node.style.display = 'none'; o.vis = false; return; }
      o.x = W / 2 + f * x / z2; o.y = H / 2 - f * y2 / z2; o.vis = o.x > -40 && o.x < W + 40 && o.y > -40 && o.y < H + 40; o.node.style.display = o.vis ? '' : 'none';
      const size = Math.round((h.kind === 'FIND' ? 66 : 50) * zoom); o.node.style.setProperty('--s', Math.max(h.kind === 'FIND' ? 48 : 46, size) + 'px'); o.r = Math.max(28, size / 2 + 8);
      o.node.style.transform = `translate(${o.x.toFixed(1)}px,${o.y.toFixed(1)}px)`;
    });
  }
  function hitTest(e) {
    const r = pano().getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; let best = null, bd = 1e9;
    HS.forEach((o) => { if (!o.vis) return; const d = Math.hypot(o.x - x, o.y - y); if (d < o.r && d < bd) { bd = d; best = o; } });
    return best;
  }
  function bindStage() {
    const st = pano(); let down = null;
    st.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; }, true);
    st.addEventListener('pointermove', (e) => { if (!down && S.playing) { const h = hitTest(e); st.style.cursor = h ? 'pointer' : ''; } }, true);
    st.addEventListener('pointerup', (e) => {
      if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10; down = null;
      if (DEBUG && viewer) { const [pitch, yaw] = viewer.mouseEventToCoords(e); $('#debugBar').dataset.xy = `yaw ${yaw.toFixed(1)} pitch ${pitch.toFixed(1)}`; console.log('yaw', yaw.toFixed(1), 'pitch', pitch.toFixed(1)); updateDebug(); }
      if (moved || !S.playing || S.ended || S.pauseMenu) return; const o = hitTest(e); if (o) tapHotspot(o);
    }, true);
  }

  /* ================= hotspot actions ================= */
  function complete(id) { S.done.add(id); refreshHotspots(); updateStrip(); }
  function tapHotspot(o) {
    const h = o.h;
    if (h.kind === 'LEARN') return learnNote(h);
    if (h.kind === 'FIND') return pickup(h, o);
    if (h.kind === 'INSPECT') return inspect(h);
    if (h.kind === 'USE') return useSpot(h);
    if (h.kind === 'PANEL') return openPanel(h.panel, h.id);
    if (h.kind === 'EXIT') return goNext();
  }
  async function learnNote(h) { S.done.add(h.id); if (!S.notes.includes(h.note)) S.notes.push(h.note); refreshHotspots(); await noteCard(h.note); refreshHotspots(); }
  async function pickup(h, o, quiet) {
    const id = h.item, x = o ? o.x : innerWidth / 2, y = o ? o.y : innerHeight / 2; S.done.add(h.id); refreshHotspots();
    await itemCard(id, UI.foundTitle, UI.addedJournal + ' +' + CFG.points.find);
    gain(id); FX.sfx('pick'); flyToJournal(x, y, id); addScore(CFG.points.find);
    const ln = D.items[id].line; if (ln) say([ln]);
  }
  async function inspect(h) {
    const idx = D.rooms.indexOf(room()); let v = 0, got = S.done.has(h.id);
    await showCard((card, ) => {
      const body = el('div'), turn = el('button', 'btn small ghost', esc(UI.turn)), closeRow = doneBtn(() => cardOpen.close());
      const draw = () => {
        body.innerHTML = ''; const vw = h.views[v], view = el('div', 'view');
        if (vw.img) { const pic = el('div', 'pic'), im = new Image(); im.onerror = () => pic.remove(); im.src = CUT + vw.img + '.png'; pic.appendChild(im); view.appendChild(pic); }
        view.appendChild(el('p', '', esc(vw.text))); body.appendChild(view);
        if (v === 1 && h.secret) { body.appendChild(el('div', 'secret', `<span>${esc(UI.secretFound)}${got ? '' : ` <i class="pts">+${CFG.points.secret}</i>`}</span>${esc(h.secret)}`)); if (!got) { got = true; S.done.add(h.id); S.secrets++; addScore(CFG.points.secret); } }
      };
      card.append(el('div', 'kick', esc(UI.inspectKicker)), el('h2', '', esc(h.label)), body);
      const row = el('div', 'row'); if (h.views.length > 1) { turn.onclick = () => { v = (v + 1) % h.views.length; draw(); }; row.appendChild(turn); } row.appendChild(closeRow.firstChild); card.appendChild(row); draw();
    });
    if (!h.secret) { S.done.add(h.id); }
    refreshHotspots(); updateStrip();
    if (h.secret && got) { say([D.secretReact[idx % 2]]); }
    if (h.react) say(h.react);
    if (h.gives) { await sleep(300); await pickup({ id: h.id + '_item', item: h.gives }, null); }
  }
  async function useSpot(h) {
    const hold = S.hold;
    if (!hold) return toast(UI.useNothing); if (!h.needs.includes(hold)) return toast(UI.useWrong);
    const miss = h.needs.filter((n) => !S.items.includes(n)); if (miss.length) return toast(fmt(UI.useNeed, { list: miss.map(itemName).join(', ') }));
    S.hold = null; h.needs.forEach((n) => S.used.add(n)); updateHold(); FX.sfx('use');
    if (!h.manual) complete(h.id);
    toast(h.msg, 'good'); if (h.light) { $('#darkveil').classList.remove('on'); FX.flash('#d9c8ff', 400); }
    if (h.opens === 'choiceIntro') { await say(room().choiceLines); return openPanel('choice', 'h7_choice'); }
    if (h.opens) openPanel(h.opens, hsForPanel(h.opens));
  }
  const hsForPanel = (pid) => { const R = room(); return (R.hotspots.find((h) => h.panel === pid) || R.hotspots.find((h) => h.opens === pid)).id; };

  /* ================= panels ================= */
  const API = { fmt, sprite, has: (id) => S.items.includes(id), done: (id) => S.done.has(id), paused: () => S.pauseMenu, cfg: null, wrong, solved, toast, penalty };
  function openPanel(pid, hsId) {
    closePanel(); const data = D.puzzles[pid], layer = $('#panelLayer'); S.panel = { pid, hsId };
    layer.classList.remove('hidden'); layer.innerHTML = '';
    const p = el('div', 'panel'), head = el('div', 'phead'), body = el('div', 'pbody');
    const hb = (name, fn, label) => { const b = el('button', 'hb'); b.setAttribute('aria-label', label); b.appendChild(icon(name)); b.onclick = fn; return b; };
    const hint = hb('hint', useHint, UI.hint); const hc = el('i', '', S.hints); hint.style.position = 'relative'; hc.style.cssText = 'position:absolute;right:-2px;top:-2px;min-width:20px;height:20px;border-radius:10px;background:var(--gold);color:#1b1407;font:700 13px/20px var(--head);font-style:normal;text-align:center'; hint.appendChild(hc); hint.dataset.hint = 1;
    const x = el('button', 'px', '✕'); x.setAttribute('aria-label', UI.close); x.onclick = closePanel;
    head.append(hb('pause', pause, UI.pause), hb('journal', () => openJournal(), UI.journal), hint, el('h2', '', esc(data.title)), el('div', 'pc', fmtClock()), x);
    const lock = el('div', 'lockbar'); p.append(head, body, lock); layer.appendChild(p);
    layer.onclick = (e) => { if (e.target === layer) closePanel(); };
    const st = (S.pstate[pid] = S.pstate[pid] || {}); S.panel.destroy = Panels[pid](body, { d: data, st, G: API });
    if (data.rules) { const rb = el('div', 'rules', `<b>${esc(UI.notAllowed)}</b> ${esc(data.rules)}`); body.insertBefore(rb, body.children[1] || null); }
  }
  function closePanel() {
    if (!S.panel) return; if (S.panel.destroy) S.panel.destroy(); S.panel = null; const l = $('#panelLayer'); l.classList.add('hidden'); l.innerHTML = '';
  }
  function lockout() {
    const p = $('#panelLayer .panel'); if (!p) return; p.style.setProperty('--lock', CFG.lockoutMs / 1000 + 's');
    p.classList.remove('locked', 'shake'); void p.offsetWidth; p.classList.add('locked', 'shake'); clearTimeout(p._lt); p._lt = setTimeout(() => p.classList.remove('locked', 'shake'), CFG.lockoutMs);
  }
  function wrong() {
    const R = room(), n = S.wrongN[R.id] || 0; S.wrongN[R.id] = n + 1; addScore(-CFG.points.wrong); FX.sfx('wrong'); lockout(); toast(fmt(UI.wrongToast, { n: CFG.points.wrong }), 'bad'); FX.shake(300, 5);
    say([R.wrong[Math.min(n, R.wrong.length - 1)]], { interrupt: true });
  }
  function penalty(sec) { S.time = Math.max(0, S.time - sec); const c = $('#clock'); c.classList.add('low'); toast(fmt(UI.drawerPenalty, { n: CFG.points.wrong, s: sec }), 'bad'); }
  async function solved(a, b) {
    const sp = S.panel; if (!sp) return; const R = room(), { pid, hsId } = sp;
    if (pid === 'choice') { S.choice = a; addScore(CFG.points.choice); closePanel(); complete(hsId); return startEnding(a); }
    closePanel(); complete(hsId); if (pid !== 'switch') FX.sfx('solve');
    if (pid === 'switch') { FX.solved(a || innerWidth / 2, b || innerHeight / 2); addScore(CFG.points.final1); await say(R.right); return; }
    if (pid === 'seating') return toast(D.puzzles.seating.ok, 'good');
    if (hsId === R.finish) finishRoom();
  }
  async function finishRoom() {
    const R = room(); if (S.finished[R.id]) return; S.finished[R.id] = true;
    await say(R.right);                                    // wait for the dialogue-finished event, never a delay
    S.marks++; addScore(CFG.points.room); FX.sfx('reward');
    await showCard((card) => { card.append(el('div', 'kick', '+' + CFG.points.room + ' ' + esc(UI.tallies)), el('h2', '', esc(fmt(UI.routeMark, { n: S.marks }))), mapSvg(S.marks, true), el('div', 'saved', '✓ ' + esc(UI.routeMarkText))); card.appendChild(doneBtn(() => cardOpen.close())); }, { cls: 'tiny' });
    for (const id of R.reward.items) { await itemCard(id, UI.newTool, UI.newToolText); gain(id); flyToJournal(innerWidth / 2, innerHeight / 2, id); }
    for (const n of R.reward.notes) { if (!S.notes.includes(n)) S.notes.push(n); await noteCard(n); }
    S.rewarded[R.id] = true; refreshHotspots(); toast(R.reward.toast || UI.exitOpen, 'good');
  }
  async function goNext() {
    const i = S.room + 1; if (!D.rooms[i]) return; S.hold = null; closePanel(); FX.clear(); FX.sfx('door'); await loadRoom(i); await enterRoom();
  }
  async function enterRoom() {
    const R = room(); const b = $('#roomBanner'); b.innerHTML = `<small>${esc(R.id === 'last_door' ? '7 / 7' : D.rooms.indexOf(R) + 1 + ' / 7')}</small><h1>${esc(R.name)}</h1><p>${esc(R.objective)}</p>`; b.classList.remove('hidden'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    setTimeout(() => b.classList.add('hidden'), 3700); if (R.final) FX.enterFinal();
    await say(R.enter); R.hotspots.filter((h) => h.kind === 'AUTO').forEach((h) => S.done.add(h.id)); refreshHotspots();
  }

  /* ================= hints ================= */
  let hintT;
  function showHint(text) { const b = $('#hintBox'); b.textContent = text; b.classList.remove('hidden'); clearTimeout(hintT); hintT = setTimeout(() => b.classList.add('hidden'), 7000); b.onclick = () => b.classList.add('hidden'); }
  function dirWord(yaw) {
    const d = ((yaw - viewer.getYaw() + 540) % 360) - 180, k = Math.abs(d) < 35 ? 'front' : Math.abs(d) > 125 ? 'back' : d > 0 ? 'right' : 'left'; return UI.hintDir[k];
  }
  // a short screen-text hint for the very next step (no voice)
  function nextStepHint(R) {
    if (S.panel) { const n = S.hintN[R.id] || 0; return R.hints[Math.min(n, R.hints.length - 1)].text; }
    const vis = R.hotspots.filter(isVisible), pick = vis.find((h) => h.kind !== 'EXIT') || vis[0]; if (!pick) return UI.hintNothing;
    const dir = dirWord(pick.yaw), k = pick.kind;
    if (k === 'LEARN') return fmt(UI.hintLearn, { dir });
    if (k === 'FIND') return fmt(UI.hintFind, { dir });
    if (k === 'INSPECT') return fmt(UI.hintInspect, { dir });
    if (k === 'PANEL') return fmt(UI.hintPanel, { dir });
    if (k === 'EXIT') return fmt(UI.hintExit, { dir });
    const miss = pick.needs.find((n) => !S.items.includes(n));
    return miss ? fmt(UI.hintNeedItem, { item: itemName(miss) }) : fmt(UI.hintUseItem, { item: itemName(pick.needs[0]), label: pick.label.toLowerCase(), dir });
  }
  function useHint() {
    if (!S.playing || S.ended) return; const R = room();
    if (S.hints <= 0) return toast(UI.noHints, 'bad');
    if (S.score < CFG.points.hint) return toast(fmt(UI.hintNeedPoints, {}), 'bad');
    const text = nextStepHint(R); S.hintN[R.id] = (S.hintN[R.id] || 0) + 1; S.hints--; addScore(-CFG.points.hint);
    S.hintLog.push({ room: R.name, text }); document.querySelectorAll('[data-hint] i').forEach((i) => (i.textContent = S.hints)); updateHud(); showHint(text);
  }

  /* ================= journal ================= */
  let jtab = 'items';
  function mapSvg(lit, small) {
    const M = D.map, N = M.size, s = (n) => n; let g = '';
    for (let i = 0; i < 26; i++) { const a = (i * 97) % N, b = (i * 53) % N; g += `<path d="M${a} ${b}h${30 + (i * 17) % 40}" stroke="#4a4237" stroke-width="3" opacity=".7"/><path d="M${b} ${a}v${20 + (i * 23) % 50}" stroke="#4a4237" stroke-width="3" opacity=".7"/>`; }
    let segs = '', dots = '';
    for (let i = 0; i < M.points.length - 1; i++) {
      const [x1, y1] = M.points[i], [x2, y2] = M.points[i + 1], on = i < lit;
      segs += `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${on ? '#E8C25A' : '#6b6354'}" stroke-width="${on ? 8 : 5}" stroke-linecap="round" ${on ? '' : 'stroke-dasharray="3 9"'}/>`;
      dots += `<circle cx="${x2}" cy="${y2}" r="11" fill="${on ? '#E8C25A' : '#2a251c'}" stroke="#B8923A" stroke-width="2"/><text x="${x2}" y="${y2 + 5}" text-anchor="middle" font-size="14" font-weight="700" font-family="Barlow Condensed,Impact" fill="${on ? '#1b1407' : '#a49669'}">${i + 1}</text>`;
    }
    const [sx, sy] = M.points[0]; dots += `<circle cx="${sx}" cy="${sy}" r="10" fill="#5A6B3C" stroke="#B8923A" stroke-width="2"/>`;
    const [ex, ey] = M.points[M.points.length - 1];
    const svg = el('div', small ? 'mini-map' : '', `<svg class="jmap" viewBox="0 0 ${N} ${N}" role="img" aria-label="${esc(UI.mapTitle)}"><rect x="4" y="4" width="${N - 8}" height="${N - 8}" rx="10" fill="#1a1510" stroke="#B8923A" stroke-width="4"/>${g}${segs}${dots}<path d="M${ex - 12} ${ey - 4}h24v-16h-24z" fill="${lit >= M.points.length - 1 ? '#E8C25A' : '#3a3328'}"/></svg>`);
    return svg;
  }
  function openJournal(tab) {
    if (!S.playing || S.ended) return; if (tab) jtab = tab; const j = $('#journal'); j.classList.remove('hidden'); renderJournal();
  }
  const closeJournal = () => { $('#journal').classList.add('hidden'); $('#journal').innerHTML = ''; };
  function renderJournal() {
    const j = $('#journal'); j.innerHTML = ''; j.onclick = (e) => { if (e.target === j) closeJournal(); };
    const book = el('div', 'book'), x = el('button', 'x', '✕'); x.onclick = closeJournal; x.setAttribute('aria-label', UI.close);
    const tabs = el('div', 'tabs'); Object.entries(UI.tabs).forEach(([k, label]) => { const b = el('button', jtab === k ? 'on' : '', esc(label)); b.onclick = () => { jtab = k; renderJournal(); }; tabs.appendChild(b); });
    const body = el('div', 'jbody'); book.append(el('h2', '', esc(UI.journal)), x, tabs, body); j.appendChild(book);
    if (jtab === 'items') {
      if (!S.items.length) body.appendChild(el('div', 'empty', esc(UI.emptyItems)));
      else { const g = el('div', 'jitems'); S.items.forEach((id) => { const it = D.items[id], b = el('button', 'jit' + (S.hold === id ? ' hold' : '') + (S.used.has(id) ? ' used' : '')); b.appendChild(sprite(id, it.name)); b.append(el('span', '', esc(it.name)), el('small', '', esc(it.desc))); b.onclick = () => { S.hold = S.hold === id ? null : id; updateHold(); closeJournal(); if (S.hold) toast(UI.holding + ': ' + it.name); }; g.appendChild(b); }); body.appendChild(g); }
    } else if (jtab === 'notes') {
      const l = el('div', 'jnotes'); Object.entries(D.notes).forEach(([id, n]) => { const has = S.notes.includes(id), b = el('button', 'jnote' + (has ? '' : ' lock')); b.append(el('b', '', id), el('span', '', esc(has ? n.title : UI.emptyNotes))); if (has) b.onclick = () => noteCard(id); l.appendChild(b); }); body.appendChild(l);
    } else if (jtab === 'map') {
      body.append(el('p', 'jhelp', esc(UI.mapSub)), mapSvg(S.marks + (S.won ? 1 : 0)));
    } else {
      const w = el('div', 'jhints'); w.append(el('div', 'big', esc(fmt(UI.hintsLeft, { n: S.hints }))), el('p', 'jhelp', esc(fmt(UI.hintCostNote, {})))); const log = el('div', 'jlog');
      if (!S.hintLog.length) log.appendChild(el('div', '', esc(UI.hintLogEmpty))); S.hintLog.forEach((h) => log.appendChild(el('div', '', `<b>${esc(h.room)}</b><br>${esc(h.text)}`))); w.appendChild(log); body.appendChild(w);
    }
  }

  /* ================= clock ================= */
  const fmtClock = () => { const t = Math.max(0, Math.ceil(S.time)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  const running = () => S.playing && !S.ended && !S.pauseMenu && !S.dlgPause && !S.cinematic && !S.transition;
  let lastT = performance.now();
  setInterval(() => {
    const now = performance.now(), dt = (now - lastT) / 1000; lastT = now;
    if (running()) { S.time -= Math.min(dt, 1); if (S.time <= 0) { S.time = 0; timeUp(); } }
    const c = $('#clock'), txt = fmtClock(); if (c.textContent !== txt) c.textContent = txt; c.classList.toggle('low', S.playing && !S.ended && S.time <= 60); c.classList.toggle('stopped', !running());
    document.querySelectorAll('.pc').forEach((p) => { p.textContent = txt; p.classList.toggle('low', S.time <= 60); });
    if (S.playing && !S.ended && !S.pauseMenu && !DLG.cur && !cardOpen && !S.panel && $('#journal').classList.contains('hidden') && !S.cinematic && now - S.lastTap > CFG.idleMs && now - S.lastIdle > CFG.idleMs) { S.lastIdle = now; say([D.idle], { idle: true }); }
  }, 200);
  addEventListener('pointerdown', () => { S.lastTap = performance.now(); }, true);

  /* ================= pause ================= */
  function pause() {
    if (!S.playing || S.ended || S.pauseMenu) return; S.pauseMenu = true; document.body.classList.add('paused'); VA.pause(); if (window.speechSynthesis) speechSynthesis.pause();
    const m = $('#pauseMenu'); m.classList.remove('hidden'); m.innerHTML = ''; m.append(el('h2', '', esc(UI.paused)));
    const r = el('button', 'btn', esc(UI.resume)); r.onclick = resume;
    const tg = (key, on, off, fn) => { const b = el('button', 'btn ghost', esc(S[key] ? UI[on] : UI[off])); b.onclick = () => { S[key] = !S[key]; fn(S[key]); b.textContent = S[key] ? UI[on] : UI[off]; }; return b; };
    const snd = tg('soundOn', 'voiceOn', 'voiceOff', (v) => { FX.setSound(v); if (!v) stopSpeech(); }), mus = tg('musicOn', 'musicOn', 'musicOff', (v) => FX.setMusic(v)), sf = tg('sfxOn', 'sfxOn', 'sfxOff', (v) => FX.setSfx(v));
    const rs = el('button', 'btn ghost', esc(UI.restart)); let armed = false; rs.onclick = () => { if (!armed) { armed = true; rs.textContent = '?'; setTimeout(() => { armed = false; rs.textContent = UI.restart; }, 2500); } else location.reload(); };
    m.append(r, mus, sf, snd, rs);
  }
  function resume() { S.pauseMenu = false; document.body.classList.remove('paused'); $('#pauseMenu').classList.add('hidden'); if (S.soundOn && VA.src && !VA.ended && VA.currentTime > 0) VA.play().catch(() => {}); if (window.speechSynthesis) speechSynthesis.resume(); }
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (cardOpen) cardOpen.close(); else if (!$('#journal').classList.contains('hidden')) closeJournal(); else if (S.pauseMenu) resume(); else if (S.panel) closePanel(); else pause();
  });

  /* ================= end of game ================= */
  function endScreen(kind, title, sub, extra) {
    clearDialogue(); closePanel(); closeJournal(); S.ended = true;
    const s = el('div', 'scr end ' + kind), c = el('div', 'endcard');
    c.append(el('h1', '', esc(title)));
    if (sub) c.append(el('p', '', esc(sub)));
    c.append(el('div', 'lbl', esc(UI.finalTallies)), el('div', 'score', S.score), el('div', 'of', esc(fmt(UI.maxLabel, { n: maxScore() }))));
    if (extra) c.append(...extra);
    const b = el('button', 'btn', esc(kind === 'lose' ? UI.tryAgain : UI.playAgain)); b.onclick = () => location.reload(); c.appendChild(b); s.appendChild(c);
    $('#screens').innerHTML = ''; $('#screens').appendChild(s); $('#fade').classList.remove('on');
  }
  async function timeUp() {
    if (S.ended) return; clearDialogue(); closePanel(); S.ended = true; FX.timeUp(); stopSpeech();
    await sleep(2000); endScreen('lose', UI.timeUpTitle, UI.timeUpText);
  }
  async function startEnding(id) {
    S.cinematic = true; S.won = true; S.marks = Math.max(S.marks, D.map.points.length - 1); FX[id === 'A' ? 'choiceA' : 'choiceB'](); const E = D.endings[id];
    await sleep(900); await say(E.lines); S.cinematic = false;
    endScreen('win', E.title, '', [el('div', 'tbc', esc(UI.toBeContinued)), el('p', 'seq', esc(E.sequel))]);
  }

  /* ================= start flow ================= */
  const mazeUrl = () => { let p = ''; for (let i = 1; i < 9; i++) { const s = 40 + i * 70, o = 400 - s; p += `<rect x="${o}" y="${o / 2}" width="${s * 2}" height="${s * 1.2}" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="${60 + i * 20} ${24 + i * 6}"/>`; } return `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 500'><g opacity='.08'>${p}</g></svg>`)}")`; };
  async function showTitle() {
    const s = el('div', 'scr title'); s.style.setProperty('--maze', mazeUrl());
    if (await probe(SHEETS + 'title_keyart.jpg')) { s.style.backgroundImage = `linear-gradient(rgba(0,0,0,.25),rgba(0,0,0,.5)),url(${SHEETS}title_keyart.jpg)`; }
    s.append(el('h1', 'logo', `<small>${esc(D.mission.kicker)}</small>${esc(CFG.title)}`), el('div', 'sub', '10:00'));
    const b = el('button', 'btn big', esc(UI.tapToStart)); b.onclick = () => { S.gesture = true; FX.audio(); showMission(); }; s.appendChild(b);
    $('#screens').innerHTML = ''; $('#screens').appendChild(s);
  }
  async function showMission() {
    const M = D.mission, s = el('div', 'scr mission'); s.style.setProperty('--maze', mazeUrl());
    if (await probe(SHEETS + 'briefing_bg.jpg')) s.style.backgroundImage = `linear-gradient(rgba(8,9,11,.3),rgba(8,9,11,.85) 50%,rgba(8,9,11,.92)),url(${SHEETS}briefing_bg.jpg)`;
    const t = el('div', 'mtext', `<div class="kick">${esc(M.kicker)}</div><h1>${esc(M.heading)}</h1>${M.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}`);
    const b = el('button', 'btn big', esc(UI.begin)); b.onclick = () => { stopSpeech(); tutorial(); }; t.appendChild(b); s.appendChild(t);
    $('#screens').innerHTML = ''; $('#screens').appendChild(s); narrate(Object.assign({ who: 'narrator', text: [M.heading, ...M.paragraphs].join(' ... ') }, M.audioFile ? { audioFile: M.audioFile } : {}));
  }
  function tutorial() {
    $('#screens').innerHTML = ''; $('#hud').classList.remove('hidden'); updateHud(); pano().classList.add('blur'); pano().style.setProperty('--blur', CFG.blurPx + 'px');
    const T = D.tutorial; let i = 0; const wrap = el('div', 'spotwrap'); $('#app').appendChild(wrap);
    const show = () => {
      wrap.innerHTML = ''; const t = T[i], spot = el('div', 'spot'); const tg = (t.target || []).map((q) => $(q)).filter(Boolean);
      if (tg.length) { const rs = tg.map((n) => n.getBoundingClientRect()); const l = Math.min(...rs.map((r) => r.left)) - 8, tp = Math.min(...rs.map((r) => r.top)) - 8, rr = Math.max(...rs.map((r) => r.right)) + 8, bt = Math.max(...rs.map((r) => r.bottom)) + 8; spot.style.cssText = `left:${l}px;top:${tp}px;width:${rr - l}px;height:${bt - tp}px`; } else spot.style.cssText = 'left:50%;top:40%;width:0;height:0;outline:none;box-shadow:0 0 0 200vmax rgba(0,0,0,.3)';
      const card = el('div', 'tcard', `<div class="step">${i + 1} / ${T.length}</div><h3>${esc(t.title)}</h3><p>${esc(fmt(t.text, {}))}</p>`);
      const row = el('div', 'row'), dots = el('div', 'dots', T.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')), sk = el('button', 'btn small ghost', esc(UI.skip)), nx = el('button', 'btn small', esc(i === T.length - 1 ? UI.done : UI.next));
      sk.onclick = end; nx.onclick = () => (++i >= T.length ? end() : show()); row.append(sk, dots, nx); card.appendChild(row); wrap.append(spot, card);
    };
    const end = () => { wrap.remove(); opening(); }; show();
  }
  async function opening() {
    $('#hotspots').style.visibility = 'hidden'; let sharpened = false;
    const sharpen = () => { if (sharpened) return; sharpened = true; const p = pano(); p.style.transition = `filter ${CFG.sharpenMs}ms ease`; p.classList.remove('blur'); };
    await say(D.opening, { onLine: (i) => { if (i === D.opening.length - 1) sharpen(); }, onEnd: sharpen });
    sharpen(); $('#hotspots').style.visibility = ''; S.playing = true; S.lastTap = S.lastIdle = performance.now(); FX.setSound(S.soundOn); FX.setSfx(S.sfxOn); FX.setMusic(S.musicOn); FX.musicStart(); lastT = performance.now();
    await enterRoom();
  }

  /* ================= debug tools (localhost + ?debug=1 only) ================= */
  function updateDebug() {
    const b = $('#debugBar'); b.innerHTML = ''; b.classList.remove('hidden');
    b.appendChild(el('span', '', (b.dataset.xy || 'click the room for yaw/pitch') + ' | '));
    D.rooms.forEach((r, i) => { const x = el('button', '', 'R' + (i + 1)); x.onclick = () => debugJump(i); b.appendChild(x); });
    [['+60s', () => (S.time += 60)], ['solve', () => { if (S.panel) solvedDebug(); }], ['all', () => debugJump(S.room)]].forEach(([n, f]) => { const x = el('button', '', n); x.onclick = f; b.appendChild(x); });
  }
  function solvedDebug() { const sp = S.panel; if (sp.pid === 'choice') solved('A'); else solved(); }
  async function debugJump(i, carry) {
    if (carry === undefined) carry = true;
    for (let r = 0; r < (carry ? i : 0); r++) { const R = D.rooms[r]; R.hotspots.forEach((h) => { if (h.kind !== 'EXIT') S.done.add(h.id); if (h.item) gain(h.item); if (h.gives) gain(h.gives); if (h.note && !S.notes.includes(h.note)) S.notes.push(h.note); }); R.reward.items.forEach(gain); R.reward.notes.forEach((n) => !S.notes.includes(n) && S.notes.push(n)); S.rewarded[R.id] = true; S.finished[R.id] = true; }
    S.marks = carry ? i : 0; if (!S.playing) { S.playing = true; S.time = S.time || CFG.timerSeconds; $('#screens').innerHTML = ''; $('#hud').classList.remove('hidden'); pano().classList.remove('blur'); $('#hotspots').style.visibility = ''; FX.musicStart(); }
    closePanel(); clearDialogue(); await loadRoom(i); enterRoom();
  }

  /* ================= boot ================= */
  async function boot() {
    try { D = await (await fetch('game.json', { cache: 'no-cache' })).json(); } catch (e) { document.body.innerHTML = '<p style="color:#fff;padding:20px;font:18px sans-serif">Could not load game.json. Start the game with: python -m http.server</p>'; return; }
    CFG = API.cfg = D.config; UI = D.ui; S.time = CFG.timerSeconds; S.hints = CFG.hintsTotal;
    const errs = validate(D); if (errs.length) { console.error('game.json problems:\n' + errs.join('\n')); if (DEBUG) { $('#screens').innerHTML = `<div class="scr" style="background:#300;color:#fff;align-items:flex-start;overflow:auto"><pre style="white-space:pre-wrap">${esc(errs.join('\n'))}</pre></div>`; return; } }
    document.title = CFG.title; document.querySelectorAll('.ico[data-ico]').forEach((n) => n.replaceWith(icon(n.dataset.ico)));
    $('#btnPause').appendChild(icon('pause')); $('#btnJournal').appendChild(icon('journal')); const hb = $('#btnHint'); hb.insertBefore(icon('hint'), hb.firstChild);
    $('#btnPause').onclick = pause; $('#btnJournal').onclick = () => openJournal(); $('#btnHint').onclick = useHint;
    FX.init(CFG.particles); FX.vignette(.1); bindStage(); requestAnimationFrame(frame);
    if (DEBUG) { window.G = { S, D, API, loadRoom, debugJump, finishRoom, say, tap: (id) => { const o = HS.get(id); if (o) tapHotspot(o); return !!o; }, look: (y, p) => { viewer.setYaw(y, false); viewer.setPitch(p || 0, false); }, openPanel, closePanel }; updateDebug(); }
    await loadRoom(0, { first: true }); pano().classList.add('blur'); pano().style.setProperty('--blur', CFG.blurPx + 'px');
    const q = new URLSearchParams(location.search), rn = +q.get('room');
    if (DEBUG && rn >= 1 && rn <= D.rooms.length) { S.gesture = true; await debugJump(rn - 1, q.get('carry') === '1'); return; }
    showTitle();
  }
  boot();
})();
