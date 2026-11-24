/* The Enigma Protocol. All text and numbers come from game.json; puzzle panels are in puzzles.js. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const Q = new URLSearchParams(location.search);
const DEBUG = Q.get('debug') === '1' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
let G, viewer, AC;
const S = { phase: 'boot', score: 0, hints: 0, time: 0, pauses: new Set(), done: new Set(), roomIdx: 0, ready: false,
  sound: true, narr: true, lastTap: Date.now(), cardClose: null, dragged: false, hsEls: {},
  awarded: new Set(), pages: [], items: [], clues: [], flags: {}, paid: {}, bank: {}, pstate: {}, panel: null, timers: [] };
const room = () => G.rooms[S.roomIdx];
const flag = k => S.flags[room().id + '.' + k];
const setFlag = k => { S.flags[room().id + '.' + k] = 1; };

/* ---------- validate ---------- */
function validate(g) {
  const err = [], kinds = ['FIND', 'LEARN', 'INSPECT', 'USE', 'PANEL', 'AUTO'];
  const lines = (ls, w) => (ls || []).forEach(l => { g.speakers[l.speaker] || err.push(w + ': unknown speaker ' + l.speaker);
    typeof l.pausesTimer === 'boolean' || err.push(w + ': pausesTimer missing'); });
  lines(g.dialogue.opening, 'opening'); lines(g.dialogue.idle, 'idle'); lines(g.ending, 'ending');
  g.rooms.forEach((r, ri) => {
    const ids = new Set(r.hotspots.map(h => h.id));
    if (ids.size !== r.hotspots.length) err.push(r.id + ': duplicate hotspot id');
    ['enter', 'discuss', 'right'].forEach(k => lines(r.dialogue[k], r.id + '.' + k));
    if (r.discussAt && !ids.has(r.discussAt)) err.push(r.id + ': bad discussAt');
    if (r.reward && r.reward.page >= g.casePages.length) err.push(r.id + ': bad page');
    if (r.reward && r.reward.item && !g.items[r.reward.item]) err.push(r.id + ': bad item');
    r.hotspots.forEach(h => {
      h.kind.forEach(k => kinds.includes(k) || err.push(h.id + ': bad kind ' + k));
      h.after.forEach(a => ids.has(a) || err.push(h.id + ': unknown after ' + a));
      lines(h.lines, h.id); lines(h.preLines, h.id);
      if (h.panel && (!g.puzzles[h.panel] || g.puzzles[h.panel].hotspot !== h.id)) err.push(h.id + ': bad panel ' + h.panel);
      if (h.useItem && !g.items[h.useItem]) err.push(h.id + ': bad useItem');
      if (h.sprite == null && false) err.push('');
    });
    const state = {};
    const visit = id => { if (state[id] === 2) return; if (state[id] === 1) { err.push('cycle at ' + id); return; }
      state[id] = 1; (r.hotspots.find(h => h.id === id)?.after || []).forEach(visit); state[id] = 2; };
    ids.forEach(visit);
    if (ri < g.rooms.length - 1 && r.hotspots.filter(h => h.kind.includes('AUTO')).length !== 1) err.push(r.id + ': needs exactly one exit');
  });
  Object.entries(g.puzzles).forEach(([id, p]) => {
    (p.hints || []).forEach(h => g.speakers[h.speaker] || err.push(id + ': hint speaker'));
    if (!p.hints && !p.questions?.every(q => q.hints)) err.push(id + ': no hint bank');
  });
  return err;
}

/* ---------- helpers ---------- */
const fmt = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const imgOk = url => new Promise(res => { const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = url; });
const cut = n => G.art.cutDir + n + '.png';
let toastT;
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT);
  toastT = setTimeout(() => el.hidden = true, G.config.toastSeconds * 1000); }
function addScore(n) { S.score = Math.max(0, S.score + n); $('#score').textContent = S.score; toast((n > 0 ? '+' : '') + n); if (n > 0) sfx('coin'); }
function award(key, n) { if (S.awarded.has(key)) return; S.awarded.add(key); addScore(n); }
function setPause(why, on) { on ? S.pauses.add(why) : S.pauses.delete(why); }
const running = () => S.phase === 'play' && S.pauses.size === 0;

