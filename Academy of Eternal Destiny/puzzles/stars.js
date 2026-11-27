/* stars: Constellation Join. Tap one star, then another, to draw (or erase) a line between them; confirm when the sign matches.
   game.json: puzzles.<key> = { help, stars:[[x,y],...] (0-100 box), edges:[[i,j],...] the target sign, confirm?, wrongText?, noPenalty? }. Show the sign to copy on a clue card (inline SVG). */
G360.panel('stars', (b, h, m, P, a) => {
  const { E, S } = a; const st = (S.ps[h.id] = S.ps[h.id] || { e: [] }); let sel = null; const key = (i, j) => Math.min(i, j) + '-' + Math.max(i, j);
  if (P.help) b.append(E('p', 'help', P.help));
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 100 100'); svg.style.cssText = 'width:100%;max-height:50vh;border:2px solid var(--edge);border-radius:12px;background:radial-gradient(circle at 50% 40%,var(--bg3),var(--bg))';
  const msg = E('div', 'msg'), ok = a.mkConfirm(P.confirm), rs = E('button', 'btn ghost', a.T('restartPanel'));
  function draw() {
    svg.innerHTML = st.e.map((k) => { const [i, j] = k.split('-').map(Number); return `<line x1="${P.stars[i][0]}" y1="${P.stars[i][1]}" x2="${P.stars[j][0]}" y2="${P.stars[j][1]}" stroke="var(--gold2)" stroke-width="1.4" stroke-linecap="round"/>`; }).join('') +
      P.stars.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${sel === i ? 4.6 : 3}" fill="${sel === i ? 'var(--gold)' : 'var(--papyrus)'}" stroke="var(--gold)" stroke-width="1"/><circle data-i="${i}" cx="${p[0]}" cy="${p[1]}" r="9" fill="transparent" style="cursor:pointer"/>`).join('');
    svg.querySelectorAll('circle[data-i]').forEach((c) => c.addEventListener('click', () => {
      const i = +c.dataset.i; msg.textContent = '';
      if (sel === null) sel = i; else if (sel === i) sel = null; else { const k = key(sel, i), x = st.e.indexOf(k); if (x >= 0) st.e.splice(x, 1); else st.e.push(k); sel = null; }
      draw();
    }));
  }
  ok.onclick = () => { const t = P.edges.map(([i, j]) => key(i, j)).sort().join(), n = st.e.slice().sort().join(); if (t === n) return a.solve(h, m); a.wrong([ok], msg, P.wrongText || '', { free: P.noPenalty }); };
  rs.onclick = () => { st.e = []; sel = null; msg.textContent = ''; draw(); };
  const row = E('div', 'row'); row.append(rs, ok); b.append(svg, msg, row); draw(); a.applyLock(ok, ok.dataset.label);
}, (P) => {
  const e = [], n = (P.stars || []).length; if (n < 3) e.push('needs 3+ stars');
  (P.edges || []).forEach(([i, j]) => { if (!(i >= 0 && i < n && j >= 0 && j < n && i !== j)) e.push('bad edge ' + i + ',' + j); }); return e;
});
