/* The seven puzzle panels, drag and drop, and the Room 4 recorder. */
'use strict';
/* ---------- drag and drop (pointer based, also works as tap) ---------- */
function dnd(root, { item, drop, onDrop, onTap }) {
  let st = null;
  root.addEventListener('pointerdown', e => { const it = e.target.closest(item); if (!it || !root.contains(it)) return; st = { it, x: e.clientX, y: e.clientY, clone: null }; });
  root.addEventListener('pointermove', e => {
    if (!st) return;
    if (!st.clone && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 8) { st.clone = st.it.cloneNode(true); st.clone.classList.add('drag'); document.body.appendChild(st.clone); }
    if (st.clone) { st.clone.style.left = e.clientX - 40 + 'px'; st.clone.style.top = e.clientY - 30 + 'px'; }
  });
  const up = e => { if (!st) return; const s = st; st = null; if (s.clone) { s.clone.remove(); const t = document.elementFromPoint(e.clientX, e.clientY); onDrop(s.it, t ? t.closest(drop) : null); } else onTap(s.it); };
  root.addEventListener('pointerup', up); root.addEventListener('pointercancel', () => { if (st && st.clone) st.clone.remove(); st = null; });
}

/* ---------- panel: Room 1 alphabet wall ---------- */
PANELS.wall = P => {
  const { cfg, pst, body } = P, L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), step = G.config.seqStepSeconds * 1000; pst.round = pst.round || 0; let idx = 0, busy = true;
  const turn = h('div', 'turn'), big = h('div', 'bigltr'), slots = h('div', 'seqdots');
  const wall = h('div', 'wall'); [[0, 9], [9, 18], [18, 26]].forEach(([a, b]) => { const r = h('div', 'wr'); L.slice(a, b).forEach(l => { const bt = h('button', 'wb', `<span class="g"></span><span class="l">${l}</span>`); bt.dataset.l = l; r.appendChild(bt); }); wall.appendChild(r); });
  body.appendChild(turn); body.appendChild(big); body.appendChild(slots); body.appendChild(wall);
  const btn = h('button', 'btn', 'Watch Again'), c = h('div', 'center'); c.appendChild(btn); body.appendChild(c);
  const seq = () => cfg.rounds[pst.round], lamp = (l, on) => $(`.wb[data-l="${l}"]`, wall).classList.toggle('lit', on);
  const drawSlots = () => { slots.innerHTML = seq().map((_, i) => `<i class="${i < idx ? 'on' : ''}"></i>`).join(''); };
  const setTurn = watching => { turn.className = 'turn ' + (watching ? 'watch' : 'go'); turn.innerHTML = `<small>${G.ui.wallRound.replace('{r}', pst.round + 1).replace('{n}', cfg.rounds.length)} \u00b7 ${seq().length} bulbs</small>${watching ? G.ui.wallWatch : G.ui.wallTurn}`; wall.classList.toggle('dim', watching); };
  async function play() {
    busy = true; idx = 0; drawSlots(); setTurn(true); P.status(''); big.textContent = ''; await sleep(700);
    for (const l of seq()) { if (!P.alive) return; lamp(l, true); big.textContent = l; sfx('buzz'); await sleep(step * .6); lamp(l, false); big.textContent = ''; await sleep(step * .4); }
    if (!P.alive) return; busy = false; setTurn(false); drawSlots();
  }
  wall.addEventListener('click', async e => {
    const b = e.target.closest('.wb'); if (!b || busy) return; const l = b.dataset.l; b.classList.add('tap'); setTimeout(() => b.classList.remove('tap'), 150); lamp(l, true); setTimeout(() => lamp(l, false), 220);
    if (l === seq()[idx]) {
      sfx('bleep'); idx++; drawSlots();
      if (idx === seq().length) {
        busy = true; pst.round++;
        if (pst.round === cfg.rounds.length) { body.innerHTML = ''; body.appendChild(h('div', 'flashmsg', cfg.final)); P.status(''); sfx('chime'); await sleep(2400); if (P.alive) P.solved(); }
        else { P.status('Good. Next round.'); sfx('chime'); await sleep(900); if (P.alive) play(); }
      }
    } else { busy = true; sfx('wrong'); P.status('Not that bulb. Watch again.'); P.wrong({ cost: false, lock: false }); await sleep(900); if (P.alive) play(); }
  });
  btn.onclick = () => { if (!busy) play(); };
  play();
};

