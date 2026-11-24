// game.js: engine. All story text lives in game.json; this file only runs it.
const DEBUG = false;
const $ = s => document.querySelector(s);
const wait = ms => new Promise(r => setTimeout(r, ms));
const D2R = Math.PI / 180;
function h(tag, o = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(o)) {
    if (k === 'class') e.className = v; else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v);
  }
  kids.flat().forEach(c => c != null && e.append(c instanceof Node ? c : document.createTextNode(c)));
  return e;
}

// ---------- data, art, state ----------
let D = null, viewer = null, app, layer, S = {};
const ART = {}; // cut name -> url, only for images that exist (every image has a fallback, hard rule 6)
const MOODS = ['neutral', 'excited', 'worried', 'thinking', 'proud'];
const ART_NAMES = [
  ...MOODS.map(m => 'kael_' + m), ...MOODS.map(m => 'nira_' + m), 'guardian_awake',
  'keeper_king', 'keeper_scholar', 'keeper_lady', 'keeper_knight', 'items_01_iron_key', 'items_02_folded_paper', 'items_03_guardians_crown',
  'sigil_moon', 'sigil_time', 'sigil_knowledge', 'sigil_balance', 'sigil_star', 'sigil_light', 'sigil_seventh',
  'sym_moon', 'sym_sun', 'sym_star', 'sym_flame', 'bottle_water', 'bottle_forest', 'bottle_sun', 'bottle_moon', 'bottle_dragon',
  'btn_pause', 'btn_hint', 'btn_book', 'icon_close', 'card_frame'];
const loadArt = () => Promise.all(ART_NAMES.map(n => new Promise(res => {
  const i = new Image(); i.onload = () => { ART[n] = i.src; res(); }; i.onerror = res; i.src = `assets/cut/${n}.png`;
})));
const FB = { kael: '#3f7d4a', nira: '#1f8a86', guardian: '#8a8576', king: '#8a2a2a', scholar: '#6a4a2a', lady: '#7a5a8a', knight: '#6a7a8a', narrator: '#6a5a3a' };
// image if it exists, else a coloured disc with a letter
function img(name, cls = '', letter = '?', color = '#6a5a3a') {
  if (ART[name]) return h('img', { src: ART[name], class: cls, alt: '', draggable: 'false' });
  return h('span', { class: 'fb ' + cls, style: `background:${color}` }, letter);
}
const sealIdx = id => D.rooms.findIndex(r => r.seal.item === id);
function freshState() {
  return { room: -1, doneBy: {}, items: [], notes: [], merit: 0, hints: {}, seals: [], timeLeft: D.timer, timerOn: false, paused: false, modals: 0,
    busy: false, visited: {}, autoOpened: {}, orderProg: {}, wrong: {}, lockUntil: 0, groupSeen: {}, said: {}, exitShown: {}, sprites: [], flash: null,
    dlgPause: 0, digitsSeen: {}, idleAt: Date.now(), over: false, hintsUsedTotal: 0, nudgeTimer: null, token: 0 };
}
const room = () => D.rooms[S.room];
const done = () => S.doneBy[room().id] || (S.doneBy[room().id] = new Set());
const avail = hs => (hs.after || []).every(a => done().has(a));
const fmt = (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => o[k]);
const ui = k => D.ui[k];

// ---------- small UI pieces ----------
function addMerit(n) {
  const before = S.merit; S.merit = Math.max(0, S.merit + n); const d = S.merit - before; updateHUD();
  if (d) { const f = h('div', { class: 'float ' + (d > 0 ? 'up' : 'down') }, (d > 0 ? '+' : '') + d); $('#merit').append(f); setTimeout(() => f.remove(), 1400); }
}
function toast(text) {
  const t = h('div', { class: 'toast' }, text); app.append(t); setTimeout(() => t.classList.add('out'), 2200); setTimeout(() => t.remove(), 2800);
}
function shake() { app.classList.remove('shake'); void app.offsetWidth; app.classList.add('shake'); setTimeout(() => app.classList.remove('shake'), 700); }
const btn = (text, onclick, cls = '') => h('button', { class: 'btn ' + cls, onclick }, text);

// Dialogue card: bottom third, speaker bust, tap anywhere to continue, Skip ends this conversation.
async function say(key) {
  const lines = D.dialogues[key]; if (!lines) return;
  S.modals++; const token = S.token;
  // Kael and Nira chatting stops the clock; hints, wrong-answer help, clues spoken by others keep it running
  const pause = lines.every(l => l.speaker === 'kael' || l.speaker === 'nira') && !D.timedDialogues.includes(key);
  if (pause) S.dlgPause++;
  const ov = h('div', { class: 'ov dlg' }); document.body.append(ov);
  let skip = false, next;
  ov.addEventListener('click', () => next && next());
  for (const l of lines) {
    if (skip || token !== S.token) break;
    const sp = D.speakers[l.speaker], art = sp.art && (sp.art.startsWith('kael') || sp.art.startsWith('nira') ? `${sp.art}_${l.mood}` : sp.art);
    ov.replaceChildren(h('div', { class: 'dlg-card' + (sp.art ? '' : ' nobust') },
      sp.art ? h('div', { class: 'bust' }, img(art, '', sp.name[0], FB[l.speaker])) : null,
      h('div', { class: 'dlg-text' }, h('div', { class: 'nametag' }, sp.name), h('p', {}, l.text), h('small', {}, ui('tapContinue'))),
      btn(ui('skip'), e => { e.stopPropagation(); skip = true; next(); }, 'small skip')));
    Snd.narrate(l, sp); Snd.preload(lines[lines.indexOf(l) + 1]);
    await new Promise(r => (next = r));
  }
  Snd.cancelVoice(); ov.remove(); S.modals--; S.idleAt = Date.now(); if (pause) S.dlgPause--;
}

