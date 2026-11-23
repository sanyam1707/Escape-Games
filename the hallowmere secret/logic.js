/* Pure logic shared by the game (browser) and tools/solvability_test.js (node). No DOM here. */
(function (root) {
  'use strict';

  // Returns a list of problems found in game.json (empty list = fine).
  function validate(g) {
    var errs = [], itemIds = g.items || {}, noteIds = g.notes || {};
    var fn = function (m) { errs.push(m); };
    if (!g.config || !(g.config.timerSeconds > 0)) fn('config.timerSeconds missing');
    (g.rooms || []).forEach(function (r) {
      var ids = {}, byId = {};
      (r.hotspots || []).forEach(function (h) {
        if (ids[h.id]) fn(r.id + ': duplicate hotspot ' + h.id);
        ids[h.id] = true; byId[h.id] = h;
      });
      (r.hotspots || []).forEach(function (h) {
        (h.after || []).forEach(function (a) { if (!ids[a]) fn(r.id + '/' + h.id + ': after "' + a + '" does not exist'); });
        (h.give || []).forEach(function (i) { if (!itemIds[i]) fn(r.id + '/' + h.id + ': unknown item ' + i); });
        if (h.use && h.use.item && !itemIds[h.use.item]) fn(r.id + '/' + h.id + ': unknown use item ' + h.use.item);
        if (h.kind !== 'AUTO' && h.kind !== 'FIND' && h.yaw === undefined) fn(r.id + '/' + h.id + ': no yaw/pitch');
        if (h.kind === 'PANEL' && !(g.panels || {})[h.panel]) fn(r.id + '/' + h.id + ': unknown panel ' + h.panel);
        if (typeof h.note === 'string' && !noteIds[h.note]) fn(r.id + '/' + h.id + ': unknown note ' + h.note);
        if (h.reward && h.reward.casePage && !g.casePages[h.reward.casePage - 1]) fn(r.id + '/' + h.id + ': no case page ' + h.reward.casePage);
        if (h.mark && !(g.markInfo || {})[h.mark]) fn(r.id + '/' + h.id + ': unknown mark ' + h.mark);
        if (h.kind === 'PANEL' && h.wrongBank && h.wrongBank.length !== 3) fn(r.id + '/' + h.id + ': wrongBank needs 3 entries');
        ((h.inspect || {}).details || []).forEach(function (d) {
          if (typeof d.note === 'string' && !noteIds[d.note]) fn(r.id + '/' + h.id + ': unknown note ' + d.note);
        });
      });
      // cycle check (depth first)
      var state = {};
      (function visit(id, trail) {
        if (!byId[id]) return;
        if (state[id] === 1) { fn(r.id + ': cycle through ' + trail.concat(id).join(' > ')); return; }
        if (state[id] === 2) return;
        state[id] = 1;
        (byId[id].after || []).forEach(function (a) { visit(a, trail.concat(id)); });
        state[id] = 2;
      });
      Object.keys(byId).forEach(function (id) { if (!state[id]) (function v(x, t) {
        if (!byId[x]) return; if (state[x] === 1) { fn(r.id + ': cycle through ' + t.concat(x).join(' > ')); return; }
        if (state[x] === 2) return; state[x] = 1;
        (byId[x].after || []).forEach(function (a) { v(a, t.concat(x)); }); state[x] = 2; })(id, []); });
    });
    return errs;
  }

  // Lever puzzle: apply a sequence of lever ids, return the water level or 'splash'.
  function leverRun(p, seq) {
    var w = p.start, d = {};
    p.levers.forEach(function (l) { d[l.id] = l.d; });
    for (var i = 0; i < seq.length; i++) {
      w += d[seq[i]];
      if (w > p.max) return 'splash';
      if (w < p.min) return 'splash'; // below zero fails too, otherwise C,A,B would also reach 5
    }
    return w;
  }

  // Tile puzzle: the rule for the next tile. Path of [row, col]; returns true if the step is on the safe path.
  function tileStepOk(p, step, cell) { return !!p.path[step] && p.path[step][0] === cell[0] && p.path[step][1] === cell[1]; }

  // Every walk of 'pulls' length that ends exactly on target.
  function leverSolutions(p) {
    var out = [], ids = p.levers.map(function (l) { return l.id; });
    (function go(seq) {
      if (seq.length === p.pulls) { if (leverRun(p, seq) === p.target) out.push(seq.join('')); return; }
      ids.forEach(function (i) { go(seq.concat(i)); });
    })([]);
    return out;
  }

  // Every orthogonal path from the near row to a key tile where the symbols follow the poem. Used to prove uniqueness.
  function tilePaths(p) {
    var grid = p.grid, rows = grid.length, cols = grid[0].length;
    var seqs = [['raven'], ['thorn'], ['moon'], ['star', 'key']]; // poem: raven, thorn, moon, star beside a key
    var found = [];
    function go(path, stage) {
      var last = path[path.length - 1];
      if (stage === 3) { // at the star: must be beside a key (and then step onto the key)
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          var r = last[0] + d[0], c = last[1] + d[1];
          if (r >= 0 && r < rows && c >= 0 && c < cols && grid[r][c] === 'key') found.push(path.concat([[r, c]]).map(function (x) { return x.join(','); }).join(' '));
        });
        return;
      }
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var r = last[0] + d[0], c = last[1] + d[1];
        if (r < 0 || r >= rows || c < 0 || c >= cols) return;
        if (path.some(function (x) { return x[0] === r && x[1] === c; })) return;
        if (grid[r][c] === seqs[stage + 1][0]) go(path.concat([[r, c]]), stage + 1);
      });
    }
    for (var c = 0; c < cols; c++) if (grid[0][c] === 'raven') go([[0, c]], 0);
    return found;
  }

  var api = { validate: validate, leverRun: leverRun, leverSolutions: leverSolutions, tileStepOk: tileStepOk, tilePaths: tilePaths };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Logic = api;
})(typeof window !== 'undefined' ? window : this);