/* ---------- panel: Room 2 cabinet ---------- */
PANELS.cabinet = P => {
  const { cfg, pst, body } = P; pst.v = pst.v || [0, 0, 0, 0]; const dials = h('div', 'dials');
  const draw = () => { dials.innerHTML = ''; pst.v.forEach((n, i) => { const d = h('div', 'dial', `<button data-i="${i}" data-d="1" aria-label="Next letter">▲</button><div class="v">${String.fromCharCode(65 + n)}</div><button data-i="${i}" data-d="-1" aria-label="Previous letter">▼</button>`); dials.appendChild(d); }); };
  dials.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const i = +b.dataset.i; pst.v[i] = (pst.v[i] + +b.dataset.d + 26) % 26; sfx('bleep'); draw(); });
  draw(); body.appendChild(dials); const open = h('button', 'btn big', 'Open'); const c = h('div', 'center'); c.appendChild(open); body.appendChild(c);
  open.onclick = () => { const w = pst.v.map(n => String.fromCharCode(65 + n)).join(''); if (w === cfg.answer) { sfx('unlock'); P.solved(); } else { dials.classList.remove('shake'); void dials.offsetWidth; dials.classList.add('shake'); P.wrong(); } };
};

/* ---------- panel: Room 3 card table ---------- */
PANELS.table = P => {
  const { cfg, pst, body, room } = P; pst.placed = pst.placed || {}; let sel = null;
  const cardHTML = c => `<div class="gcard" data-card="${c.id}">${spriteImg(c.sprite)}<span><b>${esc(c.name)}</b>${esc(c.text)}</span></div>`;
  function render() {
    body.innerHTML = ''; const rules = h('div', 'rules');
    cfg.rules.forEach(r => { const pl = room.cards.find(c => c.id === pst.placed[r.id]), row = h('div', 'rule slot'); row.dataset.rule = r.id;
      const cov = r.coveredText && !S.flags.toolboxMoved;
      row.innerHTML = `<b style="font-family:var(--f-px);font-size:10px">${r.id}</b><div class="rt ${cov ? 'cov' : ''}">${cov ? `<span>⚡ ${esc(r.coveredText)}</span><div class="toolbox">Heavy toolbox</div>` : (r.coveredText ? '⚡ ' : '') + esc(r.text)}</div><div class="drop">${pl ? cardHTML(pl) : 'Put a card here'}</div>`;
      rules.appendChild(row); });
    body.appendChild(rules); const placed = Object.values(pst.placed), tray = h('div', 'tray');
    room.cards.filter(c => !placed.includes(c.id)).forEach(c => { tray.innerHTML += cardHTML(c); }); $$('.gcard', tray).forEach(e => e.classList.toggle('sel', e.dataset.card === sel)); body.appendChild(tray);
    const chk = h('button', 'btn big', 'Check'); const c = h('div', 'center'); c.appendChild(chk); body.appendChild(c); chk.onclick = check; P.status('');
  }
  const place = (card, rule) => { for (const k in pst.placed) if (pst.placed[k] === card) delete pst.placed[k]; pst.placed[rule] = card; sel = null; sfx('click'); render(); };
  dnd(body, { item: '.gcard', drop: '.rule', onDrop: (it, d) => { if (d) place(it.dataset.card, d.dataset.rule); else { for (const k in pst.placed) if (pst.placed[k] === it.dataset.card) delete pst.placed[k]; render(); } },
    onTap: it => { const id = it.dataset.card, inRule = Object.values(pst.placed).includes(id); if (inRule) { for (const k in pst.placed) if (pst.placed[k] === id) delete pst.placed[k]; sel = null; } else sel = sel === id ? null : id; sfx('click'); render(); } });
  body.addEventListener('click', e => { if (e.target.closest('.gcard')) return; const row = e.target.closest('.rule'); if (row && sel) place(sel, row.dataset.rule); });
  function check() {
    if (Object.keys(pst.placed).length < cfg.rules.length) { P.status('Put a card on every rule first.'); return; }
    if (cfg.rules.every(r => pst.placed[r.id] === r.answer)) { sfx('unlock'); P.solved(); } else { P.body.classList.remove('shake'); void P.body.offsetWidth; P.body.classList.add('shake'); P.wrong(); }
  }
  P.refresh = render; render();
};

