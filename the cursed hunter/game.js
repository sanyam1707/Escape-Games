/* The Cursed Hunter: vanilla JS, Pannellum, everything driven by game.json. */
(function () {
'use strict';
const Q = new URLSearchParams(location.search);
const DEBUG = Q.get('debug') === '1' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const $ = (s) => document.querySelector(s);
const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (a) => ((a + 540) % 360) - 180;
let D, S, V = null, MAN = new Set();
const T = (k, v) => { let s = k.split('.').reduce((o, p) => (o ? o[p] : undefined), D.ui); if (s == null) return k; for (const x in v || {}) s = s.replace('{' + x + '}', v[x]); return s; };
const room = () => D.rooms[S.room];
const hsById = (id) => D.rooms.flatMap((r) => r.hotspots.concat(exitHS(r) || [])).find((x) => x.id === id);
function exitHS(r) { const i = D.rooms.indexOf(r), n = D.rooms[i + 1]; return r.exit && n ? { id: 'exit_' + r.id, kind: 'EXIT', name: T('nextRoom', { room: n.name }), yaw: r.exit.yaw, pitch: r.exit.pitch, icon: '➜', after: [] } : null; }

/* ---------- state ---------- */
function newState() {
  return { phase: 'title', room: 0, crowns: 0, hints: D.config.hints, time: D.config.timerSeconds, items: {}, order: [], held: null, clues: [], notes: [], pages: {},
    done: {}, narr: {}, complete: {}, discussed: {}, hintUsed: {}, wrongN: {}, wrongPaid: {}, inspect: {}, menu: false, lock: 0,
    torch: { found: [] }, symSeq: [], vials: { a: 0, b: 0 }, lens: { seen: [], pos: {}, placed: [] }, venn: {}, map: { a: '', b: '', sel: '' }, tangle: null,
    align: null, panel: null, entered: {}, tapAt: Date.now(), ended: false };
}

/* ---------- assets with fallbacks ---------- */
const has = (n) => MAN.has(n);
function art(name, glyph, cls) {
  return has(name) ? `<img src="assets/cut/${name}.png" alt="" draggable="false"${cls ? ` class="${cls}"` : ''}>` : `<span>${glyph || '✦'}</span>`;
}
function loadImg(url) { return new Promise((res) => { const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = url; }); }
function iconHTML(n, g) { return has(n) ? `<img src="assets/cut/${n}.png" alt="">` : g; }

/* ---------- audio: narrate(), bgm ---------- */
let voices = [], bgm = null, curUtter = null, audioOn = false;
const PREF = Object.assign({ music: true, sfx: true, voice: true }, (() => { try { return JSON.parse(localStorage.getItem('ch_prefs') || '{}'); } catch (e) { return {}; } })());
const savePrefs = () => { try { localStorage.setItem('ch_prefs', JSON.stringify(PREF)); } catch (e) {} };
const SFXC = {};
/* sfx(name): one short sound from assets/audio/sfx. Silent until the first tap, and when sound effects are off. */
function sfx(name, vol) {
  if (!audioOn || !PREF.sfx) return;
  try { const a = SFXC[name] || (SFXC[name] = new Audio('assets/audio/sfx/' + name + '.mp3')); const p = a.cloneNode(); p.volume = vol || .55; p.play().catch(() => {}); } catch (e) {}
}
function loadVoices() { voices = speechSynthesis ? speechSynthesis.getVoices() : []; }
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
function pickVoice(g) {
  const en = voices.filter((v) => /^en/i.test(v.lang)); const pool = en.length ? en : voices;
  const re = g === 'f' ? /zira|susan|female|samantha|hazel|aria|jenny|karen|victoria|moira|fiona/i : /david|mark|daniel|male|george|guy|james|alex|fred|ryan|thomas|oliver/i;
  return pool.find((v) => re.test(v.name)) || pool[0] || null;
}
let vAudio = null; const VCACHE = {};
function stopSpeech() { try { speechSynthesis.cancel(); } catch (e) {} curUtter = null; if (vAudio) { vAudio.onended = vAudio.onerror = null; vAudio.pause(); vAudio = null; } }
function voicePause() { try { speechSynthesis.pause(); } catch (e) {} if (vAudio) vAudio.pause(); }
function voiceResume() { if (!PREF.voice) return; try { speechSynthesis.resume(); } catch (e) {} if (vAudio && vAudio.paused) vAudio.play().catch(() => {}); }
function preloadVoice(f) { if (f && !VCACHE[f]) { const a = new Audio(f); a.preload = 'auto'; VCACHE[f] = a; } }
/* narrate(textOrKey): the one voice entry point. Key = a line id in D.voiceKeys, otherwise it is the text. */
function speak(text, who) {                                    // browser voice, only for lines with no recorded file
  if (!('speechSynthesis' in window)) return;
  const v = D.voices[who || 'narrator'] || D.voices.narrator;
  const u = new SpeechSynthesisUtterance(String(text).replace(/<[^>]+>/g, ''));
  u.rate = v.rate; u.pitch = v.pitch; const vo = pickVoice(v.gender); if (vo) u.voice = vo; u.lang = 'en-US';
  curUtter = u; try { speechSynthesis.speak(u); } catch (e) {}
}
function narrate(textOrKey, who, audioFile) {
  if (!S || !PREF.voice || S.menu) return;
  stopSpeech();                                                  // one voice at a time
  if (audioFile) {
    const a = VCACHE[audioFile] || (VCACHE[audioFile] = new Audio(audioFile)); a.currentTime = 0; vAudio = a;
    a.onerror = () => { if (vAudio === a) { vAudio = null; speak(textOrKey, who); } };
    a.onended = () => { if (vAudio === a) vAudio = null; };
    a.play().catch(() => { if (vAudio === a) { vAudio = null; speak(textOrKey, who); } });
    return;
  }
  speak(textOrKey, who);
}
function startBgm() {
  audioOn = true; if (bgm) return;
  const a = new Audio('assets/audio/bgm.mp3'); a.loop = true; a.volume = .15; bgm = a; applySound();
}
function applySound() {
  if (bgm) { if (PREF.music) bgm.play().catch(() => {}); else bgm.pause(); }
  if (!PREF.voice) stopSpeech();
}

/* ---------- toasts, crowns ---------- */
function toast(msg, cls) { const t = mk('div', 'toast ' + (cls || ''), msg); $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3300); }
function addCrowns(n) {
  const before = S.crowns; S.crowns = Math.max(0, S.crowns + n); const d = S.crowns - before;
  if (d) { toast(d > 0 ? T('plusToast', { n: d }) : T('wrongToast', { n: -d }), d > 0 ? 'good' : 'bad'); const c = $('#crowns'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
  renderHUD();
}

/* ---------- dialogue (queue; promise resolves when the sequence is finished or skipped) ---------- */
const DLG = { q: [], cur: null, line: null, onTap: null };
function say(lines, id) {
  return new Promise((resolve) => { DLG.q.push({ lines: lines.slice(), i: 0, resolve, id: id || '' }); if (!DLG.cur) nextSeq(); });
}
function nextSeq() {
  DLG.cur = DLG.q.shift() || null;
  if (!DLG.cur) { $('#dlg').hidden = true; document.body.classList.remove('dlg-open'); DLG.line = null; stopSpeech(); return; }
  showLine();
}
function bustHTML(who, mood) {
  const names = [who + '_' + mood, ...[...MAN].filter((n) => n.startsWith(who + '_'))];
  const n = names.find((x) => has(x));
  if (n) return `<img src="assets/cut/${n}.png" alt="" style="${who === 'torin' ? 'transform:scaleX(-1)' : ''}">`;
  const v = D.voices[who]; return `<div class="fb" style="background:${v.color}">${v.initial}</div>`;
}
function showLine() {
  const s = DLG.cur, ln = s.lines[s.i]; DLG.line = ln;
  const v = D.voices[ln.who] || D.voices.narrator, box = $('.dlg-in');
  $('#dlg').hidden = false; document.body.classList.add('dlg-open');
  box.classList.toggle('nobust', ln.who === 'narrator'); box.classList.toggle('right', ln.who !== 'torin');
  box.style.animation = 'none'; void box.offsetWidth; box.style.animation = '';
  $('#dBust').innerHTML = ln.who === 'narrator' ? '' : bustHTML(ln.who, ln.mood || 'neutral');
  $('#dName').textContent = v.name; $('#dLine').textContent = ln.text; $('#dTap').textContent = '▸ ' + T('tapContinue');
  narrate(ln.text, ln.who, ln.audioFile); preloadVoice((s.lines[s.i + 1] || {}).audioFile); renderHUD();
}
function advance() {
  const s = DLG.cur; if (!s) return; stopSpeech(); s.i++;
  if (s.i >= s.lines.length) finishSeq(s); else showLine();
}
function finishSeq(s) {
  s.resolve(); document.dispatchEvent(new CustomEvent('dialogue-finished', { detail: { id: s.id } })); nextSeq(); renderHUD();
}
function skipSeq() { const s = DLG.cur; if (!s) return; stopSpeech(); finishSeq(s); }

/* ---------- timer ---------- */
const running = () => S && S.phase === 'play' && !S.menu && !(DLG.cur && DLG.line && DLG.line.pausesTimer);
let lastTick = performance.now();
setInterval(() => {
  const now = performance.now(), dt = (now - lastTick) / 1000; lastTick = now;
  if (!S) return;
  if (running()) { S.time = Math.max(0, S.time - dt); if (S.time <= 0) timeUp(); }
  renderTimer();
  if (S.phase === 'play' && !S.menu && !DLG.cur && !S.panel && !$('#cardLayer').firstChild && !$('#bookLayer').firstChild && !S.align && Date.now() - S.tapAt > D.config.idleSeconds * 1000) { S.tapAt = Date.now(); say([D.idle]); }
}, 200);
function renderTimer() {
  if (!S) return;
  const t = Math.ceil(S.time), m = Math.floor(t / 60), s = t % 60; $('#clock').textContent = `${m}:${String(s).padStart(2, '0')}`;
  $('#timer').classList.toggle('low', S.time < 60 && S.phase === 'play'); $('#timer').classList.toggle('paused', S.phase === 'play' && !running());
}

/* ---------- HUD ---------- */
function curGoal() {
  const r = room(); for (const h of r.hotspots) { if (S.done[h.id]) continue; if (h.after.every((a) => a === 'narration' || S.done[a])) return h.goal; }
  return S.complete[r.id] ? T('wayOut') : '';
}
function renderHUD() {
  if (!S) return;
  $('#crownN').textContent = S.crowns; $('#hintN').textContent = S.hints; $('#bHint').disabled = S.hints <= 0;
  const r = room(); $('#roomName').textContent = r.name; $('#goalText').textContent = curGoal();
  const finds = r.hotspots.filter((h) => h.kind === 'FIND'), fs = $('#findStrip');
  fs.innerHTML = `<div class="cap">${T('findStrip')}</div>` + finds.map((h) => `<div class="fi ${S.done[h.id] ? 'got' : ''}">${S.done[h.id] ? art(h.sprite, h.icon) : '?'}</div>`).join('');
  const hd = $('#held'); if (S.held && S.items[S.held]) { hd.hidden = false; hd.innerHTML = `<span>${T('holding')}: <b>${S.items[S.held].name}</b></span><button class="iron">${T('drop')}</button>`; hd.querySelector('button').onclick = () => { S.held = null; renderHUD(); }; } else hd.hidden = true;
  document.querySelectorAll('.phead .badge').forEach((b) => (b.textContent = S.hints));
}
function showHUD(on) { $('#hud').hidden = !on; }

/* ---------- overlays: cards ---------- */
const cardQ = [];
function card(o) { // o: {tag,title,pic,body,chips[],saved,buttons[],closeLabel}
  return new Promise((resolve) => { cardQ.push({ o, resolve }); if (!$('#cardLayer').firstChild) nextCard(); });
}
function nextCard() {
  const it = cardQ.shift(); if (!it) { renderHUD(); return; }
  const o = it.o, wrap = mk('div', 'card-wrap'), c = mk('div', 'card');
  const close = (val) => { wrap.remove(); stopSpeech(); document.removeEventListener('keydown', esc); it.resolve(val); nextCard(); };
  const esc = (e) => { if (e.key === 'Escape' && $('#cardLayer').lastChild === wrap && !$('#modalLayer').firstChild) close(); };
  c.innerHTML = `<button class="x" aria-label="${T('close')}">✕</button><div class="tag">${o.tag || ''}</div><h3>${o.title || ''}</h3>` +
    (o.pic ? `<div class="pic">${o.pic}</div>` : '') + (o.body ? `<p>${o.body}</p>` : '') +
    (o.chips && o.chips.length ? `<div>${o.chips.map((x) => `<span class="gain">${x}</span>`).join('')}</div>` : '') + (o.saved ? `<p class="saved">${o.saved}</p>` : '') + '<div class="row"></div>';
  c.querySelector('.x').onclick = () => close();
  wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) close(); });
  const row = c.querySelector('.row');
  (o.buttons || []).forEach((b) => { const bt = mk('button', b.cls || 'seal', b.label); bt.onclick = () => { if (b.keep) b.fn(c, close); else { close(b.value); if (b.fn) b.fn(); } }; row.appendChild(bt); });
  if (!(o.buttons || []).length) { const bt = mk('button', 'seal', T('close')); bt.onclick = () => close(); row.appendChild(bt); }
  wrap.appendChild(c); $('#cardLayer').appendChild(wrap); document.addEventListener('keydown', esc); o.onShow && o.onShow(c, close);
  if (o.narrate) narrate(o.narrate, 'narrator');
}

