/* The Forbidden Creature Archives. Vanilla JS. Every word and number comes from game.json. */
(function () {
  'use strict';
  const DEBUG = /[?&]debug=1/.test(location.search) && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const NOART = DEBUG && /[?&]noart=1/.test(location.search);
  const $ = (s, r) => (r || document).querySelector(s);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const SVGNS = 'http://www.w3.org/2000/svg';
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const k in props || {}) {
      const v = props[k]; if (v == null || v === false) continue;
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'class') e.className = v; else if (k === 'style') e.style.cssText = v;
      else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach(c => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); });
    return e;
  }
  const svgIcon = (inner, vb) => { const s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('viewBox', vb || '0 0 24 24'); s.innerHTML = inner; return s; };
  const ICONS = {
    pause: '<path d="M8 5v14M16 5v14"/>', book: '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM8 4v13M8 17h10"/>',
    panel: '<path d="M4 8h5V4h6v4h5v6h-5v6H9v-6H4z" transform="scale(.9) translate(1.3 1.3)"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    tube: '<path d="M4 18c0-6 4-4 8-8s2-6 8-6M4 18l3 3M17 4l3 3"/>', bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'
  };

  let G, S, viewer, room, hsEls = {}, hsOn = new Set(), tapBusy = false, roomReady = null;
  const lines = {}, locks = new Set(), modalStack = [], artCache = {};
  const T = (k, v) => { let s = G.ui[k]; if (s == null) { console.warn('missing ui key', k); s = k; } return v ? s.replace(/\{(\w+)\}/g, (_, n) => v[n]) : s; };
  const fmt = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const cfg = () => G.config;

  function newState() {
    return { phase: 'tap', playing: false, over: false, audioOn: false, voiceOn: S ? S.voiceOn : true, sfxOn: S ? S.sfxOn : true, musicOn: S ? S.musicOn : true, roomIdx: 0, score: 0, timeLeft: G.config.timerSeconds, last: performance.now(),
      hintsLeft: G.config.hintsPerGame, done: new Set(), found: new Set(), solved: {}, discussStarted: {}, discussDone: {}, bankIdx: {}, notes: [], clues: [], freed: new Set(), latches: 0, pst: {},
      rewarded: {}, lastTap: performance.now(), r7: { part: 'A', cross: 5, wrongB: 0 }, noArt: false, ending: null, stats: { finds: 0, wrong: 0, hints: 0 } };
  }

  /* ================= boot ================= */
  async function boot() {
    try { G = await (await fetch('game.json', { cache: 'no-cache' })).json(); }
    catch (e) { document.body.append(h('p', { style: 'padding:24px' }, 'Could not load game.json. Serve this folder with: python -m http.server')); return; }
    Object.values(G.rooms).forEach(r => r.conversation.forEach(l => lines[l.id] = l));
    G.opening.forEach(l => lines[l.id] = l); lines[G.idle.id] = G.idle; Object.values(G.ending).forEach(a => a.forEach(l => lines[l.id] = l));
    const errs = validate(); S = newState();
    document.documentElement.style.setProperty('--blur', cfg().blurPx + 'px'); document.documentElement.style.setProperty('--blur-s', cfg().blurSeconds + 's');
    FX.init($('#fxlayer'), $('#shake'), { maxParticles: cfg().maxParticles });
    buildHud(); wireGlobal(); showTap();
    window.TFCA = { h, T, G, wait, sprite, toast, narrate, wrongAnswer: wrongAnswer };
    if (DEBUG) debugTools(errs);
    setInterval(tick, 200); setInterval(idleCheck, 1000);
  }

  function validate() {
    const errs = []; const bad = m => { errs.push(m); console.error('[validate]', m); };
    Object.values(G.rooms).forEach(r => {
      const ids = new Set(); r.hotspots.forEach(x => { if (ids.has(x.id)) bad('duplicate hotspot id ' + x.id); ids.add(x.id); });
      r.hotspots.forEach(x => { (x.after || []).forEach(a => { if (!ids.has(a)) bad(`${x.id}: unknown after "${a}"`); });
        if (x.line && !lines[x.line]) bad(`${x.id}: unknown line ${x.line}`); });
      const state = {}; const byId = Object.fromEntries(r.hotspots.map(x => [x.id, x]));
      const visit = id => { if (state[id] === 2) return; if (state[id] === 1) return bad('cycle at ' + id); state[id] = 1; ((byId[id] || {}).after || []).forEach(visit); state[id] = 2; };
      r.hotspots.forEach(x => visit(x.id));
      r.conversation.forEach(l => { if (typeof l.pausesTimer !== 'boolean') bad(l.id + ': pausesTimer missing'); if (!G.characters[l.speaker]) bad(l.id + ': unknown speaker'); });
      [r.panel].concat(r.panel && r.panel.parts ? Object.values(r.panel.parts) : []).forEach(pn => { if (pn && pn.parts === undefined && !window.Panels[pn.type]) bad(`room ${r.id}: no panel type ${pn.type}`); });
      (r.bank || []).concat(...Object.values(r.banks || {})).forEach(id => { if (!lines[id]) bad('bank line missing ' + id); });
    });
    return errs;
  }

  /* ================= art helpers ================= */
  const hasArt = url => NOART ? Promise.resolve(false) : (artCache[url] = artCache[url] || new Promise(r => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = url; }));
  const CREATURES = ['twiglet', 'veilape', 'pilferling', 'coilwing', 'hornback', 'dewmoth', 'stormwing'];
  function sprite(name, label, cls) {
    const fb = () => name.startsWith('sh_') || !CREATURES.includes(name) ? h('span', { class: (cls || '') + ' fbl' }, label) : h('span', { class: 'blob ' + (cls || '') });
    if (NOART) return fb();
    const img = h('img', { src: `assets/cut/${name}.png`, alt: label || name, class: cls, draggable: 'false' });
    img.onerror = () => img.replaceWith(fb()); return img;
  }
  function fallbackPano(rm) {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 1024; const x = c.getContext('2d'), acc = rm.accent;
    const g = x.createLinearGradient(0, 0, 0, 1024); g.addColorStop(0, '#0b0907'); g.addColorStop(.45, acc + '55'); g.addColorStop(.5, '#1a130c'); g.addColorStop(1, '#0b0907'); x.fillStyle = g; x.fillRect(0, 0, 2048, 1024);
    x.fillStyle = '#0006'; for (let i = 0; i < 16; i++) { const w = 60 + (i * 37) % 70, hh = 160 + (i * 91) % 240; x.fillRect(i * 128 + 20, 512 - hh, w, hh); }
    x.strokeStyle = acc + '55'; x.lineWidth = 3; for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(0, 520 + i * 55); x.lineTo(2048, 520 + i * 55); x.stroke(); }
    x.fillStyle = '#f2e8d0aa'; x.font = '60px Georgia'; x.textAlign = 'center'; x.fillText(rm.title, 1024, 300); return c.toDataURL('image/jpeg', .85);
  }

  /* ================= audio + narrate ================= */
  const Aud = { el: null, ctx: null, gain: null, started: false };
  function unlockAudio() {
    S.audioOn = true;
    try { if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch (e) {}
    Aud.ctx = Snd.unlock(); syncSnd();
  }
  function startBgm() {
    if (Aud.started || !S.audioOn) return; Aud.started = true;
    const a = new Audio('assets/audio/bgm.mp3'); a.loop = true; a.volume = bgmLevel(false); Aud.el = a;
    const drone = () => { Aud.el = null; Snd.startMusic(); }; // no bgm.mp3: the score is made in the browser
    a.addEventListener('error', drone); a.play().catch(() => { if (a.error) drone(); });
  }
  const bgmLevel = duck => S.musicOn ? (duck ? cfg().bgmDuckVolume : cfg().bgmVolume) : 0;
  function syncSnd() { Snd.musicOn = S.musicOn; Snd.sfxOn = S.sfxOn && cfg().sfx.enabled; Snd.musicVol = cfg().bgmVolume; }
  function setBgm(duck) { syncSnd(); Snd.duck = duck; Snd.level(); if (Aud.el) Aud.el.volume = Math.min(1, bgmLevel(duck)); }
  function cancelSpeech() { Aud.tok = (Aud.tok || 0) + 1; try { speechSynthesis.cancel(); } catch (e) {} if (Aud.line) { Aud.line.pause(); Aud.line = null; } setBgm(false); }
  function pauseSpeech() { try { speechSynthesis.pause(); } catch (e) {} if (Aud.line) Aud.line.pause(); Snd.duck = false; Snd.level(); }
  function resumeSpeech() { if (!S.voiceOn) return cancelSpeech(); try { speechSynthesis.resume(); } catch (e) {} if (Aud.line) Aud.line.play().catch(() => {}); }
  const preloaded = new Set();
  function preload(ln) { if (ln && ln.audioFile && !preloaded.has(ln.audioFile)) { preloaded.add(ln.audioFile); const a = new Audio(); a.preload = 'auto'; a.src = ln.audioFile; } }
  function narrate(x) {
    cancelSpeech(); const ln = typeof x === 'string' ? (lines[x] || { speaker: 'narrator', text: x }) : x;
    if (!S.audioOn || !S.voiceOn || ln.silent) return;
    if (ln.audioFile) { const a = new Audio(ln.audioFile); Aud.line = a; a.onplay = () => setBgm(true); a.onended = () => setBgm(false); a.onerror = () => { Aud.line = null; speak(ln); }; a.play().catch(e => { if (Aud.line === a && e.name !== 'AbortError') speak(ln); }); return; }
    speak(ln);
  }
  function speak(ln) {
    if (!('speechSynthesis' in window)) return; const c = G.characters[ln.speaker] || G.characters.narrator;
    const u = new SpeechSynthesisUtterance(ln.text); u.pitch = c.pitch; u.rate = c.rate; u.lang = 'en-US';
    const v = speechSynthesis.getVoices().find(v => /^en[-_]/i.test(v.lang)); if (v) u.voice = v;
    u.onstart = () => setBgm(true); u.onend = u.onerror = () => setBgm(false); Aud.utt = u; // kept so the browser cannot collect it mid-sentence
    const tok = Aud.tok; setTimeout(() => { if (tok !== Aud.tok) return; try { speechSynthesis.resume(); } catch (e) {} speechSynthesis.speak(u); }, 120); // speaking right after cancel() is dropped by Chrome
  }

  /* ================= clock, score, HUD ================= */
  const lock = k => { locks.add(k); renderClock(); }, unlock = k => { locks.delete(k); renderClock(); };
  function tick() {
    const now = performance.now();
    if (S.playing && !S.over && !locks.size) { S.timeLeft = Math.max(0, S.timeLeft - (now - S.last) / 1000); if (S.timeLeft <= 0) timeUp(); }
    S.last = now; renderClock();
  }
  function renderClock() {
    const c = $('#clock'); if (!c) return; const t = fmt(S.timeLeft); if (c.textContent !== t) c.textContent = t;
    c.classList.toggle('low', S.playing && S.timeLeft < cfg().redClockSeconds); c.classList.toggle('frozen', S.playing && locks.size > 0 && !S.over);
  }
  function addScore(n, why) {
    const before = S.score; S.score = Math.max(0, S.score + n); const d = S.score - before; renderScore();
    if (d) { const p = h('span', { class: 'pop ' + (d > 0 ? 'up' : 'down') }, (d > 0 ? '+' : '') + d); $('#wonder').append(p); setTimeout(() => p.remove(), 1100); }
  }
  function renderScore() { const b = $('#wonder b'); if (b) b.textContent = S.score; }
  function buildHud() {
    const hud = $('#hud');
    hud.append(
      h('div', { class: 'hud-top' }, h('button', { id: 'pauseBtn', class: 'pill icon', 'aria-label': T('hud.pause'), title: T('hud.pause'), onclick: () => pauseGame() }, svgIcon(ICONS.pause)), h('div', { id: 'objective' }), h('div', { id: 'clock', class: 'pill' }, '10:00')),
      h('div', { class: 'hud-mid' }, h('div', { id: 'wonder', class: 'pill' }, h('small', {}, T('hud.wonder')), h('b', {}, '0')), h('div', { id: 'latches', class: 'pill', 'aria-label': T('hud.latches') }),
        h('button', { id: 'nbBtn', class: 'pill icon wide', 'aria-label': T('hud.notebook'), onclick: () => openNotebook() }, svgIcon(ICONS.book), h('span', { class: 'lbl' }, T('hud.notebook')))),
      h('div', { id: 'strip' }));
    const hb = $('#hintBtn'); hb.onclick = useHint; renderLatches(); renderHint();
    const fit = () => document.documentElement.style.setProperty('--hud-h', hud.offsetHeight + 'px');
    new ResizeObserver(fit).observe(hud); addEventListener('resize', fit); fit();
  }
  function renderLatches(newIdx) {
    const box = $('#latches'); box.replaceChildren(...Array.from({ length: 7 }, (_, i) => {
      const s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('viewBox', '0 0 24 24');
      s.innerHTML = `<rect x="3" y="7" width="18" height="12" rx="3" class="latch ${i < S.latches ? 'shut' : ''} ${i === newIdx ? 'new' : ''}"/><path d="M8 7V5a4 4 0 0 1 8 0v2" fill="none" stroke="#8a6429" stroke-width="2"/>`;
      s.firstChild.setAttribute('class', `latch ${i < S.latches ? 'shut' : ''} ${i === newIdx ? 'new' : ''}`); return s; }));
  }
  function renderHint() { const b = $('#hintBtn'); b.replaceChildren(svgIcon(ICONS.bulb), h('span', {}, T('hud.hint')), h('b', { class: 'badge', 'aria-label': T('hud.hintsLeft', { n: S.hintsLeft }) }, String(S.hintsLeft))); b.classList.toggle('locked', S.hintsLeft <= 0); }
  function renderStrip() {
    const el = $('#strip'); el.replaceChildren(); if (!room) return; const fs = room.hotspots.filter(x => x.kind === 'FIND'); if (!fs.length) return;
    el.append(h('span', { class: 'striplabel' }, T('hud.find')), ...fs.map(x => { const got = S.found.has(x.id); return h('span', { class: 'chip' + (got ? ' got' : ''), title: got ? x.label : '?' }, got ? '✓' : '?'); }));
  }
  function setObjective(t) { $('#objective').textContent = t; }
  function toast(msg) { const t = h('div', { class: 'toast' }, msg); $('#toasts').append(t); setTimeout(() => t.remove(), 2700); }

  /* ================= modals ================= */
  function openModal({ title, cls, paper, accent, build, onClose }) {
    const body = h('div', { class: 'mbody' });
    const x = h('button', { class: 'xbtn', 'aria-label': T('ui.close'), onclick: () => close() }, '✕');
    const box = h('div', { class: 'mbox' + (paper ? ' paperbox' : '') }, h('div', { class: 'mhead' }, h('h2', {}, title), x), body);
    const el = h('div', { class: 'modal ' + (cls || ''), style: accent ? `--accent:${accent}` : '' }, box); let down = false, closed = false;
    el.addEventListener('pointerdown', e => { down = e.target === el; }); el.addEventListener('click', e => { if (down && e.target === el) close(); down = false; });
    const m = { el, body, close };
    function close() { if (closed) return; closed = true; el.remove(); modalStack.splice(modalStack.indexOf(m), 1); cancelSpeech(); if (onClose) onClose(); }
    cancelSpeech(); $('#modals').append(el); modalStack.push(m); build(body, close, m); return m;
  }
  const showCard = ({ title, text, saved, accent, extra, img }) => new Promise(res => openModal({ title, cls: 'card', paper: true, accent: accent || room && room.accent, build: b => { b.append(...[img && h('div', { class: 'itemfig' }, sprite(img, title, 'itemimg')), h('div', {}, text), extra, saved && h('div', { class: 'saved' }, saved)].filter(Boolean)); }, onClose: res }));
  const topModal = () => modalStack[modalStack.length - 1];
  const closeAllModals = () => { while (modalStack.length) modalStack[modalStack.length - 1].close(); };

  /* ================= dialogue ================= */
  const dq = []; let dBusy = false, dCur = null;
  function say(ls, opt) {
    const arr = (Array.isArray(ls) ? ls : [ls]).map(l => typeof l === 'string' ? lines[l] : l).filter(Boolean);
    if (!arr.length) return Promise.resolve();
    return new Promise(res => { dq.push({ lines: arr, res, skip: false }); pumpDlg(); });
  }
  async function pumpDlg() {
    if (dBusy) return; dBusy = true;
    while (dq.length) { const c = dq.shift(); for (const ln of c.lines) { if (c.skip) break; await showLine(ln, c); } c.res(); }
    dBusy = false; $('#dlg').hidden = true; $('#blocker').hidden = true; document.body.classList.remove('dlg-open'); dCur = null;
  }
  function showLine(ln, c) {
    return new Promise(res => {
      const chr = G.characters[ln.speaker] || G.characters.narrator, beat = !!ln.beat;
      const dlg = $('#dlg'); dlg.hidden = false; document.body.classList.add('dlg-open');
      const bl = $('#blocker'); bl.hidden = !ln.pausesTimer && !ln.modal; if (ln.pausesTimer) lock('dlg');
      const nob = ln.speaker === 'narrator', box = h('div', { class: 'dbox' + (beat ? ' beat' : '') + (nob ? ' nobust' : ''), role: 'dialog' },
        nob ? null : h('div', { class: 'bust' }, bustEl(ln, chr)),
        h('div', { class: 'dtxt' }, h('div', { class: 'dhead' }, h('span', { class: 'dname' }, chr.name), h('button', { class: 'dskip', onclick: e => { e.stopPropagation(); c.skip = true; fin(); } }, T('dlg.skip'))), h('div', { class: 'dtext' }, ln.text), h('div', { class: 'dnext' }, T('dlg.next'))));
      dlg.replaceChildren(box); document.documentElement.style.setProperty('--dlg-h', box.offsetHeight + 'px'); let over = false; dCur = { fin };
      function fin() { if (over) return; over = true; cancelSpeech(); unlock('dlg'); bl.onclick = null; document.removeEventListener('keydown', key); res(); }
      const key = e => { if (e.key === 'Enter' || e.key === ' ') { if (!modalStack.length || ln.pausesTimer) { e.preventDefault(); fin(); } } };
      box.onclick = fin; bl.onclick = fin; document.addEventListener('keydown', key);
      narrate(ln); const nx = c.lines[c.lines.indexOf(ln) + 1]; preload(nx);
    });
  }
  function bustEl(ln, chr) {
    const sid = ln.speaker;
    const file = chr.busts && (chr.busts[ln.mood] || chr.busts[chr.defaultMood]);
    const fb = () => h('div', { class: 'initials', style: `background:${chr.color}` }, chr.initials);
    if (!file || NOART) return fb(); const img = h('img', { src: file, alt: chr.name }); img.onerror = () => img.replaceWith(fb()); return img;
  }
  const conv = when => room.conversation.filter(l => l.when === when);

  /* ================= pause ================= */
  let paused = false;
  function pauseGame() {
    if (paused || !S.playing || S.over || document.body.classList.contains('cine')) return; paused = true; lock('pause'); pauseSpeech(); FX.pause();
    const pl = $('#pauseLayer'); pl.hidden = false;
    const voice = h('button', { class: 'btn ghost' }), music = h('button', { class: 'btn ghost' }), sfxb = h('button', { class: 'btn ghost' });
    const paint = () => { voice.textContent = T(S.voiceOn ? 'pause.voiceOn' : 'pause.voiceOff'); music.textContent = T(S.musicOn ? 'pause.musicOn' : 'pause.musicOff'); sfxb.textContent = T(S.sfxOn ? 'pause.sfxOn' : 'pause.sfxOff'); };
    voice.onclick = () => { S.voiceOn = !S.voiceOn; if (!S.voiceOn) cancelSpeech(); paint(); }; music.onclick = () => { S.musicOn = !S.musicOn; setBgm(false); paint(); }; sfxb.onclick = () => { S.sfxOn = !S.sfxOn; syncSnd(); paint(); };
    pl.replaceChildren(h('h1', {}, T('pause.title')), h('button', { class: 'btn big', onclick: resumeGame }, T('pause.resume')), music, sfxb, voice); paint();
  }
  function resumeGame() { if (!paused) return; paused = false; $('#pauseLayer').hidden = true; unlock('pause'); S.last = performance.now(); FX.resume(); resumeSpeech(); }

  /* ================= global wiring ================= */
  function wireGlobal() {
    document.addEventListener('pointerdown', () => { S.lastTap = performance.now(); }, true);
    document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.locked')) { e.stopPropagation(); e.preventDefault(); } }, true);
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (paused) return resumeGame(); const m = topModal(); if (m) m.close(); else if (S.playing && !(dCur && locks.has('dlg'))) pauseGame();
    });
    document.addEventListener('contextmenu', e => { if (e.target.closest('#pano')) e.preventDefault(); });
  }
  function idleCheck() {
    if (!S.playing || S.over || paused || dBusy || modalStack.length || document.body.classList.contains('cine')) return;
    if (performance.now() - S.lastTap > cfg().idleSeconds * 1000) { S.lastTap = performance.now(); say([G.idle]); }
  }
  function drag(el, { onTap, onDrop }) {
    el.addEventListener('pointerdown', e => {
      if (e.button > 0) return; const sx = e.clientX, sy = e.clientY; let ghost = null, moved = false;
      const move = ev => {
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) { moved = true; ghost = el.cloneNode(true); ghost.classList.add('dragghost'); document.body.append(ghost); el.style.opacity = .35; }
        if (ghost) { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; }
      };
      const up = ev => { document.removeEventListener('pointermove', move); document.removeEventListener('pointercancel', up); if (ghost) { ghost.remove(); el.style.opacity = ''; onDrop && onDrop(document.elementFromPoint(ev.clientX, ev.clientY)); } else if (ev.type === 'pointerup') onTap && onTap(); };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up, { once: true }); document.addEventListener('pointercancel', up, { once: true });
    });
  }

  /* ================= start flow ================= */
  const screens = () => $('#screens');
  const setScreen = el => { screens().replaceChildren(el || ''); };
  async function showTap() {
    S.phase = 'tap'; const t = G.screens.tap; const bgOk = await hasArt('assets/sheets/tap_to_start.jpg');
    const s = h('div', { class: 'screen tapscreen', role: 'button', tabindex: 0 },
      bgOk ? h('div', { class: 'art', style: 'background-image:url(assets/sheets/tap_to_start.jpg)' }) : h('div', { class: 'suitcase' }),
      h('h1', {}, h('small', {}, t.kicker), t.title), h('div', { class: 'go' }, t.prompt));
    const go = () => { s.onclick = null; unlockAudio(); roomReady = prepareRoom1(); showMission(); };
    s.onclick = go; s.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') go(); }; setScreen(s);
  }
  async function prepareRoom1() { S.roomIdx = 0; room = G.rooms[0]; $('#pano').classList.add('blur'); await buildViewer(room); applyRoomUi(); }
  async function showMission() {
    S.phase = 'mission'; const m = G.screens.mission; const bgOk = await hasArt('assets/sheets/briefing_bg.jpg');
    const s = h('div', { class: 'screen mission' }, bgOk ? h('div', { class: 'art', style: 'background-image:url(assets/sheets/briefing_bg.jpg)' }) : h('div', { class: 'sky' }), h('div', { class: 'shade' }),
      h('div', { class: 'txt' }, h('h1', {}, m.heading), ...m.paragraphs.map(p => h('p', {}, p)), h('button', { class: 'btn big', onclick: async () => { cancelSpeech(); s.querySelector('.btn').disabled = true; await roomReady; showTutorial(); } }, m.button)));
    setScreen(s); narrate({ speaker: 'narrator', text: [m.heading, ...m.paragraphs].join('. '), audioFile: m.audioFile });
  }
  async function showTutorial() {
    S.phase = 'tutorial'; $('#hud').hidden = false; $('#app').dataset.room = 1; applyRoomUi(); const cards = G.screens.tutorial; let i = 0;
    const spot = h('div', { class: 'spot none' }), card = h('div', { class: 'mbox tutcard' }), demo = h('div', { class: 'demo', hidden: true });
    const ov = h('div', { class: 'screen tut' }, demo, spot, card); setScreen(ov);
    const rectOf = sel => { const els = sel.split(',').map(s => $(s.trim())).filter(Boolean); if (!els.length) return null; const r = els.map(e => e.getBoundingClientRect()); const l = Math.min(...r.map(x => x.left)), t = Math.min(...r.map(x => x.top)), rr = Math.max(...r.map(x => x.right)), b = Math.max(...r.map(x => x.bottom)); return { l, t, w: rr - l, h: b - t }; };
    const show = () => {
      const c = cards[i]; demo.hidden = c.spot !== '.demo'; const r = c.spot ? rectOf(c.spot) : null;
      if (r) { const pad = 8; spot.className = 'spot'; spot.style.cssText = `left:${r.l - pad}px;top:${r.t - pad}px;width:${r.w + pad * 2}px;height:${r.h + pad * 2}px`; } else { spot.className = 'spot none'; spot.style.cssText = 'left:50%;top:50%;width:1px;height:1px'; }
      const top = r && r.t > innerHeight * .5; card.classList.toggle('top', !!top);
      card.replaceChildren(h('div', { class: 'mbody' }, h('div', {}, c.text), h('div', { class: 'tutrow' }, h('small', {}, `${i + 1} / ${cards.length}`), h('span', {}, h('button', { class: 'btn ghost', onclick: done }, T('ui.skip')), ' ', h('button', { class: 'btn', onclick: next }, T(i === cards.length - 1 ? 'ui.letsGo' : 'ui.next'))))));
    };
    const next = () => { if (++i >= cards.length) done(); else show(); }; const done = () => { showOpening(); };
    show();
  }
  async function showOpening() {
    S.phase = 'opening'; setScreen(); await say(G.opening); startPlay();
  }
  function startPlay() {
    S.phase = 'play'; S.playing = true; S.last = performance.now(); S.lastTap = performance.now();
    $('#pano').classList.remove('blur'); startBgm(); renderScore(); syncHotspots(); renderStrip(); runEnter();
  }

  /* ================= rooms ================= */
  function applyRoomUi() {
    $('#app').style.setProperty('--accent', room.accent); $('#app').dataset.room = room.id; setObjective(room.id === 7 ? room.objectives[S.r7.part] : room.objective); renderStrip(); renderLatches(); renderScore(); renderHint();
    $('#hintBtn').hidden = !S.playing;
  }
  async function buildViewer(rm) {
    if (viewer) { try { viewer.destroy(); } catch (e) {} viewer = null; } $('#pano').replaceChildren(); hsOn = new Set(); hsEls = {};
    let url = rm.panorama; const ok = await hasArt(url); S.noArt = !ok; if (!ok) url = fallbackPano(rm);
    viewer = pannellum.viewer('pano', { type: 'equirectangular', panorama: url, autoLoad: true, showControls: false, compass: false, hfov: innerWidth < innerHeight ? 72 : 100, minHfov: 45, maxHfov: 110, mouseZoom: true, yaw: rm.startYaw || 0, pitch: 0, friction: .12, keyboardZoom: false, disableKeyboardCtrl: true });
    await new Promise(res => { viewer.on('load', res); viewer.on('error', res); setTimeout(res, 25000); });
    if (DEBUG && !window.__dbgClick) window.__dbgClick = $('#app').addEventListener('click', e => { if (!e.target.closest('#pano')) return; try { const [p, y] = viewer.mouseEventToCoords(e); const t = `yaw ${y.toFixed(1)}  pitch ${p.toFixed(1)}`; console.log(t); dbg(t); } catch (er) {} });
  }
  async function enterRoom(i, quick) {
    const fade = $('#fade'); fade.classList.add('on'); await wait(quick ? 0 : 480); closeAllModals(); FX.stopAll(); clearSprites();
    S.roomIdx = i; room = G.rooms[i]; await buildViewer(room); applyRoomUi(); syncHotspots(); fade.classList.remove('on'); await wait(300); S.lastTap = performance.now();
  }
  async function runEnter() {
    if (room.id === 7) return r7Enter();
    await say(conv('enter')); await say(conv('radio')); showObjective();
  }
  function showObjective() { return showCard({ title: T('ui.objective'), text: room.objectiveCard || room.objective, accent: room.accent }); }

  /* ----- hotspots ----- */
  function hotspot(id) { return room.hotspots.find(x => x.id === id); }
  function avail(hs) {
    if (hs.fromNotebook || hs.auto) return false; if (!(hs.after || []).every(a => S.done.has(a))) return false;
    switch (hs.kind) {
      case 'FIND': return !S.done.has(hs.id);
      case 'LEARN': case 'INSPECT': return true;
      case 'PANEL': return !S.done.has(hs.id) && !S.solved[hs.id] && (room.id === 7 || S.discussDone[room.id]);
      case 'EXIT': return !!S.rewarded[room.id];
    } return false;
  }
  function syncHotspots() {
    if (!viewer || !room) return;
    room.hotspots.forEach(hs => {
      const want = S.phase === 'play' && avail(hs), on = hsOn.has(hs.id);
      if (want && !on) {
        viewer.addHotSpot({ id: hs.id, pitch: hs.pitch, yaw: hs.yaw, type: 'custom', cssClass: 'hs', createTooltipFunc: div => {
          let last = 0; const inner = hsInner(hs); hsEls[hs.id] = inner; div.append(inner); div.setAttribute('title', hs.label); div.setAttribute('role', 'button'); div.setAttribute('aria-label', hs.label);
          let sx = 0, sy = 0; div.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
          div.addEventListener('click', e => { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 12) return; const n = performance.now(); if (n - last < 400) return; last = n; hotspotTap(hs); }); // a drag that starts on a hotspot just pans
        } }); hsOn.add(hs.id);
      } else if (!want && on) { try { viewer.removeHotSpot(hs.id); } catch (e) {} hsOn.delete(hs.id); delete hsEls[hs.id]; }
      else if (want && on && hsEls[hs.id]) hsEls[hs.id].classList.toggle('done', S.done.has(hs.id));
    });
  }
  function hsInner(hs) {
    const k = hs.kind.toLowerCase(), boxed = S.noArt;
    const i = h('div', { class: `hsi ${k}${boxed ? ' boxed' : ''}${S.done.has(hs.id) ? ' done' : ''}` });
    if (boxed) i.append(hs.label); else if (hs.kind === 'FIND' && hs.img) i.append(sprite(hs.img, hs.label, 'hsimg')); else if (hs.kind === 'PANEL') i.append(svgIcon(ICONS.panel)); else if (hs.kind === 'EXIT') { i.append(svgIcon(ICONS.arrow), h('span', { class: 'tag' }, hs.label)); }
    return i;
  }
  async function hotspotTap(hs) {
    if (tapBusy || S.phase !== 'play' || S.over || paused || modalStack.length || document.body.classList.contains('cine')) return; tapBusy = true; S.lastTap = performance.now();
    try {
      if (hs.kind === 'FIND') await doFind(hs); else if (hs.kind === 'LEARN') await doLearn(hs); else if (hs.kind === 'INSPECT') await doInspect(hs);
      else if (hs.kind === 'PANEL') openPanel(hs); else if (hs.kind === 'EXIT') await goNext();
    } finally { tapBusy = false; }
  }
  function addClue(c) { if (!S.clues.some(x => x.id === c.id)) S.clues.push(Object.assign({ room: room.id }, c)); }
  function flyTo(fromEl, label) {
    const to = $('#nbBtn').getBoundingClientRect(); const fr = fromEl ? fromEl.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    const f = h('div', { class: 'flyer', style: `left:${fr.left + fr.width / 2}px;top:${fr.top + fr.height / 2}px` }, h('div', { class: 'boxed' }, label)); document.body.append(f);
    requestAnimationFrame(() => requestAnimationFrame(() => { f.style.left = to.left + to.width / 2 + 'px'; f.style.top = to.top + to.height / 2 + 'px'; f.style.transform = 'scale(.3)'; f.style.opacity = .3; })); setTimeout(() => f.remove(), 900);
  }
  async function doFind(hs) {
    Snd.sfx('find'); S.done.add(hs.id); S.found.add(hs.id); S.stats.finds++; addScore(cfg().scoring.find); flyTo(hsEls[hs.id], hs.label);
    addClue({ id: hs.id, img: hs.img, seals: hs.seals, title: hs.card.title, text: hs.card.text, action: hs.opens ? { label: hs.opensLabel, hs: hs.opens } : null });
    syncHotspots(); renderStrip(); await showCard({ title: hs.card.title, text: hs.card.text, saved: T('card.added'), img: hs.img, extra: hs.seals ? sealList(hs.seals) : null });
    const nFound = room.hotspots.filter(x => x.kind === 'FIND' && S.found.has(x.id)).length, ln = hs.line || (room.findLines && room.findLines[nFound]);
    if (ln) say([ln]); afterStep();
  }
  async function doLearn(hs) {
    const first = !S.done.has(hs.id); S.done.add(hs.id); addClue({ id: hs.id, title: hs.card.title, text: hs.card.text, seals: hs.seals });
    syncHotspots(); await showCard({ title: hs.card.title, text: hs.card.text, saved: T('card.saved'), extra: hs.seals ? sealList(hs.seals) : null });
    if (first && hs.line) say([hs.line]); if (first) afterStep();
  }
  function sealList(seals) { return h('div', { class: 'seals' }, ...seals.map(s => h('div', {}, Panels.sealGrid(s.grid), h('span', {}, `${s.name}`)))); }
  function doInspect(hs) {
    return new Promise(res => {
      let v = 0; const seen = new Set([0]);
      openModal({ title: hs.card.title, accent: room.accent, onClose: () => { res(); }, build: (b, close) => {
        const view = h('div', { class: 'viewbox' }), txt = h('div', { style: 'min-height:84px;line-height:1.5;font-size:17px' }), dots = h('div', { class: 'dots' }), turn = h('button', { class: 'btn big', onclick: () => { v = (v + 1) % hs.views.length; paint(); } }, T('inspect.turn'));
        const paint = () => {
          const vw = hs.views[v]; view.replaceChildren(svgIcon('<circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/>'), vw.label); view.firstChild.setAttribute('class', 'lens-ico'); txt.replaceChildren(h('span', { class: vw.secret ? 'secret' : '' }, vw.text)); dots.replaceChildren(...hs.views.map((_, i) => h('i', { class: i === v ? 'on' : '' })));
          if (vw.secret && !S.done.has(hs.id)) { Snd.sfx('secret'); S.done.add(hs.id); addScore(cfg().scoring.secret); addClue({ id: hs.id, title: hs.card.title, text: vw.text }); toast(T('inspect.found')); syncHotspots(); if (hs.line) say([hs.line]); afterStep(); }
        };
        b.append(view, txt, dots, turn); paint();
      } });
    });
  }
  function afterStep() {
    syncHotspots(); renderStrip(); if (room.id === 7 || !room.panelId) return; const p = hotspot(room.panelId);
    if (!S.discussStarted[room.id] && p.after.every(a => S.done.has(a))) {
      S.discussStarted[room.id] = true; say(conv('discuss')).then(() => { S.discussDone[room.id] = true; syncHotspots(); });
    }
  }

  /* ----- notebook ----- */
  function openNotebook() {
    if (!S.playing || S.over || paused || document.body.classList.contains('cine') || modalStack.some(m => m.nb)) return;
    let tab = 'notes';
    const m = openModal({ title: T('nb.title'), cls: 'nbm', accent: room.accent, build: (b, close) => {
      const tabs = h('div', { class: 'tabs' }), content = h('div', { style: 'display:flex;flex-direction:column;gap:10px' });
      const paint = () => {
        tabs.replaceChildren(...['notes', 'clues', 'items', 'creatures'].map(t => h('button', { class: 'tab' + (tab === t ? ' on' : ''), onclick: () => { tab = t; paint(); } }, T('nb.' + t))));
        content.replaceChildren(...(tab === 'notes' ? notesTab() : tab === 'clues' ? cluesTab(close) : tab === 'items' ? itemsTab() : creaturesTab()));
      };
      b.append(tabs, content); paint();
    } }); m.nb = true;
  }
  function notesTab() { return G.notes.map((n, i) => { const got = S.notes.includes(n.id); return h('div', { class: 'nbnote paper' + (got ? '' : ' locked') + (got && S.notes[S.notes.length - 1] === n.id ? ' new' : '') }, h('b', {}, T('nb.noteN', { n: n.id }) + (got ? ' — ' + G.rooms[i].title : '')), got ? n.text : T('nb.notWritten')); }); }
  function cluesTab(close) {
    const cl = S.clues.filter(c => c.room === room.id); if (!cl.length) return [h('div', { class: 'nbempty' }, T('nb.noClues'))];
    return cl.map(c => { const act = c.action && !S.done.has(c.action.hs) ? h('button', { class: 'btn', onclick: () => { close(); const hs = hotspot(c.action.hs); setTimeout(() => hotspotTap(hs), 50); } }, c.action.label) : null;
      return h('div', { class: 'nbnote paper clue' }, h('b', {}, c.title), c.text, c.seals ? sealList(c.seals) : null, act); });
  }
  function itemsTab() { const it = S.clues.filter(c => c.img); if (!it.length) return [h('div', { class: 'nbempty' }, T('nb.noItems'))]; return [h('div', { class: 'itgrid' }, ...it.map(c => h('div', { class: 'it' }, sprite(c.img, c.title, 'itemimg'), h('b', {}, c.title))))]; }
  function creaturesTab() { return [h('div', { class: 'crgrid' }, ...G.creatures.map(c => { const got = S.freed.has(c.id); return h('div', { class: 'cr' + (got ? '' : ' locked') }, sprite(c.id, c.name), h('b', {}, got ? c.name : '???'), h('small', {}, got ? c.about : T('nb.notFreed'))); }))]; }

  /* ----- puzzle panels ----- */
  let panelM = null, panelCtx = null;
  function openPanel(hs, onSolved) {
    const data = room.panel; const pd = hs.part ? data.parts[hs.part] : data; const key = room.id + (hs.part || ''); S.pst[key] = S.pst[key] || {}; const st = S.pst[key]; const hooks = {}; let alive = true;
    panelCtx = { hooks, hs, part: hs.part || null };
    panelM = openModal({ title: pd.title, cls: 'panel', accent: room.accent, onClose: () => { alive = false; panelM = null; panelCtx = null; }, build: body => {
      const api = { st, hooks, chances: () => ({ left: cfg().accuseChances - S.r7.wrongB, max: cfg().accuseChances }), alive: () => alive && !!panelM, drag, onCross: n => { S.r7.cross = n; if (room.id === 7 && S.r7.part === 'A') FX.setStorm(n); },
        wrong: els => wrongAnswer(els), solved: arg => { const m = panelM; S.solved[hs.id] = true; syncHotspots(); alive = false; m.close(); (onSolved || roomSolved)(arg, hs); } };
      window.Panels[pd.type](body, pd, api);
    } });
  }
  function lockButtons(els, secs) {
    (els || []).forEach(el => { if (!el || el.classList.contains('locked')) return; el.classList.add('locked'); const ring = h('span', { class: 'lockring' }); el.append(ring); const t0 = performance.now();
      const iv = setInterval(() => { const p = (performance.now() - t0) / (secs * 1000); ring.style.setProperty('--p', Math.min(100, p * 100) + '%'); if (p >= 1) { clearInterval(iv); el.classList.remove('locked'); ring.remove(); } }, 80); });
  }
  function wrongAnswer(els) {
    S.stats.wrong++; Snd.sfx('wrong'); addScore(-cfg().wrongCost); toast(T('toast.wrong', { n: cfg().wrongCost })); lockButtons(els, cfg().lockoutSeconds);
    if (panelM) { panelM.el.querySelector('.mbox').classList.remove('shakeit'); void panelM.el.offsetWidth; panelM.el.querySelector('.mbox').classList.add('shakeit'); }
    if (room.id === 7 && panelCtx && panelCtx.part === 'B') {
      const n = ++S.r7.wrongB; FX.accuseStrike(n);
      if (n >= cfg().accuseChances) { setTimeout(accusedOut, 900); return; }
      toast(T('toast.accuseLeft', { n: cfg().accuseChances - n }));
    }
    const l = nextBank(); if (l) say([l]);
  }
  function bankKey() { return room.id === 7 ? 'r7' + S.r7.part : 'r' + room.id; }
  function nextBank() {
    const ids = room.id === 7 ? room.banks[S.r7.part] : room.bank; if (!ids) return null; const k = bankKey(); const i = S.bankIdx[k] || 0; S.bankIdx[k] = i + 1; return lines[ids[Math.min(i, ids.length - 1)]];
  }
  /* a hint that matches where the player is: what they have, what is missing, or that the puzzle is ready */
  function contextHint() {
    const p = hotspot(room.panelId), say1 = text => ({ id: 'hint_ctx', speaker: 'jacek', text, pausesTimer: false, silent: true }); // text only: no recording, no browser voice
    const todo = p.after.filter(a => !S.done.has(a)).map(hotspot);
    if (todo.length) {
      const have = room.hotspots.filter(x => p.after.includes(x.id) && S.done.has(x.id)).map(x => x.label), t = todo[0];
      return say1([have.length ? T('hint.have', { have: have.join(', ') }) : '', T('hint.next', { label: t.label, where: t.hint || '' })].filter(Boolean).join(' '));
    }
    if (!panelCtx && !S.solved[p.id]) return say1(T('hint.ready', { label: p.label }));
    return null;
  }
  function useHint() {
    if (!S.playing || S.over || paused || document.body.classList.contains('cine')) return;
    if (S.hintsLeft <= 0) return toast(T('hint.none'));
    if (S.score < cfg().hintCost) return toast(T('hint.noPoints', { cost: cfg().hintCost }));
    if (room.id === 7) { if (S.r7.part === 'C') return toast(T('hint.noneHere')); if (!S.done.has('r7_entrance')) return toast(T('hint.early')); }
    const ctx = room.id === 7 ? null : contextHint();
    const k = bankKey(), idx = Math.min(S.bankIdx[k] || 0, 2); S.hintsLeft--; S.stats.hints++; Snd.sfx('hint'); addScore(-cfg().hintCost); renderHint();
    const l = ctx || nextBank(); say([l]); if (room.id === 7 && S.r7.part === 'A' && idx === 2 && panelCtx && panelCtx.hooks.pulse) panelCtx.hooks.pulse();
  }

  /* ----- reward (rooms 1 to 6) ----- */
  async function roomSolved(_, hs) {
    await say(conv('right').concat(conv('final')));
    const rw = room.reward; Snd.sfx('reward'); addScore(cfg().scoring.roomReward); S.notes.push(rw.note); const note = G.notes[rw.note - 1];
    const nbEl = $('#nbBtn'); await showCard({ title: T('reward.noteTitle', { n: note.id }), text: note.text, saved: T('reward.noteSaved') }); flyTo(null, '✎');
    await creatureShow(rw); S.latches++; renderLatches(S.latches - 1); Snd.sfx('latch'); Snd.sfx('unlock', .5); (rw.also || []).forEach(c => S.freed.add(c));
    S.rewarded[room.id] = true; S.done.add(hs.id); syncHotspots(); toast(T('toast.way')); renderStrip();
  }
  async function creatureShow(rw) {
    S.freed.add(rw.creature); Snd.sfx('creature'); const el = h('div', { class: 'creature' }, sprite(rw.creature, rw.creature, 'cimg'), rw.chirp ? h('span', { class: 'chirp' }, rw.chirp) : null, h('b', {}, rw.caption)); document.body.append(el);
    await new Promise(r => { el.addEventListener('animationend', r, { once: true }); setTimeout(r, 3600); }); el.remove();
  }
  async function goNext() { const i = S.roomIdx + 1; if (!G.rooms[i]) return; Snd.sfx('whoosh'); await enterRoom(i); await runEnter(); }

  /* ================= Room 7 ================= */
  function clearSprites() { $('#sprites').replaceChildren(); }
  function showSprite(id, file, x, y, cls) {
    const chr = G.characters[id.split('_')[0]] || G.characters.narrator; const el = h('div', { class: 'spr ' + (file === 'stormwing' ? '' : 'person ') + (cls || ''), 'data-id': id, style: `left:${x}%;top:${y}%` });
    const fb = () => h('div', { class: 'initials', style: `background:${chr.color}` }, chr.initials);
    if (NOART) el.append(fb()); else { const img = h('img', { src: `assets/cut/${file}.png`, alt: chr.name }); img.onerror = () => img.replaceWith(fb()); el.append(img); }
    $('#sprites').append(el); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in'))); return el;
  }
  const r7obj = () => setObjective(room.objectives[S.r7.part]);
  async function r7Enter() {
    FX.setStorm(5); S.r7 = { part: 'A', cross: 5, wrongB: 0 }; r7obj();
    await say(conv('enter')); showObjective();
    showSprite('tessa', 'tessa_neutral', 14, 55); await say(conv('tessa_arrives')); S.done.add('r7_entrance'); syncHotspots();
    openPanel(hotspot('r7_ring'), r7PartA);
  }
  async function r7PartA() {
    FX.calmFlash(); addScore(cfg().scoring.partA); S.done.add('r7_ring'); syncHotspots(); await wait(1200);
    await say(conv('part_a_right')); S.r7.part = 'B'; r7obj();
    showSprite('graves', 'graves_polished', 84, 52, ''); showSprite('guard1', 'guard', 68, 40, 'small'); showSprite('guard2', 'guard', 93, 38, 'small');
    await say(conv('graves_arrives')); S.done.add('r7_arrival'); syncHotspots(); openPanel(hotspot('r7_table'), r7PartB);
  }
  async function r7PartB() {
    FX.maskRipple(84, 52); addScore(cfg().scoring.partB); S.done.add('r7_table');
    const g = $('#sprites [data-id="graves"]'); if (g) { const img = g.querySelector('img'); if (img) img.src = 'assets/cut/graves_true.png'; }
    document.querySelectorAll('#sprites [data-id^="guard"]').forEach(e => e.classList.add('turn'));
    await say(conv('part_b_right')); S.r7.part = 'C'; r7obj(); await say(conv('part_c_start'));
    showSprite('cael', 'cael_afraid', 50, 50); syncHotspots(); openPanel(hotspot('r7_choice'), r7PartC);
  }
  async function r7PartC(choice) { S.done.add('r7_choice'); S.ending = choice; syncHotspots(); await ending(choice); }

  /* ================= ending cinematic ================= */
  async function ending(kind) {
    lock('cine'); document.body.classList.add('cine'); $('#hintBtn').hidden = true; S.latches = 7; renderLatches(6); const beats = G.ending[kind];
    kind === 'calm' ? FX.calmEnding(false) : FX.sealedEnding(false);
    for (let i = 0; i < beats.length; i++) {
      const b = beats[i];
      if (b.fx === 'storm') { FX.endingStorm(); S.freed.add('stormwing'); clearSprites(); showSprite('stormwing', 'stormwing', 50, 55, 'bird'); }
      if (b.sprite === 'cael') { const c = $('#sprites [data-id="cael"] img'); if (c) c.src = 'assets/cut/cael_calm.png'; }
      const c = { skip: false }; await showLine(Object.assign({ beat: true, modal: true, pausesTimer: false }, b), c); if (c.skip) break;
    }
    $('#dlg').hidden = true; $('#blocker').hidden = true; document.body.classList.remove('dlg-open'); winGame(kind);
  }
  function winGame(kind) {
    Snd.sfx('win'); S.over = true; S.playing = false; const bonus = Math.floor(S.timeLeft) * cfg().scoring.timeBonusPerSecond; S.score += bonus; renderScore(); const w = G.screens.win; unlock('cine');
    const s = h('div', { class: 'screen endscreen fadein' }, h('h1', {}, w.title),
      h('dl', {}, h('dt', {}, w.wonder), h('dd', {}, String(S.score)), h('dt', {}, w.timeLeft), h('dd', {}, fmt(S.timeLeft) + ` (+${bonus})`), h('dt', {}, w.ending), h('dd', {}, w.endings[kind])),
      h('div', { class: 'row' }, h('button', { class: 'btn big', onclick: () => restart({ intro: true }) }, w.again), h('button', { class: 'btn big ghost', onclick: () => { setScreen(h('button', { class: 'btn', style: 'position:absolute;right:12px;bottom:12px;pointer-events:auto', onclick: () => restart({ intro: true }) }, w.again)); } }, w.close)));
    setScreen(s);
  }

  /* ================= time up, restart ================= */
  async function timeUp() {
    if (S.over) return; S.over = true; S.playing = false; hardStop(); await FX.inkFlood(); Snd.sfx('lose');
    const t = G.screens.timeup; setScreen(h('div', { class: 'screen endscreen ink' }, h('h1', {}, t.title), h('p', {}, t.line),
      h('div', { class: 'row' }, h('button', { class: 'btn big', onclick: () => restart({ intro: false }) }, t.again), h('button', { class: 'btn big ghost', onclick: () => setScreen() }, t.close))));
  }
  async function accusedOut() {
    if (S.over) return; S.over = true; S.playing = false; hardStop(); await FX.inkFlood(); Snd.sfx('lose');
    const t = G.screens.accused; setScreen(h('div', { class: 'screen endscreen ink' }, h('h1', {}, t.title), h('p', {}, t.line),
      h('div', { class: 'row' }, h('button', { class: 'btn big', onclick: () => { location.href = location.pathname + (DEBUG ? '?debug=1' : ''); } }, t.again)))); // a full reload: Tap to Start, Mission Info, tutorial, all from scratch
  }
  function hardStop() {
    closeAllModals(); cancelSpeech(); dq.splice(0).forEach(c => { c.skip = true; c.res(); }); if (dCur) dCur.fin(); $('#dlg').hidden = true; $('#blocker').hidden = true; document.body.classList.remove('dlg-open', 'cine'); locks.clear();
  }
  async function restart({ intro }) {
    hardStop(); FX.stopAll(); clearSprites(); paused = false; $('#pauseLayer').hidden = true; setScreen(); S = newState(); renderClock();
    if (intro) { $('#hud').hidden = true; $('#hintBtn').hidden = true; await enterRoom(0, true); $('#pano').classList.add('blur'); room = G.rooms[0]; showMission(); roomReady = Promise.resolve(); return; }
    await enterRoom(0, true); S.phase = 'play'; S.playing = true; S.last = performance.now(); $('#pano').classList.remove('blur'); $('#hud').hidden = false; applyRoomUi(); syncHotspots(); runEnter();
  }

  /* ================= debug (localhost with ?debug=1 only) ================= */
  const dbg = t => { const d = $('#debugbar'); if (!d) return; d.dataset.last = t; const l = d.querySelector('.log'); if (l) l.textContent = t; };
  function debugTools(errs) {
    const bar = $('#debugbar'); bar.hidden = false; bar.style.right = 'auto'; bar.append(h('button', { class: 'dbgt', onclick: () => bar.classList.toggle('open') }, 'dbg'), h('div', { class: 'log' }, errs.length ? errs.join('; ') : 'validate(): ok'));
    const btn = (t, fn) => bar.append(h('button', { onclick: fn }, t));
    const CARRY = /[?&]carry=1/.test(location.search);
    const carryOver = i => { for (let r = 0; r < i; r++) { const rm = G.rooms[r]; rm.hotspots.forEach(hs => { S.done.add(hs.id); if (hs.kind === 'FIND') { S.found.add(hs.id); S.score += cfg().scoring.find; } if (hs.kind === 'PANEL') S.solved[hs.id] = true;
        const vw = hs.views && hs.views.find(v => v.secret); const text = vw ? vw.text : hs.card && hs.card.text; if (text && ['FIND', 'LEARN', 'INSPECT'].includes(hs.kind) && (hs.kind !== 'INSPECT' || vw)) { if (vw) S.score += cfg().scoring.secret; S.clues.push({ room: rm.id, id: hs.id, img: hs.img, title: hs.card.title, text, seals: hs.seals }); } });
      S.discussStarted[rm.id] = S.discussDone[rm.id] = true; S.rewarded[rm.id] = true; S.score += cfg().scoring.roomReward; if (!S.notes.includes(rm.reward.note)) S.notes.push(rm.reward.note); S.freed.add(rm.reward.creature); (rm.reward.also || []).forEach(c => S.freed.add(c)); } renderScore(); renderStrip(); };
    const skipTo = async i => { hardStop(); setScreen(); $('#hud').hidden = false; S.phase = 'play'; S.playing = true; S.last = performance.now(); await enterRoom(i, true); $('#pano').classList.remove('blur'); S.latches = i; if (CARRY) carryOver(i); for (let r = 0; r < i; r++) { S.rewarded[G.rooms[r].id] = true; } applyRoomUi(); renderLatches(); syncHotspots(); };
    for (let i = 0; i < 7; i++) btn('R' + (i + 1), () => skipTo(i));
    FX.states.forEach(s => btn(s, () => FX.test(s))); btn('fxStop', () => FX.stopAll());
    btn('time-590', () => { S.timeLeft = 5; }); btn('+hint', () => { S.hintsLeft = 3; renderHint(); });
    window.TFCA.debug = { get S() { return S; }, get G() { return G; }, get room() { return room; }, say, openPanel, hotspotTap, skipTo, roomSolved, useHint, FX, lines, afterStep, hotspot, syncHotspots, ending, r7PartA, r7PartB, r7PartC, get viewer() { return viewer; }, startAt: async i => { S.audioOn = true; await prepareRoom1(); setScreen(); $('#hud').hidden = false; await skipTo(i); runEnter(); } };
    const q = /[?&]room=(\d)/.exec(location.search); if (q) { window.TFCA.debug.startAt(+q[1] - 1); }
  }

  boot();
})();
