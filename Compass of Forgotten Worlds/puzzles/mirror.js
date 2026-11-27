/* mirror: Mirror Writing. A letter is written in reversed letters; slide the brass plate over it to read it, then set the compass rose from what it says.
   game.json: puzzles.<key> = { help, letter:["line",...], from?:"signature", plate?:"hint under the letter", dial:{ answer:[bearings], help?, confirm?, wrongText?, noPenalty? } }
   Keep letter lines short and centred: the reversed copy and the plate copy must wrap the same way. */
G360.panel('mirror', (b, h, m, P, a) => {
  const { E, S } = a, st = (S.ps[h.id + '.plate'] = S.ps[h.id + '.plate'] || { x: 0.04 });
  if (P.help) b.append(E('p', 'help', P.help));
  const html = P.letter.map((l) => '<div>' + l + '</div>').join('') + (P.from ? '<div class="mwfrom">' + P.from + '</div>' : '');
  const paper = E('div', 'mwpaper', '<div class="mwtext mwrev">' + html + '</div><div class="mwplate"><div class="mwtext mwin">' + html + '</div></div>'), plate = paper.querySelector('.mwplate'), inn = paper.querySelector('.mwin');
  const W = 0.6, put = () => { const w = paper.clientWidth; plate.style.left = st.x * w + 'px'; plate.style.width = W * w + 'px'; inn.style.width = w + 'px'; inn.style.left = -(st.x * w + 3) + 'px'; };
  const move = (e) => { const r = paper.getBoundingClientRect(); st.x = Math.max(0, Math.min(1 - W, (e.clientX - r.left) / r.width - W / 2)); put(); };
  paper.onpointerdown = (e) => { paper.setPointerCapture(e.pointerId); paper.dataset.drag = 1; move(e); };
  paper.onpointermove = (e) => { if (paper.dataset.drag) move(e); }; paper.onpointerup = paper.onpointercancel = () => { delete paper.dataset.drag; };
  b.append(paper, E('p', 'help', P.plate || '')); new ResizeObserver(put).observe(paper); requestAnimationFrame(put);
  const dial = E('div', 'mwdial'); b.append(dial); G360.panels.rose(dial, h, m, P.dial, a);
}, (P) => { const e = []; if (!P.letter || !P.letter.length) e.push('needs letter lines'); if (!P.dial || !P.dial.answer) e.push('needs dial.answer'); else (G360.checks.rose(P.dial) || []).forEach((x) => e.push(x)); return e; });
