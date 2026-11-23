/* The Otherworld Files: core, state, dialogue, cards, Casebook, hotspots, powers, hints, room flow, start flow.
   Classic scripts share one scope: load order is game.js, audio.js, panels.js (see index.html). */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = a => ((a + 540) % 360) - 180;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const Q = new URLSearchParams(location.search);
const DEBUG = false;

let G, V = null;
const S = {};
const PANELS = {}, VIEWS = {};
const have = new Set(); // sprites that exist

/* ---------- state ---------- */
function resetState() {
  const c = G.config;
  Object.assign(S, { roomIdx: 0, done: new Set(), items: [], notes: [], pages: [], heard: new Set(), signal: 0, sparks: 0, sparksGiven: false,
    timeLeft: c.timerSeconds, playTime: 0, playing: false, over: false, pauseReasons: new Set(), hintsUsed: {}, wrongN: {}, armed: null, useItem: null,
    usedPowers: new Set(), flags: {}, veilUntil: 0, pstate: {}, visited: new Set(), panel: null, idleAt: performance.now(), idleN: 0, tutorial: false, shuffled: null });
}

/* ---------- dialogue ---------- */
const D = { queue: [], busy: false, skip: false, cur: null, curJob: null };
function say(lines, opts = {}) {
  lines = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
  return new Promise(res => { if (!lines.length) return res(); D.queue.push({ lines, res, opts }); pump(); });
}
async function pump() {
  if (D.busy) return; D.busy = true;
  while (D.queue.length) {
    const j = D.queue.shift(); D.curJob = j; D.skip = false;
    // the clock stops only for story talk made entirely of the heroes; hints, clues, wrong answers and idle lines never stop it
    const stop = j.opts.story && j.lines.every(l => G.config.pauseSpeakers.includes(l.who)); if (stop) S.pauseReasons.add('dialogue');
    for (let i = 0; i < j.lines.length; i++) { if (D.skip) break; preloadVoice(j.lines[i + 1]); await showLine(j.lines[i], j.opts); }
    if (stop) S.pauseReasons.delete('dialogue'); D.curJob = null; j.res();
  }
  D.busy = false; $('#dialogue').classList.add('hidden'); $('#dialogue').classList.remove('opening'); stopSpeech();
}
function showLine(ln, opts) {
  return new Promise(res => {
    const c = G.characters[ln.who] || G.characters.narrator, box = $('#dialogue'), port = $('.port', box);
    box.classList.remove('hidden'); box.classList.toggle('opening', !!opts.opening);
    port.className = 'port'; port.style.backgroundImage = ''; port.textContent = '';
    if (c.portrait && have.has(c.portrait)) port.style.backgroundImage = `url(assets/cut/${c.portrait}.png)`;
    else if (c.portrait) { port.classList.add('initial'); port.style.background = c.color; port.style.color = '#000'; port.textContent = (c.name || '?')[0]; }
    else port.classList.add('hidden');
    if (c.radio) port.classList.add('radio');
    port.classList.toggle('hidden', !c.portrait);
    $('.who', box).textContent = c.name; $('.who', box).style.color = c.color; $('.line', box).textContent = ln.text;
    box.classList.toggle('manual', !!opts.manual); let done = false; const fin = () => { if (done) return; done = true; D.cur = null; clearTimeout(tm); res(); };
    D.cur = fin; box.onclick = e => { if (e.target.id !== 'dlg-skip') fin(); };
    const est = 1400 + ln.text.length * 55;
    const spoke = narrate(ln, opts.manual ? null : () => setTimeout(fin, 350));
    const arm = ms => tm = setTimeout(() => S.pauseReasons.has('pause') ? arm(500) : fin(), ms);
    let tm; if (!opts.manual) arm(spoke ? est * 2.5 + 3000 : est);
  });
}
function skipDialogue() { D.skip = true; if (D.cur) D.cur(); }
function cancelSoft() {
  D.queue = D.queue.filter(j => { if (j.opts.soft) { j.res(); return false; } return true; });
  if (D.curJob && D.curJob.opts.soft) skipDialogue();
}

/* ---------- toast, floaters, signal ---------- */
let toastT;
function toast(t, ms = 2600) { const e = $('#toast'); e.textContent = t; e.classList.remove('hidden'); sfx('toast'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.add('hidden'), ms); }
function floater(txt, cls, anchor = '#signal') {
  const a = $(anchor).getBoundingClientRect(), f = h('div', 'float ' + cls, txt); f.style.left = a.left + 'px'; f.style.top = a.bottom + 'px'; $('#floaters').appendChild(f); setTimeout(() => f.remove(), 1700);
}
function addSignal(n) { if (!n) return; S.signal = Math.max(0, S.signal + n); $('#signal').textContent = S.signal; floater((n > 0 ? '+' : '') + n, n > 0 ? 'pos' : 'neg'); }
const fmt = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function updateTimer() { const e = $('#timer'); e.textContent = fmt(S.timeLeft); e.classList.toggle('low', S.timeLeft <= 60); }
let lastTick = performance.now();
setInterval(() => {
  const now = performance.now(), dt = (now - lastTick) / 1000; lastTick = now;
  if (S.playing && !S.over && !S.pauseReasons.size) { S.timeLeft -= dt; S.playTime += dt; updateTimer(); if (S.timeLeft <= 0) timeUp(); }
  idleCheck(now);
}, 200);

/* ---------- sprites ---------- */
function preloadSprites() {
  const names = new Set(['key_art']);
  Object.values(G.items).forEach(i => names.add(i.sprite)); Object.values(G.characters).forEach(c => c.portrait && names.add(c.portrait));
  Object.values(G.powers).forEach(p => names.add(p.icon)); ['icon_hint', 'icon_casebook'].forEach(n => names.add(n));
  G.rooms.forEach(r => (r.cards || []).forEach(c => names.add(c.sprite))); ['prop_gloom_warden', 'prop_music_box_closed', 'prop_music_box_open'].forEach(n => names.add(n));
  return Promise.all([...names].map(n => new Promise(res => { const i = new Image(); i.onload = () => { have.add(n); res(); }; i.onerror = res; i.src = n === 'key_art' ? 'assets/sheets/key_art.jpg' : `assets/cut/${n}.png`; })));
}
const spriteUrl = n => `assets/cut/${n}.png`;
const spriteImg = (n, cls = '') => have.has(n) ? `<img class="${cls}" src="${spriteUrl(n)}" alt="">` : '';