function modal(inner, onClose) {
  const m = mk('div', 'modal'); const menu = mk('div', 'menu'); menu.innerHTML = inner; m.appendChild(menu); $('#modalLayer').appendChild(m); return { m, menu, close() { m.remove(); onClose && onClose(); } };
}

/* ---------- casebook ---------- */
let bookTab = 'clues';
function openBook(tab) {
  if ($('#bookLayer').firstChild) return;
  bookTab = tab || bookTab; const b = mk('div', 'book'); const inn = mk('div', 'bookin'); b.appendChild(inn);
  const close = () => { b.remove(); document.removeEventListener('keydown', esc); renderHUD(); };
  const esc = (e) => { if (e.key === 'Escape' && !$('#modalLayer').firstChild && !$('#cardLayer').firstChild) close(); };
  const draw = () => {
    inn.innerHTML = `<div class="bhead"><h2>${T('casebook')}</h2><button class="iron x" aria-label="${T('close')}">✕</button></div><div class="tabs">` +
      ['clues', 'items', 'pages', 'notes'].map((k) => `<button data-k="${k}" class="${k === bookTab ? 'on' : ''}">${T('tabs.' + k)}</button>`).join('') + '</div><div class="bcontent"></div>';
    inn.querySelector('.x').onclick = close; inn.querySelectorAll('.tabs button').forEach((t) => (t.onclick = () => { bookTab = t.dataset.k; draw(); }));
    const c = inn.querySelector('.bcontent');
    if (bookTab === 'clues') c.innerHTML = S.clues.length ? S.clues.map((x) => `<div class="entry"><small>${x.room}</small>${x.text}</div>`).join('') : `<div class="empty">${T('emptyClues')}</div>`;
    if (bookTab === 'notes') c.innerHTML = S.notes.length ? S.notes.map((x) => `<div class="entry"><small>${x.room}</small>${x.text}</div>`).join('') : `<div class="empty">${T('emptyNotes')}</div>`;
    if (bookTab === 'items') {
      const its = S.order.map((id) => S.items[id]).filter((i) => !i.page);
      c.innerHTML = `<p class="tip">${T('holdTip')}</p>` + (its.length ? `<div class="grid">${its.map((i) => `<button class="itm ${S.held === i.id ? 'on' : ''}" data-id="${i.id}"><div>${art(i.sprite, i.icon, '')}</div><b>${i.name}</b><small>${S.held === i.id ? T('holding') : T('hold')}</small></button>`).join('')}</div>` : `<div class="empty">${T('emptyItems')}</div>`);
      c.querySelectorAll('.itm').forEach((b2) => (b2.onclick = () => { S.held = S.held === b2.dataset.id ? null : b2.dataset.id; renderHUD(); draw(); }));
    }
    if (bookTab === 'pages') {
      c.innerHTML = `<div class="grid">${D.pages.map((p, i) => { const got = S.pages[i + 1]; return `<button class="itm" data-p="${i + 1}" ${got ? '' : 'disabled'}><div>${got ? art(['page1_contract','page2_wenna','page3_vow','page4_ledger','page5_ring','page6_letter'][i], '📜') : '<span class="em">?</span>'}</div><b>${got ? p.title : T('pageEmpty')}</b></button>`; }).join('')}</div>`;
      c.querySelectorAll('.itm:not([disabled])').forEach((b2) => (b2.onclick = () => { const p = D.pages[b2.dataset.p - 1]; card({ tag: T('page'), title: p.title, body: p.text, pic: art(['page1_contract','page2_wenna','page3_vow','page4_ledger','page5_ring','page6_letter'][b2.dataset.p - 1], '📜') }); }));
    }
  };
  draw(); $('#bookLayer').appendChild(b); document.addEventListener('keydown', esc);
}

