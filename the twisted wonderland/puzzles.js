/* Pure puzzle logic. Used by game.js (browser) and tools/solvability_test.js (node). No DOM here. */
(function (root) {
  const P = {};

  // ---- 1. Gear train: crank pinion drives X; X and Y share a shaft; Y drives the door gear
  P.gearTurns = (d, x, y) => (x / d.pinion) * (d.door / y); // crank turns per door turn
  P.gearOk = (d, x, y) => x !== y && Math.abs(P.gearTurns(d, x, y) - d.target) < 1e-9;

  // ---- 2. Pouring vials
  P.pourStart = () => [0, 0];
  P.pourMove = (d, s, m) => {
    let [a, b] = s; const A = d.a, B = d.b;
    if (m === 'fillA') a = A; else if (m === 'fillB') b = B;
    else if (m === 'emptyA') a = 0; else if (m === 'emptyB') b = 0;
    else if (m === 'AtoB') { const t = Math.min(a, B - b); a -= t; b += t; }
    else if (m === 'BtoA') { const t = Math.min(b, A - a); b -= t; a += t; }
    return [a, b];
  };
  P.pourWin = (d, s) => s[0] === d.goalAmount || s[1] === d.goalAmount;
  P.pourShortest = (d) => { // BFS, returns number of moves
    const seen = new Map([['0,0', 0]]); let q = [[0, 0]];
    while (q.length) {
      const n = []; for (const s of q) {
        if (P.pourWin(d, s)) return seen.get(s + '');
        for (const m of ['fillA', 'fillB', 'emptyA', 'emptyB', 'AtoB', 'BtoA']) {
          const t = P.pourMove(d, s, m); if (!seen.has(t + '')) { seen.set(t + '', seen.get(s + '') + 1); n.push(t); }
        }
      } q = n;
    } return -1;
  };

  // ---- 3. Seating. seats[0..5] = guest at seat 1..6 (clockwise)
  P.seatOk = (g, seats) => {
    const at = (n) => seats.indexOf(n), adj = (i, j) => { const k = Math.abs(i - j); return k === 1 || k === 5; };
    const h = at('hatter'), hare = at('hare'), dor = at('dormouse'), rab = at('rabbit'), dodo = at('dodo'), duch = at('duchess');
    if ([h, hare, dor, rab, dodo, duch].some((i) => i < 0)) return false;
    return h === 0 && hare === (h + 1) % 6 && Math.abs(dor - h) === 3 && !adj(rab, hare) && adj(dodo, dor) && !adj(duch, dor);
  };
  P.perms = (arr) => arr.length <= 1 ? [arr] : arr.flatMap((x, i) => P.perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));

  // ---- 4. Word ladder
  P.ladderOk = (d, words) => d.rungs.every((r, i) => (words[i] || '').toUpperCase() === r.word);
  P.diff = (a, b) => [...a].filter((c, i) => c !== b[i]).length;

  // ---- 5. Mirror routing. cells like "B5": column letter A-I, row 1-9
  const DIRS = { E: [1, 0], N: [0, -1], W: [-1, 0], S: [0, 1] };
  const TURN = { '/': { E: 'N', N: 'E', W: 'S', S: 'W' }, '\\': { E: 'S', S: 'E', W: 'N', N: 'W' } };
  P.cell = (x, y) => String.fromCharCode(65 + x) + (y + 1);
  P.mirrorTrace = (d, living) => { // living: {cellId: '/' | '\\'}
    const hedges = new Set(d.hedges), fixed = {}; d.fixed.forEach(([c, m]) => (fixed[c] = m));
    let x = d.lantern.x, y = d.lantern.y, dir = d.lantern.dir; const path = [P.cell(x, y)], seen = new Set();
    for (;;) {
      x += DIRS[dir][0]; y += DIRS[dir][1];
      if (x < 0 || y < 0 || x >= d.size || y >= d.size) return { path, exit: { dir, row: y < 0 ? 0 : Math.min(y, d.size - 1) + 1, x, y }, end: 'out' };
      const id = P.cell(x, y); path.push(id);
      if (hedges.has(id)) return { path, exit: null, end: 'hedge' };
      const m = fixed[id] || living[id]; if (m) dir = TURN[m][dir];
      const key = id + dir; if (seen.has(key)) return { path, exit: null, end: 'loop' }; seen.add(key);
    }
  };
  P.mirrorOk = (d, living) => {
    const r = P.mirrorTrace(d, living);
    const lit = d.stones.every((s) => r.path.includes(s));
    return { ok: lit && !!r.exit && r.exit.dir === d.gate.dir && r.exit.row === d.gate.row, lit, exit: r.exit, end: r.end, path: r.path };
  };

  // ---- 6. Poem path. grid rows[0] = row 1 (near). mode: 'twist' | 'literal' | 'ignore'
  P.poemStepOk = (d, prev, cell, step, mode = 'twist') => { // prev {c,r} or null; cell {c,r}; step = 0-based
    if (cell.r !== step) return false;
    const col = d.rows[cell.r][cell.c]; if (col === 'C' || col !== d.poemColors[step]) return false;
    if (prev) {
      const dc = cell.c - prev.c; if (Math.abs(dc) > 1) return false;
      if (step === d.turnStep) { if (mode === 'twist' && dc !== 1) return false; if (mode === 'literal' && dc !== -1) return false; }
    }
    return true;
  };
  P.poemPaths = (d, mode = 'twist') => {
    const out = [];
    (function go(path) {
      const step = path.length; if (step === d.rows.length) return out.push(path.slice());
      for (let c = 0; c < d.rows[0].length; c++) {
        const cell = { c, r: step }; if (P.poemStepOk(d, path[step - 1] || null, cell, step, mode)) go([...path, cell]);
      }
    })([]);
    return out;
  };

  // ---- 7. Switchboard
  P.switchPress = (lit, i) => lit.map((v, k) => (Math.abs(k - i) <= 1 ? !v : v));
  P.switchSolutions = (start) => {
    const n = start.length, sols = [];
    for (let m = 0; m < 1 << n; m++) {
      let s = start.slice(); const presses = [];
      for (let i = 0; i < n; i++) if (m >> i & 1) { s = P.switchPress(s, i); presses.push(i + 1); }
      if (s.every(Boolean)) sols.push(presses);
    } return sols;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = P; else root.PZ = P;
})(typeof window !== 'undefined' ? window : globalThis);