/* ---------- panel: Room 4 timeline board ---------- */
PANELS.board = P => {
  const { cfg, pst, body, room } = P; pst.order = pst.order || [null, null, null, null]; let sel = null;
  const tapeHTML = l => `<div class="tape" data-t="${l}"><span class="lab">${l}</span><span>Tape ${l}</span></div>`;
  function render() {
    body.innerHTML = ''; const slots = h('div', 'slots4');
    pst.order.forEach((t, i) => { const s = h('div', 'tslot', `<span class="n">${i + 1}${i === 0 ? ' first' : i === 3 ? ' last' : ''}</span>${t ? tapeHTML(t) : ''}`); s.dataset.slot = i; slots.appendChild(s); });
    body.appendChild(slots); const tray = h('div', 'tray'); ['A', 'B', 'C', 'D'].filter(l => !pst.order.includes(l)).forEach(l => tray.innerHTML += `<div style="width:78px">${tapeHTML(l)}</div>`); body.appendChild(tray);
    $$('.tape', body).forEach(e => e.classList.toggle('sel', e.dataset.t === sel));
    const chk = h('button', 'btn big', 'Check'); const c = h('div', 'center'); c.appendChild(chk); body.appendChild(c); chk.onclick = check;
    body.appendChild(h('div', 'caps', '<b>What you heard</b>' + Object.entries(room.tapes).map(([k, t]) => `<div><b>${k}</b> ${esc(t.caption)}</div>`).join('')));
  }
  const place = (l, i) => { const o = pst.order.indexOf(l); if (o >= 0) pst.order[o] = pst.order[i]; pst.order[i] = l; sel = null; sfx('click'); render(); };
  dnd(body, { item: '.tape', drop: '.tslot', onDrop: (it, d) => { if (d) place(it.dataset.t, +d.dataset.slot); else { const o = pst.order.indexOf(it.dataset.t); if (o >= 0) pst.order[o] = null; render(); } },
    onTap: it => { const l = it.dataset.t, o = pst.order.indexOf(l); if (o >= 0) { pst.order[o] = null; sel = null; } else sel = sel === l ? null : l; sfx('click'); render(); } });
  body.addEventListener('click', e => { if (e.target.closest('.tape')) return; const s = e.target.closest('.tslot'); if (s && sel) place(sel, +s.dataset.slot); });
  function check() {
    if (pst.order.includes(null)) { P.status('Put all four tapes in the slots first.'); return; }
    if (pst.order.join('') === cfg.answer.join('')) { sfx('unlock'); P.solved(); } else { P.body.classList.remove('shake'); void P.body.offsetWidth; P.body.classList.add('shake'); P.wrong(); }
  }
  render();
};