/* ---------- viewer & hotspots ---------- */
function fallbackPano(r) {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 1024); g.addColorStop(0, '#0a0807'); g.addColorStop(.5, r.accent + '66'); g.addColorStop(1, '#0a0807'); x.fillStyle = g; x.fillRect(0, 0, 2048, 1024);
  x.fillStyle = '#e8dfc8'; x.font = '64px "IM Fell English SC",Georgia,serif'; x.textAlign = 'center'; x.globalAlpha = .6;
  for (let i = 0; i < 4; i++) x.fillText(r.name, 512 * i + 1024 - (i === 0 ? 0 : 0), 520);
  return c.toDataURL('image/jpeg', .8);
}
async function loadRoom(i, opts) {
  opts = opts || {}; S.room = i; const r = room(); document.documentElement.style.setProperty('--accent', r.accent);
  if (V) { try { V.destroy(); } catch (e) {} V = null; } $('#pano').innerHTML = '';
  const ok = await loadImg(r.pano); const url = ok ? r.pano : fallbackPano(r);
  await new Promise((res) => {
    let done = false; const fin = () => { if (!done) { done = true; res(); } };
    V = pannellum.viewer('pano', { type: 'equirectangular', panorama: url, autoLoad: true, showControls: false, mouseZoom: false, keyboardZoom: false, doubleClickZoom: false, draggable: true,
      hfov: innerWidth > innerHeight ? D.config.hfov + 15 : D.config.hfov, minHfov: 55, maxHfov: 110, yaw: r.startYaw || 0, pitch: 0, compass: false, friction: .12, hotSpots: [] });
    V.on('load', fin); V.on('error', () => { fin(); }); setTimeout(fin, 12000);
    if (DEBUG) V.on('mousedown', (e) => { const c = V.mouseEventToCoords(e); const m = `yaw ${c[1].toFixed(1)}  pitch ${c[0].toFixed(1)}`; console.log(m); dbg(m); });
  });
  S.hsOn = new Set(); refreshHotspots(); renderHUD();
}
const metAfter = (h) => h.after.every((a) => (a === 'narration' ? S.narr[room().id] : S.done[a]));
const afterNarr = (h) => h.after.some((a) => a === 'narration' || (a !== 'narration' && afterNarr(hsById(a) || { after: [] })));
// things to find, read or inspect are there from the start; puzzles, use-spots and the reward appear when their steps are done
// a tap shows once its steps are done. Exception: a tap with a `blocked` line shows from the start and explains in-world why it cannot be used yet
function hsVisible(h) { return !S.done[h.id] && (h.blocked && !afterNarr(h) ? true : metAfter(h)); }
function refreshHotspots() {
  if (!V) return; const r = room();
  r.hotspots.concat(exitHS(r) || []).forEach((h) => {
    const vis = (h.kind === 'EXIT' ? !!S.complete[r.id] && S.phase === 'play' : hsVisible(h)) && !(r.final && S.align && !S.done.r7_align);
    if (vis && !S.hsOn.has(h.id)) { addHS(h); S.hsOn.add(h.id); }
    if (!vis && S.hsOn.has(h.id)) { try { V.removeHotSpot(h.id); } catch (e) {} S.hsOn.delete(h.id); }
  });
  renderHUD();
}
function addHS(h) {
  const cur = curGoalId() === h.id;
  V.addHotSpot({ id: h.id, pitch: h.pitch, yaw: h.yaw, type: 'custom', cssClass: 'hs hs-' + h.kind.toLowerCase() + (cur ? ' cur' : ''), clickHandlerFunc: (ev) => onHotspot(h.id, ev && ev.currentTarget),
    createTooltipFunc: (div) => {
      const g = { LEARN: '✦', INSPECT: '🔍', USE: '☝', PANEL: '❖', EXIT: '➜', ALIGN: '◎' }[h.kind];
      div.innerHTML = h.kind === 'FIND' ? `<div class="core">${art(h.sprite, h.icon)}</div>` : `<div class="core">${g}</div>${h.kind === 'EXIT' ? `<div class="lab show">${h.name}</div>` : ''}`;
      div.setAttribute('role', 'button'); div.setAttribute('aria-label', h.name);
    } });
}
function curGoalId() { const r = room(); for (const h of r.hotspots) { if (S.done[h.id]) continue; if (h.after.every((a) => a === 'narration' || S.done[a])) return h.id; } return ''; }

/* ---------- hotspot actions ---------- */
function busy() { return S.phase !== 'play' || S.menu || S.panel || $('#cardLayer').firstChild || $('#bookLayer').firstChild || (DLG.cur && DLG.line && DLG.line.pausesTimer); }
function onHotspot(id, el) {
  if (!S || busy()) return; S.tapAt = Date.now(); const h = hsById(id); if (!h || S.done[id]) return;
  if (!metAfter(h)) { toast(h.blocked || T('notYet'), 'bad'); return; } // in-world reason, never the answer
  if (h.kind === 'EXIT') return travel(S.room + 1);
  if (h.kind === 'ALIGN') return startAlign();
  ({ FIND: doFind, LEARN: doLearn, INSPECT: doInspect, USE: doUse, PANEL: doPanelOpen })[h.kind](h, el);
}
function flyTo(el, h) {
  const tgt = $('#bCase').getBoundingClientRect(); if (!el || !el.getBoundingClientRect) return; const r = el.getBoundingClientRect();
  const f = mk('div', 'fly', art(h.sprite, h.icon)); f.style.left = r.left + 'px'; f.style.top = r.top + 'px'; document.body.appendChild(f);
  requestAnimationFrame(() => { f.style.transform = `translate(${tgt.left - r.left}px,${tgt.top - r.top}px) scale(.3)`; f.style.opacity = '.2'; }); setTimeout(() => f.remove(), 900);
}
function markDone(h) { S.done[h.id] = true; refreshHotspots(); }
function addClue(h, text) { if (text) S.clues.push({ room: room().name, text }); }
function addNotes(arr) { (arr || []).forEach((t) => S.notes.push({ room: room().name, text: t })); }
const needsHold = (id) => room().hotspots.some((x) => x.needs === id);

async function doFind(h, el) {
  sfx('pickup'); flyTo(el, h); markDone(h);
  S.items[h.item] = { id: h.item, name: h.name, sprite: h.sprite, icon: h.icon, page: h.page || 0 }; S.order.push(h.item);
  if (h.page) S.pages[h.page] = true;
  const gain = h.noCrowns ? 0 : h.reward ? D.config.roomReward : D.config.pickup; if (gain) addCrowns(gain);
  await sleep(450);
  await card({ tag: h.page ? T('page') : T('found'), title: h.name, pic: art(h.sprite, h.icon), body: h.text, chips: (gain ? ['+' + gain + ' ' + T('crowns')] : []).concat(needsHold(h.item) ? [T('useChip')] : []), saved: T('added') });
  if (h.reward) { S.complete[room().id] = true; if (S.room < D.rooms.length - 1) toast(T('wayOut'), 'good'); refreshHotspots(); }
  renderHUD();
}
async function doLearn(h) {
  markDone(h); addClue(h, h.clue); addNotes(h.notes);
  await card({ tag: T('clue'), title: h.name, pic: (() => { const b = h.beast && D.puzzles.venn.beasts.find((x) => x.id === h.beast); return b ? art(b.sprite, b.glyph) : '<span>' + h.icon + '</span>'; })(), body: h.text, saved: T('saved') });
}
async function doInspect(h) {
  const st = S.inspect[h.id] || (S.inspect[h.id] = { seen: [0], secret: false }); let vi = 0;
  const show = (c, close) => {
    const v = h.views[vi]; if (!st.seen.includes(vi)) st.seen.push(vi);
    let secret = '';
    if (vi === h.views.length - 1 && !st.secret) { st.secret = true; addCrowns(D.config.secret); addClue(h, h.secret.clue); secret = true; }
    c.querySelector('.pic').innerHTML = art(v.sprite, h.icon); c.querySelector('h3').textContent = h.name;
    c.querySelector('p:not(.saved)').innerHTML = v.text + (secret ? `<br><b>${T('secret')}:</b> ${h.secret.text}` : '');
    c.querySelector('.tag').textContent = vi === h.views.length - 1 ? T('secret') : T('view') + ' ' + (vi + 1);
    c.querySelector('.dots').innerHTML = h.views.map((_, k) => `<i class="${k === vi ? 'on' : ''}"></i>`).join('');
    const bt = c.querySelector('.turn'); bt.textContent = vi < h.views.length - 1 ? T('turn') : T('back');
    c.querySelector('.saved').textContent = st.secret ? T('saved') : '';
    if (st.seen.length >= h.views.length && !S.done[h.id]) { S.done[h.id] = true; refreshHotspots(); }
  };
  await card({ tag: ' ', title: ' ', pic: ' ', body: ' ', saved: ' ', buttons: [{ label: T('turn'), keep: true, cls: 'seal turn', fn: (c) => { vi = (vi + 1) % h.views.length; show(c); } }],
    onShow: (c) => { c.querySelector('.pic').after(mk('div', 'dots')); show(c); } });
}
async function doUse(h, el) {
  if (h.needs && S.held !== h.needs) {
    const it = S.items[h.needs]; if (it) { toast(T('needHold', { item: it.name }), 'bad'); openBook('items'); } else toast(T('needItem', { item: h.needs }), 'bad'); return;
  }
  if (h.final) return startChoice(h);
  markDone(h); addClue(h, h.clue); addNotes(h.notes);
  if (h.toast) toast(h.toast, 'good');
  await card({ tag: T('clue'), title: h.name, pic: '<span>' + h.icon + '</span>', body: h.text, saved: h.clue || h.notes ? T('saved') : '' });
}

