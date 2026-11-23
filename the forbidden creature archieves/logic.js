/* Pure puzzle logic. Used by the game (browser) and tools/solvability_test.js (node). No DOM, no text. */
(function (root) {
  const L = {};

  /* R4: move every letter k steps back (A with k=7 becomes T). */
  L.decode = (text, k) => text.replace(/[A-Z]/g, c => String.fromCharCode(((c.charCodeAt(0) - 65 - k) % 26 + 26) % 26 + 65));

  /* R3: rows = ["...#.", ...]. baits = [[row, col]] (1-based). Returns {ok, path, pouch, fail}. */
  L.lureSim = function (rows, baits) {
    const R = rows.length, C = rows[0].length, key = (r, c) => r + ',' + c;
    const counters = new Set(); let start, cage;
    rows.forEach((s, i) => [...s].forEach((ch, j) => {
      if (ch === '#') counters.add(key(i + 1, j + 1));
      if (ch === 'P') start = [i + 1, j + 1];
      if (ch === 'C') cage = [i + 1, j + 1];
    }));
    let pos = start, remaining = baits.map(b => b.slice()), pouch = 0; const path = [];
    for (let guard = 0; guard < 10; guard++) {
      const dist = new Map([[key(...pos), 0]]), prev = new Map(), q = [pos];
      for (let h = 0; h < q.length; h++) {
        const [r, c] = q[h];
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nr = r + dr, nc = c + dc, k = key(nr, nc);
          if (nr < 1 || nc < 1 || nr > R || nc > C || counters.has(k) || dist.has(k)) continue;
          dist.set(k, dist.get(key(r, c)) + 1); prev.set(k, [r, c]); q.push([nr, nc]);
        }
      }
      const targets = remaining.map(b => ({ p: b, cage: false })).concat([{ p: cage, cage: true }])
        .filter(t => dist.has(key(...t.p)));
      if (!targets.length) return { ok: false, path, pouch, fail: 'stuck' };
      targets.sort((a, b) => dist.get(key(...a.p)) - dist.get(key(...b.p)) || a.p[0] - b.p[0] || a.p[1] - b.p[1]);
      const t = targets[0], steps = [];
      for (let p = t.p; key(...p) !== key(...pos); p = prev.get(key(...p))) steps.unshift(p);
      steps.forEach(s => path.push(s));
      if (t.cage) return pouch >= 3 && !remaining.length ? { ok: true, path, pouch } : { ok: false, path, pouch, fail: 'early' };
      pouch++; remaining = remaining.filter(b => key(...b) !== key(...t.p)); pos = t.p;
    }
    return { ok: false, path, pouch, fail: 'stuck' };
  };
  L.lureFree = rows => { const f = []; rows.forEach((s, i) => [...s].forEach((ch, j) => { if (ch === '.') f.push([i + 1, j + 1]); })); return f; };

  /* R5: union of A (fixed), B shifted right by offB, C shifted down by offC (wrapping). Grids are arrays of strings. */
  L.overlay = function (A, B, C, offB, offC) {
    const n = A.length, out = [];
    for (let r = 0; r < n; r++) { let row = ''; for (let c = 0; c < n; c++) {
      const on = A[r][c] === '#' || B[r][((c - offB) % n + n) % n] === '#' || C[((r - offC) % n + n) % n][c] === '#';
      row += on ? '#' : '.'; } out.push(row); }
    return out;
  };

  /* R6: table[angleIndex][lampIndex] = shadow id. */
  L.shadowAt = (table, angle, lamp) => table[angle][lamp];

  /* R7A: layout[pos] = rope id, positions 0..7 around the ring. Two ropes cross when their ends alternate. */
  L.crossings = function (layout) {
    const ends = {};
    layout.forEach((rope, pos) => (ends[rope] = ends[rope] || []).push(pos));
    const ropes = Object.keys(ends); let n = 0;
    for (let i = 0; i < ropes.length; i++) for (let j = i + 1; j < ropes.length; j++) {
      const [p, q] = ends[ropes[i]], [r, s] = ends[ropes[j]];
      if ((p < r && r < q && q < s) || (r < p && p < s && s < q)) n++;
    }
    return n;
  };
  L.crossingRopes = function (layout) {
    const ends = {}; layout.forEach((rope, pos) => (ends[rope] = ends[rope] || []).push(pos));
    const ids = Object.keys(ends), hit = new Set();
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const [p, q] = ends[ids[i]], [r, s] = ends[ids[j]];
      if ((p < r && r < q && q < s) || (r < p && p < s && s < q)) { hit.add(ids[i]); hit.add(ids[j]); }
    }
    return hit;
  };
  L.swapAdjacent = (layout, i) => { const a = layout.slice(), j = (i + 1) % a.length; [a[i], a[j]] = [a[j], a[i]]; return a; };

  /* R7B */
  L.proofOk = (picked, answer) => picked.length === answer.length && answer.every(n => picked.includes(n));

  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.Logic = L;
})(typeof self !== 'undefined' ? self : this);