/* ---------- recorder (USE target in Room 4) ---------- */
function openRecorder(letter) {
  const hs = G.rooms[3].hotspots.find(x => x.id === 'r4_recorder');
  openPanel(hs, { type: 'recorder', title: 'The Recorder', intro: 'Hold the crank to play a tape. Turning slowly plays it slowly.', letter });
}
PANELS.recorder = P => {
  const { cfg, pst, body, room } = P; pst.prog = pst.prog || {}; let cur = cfg.letter, hold = null, last = 0;
  const owned = ['A', 'B', 'C', 'D'].filter(l => S.items.includes('tape_' + l.toLowerCase()));
  function render() {
    body.innerHTML = ''; const row = h('div', 'center'); owned.forEach(l => { const b = h('button', 'btn' + (l === cur ? '' : ' alt'), 'Tape ' + l + (S.heard.has(l) ? ' ✓' : '')); b.onclick = () => { cur = l; render(); }; row.appendChild(b); }); body.appendChild(row);
    const rec = h('div', 'recorder', `<div class="cap" id="rcap"></div><div class="prog"><i></i></div><button class="crank" id="crank"><span>HOLD</span><span>TO PLAY</span></button><div style="font-size:12px">${S.flags.radioOn ? 'The radio is on. Tapes play at normal speed.' : 'Tapes play slowly. Keep holding.'}</div>`);
    body.appendChild(rec); show();
    const cr = $('#crank', rec); cr.addEventListener('pointerdown', e => { e.preventDefault(); cr.setPointerCapture(e.pointerId); begin(cr); }); ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => cr.addEventListener(ev, () => end(cr)));
  }
  const show = () => { const t = room.tapes[cur], p = pst.prog[cur] || 0; $('#rcap', body).textContent = S.heard.has(cur) ? t.caption : t.caption.slice(0, Math.floor(t.caption.length * p)); $('.prog i', body).style.width = (S.heard.has(cur) ? 100 : p * 100) + '%'; };
  function begin(cr) { if (hold) return; cr.classList.add('on'); last = performance.now(); hold = setInterval(() => {
    const now = performance.now(), dt = (now - last) / 1000; last = now; sfx('crank'); const dur = S.flags.radioOn ? G.config.crankSeconds.fast : G.config.crankSeconds.slow;
    pst.prog[cur] = Math.min(1, (pst.prog[cur] || 0) + dt / dur); show();
    if (pst.prog[cur] >= 1) { end(cr); heard(cur); } }, 100); }
  function end(cr) { if (hold) { clearInterval(hold); hold = null; } cr.classList.remove('on'); }
  function heard(l) {
    const first = !S.heard.has(l); S.heard.add(l); sfx('tune'); addNote(room.id, `Tape ${l}: ${room.tapes[l].caption}`); show(); P.status(`Tape ${l} played.`);
    if (first && ['A', 'B', 'C', 'D'].every(x => S.heard.has(x))) { S.done.add('all_tapes_heard'); toast('All four tapes heard. Look at the desk.', 3500); refreshHotspots(); }
  }
  P.destroy = () => { if (hold) clearInterval(hold); }; P.refresh = render; render();
};

/* ---------- panel: Room 5 corkboard ---------- */
PANELS.cork = P => {
  const { cfg, pst, body, room } = P; pst.links = pst.links || {}; let sel = null;
  const codes = Object.keys(G.slips).filter(c => S.items.includes('slip_' + c.toLowerCase()));
  const wrap = h('div', 'cork'); const photos = h('div', 'photos'), slips = h('div', 'slips'), svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'strings');
  room.people.forEach(p => { const e = h('div', 'photo', `<div class="pic"></div><b>${esc(p.name)}</b><div>${esc(p.job)}</div><div class="cnt"></div>`); e.dataset.p = p.id; photos.appendChild(e); });
  codes.forEach(c => { const e = h('div', 'slip', `<b>${c}</b>${esc(slipText(c))}`); e.dataset.s = c; slips.appendChild(e); });
  wrap.appendChild(photos); wrap.appendChild(slips); wrap.appendChild(svg); body.appendChild(wrap);
  const portrait = { finch: 'port_finch', corvane: 'port_ines', harlow: 'port_harlow' };
  $$('.photo', wrap).forEach(e => { const n = portrait[e.dataset.p]; if (have.has(n)) $('.pic', e).style.backgroundImage = `url(${spriteUrl(n)})`; });
  function draw() {
    $$('.slip', wrap).forEach(e => { e.classList.toggle('done', !!pst.links[e.dataset.s]); e.classList.toggle('sel', e.dataset.s === sel); e.lastChild.textContent = slipText(e.dataset.s); });
    $$('.photo', wrap).forEach(e => { e.querySelector('.cnt').textContent = Object.values(pst.links).filter(v => v === e.dataset.p).length + ' linked'; });
    requestAnimationFrame(() => { const w = wrap.getBoundingClientRect(); svg.innerHTML = Object.entries(pst.links).map(([s, p]) => { const a = $(`.slip[data-s="${s}"]`, wrap).getBoundingClientRect(), b = $(`.photo[data-p="${p}"]`, wrap).getBoundingClientRect();
      return `<line x1="${a.left + a.width / 2 - w.left}" y1="${a.top - w.top}" x2="${b.left + b.width / 2 - w.left}" y2="${b.bottom - w.top}" stroke="#D64545" stroke-width="3"/>`; }).join(''); });
  }
  P.refresh = draw;
  function link(code, pid) {
    sel = null; const s = G.slips[code];
    if (s.owner === pid) { pst.links[code] = pid; sfx('tile'); draw();
      if (codes.every(c => pst.links[c]) && codes.length === 6) { $(`.photo[data-p="corvane"]`, wrap).classList.add('glow'); sfx('chime'); P.status('Every slip is linked.'); setTimeout(() => P.alive && P.solved(), 1400); } }
    else { const ph = $(`.photo[data-p="${pid}"]`, wrap); ph.classList.add('bad'); setTimeout(() => ph.classList.remove('bad'), 500); draw(); P.wrong(); }
  }
  dnd(wrap, { item: '.slip', drop: '.photo', onDrop: (it, d) => { if (d) link(it.dataset.s, d.dataset.p); }, onTap: it => { if (pst.links[it.dataset.s]) return; sel = sel === it.dataset.s ? null : it.dataset.s; sfx('click'); draw(); } });
  wrap.addEventListener('click', e => { const ph = e.target.closest('.photo'); if (ph && sel) link(sel, ph.dataset.p); });
  P.status('Tap a slip, then tap the person it belongs to.'); draw();
};