/* ---------- panel frame ---------- */
const PANELS = {};
async function doPanelOpen(h) {
  if (h.discuss && !S.discussed[room().id]) { S.discussed[room().id] = true; await say(room().discuss, 'discuss'); }
  openPanel(h);
}
function openPanel(h) {
  if (!DLG.cur) stopSpeech();                                      // a panel opening never talks over the voice
  const wrap = mk('div', 'panel'), accent = room().accent; wrap.style.setProperty('--accent', accent);
  wrap.innerHTML = `<div class="phead"><h2>${h.titleText || h.name}</h2><button class="pb" data-a="book">${iconHTML('icon_casebook', '📖')}<span>Casebook</span></button><button class="pb" data-a="hint">${iconHTML('icon_hint', '🕯')}<span>Hint</span><b class="badge">${S.hints}</b></button><button class="pb" data-a="pause">${iconHTML('icon_pause', '⏸')}<span>Pause</span></button><button class="pb x" aria-label="${T('close')}">${iconHTML('icon_close', '✕')}<span>Close</span></button></div><div class="pbody"></div>`;
  const api = { h, body: wrap.querySelector('.pbody'), wrong: () => wrongAnswer(h), solved: () => solvePanel(h), locked: () => Math.max(0, Math.ceil((S.lock - Date.now()) / 1000)), el: wrap };
  const close = () => { if (S.panel && S.panel.el === wrap) { wrap.remove(); S.panel = null; document.removeEventListener('keydown', esc); renderHUD(); } };
  const esc = (e) => { if (e.key === 'Escape' && S.panel && S.panel.el === wrap && !$('#cardLayer').firstChild && !$('#bookLayer').firstChild && !$('#modalLayer').firstChild) close(); };
  api.close = close; wrap.querySelector('.x').onclick = close;
  wrap.querySelector('[data-a=book]').onclick = () => openBook(); wrap.querySelector('[data-a=hint]').onclick = () => askHint(); wrap.querySelector('[data-a=pause]').onclick = () => openMenu();
  S.panel = { el: wrap, h, api }; $('#panelLayer').appendChild(wrap); document.addEventListener('keydown', esc);
  PANELS[h.panel](h, api.body, api); renderHUD();
}
function lockCountdown(el, api) { // shows "Locked for 3s" and disables buttons while locked
  const iv = setInterval(() => { if (!el.isConnected) return clearInterval(iv); const s = api.locked(); const bar = el.querySelector('.lockbar'); if (bar) bar.textContent = s ? T('locked', { s }) : '';
    el.querySelectorAll('[data-lockable]').forEach((b) => (b.disabled = s > 0)); }, 250);
}
async function wrongAnswer(h) {
  sfx('wrong');
  const r = room(), id = r.id; S.wrongN[id] = (S.wrongN[id] || 0) + 1; const paid = S.wrongPaid[id] || 0, pay = Math.max(0, Math.min(D.config.wrong, D.config.wrongCapPerPuzzle - paid));
  S.wrongPaid[id] = paid + pay; if (pay) addCrowns(-pay); else toast(T('wrongToast', { n: 0 }), 'bad');
  S.lock = Date.now() + D.config.lockoutSeconds * 1000; fxWrong();
  say([r.wrong[Math.min(S.wrongN[id], 3) - 1]]);
}
async function solvePanel(h) {
  sfx('success');
  const api = S.panel && S.panel.api; if (api) api.close(); markDone(h); const r = room();
  if (r.onSolve && h.triggersRight) { (Object.entries(r.onSolve.rename || {})).forEach(([k, n]) => { if (S.items[k]) S.items[k].name = n; }); if (r.onSolve.toast) toast(r.onSolve.toast, 'good'); }
  if (h.panel === 'torch') { addClue(h, 'The Stag contract (Thorn notice) carries the steward\'s wax seal: a crane\'s head.'); addNotes(D.puzzles.torch.notices.filter((n) => n.mark).sort((a, b) => parseInt(a.date) - parseInt(b.date)).map((n) => n.mark[0].toUpperCase() + n.mark.slice(1) + ': ' + n.date));
    addNotes(['Lock rule: oldest warning first. Put the four symbols in date order.']);
    await card({ tag: T('clue'), title: 'Four hidden marks', pic: '<span>📜</span>', body: 'You found all four hidden marks and read their dates. The Thorn notice is the Stag contract. It carries a wax seal in the shape of a crane\'s head.', saved: T('saved') }); return; }
  if (h.triggersRight) {
    await say(r.right, 'right'); S.narr[r.id] = true; refreshHotspots(); toast(T('newThing'), 'good');
  }
}
function askHint() {
  const r = room(); if (S.phase !== 'play') return;
  if (S.hints <= 0) return toast(T('hintNone'), 'bad');
  const solved = r.final ? S.done.r7_align : S.done[r.hotspots.find((x) => x.triggersRight).id];
  if (solved) return toast(T('hintDone'));
  const used = S.hintUsed[r.id] || 0; if (used >= 3) return toast(T('hintOut'));
  const m = modal(`<h2>${T('hint')}</h2><p>${T('hintAsk', { cost: D.config.hintCost, left: S.hints })}</p><button class="seal" id="hy">${T('hintYes')}</button><button class="iron" id="hn">${T('hintNo')}</button>`);
  m.menu.querySelector('#hn').onclick = m.close;
  m.menu.querySelector('#hy').onclick = () => { m.close(); S.hints--; S.hintUsed[r.id] = used + 1; addCrowns(-D.config.hintCost); say([r.hints[used]], 'hint'); };
}

/* ---------- puzzles ---------- */
const sprite = (n, g) => art(n, g);

