/* cowbull: Cow-and-Bull Lock (Mastermind with glyphs). Pick N different glyphs; after each try the lock shows how many are in the right place (filled pip) and how many are right but misplaced (hollow pip). Limited tries.
   game.json: puzzles.<key> = { help, symbols:[glyph names], answer:[N different symbols], tries:6, labels?:{right,wrong}, confirm?, resetText? }. Guesses cost nothing; running out of tries costs the normal wrong-answer penalty once and clears the lock.
   Prove the tries are enough with the clues: tools/prove_lock.py in the game folder. */
G360.panel('cowbull', (b, h, m, P, a) => {
  const { E, S } = a, N = P.answer.length, TR = P.tries || 6, st = (S.ps[h.id] = S.ps[h.id] || { rows: [], cur: Array(N).fill(-1) }), L = Object.assign({ right: 'Right glyph, right place', wrong: 'Right glyph, wrong place' }, P.labels);
  if (P.help) b.append(E('p', 'help', P.help));
  const hist = E('div', 'cbhist'), cur = E('div', 'cbrow cbcur'), pad = E('div', 'cbpad'), msg = E('div', 'msg'), ok = a.mkConfirm(P.confirm || 'Try the lock'), clr = E('button', 'btn ghost', P.clear || 'Clear'), left = E('div', 'cbleft');
  const pips = (r, w) => '<span class="cbpips">' + '<i class="pr"></i>'.repeat(r) + '<i class="pw"></i>'.repeat(w) + '<i class="pn"></i>'.repeat(N - r - w) + '</span>';
  const draw = () => {
    hist.replaceChildren(...[...Array(TR)].map((_, i) => { const r = st.rows[i]; return E('div', 'cbrow' + (r ? '' : ' cbempty'), r ? r.g.map((s) => '<span class="cbslot">' + a.glyph(P.symbols[s]) + '</span>').join('') + pips(r.r, r.w) : '<span class="cbnum">' + (i + 1) + '</span>'); }));
    cur.replaceChildren(...st.cur.map((s, i) => { const x = E('button', 'cbslot cbsel' + (s < 0 ? ' blank' : ''), s < 0 ? '' : a.glyph(P.symbols[s])); x.setAttribute('aria-label', s < 0 ? 'empty slot' : P.symbols[s]); x.onclick = () => { st.cur[i] = -1; draw(); }; return x; }));
    pad.querySelectorAll('button').forEach((k, i) => k.classList.toggle('used', st.cur.includes(i)));
    left.textContent = 'Tries left: ' + (TR - st.rows.length); ok.disabled = st.cur.includes(-1) || Date.now() < S.lockUntil; a.applyLock(ok, ok.dataset.label);
  };
  P.symbols.forEach((s, i) => { const k = E('button', 'opt cbkey', a.glyph(s) + '<small>' + s + '</small>'); k.onclick = () => { if (st.cur.includes(i)) return; const j = st.cur.indexOf(-1); if (j < 0) return; st.cur[j] = i; msg.textContent = ''; draw(); }; pad.append(k); });
  clr.onclick = () => { st.cur = Array(N).fill(-1); msg.textContent = ''; draw(); };
  ok.onclick = () => {
    const g = st.cur.slice(), A = P.answer.map((s) => P.symbols.indexOf(s)), r = g.filter((s, i) => s === A[i]).length, w = g.filter((s) => A.includes(s)).length - r;
    if (r === N) return a.solve(h, m);
    st.rows.push({ g, r, w }); msg.className = 'msg'; msg.textContent = '';
    if (st.rows.length >= TR) { st.rows = []; st.cur = Array(N).fill(-1); msg.textContent = P.resetText || 'The lock clicks and resets. Think again.'; a.fx.puff(innerWidth / 2, innerHeight * 0.6); a.wrong([ok], msg, msg.textContent); }
    draw();
  };
  const row = E('div', 'row'); row.append(clr, ok);
  b.append(hist, E('div', 'cblegend', '<span class="cbpips"><i class="pr"></i></span> ' + L.right + ' &nbsp; <span class="cbpips"><i class="pw"></i></span> ' + L.wrong), left, cur, pad, msg, row); draw();
}, (P, G) => {
  const e = [], N = (P.answer || []).length; if (N < 2 || new Set(P.answer).size !== N) e.push('answer needs N different symbols');
  (P.symbols || []).concat(P.answer || []).forEach((s) => { if (G && G.glyphs && !G.glyphs[s]) e.push('glyph ' + s + ' is missing from glyphs'); });
  if ((P.answer || []).some((s) => !(P.symbols || []).includes(s))) e.push('answer uses a symbol that is not in symbols'); if ((P.symbols || []).length <= N) e.push('needs more symbols than slots'); return e;
});
