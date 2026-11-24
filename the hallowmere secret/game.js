/* The Hollowmere Secret - engine. All text, numbers and names come from game.json. */
(function () {
  'use strict';
  var Logic = window.Logic;
  var qs = new URLSearchParams(location.search);
  var DEBUG = false; // production build

  // ---------- tiny helpers ----------
  function $(s, r) { return (r || document).querySelector(s); }
  function h(tag, a) {
    var e = document.createElement(tag), kids = Array.prototype.slice.call(arguments, 2);
    for (var k in (a || {})) {
      var v = a[k];
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v;
      else if (k === 'on') { for (var ev in v) e.addEventListener(ev, v[ev]); }
      else if (k === 'style') Object.assign(e.style, v); else e.setAttribute(k, v);
    }
    (function add(list) { list.forEach(function (c) { if (Array.isArray(c)) add(c); else if (c != null && c !== false) e.append(c); }); })(kids);
    return e;
  }
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  function fmt(t) { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }

  var D, S, viewer = null, cfg, ui;
  // Art URLs carry a version so a browser never shows cached images of another project served from the same localhost port.
  function A(u) { return u + '?v=' + (cfg ? cfg.assetVersion : 0); }
  function cutUrl(name) { return A('assets/cut/' + name + '.' + ((cfg && cfg.cutExt) || 'png')); } // the dist build ships smaller webp sprites
  // The debug handle exists only in debug mode (localhost + ?debug=1). Production builds set DEBUG to false, so nothing is exposed.
  var G = window.G = DEBUG ? { get S() { return S; }, get D() { return D; } } : {};

  // ---------- sprites with fallbacks ----------
  // A cut PNG if it exists, otherwise a coloured shape with an initial (hard rule 6).
  function sprite(name, o) {
    o = o || {};
    var size = o.size || 64, wrap = h('span', { class: 'sprite-wrap', style: { display: 'inline-grid', placeItems: 'center' } });
    function fb() {
      wrap.innerHTML = '';
      var f = h('span', { class: 'fallback-sprite' + (o.mark ? ' mark' : '') + (o.circle ? ' circle' : ''), text: o.initial || '?',
        style: { width: size + 'px', height: Math.round(size * (o.ratio || 1)) + 'px', background: o.color || '#555', fontSize: Math.round(size * .42) + 'px' } });
      wrap.append(f);
    }
    if (!name) { fb(); return wrap; }
    var img = new Image();
    img.className = 'sprite'; img.alt = ''; img.draggable = false;
    img.style.maxWidth = size + 'px'; img.style.maxHeight = size * (o.ratio || 1) * 1.6 + 'px';
    img.onerror = fb; img.src = cutUrl(name);
    wrap.append(img); return wrap;
  }
  function itemSprite(id, size) {
    var it = D.items[id] || {};
    return sprite(it.sprite || id, { size: size || 64, color: it.color, initial: it.initial, mark: id.indexOf('mark_') === 0 });
  }
  function icon(name, glyph) {
    var s = h('span', { text: glyph }), img = new Image(); img.alt = ''; img.draggable = false;
    img.onload = function () { s.replaceWith(img); }; img.src = cutUrl(name); return s;
  }

  // ---------- audio ----------
  var AC = null, master = null, soundOn = true, voiceOn = true;
  function initAudio() {
    startBgm();
    if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = soundOn ? 1 : 0; master.connect(AC.destination); } catch (e) { AC = null; }
  }
  function tone(f, dur, type, vol, when, slideTo) {
    if (!AC || !soundOn) return;
    var t = AC.currentTime + (when || 0), o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || .2, t + .02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
  }
  function noise(dur, lp, vol, when) {
    if (!AC || !soundOn) return;
    var t = AC.currentTime + (when || 0), len = Math.floor(AC.sampleRate * dur), b = AC.createBuffer(1, len, AC.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
    s.buffer = b; f.type = 'lowpass'; f.frequency.value = lp || 1200; g.gain.value = vol || .2; s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }
  var NOTE = { red: 261.6, blue: 329.6, green: 392, gold: 523.3, violet: 659.3 };
  var SFX = {
    bellLong: function () { tone(220, 2.2, 'sine', .35); tone(442, 1.6, 'sine', .15); tone(660, 1, 'sine', .08); },
    bellShort: function () { tone(220, .6, 'sine', .35); tone(442, .4, 'sine', .15); },
    flat: function () { tone(110, .5, 'sawtooth', .15, 0, 90); },
    thunder: function () { noise(2.5, 300, .5); }, gate: function () { noise(.6, 600, .3); tone(70, 1.2, 'square', .1, 0, 50); },
    page: function () { noise(.25, 3000, .1); }, snap: function () { noise(.1, 4000, .3); tone(500, .1, 'square', .1, 0, 200); },
    wail: function () { tone(300, .9, 'sawtooth', .18, 0, 110); tone(310, .9, 'sawtooth', .12, 0, 118); },
    water: function () { noise(1.2, 900, .18); tone(300, .8, 'sine', .05, 0, 700); },
    clunk: function () { tone(90, .25, 'square', .25, 0, 50); noise(.12, 500, .3); }, scrape: function () { noise(1.2, 500, .2); },
    scratch: function () { noise(.12, 2500, .12); }, crack: function () { noise(.2, 3500, .4); tone(120, .3, 'square', .12, 0, 60); },
    hum: function () { tone(70, 3, 'sine', .2); tone(105, 3, 'sine', .1); }, bell: function () { for (var i = 0; i < 13; i++) tone(i < 12 ? 196 : 174, 1.6, 'sine', .22, i * .9); },
    ping: function () { tone(880, .35, 'sine', .15); tone(1320, .3, 'sine', .08, .08); }, pick: function () { tone(660, .2, 'triangle', .15); tone(990, .25, 'triangle', .1, .08); },
    reward: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, .8, 'sine', .15, i * .12); }); },
    note: function (c) { tone(NOTE[c] || 440, 1, 'sine', .25); tone((NOTE[c] || 440) * 2, .7, 'sine', .06); },
    organ: function (c) { var f = (NOTE[c] || 330) / 2; tone(f, 1.2, 'sawtooth', .07); tone(f * 2, 1.2, 'square', .04); },
    chime: function (c) { tone((NOTE[c] || 440) * 2, 1.8, 'sine', .2); }
  };
  function sfx(n, a) { try { if (SFX[n]) SFX[n](a); } catch (e) { } }
  // Background music: one CC0 track on loop (config.bgm). Ducks under the recorded voice.
  var bgm = null;
  function startBgm() {
    var c = cfg.bgm; if (!c || bgm) return;
    bgm = new Audio(A(c.file)); bgm.loop = true; bgm.volume = c.volume; bgm.muted = !soundOn;
    var p = bgm.play(); if (p && p.catch) p.catch(function () { bgm = null; }); // blocked until a tap: try again on the next call
  }
  function duck(on) { if (bgm && cfg.bgm) bgm.volume = on ? cfg.bgm.duckVolume : cfg.bgm.volume; }
  function setSound(on) { soundOn = on; if (master) master.gain.value = on ? 1 : 0; if (bgm) bgm.muted = !on; }

  // ---------- narration ----------
  // One narrate(line, file). A recorded file (line[3] or `file`) plays when there is one; the browser voice is only the fallback.
  // Never two voices at once: every call stops the previous one first.
  var speaking = null, voice = null, preloaded = {};
  function preload(src) { if (src && !preloaded[src]) { var a = new Audio(A(src)); a.preload = 'auto'; preloaded[src] = a; } }
  function speak(line, resolve) {
    var sp = D.speakers[line[0]] || D.speakers.narrator;
    if (!window.speechSynthesis) return resolve(false);
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(line[2]); u.pitch = sp.pitch; u.rate = sp.rate;
      var done = false, fin = function () { if (!done) { done = true; speaking = null; resolve(true); } };
      u.onend = fin; u.onerror = fin; speaking = fin; window.speechSynthesis.speak(u);
      setTimeout(fin, 14000);
    } catch (e) { resolve(false); }
  }
  function narrate(line, file) {
    stopNarration();
    return new Promise(function (resolve) {
      if (!voiceOn) return resolve(false);
      var src = file || line[3];
      if (!src) return speak(line, resolve);
      var a = preloaded[src] || new Audio(A(src)); delete preloaded[src];
      voice = a; duck(true); a.currentTime = 0;
      var fin = function (ok) { if (voice === a) { voice = null; duck(false); } resolve(ok); };
      a.onended = function () { fin(true); };
      a.onerror = function () { if (voice === a) { voice = null; duck(false); speak(line, resolve); } };
      var p = a.play(); if (p && p.catch) p.catch(function () { if (voice === a) { voice = null; duck(false); speak(line, resolve); } });
    });
  }
  function stopNarration() {
    if (voice) { voice.onended = voice.onerror = null; voice.pause(); voice = null; duck(false); }
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { }
    if (speaking) speaking();
  }
  function pauseNarration() { if (voice) voice.pause(); try { if (window.speechSynthesis && window.speechSynthesis.speaking) window.speechSynthesis.pause(); } catch (e) { } }
  function resumeNarration() { if (voice) { var p = voice.play(); if (p && p.catch) p.catch(function () { }); } try { if (window.speechSynthesis) window.speechSynthesis.resume(); } catch (e) { } }

  // keep dialogue and the find-strip clear of the HUD and the bottom bar at any screen size
  function syncBar() { var s = document.documentElement.style; s.setProperty('--bar-h', $('#bar').offsetHeight + 'px'); s.setProperty('--hud-h', $('#hud').offsetHeight + 'px'); }

  // ---------- layer, modals ----------
  var layer, modals = [];
  function updatePause2() { $('#btn-pause2').hidden = !(modals.length || S && S.cine); }
  function openModal(box, o) {
    o = o || {};
    var m = h('div', { class: 'modal' }, box), api = { el: m, box: box, closed: false };
    api.close = function (res) {
      if (api.closed) return; api.closed = true;
      m.remove(); modals = modals.filter(function (x) { return x !== api; }); updatePause2(); if (o.onClose) o.onClose(res);
    };
    if (o.closable !== false) {
      var x = h('button', { class: 'xbtn', 'aria-label': ui.close, on: { click: function () { api.close(); } } }, icon('icon_close', '✕'));
      box.append(x);
      m.addEventListener('pointerdown', function (e) { if (e.target === m && !dlgActive) api.close(); });
    }
    layer.append(m); modals.push(api); updatePause2(); return api;
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modals.length && !S.pause) modals[modals.length - 1].close();
  });
  function toast(t, ms) {
    var el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t);
    toast.t = setTimeout(function () { el.classList.remove('on'); }, ms || 2400);
  }
  function showCard(o) {
    return new Promise(function (resolve) {
      var box = h('div', { class: 'panelbox cardbox' },
        h('h2', { text: o.title || '' }),
        o.thumb ? h('div', { class: 'thumb' }, o.thumb) : null,
        h('p', { text: o.text || '' }),
        o.dots ? h('div', { class: 'dots' }, o.dots.map(function (c) { return h('span', { class: 'dot', style: { background: D.colors[c] } }); })) : null,
        o.slip ? h('p', { class: 'slipline', text: o.slip }) : null,
        o.saved ? h('span', { class: 'saved', text: o.saved }) : null,
        h('div', { class: 'row' }, h('button', { class: 'btn', text: o.btn || ui.ok, on: { click: function () { m.close(); } } })));
      var m = openModal(box, { onClose: function () { stopNarration(); resolve(); } });
      sfx(o.sfx || 'page'); if (o.text) narrate([o.voice || 'narrator', 'neutral', o.text + (o.slip ? ' ' + o.slip : '')], o.audio);
    });
  }

  // ---------- dialogue ----------
  var dlgChain = Promise.resolve(), dlgActive = null;
  function say(lines, o) {
    lines = (lines || []).filter(Boolean);
    if (!lines.length) return Promise.resolve();
    dlgChain = dlgChain.then(function () { return runDialogue(lines, o || {}); });
    return dlgChain;
  }
  function runDialogue(lines, o) {
    return new Promise(function (resolve) {
      var i = 0, box = null, timer = null, finished = false, token = 0;
      var chat = !o.timed && lines.every(function (l) { return l[0] === 'mirela' || l[0] === 'pip'; });
      if (chat) S.dlgPause++;
      var root = h('div', { id: 'dlg' });
      layer.append(root);
      function end() {
        if (finished) return; finished = true; clearTimeout(timer); stopNarration(); root.remove(); dlgActive = null; if (chat) S.dlgPause--; resolve();
      }
      dlgActive = { skipAll: end };
      function next() {
        clearTimeout(timer); stopNarration();
        if (finished) return;
        if (i >= lines.length) return end();
        syncBar(); var ln = lines[i++], sp = D.speakers[ln[0]] || D.speakers.narrator, my = ++token;
        var bust = null;
        if (sp.note) bust = h('div', { class: 'notebust', text: '✉' });
        else if (sp.bust) bust = sprite(sp.bust.slice(-1) === '_' ? sp.bust + (ln[1] || 'neutral') : sp.bust, { size: 78, circle: true, color: sp.color, initial: sp.initial });
        root.innerHTML = '';
        box = h('div', { class: 'dbox' + (ln[0] === 'narrator' ? ' narr' : '') + (sp.note ? ' notebox' : ''), on: { click: next } },
          bust ? h('div', { class: 'dbust' }, bust) : null,
          h('div', { class: 'dtext' }, h('div', { class: 'dname', text: sp.name }), h('div', { class: 'dline', text: ln[2] }), h('div', { class: 'dtap', text: ui.tapContinue + ' ▸' })),
          h('button', { class: 'dskip', text: ui.skip, on: { click: function (e) { e.stopPropagation(); end(); } } }));
        root.append(box);
        preload((lines[i] || [])[3]); narrate(ln); // voice only; the player taps to continue, nothing advances on its own
      }
      next();
    });
  }

  // ---------- state ----------
  function freshState() {
    return { roomIdx: 0, done: {}, flags: {}, items: [], held: null, notes: [], marks: [], pages: [], found: {}, score: 0, timeLeft: cfg.timerSeconds,
      running: false, pause: false, ending: false, cine: false, hints: {}, wrongIdx: {}, lockUntil: 0, busy: false, snap: null, roomsDone: 0, idleAt: 0, pumping: false, exitShown: {}, rewarded: {}, decor: {}, dlgPause: 0, strikes: {} };
  }
  function room() { return D.rooms[S.roomIdx]; }
  function hsById(id) { return room().hotspots.filter(function (x) { return x.id === id; })[0]; }
  function avail(x) { return !S.done[x.id] && (x.after || []).every(function (a) { return S.done[a]; }); }
  function addScore(n) {
    S.score = Math.max(0, S.score + n); var el = $('#score'); el.textContent = S.score;
    el.parentNode.style.transform = 'scale(1.15)'; setTimeout(function () { el.parentNode.style.transform = ''; }, 250);
  }
  function addNote(n) { if (!S.notes.some(function (x) { return x.id === n.id; })) S.notes.push(n); }
  function noteFrom(id, extra) { var n = D.notes[id]; return n && Object.assign({ id: id }, n, extra || {}); }
  function addItems(ids) { ids.forEach(function (i) { if (S.items.indexOf(i) < 0) { S.items.push(i); } }); }
  function removeItem(i) { S.items = S.items.filter(function (x) { return x !== i; }); if (S.held === i) S.held = null; renderTray(); }
  function itemName(id) { var it = D.items[id]; return it.name + (id === 'watering_can' && S.flags.can_full ? ' (full)' : ''); }

  // ---------- HUD ----------
  function buildHud() {
    $('#lbl-ev').textContent = ui.evidence;
    var pg = $('#hud-pages'); pg.innerHTML = '';
    D.casePages.forEach(function (_, i) { pg.append(h('span', { class: 'seal', id: 'seal' + i, text: String(i + 1) })); });
    [['#btn-pause', 'btn_pause', '❚❚', ui.pause], ['#btn-pause2', 'btn_pause', '❚❚', ui.pause], ['#btn-hint', 'btn_hint', '❖', ui.hint], ['#btn-book', 'btn_casebook', '☰', ui.casebook]].forEach(function (b) {
      var el = $(b[0]); el.innerHTML = ''; el.append(icon(b[1], b[2])); el.title = b[3]; el.setAttribute('aria-label', b[3]);
    });
    $('#lbl-pause').textContent = ui.pause; $('#lbl-book').textContent = ui.casebook; $('#lbl-obj').textContent = ui.objectiveLabel;
    $('#btn-pause').onclick = $('#btn-pause2').onclick = pauseMenu;
    if (window.ResizeObserver) { new ResizeObserver(syncBar).observe($('#bar')); new ResizeObserver(syncBar).observe($('#hud')); }
    addEventListener('resize', syncBar); syncBar();
    $('#btn-hint').onclick = useHint; $('#btn-book').onclick = function () { openCasebook(); };
  }
  function refreshHud() {
    $('#score').textContent = S.score;
    S.pages.forEach(function (p) { var s = $('#seal' + (p - 1)); if (s) s.classList.add('lit'); });
    $('#hud-time').classList.toggle('low', S.timeLeft <= 60);
    $('#time').textContent = fmt(S.timeLeft);
    var left = cfg.hintsPerRoom - (S.hints[room().id] || 0); $('#lbl-hint').textContent = ui.hint + ' · ' + ui.hintsLeft.replace('{n}', left);
  }
  function renderStrip() {
    var el = $('#strip'); el.innerHTML = '';
    var finds = room().hotspots.filter(function (x) { return x.kind === 'FIND' && !x.mark && x.give; });
    // only this room's FIND items; a slot per item, filled when found
    finds.forEach(function (x) {
      x.give.forEach(function (id) {
        var got = S.done[x.id]; var slot = h('span', { class: 'slot' + (got ? ' got' : ''), title: got ? itemName(id) : '?' });
        if (got) slot.append(itemSprite(id, 26)); else slot.textContent = '?';
        el.append(slot);
      });
    });
    el.hidden = !finds.length || !S.running && !S.started;
  }
  function renderTray() {
    var t = $('#tray'); t.innerHTML = '';
    if (!S || !S.held) { t.hidden = true; } else {
      t.hidden = false; t.append(h('div', { class: 'thumb' }, itemSprite(S.held, 36)), h('span', { html: '<b>' + itemName(S.held) + '</b><br><small>' + ui.putBack + '</small>' }));
      t.onclick = function () { S.held = null; renderTray(); refreshHotspots(); };
    }
  }

  // ---------- time ----------
  var last = 0;
  setInterval(function () {
    var now = performance.now(), dt = (now - last) / 1000; last = now;
    if (!S || !S.running || S.pause || S.ending) return;
    var stopped = S.dlgPause > 0; $('#hud-time').classList.toggle('stopped', stopped);
    if (stopped) return;
    if (dt > 1) dt = .25;
    S.timeLeft -= dt; refreshHud();
    if (S.timeLeft <= 0) { S.timeLeft = 0; refreshHud(); lose(); }
    if (S.idleAt && now > S.idleAt + cfg.idleSeconds * 1000 && !dlgActive && !modals.length && !S.busy) { S.idleAt = now; say([D.ui.idle], { timed: true }); }
  }, 250);
  document.addEventListener('pointerdown', function () { if (S) S.idleAt = performance.now(); });

  // ---------- panorama + hotspots ----------
  var refs = {}, hsAdded = {};
  function pickPano(r) {
    return new Promise(function (resolve) {
      var i = 0;
      (function tryNext() {
        if (i >= r.pano.length) return resolve(null);
        var im = new Image(), u = A(r.pano[i++]); im.onload = function () { resolve(u); }; im.onerror = tryNext; im.src = u;
      })();
    });
  }
  function fallbackPano(r) {
    var c = document.createElement('canvas'); c.width = 2048; c.height = 1024; var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, 1024); g.addColorStop(0, '#05040a'); g.addColorStop(.5, r.accent); g.addColorStop(.52, '#0b0a10'); g.addColorStop(1, '#1b1824');
    x.fillStyle = g; x.fillRect(0, 0, 2048, 1024);
    x.strokeStyle = 'rgba(255,255,255,.07)'; x.lineWidth = 2;
    for (var i = 0; i < 2048; i += 128) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 1024); x.stroke(); }
    x.fillStyle = 'rgba(255,255,255,.35)'; x.font = '40px serif'; x.textAlign = 'center';
    [[0, 'FRONT'], [90, 'RIGHT'], [-90, 'LEFT'], [180, 'BEHIND']].forEach(function (a) { x.fillText(a[1], ((a[0] + 180) / 360) * 2048, 300); });
    return c.toDataURL('image/jpeg', .8);
  }
  var panoToken = 0;
  async function loadPano(r) {
    var my = ++panoToken, url = await pickPano(r), usedFallback = !url;
    if (my !== panoToken) return;
    if (viewer) { try { viewer.destroy(); } catch (e) { } viewer = null; }
    $('#pano').innerHTML = ''; refs = {}; hsAdded = {}; S.fallbackPano = usedFallback;
    document.documentElement.style.setProperty('--accent', r.accent);
    await new Promise(function (resolve) {
      viewer = pannellum.viewer('pano', { type: 'equirectangular', panorama: url || fallbackPano(r), autoLoad: true, showControls: false, showFullscreenCtrl: false, showZoomCtrl: false,
        hfov: cfg.hfov, minHfov: 55, maxHfov: 120, yaw: 0, pitch: 0, mouseZoom: true, keyboardZoom: false, compass: false, draggable: true, friction: .12 });
      viewer.on('load', resolve); viewer.on('error', resolve); setTimeout(resolve, 8000);
    });
    if (DEBUG) {
      $('#pano').addEventListener('mousedown', function (e) { S._dx = e.clientX; S._dy = e.clientY; });
      $('#pano').addEventListener('mouseup', function (e) {
        if (Math.abs(e.clientX - S._dx) + Math.abs(e.clientY - S._dy) > 5) return;
        var c = viewer.mouseEventToCoords(e), t = 'pitch ' + c[0].toFixed(1) + '  yaw ' + c[1].toFixed(1);
        $('#debug').hidden = false; $('#debug').textContent = t; console.log('[debug] ' + t);
      });
    }
  }
  var downAt = { x: 0, y: 0 };
  document.addEventListener('pointerdown', function (e) { downAt = { x: e.clientX, y: e.clientY }; }, true);
  function hsKind(x) { return x.kind; }
  function addHotspot(x) {
    if (hsAdded[x.id]) return;
    hsAdded[x.id] = true;
    var size = x.size || 56;
    viewer.addHotSpot({ id: x.id, pitch: x.pitch, yaw: x.yaw, type: 'custom', cssClass: 'hs-base',
      createTooltipFunc: function (div) {
        div.style.background = 'none'; div.style.borderRadius = '0'; div.style.border = '0'; div.style.setProperty('--s', size + 'px'); div.style.width = size + 'px'; div.style.height = size + 'px';
        var inner = h('div', { class: 'hs', 'aria-label': x.label || '', title: x.label || '', style: { '--s': size + 'px' } });
        inner.append(h('span', { class: 'hit' }));
        if (x.exit) { inner.classList.add('exit'); inner.append(h('span', { class: 'arrow', text: '➤' })); }
        else if (x.kind === 'FIND') inner.append(sprite(x.sprite || null, { size: size, color: (D.items[x.give[0]] || {}).color, initial: (D.items[x.give[0]] || {}).initial, mark: !!x.mark }));
        else if (S.fallbackPano) inner.append(h('span', { class: 'fb-pano-label', text: x.label || x.id }));
        if (x.kind === 'INSPECT') inner.append(h('span', { class: 'rot' }, icon('icon_rotate', '↻')));
        div.append(inner); refs[x.id] = div;
      },
      clickHandlerFunc: function (e) {
        if (Math.abs(e.clientX - downAt.x) + Math.abs(e.clientY - downAt.y) > 8) return; // it was a drag
        activate(x);
      } });
  }
  function removeHotspot(id) { if (!hsAdded[id]) return; try { viewer.removeHotSpot(id); } catch (e) { } delete hsAdded[id]; delete refs[id]; }
  function isVisible(x) {
    if (x.kind === 'AUTO' && !x.exit) return false;
    if (x.autoOpen && !x._opened) return false;
    if (S.done[x.id]) return false;
    if (!(x.after || []).every(function (a) { return S.done[a]; })) return false;
    if (x.exit) return !!S.exitShown[x.id];
    return true;
  }
  function refreshHotspots() {
    if (!viewer) return;
    room().hotspots.forEach(function (x) {
      var vis = isVisible(x);
      if (vis) addHotspot(x); else removeHotspot(x.id);
      var d = refs[x.id]; if (!d) return;
      var el = d.firstChild;
      var held = S.held && x.kind === 'USE' && x.use && x.use.item === S.held;
      el.classList.toggle('glow', x.kind !== 'FIND' && !x.exit && !held);
      el.classList.toggle('ring', !!held);
    });
    // persistent decor
    Object.keys(S.decor).forEach(function (id) {
      if (S.decor[id] && !hsAdded['decor_' + id] && S.decor[id].room === S.roomIdx) {
        var dc = S.decor[id]; hsAdded['decor_' + id] = true;
        viewer.addHotSpot({ id: 'decor_' + id, pitch: dc.pitch, yaw: dc.yaw, type: 'custom', createTooltipFunc: function (div) {
          div.style.background = 'none'; div.style.border = '0'; div.style.width = dc.size + 'px'; div.style.height = dc.size + 'px';
          var inner = h('div', { class: 'hs decor' }, sprite(dc.sprite, { size: dc.size, circle: true, color: '#3a2a63', initial: 'H' })); inner.style.setProperty('--s', dc.size + 'px'); div.append(inner); } });
      }
    });
    $('#obj-text').textContent = S.objective || room().objective;
    renderStrip();
  }
  function flash(x, ms) {
    var d = refs[x.id]; if (!d) return;
    d.firstChild.classList.add('flash'); setTimeout(function () { var dd = refs[x.id]; if (dd) dd.firstChild.classList.remove('flash'); }, ms || 6000);
  }

  // ---------- activation ----------
  function penalty() {
    addScore(-cfg.wrongPenalty); S.lockUntil = performance.now() + cfg.lockoutMs;
  }
  // wrong answer: points, lockout, next line from the bank (1 nudge, 2 clue, 3 almost). Bank stays on 3.
  function wrongAnswer(bankKey, bank) {
    penalty();
    var i = Math.min(S.wrongIdx[bankKey] || 0, 2); S.wrongIdx[bankKey] = i + 1;
    sfx('flat'); say(bank[i], { timed: true });
  }
  // Final-room choices: the first mistake is a warning with a scare, the second ends the game.
  function threat() { var a = $('#app'); a.classList.remove('flicker'); void a.offsetWidth; a.classList.add('flicker'); sfx('wail'); setTimeout(function () { a.classList.remove('flicker'); }, 1400); }
  function strike(x, modal) {
    var n = S.strikes[x.id] = (S.strikes[x.id] || 0) + 1; penalty(); threat();
    if (n >= x.strikes) { setTimeout(function () { modal.close(); lose(x.loseTitle, x.loseLine); }, 900); return; }
    say(x.warn, { timed: true });
  }
  function locked() { return performance.now() < S.lockUntil; }
  function flyTo(fromEl, toEl, thumb, ms) {
    return new Promise(function (resolve) {
      var a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
      var f = h('div', { class: 'fly', style: { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' } }, thumb);
      document.body.append(f);
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        f.style.left = b.left + 'px'; f.style.top = b.top + 'px'; f.style.width = b.width + 'px'; f.style.height = b.height + 'px'; f.style.opacity = '.3'; }); });
      setTimeout(function () { f.remove(); resolve(); }, ms || 950);
    });
  }
  function centerRect() { return h('div', { style: { position: 'fixed', left: '50%', top: '40%', width: '80px', height: '80px' } }); }
  async function flyToBook(id) {
    var from = h('div', { style: { position: 'fixed', left: window.innerWidth / 2 - 40 + 'px', top: window.innerHeight * .4 + 'px', width: '80px', height: '80px' } });
    document.body.append(from); await flyTo(from, $('#btn-book'), itemSprite(id, 70)); from.remove();
  }
  async function reward(r, x) {
    if (!r || !r.casePage) return;
    var n = r.casePage; if (S.pages.indexOf(n) >= 0) return;
    sfx('reward');
    await showCard({ title: ui.caseSlot + ' ' + n, text: D.casePages[n - 1], thumb: sprite('icon_casepage', { size: 90, color: '#c9a96a', initial: String(n) }), saved: ui.savedNotes, sfx: 'reward', audio: (D.casePageAudio || [])[n - 1] });
    addNote({ id: 'case' + n, title: ui.caseSlot + ' ' + n, text: D.casePages[n - 1], group: ui.casePages });
    var seal = $('#seal' + (n - 1)), from = h('div', { style: { position: 'fixed', left: window.innerWidth / 2 - 30 + 'px', top: window.innerHeight * .4 + 'px', width: '60px', height: '60px' } });
    document.body.append(from); await flyTo(from, seal, sprite('icon_casepage', { size: 50, color: '#c9a96a', initial: String(n) })); from.remove();
    S.pages.push(n); addScore(cfg.points.casePage); refreshHud();
  }
  function complete(x) {
    S.done[x.id] = true;
    if (x.objective) S.objective = x.objective;
  }
  async function activate(x) {
    if (!S.running || S.busy || S.pause || S.ending) return;
    if (dlgActive) dlgActive.skipAll();
    if (modals.length) return;
    if (x.exit) return goNext(x);
    S.busy = true; S.idleAt = performance.now();
    try { await interact(x); } catch (e) { console.error(e); }
    S.busy = false; refreshHotspots(); renderTray(); pump();
  }
  async function afterEffects(x) {
    if (x.sets) S.flags[x.sets] = true;
    if (x.sfx) sfx(x.sfx);
    if (x.toast) toast(x.toast);
    if (x.decor) { S.decor[x.id] = Object.assign({ room: S.roomIdx }, x.decor); }
    if (x.lines) await say(x.lines);
    if (x.kind !== 'AUTO' || !x.exit) await reward(x.reward, x);
    complete(x);
  }
  async function interact(x) {
    var k = x.kind, saved = ui.savedNotes;
    if (k === 'LEARN') {
      var n = { id: x.id, title: x.card.title, text: x.card.text, group: room().name }; addNote(n);
      await showCard({ title: x.card.title, text: x.card.text, saved: saved, audio: x.card.audioFile });
      return afterEffects(x);
    }
    if (k === 'FIND') {
      sfx('pick');
      for (var i = 0; i < x.give.length; i++) {
        var id = x.give[i], it = D.items[id];
        if (x.mark) {
          var mi = D.markInfo[id]; addNote({ id: 'slip_' + id, title: mi.name + ': Rule Slip', text: mi.slip, group: 'Rule Slips' });
          await showCard({ title: mi.name, text: it.desc, slip: mi.slip, thumb: itemSprite(id, 90), saved: saved, sfx: 'reward', audio: it.audioFile }); S.marks.push(id);
        } else if (x.give.length === 1 || i === 0) {
          await showCard({ title: it.name, text: it.desc + (x.give.length > 1 ? ' (' + x.give.length + ' cards)' : ''), thumb: itemSprite(id, 90), saved: ui.foundItem, audio: it.audioFile });
        }
        addItems([id]); addScore(cfg.points.item); if (i === 0 || x.give.length === 1) await flyToBook(id);
      }
      renderStrip(); return afterEffects(x);
    }
    if (k === 'INSPECT') { var ok = await openInspect(x); if (!ok) return; return afterEffects(x); }
    if (k === 'USE') return doUse(x);
    if (k === 'PANEL') {
      if (x.intro && !S.rewarded['intro_' + x.id]) { S.rewarded['intro_' + x.id] = true; await say(x.intro); }
      var win = await openPanel(x); if (!win) return;
      if (x.points) addScore(cfg.points[x.points]);
      if (x.note) addNote(noteFrom(x.note));
      if (x.note) { var nn = D.notes[x.note]; await showCard({ title: nn.title, text: nn.text, dots: nn.colors, saved: saved, audio: nn.audioFile }); }
      return afterEffects(x);
    }
    if (k === 'AUTO') {
      if (x.ending) { S.done[x.id] = true; return runEnding(); }
      return afterEffects(x);
    }
  }
  async function doUse(x) {
    var u = x.use;
    if (!S.held) { toast(ui.useHint); return; }
    if (S.held !== u.item) {
      var el = refs[x.id] && refs[x.id].firstChild; if (el) { el.classList.add('shake'); setTimeout(function () { el.classList.remove('shake'); }, 450); }
      if (u.plant) { wrongAnswer('plants', room().wrongBank); return; }
      sfx('flat'); say([ui.wrongTarget[Math.floor(Math.random() * ui.wrongTarget.length)]], { timed: true }); return;
    }
    if (u.needs && !S.flags[u.needs]) { say([ui.emptyCan], { timed: true }); return; }
    if (u.consume) removeItem(u.item);
    return afterEffects(x);
  }
  // pump: run the next available AUTO / autoOpen hotspot, one at a time, after the narration before it has finished
  async function pump() {
    if (S.pumping || S.busy || !S.running || S.ending) return;
    S.pumping = true;
    try {
      for (;;) {
        var x = room().hotspots.filter(function (y) { return avail(y) && !y._opened && !/_enter$/.test(y.id) && ((y.kind === 'AUTO' && !y.exit) || y.autoOpen); })[0];
        if (x) { S.busy = true; try { await interact(x); } catch (e) { console.error(e); } S.busy = false; if (x.autoOpen && !S.done[x.id]) { x._opened = true; break; } refreshHotspots(); continue; }
        var ex = room().hotspots.filter(function (y) { return y.exit && avail(y) && !S.exitShown[y.id]; })[0];
        if (ex) {
          S.busy = true; S.exitShown[ex.id] = true;
          await reward(ex.reward, ex); S.busy = false;
          toast(ui.newWay, 3200); sfx('gate'); refreshHotspots(); continue;
        }
        break;
      }
    } finally { S.pumping = false; S.busy = false; }
    refreshHotspots();
  }

  // ---------- casebook ----------
  function openCasebook(tab) {
    var cur = tab || 'items', box = h('div', { class: 'panelbox' }), body = h('div'), tabs = h('div', { class: 'tabs' });
    function show(t) {
      cur = t; tabs.innerHTML = '';
      ['items', 'notes', 'progress'].forEach(function (k) { tabs.append(h('button', { class: 'tab' + (k === cur ? ' on' : ''), text: ui.tabs[k], on: { click: function () { show(k); } } })); });
      body.innerHTML = '';
      if (cur === 'items') {
        if (!S.items.length) body.append(h('p', { text: ui.noItems }));
        var g = h('div', { class: 'grid' });
        S.items.forEach(function (id) {
          var held = S.held === id, it = D.items[id];
          var isMark = id.indexOf('mark_') === 0;
          g.append(h('div', { class: 'itemcell' + (held ? ' held' : '') }, h('div', { class: 'thumb' }, itemSprite(id, 56)), h('div', { text: itemName(id) }),
            h('div', { style: { fontSize: '12px', opacity: .8 }, text: it.desc }),
            isMark ? null : h('button', { class: 'btn', text: held ? ui.holding : ui.hold, on: { click: function () { S.held = held ? null : id; renderTray(); refreshHotspots(); api.close(); } } })));
        });
        body.append(g);
      } else if (cur === 'notes') {
        if (!S.notes.length) body.append(h('p', { text: ui.noNotes }));
        var groups = {}, order = [];
        S.notes.forEach(function (n) { if (!groups[n.group]) { groups[n.group] = []; order.push(n.group); } groups[n.group].push(n); });
        order.forEach(function (gname) {
          body.append(h('div', { class: 'grouphead', text: gname }));
          groups[gname].forEach(function (n) {
            body.append(h('div', { class: 'note' }, h('h4', { text: n.title }), h('p', { text: n.text }),
              n.colors ? h('div', { class: 'dots', style: { justifyContent: 'flex-start' } }, n.colors.map(function (c) { return h('span', { class: 'dot', style: { background: D.colors[c] } }); })) : null));
          });
        });
      } else {
        body.append(h('div', { class: 'grouphead', text: ui.marks }));
        body.append(h('div', { class: 'marks-row' }, D.marksOrder.map(function (m) {
          return h('div', { class: 'markcell' + (S.marks.indexOf(m) < 0 ? ' off' : '') }, h('div', { class: 'thumb' }, itemSprite(m, 56)), h('div', { text: D.markInfo[m].name }));
        })));
        body.append(h('p', { text: ui.casePages + ': ' + S.pages.length + ' / ' + D.casePages.length }));
        body.append(h('p', { text: ui.rooms + ': ' + S.roomsDone + ' / ' + D.rooms.length }));
        body.append(h('p', { text: ui.evidence + ': ' + S.score }));
      }
    }
    box.append(h('h2', { text: ui.casebook }), tabs, body); show(cur);
    var api = openModal(box); return api;
  }

  // ---------- inspect ----------
  function openInspect(x) {
    return new Promise(function (resolve) {
      var ins = x.inspect, vi = 0, turning = false;
      var stage = h('div', { class: 'inspect-stage' }), label = h('div', { class: 'vlabel' }), dots = h('div', { class: 'vdots' });
      var box = h('div', { class: 'panelbox dark' }, h('h2', { text: ins.title }), stage, label, dots);
      var finished = false;
      function allFound() { return (ins.details || []).every(function (d) { return S.found[d.id]; }); }
      function render() {
        stage.innerHTML = '';
        var v = ins.views[vi], vw = h('div', { class: 'inspect-view' });
        if (v.img) { var im = new Image(); im.src = cutUrl(v.img); im.draggable = false; im.onerror = function () { im.replaceWith(h('div', { class: 'fbview', text: v.label })); }; vw.append(im); }
        else vw.append(h('div', { class: 'fbview', text: v.label }));
        (ins.details || []).forEach(function (d) {
          if (d.view !== vi) return;
          vw.append(h('button', { class: 'spot' + (S.found[d.id] ? ' found' : ''), 'aria-label': d.title, style: { left: d.x + '%', top: d.y + '%' }, on: { click: function (e) { e.stopPropagation(); detail(d); } } }));
        });
        stage.append(vw); label.textContent = v.label;
        dots.innerHTML = ''; ins.views.forEach(function (_, i) { dots.append(h('i', { class: i === vi ? 'on' : '' })); });
        stage._vw = vw;
      }
      async function detail(d) {
        if (S.found[d.id]) { await showCard({ title: d.title, text: d.text, audio: d.audioFile, voice: d.voice }); return; }
        S.found[d.id] = true;
        var n = d.note; if (n === true) addNote({ id: d.id, title: d.title, text: d.text, group: room().name }); else if (typeof n === 'string') addNote(noteFrom(n));
        if (d.points !== false) addScore(cfg.points.detail);
        var nt = typeof n === 'string' ? D.notes[n] : null;
        await showCard({ title: d.title, text: nt ? nt.text : d.text, saved: n ? ui.savedNotes : null, voice: d.voice, audio: d.audioFile });
        render();
        if (d.lines) await say(d.lines);
        if (allFound()) { finished = true; m.close(); }
      }
      function turn(dir) {
        if (turning || ins.views.length < 2) return; turning = true; sfx('page');
        var vw = stage._vw; vw.classList.add('turnout');
        setTimeout(function () { vi = (vi + dir + ins.views.length) % ins.views.length; render(); var nv = stage._vw; nv.classList.add('turnout'); requestAnimationFrame(function () { requestAnimationFrame(function () { nv.classList.remove('turnout'); turning = false; }); }); }, 330);
      }
      var sx = null;
      stage.addEventListener('pointerdown', function (e) { sx = e.clientX; });
      stage.addEventListener('pointerup', function (e) { if (sx == null) return; var dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 40) turn(dx < 0 ? 1 : -1); });
      if (ins.views.length > 1) box.append(h('div', { class: 'row' }, h('button', { class: 'btn ghost', text: '‹', on: { click: function () { turn(-1); } } }), h('button', { class: 'btn ghost', text: '›', on: { click: function () { turn(1); } } })));
      var m = openModal(box, { onClose: function () { resolve(finished || allFound() && !!(ins.details || []).length || !(ins.details || []).length); } });
      render();
    });
  }

  // ---------- panels ----------
  function openPanel(x) {
    return new Promise(function (resolve) {
      stopNarration(); var P = window.Puzzles && window.Puzzles[x.panel];
      var data = D.panels[x.panel], won = false, bank = x.wrongBank;
      var box = h('div', { class: 'panelbox' + (data && data.dark ? ' dark' : '') }), cache = (S.panelEls = S.panelEls || {});
      var ctx = {
        D: D, S: S, data: data, hs: x, ui: ui, h: h, sprite: sprite, itemSprite: itemSprite, sfx: sfx, say: say, toast: toast, Logic: Logic, cfg: cfg,
        locked: locked, add: addScore, state: (S.panelState = S.panelState || {})[x.id] || ((S.panelState[x.id]) = {}),
        wrong: function () { if (x.strikes) return strike(x, m); wrongAnswer(x.id, bank); box.classList.add('locked'); setTimeout(function () { box.classList.remove('locked'); }, cfg.lockoutMs); },
        win: function () { if (won) return; won = true; sfx('reward'); setTimeout(function () { m.close(); }, 500); },
        openNotes: function () { openCasebook('notes'); }
      };
      var view = cache[x.id];
      if (!view) { view = P ? P(ctx) : { el: h('p', { text: 'Missing panel ' + x.panel }) }; if (view.retain) cache[x.id] = view; }
      else if (view.refresh) view.refresh();
      box.append(h('h2', { text: x.label || '' }), view.el, h('div', { class: 'row' }, h('button', { class: 'btn ghost', text: ui.casebook, on: { click: function () { ctx.openNotes(); } } })));
      var m = openModal(box, { onClose: function () { if (view.retain && view.el.parentNode) view.el.remove(); resolve(won); } });
      if (view.onShow) setTimeout(view.onShow, 30);
    });
  }

  // ---------- hints ----------
  function nextTarget() {
    var list = room().hotspots.filter(function (y) { return (isVisible(y) || (avail(y) && y.autoOpen)) && y.kind !== 'AUTO' || (y.exit && S.exitShown[y.id] && !S.done[y.id]); });
    return list.filter(function (y) { return y.kind !== 'FIND' && !y.exit; })[0] || list.filter(function (y) { return y.kind === 'FIND'; })[0] || list[0];
  }
  var hintTimer = null;
  async function useHint() {
    if (!S.running || S.busy || S.pause) return;
    if (modals.length) return;
    var used = S.hints[room().id] || 0;
    if (used >= cfg.hintsPerRoom) { say([ui.hintNone], { timed: true }); return; }
    if (S.score < cfg.hintPenalty) { toast(ui.hintNoEvidence); return; }
    var t = nextTarget(); S.hints[room().id] = used + 1; addScore(-cfg.hintPenalty);
    if (used === 0) { say([ui.hint1], { timed: true }); }
    else {
      var h2 = room().hint2, txt = typeof h2 === 'string' ? h2 : (h2[t && t.id] || h2.default);
      var h2a = room().hint2Audio, au = typeof h2a === 'string' ? h2a : (h2a && (h2a[t && t.id] || h2a.default));
      say([['pip', 'thinking', txt, au]], { timed: true });
    }
    if (t) pointAt(t);
  }
  function sayAwait() { return Promise.resolve(); }
  function pointAt(x) {
    flash(x, 7000); clearInterval(hintTimer);
    var end = performance.now() + 7000, arrow = $('#edge');
    hintTimer = setInterval(function () {
      if (performance.now() > end || !viewer) { clearInterval(hintTimer); arrow.hidden = true; return; }
      var W = innerWidth, H = innerHeight, yaw = viewer.getYaw(), pitch = viewer.getPitch(), hf = viewer.getHfov() * Math.PI / 180;
      var dy = ((x.yaw - yaw + 540) % 360 - 180) * Math.PI / 180, dp = (x.pitch - pitch) * Math.PI / 180;
      var vf = 2 * Math.atan(Math.tan(hf / 2) * H / W);
      var sx = W / 2 + (Math.abs(dy) < 1.4 ? Math.tan(dy) / Math.tan(hf / 2) * W / 2 : Math.sign(dy) * W * 2);
      var sy = H / 2 - (Math.tan(dp) / Math.tan(vf / 2)) * H / 2;
      var on = sx > 30 && sx < W - 30 && sy > 90 && sy < H - 90;
      if (on) { arrow.hidden = true; return; }
      var ax = clamp(sx, 36, W - 36), ay = clamp(sy, 100, H - 100);
      arrow.hidden = false; arrow.style.left = ax + 'px'; arrow.style.top = ay + 'px';
      arrow.style.transform = 'translate(-50%,-50%) rotate(' + Math.atan2(sy - H / 2, sx - W / 2) + 'rad)';
    }, 120);
  }

  // ---------- pause ----------
  function pauseMenu() {
    if (!S.started || S.ending && !S.cine) return;
    if (S.pause) return; S.pause = true; document.body.classList.add('paused'); pauseNarration();
    var box = h('div', { id: 'pausebox' });
    function build() {
      box.innerHTML = '';
      box.append(h('h2', { text: ui.paused }),
        h('button', { class: 'btn', text: ui.resume, on: { click: function () { S.pause = false; document.body.classList.remove('paused'); box.remove(); resumeNarration(); } } }),
        h('button', { class: 'btn ghost', text: soundOn ? ui.soundOn : ui.soundOff, on: { click: function () { setSound(!soundOn); build(); } } }),
        h('button', { class: 'btn ghost', text: voiceOn ? ui.voiceOn : ui.voiceOff, on: { click: function () { voiceOn = !voiceOn; if (!voiceOn) stopNarration(); build(); } } }),
        S.cine ? null : h('button', { class: 'btn ghost', text: ui.restartRoom, on: { click: function () { S.pause = false; document.body.classList.remove('paused'); box.remove(); stopNarration(); restartRoom(); } } }),
        h('p', { text: ui.pauseHow, style: { maxWidth: '320px', textAlign: 'center', opacity: .85 } }),
        h('button', { class: 'btn ghost', text: ui.quit, on: { click: function () { if (confirm(ui.quitConfirm)) location.reload(); } } }));
    }
    build(); $('#app').append(box);
  }

  // ---------- rooms ----------
  function snapshot() {
    S.snap = JSON.parse(JSON.stringify({ done: S.done, flags: S.flags, items: S.items, notes: S.notes, marks: S.marks, pages: S.pages, found: S.found, score: S.score, held: S.held, objective: S.objective, exitShown: S.exitShown, rewarded: S.rewarded, decor: S.decor, wrongIdx: S.wrongIdx, hints: S.hints }));
  }
  async function restartRoom() {
    var snap = S.snap; Object.assign(S, JSON.parse(JSON.stringify(snap))); S.panelEls = {}; S.panelState = {};
    room().hotspots.forEach(function (x) { delete x._opened; });
    S.busy = false; S.pumping = false; dlgChain = Promise.resolve(); if (dlgActive) dlgActive.skipAll();
    modals.slice().forEach(function (m) { m.close(); });
    renderTray(); refreshHud(); await loadPano(room()); refreshHotspots(); await enterRoom(false);
  }
  async function enterRoom(first) {
    var r = room(); S.objective = null;
    S.rewarded = {}; S.exitShown = {}; refreshHud();
    var objc = h('div', { class: 'objcard', on: { click: function () { objc.remove(); } } }, h('b', { text: ui.objective }), r.objective);
    layer.append(objc); setTimeout(function () { objc.remove(); }, 6000);
    refreshHotspots();
    S.idleAt = performance.now();
    await say(r.enter);
    var en = r.hotspots.filter(function (y) { return /_enter$/.test(y.id); })[0]; if (en) S.done[en.id] = true;
    refreshHotspots(); pump();
  }
  async function goNext(exitHs) {
    if (S.busy) return;
    S.busy = true;
    var n = room().name;
    S.done[exitHs.id] = true; S.roomsDone++; refreshHotspots(); sfx('gate');
    var cover = h('div', { class: 'screen dark', style: { opacity: 0, transition: 'opacity .8s' } }, h('div', { class: 'tag', text: ui.roomComplete }), h('h1', { class: 'title', text: n }));
    layer.append(cover); requestAnimationFrame(function () { cover.style.opacity = 1; });
    await sleep(1800);
    if (S.roomIdx + 1 >= D.rooms.length) { S.busy = false; cover.remove(); return; }
    S.roomIdx++; snapshot(); S.panelEls = {}; S.panelState = {};
    await loadPano(room()); S.busy = false; refreshHotspots();
    cover.style.opacity = 0; setTimeout(function () { cover.remove(); }, 900);
    enterRoom(false);
  }

  // ---------- ending, win, lose ----------
  var bigSprites = { hush: 'hush', ines: 'ines', pip: 'pip_proud', mirela: 'mirela_proud', warden: 'warden_kind' };
  async function runEnding() {
    S.ending = true; S.cine = true; updatePause2(); stopNarration();
    var cine = h('div', { class: 'cine' }); layer.append(cine);
    var skipAll = h('button', { class: 'dskip', style: { position: 'fixed', top: '60px', right: '10px', zIndex: 80 }, text: ui.skip + ' >>', on: { click: function () { S.skipCine = true; if (dlgActive) dlgActive.skipAll(); } } });
    document.body.append(skipAll);
    for (var i = 0; i < D.ending.length && !S.skipCine; i++) {
      var beat = D.ending[i], who = (D.cine || [])[i] || 'hush';
      cine.innerHTML = ''; who.split(',').forEach(function (w) { var sp = D.speakers[w]; cine.append(h('div', { class: 'bigbust' }, sprite(bigSprites[w], { size: 130, circle: true, color: sp && sp.color, initial: sp && sp.initial }))); });
      if (beat.sfx) sfx(beat.sfx); else if (i === 3) sfx('hum');
      await say(beat.lines);
    }
    skipAll.remove(); cine.remove(); S.cine = false; updatePause2();
    win();
  }
  function rankFor(score) { var r = cfg.ranks[0].name; cfg.ranks.forEach(function (x) { if (score >= x.min) r = x.name; }); return r; }
  function win() {
    if (S.won) return; S.won = true;
    S.running = false; S.ending = true; addScore(Math.floor(S.timeLeft) * cfg.points.perSecondLeft);
    var tl = Math.floor(S.timeLeft);
    var scr = h('div', { class: 'screen dark' }, h('h1', { class: 'title', text: ui.winTitle }), h('div', { class: 'tag', text: ui.winSub }), h('p', { text: ui.winLine, style: { maxWidth: '420px' } }),
      h('div', { class: 'statline' }, h('span', { text: ui.evidence }), h('b', { text: String(S.score) })),
      h('div', { class: 'statline' }, h('span', { text: ui.timeLeft }), h('b', { text: fmt(tl) })),
      h('div', { class: 'statline' }, h('span', { text: ui.rank }), h('b', { text: rankFor(S.score) })),
      h('p', { text: ui.winTeaser, style: { opacity: .75, fontStyle: 'italic' } }),
      h('div', { class: 'row' }, h('button', { class: 'btn big', text: ui.playAgain, on: { click: function () { location.reload(); } } })));
    layer.append(scr); sfx('bell');
  }
  function lose(title, line) {
    S.running = false; S.ending = true; stopNarration(); sfx('bell');
    modals.slice().forEach(function (m) { m.close(); }); if (dlgActive) dlgActive.skipAll();
    var scr = h('div', { class: 'screen dark' }, h('h1', { class: 'title', text: title || ui.loseTitle, style: { fontSize: 'clamp(22px,6vw,40px)' } }), h('p', { text: line || ui.loseLine, style: { maxWidth: '420px' } }),
      h('div', { class: 'statline' }, h('span', { text: ui.evidenceSoFar }), h('b', { text: String(S.score) })),
      h('div', { class: 'statline' }, h('span', { text: ui.casePagesWon }), h('b', { text: S.pages.length + ' / ' + D.casePages.length })),
      h('div', { class: 'row' }, h('button', { class: 'btn big', text: ui.tryAgain, on: { click: function () { location.reload(); } } })));
    layer.append(scr);
  }

  // ---------- start flow ----------
  async function tutorial() {
    var steps = ui.tutorial.concat([{ sel: null, text: ui.tutorialGlow }]);
    $('#hud').hidden = false; $('#bar').hidden = false;
    for (var i = 0; i < steps.length; i++) {
      var st = steps[i], skipped = false;
      var dim = h('div', { class: 'tut-dim' }), box = h('div', { class: 'tut-box' });
      var r = st.sel ? $(st.sel).getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
      Object.assign(dim.style, { left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' });
      var low = r.top < innerHeight / 2; box.style[low ? 'top' : 'bottom'] = low ? Math.min(r.top + r.height + 18, innerHeight - 220) + 'px' : innerHeight - r.top + 18 + 'px';
      if (!st.sel) { box.style.bottom = 'auto'; box.style.top = '35%'; dim.style.border = '0'; } // last step has no spotlight target
      document.body.append(dim, box);
      await new Promise(function (res) {
        box.append(h('p', { text: st.text }), h('div', { class: 'row' },
          h('button', { class: 'btn', text: i === steps.length - 1 ? ui.ok : ui.next, on: { click: res } }),
          h('button', { class: 'btn ghost', text: ui.skip, on: { click: function () { skipped = true; res(); } } })));
      });
      dim.remove(); box.remove(); if (skipped) break;
    }
  }
  function missionScreen() {
    return new Promise(function (resolve) {
      var box = h('div', { class: 'missionfull' }, h('h2', { text: ui.missionTitle }),
        ui.missionStory.map(function (t) { return h('p', { text: t }); }),
        h('div', { class: 'row' }, h('button', { class: 'btn big', text: ui.missionBegin, on: { click: function () { stopNarration(); scr.remove(); resolve(); } } })));
      var scr = h('div', { class: 'screen dark' }, box); layer.append(scr); sfx('page');
      narrate(['narrator', 'neutral', ui.missionTitle + '. ' + ui.missionStory.join(' ')], ui.missionAudio);
    });
  }
  async function playOpening() {
    // The story plays over the blurred, slowly drifting Room 1 gate. No separate splash image, so nothing jumps.
    var panning = true; (function pan() { if (panning && viewer) { viewer.setYaw(viewer.getYaw() + .05, false); requestAnimationFrame(pan); } })();
    var skipped = false, skipBtn = h('button', { class: 'dskip', style: { position: 'fixed', top: '60px', right: '10px', zIndex: 80 }, text: ui.skip + ' >>', on: { click: function () { skipped = true; if (dlgActive) dlgActive.skipAll(); } } });
    document.body.append(skipBtn);
    for (var i = 0; i < D.opening.length && !skipped; i++) {
      var beat = D.opening[i];
      await say(beat.lines);
      if (beat.sfx && !skipped) { sfx(beat.sfx); var app = $('#app'); app.classList.add('shake'); await sleep(700); app.classList.remove('shake'); }
    }
    skipBtn.remove();
    panning = false; viewer.setYaw(0, false);
  }
  async function begin() {
    initAudio(); S.started = true; $('#start').remove(); last = performance.now();
    await missionScreen();
    await tutorial();
    await playOpening();
    // entering: the blur clears, then the clock starts
    $('#pano').classList.remove('blur'); sfx('gate'); await sleep(cfg.blurClearMs);
    $('#strip').hidden = false; S.running = true; snapshot(); S.idleAt = performance.now();
    var hand = $('#drag-hand'); hand.hidden = false; setTimeout(function () { hand.hidden = true; }, 4800);
    await enterRoom(true);
  }
  function validateOrDie() {
    var errs = Logic.validate(D);
    if (errs.length) { console.error(ui.validateFail, errs); if (DEBUG || /^(localhost|127\.)/.test(location.hostname)) document.body.append(h('div', { class: 'errbox', text: ui.validateFail + '\n' + errs.join('\n') })); }
    return errs;
  }
  async function boot() {
    var res = await fetch('game.json?v=' + Date.now()); D = await res.json(); cfg = D.config; ui = D.ui;
    layer = $('#layer'); S = freshState(); validateOrDie(); buildHud(); $('#hud').hidden = true;
    document.documentElement.style.setProperty('--blur', cfg.blurPx + 'px');
    $('#pano').style.setProperty('filter', '');
    var start = h('div', { class: 'screen', id: 'start' }, h('h1', { class: 'title', text: ui.title }), h('div', { class: 'tag', text: ui.tagline }), h('button', { class: 'btn big', text: ui.tap }));
    layer.append(start);
    var skip = DEBUG && qs.get('room');
    $('#pano').classList.add('blur'); $('#pano').style.setProperty('--b', cfg.blurPx + 'px');
    S.roomIdx = skip ? clamp(+qs.get('room') - 1, 0, D.rooms.length - 1) : 0;
    await loadPano(room());
    if (skip) {
      // debug jump: start in room N with earlier rooms' rewards given (item flow is simulated by the solvability test, not here)
      start.remove(); S.started = true; $('#pano').classList.remove('blur'); $('#hud').hidden = false; $('#bar').hidden = false; $('#strip').hidden = false;
      for (var i = 0; i < S.roomIdx; i++) { D.rooms[i].hotspots.forEach(function (x) { S.done[x.id] = true; }); S.pages.push(i + 1); }
      S.running = true; last = performance.now(); initAudio(); snapshot(); await enterRoom(true); return;
    }
    start.querySelector('button').addEventListener('click', begin);
    start.addEventListener('click', function (e) { if (e.target === start) begin(); });
  }
  if (DEBUG) {
    window.G.activate = function (id) { return activate(hsById(id)); };
    window.G.debug = DEBUG;
    window.G.audio = function () { return { voice: voice ? voice.src.split('/').pop().split('?')[0] : null, voicePlaying: !!voice && !voice.paused, bgm: !!bgm && !bgm.paused, bgmVol: bgm && bgm.volume, bgmLoop: bgm && bgm.loop }; };
    window.G.say = function (l) { return say(l); };
  }
  boot();
})();