function visual(v, it) {
  if (!v) return null;
  if (v === 'symbols') return h('div', { class: 'vis' }, ['sym_moon', 'sym_sun', 'sym_star'].map(n => img(n, 'sym', n.slice(4)[0].toUpperCase())));
  if (v === 'bottles') return h('div', { class: 'vis' }, Object.entries(D.panels.cauldron.art).map(([k, n]) => h('div', { class: 'bot' }, img(n, 'bottle', k[0].toUpperCase()), h('small', {}, h('b', {}, D.panels.cauldron.names[k]), h('i', {}, D.panels.cauldron.desc[k])))));
  if (v.type === 'silver') return h('div', { class: 'vis silver' }, h('div', { class: 'blaze' }));
  if (v.type === 'starmap') {
    const st = v.stars, W = 300, H = 170, P = s => `${s.x * W},${s.y * H}`;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'starmap');
    svg.innerHTML = `<polyline points="${st.map(P).join(' ')}" fill="none" stroke="#e8c870" stroke-width="2" stroke-dasharray="3 5"/>` +
      st.map(s => `<circle cx="${s.x * W}" cy="${s.y * H}" r="${s.n === 1 ? 11 : 8}" fill="#fff6c8" stroke="#e8c870" stroke-width="2"/>
      <text x="${s.x * W}" y="${s.y * H + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#2a1a08">${s.n}</text>
      <text x="${s.x * W}" y="${s.y * H + (s.y < 0.5 ? -16 : 24)}" text-anchor="middle" font-size="10" fill="#f6e8b8">${s.name}</text>`).join('');
    return h('div', { class: 'vis' }, svg);
  }
  return null;
}

// Parchment card (clue, item, objective, room complete). Narrated; voice stops when it closes.
function card({ title, text, art, vis, saved, button, sealArt, audio, who }) {
  S.modals++;
  return new Promise(res => {
    const close = () => { ov.remove(); S.modals--; Snd.cancelVoice(); S.idleAt = Date.now(); res(); };
    const ov = h('div', { class: 'ov cardov' }, h('div', { class: 'card' + (ART.card_frame ? ' framed' : '') },
      h('div', { class: 'card-in' },
        h('h2', {}, title),
        art ? img(art, 'cardart', title[0]) : null, sealArt ? img(sealArt, 'cardart seal', title[0]) : null, visual(vis),
        vis === 'bottles' ? null : h('p', {}, text), saved ? h('small', { class: 'saved' }, saved) : null,
        btn(button || ui('continue'), close, 'primary'))));
    document.body.append(ov); Snd.fx('page'); Snd.narrate({ text, audioFile: audio }, D.speakers[who || 'narrator']);
  });
}
const clueCard = c => card({ title: c.title, text: c.text, vis: c.visual, saved: ui('savedNotes'), audio: c.audioFile });

// ---------- notes / items ----------
function addNote(e) { if (!S.notes.some(n => n.id === e.id)) S.notes.push({ ...e, room: S.room, seq: S.notes.length }); }
function learnNote(id, group) { const c = D.clues[id]; addNote({ id, title: c.title, text: c.text, sort: c.sort || 50, group }); }

async function flyTo(srcEl, targetEl, art, name, ms = 800, pop = false) {
  if (!targetEl) return wait(100);
  const r = targetEl.getBoundingClientRect(), g = img(art, 'ghost', (name || '?')[0]), sz = pop ? 140 : 96;
  g.style.cssText = `position:fixed;left:${innerWidth / 2 - sz / 2}px;top:${innerHeight / 2 - sz / 2}px;width:${sz}px;height:${sz}px;z-index:90;pointer-events:none;object-fit:contain`;
  if (pop) { // fade the seal in gently, let it glow for a moment, then fly
    g.style.opacity = 0; g.style.transform = 'scale(.4)'; g.style.filter = 'drop-shadow(0 0 18px #e0b64e)'; document.body.append(g); void g.offsetWidth;
    g.style.transition = 'all .7s ease-out'; g.style.opacity = 1; g.style.transform = 'scale(1)'; await wait(1300); g.style.transition = ''; g.style.transform = '';
  } else document.body.append(g);
  void g.offsetWidth; g.style.transition = `all ${ms}ms cubic-bezier(.6,-.1,.8,.6)`;
  g.style.left = r.left + r.width / 2 - 12 + 'px'; g.style.top = r.top + r.height / 2 - 12 + 'px'; g.style.width = g.style.height = '24px'; g.style.opacity = .4;
  return wait(ms).then(() => g.remove());
}

async function acquire(id) {
  const it = D.items[id];
  await card({ title: it.name, text: it.text, audio: it.audioFile, art: it.art, vis: it.visual, saved: ui('savedNotebook') });
  if (!S.items.includes(id)) { S.items.push(id); addMerit(D.scoring.find); }
  done().add(id); Snd.fx('click');
  await flyTo(null, $('#btn-book'), it.art, it.name); updateHUD();
}

