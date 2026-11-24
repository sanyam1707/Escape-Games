// Screen effects for the final room and the ending. One named function per state (docs/puzzle.md).
// State driven, no sound needed. Particle cap: 60 phones, 150 desktop.
const fx = (() => {
  const $ = id => document.getElementById(id);
  const cap = () => (innerWidth < 700 ? 60 : 150);
  let parts = [], raf = 0, cv, cx;
  const classOnce = (el, cls, ms) => { const c = cls.split(' '); el.classList.remove(...c); void el.offsetWidth; el.classList.add(...c); if (ms) setTimeout(() => el.classList.remove(...c), ms); };

  function loop() {
    cv = cv || $('fx-c'); cx = cx || cv.getContext('2d');
    if (cv.width !== innerWidth) { cv.width = innerWidth; cv.height = innerHeight; }
    cx.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter(p => p.life > 0);
    parts.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life--;
      cx.globalAlpha = Math.max(0, p.life / p.max); cx.fillStyle = p.c;
      cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 6.3); cx.fill();
    });
    raf = parts.length ? requestAnimationFrame(loop) : 0;
    if (!raf) cx.clearRect(0, 0, cv.width, cv.height);
  }
  function burst(x, y, n, o = {}) {
    n = Math.min(n, cap() - parts.length);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.3, s = (o.speed || 2) * (0.4 + Math.random());
      parts.push({ x, y, vx: o.up ? (Math.random() - .5) * 1.5 : Math.cos(a) * s, vy: o.up ? -s : Math.sin(a) * s, g: o.up ? -0.01 : 0.04,
        r: 1.5 + Math.random() * 2.5, life: o.life || 45, max: o.life || 45, c: o.c || '#f2d98a' });
    }
    if (!raf) raf = requestAnimationFrame(loop);
  }
  const center = el => { const r = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 }; return [r.left + r.width / 2, r.top + r.height / 2]; };

  return {
    enterTower() { $('fx-vig').classList.add('gold'); $('fx-vig').classList.add('tick'); },
    engineWake() { classOnce($('fx-ring'), 'go', 1600); $('fx-vig').classList.add('tick'); },
    ringPick(el) { el && el.classList.add('glow'); },
    ringDrop(el) { el && el.classList.remove('glow'); const [x, y] = center(el); burst(x, y, 14, { speed: 1.6 }); },
    ringBounce(el) { if (el) { el.classList.remove('glow'); classOnce(el, 'wobble', 500); } classOnce($('fx-flash'), 'warm', 160); },
    towerLight(n) { const w = $('fx-windows'); w.classList.toggle('on', n > 0); [...w.children].forEach((c, i) => c.classList.toggle('lit', i < n)); },
    timeLow(on = true) { $('fx-vig').classList.toggle('low', on); },
    part1Solved() { classOnce($('fx-flash'), 'gold', 1200); classOnce($('fx-ring'), 'go big', 1800); burst(innerWidth / 2, innerHeight * .85, 40, { up: true, speed: 2.4, life: 90 }); },
    choiceHover(side) { $('fx-tint').className = side ? side : ''; },
    endMorning() { $('fx-frost').className = 'on melt'; $('fx-dawn').classList.add('on'); },
    endHeld() { $('fx-frost').className = 'on spread'; $('fx-watch').classList.add('on'); },
    lastBell() { classOnce($('fx-ring'), 'go white', 1200); classOnce($('fx-flash'), 'white', 600); classOnce($('app'), 'shake', 450); setTimeout(() => $('fx-ink').classList.add('on'), 450); },
    clear() { ['fx-vig', 'fx-tint', 'fx-dawn', 'fx-frost', 'fx-ring', 'fx-flash', 'fx-ink', 'fx-watch'].forEach(i => { $(i).className = ''; }); this.towerLight(0); parts = []; $('app').classList.remove('shake'); },
    _burst: burst
  };
})();