/* ---------- validate ---------- */
function validate(g) {
  const err = [], ids = new Map(), events = new Set(['all_tapes_heard', 'book:flyer']), kinds = ['FIND', 'LEARN', 'INSPECT', 'USE', 'PANEL', 'AUTO', 'EXIT', 'power'];
  if (g.rooms.length !== 7) err.push('Expected 7 rooms, found ' + g.rooms.length);
  g.rooms.forEach(r => r.hotspots.forEach(hs => { if (ids.has(hs.id)) err.push('Duplicate hotspot id ' + hs.id); ids.set(hs.id, hs); if (!kinds.includes(hs.kind)) err.push(`${hs.id}: bad kind ${hs.kind}`); }));
  const graph = new Map();
  g.rooms.forEach(r => {
    r.hotspots.forEach(hs => {
      (hs.after || []).forEach(a => { if (!ids.has(a) && !events.has(a)) err.push(`${hs.id}: unknown after "${a}"`); else if (ids.has(a) && !r.hotspots.includes(ids.get(a))) err.push(`${hs.id}: after "${a}" is in another room`); });
      graph.set(hs.id, hs.after || []);
      if (hs.kind === 'PANEL' && (!r.panel || !PANELS[r.panel.type])) err.push(`${hs.id}: panel type missing`);
      if (hs.power && !g.powers[hs.power]) err.push(`${hs.id}: unknown power ${hs.power}`);
      if (hs.kind !== 'AUTO' && hs.kind !== 'power' && (typeof hs.yaw !== 'number' || typeof hs.pitch !== 'number')) err.push(`${hs.id}: needs yaw and pitch`);
      (hs.items || []).concat(hs.reward ? hs.reward.items : []).forEach(i => { if (!g.items[i]) err.push(`${hs.id}: unknown item ${i}`); });
      if (hs.view && !(r.views && r.views[hs.view])) err.push(`${hs.id}: unknown view ${hs.view}`);
      if (hs.kind === 'EXIT' && !(hs.after || []).length) err.push(`${hs.id}: exit must have an after`);
    });
    [...(r.enter || []), ...(r.wrong || []), ...(r.right || [])].forEach(l => { if (!g.characters[l.who]) err.push(`${r.id}: unknown speaker ${l.who}`); });
    if (!r.panel) err.push(r.id + ': no panel');
  });
  const state = {}; const dfs = (n, path) => { if (state[n] === 2) return; if (state[n] === 1) { err.push('after cycle: ' + path.concat(n).join(' > ')); return; } state[n] = 1; (graph.get(n) || []).forEach(m => graph.has(m) && dfs(m, path.concat(n))); state[n] = 2; };
  [...graph.keys()].forEach(k => dfs(k, []));
  (g.ending || []).forEach(l => { if (!g.characters[l.who]) err.push('ending: unknown speaker ' + l.who); });
  if (err.length) throw new Error('game.json is invalid:\n- ' + err.join('\n- '));
  return true;
}
window.validate = validate;

/* ---------- cards ---------- */
const cardQ = [];
function card(o) {
  return new Promise(res => { cardQ.push({ o, res }); if (cardQ.length === 1) showCard(); });
}
function showCard() {
  const { o, res } = cardQ[0], wrap = h('div', 'cardwrap'), c = h('div', 'card' + (o.dark ? ' dark' : '')); let vi = 0;
  const x = h('button', 'x', '&times;'); x.setAttribute('aria-label', 'Close'); c.appendChild(x);
  const body = h('div'); c.appendChild(body);
  const draw = () => {
    let html = `<h3>${esc(o.title || '')}</h3>`;
    if (o.views) { const v = o.views[vi]; html = `<h3>${esc(v.title || o.title)}</h3>` + viewHTML(v) + (o.views.length > 1 ? `<div class="dots">${o.views.map((_, i) => `<i class="${i === vi ? 'on' : ''}"></i>`).join('')}</div>` : ''); if (o.views.length > 1) html += `<div class="nav"><button class="btn" data-n="-1" ${vi === 0 ? 'disabled' : ''}>Back</button><button class="btn" data-n="1" ${vi === o.views.length - 1 ? 'disabled' : ''}>Next</button></div>`; }
    else { if (o.art) html += `<div class="art">${o.art}</div>`; if (o.text) html += `<p>${esc(o.text)}</p>`; if (o.html) html += o.html; }
    if (o.saved) html += `<div class="saved">${esc(o.saved)}</div>`;
    body.innerHTML = html;
    if (o.buttons) { const row = h('div', 'center'); o.buttons.forEach(b => { const e = h('button', 'btn' + (b.alt ? ' alt' : ''), esc(b.label)); e.onclick = () => { close(); b.fn && b.fn(); }; row.appendChild(e); }); body.appendChild(row); }
    $$('[data-n]', body).forEach(b => b.onclick = () => { vi += +b.dataset.n; sfx('click'); draw(); });
    o.onview && o.onview(vi, body);
  };
  const close = () => { if (!wrap.isConnected) return; wrap.remove(); cardQ.shift(); stopSpeechIfSoft(); o.onclose && o.onclose(); res(); if (cardQ.length) showCard(); };
  x.onclick = close; wrap.addEventListener('pointerdown', e => { if (e.target === wrap) close(); }); wrap._close = close;
  draw(); wrap.appendChild(c); $('#card-layer').appendChild(wrap); sfx('page');
}
const stopSpeechIfSoft = () => cancelSoft();
const closeTopCard = () => { const w = $('#card-layer .cardwrap:last-child'); if (w) { w._close(); return true; } return false; };

/* ---------- fly to Casebook ---------- */
function fly(spriteName, fromEl) {
  return new Promise(res => {
    const to = $('#btn-book').getBoundingClientRect(), from = fromEl ? fromEl.getBoundingClientRect() : { left: innerWidth / 2 - 32, top: innerHeight / 2 - 32 };
    const im = h('img', 'flying'); im.src = have.has(spriteName) ? spriteUrl(spriteName) : 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="8" fill="#F2E9D8"/></svg>');
    im.style.left = from.left + 'px'; im.style.top = from.top + 'px'; document.body.appendChild(im);
    requestAnimationFrame(() => { im.style.left = to.left + 'px'; im.style.top = to.top + 'px'; im.style.width = im.style.height = '20px'; im.style.opacity = '.3'; });
    setTimeout(() => { im.remove(); $('#btn-book').classList.add('pulse'); setTimeout(() => $('#btn-book').classList.remove('pulse'), 900); sfx('chime'); res(); }, 950);
  });
}

/* ---------- items, notes, pages ---------- */
function addNote(room, text) { if (!text || S.notes.some(n => n.text === text)) return; S.notes.push({ room, text }); }
function itemArt(id) { const it = G.items[id]; if (it.tape || it.slip) return ''; return spriteImg(it.sprite); }
async function showFound(id, extra) {
  const it = G.items[id]; if (!S.items.includes(id)) S.items.push(id);
  await card({ title: it.name, text: it.desc, art: spriteImg(it.sprite), saved: G.ui.toBook, ...extra }); await fly(it.sprite);
}
async function showPage(n) {
  const p = G.pages[n - 1]; if (S.pages.includes(n)) return; S.pages.push(n); addSignal(G.config.signal.filePage); sfx('page');
  await card({ title: 'File page ' + n + ' written', dark: true, html: `<p><b>${esc(p.title)}</b></p><p>${esc(p.text)}</p><div class="saved" style="color:#9fd">${esc(G.ui.toBook)}</div>` });
  await fly('icon_casebook');
}