PANELS.torch = (h, body, api) => {
  const P = D.puzzles.torch; body.innerHTML = `<p class="help">Drag the lantern light over the wall. Hidden ink shows only inside the light. Find all 4 marks.</p><div class="wall"><div class="dark"></div></div><div class="progress"></div>`;
  const wall = body.querySelector('.wall'), prog = body.querySelector('.progress'), seed = [[3, 4, -7, 26], [34, 2, 5, 24], [66, 6, -3, 28], [10, 36, 6, 25], [41, 33, -9, 27], [72, 38, 4, 24], [27, 66, -4, 30]];
  P.notices.forEach((n, i) => { const d = mk('div', 'notice', `<b>${n.title}</b><i>${n.date}</i>`); const q = seed[i % 7]; d.style.cssText = `left:${q[0]}%;top:${q[1]}%;width:${q[3]}%;--r:${q[2]}deg`; d.dataset.i = i; wall.insertBefore(d, wall.querySelector('.dark')); });
  const marks = []; const upd = () => (prog.textContent = `Marks found: ${S.torch.found.length} of 4`); upd();
  requestAnimationFrame(() => P.notices.forEach((n, i) => { if (!n.mark) return; const d = wall.children[i], m = mk('div', 'mk', sprite('sym_' + n.mark, P.symbols.find((s) => s.id === n.mark).glyph));
    m.dataset.x = d.offsetLeft + d.offsetWidth / 2; m.dataset.y = d.offsetTop + d.offsetHeight / 2; m.style.left = m.dataset.x + 'px'; m.style.top = m.dataset.y + 'px'; m.dataset.m = n.mark; wall.appendChild(m); marks.push(m); }));
  const move = (e) => { const r = wall.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top - (e.pointerType === 'touch' ? 46 : 0), rad = Math.max(70, r.width * .17);
    wall.style.setProperty('--x', x + 'px'); wall.style.setProperty('--y', y + 'px'); wall.style.setProperty('--rad', rad + 'px');
    marks.forEach((m) => { const d = Math.hypot(+m.dataset.x - x, +m.dataset.y - y); const inL = d < rad * .8; m.style.opacity = inL ? 1 : d < rad ? .4 : 0;
      if (inL && !S.torch.found.includes(m.dataset.m)) { S.torch.found.push(m.dataset.m); upd(); if (S.torch.found.length === 4) { wall.classList.add('lit'); marks.forEach((q) => (q.style.opacity = 1)); setTimeout(() => api.solved(), 900); } } }); };
  wall.addEventListener('pointermove', move); wall.addEventListener('pointerdown', move);
  if (S.torch.found.length === 4) { wall.classList.add('lit'); }
};
PANELS.lock = (h, body, api) => {
  const P = D.puzzles.torch; S.symSeq = [];
  body.innerHTML = `<p class="help">Put the four symbols in date order, earliest first. The Casebook has your notes.</p><div class="slots">${'<div class="slot"></div>'.repeat(4)}</div><div class="lockbar"></div><div class="symgrid">${['moon', 'rose', 'crow', 'key', 'thorn', 'stag'].map((id) => P.symbols.find((x) => x.id === id)).map((s) => `<button class="iron symbtn" data-lockable data-id="${s.id}"><div class="g">${sprite(s.sprite, s.glyph)}</div>${s.name}</button>`).join('')}</div><button class="iron" data-lockable id="clr">${T('clear')}</button>`;
  const slots = body.querySelectorAll('.slot'), draw = () => slots.forEach((sl, i) => { const s = P.symbols.find((x) => x.id === S.symSeq[i]); sl.innerHTML = s ? sprite(s.sprite, s.glyph) : ''; });
  body.querySelectorAll('.symbtn').forEach((b) => (b.onclick = () => { if (api.locked() || S.symSeq.length >= 4) return; S.symSeq.push(b.dataset.id); draw();
    if (S.symSeq.length === 4) { if (S.symSeq.join() === P.order.join()) api.solved(); else { api.wrong(); setTimeout(() => { S.symSeq = []; draw(); }, 700); } } }));
  body.querySelector('#clr').onclick = () => { S.symSeq = []; draw(); }; lockCountdown(body, api);
};
PANELS.vials = (h, body, api) => {
  const P = D.puzzles.vials, st = S.vials, cap = { a: P.big, b: P.small }, px = 30;
  body.innerHTML = `<p class="help">Fill the big vial with exactly ${P.target} measures. Fill from the barrel, empty into the drain, or pour one vial into the other.</p>
  <div class="vials">${['a', 'b'].map((k) => `<div class="vcol"><div class="vlabel">${cap[k]}-measure vial</div><div class="vial" id="v${k}" style="height:${cap[k] * px}px"><div class="liq"></div><div class="num"></div>${Array.from({ length: cap[k] - 1 }, (_, i) => `<div class="tick" style="bottom:${(i + 1) * px}px"></div>`).join('')}</div>
  <div class="vbtns"><button class="iron" data-a="fill" data-k="${k}">🛢 ${T('fill')}</button><button class="iron" data-a="empty" data-k="${k}">🕳 ${T('empty')}</button><button class="iron" data-a="pour" data-k="${k}">⇄ ${T('pour')} → ${k === 'a' ? cap.b : cap.a}</button></div></div>`).join('')}</div>
  <div class="status" id="vs"></div><button class="iron" id="vr">${T('reset')}</button>`;
  const draw = () => { ['a', 'b'].forEach((k) => { const v = body.querySelector('#v' + k); v.querySelector('.liq').style.height = st[k] * px + 'px'; v.querySelector('.num').textContent = st[k]; }); body.querySelector('#vs').textContent = `Big vial: ${st.a} of ${P.target} wanted`; };
  const act = (a, k) => { const o = k === 'a' ? 'b' : 'a'; if (a === 'fill') st[k] = cap[k]; if (a === 'empty') st[k] = 0; if (a === 'pour') { const m = Math.min(st[k], cap[o] - st[o]); st[k] -= m; st[o] += m; } draw(); if (st.a === P.target) { body.querySelector('#vs').classList.add('ok'); setTimeout(() => api.solved(), 800); } };
  body.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => act(b.dataset.a, b.dataset.k)));
  body.querySelector('#vr').onclick = () => { st.a = st.b = 0; draw(); }; draw();
};
PANELS.lens = (h, body, api) => {
  const P = D.puzzles.lens, L = S.lens;
  const ALL = () => { const T6 = D.puzzles.torch.symbols, x = P.sigils.concat(['crow', 'moon', 'thorn'].map((id) => T6.find((q) => q.id === id))); return ['moon', 'stag', 'thorn', 'crown', 'crow', 'chalice'].map((id) => x.find((q) => q.id === id)); };
  body.innerHTML = `<p class="help">Drag a lens over the mural. Each colour shows a different hidden sigil. Then place the sigils on the altar in the plaque's order.</p><div class="stage" id="st">${P.sigils.map((s) => `<div class="sig" data-id="${s.id}" style="left:${s.x * 100}%;top:${s.y * 100}%">${sprite(s.sprite, s.glyph)}</div>`).join('')}${P.lenses.map((l, i) => `<div class="lens" data-id="${l.id}" style="--c:${l.color}88"></div>`).join('')}<div class="tray"></div></div>
  <div class="slots">${'<div class="slot"></div>'.repeat(3)}</div><div class="lockbar"></div><div class="palette">${ALL().map((s) => `<button class="iron" data-s="${s.id}"><div class="g">${sprite(s.sprite, s.glyph)}</div>${s.name}</button>`).join('')}</div><button class="iron" id="lc">${T('clear')}</button>`;
  const st = body.querySelector('#st'), lenses = [...st.querySelectorAll('.lens')], sigs = [...st.querySelectorAll('.sig')];
  const place = (el, id, i) => { const r = st.getBoundingClientRect(); const p = L.pos[id] || { x: .2 + i * .3, y: .8 }; el.style.left = p.x * r.width + 'px'; el.style.top = p.y * r.height + 'px'; };
  requestAnimationFrame(() => { lenses.forEach((el, i) => place(el, el.dataset.id, i)); check(); });
  const slots = body.querySelectorAll('.slot'), pal = body.querySelectorAll('.palette .iron');
  const draw = () => { slots.forEach((sl, i) => { const s = ALL().find((x) => x.id === L.placed[i]); sl.innerHTML = s ? sprite(s.sprite, s.glyph) : ''; });
    pal.forEach((b) => { b.disabled = L.placed.length >= 3 || api.locked() > 0; }); };
  function check() { sigs.forEach((s) => (s.classList.remove('vis'))); const r = st.getBoundingClientRect();
    const ctr = (e) => { const q = e.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; };
    lenses.forEach((el) => { const l = P.lenses.find((x) => x.id === el.dataset.id), sg = sigs.find((x) => x.dataset.id === l.sigil), a1 = ctr(el), a2 = ctr(sg), d = Math.hypot(a1[0] - a2[0], a1[1] - a2[1]);
      if (d < 38) { sg.classList.add('vis'); sg.style.setProperty('--c', l.color); if (!L.seen.includes(l.sigil)) { L.seen.push(l.sigil); draw(); toast(`You see a ${P.sigils.find((x) => x.id === l.sigil).name}!`, 'good'); } } }); }
  lenses.forEach((el) => { el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); el.classList.add('drag'); });
    el.addEventListener('pointermove', (e) => { if (!el.classList.contains('drag')) return; const r = st.getBoundingClientRect(); const x = Math.max(0, Math.min(r.width, e.clientX - r.left)), y = Math.max(0, Math.min(r.height, e.clientY - r.top));
      el.style.left = x + 'px'; el.style.top = y + 'px'; L.pos[el.dataset.id] = { x: x / r.width, y: y / r.height }; check(); });
    el.addEventListener('pointerup', () => el.classList.remove('drag')); });
  pal.forEach((b) => (b.onclick = () => { if (api.locked() || L.placed.length >= 3) return; L.placed.push(b.dataset.s); draw();
    if (L.placed.length === 3) { if (L.placed.join() === P.order.join()) api.solved(); else { api.wrong(); setTimeout(() => { L.placed = []; draw(); }, 800); } } }));
  body.querySelector('#lc').onclick = () => { L.placed = []; draw(); }; draw(); lockCountdown(body, api);
};
PANELS.venn = (h, body, api) => {
  const P = D.puzzles.venn, vs = S.venn, wide = innerWidth > 800 && innerWidth > innerHeight * 1.2;
  body.innerHTML = `<p class="help">Drag each beast into the circles that match ALL its weaknesses. No weakness: leave it outside.</p><div class="vstage" id="vs"></div><div class="lockbar"></div><button class="seal" data-lockable id="vc">${T('check')}</button>`;
  const stg = body.querySelector('#vs'), OFF = .06;
  const Wd = Math.max(250, Math.min(body.clientWidth - 16, 460, innerHeight - 330)), AH = Math.round(Wd * .86), SW = wide ? Wd + 268 : Wd, TH = 172, SH = wide ? AH : AH + 6 + TH;
  stg.style.width = SW + 'px'; stg.style.height = SH + 'px'; stg.style.maxWidth = '100%';
  const C = [{ n: 'silver', x: .38, y: .37, c: '#c8d0dc', l: 'Silver' }, { n: 'fire', x: .62, y: .37, c: '#e0743a', l: 'Fire' }, { n: 'salt', x: .5, y: .6, c: '#e8dfc8', l: 'Salt' }], R = .27;
  stg.innerHTML = `<div class="arena" style="width:${Wd}px;height:${AH}px"><svg viewBox="0 6 100 86">${C.map((c) => `<circle cx="${c.x * 100}" cy="${c.y * 100}" r="${R * 100}" fill="${c.c}" fill-opacity=".14" stroke="${c.c}" stroke-width=".8"/>`).join('')}${C.map((c) => `<text x="${c.x * 100 + (c.n === 'silver' ? -15 : c.n === 'fire' ? 15 : 0)}" y="${c.y * 100 + (c.n === 'salt' ? 21 : -14)}" fill="${c.c}" font-size="5.5" text-anchor="middle" font-family="IM Fell English SC,serif">${c.l}</text>`).join('')}</svg></div>
  <div class="vtray" style="left:${wide ? Wd + 8 : 0}px;top:${wide ? 0 : AH + 6}px;width:${SW - (wide ? Wd + 8 : 0)}px;height:${wide ? AH : TH}px"></div>`;
  const toPx = (p) => ({ x: p.x * Wd, y: (p.y - OFF) * Wd }), fromPx = (x, y) => ({ x: x / Wd, y: y / Wd + OFF });
  const home = (i) => wide ? fromPx(Wd + 8 + 48 + (i % 3) * 86, 46 + Math.floor(i / 3) * ((AH - 92) / 2)) : fromPx(SW / 8 + (i % 4) * SW / 4, AH + 6 + 42 + Math.floor(i / 4) * 82);
  const inTray = (p) => { const q = toPx(p); return wide ? q.x > Wd + 4 : q.y > AH + 2; };
  P.beasts.forEach((b, i) => { if (!vs[b.id]) vs[b.id] = home(i); const t = mk('div', 'vtok', `<div class="face">${sprite(b.sprite, b.glyph)}</div><span>${b.name}</span>`); t.dataset.id = b.id; stg.appendChild(t); setPos(t, vs[b.id]); wire(t, b, i); });
  function setPos(t, p) { const q = toPx(p); t.style.left = q.x + 'px'; t.style.top = q.y + 'px'; }
  const region = (p) => C.filter((c) => Math.hypot(p.x - c.x, p.y - c.y) < R).map((c) => c.n).sort().join('+');
  function wire(t, b, i) { let drag = false;
    t.addEventListener('pointerdown', (e) => { drag = true; t.setPointerCapture(e.pointerId); t.classList.add('drag'); t.classList.remove('bad'); });
    t.addEventListener('pointermove', (e) => { if (!drag) return; const r = stg.getBoundingClientRect(); const p = fromPx(Math.max(22, Math.min(SW - 22, e.clientX - r.left)), Math.max(22, Math.min(SH - 30, e.clientY - r.top))); vs[b.id] = p; setPos(t, p); });
    t.addEventListener('pointerup', () => { drag = false; t.classList.remove('drag'); if (inTray(vs[b.id])) { vs[b.id] = home(i); setPos(t, vs[b.id]); } }); }
  body.querySelector('#vc').onclick = () => { if (api.locked()) return;
    if (P.beasts.some((b) => inTray(vs[b.id]))) return toast('Place all eight beasts on the wheel first.', 'bad');
    let bad = 0; P.beasts.forEach((b) => { if (region(vs[b.id]) !== b.weak.slice().sort().join('+')) bad++; });
    if (!bad) { api.solved(); } else { toast(`${bad} beast${bad > 1 ? 's are' : ' is'} in the wrong place.`, 'bad'); api.wrong(); } };
  lockCountdown(body, api);
};
PANELS.map = (h, body, api) => {
  const P = D.puzzles.map, M = S.map, N = P.size, cols = 'ABCDEFGHIJ';
  const pos = (c) => ({ col: cols.indexOf(c[0]), row: parseInt(c.slice(1)) });
  const bearings = [0, 45, 90, 135, 180, 225, 270, 315], names = { 0: 'north', 45: 'north-east', 90: 'east', 135: 'south-east', 180: 'south', 225: 'south-west', 270: 'west', 315: 'north-west' };
  const opt = () => '<option value="">Pick a bearing</option>' + bearings.map((b) => `<option value="${b}">${String(b).padStart(3, '0')}° ${names[b]}</option>`).join('');
  body.innerHTML = `<p class="help">Pick the bearing for each post. Lines are drawn on the map. Then tap the cell where the lines cross and confirm.</p>
  <div class="bearing"><label>Post A (B2)</label><select id="ba">${opt()}</select></div><div class="bearing"><label>Post B (H2)</label><select id="bb">${opt()}</select></div>
  <div class="mapwrap"><div class="mapcol">${[...cols].map((c) => `<span>${c}</span>`).join('')}</div><div class="maprow">${Array.from({ length: N }, (_, i) => `<span>${N - i}</span>`).join('')}</div><div class="mapgrid" id="mg"></div></div>
  <div class="lockbar"></div><button class="seal" id="mm" disabled>Mark a cell first</button>`;
  const g = body.querySelector('#mg'); for (let r = N; r >= 1; r--) for (let c = 0; c < N; c++) { const b = mk('button', ''); b.dataset.c = cols[c] + r; b.setAttribute('aria-label', cols[c] + r); g.appendChild(b); }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', `0 0 ${N} ${N}`); g.appendChild(svg);
  const draw = () => { svg.innerHTML = ''; [['a', P.postA, '#2f6fbf'], ['b', P.postB, '#bf6f2f']].forEach(([k, cell, col]) => { const p = pos(cell), cx = p.col + .5, cy = N - (p.row - .5);
    if (M[k] !== '') { const a = (+M[k]) * Math.PI / 180, L = 20; svg.insertAdjacentHTML('beforeend', `<line x1="${cx}" y1="${cy}" x2="${cx + Math.sin(a) * L}" y2="${cy - Math.cos(a) * L}" stroke="${col}" stroke-width=".12" stroke-dasharray=".4 .2"/>`); }
    svg.insertAdjacentHTML('beforeend', `<circle cx="${cx}" cy="${cy}" r=".36" fill="${col}" stroke="#fff" stroke-width=".06"/><text x="${cx}" y="${cy}" font-size=".4" fill="#fff" text-anchor="middle" dominant-baseline="central" font-family="serif">${k.toUpperCase()}</text>`); });
    g.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.c === M.sel)); const mm = body.querySelector('#mm'); mm.disabled = !M.sel || api.locked() > 0; mm.textContent = M.sel ? `Mark ${M.sel} as the yew` : 'Mark a cell first'; };
  body.querySelector('#ba').value = M.a; body.querySelector('#bb').value = M.b;
  body.querySelector('#ba').onchange = (e) => { M.a = e.target.value; draw(); }; body.querySelector('#bb').onchange = (e) => { M.b = e.target.value; draw(); };
  g.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { M.sel = b.dataset.c; draw(); } });
  body.querySelector('#mm').onclick = () => { if (api.locked() || !M.sel) return; if (M.sel === P.answer) api.solved(); else { api.wrong(); M.sel = ''; draw(); } };
  draw(); lockCountdown(body, api); const iv = setInterval(() => { if (!body.isConnected) return clearInterval(iv); draw(); }, 1000);
};
function crossings(pts, edges) {
  const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); const out = new Set();
  edges.forEach((e, i) => edges.forEach((f, j) => { if (j <= i || e.some((n) => f.includes(n))) return; const [a, b, c, d] = [pts[e[0]], pts[e[1]], pts[f[0]], pts[f[1]]];
    if (cr(a, b, c) * cr(a, b, d) < 0 && cr(c, d, a) * cr(c, d, b) < 0) { out.add(i); out.add(j); } })); return out;
}
window.__crossings = crossings;
PANELS.untangle = (h, body, api) => {
  const P = D.puzzles.untangle; if (!S.tangle) S.tangle = P.start.map((p) => [p[0] * 100, p[1] * 100]); const pts = S.tangle;
  body.innerHTML = `<p class="help">Drag the rings so that no chain crosses another. Red chains are still crossing. Moving rings is free.</p><div class="tangle"><svg viewBox="0 0 100 100"></svg></div><div class="status" id="ts"></div>`;
  const svg = body.querySelector('svg'); let drag = -1;
  const draw = () => { const cr = crossings(pts, P.edges); svg.innerHTML = P.edges.map((e, i) => `<line class="edge ${cr.has(i) ? 'cross' : ''}" x1="${pts[e[0]][0]}" y1="${pts[e[0]][1]}" x2="${pts[e[1]][0]}" y2="${pts[e[1]][1]}"/>`).join('') +
    pts.map((p, i) => `<g class="node" data-i="${i}"><circle cx="${p[0]}" cy="${p[1]}" r="5.2"/><text x="${p[0]}" y="${p[1]}">${i + 1}</text></g>`).join('');
    const s = body.querySelector('#ts'); s.textContent = cr.size ? `Chains still crossing: ${cr.size}` : 'All chains are free!'; s.classList.toggle('ok', !cr.size); return cr.size; };
  svg.addEventListener('pointerdown', (e) => { const n = e.target.closest('.node'); if (n) { drag = +n.dataset.i; svg.setPointerCapture(e.pointerId); } });
  svg.addEventListener('pointermove', (e) => { if (drag < 0) return; const r = svg.getBoundingClientRect(); pts[drag] = [Math.max(6, Math.min(94, (e.clientX - r.left) / r.width * 100)), Math.max(6, Math.min(94, (e.clientY - r.top) / r.height * 100))]; draw(); });
  svg.addEventListener('pointerup', () => { if (drag < 0) return; drag = -1; if (draw() === 0) setTimeout(() => api.solved(), 700); });
  draw();
};