// ---------- panorama, projection, hotspot layer ----------
let W = 1, H = 1;
function project(yaw, pitch) {
  const cy = viewer.getYaw() * D2R, cp = viewer.getPitch() * D2R, hf = viewer.getHfov() * D2R, y = yaw * D2R - cy, p = pitch * D2R;
  const x = Math.cos(p) * Math.sin(y), yv = Math.sin(p), z = Math.cos(p) * Math.cos(y);
  const y2 = yv * Math.cos(cp) - z * Math.sin(cp), z2 = yv * Math.sin(cp) + z * Math.cos(cp);
  if (z2 <= 0.05) return null;
  const f = (W / 2) / Math.tan(hf / 2);
  return { x: W / 2 + f * x / z2, y: H / 2 - f * y2 / z2, f, z2 };
}
function gradientImage(c) {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512; const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, c[1]); gr.addColorStop(.5, c[0]); gr.addColorStop(1, c[1]);
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
  g.strokeStyle = 'rgba(255,255,255,.07)'; for (let x = 0; x < 1024; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
  return cv.toDataURL('image/jpeg', .8);
}
async function buildViewer() {
  const scenes = {};
  for (const r of D.rooms) {
    let ok = false; try { ok = (await fetch(r.panorama, { method: 'HEAD' })).ok; } catch (e) { /* no art */ }
    r.noArt = !ok;
    scenes[r.id] = { type: 'equirectangular', panorama: ok ? r.panorama : gradientImage(r.fallback), hfov: r.start.hfov, yaw: r.start.yaw, pitch: r.start.pitch, minHfov: 30, maxHfov: 120, minPitch: -85, maxPitch: 85 };
  }
  viewer = pannellum.viewer('pano', { default: { firstScene: D.rooms[0].id, sceneFadeDuration: 700, autoLoad: true }, scenes,
    showControls: false, compass: false, keyboardZoom: true, mouseZoom: true, hfov: 100 });
  await new Promise(res => { viewer.on('load', res); setTimeout(res, 8000); });
}
function loadRoomScene(i, view) {
  const r = D.rooms[i], v = view || r.start;
  return new Promise(res => {
    const t = setTimeout(res, 8000); const fn = () => { clearTimeout(t); viewer.off('load', fn); res(); };
    viewer.on('load', fn); viewer.loadScene(r.id, v.pitch, v.yaw, v.hfov);
  });
}

function buildHotspots() {
  layer.replaceChildren(); S.sprites = [];
  const r = room();
  r.hotspots.forEach(hs => {
    if (hs.kind === 'AUTO' && !hs.tap) return;
    const el = h('button', { class: `hs k-${hs.kind.toLowerCase()}${hs.art ? ' sprite' : ''}${r.noArt ? ' labelled' : ''}`, 'aria-label': hs.label || hs.id, title: hs.label || '' },
      hs.art ? img(hs.art, 'spr') : null, h('span', { class: 'ring' }), r.noArt ? h('span', { class: 'chip' }, hs.label || hs.id) : null, h('span', { class: 'tick' }, '✓'));
    hs.el = el; layer.append(el); bindTap(el, () => tapHotspot(hs));
  });
  (r.portraits || []).forEach(p => { p.el = h('div', { class: 'digit' }, String(p.digit)); layer.append(p.el); });
  if (S.exitShown[r.id]) addExitMarker();
  if (S.room > 0 && r.back) addDoor('backmark', r.back, ui('goBack'), goBack);
}
// tap vs drag on a hotspot: a drag pans the view, so hotspots never block looking around
function bindTap(el, fn) {
  let sx, sy, drag = false, yaw0, pitch0;
  el.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; drag = false; yaw0 = viewer.getYaw(); pitch0 = viewer.getPitch(); el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => {
    if (sx == null) return; const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!drag && Math.hypot(dx, dy) > 8) drag = true;
    if (drag) { const k = viewer.getHfov() / W; viewer.setYaw(yaw0 - dx * k, false); viewer.setPitch(Math.max(-85, Math.min(85, pitch0 + dy * k)), false); }
  });
  el.addEventListener('pointerup', () => { if (sx != null && !drag) fn(); sx = null; });
  el.addEventListener('pointercancel', () => (sx = null));
}
// Door markers: "next" appears once the room is won; "back" is always there (except Room 1). Nobody is moved automatically.
function addDoor(kind, pos, label, fn) {
  const el = h('button', { class: 'door ' + kind, 'aria-label': label }, h('span', { class: 'dglyph' }, kind === 'exitmark' ? '✦' : '‹'), h('span', { class: 'chip' }, label));
  layer.append(el); if (fn) bindTap(el, fn); else el.style.pointerEvents = 'none';
  S.sprites.push({ el, yaw: pos.yaw, pitch: pos.pitch, size: pos.size || 18, min: 56 });
}
function addExitMarker() {
  const r = room(); addDoor('exitmark', r.exit, ui('goNext'), D.rooms[S.room + 1] ? goNext : null);
}
function addSprite(art, yaw, pitch, size, cls = '') {
  const el = h('div', { class: 'extra ' + cls }, img(art, 'spr', '✦')); layer.append(el); S.sprites.push({ el, yaw, pitch, size });
}
function visibleHs(hs) { return avail(hs) && !(hs.kind === 'FIND' && done().has(hs.give)); }
function frame() {
  requestAnimationFrame(frame);
  if (!viewer || S.room < 0) return;
  W = app.clientWidth; H = app.clientHeight;
  const r = room(), hf = viewer.getHfov();
  const place = (el, yaw, pitch, size, min = 44) => {
    const p = project(yaw, pitch); if (!p) { el.style.display = 'none'; return null; }
    const px = Math.max(min, p.f * size * D2R / p.z2);
    el.style.display = ''; el.style.width = el.style.height = px + 'px'; el.style.transform = `translate(${p.x - px / 2}px,${p.y - px / 2}px)`; return p;
  };
  r.hotspots.forEach(hs => {
    if (!hs.el) return;
    const show = visibleHs(hs) && !S.over; hs.el.classList.toggle('off', !show);
    if (!show) { hs.el.style.display = 'none'; return; }
    const d = done().has(hs.id) || (hs.panel && !hs.order && (D.panels[hs.panel].emits || []).every(f => done().has(f)));
    hs.el.classList.toggle('glow', !!hs.glow && !d); hs.el.classList.toggle('ok', !!hs.order && done().has(hs.id));
    hs.el.classList.toggle('flash', S.flash && S.flash.id === hs.id && S.flash.until > Date.now());
    place(hs.el, hs.yaw, hs.pitch, hs.size);
  });
  S.sprites.forEach(s => place(s.el, s.yaw, s.pitch, s.size, s.min || 20));
  (r.portraits || []).forEach(p => {   // nameplate digits: invisible when zoomed out, readable when zoomed in
    if (!p.el) return; const pr = project(p.plaqueYaw, p.plaquePitch);
    if (!pr) { p.el.style.display = 'none'; return; }
    const op = Math.max(0, Math.min(1, (60 - hf) / 20)), w = pr.f * 12 * D2R / pr.z2;
    p.el.style.display = ''; p.el.style.opacity = op; p.el.style.fontSize = w * 0.2 + 'px';
    p.el.style.transform = `translate(${pr.x}px,${pr.y}px) translate(-50%,-50%)`;
    if (op >= 0.99 && pr.x > 0 && pr.x < W && pr.y > 0 && pr.y < H && !S.digitsSeen[p.id]) {
      seeDigit(p);
    }
  });
  $('#zoomout').classList.toggle('on', hf < 60 && !S.over);
  // edge arrow toward a flashed hotspot that is off screen
  const fl = S.flash && S.flash.until > Date.now() && r.hotspots.find(q => q.id === S.flash.id), ar = $('#arrow');
  if (fl) {
    const p = project(fl.yaw, fl.pitch), inside = p && p.x > 0 && p.x < W && p.y > 0 && p.y < H;
    if (!inside) {
      let dy = ((fl.yaw - viewer.getYaw() + 540) % 360) - 180, dp = fl.pitch - viewer.getPitch(), a = Math.atan2(-dp, dy);
      ar.style.display = 'block'; ar.style.left = W / 2 + Math.cos(a) * (W / 2 - 40) + 'px'; ar.style.top = H / 2 + Math.sin(a) * (H / 2 - 110) + 'px'; ar.style.transform = `translate(-50%,-50%) rotate(${a}rad)`;
    } else ar.style.display = 'none';
  } else ar.style.display = 'none';
}
function seeDigit(p) {  // the nameplate number became readable: write it in Notes
  if (S.digitsSeen[p.id]) return; S.digitsSeen[p.id] = 1;
  addNote({ id: 'digit_' + p.id, title: '', text: fmt(ui('keeperNumber'), { name: D.speakers[p.keeper].name.replace('The ', ''), n: p.digit }), sort: 40, group: ui('numbers') });
}
function glide(pitch, yaw, hfov, ms = 1100) { viewer.lookAt(pitch, yaw, hfov, ms); return wait(ms + 80); }

