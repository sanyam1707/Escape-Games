'use strict';
/* The Paradox Academy. All text and numbers come from game.json; puzzle answers from puzzles.js; effects from fx.js. */
const DEBUG = false;
const QS = new URLSearchParams(location.search);
const $ = (s, r = document) => r.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
let G, S, viewer = null, hsIds = [], hudReady = false;

/* ---------- icons ---------- */
const ICONS = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', moment: '<path d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>', book: '<path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z"/>',
  hand: '<path d="M12 2l3 10h-6zM12 12v10"/>', bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>', learn: '<path d="M6 3h9l4 4v14H6zM9 12h7M9 16h7"/>', inspect: '<circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/>',
  use: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v4M15 12v3"/>', panel: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  close: '<path d="M5 5l14 14M19 5L5 19"/>', door: '<path d="M6 21V4h12v17M3 21h18M14 12h.01"/>', left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>'
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const SIGILS = {
  Sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>', Moon: '<path d="M20 14A8 8 0 1 1 10 4a6.5 6.5 0 0 0 10 10z"/>',
  Gear: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  Key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v4M15 12v3"/>', Bell: '<path d="M6 17v-6a6 6 0 0 1 12 0v6l2 2H4zM10 21h4"/>',
  Eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'
};
const sig = n => `<svg viewBox="0 0 24 24" aria-label="${n}">${SIGILS[n]}</svg>`;
const GLYPH = { key: 'use', gear: 'panel', lens: 'inspect', bolt: 'moment', tap: 'panel', lamp: 'moment', disc: 'clock', hand: 'hand', star: 'moment', page: 'learn', vial: 'moment' };

/* ---------- state ---------- */
const fresh = (old = {}) => ({
  room: 0, score: 0, left: G.config.timerSeconds, hints: G.config.hints, done: new Set(), items: [], clues: [], held: null,
  narrated: {}, wrong: {}, pen: {}, idleDone: {}, finished: [], pz: {}, playing: false, menu: false, cinematic: false, ended: false,
  loading: false, dlgPause: false, narr: old.narr !== false, music: old.music !== false, sfx: old.sfx !== false, last: Date.now(), ending: null, lowOn: false
});
const room = () => G.rooms[S.room];
const fmt = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

/* ---------- validate(): ids, after cycles, rewards, dialogue ids ---------- */
function validate() {
  const errs = [], ids = new Set(), D = G.dialogue;
  G.rooms.forEach(r => { ids.add(r.id + '_reward'); r.hotspots.forEach(x => { if (ids.has(x.id)) errs.push('duplicate id ' + x.id); ids.add(x.id); }); });
  G.rooms.forEach((r, ri) => {
    const need = (id, w) => { if (!D[id]) errs.push(`missing dialogue ${id} (${w})`); };
    [...r.enter, ...r.right, ...(r.wrong || []), r.hint, r.idle].forEach(d => need(d, r.id));
    if (r.reward && !G.items[r.reward.item]) errs.push('bad reward item in ' + r.id);
    const done = new Set([r.id + '_reward']); let ch = true, g = 0; r.hotspots.forEach(x => { if (x.kind === 'PANEL') done.delete(r.id + '_reward'); });
    const seen = new Set();
    while (ch && g++ < 60) { ch = false; r.hotspots.forEach(x => { if (!seen.has(x.id) && x.after.every(a => seen.has(a) || (a === r.id + '_reward' && r.hotspots.some(p => p.kind === 'PANEL')))) { seen.add(x.id); ch = true; } }); }
    r.hotspots.forEach(x => {
      x.after.forEach(a => { if (!ids.has(a)) errs.push(`${x.id} after unknown ${a}`); });
      if (!seen.has(x.id)) errs.push(`${x.id} can never unlock (after cycle)`);
      if (x.item && !G.items[x.item]) errs.push(`${x.id} unknown item ${x.item}`);
      if (x.use && !G.items[x.use]) errs.push(`${x.id} unknown use item ${x.use}`);
      [x.say, ...(x.play || [])].filter(Boolean).forEach(d => need(d, x.id));
      (x.clues || []).concat(x.secret ? [x.secret.clue] : [], x.clue ? [x.clue] : []).forEach(c => { if (!G.clues[c]) errs.push(`${x.id} unknown clue ${c}`); });
      if (x.exit && x.to !== ri + 1) errs.push(`${x.id} exit should go to room ${ri + 2}`);
    });
  });
  G.opening.forEach(d => { if (!D[d]) errs.push('missing opening ' + d); });
  Object.values(G.endings).forEach(e => e.lines.forEach(d => { if (!D[d]) errs.push('missing ending line ' + d); }));
  Object.entries(D).forEach(([k, v]) => { if (typeof v.p !== 'boolean') errs.push('dialogue without pausesTimer ' + k); });
  if (errs.length) console.error('validate():', errs); else console.info('validate(): ok');
  return errs;
}

/* ---------- timer, moments ---------- */
let lastTick = performance.now();
const running = () => S && S.playing && !S.menu && !S.cinematic && !S.ended && !S.dlgPause && !S.loading;
setInterval(() => {
  const now = performance.now(), dt = (now - lastTick) / 1000; lastTick = now;
  if (!S || !running()) return;
  S.left = Math.max(0, S.left - dt); renderTimer();
  if (S.left <= G.config.lowTimeSec && !S.lowOn) { S.lowOn = true; fx.timeLow(true); $('#timer').classList.add('low'); }
  if (S.left <= 0) return timeUp();
  if (!MS.length && !dcur && !S.held && Date.now() - S.last > G.config.idleSec * 1000 && !S.idleDone[room().id]) { S.idleDone[room().id] = true; say(room().idle); }
}, 250);
function renderTimer() { $('#t-val').textContent = fmt(S.left); }
function moments(n) {
  const before = S.score; S.score = Math.max(0, S.score + n); const d = S.score - before; $('#s-val').textContent = S.score;
  if (d) { const f = $('#s-float'); f.textContent = (d > 0 ? '+' : '') + d; f.className = ''; void f.offsetWidth; f.className = d > 0 ? 'up' : 'down'; }
}

