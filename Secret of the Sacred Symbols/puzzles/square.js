/* square: NxN symbol square (each symbol once per row and column). Tap an empty cell to cycle through the symbols; given cells are fixed.
   game.json: puzzles.<key> = { help, symbols:[glyph names], answer:[[sym,...],...], givens:[[row,col],...], fixed?:[[row,col],...] (cells a clue card reveals: count as known for the uniqueness proof), confirm?, noPenalty? } */
G360.panel('square', (b, h, m, P, a) => {
  const { E, S } = a, N = P.symbols.length, key = (r, c) => r + ',' + c, giv = new Set(P.givens.map(([r, c]) => key(r, c)));
  const st = (S.ps[h.id] = S.ps[h.id] || { v: P.answer.map((row, r) => row.map((s, c) => (giv.has(key(r, c)) ? P.symbols.indexOf(s) : -1))) });
  if (P.help) b.append(E('p', 'help', P.help));
  const grid = E('div', 'sqgrid'), msg = E('div', 'msg'), ok = a.mkConfirm(P.confirm), cells = [];
  grid.style.gridTemplateColumns = 'repeat(' + N + ',1fr)';
  const draw = (r, c) => { const v = st.v[r][c], x = cells[r][c]; x.innerHTML = v < 0 ? '' : a.glyph(P.symbols[v]); x.setAttribute('aria-label', v < 0 ? 'empty' : P.symbols[v]); };
  P.answer.forEach((row, r) => { cells[r] = []; row.forEach((_, c) => {
    const x = E('button', 'opt sq' + (giv.has(key(r, c)) ? ' given' : '')); cells[r][c] = x;
    if (!giv.has(key(r, c))) x.onclick = () => { st.v[r][c] = (st.v[r][c] + 2) % (N + 1) - 1; draw(r, c); msg.textContent = ''; };
    draw(r, c); grid.append(x);
  }); });
  ok.onclick = () => {
    if (P.answer.every((row, r) => row.every((s, c) => st.v[r][c] === P.symbols.indexOf(s)))) return a.solve(h, m);
    a.fx.puff(innerWidth / 2, innerHeight * 0.6); a.wrong([ok], msg, P.wrongText || '', { free: P.noPenalty });
  };
  const row = E('div', 'row'); row.append(ok); b.append(grid, msg, row); a.applyLock(ok, ok.dataset.label);
}, (P) => {
  const e = [], A = P.answer, N = (P.symbols || []).length;
  if (N < 2 || !A || A.length !== N || A.some((r) => r.length !== N)) return ['answer must be an NxN grid of the symbols'];
  const sym = (s) => P.symbols.indexOf(s), g = A.map((r) => r.map(sym));
  if (g.some((r) => r.includes(-1))) return ['answer uses a symbol not in symbols'];
  for (let i = 0; i < N; i++) { if (new Set(g[i]).size !== N) e.push('row ' + (i + 1) + ' repeats a symbol'); if (new Set(g.map((r) => r[i])).size !== N) e.push('column ' + (i + 1) + ' repeats a symbol'); }
  if (e.length) return e;
  const known = new Set([...(P.givens || []), ...(P.fixed || [])].map(([r, c]) => r + ',' + c)), w = g.map((r, i) => r.map((v, j) => (known.has(i + ',' + j) ? v : -1)));
  let n = 0; const rec = (i) => {   // count completions (stop at 2): the puzzle must have exactly one
    if (n > 1) return; if (i === N * N) { n++; return; } const r = (i / N) | 0, c = i % N;
    for (let v = 0; v < N; v++) {
      if (w[r][c] >= 0 && w[r][c] !== v) continue; let f = true;
      for (let k = 0; k < N; k++) if ((k !== c && w[r][k] === v) || (k !== r && w[k][c] === v)) { f = false; break; }
      if (!f) continue; const old = w[r][c]; w[r][c] = v; rec(i + 1); w[r][c] = old;
    }
  };
  rec(0); if (n !== 1) e.push('givens give ' + (n > 1 ? 'more than one' : 'no') + ' solution'); return e;
});