/* ---------- panel: Room 6 tunnel floor ---------- */
PANELS.floor = P => {
  const { cfg, body, room } = P; let path = [], tm;
  const names = cfg.tileNames, wrap = h('div', 'floorwrap'), grid = h('div', 'floor'), patch = h('div', 'patch');
  const pos = (r, c) => 'ABCD'[c] + (r + 1);
  for (let r = 4; r >= 0; r--) { grid.appendChild(h('div', 'lbl', String(r + 1))); for (let c = 0; c < 4; c++) { const k = cfg.grid[r][c], t = h('button', 'tile fl', tileSvg(k)); t.dataset.r = r; t.dataset.c = c; t.setAttribute('aria-label', names[k] + ' ' + pos(r, c)); grid.appendChild(t); } }
  const cols = h('div', 'floor cols'); cols.appendChild(h('div', 'lbl', '')); 'ABCD'.split('').forEach(l => cols.appendChild(h('div', 'lbl', l)));
  wrap.appendChild(h('div', 'mouth', '▲ FAR WALL')); wrap.appendChild(grid); wrap.appendChild(cols); wrap.appendChild(h('div', 'mouth below', '▼ TUNNEL MOUTH'));
  const rb = h('button', 'btn alt', 'Read the rhyme'), sa = h('button', 'btn', 'Start Again'), row = h('div', 'center'); row.appendChild(rb); row.appendChild(sa); wrap.appendChild(row); body.appendChild(wrap); body.style.position = 'relative'; body.appendChild(patch);
  const legend = h('div', 'caps', `<b>Tiles:</b> ${Object.entries(names).map(([k, n]) => `<span style="display:inline-flex;align-items:center;gap:3px;width:22px;height:22px">${tileSvg(k)}</span> ${n}`).join(' &nbsp; ')}`); body.appendChild(legend);
  const tiles = $$('.tile', grid), at = (r, c) => tiles.find(t => +t.dataset.r === r && +t.dataset.c === c);
  const mark = () => tiles.forEach(t => { const i = path.findIndex(p => p[0] === +t.dataset.r && p[1] === +t.dataset.c); t.classList.toggle('used', i >= 0); t.classList.toggle('cur', i === path.length - 1 && i >= 0); const s = t.querySelector('.st'); if (s) s.remove(); if (i >= 0) t.appendChild(h('span', 'st', String(i + 1))); });
  const flick = () => { const steady = S.veilUntil > S.playTime; if (steady && !P._was) P.status('The glow holds steady. Step onto row 1 to begin.'); P._was = steady; grid.classList.toggle('steady', steady); tiles.forEach(t => t.classList.toggle('fl', !steady && Math.random() < .35)); }; tm = setInterval(flick, 700); flick();
  P.destroy = () => clearInterval(tm); P.refresh = flick;
  function fail() { path = []; mark(); sfx('burst'); patch.style.setProperty('--px', Math.random() * 100 + '%'); patch.classList.remove('go'); void patch.offsetWidth; patch.classList.add('go'); grid.classList.add('shake'); setTimeout(() => grid.classList.remove('shake'), 500); P.status('The lights flicker. Back to the tunnel mouth.'); P.wrong({ cost: false, lock: false }); }
  grid.addEventListener('click', e => {
    const t = e.target.closest('.tile'); if (!t) return; const r = +t.dataset.r, c = +t.dataset.c, n = path.length, last = path[n - 1];
    const ok = cfg.grid[r][c] === cfg.order[n] && (n === 0 ? r === 0 : (Math.abs(last[0] - r) + Math.abs(last[1] - c) === 1 && !path.some(p => p[0] === r && p[1] === c)));
    if (!ok) { fail(); return; } path.push([r, c]); sfx('tile'); mark(); P.status(`Step ${path.length} of ${cfg.order.length}.`);
    if (path.length === cfg.order.length) { if (r === 4) { sfx('chime'); setTimeout(() => P.alive && P.solved(), 600); } else fail(); }
  });
  sa.onclick = () => { path = []; mark(); P.status('Back at the tunnel mouth.'); sfx('click'); };
  rb.onclick = () => card({ title: 'The wall rhyme', html: `<div class="rhymebox">${room.rhyme.map((l, i) => `<div>${i + 1}. ${esc(l)}</div>`).join('')}</div>` });
  P.status(S.veilUntil > S.playTime ? 'Step onto row 1 to begin.' : 'The lights flicker too fast. You cannot make out the tiles.');
};