/* ---------- sound (Web Audio, made in the browser) ---------- */
let BGM = null; // looping music, starts on the first tap; follows the sound switch
function bgm() {
  if (!BGM) { BGM = new Audio(G.config.bgm.file); BGM.loop = true; BGM.volume = G.config.bgm.volume; }
  if (S.sound) BGM.play().catch(() => {}); else BGM.pause();
}
function sfx(n) {
  if (!S.sound) return;
  try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  const t = AC.currentTime;
  const tone = (f, d, type = 'sine', v = .08, at = 0) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(v, t + at); g.gain.exponentialRampToValueAtTime(.0001, t + at + d); o.connect(g).connect(AC.destination); o.start(t + at); o.stop(t + at + d); };
  const m = { click: () => tone(520, .06, 'square', .03), page: () => tone(300, .12, 'triangle'), tap: () => tone(880, .08, 'square', .04),
    mirror: () => tone(660, .1, 'triangle'), coin: () => { tone(988, .1); tone(1318, .2, 'sine', .08, .08); },
    buzz: () => tone(110, .25, 'sawtooth', .07), strike: () => { tone(196, 1.2, 'sine', .12); tone(392, 1.2, 'sine', .05); } };
  m[n] && m[n]();
}

/* ---------- narration ---------- */
let VOICE = null; // the one recorded voice playing now (never two at once)
function narrate(text, speakerId, audioFile) {
  stopSpeech();
  if (!S.narr || !text) return;
  if (audioFile) { VOICE = new Audio(audioFile); VOICE.play().catch(() => {}); return; }
  if (!('speechSynthesis' in window)) return;
  const sp = G.speakers[speakerId] || G.speakers[G.mission.narrator];
  const u = new SpeechSynthesisUtterance(text); u.pitch = sp.pitch; u.rate = sp.rate; u.lang = 'en-GB';
  const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
  u.voice = vs.find(v => /male|daniel|george|david|mark|james|ryan/i.test(v.name) && !/female/i.test(v.name)) || vs[0] || null;
  speechSynthesis.speak(u);
}
const preload = f => { if (f) { const a = new Audio(); a.preload = 'auto'; a.src = f; } };
const holdVoice = () => { VOICE && VOICE.pause(); 'speechSynthesis' in window && speechSynthesis.cancel(); };
const stopSpeech = () => { VOICE && VOICE.pause(); VOICE = null; 'speechSynthesis' in window && speechSynthesis.cancel(); };

