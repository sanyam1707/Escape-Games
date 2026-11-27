/* lab.js - puzzle boards ported from The Last Labyrinth (clean, tactile CSS/SVG boards): crate fit, triangulation, tilt maze, pipe flow, river crossing, seating plan, drawers, switchboard, choice.
   Registered as G360 panels named: crate triangulation tilt pipes river seating drawer switch choice. Data: game.json puzzles.<key> (see engine/puzzles/lab.sample.json).
   Look: lab.css (materials are wood/brass/stone: recolour in theme.css when the world needs it). */
const FX = { lampMatch() {}, platePulse() {}, switchPressed() {}, wallsClosing() {}, wallsShake() {}, wallsFailed() {} };
/* panels.js - the seven puzzle boards + the vault + the choice. All drawn with CSS/SVG, mouse and touch.
   Each panel: Panels[id](root, ctx) -> optional destroy(). ctx = { d (puzzle data), st (saved state), G (game api) }.
   Closing a panel keeps `st`, so progress stays. Rules and numbers come from game.json (ctx.d). */
const Panels = (() => {
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const btn = (txt, cls, fn) => { const b = el('button', 'btn small ' + (cls || ''), txt); if (fn) b.onclick = fn; return b; };
  const help = (t) => el('p', 'help', t);

  // pointer drag with a small threshold (tap = no drag)
  function dragify(node, { start, move, end }) {
    node.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return; e.preventDefault();
      const sx = e.clientX, sy = e.clientY; let on = false;
      const mv = (ev) => { if (!on && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 7) { on = true; start && start(ev, e); } if (on) move(ev); };
      const up = (ev) => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); end(ev, on); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    });
  }

  /* ---------------- 1. Crate Fit ---------------- */
  function crate(root, { d, st, G }) {
    const COL = { I: ['#d1a24f', '#8a5f1d'], S: ['#8fa86a', '#566b3a'], L: ['#c4796a', '#7e3d30'], J: ['#6f9fc2', '#35607f'], O: ['#707880', '#42484e'] };
    const rot1 = (cells) => { const h = Math.max(...cells.map((c) => c[1])) + 1; const r = cells.map(([x, y]) => [h - 1 - y, x]); const mx = Math.min(...r.map((c) => c[0])), my = Math.min(...r.map((c) => c[1])); return r.map(([x, y]) => [x - mx, y - my]); };
    const cellsOf = (k) => { let c = d.pieces[k]; for (let i = 0; i < st.pieces[k].rot; i++) c = rot1(c); return c; };
    if (!st.pieces) st.pieces = Object.fromEntries(Object.keys(d.pieces).map((k) => [k, { rot: 0, pos: null }]));
    const wrap = el('div', 'cf'), board = el('div', 'board'), tray = el('div', 'tray');
    for (let i = 0; i < d.cols * d.rows; i++) board.appendChild(el('i'));
    const msg = el('div', 'msg'); const lock = btn(d.lock, '', () => (allPlaced() ? win() : (msg.textContent = '', G.wrong())));
    wrap.append(board, tray); root.append(help(d.help), wrap, msg, el('div', 'row')); root.lastChild.append(lock, btn(d.reset, 'ghost', () => { Object.values(st.pieces).forEach((p) => (p.pos = null)); render(); }));
    const occupied = (skip) => { const s = new Set(d.bolted.map((c) => c.join())); for (const [k, p] of Object.entries(st.pieces)) if (k !== skip && p.pos) cellsOf(k).forEach(([x, y]) => s.add([x + p.pos.x, y + p.pos.y].join())); return s; };
    const fits = (k, pos, rotOverride) => { const occ = occupied(k); const cells = rotOverride != null ? (() => { let c = d.pieces[k]; for (let i = 0; i < rotOverride; i++) c = rot1(c); return c; })() : cellsOf(k); return cells.every(([x, y]) => { const X = x + pos.x, Y = y + pos.y; return X >= 0 && Y >= 0 && X < d.cols && Y < d.rows && !occ.has(X + ',' + Y); }); };
    const allPlaced = () => Object.values(st.pieces).every((p) => p.pos);
    const win = () => G.solved();
    function shape(k, cells, cellPx, cls) {
      const w = Math.max(...cells.map((c) => c[0])) + 1, h = Math.max(...cells.map((c) => c[1])) + 1;
      const e = el('div', 'crate ' + (cls || '')); e.style.width = w * cellPx + 'px'; e.style.height = h * cellPx + 'px';
      cells.forEach(([x, y]) => { const b = el('b'); b.style.cssText = `left:${x * cellPx}px;top:${y * cellPx}px;width:${cellPx}px;height:${cellPx}px;--c1:${COL[k][0]};--c2:${COL[k][1]}`; e.appendChild(b); });
      return e;
    }
    const cellPx = () => board.clientWidth / d.cols;
    function render() {
      board.querySelectorAll('.crate').forEach((e) => e.remove()); tray.innerHTML = ''; const c = cellPx();
      const bo = shape('O', d.bolted, c, 'bolted'); bo.style.left = bo.style.top = '0'; bo.style.cursor = 'not-allowed'; bo.title = d.bolted_label; board.appendChild(bo);
      for (const k of Object.keys(st.pieces)) {
        const p = st.pieces[k], cells = cellsOf(k);
        const node = p.pos ? shape(k, cells, c) : shape(k, cells, c * .62, 'intray');
        if (p.pos) { node.style.left = p.pos.x * c + 'px'; node.style.top = p.pos.y * c + 'px'; board.appendChild(node); } else tray.appendChild(node);
        let grab = null, prev = null;
        dragify(node, {
          start(ev) { const r = node.getBoundingClientRect(); const sc = p.pos ? 1 : 1 / .62; grab = { x: (ev.clientX - r.left) * sc, y: (ev.clientY - r.top) * sc }; prev = p.pos; const n2 = shape(k, cells, c, 'drag'); n2.style.position = 'fixed'; document.body.appendChild(n2); node._g = n2; node.style.opacity = .3; },
          move(ev) { const g = node._g; g.style.left = ev.clientX - grab.x + 'px'; g.style.top = ev.clientY - grab.y + 'px'; },
          end(ev, dragged) {
            if (node._g) { node._g.remove(); node._g = null; }
            if (dragged) {
              const br = board.getBoundingClientRect(); const gx = Math.round((ev.clientX - grab.x - br.left) / c), gy = Math.round((ev.clientY - grab.y - br.top) / c);
              const over = ev.clientX > br.left - c && ev.clientX < br.right + c && ev.clientY > br.top - c && ev.clientY < br.bottom + c;
              if (over && fits(k, { x: gx, y: gy })) p.pos = { x: gx, y: gy }; else if (!over) p.pos = null; else p.pos = prev;
            } else {
              const nr = (p.rot + 1) % 4;
              if (p.pos && !fits(k, p.pos, nr)) p.pos = null; p.rot = nr;
            }
            render(); if (allPlaced()) setTimeout(win, 350);
          },
        });
      }
    }
    requestAnimationFrame(render);
    const onR = () => render(); addEventListener('resize', onR);
    return () => removeEventListener('resize', onR);
  }

  /* ---------------- 2. Triangulation ---------------- */
  function triangulation(root, { d, st, G }) {
    st.lines = st.lines || {}; st.pin = st.pin || null; st.sel = st.sel || null; st.pinMode = false;
    const id2rc = (s) => ({ c: s.charCodeAt(0) - 65, r: +s.slice(1) });
    const lm = d.landmarks.map((l) => Object.assign({}, l, id2rc(l.cell)));
    const wrapper = el('div', 'tri'), mw = el('div', 'mapwrap'), map = el('div', 'map'), side = el('div', 'side');
    map.appendChild(el('div', 'gl'));
    for (let i = 0; i < d.cols; i++) { const a = el('div', 'ax', String.fromCharCode(65 + i)); a.style.cssText = `left:calc(var(--cell)*${i} + var(--cell)*.7 + var(--cell)*.3);top:calc(var(--cell)*.1)`; mw.appendChild(a); }
    for (let r = 1; r <= d.rows; r++) { const a = el('div', 'ax', r); a.style.cssText = `top:calc(var(--cell)*${d.rows - r} + var(--cell)*.7 + var(--cell)*.2);left:calc(var(--cell)*.2)`; mw.appendChild(a); }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'lines'); svg.setAttribute('viewBox', `0 0 ${d.cols} ${d.rows}`); svg.setAttribute('preserveAspectRatio', 'none'); map.appendChild(svg);
    const place = (c, r, cls, html) => { const e = el('div', 'cell ' + cls, html); e.style.left = `calc(var(--cell)*${c})`; e.style.top = `calc(var(--cell)*${d.rows - r})`; map.appendChild(e); return e; };
    const lmEls = {}; lm.forEach((l) => { lmEls[l.id] = place(l.c, l.r, 'lm', l.id === 'spire' ? '▲' : '♣'); lmEls[l.id].title = l.name; });
    const markEls = d.marks.map((m) => { const p = id2rc(m); return place(p.c, p.r, 'cm', '✕'); });
    const pinEl = el('div', 'cell pin', '📍'); pinEl.style.display = 'none'; map.appendChild(pinEl);
    // compass rose (shows once the compass was used on the map)
    const rose = el('div', 'rose', '<svg viewBox="-50 -50 100 100"><circle r="44" fill="#f2e6c4" stroke="#5a4318" stroke-width="4"/><path d="M0 -40L9 0L0 40L-9 0Z" fill="#a33"/><path d="M-40 0L0 -9L40 0L0 9Z" fill="#5a4318"/><text y="-22" x="0" text-anchor="middle" font-size="22" font-weight="700" fill="#fff" font-family="Barlow Condensed,Impact">N</text></svg>');
    if (!d.roseWhen || G.done(d.roseWhen)) mw.appendChild(rose);
    mw.appendChild(map);
    const msg = el('div', 'msg'), info = el('div', 'lineinfo'), prompt = el('div', 'lineinfo');
    const dial = el('div', 'dial'); const order = [315, 0, 45, 270, null, 90, 225, 180, 135];
    const dbtn = {}; order.forEach((b) => { if (b == null) { dial.appendChild(el('div', 'mid')); return; } const x = el('button', '', `${d.compassNames[b]}<small>${b}°</small>`); x.onclick = () => draw(b); dbtn[b] = x; dial.appendChild(x); });
    const pinBtn = btn(d.placePin, '', () => {
      if (Object.keys(st.lines).length < 2) return say(d.needTwo, true); if (d.needItem && !G.has(d.needItem)) return say(d.needPin, true);
      st.pinMode = !st.pinMode; say(st.pinMode ? d.pinHelp : ''); refresh();
    });
    side.append(prompt, dial, info, el('div', 'row'), msg); side.querySelector('.row').append(pinBtn, btn(d.erase, 'ghost', () => { st.lines = {}; st.pinMode = false; refresh(); }));
    wrapper.append(mw, side); root.append(help(d.help), wrapper);
    const say = (t, bad) => { msg.textContent = t || ''; msg.className = 'msg' + (bad ? ' bad' : ''); };
    const end = (l, b) => { const rad = b * Math.PI / 180, dx = Math.sin(rad), dy = -Math.cos(rad); let x = l.c + .5, y = d.rows - l.r + .5; for (let i = 0; i < 400; i++) { x += dx * .05; y += dy * .05; if (x < 0 || y < 0 || x > d.cols || y > d.rows) break; } return [x, y]; };
    function refresh() {
      svg.innerHTML = '';
      lm.forEach((l, i) => { const b = st.lines[l.id]; if (b == null) return; const [x2, y2] = end(l, b); const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line'); ln.setAttribute('x1', l.c + .5); ln.setAttribute('y1', d.rows - l.r + .5); ln.setAttribute('x2', x2); ln.setAttribute('y2', y2); ln.setAttribute('stroke', i ? '#bfe3ff' : '#fffbe8'); ln.setAttribute('stroke-width', .12); ln.setAttribute('stroke-linecap', 'round'); ln.setAttribute('opacity', .95); svg.appendChild(ln); });
      lm.forEach((l) => lmEls[l.id].classList.toggle('sel', st.sel === l.id));
      const cur = lm.find((l) => l.id === st.sel);
      prompt.textContent = cur ? G.fmt(d.pickBearing, { name: cur.name }) : d.help;
      Object.entries(dbtn).forEach(([b, x]) => { x.classList.toggle('on', cur && st.lines[cur.id] === +b); x.disabled = !cur; x.style.opacity = cur ? 1 : .4; });
      info.innerHTML = lm.map((l) => (st.lines[l.id] != null ? G.fmt(d.lineFrom, { name: l.name, deg: st.lines[l.id] }) : l.name + ': ' + d.noLine)).join('<br>');
      markEls.forEach((m) => m.classList.toggle('can', st.pinMode));
      pinBtn.classList.toggle('ghost', !st.pinMode);
      pinEl.style.display = st.pin ? '' : 'none'; if (st.pin) { const p = id2rc(st.pin); pinEl.style.left = `calc(var(--cell)*${p.c})`; pinEl.style.top = `calc(var(--cell)*${d.rows - p.r})`; }
    }
    function draw(b) { if (!st.sel) return; st.lines[st.sel] = b; refresh(); }
    map.addEventListener('click', (e) => {
      const r = map.getBoundingClientRect(), cs = r.width / d.cols; const c = Math.floor((e.clientX - r.left) / cs), rr = d.rows - Math.floor((e.clientY - r.top) / cs);
      const hit = lm.find((l) => l.c === c && l.r === rr);
      if (hit && !st.pinMode) { st.sel = st.sel === hit.id ? null : hit.id; return refresh(); }
      if (!st.pinMode) return;
      const idc = String.fromCharCode(65 + c) + rr;
      if (!d.marks.includes(idc)) return say(d.notMark, true);
      st.pin = idc; refresh();
      if (idc === d.answer) { st.pinMode = false; G.solved(); } else { say('', false); G.wrong(); setTimeout(() => { st.pin = null; refresh(); }, 1200); }
    });
    refresh();
  }

  /* ---------------- 3. Tilt Maze ---------------- */
  function tilt(root, { d, st, G }) {
    const N = d.n, V = new Set(d.vEdges.map((e) => e.join())), Hh = new Set(d.hEdges.map((e) => e.join()));
    const pits = d.pits.map((p) => p.join()), ex = d.exit.join();
    st.pos = st.pos || d.start.slice(); st.n = st.n || 0;
    const wrap = el('div', 'tm'), board = el('div', 'board'), pad = el('div', 'pad');
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const c = el('div', 'c' + (V.has(x + ',' + y) ? ' r' : '') + (Hh.has(x + ',' + y) ? ' b' : '')); c.style.cssText = `left:calc(var(--cell)*${x});top:calc(var(--cell)*${y})`; board.appendChild(c); }
    const hole = (p, cls) => { const c = el('div', 'c', ''); c.style.cssText = `left:calc(var(--cell)*${p[0]});top:calc(var(--cell)*${p[1]});background:none;pointer-events:none`; c.appendChild(el('div', 'hole ' + (cls || ''))); board.appendChild(c); };
    d.pits.forEach((p) => hole(p)); hole(d.exit, 'exit');
    const sl = el('div', 'start', 'START'); sl.style.cssText = `left:calc(var(--cell)*${d.start[0]});top:calc(var(--cell)*${d.start[1]})`; board.appendChild(sl);
    const ball = el('div', 'ball', '<i></i>'); board.appendChild(ball);
    const setBall = (p) => { ball.style.transform = `translate(calc(var(--cell)*${p[0]}),calc(var(--cell)*${p[1]}))`; };
    const msg = el('div', 'msg'), cnt = el('div', 'cnt');
    const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const blocked = (x, y, dx, dy) => (dx === 1 ? x + 1 >= N || V.has(x + ',' + y) : dx === -1 ? x - 1 < 0 || V.has(x - 1 + ',' + y) : dy === 1 ? y + 1 >= N || Hh.has(x + ',' + y) : y - 1 < 0 || Hh.has(x + ',' + (y - 1)));
    let busy = false;
    const upd = () => (cnt.innerHTML = G.fmt(d.tilts, { n: st.n }).replace(': ', ':<br>'));
    function go(dir) {
      if (busy) return; busy = true; msg.textContent = ''; st.n++; upd();
      let [x, y] = st.pos; const [dx, dy] = dirs[dir], path = []; let end = 'stop';
      while (!blocked(x, y, dx, dy)) { x += dx; y += dy; path.push([x, y]); const k = x + ',' + y; if (pits.includes(k)) { end = 'pit'; break; } if (k === ex) { end = 'exit'; break; } }
      let i = 0; const step = () => {
        if (i < path.length) { setBall(path[i]); st.pos = path[i].slice(); i++; return setTimeout(step, 125); }
        if (end === 'stop') { busy = false; return; }
        ball.classList.add('fall');
        if (end === 'pit') { msg.textContent = d.pit; setTimeout(() => { st.pos = d.start.slice(); ball.style.transition = 'none'; setBall(st.pos); ball.classList.remove('fall'); void ball.offsetWidth; ball.style.transition = ''; busy = false; }, 700); }
        else { msg.textContent = d.win; setTimeout(() => { busy = false; G.solved(); }, 900); }
      }; step();
    }
    ball.style.transition = 'none'; setBall(st.pos); requestAnimationFrame(() => (ball.style.transition = ''));
    const mk = (dir, ch) => { const b = el('button', '', ch); b.setAttribute('aria-label', d.dirs[dir]); b.onclick = () => go(dir); return b; };
    pad.append(el('div'), mk('up', '▲'), el('div'), mk('left', '◀'), cnt, mk('right', '▶'), el('div'), mk('down', '▼'), el('div'));
    upd(); wrap.append(board, pad);
    root.append(help(d.help), wrap, msg, btn(d.reset, 'ghost', () => { if (busy) return; st.pos = d.start.slice(); setBall(st.pos); msg.textContent = ''; }));
    const key = (e) => { const m = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key]; if (m) { e.preventDefault(); go(m); } };
    addEventListener('keydown', key); return () => removeEventListener('keydown', key);
  }

  /* ---------------- 4. Pipe Flow ---------------- */
  function pipes(root, { d, st, G }) {
    const N = d.n, BASE = { T: 1 | 8 | 2, S: 1 | 4, E: 1 | 2, X: 0 }; // bits: U1 R2 D4 L8
    const DX = [[0, -1, 1, 4], [1, 0, 2, 8], [0, 1, 4, 1], [-1, 0, 8, 2]]; // dx, dy, bit, opposite
    const rotMask = (m, r) => { for (let i = 0; i < r % 4; i++) m = ((m << 1) | (m >> 3)) & 15; return m; };
    if (!st.rot) st.rot = d.tiles.map((row) => row.split('').map(() => 0));
    const mask = (x, y) => rotMask(BASE[d.tiles[y][x]], st.rot[y][x]);
    const board = el('div', 'board'), tiles = [], msg = el('div', 'msg');
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const kind = d.tiles[y][x], t = el('button', 't'); t.setAttribute('aria-label', 'pipe');
      if (kind !== 'X') { const m = BASE[kind]; const parts = [[1, 'M50 50V0'], [2, 'M50 50H100'], [4, 'M50 50V100'], [8, 'M50 50H0']].filter(([b]) => m & b).map(([, p]) => `<path class="pipe" d="${p}"/>`).join(''); const core = [[1, 'M50 50V0'], [2, 'M50 50H100'], [4, 'M50 50V100'], [8, 'M50 50H0']].filter(([b]) => m & b).map(([, p]) => `<path class="core" d="${p}"/>`).join(''); t.innerHTML = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="10" fill="#a87b40"/>${parts}${core}</svg>`; t.querySelector('svg').style.transform = `rotate(${st.rot[y][x] * 90}deg)`; t.onclick = () => { st.rot[y][x]++; t.querySelector('svg').style.transform = `rotate(${st.rot[y][x] * 90}deg)`; msg.textContent = ''; refresh(); }; }
      else { t.style.cssText = 'background:#0d0f11;border-style:dashed;cursor:default'; }
      tiles.push(t); board.appendChild(t);
    }
    const tagS = el('div', 'tag', d.sourceLabel + ' ▶'), tagK = el('div', 'tag sink', '▶ ' + d.sinkLabel);
    tagS.style.cssText = 'left:calc(var(--cell)*-.05);top:-18px'; tagK.style.cssText = 'right:calc(var(--cell)*-.05);bottom:-18px'; board.append(tagS, tagK);
    function analyse() {
      const wet = new Set(), leaks = []; const [sx, sy] = d.source;
      if (mask(sx, sy) & 8) { wet.add(sx + ',' + sy); const q = [[sx, sy]]; while (q.length) { const [x, y] = q.shift(); const m = mask(x, y); for (const [dx, dy, bit, opp] of DX) { if (!(m & bit)) continue; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue; if (!(mask(nx, ny) & opp) || wet.has(nx + ',' + ny)) continue; wet.add(nx + ',' + ny); q.push([nx, ny]); } } }
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const m = mask(x, y); DX.forEach(([dx, dy, bit, opp], i) => { if (!(m & bit)) return; if (x === d.source[0] && y === d.source[1] && bit === 8) return; if (x === d.sink[0] && y === d.sink[1] && bit === 2) return; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N || !(mask(nx, ny) & opp)) leaks.push([x, y, i]); }); }
      return { wet, leaks };
    }
    function refresh() {
      const { wet, leaks } = analyse();
      tiles.forEach((t, i) => { const x = i % N, y = (i / N) | 0; t.classList.toggle('wet', wet.has(x + ',' + y)); t.querySelectorAll('.leak').forEach((l) => l.remove()); });
      const pos = [[35, -14], [78, 35], [35, 78], [-14, 35]];
      leaks.forEach(([x, y, i]) => { const l = el('div', 'leak'); l.style.left = pos[i][0] + '%'; l.style.top = pos[i][1] + '%'; tiles[y * N + x].appendChild(l); });
      return { wet, leaks };
    }
    const valve = !d.valveWhen || G.done(d.valveWhen);
    const open = btn(d.openValve, '', () => { const { wet, leaks } = refresh(); if (!leaks.length && wet.has(d.sink.join())) G.solved(); else G.wrong(); });
    if (!valve) { open.disabled = true; msg.textContent = d.noValve; }
    const pf = el('div', 'pf'); pf.appendChild(board); root.append(help(d.help), pf, msg, open); refresh();
    // keep the helper: wrong() inside open() locks the panel body, so nothing else to clean up
  }

  /* ---------------- 5. River Crossing ---------------- */
  function river(root, { d, st, G }) {
    const reset = () => { st.pos = Object.fromEntries(d.things.map((t) => [t.id, 0])); st.ren = 0; st.load = null; st.n = 0; };
    if (!st.pos) reset();
    const nameOf = (id) => d.things.find((t) => t.id === id).name;
    const wrap = el('div', 'rv'), bankA = el('div', 'bank'), bankB = el('div', 'bank'), gap = el('div', 'gap'), plat = el('div', 'plat'), msg = el('div', 'msg');
    gap.append(el('div', 'rope'), plat);
    const status = el('div', 'rvstatus'), warn = el('div', 'rvwarn'), cross = btn('', '', () => go()); wrap.append(bankA, gap, bankB);
    // which unsafe pair (if any) would be left behind if Ren crosses now with the current load
    const danger = () => { const left = d.things.filter((t) => st.pos[t.id] === st.ren && t.id !== st.load).map((t) => t.id); return d.unsafe.find(([a, b]) => left.includes(a) && left.includes(b)); };
    function go() {
      if (st.moving) return; const from = st.ren; st.moving = true; refresh();
      setTimeout(() => {
        if (st.load) st.pos[st.load] = 1 - from; st.ren = 1 - from; st.n++; st.load = null; st.moving = false;
        const left = d.things.filter((t) => st.pos[t.id] === from).map((t) => t.id);
        if (d.unsafe.some(([a, b]) => left.includes(a) && left.includes(b))) { msg.textContent = d.wreck; msg.className = 'msg bad'; reset(); refresh(); G.wrong(); return; }
        msg.textContent = ''; refresh();
        if (d.things.every((t) => st.pos[t.id] === 1)) { msg.textContent = d.allDone; G.solved(); }
      }, 900);
    }
    function refresh() {
      [bankA, bankB].forEach((b, side) => {
        b.innerHTML = ''; b.appendChild(el('h4', '', side ? d.far + ' · ' + d.tali : d.near));
        const things = el('div', 'things'); b.appendChild(things);
        if (st.ren === side && !st.moving) { const rc = el('div', 'th rencard'); rc.append(G.sprite(d.renSprite || '', d.ren), el('span', '', d.ren), el('em', '', d.renHere)); things.appendChild(rc); }
        d.things.filter((t) => st.pos[t.id] === side).forEach((t) => {
          const can = st.ren === side && !st.moving, sel = st.load === t.id, node = el('button', 'th' + (can ? ' can' : '') + (sel ? ' sel' : ''));
          node.appendChild(G.sprite(t.item || t.id, t.name)); node.appendChild(el('span', '', t.name));
          if (can) { node.appendChild(el('em', '', sel ? d.loadedTag : d.tapLoad)); node.onclick = () => { st.load = sel ? null : t.id; refresh(); }; }
          things.appendChild(node);
        });
      });
      plat.classList.toggle('far', (st.ren === 1) !== !!st.moving);
      plat.textContent = st.load ? 'Ren + ' + nameOf(st.load) : 'Ren';
      status.textContent = (st.load ? G.fmt(d.onPlat, { name: nameOf(st.load) }) : d.onPlatAlone) + '   ·   ' + G.fmt(d.crossings, { n: st.n });
      const dg = danger(); warn.textContent = dg && !st.moving ? G.fmt(d.warn, { a: nameOf(dg[0]), b: nameOf(dg[1]) }) : ''; warn.style.display = warn.textContent ? '' : 'none';
      cross.textContent = st.load ? G.fmt(d.crossWith, { name: nameOf(st.load) }) : d.crossAlone; cross.classList.toggle('danger', !!dg); cross.disabled = !!st.moving;
    }
    const row = el('div', 'row'); row.append(cross, btn(d.reset, 'ghost', () => { if (st.moving) return; reset(); msg.textContent = ''; refresh(); }));
    root.append(help(d.help), wrap, status, warn, msg, row);
    if (st.moving) st.moving = false; refresh();
  }

  /* ---------------- 6. Seating Plan ---------------- */
  function seating(root, { d, st, G }) {
    if (!st.seats) st.seats = d.names.map(() => null);
    st.sel = null;
    const wrap = el('div', 'sp'), table = el('div', 'table'), tray = el('div', 'tray2'), msg = el('div', 'msg');
    const top = el('div', 'top', '☀ ' + d.skylight); table.appendChild(top);
    const seatEls = d.names.map((_, i) => { const a = (-90 + i * 60) * Math.PI / 180; const s = el('div', 'seat s' + (i + 1)); s.style.left = 50 + 41 * Math.cos(a) + '%'; s.style.top = 50 + 41 * Math.sin(a) + '%'; s.dataset.i = i; s.appendChild(el('span', 'n', i + 1)); table.appendChild(s); return s; });
    const sat = () => st.seats.filter(Boolean);
    function card(name, from) {
      const c = el('div', 'ncard' + (st.sel === name ? ' sel' : ''), name); let ghost = null;
      dragify(c, {
        start(ev) { ghost = el('div', 'ncard drag', name); document.body.appendChild(ghost); if (from != null) st.seats[from] = null; c.style.opacity = .3; },
        move(ev) { ghost.style.left = ev.clientX - 40 + 'px'; ghost.style.top = ev.clientY - 20 + 'px'; seatEls.forEach((s) => { const r = s.getBoundingClientRect(); s.classList.toggle('over', ev.clientX > r.left && ev.clientX < r.right && ev.clientY > r.top && ev.clientY < r.bottom); }); },
        end(ev, dragged) {
          if (ghost) ghost.remove();
          if (dragged) { const i = seatEls.findIndex((s) => { const r = s.getBoundingClientRect(); return ev.clientX > r.left && ev.clientX < r.right && ev.clientY > r.top && ev.clientY < r.bottom; }); if (i >= 0) put(name, i); else if (from != null) st.seats[from] = null; }
          else if (from != null) { if (st.sel && st.sel !== name) put(st.sel, from); else { st.seats[from] = null; st.sel = name; } }
          else st.sel = st.sel === name ? null : name;
          msg.textContent = ''; render();
        },
      });
      return c;
    }
    function put(name, i) { const old = st.seats[i]; st.seats[i] = name; st.sel = null; seatEls.forEach((s) => s.classList.remove('over')); /* the old card simply goes back to the tray */ return old; }
    function render() {
      seatEls.forEach((s, i) => { s.classList.remove('over'); s.querySelectorAll('.ncard').forEach((n) => n.remove()); s.classList.toggle('full', !!st.seats[i]); if (st.seats[i]) s.appendChild(card(st.seats[i], i)); s.onclick = (e) => { if (st.sel && !st.seats[i]) { put(st.sel, i); render(); } else if (st.sel && st.seats[i] && !e.target.closest('.ncard')) { put(st.sel, i); render(); } }; });
      tray.innerHTML = ''; d.names.filter((n) => !sat().includes(n)).forEach((n) => tray.appendChild(card(n, null)));
      // a selected card that is no longer in the tray must not stay selected
      if (st.sel && sat().includes(st.sel)) st.sel = null;
    }
    const check = btn(d.check, '', () => { if (sat().length < d.names.length) { msg.textContent = d.needAll; msg.className = 'msg bad'; return; } if (st.seats.every((n, i) => n === d.answer[i])) { msg.textContent = d.ok; msg.className = 'msg'; G.solved(); } else G.wrong(); });
    wrap.append(table, tray); const row = el('div', 'row'); row.append(check, btn(d.reset, 'ghost', () => { st.seats = d.names.map(() => null); st.sel = null; render(); }));
    root.append(help(d.help), wrap, msg, row); render();
  }

  /* ---------------- 7. The vault drawers ---------------- */
  function drawer(root, { d, G }) {
    const g = el('div', 'dr'); for (let i = 1; i <= d.drawers; i++) { const b = el('button', '', i); b.setAttribute('aria-label', G.fmt(d.pick, { n: i })); b.onclick = () => { if (i === d.answer) G.solved(); else { G.wrong(); G.penalty(d.penaltySec); } }; g.appendChild(b); }
    root.append(help(d.help), g);
  }

  /* ---------------- 8. Switchboard ---------------- */
  function sw(root, { d, st, G }) {
    const total = d.wallsMs || 0;
    if (!st.lamps) { st.lamps = d.start.slice(); st.wall = 0; st.lastShake = 0; }
    const lampEls = [], plate = el('div', 'plate'), grid = el('div', 'grid'), swg = el('div', 'swg'), msg = el('div', 'msg');
    for (let i = 0; i < 9; i++) { const l = el('div', 'lamp'); lampEls.push(l); grid.appendChild(l); const b = el('button', 'sw', i + 1); b.setAttribute('aria-label', 'Switch ' + (i + 1)); b.onclick = () => press(i); swg.appendChild(b); }
    plate.appendChild(grid);
    const left = el('div'), right = el('div'); left.append(el('div', 'cap', d.lamps), plate); right.append(el('div', 'cap', d.switches), swg);
    const bar = el('div', 'wallbar', '<i></i>'), wl = el('div', 'cap', '⚠ ' + (d.walls || '')); const row = el('div', 'sb'); row.append(left, right);
    root.append(help(d.help), row); if (total) root.append(wl, bar); root.append(msg);
    const nb = (i) => { const r = (i / 3) | 0, c = i % 3, o = [i]; if (r > 0) o.push(i - 3); if (r < 2) o.push(i + 3); if (c > 0) o.push(i - 1); if (c < 2) o.push(i + 1); return o; };
    let lastMatch = 0;
    function paint() { let m = 0; lampEls.forEach((l, i) => { l.classList.toggle('on', !!st.lamps[i]); const ok = st.lamps[i] === d.target[i]; if (ok) m++; FX.lampMatch(l, ok); }); if (m >= 7 && lastMatch < 7) FX.platePulse(plate); lastMatch = m; return m; }
    function press(i) {
      const flips = nb(i); flips.forEach((k) => (st.lamps[k] ^= 1)); const m = paint();
      FX.switchPressed(lampEls[i], flips.filter((k) => k !== i).map((k) => lampEls[k]));
      if (m === 9) { const r = plate.getBoundingClientRect(); stop(); G.solved(r.left + r.width / 2, r.top + r.height / 2); }
    }
    let raf = 0, last = performance.now(), dead = false;
    function stop() { dead = true; cancelAnimationFrame(raf); }
    function tick(t) {
      if (dead) return; const dt = Math.min(100, t - last); last = t;
      if (total && !G.paused()) {
        st.wall += dt; const p = Math.min(1, st.wall / total); FX.wallsClosing(p); bar.firstChild.style.width = p * 100 + '%';
        if (st.wall - st.lastShake > 15000) { st.lastShake = st.wall; FX.wallsShake(); }
        if (p >= 1) { st.wall = 0; st.lastShake = 0; st.lamps = d.start.slice(); lastMatch = 0; paint(); FX.wallsFailed(); G.wrong(); bar.firstChild.style.width = '0%'; }
      }
      raf = requestAnimationFrame(tick);
    }
    paint(); if (total) { FX.wallsClosing(Math.min(1, st.wall / total)); bar.firstChild.style.width = Math.min(1, st.wall / total) * 100 + '%'; raf = requestAnimationFrame(tick); }
    return stop;
  }

  /* ---------------- 9. The Choice ---------------- */
  function choice(root, { d, G }) {
    const row = el('div', 'ch'); d.options.forEach((o) => { const b = el('button', '', o.text); b.onclick = () => G.solved(o.id); row.appendChild(b); });
    root.append(help(d.help), row);
  }

  return { crate, triangulation, tilt, pipes, river, seating, drawer, switch: sw, choice };
})();

/* ---- adapter: Panels[id](root,{d,st,G}) -> G360.panel(name, fn(body,h,modal,P,api)) ---- */
(function () {
  const sameTxt = (s, v) => String(s == null ? '' : s).replace(/\{(\w+)\}/g, (x, k) => (v && v[k] != null ? v[k] : x));
  const NAMES = ['crate', 'triangulation', 'tilt', 'pipes', 'river', 'seating', 'drawer', 'switch'];   // the final 'choice' stays in choice.js
  NAMES.forEach((name) => G360.panel(name, (body, h, m, P, a) => {
    const st = (a.S.ps[h.id] = a.S.ps[h.id] || {}); const root = a.E('div', 'pbody lab lab-' + name); body.append(root);
    const sprite = (id, nm) => { const w = a.E('span', 'spr'); if (id && a.G.items && a.G.items[id]) w.append(a.itemIcon(id)); else w.textContent = (nm || '?').slice(0, 1); return w; };
    const Gx = {
      fmt: sameTxt, sprite, has: (id) => a.S.items.includes(id), done: (id) => a.S.done.has(id), paused: () => false, cfg: {},
      wrong: () => { const msg = root.querySelector('.msg'); a.wrong([], msg, P.wrongText || '', { free: P.noPenalty }); },
      solved: (x, y) => { if (name === 'choice' && typeof x === 'string') { st.choice = x; a.S.choice = x; } a.solve(h, m); },
      penalty: (sec) => { a.S.time = Math.max(0, a.S.time - sec); a.addScore(-a.CFG.score.wrong); a.toast('-' + sec + 's', 'bad'); },
    };
    const stop = Panels[name](root, { d: P, st, G: Gx });
    if (typeof stop === 'function') { const c = m.close; m.close = function () { stop(); return c.apply(this, arguments); }; }
  }, (P) => { const e = []; if (!P || !P.title) e.push('needs title'); return e; }));
})();
