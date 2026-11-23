/* Pure puzzle rules. Used by game.js (browser) and tools/solvability_test.js (node). Numbers come from game.json. */
(function (root) {
  const Rules = {
    // Room 1: sockets is an array of 4 crest ids (or null)
    sockets: (G, s) => s.every((c, i) => c === G.sockets.answer[i]),

    // Room 2: path = array of 5 column indexes (0..2), row 1 first. Returns null when valid, else the broken rule number 1-4.
    stones(G, path) {
      const rows = G.stones.rows;
      if (path.length !== rows.length) return 0;
      const sym = path.map((c, r) => rows[r][c]);
      if (sym[0] !== 'leaf' || sym[sym.length - 1] !== 'star') return 1;
      if (sym.includes('thorn')) return 2;
      for (let i = 1; i < sym.length; i++) {
        if (sym[i] === sym[i - 1]) return 3;
        if (Math.abs(path[i] - path[i - 1]) > 1) return 0;
      }
      for (let i = 2; i < path.length; i++) {
        const a = path[i - 1] - path[i - 2], b = path[i] - path[i - 1];
        if (a !== 0 && a === b) return 4;
      }
      return null;
    },

    // Room 3: counts = {sword_plain, sword_fine, shield_plain, shield_banded}. null when exact, else 'over' | 'under' | 'count'
    forge(G, c, noFineRule) {
      const F = G.forge; let iron = 0, dark = 0, sw = 0, sh = 0, fine = 0;
      for (const it of F.items) {
        const n = c[it.id] || 0; iron += n * it.iron; dark += n * it.dark;
        if (it.kind === 'sword') { sw += n; if (it.fine) fine += n; } else sh += n;
      }
      if (iron > F.ore.iron || dark > F.ore.darksteel) return 'over';
      if (sw !== F.swords || sh !== F.shields) return 'count';
      if (!noFineRule && fine < F.minFine) return 'count';
      if (iron < F.ore.iron || dark < F.ore.darksteel) return 'under';
      return null;
    },

    // Room 4: lord id + card letter
    council: (G, lordId, card) => G.council.lords.find(l => l.id === lordId).card === card,

    // Room 5: placed = {N:[defId|null x3], ...}. Returns per-side enemy list with kill volley, and wall damage.
    sim(G, waveIdx, placed) {
      const B = G.battle, V = G.config.volleys, wave = B.waves[waveIdx], out = { sides: {}, wallDmg: 0 };
      for (const side of Object.keys(wave.sides)) {
        const defs = (placed[side] || []).filter(Boolean).map(id => B.defenders.find(d => d.id === id));
        const en = [];
        for (const [type, n] of Object.entries(wave.sides[side])) for (let i = 0; i < n; i++) en.push({ type, hp: B.enemies[type].hp, air: B.enemies[type].air, killV: 0, hist: [B.enemies[type].hp] });
        const dmg = (list, pool) => {
          for (const e of list.filter(x => !x.killV).sort((a, b) => a.hp - b.hp)) {
            if (pool <= 0) break; const t = Math.min(pool, e.hp); e.hp -= t; pool -= t; if (e.hp <= 0) e.killV = cur;
          }
        };
        let cur = 0;
        for (cur = 1; cur <= V; cur++) {
          if (cur === 1) for (const d of defs.filter(d => d.once)) for (const e of en) if (!e.air && !e.killV) { e.hp -= d.dmg; if (e.hp <= 0) e.killV = 1; }
          const arch = defs.filter(d => d.air && d.ground).reduce((s, d) => s + d.dmg, 0);
          const gro = defs.filter(d => !d.air && d.ground && !d.once).reduce((s, d) => s + d.dmg, 0);
          const airAlive = en.some(e => e.air && !e.killV);
          dmg(en.filter(e => e.air), arch);
          dmg(en.filter(e => !e.air), gro + (airAlive ? 0 : arch));
          for (const e of en) e.hist.push(Math.max(0, e.hp));
        }
        out.sides[side] = en;
        for (const e of en) if (!e.killV) out.wallDmg += B.enemies[e.type].wall;
      }
      return out;
    },
    cost: (G, placed) => Object.values(placed).flat().filter(Boolean).reduce((s, id) => s + G.battle.defenders.find(d => d.id === id).cost, 0),

    // Room 6: assign = {hostId: day}. Returns list of {host, diff} (diff<0 early, >0 late); empty when right.
    dispatch(G, assign) {
      const D = G.dispatch, bad = [];
      for (const h of D.hosts) {
        const day = assign[h.id];
        if (day == null) { bad.push({ host: h, diff: null }); continue; }
        const arrive = day + h.road / h.speed;
        if (arrive !== D.arrival) bad.push({ host: h, diff: arrive - D.arrival });
      }
      return bad;
    },

    // Room 7
    song: (G, notes) => notes.length === G.horn.length && notes.every((n, i) => n === G.horn[i]),
    trail: G => G.trail.suspects.filter(s => G.trail.tests.every(t => t.can.includes(s.id))).map(s => s.id)
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Rules; else root.Rules = Rules;
})(typeof window !== 'undefined' ? window : globalThis);
