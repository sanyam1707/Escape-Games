/* untangle: drag the knots until no rope crosses another. Solves itself when nothing crosses.
   game.json: puzzles.<key> = { help, nodes:[[x,y],...] (0-100 box, start layout), edges:[[i,j],...], solution:[[x,y],...] (a crossing-free layout, only used to validate), fixed?:[i,...] } */
(function () {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const x2 = (n, e1, e2) => { const [a, b] = e1, [c, d] = e2; if (a === c || a === d || b === c || b === d) return false; return o(n[a], n[b], n[c]) !== o(n[a], n[b], n[d]) && o(n[c], n[d], n[a]) !== o(n[c], n[d], n[b]); };
  const bad = (n, e) => { const s = new Set(); for (let i = 0; i < e.length; i++) for (let j = i + 1; j < e.length; j++) if (x2(n, e[i], e[j])) { s.add(i); s.add(j); } return s; };
  G360.panel('untangle', (b, h, m, P, a) => {
    const { E, S } = a; const st = (S.ps[h.id] = S.ps[h.id] || { pos: P.nodes.map((p) => p.slice()) }); let done = false;
    if (P.help) b.append(E('p', 'help', P.help));
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 100 100'); svg.style.cssText = 'width:100%;max-height:52vh;touch-action:none;border:2px solid var(--edge);border-radius:12px;background:rgba(0,0,0,.3)';
    const mk = (t, at) => { const e = document.createElementNS(NS, t); for (const k in at) e.setAttribute(k, at[k]); svg.append(e); return e; };
    const lines = P.edges.map(() => mk('line', { 'stroke-width': 1.6, 'stroke-linecap': 'round' }));
    const dots = [], hit = [];
    st.pos.forEach((p, i) => { hit[i] = mk('circle', { r: 9, fill: 'transparent' }); dots[i] = mk('circle', { r: 4.2, fill: 'var(--gold)', stroke: 'var(--bg)', 'stroke-width': 1, 'pointer-events': 'none' }); });
    const msg = E('div', 'msg');
    function draw() {
      const bd = bad(st.pos, P.edges);
      P.edges.forEach(([i, j], k) => { const l = lines[k]; l.setAttribute('x1', st.pos[i][0]); l.setAttribute('y1', st.pos[i][1]); l.setAttribute('x2', st.pos[j][0]); l.setAttribute('y2', st.pos[j][1]); l.setAttribute('stroke', bd.has(k) ? 'var(--bad2)' : 'var(--good2)'); });
      st.pos.forEach((p, i) => [hit[i], dots[i]].forEach((c) => { c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); }));
      return bd.size;
    }
    hit.forEach((c, i) => {
      c.style.cursor = 'grab'; if ((P.fixed || []).includes(i)) return;
      c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); c._d = true; e.preventDefault(); });
      c.addEventListener('pointermove', (e) => { if (!c._d) return; const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(svg.getScreenCTM().inverse()); st.pos[i] = [Math.max(5, Math.min(95, q.x)), Math.max(5, Math.min(95, q.y))]; draw(); });
      const up = () => { if (!c._d) return; c._d = false; if (!draw() && !done) { done = true; setTimeout(() => a.solve(h, m), 500); } };
      c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    });
    const rs = E('button', 'btn ghost', a.T('restartPanel')); rs.onclick = () => { st.pos = P.nodes.map((p) => p.slice()); draw(); };
    const row = E('div', 'row'); row.append(rs); b.append(svg, msg, row); draw();
  }, (P) => {
    const e = [];
    if (!bad(P.nodes, P.edges).size) e.push('start layout has no crossing');
    if ((P.solution || []).length !== P.nodes.length || bad(P.solution, P.edges).size) e.push('solution layout must be crossing-free');
    return e;
  });
})();