// ---------- hotspot behaviour ----------
async function tapHotspot(hs) {
  if (S.busy || S.modals || S.over || S.paused || !visibleHs(hs)) return;
  S.busy = true; S.idleAt = Date.now(); const token = S.token;
  try {
    if (hs.order) await tapOrder(hs);
    else if (hs.kind === 'LEARN') await doLearn(hs);
    else if (hs.kind === 'FIND') await doFind(hs);
    else if (hs.kind === 'PANEL') await doPanel(hs);
    else if (hs.kind === 'AUTO') { done().add(hs.id); await runAuto(hs, token); }
    if (token === S.token) await runAutos();
  } finally { S.busy = false; }
}
async function emit(flag) {
  done().add(flag);
  for (const e of room().events || []) if (!done().has(e.id) && e.allOf.every(a => done().has(a))) { done().add(e.id); if (e.say) await say(e.say); }
}
function setHud(hs) { if (hs.hud) { S.hud = hs.hud; updateHUD(); } }
async function doLearn(hs) {
  const first = !done().has(hs.id), c = hs.clue && D.clues[hs.clue];
  if (!first) { if (c) await clueCard(c); if (hs.panel) await doPanel(hs, true); return; }
  if (c) { await clueCard(c); learnNote(hs.clue); }
  if (hs.note) learnNote(hs.note, ui('regrets'));
  addMerit(D.scoring.learn); done().add(hs.id); setHud(hs);
  const g = hs.group && room().groups[hs.group];
  if (g && !S.groupSeen[hs.group]) { S.groupSeen[hs.group] = 1; await say(g.firstSay); }
  if (hs.say) await say(hs.say);
  if (hs.then && hs.then.give) { await acquire(hs.then.give); if (hs.then.say) await say(hs.then.say); }
  if (hs.panel) await doPanel(hs, true);
  await emit(hs.id); startNudge(hs);
}
async function doFind(hs) {
  await acquire(hs.give); done().add(hs.id); setHud(hs);
  if (hs.say) await say(hs.say); await emit(hs.id);
}
async function doPanel(hs, chained) {
  const p = D.panels[hs.panel];
  if ((p.emits || []).every(f => done().has(f))) { done().add(hs.id); return; }
  const res = await openPanel(p, hs.panel);
  if (res === 'solved') {
    if (p.finalAnswer) { addMerit(D.scoring.final); S.timerOn = false; }
    done().add(hs.id);
    for (const f of p.emits || []) await emit(f);
    if (p.right) await say(p.right);
  }
}
async function tapOrder(hs) {
  const o = hs.order, k = o.event, idx = S.orderProg[k] || 0;
  if (Date.now() < S.lockUntil) return;
  if (o.seq[idx] === hs.id) {
    done().add(hs.id); S.orderProg[k] = idx + 1; Snd.fx('hum');
    if (idx + 1 === o.seq.length) { Snd.fx('slide'); toast(ui(o.toast)); await say(o.rightSay); await emit(k); }
  } else {
    S.orderProg[k] = 0; o.seq.forEach(s => done().delete(s)); Snd.fx('rumble'); shake(); addMerit(-D.scoring.wrong); S.lockUntil = Date.now() + D.scoring.lockout * 1000;
    S.wrong[k] = (S.wrong[k] || 0) + 1; await say(o.wrongSay);
  }
}
async function runAutos() {
  const token = S.token;
  for (;;) {
    if (token !== S.token || S.over) return;
    const next = room().hotspots.find(hs => !done().has(hs.id) && avail(hs) && ((hs.kind === 'AUTO' && !hs.tap) || (hs.autoOpen && !S.autoOpened[hs.id])));
    if (!next) return;
    if (next.kind === 'AUTO') { done().add(next.id); await runAuto(next, token); }
    else { S.autoOpened[next.id] = 1; await doPanel(next); }
  }
}
async function runAuto(hs, token) {
  for (const a of hs.auto) {
    if (token !== S.token || S.over) return;
    if (a.fx) { Snd.fx(a.fx); if (['vault', 'grind', 'rumble'].includes(a.fx)) shake(); await wait(700); }
    if (a.say) await say(a.say);
    if (a.emit) await emit(a.emit);
    if (a.show) { addSprite(a.show, hs.yaw, hs.pitch, 14, 'glowspr'); await wait(600); }
    if (a.give) await acquire(a.give);
    if (a.exit) { S.exitShown[room().id] = 1; addExitMarker(); await wait(700); }
    if (a.seal) await winSeal(token);
    if (a.win) return win();
  }
  if (token === S.token) await emit(hs.id);
}
async function winSeal(token) {
  const r = room(), s = r.seal, i = S.room;
  if (r.complete) await say(r.complete);   // the seal appears only after the room's narration is finished
  Snd.fx('seal'); addMerit(D.scoring.seal);
  if (!S.items.includes(s.item)) S.items.push(s.item);
  const flight = flyTo(null, $(`#seal${i}`), s.art, s.name, 900, true);
  await wait(1400); if (!S.seals.includes(i)) S.seals.push(i); await flight; updateHUD();
  await card({ title: fmt(ui('lessonComplete'), { n: r.n, seal: s.name }), text: fmt(ui('incantation'), { word: s.incantation }), sealArt: s.art, audio: s.audioFile, who: 'nira' });
  S.roomsDone = (S.roomsDone || []).concat(i);
  if (!s.finale && token === S.token) toast(ui('newWay'));
}