/* ---------- panel: Room 7 rift ---------- */
PANELS.rift = P => {
  const { cfg, pst, body } = P; const n = cfg.sentences.length;
  if (!S.shuffled) S.shuffled = cfg.sentences.map(s => { const a = [...s.options]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; });
  pst.pick = pst.pick || Array(n).fill(null); pst.ok = pst.ok || Array(n).fill(false);
  const cb = h('button', 'btn alt', 'Open Casebook'); cb.id = 'r7-casebook'; const c0 = h('div', 'center'); c0.appendChild(cb); body.appendChild(c0);
  cb.onclick = () => { P.holder.style.display = 'none'; openBook('pages', () => { if (P.alive) P.holder.style.display = ''; }); };
  const list = h('div'); body.appendChild(list); const chk = h('button', 'btn big', 'Check'); const c = h('div', 'center'); c.appendChild(chk); body.appendChild(c);
  function render() {
    list.innerHTML = ''; cfg.sentences.forEach((s, i) => {
      const e = h('div', 'sent' + (pst.ok[i] ? ' ok' : '')), txt = s.text.replace('___', `<span class="blank">${pst.pick[i] ? esc(pst.pick[i]) : '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}</span>`);
      e.innerHTML = `<div>${i + 1}. ${txt}</div>`; const o = h('div', 'opts'); S.shuffled[i].forEach(opt => { const b = h('button', 'opt' + (pst.pick[i] === opt ? (pst.ok[i] ? ' ok' : ' sel') : ''), esc(opt)); b.onclick = () => { if (pst.ok[i]) return; pst.pick[i] = opt; sfx('click'); render(); }; o.appendChild(b); }); e.appendChild(o); list.appendChild(e);
    });
  }
  const tries = h('div', 'tries'); body.insertBefore(tries, body.firstChild);
  const drawTries = () => { tries.innerHTML = `<span>${esc(G.ui.triesLeft)}</span>` + Array.from({ length: cfg.maxWrong }, (_, i) => `<i class="bulb${i < cfg.maxWrong - (S.riftWrong || 0) ? '' : ' off'}"></i>`).join(''); }; drawTries();
  chk.onclick = () => {
    if (pst.pick.includes(null)) { P.status('Fill every blank first.'); return; }
    const bad = []; cfg.sentences.forEach((s, i) => { if (pst.pick[i] === s.answer) pst.ok[i] = true; else if (!pst.ok[i]) bad.push(i); });
    if (!bad.length) { sfx('unlock'); render(); P.solved(); return; }
    S.riftWrong = (S.riftWrong || 0) + 1; drawTries(); threatHit(S.riftWrong);
    if (S.riftWrong >= cfg.maxWrong) { chk.disabled = true; addSignalSilentLoss(); setTimeout(() => timeUp('loseStatic'), 2600); return; }
    render(); $$('.sent', list).forEach((e, i) => { if (bad.includes(i)) e.classList.add('bad'); }); setTimeout(() => { bad.forEach(i => pst.pick[i] = null); if (P.alive) render(); }, 700); P.wrong();
  };
  render();
};


function addSignalSilentLoss() { addSignal(G.config.signal.wrong); }