/* ---------- modals ---------- */
const emit = ev => { if (T.on) { T.got.add(ev); tutorialRefresh(); } };
const showModal = el => { el.hidden = false; };
function closeModal(m) {
  if (m.hidden) return;
  m.hidden = true; stopSpeech();
  if (m.id === 'card') { const f = S.cardClose; S.cardClose = null; f && f(); }
  if (m.id === 'book') emit('bookClose');
  if (m.id === 'panel') { S.timers.forEach(clearTimeout); S.timers = []; S.panel = null; $('#danger').style.opacity = 0; $('#panelBody').innerHTML = ''; }
}
function showCard(o) {
  S.cardClose = o.onClose || null;
  $('#cardTitle').textContent = o.title; $('#cardNote').textContent = o.note || '';
  const art = $('#cardArt'); art.hidden = true;
  if (o.art) { art.onload = () => art.hidden = false; art.onerror = () => art.hidden = true; art.src = o.art; }
  S.views = o.views || null; S.vi = 0; S.cardText = o.text || '';
  setView(); showModal($('#card'));
}
function setView() {
  const v = S.views, last = !v || S.vi >= v.length - 1;
  $('#cardText').textContent = v ? v[S.vi] : S.cardText;
  $('#cardTurn').hidden = last; $('#cardDone').hidden = !last;
}
function openBook(tab = 0) {
  closeModal($('#panel')); sfx('page');
  const box = $('#bookTabs'), body = $('#bookBody'), u = G.ui; box.innerHTML = ''; body.innerHTML = '';
  u.tabs.forEach((t, i) => { const b = document.createElement('button'); b.textContent = t; b.className = i === tab ? 'on' : ''; b.onclick = () => openBook(i); box.append(b); });
  const row = (title, text, imgName) => { const d = document.createElement('div'); d.className = 'brow';
    if (imgName) { const i = new Image(); i.src = cut(imgName); i.alt = ''; i.onerror = () => i.remove(); d.append(i); }
    const s = document.createElement('div'); const b = document.createElement('b'); b.textContent = title; s.append(b);
    if (text) { const p = document.createElement('p'); p.textContent = text; s.append(p); } d.append(s); body.append(d); };
  const empty = t => { const p = document.createElement('p'); p.textContent = t; body.append(p); };
  if (tab === 0) S.pages.length ? [...S.pages].sort((a, b) => a - b).forEach(i => row(`${u.page} ${i + 1}`, G.casePages[i])) : empty(u.noPagesYet);
  if (tab === 1) S.clues.length ? S.clues.forEach(c => row(c.title, c.text)) : empty(u.evidenceEmpty);
  if (tab === 2) S.items.length ? S.items.forEach(id => row(G.items[id].name, G.items[id].text, G.items[id].sprite)) : empty(u.itemsEmpty);
  if (tab === 3) { row(`${u.roomsDone}`, `${S.roomIdx} / ${G.rooms.length}`); row(u.guineas, String(S.score)); row(u.hintsLeft, String(S.hints)); row(u.pagesWord, `${S.pages.length} / ${G.casePages.length}`); }
  showModal($('#book')); emit('bookOpen');
}
function openPause() { holdVoice(); setPause('pause', true); $('#pmConfirm').hidden = true; showModal($('#pauseMenu')); emit('pauseOpen'); }
function resume() { VOICE && S.narr && VOICE.play().catch(() => {}); $('#pauseMenu').hidden = true; setPause('pause', false); emit('pauseResume'); }
function updatePauseLabels() {
  $('#pmSound').textContent = S.sound ? G.ui.soundOn : G.ui.soundOff;
  $('#pmNarr').textContent = S.narr ? G.ui.narrationOn : G.ui.narrationOff;
}

/* ---------- dialogue ---------- */
let D = null;
function playDialogue(lines, done) {
  if (!lines || !lines.length) return done && done();
  D = { lines, i: 0, done }; $('#dialogue').hidden = false; $('#app').classList.add('talking'); showLine();
}
async function showLine() {
  const l = D.lines[D.i], sp = G.speakers[l.speaker];
  $('#dName').textContent = sp.name; $('#dText').textContent = l.text;
  $('#dialogue').classList.toggle('story', l.pausesTimer); // story talk blocks taps behind it; clue lines let you keep playing
  setPause('dlg', l.pausesTimer);
  const b = $('#dBust'), mine = D; b.className = ''; b.style.backgroundImage = ''; b.textContent = '';
  const url = cut(sp.bust);
  if (await imgOk(url)) { if (D === mine) b.style.backgroundImage = `url(${url})`; } else { b.className = 'badge'; b.textContent = sp.badge; }
  narrate(l.text, l.speaker, l.audioFile); preload((D.lines[D.i + 1] || {}).audioFile);
}
function nextLine() { if (!D) return; D.i++; D.i >= D.lines.length ? endDialogue() : showLine(); }
function endDialogue() {
  const f = D.done; D = null; stopSpeech(); setPause('dlg', false);
  $('#dialogue').hidden = true; $('#app').classList.remove('talking'); f && f();
}