/* ---------- Casebook ---------- */
let bookTab = 'items', bookOnClose = null;
function openBook(tab, onClose) {
  if (S.over) return; bookTab = tab || bookTab; bookOnClose = onClose || null; const b = $('#casebook'); b.classList.remove('hidden'); drawBook(); sfx('page'); tutEvent('bookopen');
}
function closeBook() { const b = $('#casebook'); if (b.classList.contains('hidden')) return false; b.classList.add('hidden'); sfx('page'); const f = bookOnClose; bookOnClose = null; f && f(); tutEvent('bookclose'); return true; }
function drawBook() {
  const b = $('#casebook'); b.innerHTML = ''; const bk = h('div', 'book'), x = h('button', 'x', '&times;'); x.setAttribute('aria-label', 'Close'); x.onclick = closeBook; bk.appendChild(x);
  bk.appendChild(h('h2', '', 'The Otherworld Files'));
  const tabs = h('div', 'tabs'); [['items', 'Items'], ['notes', 'Notes'], ['pages', 'File pages']].forEach(([k, l]) => { const t = h('button', 'tab' + (bookTab === k ? ' on' : ''), l + (k === 'pages' ? ` ${S.pages.length}/6` : '')); t.onclick = () => { bookTab = k; sfx('click'); drawBook(); }; tabs.appendChild(t); });
  bk.appendChild(tabs); const body = h('div', 'bk'); bk.appendChild(body);
  if (bookTab === 'items') {
    if (!S.items.length) body.appendChild(h('div', 'empty-msg', 'Nothing here yet. Tap things in the room to find items.'));
    const grid = h('div', 'igrid');
    S.items.forEach(id => {
      const it = G.items[id], t = h('button', 'itile' + (S.heard.has(it.tape) ? ' heard' : ''));
      const lab = it.tape ? `<div class="tl">${it.tape}</div>` : it.slip ? `<div class="tl">${it.slip}</div>` : '';
      t.innerHTML = (have.has(it.sprite) ? spriteImg(it.sprite) : `<div class="fb">${esc(it.name)}</div>`) + lab + (it.tape ? '<span class="usetag">USE</span>' : '') + `<span>${esc(it.name)}${S.heard.has(it.tape) ? ' ✓' : ''}</span>`;
      t.onclick = () => itemTap(id); grid.appendChild(t);
    });
    body.appendChild(grid);
  } else if (bookTab === 'notes') {
    if (!S.notes.length) body.appendChild(h('div', 'empty-msg', 'Clues and details you read are saved here.'));
    G.rooms.forEach(r => { const ns = S.notes.filter(n => n.room === r.id); if (!ns.length) return; body.appendChild(h('div', 'note', `<h4>${esc(r.name)}</h4>` + ns.map(n => `<div>• ${esc(n.text)}</div>`).join(''))); });
  } else {
    G.pages.forEach(p => { const got = S.pages.includes(p.n); body.appendChild(h('div', 'pg' + (got ? '' : ' empty'), got ? `<b>${esc(p.title)}</b>${esc(p.text)}` : `<b>File page ${p.n}</b>Not found yet.`)); });
  }
  b.appendChild(bk);
}
function slipText(code) { const s = G.slips[code]; return (code === 'S5' && !S.flags.cabinetMoved && s.hiddenText) ? s.hiddenText : s.text; }
function itemTap(id) {
  const it = G.items[id];
  if (it.inspect === 'flyer') { openFlyer(); return; }
  let html = '', buttons;
  if (it.slip) html = `<div class="slipcard">${esc(slipText(it.slip))}</div>`;
  if (it.tape) { const t = curRoomTapes()[it.tape] || allTapes()[it.tape]; html = S.heard.has(it.tape) ? `<div class="slipcard">${esc(t.caption)}</div>` : ''; buttons = [{ label: 'Use on recorder', fn: () => useTape(it.tape) }]; }
  card({ title: it.name, text: it.desc, art: it.tape ? `<div style="font-family:var(--f-title);font-size:60px;color:#7a2a10">${it.tape}</div>` : (it.slip ? '' : spriteImg(it.sprite)), html, buttons });
}
const allTapes = () => G.rooms[3].tapes, curRoomTapes = () => G.rooms[S.roomIdx].tapes || allTapes();
function useTape(letter) {
  closeBook(); closeTopCard();
  if (S.roomIdx !== 3) { toast('Nothing to use it on here.'); return; }
  S.useItem = letter; showArmed(G.ui.useTape.replace('Pick a tape in the Casebook, then tap', 'Now tap') + ' (Tape ' + letter + ')', () => { S.useItem = null; });
}
function openFlyer() {
  const r = G.rooms[1]; S.done.add('book:flyer'); addNote(r.id, r.flyerNote);
  card({ title: "Callum's flyer", views: r.flyerViews, saved: G.ui.saved, onclose: () => refreshHotspots() });
  say(r.flyerLine, { soft: true });
}

/* ---------- views (inspect close-ups) ---------- */
const SYM = { star: '<polygon points="50,6 61,38 95,38 67,58 78,92 50,71 22,92 33,58 5,38 39,38"/>', heart: '<path d="M50 90 C10 60 8 28 30 20 C42 16 50 26 50 32 C50 26 58 16 70 20 C92 28 90 60 50 90Z"/>',
  bolt: '<polygon points="58,4 22,56 46,56 38,96 78,40 54,40"/>', diamond: '<polygon points="50,4 90,50 50,96 10,50"/>', moon: '<path d="M66 10 A42 42 0 1 0 90 62 A34 34 0 1 1 66 10Z"/>',
  dot: '<circle cx="50" cy="50" r="30"/>', triangle: '<polygon points="50,10 92,88 8,88"/>', cross: '<path d="M38 8h24v30h30v24H62v30H38V62H8V38h30z"/>' };
const symSvg = (n, c = '#FFC46B') => `<svg viewBox="0 0 100 100" fill="${c}">${SYM[n]}</svg>`;
const TILE = {
  glow: '<path d="M14 60 Q14 28 36 28 Q58 28 58 60Z M46 68 Q46 42 64 42 Q82 42 82 68Z" fill="#6cff9a66" stroke="#b6ffcc" stroke-width="4"/><path d="M36 60v22M64 68v14" stroke="#b6ffcc" stroke-width="6"/>',
  moss: '<path d="M8 28 q10-14 21 0 t21 0 t21 0 t21 0 M8 52 q10-14 21 0 t21 0 t21 0 t21 0 M8 76 q10-14 21 0 t21 0 t21 0 t21 0" fill="none" stroke="#8CE05A" stroke-width="7" stroke-linecap="round"/>',
  drip: '<path d="M50 8 C50 8 20 46 20 64 A30 30 0 0 0 80 64 C80 46 50 8 50 8Z" fill="#3DA5FF77" stroke="#9fd2ff" stroke-width="5"/>',
  stone: '<path d="M12 12H88V88H12Z" fill="#8889" stroke="#ddd" stroke-width="5"/><path d="M12 40 L40 50 L32 70 L58 88 M62 12 L52 40 L80 58" fill="none" stroke="#eee" stroke-width="4"/>'
};
const tileSvg = k => `<svg viewBox="0 0 100 100">${TILE[k]}</svg>`;
function viewHTML(v) {
  const r = G.rooms[S.roomIdx];
  switch (v.type) {
    case 'key': return `<div class="keygrid">${v.symbols.map(([s, l]) => `<div class="keycell"><span class="sym">${symSvg(s)}</span><span class="ltr">${l}</span></div>`).join('')}</div><p style="font-size:13px">Each symbol stands for one letter.</p>`;
    case 'board': return `<div class="board ${S.flags.boardLit ? 'lit' : ''}">${v.symbols.map(s => `<div class="slot">${symSvg(s)}</div>`).join('')}</div><p style="font-size:13px">${S.flags.boardLit ? 'Bright and steady.' : 'Too dark to read. Something would have to wake this board up.'}</p>`;
    case 'flyer': return `<div class="paper flyer"><div class="big">STARLIGHT<br>ARCADE</div><div class="big" style="font-size:16px;margin-top:6px">HIGH SCORE NIGHT</div><div class="small">Friday, 8 p.m. Bring quarters.</div></div>`;
    case 'warden': { const rr = G.rooms[2].panel.rules; return `<div class="art">${spriteImg('prop_gloom_warden')}</div><div class="rules">${rr.map(x => ruleHTML(x)).join('')}</div>`; }
    case 'chart': return `<div class="rules">${G.rooms[2].cards.map(c => `<div class="rule"><div class="gcard" style="cursor:default">${spriteImg(c.sprite)}<span><b>${esc(c.name)}</b></span></div><div class="rt">${esc(c.text)}</div></div>`).join('')}</div>`;
    case 'roster': return `<div class="paper">${G.rooms[4].people.map(p => `<p><b>${p.badge}</b> &nbsp; ${esc(p.name)}, ${esc(p.job)}</p>`).join('')}</div>`;
    case 'rhyme': return `<div class="paper rhymebox">${G.rooms[5].rhyme.map((l, i) => `<div>${i + 1}. ${esc(l)}</div>`).join('')}</div>`;
    case 'musicbox': return `<div class="art">${spriteImg(v.open ? 'prop_music_box_open' : 'prop_music_box_closed')}</div>` + (v.open ? `<p style="text-align:center;font-family:var(--f-title);letter-spacing:6px">M I R A</p>` : '<p>An old music box. It plays a lullaby.</p>');
  }
  return '';
}
function ruleHTML(x) {
  const cov = x.coveredText && !S.flags.toolboxMoved;
  return `<div class="rule"><b style="font-family:var(--f-px);font-size:10px">${x.id}</b><div class="rt ${cov ? 'cov' : ''}">${cov ? `<span>⚡ ${esc(x.coveredText)}</span><div class="toolbox">Heavy toolbox</div>` : (x.coveredText ? '⚡ ' : '') + esc(x.text)}</div></div>`;
}