/* ---------- voice and dialogue ---------- */
// One voice at a time: a recorded file when the line has audioFile, else the browser voice. Taps never wait for it.
const voice = new Audio(), preloaded = {}; let voicePaused = false;
voice.onplay = () => { bgm.volume = .1; }; voice.onended = voice.onpause = () => { bgm.volume = .2; };
function speak(l) {
  stopVoice(); if (!S || !S.narr) return;
  if (l.audioFile) { voice.src = l.audioFile; voice.play().catch(() => browserVoice(l)); return; }
  browserVoice(l);
}
function browserVoice(l) {
  if (!('speechSynthesis' in window)) return;
  try { const u = new SpeechSynthesisUtterance(l.t), v = G.speakers[l.s] || {}; u.pitch = v.pitch || 1; u.rate = v.rate || 1; u.lang = 'en-GB'; speechSynthesis.speak(u); } catch (e) { /* no voice: text only */ }
}
function stopVoice() { voicePaused = false; try { voice.pause(); voice.removeAttribute('src'); voice.load(); speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
const pauseVoice = () => { if (!voice.paused && !voice.ended) { voice.pause(); voicePaused = true; } };
const resumeVoice = () => { if (voicePaused) { voicePaused = false; voice.play().catch(() => { }); } };
const preloadNext = () => { const id = DQ[0] && DQ[0].ids[0], f = id && G.dialogue[id].audioFile; if (f && !preloaded[f]) { preloaded[f] = new Audio(f); preloaded[f].preload = 'auto'; } };
const DQ = []; let dcur = null, bubbleT = 0;
const isModal = l => l.p || ['corvin', 'narrator', 'sable', 'vale'].includes(l.s);
function say(ids, done) {
  ids = [].concat(ids).filter(Boolean); if (!ids.length) { done && done(); return; }
  const modal = isModal(G.dialogue[ids[0]]);
  // a hint bubble never makes anyone wait: story talk pushes bubbles aside, and a new bubble replaces the old one
  if (modal || (dcur && !dcur.modal)) for (let i = DQ.length - 1; i >= 0; i--) if (DQ[i].ids.length ? !isModal(G.dialogue[DQ[i].ids[0]]) : i === 0 && dcur && !dcur.modal) DQ.splice(i, 1);
  DQ.push({ ids: ids.slice(), done });
  if (dcur && !dcur.modal) { clearTimeout(bubbleT); dcur = null; }
  if (!dcur) pump();
}
function pump() {
  for (;;) {
    const job = DQ[0];
    if (!job) { endDlg(); return; }
    const id = job.ids.shift();
    if (!id) { DQ.shift(); job.done && job.done(); continue; }
    return showLine({ id, ...G.dialogue[id] });
  }
}
function bustEl(l) {
  const d = el('div', 'bust'), img = new Image(), sp = l.s;
  img.alt = ''; img.src = `assets/cut/${sp}_${l.m || 'calm'}.png`;
  img.onerror = () => { if (!img.dataset.t) { img.dataset.t = 1; img.src = `assets/cut/${sp}_calm.png`; } else { d.className = 'bust fb'; d.textContent = G.speakers[sp].name[0]; } };
  d.append(img); return d;
}
function showLine(l) {
  const sp = G.speakers[l.s];
  if (isModal(l)) {
    $('#bubble').hidden = true; const dl = $('#dlg'); dl.hidden = false; dl.innerHTML = '';
    const box = el('div', 'dbox'); if (l.s !== 'narrator') box.append(bustEl(l));
    box.append(el('div', 'body', `<div class="name">${sp.name}</div><div class="txt">${l.t}</div>`), el('div', 'more', 'TAP'));
    const skip = el('button', 'btn skip', 'Skip'); skip.onclick = e => { e.stopPropagation(); if (DQ[0]) DQ[0].ids = []; nextLine(); };
    box.append(skip); dl.append(box); $('#app').classList.add('talk'); dcur = { modal: true }; S.dlgPause = !!l.p; speak(l); preloadNext();
  } else {
    $('#dlg').hidden = true; $('#app').classList.remove('talk'); S.dlgPause = false; const b = $('#bubble'); b.hidden = false; b.innerHTML = ''; $('#app').classList.add('bub');
    if (l.s !== 'narrator') { const bu = bustEl(l); bu.style.cssText = 'width:44px;height:52px;flex:none'; b.append(bu); }
    b.append(el('div', '', `<div class="who">${sp.name}</div><div class="tx">${l.t}</div>`), el('button', 'btn x', ic('close')));
    dcur = { modal: false }; speak(l); clearTimeout(bubbleT); bubbleT = setTimeout(nextLine, 9000);
  }
}
function nextLine() { clearTimeout(bubbleT); stopVoice(); dcur = null; pump(); }
function endDlg() { $('#app').classList.remove('talk', 'bub'); $('#dlg').hidden = true; $('#bubble').hidden = true; S.dlgPause = false; dcur = null; }
function clearDialogue() { DQ.length = 0; clearTimeout(bubbleT); stopVoice(); endDlg(); }

/* ---------- toast, modal stack, cards ---------- */
let toastT = 0;
function toast(m, ms = 2800) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms); }
const MS = [];
function pushModal(node, onClose) { const m = $('#modal'); MS.forEach(e => e.node.style.display = 'none'); MS.push({ node, onClose }); m.append(node); m.hidden = false; }
function popModal() { const e = MS.pop(); if (!e) return; e.node.remove(); stopVoice(); e.onClose && e.onClose(); const t = MS[MS.length - 1]; if (t) t.node.style.display = ''; else $('#modal').hidden = true; }
function closeAll() { while (MS.length) popModal(); }
function shell(title, body, extra) {
  const p = el('section', 'panel'), hd = el('header', '', `<h2>${title}</h2>`), x = el('button', 'btn close', ic('close'));
  x.setAttribute('aria-label', 'Close'); x.onclick = () => popModal(); hd.append(x); p.append(hd, body); if (extra) p.classList.add(extra); return p;
}
function artEl(item) {
  const a = el('div', 'art'), img = new Image(); img.alt = ''; img.src = `assets/cut/${item}.png`;
  img.onerror = () => { a.innerHTML = `<div class="circle">${ic(GLYPH[G.items[item].glyph] || 'moment')}</div>`; }; a.append(img); return a;
}
function card({ title, text, tag, item, btn = 'Continue', onClose }) {
  const b = el('div', 'pbody card'); if (item) b.append(artEl(item));
  b.append(el('h3', '', title), el('p', '', text));
  const c = el('button', 'btn gold', btn); c.onclick = () => popModal(); b.append(c);
  pushModal(shell(tag || title, b), onClose);
}

/* ---------- clues, items ---------- */
function addClue(id) { if (!S.clues.includes(id)) S.clues.push(id); }
function secretFound(x) {
  if (S.done.has(x.id)) return;
  S.done.add(x.id); moments(G.config.score.secret); addClue(x.secret.clue);
  card({ tag: 'Secret found! +' + G.config.score.secret + ' - Saved to Clues', title: G.clues[x.secret.clue].title, text: x.secret.text, onClose: refreshHS });
}
function flyTo(srcEl) {
  if (!srcEl) return; const r = srcEl.getBoundingClientRect(), t = $('#btn-book').getBoundingClientRect(), im = srcEl.querySelector('img');
  const f = im ? im.cloneNode() : el('div', 'flyer'); f.className = 'flyer'; if (!im) f.style.cssText = 'border-radius:50%;background:#c9a227';
  f.style.left = r.left + 'px'; f.style.top = r.top + 'px'; document.body.append(f);
  requestAnimationFrame(() => { f.style.left = t.left + 8 + 'px'; f.style.top = t.top + 'px'; f.style.opacity = .1; f.style.transform = 'scale(.4)'; }); setTimeout(() => f.remove(), 800);
}