// ---------- panels ----------
async function openPanel(def, pid) {
  S.modals++; Snd.pauseVoice();
  const res = await new Promise(resolve => {
    const status = h('div', { class: 'pstatus' }), body = h('div', { class: 'pbody' });
    const closeBtn = h('button', { class: 'pclose', 'aria-label': ui('close'), onclick: () => end('closed') }, img('icon_close', '', '×'));
    const foot = h('div', { class: 'pfoot' }, btn(ui('close'), () => end('closed'), 'small'), btn(ui('pause'), () => openPause(), 'small'));
    const ov = h('div', { class: 'ov panelov' }, h('div', { class: 'panel' }, h('div', { class: 'ptitle' }, def.title), closeBtn, body, status, foot));
    let lockTimer = null, ended = false;
    const end = r => { if (ended) return; ended = true; clearInterval(lockTimer); api.stop && api.stop(); ov.remove(); resolve(r); };
    const api = {
      body, def, status, end, solved: () => end('solved'), close: end,
      locked: () => Date.now() < S.lockUntil,
      async wrong(sayKey) {
        S.wrong[pid] = (S.wrong[pid] || 0) + 1;
        if (def.penalty !== false) {
          addMerit(-D.scoring.wrong); const secs = def.lockout === 'final' ? D.scoring.finalLockout : D.scoring.lockout;
          S.lockUntil = Date.now() + secs * 1000; body.classList.add('locked');
          clearInterval(lockTimer);
          lockTimer = setInterval(() => {
            const left = Math.ceil((S.lockUntil - Date.now()) / 1000);
            if (left <= 0) { body.classList.remove('locked'); status.textContent = ''; clearInterval(lockTimer); } else status.textContent = fmt(ui('wait'), { n: left });
          }, 200);
        }
        const bank = def.wrong || [], key = sayKey || bank[Math.min(S.wrong[pid] - 1, bank.length - 1)];
        if (key) await say(key);
      },
      note: () => end('notes'),
    };
    document.body.append(ov);
    Panels[def.type](def, api, pid);
    if (def.open && !S.said[pid]) { S.said[pid] = 1; say(def.open); }
  });
  S.modals--; S.idleAt = Date.now(); Snd.resumeVoice();
  if (res === 'notes') { await openNotebook(); return openPanel(def, pid); }
  return res;
}

// ---------- notebook ----------
function openNotebook() {
  if (S.modals) return Promise.resolve();
  S.modals++; let tab = 0; Snd.pauseVoice();
  return new Promise(res => {
    const body = h('div', { class: 'nb-body' }), tabs = h('div', { class: 'tabs' });
    const draw = () => {
      tabs.replaceChildren(...ui('tabs').map((t, i) => h('button', { class: 'tab' + (i === tab ? ' on' : ''), onclick: () => { tab = i; draw(); } }, t)));
      body.replaceChildren();
      if (tab === 0) {
        const items = S.items; if (!items.length) body.append(h('p', { class: 'empty' }, ui('emptyItems')));
        items.forEach(id => { const it = D.items[id]; body.append(h('div', { class: 'row' }, img(it.art || 'bottle_water', 'rowart', it.name[0]), h('div', {}, h('b', {}, it.name), h('p', {}, it.purpose)))); });
      } else if (tab === 1) {
        if (!S.notes.length) body.append(h('p', { class: 'empty' }, ui('emptyNotes')));
        D.rooms.forEach((r, i) => {
          const ns = S.notes.filter(n => n.room === i).sort((a, b) => (a.group || '').localeCompare(b.group || '') || a.sort - b.sort || a.seq - b.seq); if (!ns.length) return;
          body.append(h('h3', {}, fmt(ui('notesRoom'), { n: r.n }) + ': ' + r.title)); let g = null;
          ns.forEach(n => { if (n.group && n.group !== g) body.append(h('h4', {}, n.group)); g = n.group; body.append(h('p', { class: 'note' }, n.title ? h('b', {}, n.title + ': ') : null, n.text)); });
        });
      } else {
        body.append(h('div', { class: 'prog' }, D.rooms.map((r, i) => h('div', { class: 'pslot' + (S.seals.includes(i) ? ' on' : '') }, img(r.seal.art, '', r.n), h('small', {}, r.seal.name)))),
          h('p', {}, `${ui('roomsDone')}: ${S.seals.length} / 7`), h('p', {}, `${ui('hintsUsed')}: ${S.hintsUsedTotal}`), h('p', {}, `${ui('merit')}: ${S.merit}`));
      }
    };
    const close = () => { ov.remove(); S.modals--; Snd.resumeVoice(); res(); };
    const ov = h('div', { class: 'ov nbov' }, h('div', { class: 'notebook' }, tabs, body, btn(ui('close'), close, 'primary')));
    document.body.append(ov); draw(); Snd.fx('page');
  });
}