/* ---------- panorama ---------- */
const HS = { shown: new Map(), els: new Map() };
function fallbackPano(room) {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 1024);
  gr.addColorStop(0, '#05070f'); gr.addColorStop(.5, room.accent + '55'); gr.addColorStop(1, '#05070f'); g.fillStyle = gr; g.fillRect(0, 0, 2048, 1024);
  g.fillStyle = '#ffffff33'; for (let y = 0; y < 1024; y += 64) g.fillRect(0, y, 2048, 1);
  g.font = '64px Bungee, Impact, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#F2E9D8';
  [0, 90, 180, 270].forEach(a => g.fillText(room.name, ((a + 180) % 360) / 360 * 2048, 520)); return c.toDataURL('image/jpeg', .8);
}
function loadPano(room) {
  return new Promise(res => {
    const im = new Image(); im.onload = () => res(room.panorama); im.onerror = () => res(fallbackPano(room)); im.src = room.panorama;
  });
}
async function buildViewer(room) {
  if (V) { try { V.destroy(); } catch (e) {} V = null; } HS.shown.clear(); HS.els.clear();
  const url = await loadPano(room);
  return new Promise(res => {
    V = pannellum.viewer('pano', { type: 'equirectangular', panorama: url, autoLoad: true, showControls: false, hfov: 100, minHfov: 55, maxHfov: 120, mouseZoom: false, compass: false, keyboardZoom: false, friction: .15 });
    V.on('load', () => res()); setTimeout(res, 4000);
  });
}
const afterMet = hs => (hs.after || []).every(a => S.done.has(a));
function hsVisible(hs) {
  if (hs.kind === 'AUTO' || hs.kind === 'power') return false; if (!afterMet(hs)) return false;
  if (hs.kind === 'FIND' || hs.kind === 'PANEL') return !S.done.has(hs.id); return true;
}
const ICON = { LEARN: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/></svg>', INSPECT: '<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/></svg>', PANEL: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16M12 4v16"/></svg>' };
function hsEl(hs) {
  const k = hs.kind.toLowerCase(), seen = S.done.has(hs.id); let inner;
  if (hs.kind === 'FIND') inner = have.has(hs.sprite) ? `<img class="sp" src="${spriteUrl(hs.sprite)}" alt="">` : `<div class="fb">${esc(hs.name)}</div>`;
  else if (hs.kind === 'EXIT') inner = `<div class="exit">EXIT</div>`;
  else if (hs.kind === 'USE') inner = `<div class="glow"><svg viewBox="0 0 24 24" fill="none" stroke="#bfe0ff" stroke-width="2"><path d="M7 3v18M17 3v18M7 8h10M7 16h10"/></svg></div>`;
  else inner = `<div class="glow" ${seen ? 'style="animation:none;opacity:.45"' : ''}>${ICON[hs.kind]}</div>`;
  return `<div class="hs" data-id="${hs.id}">${inner}</div>`;
}
let dragStart = null;
function refreshHotspots() {
  if (!V) return; const room = G.rooms[S.roomIdx];
  room.hotspots.forEach(hs => {
    const vis = hsVisible(hs), sig = vis ? hs.kind + (S.done.has(hs.id) ? '1' : '0') : null, cur = HS.shown.get(hs.id);
    if (cur === sig) return;
    if (cur !== undefined) { try { V.removeHotSpot(hs.id); } catch (e) {} HS.shown.delete(hs.id); HS.els.delete(hs.id); }
    if (!vis) return;
    HS.shown.set(hs.id, sig);
    V.addHotSpot({ id: hs.id, pitch: hs.pitch, yaw: hs.yaw, type: 'custom', cssClass: 'ow-hs ow-' + hs.kind.toLowerCase(),
      createTooltipFunc: div => { div.innerHTML = hsEl(hs); const inner = $('.hs', div); HS.els.set(hs.id, div);
        inner.addEventListener('pointerdown', e => { dragStart = { x: e.clientX, y: e.clientY, t: performance.now() }; });
        inner.addEventListener('pointerup', e => { if (e._owHandled || !dragStart) return; const d = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y); dragStart = null; if (d < 10) tapHotspot(hs); }); } });
  });
  drawFindStrip(); updateHud();
}
function drawFindStrip() {
  const room = G.rooms[S.roomIdx], f = room.hotspots.filter(x => x.kind === 'FIND'), el = $('#findstrip'); el.innerHTML = '';
  if (!f.length) return; el.appendChild(h('span', '', G.ui.findStrip + ':'));
  f.forEach(x => { const got = S.done.has(x.id); el.appendChild(h('div', 'chip' + (got ? ' got' : ''), got ? '✓' : (have.has(x.sprite) ? spriteImg(x.sprite) : '?'))); });
}
function updateHud() {
  const sp = $('#sparks'); sp.innerHTML = ''; for (let i = 0; i < G.config.sparks; i++) sp.appendChild(h('div', 'bulb' + (i < S.sparks ? '' : ' off')));
  $$('.pw').forEach(b => b.classList.toggle('dead', S.sparks <= 0));
}

