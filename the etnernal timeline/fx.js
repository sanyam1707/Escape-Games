/* Screen effects. CSS + one canvas. One named function per state. Works without sound.
   Particle cap: 60 on phones, 120 on desktop. */
window.FX = (() => {
  const $ = (id) => document.getElementById(id);
  let cv, ctx, W = 0, H = 0, dpr = 1, raf = 0;
  const S = { threads: false, tension: 0, knot: 1, pulse: 0, hover: null, hoverA: 0, fade: 0, ink: 0, rewind: 0, last: 0 };
  let parts = [], rings = [], flashes = [];
  const cap = () => (innerWidth < 700 ? 60 : 120);
  const rnd = (a, b) => a + Math.random() * (b - a);

  function init() {
    cv = $('fx'); ctx = cv.getContext('2d');
    const rs = () => { dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    rs(); addEventListener('resize', rs);
    S.last = performance.now(); raf = requestAnimationFrame(loop);
  }

  const css = (cls, ms) => { const a = $('app'); a.classList.remove(cls); void a.offsetWidth; a.classList.add(cls); setTimeout(() => a.classList.remove(cls), ms); };
  const flash = (color, a, ms) => { const f = $('flash'); f.style.background = color; f.style.transition = 'none'; f.style.opacity = a; void f.offsetWidth; f.style.transition = `opacity ${ms}ms ease`; f.style.opacity = 0; };
  const vig = (ms) => { const v = $('vig'); v.style.transition = 'none'; v.style.opacity = .9; void v.offsetWidth; v.style.transition = `opacity ${ms}ms ease`; v.style.opacity = 0; };
  const spawn = (n, f) => { for (let i = 0; i < n && parts.length < cap(); i++) parts.push(f()); };
  const knotXY = () => ({ x: W / 2, y: Math.max(70, H * 0.17) });

  /* ----- one function per state ----- */
  // Idle: threads sway slowly, the knot pulses every 4 s
  function fxIdle(on = true) { S.threads = on; if (on) { S.tension = 0; } }
  // Ring lifted: ring glows (CSS on the ring), threads tighten slightly
  function fxLift() { S.tension = Math.min(1, S.tension + .25); setTimeout(() => (S.tension = Math.max(0, S.tension - .25)), 1500); }
  // Legal drop: gold ring pulse on the post, knot loosens a notch
  function fxDrop(x, y) { rings.push({ x, y, r: 6, a: 1, c: '243,199,125', grow: 110 }); S.knot = Math.max(0, S.knot - .04); S.tension = 0; }
  // Illegal drop: 300 ms shake, vignette flicker, thread twang
  function fxIllegal() { css('shake', 300); vig(450); S.tension = 1; S.twang = 1; setTimeout(() => (S.tension = 0), 500); }
  // Progress: knot unravels a quarter per ring on After
  function fxProgress(n) { S.knot = Math.max(0, 1 - n * .25); }
  // Part 1 complete: white flash, knot opens into a ring of light
  function fxPart1() { flash('#fff', .9, 900); const k = knotXY(); rings.push({ x: k.x, y: k.y, r: 10, a: 1, c: '255,250,230', grow: Math.max(W, H) * .5, w: 6 }); S.knot = 0; S.ringOfLight = 1; }
  // Wrong answer (Part 2): 600 ms desaturation dip, vignette pulse, threads tighten
  function fxWrong() { const a = $('app'); a.classList.add('desat'); setTimeout(() => a.classList.remove('desat'), 600); vig(700); S.tension = 1; setTimeout(() => (S.tension = 0), 700); }
  // Right answer (Part 2): gold ring expands from Holt across the floor
  function fxRight(x = W / 2, y = H * .5) { rings.push({ x, y, r: 10, a: 1, c: '243,199,125', grow: Math.max(W, H) * .8, w: 5, flat: .35 }); rings.push({ x, y, r: 4, a: .8, c: '255,235,180', grow: Math.max(W, H) * .6, w: 3, flat: .35, delay: .15 }); }
  // Choice hover: Cut = cold white glow, Hold = warm amber glow
  function fxHover(choice) { S.hover = choice; }
  // Time up: ink floods from the edges, clock hands spin backwards (CSS in the Time Up screen)
  function fxTimeUp() { S.threads = false; S.ink = 0.001; }
  // Ending Cut: white fade, particles dissolve into dust
  function fxEndCut() { S.threads = false; S.fade = 1; flash('#fff', 1, 2600); spawn(cap(), () => ({ x: rnd(0, W), y: rnd(H * .2, H), vx: rnd(-8, 8), vy: rnd(-30, -6), life: rnd(2, 4.5), age: 0, s: rnd(1, 3), c: '235,235,225' })); }
  // Ending Hold: scene rewinds with a slow zoom and a loop tick
  function fxEndHold() { S.threads = false; S.rewind = 1; const p = $('pano'); p.style.transition = 'transform 9s ease-in, filter 9s'; p.style.transform = 'scale(1.35)'; p.style.filter = 'sepia(.7) brightness(.9)'; }
  function fxReset() { S.ink = 0; S.fade = 0; S.rewind = 0; S.hover = null; S.knot = 1; S.threads = false; parts = []; rings = []; const p = $('pano'); p.style.transform = ''; p.style.filter = ''; p.style.transition = ''; }

  /* ----- draw loop ----- */
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(.05, (ts - S.last) / 1000); S.last = ts;
    ctx.clearRect(0, 0, W, H);
    if (!document.hidden) { drawHover(dt); if (S.threads) drawThreads(ts / 1000); drawRings(dt); drawParts(dt); if (S.ink) drawInk(dt); if (S.rewind) drawRewind(ts / 1000); }
  }
  function drawThreads(t) {
    const k = knotXY(); const n = innerWidth < 700 ? 18 : 30; const tens = S.tension;
    const pulse = 1 + .22 * Math.max(0, Math.sin(t * Math.PI / 2)) ** 8; // every 4 s
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1) - .5) * 2; const sway = Math.sin(t * .6 + i * 1.7) * (1 - tens * .85) * 14;
      const ex = k.x + a * W * .55 + sway, ey = H * (.52 + .1 * Math.abs(Math.sin(i)));
      ctx.strokeStyle = `rgba(233,190,100,${(.10 + .1 * (1 - Math.abs(a))) * (.4 + S.knot * .6)})`; ctx.lineWidth = 1 + (i % 3 === 0 ? .8 : 0);
      ctx.beginPath(); ctx.moveTo(k.x, k.y);
      ctx.quadraticCurveTo(k.x + a * W * .12 + sway * .5, k.y + (ey - k.y) * .55, ex, ey); ctx.stroke();
    }
    const r = (26 + S.knot * 34) * pulse;
    const g = ctx.createRadialGradient(k.x, k.y, 2, k.x, k.y, r * 2.2);
    g.addColorStop(0, `rgba(255,236,180,${.55 * (.3 + S.knot * .7)})`); g.addColorStop(1, 'rgba(255,200,100,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(k.x, k.y, r * 2.2, 0, 7); ctx.fill();
    if (S.knot > .02) { ctx.strokeStyle = `rgba(250,220,150,${.7 * S.knot})`; ctx.lineWidth = 2.5; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(k.x, k.y, r * (.5 + .1 * i) * S.knot + 3, r * .45 * S.knot + 2, t * .1 + i * 1.1, 0, 7); ctx.stroke(); } }
    if (S.ringOfLight) { ctx.strokeStyle = `rgba(255,248,220,${.6 * S.ringOfLight})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(k.x, k.y, 46, 0, 7); ctx.stroke(); S.ringOfLight = Math.max(0, S.ringOfLight - .0015); }
    ctx.restore();
  }
  function drawHover() {
    const target = S.hover ? 1 : 0; S.hoverA += (target - S.hoverA) * .12;
    if (S.hoverA < .01) return;
    const c = S.hover === 'cut' ? '210,235,255' : '255,170,60';
    const g = ctx.createRadialGradient(W / 2, H * .55, 20, W / 2, H * .55, Math.max(W, H) * .6);
    g.addColorStop(0, `rgba(${c},${.42 * S.hoverA})`); g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function drawRings(dt) {
    rings = rings.filter(r => r.a > .02);
    for (const r of rings) {
      if (r.delay > 0) { r.delay -= dt; continue; }
      r.r += (r.grow - r.r) * Math.min(1, dt * 3.2); r.a -= dt * .85;
      ctx.strokeStyle = `rgba(${r.c},${Math.max(0, r.a)})`; ctx.lineWidth = r.w || 3;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * (r.flat || 1), 0, 0, 7); ctx.stroke();
    }
  }
  function drawParts(dt) {
    parts = parts.filter(p => p.age < p.life);
    for (const p of parts) {
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 4 * dt;
      ctx.fillStyle = `rgba(${p.c},${Math.max(0, 1 - p.age / p.life) * .85})`; ctx.fillRect(p.x, p.y, p.s, p.s);
    }
  }
  function drawInk(dt) {
    S.ink = Math.min(1, S.ink + dt * .45);
    const t = S.ink, R = Math.hypot(W, H) * .75 * t;
    ctx.fillStyle = 'rgba(2,3,4,.96)';
    for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H], [W / 2, H], [W / 2, 0]]) { ctx.beginPath(); ctx.arc(x, y, R * (x === W / 2 ? .7 : 1), 0, 7); ctx.fill(); }
  }
  function drawRewind(t) {
    ctx.strokeStyle = 'rgba(243,199,125,.25)'; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) { const k = ((t * .5 + i / 5) % 1); const r = (1 - k) * Math.hypot(W, H) * .5; ctx.globalAlpha = k * .8; ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, 7); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }

  // debug helper: run every state once
  const TESTS = { fxIdle: () => fxIdle(true), fxLift, fxDrop: () => fxDrop(W / 2, H * .7), fxIllegal, fxProgress: () => fxProgress(2), fxPart1, fxWrong, fxRight: () => fxRight(), 'fxHover cut': () => fxHover('cut'), 'fxHover hold': () => fxHover('hold'), 'fxHover off': () => fxHover(null), fxTimeUp, fxEndCut, fxEndHold, reset: fxReset };

  return { init, fxIdle, fxLift, fxDrop, fxIllegal, fxProgress, fxPart1, fxWrong, fxRight, fxHover, fxTimeUp, fxEndCut, fxEndHold, fxReset, TESTS, _state: S };
})();
