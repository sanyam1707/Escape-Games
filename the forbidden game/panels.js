"use strict";
// Puzzle panels and inspect views. Everything is drawn here (HTML/SVG); art is optional via sprite().
// Needs from game.js: $, G, S, sprite(), GameLogic. api = {state, wrong(), solved(), later(fn,ms), dead()}.
const GL = GameLogic;
const el = (html, cls) => { const d = document.createElement("div"); if (cls) d.className = cls; d.innerHTML = html; return d; };

/* ----- tiny drag-and-drop that also works as tap-select then tap-target (touch friendly) ----- */
function dnd(items, targets, onDrop) {
  let sel = null;
  const pick = it => { sel?.classList.remove("sel"); sel = sel === it ? null : it; sel?.classList.add("sel"); };
  targets.forEach(t => t.addEventListener("click", () => { if (sel) { const s = sel; pick(s); onDrop(s, t); } }));
  items.forEach(it => {
    it.style.touchAction = "none";
    it.addEventListener("pointerdown", e => {
      e.preventDefault(); const sx = e.clientX, sy = e.clientY, r = it.getBoundingClientRect(); let ghost = null;
      const move = ev => {
        if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) {
          ghost = it.cloneNode(true); ghost.classList.add("ghost");
          ghost.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;pointer-events:none;z-index:300`;
          document.body.appendChild(ghost); it.style.opacity = .35;
        }
        if (ghost) ghost.style.transform = `translate(${ev.clientX - sx}px,${ev.clientY - sy}px)`;
      };
      const up = ev => {
        removeEventListener("pointermove", move); removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
        if (!ghost) return pick(it); // a tap: select
        ghost.remove(); it.style.opacity = "";
        const under = document.elementFromPoint(ev.clientX, ev.clientY), t = targets.find(x => x === under || x.contains(under));
        if (t) onDrop(it, t);
      };
      addEventListener("pointermove", move); addEventListener("pointerup", up); addEventListener("pointercancel", up);
    });
  });
}
const shake = e => { e.classList.remove("shake"); void e.offsetWidth; e.classList.add("shake"); };

/* ----- glyphs for Room 5 (drawn) ----- */
const GLYPH = {
  dotcircle: '<circle cx="24" cy="24" r="15"/><circle cx="24" cy="24" r="3" fill="currentColor"/>',
  waves: '<path d="M6 18q6-6 12 0t12 0t12 0M6 30q6-6 12 0t12 0t12 0"/>',
  crescent: '<path d="M32 8a17 17 0 1 0 0 32a13 13 0 1 1 0-32z" fill="currentColor"/>',
  triangle: '<path d="M24 8L42 40H6z"/>',
  arrow: '<path d="M6 24H38M28 14L40 24L28 34"/>',
  key: '<circle cx="15" cy="24" r="7"/><path d="M22 24H42M36 24v8M42 24v6"/>',
  leaf: '<path d="M10 38C10 16 24 8 40 8C40 28 30 40 10 38zM10 38L30 18"/>',
  diamond: '<path d="M24 5L42 24L24 43L6 24z"/>',
  star: '<path d="M24 5l5.5 12.5L43 19l-10 9 3 14-12-7-12 7 3-14-10-9 13.5-1.5z"/>'
};
const glyphSVG = (n, s = 48) => `<svg class="glyph" viewBox="0 0 48 48" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${GLYPH[n]}</svg>`;
const ANIMALS = ["heron", "tortoise", "gecko", "bat", "fox", "moth"];
const DRUMCOL = ["#C2272D", "#2F8A4A", "#E0B52A"];

/* ----- inspect views: a picture (art or drawn) plus a caption; all views seen = done ----- */
const DRAW = {
  lidring() {
    const pts = ANIMALS.map((a, i) => { const t = i * Math.PI / 3; return `<div class="ringitem" style="left:${50 + 36 * Math.sin(t)}%;top:${50 - 36 * Math.cos(t)}%">${sprite("piece_" + a, "●").outerHTML}<small>${i + 1}. ${a}</small></div>`; }).join("");
    return `<div class="ring">${pts}<div class="ringmid">Top</div></div>`;
  },
  beatlog() { return `<div class="beatlog">${[34, 24, 15].map(s => `<div>${Array(5).fill(`<i style="width:${s}px;height:${s}px"></i>`).join("")}</div>`).join("")}</div>`; },
  mirrorguide: () => `<div class="mirrors2"><div><svg viewBox="0 0 40 40" width="64"><path d="M8 34L32 6" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg><b>Slash /</b></div><div><svg viewBox="0 0 40 40" width="64"><path d="M8 6L32 34" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg><b>Back \\</b></div></div>`,
  mirrorturns: () => `<table class="turns"><tr><th>Going</th><th>Back \\</th><th>Slash /</th></tr><tr><td>East →</td><td>south ↓</td><td>north ↑</td></tr><tr><td>South ↓</td><td>east →</td><td>west ←</td></tr><tr><td>West ←</td><td>north ↑</td><td>south ↓</td></tr></table>`,
  templegrid() { return gridSVG(G.puzzles.r4_mirrors, null, true); },
  scroll() {
    const done = S.done.has("r5_glass"), gl = G.puzzles.r5_decode.glyphs;
    return `<div class="scrollart"><h4>SHELTER</h4><div>${gl.map((g, i) => `<span class="${i === 3 && !done ? "faded" : ""}">${glyphSVG(g, 44)}</span>`).join("")}</div></div>`;
  },
  keychart(i) {
    const e = Object.entries(G.puzzles.r5_decode.key), part = i ? e.slice(5) : e.slice(0, 5);
    return `<div class="keychart">${part.map(([g, l]) => `<div>${glyphSVG(g, 40)}<b>= ${l}</b></div>`).join("")}</div>`;
  },
  recipe(i) {
    const lines = ["First, the herb that floats on water.", "Second, the herb with white bell flowers.", "Third, the herb with the sharp, cool smell.", "Fourth, the herb with small red berries."];
    return i ? `<div class="recipe">${sprite("herb_nightcap", "☠").outerHTML}<p>⚠ Never add the herb with black flowers.</p></div>` : `<div class="recipe"><p>${lines.join("</p><p>")}</p></div>`;
  },
  drum(i) { const s = [130, 96, 66][i]; return `<div class="drumv" style="width:${s}px;height:${s}px;background:${DRUMCOL[i]}"></div>`; }
};
function viewHTML(v) {
  if (v.draw) { const [n, a] = v.draw.split(":"); return DRAW[n](+a); }
  if (v.herb) return sprite("herb_" + v.herb, "🌿").outerHTML;
  if (v.sprite) return `<div class="ringwrap">${sprite(v.sprite, "◆").outerHTML}${v.ring ? `<i class="ringdot" style="left:${v.ring[0]}%;top:${v.ring[1]}%"></i>` : ""}</div>`;
  if (v.sprites) return v.sprites.map(s => sprite(s, "◆").outerHTML).join("");
  return "";
}
function buildInspect(root, h, api) {
  const views = h.views; let i = 0; const seen = new Set();
  root.innerHTML = `<div class="view"></div><p class="cap"></p><div class="viewbar"><small></small><button class="btn primary"></button></div>`;
  const draw = () => {
    seen.add(i); root.querySelector(".view").innerHTML = viewHTML(views[i]);
    const dm = views[i].draw?.match(/^drum:(\d)/); if (dm) { sfx("drum" + dm[1]); root.querySelector(".drumv").onclick = () => sfx("drum" + dm[1]); }
    root.querySelector(".cap").textContent = views[i].caption;
    root.querySelector("small").textContent = G.ui.viewOf.replace("{a}", i + 1).replace("{b}", views.length);
    if (seen.size === views.length) api.complete();
    root.querySelector("button").textContent = seen.size === views.length ? G.ui.close : G.ui.viewTurn + " ▶";
  };
  root.querySelector("button").onclick = () => (seen.size === views.length && i === views.length - 1 ? api.close() : (i = (i + 1) % views.length, draw()));
  draw();
}

/* ----- shared grid drawing for Room 4 (panel + inspect) ----- */
function gridSVG(p, set, plain) {
  const C = 56, W = p.cols * C, H = p.rows * C, cx = c => (c - 1) * C + C / 2;
  let s = `<svg class="mgrid" viewBox="-34 -6 ${W + 46} ${H + 12}">`;
  for (let r = 1; r <= p.rows; r++) for (let c = 1; c <= p.cols; c++) s += `<rect x="${(c - 1) * C + 2}" y="${(r - 1) * C + 2}" width="${C - 4}" height="${C - 4}" rx="6" class="gcell"/>`;
  s += `<path d="M-30 ${cx(p.entry.row)}H-6" class="beam0"/><path d="M-12 ${cx(p.entry.row) - 6}L-4 ${cx(p.entry.row)}L-12 ${cx(p.entry.row) + 6}" class="beam0 nofill"/>`;
  s += `<circle id="stone" cx="${cx(p.stone.col)}" cy="${cx(p.stone.row)}" r="18" class="stone"/>`;
  for (const m of p.mirrors) {
    const x = cx(m.col), y = cx(m.row), back = !set || set[m.id] === "back";
    s += `<g class="mir" data-id="${m.id}"><circle cx="${x}" cy="${y}" r="22" fill="transparent"/><path d="${back ? `M${x - 16} ${y - 16}L${x + 16} ${y + 16}` : `M${x - 16} ${y + 16}L${x + 16} ${y - 16}`}" class="mline"/><text x="${x + 14}" y="${y - 12}" class="mlabel">${m.id}</text></g>`;
  }
  return s + `<g id="beam"></g></svg>`;
}

const P = {};

/* ----- Room 1: jigsaw ----- */
P.jigsaw = (root, p, api) => {
  const placed = api.state.placed ||= Array(6).fill(null);
  root.innerHTML = `<svg class="hex" viewBox="-150 -140 300 280"></svg><div class="tray"></div>`;
  const svg = root.querySelector("svg"), tray = root.querySelector(".tray"), R = 128;
  const pt = (a, r) => `${(r * Math.sin(a * Math.PI / 180)).toFixed(1)},${(-r * Math.cos(a * Math.PI / 180)).toFixed(1)}`;
  const slots = [];
  p.order.forEach((_, i) => {
    const a = i * 60, g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.innerHTML = `<polygon points="0,0 ${pt(a - 30, R)} ${pt(a + 30, R)}" class="slot"/>`;
    svg.appendChild(g); slots.push(g.firstChild);
  });
  const paint = () => {
    svg.querySelectorAll(".placed").forEach(n => n.remove());
    placed.forEach((a, i) => {
      if (!a) return; const g = document.createElementNS("http://www.w3.org/2000/svg", "g"); g.setAttribute("class", "placed");
      g.setAttribute("transform", `rotate(${i * 60})`);
      g.innerHTML = hasArt("piece_" + a)
        ? `<image href="assets/cut/piece_${a}.png" x="-46" y="-110" width="92" height="104" transform="rotate(180 0 -58)" preserveAspectRatio="xMidYMid meet"/>`
        : `<polygon points="0,-6 -48,-110 48,-110" class="fbpiece"/><text x="0" y="-62" class="fbtxt">${a[0].toUpperCase()}</text>`;
      svg.appendChild(g);
    });
    tray.innerHTML = "";
    const pieces = S.items.filter(id => id.startsWith("piece_")).map(id => id.slice(6)).filter(a => !placed.includes(a));
    const els = pieces.map(a => { const d = el(sprite("piece_" + a, G.items["piece_" + a].glyph).outerHTML, "piece"); d.dataset.a = a; tray.appendChild(d); return d; });
    dnd(els, slots, (it, slot) => {
      const i = slots.indexOf(slot);
      if (placed[i]) return shake(slot);
      if (p.order[i] === it.dataset.a) { placed[i] = it.dataset.a; sfx("place"); paint(); if (GL.jigsawOk(p, placed)) api.solved(); } // a wrong drop springs back, no cost
      else { shake(it); sfx("tap"); }
    });
  };
  paint();
};

/* ----- Room 1: first move ----- */
P.move = (root, p, api) => {
  root.innerHTML = `<div class="board8"></div><p class="cap">The token waits on square 0.</p>`;
  const b = root.querySelector(".board8"), sq = [];
  for (let i = 0; i < p.squares; i++) { const d = el(`<b>${i}</b>${i === p.target ? "🗝" : i === p.squares - 1 ? "🚪" : ""}`, "sq"); b.appendChild(d); sq.push(d); }
  const tok = el("♟", "token"); sq[0].appendChild(tok);
  dnd([tok], sq, (it, t) => {
    const i = sq.indexOf(t); t.appendChild(tok); sfx("place");
    if (GL.moveOk(p, i)) api.solved(); else { shake(t); api.later(() => sq[0].appendChild(tok), 500); api.wrong(); }
  });
};

/* ----- Room 2: planks ----- */
P.planks = (root, p, api) => {
  const st = api.state; st.row ??= 0; st.fallen ??= [];
  root.innerHTML = `<div class="bridge"></div><p class="cap"></p>`;
  const br = root.querySelector(".bridge"), cap = root.querySelector(".cap");
  const paint = () => {
    br.innerHTML = ""; cap.textContent = st.row < p.rows ? `Row ${st.row + 1} of ${p.rows}: pick a plank.` : "";
    for (let r = p.rows - 1; r >= 0; r--) {
      const row = el(`<span class="rl">${r + 1}</span>`, "prow");
      for (let k = 0; k < 3; k++) {
        const b = document.createElement("button"); b.className = "plank3"; b.setAttribute("aria-label", `Row ${r + 1} plank ${["left", "middle", "right"][k]}`);
        if (r < st.row) b.classList.add(p.safe[r] === k ? "safe" : "off");
        else if (r === st.row) { if (st.fallen.includes(k)) b.classList.add("fall"); else b.onclick = () => tap(k); }
        else b.disabled = true;
        row.appendChild(b);
      }
      br.appendChild(row);
    }
  };
  const tap = k => {
    if (GL.plankOk(p, st.row, k)) { sfx("place"); st.row++; st.fallen = []; paint(); if (st.row === p.rows) api.solved(); }
    else { st.fallen.push(k); sfx("plank"); paint(); api.wrong(); }
  };
  paint();
};

/* ----- Room 3: rhythm ----- */
P.rhythm = (root, p, api) => {
  root.innerHTML = `<div class="drums"></div><p class="cap"></p><button class="btn primary go">Listen</button>`;
  const drums = root.querySelector(".drums"), cap = root.querySelector(".cap"), go = root.querySelector(".go"), ds = [];
  p.drums.forEach((n, i) => { const b = document.createElement("button"); b.className = "drum"; b.style.cssText = `background:${DRUMCOL[i]};width:${[130, 100, 74][i]}px;height:${[130, 100, 74][i]}px`; b.setAttribute("aria-label", n + " drum"); drums.appendChild(b); ds.push(b); });
  let round = 0, pos = 0, listening = false;
  const flash = i => { sfx("drum" + i); ds[i].classList.add("hit"); api.later(() => ds[i].classList.remove("hit"), 350); };
  const play = () => {
    listening = true; pos = 0; go.disabled = true; cap.textContent = `Round ${round + 1} of ${p.rounds.length}: listen...`;
    p.rounds[round].forEach((d, k) => api.later(() => flash(d), 500 + k * 650));
    api.later(() => { listening = false; cap.textContent = "Your turn. Copy the beat."; }, 500 + p.rounds[round].length * 650);
  };
  go.onclick = play;
  ds.forEach((b, i) => b.onclick = () => {
    if (listening || go.disabled === false) return;
    flash(i);
    if (GL.rhythmOk(p, round, pos, i)) {
      if (++pos === p.rounds[round].length) { if (++round === p.rounds.length) return api.solved(); cap.textContent = "Good. Next round."; go.disabled = false; go.textContent = "Listen"; }
    } else { api.wrong(); cap.textContent = "Wrong beat. Listen again."; api.later(play, 1300); }
  });
  cap.textContent = "Tap Listen. The Keeper's hands play first.";
};

/* ----- Room 4: mirrors ----- */
P.mirrors = (root, p, api) => {
  const set = api.state.set ||= Object.fromEntries(p.mirrors.map(m => [m.id, p.start]));
  root.innerHTML = `<div class="gridwrap"></div><p class="cap">Tap a mirror to flip it.</p><button class="btn primary go">Release the light</button>`;
  const wrap = root.querySelector(".gridwrap"), go = root.querySelector(".go"), C = 56, cx = c => (c - 1) * C + C / 2;
  const paint = () => {
    wrap.innerHTML = gridSVG(p, set);
    wrap.querySelectorAll(".mir").forEach(g => g.onclick = () => { sfx("tap"); set[g.dataset.id] = set[g.dataset.id] === "back" ? "slash" : "back"; paint(); });
  };
  go.onclick = () => {
    const r = GL.beam(p, set); paint(); go.disabled = true; sfx("beam");
    let d = `M-30 ${cx(p.entry.row)}`; r.path.forEach(c => (d += `L${cx(c.col)} ${cx(c.row)}`));
    const last = r.path[r.path.length - 1], ex = { E: [1, 0], S: [0, 1], W: [-1, 0], N: [0, -1] }[last.dir]; // a miss runs off the grid
    if (!r.hit) d += `L${cx(last.col) + ex[0] * C} ${cx(last.row) + ex[1] * C}`;
    wrap.querySelector("#beam").innerHTML = `<path d="${d}" class="beamline" pathLength="1"/>`;
    api.later(() => { go.disabled = false; if (r.hit) { sfx("chime"); wrap.querySelector("#stone").classList.add("lit"); api.later(api.solved, 700); } else api.wrong(); }, 1300);
  };
  paint();
};

/* ----- Room 5: decode ----- */
P.decode = (root, p, api) => {
  const letters = api.state.letters ||= p.glyphs.map(() => "A"); const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  root.innerHTML = `<div class="decode"></div><button class="btn primary go">Say the word</button>`;
  const box = root.querySelector(".decode");
  const paint = () => {
    box.innerHTML = p.glyphs.map((g, i) => `<div class="dcol">${glyphSVG(g, 52)}<button class="btn round" data-i="${i}" data-d="-1">▲</button><b>${letters[i]}</b><button class="btn round" data-i="${i}" data-d="1">▼</button></div>`).join("");
    box.querySelectorAll("button").forEach(b => b.onclick = () => { sfx("tap"); const i = +b.dataset.i; letters[i] = A[(A.indexOf(letters[i]) + +b.dataset.d + 26) % 26]; paint(); });
  };
  root.querySelector(".go").onclick = () => { if (GL.decodeOk(p, letters)) api.solved(); else { shake(box); api.wrong(); } };
  paint();
};

/* ----- Room 6: herbs ----- */
P.herbs = (root, p, api) => {
  const st = api.state; st.idx ??= 0;
  root.innerHTML = `<div class="shelf"></div><div class="cauldron"><span class="pot">🍲</span><div class="added"></div></div><p class="cap">Drag one herb at a time into the cauldron.</p>`;
  const shelf = root.querySelector(".shelf"), caul = root.querySelector(".cauldron"), added = root.querySelector(".added");
  const paint = () => {
    added.innerHTML = p.order.slice(0, st.idx).map((h, i) => `<i>${i + 1}</i>`).join("");
    shelf.innerHTML = "";
    const els = (p.shelf || p.herbs).filter(h => !p.order.slice(0, st.idx).includes(h)).map(h => {
      const d = el(sprite("herb_" + h, "🌿").outerHTML + `<small>${h}</small>`, "herb"); d.dataset.h = h; shelf.appendChild(d); return d;
    });
    dnd(els, [caul], (it) => {
      if (GL.herbOk(p, st.idx, it.dataset.h)) { sfx("bubble"); st.idx++; paint(); if (st.idx === p.order.length) api.solved(); }
      else { sfx("fizz"); caul.classList.add("fizz"); api.later(() => caul.classList.remove("fizz"), 900); api.wrong(); }
    });
  };
  paint();
};

/* ----- Room 7: the Keeper's sentence ----- */
P.sentence = (root, p, api) => {
  const st = api.state; st.filled ??= []; let lock = false;
  root.innerHTML = `<div class="sentence"></div><div class="tray tiles"></div><p class="cap">Pick a Tile, then tap its blank.</p>`;
  const sen = root.querySelector(".sentence"), tray = root.querySelector(".tiles"), cap = root.querySelector(".cap");
  const paint = () => {
    sen.innerHTML = p.blanks.map((b, i) => `${b.before} <button class="blank ${st.filled[i] ? "ok" : ""}" data-i="${i}">${st.filled[i] ? b.tile : "&nbsp;&nbsp;&nbsp;&nbsp;?&nbsp;&nbsp;&nbsp;&nbsp;"}</button> ${b.after}`).join(" ");
    tray.innerHTML = "";
    const blanks = [...sen.querySelectorAll(".blank")];
    const left = (p.tray || G.rules.map(r => r.tile)).map(t => G.rules.find(r => r.tile === t)).filter(r => S.tiles.includes(r.tile) && !st.filled.includes(r.tile));
    const els = left.map(r => { const d = el(sprite(r.sprite, "◉").outerHTML + `<small>${r.tile}</small>`, "tile"); d.dataset.t = r.tile; tray.appendChild(d); return d; });
    dnd(els, blanks, (it, b) => {
      const i = +b.dataset.i; if (lock || st.filled[i]) return;
      if (GL.tileOk(p, i, it.dataset.t)) { st.filled[i] = it.dataset.t; sfx("chime"); paint(); if (st.filled.filter(Boolean).length === p.blanks.length) api.solved(); }
      else { shake(it); const bad = (st.bad = (st.bad || 0) + 1); api.threat(bad); if (bad >= p.maxWrong) return api.shatter(); api.wrong(["r7_warn_" + bad]); lock = true; let n = p.lockout; cap.textContent = `Locked for ${n}...`; // 3 s lockout after a wrong Tile
        const tick = () => { if (api.dead()) return; if (--n > 0) { cap.textContent = `Locked for ${n}...`; api.later(tick, 1000); } else { lock = false; cap.textContent = "Pick a Tile, then tap its blank."; } };
        api.later(tick, 1000); }
    });
  };
  paint();
};
