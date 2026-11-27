/* Screen effects for the final room (and the clock). CSS + canvas only, no video, works with sound off.
   One named function per state. A stronger effect cancels a weaker one. Particle cap: 40 phones, 80 desktop. */
(function () {
  const app = () => document.getElementById('app');
  let cv, ctx, parts = [], rings = [], raf = 0, cur = { level: 0, name: '', until: 0 };
  const cap = () => (innerWidth < 600 ? 40 : 80);
  const LEVEL = { courtOpen: 1, cardLit: 1, half: 2, wrong: 3, allLit: 4, timeUp: 5 };
  const GOLD = ['#ffe27a', '#e2b640', '#fff4c2'];

  function ensure() {
    if (cv) return;
    cv = document.createElement('canvas'); cv.id = 'fxc'; app().appendChild(cv); ctx = cv.getContext('2d'); size();
    addEventListener('resize', size);
  }
  function size() { cv.width = innerWidth; cv.height = innerHeight; }
  function loop() {
    ctx.clearRect(0, 0, cv.width, cv.height); const now = performance.now();
    rings = rings.filter((r) => now - r.t0 < r.dur);
    rings.forEach((r) => { const k = (now - r.t0) / r.dur; ctx.strokeStyle = r.col; ctx.globalAlpha = 1 - k; ctx.lineWidth = r.w * (1 - k) + 1; ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * k, 0, 7); ctx.stroke(); });
    parts = parts.filter((p) => p.life > 0);
    parts.forEach((p) => {
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.rot += p.vr; p.life -= 1; ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.col;
      if (p.card) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-9, -13, 18, 26); ctx.fillStyle = '#b3262f'; ctx.fillRect(-5, -7, 10, 14); ctx.restore(); } else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
    }); ctx.globalAlpha = 1;
    raf = parts.length || rings.length ? requestAnimationFrame(loop) : 0;
  }
  const kick = () => { ensure(); if (!raf) raf = requestAnimationFrame(loop); };
  function ring(x, y, r0, r1, dur, col, w = 6) { rings.push({ x, y, r0, r1, dur, col, w, t0: performance.now() }); kick(); }
  function burst(x, y, n, o = {}) {
    n = Math.min(n, cap() - parts.length); for (let i = 0; i < n; i++) {
      const a = Math.random() * 7, s = (o.speed || 3) * (0.4 + Math.random());
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (o.up || 0), g: o.g || 0.05, r: 2 + Math.random() * 3, life: 50 + Math.random() * 30, max: 80, col: o.col || GOLD[i % 3], card: o.card, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3 });
    } kick();
  }
  const cls = (c, ms) => { const a = app(); a.classList.add(c); if (ms) setTimeout(() => a.classList.remove(c), ms); };
  function start(name) { // returns false when a stronger effect is still running
    const now = performance.now(), lv = LEVEL[name];
    if (cur.level > lv && now < cur.until) return false;
    if (cur.level < lv || now >= cur.until) { parts = []; rings = []; ['fx-wrong', 'fx-flash', 'fx-half', 'fx-tick'].forEach((c) => app().classList.remove(c)); }
    cur = { level: lv, name, until: now + 900 }; return true;
  }

  const FX = {
    fxCourtOpen() { if (!start('courtOpen')) return; cls('fx-court'); },
    fxCourtClose() { app().classList.remove('fx-court'); },
    fxCardLit(x, y) { if (!start('cardLit')) return; ring(x, y, 8, 60, 700, '#e2b640'); burst(x, y, 8, { speed: 2 }); cls('fx-lift', 600); },
    fxHalf() { if (!start('half')) return; cls('fx-half', 1400); },
    fxWrong() {
      if (!start('wrong')) return; cls('fx-wrong', 700); const x = innerWidth / 2, y = innerHeight / 2;
      ring(x, y, 20, Math.min(innerWidth, innerHeight) * 0.5, 600, '#d83b3b'); burst(x, y, 14, { card: 1, col: '#f1e6cc', speed: 5, g: 0.2, up: 2 });
    },
    fxAllLit() {
      if (!start('allLit')) return; cur.until = performance.now() + 1500; cls('fx-flash', 900); cls('fx-tick', 900);
      const x = innerWidth / 2, y = innerHeight / 2; ring(x, y, 10, Math.max(innerWidth, innerHeight) * 0.7, 1100, '#ffe27a', 10); burst(x, y, 40, { speed: 6 });
    },
    fxLastMinute(on = true) { app().classList.toggle('lastmin', on); },
    fxTimeUp() { start('timeUp'); cur.until = performance.now() + 4000; cls('fx-ink'); },
    fxReset() { ['fx-court', 'fx-ink', 'lastmin', 'fx-wrong', 'fx-flash', 'fx-half', 'fx-tick', 'fx-lift'].forEach((c) => app().classList.remove(c)); parts = []; rings = []; cur = { level: 0, name: '', until: 0 }; },
  };
  window.FX = FX;
})();