/* ---------- hotspot taps ---------- */
function resetIdle() { S.idleAt = performance.now(); }
function modalOpen() { return !!(S.panel || cardQ.length || !$('#casebook').classList.contains('hidden')); }
function canAct() { return S.playing && !S.over && !S.pauseReasons.size; }
function tapHotspot(hs) {
  if (S.armed || !canAct()) return; sfx('click'); resetIdle();
  if (S.useItem && hs.kind !== 'USE') { S.useItem = null; hideArmed(); toast('Not here.'); return; }
  const room = G.rooms[S.roomIdx], sg = G.config.signal;
  const soft = () => { const l = (hs.lineLit && S.usedPowers.has(hs.id)) ? hs.lineLit : hs.line; l && say(l, { soft: true }); };
  switch (hs.kind) {
    case 'LEARN': { const first = !S.done.has(hs.id); S.done.add(hs.id); if (first) { addSignal(sg.learn); addNote(room.id, hs.note); }
      card({ title: hs.card.title, text: hs.card.text, saved: G.ui.saved, onclose: refreshHotspots }); soft(); refreshHotspots(); break; }
    case 'INSPECT': { S.done.add(hs.id); addNote(room.id, (hs.noteLit && S.usedPowers.has(hs.id)) ? hs.noteLit : hs.note); card({ title: hs.name, views: room.views[hs.view], saved: G.ui.saved, onclose: refreshHotspots }); soft(); refreshHotspots(); break; }
    case 'FIND': { if (S.done.has(hs.id)) return; S.done.add(hs.id); addSignal(sg.find); const el = HS.els.get(hs.id);
      card({ title: hs.card.title, text: hs.card.text, art: spriteImg(hs.sprite), saved: G.ui.toBook, onclose: async () => { hs.items.forEach(i => { if (!S.items.includes(i)) S.items.push(i); });
        refreshHotspots(); for (const i of hs.items) await fly(G.items[i].sprite, el); } }); soft(); refreshHotspots(); break; }
    case 'PANEL': openPanel(hs); break;
    case 'USE': if (S.useItem) { const t = S.useItem; S.useItem = null; hideArmed(); openRecorder(t); } else toast(G.ui.useTape, 3500); break;
    case 'EXIT': goNext(); break;
  }
}

/* ---------- powers ---------- */
function drawPowers() {
  const p = $('#powers'); p.innerHTML = '';
  Object.entries(G.powers).forEach(([k, pw]) => {
    const b = h('button', 'pw'); b.dataset.p = k; b.setAttribute('aria-label', pw.name);
    b.innerHTML = (have.has(pw.icon) ? `<span class="ico" style="background-image:url(${spriteUrl(pw.icon)})"></span>` : '') + `<span class="t">${esc(pw.name)}</span>`;
    b.onclick = () => powerCard(k); p.appendChild(b);
  });
}
function powerCard(k) {
  if (!canAct() && !S.tutorial) return; const pw = G.powers[k]; sfx('click');
  card({ title: pw.name, text: pw.desc, art: spriteImg(pw.icon), dark: true, buttons: [{ label: 'Use', fn: () => armPower(k) }, { label: 'Close', alt: true }] });
}
function armPower(k) {
  if (S.sparks <= 0) { toast(G.ui.noSparks); return; }
  if (S.tutorial && !S.tutorialPlay) return;
  S.armed = k; $('#pano').classList.add('armed'); $$('.pw').forEach(b => b.classList.toggle('armed', b.dataset.p === k)); showArmed(G.powers[k].name + ': ' + G.ui.armed, cancelArmed);
}
let armedCancel = null;
function showArmed(text, onCancel) { $('#armed-text').textContent = text; $('#armed').classList.remove('hidden'); armedCancel = onCancel; }
function hideArmed() { $('#armed').classList.add('hidden'); armedCancel = null; }
function cancelArmed() { const f = armedCancel; S.armed = null; S.useItem = null; $('#pano').classList.remove('armed'); $$('.pw').forEach(b => b.classList.remove('armed')); hideArmed(); f && f(); }
function angDist(y1, p1, y2, p2) { return Math.hypot(norm(y1 - y2) * Math.cos(p1 * Math.PI / 180), p1 - p2); }
function armedTap(e) {
  if (!S.armed) return; if (e.target.closest('#hud-bottom,#armed,#pause,.cardwrap,#tutorial,#casebook')) return;
  e._owHandled = true; e.stopPropagation(); const k = S.armed, room = G.rooms[S.roomIdx]; cancelArmed(); let hit = null;
  if (S.panel && S.panel.root.contains(e.target)) { hit = room.hotspots.find(x => x.panel && x.panel === S.panel.id && x.power === k && afterMet(x) && !S.usedPowers.has(x.id)) || null; }
  else if (V && !e.target.closest('.panel')) {
    const [pitch, yaw] = V.mouseEventToCoords(e), R = G.config.powerRadius;
    hit = room.hotspots.filter(x => x.power === k && afterMet(x) && !S.usedPowers.has(x.id) && angDist(yaw, pitch, x.yaw, x.pitch) <= (x.radius || R)).sort((a, b) => angDist(yaw, pitch, a.yaw, a.pitch) - angDist(yaw, pitch, b.yaw, b.pitch))[0] || null;
  }
  spendSpark(); if (hit) applyPower(hit, k); else fizzle();
}
function spendSpark() { S.sparks--; updateHud(); sfx('burst'); const w = $('#wren-drop'); w.innerHTML = `<div class="p" style="background-image:url(${spriteUrl('port_wren')})"></div><div class="d"></div>`; w.classList.remove('hidden'); setTimeout(() => w.classList.add('hidden'), 1800); $$('#sparks .bulb')[S.sparks]?.classList.add('flash'); }
function fizzle() { const l = G.fizzle[Math.floor(Math.random() * G.fizzle.length)]; sfx('wrong'); say(l, { soft: true }); }
function applyPower(hs, k) {
  S.usedPowers.add(hs.id); if (hs.kind === 'power') S.done.add(hs.id); if (hs.noteLit) addNote(G.rooms[S.roomIdx].id, hs.noteLit); sfx('zap');
  if (hs.id === 'r2_board') S.flags.boardLit = true; if (hs.id === 'r4_radio') S.flags.radioOn = true; if (hs.id === 'r3_toolbox') S.flags.toolboxMoved = true;
  if (hs.id === 'r5_cabinet') S.flags.cabinetMoved = true; if (hs.id === 'r6_floor') S.veilUntil = S.playTime + G.config.veilSeconds;
  toast(G.powerToasts[hs.id] || 'It worked.'); if (hs.fxLine) say(hs.fxLine, { soft: true }); if (hs.fxGlow && V) V.addHotSpot({ id: 'fx_' + hs.id, pitch: hs.fxGlow.pitch, yaw: hs.fxGlow.yaw, type: 'custom', cssClass: 'ow-fx', createTooltipFunc: d => { d.innerHTML = '<div class="dialglow"></div>'; } }); if (S.panel && S.panel.refresh) S.panel.refresh(); refreshHotspots();
}

