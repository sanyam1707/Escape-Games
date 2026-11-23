/* Screen effects. Canvas + CSS only, no video, no sound needed. One named function per state (docs/puzzle.md). */
(function () {
  'use strict';
  const cv = document.getElementById('fx'), cx = cv.getContext('2d');
  const CAP = () => (innerWidth < 700 ? 40 : 120);            // particle cap: phones 40, desktop 120
  let W = 0, H = 0, fx = [], parts = [], raf = 0, last = 0, idleOn = false, prog = 0, grain = false;
  const pano = () => document.getElementById('pano'), app = () => document.getElementById('app');

  function size() {
    const d = Math.min(devicePixelRatio || 1, 2);
    W = cv.width = Math.round(cv.clientWidth * d); H = cv.height = Math.round(cv.clientHeight * d);
  }
  addEventListener('resize', size);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const add = (p) => { if (parts.length < CAP()) parts.push(p); };
  const run = (e) => { fx.push(Object.assign({ t: 0 }, e)); start(); };
  function start() { if (!raf) { size(); last = performance.now(); raf = requestAnimationFrame(loop); } }

  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    cx.clearRect(0, 0, W, H);
    if (idleOn) drawIdle(dt);
    if (prog > 0) drawProgress();
    if (grain) drawGrain();
    fx = fx.filter((e) => { e.t += dt; return e.draw(e, dt) !== false; });
    parts = parts.filter((p) => { p.life -= dt; if (p.life <= 0) return false; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; drawPart(p); return true; });
    raf = (idleOn || prog > 0 || grain || fx.length || parts.length) ? requestAnimationFrame(loop) : 0;
  }
  function drawPart(p) {
    cx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
    cx.fillStyle = p.c;
    if (p.petal) { cx.save(); cx.translate(p.x, p.y); cx.rotate(p.life * 3); cx.beginPath(); cx.ellipse(0, 0, p.r * 1.6, p.r * .7, 0, 0, 7); cx.fill(); cx.restore(); }
    else { cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 7); cx.fill(); }
    cx.globalAlpha = 1;
  }

  /* Idle: soft moonlight, slow drifting mist */
  const mist = Array.from({ length: 14 }, () => ({ x: Math.random(), y: rnd(.45, .95), r: rnd(.15, .32), s: rnd(.004, .012) }));
  function drawIdle(dt) {
    const g = cx.createRadialGradient(W * .5, H * .12, 0, W * .5, H * .12, H * .7);
    g.addColorStop(0, 'rgba(255,236,170,.16)'); g.addColorStop(1, 'rgba(255,236,170,0)');
    cx.fillStyle = g; cx.fillRect(0, 0, W, H);
    const n = Math.min(mist.length, CAP() > 40 ? 14 : 7);
    for (let i = 0; i < n; i++) {
      const m = mist[i]; m.x += m.s * dt * 10; if (m.x > 1.3) m.x = -.3;
      const r = m.r * W, gr = cx.createRadialGradient(m.x * W, m.y * H, 0, m.x * W, m.y * H, r);
      gr.addColorStop(0, 'rgba(200,210,220,.10)'); gr.addColorStop(1, 'rgba(200,210,220,0)');
      cx.fillStyle = gr; cx.fillRect(m.x * W - r, m.y * H - r, r * 2, r * 2);
    }
  }
  /* Alignment building: ring of light grows with seconds held, vignette lifts */
  function drawProgress() {
    const g = cx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.min(W, H) * (.25 + .5 * prog));
    g.addColorStop(0, `rgba(255,225,140,${.25 * prog})`); g.addColorStop(1, 'rgba(255,225,140,0)');
    cx.fillStyle = g; cx.fillRect(0, 0, W, H);
  }
  function drawGrain() {
    cx.fillStyle = 'rgba(255,240,200,.5)';
    for (let i = 0; i < 160; i++) cx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    cx.fillStyle = `rgba(0,0,0,${Math.random() * .12})`; cx.fillRect(0, 0, W, H);
  }

  window.fxIdle = function (on = true) { idleOn = on; if (on) start(); };
  window.fxProgress = function (t) {
    prog = Math.max(0, Math.min(1, t));
    const v = document.getElementById('vignette'); if (v) v.style.opacity = String(1 - .7 * prog);
    if (prog > 0) start();
  };
  window.fxWrong = function () {                                  // short red flash, thorn pulse on HUD, 300 ms shake
    run({ draw(e) { cx.fillStyle = `rgba(190,20,20,${.4 * (1 - e.t / .35)})`; cx.fillRect(0, 0, W, H); return e.t < .35; } });
    const a = app(); a.classList.remove('shake'); void a.offsetWidth; a.classList.add('shake'); setTimeout(() => a.classList.remove('shake'), 320);
    const c = document.getElementById('timer'); if (c) { c.style.animation = 'bump .5s'; setTimeout(() => (c.style.animation = ''), 520); }
  };
  window.fxSuccess = function () {                                // gold ring burst, 30 particles
    for (let i = 0; i < 30; i++) { const a = Math.random() * 6.28, s = rnd(120, 420) * (W / 900); add({ x: W / 2, y: H / 2, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: rnd(2, 5), life: 1.6, max: 1.6, c: '#f3cf6a' }); }
    run({ draw(e) { const r = e.t * Math.min(W, H) * .9; cx.strokeStyle = `rgba(255,214,110,${1 - e.t / 1.2})`; cx.lineWidth = 8 * (1 - e.t / 1.2) + 1; cx.beginPath(); cx.arc(W / 2, H / 2, r, 0, 7); cx.stroke(); return e.t < 1.2; } });
  };
  window.fxVision = function (on = true) {                        // sepia flicker, desaturated frame, film grain
    grain = on; const p = pano();
    p.style.filter = on ? 'sepia(.9) saturate(.5) contrast(1.15) brightness(.85)' : '';
    if (on) { start(); fx.push({ t: 0, vis: 1, draw(e) { if (!grain) return false; p.style.opacity = String(.82 + Math.random() * .18); return true; } }); }
    else p.style.opacity = '';
  };
  /* ---- shared helpers for the big ending effects ---- */
  const U = () => Math.min(W, H) / 700;
  const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  function mkVine(x, y, ang, len, wob) {                           // a wandering stem as a list of points
    const pts = [{ x, y, a: ang }], st = 12 * U(); let a = ang;
    for (let d = 0; d < len; d += st) { a += rnd(-wob, wob); x += Math.cos(a) * st; y += Math.sin(a) * st; pts.push({ x, y, a }); }
    return pts;
  }
  function drawVine(pts, k, w, col, thorn, sheen) {                // draws the first k (0..1) of the stem, tapering, with optional thorns
    const n = Math.max(2, Math.floor(pts.length * Math.min(1, k))); if (k <= 0) return;
    cx.lineCap = 'round'; cx.lineJoin = 'round';
    for (let i = 1; i < n; i++) {
      const tw = Math.max(1.5, w * (1 - i / pts.length * .75));
      cx.strokeStyle = col; cx.lineWidth = tw; cx.beginPath(); cx.moveTo(pts[i - 1].x, pts[i - 1].y); cx.lineTo(pts[i].x, pts[i].y); cx.stroke();
      if (sheen) { cx.strokeStyle = sheen; cx.lineWidth = Math.max(1, tw * .22); cx.beginPath(); cx.moveTo(pts[i - 1].x - 1, pts[i - 1].y - 1); cx.lineTo(pts[i].x - 1, pts[i].y - 1); cx.stroke(); }
      if (thorn && i % 3 === 0) {
        const p = pts[i], s = (i % 6 === 0 ? 1 : -1), a = p.a + s * 1.15, L = 15 * U() * (1 - i / pts.length * .5);
        cx.fillStyle = thorn; cx.beginPath(); cx.moveTo(p.x - Math.cos(p.a) * tw * .4, p.y - Math.sin(p.a) * tw * .4); cx.lineTo(p.x + Math.cos(a) * L, p.y + Math.sin(a) * L); cx.lineTo(p.x + Math.cos(p.a) * tw * .4, p.y + Math.sin(p.a) * tw * .4); cx.fill();
      }
    }
  }
  function mkCrack(x, y, a, len, depth) {                          // a crack with side cracks, as a list of polylines
    const out = [], pts = [{ x, y }], st = 16 * U(); let ang = a;
    for (let d = 0; d < len; d += st) {
      ang += rnd(-.5, .5); x += Math.cos(ang) * st; y += Math.sin(ang) * st; pts.push({ x, y });
      if (depth < 2 && Math.random() < .2) out.push(...mkCrack(x, y, ang + rnd(-1.1, 1.1), (len - d) * .55, depth + 1));
    }
    out.push(pts); return out;
  }
  const edgeStart = (i) => { const s = i % 4; return s === 0 ? { x: rnd(0, W), y: H + 10, a: -Math.PI / 2 } : s === 1 ? { x: rnd(0, W), y: -10, a: Math.PI / 2 } : s === 2 ? { x: -10, y: rnd(0, H), a: 0 } : { x: W + 10, y: rnd(0, H), a: Math.PI }; };

  window.fxInk = function () {                                     // black ink tendrils flood in from the right and swallow the screen
    size();
    const n = 12, ts = Array.from({ length: n }, (_, i) => ({ pts: mkVine(W + 30, H * (i + .5) / n + rnd(-30, 30), Math.PI + rnd(-.35, .35), W * rnd(.7, 1.15), .45), d: rnd(0, .8), w: rnd(46, 96) * U() }));
    run({ draw(e) {
      ts.forEach((v) => drawVine(v.pts, ease((e.t - v.d) / 2.4), v.w, '#050304'));
      const k = ease(e.t / 3.1), g = cx.createLinearGradient(W, 0, W * (1 - k * 1.15), 0); g.addColorStop(0, 'rgba(5,3,4,1)'); g.addColorStop(1, 'rgba(5,3,4,0)');
      cx.fillStyle = g; cx.fillRect(0, 0, W, H); return e.t < 3.8; } });
  };
  window.fxVines = function () {                                   // thorn vines race up and tighten, the edges pulse red
    size();
    const n = CAP() > 40 ? 13 : 8, vs = Array.from({ length: n }, (_, i) => ({ pts: mkVine(W * (.12 + .76 * i / (n - 1)) + rnd(-25, 25), H + 12, -Math.PI / 2 + rnd(-.3, .3), H * rnd(.75, 1.1), .3), d: rnd(0, .6), w: rnd(9, 15) * U() }));
    run({ draw(e) {
      const pulse = .5 + .5 * Math.sin(e.t * 7), g = cx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .25, W / 2, H / 2, Math.hypot(W, H) / 2); g.addColorStop(0, 'rgba(120,10,16,0)'); g.addColorStop(1, `rgba(120,10,16,${.25 + .2 * pulse})`);
      cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      vs.forEach((v) => drawVine(v.pts, ease((e.t - v.d) / 2.2), v.w, '#0a0405', '#8a1218', '#3b1317'));
      return e.t < 3.8; } });
  };
  window.fxBreak = function () {                                   // gold cracks spread, a flash, then rays, embers and petals: the curse is gone
    size();
    const cxp = W / 2, cyp = H * .46, cracks = [];
    for (let i = 0; i < 9; i++) cracks.push(...mkCrack(cxp, cyp, i / 9 * 6.283 + rnd(-.2, .2), Math.min(W, H) * rnd(.45, .75), 0));
    const a = app(); a.classList.remove('shake'); void a.offsetWidth; a.classList.add('shake'); setTimeout(() => a.classList.remove('shake'), 320);
    const p = pano(); if (p) { p.style.transition = 'filter 1.6s'; setTimeout(() => (p.style.filter = 'brightness(1.4) saturate(1.3) sepia(.3)'), 1300); }
    let petals = 0;
    run({ draw(e) {
      const t = e.t;
      if (t < 1.9) {                                               // cracks, glowing, fading out after the flash
        const k = ease(t / 1.1), fade = Math.max(0, 1 - Math.max(0, t - 1.5) / .4);
        cx.save(); cx.globalAlpha = fade; cx.strokeStyle = '#fff3c4'; cx.lineWidth = 2.6 * U(); cx.lineJoin = 'round'; cx.shadowColor = '#ffc24a'; cx.shadowBlur = 20 * U();
        cracks.forEach((c) => { if (c.length < 2) return; const n = Math.min(c.length, Math.max(2, Math.floor(c.length * k))); cx.beginPath(); cx.moveTo(c[0].x, c[0].y); for (let i = 1; i < n; i++) cx.lineTo(c[i].x, c[i].y); cx.stroke(); });
        cx.restore();
      }
      if (t > 1.2 && t < 2.5) { const f = t < 1.5 ? (t - 1.2) / .3 : Math.max(0, 1 - (t - 1.5) / 1); cx.fillStyle = `rgba(255,246,214,${.92 * f})`; cx.fillRect(0, 0, W, H); }
      if (t > 1.5) {                                               // god rays and a warm glow
        const k = Math.min(1, (t - 1.5) / .9) * (1 - Math.max(0, (t - 4.6) / .9)), R = Math.max(W, H);
        cx.save(); cx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 30; i++) { const ang = i / 30 * 6.283 + t * .12 + Math.sin(i * 3.1) * .08, wd = .012 + .02 * Math.abs(Math.sin(i * 1.7 + t * .6)), g = cx.createRadialGradient(cxp, cyp, 0, cxp, cyp, R * .95);
          g.addColorStop(0, `rgba(255,226,150,${.22 * k})`); g.addColorStop(.45, `rgba(255,214,130,${.07 * k})`); g.addColorStop(1, 'rgba(255,214,130,0)'); cx.fillStyle = g; cx.beginPath(); cx.moveTo(cxp, cyp); cx.arc(cxp, cyp, R, ang - wd, ang + wd); cx.closePath(); cx.fill(); }
        const gl = cx.createRadialGradient(cxp, cyp, 0, cxp, cyp, Math.min(W, H) * .6); gl.addColorStop(0, `rgba(255,214,130,${.45 * k})`); gl.addColorStop(1, 'rgba(255,214,130,0)'); cx.fillStyle = gl; cx.fillRect(0, 0, W, H);
        cx.restore();
        if (t < 4.6) { add({ x: rnd(0, W), y: H + 10, vx: rnd(-20, 20), vy: -rnd(70, 170) * U() * 1.4, g: -4, r: rnd(1.5, 4) * U() + 1, life: rnd(2.4, 3.6), max: 3.2, c: Math.random() < .7 ? '#ffd77a' : '#fff1c2' });
          if (Math.random() < .35 && petals++ < 40) add({ x: rnd(0, W), y: -10, vx: rnd(-25, 25), vy: rnd(50, 110), g: 25, r: rnd(3, 6) * U() + 1, life: 4, max: 4, c: '#f7b6c2', petal: true }); }
      }
      return t < 5.5; } });
  };
  window.fxTimeUp = function () {                                  // black thorn vines close in from every edge and the light goes out
    size();
    const n = CAP() > 40 ? 24 : 14, vs = Array.from({ length: n }, (_, i) => { const s = edgeStart(i); return { pts: mkVine(s.x, s.y, s.a + rnd(-.5, .5), Math.hypot(W, H) * rnd(.32, .55), .34), d: rnd(0, .9), w: rnd(8, 15) * U() }; });
    run({ draw(e) {
      const t = e.t, k = ease(t / 3.2), R = Math.hypot(W, H) / 2 * (1 - k * .96), g = cx.createRadialGradient(W / 2, H / 2, Math.max(0, R * .35), W / 2, H / 2, Math.max(2, R));
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)'); cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      vs.forEach((v) => drawVine(v.pts, ease((t - v.d) / 2.6), v.w, '#050203', '#4a0d12', '#2a0d10'));
      if (t > 3) { cx.fillStyle = `rgba(0,0,0,${Math.min(1, (t - 3) / .7)})`; cx.fillRect(0, 0, W, H); }
      return t < 4; } });
  };
  window.fxClear = function () { fx = []; parts = []; idleOn = false; prog = 0; grain = false; const p = pano(); if (p) { p.style.filter = ''; p.style.opacity = ''; p.style.transition = ''; } cx.clearRect(0, 0, W, H); const v = document.getElementById('vignette'); if (v) v.style.opacity = ''; };
})();
