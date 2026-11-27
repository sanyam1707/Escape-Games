/* fx.js - minimal visual effects (kept light on purpose: no particles, no flashes). Sound lives in audio.js (Snd). */
(function () {
  const $ = (s) => document.querySelector(s);
  const fx = { reduce: false };
  const css = (n, d) => (getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d);
  const overlay = (style) => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;inset:0;z-index:75;pointer-events:none;' + style; $('#app').appendChild(d); return d; };
  const SND = { gain: 'key', bad: 'clunk', thud: 'clunk', crack: 'click', stone: 'vault', death: 'rumble', win: 'seal' };
  const noop = () => { };
  fx.init = noop; fx.setReduce = (b) => { fx.reduce = b; };
  fx.sfx = (n) => { try { Snd.fx(SND[n] || n); } catch (e) { } };
  fx.burst = noop; fx.ring = noop; fx.flash = noop; fx.shake = noop; fx.puff = noop; fx.motes = noop; fx.calm = noop; fx.near = noop; fx.clear = noop; fx.edge = noop;
  fx.right = () => fx.sfx('stone'); fx.wrong = () => fx.sfx('bad');
  fx.death = function () { fx.sfx('death'); return overlay('background:#000;opacity:0;transition:opacity 1.2s'); };
  fx.timeUp = function () { fx.sfx('death'); const d = overlay('background:#000;opacity:0;transition:opacity 2s'); requestAnimationFrame(() => requestAnimationFrame(() => d.style.opacity = '.85')); return d; };
  fx.win = function () { fx.sfx('win'); return null; };
  fx.c1 = () => css('--fx1', '#f5dc8a'); fx.c2 = () => css('--fx2', '#c9a66b');
  window.fx = fx;
})();
