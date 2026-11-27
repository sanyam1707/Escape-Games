/* gears: Gear Train. Spare gears go on pegs so the crank (fixed gear, peg 0) drives the compass spindle gear the right way at the right speed. Gears mesh when their pitch circles touch (distance = (t1+t2)/2).
   game.json: puzzles.<key> = { help, goal?, showSums?:true (+ sumLinks?:[[pegA,pegB],...] to label only some links), pegs:[[x,y],...] (peg 0 = crank, fixed), crank:teeth, spares:[teeth,...], end:<peg index of the compass spindle>, target:{teeth, dir:1 same way as the crank | -1 opposite}, confirm?, texts? }
   Rules (same as tools/gear_lib.py, which proves exactly one valid layout): no overlaps, no jam, every placed gear in the crank's train, spindle gear = target teeth and direction. Experimenting is free (no penalty). */
G360.gearEval = (P, lay) => {   // lay[i-1] = spare index on peg i or -1
  const g = { 0: P.crank }; lay.forEach((s, i) => { if (s >= 0) g[i + 1] = P.spares[s]; });
  const ids = Object.keys(g).map(Number), d = (x, y) => Math.hypot(P.pegs[x][0] - P.pegs[y][0], P.pegs[x][1] - P.pegs[y][1]), T = 0.35;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (d(ids[i], ids[j]) - (g[ids[i]] + g[ids[j]]) / 2 < -T) return { r: 'overlap' };
  const dir = { 0: 1 }, q = [0];
  while (q.length) { const x = q.pop(); for (const y of ids) if (y !== x && Math.abs(d(x, y) - (g[x] + g[y]) / 2) <= T) { if (!(y in dir)) { dir[y] = -dir[x]; q.push(y); } else if (dir[y] === dir[x]) return { r: 'jam' }; } }
  const run = Object.keys(dir).map(Number), r = ids.some((x) => !(x in dir)) ? 'loose' : !(P.end in g) ? 'open' : g[P.end] !== P.target.teeth ? 'speed' : dir[P.end] !== P.target.dir ? 'direction' : 'ok';
  return { r, g, dir, run };
};
G360.panel('gears', (b, h, m, P, a) => {
  const { E, S } = a, NS = 'http://www.w3.org/2000/svg', n = P.pegs.length - 1, st = (S.ps[h.id] = S.ps[h.id] || { lay: Array(n).fill(-1), sel: -1 });
  const T = Object.assign({ overlap: 'Two gears crash into each other.', jam: 'The gears jam. Nothing can turn.', loose: 'A gear is not part of the train. Take it off or connect it.', open: 'The compass gear is not connected to the crank yet.', speed: 'The compass gear turns, but at the wrong speed.', direction: 'The compass gear turns the wrong way.', go: 'Turn the crank', ok: 'The compass gear turns the right way at the right speed!' }, P.texts);
  if (P.help) b.append(E('p', 'help', P.help)); if (P.goal) b.append(E('p', 'gearGoal', P.goal));
  const R = (t) => t / 2, xs = P.pegs.map((p) => p[0]), ys = P.pegs.map((p) => p[1]), pad = 15, x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, w = Math.max(...xs) - x0 + pad, hh = Math.max(...ys) - y0 + pad;
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', [x0, y0, w, hh].join(' ')); svg.setAttribute('class', 'gearsvg');
  const tray = E('div', 'geartray'), msg = E('div', 'msg'), ok = a.mkConfirm(T.go); let timer = 0;
  const tooth = (t) => { const r = R(t), ri = r - 1.2, ro = r + 0.5; let d = ''; for (let i = 0; i < t; i++) { const a0 = (i / t) * 2 * Math.PI, w2 = Math.PI / t * 0.62, p = (ang, rad) => (rad * Math.cos(ang)).toFixed(2) + ',' + (rad * Math.sin(ang)).toFixed(2); d += (i ? 'L' : 'M') + p(a0 - w2, ri) + 'L' + p(a0 - w2 * 0.72, ro) + 'L' + p(a0 + w2 * 0.72, ro) + 'L' + p(a0 + w2, ri); } return d + 'Z'; };
  const gear = (t, cls) => '<path class="gbody ' + (cls || '') + '" d="' + tooth(t) + '"/><circle r="' + R(t) * 0.3 + '" class="ghole"/>' + (t > 8 ? [0, 1, 2].map((i) => '<circle class="gspoke" r="' + R(t) * 0.11 + '" cx="' + R(t) * 0.58 * Math.cos(i * 2.094) + '" cy="' + R(t) * 0.58 * Math.sin(i * 2.094) + '"/>').join('') : '') + '<text class="gnum" y="' + R(t) * 0.12 + '" text-anchor="middle" font-size="' + Math.max(3.4, R(t) * 0.34) + '">' + t + '</text>';
  const draw = () => {
    clearTimeout(timer); svg.innerHTML = '<rect x="' + x0 + '" y="' + y0 + '" width="' + w + '" height="' + hh + '" class="gearbed"/>';
    P.pegs.forEach((p, i) => {
      const s = i === 0 ? -2 : st.lay[i - 1], t = i === 0 ? P.crank : s >= 0 ? P.spares[s] : 0, g = document.createElementNS(NS, 'g'); g.setAttribute('transform', 'translate(' + p[0] + ',' + p[1] + ')'); g.dataset.peg = i;
      g.innerHTML = t ? '<g class="spin">' + gear(t, i === 0 ? 'crank' : i === P.end ? 'end' : '') + '</g>' + (i === 0 ? '<circle class="knob" cx="' + R(t) * 0.78 + '" cy="0" r="2.2"/>' : '') : '<circle class="peg' + (st.sel >= 0 ? ' ready' : '') + '" r="2.6"/><circle r="7" fill="transparent"/>';
      if (i === P.end) g.innerHTML += '<text class="gtag" y="' + (R(t || 12) + 5.5) + '" text-anchor="middle" font-size="4">' + (P.endLabel || 'Compass') + '</text>';
      if (i && t) g.onclick = () => { st.lay[i - 1] = -1; st.sel = -1; msg.textContent = ''; draw(); }; else if (i && st.sel >= 0) g.onclick = () => { st.lay[i - 1] = st.sel; st.sel = -1; msg.textContent = ''; draw(); }; svg.append(g);
    });
    if (P.showSums) {   // engraved numbers on every possible link: the two tooth counts must add up to it
      const all = [P.crank, ...P.spares], lo = 2 * Math.min(...all), hi = 2 * Math.max(...all);
      for (let i = 0; i < P.pegs.length; i++) for (let j = i + 1; j < P.pegs.length; j++) {
        if (P.sumLinks && !P.sumLinks.some(([x, y]) => (x === i && y === j) || (x === j && y === i))) continue;   // optional: label only these links (less clutter)
        const A = P.pegs[i], B = P.pegs[j], d = 2 * Math.hypot(A[0] - B[0], A[1] - B[1]); if (d < lo || d > hi) continue; const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'gsum'); g.setAttribute('pointer-events', 'none');
        g.innerHTML = '<line x1="' + A[0] + '" y1="' + A[1] + '" x2="' + B[0] + '" y2="' + B[1] + '"/><rect x="' + (mx - 4) + '" y="' + (my - 2.6) + '" width="8" height="5.2" rx="1.4"/><text x="' + mx + '" y="' + (my + 1.4) + '" text-anchor="middle" font-size="3.8">' + Math.round(d) + '</text>'; svg.append(g);
      }
    }
    tray.replaceChildren(); P.spares.forEach((t, s) => { const placed = st.lay.includes(s), bt = E('button', 'opt gearopt' + (st.sel === s ? ' sel' : ''), '<svg viewBox="-' + (R(t) + 2) + ' -' + (R(t) + 2) + ' ' + (R(t) * 2 + 4) + ' ' + (R(t) * 2 + 4) + '" style="width:' + (22 + t * 1.6) + 'px;height:' + (22 + t * 1.6) + 'px">' + gear(t, 'tray') + '</svg>'); bt.disabled = placed; bt.setAttribute('aria-label', t + ' teeth'); bt.onclick = () => { st.sel = st.sel === s ? -1 : s; draw(); }; tray.append(bt); });
  };
  ok.onclick = () => {
    const ev = G360.gearEval(P, st.lay); ok.disabled = true;
    if (ev.r !== 'ok') { msg.className = 'msg'; msg.textContent = T[ev.r]; a.fx.puff(innerWidth / 2, innerHeight * 0.6); ok.disabled = false; return; }
    msg.className = 'msg ok'; msg.textContent = T.ok;
    svg.querySelectorAll('g[data-peg]').forEach((g) => { const i = +g.dataset.peg, sp = g.querySelector('.spin'); if (sp && ev.run.includes(i)) { sp.style.animation = 'gspin ' + (ev.g[i] / 6).toFixed(2) + 's linear infinite' + (ev.dir[i] < 0 ? ' reverse' : ''); } });
    timer = setTimeout(() => a.solve(h, m), 1800);
  };
  const row = E('div', 'row'); row.append(ok); b.append(svg, tray, msg, row); draw();
}, (P, G) => {
  const e = []; if (!P.pegs || P.pegs.length < 3 || !P.spares || !P.spares.length) return ['needs pegs and spares']; const n = P.pegs.length - 1; let cnt = 0, lay = Array(n).fill(-1);
  const rec = (i, used) => { if (i === n) { if (G360.gearEval(P, lay).r === 'ok') cnt++; return; } for (let s = -1; s < P.spares.length; s++) { if (s >= 0 && used.has(s)) continue; lay[i] = s; if (s >= 0) used.add(s); rec(i + 1, used); if (s >= 0) used.delete(s); } };
  rec(0, new Set()); if (cnt !== 1) e.push('gear layouts that work: ' + cnt + ' (must be exactly 1)'); return e;
});
