/* Puzzle panels. Each: Panels.<type>(box, data, api). Data and every word come from game.json (data + T()).
   api: st (state kept between opens), wrong(lockEls), solved(), alive(), onCross(n), hooks, drag(el,{onTap,onDrop}) */
(function () {
  const P = {}; window.Panels = P;
  const svgNS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs, ...kids) => { const e = document.createElementNS(svgNS, tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); kids.forEach(c => c && e.appendChild(c)); return e; };
  const ICON = { // 24x24 stroke icons for the four stamps
    bell: '<path d="M12 3.5a1.4 1.4 0 0 1 1.4 1.4v.4C16 6 17.5 8.2 17.5 11v3.3l2 2.7H4.5l2-2.7V11c0-2.8 1.5-5 4.1-5.7v-.4A1.4 1.4 0 0 1 12 3.5zM10 19.5h4a2 2 0 0 1-4 0z"/>',
    star: '<polygon points="12,2.5 14.9,8.8 21.7,9.5 16.6,14.1 18.1,20.8 12,17.3 5.9,20.8 7.4,14.1 2.3,9.5 9.1,8.8"/>',
    anchor: '<circle cx="12" cy="5" r="2.4"/><path d="M12 7.4V21M7.5 11h9M4.5 14.5a7.5 7.5 0 0 0 15 0"/>',
    fish: '<path d="M2.5 12c3.2-5.2 9.3-6.2 13.3-2.1L21.5 6.5v11l-5.7-3.4c-4 4.1-10.1 3.1-13.3-2.1z"/><circle cx="8" cy="11" r=".9" fill="currentColor"/>'
  };
  P.icon = (name, cls) => { const s = sv('svg', { viewBox: '0 0 24 24', class: 'ico ' + (cls || ''), fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }); s.innerHTML = ICON[name] || ''; return s; };

  /* ---------- R1 Tinted Lens ---------- */
  P.lens = (box, d, api) => {
    const { h, T } = TFCA, st = api.st; st.rev = st.rev || {}; let lens = null;
    const lensBtns = d.lenses.map(l => h('button', { class: 'btn lensbtn ' + l.id, onclick: () => { lens = l.id; lensBtns.forEach(b => b.classList.toggle('on', b === lensBtn[l.id])); } }, l.name));
    const lensBtn = {}; d.lenses.forEach((l, i) => lensBtn[l.id] = lensBtns[i]);
    const checks = [];
    const cases = d.cases.map(c => {
      const slots = d.lenses.map(l => h('div', { class: 'slot ' + l.id }, h('small', {}, l.name.split(' ')[0])));
      const paint = () => d.lenses.forEach((l, i) => { const s = st.rev[c.id + l.id]; slots[i].replaceChildren(h('small', {}, l.name.split(' ')[0])); if (s) slots[i].appendChild(P.icon(s, l.id)); });
      const tag = h('button', { class: 'tag', 'aria-label': T('lens.tag', { c: c.id }), onclick: () => {
        if (!lens) return TFCA.toast(T('lens.pick'));
        st.rev[c.id + lens] = c[lens]; paint();
      } }, h('b', {}, T('lens.case', { c: c.id })), h('div', { class: 'muddle' }, ...Object.keys(ICON).slice(0, 4).map((n, i) => { const e = P.icon(n); e.style.transform = `rotate(${i * 37}deg) scale(${1.4 - i * .12})`; return e; })), h('div', { class: 'slots' }, ...slots));
      paint();
      const ok = h('button', { class: 'btn', onclick: () => { c.mine ? api.solved() : api.wrong(checks); } }, T('lens.mine')); checks.push(ok);
      return h('div', { class: 'lcase' }, tag, ok);
    });
    box.append(h('div', { class: 'lensrow' }, ...lensBtns), h('div', { class: 'lcases' }, ...cases));
  };

  /* ---------- R2 Venn Sorting ---------- */
  P.venn = (box, d, api) => {
    const { h, T } = TFCA, st = api.st; st.place = st.place || {}; let sel = null;
    const zones = {}, tokens = {};
    const mkZone = (id, label, cls) => { const z = h('div', { class: 'zone ' + cls, 'data-drop': id, onclick: e => { if (!e.target.closest('.tok') && sel) put(sel, id); } }, label ? h('span', { class: 'zlabel' }, label) : null); zones[id] = z; return z; };
    const tray = h('div', { class: 'tray', 'data-drop': 'tray', onclick: e => { if (!e.target.closest('.tok') && sel) put(sel, null); } });
    const venn = h('div', { class: 'venn' }, h('div', { class: 'circ c1' }), h('div', { class: 'circ c2' }),
      mkZone('cold', null, 'zl'), mkZone('both', null, 'zm'), mkZone('night', null, 'zr'), mkZone('none', T('venn.none'), 'zn'));
    const vlabels = h('div', { class: 'vlabels' }, h('span', {}, T('venn.cold')), h('span', {}, T('venn.both')), h('span', {}, T('venn.night')));
    function put(id, region) { st.place[id] = region; sel = null; render(); }
    function render() {
      Object.values(zones).forEach(z => z.querySelectorAll('.tok').forEach(t => t.remove())); tray.replaceChildren();
      d.creatures.forEach(c => { const t = tokens[c.id]; t.classList.toggle('sel', sel === c.id); (st.place[c.id] ? zones[st.place[c.id]] : tray).appendChild(t); });
    }
    d.creatures.forEach(c => {
      const t = h('div', { class: 'tok', tabindex: 0 }, TFCA.sprite(c.id, c.name, 'tokimg'), h('span', {}, c.name)); tokens[c.id] = t;
      api.drag(t, { onTap: () => { sel = sel === c.id ? null : c.id; render(); }, onDrop: el => { const z = el && el.closest('[data-drop]'); if (z) put(c.id, z.dataset.drop === 'tray' ? null : z.dataset.drop); } });
    });
    const check = h('button', { class: 'btn big', onclick: () => {
      if (d.creatures.some(c => !st.place[c.id])) return TFCA.toast(T('venn.placeAll'));
      d.creatures.every(c => st.place[c.id] === c.region) ? api.solved() : api.wrong([check]);
    } }, T('venn.check'));
    box.append(h('div', { class: 'vennwrap' }, vlabels, venn), h('p', { class: 'hint-line' }, T('venn.how')), tray, check); render();
  };

  /* ---------- R3 Lure Path ---------- */
  P.lure = (box, d, api) => {
    const { h, T } = TFCA, st = api.st; st.baits = st.baits || []; let sel = false, busy = false;
    const rows = d.rows, n = rows.length, cells = {};
    const board = h('div', { class: 'lboard', style: `--n:${n}` });
    const pouch = h('div', { class: 'pouch' }, T('lure.pouch', { n: 0 }));
    const has = (r, c) => st.baits.some(b => b[0] === r && b[1] === c);
    rows.forEach((s, i) => [...s].forEach((ch, j) => {
      const r = i + 1, c = j + 1, cell = h('div', { class: 'lcell' + (ch === '#' ? ' counter' : ''), 'data-drop': ch === '.' ? r + ',' + c : null, 'data-r': r, 'data-c': c });
      if (ch === '#') cell.appendChild(h('span', { class: 'brasscounter' }));
      if (ch === 'P') cell.appendChild(h('span', { class: 'lp' }, TFCA.sprite('pilferling', 'P', 'lpimg')));
      if (ch === 'C') cell.appendChild(h('span', { class: 'lc' }, 'C', h('i', { class: 'coin' })));
      if (ch === '.') cell.onclick = () => { if (busy) return; if (has(r, c)) { st.baits = st.baits.filter(b => !(b[0] === r && b[1] === c)); render(); } else if (sel && st.baits.length < 3) { st.baits.push([r, c]); sel = st.baits.length < 3 && sel; render(); } };
      cells[r + ',' + c] = cell; board.appendChild(cell);
    }));
    const tray = h('div', { class: 'baittray' });
    const release = h('button', { class: 'btn big', onclick: go }, T('lure.release'));
    const baitEl = () => { const b = h('div', { class: 'bait', tabindex: 0 }, h('i', {})); api.drag(b, { onTap: () => { if (busy) return; sel = !sel; render(); }, onDrop: el => { const z = el && el.closest('[data-drop]'); if (!z || busy || st.baits.length >= 3 || !z.dataset.drop) return; const [r, c] = z.dataset.drop.split(',').map(Number); if (!has(r, c)) { st.baits.push([r, c]); render(); } } }); return b; };
    function render() {
      Object.values(cells).forEach(c => { c.classList.remove('hasbait'); const b = c.querySelector('.bait'); if (b) b.remove(); });
      st.baits.forEach(([r, c]) => { cells[r + ',' + c].classList.add('hasbait'); cells[r + ',' + c].appendChild(h('span', { class: 'bait placed' }, h('i', {}))); });
      tray.replaceChildren(...Array.from({ length: 3 - st.baits.length }, () => { const b = baitEl(); b.classList.toggle('sel', sel); return b; }));
      release.disabled = busy || st.baits.length < 3 || release.classList.contains('locked');
    }
    async function go() {
      const res = Logic.lureSim(rows, st.baits); busy = true; release.disabled = true; const pe = board.querySelector('.lp');
      const start = rows.join('').indexOf('P'), home = cells[(Math.floor(start / n) + 1) + ',' + (start % n + 1)];
      let got = 0; const mover = h('span', { class: 'lp mover' }, TFCA.sprite('pilferling', 'P', 'lpimg')); if (pe) pe.style.visibility = 'hidden';
      home.appendChild(mover);
      for (const [r, c] of res.path) {
        await TFCA.wait(d.stepSeconds * 1000); if (!api.alive()) return;
        const cell = cells[r + ',' + c]; cell.appendChild(mover);
        if (has(r, c)) { got++; st.baits = st.baits.filter(b => !(b[0] === r && b[1] === c)); const b = cell.querySelector('.bait'); if (b) b.remove(); pouch.textContent = T('lure.pouch', { n: got }); }
      }
      await TFCA.wait(d.stepSeconds * 1000); if (!api.alive()) return;
      busy = false; mover.remove(); if (pe) pe.style.visibility = '';
      if (res.ok) { api.solved(); }
      else { TFCA.toast(T(res.fail === 'early' ? 'lure.early' : 'lure.stuck')); st.baits = []; pouch.textContent = T('lure.pouch', { n: 0 }); sel = false; render(); api.wrong([release]); }
    }
    box.append(pouch, board, h('div', { class: 'baitrow' }, h('span', {}, T('lure.baits')), tray), h('p', { class: 'hint-line' }, T('lure.how')), release); render();
  };

  /* ---------- R4 Cipher Wheel ---------- */
  P.wheel = (box, d, api) => {
    const { h, T } = TFCA, st = api.st; if (st.k == null) st.k = 0;
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', step = 360 / 26, S = 340, cx = S / 2;
    const svg = sv('svg', { viewBox: `0 0 ${S} ${S}`, class: 'wheel' });
    svg.append(sv('circle', { cx, cy: cx, r: 168, class: 'w-out' }), sv('circle', { cx, cy: cx, r: 128, class: 'w-mid' }));
    [...A].forEach((ch, i) => { const a = (i * step - 90) * Math.PI / 180, t = sv('text', { x: cx + 148 * Math.cos(a), y: cx + 148 * Math.sin(a) + 5, class: 'w-t out', 'text-anchor': 'middle' }); t.textContent = ch; svg.appendChild(t); });
    const inner = sv('g', { class: 'w-in' }); inner.append(sv('circle', { cx, cy: cx, r: 126, class: 'w-inner' }));
    [...A].forEach((ch, i) => { const a = (i * step - 90) * Math.PI / 180, t = sv('text', { x: cx + 106 * Math.cos(a), y: cx + 106 * Math.sin(a) + 5, class: 'w-t in', 'text-anchor': 'middle' }); t.textContent = ch; inner.appendChild(t); });
    svg.append(inner, sv('circle', { cx, cy: cx, r: 74, class: 'w-hub' }), sv('path', { d: `M${cx} 8 l-8 -2 h16 z`, class: 'w-mark' }));
    const win = h('div', { class: 'cwin' }), count = h('div', { class: 'cstep' });
    const set = k => { st.k = ((k % 26) + 26) % 26; inner.setAttribute('transform', `rotate(${st.k * step} ${cx} ${cx})`); win.textContent = Logic.decode(d.cable, st.k); count.textContent = T('wheel.steps', { n: st.k }); };
    let drag = null; const ang = e => { const r = svg.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI; };
    svg.addEventListener('pointerdown', e => { drag = { a: ang(e), k: st.k }; svg.setPointerCapture(e.pointerId); });
    svg.addEventListener('pointermove', e => { if (!drag) return; let da = ang(e) - drag.a; da = ((da + 540) % 360) - 180; drag.a = ang(e); drag.acc = (drag.acc || 0) + da; set(drag.k + Math.round(drag.acc / step)); });
    svg.addEventListener('pointerup', () => drag = null); svg.addEventListener('pointercancel', () => drag = null);
    const lv = d.levels.map(n => h('button', { class: 'btn lvl', onclick: () => (n === d.answerLevel && st.k === d.key) ? api.solved() : api.wrong(lv) }, String(n)));
    box.append(h('div', { class: 'cable' }, d.cable), win,
      h('div', { class: 'wheelrow' }, h('button', { class: 'btn round', 'aria-label': T('wheel.minus'), onclick: () => set(st.k - 1) }, '−'), svg, h('button', { class: 'btn round', 'aria-label': T('wheel.plus'), onclick: () => set(st.k + 1) }, '+')),
      count, h('p', { class: 'ask' }, T('wheel.ask')), h('div', { class: 'lvls' }, ...lv)); set(st.k);
  };

  /* ---------- R5 Overlay Alignment ---------- */
  P.overlay = (box, d, api) => {
    const { h, T } = TFCA, st = api.st; if (st.b == null) { st.b = 0; st.c = 0; }
    const board = h('div', { class: 'oboard' }), cells = [];
    for (let i = 0; i < 25; i++) { const c = h('div', { class: 'ocell' }); cells.push(c); board.appendChild(c); }
    const rb = h('input', { type: 'range', min: 0, max: 4, step: 1, class: 'oslide h', 'aria-label': T('overlay.slideB') });
    const rc = h('input', { type: 'range', min: 0, max: 4, step: 1, class: 'oslide v', 'aria-label': T('overlay.slideC') });
    const draw = () => { const g = Logic.overlay(d.A, d.B, d.C, st.b, st.c); cells.forEach((c, i) => c.classList.toggle('pin', g[Math.floor(i / 5)][i % 5] === '#')); rb.value = st.b; rc.value = st.c; };
    rb.oninput = () => { st.b = +rb.value; draw(); }; rc.oninput = () => { st.c = +rc.value; draw(); };
    const nudge = (k, dlt) => h('button', { class: 'btn round', 'aria-label': T('overlay.' + k), onclick: () => { if (k === 'left' || k === 'right') st.b = (st.b + dlt + 5) % 5; else st.c = (st.c + dlt + 5) % 5; draw(); } }, { left: '◀', right: '▶', up: '▲', down: '▼' }[k]);
    const owners = d.owners.map(o => h('button', { class: 'btn', onclick: () => (o.id === d.answerOwner && st.b === d.answer[0] && st.c === d.answer[1]) ? api.solved() : api.wrong(owners) }, o.name));
    box.append(h('p', { class: 'howto' }, T('overlay.how')), h('div', { class: 'oarea' }, board, rc), h('div', { class: 'orow' }, nudge('left', -1), rb, nudge('right', 1)),
      h('div', { class: 'orow small' }, h('span', {}, T('overlay.vert')), nudge('up', -1), nudge('down', 1)),
      h('p', { class: 'ask' }, T('overlay.ask')), h('div', { class: 'owners' }, ...owners)); draw();
  };
  P.sealGrid = (rows, cls) => h2('div', { class: 'seal ' + (cls || '') }, ...[...rows.join('')].map(c => h2('i', { class: c === '#' ? 'on' : '' })));
  const h2 = (...a) => TFCA.h(...a);

  /* ---------- R6 Shadow Casting ---------- */
  P.shadow = (box, d, api) => {
    const { h, T } = TFCA, st = api.st; if (st.a == null) { st.a = 0; st.l = 0; }
    const wall = h('div', { class: 'swall' }), tt = h('button', { class: 'btn turntable', onclick: () => { st.a = (st.a + 1) % 4; draw(); } });
    const pegs = d.lamp.map((nm, i) => h('button', { class: 'btn peg', onclick: () => { st.l = i; draw(); } }, nm));
    const sprite = id => TFCA.sprite(id, d.names[id], 'shimg');
    const drawers = d.drawers.map(dr => h('button', { class: 'drawer', onclick: () => {
      const here = d.table[st.a][st.l];
      if (here !== dr.plate) { TFCA.toast(T('shadow.stuck')); drawers.forEach(x => x.classList.remove('shake')); void box.offsetWidth; el(dr).classList.add('shake'); return; }
      dr.file ? api.solved() : (TFCA.toast(T('shadow.empty')), api.wrong(drawers));
    }, 'data-id': dr.id }, h('div', { class: 'plate' }, sprite(dr.plate)), h('b', {}, T('shadow.drawer', { n: dr.id }))));
    const el = dr => drawers.find(x => x.dataset.id == dr.id);
    function draw() { wall.replaceChildren(sprite(d.table[st.a][st.l])); tt.textContent = T('shadow.turn', { deg: st.a * 90 }); pegs.forEach((p, i) => p.classList.toggle('on', i === st.l)); }
    box.append(h('div', { class: 'swallbox' }, h('small', {}, T('shadow.wall')), wall),
      h('div', { class: 'srow' }, h('div', {}, h('small', {}, T('shadow.stand')), tt), h('div', {}, h('small', {}, T('shadow.lamp')), h('div', { class: 'pegs' }, ...pegs))),
      h('small', {}, T('shadow.drawers')), h('div', { class: 'drawers' }, ...drawers)); draw();
  };

  /* ---------- R7A Untangle ---------- */
  P.untangle = (box, d, api) => {
    const { h, T } = TFCA, st = api.st; if (!st.layout) st.layout = d.start.slice(); let sel = null;
    const S = 400, c = S / 2, R = 150, pos = i => { const a = (-90 + i * 45) * Math.PI / 180; return [c + R * Math.cos(a), c + R * Math.sin(a)]; };
    const svg = sv('svg', { viewBox: `0 0 ${S} ${S}`, class: 'untangle' }), colors = d.ropes;
    function draw() {
      svg.replaceChildren(sv('circle', { cx: c, cy: c, r: R, class: 'u-ring' }));
      const bad = st.pulse ? Logic.crossingRopes(st.layout) : new Set(), ends = {};
      st.layout.forEach((r, i) => (ends[r] = ends[r] || []).push(i));
      Object.keys(ends).forEach(r => { const [p, q] = ends[r].map(pos), mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, kx = mx + (c - mx) * .25, ky = my + (c - my) * .25; // gentle bow: ropes cross on screen exactly when their chords do
        svg.appendChild(sv('path', { d: `M${p[0]} ${p[1]} Q${kx} ${ky} ${q[0]} ${q[1]}`, class: 'u-rope' + (bad.has(r) ? ' pulse' : ''), stroke: colors[r].color })); });
      st.layout.forEach((r, i) => { const [x, y] = pos(i); const g = sv('g', { class: 'u-pin' + (sel === i ? ' sel' : '') + (sel != null && sel !== i && ((i - sel + 8) % 8 === 1 || (sel - i + 8) % 8 === 1) ? ' nb' : ''), tabindex: 0, role: 'button', 'aria-label': T('untangle.pin', { n: i + 1 }) });
        g.append(sv('circle', { cx: x, cy: y, r: 27, fill: colors[r].color }), (() => { const t = sv('text', { x, y: y + 6, 'text-anchor': 'middle' }); t.textContent = i + 1; return t; })());
        g.addEventListener('click', () => tap(i)); svg.appendChild(g); });
    }
    function tap(i) {
      if (st.won) return;
      if (sel == null) { sel = i; return draw(); }
      if (sel === i) { sel = null; return draw(); }
      const adj = (i - sel + 8) % 8 === 1 ? sel : (sel - i + 8) % 8 === 1 ? i : -1;
      if (adj < 0) { TFCA.toast(T('untangle.far')); sel = i; return draw(); }
      window.Snd && Snd.sfx('swap'); st.layout = Logic.swapAdjacent(st.layout, adj); sel = null; st.pulse = false; draw();
      const n = Logic.crossings(st.layout); api.onCross(n);
      if (n === 0) { st.won = true; api.solved(); }
    }
    api.hooks.pulse = () => { st.pulse = true; draw(); setTimeout(() => { st.pulse = false; if (api.alive()) draw(); }, 2000); };
    box.append(svg, h('p', { class: 'howto' }, T('untangle.how'))); draw(); api.onCross(Logic.crossings(st.layout));
  };

  /* ---------- R7B Proof Table ---------- */
  P.proof = (box, d, api) => {
    const { h, T } = TFCA, st = api.st; st.pick = st.pick || [];
    const cards = [], present = h('button', { class: 'btn big', disabled: true, onclick: () => { Logic.proofOk(st.pick, d.answer) ? api.solved() : (api.wrong([present, ...cards]), st.pick = [], sync()); } }, T('proof.present'));
    const notes = d.notes || TFCA.G.notes;
    notes.forEach(n => { const c = h('button', { class: 'pcard paper', onclick: () => { const i = st.pick.indexOf(n.id); if (i >= 0) st.pick.splice(i, 1); else if (st.pick.length < 3) st.pick.push(n.id); sync(); } }, h('b', {}, T('proof.note', { n: n.id })), h('span', {}, n.text)); cards.push(c); });
    function sync() { cards.forEach((c, i) => c.classList.toggle('on', st.pick.includes(notes[i].id))); present.disabled = st.pick.length !== 3 || present.classList.contains('locked'); }
    const pips = h('div', { class: 'chances' }), paint = () => { const c = api.chances(); pips.replaceChildren(h('span', {}, T('proof.chances')), ...Array.from({ length: c.max }, (_, i) => h('i', { class: i < c.left ? 'on' : '' }))); };
    box.append(h('p', { class: 'hint-line' }, T('proof.how')), pips, h('div', { class: 'pgrid' }, ...cards), present); sync(); paint(); present.addEventListener('click', () => setTimeout(paint, 0));
  };

  /* ---------- R7C last choice ---------- */
  P.choice = (box, d, api) => {
    const { h } = TFCA;
    box.append(h('div', { class: 'choice' }, ...d.options.map(o => h('button', { class: 'btn huge', onclick: () => api.solved(o.id) }, o.label))));
  };
})();
