/* code: a lock of N wheels; tap a wheel to turn it to the next symbol.  game.json: puzzles.<key> = { help, length, symbols:["1","2",...] (or glyph names with "glyphs":true), answer:[symbol,...], confirm?, noPenalty? } */
G360.panel('code', (b, h, m, P, a) => {
  const { E, S } = a; const st = (S.ps[h.id] = S.ps[h.id] || { v: Array(P.length).fill(0) });
  if (P.help) b.append(E('p', 'help', P.help));
  const row = E('div', 'row'), msg = E('div', 'msg'), ok = a.mkConfirm(P.confirm), draw = [];
  for (let i = 0; i < P.length; i++) {
    const w = E('button', 'opt'); w.style.cssText = 'min-width:64px;min-height:84px;font-size:30px'; draw[i] = () => { const s = P.symbols[st.v[i]]; w.innerHTML = P.glyphs ? a.glyph(s) : s; };
    w.onclick = () => { st.v[i] = (st.v[i] + 1) % P.symbols.length; draw[i](); msg.textContent = ''; }; draw[i](); row.append(w);
  }
  ok.onclick = () => {
    const now = st.v.map((i) => P.symbols[i]).join('|'); if (now === P.answer.join('|')) return a.solve(h, m);
    a.fx.puff(innerWidth / 2, innerHeight * 0.6); a.wrong([ok], msg, P.wrongText || '', { free: P.noPenalty });
  };
  const r2 = E('div', 'row'); r2.append(ok); b.append(row, msg, r2); a.applyLock(ok, ok.dataset.label);
}, (P) => {
  const e = []; if (!P.symbols || P.symbols.length < 2) e.push('needs 2+ symbols'); if (!P.answer || P.answer.length !== P.length) e.push('answer length must equal length'); else if (P.answer.some((s) => !P.symbols.includes(s))) e.push('answer uses a symbol that is not in symbols'); return e;
});
