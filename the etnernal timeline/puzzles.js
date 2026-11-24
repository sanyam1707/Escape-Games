/* Pure puzzle logic. No DOM. Used by game.js in the browser and tools/solvability_test.js in Node. */
(function (root) {
  const P = {};

  // Gear Train: middle gears must fill the gap exactly and be an even count (drum turns anticlockwise).
  P.gearTest = (cfg, mid) => {
    if (!mid.length) return 'noGear';
    const used = cfg.motor / 2 + mid.reduce((a, b) => a + b, 0) + cfg.drum / 2;
    if (used < cfg.gap) return 'tooShort';
    if (used > cfg.gap) return 'tooLong';
    return mid.length % 2 === 0 ? 'works' : 'wrongWay';
  };

  // Alibi grid: ticks = {person: place}. Right when every person has exactly the solution place.
  P.gridOk = (year, ticks) => Object.keys(year.solution).every(p => ticks[p] === year.solution[p]) && Object.keys(ticks).length === Object.keys(year.solution).length;

  // Tinted lens: code is the red digits ordered by green place.
  P.lensCode = (prints) => prints.slice().sort((a, b) => a.place - b.place).map(p => p.digit).join('');

  // Cipher wheel: inner ring offset k means inner A sits under outer letter index k.
  P.cipherDecode = (text, k) => text.replace(/[A-Z]/g, c => String.fromCharCode(65 + ((c.charCodeAt(0) - 65 - k + 26) % 26)));

  // Ring tower: posts are arrays of ring sizes (bigger number = bigger ring), top is the last item.
  P.towerLegal = (posts, from, to) => {
    if (from === to || !posts[from].length) return false;
    const r = posts[from][posts[from].length - 1];
    const t = posts[to];
    return !t.length || t[t.length - 1] > r;
  };
  P.towerWon = (posts, n) => posts[2].length === n;
  P.towerStart = (n) => [Array.from({ length: n }, (_, i) => n - i), [], []];

  // Sightline: is landmark under the wire?
  P.angDiff = (a, b) => { let d = (a - b) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return Math.abs(d); };
  P.underWire = (cfg, lm, yaw, pitch) => P.angDiff(lm.yaw, yaw) <= cfg.tolerance && Math.abs(lm.pitch - pitch) <= cfg.pitchTolerance;

  // Hotspot graph: validate ids and cycles in `after`.
  P.validate = (g) => {
    const errs = [];
    const cardIds = new Set(Object.keys(g.cards));
    g.rooms.forEach(r => {
      const ids = new Set();
      r.hotspots.forEach(h => { if (ids.has(h.id)) errs.push('duplicate id ' + h.id); ids.add(h.id); });
      r.hotspots.forEach(h => {
        (h.after || []).forEach(a => { if (!ids.has(a)) errs.push(`${h.id}: unknown after "${a}"`); });
        if (h.item && !g.items[h.item]) errs.push(`${h.id}: unknown item ${h.item}`);
        if (h.needs && !g.items[h.needs]) errs.push(`${h.id}: unknown needs ${h.needs}`);
        if (h.card && !cardIds.has(h.card)) errs.push(`${h.id}: unknown card ${h.card}`);
        if (h.panel && !g.puzzles[h.panel] && h.panel !== 'torch') errs.push(`${h.id}: unknown panel ${h.panel}`);
        if (h.kind === 'USE' && !h.needs) errs.push(`${h.id}: USE needs "needs"`);
      });
      if (r.hotspots.length && !ids.has(r.final)) errs.push(`${r.id}: final "${r.final}" not found`);
      // cycle check
      const state = {};
      const byId = Object.fromEntries(r.hotspots.map(h => [h.id, h]));
      const visit = (id, path) => {
        if (state[id] === 2) return;
        if (state[id] === 1) { errs.push(`cycle in ${r.id}: ${path.concat(id).join(' > ')}`); return; }
        state[id] = 1;
        ((byId[id] || {}).after || []).forEach(a => byId[a] && visit(a, path.concat(id)));
        state[id] = 2;
      };
      r.hotspots.forEach(h => visit(h.id, []));
    });
    return errs;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = P; else root.Puzzles = P;
})(typeof window !== 'undefined' ? window : globalThis);