/* ---------- panorama + hotspots ---------- */
async function loadRoom(r) {
  S.ready = false; S.hsEls = {};
  if (viewer) { try { viewer.destroy(); } catch (e) { /* already gone */ } viewer = null; }
  $('#pano').innerHTML = '';
  $('#stage').style.setProperty('--fb1', r.fallback[0]); $('#stage').style.setProperty('--fb2', r.fallback[1]);
  document.documentElement.style.setProperty('--accent', r.accent);
  if (!(await imgOk(r.panorama))) { $('#pano').hidden = true; return; } // no art: the gradient room stays
  $('#pano').hidden = false;
  const c = G.config.panorama;
  viewer = pannellum.viewer('pano', { type: 'equirectangular', panorama: r.panorama, autoLoad: true, showControls: false,
    hfov: c.hfov, minHfov: c.minHfov, maxHfov: c.maxHfov, pitch: c.startPitch, yaw: c.startYaw, compass: false, keyboardZoom: false, mouseZoom: false });
  viewer.on('error', () => { $('#pano').hidden = true; });
  viewer.on('load', () => { S.ready = true; refreshHotspots(); });
}
const isExit = h => h.kind.includes('AUTO');
const visible = h => !S.done.has(h.id) && h.after.every(a => S.done.has(a)) && (!isExit(h) || flag('exit'));
const unlocked = h => h.after.every(a => S.done.has(a));
function refreshHotspots() {
  if (!viewer || !S.ready) return;
  room().hotspots.forEach(h => { try { viewer.removeHotSpot(h.id); } catch (e) { /* not added */ } });
  S.hsEls = {};
  if (S.phase !== 'play') return;
  room().hotspots.filter(visible).forEach(h => viewer.addHotSpot({ id: h.id, pitch: h.pitch, yaw: h.yaw, type: 'custom',
    createTooltipFunc: el => {
      const s = document.createElement('span'), k = h.kind;
      s.className = 'hs ' + (isExit(h) ? 'exit' : k.includes('PANEL') ? 'panel' : k.includes('FIND') ? 'find' : k.includes('LEARN') ? 'learn' : 'inspect');
      if (h.sprite && k.includes('FIND')) { s.classList.add('sprite'); s.style.backgroundImage = `url(${cut(h.sprite)})`; }
      if (isExit(h)) s.textContent = '→';
      s.setAttribute('role', 'button'); s.setAttribute('aria-label', h.label); el.append(s); S.hsEls[h.id] = s; },
    clickHandlerFunc: () => tapHotspot(h) }));
}

/* ---------- tapping things ---------- */
function tapHotspot(h) {
  if (S.phase !== 'play' || !$('#panel').hidden || !$('#card').hidden || D) return;
  if (isExit(h)) return useExit(h);
  if (h.kind.includes('PANEL')) {
    if (h.preLines && !S.flags[h.id + '.pre']) { S.flags[h.id + '.pre'] = 1; return playDialogue(h.preLines, () => openPanel(h)); }
    return openPanel(h);
  }
  const p = G.config.points, find = h.kind.includes('FIND'), learn = h.kind.includes('LEARN'), c = h.card;
  S.done.add(h.id);
  const body = c.views ? c.views[c.views.length - 1] : c.text;
  if (find) { award('f:' + h.id, p.find); S.clues.push({ title: (h.tag ? h.tag + '  ' : '') + c.title, text: body }); }
  else if (learn) { if (!h.noPoints) award('l:' + h.id, p.learn); S.clues.push({ title: c.title, text: body }); }
  refreshHotspots();
  showCard({ title: c.title, text: c.text, views: c.views, art: h.sprite && cut(h.sprite), note: find ? G.ui.itemAdded : learn ? G.ui.savedToNotes : '',
    onClose: () => playDialogue(h.lines, progress) });
}

/* what happens next, once a card or line has finished: discuss talk, final narration, reward */
function progress() {
  const r = room(), dh = r.discussAt && r.hotspots.find(h => h.id === r.discussAt);
  if (dh && unlocked(dh) && !S.done.has(dh.id) && !flag('discuss') && r.dialogue.discuss.length) { setFlag('discuss'); return playDialogue(r.dialogue.discuss, progress); }
  const ex = r.hotspots.find(isExit);
  if (ex && ex.after.every(a => S.done.has(a)) && !flag('right')) { setFlag('right'); return playDialogue(r.dialogue.right, reward); }
  refreshHotspots();
}
function reward() { // Case Page, item, exit: only after the narration has finished or been skipped
  const r = room(), rw = r.reward, p = G.config.points;
  const open = () => { setFlag('exit'); toast(G.ui.newWay); refreshHotspots(); };
  const item = () => {
    if (!rw.item) return open();
    const it = G.items[rw.item]; if (!S.items.includes(rw.item)) S.items.push(rw.item);
    showCard({ title: it.name, text: it.text, art: cut(it.sprite), note: G.ui.itemAdded, onClose: open });
  };
  if (!S.pages.includes(rw.page)) S.pages.push(rw.page);
  award('page:' + rw.page, p.casePage);
  showCard({ title: `${G.ui.casePage} ${rw.page + 1}`, text: G.casePages[rw.page], note: G.ui.casePageSaved, onClose: item });
}
function useExit(h) {
  if (h.useItem) toast(G.ui.itemUsed + G.items[h.useItem].name);
  goRoom(S.roomIdx + 1);
}
async function goRoom(i) {
  const f = $('#fade'); f.classList.add('on'); await new Promise(r => setTimeout(r, 450));
  S.roomIdx = i; await loadRoom(room()); f.classList.remove('on'); enterRoom();
}
function enterRoom() {
  const r = room(); $('#objective').textContent = r.objective; refreshHotspots();
  showCard({ title: r.objectiveCard.title, text: r.objectiveCard.text, onClose: () => playDialogue(r.dialogue.enter, progress) });
}