/* ---------- hints ---------- */
let arrowT = null;
function hint() {
  if (!canAct() && !(S.tutorial && S.tutorialPlay)) return; sfx('click'); resetIdle(); const room = G.rooms[S.roomIdx];
  if (S.tutorial) { toast(G.tutorialFreeHint, 4000); flashNext(room); tutEvent('hint'); return; }
  const n = S.hintsUsed[room.id] || 0;
  if (n >= G.config.hintsPerRoom) { toast(G.ui.noHints); return; }
  const cost = -G.config.signal.hint; if (S.signal < cost) { toast(G.ui.noSignal.replace('{n}', cost), 3500); return; }
  S.hintsUsed[room.id] = n + 1; addSignal(G.config.signal.hint);
  if (n === 0) flashNext(room); else say(room.hints.line);
}
function flashNext(room) {
  const list = room.hints.flash; let pick = null;
  for (const id of list) {
    if (id.startsWith('book:')) { if (!S.done.has(id)) { pick = id; break; } continue; }
    if (id.startsWith('ui:')) { if ($('#' + id.slice(3))) { pick = id; break; } continue; }
    if (!S.done.has(id) && HS.shown.has(id)) { pick = id; break; }
  }
  if (!pick) { toast('Look around for anything new.'); return; }
  if (pick.startsWith('book:')) { $('#btn-book').classList.add('pulse'); setTimeout(() => $('#btn-book').classList.remove('pulse'), 5000); toast('Look in your Casebook.'); return; }
  if (pick.startsWith('ui:')) { const e = $('#' + pick.slice(3)); e.classList.add('pulse'); setTimeout(() => e.classList.remove('pulse'), 5000); return; }
  const el = HS.els.get(pick), hs = room.hotspots.find(x => x.id === pick); if (el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 4200); }
  clearInterval(arrowT); const ar = $('#edge-arrow'); let n = 0;
  arrowT = setInterval(() => {
    if (!V || ++n > 20) { clearInterval(arrowT); ar.classList.add('hidden'); return; }
    const dy = norm(hs.yaw - V.getYaw()), dp = hs.pitch - V.getPitch(), hf = V.getHfov();
    if (Math.abs(dy) < hf * .38 && Math.abs(dp) < hf * .25) { ar.classList.add('hidden'); return; }
    const ang = Math.atan2(-dp, dy), W = innerWidth, H = innerHeight, cx = W / 2, cy = H / 2, r = Math.min(cx, cy) - 80;
    ar.style.left = cx + Math.cos(ang) * (Math.abs(dy) > hf * .38 ? cx - 70 : r) - 24 + 'px'; ar.style.top = cy + Math.sin(ang) * (r) - 24 + 'px'; ar.style.transform = `rotate(${ang}rad)`; ar.textContent = '➤'; ar.classList.remove('hidden');
  }, 200);
}

/* ---------- panels ---------- */
function openPanel(hs, cfgOv) {
  if (S.panel) return; const room = G.rooms[S.roomIdx], cfg = cfgOv || room.panel, layer = $('#panel-layer');
  const root = h('div', 'panel'), back = h('div', 'panel-back'), x = h('button', 'x', '&times;'); x.setAttribute('aria-label', 'Close'); x.onclick = closePanel; back.onclick = closePanel;
  const holder = h('div'); holder.style.pointerEvents = 'none'; layer.style.pointerEvents = 'none'; holder.style.position = 'absolute'; holder.style.inset = '0';
  holder.appendChild(back); root.appendChild(x); root.appendChild(h('h2', '', esc(cfg.title))); root.appendChild(h('p', 'intro', esc(cfg.intro || '')));
  const body = h('div'); root.appendChild(body); holder.appendChild(root); layer.appendChild(holder);
  const pst = S.pstate[hs.id] = S.pstate[hs.id] || {};
  const P = { hs, room, cfg, root, body, holder, pst, alive: true, id: hs.panel || hs.id, close: closePanel, refresh: null,
    status: t => { let e = $('.status', root); if (!e) { e = h('div', 'status'); root.insertBefore(e, body); } e.textContent = t; },
    wrong: o => wrongAnswer(P, o), solved: () => solvePanel(P), lock: sec => lockPanel(P, sec) };
  S.panel = P; PANELS[cfg.type](P); sfx('page');
}
function closePanel() { const P = S.panel; if (!P) return; P.alive = false; P.destroy && P.destroy(); P.holder.remove(); S.panel = null; $('#panel-layer').style.pointerEvents = 'none'; }
function lockPanel(P, sec) {
  if (!sec) return; P.body.classList.add('locked'); const bar = h('div', 'lockbar'); bar.style.width = '100%'; P.body.appendChild(bar);
  requestAnimationFrame(() => { bar.style.transitionDuration = sec + 's'; bar.style.width = '0'; }); setTimeout(() => { P.body.classList.remove('locked'); bar.remove(); }, sec * 1000);
}
function wrongAnswer(P, o = {}) {
  const room = P.room, n = S.wrongN[room.id] = (S.wrongN[room.id] || 0) + 1; sfx('wrong');
  if (o.cost !== false) addSignal(G.config.signal.wrong);
  if (o.lock !== false) lockPanel(P, o.lock || (room.id === 'room7' ? G.config.lockoutSeconds.room7 : G.config.lockoutSeconds.panel));
  if (o.cost !== false) { P.body.classList.remove('shake'); void P.body.offsetWidth; P.body.classList.add('shake'); }
  say(room.wrong[Math.min(n, room.wrong.length) - 1]);
}
async function solvePanel(P) {
  const room = P.room, hs = P.hs; closePanel(); S.done.add(hs.id); sfx('unlock');
  if (room.id === 'room7') { addSignal(G.config.signal.finalSentences); addSignal(Math.floor(S.timeLeft) * G.config.signal.timePerSecond); }
  refreshHotspots(); await say(room.right, { story: true });
  for (const a of room.hotspots.filter(x => x.kind === 'AUTO' && !S.done.has(x.id) && afterMet(x))) await giveReward(a);
}
async function giveReward(a) {
  S.done.add(a.id);
  if (a.ending) { startEnding(); return; }
  const rw = a.reward; for (const i of rw.items) await showFound(i); if (rw.page) await showPage(rw.page);
  refreshHotspots(); toast(G.ui.exitToast, 3200); sfx('door');
}

/* ---------- room flow ---------- */
async function enterRoom(i) {
  S.roomIdx = i; const room = G.rooms[i]; document.documentElement.style.setProperty('--accent', room.accent);
  await buildViewer(room); S.visited.add(room.id); $('#objective').textContent = room.objective; refreshHotspots();
}
async function startRoom(i) {
  const room = G.rooms[i]; card({ title: G.ui.objective, text: room.objective, dark: true });
  if (i === 6) sfx('hum'); await say(room.enter, { story: true });
  if (room.giveOnEnter && !S.items.includes(room.giveOnEnter)) await showFound(room.giveOnEnter, { title: "Otto hands you Callum's flyer", text: "You left it behind. It might matter." });
}
async function goNext() {
  const i = S.roomIdx; if (i >= G.rooms.length - 1 || S.changing) return; S.changing = true; closePanel(); cancelSoft();
  const f = $('#fade'); f.classList.add('on'); sfx('door'); await sleep(450);
  await enterRoom(i + 1); f.classList.remove('on'); f.classList.add('jitter'); setTimeout(() => f.classList.remove('jitter'), 600); S.changing = false; resetIdle(); startRoom(i + 1);
}

