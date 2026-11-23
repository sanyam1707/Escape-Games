/* Pure game logic shared by the browser (game.js) and the node checks (tools/solvability_test.js). No DOM here. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Logic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- config check ---------- */
  function validate(cfg) {
    var errs = [];
    var err = function (m) { errs.push(m); };
    cfg.rooms.forEach(function (room) {
      var ids = {};
      room.hotspots.forEach(function (h) { if (ids[h.id]) err('duplicate hotspot ' + h.id); ids[h.id] = h; });
      room.hotspots.forEach(function (h) {
        (h.after || []).forEach(function (a) { if (!ids[a]) err(h.id + ' waits for unknown ' + a); });
        if (h.card && !cfg.cards[h.card]) err(h.id + ' unknown card ' + h.card);
        if (h.say && !cfg.dialogue[h.say]) err(h.id + ' unknown line ' + h.say);
        if (h.need && !cfg.items[h.need] && h.need !== 'eclipse_seal') err(h.id + ' unknown item ' + h.need);
        if (h.item && !cfg.items[h.item]) err(h.id + ' unknown item ' + h.item);
        // cycle check by walking the "after" chain
        var seen = {}, stack = [h.id];
        while (stack.length) {
          var cur = stack.pop();
          (ids[cur] ? ids[cur].after || [] : []).forEach(function (a) {
            if (a === h.id) err('cycle through ' + h.id);
            if (!seen[a]) { seen[a] = 1; stack.push(a); }
          });
        }
      });
      var lines = [].concat(room.enter, room.discuss, room.wrong, room.right, room.idle);
      lines.forEach(function (l) { if (!cfg.dialogue[l]) err(room.id + ' unknown line ' + l); });
      if (!cfg.puzzles[room.puzzle]) err(room.id + ' unknown puzzle');
      if (room.hints.length !== cfg.config.hintsPerRoom) err(room.id + ' needs ' + cfg.config.hintsPerRoom + ' hints');
      var finds = room.hotspots.filter(function (h) { return h.kind === 'FIND'; }).length;
      var insp = room.hotspots.filter(function (h) { return h.kind === 'INSPECT'; }).length;
      if (finds !== 3 || insp !== 1) err(room.id + ' needs 3 FIND and 1 INSPECT, has ' + finds + '/' + insp);
    });
    Object.keys(cfg.dialogue).forEach(function (k) {
      if (!cfg.speakers[cfg.dialogue[k].s]) err(k + ' unknown speaker');
      if (typeof cfg.dialogue[k].pt !== 'boolean') err(k + ' missing pt flag');
    });
    return errs;
  }

  /* ---------- puzzles ---------- */
  function checkLotus(p, board) { // board: 4 strings of A/W/E/F/. ; true when every row and column holds each element once and givens are kept
    for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) {
      var g = p.given[r][c]; if (g !== '.' && board[r][c] !== g) return false;
    }
    for (var i = 0; i < 4; i++) {
      var row = {}, col = {};
      for (var j = 0; j < 4; j++) {
        row[board[i][j]] = 1; col[board[j][i]] = 1;
      }
      if (Object.keys(row).length !== 4 || Object.keys(col).length !== 4 || row['.'] || col['.']) return false;
    }
    return true;
  }

  function traceBeam(p, states) { // states: '/' or '\' per mirror. Returns {path, hit}
    var mir = {};
    p.mirrors.forEach(function (m, i) { mir[m[0] + ',' + m[1]] = states[i]; });
    var r = p.lens[0], c = p.lens[1], d = [0, 1], path = [[r, c]]; // [dr, dc], start heading right
    for (var step = 0; step < 60; step++) {
      r += d[0]; c += d[1];
      if (r < 1 || c < 1 || r > p.size || c > p.size) return { path: path, hit: false };
      path.push([r, c]);
      if (r === p.crystal[0] && c === p.crystal[1]) return { path: path, hit: true };
      var m = mir[r + ',' + c];
      if (m === '/') d = [-d[1], -d[0]];       // right->up, up->right, left->down, down->left
      else if (m === '\\') d = [d[1], d[0]];   // right->down, down->right, left->up, up->left
    }
    return { path: path, hit: false };
  }

  function checkMoons(p, sel) { return p.answer.every(function (a, i) { return sel[i] === a; }); }
  function moonLevel(p, phase) { return p.levels[p.phases.indexOf(phase)]; }

  /* ---------- gestures: input is strokes, each stroke = [{x,y,t}, ...] ---------- */
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function pathLen(pts) { var s = 0; for (var i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]); return s; }
  function swept(pts) { // total turned angle in degrees around the centroid
    var cx = 0, cy = 0; pts.forEach(function (p) { cx += p.x; cy += p.y; }); cx /= pts.length; cy /= pts.length;
    var tot = 0, prev = Math.atan2(pts[0].y - cy, pts[0].x - cx);
    for (var i = 1; i < pts.length; i++) {
      var a = Math.atan2(pts[i].y - cy, pts[i].x - cx), d = a - prev;
      while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      tot += d; prev = a;
    }
    return Math.abs(tot) * 180 / Math.PI;
  }
  function revs(v, T) { // direction changes of a value series, ignoring wiggles smaller than T
    var dir = 0, ext = v[0], n = 0;
    for (var i = 1; i < v.length; i++) {
      var x = v[i];
      if (dir >= 0 && x > ext) { ext = x; dir = 1; }
      else if (dir <= 0 && x < ext) { ext = x; dir = -1; }
      else if (dir === 1 && ext - x >= T) { n++; dir = -1; ext = x; }
      else if (dir === -1 && x - ext >= T) { n++; dir = 1; ext = x; }
    }
    return n;
  }
  function rdp(pts, eps) { // Ramer-Douglas-Peucker: keeps only the real corners of a stroke
    if (pts.length < 3) return pts;
    var a = pts[0], b = pts[pts.length - 1], best = 0, at = 0, len = dist(a, b);
    for (var i = 1; i < pts.length - 1; i++) {
      var d = len < 1 ? dist(a, pts[i]) : Math.abs((b.x - a.x) * (a.y - pts[i].y) - (a.x - pts[i].x) * (b.y - a.y)) / len; // closed stroke: measure from the start point
      if (d > best) { best = d; at = i; }
    }
    if (best <= eps) return [a, b];
    return rdp(pts.slice(0, at + 1), eps).slice(0, -1).concat(rdp(pts.slice(at), eps));
  }
  function shape(pts) {
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var minx = Math.min.apply(0, xs), maxx = Math.max.apply(0, xs), miny = Math.min.apply(0, ys), maxy = Math.max.apply(0, ys);
    return { xs: xs, ys: ys, w: maxx - minx, h: maxy - miny, miny: miny, top: ys.indexOf(miny) / (ys.length - 1) };
  }
  // Forms are drawn symbols, loosely checked: gust = tornado (spiral), flow = wave, root = mountain peak, spark = flame.
  var recognizers = {
    gust: function (pts, g) { var s = shape(pts); return Math.max(s.w, s.h) >= g.minSize && swept(pts) >= g.minSweep; },
    flow: function (pts, g) { var s = shape(pts); return s.w >= g.minWidth && s.h >= g.minAmp && revs(s.ys, g.revPx) >= 3 && revs(s.xs, Math.max(20, s.w * 0.3)) === 0; },
    root: function (pts, g) { // a mountain: an open peak or a closed triangle, drawn from any corner
      var s = shape(pts); if (s.w < g.minWidth || s.h < g.minHeight || revs(s.ys, g.revPx) > 2) return false;
      var diag = Math.hypot(s.w, s.h), corners = rdp(pts, g.cornerFrac * diag).length - 2; // interior corners only
      var top = pts[s.ys.indexOf(s.miny)], minx = Math.min.apply(0, s.xs), apexAt = (top.x - minx) / s.w;
      var area = 0; for (var i = 0; i < pts.length; i++) { var p = pts[i], q = pts[(i + 1) % pts.length]; area += p.x * q.y - q.x * p.y; }
      return corners >= 1 && corners <= 3 && apexAt > 0.15 && apexAt < 0.85 && Math.abs(area) / 2 / (s.w * s.h) <= g.maxFill; // maxFill rejects circles and squares
    },
    spark: function (pts, g) {
      var s = shape(pts); if (s.h < g.minHeight || s.h < 0.9 * s.w) return false;
      var sw = swept(pts), closed = dist(pts[0], pts[pts.length - 1]) <= 0.35 * s.h;
      return sw < g.maxSweep && (revs(s.xs, g.revPx) >= 2 || (closed && sw >= 200 && s.h >= 1.2 * s.w));
    }
  };
  function recognize(form, strokes, cfg) {
    var pts = [].concat.apply([], strokes); if (pts.length < 6) return false; // all strokes together, so a flame may be drawn in two goes
    return recognizers[form](pts, cfg.config.gesture[form]);
  }

  /* ---------- breath rhythm: taps = [{down, up}] in ms; pattern "SSL" ---------- */
  function checkRhythm(pattern, taps, r) {
    if (taps.length !== pattern.length) return false;
    for (var i = 0; i < pattern.length; i++) {
      var held = taps[i].up - taps[i].down;
      if (pattern[i] === 'L' && held < r.holdMinMs) return false;
      if (pattern[i] === 'S' && held >= r.holdMinMs) return false;
    }
    return true;
  }

  /* ---------- score ---------- */
  function clampChi(n) { return Math.max(0, n); }
  function maxScore(cfg) {
    var s = cfg.config.score, rooms = cfg.rooms.length;
    return rooms * 3 * s.item + rooms * s.secret + 6 * s.reward + 3 * s.final;
  }

  return { validate: validate, checkLotus: checkLotus, traceBeam: traceBeam, checkMoons: checkMoons, moonLevel: moonLevel,
           recognize: recognize, checkRhythm: checkRhythm, clampChi: clampChi, maxScore: maxScore, pathLen: pathLen };
});