/* ---------- puzzles ---------- */
function openPanel(h) {
  const P = G.puzzles[h.panel], st = (S.pstate[P.id] = S.pstate[P.id] || {});
  S.panel = { h, P }; closeModal($('#book'));
  $('#panelTitle').textContent = P.title; $('#panelBody').innerHTML = '';
  const api = { ui: G.ui, cut, st, cur: null, lockMs: G.config.penalties.finalLockoutSeconds * 1000, sfx,
    later: (fn, ms) => S.timers.push(setTimeout(() => S.panel && fn(), ms)),
    stop: () => { S.timers.forEach(clearTimeout); S.timers = []; },
    wrong: qid => wrong(P, qid), part: qid => award('p:' + qid, G.config.points[P.points]), finished: () => finished(P) };
  S.panel.api = api; Puzzles.mount(P.type, $('#panelBody'), P, api);
  $('#panelHint').disabled = S.hints <= 0; showModal($('#panel'));
}
function bankLine(P, qid, key) {
  const q = qid && P.questions && P.questions.find(x => x.id === qid), bank = (q && q.hints) || P.hints, i = S.bank[key] || 0;
  S.bank[key] = i + 1; playDialogue([{ ...bank[Math.min(i, bank.length - 1)], pausesTimer: false }]);
}
function wrong(P, qid) {
  const key = qid || P.id, pen = G.config.penalties; sfx('buzz');
  const cost = Math.min(pen.wrongAnswer, pen.wrongCapPerPuzzle - (S.paid[key] || 0));
  if (cost > 0) { S.paid[key] = (S.paid[key] || 0) + cost; addScore(-cost); }
  if (!P.final) return bankLine(P, qid, key);
  const n = screenThreat(P);
  playDialogue([P.threat[n - 1]], n >= P.threat.length ? caught : null);
}
function caught() {
  endScreen(G.ui.caughtTitle, [G.ui.caughtText, `${G.ui.guineas}: ${S.score}`], [[G.ui.tryAgain, () => location.reload()]]);
}
function screenThreat(P) {
  S.hits = S.hits || {}; const lv = Math.min(3, S.hits[P.id] = (S.hits[P.id] || 0) + 1), d = $('#danger'), a = $('#app');
  [d, a].forEach(n => n.style.setProperty('--lv', lv)); d.classList.remove('pulse'); a.classList.remove('hit'); void d.offsetWidth;
  d.classList.add('pulse'); a.classList.add('hit'); d.style.opacity = .12 * lv;
  return S.hits[P.id];
}
function finished(P) {
  if (!P.perQuestion && P.points) award('p:' + P.id, G.config.points[P.points]);
  $('#danger').style.opacity = 0; S.done.add(P.hotspot); closeModal($('#panel')); sfx('page');
  if (P.final) return playDialogue(room().dialogue.right, () => playDialogue(G.ending, win));
  refreshHotspots(); progress();
}
// A hint needs a hint left AND enough Guineas to pay for it (addScore clamps at 0, so it cannot be checked after).
function canBuyHint() {
  if (S.hints <= 0) { toast(G.ui.noHints); return false; }
  if (S.score < G.config.penalties.hint) {
    toast(G.ui.notEnoughCurrency.replace('{currency}', G.ui.guineas).replace('{cost}', G.config.penalties.hint)); return false;
  }
  return true;
}
function panelHint() {
  if (!S.panel || !canBuyHint()) return;
  const { P, api } = S.panel; S.hints--; $('#hintCount').textContent = S.hints; addScore(-G.config.penalties.hint);
  $('#panelHint').disabled = S.hints <= 0; $('#btnHint').disabled = S.hints <= 0;
  bankLine(P, api.cur, api.cur || P.id);
}
function useHint() {
  if (S.phase !== 'play' || !canBuyHint()) return;
  S.hints--; $('#hintCount').textContent = S.hints; addScore(-G.config.penalties.hint);
  const h = room().hotspots.find(visible), el = h && S.hsEls[h.id];
  if (el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 3000); }
  $('#btnHint').disabled = S.hints <= 0;
}

