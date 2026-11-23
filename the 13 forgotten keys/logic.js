/* Pure game logic: validation and puzzle rules. Works in the browser (window.Logic) and in node (require). No DOM here. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Logic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------- validate ----------
  function validate(g) {
    const errors = [];
    const err = (m) => errors.push(m);
    const chars = g.characters || {};
    const keyIds = new Set((g.keys || []).map((k) => k.id));
    if (keyIds.size !== 13) err("expected 13 keys, found " + keyIds.size);
    const itemIds = new Set(Object.keys(g.items || {}));
    const allIds = new Set();
    const checkLines = (lines, where) => {
      (lines || []).forEach((l, i) => {
        if (typeof l.pausesTimer !== "boolean") err(where + "[" + i + "] missing pausesTimer");
        if (!chars[l.speaker]) err(where + "[" + i + "] unknown speaker " + l.speaker);
        if (!l.text) err(where + "[" + i + "] empty text");
        if (chars[l.speaker] && chars[l.speaker].moods && !chars[l.speaker].moods.includes(l.mood)) err(where + "[" + i + "] mood '" + l.mood + "' not valid for " + l.speaker);
      });
    };
    checkLines(g.opening, "opening");
    checkLines(g.idle, "idle");
    Object.entries(g.flashbacks || {}).forEach(([k, f]) => checkLines(f.lines, "flashback." + k));
    Object.entries(g.endings || {}).forEach(([k, e]) => checkLines(e.lines, "ending." + k));
    (g.rooms || []).forEach((room, ri) => {
      const ids = new Set(room.hotspots.map((h) => h.id));
      Object.entries(room.dialogue).forEach(([k, lines]) => checkLines(lines, room.id + ".dialogue." + k));
      room.hotspots.forEach((h) => {
        if (allIds.has(h.id)) err("duplicate hotspot id " + h.id);
        allIds.add(h.id);
        (h.after || []).forEach((a) => { if (!ids.has(a)) err(h.id + ": after refers to unknown id " + a); });
        (h.then || []).forEach((t) => { if (!room.dialogue[t]) err(h.id + ": then refers to unknown dialogue " + t); });
        if (h.right && !room.dialogue[h.right]) err(h.id + ": unknown right group " + h.right);
        if (h.final && !h.right) err(h.id + ": final puzzle needs a right group");
        if (h.item && !itemIds.has(h.item)) err(h.id + ": unknown item " + h.item);
        if (h.key && !keyIds.has(h.key)) err(h.id + ": unknown key " + h.key);
        [].concat(h.needs || []).forEach((n) => { if (!itemIds.has(n) && !keyIds.has(n)) err(h.id + ": unknown needs " + n); });
        if (h.combine) [h.combine.hold, h.combine.target].forEach((n) => { if (!itemIds.has(n) && !keyIds.has(n)) err(h.id + ": unknown combine " + n); });
        if (h.goto != null && !g.rooms[h.goto]) err(h.id + ": goto room " + h.goto + " does not exist");
        if (h.puzzle && !g.puzzles[h.puzzle]) err(h.id + ": unknown puzzle " + h.puzzle);
        if (h.wrongKey) for (let i = 1; i <= 3; i++) if (!room.dialogue[h.wrongKey + i]) err(h.id + ": missing " + h.wrongKey + i);
        if (!["FIND", "LEARN", "INSPECT", "USE", "PANEL", "AUTO"].includes(h.kind)) err(h.id + ": bad kind " + h.kind);
        if (h.kind === "FIND" && !h.item && !h.key) err(h.id + ": FIND needs item or key");
        if (h.kind === "LEARN" && !h.note) err(h.id + ": LEARN needs note");
        if (typeof h.yaw !== "number" || typeof h.pitch !== "number") err(h.id + ": yaw/pitch must be numbers");
      });
      for (let i = 1; i <= 3; i++) if (!room.dialogue["hint" + i]) err(room.id + ": missing hint" + i);
      if (!room.dialogue.enter) err(room.id + ": missing enter dialogue");
      // cycle check (DFS over `after`)
      const byId = Object.fromEntries(room.hotspots.map((h) => [h.id, h]));
      const state = {};
      const visit = (id, path) => {
        if (state[id] === 2) return;
        if (state[id] === 1) { err("cycle in after: " + path.concat(id).join(" > ")); return; }
        state[id] = 1;
        ((byId[id] || {}).after || []).forEach((a) => byId[a] && visit(a, path.concat(id)));
        state[id] = 2;
      };
      room.hotspots.forEach((h) => visit(h.id, []));
    });
    return errors;
  }

  // ---------- Room 1: pins ----------
  function permutations(arr) {
    if (arr.length <= 1) return [arr.slice()];
    const out = [];
    arr.forEach((x, i) => permutations(arr.slice(0, i).concat(arr.slice(i + 1))).forEach((p) => out.push([x].concat(p))));
    return out;
  }
  function pinsOk(guess, P) { return guess.length === P.answer.length && guess.every((v, i) => v === P.answer[i]); }
  function pinsSolutions(P) {
    return permutations([1, 2, 3, 4, 5]).filter((p) =>
      Object.entries(P.evidence).every(([pos, h]) => p[+pos - 1] === h) && (!P.middleTallest || p[2] === 5));
  }

  // ---------- Room 2: filing ----------
  function filingOk(filed, F) {
    const a = [...new Set(filed)].sort((x, y) => x - y);
    return a.length === F.answer.length && a.every((v, i) => v === F.answer[i]);
  }
  function filingSolutions(F) {
    const blocked = new Set([].concat(...F.plates));
    const set = [];
    for (let t = 1; t <= F.teeth; t++) if (blocked.has(t) && t !== F.thumb) set.push(t);
    return [set]; // the only rule-following answer: file exactly the blocked teeth
  }

  // ---------- Room 3: seats ----------
  function seatsOk(assign, S) { return Object.entries(S.answer).every(([g, c]) => assign[g] === c); }
  function seatsSatisfy(assign, cons) {
    return cons.every((c) => {
      if (c[0] === "at") return assign[c[1]] === c[2];
      if (c[0] === "beside") return Math.abs(assign[c[1]] - assign[c[2]]) === 1;
      if (c[0] === "nearer") return assign[c[1]] < assign[c[2]];
      return false;
    });
  }
  function seatsSolutions(S) {
    const ids = S.guests.map((g) => g.id);
    return permutations([1, 2, 3, 4, 5]).map((p) => Object.fromEntries(ids.map((id, i) => [id, p[i]]))).filter((a) => seatsSatisfy(a, S.constraints));
  }

  // ---------- Room 4: levers (1 = up) ----------
  function leverPress(levers, i) {
    const n = levers.slice();
    [i - 1, i, i + 1].forEach((j) => { if (j >= 0 && j < n.length) n[j] = n[j] ? 0 : 1; });
    return n;
  }
  const leversWon = (l) => l.every((v) => v === 1);
  function leverSolutions(L) {
    const sols = [];
    for (let mask = 0; mask < 1 << L.start.length; mask++) {
      let s = L.start.slice(); const set = [];
      for (let i = 0; i < L.start.length; i++) if (mask >> i & 1) { s = leverPress(s, i); set.push(i + 1); }
      if (leversWon(s)) sols.push(set);
    }
    return sols;
  }

  // ---------- Room 5: buckets ----------
  // state {a,b}; action: fillA fillB emptyA emptyB pourAB pourBA
  function bucketStep(s, act, B) {
    let { a, b } = s;
    if (act === "fillA") a = B.capA;
    else if (act === "fillB") b = B.capB;
    else if (act === "emptyA") a = 0;
    else if (act === "emptyB") b = 0;
    else if (act === "pourAB") { const m = Math.min(a, B.capB - b); a -= m; b += m; }
    else if (act === "pourBA") { const m = Math.min(b, B.capA - a); b -= m; a += m; }
    return { a, b };
  }
  const bucketWin = (s, B) => s.a === B.target;
  function bucketShortest(B) {
    const acts = ["fillA", "fillB", "emptyA", "emptyB", "pourAB", "pourBA"];
    const seen = new Set(["0,0"]); let q = [{ s: { a: 0, b: 0 }, path: [] }];
    while (q.length) {
      const nq = [];
      for (const { s, path } of q) {
        if (bucketWin(s, B)) return path;
        for (const act of acts) {
          const n = bucketStep(s, act, B), k = n.a + "," + n.b;
          if (!seen.has(k)) { seen.add(k); nq.push({ s: n, path: path.concat(act) }); }
        }
      }
      q = nq;
    }
    return null;
  }

  // ---------- Room 6: cow and bull ----------
  function cowBull(guess, code) {
    let right = 0, wrong = 0;
    guess.forEach((s, i) => { if (s === code[i]) right++; else if (code.includes(s)) wrong++; });
    return { right, wrong };
  }
  function safeSolutions(S) {
    const out = [];
    S.symbols.forEach((a) => S.symbols.forEach((b) => S.symbols.forEach((c) => {
      if (a === b || b === c || a === c) return;
      const code = [a, b, c];
      if (S.cards.every((k) => { const r = cowBull(k.syms, code); return r.right === k.right && r.wrong === k.wrong; })) out.push(code);
    })));
    return out;
  }

  // ---------- Room 7 ----------
  const locksOk = (i, keyId, K) => K.answer[i] === keyId;
  function angDist(yaw, pitch, ty, tp) {
    let dy = Math.abs(((yaw - ty + 540) % 360) - 180);
    return Math.hypot(dy, pitch - tp);
  }

  return { validate, permutations, pinsOk, pinsSolutions, filingOk, filingSolutions, seatsOk, seatsSolutions, seatsSatisfy,
    leverPress, leversWon, leverSolutions, bucketStep, bucketWin, bucketShortest, cowBull, safeSolutions, locksOk, angDist };
});
