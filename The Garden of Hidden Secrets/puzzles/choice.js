/* choice: pick the one right option, then confirm.  game.json: puzzles.<key> = { help, options:[{label, glyph?, text?}], answer:<index>, wrong:{"<index>": "tip shown"}, cols?, confirm?, noPenalty? }
   hotspot: { kind:'PANEL', panel:'choice', puzzle:'<key>', ... } */
G360.panel('choice', (b, h, m, P, a) => {
  const { E, S } = a; let sel = null;
  if (P.help) b.append(E('p', 'help', P.help));
  const g = E('div', 'pgrid'), msg = E('div', 'msg'), ok = a.mkConfirm(P.confirm); ok.disabled = true;
  g.style.gridTemplateColumns = 'repeat(' + (P.cols || Math.min(P.options.length, 3)) + ',1fr)';
  P.options.forEach((o, i) => {
    const btn = E('button', 'opt', (o.glyph ? a.glyph(o.glyph) : '') + '<span>' + o.label + '</span>' + (o.text ? '<small style="font-weight:400;opacity:.85">' + o.text + '</small>' : ''));
    btn.onclick = () => { sel = i; g.querySelectorAll('.opt').forEach((x, j) => x.classList.toggle('sel', j === i)); ok.disabled = Date.now() < S.lockUntil; a.applyLock(ok, ok.dataset.label); msg.textContent = ''; };
    g.append(btn);
  });
  ok.onclick = () => {
    if (sel === null) return;
    if (sel === P.answer) return a.solve(h, m);
    a.fx.puff(innerWidth / 2, innerHeight * 0.6); a.wrong([ok], msg, (P.wrong || {})[sel] || '', { free: P.noPenalty });
  };
  const row = E('div', 'row'); row.append(ok); b.append(g, msg, row); a.applyLock(ok, ok.dataset.label);
}, (P) => {
  const e = []; if (!P.options || P.options.length < 2) e.push('needs 2+ options'); else if (!Number.isInteger(P.answer) || P.answer < 0 || P.answer >= P.options.length) e.push('answer must be an option index'); return e;
});