// ---------- hints, idle, nudges ----------
function nextStep() { return room().hotspots.find(hs => (hs.kind !== 'AUTO' || hs.tap) && !done().has(hs.id) && avail(hs) && !(hs.panel && !hs.order && (D.panels[hs.panel].emits || []).every(f => done().has(f)))); }
async function useHint() {
  if (S.busy || S.modals || S.over || S.paused) return;
  const r = room(), used = S.hints[r.id] || 0; if (used >= 2) { toast(ui('noHints')); return; }
  if (S.merit < D.scoring.hint) { toast(ui('notEnoughMerit')); return; }
  S.hints[r.id] = used + 1; S.hintsUsedTotal++; addMerit(-D.scoring.hint); updateHUD(); S.idleAt = Date.now();
  const hd = r.hints[used]; let target = null;
  if (hd.flash !== 'none') { target = r.hotspots.find(q => q.id === hd.flash && avail(q) && !done().has(q.id)) || nextStep(); }
  if (target) { S.flash = { id: target.id, until: Date.now() + 9000 }; }
  S.busy = true; try { await say((hd.sayIf && target && hd.sayIf[target.id]) || hd.say); } finally { S.busy = false; }
}
function startNudge(hs) {
  const n = room().nudge; if (!n || n.afterDone !== hs.id || S.nudgeTimer) return;
  const id = room().id; S.nudgeTimer = setTimeout(function tick() {
    if (S.room < 0 || room().id !== id || S.over) return;
    if (n.cancelOnAny.some(x => done().has(x))) return;
    if (S.modals || S.paused) { S.nudgeTimer = setTimeout(tick, 4000); return; } say(n.say);
  }, n.seconds * 1000);
}
setInterval(() => {
  if (!S.timerOn || S.paused || S.modals || S.busy || S.over) return;
  if (Date.now() - S.idleAt > D.idle.seconds * 1000) { S.idleAt = Date.now(); say(D.idle.say); }
}, 1000);

// ---------- HUD ----------
function updateHUD() {
  if (!S.timeLeft && S.timeLeft !== 0) return;
  const t = Math.max(0, Math.ceil(S.timeLeft)); $('#timer').textContent = `⏳ ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; $('#timer').classList.toggle('low', t <= 60);
  $('#merit').firstChild.textContent = `${ui('merit')} ${S.merit}`;
  D.rooms.forEach((r, i) => $(`#seal${i}`).classList.toggle('lit', S.seals.includes(i)));
  if (S.room >= 0) {
    $('#objective').textContent = S.hud || room().objective.hud;
    const left = 2 - (S.hints[room().id] || 0); $('#hintleft').textContent = left > 0 ? fmt(ui('hintLeft'), { n: left }) : ui('noHints');
    // only list a find once its step is reachable, so the strip never spoils a later step
    const finds = []; room().hotspots.forEach(hs => { const g = hs.kind === 'FIND' ? hs.give : hs.then && hs.then.give; if (g && ((hs.strip ? hs.strip.every(f => done().has(f)) : avail(hs)) || S.items.includes(g))) finds.push(g); });
    const key = finds.map(id => id + S.items.includes(id)).join();
    if (key !== S.stripKey) { S.stripKey = key;
      $('#strip').replaceChildren(...(finds.length ? [h('span', {}, ui('findStrip'))] : []), ...finds.map(id => { const got = S.items.includes(id);
        return h('div', { class: 'fslot' + (got ? ' got' : '') }, img(D.items[id].art || 'bottle_water', 'fart', '?'), h('b', {}, got ? '✓' : '?')); })); }
  }
}
setInterval(() => {
  const now = performance.now(), dt = (now - (setInterval.last || now)) / 1000; setInterval.last = now;
  if (S.timerOn && !S.paused && !S.over && !S.dlgPause) { S.timeLeft -= dt; if (S.timeLeft <= 0) { S.timeLeft = 0; timeUp(); } updateHUD(); }
}, 200);

function buildHUD() {
  const slot = i => h('div', { class: 'sslot', id: 'seal' + i }, img(D.rooms[i].seal.art, '', i + 1));
  $('#hud').replaceChildren(
    h('div', { id: 'hudtop' },
      h('div', { id: 'topbar' }, h('div', { class: 'row' }, h('div', { id: 'timer' }), h('div', { id: 'merit' }, '', '')), h('div', { id: 'objective' })),
      h('div', { id: 'strip' })),
    h('div', { id: 'sealbox' }, h('div', { id: 'seals' }, D.rooms.map((_, i) => slot(i)))),
    h('div', { id: 'bottombar' },
      h('button', { id: 'btn-pause', class: 'rb', onclick: openPause }, img('btn_pause', '', '❚❚'), h('span', {}, ui('pause'))),
      h('button', { id: 'btn-hint', class: 'rb', onclick: useHint }, img('btn_hint', '', '?'), h('span', {}, ui('hint')), h('small', { id: 'hintleft' })),
      h('button', { id: 'btn-book', class: 'rb', onclick: () => { if (!S.modals && !S.busy && !S.over) openNotebook(); } }, img('btn_book', '', '▤'), h('span', {}, ui('notebook')))));
}

