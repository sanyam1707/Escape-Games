/* fx.js - visual effects only (no sound). One named function per state in docs/puzzle.md */
(function () {
  const $ = (s) => document.querySelector(s);
  let cv, ctx, W = 0, H = 0, cap = 60, dpr = 1;
  let P = [], R = [], last = 0, run = false;
  const flashes = [];
  const fx = { reduce: false };

  fx.init = function (cfg) {
    cv = $('#fxc'); ctx = cv.getContext('2d');
    cap = (matchMedia('(pointer:coarse)').matches || innerWidth < 700) ? cfg.phone : cfg.desktop;
    const rs = () => { dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    rs(); addEventListener('resize', rs);
  };
  fx.setReduce = (b) => { fx.reduce = b; document.body.classList.toggle('reduce', b); if (b) $('#vig').style.animation = 'none'; else $('#vig').style.animation = ''; };

  function add(p) { if (P.length < cap * 2) P.push(p); if (!run) { run = true; last = performance.now(); requestAnimationFrame(loop); } }
  function count(tag) { let n = 0; for (const p of P) if (p.tag === tag) n++; return n; }
  function burst(x, y, n, o) {
    const room = Math.max(0, cap - P.length); n = Math.min(n, room + 10);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = (o.speed || 120) * (0.3 + Math.random());
      add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + (o.up || 0), g: o.g || 0, life: 0, max: (o.life || 1) * (0.6 + Math.random() * 0.8), size: (o.size || 3) * (0.6 + Math.random()), color: o.color || '#d4a017', tag: o.tag || 'b' });
    }
  }
  function ring(x, y, color, max) { R.push({ x, y, t: 0, color, max: max || 120 }); if (!run) { run = true; last = performance.now(); requestAnimationFrame(loop); } }
  function loop(t) {
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    ctx.clearRect(0, 0, W, H);
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.life += dt;
      if (p.life >= p.max) { P.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalAlpha = Math.max(0, 1 - p.life / p.max) * (p.tag === 'mote' ? 0.5 : 0.95);
      ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    for (let i = R.length - 1; i >= 0; i--) {
      const r = R[i]; r.t += dt; if (r.t > 0.7) { R.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - r.t / 0.7; ctx.strokeStyle = r.color; ctx.lineWidth = 4 * (1 - r.t / 0.7) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, 8 + r.max * (r.t / 0.7), 0, 6.283); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (P.length || R.length) requestAnimationFrame(loop); else run = false;
  }
  function canFlash() { const n = performance.now(); while (flashes.length && n - flashes[0] > 1000) flashes.shift(); if (flashes.length >= 3) return false; flashes.push(n); return true; }
  function flash() { if (fx.reduce || !canFlash()) return; const d = document.createElement('div'); d.className = 'flash'; $('#app').appendChild(d); setTimeout(() => d.remove(), 200); }
  function shake(ms) { if (fx.reduce) return; const a = $('#app'); a.classList.add('shake'); setTimeout(() => a.classList.remove('shake'), ms); }


  /* ---------- audio: one CC0 loop (kindland, OpenGameArt) + tiny synth sfx ---------- */
  const saved = (() => { try { return JSON.parse(localStorage.getItem('sotp_opt')) || {}; } catch (e) { return {}; } })();
  fx.opt = Object.assign({ sfx: true, music: true, voice: true }, saved);
  fx.save = () => { try { localStorage.setItem('sotp_opt', JSON.stringify(fx.opt)); } catch (e) { } };
  let bgm, ac;
  fx.music = function () { // call from a tap; low volume on purpose
    if (!bgm) { bgm = new Audio('assets/audio/bgm.mp3'); bgm.loop = true; bgm.volume = 0.16; document.addEventListener('visibilitychange', () => { document.hidden ? bgm.pause() : fx.music(); }); }
    if (fx.opt.music && !document.hidden) bgm.play().catch(() => { }); else bgm.pause();
  };
  function tone(f, d, type, v, to, at) {
    const t = ac.currentTime + (at || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d);
  }
  fx.sfx = function (n) {
    if (!fx.opt.sfx) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume();
      if (n === 'gain') { tone(880, 0.25, 'sine', 0.12); tone(1320, 0.35, 'sine', 0.09, 0, 0.09); }
      else if (n === 'bad') tone(150, 0.35, 'sawtooth', 0.1, 70);
      else if (n === 'thud') tone(90, 0.3, 'sine', 0.3, 40);
      else if (n === 'crack') tone(300, 0.12, 'square', 0.07, 80);
      else if (n === 'stone') { tone(110, 0.5, 'triangle', 0.25, 50); tone(660, 0.5, 'sine', 0.08, 0, 0.1); }
      else if (n === 'death') tone(200, 1.2, 'sawtooth', 0.12, 40);
      else if (n === 'win') [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.6, 'sine', 0.1, 0, i * 0.15));
    } catch (e) { }
  };

  fx.puff = (x, y, color) => burst(x, y, 24, { speed: 160, g: 200, life: 0.9, size: 4, color: color || '#c9a66b', tag: 'puff' });
  fx.motes = function (color) { // slow dust, topped up while he is in view
    if (fx.reduce) return;
    for (let i = count('mote'); i < 40 && i < cap * 0.6; i++) add({ x: Math.random() * W, y: Math.random() * H, vx: 6 + Math.random() * 10, vy: -4 + Math.random() * 8, g: 0, life: 0, max: 6 + Math.random() * 6, size: 2, color: color || '#e8dcb5', tag: 'mote' });
  };
  fx.calm = function () { fx.motes(); };
  fx.step = function (side) { // he came one step closer
    fx.sfx('thud');
    fx.edge(side, 1); setTimeout(() => fx.edge("", 0), 500); shake(240);
    if (fx.reduce) return;
    for (let i = count('spill'); i < 30; i += 3) burst(Math.random() * W, 0, 3, { speed: 20, g: 420, life: 1.2, size: 3, color: '#c9a66b', tag: 'spill' });
    const x = side === 'l' ? 20 : W - 20; burst(x, H * 0.6, 14, { speed: 140, g: 80, life: 0.8, size: 4, color: '#b3202a', tag: 'step' });
  };
  fx.edge = function (side, k) { // red glow on the side he is on (when out of view)
    const e = $('#edge'); e.className = side || ''; e.style.setProperty('--e', k || 0);
  };
  fx.mist = function (x, y) { // dark red mist rising off him
    if (fx.reduce || count('mist') > 16) return;
    add({ x: x + (Math.random() - 0.5) * 40, y, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 30, g: 0, life: 0, max: 1.4, size: 5, color: Math.random() < 0.5 ? '#6b1420' : '#3a3a42', tag: 'mist' });
  };
  fx.stare = function (x, y) { const v = $('#vig'); v.classList.add('stare'); setTimeout(() => v.classList.remove('stare'), 700); ring(x != null ? x : W / 2, y != null ? y : H / 2, '#f5dc8a', 150); burst(x != null ? x : W / 2, y != null ? y : H / 2, 16, { speed: 90, g: -30, life: 1, size: 3, color: '#f5dc8a', tag: 'gold' }); };
  fx.near = function (n) { // vignette tightens, reddens and beats faster as he gets close
    const k = Math.max(0, Math.min(1, (6 - n) / 6)), v = $('#vig'), app = $('#app');
    v.style.setProperty('--k', k.toFixed(2)); v.style.setProperty('--rgb', n <= 2 ? '125,0,24' : n <= 4 ? '40,0,10' : '0,0,0');
    v.style.animationDuration = (1.5 - k * 0.9).toFixed(2) + 's'; v.classList.toggle('beat', n <= 3 && !fx.reduce);
    app.classList.toggle('drain', n <= 2); app.classList.toggle('rumble', n <= 1 && !fx.reduce);
  };
  fx.crack = function (x, y) { fx.sfx('crack'); burst(x, y, 12, { speed: 110, g: 200, life: 0.7, size: 3, color: '#fff3b0', tag: 'spark' }); };
  fx.wrongStone = function (x, y) { flash(); shake(500); ring(x, y, '#ff4030', 140); burst(x, y, 44, { speed: 220, g: 260, life: 1, size: 4, color: '#111', tag: 'blk' }); burst(x, y, 16, { speed: 160, g: 100, life: 0.8, size: 3, color: '#d23a2a', tag: 'blk' }); };
  fx.rightStone = function (x, y) { fx.sfx('stone'); flash(); ring(x, y, '#f5dc8a', 190); ring(x, y, '#ffffff', 90); burst(x, y, 40, { speed: 180, g: 220, life: 1.2, size: 4, color: '#cbb890', tag: 'dust' }); burst(x, y, 24, { speed: 120, g: -40, life: 1.4, size: 3, color: '#f5dc8a', tag: 'gold' }); };
  fx.fourth = function (x, y) {
    flash();
    const n = matchMedia('(pointer:coarse)').matches ? 60 : 100;
    burst(x, y, n, { speed: 150, g: 260, life: 2, size: 4, color: '#c9a66b', tag: 'crumble' });
  };
  fx.death = function () { fx.sfx('death');
    const d = document.createElement('div'); d.style.cssText = 'position:absolute;inset:0;z-index:75;pointer-events:none';
    $('#app').appendChild(d); const t0 = performance.now();
    (function f(t) { const k = Math.min(1, (t - t0) / 1500), r = 75 * (1 - k); d.style.background = `radial-gradient(circle at 50% 50%,transparent ${r}%,#000 ${r + 12}%)`; if (k < 1) requestAnimationFrame(f); else d.style.background = '#000'; })(t0);
    return d;
  };
  fx.timeUp = function () { fx.sfx('death');
    const d = document.createElement('div'); d.style.cssText = 'position:absolute;left:0;right:0;top:0;height:0;z-index:75;pointer-events:none;background:linear-gradient(180deg,#e1b25a,#c9a66b);transition:height 3s ease-in';
    $('#app').appendChild(d); requestAnimationFrame(() => requestAnimationFrame(() => d.style.height = '100%'));
    if (!fx.reduce) for (let i = 0; i < 6; i++) setTimeout(() => burst(Math.random() * W, 0, 10, { speed: 30, g: 500, life: 1.5, size: 4, color: '#c9a66b', tag: 'sand' }), i * 350);
    return d;
  };
  fx.win = function () { fx.sfx('win');
    const a = $('#app'); const b = document.createElement('div');
    b.style.cssText = 'position:absolute;inset:0;z-index:7;pointer-events:none;background:repeating-linear-gradient(100deg,transparent 0 12%,rgba(255,224,130,.28) 15%,transparent 20%);animation:fade 2s;mix-blend-mode:screen';
    a.appendChild(b);
    if (!fx.reduce) for (let i = 0; i < 5; i++) setTimeout(() => burst(Math.random() * W, H, 12, { speed: 40, g: -60, life: 3, size: 3, color: '#f5dc8a', tag: 'gold' }), i * 400);
    return b;
  };
  fx.clear = function () { P = []; R = []; fx.near(6); fx.edge('', 0); };
  fx.pos = (x, y) => ({ x, y });

  window.fx = fx;
})();
