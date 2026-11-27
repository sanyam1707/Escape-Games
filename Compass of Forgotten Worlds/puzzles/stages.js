/* stages: ONE panel made of several stages in a row (each stage is any other panel module). The panel is solved when the last stage is solved.
   game.json: puzzles.<key> = { stages:[ { panel:"cowbull", title?:"Stage title", ...that module's own fields }, { panel:"rose", ... } ] }  (the modules must be listed in "modules") */
G360.panel('stages', (b, h, m, P, a) => {
  const { E, S } = a, st = (S.ps[h.id + '.stage'] = S.ps[h.id + '.stage'] || { i: 0 });
  const show = () => {
    b.replaceChildren(); const sp = P.stages[st.i], hh = Object.assign({}, h, { id: h.id + '#' + st.i });
    b.append(E('div', 'stagebar', P.stages.map((s, i) => '<span class="' + (i < st.i ? 'done' : i === st.i ? 'now' : '') + '">' + (i + 1) + '. ' + (s.title || '') + '</span>').join('')));
    const box = E('div', 'stagebox'); b.append(box);
    G360.panels[sp.panel](box, hh, m, sp, Object.assign({}, a, { solve: () => { if (st.i < P.stages.length - 1) { st.i++; Snd_chime(a); show(); } else a.solve(h, m); } }));
  };
  const Snd_chime = (api) => { try { api.Snd.fx('chime'); } catch (e) { } };
  show();
}, (P, G) => {
  const e = []; if (!P.stages || P.stages.length < 2) return ['needs 2+ stages']; P.stages.forEach((s, i) => { if (!G360.panels[s.panel]) e.push('stage ' + (i + 1) + ' unknown panel ' + s.panel); else ((G360.checks[s.panel] || (() => []))(s, G) || []).forEach((x) => e.push('stage ' + (i + 1) + ': ' + x)); }); return e;
});
