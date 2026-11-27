/* custom_fx: light garden effects for this game only. Soft green glow on progress, small shake on a wrong answer, bloom when a puzzle is solved, petals when time is up. */
(function () {
  const $ = (s) => document.querySelector(s), app = () => $('#app');
  const add = (cls, ms) => { const d = document.createElement('div'); d.className = cls; app().appendChild(d); if (ms) setTimeout(() => d.remove(), ms); return d; };
  const calm = () => matchMedia('(prefers-reduced-motion:reduce)').matches;
  // progress glow on a score gain, small shake of the open panel on a loss (wrong answer)
  new MutationObserver(() => {
    const el = $('#scoreV'); if (!el) return; const n = +el.textContent;
    if (el._last != null && n > el._last) { const s = $('#score'); s.classList.remove('grow'); void s.offsetWidth; s.classList.add('grow'); }
    if (el._last != null && n < el._last) { const c = $('.card'); if (c) { c.classList.remove('nudge'); void c.offsetWidth; c.classList.add('nudge'); } }
    el._last = n;
  }).observe(document.body, { subtree: true, childList: true, characterData: true });
  // bloom when a puzzle is solved (the engine plays the 'chime' sound exactly then)
  const f = Snd.fx; Snd.fx = function (n) { if (n === 'chime' && !calm()) add('gbloom', 1100); return f.apply(this, arguments); };
  // time up: petals fall, the garden closes
  fx.timeUp = function () {
    fx.sfx('death'); const d = add('gpetals');
    for (let i = 0; i < 22; i++) { const p = document.createElement('i'); p.style.left = Math.round(Math.random() * 100) + '%'; p.style.animationDelay = (Math.random() * 2.2).toFixed(2) + 's'; p.style.background = ['#e9a3b4', '#f3ecd0', '#e8b25c'][i % 3]; d.appendChild(p); }
    requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('on'))); return d;
  };
})();