/* ---------- rooms, hotspots ---------- */
let flatEl = null;
function loadRoom(i, cb) {
  const r = G.rooms[i]; document.documentElement.style.setProperty('--accent', r.accent);
  if (viewer) { try { viewer.destroy(); } catch (e) { /* ignore */ } viewer = null; }
  hsIds = []; flatEl = null; $('#pano').innerHTML = '';
  let ok = false;
  const fallback = () => {
    if (ok) return; ok = true;
    if (viewer) { try { viewer.destroy(); } catch (e) { /* ignore */ } viewer = null; }
    $('#pano').innerHTML = ''; flatEl = el('div', 'flat', `<div class="strip"><div class="rname">${r.name.toUpperCase()}</div></div>`); $('#pano').append(flatEl);
    flatEl.scrollLeft = (r.start != null ? (r.start + 180) / 360 : .5) * innerWidth * 3 - innerWidth / 2; cb && cb();
  };
  try {
    viewer = pannellum.viewer('pano', { type: 'equirectangular', panorama: r.pano, autoLoad: true, showControls: false, compass: false, hfov: innerWidth < 700 ? 70 : 100, minHfov: 45, maxHfov: 120,
      yaw: r.start || 0, pitch: 0, mouseZoom: true, friction: 0.12, keyboardZoom: false, doubleClickZoom: false });
    viewer.on('load', () => { if (ok) return; ok = true; refreshHS(); cb && cb(); });
    viewer.on('error', fallback);
    if (DEBUG) viewer.on('mousedown', e => { const c = viewer.mouseEventToCoords(e); $('#dbg-xy') && ($('#dbg-xy').textContent = `yaw ${c[1].toFixed(0)}  pitch ${c[0].toFixed(0)}`); console.log(`yaw ${c[1].toFixed(1)} pitch ${c[0].toFixed(1)}`); });
  } catch (e) { fallback(); }
}
const visible = x => !(x.kind === 'FIND' && S.done.has(x.id)) && x.after.every(a => S.done.has(a)) && (!x.needs || S.narrated[room().id]);
function refreshHS() {
  if (viewer) hsIds.forEach(id => { try { viewer.removeHotSpot(id); } catch (e) { /* ignore */ } });
  if (flatEl) flatEl.querySelectorAll('.hs').forEach(e => e.remove());
  hsIds = [];
  if (S.playing) room().hotspots.filter(visible).forEach(x => {
    if (viewer) { viewer.addHotSpot({ id: x.id, pitch: x.pitch, yaw: x.yaw, type: 'custom', cssClass: 'hsb', createTooltipFunc: d => mkHS(d, x) }); hsIds.push(x.id); }
    else if (flatEl) { const w = el('div', 'hsb'); w.style.cssText = `position:absolute;left:${(x.yaw + 180) / 360 * 100}%;top:${50 - x.pitch / 90 * 45}%`; mkHS(w, x); flatEl.firstChild.append(w); }
  });
  renderHUD();
}
function mkHS(div, x) {
  const seen = S.done.has(x.id) && x.kind !== 'FIND' && !x.exit;
  const b = el('button', `hs ${x.kind.toLowerCase()}${x.exit ? ' exit' : ''}${seen ? ' seen' : ''}`); b.setAttribute('aria-label', x.name);
  const dot = () => `<span class="dot">${ic(x.exit ? 'door' : x.kind === 'FIND' ? 'moment' : x.kind.toLowerCase() === 'use' ? 'use' : x.kind.toLowerCase())}</span>`;
  if (x.kind === 'FIND') { const img = new Image(); img.alt = ''; img.src = `assets/cut/${x.item}.png`; img.onerror = () => { img.replaceWith(el('span', 'dot', ic(GLYPH[G.items[x.item].glyph]))); }; b.append(img); } else b.innerHTML = dot();
  let d0 = null;
  b.addEventListener('pointerdown', e => { d0 = { x: e.clientX, y: e.clientY }; });
  b.addEventListener('pointerup', e => { if (d0 && Math.hypot(e.clientX - d0.x, e.clientY - d0.y) < 14) tap(x, b); d0 = null; });
  b.addEventListener('keydown', e => { if (e.key === 'Enter') tap(x, b); });
  div.append(b);
}

/* ---------- tapping ---------- */
function tap(x, btn) {
  if (!S.playing || S.menu || S.ended || MS.length || (dcur && dcur.modal)) return;
  S.last = Date.now();
  if (x.kind === 'FIND') return doFind(x, btn);
  if (x.use && !S.done.has(x.id + ':open')) {
    if (S.held !== x.use) return toast(S.held ? 'That does not fit here. Nothing is lost.' : 'You need an item here. Open the Logbook, pick it and tap Use.');
    S.held = null; renderHeld(); S.done.add(x.id + ':open');
  } else if (S.held && !x.use) return toast('Nothing happens here. Try another spot.');
  ({ LEARN: doLearn, INSPECT: doInspect, USE: doUse, PANEL: doPanel })[x.kind](x);
}
function doFind(x, btn) {
  S.done.add(x.id); S.items.push(x.item); moments(G.config.score.find); flyTo(btn); sfx('find');
  refreshHS(); card({ tag: 'Added to Items +' + G.config.score.find, title: G.items[x.item].name, text: G.items[x.item].desc, item: x.item });
  say(x.say);
}
function doLearn(x) {
  const first = !S.done.has(x.id); S.done.add(x.id); x.clues.forEach(addClue);
  card({ tag: 'Saved to Clues', title: x.name, text: x.text, onClose: refreshHS }); if (first && x.say) say(x.say);
}
function doInspect(x) {
  const body = el('div', 'pbody'), view = el('div', 'view'), cap = el('p', 'msg'), dots = el('div', 'dots'), row = el('div', 'row');
  let i = 0; const seen = new Set();
  const draw = () => {
    seen.add(i); view.innerHTML = ''; const img = new Image(); img.alt = x.name; img.src = `assets/cut/${x.views[i]}.png`;
    img.onerror = () => { const u = (x.yaw + 180) / 360, v = (90 - x.pitch) / 180, s = 4, px = Math.min(1, Math.max(0, (u * s - .5) / (s - 1))) * 100, py = Math.min(1, Math.max(0, (v * s - .5) / (s - 1))) * 100;
      view.innerHTML = `<div class="fbview" style="background-image:url(${room().pano});background-size:${s * 100}% auto;background-position:${px + (i ? 8 : 0)}% ${py}%"><span>${x.name}</span></div>`; };
    view.append(img); cap.textContent = x.viewText[i]; cap.className = 'msg';
    dots.innerHTML = x.views.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    if (seen.size === x.views.length && x.secret) secretFound(x);
  };
  const go = d => { i = (i + d + x.views.length) % x.views.length; draw(); };
  const prev = el('button', 'btn', ic('left') + ' Turn'), next = el('button', 'btn', 'Turn ' + ic('right')); prev.onclick = () => go(-1); next.onclick = () => go(1); row.append(prev, next);
  let t0 = 0; view.addEventListener('pointerdown', e => t0 = e.clientX); view.addEventListener('pointerup', e => { const d = e.clientX - t0; if (Math.abs(d) > 40) go(d < 0 ? 1 : -1); });
  body.append(el('p', 'rule', 'Swipe or tap Turn to see the other side. Look for a hidden detail.'), view, dots, cap, row);
  pushModal(shell(x.name, body), refreshHS); if (!S.done.has(x.id + ':said')) { S.done.add(x.id + ':said'); say(x.say); } draw();
}
function doUse(x) {
  if (S.done.has(x.id) && !x.exit && !x.choice) return toast('Already done here.');
  if (x.choice) return openChoice();
  if (x.exit) { sfx('door'); toast(x.toast, 3500); S.done.add(x.id); S.loading = true; return setTimeout(() => goRoom(x.to), 1300); }
  if (x.play) { say(x.play, () => { addClue(x.clue); card({ tag: 'Saved to Clues', title: G.clues[x.clue].title, text: G.clues[x.clue].text, onClose: refreshHS }); }); }
  if (x.fx) { fx[x.fx](); toast(x.toast); }
  if (x.secret) { say(x.say); secretFound(x); }
  S.done.add(x.id); refreshHS();
}
function doPanel(x) {
  if (S.done.has(x.id)) return toast('Already solved.');
  const t = G.puzzleText[x.panel], body = el('div', 'pbody'); S.pz[x.id] = S.pz[x.id] || {};
  pushModal(shell(t.title, body)); PANELS[x.panel](body, S.pz[x.id], x, t);
}
function giveReward(r) {
  const it = r.reward.item; sfx('reward'); S.items.push(it); moments(G.config.score.reward); S.done.add(r.id + '_reward'); if (r.reward.clue) addClue(r.reward.clue);
  const ex = r.hotspots.find(h => h.exit);
  card({ tag: `Room reward +${G.config.score.reward}`, title: r.reward.title, text: G.items[it].desc + (r.reward.clue ? ' ' + G.clues[r.reward.clue].text : ''), item: it,
    onClose: () => { refreshHS(); if (ex) { toast(`A way forward: ${ex.name}. Open the Logbook and use the ${G.items[ex.use].name}.`, 4500); } } });
}
function solved(id) {
  const r = room(); S.done.add(id); closeAll(); sfx('solved');
  if (r.final) { moments(G.config.score.part1); fx.part1Solved(); S.cinematic = true; }
  refreshHS();
  say(r.right, () => { S.narrated[r.id] = true; S.finished.push(r.id); if (r.reward) giveReward(r); else refreshHS(); });
}
function fail(btn) {
  sfx('wrong'); const r = room(), n = S.wrong[r.id] = (S.wrong[r.id] || 0) + 1, sc = G.config.score; S.pen[r.id] = S.pen[r.id] || 0;
  if (S.pen[r.id] > sc.wrongCap) { moments(sc.wrong); S.pen[r.id] += sc.wrong; }
  if (r.wrong.length) say(r.wrong[Math.min(n, r.wrong.length) - 1]);
  if (btn) { const lab = btn.textContent; let s = G.config.lockoutSec; btn.disabled = true; const t = setInterval(() => { if (!btn.isConnected || --s <= 0) { clearInterval(t); btn.disabled = false; btn.textContent = lab; } else btn.textContent = `Wait ${s}...`; }, 1000); btn.textContent = `Wait ${s}...`; }
}

