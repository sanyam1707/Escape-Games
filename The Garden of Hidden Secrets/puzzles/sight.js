/* sight: Sightline Alignment. Turn the view (slider) until the statue's finger, the sundial notch and the far chimney line up; the chimney's painted number then shows and a 3-digit lock opens.
   game.json: puzzles.<key> = { help, start, min, max, finger:{x,depth}, notch:{x,depth}, chimney:{x,depth}, tol, number:"618", turn, lined, notYet, confirm?, wrongText?, noPenalty? }
   A layer at depth d sits at x - view*d on screen, so exactly one view value lines the three points up (check() proves it). */
G360.panel('sight', (b, h, m, P, a) => {
  const { E, S } = a, st = (S.ps[h.id] = S.ps[h.id] || { v: P.start, found: false, d: [0, 0, 0] });
  const [F, N, C] = [P.finger, P.notch, P.chimney], X = (o, v) => o.x - v * o.depth, err = (v) => Math.max(X(F, v), X(N, v), X(C, v)) - Math.min(X(F, v), X(N, v), X(C, v));
  if (P.help) b.append(E('p', 'help', P.help));
  const wrap = E('div', 'sightwrap'), digits = (P.number + '').split('');
  wrap.innerHTML = `<svg class="sightsvg" viewBox="0 0 240 150" role="img" aria-label="${P.turn}">
   <rect class="sk" width="240" height="150"/><path class="hill" d="M0 96 Q60 80 120 92 T240 88 V150 H0Z"/>
   <rect class="lawn" y="100" width="240" height="50"/>
   <g class="ly"><g transform="translate(${C.x} 0)"><path class="roof" d="M-46 92 L-30 66 H34 L50 92Z"/><rect class="wall" x="-40" y="90" width="82" height="14"/><rect class="chim" x="-10" y="40" width="20" height="52"/><rect class="chim2" x="-12" y="35" width="24" height="6"/><text class="paint" x="0" y="62" text-anchor="middle">${P.number}</text><rect class="ivy" x="-10" y="46" width="20" height="22" rx="4"/></g></g>
   <g class="ly"><g transform="translate(${N.x} 0)"><rect class="stone" x="-9" y="104" width="18" height="22"/><ellipse class="stone2" cx="0" cy="104" rx="22" ry="6"/><path class="metal" d="M-14 103 L0 84 L14 103 L4 103 L0 96 L-4 103Z"/></g></g>
   <g class="ly"><g transform="translate(${F.x} 0)"><rect class="stone" x="-52" y="112" width="34" height="30"/><path class="stone2" d="M-46 112 L-48 80 Q-35 70 -22 80 L-24 112Z"/><circle class="stone2" cx="-35" cy="68" r="7"/><path class="stone" d="M-44 62 H-26 L-30 58 H-40Z"/><path class="arm" d="M-26 80 L-3 56"/><path class="arm fin" d="M-3 56 L0 52"/></g></g>
   <line class="guide" x1="0" x2="0" y1="30" y2="130"/>
  </svg>`;
  const zoom = E('div', 'sightzoom', P.number); wrap.append(zoom);   // the painted number, read up close once the marks line up
  const svg = wrap.firstChild, lys = [...svg.querySelectorAll('.ly')], gd = svg.querySelector('.guide'), D = [C.depth, N.depth, F.depth];
  const slide = E('input'); slide.type = 'range'; slide.min = P.min; slide.max = P.max; slide.step = 1; slide.value = st.v; slide.setAttribute('aria-label', P.turn);
  const L = E('button', 'btn ghost', '&#9664;'), R = E('button', 'btn ghost', '&#9654;'), ctl = E('div', 'row sightctl'), msg = E('div', 'msg'), cap = E('div', 'sightcap'), lock = E('div', 'row sightlock'), ok = a.mkConfirm(P.confirm), dig = [];
  L.setAttribute('aria-label', 'left'); R.setAttribute('aria-label', 'right'); ctl.append(L, slide, R);
  function paint() {
    const v = st.v; lys.forEach((g, i) => g.setAttribute('transform', `translate(${-v * D[i]} 0)`));
    const e = err(v), al = e <= P.tol; st.found = st.found || al; gd.setAttribute('x1', X(F, v)); gd.setAttribute('x2', X(F, v)); svg.classList.toggle('lined', al); svg.style.setProperty('--glow', Math.max(0, 1 - e / (P.tol * 14)).toFixed(2));
    cap.textContent = st.found ? P.lined : P.turn; wrap.classList.toggle('found', st.found); lock.classList.toggle('shut', !st.found); dig.forEach((d) => (d.disabled = !st.found)); ok.disabled = !st.found || Date.now() < S.lockUntil;
    if (!st.found) msg.textContent = P.notYet; else if (msg.textContent === P.notYet) msg.textContent = '';
  }
  const set = (v) => { st.v = a.clamp(+v, P.min, P.max); slide.value = st.v; paint(); };
  slide.oninput = () => set(slide.value); L.onclick = () => set(st.v - 3); R.onclick = () => set(st.v + 3);
  digits.forEach((_, i) => { const d = E('button', 'opt'); d.style.cssText = 'min-width:64px;min-height:84px;font-size:30px'; const draw = () => (d.textContent = st.d[i]); d.onclick = () => { st.d[i] = (st.d[i] + 1) % 10; draw(); msg.textContent = ''; }; draw(); dig.push(d); lock.append(d); });
  ok.onclick = () => {
    if (st.d.join('') === P.number) return a.solve(h, m);
    a.fx.puff(innerWidth / 2, innerHeight * 0.6); a.wrong([ok], msg, P.wrongText || '', { free: P.noPenalty });
  };
  const r2 = E('div', 'row'); r2.append(ok); b.append(wrap, ctl, cap, lock, msg, r2); paint(); a.applyLock(ok, ok.dataset.label);
}, (P) => {
  const e = [], [F, N, C] = [P.finger, P.notch, P.chimney]; if (!F || !N || !C) return ['needs finger, notch, chimney {x,depth}']; if (!/^\d{3}$/.test(P.number || '')) e.push('number must be 3 digits');
  const v1 = (F.x - N.x) / (F.depth - N.depth), v2 = (N.x - C.x) / (N.depth - C.depth);
  if (Math.abs(v1 - v2) > 0.5) e.push('the three marks never line up (' + v1.toFixed(1) + ' vs ' + v2.toFixed(1) + ')'); else if (v1 < P.min + 2 || v1 > P.max - 2) e.push('the lined-up view ' + v1.toFixed(1) + ' is outside the slider');
  const err = (v) => Math.max(...[F, N, C].map((o) => o.x - v * o.depth)) - Math.min(...[F, N, C].map((o) => o.x - v * o.depth)); if (err(P.start) <= P.tol) e.push('start view is already lined up'); return e;
});
