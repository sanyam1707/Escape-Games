/* The Four Elemental Realms. All text and numbers come from game.json. */
(function () {
  'use strict';
  const L = window.Logic;
  const $ = (s) => document.querySelector(s);
  const DEBUG = false;
  let CFG, S, viewer, UI;

  /* ---------- tiny helpers ---------- */
  function el(tag, a, ...kids) {
    const e = document.createElement(tag);
    if (a) for (const [k, v] of Object.entries(a)) {
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v;
      else if (k === 'style') e.style.cssText = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
    }
    kids.flat().forEach((c) => c != null && e.append(c));
    return e;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const V = '?v=feR18'; // cache-bust: other local projects reuse the same file names
  const art = (n) => 'assets/cut/' + n + '.png' + V;
  function sprite(name, label) {
    const img = el('img', { src: art(name), alt: label || name, draggable: 'false' });
    img.onerror = () => setTimeout(() => img.replaceWith(el('span', { class: 'fb', text: label || name })), 0);
    return img;
  }
  const svg = (inner, vb, size, extra) => `<svg viewBox="${vb || '0 0 32 32'}" width="${size || 32}" height="${size || 32}" ${extra || ''}>${inner}</svg>`;
  const ICON = {
    sun: '<circle cx="16" cy="16" r="6" fill="#E2B94B"/><g stroke="#E2B94B" stroke-width="2.5" stroke-linecap="round"><path d="M16 3v5M16 24v5M3 16h5M24 16h5M7 7l3 3M22 22l3 3M25 7l-3 3M10 22l-3 3"/></g>',
    wind: '<g fill="none" stroke="#9fd0ee" stroke-width="3" stroke-linecap="round"><path d="M5 12h15a4 4 0 1 0-4-4"/><path d="M4 20h19a4 4 0 1 1-4 4"/></g>',
    wave: '<path d="M3 20q4-12 8 0t8 0 8 0" fill="none" stroke="#3aa5b0" stroke-width="3.5" stroke-linecap="round"/><path d="M3 26q4-8 8 0t8 0 8 0" fill="none" stroke="#7fd0d8" stroke-width="2.5" stroke-linecap="round"/>',
    mountain: '<path d="M3 27L13 7l5 10 4-6 7 16z" fill="#5E8F5B" stroke="#2b4a2a" stroke-width="1.5" stroke-linejoin="round"/>',
    flame: '<path d="M16 3c4 7 10 11 8 19-2 7-14 7-16 0-2-6 4-8 8-19z" fill="#e8693a" stroke="#7a2a10" stroke-width="1.5"/>'
  };
  const icon = (n, s) => svg(ICON[n], '0 0 32 32', s || 32);
  const GLYPH = {
    spiral: '<path d="M16 16a2 2 0 0 1 4 0 5 5 0 0 1-10 0 8 8 0 0 1 16 0 11 11 0 0 1-22 0" fill="none"/>',
    dots: '<circle cx="16" cy="8" r="3" fill="#ffb347"/><circle cx="8" cy="23" r="3" fill="#ffb347"/><circle cx="24" cy="23" r="3" fill="#ffb347"/>',
    crescent: '<path d="M22 5a12 12 0 1 0 0 22 9 9 0 1 1 0-22z" fill="#ffb347"/>',
    arrow: '<path d="M16 29V5M8 13l8-8 8 8" fill="none"/>',
    ring: '<circle cx="16" cy="16" r="10" fill="none"/><circle cx="16" cy="16" r="2.5" fill="#ffb347"/>',
    wavy: '<path d="M2 16q4-11 7 0t7 0 7 0 7 0" fill="none"/>',
    tower: '<path d="M9 29V12h14v17M7 12l9-8 9 8M13 29v-7h6v7" fill="none"/>'
  };
  const glyph = (n) => svg(GLYPH[n], '0 0 32 32', 38, 'stroke="#ffb347" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"');
  function moonSvg(i, size) {
    const r = 15, th = i * 45 * Math.PI / 180, rx = Math.abs(Math.cos(th)) * r;
    let lit = '';
    if (i === 4) lit = `<circle r="${r}" fill="#f4f1e6"/>`;
    else if (i !== 0) {
      const sweep = Math.cos(th) > 0 ? 0 : 1;
      lit = `<path d="M0 ${-r}A${r} ${r} 0 0 1 0 ${r}${rx < 0.5 ? `L0 ${-r}` : `A${rx} ${r} 0 0 ${sweep} 0 ${-r}`}z" fill="#f4f1e6" transform="${i > 4 ? 'scale(-1,1)' : ''}"/>`;
    }
    return svg(`<circle r="${r}" fill="#2a3358" stroke="#c9d6df" stroke-width="1.5"/>${lit}`, '-17 -17 34 34', size || 56);
  }
  const GUIDE = {
    gust: 'M50 43 L52 42 L54 43 L56 43 L59 44 L60 46 L62 48 L62 51 L62 54 L62 56 L60 59 L58 61 L55 63 L51 65 L47 65 L43 65 L39 63 L36 61 L33 58 L31 54 L29 50 L29 46 L30 41 L33 37 L36 33 L41 30 L46 28 L52 27 L58 28 L64 30 L69 33 L74 37 L77 42 L79 48 L79 54 L78 60 L75 66 L70 72 L65 76 L58 79 L50 80 L42 80 L34 78 L27 74 L21 69 L16 63 L13 55 L12 47 L13 39 L17 32 L22 25 L29 19 L37 15 L47 13 L57 12 L66 14 L76 18 L84 24 L90 32 L94 40 L96 50',
    flow: 'M6 50 L8 42 L10 35 L13 29 L15 25 L17 24 L19 25 L21 29 L24 35 L26 42 L28 50 L30 58 L32 65 L35 71 L37 75 L39 76 L41 75 L43 71 L46 65 L48 58 L50 50 L52 42 L54 35 L57 29 L59 25 L61 24 L63 25 L65 29 L68 35 L70 42 L72 50 L74 58 L76 65 L79 71 L81 75 L83 76 L85 75 L87 71 L90 65 L92 58 L94 50',
    spark: 'M50 6C58 30 84 42 78 68C73 92 27 92 22 68C18 48 40 40 50 6Z',
    root: 'M6 86L50 18L94 86Z'
  };
  const guideSvg = (f, s) => svg(`<path d="${GUIDE[f]}" fill="none" stroke="#2b2118" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 7"/>`, '0 0 100 100', s || 72);

  /* ---------- state ---------- */
  function newState() {
    return { chi: 0, time: CFG.config.timer, room: 0, cards: [], done: {}, forms: {}, marks: {}, items: {}, held: null, hints: {}, wrong: {}, discussed: {}, visited: {},
      exitOpen: {}, practice: null, idleN: {}, stats: { items: 0, secrets: 0, rewards: 0, finals: 0, hints: 0, mistakes: 0 }, pause: new Set(), playing: false, over: false,
      voice: true, music: true, sfx: true, started: false, r7: { step: 0, seq: [], pill: 0 }, found: {} };
  }
  const room = () => CFG.rooms[S.room];
  function addChi(n) { S.chi = L.clampChi(S.chi + n); $('#chi').textContent = S.chi; }
  function setPause(why, on) { on ? S.pause.add(why) : S.pause.delete(why); }
  const fmt = (t) => { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  let toastT;
  function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms || 3200); }

  /* ---------- visual effects ---------- */
  function fxLayer() { let f = $('#fx'); if (!f) { f = el('div', { id: 'fx' }); document.body.append(f); } return f; }
  function flash(kind) { const f = fxLayer(), d = el('div', { class: 'flash ' + kind }); f.append(d); setTimeout(() => d.remove(), 900); }
  function center() { const p = panels.length ? panels[panels.length - 1].el.getBoundingClientRect() : null; return p ? [p.left + p.width / 2, p.top + p.height / 2] : [innerWidth / 2, innerHeight / 2]; }
  function burst(n, colors, at, spread) {
    const f = fxLayer(), [x, y] = at || center();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, r = (spread || 160) * (0.4 + Math.random() * 0.8), s = el('i', { class: 'spark' });
      s.style.cssText = `left:${x}px;top:${y}px;background:${colors[i % colors.length]};--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r - 30}px;box-shadow:0 0 8px ${colors[i % colors.length]}`;
      f.append(s); setTimeout(() => s.remove(), 1100);
    }
  }
  function floatText(text, color, at) {
    const [x, y] = at || center(), t = el('div', { class: 'ftxt', text, style: `left:${x}px;top:${y}px;color:${color}` });
    fxLayer().append(t); setTimeout(() => t.remove(), 1400);
  }
  function fxWrong(n) {
    sfx('wrong'); flash('red'); const p = panels.length ? panels[panels.length - 1].el : null;
    if (p) { p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake'); }
    floatText('−' + n + ' ' + CFG.ui.chi, '#ff6a5a'); burst(10, ['#ff6a5a', '#8a1d14'], null, 90);
  }
  function fxRight(text, big) {
    sfx(big ? 'big' : 'right'); flash('gold'); burst(big ? 60 : 28, ['#ffd24d', '#fff4d6', '#7FB7D9', '#5E8F5B', '#e8693a'], null, big ? 260 : 170);
    if (text) floatText(text, '#ffe08a');
  }

  /* ---------- sound: music file plus synthesised effects (no extra files) ---------- */
  let AC, music;
  const ac = () => { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (AC && AC.state === 'suspended') AC.resume(); return AC; };
  function tone(f, d, type, vol, at, to) {
    const c = ac(), t = c.currentTime + (at || 0), o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + 0.05);
  }
  function noise(d, vol, f0, f1, at) {
    const c = ac(), t = c.currentTime + (at || 0), n = Math.floor(c.sampleRate * d), b = c.createBuffer(1, n, c.sampleRate), x = b.getChannelData(0);
    for (let i = 0; i < n; i++) x[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); s.buffer = b; fl.type = 'bandpass'; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1 || f0, t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); s.connect(fl).connect(g).connect(c.destination); s.start(t);
  }
  const arp = (notes, step, type, vol) => notes.forEach((f, i) => tone(f, i === notes.length - 1 ? 0.7 : 0.22, type || 'sine', vol || 0.16, i * step));
  const SFX = {
    tap: () => tone(560, 0.05, 'triangle', 0.06), tick: () => tone(900, 0.03, 'square', 0.03),
    pickup: () => { tone(880, 0.12, 'sine', 0.16); tone(1320, 0.22, 'sine', 0.14, 0.09); noise(0.2, 0.04, 4000, 7000, 0.05); },
    card: () => { noise(0.14, 0.09, 2600, 1200); tone(420, 0.09, 'triangle', 0.06, 0.03); },
    turn: () => noise(0.18, 0.1, 1200, 2400),
    wrong: () => { tone(190, 0.32, 'sawtooth', 0.12, 0, 90); tone(130, 0.35, 'square', 0.06); },
    right: () => arp([523, 659, 784], 0.1), big: () => arp([523, 659, 784, 1047, 1319], 0.12, 'triangle', 0.15),
    reward: () => { arp([392, 523, 659, 784, 1047], 0.14, 'triangle', 0.15); noise(0.8, 0.03, 3000, 8000, 0.3); },
    whoosh: () => noise(0.7, 0.12, 300, 3000), hint: () => { tone(660, 0.15, 'sine', 0.1); tone(495, 0.25, 'sine', 0.1, 0.13); },
    chime: (i) => { const f = [523, 659, 784, 988][(i || 0) % 4]; tone(f, 0.7, 'sine', 0.16); tone(f * 2, 0.5, 'sine', 0.05); },
    blip: (c) => (c === 'L' ? tone(300, 0.5, 'sine', 0.2, 0, 250) : tone(480, 0.12, 'sine', 0.2)),
    swell: () => { tone(110, 2.4, 'sawtooth', 0.04, 0, 330); tone(165, 2.4, 'sine', 0.08, 0, 495); noise(2.2, 0.05, 200, 4000); },
    rise: () => { noise(1.2, 0.08, 250, 2500); tone(220, 1.2, 'triangle', 0.08, 0, 880); },
    fanfare: () => { arp([392, 523, 659, 784], 0.16, 'triangle', 0.16); arp([523, 659, 784, 1047, 1319], 0.16, 'triangle', 0.12); },
    lose: () => arp([392, 330, 262, 196], 0.28, 'sawtooth', 0.08), click: () => { tone(300, 0.05, 'square', 0.07); noise(0.04, 0.06, 3000, 3000); }
  };
  function sfx(n, a) { if (!S || !S.sfx || !ac()) return; try { SFX[n](a); } catch (e) {} }
  function setMusic(on) {
    S.music = on; try { localStorage.setItem('fer.music', on ? '1' : '0'); } catch (e) {}
    if (!music) { music = new Audio('assets/audio/music_ambient.ogg'); music.loop = true; music.volume = CFG.config.musicVolume; }
    if (on && S.started) music.play().catch(() => {}); else music.pause();
  }

  /* ---------- voice ---------- */
  // Recorded lines (audioFile) first; the browser voice is only a fallback for lines without a file. Never two voices at once.
  let vAudio = null; const vHold = new Set(), vCache = new Map();
  function speak(text, spk) {
    const sp = CFG.speakers[spk || 'narrator'];
    if (!window.speechSynthesis || (sp && sp.silent) || vHold.has('menu') || vHold.has('book')) return;
    const u = new SpeechSynthesisUtterance(text); u.pitch = sp.pitch; u.rate = sp.rate; speechSynthesis.speak(u);
  }
  function preload(file) { if (file && !vCache.has(file)) { const a = new Audio(file + V); a.preload = 'auto'; vCache.set(file, a); } }
  function stopVoice() { if (vAudio) { vAudio.pause(); vAudio = null; } window.speechSynthesis && speechSynthesis.cancel(); }
  function playVoice(file, text, spk) {
    stopVoice(); const sp = CFG.speakers[spk || 'narrator'];
    if (!S.started || !S.voice || (sp && sp.silent)) return;
    if (!file) return speak(text, spk);
    preload(file); const a = vCache.get(file); a.currentTime = 0; vAudio = a;
    a.onerror = () => { if (vAudio === a) { vAudio = null; speak(text, spk); } };
    if (!vHold.has('menu') && !vHold.has('book')) a.play().catch(() => {});
  }
  function holdVoice(why) { vHold.add(why); if (vAudio) vAudio.pause(); window.speechSynthesis && speechSynthesis.pause(); }
  function releaseVoice(why) { vHold.delete(why); if (vHold.has('menu') || vHold.has('book') || vHold.has('panel')) return; if (vAudio && !vAudio.ended) vAudio.play().catch(() => {}); window.speechSynthesis && speechSynthesis.resume(); }

  /* ---------- dialogue: one line per tap ---------- */
  const dq = []; let cur = null;
  const lineOf = (x) => (typeof x === 'string' ? CFG.dialogue[x] : x);
  function say(items) {
    return new Promise((res) => {
      const seq = { items: [].concat(items), i: 0, res };
      if (cur && !cur.modal) endSeq(); // a quiet line gives way to a new one
      dq.push(seq); if (!cur) nextSeq();
    });
  }
  function nextSeq() { cur = dq.shift() || null; if (cur) step(); }
  function endSeq() { const c = cur; cur = null; setPause('talk', false); stopVoice(); $('#dlg').hidden = true; c && c.res(); if (!cur) nextSeq(); }
  function step() {
    const seq = cur;
    if (seq.i >= seq.items.length) return endSeq();
    const ln = lineOf(seq.items[seq.i]), sp = CFG.speakers[ln.s];
    seq.modal = !!ln.pt; setPause('talk', !!ln.pt);
    const d = $('#dlg'); d.hidden = false; d.className = ln.pt ? 'modal' : ''; d.innerHTML = '';
    const face = sp.bust || ln.s !== 'narrator' ? el('div', { class: 'face', style: 'border-color:' + sp.color }) : null;
    if (!face) {} else if (sp.bust) { const im = el('img', { src: art(sp.bust), style: 'object-fit:contain' }); im.onerror = () => { im.remove(); face.textContent = sp.name[0]; face.style.background = sp.color; }; face.append(im); } else { face.textContent = '☾'; face.style.background = sp.color; }
    const box = el('div', { class: 'box', onclick: () => { sfx('tick'); stopVoice(); seq.i++; step(); } }, face,
      el('div', { style: 'flex:1' }, el('div', { class: 'who', text: sp.name, style: 'color:' + sp.color }), el('div', { class: 'txt', text: ln.t }), el('div', { class: 'tap', text: '▸ tap' })));
    if (seq.items.length > 1 || ln.pt) box.append(el('button', { class: 'btn skipb', text: CFG.ui.skip, onclick: (e) => { e.stopPropagation(); seq.i = seq.items.length; step(); } }));
    d.append(box);
    playVoice(ln.audioFile, ln.t, ln.s); const nx = seq.items[seq.i + 1]; if (nx) preload(lineOf(nx).audioFile);
  }

  /* ---------- panels and cards ---------- */
  const panels = [];
  function openPanel(title, body, o) {
    o = o || {};
    const veil = el('div', { class: 'veil' });
    let closed, resolve = () => {}; closed = new Promise((r) => (resolve = r));
    const close = () => { if (!veil.isConnected) return; veil.remove(); panels.splice(panels.indexOf(api), 1); if (!panels.length) releaseVoice('panel'); o.onClose && o.onClose(); resolve(); };
    const p = el('div', { class: 'panel ' + (o.cls || '') }, el('button', { class: 'x', text: '✕', 'aria-label': CFG.ui.close, onclick: close }), title ? el('h2', { text: title }) : null, body);
    veil.addEventListener('pointerdown', (e) => { if (e.target === veil) close(); });
    veil.append(p); $('#panelHost').append(veil); if (vAudio && !vAudio.paused && !panels.length) holdVoice('panel');
    const api = { close, el: p, closed, veil }; panels.push(api); return api;
  }
  function showInfo(title, text, tag, extra) {
    const body = el('div', {}, tag ? el('div', { class: 'tag', text: tag }) : null, extra || null, el('pre', { text: text }), el('div', { class: 'tapc', text: '▸ ' + CFG.ui.tapContinue }));
    sfx('card'); const api = openPanel(title, body, { cls: 'card' });
    setTimeout(() => api.veil.addEventListener('pointerdown', () => api.close()), 350); return api.closed;
  }
  function addCard(id) { if (!S.cards.includes(id)) S.cards.push(id); }
  function showCard(id) { const c = CFG.cards[id]; addCard(id); return showInfo(c.title, c.text, c.type); }

  /* ---------- rooms, viewer, hotspots ---------- */
  function applyAccent(r) { document.documentElement.style.setProperty('--accent', r.accent); document.documentElement.style.setProperty('--accent2', r.accent2); }
  function loadRoom(i, blur) {
    S.room = i; const r = CFG.rooms[i]; applyAccent(r);
    if (viewer) { try { viewer.destroy(); } catch (e) {} }
    $('#pano').innerHTML = ''; $('#pano').classList.toggle('blur', !!blur);
    viewer = pannellum.viewer('pano', { type: 'equirectangular', panorama: r.pano + V, autoLoad: true, showControls: false, hfov: 100, minHfov: 55, maxHfov: 120, yaw: 0, pitch: 0, keyboardZoom: false, mouseZoom: false, friction: 0.15, compass: false });
    shown.clear(); viewer.on('load', renderHotspots);
    if (DEBUG) viewer.on('mousedown', (e) => { const c = viewer.mouseEventToCoords(e); $('#dbg').firstChild.textContent = `yaw ${c[1].toFixed(0)} pitch ${c[0].toFixed(0)}`; console.log('yaw', c[1].toFixed(1), 'pitch', c[0].toFixed(1)); });
    $('#objective').textContent = r.objective; updateHud();
  }
  const shown = new Set(); let lastTap = { id: '', t: 0 };
  function visible(h) {
    if (h.kind === 'EXIT') return !!S.exitOpen[S.room];
    if (S.done[h.id] && h.kind !== 'EXIT') return false;
    return (h.after || []).every((a) => S.done[a]);
  }
  function renderHotspots() {
    if (!viewer || !viewer.isLoaded()) return;
    room().hotspots.forEach((h) => {
      const v = DEBUG && S.dbgAll ? !S.done[h.id] : visible(h);
      if (v && !shown.has(h.id)) {
        viewer.addHotSpot({ id: h.id, yaw: h.yaw, pitch: h.pitch, type: 'custom', cssClass: 'hs fadein', createTooltipFunc: (div) => buildHs(div, h), clickHandlerFunc: () => onHotspot(h) });
        shown.add(h.id);
      } else if (!v && shown.has(h.id)) { viewer.removeHotSpot(h.id); shown.delete(h.id); }
    });
    updateStrip();
  }
  function buildHs(div, h) {
    const k = h.kind.toLowerCase(), box = el('div', { class: 'hsbox ' + k, title: h.label, role: 'button', 'aria-label': h.label });
    if (h.kind === 'FIND') box.append(sprite(h.sprite, h.label));
    else if (h.kind === 'INSPECT') box.append(sprite(h.views[0], '◉'));
    else box.append(el('span', { text: { PANEL: '✦', USE: '◎', EXIT: '➜' }[h.kind] }));
    div.append(box);
  }
  function onHotspot(h) {
    const now = Date.now(); if (lastTap.id === h.id && now - lastTap.t < 500) return; lastTap = { id: h.id, t: now };
    if (!S.playing || S.pause.size || panels.length) return;
    if (S.held && h.kind !== 'USE') return toast(CFG.ui.wrongItem);
    ({ FIND: doFind, INSPECT: doInspect, PANEL: doPanel, USE: doUse, EXIT: goNext })[h.kind](h);
  }
  function updateStrip() {
    const s = $('#strip'); s.innerHTML = '';
    room().hotspots.filter((h) => h.kind === 'FIND').forEach((h) => {
      const got = S.done[h.id]; const slot = el('div', { class: 'slot' + (got ? ' got' : ''), title: got ? h.label : '?' });
      if (got) slot.append(el('div', { style: 'width:26px;height:26px;display:grid;place-items:center;overflow:hidden' }, sprite(h.sprite, '•'))); else slot.textContent = '?';
      s.append(slot);
    });
    s.prepend(el('span', { text: CFG.ui.findStrip }));
  }
  function updateHud() {
    const used = S.hints[S.room] || 0, left = CFG.config.hintsPerRoom - used;
    $('#hintBtn').textContent = CFG.ui.hint + ' (' + left + ')';
    $('#pauseBtn').textContent = '❚❚'; $('#bookBtn').textContent = '📖 ' + CFG.ui.casebook;
    $('#holding').hidden = !S.held;
    if (S.held) { const h = $('#holding'); h.innerHTML = ''; h.append(CFG.ui.holding + ': ' + CFG.items[S.held].title, el('button', { class: 'btn', text: CFG.ui.cancel, onclick: () => { S.held = null; updateHud(); } })); }
    $('#practiceBtn').hidden = !S.practice;
    if (S.practice) $('#practiceBtn').textContent = CFG.ui.practice + ' ' + CFG.forms[S.practice].name;
    $('#chi').textContent = S.chi;
  }

  /* ---------- find, inspect, use ---------- */
  async function doFind(h) {
    sfx('pickup'); S.done[h.id] = true; S.stats.items++; addChi(CFG.config.score.item);
    const node = document.querySelector('#pano .hsbox.find img'); if (node) await fly(node);
    if (h.item) S.items[h.item] = true;
    renderHotspots(); updateHud();
    await showCard(h.card);
    if (h.say) say(h.say);
  }
  async function fly(src) {
    const r = src.getBoundingClientRect(), t = $('#bookBtn').getBoundingClientRect();
    const c = src.cloneNode(); c.className = 'fly'; c.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`; document.body.append(c);
    requestAnimationFrame(() => { c.style.left = t.left + 'px'; c.style.top = t.top + 'px'; c.style.width = '20px'; c.style.height = '20px'; c.style.opacity = '.3'; });
    await sleep(750); c.remove();
  }
  function doInspect(h) {
    let v = 0; const img = el('div', { style: 'min-height:120px' }), dots = el('div', { class: 'dots' }), cap = el('p', { style: 'text-align:center', text: CFG.ui.inspectHint });
    const draw = () => {
      img.innerHTML = ''; const name = h.views[v];
      const im = el('img', { class: 'inspimg', src: art(name), draggable: 'false', onclick: () => { sfx('turn'); if (v < h.views.length - 1) { v++; draw(); } else { v = 0; draw(); } } });
      im.onerror = () => { const alt = name.replace('detail_', 'insp_'); if (im.dataset.tried || alt === name) { im.replaceWith(el('div', { class: 'fb', style: 'font-size:20px;padding:30px', text: h.label })); } else { im.dataset.tried = 1; im.classList.add('zoom'); im.src = art(alt); } };
      img.append(im); dots.innerHTML = ''; h.views.forEach((_, i) => dots.append(el('i', { class: i === v ? 'on' : '' })));
      if (v === h.views.length - 1 && !S.done[h.id]) secret();
    };
    const secret = async () => {
      S.done[h.id] = true; S.stats.secrets++; addChi(CFG.config.score.secret); cap.textContent = CFG.ui.secretFound + ' ' + CFG.cards[h.card].text; addCard(h.card); updateHud();
      if (h.say) say(h.say);
    };
    const p = openPanel(h.label, el('div', {}, img, dots, cap), { onClose: renderHotspots }); draw();
  }
  async function doUse(h) {
    if (!S.held) return toast(CFG.ui.needItem);
    if (S.held !== h.need) return toast(CFG.ui.wrongItem);
    S.held = null; S.done[h.id] = true; renderHotspots(); updateHud();
    const r = room();
    if (r.id === 'r3') { toast('The door grinds open.'); await say(r.right.slice(r.split)); await reward(r); }
    else toast('The Owl-glass bends a beam into the court.');
  }
  function goNext() { sfx('whoosh'); stopVoice(); S.held = null; loadRoom(S.room + 1); enterRoom(); }
  async function enterRoom() {
    const r = room(), first = !S.visited[S.room]; S.visited[S.room] = true;
    if (!first) return;
    await showInfo(r.name, r.objective, 'Room ' + r.n + ' · ' + r.realm);
    await say(r.enter);
  }

  /* ---------- hints, wrong answers, lockout ---------- */
  function useHint() {
    if (!S.playing || S.pause.size) return;
    const used = S.hints[S.room] || 0;
    if (used >= CFG.config.hintsPerRoom) return toast(CFG.ui.noHints);
    if (S.chi < CFG.config.score.hint) return toast(CFG.ui.noChiHint);
    sfx('hint'); S.hints[S.room] = used + 1; S.stats.hints++; addChi(-CFG.config.score.hint); updateHud();
    say({ s: 'maren', t: room().hints[used], pt: false, audioFile: (room().hintAudio || [])[used] });
  }
  function penalty(key, lines) {
    S.stats.mistakes++; addChi(-CFG.config.score.wrong); fxWrong(CFG.config.score.wrong);
    const n = S.wrong[key] = (S.wrong[key] || 0) + 1; say(lines[Math.min(n, lines.length) - 1]);
  }
  function lock(btns, msg) {
    let n = CFG.config.lockout; btns.forEach((b) => (b.disabled = true));
    const t = setInterval(() => {
      if (!msg.isConnected) return clearInterval(t);
      n--; if (n <= 0) { clearInterval(t); btns.forEach((b) => (b.disabled = false)); msg.textContent = ''; } else msg.textContent = CFG.ui.lockout + ' ' + n + '…';
    }, 1000);
    msg.textContent = CFG.ui.lockout + ' ' + n + '…';
  }

  /* ---------- the Casebook ---------- */
  let bookTab = 'clues';
  function ringSvg() {
    const pos = { fire: [50, 14], air: [86, 50], water: [50, 86], earth: [14, 50] }, els = ['fire', 'air', 'water', 'earth'];
    let s = '<defs><marker id="ah" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto"><path d="M0 0L6 3L0 6z" fill="context-stroke"/></marker></defs>';
    CFG.marks.forEach((m) => {
      const a = pos[m.from], b = pos[m.to], got = S.marks[m.id];
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
      s += `<path d="M${a[0] + ux * 14} ${a[1] + uy * 14}L${b[0] - ux * 16} ${b[1] - uy * 16}" stroke="${got ? '#E2B94B' : '#8a7a5a'}" stroke-width="${got ? 3 : 2}" ${got ? '' : 'stroke-dasharray="3 3"'} marker-end="url(#ah)"/>`;
    });
    els.forEach((e) => { s += `<g transform="translate(${pos[e][0] - 11} ${pos[e][1] - 11}) scale(.69)"><circle cx="16" cy="16" r="17" fill="${CFG.elements[e].color}33" stroke="${CFG.elements[e].color}" stroke-width="2"/>${ICON[CFG.elements[e].glyph === 'wind' ? 'wind' : CFG.elements[e].glyph]}</g>`; });
    return svg(s, '0 0 100 100', 150, 'style="display:block;margin:0 auto;background:#fff8e6;border-radius:12px"');
  }
  function renderBook() {
    const b = $('#book'); b.innerHTML = '';
    const body = el('div', { class: 'tabbody' });
    const tabs = el('div', { class: 'tabs' }, ...['clues', 'forms', 'marks', 'items'].map((k) => el('button', { class: 'tab' + (bookTab === k ? ' on' : ''), text: CFG.ui.tabs[k], onclick: () => { bookTab = k; renderBook(); } })));
    if (bookTab === 'clues') {
      if (!S.cards.length) body.append(el('p', { text: CFG.ui.emptyClues }));
      S.cards.slice().reverse().forEach((id) => { const c = CFG.cards[id]; if (c.type === 'Item') return; body.append(el('div', { class: 'clue' }, el('b', { text: c.title }), el('pre', { text: c.text }))); });
    } else if (bookTab === 'forms') {
      Object.entries(CFG.forms).forEach(([k, f]) => body.append(el('div', { class: 'formrow' + (S.forms[k] ? '' : ' lock'), }, el('div', { html: guideSvg(k, 72) }),
        el('div', {}, el('b', { text: f.name + ' · ' + CFG.elements[f.element].name }), el('div', { text: S.forms[k] ? f.how : CFG.ui.locked })))));
    } else if (bookTab === 'marks') {
      const grid = el('div', { class: 'marks' });
      CFG.marks.forEach((m) => grid.append(el('div', { class: 'mk' + (S.marks[m.id] ? '' : ' lock') }, el('div', { class: 'mi' }, sprite(m.icon, '◎')), el('span', { text: S.marks[m.id] ? m.title : CFG.ui.locked }))));
      body.append(el('div', { html: ringSvg() }), el('p', { style: 'text-align:center;margin:4px', text: 'Fire → Air → Water → Earth → Fire' }), grid,
        el('p', { style: 'text-align:center', text: CFG.ui.roomsDone + ': ' + (CFG.rooms.filter((r, i) => S.exitOpen[i] || (i === 6 && S.done.r7_finale)).map((r) => r.n).join(', ') || '—') }));
    } else {
      const have = Object.keys(S.items).filter((k) => S.items[k]);
      if (!have.length) body.append(el('p', { text: '—' }));
      have.forEach((k) => { const it = CFG.items[k]; body.append(el('div', { class: 'formrow' }, el('div', { style: 'width:64px;height:64px;display:grid;place-items:center' }, sprite(it.icon, '◎')),
        el('div', { style: 'flex:1' }, el('b', { text: it.title }), el('div', { text: it.text })),
        S.usedItems && S.usedItems[k] ? null : el('button', { class: 'btn gold', text: CFG.ui.hold, onclick: () => { S.held = k; updateHud(); closeBook(); } }))); });
    }
    b.append(el('div', { class: 'panel' }, el('button', { class: 'x', text: '✕', onclick: closeBook }), el('h2', { text: CFG.ui.casebook }), tabs, body));
  }
  function openBook() { const b = $('#book'); b.hidden = false; holdVoice('book'); renderBook(); }
  function closeBook() { if (!$('#book').hidden) releaseVoice('book'); $('#book').hidden = true; }

  /* ---------- gesture pad ---------- */
  function openPad(o) {
    const pad = el('div', { id: 'pad' }), cv = el('canvas'), msg = el('div', { class: 'msg', style: 'text-align:center' });
    pad.append(cv, el('div', { class: 'top' }, el('h3', { text: o.title }), el('p', { text: o.help })), msg, el('button', { class: 'x', text: '✕', onclick: close }));
    document.body.append(pad);
    const g = cv.getContext('2d'); const W = (cv.width = innerWidth), H = (cv.height = innerHeight);
    let strokes = [], pts = null, lockedUntil = 0, wait;
    function drawAll() {
      g.clearRect(0, 0, W, H);
      if (o.guide) { const s = Math.min(W, H) * 0.6 / 100; g.save(); g.translate(W / 2 - 50 * s, H / 2 - 50 * s); g.scale(s, s); g.strokeStyle = '#ffffffaa'; g.lineWidth = 3; g.setLineDash([1, 7]); g.lineCap = 'round'; g.stroke(new Path2D(GUIDE[o.form])); g.restore(); }
      g.strokeStyle = '#ffd24d'; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round'; g.setLineDash([]);
      strokes.concat(pts ? [pts] : []).forEach((s) => { g.beginPath(); s.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); if (s.length === 1) g.arc(s[0].x, s[0].y, 4, 0, 7); g.stroke(); });
    }
    const pt = (e) => ({ x: e.clientX, y: e.clientY, t: performance.now() });
    cv.addEventListener('pointerdown', (e) => { if (Date.now() < lockedUntil) return; clearTimeout(wait); pts = [pt(e)]; cv.setPointerCapture(e.pointerId); drawAll(); });
    cv.addEventListener('pointermove', (e) => { if (pts) { pts.push(pt(e)); drawAll(); } });
    const up = (e) => {
      if (!pts) return; pts.push(pt(e)); strokes.push(pts); pts = null; drawAll();
      if (L.recognize(o.form, strokes, CFG)) return success();
      wait = setTimeout(fail, 1200); // a shape may take more than one stroke
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    function fail() { strokes = []; drawAll(); msg.textContent = CFG.ui.practiceFail; if (o.lockSecs) { lockedUntil = Date.now() + o.lockSecs * 1000; msg.textContent = CFG.ui.lockout + '…'; setTimeout(() => (msg.textContent = ''), o.lockSecs * 1000); } o.onFail && o.onFail(); }
    function success() { sfx('chime', 2); msg.textContent = CFG.ui.practiceDone; setTimeout(() => { close(); o.onSuccess(); }, 450); }
    function close() { clearTimeout(wait); pad.remove(); setTimeout(() => document.body.classList.toggle('padopen', padStack.length > 0), 0); const i = padStack.indexOf(close); if (i >= 0) padStack.splice(i, 1); }
    padStack.push(close); document.body.classList.add('padopen'); drawAll(); return { close };
  }
  const padStack = [];

  /* ---------- rewards ---------- */
  async function reward(r) {
    sfx('reward'); const rw = r.reward; S.stats.rewards++; addChi(CFG.config.score.reward);
    const lines = [], icons = el('div', { class: 'row' });
    if (rw.form) { S.forms[rw.form] = true; const f = CFG.forms[rw.form]; lines.push(CFG.ui.formLearned + ': ' + f.name + '\n' + f.how); icons.append(el('div', { style: 'width:72px;height:72px;display:grid;place-items:center' }, sprite(f.icon, f.name))); }
    if (rw.mark) { S.marks[rw.mark] = true; const m = CFG.marks.find((x) => x.id === rw.mark); lines.push(CFG.ui.markEarned + ': ' + m.title); icons.append(el('div', { style: 'width:72px;height:72px;display:grid;place-items:center' }, sprite(m.icon, '◎'))); }
    if (rw.item) { S.items[rw.item] = true; const it = CFG.items[rw.item]; lines.push(CFG.ui.newItem + ': ' + it.title + '\n' + it.text); icons.append(el('div', { style: 'width:72px;height:72px;display:grid;place-items:center' }, sprite(it.icon, it.title))); }
    updateHud();
    await showInfo(rw.title, lines.join('\n\n') + '\n\n+' + CFG.config.score.reward + ' ' + CFG.ui.chi, 'Reward', icons);
    if (rw.form) await practice(rw.form); else openExit();
  }
  function practice(form) {
    S.practice = form; updateHud();
    return new Promise((res) => runPractice(form, res));
  }
  function runPractice(form, res) {
    const f = CFG.forms[form];
    openPad({ form, guide: true, title: f.name, help: f.how + ' ' + CFG.ui.practiceHint, onSuccess: () => { S.practice = null; updateHud(); toast(CFG.ui.practiceDone); openExit(); res && res(); } });
    $('#practiceBtn').onclick = () => { if (!padStack.length && S.practice) runPractice(S.practice); };
  }
  function openExit() { sfx('whoosh'); S.exitOpen[S.room] = true; renderHotspots(); toast(CFG.ui.newRoom + ' ' + CFG.ui.exitHint); }

  /* ---------- puzzles ---------- */
  async function doPanel(h) {
    const r = room(), p = CFG.puzzles[r.puzzle], first = !S.discussed[r.id]; S.discussed[r.id] = true;
    const msg = el('div', { class: 'msg' }); const btn = el('button', { class: 'btn gold big', text: p.button || CFG.ui.continue });
    let body, check;
    const build = { r1, r2, r3, r4, r5, r6, r7 }[r.puzzle];
    const api = build(p, r, msg, btn, solved);
    if (first) say(r.discuss);
    function solved() { fxRight('', false); setTimeout(async () => { api.close(); S.done[h.id] = true; renderHotspots(); await afterSolved(r); }, 350); }
  }
  async function afterSolved(r) {
    if (r.id === 'r3') { await say(r.right.slice(0, r.split)); return; }
    if (r.id === 'r7') return finale();
    await say(r.right); await reward(r);
  }
  function wrongUI(key, lines, btns, msg, text) { penalty(key, lines); msg.textContent = text || ''; lock(btns, msg); }

  function r1(p, r, msg, btn, solved) {
    let sel = null; const placed = [null, null, null, null];
    const relics = el('div', { class: 'row' }), stands = el('div', { class: 'stands' });
    const rel = (x, small) => el('button', { class: 'relic' + (small ? '' : ''), 'aria-label': x.name }, sprite(x.id, x.name), el('span', { text: x.name }));
    const draw = () => {
      relics.innerHTML = ''; stands.innerHTML = '';
      p.relics.forEach((x) => { const b = rel(x); if (placed.includes(x.id)) b.classList.add('used'); if (sel === x.id) b.classList.add('sel'); b.onclick = () => { if (!placed.includes(x.id)) { sel = x.id; draw(); } }; relics.append(b); });
      placed.forEach((id, i) => {
        const s = el('div', { class: 'stand' }); if (id) { const x = p.relics.find((q) => q.id === id), b = rel(x); b.onclick = (e) => { e.stopPropagation(); placed[i] = null; draw(); }; s.append(b); }
        s.append(el('span', { text: String(i + 1) })); s.onclick = () => { if (sel && !placed[i]) { placed[i] = sel; sel = null; draw(); } }; stands.append(s);
      });
    };
    draw();
    btn.onclick = () => { if (placed.join() === p.answer.join()) solved(); else wrongUI('r1', r.wrong, [btn], msg); };
    return openPanel(p.title, el('div', {}, el('p', { text: p.text }), relics, stands, el('div', { class: 'row' }, btn), msg));
  }
  function r2(p, r, msg, btn, solved) {
    const sel = [1, 1, 1, 1], gates = el('div', { class: 'gates' });
    const draw = () => { gates.innerHTML = ''; sel.forEach((v, i) => { const b = el('button', { class: 'phase', html: moonSvg(v, 64), 'aria-label': p.phases[v] }); b.onclick = () => { sel[i] = (v + 1) % 8; draw(); }; gates.append(el('div', { class: 'gate' }, el('b', { text: 'Gate ' + 'ABCD'[i] }), b, el('small', { text: p.phases[v] }))); }); };
    draw();
    btn.onclick = () => { if (L.checkMoons(p, sel.map((v) => p.phases[v]))) solved(); else wrongUI('r2', r.wrong, [btn], msg, p.wrong); };
    return openPanel(p.title, el('div', {}, el('p', { text: p.text }), gates, el('div', { class: 'row' }, btn), msg));
  }
  function r3(p, r, msg, btn, solved) {
    const map = { F: 'fire', A: 'air', W: 'water', E: 'earth', '.': '' }, rev = { fire: 'F', air: 'A', water: 'W', earth: 'E', '': '.' };
    const b = p.given.map((row) => [...row].map((c) => map[c])), board = el('div', { class: 'board' });
    const tileEl = (e) => { if (!e) return el('span'); const t = el('div', { class: 't-' + e + ' tile' }); const im = el('img', { src: art('tile_' + e), style: 'max-width:100%;max-height:100%' }); im.onerror = () => im.replaceWith(el('span', { html: icon({ fire: 'flame', air: 'wind', water: 'wave', earth: 'mountain' }[e], 34) })); t.append(im); return t; };
    const draw = () => { board.innerHTML = ''; b.forEach((row, y) => row.forEach((e, x) => { const locked = p.given[y][x] !== '.'; const c = el('button', { class: 'cell' + (locked ? ' locked' : ''), 'aria-label': e || 'empty' }, tileEl(e)); if (!locked) c.onclick = () => { b[y][x] = p.tiles[(p.tiles.indexOf(e) + 1) % p.tiles.length]; draw(); }; board.append(c); })); };
    draw();
    btn.onclick = () => { if (L.checkLotus(p, b.map((row) => row.map((e) => rev[e]).join('')))) solved(); else wrongUI('r3', r.wrong, [btn], msg, p.wrong); };
    return openPanel(p.title, el('div', {}, el('p', { text: p.text }), board, el('div', { class: 'row' }, btn), msg));
  }
  function r4(p, r, msg, btn, solved) {
    const letters = Array(7).fill(''); let cur = 0; const top = el('div', { class: 'glyphs' }), slots = el('div', { class: 'glyphs' }), keys = el('div', { class: 'keys' });
    let at = 0;
    const draw = () => {
      top.innerHTML = ''; slots.innerHTML = ''; at = 0;
      p.groups.forEach((n, gi) => { for (let k = 0; k < n; k++) { const i = at++; top.append(el('div', { class: 'gl', html: glyph(p.scroll[i]) })); slots.append(el('button', { class: 'slotbtn' + (cur === i ? ' sel' : ''), text: letters[i] || '·', onclick: () => { cur = i; draw(); } })); } if (gi < p.groups.length - 1) { top.append(el('div', { class: 'gap' })); slots.append(el('div', { class: 'gap' })); } });
    };
    [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].forEach((c) => keys.append(el('button', { class: 'key', text: c, onclick: () => { letters[cur] = c; cur = Math.min(6, cur + 1); draw(); } })));
    draw();
    btn.onclick = () => { if (letters.join('') === p.answer) solved(); else wrongUI('r4', r.wrong, [btn], msg, p.wrong); };
    return openPanel(p.title, el('div', {}, el('p', { text: p.text }), top, slots, keys, el('div', { class: 'row' }, btn), msg));
  }
  function r5(p, r, msg, btn, solved) {
    const rh = CFG.config.rhythm; let round = 0, taps = [], busy = false, down = 0, lastT = 0, dead = false;
    const eye = el('div', { class: 'eye' }), mask = el('div', { class: 'mask' }, eye), braz = el('div', { class: 'braziers' }, ...[0, 1, 2].map(() => el('span', { class: 'braz', text: '🔥' })));
    const zone = el('div', { class: 'tapzone', text: p.tapHere });
    const watch = async () => {
      if (busy) return; busy = true; taps = []; msg.textContent = ''; await sleep(400);
      for (const c of p.rounds[round]) { if (dead) return; eye.classList.add('on'); sfx('blip', c); await sleep(c === 'S' ? rh.shortMs : rh.longMs); eye.classList.remove('on'); await sleep(rh.gapMs); }
      busy = false;
    };
    zone.addEventListener('pointerdown', (e) => { if (busy || zone.dataset.lock) return; zone.setPointerCapture(e.pointerId); const n = performance.now(); if (n - lastT > 5000) taps = []; down = n; zone.classList.add('down'); eye.classList.add('hit'); sfx('blip', 'S'); });
    const upf = () => {
      if (!down) return; const n = performance.now(); zone.classList.remove('down'); eye.classList.remove('hit'); taps.push({ down, up: n }); down = 0; lastT = n;
      const pat = p.rounds[round]; if (taps.length < pat.length) return;
      if (L.checkRhythm(pat, taps, rh)) {
        braz.children[round].classList.add('lit'); round++; taps = [];
        if (round >= p.rounds.length) solved(); else { msg.textContent = '✓'; msg.className = 'msg good'; setTimeout(() => { msg.className = 'msg'; watch(); }, 900); }
      } else { penalty('r5', r.wrong); msg.textContent = ''; zone.dataset.lock = 1; lock([btn], msg); setTimeout(() => { delete zone.dataset.lock; watch(); }, CFG.config.lockout * 1000 + 200); }
    };
    zone.addEventListener('pointerup', upf); zone.addEventListener('pointercancel', upf);
    btn.onclick = () => { if (!zone.dataset.lock) watch(); };
    const api = openPanel(p.title, el('div', {}, el('p', { text: p.text }), braz, mask, zone, el('div', { class: 'row' }, btn), msg), { onClose: () => (dead = true) });
    watch(); return api;
  }
  function r6(p, r, msg, btn, solved) {
    const st = p.start.slice(), grid = el('div', { class: 'mgrid' }); let beam = [];
    const draw = () => {
      grid.innerHTML = '';
      for (let y = 1; y <= p.size; y++) for (let x = 1; x <= p.size; x++) {
        const mi = p.mirrors.findIndex((m) => m[0] === y && m[1] === x), isBeam = beam.some((q) => q[0] === y && q[1] === x);
        const c = el('button', { class: 'cell' + (mi >= 0 ? ' mir' : '') + (isBeam ? ' beam' : '') + (y === p.lens[0] && x === p.lens[1] ? ' lens' : '') + (y === p.crystal[0] && x === p.crystal[1] ? ' crys' : ''), text: mi >= 0 ? st[mi] : y === p.lens[0] && x === p.lens[1] ? '◉' : y === p.crystal[0] && x === p.crystal[1] ? '◆' : '' });
        if (mi >= 0) c.onclick = () => { sfx('click'); st[mi] = st[mi] === '/' ? '\\' : '/'; beam = []; draw(); }; grid.append(c);
      }
    };
    draw();
    btn.onclick = () => { const t = L.traceBeam(p, st); beam = t.path; draw(); if (t.hit) solved(); else wrongUI('r6', r.wrong, [btn], msg, p.wrong); };
    return openPanel(p.title, el('div', {}, el('p', { text: p.text }), grid, el('div', { class: 'row' }, btn), msg));
  }
  function r7(p, r, msg, btn, solved) {
    const st = S.r7, body = el('div');
    const shuf = (a, n) => { let b; do { b = a.slice().sort(() => Math.random() - 0.5); } while (n && b.every((x, i) => x === a[i])); return b; }; // never leave the answer order
    if (!st.optA) { st.optA = shuf(Object.keys(CFG.elements), 1); st.optP = shuf(p.pillars.map((_, i) => i), 1); st.optC = shuf(p.choices.map((_, i) => i), 1); }
    const api = openPanel(p.title, body);
    const emb = (e) => { const x = el('div', { class: 'emb', html: icon(CFG.elements[e].glyph, 64) }); return x; };
    const draw = () => {
      body.innerHTML = ''; msg.textContent = '';
      body.append(el('div', { class: 'steps' }, ...[0, 1, 2].map((i) => el('i', { class: i < st.step ? 'done' : i === st.step ? 'on' : '' }))), el('h3', { text: p.stepTitles[st.step], style: 'margin:4px 0;font-family:var(--serif)' }), el('p', { text: p.stepTexts[st.step] }));
      if (st.step === 0) {
        const slots = el('div', { class: 'row' }), opts = el('div', { class: 'row' });
        for (let i = 0; i < 4; i++) slots.append(el('button', { class: 'slotbtn', style: 'width:64px;height:64px', html: st.seq[i] ? icon(CFG.elements[st.seq[i]].glyph, 40) : '', onclick: () => { st.seq.splice(i, 1); draw(); } }));
        st.optA.forEach((e) => { const b = el('button', { class: 'slotbtn', style: 'width:72px;height:72px', 'aria-label': CFG.elements[e].name, html: icon(CFG.elements[e].glyph, 48) }); b.onclick = () => { if (st.seq.length < 4 && !st.seq.includes(e)) { st.seq.push(e); draw(); } }; opts.append(b); });
        btn.onclick = () => { if (st.seq.join() === p.answerA.join()) { stepDone(); } else { wrongUI('r7A', ['r7.A.wrong.1', 'r7.A.wrong.2', 'r7.A.wrong.3'], [btn], msg); st.seq = []; setTimeout(() => body.isConnected && draw(), 0); } };
        body.append(slots, opts, el('div', { class: 'row' }, btn), msg);
      } else if (st.step === 1) {
        const row = el('div', { class: 'pillars' });
        st.optP.forEach((i) => row.append(el('div', { class: 'pillar' + (i < st.pill ? ' ok' : i === st.pill ? ' now' : ''), html: icon(CFG.elements[p.pillars[i].element].glyph, 44) })));
        const go = el('button', { class: 'btn gold big', text: CFG.ui.practice === 'Practise' ? 'Draw the Form' : 'Draw' });
        go.onclick = () => { const pl = p.pillars[st.pill]; openPad({ form: pl.form, guide: false, lockSecs: CFG.config.lockout, title: CFG.elements[pl.element].name + ' pillar', help: 'Draw its Form.', onFail: () => penalty('r7B', ['r7.B.wrong']), onSuccess: () => { const el0 = CFG.elements[pl.element]; flash('gold'); burst(24, [el0.color, '#fff4d6'], [innerWidth / 2, innerHeight / 2], 200); floatText(el0.name + '!', el0.color); sfx('chime', st.pill); st.pill++; if (st.pill >= 4) stepDone(); else draw(); } }); };
        body.append(row, el('div', { class: 'row' }, go), msg);
      } else {
        el('div'); body.append(el('h3', { text: p.question, style: 'text-align:center' }));
        const cs = []; st.optC.map((i) => p.choices[i]).forEach((c) => { const b = el('button', { class: 'choice', text: c.text }); b.onclick = () => { if (c.right) stepDone(); else wrongUI('r7C', ['r7.C.wrong.1', 'r7.C.wrong.2', 'r7.C.wrong.3'], cs, msg); }; cs.push(b); body.append(b); });
        body.append(msg);
      }
    };
    const stepDone = () => { S.stats.finals++; addChi(CFG.config.score.final); st.step++; fxRight('+' + CFG.config.score.final + ' ' + CFG.ui.chi, st.step >= 3); body.classList.add('lit'); setTimeout(() => body.classList.remove('lit'), 900); if (st.step >= 3) solved(); else draw(); };
    draw(); return api;
  }

  /* ---------- ending ---------- */
  async function finale() {
    await say(room().right); setPause('end', true); closeBook();
    const cine = el('div', { class: 'cine' }, el('div', { class: 'light' })), cols = [['#e8693a', '15%'], ['#9fd0ee', '38%'], ['#3aa5b0', '62%'], ['#5E8F5B', '85%']];
    $('#screen').append(cine); sfx('swell'); flash('gold'); burst(80, ['#ffd24d', '#fff4d6'], [innerWidth / 2, innerHeight * 0.45], 320);
    cols.forEach(([c, x], i) => setTimeout(() => { sfx('rise'); sfx('chime', i); cine.append(el('div', { class: 'col', style: `left:${x};background:linear-gradient(transparent,${c} 70%,#fff)` })); burst(30, [c, '#fff'], [innerWidth * parseFloat(x) / 100, innerHeight * 0.6], 140); }, 600 + i * 900));
    const rain = setInterval(() => burst(6, ['#ffd24d', '#fff4d6', '#9fd0ee'], [Math.random() * innerWidth, innerHeight * 0.9], 120), 500);
    await sleep(4800); await say(['end.1', 'end.2', 'end.3', 'end.4', 'end.5']); clearInterval(rain); cine.remove();
    winScreen();
  }
  function winScreen() {
    sfx('fanfare'); S.over = true; S.playing = false; const E = CFG.end, s = CFG.config.score, st = S.stats, bonus = Math.floor(S.time) * s.perSecond;
    const rows = [[E.lines[0], st.items * s.item], [E.lines[1], st.secrets * s.secret], [E.lines[2], st.rewards * s.reward], [E.lines[3], st.finals * s.final], [E.lines[4], bonus], [E.lines[5], st.hints], [E.lines[6], st.mistakes], [E.lines[7], S.chi + bonus]];
    const scr = el('div', { class: 'end' }, el('h1', { text: E.winTitle }), el('p', { text: E.winText }), el('table', {}, rows.map((r) => el('tr', {}, el('td', { text: r[0] }), el('td', { text: String(r[1]) })))), el('p', { text: E.sequel, style: 'font-style:italic;opacity:.8' }), el('button', { class: 'btn gold big', text: CFG.ui.playAgain, onclick: () => location.reload() }));
    $('#screen').innerHTML = ''; $('#screen').append(scr);
    let k = 0; const t = setInterval(() => { burst(30, ['#ffd24d', '#fff4d6', '#7FB7D9', '#e8693a', '#5E8F5B'], [Math.random() * innerWidth, Math.random() * innerHeight * 0.6], 150); if (++k > 8) clearInterval(t); }, 500);
  }
  function loseScreen() {
    sfx('lose'); S.over = true; S.playing = false; setPause('over', true); stopVoice(); panels.slice().forEach((p) => p.close()); padStack.slice().forEach((c) => c()); closeBook(); $('#dlg').hidden = true;
    $('#screen').innerHTML = ''; $('#screen').append(el('div', { class: 'end', style: 'background:radial-gradient(#4a1010,#0b0505)' }, el('h1', { text: CFG.end.loseTitle }), el('p', { text: CFG.end.loseText }), el('button', { class: 'btn gold big', text: CFG.ui.tryAgain, onclick: () => location.reload() })));
  }

  /* ---------- start flow: tap, mission info, tutorial, opening, play ---------- */
  function bg(div, url, fallback) { div.style.backgroundImage = `url(${url}),${fallback}`; }
  function showStart() {
    const d = el('div', { class: 'start', onclick: () => { S.started = true; setMusic(S.music); if (window.speechSynthesis) speechSynthesis.speak(new SpeechSynthesisUtterance('')); showBrief(); } }, el('div', { class: 'glass' }, el('h1', { text: CFG.ui.gameTitle }), el('div', { class: 'pulse', text: CFG.ui.tapStart })));
    bg(d, 'assets/sheets/tap_to_start.jpg' + V, 'linear-gradient(#1d2150,#0b0d22)'); $('#screen').append(d);
  }
  function showBrief() {
    const t = CFG.start; $('#screen').innerHTML = '';
    const d = el('div', { class: 'brief' }, el('div', { class: 'inner' }, el('div', { class: 'kick', text: t.kicker }), el('h1', { text: t.heading }), t.paras.map((p) => el('p', { text: p })),
      el('button', { class: 'btn gold big', text: CFG.ui.begin, onclick: () => { stopVoice(); $('#screen').innerHTML = ''; runTutorial(); } })));
    bg(d, 'assets/sheets/briefing_bg.jpg' + V, 'linear-gradient(#10163a,#3a2a3a 80%,#c98a4a)'); $('#screen').append(d);
    playVoice(t.briefAudio, [t.heading].concat(t.paras).join('. '), 'narrator'); (t.tutorial[0] || {}).audioFile && preload(t.tutorial[0].audioFile);
  }
  function runTutorial() {
    $('#hud').hidden = false; loadRoom(0, true); updateHud();
    let i = 0; const T = CFG.start.tutorial, spot = el('div', { class: 'spot' }), ring = el('div', { class: 'ring' }), card = el('div', { class: 'tcard' });
    spot.append(ring, card); document.body.append(spot);
    const show = () => {
      if (i >= T.length) { stopVoice(); spot.remove(); return opening(); }
      const s = T[i]; let r;
      if (s.spot === 'casebook') r = $('#bookBtn').getBoundingClientRect(); else if (s.spot === 'chi') { const a = $('#chiBox').getBoundingClientRect(), b = $('#clockBox').getBoundingClientRect(), c = $('#hintBtn').getBoundingClientRect(); r = { left: a.left, top: a.top, width: c.right - a.left, height: a.height }; } else r = { left: innerWidth * 0.2, top: innerHeight * 0.3, width: innerWidth * 0.6, height: innerHeight * 0.25 };
      ring.style.cssText = `left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px`;
      card.innerHTML = ''; card.append(el('p', { text: s.text }), el('div', { class: 'row' }, el('button', { class: 'btn', text: CFG.ui.skip, onclick: () => { i = T.length; show(); } }), el('span', { text: i + 1 + ' / ' + T.length }), el('button', { class: 'btn gold', text: CFG.ui.next, onclick: () => { i++; show(); } })));
      playVoice(s.audioFile, s.text, 'narrator'); if (T[i + 1]) preload(T[i + 1].audioFile);
    };
    show();
  }
  async function opening() {
    await say(CFG.start.opening);
    $('#pano').classList.remove('blur'); 
    await sleep(CFG.config.sharpenMs);
    S.playing = true; last = performance.now(); idleAt = Date.now(); S.visited[0] = true;
    await showInfo(room().name, room().objective, 'Room 1 · ' + room().realm); await say(room().enter);
  }

  /* ---------- clock, idle, pause ---------- */
  let last = performance.now(), idleAt = Date.now();
  setInterval(() => {
    const n = performance.now(), dt = (n - last) / 1000; last = n;
    if (!CFG || !S || !S.playing || S.over) return;
    if (!S.pause.size) S.time -= dt;
    if (S.time <= 10 && S.time > 0 && Math.ceil(S.time) !== S.lastSec && !S.pause.size) sfx('tick'); S.lastSec = Math.ceil(S.time);
    $('#clock').textContent = fmt(S.time); $('#clockBox').classList.toggle('low', S.time < 60);
    if (S.time <= 0) return loseScreen();
    if (!S.pause.size && !panels.length && !cur && !padStack.length && Date.now() - idleAt > CFG.config.idleSeconds * 1000) {
      idleAt = Date.now(); const k = S.room; S.idleN[k] = (S.idleN[k] || 0) + 1; say(S.idleN[k] === 1 ? 'idle' : room().idle);
    }
  }, 250);
  document.addEventListener('pointerdown', (e) => { idleAt = Date.now(); if (e.target.closest && e.target.closest('button,.hsbox,.stand,.cell')) sfx('tap'); }, true);
  function openPause() {
    if (!S.playing || $('#pause')) return; setPause('menu', true); holdVoice('menu');
    const close = () => { setPause('menu', false); releaseVoice('menu'); pm.remove(); };
    const vb = el('button', { class: 'btn', text: S.voice ? CFG.ui.voiceOn : CFG.ui.voiceOff, onclick: () => { S.voice = !S.voice; if (!S.voice) stopVoice(); vb.textContent = S.voice ? CFG.ui.voiceOn : CFG.ui.voiceOff; } });
    const mb = el('button', { class: 'btn', text: S.music ? 'Music: on' : 'Music: off', onclick: () => { setMusic(!S.music); mb.textContent = S.music ? 'Music: on' : 'Music: off'; } });
    const sb = el('button', { class: 'btn', text: S.sfx ? 'Sound effects: on' : 'Sound effects: off', onclick: () => { S.sfx = !S.sfx; try { localStorage.setItem('fer.sfx', S.sfx ? '1' : '0'); } catch (e) {} sb.textContent = S.sfx ? 'Sound effects: on' : 'Sound effects: off'; } });
    const pm = el('div', { id: 'pause', style: 'background:#0d0f1a' }, el('div', { class: 'panel' }, el('h2', { text: CFG.ui.pause }), el('button', { class: 'btn gold big', text: CFG.ui.resume, onclick: close }), vb, mb, sb, el('button', { class: 'btn', text: CFG.ui.restart, onclick: () => confirm(CFG.ui.restartConfirm) && location.reload() })));
    document.body.append(pm);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('#pause')) return $('#pause .btn').click();
    if (!$('#book').hidden) return closeBook();
    if (padStack.length) return padStack[padStack.length - 1]();
    if (panels.length) panels[panels.length - 1].close();
  });

  /* ---------- boot ---------- */
  async function boot() {
    CFG = await (await fetch('game.json' + V)).json(); S = newState();
    try { if (localStorage.getItem('fer.music') === '0') S.music = false; if (localStorage.getItem('fer.sfx') === '0') S.sfx = false; } catch (e) {}
    const errs = L.validate(CFG); if (errs.length) console.error('game.json problems:', errs);
    $('#hintBtn').onclick = useHint; $('#bookBtn').onclick = openBook; $('#pauseBtn').onclick = openPause;
    $('#book').addEventListener('pointerdown', (e) => { if (e.target.id === 'book') closeBook(); });
    UI = CFG.ui; updateHud(); $('#clock').textContent = fmt(S.time);
    if (DEBUG) {
      const d = $('#dbg'); d.hidden = false; d.append(el('div', { text: 'click the panorama' }));
      CFG.rooms.forEach((r, i) => d.append(el('button', { text: 'R' + r.n, title: 'jump here with all earlier clues, items, Forms and Marks', onclick: () => {
        S.started = true; S.playing = true; $('#screen').innerHTML = ''; $('#hud').hidden = false; $('#pano').classList.remove('blur'); stopVoice();
        for (let k = 0; k < i; k++) { const q = CFG.rooms[k]; S.visited[k] = true; S.exitOpen[k] = true; if (!S.exitOpen[k - 1] && k) S.exitOpen[k - 1] = true;
          q.hotspots.forEach((h) => { if (h.kind !== 'EXIT') { S.done[h.id] = true; if (h.card) addCard(h.card); } });
          const rw = q.reward; if (rw.form) S.forms[rw.form] = true; if (rw.mark) S.marks[rw.mark] = true; if (rw.item) S.items[rw.item] = true; if (S.items.token !== true && k >= 2) S.items.token = true; }
        if (i > 0) { S.chi = i * 3 * 5 + i * 5 + i * 30; S.stats = { items: i * 3, secrets: i, rewards: i, finals: 0, hints: 0, mistakes: 0 }; }
        S.visited[i] = true; loadRoom(i); updateHud(); } })));
      d.append(el('button', { text: 'all hotspots', onclick: () => { S.dbgAll = !S.dbgAll; shown.forEach((id) => viewer.removeHotSpot(id)); shown.clear(); renderHotspots(); } }), el('button', { text: 'exit', onclick: () => openExit() }));
      window.G = { S, CFG, say, loadRoom, reward, finale };
    }
    showStart();
  }
  boot();
})();