/* ---------- HUD ---------- */
function renderHUD() {
  if (!hudReady) return; const r = room();
  $('#objective').innerHTML = `<small>GOAL</small>${r.objective}`; renderTimer(); $('#s-val').textContent = S.score;
  const finds = r.hotspots.filter(h => h.kind === 'FIND');
  $('#find-strip').innerHTML = finds.map(h => `<div class="fs ${S.done.has(h.id) ? 'got' : ''}" title="${S.done.has(h.id) ? G.items[h.item].name : 'Not found yet'}">${S.done.has(h.id) ? G.items[h.item].name[0] : '?'}</div>`).join('');
  $('#hint-n').textContent = S.hints; $('#btn-hint').classList.toggle('none', S.hints <= 0);
  renderHeld();
}
function renderHeld() {
  const h = $('#held'); h.hidden = !S.held; if (!S.held) return;
  h.innerHTML = `Holding: ${G.items[S.held].name} `; const x = el('button', 'btn', ic('close')); x.style.cssText = 'padding:0;min-width:36px;min-height:36px;border-radius:50%'; x.setAttribute('aria-label', 'Put away');
  x.onclick = () => { S.held = null; renderHUD(); }; h.append(x);
}
// A hint points at the next thing the player has not done yet, using what they hold and have finished.
function nextHint() {
  const r = room(), left = r.hotspots.filter(h => visible(h) && !S.done.has(h.id));
  const pick = k => left.find(h => (k === 'exit' ? h.exit : k === 'use' ? h.kind === 'USE' && !h.exit : h.kind === k));
  const h = pick('exit') || pick('use') || pick('FIND') || pick('LEARN');
  if (h) return { s: 'tock', m: 'calm', t: h.prompt, p: false, audioFile: h.promptAudio };
  if (pick('PANEL')) return G.dialogue[r.hint];          // everything needed is in hand: help with the puzzle itself
  const i = pick('INSPECT'); return i ? { s: 'tock', m: 'calm', t: i.prompt, p: false, audioFile: i.promptAudio } : G.dialogue[r.hint];
}
function useHint() {
  if (!S.playing || S.ended || S.menu || (dcur && dcur.modal)) return; const r = room(); S.last = Date.now();
  const sig = S.done.size + S.items.length, cost = -G.config.score.hint;
  if (S.hintLast && S.hintLast[r.id] === sig) { G.dialogue._tmp = S.hintText; return say('_tmp'); }   // same progress: repeat for free
  if (S.hints <= 0) return say('hint.none');
  if (S.score < cost) return say('hint.poor');
  sfx('hint'); S.hints--; moments(-cost); (S.hintLast = S.hintLast || {})[r.id] = sig; S.hintText = nextHint(); G.dialogue._tmp = S.hintText; say('_tmp'); renderHUD();
}

/* ---------- Logbook ---------- */
function openBook(tab = 'clues') {
  if (!S.playing || S.menu || MS.length || (dcur && dcur.modal)) return; S.last = Date.now();
  const body = el('div', ''), tabs = el('div', 'tabs'), pane = el('div', 'pbody'), foot = el('div', 'row'); foot.style.cssText = 'padding:0 12px 12px;margin:0';
  const hb = el('button', 'btn', `${ic('bulb')} Ask Tock (${S.hints} left, ${-G.config.score.hint} Moments)`); hb.onclick = () => { popModal(); useHint(); }; foot.append(hb);
  let sel = null;
  const draw = () => {
    tabs.innerHTML = ''; [['clues', 'Clues'], ['items', 'Items'], ['people', 'People'], ['time', 'Timeline']].forEach(([k, n]) => { const b = el('button', 'btn tab' + (k === tab ? ' on' : ''), n); b.onclick = () => { tab = k; draw(); }; tabs.append(b); });
    pane.innerHTML = '';
    if (tab === 'clues') pane.innerHTML = S.clues.length ? S.clues.map(c => `<div class="entry"><b>${G.clues[c].title}</b>${G.clues[c].text}</div>`).join('') : '<div class="empty">No clues yet. Tap glowing things in the room.</div>';
    if (tab === 'items') {
      if (!S.items.length) pane.innerHTML = '<div class="empty">You carry nothing yet. Find objects in the room.</div>';
      else {
        const g = el('div', 'items'); S.items.forEach(id => { const t = el('button', 'tile' + (sel === id ? ' sel' : ''), `<div class="art"></div>${G.items[id].name}`); const a = t.firstChild, im = new Image(); im.alt = ''; im.src = `assets/cut/${id}.png`; im.onerror = () => { a.innerHTML = `<div class="circle">${ic(GLYPH[G.items[id].glyph])}</div>`; }; a.append(im); t.onclick = () => { sel = id; draw(); }; g.append(t); });
        pane.append(g);
        if (sel) { const u = el('button', 'btn gold', 'Use ' + G.items[sel].name); u.onclick = () => { S.held = sel; closeAll(); renderHUD(); toast(`Holding ${G.items[sel].name}. Tap where to use it.`); }; pane.append(el('p', 'msg', G.items[sel].desc), el('div', 'row')); pane.lastChild.append(u); }
        else pane.append(el('p', 'msg', 'Tap an item, then tap Use.'));
      }
    }
    if (tab === 'people') pane.innerHTML = G.people.map(p => `<div class="entry ${p.missing ? 'miss' : ''}"><b>${p.name}${p.missing ? ' (missing)' : ''}</b>${p.line}</div>`).join('');
    if (tab === 'time') {
      const rows = G.rooms.map((r, i) => `<div class="entry ${S.finished.includes(r.id) ? '' : 'dim'}"><b>9:${String(7 + i).padStart(2, '0')} - ${r.name}</b>${S.finished.includes(r.id) ? r.timeline : '???'}</div>`);
      rows.push(`<div class="entry dim"><b>9:17 - The Last Bell</b>???</div>`); pane.innerHTML = '<p class="rule">The night, from 9:07 to 9:17. It fills in as you finish rooms.</p>' + rows.join('');
    }
  };
  body.append(tabs, pane, foot); draw(); pushModal(shell('Wren\'s Logbook', body));
}