/* ---------- final room: sightline alignment, vision, choice ---------- */
function startAlign() {
  const C = D.config.sight; S.align = { hold: 0, fh: 0, near: false, last: performance.now() }; refreshHotspots();
  const al = mk('div', '', ''); al.id = 'align'; al.innerHTML = `<svg viewBox="0 0 100 100"><circle id="ringBase" cx="50" cy="50" r="44"/><circle id="ringFill" cx="50" cy="50" r="44" pathLength="100"/></svg><div id="alignMsg"></div><div id="alignHelp">${T('alignHelp')}</div>`;
  $('#app').appendChild(al); fxIdle(true); renderHUD();
  const loop = (now) => {
    if (!S || !S.align || !al.isConnected) return; const a = S.align, dt = Math.min(.1, (now - a.last) / 1000); a.last = now;
    if (!S.menu && S.phase === 'play' && !a.cine && !a.done) {
      if (Date.now() < S.lock) { al.querySelector('#alignMsg').textContent = T('locked', { s: Math.ceil((S.lock - Date.now()) / 1000) }); a.hold = 0; a.fh = 0; fxProgress(0); }
      else {
        const y = V.getYaw(), p = V.getPitch(), dy = Math.abs(norm(y - C.yaw)), dp = Math.abs(p - C.pitch), tol = Math.max(C.tolerance, al.querySelector('svg').getBoundingClientRect().width * .44 * .85 / (innerWidth / V.getHfov())), inside = dy <= tol && dp <= tol; // the ring you see is the target zone
        a.near = Math.hypot(dy, dp) < 14; al.classList.toggle('near', a.near);
        if (inside) { a.hold += dt; } else a.hold = 0;
        const fal = C.falseGaps.some((g) => Math.abs(norm(y - g.yaw)) <= C.tolerance && Math.abs(p - g.pitch) <= C.tolerance * 3); a.fh = fal ? a.fh + dt : 0;
        al.querySelector('#alignMsg').textContent = a.hold > 0 ? T('alignHold') : (fal ? T('alignFalse') : '');
        al.querySelector('#ringFill').style.strokeDasharray = `${Math.min(100, a.hold / C.holdSeconds * 100)} 100`; fxProgress(a.hold / C.holdSeconds);
        if (a.fh >= C.falseHoldSeconds) { a.fh = 0; wrongAnswer(hsById('r7_align')); }
        if (a.hold >= C.holdSeconds) { a.done = true; alignSuccess(al); return; }
      }
    }
    requestAnimationFrame(loop);
  }; requestAnimationFrame(loop);
}
async function alignSuccess(al) {
  sfx('spell');
  fxProgress(0); fxSuccess(); addCrowns(D.config.finalStep); S.done.r7_align = true; al.querySelector('#ringFill').style.strokeDasharray = '100 100';
  await sleep(1400); al.remove(); S.align = { cine: true }; fxIdle(false);
  fxVision(true); await cinematic(room().vision, 'vision', room().visionAudio); fxVision(false); S.align = null;
  await say(room().right, 'right'); S.narr.r7 = true; refreshHotspots(); toast(T('newThing'), 'good');
}
function cinematic(lines, cls, audios) {
  return new Promise((res) => { let i = 0; const c = mk('div', 'cine ' + (cls || ''), `<p></p><small>▸ ${T('tapContinue')}</small>`); $('#app').appendChild(c);
    const show = () => { const p = c.querySelector('p'); p.style.animation = 'none'; void p.offsetWidth; p.style.animation = ''; p.textContent = lines[i]; narrate(lines[i], 'narrator', (audios || [])[i]); preloadVoice((audios || [])[i + 1]); };
    c.onclick = () => { stopSpeech(); if (++i >= lines.length) { c.remove(); res(); } else show(); }; show(); });
}
async function startChoice(h) {
  await say(room().choice, 'choice');
  const choose = async (c) => { if (S.ended) return; S.ended = true; addCrowns(D.config.finalStep); S.phase = 'ending'; $('#cardLayer').innerHTML = ''; await sleep(300); sfx({ ink: 'cloth', vines: 'creak', break: 'spell' }[c.fx]); ({ ink: fxInk, vines: fxVines, break: fxBreak })[c.fx](); await sleep({ ink: 4000, vines: 4000, break: 5600 }[c.fx]); fxClear(); ending(c.id); };
  card({ tag: T('choice'), title: 'The Thorn Seal', body: 'This is a choice, not a test. Every choice is allowed. What will Torin do?', buttons: D.choices.map((c) => ({ label: `<b>${c.title}</b>${c.text}`, cls: 'opt', value: c.id, fn: () => choose(c) })) });
}
async function ending(id) {
  showHUD(false); $('#dlg').hidden = true; let key = id === 'break' ? (S.crowns >= D.config.fullEndingCrowns ? 'breakFull' : 'breakBitter') : id; const E = D.endings[key];
  await cinematic(E.lines.concat(D.endings.seed), '', (E.audio || []).concat(D.endings.seedAudio || [])); stopSpeech();
  const e = mk('div', 'end', `<h2>${E.title}</h2><h1>${T('end')}</h1><div>${T('endCrowns')}</div><div class="score">♛ ${S.crowns}</div><button class="seal big">${T('playAgain')}</button>`);
  $('#app').appendChild(e); e.querySelector('button').onclick = () => { e.remove(); restart(); };
}
async function timeUp() {
  if (S.phase !== 'play') return; S.phase = 'over'; skipSeq(); DLG.q = []; $('#dlg').hidden = true; if (S.panel) S.panel.api.close(); $('#cardLayer').innerHTML = ''; $('#bookLayer').innerHTML = ''; cardQ.length = 0;
  if (S.align) { const a = $('#align'); a && a.remove(); S.align = null; } fxProgress(0); sfx('thud', .7); fxTimeUp(); await sleep(4200); showHUD(false);
  const e = mk('div', 'end', `<h1>${T('timeUp')}</h1><p>${T('timeUpText')}</p><button class="seal big">${T('tryAgain')}</button>`); $('#app').appendChild(e);
  e.querySelector('button').onclick = () => { e.remove(); restart(); };
}

