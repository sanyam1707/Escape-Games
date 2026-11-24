// Puzzle answers and rules. Shared by game.js (browser) and tools/solvability_test.js (node).
const PZ = {
  gear: { heart: 12, hand: 48, tray: [8, 12, 16, 24, 36, 48], gaps: [36, 64], answer: [24, 16] },
  alibi: { rows: ['Marlowe', 'Isolde', 'Dax', 'Bram'], cols: ['Kitchen', 'Library', 'Greenhouse', 'Roof'], answer: [3, 2, 0, 1] }, // column index per row
  sight: { bearing: 135, height: 35 },
  switch: { start: [0, 0, 1, 1, 1, 0, 0, 1, 1] },
  pour: { caps: [5, 3], goal: 4 },
  sigil: { symbols: ['Sun', 'Moon', 'Gear', 'Key', 'Bell', 'Eye'], code: ['Bell', 'Gear', 'Eye', 'Key'], tries: 6 },
  tower: { names: ['Second', 'Minute', 'Hour'], pegs: ['Past', 'Now', 'Future'], solution: '1P-F 2P-N 1F-N 3P-F 1N-P 2N-F 1P-F' }, // 3 rings, 7 moves (simplified from 4 rings / 15)
  press(g, i) { // flip lamp i and its up/down/left/right neighbours
    const n = g.slice(), r = Math.floor(i / 3), c = i % 3;
    [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => {
      const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 3 && cc >= 0 && cc < 3) n[rr * 3 + cc] ^= 1;
    });
    return n;
  },
  pour1(a, b, op) { // op: fillA fillB emptyA emptyB AB BA
    const [ca, cb] = PZ.pour.caps;
    if (op === 'fillA') return [ca, b]; if (op === 'fillB') return [a, cb];
    if (op === 'emptyA') return [0, b]; if (op === 'emptyB') return [a, 0];
    if (op === 'AB') { const t = Math.min(a, cb - b); return [a - t, b + t]; }
    const t = Math.min(b, ca - a); return [a + t, b - t];
  },
  feedback(code, guess) { // 'gold' right place, 'silver' wrong place, '' none
    return guess.map((s, i) => s === code[i] ? 'gold' : code.includes(s) ? 'silver' : '');
  },
  legal(pegs, from, to) { // pegs: arrays, last = top, bigger number = bigger ring
    const a = pegs[from], b = pegs[to];
    return a.length > 0 && from !== to && (b.length === 0 || b[b.length - 1] > a[a.length - 1]);
  }
};
if (typeof module !== 'undefined') module.exports = PZ;