/* ---------- end screens ---------- */
function endScreen(title, lines, btns) {
  S.phase = 'over'; D && endDialogue(); $$('.modal').forEach(m => m.id !== 'book' && closeModal(m)); stopSpeech(); sfx('strike');
  $('#endTitle').textContent = title; const b = $('#endBody'); b.innerHTML = '';
  lines.forEach(t => { const p = document.createElement('p'); p.textContent = t; b.append(p); });
  const box = $('#endBtns'); box.innerHTML = '';
  btns.forEach(([t, f]) => { const x = document.createElement('button'); x.className = 'plate'; x.textContent = t; x.onclick = f; box.append(x); });
  $('#end').hidden = false;
}
function win() {
  const bonus = Math.floor(S.time / G.config.points.timeBonusPerSeconds); if (bonus) addScore(bonus);
  endScreen(G.ui.caseClosed, [G.ui.titleCard, `${G.ui.finalScore}: ${S.score} ${G.ui.guineas}`, `${G.ui.timeLeft}: ${fmt(S.time)}`],
    [[G.ui.playAgain, () => location.reload()]]);
}
function timeUp() {
  endScreen(G.ui.timeUp, [G.ui.timeUpText, `${G.ui.roomReached}: ${room().name}`, `${G.ui.guineas}: ${S.score}`], [[G.ui.tryAgain, () => location.reload()]]);
}
function restartRoom() {
  const r = room(); r.hotspots.forEach(h => S.done.delete(h.id));
  ['discuss', 'right', 'exit'].forEach(k => delete S.flags[r.id + '.' + k]);
  Object.values(G.puzzles).filter(p => r.hotspots.some(h => h.id === p.hotspot)).forEach(p => { delete S.pstate[p.id]; if (S.hits) delete S.hits[p.id]; });
  resume(); closeModal($('#panel')); $('#card').hidden = true; refreshHotspots();
}

/* ---------- tutorial ---------- */
const T = { on: false, i: 0, part: 0, got: new Set() };
const TARGETS = { view: ['#stage'], sampleObject: ['#sampleObject'], sampleGlow: ['#sampleGlow', '#sampleItem'], casebook: ['#btnBook'],
  pause: ['#btnPause'], purse: ['#purse'], hints: ['#hints'], timer: ['#timer'] };
