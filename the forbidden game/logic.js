// Pure puzzle rules, shared by the browser (game.js / panels.js) and tools/solvability_test.js. No DOM here.
(function (root) {
  const L = {};
  const STEP = { E: [1, 0], S: [0, 1], W: [-1, 0], N: [0, -1] };
  // Room 4: follow the beam from the left edge of the entry row. set = {A:'back'|'slash', ...}
  L.beam = (p, set) => {
    let col = 1, row = p.entry.row, dir = p.entry.dir; const path = [];
    for (let i = 0; i < 64; i++) {
      path.push({ col, row, dir });
      if (col === p.stone.col && row === p.stone.row) return { path, hit: true };
      const m = p.mirrors.find(m => m.col === col && m.row === row);
      if (m) dir = p.turns[dir][set[m.id]];
      col += STEP[dir][0]; row += STEP[dir][1];
      if (col < 1 || col > p.cols || row < 1 || row > p.rows) return { path, hit: false };
    }
    return { path, hit: false };
  };
  L.jigsawOk = (p, placed) => p.order.every((a, i) => placed[i] === a);
  L.moveOk = (p, sq) => sq === p.target;
  L.plankOk = (p, row, plank) => p.safe[row] === plank;
  L.rhythmOk = (p, round, idx, drum) => p.rounds[round][idx] === drum;
  L.decodeOk = (p, letters) => letters.join("") === p.glyphs.map(g => p.key[g]).join("");
  L.herbOk = (p, idx, herb) => p.order[idx] === herb;
  L.tileOk = (p, blank, tile) => p.blanks[blank].tile === tile;
  L.clampPips = n => Math.max(0, n);
  L.visible = (h, done) => h.after.every(a => done.has(a));
  root.GameLogic = L;
  if (typeof module !== "undefined") module.exports = L;
})(typeof window !== "undefined" ? window : globalThis);
