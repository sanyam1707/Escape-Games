/* The seven puzzle panels. Each: PANELS.name(body, data, api) -> optional cleanup fn.
   api: { st (persistent state object), T(key,vars), wrong(opts), solved(), lock(btn,label,cb), toast, fx }
   All texts come from game.json (data + api.T). Drawing is CSS / inline SVG / canvas only.
   Layout: every panel builds two columns (.pl drawing, .pr controls); they stack on phones. */
(function () {
  const PZ = window.PZ;
  const h = (tag, cls, content, attrs) => {
    const e = document.createElement(tag); if (cls) e.className = cls;
    if (content != null) { if (content instanceof Node) e.append(content); else if (Array.isArray(content)) e.append(...content); else e.innerHTML = content; }
    if (attrs) for (const k in attrs) { if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); }
    return e;
  };
  const art = (id) => (window.artUrl ? window.artUrl(`assets/cut/${id}.png`) : null);
  const cols = (body) => { const g = h('div', 'pgrid'), L = h('div', 'pl'), R = h('div', 'pr'); g.append(L, R); body.append(g); return [L, R]; };

  // ---- gear drawing
  function gearPath(n, r) {
    const ri = r * 0.78, s = (2 * Math.PI) / n, pts = [];
    for (let i = 0; i < n; i++) {
      [[ri, 0], [r, 0.15], [r, 0.4], [ri, 0.55]].forEach(([rad, f]) => {
        const a = i * s + f * s; pts.push((rad * Math.cos(a)).toFixed(1) + ' ' + (rad * Math.sin(a)).toFixed(1));
      });
    }
    return 'M' + pts.join('L') + 'Z';
  }
  function gearSVG(teeth, size, opts = {}) {
    const r = 48, col = opts.color || '#C9A227';
    return `<svg viewBox="-52 -52 104 104" width="${size}" height="${size}" class="gear-svg"><path d="${gearPath(teeth, r)}" fill="${col}" stroke="#5a4210" stroke-width="3" stroke-linejoin="round"/>` +
      `<circle r="${r * 0.55}" fill="none" stroke="#5a4210" stroke-width="2" opacity=".5"/><circle r="9" fill="#2a2010"/>` +
      (opts.label ? `<text y="30" text-anchor="middle" font-size="24" font-weight="700" fill="#2a2010" style="font-family:Lora,serif">${teeth}</text>` : '') + `</svg>`;
  }

  const PANELS = {};

  // ===================== 1. Gear train =====================
  PANELS.gearTrain = (body, d, api) => {
    const st = api.st; st.slots = st.slots || [null, null];
    const [L, R] = cols(body), stage = h('div', 'gear-stage'), slotsRow = h('div', 'gear-slots'), pal = h('div', 'gear-pal');
    const result = h('p', 'panel-result'), go = h('button', 'btn', api.T('gearTurn'));
    const how = h('p', 'twistnote', api.T('gearHow')), live = h('p', 'panel-live');
    L.append(stage); R.append(how, slotsRow, pal, live, result, h('div', 'center', go));
    let raf = 0, busy = false;
    const RAD = (t) => t * 2.1; // stage radius per tooth
    const part = (cx, teeth, rot, fill, stroke) => `<g transform="translate(${cx},92) rotate(${rot})"><g transform="scale(${RAD(teeth) / 48})"><path d="${gearPath(teeth, 48)}" fill="${fill}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/><circle r="26" fill="none" stroke="${stroke}" stroke-width="2" opacity=".45"/><circle r="9" fill="#2a2010"/></g></g>`;
    function drawStage(angle = 0) {
      const [x, y] = st.slots, cx = [52, 160, 318], spin = x ? (-angle * d.pinion) / x : 0;
      const doorA = x && y ? (-spin * y) / d.door : 0;
      stage.innerHTML = `<svg viewBox="0 0 380 196" class="gear-svgstage">
        <rect x="150" y="30" width="20" height="124" rx="4" fill="#4a3b20" opacity=".7"/>
        ${part(cx[0], d.pinion, angle, '#D9B13A', '#5a4210')}
        ${y ? part(cx[1], y, spin, '#9aa7b5', '#3b4350') : ''}
        ${x ? part(cx[1], x, spin, '#C9A227', '#5a4210') : `<circle cx="${cx[1]}" cy="92" r="34" fill="none" stroke="#C9A227" stroke-dasharray="4 5" opacity=".6"/>`}
        ${part(cx[2], d.door, doorA, '#B58B2A', '#5a4210')}
        <text x="${cx[0]}" y="190" text-anchor="middle" class="gtxt">${api.T('gearPinion')}</text>
        <text x="${cx[2]}" y="190" text-anchor="middle" class="gtxt">${api.T('gearDoor')}</text></svg>`;
    }
    function drawSlots() {
      slotsRow.innerHTML = '';
      ['gearSlotX', 'gearSlotY'].forEach((k, i) => {
        const g = st.slots[i];
        const b = h('button', 'gear-slot' + (g ? ' full' : ''), `<small>${api.T(k)}</small>` + (g ? gearSVG(g, 62, { label: 1, color: i ? '#9aa7b5' : '#C9A227' }) : '<span class="slot-q">?</span>'), { 'aria-label': api.T(k) });
        b.onclick = () => { if (busy || !g) return; st.slots[i] = null; draw(); }; slotsRow.append(b);
      });
    }
    function drawPal() {
      pal.innerHTML = '';
      d.gears.forEach((g) => {
        const used = st.slots.includes(g);
        const b = h('button', 'gear-pick' + (used ? ' used' : ''), gearSVG(g, 58) + `<small>${api.T('gearTeeth', { n: g })}</small>`);
        b.disabled = used; b.onclick = () => { if (busy) return; const i = st.slots.indexOf(null); if (i < 0) return; st.slots[i] = g; result.textContent = ''; draw(); }; pal.append(b);
      });
    }
    function draw() { drawStage(0); drawSlots(); drawPal(); live.textContent = st.slots.includes(null) ? '' : api.T('gearLive', { n: +PZ.gearTurns(d, st.slots[0], st.slots[1]).toFixed(2), t: d.target }); go.disabled = busy || st.slots.includes(null); }
    go.onclick = () => {
      if (go.disabled) return; busy = true; go.disabled = true; const [x, y] = st.slots, turns = PZ.gearTurns(d, x, y), t0 = performance.now(), dur = 2400;
      const ok = PZ.gearOk(d, x, y);
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur), e = k * k * (3 - 2 * k);
        drawStage(e * 360 * d.target); // the crank spins the target number of times
        if (k < 1) raf = requestAnimationFrame(step); else {
          busy = false; result.textContent = api.T('gearResult', { n: +turns.toFixed(2) });
          if (ok) api.solved(); else { api.wrong(); api.lock(go, api.T('gearTurn'), () => draw()); }
        }
      }; raf = requestAnimationFrame(step);
    };
    draw(); return () => cancelAnimationFrame(raf);
  };

  // ===================== 2. Pouring =====================
  PANELS.pouring = (body, d, api) => {
    const st = api.st; st.v = st.v || PZ.pourStart(); st.moves = st.moves || 0;
    const [L, R] = cols(body), wrap = h('div', 'pour'), info = h('p', 'pour-info'), drink = h('button', 'btn', api.T('pourDrink'));
    L.append(h('div', 'pour-jug', `<span>${api.T('pourJug')}</span>`), wrap);
    R.append(h('div', 'target', `<small>${api.T('pourTarget')}</small><b>${d.goalAmount}</b>`), info, h('div', 'center', drink));
    const draw = () => {
      wrap.innerHTML = '';
      [['a', d.a, 0], ['b', d.b, 1]].forEach(([k, cap, i]) => {
        const hh = Math.round((cap / Math.max(d.a, d.b)) * 190), ww = 92;
        const v = st.v[i], A = k === 'a', col = h('div', 'vial-col');
        let ticks = ''; for (let t = 1; t < cap; t++) ticks += `<i style="bottom:${(t / cap) * 100}%"></i>`;
        col.append(h('div', 'vial', `<div class="vial-body" style="height:${hh}px;width:${ww}px">${ticks}<div class="vial-liq" style="height:${(v / cap) * 100}%"></div><b class="vial-num">${v}</b></div><small>${api.T('pourVial', { n: cap })}</small>`));
        const mv = (m) => () => { st.v = PZ.pourMove(d, st.v, m); st.moves++; draw(); };
        col.append(h('div', 'vial-btns', [
          h('button', 'btn small', api.T('pourFill'), { onclick: mv(A ? 'fillA' : 'fillB') }),
          h('button', 'btn small ghost', api.T('pourEmpty'), { onclick: mv(A ? 'emptyA' : 'emptyB') }),
          h('button', 'btn small ghost', '→ ' + (A ? d.b : d.a), { onclick: mv(A ? 'AtoB' : 'BtoA'), 'aria-label': api.T('pourTo') + ' ' + (A ? d.b : d.a) }),
        ]));
        wrap.append(col);
      });
      info.textContent = api.T('pourMoves', { n: st.moves });
    };
    drink.onclick = () => {
      if (drink.disabled) return;
      if (PZ.pourWin(d, st.v)) api.solved(); else { api.wrong(); api.lock(drink, api.T('pourDrink')); }
    };
    draw();
  };

  // ===================== 3. Seating =====================
  PANELS.seating = (body, d, api) => {
    const st = api.st; st.seats = st.seats || Array(6).fill(null); st.sel = null;
    const [L, R] = cols(body), ring = h('div', 'ring'), pool = h('div', 'guests'), serve = h('button', 'btn', api.T('seatServe'));
    const rules = h('ol', 'rules'); d.rules.forEach((r) => rules.append(h('li', '', r)));
    L.append(ring); R.append(h('p', 'hint-line', api.T('seatPick')), pool, h('h4', '', api.T('seatRules')), rules, h('div', 'center', serve));
    const gname = (id) => d.guests.find((g) => g.id === id).name, face = (id, cls) => (art(id) ? `<img class="${cls}" src="${art(id)}" alt="">` : `<span class="${cls} noimg">${gname(id)[0]}</span>`);
    const draw = () => {
      ring.innerHTML = '<div class="ring-table"><span>☕</span></div>';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * 2 * Math.PI - Math.PI / 2, g = st.seats[i];
        const c = h('button', 'chair' + (g ? ' taken' : '') + (i === 0 ? ' head' : ''), `<i>${i + 1}</i>${g ? face(g, 'face') + `<span>${gname(g)}</span>` : ''}`, { 'aria-label': 'Seat ' + (i + 1) });
        c.style.left = 50 + 39 * Math.cos(a) + '%'; c.style.top = 50 + 40 * Math.sin(a) + '%';
        c.onclick = () => {
          if (st.sel) { const from = st.seats.indexOf(st.sel); if (from >= 0) st.seats[from] = null; st.seats[i] = st.sel; st.sel = null; }
          else if (g) st.seats[i] = null; draw();
        }; ring.append(c);
      }
      pool.innerHTML = '';
      d.guests.forEach((g) => {
        if (st.seats.includes(g.id)) return;
        const b = h('button', 'guest' + (st.sel === g.id ? ' sel' : ''), face(g.id, 'gface') + `<span>${g.name}</span>`);
        b.onclick = () => { st.sel = st.sel === g.id ? null : g.id; draw(); }; pool.append(b);
      });
      if (!pool.children.length) pool.append(h('span', 'muted', '✓'));
    };
    serve.onclick = () => {
      if (serve.disabled) return;
      if (PZ.seatOk(d, st.seats.map((s) => s || ''))) api.solved(); else { api.wrong(); api.lock(serve, api.T('seatServe')); }
    };
    draw();
  };

  // ===================== 4. Word ladder =====================
  PANELS.wordLadder = (body, d, api) => {
    const st = api.st; st.words = st.words || ['', '', '', ''];
    const list = h('div', 'ladder'), btn = h('button', 'btn', api.T('ladderCheck'));
    body.append(h('div', 'ladder-wrap', [list, h('div', 'center', btn)]));
    const row = (n, word, clue, fixed) => h('div', 'rung' + (fixed ? ' fixed' : ''), `<b>${n}</b>${fixed ? `<span class="word">${word}</span>` : ''}<em>${clue}</em>`);
    const inputs = [];
    list.append(row('▲', d.start.word, d.start.clue, true));
    d.rungs.forEach((r, i) => {
      const rw = row(i + 1, '', r.clue), inp = h('input', 'word-in', null, { maxlength: 4, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', 'aria-label': api.T('ladderRung', { n: i + 1 }), placeholder: '····' });
      inp.value = st.words[i]; inp.oninput = () => { inp.value = inp.value.replace(/[^a-z]/gi, '').toUpperCase(); st.words[i] = inp.value; rw.classList.remove('bad'); };
      if (st.ok && st.ok[i]) { inp.readOnly = true; rw.classList.add('good'); }
      rw.insertBefore(inp, rw.querySelector('em')); inputs.push([inp, rw]); list.append(rw);
    });
    list.append(row('▼', d.end.word, d.end.clue, true));
    btn.onclick = () => {
      if (btn.disabled) return;
      if (st.words.some((w) => w.length < 4)) { api.toast(api.T('ladderFill')); return; }
      st.ok = d.rungs.map((r, i) => st.words[i] === r.word);
      inputs.forEach(([inp, rw], i) => { rw.classList.toggle('good', st.ok[i]); rw.classList.toggle('bad', !st.ok[i]); inp.readOnly = st.ok[i]; });
      if (st.ok.every(Boolean)) return api.solved();
      // first line is the Caterpillar's ("one letter only") when a rung is off by more than one letter
      let prev = d.start.word, far = false; st.words.forEach((w) => { if (PZ.diff(prev, w) !== 1) far = true; prev = w; });
      api.wrong({ first: far }); api.lock(btn, api.T('ladderCheck'));
    };
  };

  // ===================== 5. Mirror routing =====================
  PANELS.mirrorRouting = (body, d, api) => {
    const st = api.st; if (!st.m) { st.m = {}; d.living.forEach((c) => (st.m[c] = d.start)); }
    const cv = h('canvas', 'mirror-cv'), ctx = cv.getContext('2d'), N = d.size;
    const light = h('button', 'btn ghost', api.T('mirrorLight')), open = h('button', 'btn', api.T('mirrorOpen')), reset = h('button', 'btn small ghost', api.T('mirrorReset'));
    const guide = h('div', 'mirror-guide', `<b>${api.T('mirrorGuide')}</b>` +
      `<span class="mg"><svg viewBox="0 0 24 24"><path d="M4 20L20 4"/></svg>east→north, north→east, west→south, south→west</span>` +
      `<span class="mg"><svg viewBox="0 0 24 24"><path d="M4 4l16 16"/></svg>east→south, south→east, west→north, north→west</span>`);
    const [L, R] = cols(body); L.append(h('div', 'center', cv)); R.append(guide, h('div', 'btn-row col', [light, open, reset]));
    let size = 360, tile = 40, beam = null, raf = 0, lock = false;
    const fixed = Object.fromEntries(d.fixed), hedges = new Set(d.hedges), stones = new Set(d.stones), livingSet = new Set(d.living);
    const cxy = (id) => ({ x: id.charCodeAt(0) - 65, y: +id.slice(1) - 1 });
    function fit() {
      const avail = Math.min(L.clientWidth || 360, Math.max(260, innerHeight - 250), 540); size = Math.floor(avail / N) * N; tile = size / N;
      const dpr = window.devicePixelRatio || 1; cv.width = size * dpr; cv.height = size * dpr; cv.style.width = size + 'px'; cv.style.height = size + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function mirrorLine(x, y, m, col, lw) {
      const c = tile * 0.12, x0 = x * tile + c, x1 = (x + 1) * tile - c, y0 = y * tile + c, y1 = (y + 1) * tile - c;
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.beginPath();
      if (m === '/') { ctx.moveTo(x0, y1); ctx.lineTo(x1, y0); } else { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); } ctx.stroke();
    }
    const center = (x, y) => [(x + 0.5) * tile, (y + 0.5) * tile];
    function pathPoints(tr) { // polyline through each visited tile centre; last point beyond the edge if the beam leaves
      const pts = tr.path.map((id) => { const { x, y } = cxy(id); return center(x, y); });
      if (tr.exit) { const last = tr.path[tr.path.length - 1], { x, y } = cxy(last), dv = { E: [1, 0], N: [0, -1], W: [-1, 0], S: [0, 1] }[tr.exit.dir]; pts.push(center(x + dv[0] * 0.9, y + dv[1] * 0.9)); }
      return pts;
    }
    function draw() {
      ctx.clearRect(0, 0, size, size); const lit = new Set(); let drawn = null;
      if (beam) {
        const pts = beam.pts; let left = beam.t; const segs = [pts[0]];
        for (let i = 1; i < pts.length && left > 0; i++) {
          const [ax, ay] = pts[i - 1], [bx, by] = pts[i], len = Math.hypot(bx - ax, by - ay) / tile, f = Math.min(1, left / len); segs.push([ax + (bx - ax) * f, ay + (by - ay) * f]);
          if (left >= len && beam.path[i]) lit.add(beam.path[i]); left -= len;
        } lit.add(beam.path[0]); drawn = segs;
      }
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { ctx.fillStyle = (x + y) % 2 ? '#3b4a3a' : '#455641'; ctx.fillRect(x * tile, y * tile, tile, tile); }
      ctx.font = `${Math.max(9, tile * 0.22)}px Lora, serif`; ctx.fillStyle = 'rgba(240,230,200,.55)'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      for (let i = 0; i < N; i++) { ctx.fillText(String.fromCharCode(65 + i), i * tile + 3, 2); if (i) ctx.fillText(i + 1, 3, i * tile + 2); }
      hedges.forEach((id) => { const { x, y } = cxy(id); ctx.fillStyle = '#16261a'; ctx.beginPath(); ctx.roundRect(x * tile + 3, y * tile + 3, tile - 6, tile - 6, tile * 0.25); ctx.fill(); ctx.strokeStyle = '#2f5a35'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#4a7a50'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(x * tile + tile * (0.3 + 0.13 * k), y * tile + tile * (0.35 + 0.1 * (k % 2)), 2, 0, 7); ctx.fill(); } });
      stones.forEach((id) => { const { x, y } = cxy(id), [cx, cy] = center(x, y), on = lit.has(id); ctx.fillStyle = on ? '#fff3b0' : '#8c8478'; ctx.shadowColor = on ? '#ffe27a' : 'transparent'; ctx.shadowBlur = on ? 18 : 0; ctx.beginPath(); ctx.arc(cx, cy, tile * 0.34, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = '#4a4438'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#4a4438'; ctx.font = `${tile * 0.36}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('☺', cx, cy + 1); });
      Object.entries(fixed).forEach(([id, m]) => { const { x, y } = cxy(id); mirrorLine(x, y, m, '#6b5420', tile * 0.16); mirrorLine(x, y, m, '#D9B13A', tile * 0.09); });
      d.living.forEach((id) => { const { x, y } = cxy(id), m = st.m[id]; ctx.strokeStyle = 'rgba(143,180,217,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(...center(x, y), tile * 0.44, 0, 7); ctx.stroke(); ctx.fillStyle = 'rgba(143,180,217,.18)'; ctx.fill(); mirrorLine(x, y, m, '#2c4a6e', tile * 0.15); mirrorLine(x, y, m, '#e8f4ff', tile * 0.08); });
      const Ln = d.lantern; ctx.fillStyle = '#ffd86b'; ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(...center(Ln.x, Ln.y), tile * 0.26, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = '#5a4210'; ctx.lineWidth = 3; ctx.stroke();
      const gy = (d.gate.row - 1) * tile; ctx.fillStyle = 'rgba(190,225,255,.75)'; ctx.shadowColor = '#bfe3ff'; ctx.shadowBlur = 12; ctx.fillRect(size - 8, gy + 2, 8, tile - 4); ctx.shadowBlur = 0; ctx.strokeStyle = '#D9B13A'; ctx.lineWidth = 2; ctx.strokeRect(size - 8, gy + 2, 8, tile - 4);
      if (drawn && drawn.length > 1) { ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.shadowColor = '#fff1a8'; ctx.shadowBlur = 14; ctx.strokeStyle = 'rgba(255,225,120,.55)'; ctx.lineWidth = tile * 0.2; ctx.beginPath(); drawn.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.stroke(); ctx.shadowBlur = 0; ctx.strokeStyle = '#fffbe0'; ctx.lineWidth = tile * 0.07; ctx.stroke(); }
    }
    function play(tr, then) {
      cancelAnimationFrame(raf); lock = true; const pts = pathPoints(tr); let total = 0; for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) / tile;
      beam = { pts, path: tr.path, t: 0 }; const t0 = performance.now();
      const step = (t) => { beam.t = ((t - t0) / 1000) * d.tilesPerSec; draw(); if (beam.t < total + 0.2) raf = requestAnimationFrame(step); else { beam.t = total + 1; draw(); lock = false; then && then(); } };
      raf = requestAnimationFrame(step);
    }
    cv.addEventListener('click', (e) => {
      if (lock) return; const r = cv.getBoundingClientRect(), x = Math.floor(((e.clientX - r.left) / r.width) * N), y = Math.floor(((e.clientY - r.top) / r.height) * N), id = PZ.cell(x, y);
      if (livingSet.has(id)) { st.m[id] = st.m[id] === '/' ? '\\' : '/'; beam = null; draw(); }
    });
    light.onclick = () => { if (!lock) play(PZ.mirrorTrace(d, st.m)); };
    reset.onclick = () => { if (lock) return; d.living.forEach((c) => (st.m[c] = d.start)); beam = null; draw(); };
    open.onclick = () => {
      if (lock || open.disabled) return; const r = PZ.mirrorOk(d, st.m);
      play(PZ.mirrorTrace(d, st.m), () => { if (r.ok) api.solved(); else { api.wrong({ idx: r.end === 'hedge' ? 2 : !r.lit ? 1 : 0 }); api.lock(open, api.T('mirrorOpen')); } });
    };
    requestAnimationFrame(() => { fit(); draw(); }); const onR = () => { fit(); draw(); }; window.addEventListener('resize', onR);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onR); };
  };

  // ===================== 6. Poem path =====================
  PANELS.poemPath = (body, d, api) => {
    const st = api.st; st.path = st.path || [];
    const poem = h('ol', 'poem'), grid = h('div', 'lawn'), legend = h('div', 'legend');
    d.poem.forEach((l) => poem.append(h('li', '', l)));
    Object.entries(d.legend).forEach(([k, v]) => legend.append(h('span', 'lg lg-' + k, v)));
    const [L, R] = cols(body); L.append(grid, legend); R.append(h('h4', '', api.T('poemPoem')), poem, h('p', 'twistnote', d.twistNote), h('div', 'center', h('button', 'btn small ghost', api.T('poemReset'), { onclick: () => { st.path = []; draw(); } })));
    const draw = () => {
      const step = st.path.length; grid.innerHTML = ''; [...poem.children].forEach((li, i) => li.classList.toggle('cur', i === step));
      for (let r = d.rows.length - 1; r >= 0; r--) for (let c = 0; c < d.rows[r].length; c++) {
        const col = d.rows[r][c], idx = st.path.findIndex((p) => p.c === c && p.r === r);
        const b = h('button', `bed bed-${col}` + (idx >= 0 ? ' on' : '') + (r === step ? ' next' : ''), (col === 'C' ? '♥' : '') + (idx >= 0 ? `<b>${idx + 1}</b>` : ''), { 'aria-label': `${d.colNames[c]}${r + 1} ${d.legend[col]}` });
        b.dataset.pos = d.colNames[c] + (r + 1); b.disabled = r !== step;
        b.onclick = () => {
          const cell = { c, r }, prev = st.path[st.path.length - 1] || null;
          if (PZ.poemStepOk(d, prev, cell, step, 'twist')) { st.path.push(cell); draw(); if (st.path.length === d.rows.length) api.solved(); }
          else { api.wrong(); draw(); }
        }; grid.append(b);
      }
    };
    draw();
  };

  // ===================== 7. Switchboard (final puzzle): twelve hour cards around a clock face =====================
  PANELS.switchboard = (body, d, api) => {
    const st = api.st; st.lit = st.lit || Array.from({ length: d.count }, (_, i) => d.start.includes(i + 1));
    const [L, R] = cols(body), ring = h('div', 'clock-ring'), cnt = h('div', 'clock-count'), tgt = h('div', 'target', '<small></small>'), strike = h('button', 'btn', api.T('switchStrike'));
    L.append(ring); R.append(tgt, h('div', 'center', strike)); api.fx.courtOpen && api.fx.courtOpen();
    const n = () => st.lit.filter(Boolean).length;
    const draw = () => {
      ring.innerHTML = ''; ring.append(cnt); st.lit.forEach((on, i) => {
        const a = ((i + 1) % 12) * (Math.PI / 6) - Math.PI / 2;
        const b = h('button', 'hour' + (on ? ' lit' : ''), `<span>${i + 1}</span>`, { 'aria-label': `${i + 1}` });
        b.style.left = 50 + 39 * Math.cos(a) + '%'; b.style.top = 50 + 39 * Math.sin(a) + '%';
        b.onclick = () => {
          const before = st.lit.slice(), c0 = n(); st.lit = PZ.switchPress(st.lit, i); draw();
          st.lit.forEach((v, k) => { if (v && !before[k]) { const e = ring.querySelectorAll('.hour')[k].getBoundingClientRect(); api.fx.cardLit && api.fx.cardLit(e.left + e.width / 2, e.top + e.height / 2); } });
          if (c0 < 6 && n() >= 6 && n() < d.count) api.fx.half && api.fx.half();
          if (n() === d.count) api.fx.allLit && api.fx.allLit();
        }; ring.append(b);
      });
      cnt.innerHTML = `<b>${n()}</b><small>/ 12</small>`; tgt.firstChild.textContent = api.T('switchLit', { n: n() });
    };
    strike.onclick = () => {
      if (strike.disabled) return;
      if (n() === d.count) api.solved(); else { api.fx.wrong && api.fx.wrong(); api.wrong(); api.lock(strike, api.T('switchStrike')); }
    };
    draw(); return () => api.fx.courtClose && api.fx.courtClose();
  };

  window.PANELS = PANELS;
})();