/* ---------- puzzles ---------- */
const PANELS = {
  gear(b, st, x, T) {
    const PG = PZ.gear; st.X = st.X ?? null; st.Y = st.Y ?? null; st.sel = null;
    b.innerHTML = `<p class="rule">${T.rule}</p><div class="area"></div><p class="msg"></p><div class="row"><button class="btn gold wind">Wind</button></div>`;
    const area = $('.area', b), msg = $('.msg', b), msgs = (t, c = '') => { msg.textContent = t; msg.className = 'msg ' + c; };
    const gear = (cx, t, cls, o = 1) => `<g class="gearg ${cls}" opacity="${o}"><circle cx="${cx}" cy="108" r="${2 * t}" fill="none" stroke="#b08c1c" stroke-width="9" stroke-dasharray="6.28 6.28"/><circle cx="${cx}" cy="108" r="${2 * t - 3}" fill="#6b5412" stroke="#d9b94a" stroke-width="2"/><circle cx="${cx}" cy="108" r="5" fill="#2b2005"/></g>`;
    const draw = () => {
      area.innerHTML = `<svg class="puzzle-svg" viewBox="0 0 360 238">
        <text x="76" y="16" fill="#e6c75a" font-size="12" text-anchor="middle">Gap ${PG.gaps[0]}</text><text x="176" y="16" fill="#e6c75a" font-size="12" text-anchor="middle">Gap ${PG.gaps[1]}</text>
        ${gear(240, PG.hand, 'b')}${st.Y != null ? gear(112, st.Y, 'b', .8) : ''}${st.X != null ? gear(112, st.X, 'a') : ''}${gear(40, PG.heart, 'b')}
        <text x="40" y="112" fill="#fff" font-size="13" text-anchor="middle">${PG.heart}</text><text x="240" y="112" fill="#fff" font-size="16" text-anchor="middle">${PG.hand}</text>
        ${st.X == null ? '<circle cx="112" cy="108" r="30" fill="none" stroke="#e6c75a" stroke-dasharray="5 4"/><text x="112" y="113" fill="#e6c75a" font-size="14" text-anchor="middle">X</text>' : `<text x="112" y="98" fill="#fff" font-size="13" text-anchor="middle">X ${st.X}</text>`}
        ${st.Y != null ? `<text x="112" y="125" fill="#cfe" font-size="12" text-anchor="middle">Y ${st.Y}</text>` : ''}
        <text x="40" y="230" fill="#a99f86" font-size="11" text-anchor="middle">Heart</text><text x="112" y="230" fill="#a99f86" font-size="11" text-anchor="middle">Middle</text><text x="240" y="230" fill="#a99f86" font-size="11" text-anchor="middle">Hand</text></svg>
        <div class="slots"><span>Slot X</span><button class="slotbtn ${st.sel === 'X' ? 'sel' : ''}" data-s="X">${st.X ?? '?'}</button><span>Slot Y</span><button class="slotbtn" data-s="Y">${st.Y ?? '?'}</button></div>
        <div class="tray">${PG.tray.map(t => `<button data-t="${t}" class="${st.sel === t ? 'sel' : ''} ${st.X === t || st.Y === t ? 'used' : ''}">${t}</button>`).join('')}</div>`;
      area.querySelectorAll('[data-t]').forEach(bt => bt.onclick = () => { const t = +bt.dataset.t; if (st.X === t || st.Y === t) return; sfx('click'); st.sel = st.sel === t ? null : t; msgs(st.sel ? `Gear ${t} chosen. Tap slot X or Y.` : ''); draw(); });
      area.querySelectorAll('[data-s]').forEach(bt => bt.onclick = () => { const s = bt.dataset.s; if (st.sel != null) { st[s] = st.sel; st.sel = null; msgs(''); } else st[s] = null; draw(); });
    };
    $('.wind', b).onclick = e => {
      if (!S.items.includes('key')) return msgs(T.needKey, 'bad');
      if (st.X == null || st.Y == null) return msgs('Put a gear in both slots first.', 'bad');
      if (st.X === PG.answer[0] && st.Y === PG.answer[1]) { $('svg', area).classList.add('spinning'); msgs('Tick... tick... tick. It turns!', 'good'); setTimeout(() => solved(x.id), 1600); }
      else { const sv = $('svg', area); sv.classList.add('shake'); setTimeout(() => sv.classList.remove('shake'), 500); msgs('The clock stutters. A gear does not fit its gap.', 'bad'); fail(e.target); }
    };
    draw();
  },
  alibi(b, st, x, T) {
    const A = PZ.alibi; st.c = st.c || A.rows.map(() => A.cols.map(() => 0));
    b.innerHTML = `<p class="rule">Tap a box: it cycles empty, cross (no), tick (yes). Each person is in exactly one place.</p><div class="area"></div><ol class="notes">${T.notes.map(n => `<li>${n}</li>`).join('')}</ol><p class="msg"></p><div class="row"><button class="btn gold seal">Seal alibis</button></div>`;
    const area = $('.area', b), msg = $('.msg', b);
    const draw = () => { area.innerHTML = `<table class="grid4"><tr><th></th>${A.cols.map(c => `<th>${c}</th>`).join('')}</tr>${A.rows.map((r, i) => `<tr><th class="r">${r}</th>${A.cols.map((_, j) => `<td><button data-i="${i}" data-j="${j}" class="${['', 'x', 't'][st.c[i][j]]}" aria-label="${r} ${A.cols[j]}">${['', '✕', '✓'][st.c[i][j]]}</button></td>`).join('')}</tr>`).join('')}</table>`;
      area.querySelectorAll('button').forEach(bt => bt.onclick = () => { const i = +bt.dataset.i, j = +bt.dataset.j; st.c[i][j] = (st.c[i][j] + 1) % 3; sfx('click'); draw(); }); };
    $('.seal', b).onclick = e => {
      const okAll = A.rows.every((_, i) => A.cols.every((_, j) => (st.c[i][j] === 2) === (A.answer[i] === j)));
      if (okAll) { msg.textContent = 'Every alibi holds.'; msg.className = 'msg good'; setTimeout(() => solved(x.id), 700); } else { msg.textContent = 'The alibis do not fit together yet.'; msg.className = 'msg bad'; fail(e.target); }
    };
    draw();
  },
  sight(b, st, x, T) {
    const P = PZ.sight; st.b = st.b ?? 0; st.h = st.h ?? 0;
    b.innerHTML = `<p class="rule">${T.rule}</p><svg class="puzzle-svg" viewBox="0 0 300 200"><defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050a1c"/><stop offset="1" stop-color="#1e3556"/></linearGradient></defs>
      <rect width="300" height="200" fill="url(#sk)"/><rect y="150" width="300" height="50" fill="#0b121f"/>
      <line x1="150" y1="0" x2="150" y2="200" stroke="#e6c75a" stroke-opacity=".3" stroke-dasharray="4 4"/><circle cx="150" cy="60" r="24" fill="none" stroke="#e6c75a" stroke-width="2"/>
      <rect id="s-win" x="140" y="136" width="14" height="18" fill="#ffd966"/><path id="s-star" d="M0-9L3-3 9 0 3 3 0 9-3 3-9 0-3-3z" fill="#fff" transform="translate(150 60)"/>
      <path d="M0 200V172H120L140 158H160L180 172H300V200z" fill="#3a2c10" stroke="#8a6d12" stroke-width="2"/><text id="s-rail" x="150" y="192" fill="#e6c75a" font-size="10" text-anchor="middle"></text></svg>
      <div class="sl"><label>Bearing</label><input type="range" id="rb" min="0" max="355" step="5"><output id="ob"></output></div>
      <div class="sl"><label>Height</label><input type="range" id="rh" min="0" max="85" step="5"><output id="oh"></output></div><p class="msg"></p><div class="row"><button class="btn gold lock">Lock the sight</button></div>`;
    const rb = $('#rb', b), rh = $('#rh', b), msg = $('.msg', b);
    const upd = () => { st.b = +rb.value; st.h = +rh.value; $('#ob', b).textContent = st.b; $('#oh', b).textContent = st.h; const dx = (st.b - P.bearing) * 1.1, dy = (P.height - st.h) * 2.2;
      $('#s-win', b).setAttribute('x', 140 + dx); $('#s-star', b).setAttribute('transform', `translate(${150 + dx} ${60 + dy})`); };
    rb.value = st.b; rh.value = st.h; rb.oninput = rh.oninput = upd; upd();
    $('.lock', b).onclick = e => {
      if (st.b === P.bearing && st.h === P.height) { $('#s-rail', b).textContent = '"Wren, do not save him."'; msg.innerHTML = 'Locked! Something is scratched on the rail.'; msg.className = 'msg good'; rb.disabled = rh.disabled = true; e.target.textContent = 'Continue'; e.target.onclick = () => solved(x.id); }
      else { msg.textContent = 'The marks do not line up. Check the star chart rules.'; msg.className = 'msg bad'; fail(e.target); }
    };
  },
  switch(b, st, x, T) {
    st.g = st.g || PZ.switch.start.slice(); st.n = st.n || 0;
    b.innerHTML = `<p class="rule">${T.rule}</p><div class="lamps"></div><div class="counter"></div><p class="msg"></p><div class="row"><button class="btn reset">Reset</button></div>`;
    const lamps = $('.lamps', b), msg = $('.msg', b);
    const draw = () => { lamps.innerHTML = st.g.map((v, i) => `<button class="lamp ${v ? 'on' : ''}" data-i="${i}" aria-label="Lamp ${i + 1} ${v ? 'lit' : 'dark'}"></button>`).join(''); $('.counter', b).textContent = `Presses: ${st.n}`;
      lamps.querySelectorAll('button').forEach(bt => bt.onclick = () => { st.g = PZ.press(st.g, +bt.dataset.i); st.n++; sfx('click'); draw();
        if (st.g.every(v => v)) { msg.textContent = 'Every lamp is lit!'; msg.className = 'msg good'; setTimeout(() => solved(x.id), 800); }
        else if (st.n % G.config.nudgeEvery === 0 && st.n <= G.config.nudgeEvery * 3) say(`r4.nudge.${st.n / G.config.nudgeEvery}`); }); };
    $('.reset', b).onclick = () => { st.g = PZ.switch.start.slice(); st.n = 0; msg.textContent = ''; draw(); };
    draw();
  },
  pour(b, st, x, T) {
    const [CA, CB] = PZ.pour.caps; st.a = st.a || 0; st.b = st.b || 0; st.n = st.n || 0;
    b.innerHTML = `<p class="rule">${T.rule}</p><div class="vials"></div><div class="counter"></div><p class="msg"></p><div class="row"><button class="btn gold offer">Offer the dose</button><button class="btn reset">Reset</button></div>`;
    const area = $('.vials', b), msg = $('.msg', b);
    const vial = (cap, v, k) => `<div class="vial"><svg viewBox="0 0 96 170"><rect x="22" y="${160 - cap * 30}" width="52" height="${cap * 30}" rx="6" fill="rgba(180,220,230,.08)" stroke="#8fd3e0" stroke-width="3"/><rect x="25" y="${160 - v * 30}" width="46" height="${v * 30}" rx="4" fill="#7fe0c0" opacity=".85"/>
      ${Array.from({ length: cap }, (_, i) => `<line x1="22" x2="34" y1="${160 - (i + 1) * 30}" y2="${160 - (i + 1) * 30}" stroke="#8fd3e0"/><text x="10" y="${164 - (i + 1) * 30}" fill="#8fd3e0" font-size="10" text-anchor="middle">${i + 1}</text>`).join('')}</svg>
      ${cap}-dram vial: <b>${v}</b><div class="btns"><button class="btn" data-o="fill${k}">Fill</button><button class="btn" data-o="empty${k}">Empty</button><button class="btn" data-o="${k === 'A' ? 'AB' : 'BA'}">Pour into ${k === 'A' ? 'small' : 'big'}</button></div></div>`;
    const draw = () => { area.innerHTML = vial(CA, st.a, 'A') + vial(CB, st.b, 'B'); $('.counter', b).textContent = `Moves: ${st.n}`;
      area.querySelectorAll('[data-o]').forEach(bt => bt.onclick = () => { [st.a, st.b] = PZ.pour1(st.a, st.b, bt.dataset.o); st.n++; msg.textContent = ''; sfx('click'); draw(); }); };
    $('.offer', b).onclick = e => { if (st.a === PZ.pour.goal) { msg.textContent = 'Exactly four drams.'; msg.className = 'msg good'; setTimeout(() => solved(x.id), 800); } else { msg.textContent = `The big vial holds ${st.a}, not four.`; msg.className = 'msg bad'; fail(e.target); } };
    $('.reset', b).onclick = () => { st.a = st.b = st.n = 0; msg.textContent = ''; draw(); };
    draw();
  },
  sigil(b, st, x, T) {
    const SG = PZ.sigil; st.hist = st.hist || []; st.cur = st.cur || [];
    b.innerHTML = `<p class="rule">${T.rule}</p><div class="clue-line"></div><div class="code cur"></div><div class="sig"></div><p class="msg"></p><div class="row"><button class="btn gold try">Try this code</button></div><div class="hist"></div>`;
    const msg = $('.msg', b), tryB = $('.try', b);
    const slots = (arr, fb) => `${Array.from({ length: 4 }, (_, i) => `<div class="slot" data-i="${i}">${arr[i] ? sig(arr[i]) : ''}</div>`).join('')}${fb ? `<div class="fb">${fb.map(f => `<i class="${f}"></i>`).join('')}</div>` : ''}`;
    const draw = () => {
      $('.clue-line', b).innerHTML = ['V1', 'V2', 'V3'].filter(c => S.clues.includes(c)).map(c => `<div class="entry">${G.clues[c].text}</div>`).join('');
      $('.cur', b).innerHTML = slots(st.cur); $('.cur', b).querySelectorAll('.slot').forEach(s => s.onclick = () => { st.cur.splice(+s.dataset.i, 1); draw(); });
      $('.sig', b).innerHTML = SG.symbols.map(n => `<button data-n="${n}" ${st.cur.includes(n) || st.cur.length >= 4 ? 'disabled' : ''} aria-label="${n}">${sig(n)}</button>`).join('');
      $('.sig', b).querySelectorAll('button').forEach(bt => bt.onclick = () => { st.cur.push(bt.dataset.n); sfx('click'); draw(); });
      tryB.disabled = st.cur.length < 4 || tryB.dataset.wait === '1';
      $('.hist', b).innerHTML = `<div class="counter">Tries used: ${st.hist.length} of ${SG.tries}</div>` + st.hist.map(h => `<div class="code">${slots(h.code, h.fb)}</div>`).reverse().join('');
    };
    tryB.onclick = () => {
      const fb = PZ.feedback(SG.code, st.cur); st.hist.push({ code: st.cur.slice(), fb }); const win = fb.every(f => f === 'gold'); st.cur = [];
      if (win) { msg.textContent = 'The ring turns. The vault is open!'; msg.className = 'msg good'; draw(); tryB.disabled = true; return setTimeout(() => solved(x.id), 900); }
      msg.textContent = 'Not yet. Read the rings.'; msg.className = 'msg bad';
      if (st.hist.length >= SG.tries) { msg.textContent = 'The ring resets. You have six new tries.'; st.hist = []; }
      fail(tryB); tryB.dataset.wait = '1'; setTimeout(() => { tryB.dataset.wait = ''; draw(); }, G.config.lockoutSec * 1000); draw();
    };
    draw();
  },
  tower(b, st, x, T) {
    const TW = PZ.tower, ini = () => [Array.from({ length: TW.names.length }, (_, i) => TW.names.length - i), [], []]; st.pegs = st.pegs || ini(); st.sel = null; st.n = st.n || 0; st.ill = st.ill || 0;
    b.innerHTML = `<p class="rule">${T.rule}</p><div class="pegs"></div><div class="counter"></div><p class="msg"></p><div class="row"><button class="btn reset">Reset</button></div>`;
    const area = $('.pegs', b), msg = $('.msg', b);
    const draw = () => {
      area.innerHTML = st.pegs.map((p, i) => `<div class="peg ${st.sel === i ? 'sel' : ''}" data-p="${i}"><b>${TW.pegs[i]}</b>${p.map((r, k) => `<div class="ring ${st.sel === i && k === p.length - 1 ? 'glow' : ''}" style="width:${50 + r * 18}px">${TW.names[r - 1]}</div>`).join('')}</div>`).join('');
      $('.counter', b).textContent = `Moves: ${st.n}`; fx.towerLight(st.pegs[2].length);
      area.querySelectorAll('.peg').forEach(pg => pg.onclick = () => click(+pg.dataset.p));
    };
    const topEl = i => { const r = area.querySelectorAll(`.peg[data-p="${i}"] .ring`); return r[r.length - 1]; };
    const click = i => {
      if (st.sel == null) { if (!st.pegs[i].length) return; st.sel = i; draw(); return fx.ringPick(topEl(i)); }
      if (st.sel === i) { st.sel = null; return draw(); }
      const from = st.sel; st.sel = null;
      if (PZ.legal(st.pegs, from, i)) { st.pegs[i].push(st.pegs[from].pop()); st.n++; sfx('click'); draw(); fx.ringDrop(topEl(i)); msg.textContent = '';
        if (st.pegs[2].length === TW.names.length) { msg.textContent = 'All three rings stand on Future.'; msg.className = 'msg good'; setTimeout(() => solved(x.id), 900); } }
      else { st.ill++; draw(); fx.ringBounce(topEl(from)); msg.textContent = 'A bigger ring cannot sit on a smaller one.'; msg.className = 'msg bad'; say(`r7.illegal.${Math.min(st.ill, 3)}`); }
    };
    $('.reset', b).onclick = () => { st.pegs = ini(); st.sel = null; st.n = 0; msg.textContent = ''; draw(); };
    draw();
  }
};

