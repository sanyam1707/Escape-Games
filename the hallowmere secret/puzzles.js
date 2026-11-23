/* The panel puzzles. Each takes a ctx from game.js and returns {el, retain?, refresh?, onShow?}. Data comes from game.json "panels". */
(function () {
  'use strict';
  var P = window.Puzzles = {};

  function hint(c, t) { return c.h('p', { class: 'pz-hint', text: t }); }
  function colorBtn(c, col, cls, onclick) {
    return c.h('button', { class: cls, 'aria-label': col, style: { background: c.D.colors[col] }, on: { click: onclick } });
  }

  // P1 Bell rhythm
  P.bell = function (c) {
    var ans = c.data.answer, pos = 0, lamps = [];
    var row = c.h('div', { class: 'lamps' }); for (var i = 0; i < ans.length; i++) { var l = c.h('div', { class: 'lamp' }); lamps.push(l); row.append(l); }
    function press(k) {
      if (c.locked()) return;
      if (ans[pos] === k) {
        c.sfx(k === 'L' ? 'bellLong' : 'bellShort'); lamps[pos].classList.add('on'); pos++;
        if (pos === ans.length) c.win();
      } else {
        pos = 0; lamps.forEach(function (x) { x.classList.remove('on'); }); c.wrong();
      }
    }
    var el = c.h('div', {}, hint(c, c.ui.rubbingHint && ''), row,
      c.h('div', { class: 'pbtns' },
        c.h('button', { class: 'pbtn long', style: { background: '#6a4a14' }, text: c.ui.bellLong, on: { click: function () { press('L'); } } }),
        c.h('button', { class: 'pbtn', style: { background: '#6a4a14' }, text: c.ui.bellShort, on: { click: function () { press('S'); } } })));
    return { el: el };
  };

  // P2 Corkboard
  P.cork = function (c) {
    var d = c.data, pos = { card_photo: [18, 28], card_journal: [50, 22], card_lullaby: [82, 30], card_invitation: [32, 72], card_sketch: [70, 72] };
    var board = c.h('div', { class: 'corkboard' }), svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('preserveAspectRatio', 'none');
    board.append(svg);
    var sel = null, links = c.state.links = c.state.links || [], btns = {};
    function draw() {
      svg.innerHTML = '';
      links.forEach(function (l) {
        var a = pos[l[0]], b = pos[l[1]], ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        ln.setAttribute('x1', a[0]); ln.setAttribute('y1', a[1]); ln.setAttribute('x2', b[0]); ln.setAttribute('y2', b[1]);
        ln.setAttribute('stroke', '#b01818'); ln.setAttribute('stroke-width', '1.4'); ln.setAttribute('vector-effect', 'non-scaling-stroke'); svg.append(ln);
      });
    }
    d.cards.forEach(function (id) {
      var it = c.D.items[id], b = c.h('button', { class: 'ccard', style: { left: pos[id][0] + '%', top: pos[id][1] + '%' }, 'aria-label': it.name, on: { click: function () { tap(id); } } },
        c.itemSprite(id, 70), c.h('span', { text: it.name }));
      btns[id] = b; board.append(b);
    });
    function tap(id) {
      if (c.locked()) return;
      if (!sel) { sel = id; btns[id].classList.add('sel'); return; }
      var a = sel; btns[a].classList.remove('sel'); sel = null;
      if (a === id) return;
      var already = links.some(function (l) { return l[0] === a && l[1] === id; });
      if (already) return;
      var ok = d.links.some(function (l) { return l[0] === a && l[1] === id; });
      if (ok) { links.push([a, id]); c.sfx('ping'); draw(); if (links.length === d.links.length) c.win(); }
      else { c.sfx('snap'); c.wrong(); }
    }
    var diary = c.h('div');
    function refresh() {
      diary.innerHTML = ''; diary.append(c.h('div', { class: 'grouphead', text: c.ui.diaryList }));
      d.diary.forEach(function (id) { var n = c.S.notes.filter(function (x) { return x.id === id; })[0]; if (n) diary.append(c.h('div', { class: 'diary' }, c.h('b', { text: n.title + ': ' }), n.text)); });
    }
    refresh(); draw();
    return { el: c.h('div', {}, hint(c, c.ui.corkHint), board, diary), retain: true, refresh: refresh };
  };

  // P3 Jigsaw: drag a torn piece onto its slot, or tap the piece then tap the slot. Numbers show which is which.
  P.jigsaw = function (c) {
    var pieces = c.data.pieces, st = c.state.placed = c.state.placed || {};
    var wrap = c.h('div', { class: 'jig' }), frame = c.h('div', { class: 'jframe' }), slots = [], els = [], sel = null;
    pieces.forEach(function (p, i) { var s = c.h('div', { class: 'jslot', style: { flex: p.notes.length }, on: { click: function () { if (sel != null) tryPlace(sel, i, true); } } }, c.h('span', { class: 'jnum', text: String(i + 1) })); slots.push(s); frame.append(s); });
    wrap.append(frame);
    var order = [1, 2, 0]; // scrambled start order below the frame
    function box(el) { var f = wrap.getBoundingClientRect(), r = el.getBoundingClientRect(); return { l: r.left - f.left, t: r.top - f.top, w: r.width, h: r.height }; }
    function place(i) { var b = box(slots[i]), el = els[i]; el.style.transition = 'all .25s'; el.style.left = b.l + 'px'; el.style.top = b.t + 'px'; el.style.width = b.w + 'px'; el.style.height = b.h + 'px'; el.classList.add('done'); el.classList.remove('sel'); setTimeout(function () { el.style.transition = ''; }, 280); }
    function layout() {
      var x = 0, y = 110;
      order.forEach(function (i) {
        var el = els[i], w = box(slots[i]).w;
        if (st[i]) return place(i);
        if (x + w > wrap.clientWidth) { x = 0; y += 80; }
        el.style.transition = 'all .25s'; el.style.width = w + 'px'; el.style.height = '70px'; el.style.left = x + 'px'; el.style.top = y + 'px'; x += w + 10;
        setTimeout(function () { el.style.transition = ''; }, 280);
      });
    }
    function tryPlace(i, slot, byTap) {
      if (slot === i) { st[i] = true; sel = null; place(i); c.sfx('page'); if (Object.keys(st).length === pieces.length) c.win(); }
      else { c.toast(c.ui.jigWrong); c.sfx('flat'); layout(); }
    }
    pieces.forEach(function (p, i) {
      var el = c.h('div', { class: 'jpiece' }, c.h('span', { class: 'jnum', text: String(i + 1) }), p.notes.map(function (n) { return c.h('span', { class: 'dot', style: { background: c.D.colors[n] } }); }));
      els.push(el); wrap.append(el);
      var sx, sy, ox, oy, moved = false, drag = false;
      el.addEventListener('pointerdown', function (e) { if (st[i]) return; try { el.setPointerCapture(e.pointerId); } catch (x) { } sx = e.clientX; sy = e.clientY; ox = el.offsetLeft; oy = el.offsetTop; drag = true; moved = false; el.style.zIndex = 5; el.style.transition = ''; });
      el.addEventListener('pointermove', function (e) { if (!drag) return; var dx = e.clientX - sx, dy = e.clientY - sy; if (Math.abs(dx) + Math.abs(dy) > 6) moved = true; if (moved) { el.style.left = ox + dx + 'px'; el.style.top = oy + dy + 'px'; } });
      var end = function () {
        if (!drag) return; drag = false; el.style.zIndex = '';
        if (!moved) { sel = sel === i ? null : i; els.forEach(function (x, k) { x.classList.toggle('sel', k === sel && !st[k]); }); return; } // a tap selects the piece
        // the slot whose centre is nearest to where the piece was dropped
        var r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, best = -1, bd = 1e9;
        slots.forEach(function (s, k) { var q = s.getBoundingClientRect(); if (Math.abs(cy - (q.top + q.height / 2)) > 110) return; var dd = Math.abs(cx - (q.left + q.width / 2)); if (dd < bd) { bd = dd; best = k; } });
        if (best >= 0) tryPlace(i, best); else layout();
      };
      el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    });
    return { el: c.h('div', {}, hint(c, c.ui.jigHint), wrap), retain: true, onShow: layout, refresh: function () { setTimeout(layout, 30); } };
  };

  // P4 Organ and P11 Chimes share a colour sequence
  function colorSeq(kind) {
    return function (c) {
      var d = c.data, pos = 0, wrongs = 0, row = c.h('div', { class: 'seqrow' }), cracks = c.h('div', { class: 'cracks' });
      function press(col) {
        if (c.locked()) return;
        c.sfx(kind === 'organ' ? 'organ' : 'chime', col);
        if (d.answer[pos] === col) {
          pos++; row.append(c.h('span', { class: 'dot', style: { background: c.D.colors[col] } }));
          if (pos === d.answer.length) c.win();
        } else {
          pos = 0; row.innerHTML = ''; wrongs++; setTimeout(function () { c.sfx(kind === 'organ' ? 'wail' : 'flat'); }, 150);
          if (kind === 'chimes') cracks.textContent = new Array(wrongs + 1).join('╳ ');
          c.wrong();
        }
      }
      var ctl = c.h('div', { class: kind === 'organ' ? 'pipes' : 'chimes' });
      d.colors.forEach(function (col, i) {
        var b = colorBtn(c, col, kind === 'organ' ? 'pipe' : 'chime', function () { press(col); });
        if (kind === 'organ') b.style.height = 90 + i * 20 + 'px';
        ctl.append(b);
      });
      return { el: c.h('div', {}, hint(c, kind === 'organ' ? c.ui.organHint : c.ui.chimesHint), ctl, row, kind === 'chimes' ? cracks : null) };
    };
  }
  P.organ = colorSeq('organ'); P.chimes = colorSeq('chimes');

  // P6 Levers
  P.levers = function (c) {
    var d = c.data, seq = [], water = d.start;
    var gauge = c.h('div', { class: 'gauge' }), wEl = c.h('div', { class: 'water' }), pulls = c.h('div', { class: 'pulls' });
    for (var t = 0; t <= d.max; t++) gauge.append(c.h('div', { class: 'tick', style: { bottom: t / d.max * 100 + '%' } }));
    gauge.append(wEl, c.h('div', { class: 'redline', style: { bottom: d.target / d.max * 100 + '%' } }));
    var lab = c.h('div', { text: '' });
    function draw() {
      wEl.style.height = water / d.max * 100 + '%'; lab.textContent = c.ui.leverWater + ': ' + water;
      pulls.innerHTML = ''; for (var i = 0; i < d.pulls; i++) pulls.append(c.h('i', { class: i < seq.length ? 'on' : '' }));
    }
    function pull(l) {
      if (c.locked() || seq.length >= d.pulls) return;
      c.sfx('clunk'); seq.push(l.id); var r = c.Logic.leverRun(d, seq);
      if (r === 'splash') { c.sfx('water'); c.toast(c.ui.leverReset); water = d.max; draw(); return fail(); }
      water = r; draw();
      if (seq.length === d.pulls) { if (water === d.target) { c.sfx('water'); setTimeout(c.win, 400); } else fail(); }
    }
    function fail() { c.wrong(); setTimeout(function () { seq = []; water = d.start; draw(); }, 900); }
    var lv = c.h('div', { class: 'levers' }, d.levers.map(function (l) {
      return c.h('button', { class: 'lev', on: { click: function () { pull(l); } } }, l.id, c.h('b', { text: (l.d > 0 ? '+' : '') + l.d }));
    }));
    draw();
    return { el: c.h('div', { class: 'lever-wrap' }, hint(c, c.ui.leverHint), gauge, lab, pulls, lv) };
  };

  // P7 Rubbing
  P.rubbing = function (c) {
    var wrap = c.h('div', { class: 'rub' }), paper = c.sprite('rubbing_paper', { size: 420, color: '#c9a96a', initial: '' });
    paper.style.cssText = 'position:absolute;inset:0;display:block'; var pimg = paper.querySelector('img'); if (pimg) { pimg.style.cssText = 'width:100%;height:100%;max-width:none;max-height:none;object-fit:cover'; }
    var poem = c.h('div', { class: 'poem', text: c.D.notes.poem.text });
    var cv = document.createElement('canvas'); cv.width = 300; cv.height = 400;
    var g = cv.getContext('2d'), cols = 15, rows = 20, cells = {}, count = 0, shown = false, down = false;
    wrap.append(paper, poem, cv);
    function scratch(e) {
      var r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * cv.width, y = (e.clientY - r.top) / r.height * cv.height;
      g.fillStyle = 'rgba(20,18,16,.55)'; g.beginPath(); g.arc(x, y, 14, 0, 7); g.fill();
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
        var cx = Math.floor(x / cv.width * cols) + dx, cy = Math.floor(y / cv.height * rows) + dy;
        if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
        var k = cx + ',' + cy; if (!cells[k]) { cells[k] = 1; count++; }
      }
      if (Math.random() < .2) c.sfx('scratch');
      if (!shown && count / (cols * rows) >= c.cfg.rubbingCover) { shown = true; wrap.classList.add('shown'); c.state.shown = true; cv.style.opacity = .35; c.sfx('page'); setTimeout(function () { done.hidden = false; }, 1600); }
    }
    cv.addEventListener('pointerdown', function (e) { down = true; try { cv.setPointerCapture(e.pointerId); } catch (x) { } scratch(e); });
    cv.addEventListener('pointermove', function (e) { if (down) scratch(e); });
    cv.addEventListener('pointerup', function () { down = false; });
    var done = c.h('button', { class: 'btn', text: c.ui.continue, on: { click: function () { c.win(); } } }); done.hidden = true;
    var el = c.h('div', {}, hint(c, c.ui.rubbingHint), wrap, c.h('div', { class: 'row' }, done));
    return { el: el, retain: true, refresh: function () { if (shown) done.hidden = false; } };
  };

  // P8 Tile path
  P.tiles = function (c) {
    var d = c.data, step = 0, cur = null, grid = c.h('div', { class: 'tgrid' }), cells = {};
    var glyph = { raven: '❧', eye: '◉', thorn: '✶', moon: '☾', star: '★', key: '⚷' };
    for (var r = d.grid.length - 1; r >= 0; r--) d.grid[r].forEach(function (sym, col) {
      (function (r, col) {
        var b = c.h('button', { class: 'tile', on: { click: function () { tap(r, col); } } }, c.h('span', { class: 'sym', text: glyph[sym] || '' }), sym.toUpperCase());
        cells[r + ',' + col] = b; grid.append(b);
      })(r, col);
    });
    function reset() { step = 0; cur = null; Object.keys(cells).forEach(function (k) { cells[k].classList.remove('safe', 'here', 'crack'); }); }
    function tap(r, col) {
      if (c.locked()) return;
      if (cur && Math.abs(cur[0] - r) + Math.abs(cur[1] - col) !== 1) { c.toast(c.ui.tilesHint); return; }
      if (!cur && r !== 0) { c.toast(c.ui.tilesHint); return; }
      if (c.Logic.tileStepOk(d, step, [r, col])) {
        if (cur) cells[cur.join(',')].classList.remove('here');
        cells[r + ',' + col].classList.add('safe', 'here'); cur = [r, col]; step++; c.sfx('clunk');
        if (step === d.path.length) c.win();
      } else {
        cells[r + ',' + col].classList.add('crack'); c.sfx('crack'); c.wrong(); setTimeout(reset, 900);
      }
    }
    return { el: c.h('div', {}, hint(c, c.ui.tilesHint), grid, c.h('p', { class: 'pz-hint', text: c.D.notes.poem.text })) };
  };

  // P9 Accusation
  P.accuse = function (c) {
    var d = c.data, pick = null, cards = {};
    var grid = c.h('div', { class: 'staff-grid' });
    d.staff.forEach(function (s) {
      var b = c.h('button', { class: 'scard', on: { click: function () { if (pick) cards[pick].classList.remove('sel'); pick = s.id; b.classList.add('sel'); btn.disabled = false; } } },
        c.sprite(s.sprite, { size: 140, ratio: .8, color: '#4a3a5a', initial: '?' }), c.h('div', { text: s.name }));
      cards[s.id] = b; grid.append(b);
    });
    var btn = c.h('button', { class: 'btn', text: c.ui.accuseBtn, on: { click: function () { if (c.locked() || !pick) return; if (pick === d.answer) c.win(); else { cards[pick].classList.remove('sel'); pick = null; btn.disabled = true; c.sfx('flat'); c.wrong(); } } } });
    btn.disabled = true;
    return { el: c.h('div', {}, hint(c, c.ui.accuseHint), grid, c.h('div', { class: 'row' }, btn)) };
  };

  // P10 Marks order (choice order is shuffled each play)
  P.marks = function (c) {
    var d = c.data, list = d.choices.slice().sort(function () { return Math.random() - .5; }), box = c.h('div', { class: 'choices' });
    list.forEach(function (ch) {
      var b = c.h('button', { class: 'choice', 'data-order': ch.order.join(','), on: { click: function () { if (c.locked()) return; if (ch.id === d.answer) c.win(); else { b.classList.add('shake'); setTimeout(function () { b.classList.remove('shake'); }, 450); c.sfx('clunk'); c.wrong(); } } } },
        ch.order.map(function (m, i) { return c.h('span', { style: { display: 'flex', alignItems: 'center', gap: '2px' } }, i ? c.h('span', { text: '›' }) : null, c.h('div', { class: 'thumb' }, c.itemSprite(m, 42))); }));
      box.append(b);
    });
    return { el: c.h('div', {}, hint(c, c.ui.marksHint), box) };
  };
})();