/* ---------- pause menu ---------- */
function openMenu() {
  if (S.menu || !['play'].includes(S.phase)) return; S.menu = true; document.body.classList.add('paused'); voicePause();
  const m = modal(`<h2>${T('pauseTitle')}</h2><p>${T('pauseNote')}</p><button class="seal" id="mr">${T('resume')}</button><button class="iron" id="mre">${T('restart')}</button><div class="toggles">${[['music', 'Music'], ['sfx', 'Sound effects'], ['voice', 'Narration']].map(([k, l]) => `<button class="iron tg ${PREF[k] ? 'on' : ''}" data-k="${k}"><span>${l}</span><b>${PREF[k] ? 'On' : 'Off'}</b></button>`).join('')}</div><button class="iron" id="mq">${T('quit')}</button>`, () => { S.menu = false; document.body.classList.remove('paused'); voiceResume(); });
  m.menu.querySelector('#mr').onclick = m.close;
  m.menu.querySelectorAll('.tg').forEach((b) => (b.onclick = () => { const k = b.dataset.k; PREF[k] = !PREF[k]; savePrefs(); applySound(); b.classList.toggle('on', PREF[k]); b.querySelector('b').textContent = PREF[k] ? 'On' : 'Off'; }));
  const sure = (fn) => { const q = modal(`<p>${T('quitAsk')}</p><button class="seal">${T('yes')}</button><button class="iron">${T('no')}</button>`); q.menu.querySelector('.seal').onclick = () => { q.close(); m.close(); fn(); }; q.menu.querySelector('.iron').onclick = q.close; };
  m.menu.querySelector('#mre').onclick = () => sure(() => restart()); m.menu.querySelector('#mq').onclick = () => sure(() => toTitle());
  m.m.addEventListener('pointerdown', (e) => { if (e.target === m.m) m.close(); });
}
function clearAll() {
  DLG.q = []; DLG.cur = null; DLG.line = null; $('#dlg').hidden = true; document.body.classList.remove('dlg-open'); document.body.classList.remove('paused'); stopSpeech(); fxClear();
  ['#panelLayer', '#cardLayer', '#bookLayer', '#modalLayer', '#toasts'].forEach((s) => ($(s).innerHTML = '')); cardQ.length = 0; ['#align', '.cine', '.end'].forEach((s) => document.querySelectorAll(s).forEach((e) => e.remove()));
  $('#tutorial').hidden = true; $('#skipIntro').hidden = true; $('#fade').classList.remove('on'); $('#pano').classList.remove('blur');
}
function restart() { clearAll(); S = newState(); showMission(); }
function toTitle() { clearAll(); if (V) { try { V.destroy(); } catch (e) {} V = null; $('#pano').innerHTML = ''; } showHUD(false); S = newState(); showTitle(); }