function spotOn(key) {
  const rs = TARGETS[key].map(s => $(s).getBoundingClientRect()), sp = $('#spot'), pad = 8;
  let l, t, r, b;
  if (key === 'view') { l = innerWidth * .15; r = innerWidth * .85; t = innerHeight * .25; b = innerHeight * .6; }
  else { l = Math.min(...rs.map(x => x.left)); t = Math.min(...rs.map(x => x.top)); r = Math.max(...rs.map(x => x.right)); b = Math.max(...rs.map(x => x.bottom)); }
  Object.assign(sp.style, { left: l - pad + 'px', top: t - pad + 'px', width: r - l + pad * 2 + 'px', height: b - t + pad * 2 + 'px' });
}
function tutorialRefresh() {
  const st = G.tutorial.steps[T.i]; if (!st) return;
  const multi = st.parts, part = multi && multi[T.part];
  $('#tText').textContent = multi ? part.text : st.text; $('#tAsk').textContent = multi ? '' : st.ask;
  $('#tNext').disabled = !(multi || st.needs.every(n => T.got.has(n))); $('#tNext').style.opacity = $('#tNext').disabled ? .4 : 1;
  $('#tSamples').hidden = !(st.id === 'inspect' || st.id === 'glow');
  spotOn(multi ? part.target : st.target);
}
function tutorialStart() {
  const sm = G.tutorial.sample;
  $('#sampleObject').textContent = sm.objectLabel; $('#sampleGlow').textContent = sm.glowLabel; $('#sampleItem').textContent = sm.itemLabel;
  $('#hud').hidden = $('#bar').hidden = false; $('#timer').textContent = fmt(S.time);
  Object.assign(T, { on: true, i: 0, part: 0, got: new Set() });
  $('#tutorial').hidden = false; tutorialRefresh();
}
function tutorialNext() {
  const st = G.tutorial.steps[T.i];
  if (st.parts && T.part < st.parts.length - 1) { T.part++; return tutorialRefresh(); }
  if (T.i < G.tutorial.steps.length - 1) { T.i++; T.part = 0; T.got.clear(); return tutorialRefresh(); }
  tutorialEnd();
}
function tutorialEnd() {
  T.on = false; $('#tutorial').hidden = true;
  $$('.modal').forEach(m => m.id !== 'pauseMenu' && (m.hidden = true));
  playDialogue(G.dialogue.opening, startPlay);
}

/* ---------- flow ---------- */
function startPlay() {
  const st = $('#stage'); st.classList.add('sharpen'); st.classList.remove('blurred');
  S.phase = 'play'; S.lastTap = Date.now(); $('#dragHand').hidden = S.dragged; enterRoom();
}
function tick(dt) {
  if (!running()) return;
  S.time -= dt; $('#timer').textContent = fmt(S.time); $('#timer').classList.toggle('low', S.time <= 60);
  if (S.time <= 0) timeUp();
}

