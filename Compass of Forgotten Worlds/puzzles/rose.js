/* rose: compass-rose entry. Tap the bearings in order (the last N taps count), then confirm. Also used inside other panels (mirror, stages).
   game.json: puzzles.<key> = { help, answer:["West","South","East"] (any of North/East/South/West), confirm?, clear?, wrongText?, noPenalty? } */
G360.panel('rose', (b, h, m, P, a) => {
  const { E, S } = a, DEG = { North: 0, East: 90, South: 180, West: 270 }, N = P.answer.length, st = (S.ps[h.id] = S.ps[h.id] || { seq: [] });
  if (P.help) b.append(E('p', 'help', P.help));
  const wrap = E('div', 'rosebox'), msg = E('div', 'msg'), slots = E('div', 'roseslots'), ok = a.mkConfirm(P.confirm), clr = E('button', 'btn ghost', P.clear || 'Clear');
  wrap.innerHTML = '<svg viewBox="-100 -100 200 200" class="rosesvg"><circle r="92" class="rr1"/><circle r="70" class="rr2"/>' + [...Array(24)].map((_, i) => '<line x1="0" y1="-' + (i % 6 ? 84 : 78) + '" x2="0" y2="-92" transform="rotate(' + i * 15 + ')" class="rt"/>').join('') +
    '<path class="rstar" d="M0-66L9-9L66 0L9 9L0 66L-9 9L-66 0L-9-9Z"/><g class="rneedle"><path class="rn1" d="M0-60L7 0L-7 0Z"/><path class="rn2" d="M0 60L7 0L-7 0Z"/><circle r="5" class="rhub"/></g></svg>';
  const needle = wrap.querySelector('.rneedle'); let spin = 0;
  const draw = () => {
    slots.replaceChildren(...[...Array(N)].map((_, i) => E('span', 'rslot' + (st.seq[i] ? ' on' : ''), '<b>' + (i + 1) + '</b>' + (st.seq[i] || ''))));
    ok.disabled = st.seq.length < N || Date.now() < S.lockUntil; a.applyLock(ok, ok.dataset.label);
  };
  Object.keys(DEG).forEach((d) => { const k = E('button', 'rbtn r' + d[0], d[0]); k.setAttribute('aria-label', d); k.title = d; k.onclick = () => {
    st.seq.push(d); st.seq = st.seq.slice(-N); spin += ((DEG[d] - spin) % 360 + 540) % 360 - 180; needle.style.transform = 'rotate(' + spin + 'deg)'; msg.textContent = ''; draw(); }; wrap.append(k); });
  clr.onclick = () => { st.seq = []; msg.textContent = ''; draw(); };
  ok.onclick = () => {
    if (st.seq.join('|') === P.answer.join('|')) return a.solve(h, m);
    a.fx.puff(innerWidth / 2, innerHeight * 0.6); a.wrong([ok], msg, P.wrongText || '', { free: P.noPenalty });
  };
  const row = E('div', 'row'); row.append(clr, ok); b.append(wrap, slots, msg, row); draw();
}, (P) => { const e = []; if (!P.answer || !P.answer.length) e.push('needs an answer list'); else if (P.answer.some((d) => !['North', 'East', 'South', 'West'].includes(d))) e.push('answer must use North/East/South/West'); return e; });