/* ---------- idle, pause, end ---------- */
function idleCheck(now) {
  if (!canAct() || modalOpen() || D.busy || S.armed) return;
  if (now - S.idleAt > G.config.idleSeconds * 1000) { S.idleAt = now; say(G.idle[S.idleN++ % G.idle.length], { soft: true }); }
}
function togglePause(force) {
  if (S.over || !$('#start').classList.contains('hidden')) return; const p = $('#pause'), open = !p.classList.contains('hidden'), want = force == null ? !open : force; if (want === open) return;
  if (want) {
    S.pauseReasons.add('pause'); document.body.classList.add('paused'); p.classList.remove('hidden');
    p.innerHTML = `<div class="bulbs-title" style="font-size:36px">PAUSED</div><div class="menu"><button class="btn big" id="p-resume">Resume</button><button class="btn" id="p-sound">Sound: ${A.on ? 'On' : 'Off'}</button><button class="btn" id="p-voice">Narration: ${A.voice ? 'On' : 'Off'}</button><button class="btn alt" id="p-restart">Restart</button></div>`;
    $('#p-resume').onclick = () => togglePause(false); $('#p-sound').onclick = e => { setSound(!A.on); e.target.textContent = 'Sound: ' + (A.on ? 'On' : 'Off'); }; $('#p-voice').onclick = e => { setVoice(!A.voice); e.target.textContent = 'Narration: ' + (A.voice ? 'On' : 'Off'); }; $('#p-restart').onclick = () => location.reload();
    pauseSpeech();
  } else { S.pauseReasons.delete('pause'); document.body.classList.remove('paused'); p.classList.add('hidden'); resumeSpeech(); }
}
function timeUp(key = 'lose') {
  if (S.over) return; S.over = true; S.playing = false; closePanel(); cardQ.splice(0).forEach(q => q.res()); $('#card-layer').innerHTML = ''; $('#casebook').classList.add('hidden'); skipDialogue(); D.queue = []; stopSpeech(); cancelArmed(); sfx('burst');
  const e = G.endScreens[key]; endScreen(`<div class="bulbs-title">${esc(e.title)}</div><p class="sub">${esc(e.text)}</p><div class="endstats"><span>Signal earned</span><b>${S.signal}</b></div><div class="center"><button class="btn big" id="e-play">${esc(e.play)}</button><button class="btn alt" id="e-close">${esc(e.close)}</button></div>`);
}
function endScreen(html) {
  const e = $('#endscreen'); e.innerHTML = html; e.classList.remove('hidden'); const p = $('#e-play'); if (p) p.onclick = () => location.reload(); const c = $('#e-close'); if (c) c.onclick = () => { location.href = location.pathname; }; // Close goes back to the home (tap to start) screen
}
async function startEnding() {
  S.pauseReasons.add('ending'); addSignal(G.config.signal.closeRift); closePanel(); const cine = h('div'); cine.id = 'cine'; cine.style.zIndex = 60; cine.style.background = 'transparent'; $('#app').appendChild(cine);
  cine.innerHTML = `<div class="bg"></div><div class="rift"></div><div class="sil" id="s-ines" style="left:30%;opacity:0"></div><div class="sil" id="s-kids" style="left:58%;width:20%;opacity:0"></div><div class="static"></div><div class="home">HOME</div><button class="btn small" id="cine-skip" style="position:absolute;right:10px;top:var(--top);z-index:5;pointer-events:auto">Skip</button>`;
  let skipped = false; $('#cine-skip').onclick = () => { skipped = true; skipDialogue(); };
  const fx = {
    hush: () => { $('.bg', cine).style.background = 'rgba(0,0,0,.5)'; sfx('burst'); }, ines: () => { $('#s-ines').style.opacity = '.9'; },
    close: () => { $('.rift', cine).classList.add('close'); sfx('close'); $$('#sparks .bulb:not(.off)').forEach(b => b.classList.add('flash')); }, step: () => { const k = $('#s-kids'); k.style.opacity = '.9'; k.style.left = '40%'; },
    home: () => { $('.bg', cine).style.background = '#1a1208'; $('#s-ines').style.opacity = 0; $('#s-kids').style.opacity = 0; $('.home', cine).classList.add('on'); sfx('chime'); }, static: () => { $('.static', cine).classList.add('on'); sfx('burst'); }
  };
  for (const ln of G.ending) { if (skipped) break; fx[ln.fx] && fx[ln.fx](); await say(ln); if (ln.fx === 'home' && !skipped) await sleep(1200); }
  cine.remove(); S.over = true; S.playing = false; S.pauseReasons.delete('ending');
  const e = G.endScreens.win;
  endScreen(`<div class="bulbs-title">${esc(e.title)}</div><div class="endstats"><span>Signal</span><b>${S.signal}</b><span>Time left</span><b>${fmt(S.timeLeft)}</b><span>File pages found</span><b>${S.pages.length} of 6</b><span>Sparks left</span><b>${S.sparks}</b></div><div class="center"><button class="btn big" id="e-play">${esc(e.play)}</button><button class="btn alt" id="e-close">${esc(e.close)}</button></div>`);
}

