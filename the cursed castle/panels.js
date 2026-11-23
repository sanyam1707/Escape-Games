// panels.js: close-up puzzle components. Each gets (def from game.json, api from openPanel in game.js).
const ROMAN = ['I', 'II', 'III', 'IV'];
const Panels = {
  choice(def, api) {
    api.body.append(h('p', { class: 'prompt' }, def.prompt),
      h('div', { class: 'choices' }, def.choices.map(c => btn(c, () => {
        if (api.locked()) return; Snd.fx('click');
        if (c === def.answer) { Snd.fx('seal'); api.solved(); } else { Snd.fx('clunk'); api.wrong(); }
      }, 'choice'))));
    if (def.notesButton) api.body.append(btn(ui('notes'), () => api.note(), 'small'));
  },

  dial(def, api) {
    const vals = Array(def.count).fill(def.min), shown = [];
    const wheel = i => {
      const step = d => { if (api.locked()) return; vals[i] = vals[i] + d > def.max ? def.min : vals[i] + d < def.min ? def.max : vals[i] + d; shown[i].textContent = vals[i]; Snd.fx('click'); };
      shown[i] = h('div', { class: 'digitbox' }, vals[i]);
      return h('div', { class: 'wheel' }, h('button', { class: 'wb', 'aria-label': 'up', onclick: () => step(1) }, '▲'), shown[i], h('button', { class: 'wb', 'aria-label': 'down', onclick: () => step(-1) }, '▼'));
    };
    api.body.append(h('p', { class: 'prompt' }, def.prompt), h('div', { class: 'wheels' }, vals.map((_, i) => wheel(i))),
      btn(ui('open'), () => {
        if (api.locked()) return;
        if (vals.join('') === Core.expectedAnswer(D, room(), def)) { Snd.fx('seal'); api.solved(); } else { Snd.fx('clunk'); api.wrong(); }
      }, 'primary'));
    if (def.notes) api.body.append(btn(ui('notes'), () => api.note(), 'small'));
  },

  letters(def, api) {
    const picks = [];
    const stage1 = () => {
      const strip = h('div', { class: 'wordstrip' }, Array.from({ length: def.word.length }, (_, i) => h('button', { class: 'slot' + (picks[i] ? ' full' : ''), 'aria-label': 'slot', onclick: () => { picks.splice(i, 1); stage1(); } }, picks[i] ? picks[i].ch : '')));
      api.body.replaceChildren(h('p', { class: 'prompt' }, def.prompt),
        h('div', { class: 'sentences' }, def.books.map((id, bi) => h('div', { class: 'sentence' }, h('b', { class: 'num' }, ROMAN[bi]),
          h('span', {}, D.clues[id].text.split(' ').map((word, wi, all) => {
            const start = all.slice(0, wi).join(' ').length + (wi ? 1 : 0);
            return h('span', { class: 'w' }, [...word].map((ch, k) => !/[a-z]/i.test(ch) ? ch : h('button', {
              class: 'let' + (picks.some(p => p.b === bi && p.c === start + k) ? ' used' : ''),
              onclick: () => { const ci = start + k; if (api.locked() || picks.length >= def.word.length || picks.some(p => p.b === bi && p.c === ci)) return; picks.push({ b: bi, c: ci, ch: ch.toUpperCase() }); Snd.fx('click'); stage1(); } }, ch)));
          })))),
        ),
        strip, btn(ui('check'), async () => {
          if (api.locked()) return;
          if (picks.map(p => p.ch).join('') === def.word) { Snd.fx('chime'); stage2(); } else { Snd.fx('clunk'); picks.length = 0; await api.wrong(); stage1(); }
        }, 'primary'));
    };
    const stage2 = () => api.body.replaceChildren(h('p', { class: 'prompt' }, def.symbolPrompt),
      h('div', { class: 'choices symbols' }, def.symbols.map(s => h('button', { class: 'btn choice symbtn', onclick: () => {
        if (api.locked()) return;
        if (s === def.symbol) { Snd.fx('seal'); api.solved(); } else { Snd.fx('clunk'); api.wrong(def.wrongSymbol); }
      } }, img(def.symbolArt[s], 'symimg', s[0]), h('span', {}, s)))));
    stage1();
  },

  cauldron(def, api) {
    let step = 0; const liquid = h('div', { class: 'liquid' }), puff = h('div', { class: 'puff' }), dots = def.seq.map(() => h('i', {}));
    const paint = () => { liquid.style.height = step ? 30 + step * 12 + '%' : '0%'; liquid.style.background = step ? def.liquid[step - 1] : 'transparent'; dots.forEach((d, i) => d.classList.toggle('on', i < step)); };
    const pick = async b => {
      if (api.locked()) return;
      if (def.seq[step] === b) { step++; Snd.fx('bubble'); paint(); if (step === def.seq.length) { await wait(700); Snd.fx('seal'); api.solved(); } return; }
      step = 0; paint(); Snd.fx('fizz'); puff.classList.remove('go'); void puff.offsetWidth; puff.classList.add('go'); if (b === def.decoy) puff.classList.add('big');
      await api.wrong(b === def.decoy ? def.wrongDecoy : undefined);
    };
    api.body.append(h('p', { class: 'prompt' }, def.prompt),
      h('div', { class: 'cauldron' }, h('div', { class: 'pot' }, liquid, puff), h('div', { class: 'dots' }, dots)),
      h('div', { class: 'bottles' }, def.bottles.map(b => h('button', { class: 'bt', onclick: () => pick(b) }, img(def.art[b], 'btl', def.names[b][0]), h('small', {}, def.names[b])))),
      btn(ui('recipe'), () => { const c = D.clues[def.recipeClue]; card({ title: c.title, text: c.text, audio: c.audioFile }); }, 'small'));
  },

  lighttable(def, api) {
    const L = def.layout, N = L.size, states = L.mirrors.map(() => 2), NS = 'http://www.w3.org/2000/svg', timers = [];
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${N + 2} ${N + 2}`); svg.setAttribute('class', 'board');
    const el = (n, a, p = svg) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); p.append(e); return e; };
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) el('rect', { x: 1 + c, y: 1 + r, width: 1, height: 1, fill: '#1c1712', stroke: '#6b5a34', 'stroke-width': .03 });
    el('circle', { cx: .5, cy: 1 + L.source.row + .5, r: .3, fill: '#ffe9a0' }); el('text', { x: .5, y: 1 + L.source.row + .55, 'text-anchor': 'middle', 'font-size': .3 }).textContent = '☀';
    const cx = L.crystal.side === 'top' ? 1 + L.crystal.index + .5 : N + 1.5, cy = L.crystal.side === 'top' ? .5 : 1 + L.crystal.index + .5;
    const crystal = el('polygon', { points: `${cx},${cy - .35} ${cx + .25},${cy} ${cx},${cy + .35} ${cx - .25},${cy}`, fill: '#9a3a52', stroke: '#e8a0b0', 'stroke-width': .05 });
    const beam = el('polyline', { fill: 'none', stroke: '#ffd45c', 'stroke-width': .09, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: .95 });
    const marks = L.mirrors.map((m, i) => {
      const g = el('g', { style: 'cursor:pointer' }); el('rect', { x: 1 + m.c, y: 1 + m.r, width: 1, height: 1, fill: 'rgba(255,255,255,.04)', stroke: '#c9a24a', 'stroke-width': .04 }, g);
      const line = el('line', {}, g); g.addEventListener('click', () => { states[i] = (states[i] + 1) % 4; Snd.fx('click'); redraw(); }); return line;
    });
    const draw = (line, m, s) => {
      const x = 1 + m.c, y = 1 + m.r, P = s === 0 ? [x + .15, y + .85, x + .85, y + .15] : s === 1 ? [x + .15, y + .15, x + .85, y + .85] : s === 2 ? [x + .3, y + .5, x + .7, y + .5] : [x + .5, y + .3, x + .5, y + .7];
      ['x1', 'y1', 'x2', 'y2'].forEach((k, j) => line.setAttribute(k, P[j]));
      line.setAttribute('stroke', s < 2 ? '#bfe6ff' : '#5a5a5a'); line.setAttribute('stroke-width', s < 2 ? .12 : .05); line.setAttribute('stroke-linecap', 'round');
    };
    let solved = false;
    const redraw = () => {
      L.mirrors.forEach((m, i) => draw(marks[i], m, states[i]));
      const t = Core.traceBeam(L, states), D4 = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] }[t.dir];
      const pts = [[.7, 1 + L.source.row + .5], ...t.path.map(([r, c]) => [1 + c + .5, 1 + r + .5])];
      const last = pts[pts.length - 1]; pts.push(t.hit ? [cx, cy] : [last[0] + D4[0] * .9, last[1] + D4[1] * .9]);
      beam.setAttribute('points', pts.map(p => p.join(',')).join(' ')); crystal.setAttribute('fill', t.hit ? '#ff7a9a' : '#9a3a52');
      if (t.hit && !solved) { solved = true; Snd.fx('beam'); setTimeout(() => { Snd.fx('seal'); api.solved(); }, 1000); }
    };
    api.body.append(h('p', { class: 'prompt' }, def.prompt), svg); redraw();
    (def.stuck || []).forEach(s => timers.push(setTimeout(() => { if (!solved) say(s.say); }, s.after * 1000)));
    api.stop = () => timers.forEach(clearTimeout);
  },

  seals(def, api) {
    const order = [3, 0, 5, 2, 4, 1], placed = new Set(); let sel = null;
    const ring = h('div', { class: 'ring6' }), strip = h('div', { class: 'sealstrip' });
    const slots = order.map((si, k) => {
      const id = def.slots[si], a = k / 6 * 2 * Math.PI - Math.PI / 2;
      const b = h('button', { class: 'sslot6', style: `left:${50 + 38 * Math.cos(a)}%;top:${50 + 38 * Math.sin(a)}%`, 'aria-label': 'seal slot', onclick: () => {
        if (api.locked() || !sel || placed.has(id)) return;
        if (sel === id) { placed.add(id); sel = null; Snd.fx('seal'); draw(); if (placed.size === def.slots.length) setTimeout(() => api.solved(), 800); } else { Snd.fx('clunk'); b.classList.add('nope'); setTimeout(() => b.classList.remove('nope'), 400); }
      } });
      ring.append(b); return { b, id };
    });
    const draw = () => {
      slots.forEach(({ b, id }) => b.replaceChildren(img(D.items[id].art, 'silh' + (placed.has(id) ? ' placed' : ''), D.items[id].name[0])));
      strip.replaceChildren(...def.slots.filter(id => !placed.has(id)).map(id => h('button', { class: 'sb' + (sel === id ? ' sel' : ''), 'aria-label': D.items[id].name, onclick: () => { sel = id; Snd.fx('click'); draw(); } }, img(D.items[id].art, '', D.items[id].name[0]))));
    };
    draw(); api.body.append(h('p', { class: 'prompt' }, def.prompt), ring, strip);
  },
};
