/* story: the final story choice. Every option is allowed; the chosen option's closing line is shown by the ending (cinematic step {"ending":true,"fallback":"..."}).
   game.json: puzzles.<key> = { help, options:[{label,text?,closing}], confirm? } */
G360.panel('story', (b, h, m, P, a) => {
  const { E, S } = a; let sel = null; if (P.help) b.append(E('p', 'help', P.help));
  const g = E('div', 'pgrid'), ok = a.mkConfirm(P.confirm); ok.disabled = true;
  P.options.forEach((o, i) => { const bt = E('button', 'opt', '<span>' + o.label + '</span>' + (o.text ? '<small style="font-weight:400;opacity:.85">' + o.text + '</small>' : '')); bt.onclick = () => { sel = i; g.querySelectorAll('.opt').forEach((x, j) => x.classList.toggle('sel', j === i)); ok.disabled = false; }; g.append(bt); });
  ok.onclick = () => { if (sel === null) return; S.ending = P.options[sel].closing; a.solve(h, m); };
  const row = E('div', 'row'); row.append(ok); b.append(g, row);
}, (P) => ((P.options || []).length >= 2 && P.options.every((o) => o.closing) ? [] : ['every option needs a closing']));