/* ---------- start flow and tutorial ---------- */
function giveSparks() { if (S.sparksGiven) return; S.sparksGiven = true; S.sparks = G.config.sparks; updateHud(); sfx('chime'); }
let tutRes = null; const tutEvents = {};
function tutEvent(n) { if (tutEvents[n]) tutEvents[n](); }
function runTutorial() {
  return new Promise(res => {
    S.tutorial = true; S.pauseReasons.add('tutorial'); const T = $('#tutorial'); T.classList.remove('hidden'); let i = 0; const steps = G.tutorial;
    const end = skipped => { T.classList.add('hidden'); T.innerHTML = ''; S.tutorial = false; S.tutorialPlay = false; S.pauseReasons.delete('tutorial'); closeBook(); closeTopCard(); giveSparks(); if (skipped) toast(G.skipToast, 4500); res(); };
    const show = () => {
      const st = steps[i]; T.innerHTML = ''; S.tutorialPlay = !!st.action; T.classList.toggle('passthru', !!st.action); if (!st.action) T.appendChild(h('div', 'block'));
      if (st.grant) giveSparks(); let r;
      if (st.target === '#pano') r = { left: 10, top: 90, width: innerWidth - 20, height: innerHeight - 190 };
      else if (st.target) { const b = $(st.target).getBoundingClientRect(); r = { left: b.left - 6, top: b.top - 6, width: b.width + 12, height: b.height + 12 }; }
      else r = { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
      const sp = h('div', 'spot'); Object.assign(sp.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); if (st.target === '#pano') { sp.style.border = '0'; sp.style.boxShadow = '0 0 0 9999px rgba(5,7,15,.3)'; } T.appendChild(sp);
      const tip = h('div', 'tip'), below = r.top + r.height / 2 < innerHeight * .5 && st.target !== '#pano';
      if (!st.target) tip.style.top = '30%'; else if (st.target === '#pano') tip.style.top = '110px'; else if (below) tip.style.top = Math.min(r.top + r.height + 14, innerHeight - 300) + 'px'; else tip.style.bottom = innerHeight - r.top + 12 + 'px';
      tip.innerHTML = `<div class="step">${i + 1} / ${steps.length}</div><h3>${esc(st.title)}</h3><div class="tx">${esc(st.text)}</div>${st.action ? `<div class="act">${esc(st.action)}</div>` : ''}<div class="btns"><button class="btn alt" id="t-skip">Skip</button><button class="btn" id="t-next">${i === steps.length - 1 ? 'Begin' : 'Next'}</button></div>`;
      T.appendChild(tip); $('#t-next').onclick = () => { if (++i >= steps.length) end(false); else show(); }; $('#t-skip').onclick = () => end(true);
    };
    show();
  });
}
async function startGame() {
  initAudio(); sfx('click'); $('#start').classList.add('hidden'); resetState(); const st = $('#stage'); st.style.setProperty('--blur', G.config.blurPx + 'px'); st.style.transitionDuration = G.config.unblurSeconds + 's';
  if (DEBUG && Q.get('room')) S.roomIdx = +Q.get('room') - 1;
  st.classList.add('blur-off', 'blur'); await enterRoom(S.roomIdx); void st.offsetWidth; st.classList.remove('blur-off'); updateHud(); updateTimer(); $('#signal').textContent = 0;
  if (DEBUG && Q.get('play')) { st.classList.remove('blur'); $$('.hud').forEach(x => x.classList.remove('hidden')); giveSparks(); if (Q.get('carry') === '1') carryRooms(S.roomIdx); S.playing = true; startRoom(S.roomIdx); return; }
  await showBriefing(); $$('.hud').forEach(x => x.classList.remove('hidden')); updateHud();
  await runTutorial();
  S.pauseReasons.add('opening'); await say(G.opening, { opening: true, manual: true }); S.pauseReasons.delete('opening');
  st.classList.remove('blur'); await sleep(G.config.unblurSeconds * 1000); S.playing = true; resetIdle(); startRoom(0); showDragHand();
}
function showBriefing() {
  return new Promise(res => {
    const b = G.briefing, el = $('#briefing'); el.style.backgroundImage = `linear-gradient(rgba(11,14,26,.78),rgba(11,14,26,.96)),url(${G.rooms[0].panorama})`;
    const bulbs = Array.from({ length: 14 }, (_, i) => `<i style="animation-delay:${(i * .37) % 3}s"></i>`).join('');
    el.innerHTML = `<div class="wire">${bulbs}</div><div class="bf"><div class="kick">${esc(b.kicker)}</div><h1>${esc(b.title)}</h1>${b.story.map(t => `<p class="story">${esc(t)}</p>`).join('')}
      <p class="goal">${esc(b.goal)}</p><button class="btn big" id="b-go">${esc(b.button)}</button></div>`;
    el.classList.remove('hidden'); el.scrollTop = 0; narrate(b.narration, null);
    $('#b-go').onclick = () => { stopSpeech(); sfx('chime'); el.classList.add('hidden'); [document.documentElement, document.body, $('#app')].forEach(x => { x.scrollTop = 0; x.scrollLeft = 0; }); res(); };
  });
}
function showDragHand() { const d = $('#drag-hand'); d.innerHTML = `<div class="pill">◀ ${esc(G.ui.dragHint)} ▶</div>`; d.classList.remove('hidden'); const off = () => d.classList.add('hidden'); setTimeout(off, 7000); $('#pano').addEventListener('pointerdown', off, { once: true }); }
function buildStart() {
  const s = $('#start'); if (have.has('key_art')) s.style.backgroundImage = 'linear-gradient(rgba(11,14,26,.55),rgba(11,14,26,.8)),url(assets/sheets/key_art.jpg)';
  s.innerHTML = `<div class="bulbs-title">${G.title.split(' ').map(w => `<span style="white-space:nowrap">${[...w].map(c => `<span>${esc(c)}</span>`).join('')}</span>`).join(' ')}</div><div class="sub">${esc(G.tagline)}</div><button class="btn big" id="go">${esc(G.ui.start)}</button>`;
  $('#go').onclick = startGame;
}

/* ---------- init ---------- */
async function init() {
  try {
    const r = await fetch('game.json', { cache: 'no-store' }); if (!r.ok) throw new Error('game.json not found. Run the game with: python -m http.server');
    G = await r.json(); validate(G); resetState(); await preloadSprites();
  } catch (e) { const el = $('#error'); el.classList.remove('hidden'); el.textContent = String(e.message || e); console.error(e); return; }
  $$('.ico[data-icon]').forEach(i => { const n = i.dataset.icon; if (have.has(n)) i.style.backgroundImage = `url(${spriteUrl(n)})`; else { i.remove(); } });
  $$('#hud-bottom .btn.small').forEach(b => { if (!$('.ico', b) && $('.t', b)) b.classList.add('noico'); }); $('#btn-pause').classList.add('noico');
  drawPowers(); updateHud(); updateTimer(); buildStart();
  $('#btn-pause').onclick = () => togglePause(); $('#btn-hint').onclick = hint; $('#btn-book').onclick = () => { if (!closeBook()) openBook(); }; $('#armed-x').onclick = cancelArmed; $('#dlg-skip').onclick = e => { e.stopPropagation(); skipDialogue(); };
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return; if (!$('#pause').classList.contains('hidden')) return togglePause(false);
    if (S.armed || S.useItem) return cancelArmed(); if (closeTopCard()) return; if (closeBook()) return; if (S.panel) return closePanel();
  });
  let down = null; document.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; resetIdle(); }, true);
  document.addEventListener('pointerup', e => { if (S.armed && down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10) armedTap(e); }, true);
  if (DEBUG) {
    window.OW = { G, S, get V() { return V; }, goNext, enterRoom, openPanel }; const d = $('#debug'); d.classList.remove('hidden');
    $('#pano').addEventListener('pointerup', e => { if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 || !V || e.target.closest('.hs')) return; const [p, y] = V.mouseEventToCoords(e); d.textContent = `yaw ${y.toFixed(1)}  pitch ${p.toFixed(1)}`; console.log(`yaw: ${y.toFixed(1)}, pitch: ${p.toFixed(1)}`); });
    if (Q.get('autostart')) setTimeout(startGame, 300);
  }
}
window.addEventListener('load', init);

/* ---------- room lights flicker (rooms with a `flicker` setting) ---------- */
let flickAt = 0;
setInterval(() => {
  const room = G && G.rooms && G.rooms[S.roomIdx], f = room && room.flicker; if (!f || S.pauseReasons.has('pause') || $('#start') && !$('#start').classList.contains('hidden') || !$('#briefing').classList.contains('hidden')) return;
  const now = performance.now(); if (now < flickAt) return; flickAt = now + (f.minSeconds + Math.random() * (f.maxSeconds - f.minSeconds)) * 1000;
  const el = $('#flicker'); el.classList.remove('go'); void el.offsetWidth; el.classList.add('go'); sfx('buzz'); setTimeout(() => sfx('buzz'), 180);
}, 500);

/* debug only: finish every room before `n` (as a perfect player would) so you can test room n+1 directly */
function carryRooms(n) {
  const sg = G.config.signal;
  for (let i = 0; i < n; i++) {
    G.rooms[i].hotspots.forEach(hs => {
      if (hs.kind === 'power') return; S.done.add(hs.id);
      if (hs.kind === 'FIND') { addSignalSilent(sg.find); (hs.items || []).forEach(x => S.items.includes(x) || S.items.push(x)); }
      if (hs.kind === 'LEARN') addSignalSilent(sg.learn); if (hs.note) addNote(G.rooms[i].id, hs.note);
      if (hs.reward) { hs.reward.items.forEach(x => S.items.includes(x) || S.items.push(x)); if (hs.reward.page && !S.pages.includes(hs.reward.page)) { S.pages.push(hs.reward.page); addSignalSilent(sg.filePage); } }
    });
    if (i === 3) { ['A', 'B', 'C', 'D'].forEach(x => S.heard.add(x)); S.done.add('all_tapes_heard'); }
  }
  if (n >= 2) S.done.add('book:flyer');
  $('#signal').textContent = S.signal; refreshHotspots();
}
const addSignalSilent = n => { S.signal += n; };

/* ---------- Room 7: the Static closes in on every wrong answer ---------- */
function threatHit(level) {
  const t = $('#threat'); t.dataset.level = level; t.classList.remove('hit'); void t.offsetWidth; t.classList.add('hit');
  $('.cap', t).textContent = G.threat[Math.min(level, G.threat.length) - 1]; sfx('burst'); if (level >= 2) setTimeout(() => sfx('hum'), 200);
  const f = $('#flicker'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); for (let i = 0; i < level + 1; i++) setTimeout(() => sfx('buzz'), i * 160);
}
