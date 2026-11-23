/* Final-room screen effects. One named function per row of docs/puzzle.md. CSS plus canvas, no video, works without sound.
   Particle cap: 60 on phones, 120 on larger screens; the cap halves if the frame rate falls. */
(function (root) {
  "use strict";
  let cv, ctx, ink, app, sight, W = 0, H = 0, dpr = 1, raf = 0, last = 0, cap = 120, slow = 0;
  const fxs = [], parts = [];
  const rnd = (a, b) => a + Math.random() * (b - a);

  function init(canvas, inkEl, appEl, sightEl) {
    cv = canvas; ctx = cv.getContext("2d"); ink = inkEl; app = appEl; sight = sightEl;
    cap = Math.min(innerWidth, innerHeight) < 700 ? 60 : 120;
    resize(); addEventListener("resize", resize);
  }
  function resize() {
    if (!cv) return;
    dpr = Math.min(devicePixelRatio || 1, 2); W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function loop(now) {
    const dt = Math.min(now - last, 100); last = now;
    if (dt > 34) slow++; else slow = Math.max(0, slow - 1);
    if (slow > 20 && cap > 20) { cap = Math.floor(cap / 2); slow = 0; if (parts.length > cap) parts.length = cap; }
    ctx.clearRect(0, 0, W, H);
    for (let i = fxs.length - 1; i >= 0; i--) { const e = fxs[i]; e.t += dt; if (e.draw(ctx, e.t, dt) === false) fxs.splice(i, 1); }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.t += dt; if (p.t > p.life) { parts.splice(i, 1); continue; }
      const k = p.t / p.life;
      if (p.to) { p.x += (p.to[0] - p.x) * Math.min(1, dt / 260); p.y += (p.to[1] - p.y) * Math.min(1, dt / 260); }
      else { p.x += p.vx * dt / 16; p.y += p.vy * dt / 16; }
      ctx.globalAlpha = (1 - k) * .9; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (1 - k * .5), 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    raf = (fxs.length || parts.length) ? requestAnimationFrame(loop) : 0;
  }
  const add = (draw) => { const e = { t: 0, draw }; fxs.push(e); kick(); return e; };
  function burst(x, y, n, color, speed, life, to) {
    for (let i = 0; i < n && parts.length < cap; i++) {
      const a = rnd(0, 6.283), v = rnd(.3, 1) * speed;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(life * .6, life), t: 0, s: rnd(1.5, 3.5), c: color, to: to || null });
    }
    kick();
  }
  const cx = () => W / 2, cy = () => H * 0.42;
  function ring(x, y, color, dur, r0, r1, width) {
    return add((c, t) => {
      const k = t / dur; if (k >= 1) return false;
      c.globalAlpha = 1 - k; c.strokeStyle = color; c.lineWidth = width * (1 - k * .6);
      c.beginPath(); c.arc(x, y, r0 + (r1 - r0) * k, 0, 6.283); c.stroke(); c.globalAlpha = 1;
    });
  }
  function vignette(color, peak, dur) {
    return add((c, t) => {
      const k = t / dur; if (k >= 1) return false;
      const a = peak * Math.sin(Math.PI * k), g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .25, W / 2, H / 2, Math.max(W, H) * .75);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, color.replace("A", a.toFixed(3)));
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    });
  }
  function shake(ms, px) {
    if (!app || !app.animate) return;
    app.animate([{ transform: "translate(0,0)" }, { transform: `translate(${-px}px,${px / 2}px)` }, { transform: `translate(${px}px,${-px / 2}px)` }, { transform: "translate(0,0)" }], { duration: ms });
  }
  function setInk(hole, opacity) { if (!ink) return; ink.style.setProperty("--hole", hole + "%"); ink.style.opacity = opacity; }

  const api = {
    init, resize,
    /* Part 1 aligning: gold ring grows and brightens (progress 0..1). The ring is a CSS element inside #sight. */
    sightRing(progress) {
      if (!sight) return; const p = Math.max(0, Math.min(1, progress)), el = sight.querySelector(".ring");
      const size = 230 - 150 * p; el.style.width = el.style.height = size + "px";
      el.style.borderColor = `rgba(242,178,74,${.25 + .75 * p})`;
      el.style.boxShadow = `0 0 ${6 + 34 * p}px ${2 + 8 * p}px rgba(242,178,74,${.15 + .6 * p}), inset 0 0 ${10 + 30 * p}px rgba(242,178,74,${.1 + .4 * p})`;
    },
    /* Part 1 locked on: one gold flash ring, a beam sweep and a dust trail. */
    lockOn() {
      ring(cx(), cy(), "#F2B24A", 900, 20, Math.max(W, H) * .6, 6);
      add((c, t) => {
        const k = t / 1100; if (k >= 1) return false;
        c.save(); c.translate(cx(), cy()); c.rotate(-1.2 + k * 2.4); c.globalAlpha = Math.sin(Math.PI * k) * .55;
        const g = c.createLinearGradient(0, 0, Math.max(W, H), 0); g.addColorStop(0, "#fff3c2"); g.addColorStop(1, "rgba(242,178,74,0)");
        c.fillStyle = g; c.beginPath(); c.moveTo(0, -6); c.lineTo(Math.max(W, H), -40); c.lineTo(Math.max(W, H), 40); c.lineTo(0, 6); c.fill(); c.restore();
      });
      burst(cx(), cy(), 40, "#ffd98a", 3, 1400);
    },
    /* Part 2 right key: the lock glows its colour, small ring pulse. */
    lockGlow(i, color, x, y) {
      api.clearInk();
      x = x ?? W * (0.1 + 0.2 * i + 0.1); y = y ?? H * .45;
      ring(x, y, color || "#8B6FD6", 800, 8, 70, 4); burst(x, y, 10, color || "#8B6FD6", 1.6, 700);
    },
    /* Part 2 wrong: 1 soft violet vignette + light shake, 2 stronger + keyhole flicker, 3 ink creeps in. */
    wrong(n) {
      if (n <= 1) { vignette("rgba(139,111,214,A)", .5, 700); shake(300, 3); }
      else if (n === 2) {
        vignette("rgba(139,111,214,A)", .8, 900); shake(300, 5);
        add((c, t) => { if (t > 1100) return false; c.globalAlpha = (Math.sin(t / 45) > 0 ? .85 : .15) * (1 - t / 1100); c.fillStyle = "#8B6FD6";
          [[.08, .3], [.92, .3], [.06, .6], [.94, .62], [.5, .06]].forEach(([x, y]) => { c.beginPath(); c.arc(x * W, y * H, 9, 0, 6.283); c.fill(); c.fillRect(x * W - 3, y * H + 4, 6, 16); }); c.globalAlpha = 1; });
      } else { vignette("rgba(60,30,120,A)", .9, 900); shake(300, 6); setInk(75, 1); }
    },
    clearInk() { setInk(75, 0); },
    /* Part 3 sea turn: ink floods the whole screen, then drains. Resolves when drained. */
    seaTurn() {
      return new Promise((res) => {
        if (ink) ink.style.transition = "opacity 1s, --hole 1s"; setInk(0, 1); shake(500, 6);
        setTimeout(() => { setInk(75, 0); setTimeout(res, 500); }, 1700);
      });
    },
    /* Part 3 cliff turn: rings pulse inward, violet to teal, particles fly into the keyholes. */
    cliffTurn() {
      const R = Math.max(W, H) * .5;
      for (let i = 0; i < 4; i++) setTimeout(() => {
        add((c, t) => { const k = t / 1200; if (k >= 1) return false; const mix = (i + k) / 4;
          c.globalAlpha = (1 - k) * .8; c.strokeStyle = `rgb(${Math.round(139 - 77 * mix)},${Math.round(111 + 31 * mix)},${Math.round(214 - 81 * mix)})`; c.lineWidth = 5;
          c.beginPath(); c.arc(cx(), cy(), R * (1 - k) + 10, 0, 6.283); c.stroke(); c.globalAlpha = 1; });
      }, i * 260);
      setTimeout(() => { for (let i = 0; i < 30 && parts.length < cap; i++) { const a = rnd(0, 6.283), r = Math.max(W, H) * rnd(.3, .6);
        parts.push({ x: cx() + Math.cos(a) * r, y: cy() + Math.sin(a) * r, vx: 0, vy: 0, life: 1100, t: 0, s: rnd(2, 4), c: i % 2 ? "#3E8E85" : "#8B6FD6", to: [cx(), cy()] }); } kick(); }, 300);
    },
    /* Choice A: teal fade, slow brass bell light on every hook (13 hooks in a ring). */
    choiceA() {
      return add((c, t) => {
        const k = Math.min(t / 1800, 1); c.fillStyle = `rgba(62,142,133,${.28 * k})`; c.fillRect(0, 0, W, H);
        const R = Math.min(W, H) * .3;
        for (let i = 0; i < 13; i++) {
          const a = i / 13 * 6.283 - 1.5708, lit = Math.max(0, Math.min(1, (t - 600 - i * 220) / 500)), x = cx() + Math.cos(a) * R, y = cy() + Math.sin(a) * R;
          const g = c.createRadialGradient(x, y, 0, x, y, 26); g.addColorStop(0, `rgba(255,226,150,${.95 * lit})`); g.addColorStop(1, "rgba(200,162,74,0)");
          c.fillStyle = g; c.beginPath(); c.arc(x, y, 26, 0, 6.283); c.fill();
        }
        return t < 9000;
      });
    },
    /* Choice B: one warm amber beam on the empty Memory hook. */
    choiceB() {
      return add((c, t) => {
        const k = Math.min(t / 1500, 1), x = cx() + Math.min(W, H) * .3 * Math.cos(-1.5708 + 1.7), y = cy() + Math.min(W, H) * .3 * Math.sin(-1.5708 + 1.7);
        const g = c.createLinearGradient(x, 0, x, y); g.addColorStop(0, "rgba(255,190,90,0)"); g.addColorStop(1, `rgba(255,190,90,${.75 * k})`);
        c.fillStyle = g; c.beginPath(); c.moveTo(x - 6, 0); c.lineTo(x + 6, 0); c.lineTo(x + 34, y); c.lineTo(x - 34, y); c.fill();
        const h = c.createRadialGradient(x, y, 0, x, y, 40); h.addColorStop(0, `rgba(255,214,140,${.9 * k})`); h.addColorStop(1, "rgba(255,190,90,0)");
        c.fillStyle = h; c.beginPath(); c.arc(x, y, 40, 0, 6.283); c.fill();
        return t < 9000;
      });
    },
    /* Time up: tide wave rises from the bottom. */
    tide() {
      return add((c, t) => {
        const k = Math.min(t / 5500, 1), top = H * (1 - k * 1.05);
        c.fillStyle = "rgba(14,56,84,.88)"; c.beginPath(); c.moveTo(0, H);
        for (let x = 0; x <= W; x += 8) c.lineTo(x, top + Math.sin(x / 38 + t / 260) * 9 + Math.sin(x / 91 + t / 520) * 6);
        c.lineTo(W, H); c.fill();
        c.fillStyle = "rgba(160,220,230,.25)"; c.beginPath(); c.moveTo(0, H);
        for (let x = 0; x <= W; x += 8) c.lineTo(x, top + 12 + Math.sin(x / 55 - t / 300) * 7);
        c.lineTo(W, H); c.fill();
        return t < 30000;
      });
    },
    clear() { fxs.length = 0; parts.length = 0; if (ctx) ctx.clearRect(0, 0, W, H); if (ink) { ink.style.transition = ""; setInk(75, 0); } },
    _state() { return { fx: fxs.length, parts: parts.length, cap }; },
  };
  root.fx = api;
})(typeof window !== "undefined" ? window : this);