/* ---------- final choice, endings ---------- */
function openChoice() {
  const C = G.choice, b = el('div', 'pbody card'); b.append(el('p', '', C.tock.t));
  const w = el('div', 'choice'); C.buttons.forEach(o => { const bt = el('button', 'btn ' + o.side, o.label); bt.onclick = () => choose(o.id);
    ['pointerenter', 'focus'].forEach(ev => bt.addEventListener(ev, () => fx.choiceHover(o.side))); ['pointerleave', 'blur'].forEach(ev => bt.addEventListener(ev, () => fx.choiceHover(null))); w.append(bt); });
  b.append(w); pushModal(shell(C.title, b), () => fx.choiceHover(null)); speak(C.tock);
}
function choose(id) {
  closeAll(); moments(G.config.score.part2); S.ending = id; S.cinematic = true; $('#hud').hidden = true; $('#app').classList.add('cine'); clearDialogue();
  fx[id === 'A' ? 'endMorning' : 'endHeld']();
  say(G.endings[id].lines, () => endScreen(true));
}
function screen(cls, html) { const s = $('#screen'); s.style.cssText = ''; s.className = cls; s.innerHTML = html; s.hidden = false; return s; }
function endScreen(win) {
  const E = G.endScreen;
  if (win) {
    const s = screen('end', `<div class="sub">${G.endings[S.ending].name.toUpperCase()}</div><h1>${E.win.title}</h1><div class="big">${S.score}</div><div class="small">MOMENTS</div>
      <div class="kv"><div><b>${fmt(S.left)}</b><span>TIME LEFT</span></div></div><div class="row"><button class="btn gold again">${E.win.again}</button><button class="btn cred">${E.win.credits}</button></div><p class="small">${E.win.hint}</p>`);
    $('.again', s).onclick = restart; $('.cred', s).onclick = credits;
  } else { const s = screen('end', `<h1>${E.lose.title}</h1><p class="small">The clock reached zero. Moments kept: ${S.score}</p><div class="row"><button class="btn gold again">${E.lose.again}</button></div>`); $('.again', s).onclick = restart; }
}
function credits() {
  const w = G.dialogue['credits.whisper'], s = screen('end', `<h1>${G.endScreen.credits[0]}</h1>${G.endScreen.credits.slice(1).map(c => `<p>${c}</p>`).join('')}<p class="small" style="margin-top:30px"><i>A stranger's whisper over Corvin's recording:</i><br>"${w.t}"</p><div class="row"><button class="btn back">Back</button></div>`);
  $('.back', s).onclick = () => { stopVoice(); endScreen(true); }; setTimeout(() => speak(w), 1500);
}
function timeUp() {
  if (S.ended) return; S.ended = true; closeAll(); clearDialogue(); $('#hud').hidden = true; fx.lastBell(); setTimeout(() => endScreen(false), 2400);
}

