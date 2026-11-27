/* sweep: Torch Sweep + Constellation Join. Stage 1: drag the lantern over the dark dome to light every star. Stage 2: tap the stars from the biggest (brightest) to the smallest (faintest); each tap draws a line.
   game.json: puzzles.<key> = { help, joinHelp?, stars:[{x,y,s}] (x 0-100, y 0-60, s = size, all different), radius?:16, wrongText?, noPenalty? }. The valid order is by size, biggest first (the chart clue says so). */
G360.panel('sweep', (b, h, m, P, a) => {
  const { E, S } = a, NS = 'http://www.w3.org/2000/svg', st = (S.ps[h.id] = S.ps[h.id] || { seen: [], chain: [], lx: 50, ly: 54 }), R = P.radius || 16;
  const order = P.stars.map((_, i) => i).sort((p, q) => P.stars[q].s - P.stars[p].s), msg = E('div', 'msg'), hint = E('p', 'help');
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 100 60'); svg.setAttribute('class', 'sweepsvg');
  svg.innerHTML = '<defs><radialGradient id="lg" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe2b0" stop-opacity=".85"/><stop offset=".55" stop-color="#f0a860" stop-opacity=".3"/><stop offset="1" stop-color="#f0a860" stop-opacity="0"/></radialGradient></defs><rect width="100" height="60" class="swdome"/>' +
    [...Array(7)].map((_, i) => '<line x1="50" y1="64" x2="' + (i * 16.7 - 0) + '" y2="0" class="swrib"/>').join('') + '<g class="swlines"></g><g class="swstars"></g><circle class="swlight" r="' + R + '" fill="url(#lg)"/><g class="swlamp"><rect x="-2.2" y="-2.6" width="4.4" height="5.2" rx="1" class="lampbody"/><path d="M-1.6-2.6L0-4.6L1.6-2.6" class="lampcap"/></g>';
  const lines = svg.querySelector('.swlines'), stars = svg.querySelector('.swstars'), light = svg.querySelector('.swlight'), lamp = svg.querySelector('.swlamp'), els = [];
  P.stars.forEach((s, i) => { const g = document.createElementNS(NS, 'g'); g.setAttribute('transform', 'translate(' + s.x + ',' + s.y + ')'); g.dataset.star = i; g.innerHTML = '<circle class="sthit" r="6"/><circle class="stglow" r="' + (s.s * 1.9) + '"/><circle class="stcore" r="' + s.s + '"/>'; g.onclick = () => tap(i); stars.append(g); els[i] = g; });
  const put = () => {
    light.setAttribute('cx', st.lx); light.setAttribute('cy', st.ly); lamp.setAttribute('transform', 'translate(' + st.lx + ',' + st.ly + ')');
    P.stars.forEach((s, i) => { if (!st.seen.includes(i) && Math.hypot(s.x - st.lx, s.y - st.ly) <= R * 0.78) st.seen.push(i); els[i].classList.toggle('lit', st.seen.includes(i)); els[i].classList.toggle('on', st.chain.includes(i)); });
    lines.innerHTML = st.chain.slice(1).map((c, k) => '<line x1="' + P.stars[st.chain[k]].x + '" y1="' + P.stars[st.chain[k]].y + '" x2="' + P.stars[c].x + '" y2="' + P.stars[c].y + '"/>').join('');
    const all = st.seen.length === P.stars.length; svg.classList.toggle('joining', all);
    hint.textContent = all ? (P.joinHelp || 'All the stars are lit. Join them from the brightest to the faintest.') : 'Stars lit: ' + st.seen.length + ' / ' + P.stars.length;
  };
  function tap(i) {
    if (st.seen.length < P.stars.length || st.chain.includes(i) || Date.now() < S.lockUntil) return;
    if (order[st.chain.length] === i) { st.chain.push(i); msg.textContent = ''; put(); if (st.chain.length === P.stars.length) setTimeout(() => a.solve(h, m), 700); return; }
    st.chain = []; put(); a.fx.puff(innerWidth / 2, innerHeight * 0.6); a.wrong([], msg, P.wrongText || 'That is not the next brightest star. The lines fade.', { free: P.noPenalty });
  }
  const move = (e) => { const r = svg.getBoundingClientRect(); st.lx = Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)); st.ly = Math.max(0, Math.min(60, (e.clientY - r.top) / r.height * 60)); put(); };
  svg.onpointerdown = (e) => { if (e.target.closest && e.target.closest('[data-star]') && svg.classList.contains('joining')) return; svg.setPointerCapture(e.pointerId); svg.dataset.drag = 1; move(e); };
  svg.onpointermove = (e) => { if (svg.dataset.drag) move(e); }; svg.onpointerup = svg.onpointercancel = () => { delete svg.dataset.drag; };
  if (P.help) b.append(E('p', 'help', P.help)); b.append(svg, hint, msg); put();
}, (P) => {
  const e = [], s = (P.stars || []).map((x) => x.s); if (s.length < 3) e.push('needs 3+ stars'); if (new Set(s).size !== s.length) e.push('star sizes must all differ (one valid order)');
  (P.stars || []).forEach((x, i) => { if (x.x < 0 || x.x > 100 || x.y < 0 || x.y > 60) e.push('star ' + i + ' outside the 100x60 dome'); }); return e;
});
