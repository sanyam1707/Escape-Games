/* pour: measure exactly N with two vials. Fill, empty, pour one into the other. Solves by itself as soon as a vial holds the target.
   game.json: puzzles.<key> = { help, caps:[3,5], target:4, names?:["Small","Large"], movesLabel? } */
G360.panel('pour', (b, h, m, P, a) => {
  const { E, S } = a; const st = (S.ps[h.id] = S.ps[h.id] || { v: [0, 0], n: 0 });
  if (P.help) b.append(E('p', 'help', P.help));
  const wrap = E('div', 'pgrid'), info = E('div', 'msg'); wrap.style.gridTemplateColumns = '1fr 1fr';
  function act(f) { f(); st.n++; draw(); if (st.v.includes(P.target)) setTimeout(() => a.solve(h, m), 450); }
  function draw() {
    wrap.innerHTML = '';
    P.caps.forEach((c, i) => {
      const o = 1 - i, col = E('div', 'opt'); col.style.gap = '8px';
      const hgt = 40 + c * 22, vial = E('div'); vial.style.cssText = 'width:54px;height:' + hgt + 'px;border:3px solid var(--edge2);border-radius:6px 6px 18px 18px;position:relative;overflow:hidden;background:rgba(0,0,0,.35)';
      vial.innerHTML = '<div style="position:absolute;left:0;right:0;bottom:0;height:' + (st.v[i] / c * 100) + '%;background:linear-gradient(var(--turq),var(--gold));transition:height .3s"></div>' + Array.from({ length: c - 1 }, (_, k) => '<i style="position:absolute;left:0;width:10px;border-top:2px solid var(--edge2);bottom:' + ((k + 1) / c * 100) + '%"></i>').join('');
      col.append(E('span', '', (P.names ? P.names[i] : 'Vial') + ' (' + c + ')'), vial, E('b', '', st.v[i] + ' / ' + c));
      [['Fill', () => { st.v[i] = c; }], ['Empty', () => { st.v[i] = 0; }], ['Pour', () => { const t = Math.min(st.v[i], P.caps[o] - st.v[o]); st.v[i] -= t; st.v[o] += t; }]].forEach(([l, f]) => { const bt = E('button', 'btn ghost', l + (l === 'Pour' ? ' >' : '')); bt.style.cssText = 'min-height:44px;padding:4px 10px;font-size:13px;width:100%'; bt.onclick = () => act(f); col.append(bt); });
      wrap.append(col);
    });
    info.textContent = (P.movesLabel || 'Pours') + ': ' + st.n + '  |  Goal: ' + P.target;
  }
  const rs = E('button', 'btn ghost', a.T('restartPanel')); rs.onclick = () => { st.v = [0, 0]; st.n = 0; draw(); };
  const row = E('div', 'row'); row.append(rs); b.append(wrap, info, row); draw();
}, (P) => {
  const [A, B] = P.caps || [], seen = new Set(['0,0']), q = [[0, 0]]; if (!A || !B) return ['needs caps:[a,b]'];
  while (q.length) {
    const [x, y] = q.shift(); if (x === P.target || y === P.target) return []; const t = Math.min(x, B - y), u = Math.min(y, A - x);
    [[A, y], [x, B], [0, y], [x, 0], [x - t, y + t], [x + u, y - u]].forEach((s) => { const k = s.join(); if (!seen.has(k)) { seen.add(k); q.push(s); } });
  }
  return ['target cannot be measured'];
});
