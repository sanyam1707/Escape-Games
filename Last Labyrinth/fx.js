/* fx.js - screen effects (CSS + canvas only) and the free ambient sound. One named function per state (docs/puzzle.md). */
const FX = (() => {
  const $ = (s) => document.querySelector(s);
  let cv, cx, W = 0, H = 0, cfg = { desktop: 60, phone: 30 }, parts = [], dustLevel = 1, golds = 0, running = false, last = 0;
  let au = null, soundOn = true, musicOn = true;
  const cap = () => (matchMedia('(pointer:coarse)').matches || innerWidth < 700 ? cfg.phone : cfg.desktop);

  function resize() { const r = devicePixelRatio > 1.5 ? 1.5 : 1; W = cv.width = innerWidth * r; H = cv.height = innerHeight * r; cx.setTransform(r, 0, 0, r, 0, 0); }
  function init(c) {
    cfg = c || cfg; cv = $('#fxc'); cx = cv.getContext('2d'); resize(); addEventListener('resize', resize);
    running = true; requestAnimationFrame(loop);
  }
  function spawn(kind) {
    const w = innerWidth, h = innerHeight;
    if (kind === 'gold') return parts.push({ k: 'gold', x: Math.random() * w, y: h + 10, vx: (Math.random() - .5) * 20, vy: -(60 + Math.random() * 90), r: 2 + Math.random() * 3, life: 1 });
    parts.push({ k: 'dust', x: Math.random() * w, y: Math.random() * h, vx: 6 + Math.random() * 14, vy: 3 + Math.random() * 8, r: 1 + Math.random() * 2.2, life: 1, a: .15 + Math.random() * .3 });
  }
  function loop(t) {
    if (!running) return;
    const dt = Math.min(.05, (t - last) / 1000 || 0); last = t;
    cx.clearRect(0, 0, innerWidth, innerHeight);
    const want = Math.round(cap() * dustLevel * (dustLevel > 1 ? .75 : .5));
    let dust = 0; for (const p of parts) if (p.k === 'dust') dust++;
    if (dust < want && Math.random() < .5) spawn('dust');
    if (golds > 0 && parts.length < cap() + 20) { spawn('gold'); golds -= dt * 40; }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.k === 'dust') {
        if (p.x > innerWidth + 5 || p.y > innerHeight + 5 || dust > want + 4) { parts.splice(i, 1); dust--; continue; }
        cx.fillStyle = `rgba(230,210,170,${p.a})`;
      } else { p.life -= dt * .35; if (p.life <= 0) { parts.splice(i, 1); continue; } cx.fillStyle = `rgba(255,215,100,${p.life})`; }
      cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 6.283); cx.fill();
    }
    requestAnimationFrame(loop);
  }

  /* ---- helpers ---- */
  const dust = (n) => { dustLevel = n; };
  function vignette(v, rgb) { const s = $('#vignette').style; s.setProperty('--vig', v); s.setProperty('--vigc', rgb || '0,0,0'); }
  function shake(ms = 400, px = 6) {
    const a = $('#app'); a.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${-px}px,${px / 2}px)` }, { transform: `translate(${px}px,${-px / 2}px)` }, { transform: `translate(${-px / 2}px,${px}px)` }, { transform: 'translate(0,0)' }], { duration: ms, easing: 'linear' });
  }
  function flash(color = '#fff', ms = 300) {
    const d = document.createElement('div'); d.className = 'flash'; d.style.background = color; $('#app').appendChild(d);
    d.animate([{ opacity: .85 }, { opacity: 0 }], { duration: ms }).onfinish = () => d.remove();
  }
  function ring(x, y, color) { const d = document.createElement('div'); d.className = 'ringfx'; d.style.cssText = `left:${x}px;top:${y}px;width:40px;height:40px;${color ? 'border-color:' + color : ''}`; $('#app').appendChild(d); setTimeout(() => d.remove(), 1500); }
  function walls(p) { const w = Math.max(0, Math.min(1, p)) * 50 + '%'; $('#wallL').style.width = w; $('#wallR').style.width = w; }
  let inkEl = null;
  function ink(ms = 1400, keep) {
    clearInk(); const d = inkEl = document.createElement('div'); d.className = 'ink'; $('#app').appendChild(d);
    d.animate([{ '--r': '100%' }, { '--r': '-25%' }], { duration: ms, fill: 'forwards' });
    d.style.setProperty('--r', '-25%'); // fallback for engines without custom-property animation
    d.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, fill: 'forwards' });
    if (!keep) setTimeout(() => { d.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, fill: 'forwards' }).onfinish = clearInk; }, ms + 150);
  }
  function clearInk() { if (inkEl) { inkEl.remove(); inkEl = null; } }

  /* ---- audio (free, made in the browser) ---- */
  function audio() { if (!au) { try { au = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } } if (au.state === 'suspended') au.resume(); return au; }
  let bgm = null, sfxOn = true;
  function musicStart() {
    if (bgm) { if (musicOn) bgm.play().catch(() => {}); return; }
    bgm = new Audio(); bgm.loop = true; bgm.volume = .16; bgm.preload = 'auto';
    bgm.src = bgm.canPlayType('audio/ogg; codecs="vorbis"') ? 'assets/audio/bgm.ogg' : 'assets/audio/bgm.mp3'; // CC0 "Cathedral in the forest" (ambient loop) (OpenGameArt)
    if (musicOn) bgm.play().catch(() => {});
  }
  function setSound(on) { soundOn = on; if (!on && window.speechSynthesis) speechSynthesis.cancel(); }
  function setMusic(on) { musicOn = on; if (bgm) { if (on) bgm.play().catch(() => {}); else bgm.pause(); } }
  function setSfx(on) { sfxOn = on; }
  function beep(f, dur, type, vol, delay) {
    const a = audio(); if (!a) return; const t = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol || .08, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + .05);
  }
  // sfx(name): only for the few moments that need one
  const SFX = {
    pick: () => { beep(660, .18, 'sine', .07); beep(990, .25, 'sine', .06, .09); },
    use: () => { beep(140, .12, 'square', .05); beep(210, .1, 'triangle', .06, .06); },
    wrong: () => { beep(150, .35, 'sawtooth', .06); beep(110, .4, 'sawtooth', .05, .08); },
    solve: () => { [523, 659, 784, 1047].forEach((f, i) => beep(f, .35, 'triangle', .07, i * .1)); },
    reward: () => { [784, 988, 1175].forEach((f, i) => beep(f, .4, 'sine', .06, i * .12)); },
    door: () => { beep(70, .6, 'sawtooth', .08); beep(55, .7, 'sine', .1, .05); },
    tick: () => { beep(900, .05, 'square', .03); },
    boom: () => { beep(60, .8, 'sawtooth', .1); beep(45, 1, 'sine', .12); },
  };
  function sfx(n) { if (!sfxOn) return; const a = audio(); if (!a || !SFX[n]) return; SFX[n](); }
  function tone(freq, secs, vol = .06) {
    if (!sfxOn) return; const a = audio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.value = freq; g.gain.value = 0; o.connect(g); g.connect(a.destination);
    g.gain.linearRampToValueAtTime(vol, a.currentTime + .4); g.gain.linearRampToValueAtTime(0, a.currentTime + secs); o.start(); o.stop(a.currentTime + secs + .1);
  }

  /* ---- named states ---- */
  const S = {
    enterFinal() { dust(1); vignette(.1); },                                   // entering, panel closed
    wallsClosing(p) { vignette(.1 + .35 * p); walls(p); dust(1 + p); },         // panel open, walls closing (p 0..1)
    wallsShake() { shake(350, 4); },                                           // small shake every 15 s
    switchPressed(lampEl, flipped) {                                           // brass ring + 150 ms flash
      sfx('tick'); lampEl.classList.remove('ringed'); void lampEl.offsetWidth; lampEl.classList.add('ringed');
      flipped.forEach((l) => { l.classList.remove('lf'); void l.offsetWidth; l.classList.add('lf'); });
    },
    lampMatch(el, on) { el.classList.toggle('match', on); },                    // lamp matches target glows gold
    platePulse(el) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }, // 7+ lamps match
    wallsFailed() { sfx('boom'); flash('#c0392b', 400); shake(600, 10); ink(1100); setTimeout(() => { walls(0); vignette(.1); dust(1); }, 700); },
    solved(x, y) { flash('#fff', 300); walls(0); vignette(.1); dust(1); ring(x, y); sfx('solve'); },
    choiceA() { golds = 60; vignette(0); dust(1); tone(392, 2.5, .05); },
    choiceB() { vignette(.75, '10,20,45'); dust(0); tone(110, 4, .08); },
    timeUp() { sfx('boom'); shake(500, 12); walls(.5); ink(1800, true); },
    clear() { walls(0); vignette(.1); dust(1); clearInk(); golds = 0; },
  };
  return Object.assign({ init, dust, vignette, shake, flash, ring, walls, ink, clearInk, musicStart, setSound, setMusic, setSfx, sfx, tone, audio }, S);
})();
