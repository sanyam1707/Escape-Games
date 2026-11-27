/* order: tap the pieces in the right order, then confirm.  game.json: puzzles.<key> = { help, items:[{id,label,glyph?}], answer:[id,...], confirm?, noPenalty? } */
G360.panel('order', (b, h, m, P, a) => {
  const { E, S } = a; const st = (S.ps[h.id] = S.ps[h.id] || { seq: [] });
  if (P.help) b.append(E('p', 'help', P.help));
  const slots = E('div', 'row'), pool = E('div', 'pgrid'), msg = E('div', 'msg'), ok = a.mkConfirm(P.confirm), rs = E('button', 'btn ghost', a.T('restartPanel'));
  pool.style.gridTemplateColumns = 'repeat(' + Math.min(P.items.length, 3) + ',1fr)';
  const by = Object.fromEntries(P.items.map((i) => [i.id, i]));
  const face = (i) => (i.glyph ? a.glyph(i.glyph) : '') + '<span>' + i.label + '</span>';
  function draw() {
    slots.innerHTML = ''; pool.innerHTML = '';
    for (let i = 0; i < P.items.length; i++) { const id = st.seq[i], s = E('button', 'opt' + (id ? ' sel' : ''), id ? '<b>' + (i + 1) + '</b>' + face(by[id]) : '<b style="opacity:.4">' + (i + 1) + '</b>'); s.style.minWidth = '64px'; if (id) s.onclick = () => { st.seq.length = i; msg.textContent = ''; draw(); }; slots.append(s); }
    P.items.forEach((it) => { const bt = E('button', 'opt', face(it)); bt.disabled = st.seq.includes(it.id); bt.onclick = () => { st.seq.push(it.id); msg.textContent = ''; draw(); }; pool.append(bt); });
    ok.disabled = st.seq.length < P.items.length || Date.now() < S.lockUntil;
  }
  ok.onclick = () => { if (st.seq.join() === P.answer.join()) return a.solve(h, m); a.fx.puff(innerWidth / 2, innerHeight * 0.6); st.seq = []; draw(); a.wrong([ok], msg, P.wrongText || '', { free: P.noPenalty }); };
  rs.onclick = () => { st.seq = []; msg.textContent = ''; draw(); };
  const row = E('div', 'row'); row.append(rs, ok); b.append(slots, pool, msg, row); draw(); a.applyLock(ok, ok.dataset.label);
}, (P) => {
  const e = [], ids = (P.items || []).map((i) => i.id); if (ids.length < 2) e.push('needs 2+ items'); else if ([...ids].sort().join() !== [...(P.answer || [])].sort().join()) e.push('answer must use every item id exactly once'); return e;
});