// ---------- pause ----------
function openPause() {
  if (S.over || S.paused) return;
  S.paused = true; S.modals++; Snd.pauseVoice();
  const draw = () => {
    ov.replaceChildren(h('div', { class: 'card pause' }, h('div', { class: 'card-in' }, h('h2', {}, ui('paused')),
      btn(ui('resume'), () => { ov.remove(); S.paused = false; S.modals--; S.idleAt = Date.now(); Snd.resumeVoice(); }, 'primary'),
      btn(ui(Snd.soundOn ? 'soundOn' : 'soundOff'), () => { Snd.setSound(!Snd.soundOn); draw(); }),
      btn(ui(Snd.voiceOn ? 'voiceOn' : 'voiceOff'), () => { Snd.setVoice(!Snd.voiceOn); draw(); }),
      btn(ui('restart'), () => { ov.remove(); S.paused = false; S.modals = 0; restart(); }),
      h('h3', {}, ui('howToTitle')), h('p', {}, ui('howTo')))));
  };
  const ov = h('div', { class: 'ov cardov' }); document.body.append(ov); draw();
}

// ---------- rooms ----------
async function fade(on) { const f = $('#fade'); f.classList.toggle('on', on); await wait(450); }
async function travel(i, back) {
  if (!S.visited[D.rooms[i].id]) layer.classList.add('hide');   // nothing glows while the room intro plays
  S.token++; S.busy = false; await fade(true);
  await enter(i, back ? { yaw: D.rooms[i].exit.yaw, pitch: 0, hfov: D.rooms[i].start.hfov } : null); await fade(false); S.token++; await firstEntry(i);
}
function goNext() { if (S.busy || S.modals || S.over || S.paused || !D.rooms[S.room + 1] || !S.seals.includes(S.room)) return; travel(S.room + 1); }
function goBack() { if (S.busy || S.modals || S.over || S.paused || S.room < 1) return; travel(S.room - 1, true); }
async function enter(i, view) {
  S.hud = null; S.stripKey = null; S.flash = null; clearTimeout(S.nudgeTimer); S.nudgeTimer = null;
  await loadRoomScene(i, view); S.room = i; buildHotspots(); Snd.setRoom(i); updateHUD();
  if (D.rooms[i + 1]) { const n = new Image(); n.src = D.rooms[i + 1].panorama; } // warm the next panorama
}
async function firstEntry(i) {
  const r = room(); S.idleAt = Date.now();
  if (S.visited[r.id]) return; S.visited[r.id] = 1; layer.classList.add('hide');
  const token = S.token;
  await card({ title: r.lesson, text: r.objective.card, audio: r.objective.audioFile, button: ui('continue') });
  await say(r.enter); layer.classList.remove('hide');
  if (i === 0) { const hand = h('div', { class: 'draghand' }, ui('dragHint')); app.append(hand); setTimeout(() => hand.remove(), 5000); }
  if (token === S.token) await runAutos();
}

// ---------- screens ----------
function crestSvg() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 100 100'); s.setAttribute('class', 'crest');
  s.innerHTML = '<path d="M50 8 C20 14 14 40 20 62 C26 82 42 92 50 94 C58 92 74 82 80 62 C86 40 80 14 50 8Z" fill="#2a0f16" stroke="#e0b64e" stroke-width="3"/>' +
    '<path d="M30 76 C38 64 62 64 70 76" fill="none" stroke="#e0b64e" stroke-width="2.5"/><path d="M34 68 l-4 -7 M50 62 l0 -9 M66 68 l4 -7" stroke="#e0b64e" stroke-width="2" fill="none"/>' +
    '<circle cx="50" cy="36" r="14" fill="#e8d28a"/><circle cx="56" cy="32" r="12" fill="#2a0f16"/>';
  return s;
}
function screen(cls, ...kids) { const el = h('div', { class: 'ov screen ' + cls }, ...kids); document.body.append(el); return el; }