/* ---------- pause ---------- */
function openPause() {
  if (S.menu || S.ended || $('#hud').hidden) return;
  S.menu = true; pauseVoice(); $('#modal').classList.add('veil'); $('#bubble').hidden = true;
  const draw = () => { const s = screen('plain', `<h1>Paused</h1><div class="row" style="flex-direction:column;width:min(300px,80vw)"><button class="btn gold res">Resume</button><button class="btn nar">Narration: ${S.narr ? 'On' : 'Off'}</button><button class="btn mus">Music: ${S.music ? 'On' : 'Off'}</button><button class="btn sfxb">Sound effects: ${S.sfx ? 'On' : 'Off'}</button><button class="btn rst">Restart</button></div>`);
    $('.res', s).onclick = resume; $('.nar', s).onclick = () => { S.narr = !S.narr; if (!S.narr) stopVoice(); draw(); }; $('.mus', s).onclick = () => { S.music = !S.music; bgmSet(); draw(); }; $('.sfxb', s).onclick = () => { S.sfx = !S.sfx; sfx('click'); draw(); };
    $('.rst', s).onclick = () => { if (confirm('Restart the whole game?')) restart(); }; };
  draw();
}
function resume() { S.menu = false; resumeVoice(); $('#screen').hidden = true; $('#modal').classList.remove('veil'); if (dcur && !dcur.modal) $('#bubble').hidden = false; }
// Tiny synthesised effects (no files). Only for finds, rewards, solves, mistakes, hints, doors and puzzle clicks.
const sfx = (() => {
  let ctx; const N = (f, t, d, type = 'sine', v = .07) => ({ f, t, d, type, v });
  const SET = { find: [N(880, 0, .1), N(1320, .09, .16)], reward: [N(523, 0, .2), N(659, .12, .2), N(784, .24, .2), N(1047, .36, .5)], solved: [N(392, 0, .25), N(523, .14, .25), N(659, .28, .5)],
    wrong: [N(150, 0, .3, 'triangle', .1), N(110, .08, .3, 'triangle', .08)], click: [N(720, 0, .05, 'sine', .045)], hint: [N(660, 0, .5, 'sine', .06), N(990, .02, .4, 'sine', .03)], door: [N(220, 0, .3, 'triangle', .07), N(330, .18, .45, 'triangle', .07)] };
  return n => {
    if (!S || !S.sfx) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume();
      SET[n].forEach(x => { const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + x.t; o.type = x.type; o.frequency.value = x.f;
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(x.v, t0 + .01); g.gain.exponentialRampToValueAtTime(.0001, t0 + x.d); o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + x.d + .05); });
    } catch (e) { /* no audio: silent */ }
  };
})();
const bgm = new Audio('assets/audio/bgm.mp3'); bgm.loop = true; bgm.volume = .2; let bgmOk = true; bgm.onerror = () => bgmOk = false;
function bgmSet() { if (!bgmOk) return; if (S && S.music) bgm.play().catch(() => { }); else bgm.pause(); }

