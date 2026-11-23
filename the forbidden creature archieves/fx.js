/* Room 7 screen effects. CSS + one canvas, no sound, no video. Driven by state (crossings, Part B result, ending, time).
   API: FX.init(host, cfg) FX.setStorm(crossings) FX.calmFlash() FX.redPulse() FX.maskRipple(x,y) FX.calmEnding()
        FX.sealedEnding() FX.inkFlood() FX.stopAll() FX.reapply() FX.test(name)  + named: stormHeavy/Medium/Light/Faint */
(function (root) {
  const FX = {};
  let host, shakeTarget, cvs, ctx, vig, flash, ring, ink, pit, raf = 0, last = 0, timers = [], cfg = { maxParticles: 150 };
  let kind = 'calm', parts = [], target = null, cur = { n: 0, speed: 0, mode: 'swirl', hue: 270 }, lastState = null, shakeTimer = 0;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const div = (cls, parent) => { const d = document.createElement('div'); d.className = cls; parent.appendChild(d); return d; };

  const PRESETS = {
    heavy:  { vig: .75, n: 120, speed: 2.2, shake: 2, every: 4000, mode: 'swirl', rgb: '150,90,255' },
    medium: { vig: .60, n: 70,  speed: 1.4, shake: 1, every: 4000, mode: 'swirl', rgb: '150,90,255' },
    light:  { vig: .45, n: 40,  speed: .7,  shake: 1, every: 8000, mode: 'swirl', rgb: '160,110,255' },
    faint:  { vig: .30, n: 14,  speed: .35, shake: 0, every: 0,    mode: 'swirl', rgb: '175,135,255' },
    calm:   { vig: .10, n: 24,  speed: .15, shake: 0, every: 0,    mode: 'swirl', rgb: '255,226,160' },
    off:    { vig: 0,   n: 0,   speed: 0,   shake: 0, every: 0,    mode: 'swirl', rgb: '150,90,255' }
  };

  FX.init = function (el, shakeEl, config) {
    host = el; shakeTarget = shakeEl || el; Object.assign(cfg, config || {});
    host.innerHTML = '';
    pit = div('fx-pit', host); vig = div('fx-vig', host);
    cvs = document.createElement('canvas'); cvs.className = 'fx-canvas'; host.appendChild(cvs); ctx = cvs.getContext('2d');
    ring = div('fx-ring', host); flash = div('fx-flash', host); ink = div('fx-ink', host);
    addEventListener('resize', size); size();
  };
  function size() { if (!cvs) return; const d = Math.min(devicePixelRatio || 1, 1.5); cvs.width = host.clientWidth * d; cvs.height = host.clientHeight * d; }

  function spawn() {
    const w = cvs.width, h = cvs.height, m = Math.min(w, h);
    return { a: Math.random() * 6.28, r: (.08 + Math.random() * .6) * m, sp: (.4 + Math.random()) * (Math.random() < .5 ? 1 : -1),
      x: Math.random() * w, y: Math.random() * h, s: 1 + Math.random() * 2.2, v: 0, al: 0 };
  }
  function loop(t) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(.05, (t - last) / 1000 || .016); last = t;
    const w = cvs.width, h = cvs.height; ctx.clearRect(0, 0, w, h);
    const want = Math.min(cfg.maxParticles, target ? target.n : 0);
    while (parts.length < want) parts.push(spawn());
    if (parts.length > want) parts.splice(want, parts.length - want);
    cur.speed += ((target ? target.speed : 0) - cur.speed) * Math.min(1, dt * 2.5);
    const rgb = target ? target.rgb : '150,90,255';
    for (const p of parts) {
      p.al = Math.min(1, p.al + dt * 2);
      if (target.mode === 'rain') {
        p.y += (500 + p.s * 120) * dt * (target.speed ? 1 : 0); p.x -= 40 * dt;
        if (p.y > h) { p.y = -20; p.x = Math.random() * w; }
        ctx.strokeStyle = `rgba(${rgb},${.55 * p.al})`; ctx.lineWidth = p.s * .8; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 4, p.y + 14 + p.s * 3); ctx.stroke();
      } else {
        p.a += p.sp * cur.speed * dt; const cx = w / 2, cy = h * .58;
        const x = cx + Math.cos(p.a) * p.r, y = cy + Math.sin(p.a) * p.r * .45 - (p.r * .1);
        ctx.fillStyle = `rgba(${rgb},${.7 * p.al})`; ctx.beginPath(); ctx.arc(x, y, p.s, 0, 6.28); ctx.fill();
      }
    }
  }
  function run() { if (!raf && cvs) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function shake(level) {
    if (reduced() || !level) return;
    shakeTarget.classList.remove('shake1', 'shake2'); void shakeTarget.offsetWidth;
    shakeTarget.classList.add('shake' + level); later(() => shakeTarget.classList.remove('shake1', 'shake2'), 520);
  }
  function applyPreset(name) {
    const p = PRESETS[name]; target = Object.assign({}, p, { mode: p.mode });
    vig.style.setProperty('--v', p.vig); vig.style.setProperty('--rgb', p.rgb);
    pit.style.opacity = name === 'calm' ? 1 : 0;
    clearInterval(shakeTimer);
    if (p.shake && p.every) { shakeTimer = setInterval(() => shake(p.shake), p.every); later(() => shake(p.shake), 400); }
    run();
  }
  function zero() { // clear one-shot layers
    timers.forEach(clearTimeout); timers = []; clearInterval(shakeTimer);
    [ring, flash, ink].forEach(e => { e.className = e.className.split(' ')[0]; e.style.cssText = ''; });
    shakeTarget.classList.remove('shake1', 'shake2');
  }
  /* stopAll: hard reset (screen change, restart). pause/resume: freeze the current look and bring it back. */
  FX.stopAll = function () { lastState = null; halt(); };
  let held = null;
  FX.pause = function () { held = lastState; halt(); };
  FX.resume = function () { const h = held; held = null; if (h) { lastState = h; FX.reapply(); } };
  function halt() {
    zero(); cancelAnimationFrame(raf); raf = 0; parts = []; target = null;
    if (ctx) ctx.clearRect(0, 0, cvs.width, cvs.height);
    if (vig) { vig.style.setProperty('--v', 0); pit.style.opacity = 0; }
  };
  FX.reapply = function () { if (lastState) FX[lastState.fn](...(lastState.args || [])); };
  const mark = (fn, args) => { lastState = { fn, args }; };

  FX.stormHeavy  = () => { mark('stormHeavy');  zero(); applyPreset('heavy'); };
  FX.stormMedium = () => { mark('stormMedium'); zero(); applyPreset('medium'); };
  FX.stormLight  = () => { mark('stormLight');  zero(); applyPreset('light'); };
  FX.stormFaint  = () => { mark('stormFaint');  zero(); applyPreset('faint'); };
  /* Part A live: crossings 5/4 heavy, 3 medium, 2 light, 1 faint, 0 calm (calmFlash is called by the game on the win). */
  FX.setStorm = function (n) { n >= 4 ? FX.stormHeavy() : n === 3 ? FX.stormMedium() : n === 2 ? FX.stormLight() : n === 1 ? FX.stormFaint() : FX.calmSettled(); };
  FX.calmSettled = () => { mark('calmSettled'); zero(); applyPreset('calm'); };
  FX.calmFlash = function () { window.Snd && Snd.sfx('calm');
    mark('calmSettled'); zero(); applyPreset('calm');
    flash.className = 'fx-flash go-soft'; later(() => { flash.className = 'fx-flash'; }, 1300);
  };
  FX.redPulse = function () {
    zero(); vig.classList.remove('red'); void vig.offsetWidth; vig.classList.add('red'); later(() => vig.classList.remove('red'), 450);
    shake(1); if (lastState) later(() => FX.reapply(), 460);
  };
  /* each wrong accusation: a stronger storm, a red flash and a shake (1 light, 2 medium, 3 heavy) */
  FX.accuseStrike = function (n) { window.Snd && Snd.sfx('strike'); (n >= 3 ? FX.stormHeavy : n === 2 ? FX.stormMedium : FX.stormLight)(); FX.redPulse(); shake(n >= 2 ? 2 : 1); };
  FX.maskRipple = function (x, y) { window.Snd && Snd.sfx('whoosh');
    zero(); ring.style.left = (x == null ? 72 : x) + '%'; ring.style.top = (y == null ? 62 : y) + '%';
    ring.className = 'fx-ring white'; void ring.offsetWidth; ring.className = 'fx-ring white go'; later(() => { ring.className = 'fx-ring'; if (lastState) FX.reapply(); }, 1500);
  };
  function lightning(n) { if (reduced()) return; for (let i = 0; i < n; i++) later(() => { window.Snd && Snd.sfx('thunder'); flash.className = 'fx-flash go-hard'; later(() => { flash.className = 'fx-flash'; }, 180); }, 500 + i * 750); }
  function rain(rgb, delay) { later(() => { pit.style.opacity = 1; target = { n: 110, speed: 1, mode: 'rain', rgb }; parts = []; vig.style.setProperty('--v', .1); run(); }, delay); }
  /* auto=false: only the ring and the white-gold pit; the game calls FX.endingStorm() on the Stormwing beat. */
  FX.calmEnding = function (auto) { window.Snd && Snd.sfx('calm');
    mark('calmEnding'); zero(); ring.style.left = '50%'; ring.style.top = '60%'; kind = 'calm';
    ring.className = 'fx-ring gold'; void ring.offsetWidth; ring.className = 'fx-ring gold go';
    applyPreset('calm'); if (auto !== false) FX.endingStorm();
  };
  FX.endingStorm = function () {
    if (kind === 'calm') { lightning(3); rain('255,236,190', 3000); }
    else { rain('190,235,245', 1500); }
  };
  FX.sealedEnding = function (auto) { window.Snd && Snd.sfx('seal');
    mark('sealedEnding'); zero(); ring.style.left = '50%'; ring.style.top = '60%'; kind = 'sealed';
    ring.className = 'fx-ring cyan'; void ring.offsetWidth; ring.className = 'fx-ring cyan close';
    applyPreset('calm'); later(() => { flash.className = 'fx-flash go-slow'; }, 900);
    later(() => { flash.className = 'fx-flash'; if (target) target.speed = 0; }, 3200); // particles freeze for a beat
    if (auto !== false) later(() => rain('190,235,245', 0), 4200);
  };
  FX.inkFlood = function () {
    return new Promise(res => {
      window.Snd && Snd.sfx('ink'); mark('inkFlood'); zero(); ink.className = 'fx-ink go'; later(() => res(), 3100);
    });
  };
  FX.states = ['storm5', 'storm4', 'storm3', 'storm2', 'storm1', 'calmFlash', 'redPulse', 'maskRipple', 'calmEnding', 'sealedEnding', 'inkFlood'];
  FX.test = function (s) {
    FX.stopAll(); if (!cvs) return;
    const n = /^storm(\d)$/.exec(s); if (n) return FX.setStorm(+n[1]);
    if (FX[s]) return FX[s]();
  };
  root.FX = FX;
})(window);