async function splash() {
  return new Promise(res => {
    const el = screen('splash', crestSvg(), h('h1', {}, ui('titleCard')), h('p', { class: 'sub' }, D.meta.subtitle), h('button', { class: 'btn primary big', onclick: () => { el.remove(); res(); } }, ui('tapToStart')));
  });
}
function about() {
  return new Promise(res => {
    const el = screen('about', h('div', { class: 'aboutbox' }, h('h1', {}, D.about.title), ...D.about.text.map(t => h('p', {}, t))), btn(ui('begin'), () => { el.remove(); res(); }, 'primary big'));
    el.style.gap = '18px';
  });
}
async function intro() {
  S.panning = true; (function pan() { if (S.panning && viewer) { viewer.setYaw(viewer.getYaw() + 0.06, false); requestAnimationFrame(pan); } })();
  const skip = btn(ui('skip'), () => { S.introSkip = true; document.querySelectorAll('.dlg .skip').forEach(b => b.click()); }, 'small topskip'); document.body.append(skip);
  for (const st of D.intro) {
    if (S.introSkip) break;
    if (st.slam) { Snd.fx('slam'); shake(); await wait(500); }
    if (st.say) await say(st.say);
    if (st.title && !S.introSkip) { const t = screen('titlecard', h('h1', {}, ui('titleCard'))); await wait(2400); t.remove(); }
  }
  S.panning = false; skip.remove();
}
async function tutorial() {
  $('#hud').classList.add('on');
  const targets = { timer: '#timer', pause: '#btn-pause', hint: '#btn-hint', notebook: '#btn-book', seals: '#seals' };
  const ov = screen('tut'); let i = 0;
  await new Promise(res => {
    const draw = () => {
      if (i >= D.tutorial.length) { ov.remove(); return res(); }
      const st = D.tutorial[i], r = $(targets[st.target]).getBoundingClientRect(), top = r.top < innerHeight / 2;
      ov.replaceChildren(h('div', { class: 'spot', style: `left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px` }),
        h('div', { class: 'tip', style: top ? `top:${Math.max(r.bottom, $('#hudtop').getBoundingClientRect().bottom) + 16}px` : `bottom:${innerHeight - r.top + 16}px` }, h('p', {}, st.text),
          h('div', { class: 'tipbtns' }, btn(ui('skip'), () => { i = 99; draw(); }, 'small'), btn(ui('next'), () => { i++; draw(); }, 'primary small'))));
    };
    draw();
  });
}
function win() {
  S.timerOn = false; S.over = true; const bonus = Math.round(S.timeLeft) * D.scoring.perSecond; addMerit(bonus); Snd.stopMusic();
  S.result = { merit: S.merit, timeLeft: Math.round(S.timeLeft) };
  screen('end win', crestSvg(), h('h1', {}, ui('winTitle')), h('p', {}, ui('winText')),
    h('div', { class: 'stats' }, h('div', {}, `${ui('merit')}: ${S.merit}`), h('div', {}, `${ui('timeLeft')}: ${Math.floor(S.result.timeLeft / 60)}:${String(S.result.timeLeft % 60).padStart(2, '0')}`)),
    btn(ui('playAgain'), () => location.reload(), 'primary big'));
}
function timeUp() {
  if (S.over) return; S.over = true; S.timerOn = false; S.token++; Snd.cancelVoice(); Snd.stopMusic();
  document.querySelectorAll('.ov').forEach(o => o.remove()); S.modals = 0;
  screen('end lose', h('h1', {}, ui('loseTitle')), h('p', {}, ui('loseText')),
    h('div', { class: 'stats' }, h('div', {}, `${ui('meritSoFar')}: ${S.merit}`), h('div', {}, `${ui('sealsWon')}: ${S.seals.length} / 7`)),
    btn(ui('tryAgain'), () => restart(), 'primary big'));
}
async function restart() {
  document.querySelectorAll('.ov').forEach(o => o.remove()); S = freshState(); S.token = (S.token || 0) + 1; S.noIntro = true; S.timerOn = false; Snd.cancelVoice();
  await fade(true); await enter(0); updateHUD(); await fade(false); S.timerOn = true; await firstEntry(0);
}

// Dev shortcut on localhost: ?room=6 starts in that room with everything before it already won.
function prefill(n) {
  for (let k = 0; k < n; k++) {
    const r = D.rooms[k], dn = (S.doneBy[r.id] = new Set()); S.room = k; S.visited[r.id] = 1; S.seals.push(k); S.items.push(r.seal.item); S.exitShown[r.id] = 1;
    r.hotspots.forEach(hs => {
      Core.flagsOf(D, hs).forEach(f => dn.add(f)); Core.panelEmits(D, hs).forEach(f => dn.add(f)); if (hs.order) dn.add(hs.order.event);
      if (hs.clue) learnNote(hs.clue); if (hs.note) learnNote(hs.note, ui('regrets'));
      const g = hs.kind === 'FIND' ? hs.give : hs.then && hs.then.give; if (g && !S.items.includes(g)) S.items.push(g);
    });
    (r.events || []).forEach(e => dn.add(e.id)); (r.portraits || []).forEach(p => seeDigit(p));
  }
  S.room = n;
}
async function boot() {
  app = $('#app'); layer = $('#layer');
  try { D = await (await fetch('game.json')).json(); } catch (e) { document.body.append(h('pre', { class: 'fatal' }, 'Could not load game.json. Run the game from a web server: python -m http.server\n' + e)); return; }
  const errs = Core.validate(D);
  if (errs.length) { console.error(errs); document.body.append(h('pre', { class: 'fatal' }, ui('overlayError') + '\n\n' + errs.join('\n'))); throw new Error('game.json invalid: ' + errs[0]); }
  document.title = D.meta.title; S = freshState();
  await Promise.all([loadArt(), buildViewer()]);
  if (ART.card_frame) document.documentElement.style.setProperty('--frame', `url(${ART.card_frame})`);
  buildHUD(); S.room = 0; requestAnimationFrame(frame);
  $('#zoomout').addEventListener('click', () => viewer.setHfov(room().start.hfov, 600));
  layer.addEventListener('wheel', e => viewer.setHfov(Math.max(30, Math.min(120, viewer.getHfov() + e.deltaY * 0.05)), false), { passive: true });
  addEventListener('pointerdown', () => { S.idleAt = Date.now(); Snd.start(); }, { capture: true });
  if (DEBUG) {
    window.__G = { get S() { return S; }, D, say, openPanel, card, tapHotspot, travel, win, timeUp, openNotebook, get viewer() { return viewer; } };
    const out = $('#debug'); out.hidden = false; out.textContent = 'debug: click the panorama';
    app.addEventListener('click', e => { const [pitch, yaw] = viewer.mouseEventToCoords(e); out.textContent = `yaw ${yaw.toFixed(1)}  pitch ${pitch.toFixed(1)}  hfov ${viewer.getHfov().toFixed(0)}`; });
  }
  if (new URLSearchParams(location.search).get('skipintro') === '1' && DEBUG) { S.visited.room1 = 0; $('#hud').classList.add('on'); await enter(0); S.timerOn = true; Snd.start(); await firstEntry(0); return; }
  const jump = 0;
  if (jump >= 1 && jump <= D.rooms.length) {
    await splash(); Snd.start(); prefill(jump - 1); await enter(jump - 1); $('#hud').classList.add('on'); S.timerOn = true; S.idleAt = Date.now(); await firstEntry(jump - 1); return;
  }
  $('#pano').classList.add('blur'); await splash(); Snd.start(); layer.classList.add('hide'); await enter(0); updateHUD();
  await about(); await tutorial(); $('#hud').classList.remove('on');
  await intro(); $('#pano').classList.remove('blur'); layer.classList.remove('hide'); $('#hud').classList.add('on'); S.timerOn = true; S.idleAt = Date.now(); await firstEntry(0);
}
addEventListener('load', boot);