/* ---------- flow ---------- */
function startScreen() {
  const s = screen('tap', `<div class="sub">A 360 ESCAPE GAME</div><h1>The Paradox<br>Academy</h1><div class="go">TAP TO START</div>`);
  const t = new Image(); t.onerror = () => s.prepend(el('div', 'clockfb')); t.src = 'assets/sheets/tap_to_start.jpg';
  loadRoom(0);                                        // preload the Foyer while the player reads the title
  s.onclick = () => { s.onclick = null; bgmSet(); missionScreen(); };
}
function missionScreen() {
  const M = G.mission, s = screen('mission', `<div class="txt"><div class="sub" style="font:600 13px Cinzel,serif;letter-spacing:.3em;color:#e6c75a">${M.kicker}</div><h2>${M.heading}</h2>${M.paras.map(p => `<p>${p}</p>`).join('')}</div><button class="btn gold go2">${M.button}</button>`);
  s.style.alignItems = 'center'; speak({ t: M.paras.join(' '), s: 'narrator', audioFile: M.audioFile });
  $('.go2', s).onclick = () => { stopVoice(); s.hidden = true; $('#hud').hidden = false; hudReady = true; $('#pano').classList.add('blur'); renderHUD(); tutorial(() => opening()); };
}
function tutorial(done) {
  let i = 0; const sp = el('div'); sp.id = 'spot'; const tt = el('div'); tt.id = 'tut'; $('#app').append(sp, tt);
  const end = () => { sp.remove(); tt.remove(); done(); };
  const step = () => {
    const s = G.tutorial[i], t = $(s.target); let r = t.getBoundingClientRect(); if (s.target === '#pano') r = { left: innerWidth * .12, top: innerHeight * .3, width: innerWidth * .76, height: innerHeight * .3 };
    sp.style.cssText = `left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px`;
    tt.style.top = r.top + r.height / 2 > innerHeight / 2 ? '70px' : 'auto'; tt.style.bottom = r.top + r.height / 2 > innerHeight / 2 ? 'auto' : '90px';
    tt.innerHTML = `<h3>${i + 1}/${G.tutorial.length}  ${s.title}</h3><p>${s.text}</p><div class="row"><button class="btn sk">Skip</button><button class="btn gold nx">${i === G.tutorial.length - 1 ? 'Got it' : 'Next'}</button></div>`;
    $('.sk', tt).onclick = end; $('.nx', tt).onclick = () => { if (++i >= G.tutorial.length) end(); else step(); };
  };
  step();
}
function opening() { say(G.opening, () => beginPlay()); }
function beginPlay() {
  $('#pano').classList.remove('blur');
  setTimeout(() => { S.playing = true; S.last = Date.now(); refreshHS(); enterRoom(0); }, 1200);
}
function enterRoom(i) {
  S.room = i; S.loading = false; S.last = Date.now(); const r = room(); if (r.final) fx.enterTower();
  refreshHS(); say(r.enter, () => card({ tag: 'New room', title: r.name, text: r.objective, btn: 'Start looking' }));
}
function goRoom(i) {
  const f = $('#fade'); f.classList.add('on'); S.loading = true; clearDialogue();
  setTimeout(() => { closeAll(); S.held = null; S.room = i; loadRoom(i, () => { setTimeout(() => { f.classList.remove('on'); enterRoom(i); }, 200); }); }, 650);
}
function restart() {
  closeAll(); clearDialogue(); fx.clear(); $('#app').classList.remove('cine'); $('#timer').classList.remove('low'); $('#screen').hidden = true; $('#modal').classList.remove('veil');
  S = fresh(S); S.playing = true; $('#hud').hidden = false; hudReady = true; $('#pano').classList.remove('blur'); $('#fade').classList.add('on');
  loadRoom(0, () => { $('#fade').classList.remove('on'); enterRoom(0); });
}

/* ---------- boot ---------- */
function init() {
  document.querySelectorAll('.ico').forEach(e => e.innerHTML = ic(e.classList[1]));
  $('#btn-book').onclick = () => openBook(); $('#btn-hint').onclick = useHint; $('#btn-pause').onclick = () => (S.menu ? resume() : openPause());
  $('#dlg').addEventListener('click', e => { if (e.target.closest('.skip')) return; nextLine(); });
  $('#bubble').addEventListener('click', nextLine);
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') popModal(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') { if (MS.length) popModal(); else if (S.playing) S.menu ? resume() : openPause(); } });
  addEventListener('pointerdown', () => { if (S) S.last = Date.now(); }, true);
  startScreen();
}
fetch('game.json').then(r => r.json()).then(g => { G = g; S = fresh(); validate(); init(); }).catch(e => { document.body.innerHTML = '<p style="color:#f2e8cf;padding:20px;font:16px Georgia">Could not load game.json. Run this folder with a web server (python -m http.server).</p>'; console.error(e); });