async function init() {
  Object.entries(G.puzzles).forEach(([id, p]) => { p.id = id; });
  const art = (el, url) => imgOk(url).then(ok => ok && el.style.setProperty('--art', `url(${url})`));
  art($('#start'), G.art.title); art($('#mission'), G.art.briefing);
  $$('[data-t]').forEach(el => el.textContent = G.ui[el.dataset.t]);
  $('#startTitle').textContent = G.title; $('#missionHeading').textContent = G.mission.heading;
  G.mission.paragraphs.forEach(t => { const p = document.createElement('p'); p.textContent = t; $('#missionBody').appendChild(p); });
  $('#btnBegin').textContent = G.mission.button; $('#panelHint').textContent = G.ui.hintInPanel;
  Object.entries(G.art.icons).forEach(([k, f]) => imgOk(cut(f)).then(ok => ok && $$(`[data-ico=${k}]`).forEach(e => { e.style.backgroundImage = `url(${cut(f)})`; e.classList.add('has-img'); })));
  const b = G.config.blur, st = $('#stage');
  st.style.setProperty('--blur', b.px + 'px'); st.style.setProperty('--zoom', b.zoomFrom); st.style.setProperty('--sharpen', b.sharpenSeconds + 's');
  document.documentElement.style.setProperty('--tap', G.config.minTapPx + 'px');
  S.time = G.config.timerSeconds; S.hints = G.config.hintsMax; $('#hintCount').textContent = S.hints; $('#timer').textContent = fmt(S.time);
  updatePauseLabels();
  if (DEBUG && Q.get('room')) S.roomIdx = Math.max(0, +Q.get('room') - 1);
  await loadRoom(room());

  $('#btnStart').onclick = () => { bgm();
    if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance('')); // unlock speech on the first tap
    $('#start').hidden = true; $('#mission').hidden = false; S.phase = 'mission';
    narrate([G.mission.heading, ...G.mission.paragraphs].join('. '), G.mission.narrator, G.mission.audioFile);
  };
  $('#btnBegin').onclick = () => { stopSpeech(); $('#mission').hidden = true; S.phase = 'tutorial'; $('#stage').classList.add('blurred'); tutorialStart(); };
  $('#tNext').onclick = tutorialNext; $('#tSkip').onclick = tutorialEnd;
  const sm = G.tutorial.sample;
  $('#sampleObject').onclick = () => { showCard({ title: sm.objectLabel, text: sm.objectCard, onClose: () => emit('sampleClose') }); emit('sampleOpen'); };
  $('#sampleGlow').onclick = () => { showCard({ title: sm.glowLabel, text: sm.glowCard, note: G.ui.savedToNotes }); $('#sampleGlow').classList.add('done'); emit('sampleGlow'); };
  $('#sampleItem').onclick = () => { showCard({ title: sm.itemLabel, text: sm.itemCard }); $('#sampleItem').classList.add('done'); emit('sampleItem'); };
  $('#dialogue').onclick = e => { if (!e.target.closest('button')) nextLine(); };
  $('#dSkip').onclick = e => { e.stopPropagation(); endDialogue(); };
  $('#cardTurn').onclick = () => { S.vi++; setView(); sfx('page'); };
  $('#btnBook').onclick = () => openBook(0); $('#btnPause').onclick = openPause; $('#btnHint').onclick = useHint; $('#panelHint').onclick = panelHint;
  $$('[data-pause]').forEach(b => b.onclick = openPause);
  $$('[data-close]').forEach(b => b.onclick = () => closeModal(b.closest('.modal')));
  $$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m && m.id !== 'pauseMenu') closeModal(m); }));
  $('#pmResume').onclick = resume;
  $('#pmSound').onclick = () => { S.sound = !S.sound; bgm(); updatePauseLabels(); };
  $('#pmNarr').onclick = () => { S.narr = !S.narr; if (!S.narr) stopSpeech(); updatePauseLabels(); };
  $('#pmRestart').onclick = restartRoom;
  $('#pmQuit').onclick = () => $('#pmConfirm').hidden = false; $('#pmNo').onclick = () => $('#pmConfirm').hidden = true; $('#pmYes').onclick = () => location.reload();
  addEventListener('keydown', e => { if (e.key !== 'Escape' || S.phase === 'mission') return;
    const m = $$('.modal').reverse().find(x => !x.hidden && x.id !== 'pauseMenu'); m && closeModal(m); });
  addEventListener('resize', () => T.on && tutorialRefresh());
  addEventListener('pointerdown', e => { S.lastTap = Date.now(); if (e.target.closest && e.target.closest('button')) sfx('click'); }, true);
  let sx, sy; const pano = $('#pano');
  pano.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
  pano.addEventListener('pointermove', e => { if (sx != null && Math.hypot(e.clientX - sx, e.clientY - sy) > 10 && !S.dragged) { S.dragged = true; $('#dragHand').hidden = true; emit('drag'); } });
  pano.addEventListener('pointerup', () => sx = null);
  if (DEBUG) pano.addEventListener('click', e => { if (!viewer) return; const [p, y] = viewer.mouseEventToCoords(e);
    const t = `yaw ${y.toFixed(1)}  pitch ${p.toFixed(1)}`; console.log(t); $('#dbg').textContent = t; $('#dbg').hidden = false; });
  let last = performance.now();
  setInterval(() => { const n = performance.now(); tick((n - last) / 1000); last = n; }, 250);
  setInterval(() => { // idle prompt, only when nothing else is open
    const busy = $$('.modal').some(m => !m.hidden) || !$('#dialogue').hidden;
    if (S.phase === 'play' && !busy && Date.now() - S.lastTap > G.config.idleSeconds * 1000) { S.lastTap = Date.now(); playDialogue(G.dialogue.idle); } }, 1000);

  if (DEBUG && Q.get('skip') === '1') { // ?debug=1&skip=1&room=N jumps straight into a room
    $('#start').hidden = true; $('#hud').hidden = $('#bar').hidden = false; S.phase = 'play'; $('#dragHand').hidden = true; enterRoom();
  }
}

fetch('game.json').then(r => r.json()).then(g => {
  G = g; const err = validate(G);
  if (err.length) { console.error('game.json invalid:\n' + err.join('\n')); if (DEBUG) { $('#dbg').textContent = err.join('\n'); $('#dbg').hidden = false; } }
  return init();
}).catch(e => console.error(e));
if (DEBUG) window.__enigma = { S, validate: () => validate(G), tap: id => tapHotspot(room().hotspots.find(h => h.id === id)), room };
})();
