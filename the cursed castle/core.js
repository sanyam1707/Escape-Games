// core.js: pure game logic with no DOM. Shared by the browser (game.js) and tools/solvability_test.js (node).
(function (root) {
  const KINDS = ['FIND', 'LEARN', 'PANEL', 'AUTO'];
  const DIRS = { right: [0, 1], left: [0, -1], up: [-1, 0], down: [1, 0] };

  // ---- Room 2 code: the digits read in age order -------------------------------------------
  function room2Code(room) {
    const digit = {}; room.portraits.forEach(p => (digit[p.keeper] = p.digit));
    return room.order.map(k => digit[k]).join('');
  }

  // ---- Room 6 Light Table -------------------------------------------------------------------
  // State of a mirror: 0 slash, 1 backslash, 2 and 3 edge-on (beam passes straight through).
  const SLASH = { right: 'up', up: 'right', left: 'down', down: 'left' };
  const BACK = { right: 'down', down: 'right', left: 'up', up: 'left' };
  function traceBeam(L, states) {
    let r = L.source.row, c = -1, dir = 'right'; const path = [];
    for (let i = 0; i < 80; i++) {
      r += DIRS[dir][0]; c += DIRS[dir][1];
      if (r < 0 || c < 0 || r >= L.size || c >= L.size) {
        const hit = (L.crystal.side === 'top' && dir === 'up' && c === L.crystal.index && r < 0) ||
                    (L.crystal.side === 'right' && dir === 'right' && r === L.crystal.index && c >= L.size);
        return { path, hit, dir };
      }
      path.push([r, c]);
      const m = L.mirrors.findIndex(q => q.r === r && q.c === c);
      if (m >= 0 && states[m] === 0) dir = SLASH[dir];
      else if (m >= 0 && states[m] === 1) dir = BACK[dir];
    }
    return { path, hit: false, dir };
  }
  function lightSolutions(L) {
    const out = [], n = L.mirrors.length;
    for (let k = 0; k < 4 ** n; k++) {
      const s = []; for (let i = 0, x = k; i < n; i++, x = Math.floor(x / 4)) s.push(x % 4);
      if (traceBeam(L, s).hit) out.push(s);
    }
    return out;
  }

  // ---- Expected answers (derived from the data, so the story and the check never drift apart) ----
  function expectedAnswer(data, room, panel) {
    if (panel.answerFrom === 'room2') return room2Code(room);
    if (panel.answerFrom && panel.answerFrom.startsWith('stars:')) return data.clues[panel.answerFrom.slice(6)].visual.stars.map(s => s.n).join('');
    if (panel.answer !== undefined) return String(panel.answer);
    return null;
  }
  function bookWord(data, panel) {
    return panel.letters.books.map(id => data.clues[id].text.trim()[0]).join('').toUpperCase();
  }

  // ---- Flags: what a hotspot sets when done -------------------------------------------------
  function flagsOf(data, h) {
    const f = [h.id, ...(h.emits || [])];
    if (h.give) f.push(h.give);
    if (h.then && h.then.give) f.push(h.then.give);
    for (const a of h.auto || []) { if (a.give) f.push(a.give); if (a.emit) f.push(a.emit); }
    return f;
  }
  function panelEmits(data, h) {
    const p = h.panel && data.panels[h.panel];
    return p ? p.emits || [] : [];
  }

  // ---- validate(): fail loudly on bad ids, bad `after`, cycles, missing text ----------------
  function validate(data) {
    const E = [];
    const need = (ok, msg) => { if (!ok) E.push(msg); };
    const text = (v, where) => need(typeof v === 'string' && v.trim().length > 0, 'missing text: ' + where);
    need(Array.isArray(data.rooms) && data.rooms.length === 7, 'game.json must have exactly 7 rooms');
    for (const k of ['clues', 'items', 'dialogues', 'panels', 'speakers', 'ui']) need(data[k] && typeof data[k] === 'object', 'missing section: ' + k);
    if (E.length) return E;

    for (const [k, d] of Object.entries(data.dialogues)) {
      need(Array.isArray(d) && d.length > 0 && d.length <= 4, `dialogue ${k}: needs 1 to 4 lines`);
      (d || []).forEach((l, i) => { need(data.speakers[l.speaker], `dialogue ${k}[${i}]: unknown speaker ${l.speaker}`); text(l.text, `dialogue ${k}[${i}].text`); });
    }
    for (const [k, c] of Object.entries(data.clues)) { text(c.title, `clue ${k}.title`); text(c.text, `clue ${k}.text`); }
    for (const [k, i] of Object.entries(data.items)) { text(i.name, `item ${k}.name`); text(i.purpose, `item ${k}.purpose`); text(i.text, `item ${k}.text`); }
    (data.timedDialogues || []).forEach(k => need(data.dialogues[k], 'timedDialogues: unknown dialogue ' + k));
    const dlg = (k, w) => { if (k !== undefined) need(data.dialogues[k], `${w}: unknown dialogue ${k}`); };
    for (const [k, p] of Object.entries(data.panels)) {
      text(p.title, `panel ${k}.title`);
      (p.wrong || []).forEach(d => dlg(d, `panel ${k}.wrong`)); dlg(p.right, `panel ${k}.right`);
      if (p.type === 'choice') { need(p.choices && p.choices.includes(p.answer), `panel ${k}: answer not among choices`); text(p.prompt, `panel ${k}.prompt`); }
    }

    const roomIds = new Set();
    data.rooms.forEach((room, ri) => {
      const rw = 'room ' + (room.id || ri);
      need(room.id && !roomIds.has(room.id), rw + ': bad or duplicate id'); roomIds.add(room.id);
      text(room.title, rw + '.title'); text(room.lesson, rw + '.lesson'); text(room.panorama, rw + '.panorama');
      text(room.objective && room.objective.card, rw + '.objective.card'); text(room.objective && room.objective.hud, rw + '.objective.hud');
      dlg(room.enter, rw + '.enter'); dlg(room.complete, rw + '.complete');
      need(room.seal && data.items[room.seal.item], rw + ': seal.item must be an item');
      need(ri === 0 || (room.back && typeof room.back.yaw === 'number'), rw + ': rooms after the first need a back door position');
      need((room.hints || []).length === 2, rw + ': needs exactly 2 hints');
      (room.hints || []).forEach((h, i) => dlg(h.say, `${rw} hint ${i + 1}`));

      if (room.portraits) {
        const byAge = [...room.portraits].sort((a, b) => a.age - b.age).map(p => p.keeper).join();
        need(byAge === room.order.join(), rw + ': order must be youngest to oldest by age (' + byAge + ')');
        need(room.portraits.length === 4 && new Set(room.portraits.map(p => p.digit)).size === 4, rw + ': 4 portraits with different digits');
        room.hotspots.filter(h => h.portrait).forEach(h => need(room.portraits.some(p => p.id === h.portrait), rw + ': unknown portrait ' + h.portrait));
      }
      const hs = room.hotspots || [], ids = new Set(), provider = {};
      hs.forEach(h => {
        need(h.id && !ids.has(h.id), `${rw}: duplicate hotspot id ${h.id}`); ids.add(h.id);
        need(KINDS.includes(h.kind), `${rw}/${h.id}: bad kind ${h.kind}`);
        need(typeof h.yaw === 'number' && typeof h.pitch === 'number', `${rw}/${h.id}: yaw/pitch must be numbers`);
        if (h.panel) need(data.panels[h.panel], `${rw}/${h.id}: unknown panel ${h.panel}`);
        if (h.clue) need(data.clues[h.clue], `${rw}/${h.id}: unknown clue ${h.clue}`);
        [h.give, h.then && h.then.give].forEach(i => i && need(data.items[i], `${rw}/${h.id}: unknown item ${i}`));
        dlg(h.say, `${rw}/${h.id}.say`); h.then && dlg(h.then.say, `${rw}/${h.id}.then.say`);
        for (const a of h.auto || []) { dlg(a.say, `${rw}/${h.id}.auto`); a.give && need(data.items[a.give], `${rw}/${h.id}: unknown item ${a.give}`); }
        need(h.kind !== 'LEARN' || h.clue || h.say, `${rw}/${h.id}: LEARN needs a clue or say`);
        need(h.kind !== 'FIND' || h.give, `${rw}/${h.id}: FIND needs give`);
        need(h.kind !== 'PANEL' || h.panel || h.order, `${rw}/${h.id}: PANEL needs panel or order`);
        need(h.kind !== 'AUTO' || (h.auto || []).length, `${rw}/${h.id}: AUTO needs auto steps`);
        for (const f of [...flagsOf(data, h), ...panelEmits(data, h), ...(h.order ? [h.order.event] : [])]) provider[f] = h.id;
        if (h.order) { need(h.order.seq.every(s => hs.some(q => q.id === s)), `${rw}/${h.id}: order.seq has unknown ids`); dlg(h.order.wrongSay, h.id); dlg(h.order.rightSay, h.id); }
      });
      const evs = room.events || [];
      evs.forEach(e => { provider[e.id] = '#' + e.id; need(e.allOf.every(a => ids.has(a)), `${rw}: event ${e.id} allOf has unknown ids`); dlg(e.say, `${rw} event ${e.id}`); });
      // `after` must name something that can be set; the dependency graph must not loop
      const deps = {};
      hs.forEach(h => { deps[h.id] = (h.after || []).map(a => { need(provider[a], `${rw}/${h.id}: after "${a}" is never set`); return provider[a]; }).filter(Boolean); });
      evs.forEach(e => (deps['#' + e.id] = e.allOf));
      const state = {};
      const visit = (n, trail) => {
        if (state[n] === 2) return; if (state[n] === 1) { need(false, `${rw}: cycle ${[...trail, n].join(' -> ')}`); return; }
        state[n] = 1; (deps[n] || []).forEach(d => visit(d, [...trail, n])); state[n] = 2;
      };
      Object.keys(deps).forEach(n => visit(n, []));
      const sealers = hs.filter(h => (h.auto || []).some(a => a.seal));
      need(sealers.length === 1, `${rw}: exactly one AUTO hotspot must award the seal`);
    });
    return E;
  }

  // ---- simulate(): play the whole chain with the correct answers; list anything unreachable ----
  function simulate(data) {
    const log = [], E = [];
    for (const room of data.rooms) {
      const done = new Set(), hs = room.hotspots; let guard = 0, sealed = false;
      const evs = () => (room.events || []).forEach(e => e.allOf.every(a => done.has(a)) && done.add(e.id));
      const tap = h => {
        done.add(h.id); flagsOf(data, h).forEach(f => done.add(f));
        if (h.panel) {
          const p = data.panels[h.panel], w = room.id + '/' + h.id;
          if (p.type === 'choice') need2(p.choices.includes(p.answer), w + ' choice answer');
          if (p.type === 'dial') { const a = expectedAnswer(data, room, p); need2(a && a.length === p.count && [...a].every(d => +d >= p.min && +d <= p.max), w + ` dial answer ${a} out of range`); }
          if (p.type === 'letters') { const wd = bookWord(data, p); need2(wd === p.word.toUpperCase(), w + ` letters give ${wd}, panel says ${p.word}`); need2(p.symbols.includes(p.symbol), w + ' symbol'); }
          if (p.type === 'cauldron') need2(p.seq.every(b => p.bottles.includes(b)) && !p.seq.includes(p.decoy), w + ' cauldron seq');
          if (p.type === 'lighttable') {
            const s = lightSolutions(p.layout), t = s[0] && traceBeam(p.layout, s[0]);
            need2(s.length === 1, w + ` light table has ${s.length} solutions, must be exactly 1`);
            need2(s[0] && s[0].every(x => x < 2) && s[0].includes(0) && s[0].includes(1), w + ' solution must use both slash and backslash');
            need2(t && new Set(t.path.map(q => q + '')).size >= 10, w + ' beam path shorter than 10 squares');
          }
          if (p.type === 'seals') need2(p.slots.length === 6 && new Set(p.slots).size === 6 && p.slots.every(s => data.items[s]), w + ' seal slots');
          (p.emits || []).forEach(f => done.add(f));
        }
        if (h.order) h.order.seq.every(s => done.has(s)) && done.add(h.order.event);
        (h.auto || []).forEach(a => a.seal && (sealed = true));
        evs(); log.push(room.id + ': ' + h.id);
      };
      const need2 = (ok, msg) => { if (!ok) E.push(msg); };
      while (guard++ < 100) {
        const next = hs.find(h => !done.has(h.id) && (h.after || []).every(a => done.has(a)));
        if (!next) break; tap(next);
      }
      const stuck = hs.filter(h => !done.has(h.id)).map(h => h.id);
      if (stuck.length) E.push(`${room.id}: unreachable hotspots: ${stuck.join(', ')}`);
      if (!sealed) E.push(`${room.id}: seal never awarded`);
    }
    return { log, errors: E };
  }

  const api = { KINDS, room2Code, traceBeam, lightSolutions, expectedAnswer, bookWord, flagsOf, panelEmits, validate, simulate };
  if (typeof module !== 'undefined') module.exports = api; else root.Core = api;
})(typeof window !== 'undefined' ? window : globalThis);