/* ---------- intro flow: Tap to Start, Mission Info, tutorial, opening narration ---------- */
async function showTitle() {
  S.phase = 'title'; $('#sMission').hidden = true; $('#sTitle').hidden = false; showHUD(false);
  $('#tTitle').textContent = D.ui.title; $('#tTag').textContent = D.ui.tagline; $('#btnStart').textContent = D.ui.start;
  if (await loadImg('assets/sheets/start_bg.jpg')) { const b = $('#titleBg'); b.style.backgroundImage = 'url(assets/sheets/start_bg.jpg)'; b.classList.add('on'); }
}
async function showMission() {
  S.phase = 'mission'; $('#sTitle').hidden = true; const sc = $('#sMission'); sc.hidden = false; showHUD(false);
  $('#mHead').textContent = D.mission.heading; $('#mParas').innerHTML = D.mission.paras.map((p, i) => `<p style="animation-delay:${.3 + i * .6}s;margin-bottom:12px">${p}</p>`).join(''); $('#btnBegin').textContent = D.ui.begin;
  if (await loadImg('assets/sheets/briefing_bg.jpg')) { const b = $('#missionBg'); b.style.backgroundImage = 'url(assets/sheets/briefing_bg.jpg)'; b.classList.add('on'); }
  narrate(D.mission.paras.join(' '), 'narrator', D.mission.audioFile);
}
let skipAll = false;
async function beginIntro() {
  stopSpeech(); skipAll = false; $('#sMission').hidden = true; S.phase = 'intro'; $('#fade').classList.add('on'); await sleep(50);
  const loading = loadRoom(0); $('#pano').classList.add('blur'); await loading; showHUD(true); $('#skipIntro').hidden = true; renderHUD(); renderTimer(); $('#fade').classList.remove('on'); await sleep(600);
  if (!skipAll) await tutorial();
  if (!skipAll) await say(D.opening, 'opening'); else { DLG.q = []; skipSeq(); }
  $('#skipIntro').hidden = true; $('#pano').classList.remove('blur'); await sleep(D.config.blurSeconds * 1000); S.phase = 'play'; S.tapAt = Date.now(); enterRoom();
}
function tutorial() {
  return new Promise((res) => {
    const tt = $('#tutorial'), spot = $('#spot'), c = $('#tCard'); tt.hidden = false; let i = 0;
    const done = () => { tt.hidden = true; stopSpeech(); res(); };
    const show = () => {
      const s = D.tutorial[i]; $('#tStep').textContent = `${i + 1} / ${D.tutorial.length}`; $('#tTitleC').textContent = s.title; $('#tText').textContent = s.text; $('#tNext').textContent = i === D.tutorial.length - 1 ? T('begin') : T('next'); $('#tSkip').textContent = T('skip');
      const el = s.target && $(s.target); spot.classList.toggle('none', !el);
      let r = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
      const pad = el ? 6 : 0; Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
      const h = c.offsetHeight || 190; c.style.top = !el ? (innerHeight - h) / 2 + 'px' : r.top + r.height / 2 < innerHeight / 2 ? Math.min(innerHeight - h - 10, r.top + r.height + 22) + 'px' : Math.max(10, r.top - h - 22) + 'px';
      narrate(s.title + '. ' + s.text, 'narrator', s.audioFile); preloadVoice((D.tutorial[i + 1] || {}).audioFile);
    };
    $('#tNext').onclick = () => { if (++i >= D.tutorial.length) done(); else show(); }; $('#tSkip').onclick = done; show();
    window.__tutDone = done;
  });
}
async function enterRoom() {
  const r = room(); S.entered[r.id] = true; await say(r.enter, 'enter');
  await card({ tag: T('goal'), title: r.name, body: r.objective, pic: '<span>🎯</span>' });
  if (r.final) await say(r.discuss, 'discuss'); // the ring puzzle starts when the player taps the centre of the ring
}
async function travel(i) {
  sfx('door');
  S.phase = 'travel'; const f = $('#fade'); f.innerHTML = `<div class="tt"><small>${T('travel')}</small><h2>${D.rooms[i].name}</h2></div>`; f.classList.add('on'); await sleep(900);
  S.held = S.held && room().hotspots.some((x) => x.needs === S.held) ? null : S.held; await loadRoom(i); await sleep(500); f.classList.remove('on'); S.phase = 'play'; S.tapAt = Date.now(); renderHUD(); enterRoom();
}

/* ---------- validate(): ids, cycles, files ---------- */
async function validate() {
  const errs = [], ids = new Set(), all = D.rooms.flatMap((r) => r.hotspots);
  all.forEach((h) => { if (ids.has(h.id)) errs.push('duplicate id ' + h.id); ids.add(h.id); });
  all.forEach((h) => h.after.forEach((a) => { if (a !== 'narration' && !ids.has(a)) errs.push(`${h.id}: unknown after "${a}"`); }));
  const state = {}; const visit = (id, path) => { if (state[id] === 2) return; if (state[id] === 1) { errs.push('cycle: ' + path.concat(id).join(' > ')); return; } state[id] = 1; const h = all.find((x) => x.id === id); if (h) h.after.forEach((a) => a !== 'narration' && visit(a, path.concat(id))); state[id] = 2; };
  all.forEach((h) => visit(h.id, []));
  D.rooms.forEach((r) => { ['enter', 'discuss', 'right', 'wrong', 'hints', 'choice'].forEach((k) => (r[k] || []).forEach((l, i) => { if (typeof l.pausesTimer !== 'boolean') errs.push(`${r.id}.${k}[${i}] missing pausesTimer`); if (!D.voices[l.who]) errs.push(`${r.id}.${k}[${i}] unknown speaker ${l.who}`); }));
    if (r.wrong.length !== 3 || r.hints.length !== 3) errs.push(r.id + ': needs 3 wrong lines and 3 hints');
    r.hotspots.forEach((h) => { if (h.kind !== 'ALIGN' && (typeof h.yaw !== 'number' || typeof h.pitch !== 'number')) errs.push(h.id + ': missing yaw/pitch'); }); });
  for (const r of D.rooms) if (!(await loadImg(r.pano))) errs.push('missing panorama (fallback will be used): ' + r.pano);
  console[errs.length ? 'warn' : 'log']('validate(): ' + (errs.length ? errs.join('\n') : 'ok')); return errs;
}
window.validate = validate;

/* ---------- debug ---------- */
function dbg(msg) { const d = $('#debug'); d.hidden = false; let l = d.querySelector('.log'); if (!l) { l = mk('div', 'log'); d.appendChild(l); } l.textContent = msg; }
function debugTools(errs) {
  const d = $('#debug'); d.hidden = false; d.innerHTML = `<div>${T('debugHint')}</div><div class="log">${errs.length ? errs.join('\n') : 'validate: ok'}</div>` +
    D.rooms.map((r, i) => `<button data-r="${i}">R${i + 1}</button>`).join('') + '<button data-x="crowns">+100</button><button data-x="time">-60s</button>';
  d.addEventListener('click', async (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.r) { if (S.phase !== 'play') { S.phase = 'play'; showHUD(true); $('#sTitle').hidden = $('#sMission').hidden = true; $('#skipIntro').hidden = true; $('#pano').classList.remove('blur'); } await loadRoom(+b.dataset.r); enterRoom(); } if (b.dataset.x === 'crowns') addCrowns(100); if (b.dataset.x === 'time') S.time -= 60; });
}

/* ---------- boot ---------- */
async function boot() {
  D = await (await fetch('game.json')).json(); try { MAN = new Set(await (await fetch('assets/cut/manifest.json')).json()); } catch (e) {}
  S = newState(); const errs = await validate();
  $('#btnStart').onclick = () => { startBgm(); loadVoices(); showMission(); };
  $('#btnBegin').onclick = beginIntro;
  $('#skipIntro').onclick = () => { skipAll = true; stopSpeech(); if (S.phase === 'mission') beginIntro(); else { if (window.__tutDone) window.__tutDone(); skipSeq(); DLG.q = []; skipSeq(); } };
  $('#bCase').onclick = () => openBook(); $('#bHint').onclick = askHint; $('#bPause').onclick = openMenu;
  $('#dlg').addEventListener('click', (e) => { if (e.target.id === 'dSkip') skipSeq(); else advance(); });
  document.addEventListener('pointerdown', (e) => { if (S) S.tapAt = Date.now(); }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden && S && S.phase === 'play') openMenu(); });
  $('#debug').hidden = !DEBUG; if (DEBUG) { debugTools(errs); window.G = { get S() { return S; }, D, onHotspot, say, loadRoom, openPanel, addCrowns, solvePanel, refreshHotspots, enterRoom, hsById, get V() { return V; }, PANELS, timeUp, skipSeq, advance, startAlign }; }
  if (Q.get('skip') === '1' && DEBUG) { S.phase = 'play'; $('#sTitle').hidden = true; showHUD(true); const ri = Math.max(0, Math.min(D.rooms.length - 1, (+Q.get('room') || 1) - 1));
    if (Q.get('carry') === '1') D.rooms.slice(0, ri).forEach((r) => { S.room = D.rooms.indexOf(r); r.hotspots.forEach((h) => { S.done[h.id] = true;
      if (h.kind === 'FIND') { S.items[h.item] = { id: h.item, name: h.name, sprite: h.sprite, icon: h.icon, page: h.page || 0 }; S.order.push(h.item); if (h.page) S.pages[h.page] = true; S.crowns += h.noCrowns ? 0 : h.reward ? D.config.roomReward : D.config.pickup; }
      addClue(h, h.clue); addNotes(h.notes); }); S.complete[r.id] = S.narr[r.id] = S.entered[r.id] = S.discussed[r.id] = true; if (r.onSolve) Object.entries(r.onSolve.rename || {}).forEach(([k, n]) => { if (S.items[k]) S.items[k].name = n; }); });
    S.room = ri; await loadRoom(ri); renderHUD(); return; }
  showTitle();
}
boot();
})();
