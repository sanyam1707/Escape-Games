/* Puzzle panels. Pure DOM, no story text: everything comes from game.json (P = puzzle data).
   api (from game.js): ui, cut(name), st (state kept while the game runs), later(fn, ms), sfx(name),
   wrong(qid), part(qid), finished(), cur (current question id, for hints). */
(function () {
'use strict';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/* ---- light routing (also used by tools/solvability_test.js) ---- */
// mirrors: [{col,row,lean}] lean '/' or '\\'. Returns beam points and whether it lands on the sign.
function beam(mirrors, size, lampRow, signRow) {
  const m = {}; mirrors.forEach(x => { m[x.col + ',' + x.row] = x.lean; });
  let c = 0, r = lampRow, dx = 1, dy = 0; const pts = [[0.5, r - 0.5]];
  for (let i = 0; i < 200; i++) {
    c += dx; r += dy;
    if (c < 1 || c > size || r < 1 || r > size) {
      pts.push([Math.min(size + 1.5, Math.max(0.5, c + 0.5)), Math.min(size, Math.max(0, r - 0.5))]);
      return { pts, hit: c === size + 1 && r === signRow && dx === 1 };
    }
    const lean = m[c + ',' + r];
    if (lean) { pts.push([c + 0.5, r - 0.5]); [dx, dy] = lean === '/' ? [-dy, -dx] : [dy, dx]; }
  }
  return { pts, hit: false };
}

/* ---- torn edge shapes ---- */
function edge(shape) {
  const p = [];
  switch (shape) {
    case 'Zigzag': for (let i = 0; i <= 8; i++) p.push([i * 12.5, i % 2 ? 9 : 0]); break;
    case 'Wave': for (let i = 0; i <= 24; i++) p.push([i * 100 / 24, 4.5 + 4.5 * Math.sin(i / 24 * Math.PI * 6 - Math.PI / 2)]); break;
    case 'Notch': p.push([0, 0], [40, 0], [50, 10], [60, 0], [100, 0]); break;
    case 'Teeth': for (let i = 0; i < 5; i++) p.push([i * 20, 0], [i * 20 + 10, 10]); p.push([100, 0]); break;
    case 'Scallop': for (let i = 0; i < 5; i++) for (let k = 0; k <= 8; k++) p.push([i * 20 + 20 * k / 8, 10 * Math.sin(Math.PI * k / 8)]); break;
    default: p.push([0, 0], [100, 0]);
  }
  return p;
}
function stripClip(top, bottom) {
  const K = 1.7; // deeper teeth so the shapes are easy to compare
  const t = edge(top).map(([x, y]) => `${x}% ${(y * K).toFixed(1)}px`);
  const b = edge(bottom).reverse().map(([x, y]) => `${x}% calc(100% - ${10 * K}px + ${(y * K).toFixed(1)}px)`);
  return `polygon(${t.concat(b).join(',')})`;
}

/* ---- match: drag (or tap, then tap) an item onto a target ---- */
function match(body, P, api) {
  const st = api.st; st.placed = st.placed || {};
  const wrap = el('div', 'm-wrap ' + (P.kind || ''));
  const pool = el('div', 'm-items'), grid = el('div', 'm-targets');
  wrap.append(el('p', 'help', P.help), pool, grid); body.append(wrap);
  let sel = null;
  const items = Object.fromEntries(P.items.map(i => [i.id, i]));

  function art(it) {
    const d = el('div', 'it-' + (P.kind || 'tag'));
    if (P.kind === 'bottles') {
      const img = new Image(); img.src = api.cut(it.sprite); img.alt = ''; img.onerror = () => img.remove(); d.append(img, el('span', '', it.label));
    } else if (P.kind === 'strips') {
      d.style.clipPath = stripClip(it.top, it.bottom);
      if (it.cap) d.append(el('b', 'cap', it.cap));
      d.append(el('span', '', it.text));
    } else d.append(el('span', '', it.label));
    return d;
  }
  function render() {
    pool.innerHTML = ''; grid.innerHTML = '';
    const placedIds = new Set(Object.values(st.placed));
    const order = P.order ? P.order.map(i => P.items[i]) : P.items;
    order.filter(it => !placedIds.has(it.id)).forEach(it => {
      const b = el('button', 'm-item' + (sel === it.id ? ' sel' : '')); b.append(art(it)); b.dataset.id = it.id;
      b.addEventListener('pointerdown', e => startDrag(e, b, it.id)); pool.append(b);
    });
    P.targets.forEach(t => {
      const b = el('button', 'm-target'); b.dataset.id = t.id;
      if (t.swatch) { b.style.setProperty('--sw', t.swatch); b.classList.add('stain'); }
      b.append(el('span', 'lbl', t.label));
      if (st.placed[t.id]) { b.classList.add('filled'); b.append(art(items[st.placed[t.id]])); }
      b.addEventListener('click', () => { if (sel) attempt(sel, t, b); });
      grid.append(b);
    });
  }
  function attempt(itemId, t, node) {
    if (st.placed[t.id]) return;
    if (t.answer === itemId) {
      st.placed[t.id] = itemId; sel = null; api.sfx('page'); render();
      if (P.targets.filter(x => x.answer).every(x => st.placed[x.id])) api.finished();
    } else {
      sel = null; node.classList.add('shake'); setTimeout(() => node.classList.remove('shake'), 400); render(); api.wrong();
    }
  }
  function startDrag(e, node, id) {
    const x0 = e.clientX, y0 = e.clientY; let ghost = null;
    const move = ev => {
      if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) {
        ghost = node.cloneNode(true); ghost.classList.add('m-ghost'); ghost.style.width = node.offsetWidth + 'px'; document.body.append(ghost); node.classList.add('lift');
      }
      if (ghost) { ghost.style.left = ev.clientX - ghost.offsetWidth / 2 + 'px'; ghost.style.top = ev.clientY - ghost.offsetHeight / 2 + 'px'; }
    };
    const up = ev => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      if (ghost) {
        ghost.remove(); const n = document.elementFromPoint(ev.clientX, ev.clientY), tn = n && n.closest('.m-target');
        const t = tn && P.targets.find(x => x.id === tn.dataset.id);
        if (t) attempt(id, t, tn); else render();
      } else { sel = sel === id ? null : id; render(); api.sfx('click'); }
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  render();
}

/* ---- rhythm: copy the lamp on the key ---- */
function rhythm(body, P, api) {
  const st = api.st; if (st.round == null) st.round = 0;
  const round = el('p', 'help'), lamp = el('div', 'r-lamp'), dots = el('div', 'r-dots'), status = el('p', 'status');
  const key = el('button', 'r-key', api.ui.tapKey), again = el('button', 'plate ghost', api.ui.replay);
  body.append(el('p', 'help', P.help), round, lamp, dots, status, key, again);
  let input = [], playing = false, down = 0;
  const seq = () => P.rounds[st.round];
  function drawDots() {
    dots.innerHTML = ''; seq().forEach((_, i) => dots.append(el('i', i < input.length ? 'on' : '')));
    round.textContent = `${api.ui.round} ${st.round + 1} / ${P.rounds.length}`;
  }
  function play() {
    input = []; drawDots(); playing = true; status.textContent = api.ui.lampWatch; let t = 600;
    seq().forEach(s => {
      const d = (s === 's' ? P.shortFlash : P.longFlash) * 1000;
      api.later(() => { lamp.classList.add('on'); api.sfx('tap'); }, t); api.later(() => lamp.classList.remove('on'), t + d); t += d + P.gap * 1000;
    });
    api.later(() => { playing = false; status.textContent = api.ui.yourTurn; }, t);
  }
  key.addEventListener('pointerdown', e => { if (playing) return; e.preventDefault(); down = performance.now(); key.classList.add('down'); api.sfx('tap'); });
  const release = () => {
    if (!down) return; const d = (performance.now() - down) / 1000; down = 0; key.classList.remove('down');
    let s = d < P.tapMax ? 's' : d >= P.holdMin ? 'l' : null;
    if (!s) return;
    input.push(s); drawDots();
    if (input.length < seq().length) return;
    if (input.every((v, i) => v === seq()[i])) {
      st.round++; api.sfx('page');
      if (st.round >= P.rounds.length) return api.finished();
      api.later(play, 900);
    } else { playing = true; api.wrong(); api.later(play, 1000); }
  };
  key.addEventListener('pointerup', release); key.addEventListener('pointerleave', release); key.addEventListener('pointercancel', release);
  again.addEventListener('click', () => { api.stop(); play(); });
  play();
}

/* ---- lockers: pick the train, then the locker ---- */
const mins = s => { const [h, m] = s.split(':'); return +h * 60 + +m; };
function lockers(body, P, api) {
  const st = api.st, ui = api.ui;
  const trains = el('div', 'l-trains'), grid = el('div', 'l-grid');
  body.append(el('p', 'help', ui.telegramWindow), el('p', 'help', ui.pickTrain), trains, el('p', 'help', ui.pickLocker + ' ' + ui.ruleLine), grid);
  const fits = t => mins(t.time) > mins(P.window.from) && mins(t.time) < mins(P.window.to);
  function render() {
    trains.innerHTML = ''; grid.innerHTML = ''; grid.style.setProperty('--cols', P.perRow);
    P.trains.forEach((t, i) => {
      const b = el('button', 'l-train' + (st.train === i ? ' sel' : ''), `${t.time}  ${ui.platformWord} ${t.platform}  ${t.carriages} ${ui.carriagesWord}`);
      b.onclick = () => { if (st.train != null) return; if (fits(t)) { st.train = i; api.sfx('page'); render(); } else api.wrong(); };
      trains.append(b);
    });
    for (let n = 1; n <= P.lockers; n++) {
      const b = el('button', 'l-locker', n); b.disabled = st.train == null; b.setAttribute('aria-label', ui.lockerWord + ' ' + n);
      b.onclick = () => { const t = P.trains[st.train]; if (n === t.platform * t.carriages) { api.sfx('page'); api.finished(); } else api.wrong(); };
      grid.append(b);
    }
  }
  render();
}

/* ---- rig: mirror grid ---- */
function rig(body, P, api) {
  const st = api.st, ui = api.ui, N = P.size, NS = 'http://www.w3.org/2000/svg';
  st.lean = st.lean || Object.fromEntries(P.mirrors.map(m => [m.id, '\\']));
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${N + 2} ${N}`); svg.setAttribute('class', 'r-grid');
  const mk = (n, a, parent = svg) => { const e = document.createElementNS(NS, n); Object.entries(a).forEach(([k, v]) => e.setAttribute(k, v)); parent.append(e); return e; };
  const lock = el('button', 'plate', ui.lockMirrors), reset = el('button', 'plate ghost', ui.reset);
  body.append(el('p', 'help', ui.mirrorHelp), svg, el('div', 'row', null)); body.lastChild.append(reset, lock);
  function draw() {
    svg.innerHTML = '';
    for (let c = 1; c <= N; c++) for (let r = 1; r <= N; r++) mk('rect', { x: c, y: r - 1, width: 1, height: 1, class: 'cell' });
    const b = beam(P.mirrors.map(m => ({ col: m.col, row: m.row, lean: st.lean[m.id] })), N, P.lampRow, P.signRow);
    mk('polyline', { points: b.pts.map(p => p.join(',')).join(' '), class: 'beam' });
    mk('circle', { cx: 0.5, cy: P.lampRow - 0.5, r: 0.32, class: 'lampdot' });
    mk('rect', { x: N + 1.15, y: P.signRow - 0.85, width: 0.7, height: 0.7, class: 'signbox' + (b.hit ? ' lit' : '') });
    P.mirrors.forEach(m => {
      const x = m.col + 0.5, y = m.row - 0.5, s = st.lean[m.id] === '/' ? [-1, 1] : [-1, -1];
      mk('line', { x1: x + s[0] * 0.36, y1: y + s[1] * 0.36, x2: x - s[0] * 0.36, y2: y - s[1] * 0.36, class: 'mirror' });
      const hit = mk('rect', { x: m.col, y: m.row - 1, width: 1, height: 1, class: 'hit', 'aria-label': m.id });
      hit.addEventListener('click', () => { st.lean[m.id] = st.lean[m.id] === '/' ? '\\' : '/'; api.sfx('mirror'); draw(); });
    });
  }
  reset.onclick = () => { P.mirrors.forEach(m => st.lean[m.id] = '\\'); draw(); };
  lock.onclick = () => beam(P.mirrors.map(m => ({ col: m.col, row: m.row, lean: st.lean[m.id] })), N, P.lampRow, P.signRow).hit ? api.finished() : api.wrong();
  draw();
}

/* ---- choice: sentence locks with answer cards ---- */
function choice(body, P, api) {
  const st = api.st; st.done = st.done || {}; st.until = st.until || {};
  const q = P.questions.find(x => !st.done[x.id]);
  if (!q) return api.finished();
  api.cur = q.id;
  if (P.letter) {
    const l = el('div', 'letter');
    P.letter.forEach(x => { const p = el('p'); if (x.cap) p.append(el('b', 'cap', x.cap)); p.append(x.text); l.append(p); });
    body.append(l);
  }
  body.append(el('p', 'help', P.help));
  if (P.perQuestion) body.append(el('p', 'help', `${Object.keys(st.done).length} / ${P.questions.length} ${api.ui.locksOpen}`));
  body.append(el('p', 'sentence', q.sentence));
  const cards = el('div', 'c-cards'); body.append(cards);
  q.cards.forEach(c => {
    const b = el('button', 'c-card', c);
    b.onclick = () => {
      if (Date.now() < (st.until[q.id + c] || 0)) return;
      if (c === q.answer) { st.done[q.id] = true; api.sfx('page'); if (P.perQuestion) api.part(q.id); body.innerHTML = ''; choice(body, P, api); return; }
      if (P.perQuestion) { st.until[q.id + c] = Date.now() + api.lockMs; b.disabled = true; b.title = api.ui.lockWait; api.later(() => { b.disabled = false; }, api.lockMs); }
      b.classList.add('shake'); api.wrong(q.id);
    };
    cards.append(b);
  });
}

const TYPES = { match, rhythm, lockers, rig, choice };
const api = { mount: (type, body, P, a) => TYPES[type](body, P, a), beam };
if (typeof window !== 'undefined') window.Puzzles = api;
if (typeof module !== 'undefined') module.exports = api;
})();
