/* Beyond the Forgotten Seas. All text and numbers come from game.json. */
(() => {
const $ = s => document.querySelector(s);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const DEBUG = false;
const S = { unlocked: false, playing: false, left: 0, fortune: 0, voice: true, music: true, room: null, done: new Set(), cleared: false, idle: 0, lastInput: 0,
  items: new Set(), clues: [], rules: [], legs: 0, hold: null, hints: {}, wrongs: {}, pstate: {}, flags: {}, secrets: new Set(), rulesOpen: false, locksDone: 0, lockUntil: 0,
  tally: { items: 0, secrets: 0, rooms: 0, locks: 0, wrongs: 0, hints: 0 } };
let G, viewer, bgm, L, SC;
const T = { holds: new Set(), last: 0 };            // the clock runs only while playing and no hold is set
const hold = k => T.holds.add(k), release = k => T.holds.delete(k);
const PANEL = {};                                    // panel renderers by type

/* ---------- validate ---------- */
function validate(g) {
  const err = [], flagged = id => g.dialogue[id] && typeof g.dialogue[id].pausesTimer === "boolean";
  for (const [id, d] of Object.entries(g.dialogue)) {
    if (typeof d.pausesTimer !== "boolean") err.push(`dialogue ${id}: pausesTimer missing`);
    (d.lines || []).forEach((l, i) => { if (!g.speakers[l.who]) err.push(`dialogue ${id}.${i}: unknown speaker ${l.who}`); });
  }
  const roomIds = new Set(), seen = new Set();
  for (const r of g.rooms) {
    if (roomIds.has(r.id)) err.push(`duplicate room ${r.id}`); roomIds.add(r.id);
    const ids = new Set(r.hotspots.map(h => h.id)), items = new Set((r.items || []).map(i => i.id));
    for (const k of [r.enter, r.idle, r.right]) if (k && !flagged(k)) err.push(`room ${r.id}: dialogue ${k} missing or unflagged`);
    for (const f of r.find || []) if (!ids.has(f)) err.push(`room ${r.id}: find ${f} not a hotspot`);
    for (const h of r.hotspots) {
      if (seen.has(h.id)) err.push(`duplicate hotspot ${h.id}`); seen.add(h.id);
      for (const a of h.after) if (!ids.has(a)) err.push(`${h.id}: after ${a} unknown`);
      for (const l of [...(h.lines || []), ...(h.secret ? [h.secret.line] : []), ...(h.solve && h.solve.line ? [h.solve.line] : [])]) if (!flagged(l)) err.push(`${h.id}: dialogue ${l} missing or unflagged`);
      if (h.panel && !g.panels[h.panel]) err.push(`${h.id}: panel ${h.panel} missing`);
      if (h.panel && !PANEL[g.panels[h.panel].type]) err.push(`${h.id}: panel type unknown`);
      for (const k of [h.item, h.use, h.fromItem]) if (k && !items.has(k)) err.push(`${h.id}: item ${k} not in room items`);
      if (h.kind !== "PANEL" && h.kind !== "INSPECT" && h.card.text === "" ) err.push(`${h.id}: card text empty`);
    }
    const state = {}, dfs = id => { if (state[id] === 1) return true; if (state[id] === 2) return false; state[id] = 1;
      for (const a of r.hotspots.find(h => h.id === id).after) if (ids.has(a) && dfs(a)) return true; state[id] = 2; return false; };
    for (const h of r.hotspots) if (dfs(h.id)) { err.push(`room ${r.id}: cycle at ${h.id}`); break; }
    if (r.exit && !g.rooms.some(x => x.id === r.exit.to)) err.push(`room ${r.id}: exit to ${r.exit.to} unknown`);
    if (r.bank && r.id !== "r7") for (const n of [1, 2, 3]) if (!flagged(`${r.bank}.wrong${n}`)) err.push(`bank ${r.bank}.wrong${n} missing`);
  }
  for (const k of ["opening", "ending"]) if (!flagged(k)) err.push(`dialogue ${k} missing or unflagged`);
  for (const [id, p] of Object.entries(g.panels)) for (const n of [1, 2, 3]) if (!flagged(`${p.bank}.wrong${n}`)) err.push(`panel ${id}: ${p.bank}.wrong${n} missing`);
  if (g.rules.length !== 6) err.push("rules must be 6");
  return err;
}

/* ---------- audio: speech, tones ---------- */
let voiceAudio, AC;
const duck = on => { if (bgm) bgm.volume = on ? G.config.musicDuck : G.config.musicVolume; };
function stopVoice() { duck(false); window.speechSynthesis && speechSynthesis.cancel(); if (voiceAudio) { voiceAudio.pause(); voiceAudio = null; } }
const preload = f => { if (f && S.voice) new Audio(f).load(); };
// voice stops for a panel, the Book or the pause menu opening, and picks up again when it closes
function syncVoice() {
  const m = !$("#pause").hidden || !$("#panel").hidden || !$("#book").hidden;
  if (m && !S.wasModal && voiceAudio && !voiceAudio.paused && !voiceAudio.ended) { voiceAudio.pause(); S.vResume = true; }
  if (!m && S.wasModal && S.vResume) { S.vResume = false; voiceAudio && voiceAudio.play().catch(() => {}); }
  S.wasModal = m;
}
function narrate(text, who = "narrator", audioFile) {
  stopVoice();
  if (!S.unlocked || !S.voice) return;
  const speak = () => { if (!window.speechSynthesis) return; const sp = G.speakers[who] || G.speakers.narrator;
    const u = new SpeechSynthesisUtterance(text.replace(/^\([^)]*\)\s*/, "")); u.pitch = sp.pitch; u.rate = sp.rate; speechSynthesis.speak(u); };
  if (!audioFile) return speak();
  const a = voiceAudio = new Audio(audioFile), cur = () => voiceAudio === a;
  // browser voice only when the file truly fails; a pause or skip interrupting play() must stay silent
  a.onerror = () => { if (cur()) speak(); }; a.onended = () => { if (cur()) duck(false); };
  a.onplaying = () => { if (cur()) duck(true); };
  a.play().catch(e => { if (cur() && e.name !== "AbortError") speak(); });
}
function tone(f, d = .25, type = "sine", vol = .15, at = 0) {
  if (!S.unlocked) return;
  try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime + at;
    o.type = type; o.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d); } catch (e) {}
}
const chord = () => G.config.chord.forEach((f, i) => tone(f, .9, "triangle", .12, i * .12));
function knocks(groups) { let t = 0; groups.forEach(n => { for (let i = 0; i < n; i++) { tone(G.config.knockHz, .15, "sine", .3, t); t += G.config.knockGap; } t += G.config.knockPause; }); }

/* ---------- small ui helpers ---------- */
let toastT;
function toast(t) { const e = $("#toast"); e.textContent = t; e.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => e.hidden = true, 2400); }
const fmt = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
function addFortune(n) { S.fortune = Math.max(0, S.fortune + n); $("#fortune b").textContent = S.fortune; }
function art(name, fallback, cls) {
  const wrap = el("span", "art " + (cls || "")), im = new Image(); im.alt = "";
  im.onerror = () => { wrap.textContent = (fallback || "?")[0]; wrap.classList.add("fb"); }; im.src = `assets/cut/${name}.png`; wrap.append(im); return wrap;
}
const room = () => G.rooms.find(r => r.id === S.room);
const hsById = id => G.rooms.flatMap(r => r.hotspots).find(h => h.id === id);
const modalOpen = () => !$("#card").hidden || !$("#panel").hidden || !$("#book").hidden || !$("#pause").hidden;

/* ---------- dialogue (every line waits for a tap; Skip ends the whole conversation) ---------- */
let dlgQ = Promise.resolve();
function say(idOrObj) {
  const d = typeof idOrObj === "string" ? G.dialogue[idOrObj] : idOrObj;
  if (!d) return Promise.resolve();
  return dlgQ = dlgQ.then(() => new Promise(done => {
    let i = 0; const box = $("#dlg-box"), skip = $("#dlg .skip");
    if (d.pausesTimer) hold("dlg");
    const end = () => { box.onclick = skip.onclick = null; $("#dlg").hidden = true; stopVoice(); release("dlg"); done(); };
    const show = () => {
      const l = d.lines[i], sp = G.speakers[l.who];
      $("#dlg-name").textContent = sp.name; $("#dlg-text").textContent = l.text.replace(/^\([^)]*\)\s*/, ""); $("#dlg-action").textContent = l.action || ""; $("#dlg-body small").textContent = (i + 1 < d.lines.length ? L.tapContinue : L.tapClose) + " ▶";
      const face = $("#dlg-face"); face.hidden = !sp.name; face.style.background = sp.color; face.style.backgroundImage = ""; face.style.backgroundSize = ""; face.className = ""; face.textContent = (sp.name || "N")[0];
      const img = new Image(); img.onload = () => { face.style.backgroundImage = `url(${img.src})`; face.className = "bust"; face.style.backgroundSize = "contain"; face.style.backgroundPosition = "center bottom"; face.style.backgroundRepeat = "no-repeat"; face.textContent = ""; };
      if (sp.name) img.src = `assets/cut/bust_${sp.bust || l.who + "_neutral"}.png`;
      narrate(l.text, l.who, l.audioFile); preload((d.lines[i + 1] || {}).audioFile);
    };
    box.onclick = () => { if (++i >= d.lines.length) end(); else show(); };
    skip.onclick = e => { e.stopPropagation(); end(); };
    $("#dlg").hidden = false; show();
  }));
}

/* ---------- cards ---------- */
function card(title, text, note, extra) {
  const c = $("#card"); c.querySelector("h3").textContent = title; c.querySelector("p").textContent = text; c.querySelector("em").textContent = note || "";
  const x = c.querySelector(".extra"); x.innerHTML = ""; if (extra) x.append(extra); c.hidden = false;
}
const closeCard = () => { $("#card").hidden = true; };
function saveClue(title, text) { if (text && !S.clues.some(c => c.title === title && c.text === text)) S.clues.push({ title, text }); }

/* ---------- Living Chart + Book ---------- */
function chartSVG(anim) {
  const P = G.chart.points; let s = `<svg viewBox="0 0 300 380" class="chart"><rect class="band" x="0" y="0" width="300" height="34"/><text x="150" y="22" text-anchor="middle" class="bandt">${G.chart.band}</text>`;
  const path = i => { const [a, b] = [P[i], P[i + 1]], k = i % 2 ? -22 : 22; return `M${a[0]} ${a[1]} Q${(a[0] + b[0]) / 2 + k} ${(a[1] + b[1]) / 2} ${b[0]} ${b[1]}`; };
  for (let i = 0; i < P.length - 1; i++) { s += `<path d="${path(i)}" class="trail"/>`; if (i < S.legs) s += `<path d="${path(i)}" pathLength="1" class="ink${i === anim ? " draw" : ""}"/>`; }
  return s + P.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="4" class="pt"/>`).join("") + "</svg>";
}
let bookTab = 0, bookResolve = null;
function openBook(tab = 0, anim = -1) {
  if (S.rulesOpen) { toast(G.ui.toasts.lockOpen); return Promise.resolve(); }
  bookTab = tab; $("#book").hidden = false; renderBook(anim); return new Promise(r => bookResolve = r);
}
function closeBook() { $("#book").hidden = true; if (bookResolve) { bookResolve(); bookResolve = null; } }
function renderBook(anim = -1) {
  const tabs = $("#book .tabs"), body = $("#book .body"); tabs.innerHTML = body.innerHTML = "";
  L.tabs.forEach((t, i) => { const b = el("button", i === bookTab ? "on" : "", t); b.onclick = () => { bookTab = i; renderBook(); }; tabs.append(b); });
  if (bookTab === 0) {
    const w = el("div", "chartwrap"); w.innerHTML = chartSVG(anim); body.append(w);
    body.append(el("h4", "", L.seaRules));
    if (!S.rules.length) body.append(el("p", "dim", L.noRules));
    else { const ol = el("ol", "rules"); S.rules.forEach(r => { const li = el("li"), b = el("button", "rule", r); b.onclick = () => narrate(r, "pip", (G.audio || {})["rule_" + G.rules.indexOf(r)]); li.append(b); ol.append(li); }); body.append(ol, el("p", "dim", L.tapRule)); }
  } else if (bookTab === 1) {
    if (!S.clues.length) body.append(el("p", "dim", L.noClues));
    S.clues.forEach(c => { const d = el("div", "clue"); d.append(el("b", "", c.title), el("p", "", c.text)); body.append(d); });
  } else {
    const r = room(), mine = (r.items || []).filter(i => S.items.has(i.id));
    if (!mine.length) body.append(el("p", "dim", L.noItems));
    mine.forEach(it => {
      const b = el("button", "item" + (S.hold === it.id ? " held" : "")); b.append(art(it.art, it.name), el("span", "", it.name));
      b.onclick = () => useItem(it); body.append(b);
    });
  }
}
function useItem(it) {
  const h = room().hotspots.find(x => x.fromItem === it.id && S.done.has(x.after[0]));
  if (h) { closeBook(); return openInspect(h); }
  S.hold = S.hold === it.id ? null : it.id; updateHeld(); closeBook(); if (S.hold) toast(`${L.holding}: ${it.name}`);
}
function updateHeld() {
  const b = $("#held"), it = S.hold && (room().items || []).find(i => i.id === S.hold);
  b.hidden = !it; if (it) { b.textContent = `${L.holding}: ${it.name}`; b.onclick = () => { S.hold = null; updateHeld(); }; }
}
function updateStrip() {
  const s = $("#strip"); s.innerHTML = ""; const r = room(); if (!r.find.length) return;
  s.append(el("small", "", L.findStrip));
  r.find.forEach(id => { const done = S.done.has(id), h = hsById(id), it = r.items.find(i => i.id === h.item), c = el("span", "slot" + (done ? " got" : ""));
    if (done) { c.append(art(it.art, it.name)); c.append(el("i", "", "✓")); } else c.textContent = "?"; s.append(c); });
}
function updateHint() {
  const r = room(), left = SC_hints() - (S.hints[r.id] || 0); $("#btn-hint i").textContent = left; $("#btn-hint").disabled = left <= 0;
}
const SC_hints = () => G.config.hintsPerRoom;
function updateBookBtn() { $("#btn-book").disabled = S.rulesOpen; }
function hint() {
  if (!S.playing || !$("#pause").hidden) return;
  const r = room(), used = S.hints[r.id] || 0; if (used >= SC_hints()) return toast(G.ui.toasts.noHints);
  if (S.fortune < SC.hint) return toast(G.ui.toasts.noFortune);   // a hint costs Fortune; refuse it, charge nothing
  S.hints[r.id] = used + 1; addFortune(-SC.hint); S.tally.hints++; updateHint();
  const bank = r.id === "r7" ? `r7.lock${Math.min(S.locksDone + 1, 3)}` : r.bank, t = $("#panel").hidden && nextTarget();
  if (t && t.hint) { flash(t); say(pointer(t)); } else say(`${bank}.wrong${used + 2}`);
}

/* ---------- panorama + hotspots ---------- */
const GLYPH = { LEARN: "", FIND: "◆", INSPECT: "i", USE: "↻", PANEL: "⚙", AUTO: "➜" };
function visible(h) { return !S.done.has(h.id) && h.after.every(a => S.done.has(a)); }
function nextTarget() {
  const r = room(), h = r.hotspots.find(x => visible(x) && !x.optional && x.yaw != null);
  return h || (S.cleared && r.exit) || null;
}
let shown = new Map();
function renderHotspots() {
  if (!viewer) return;
  const r = room(), want = r.hotspots.filter(h => visible(h) && h.yaw != null); if (S.cleared && r.exit) want.push({ ...r.exit, kind: "AUTO" });
  for (const id of [...shown.keys()]) if (!want.some(h => h.id === id)) { viewer.removeHotSpot(id); shown.delete(id); }
  for (const h of want) if (!shown.has(h.id)) {
    viewer.addHotSpot({ id: h.id, type: "custom", yaw: h.yaw, pitch: h.pitch, cssClass: "hs hs-" + h.kind.toLowerCase(),
      createTooltipFunc: e => { e.textContent = GLYPH[h.kind]; e.setAttribute("role", "button"); shown.set(h.id, e);
        if (h.kind === "FIND") { const it = r.items.find(i => i.id === h.item), im = new Image(); im.onload = () => { e.style.backgroundImage = `url(${im.src})`; e.classList.add("sprite"); e.textContent = ""; }; im.src = `assets/cut/${it.art}.png`; } },
      clickHandlerFunc: () => onHotspot(h) });
    if (!shown.has(h.id)) shown.set(h.id, null);
  }
}
const pointer = t => ({ pausesTimer: false, lines: [{ who: "pip", text: t.hint, audioFile: t.hintAudio }] });
function flash(t) { const e = shown.get(t.id); if (!e) return; e.classList.add("flash"); setTimeout(() => e.classList.remove("flash"), 4000); }
function fly(h) {
  const e = shown.get(h.id), r0 = room(); if (!e) return; const a = e.getBoundingClientRect(), b = $("#btn-book").getBoundingClientRect(), f = el("div", "fly");
  f.style.cssText = `left:${a.left}px;top:${a.top}px;background-image:url(assets/cut/${r0.items.find(i => i.id === h.item).art}.png)`; document.body.append(f);
  requestAnimationFrame(() => f.style.transform = `translate(${b.left - a.left}px,${b.top - a.top}px) scale(.3)`); setTimeout(() => f.remove(), G.config.flyMs);
}
function onHotspot(h) {
  if (!S.playing || modalOpen()) return;
  if (h.kind === "AUTO") return travel(h);
  if (h.use && S.hold !== h.use) return toast(S.hold ? G.ui.toasts.wrongTarget : G.ui.toasts.noHold);   // a wrong target costs nothing
  run(h);
}
function run(h) {
  if (h.use) { S.hold = null; updateHeld(); }
  const lines = () => (h.lines || []).forEach(l => say(l));
  if (h.kind === "PANEL") return openPanel(h);
  if (h.kind === "INSPECT") return openInspect(h);
  S.done.add(h.id);
  const find = h.kind === "FIND", note = find ? G.ui.toasts.savedItem : G.ui.toasts.saved; let extra;
  if (find) { fly(h); S.items.add(h.item); addFortune(SC.item); S.tally.items++; updateStrip(); }
  else saveClue(h.card.title, h.card.text);
  if (h.effect === "flashes") extra = flashRow(G.panels.pp_bells);
  if (h.effect === "knocks") { extra = el("button", "", L.replay); extra.onclick = () => knocks(G.panels.pp_knock.groups); knocks(G.panels.pp_knock.groups); }
  if (h.effect === "pool" || h.effect === "glow" || h.effect === "chalk") S.flags[h.effect] = true;
  if (h.effect === "openChart") { renderHotspots(); lines(); return openBook(0); }
  card(h.card.title, h.card.text, note, extra); lines(); renderHotspots();
}
function flashRow(P) {
  const w = el("div", "flashes"), dots = P.flashes.map(n => { const d = el("span", "dot"); d.style.background = P.colors[n]; w.append(d); return d; }), b = el("button", "", L.replay);
  const play = () => dots.forEach((d, i) => { setTimeout(() => { d.classList.add("on"); tone(P.freq[P.flashes[i]], .2, "sine", .1); setTimeout(() => d.classList.remove("on"), G.config.flashMs * .7); }, i * G.config.flashMs); });
  b.onclick = play; w.append(b); setTimeout(play, 300); return w;
}

/* ---------- inspect close-ups ---------- */
function openInspect(h) {
  const first = !S.done.has(h.id); S.done.add(h.id); renderHotspots();
  let v = 0;
  const showView = () => {
    const vw = h.views[v]; saveClue(vw.title, vw.text);
    shell(vw.title, b => {
      const a = el("div", "insp"); a.append(art(vw.art, vw.title, "big")); b.append(a);
      b.append(el("p", "plate" + (vw.plate ? " on" : ""), vw.text));
      if (h.secret && v === h.views.length - 1 && h.views.length > 1 && !S.secrets.has(h.id)) { S.secrets.add(h.id); addFortune(SC.secret); S.tally.secrets++; say(h.secret.line); b.append(el("p", "secret", L.secret)); }
      if (v < h.views.length - 1) { const t = el("button", "", L.turn); t.onclick = () => { v++; showView(); }; b.append(t); }
    });
  };
  showView(); if (first) (h.lines || []).forEach(l => say(l)); }

/* ---------- panels: shell, wrong, solved ---------- */
function shell(title, build) {
  const p = $("#panel"); p.querySelector("h3").textContent = title; const body = p.querySelector(".body"); body.innerHTML = ""; build(body); p.hidden = false; applyLock();
}
function closePanel() { $("#panel").hidden = true; S.rulesOpen = false; updateBookBtn(); }
let lockIv;
function applyLock() {
  const p = $("#panel"), m = p.querySelector(".lockmsg"), left = S.lockUntil - performance.now();
  clearInterval(lockIv);
  if (left <= 0) { p.classList.remove("locked"); m.textContent = ""; return; }
  p.classList.add("locked");
  const tick = () => { const l = S.lockUntil - performance.now(); if (l <= 0) { clearInterval(lockIv); p.classList.remove("locked"); m.textContent = ""; } else m.textContent = `${L.lockWait} ${Math.ceil(l / 1000)}`; };
  tick(); lockIv = setInterval(tick, 250);
}
function wrong(c) {
  addFortune(-SC.wrong); S.tally.wrongs++; const n = S.wrongs[c.P.bank] = (S.wrongs[c.P.bank] || 0) + 1;
  say(`${c.P.bank}.wrong${Math.min(n, 3)}`); S.lockUntil = performance.now() + G.config.lockoutMs; applyLock();
}
async function solved(c) {
  const s = c.hs.solve || {}; closePanel(); S.done.add(c.hs.id); renderHotspots();
  if (s.lock) { addFortune(SC.lock); S.tally.locks++; S.locksDone++; chord(); toast(G.ui.toasts.ring[s.lock - 1]); }
  if (s.line) await say(s.line);
  if (s.reward) await reward();
  updateHint();
}
function openPanel(h) {
  const P = G.panels[h.panel], c = { hs: h, P, st: S.pstate[h.panel] || (S.pstate[h.panel] = {}) };
  shell(P.title, b => PANEL[P.type](b, P, c));
}

/* ---------- the room reward: narration first, then the Chart inks a leg and a Sea Rule is written ---------- */
async function reward() {
  const r = room(); await say(r.right);
  const i = S.legs++; chord();
  const closed = openBook(0, i);
  setTimeout(() => { if (i < 6) S.rules.push(G.rules[i]); if (!$("#book").hidden) renderBook(-1); }, G.config.inkMs);
  await closed;
  if (r.id === "r7") return ending();
  addFortune(SC.room); S.tally.rooms++; S.cleared = true; renderHotspots(); toast(G.ui.toasts.wayForward);
}

/* ---------- panel types ---------- */
PANEL.bells = (b, P, c) => {
  const st = c.st; st.seq = st.seq || [];
  const sig = el("div", "box"); sig.append(el("small", "", L.signal)); sig.append(flashRow(P));
  const mine = el("div", "flashes mine"), row = el("div", "bells");
  const draw = () => { mine.innerHTML = ""; P.answer.forEach((_, i) => { const d = el("span", "dot"); if (st.seq[i]) d.style.background = P.colors[st.seq[i]]; mine.append(d); }); };
  P.bells.forEach(n => { const k = el("button", "bell", n); k.style.background = P.colors[n]; k.onclick = () => {
    tone(P.freq[n], .5, "triangle", .2); st.seq.push(n);
    if (n !== P.answer[st.seq.length - 1]) { st.seq = []; draw(); return wrong(c); }
    draw(); if (st.seq.length === P.answer.length) { st.seq = []; solved(c); } }; row.append(k); });
  b.append(sig, row, mine); draw();
};
PANEL.hold = (b, P, c) => {
  const n = c.st.n || (c.st.n = {}), tot = () => { const t = { weight: 0, water: 0, food: 0, oil: 0 }; P.crates.forEach(x => { const k = n[x.id] || 0; t.weight += k * x.weight; for (const f of ["water", "food", "oil"]) t[f] += k * (x[f] || 0); }); return t; };
  const draw = () => { b.innerHTML = ""; const t = tot();
    P.crates.forEach(x => { const r = el("div", "crate"), g = ["water", "food", "oil"].filter(f => x[f]).map(f => `${L[f]} +${x[f]}`).join(", ");
      const m = el("button", "", "−"), p = el("button", "", "+"); m.onclick = () => { if (n[x.id]) { n[x.id]--; draw(); } };
      p.onclick = () => { if (t.weight + x.weight > P.limit) return toast(G.ui.toasts.full); n[x.id] = (n[x.id] || 0) + 1; draw(); };
      r.append(el("span", "nm", x.name), el("small", "", `${L.weight} ${x.weight}${g ? " · " + g : ""}`), m, el("b", "", n[x.id] || 0), p); b.append(r); });
    const sum = el("div", "sum"); [["weight", `${t.weight}/${P.limit}`], ["water", `${t.water}/${P.needs.water}`], ["food", `${t.food}/${P.needs.food}`], ["oil", `${t.oil}/${P.needs.oil}`]].forEach(([k, v]) => sum.append(el("span", "", `${L[k]}: ${v}`))); b.append(sum);
    const go = el("button", "go", L.setSail); go.onclick = () => (t.water >= P.needs.water && t.food >= P.needs.food && t.oil >= P.needs.oil && t.weight <= P.limit) ? solved(c) : wrong(c); b.append(go); };
  draw();
};
PANEL.jigsaw = (b, P, c) => {
  const st = c.st; st.placed = st.placed || []; const N = P.cols * P.rows, order = G.config.jigsawOrder; let sel = null;
  const bg = i => `background-image:url(${P.image});background-size:${P.cols * 100}% ${P.rows * 100}%;background-position:${(i % P.cols) / (P.cols - 1) * 100}% ${Math.floor(i / P.cols) / (P.rows - 1) * 100}%`;
  const draw = () => { b.innerHTML = ""; const board = el("div", "jboard"), tray = el("div", "jtray"); board.style.gridTemplateColumns = `repeat(${P.cols},1fr)`;
    for (let i = 0; i < N; i++) { const s = el("button", "jslot"); if (st.placed.includes(i)) { s.setAttribute("style", bg(i)); s.classList.add("ok"); s.disabled = true; } else s.onclick = () => {
      if (sel == null) return; if (sel === i) { st.placed.push(i); sel = null; draw(); if (st.placed.length === N) solved(c); } else { s.classList.add("shake"); setTimeout(() => s.classList.remove("shake"), 400); } }; board.append(s); }
    order.filter(i => !st.placed.includes(i)).forEach(i => { const p = el("button", "jpiece" + (sel === i ? " sel" : "")); p.setAttribute("style", bg(i)); p.textContent = ""; p.onclick = () => { sel = sel === i ? null : i; draw(); }; tray.append(p); });
    b.append(el("small", "", `${L.slots}: ${st.placed.length}/${N}`), board, el("small", "", L.tray), tray); };
  draw();
};
PANEL.route = (b, P, c) => {
  const st = c.st; st.path = st.path || []; const isl = id => P.islands.find(i => i.id === id);
  const draw = () => { b.innerHTML = ""; let s = `<svg viewBox="0 0 300 380" class="route">`;
    P.dotted.forEach(([a, z]) => s += `<line class="dot" x1="${isl(a).x}" y1="${isl(a).y}" x2="${isl(z).x}" y2="${isl(z).y}"/>`);
    P.solid.forEach(([a, z]) => s += `<line class="sol" x1="${isl(a).x}" y1="${isl(a).y}" x2="${isl(z).x}" y2="${isl(z).y}"/>`);
    if (st.path.length > 1) s += `<polyline class="mine" points="${st.path.map(id => isl(id).x + "," + isl(id).y).join(" ")}"/>`;
    P.islands.forEach(i => s += `<g class="isl${st.path.includes(i.id) ? " on" : ""}" data-id="${i.id}"><circle cx="${i.x}" cy="${i.y}" r="16"/><text x="${i.x}" y="${i.y + 30}" text-anchor="middle">${i.name}</text></g>`);
    const w = el("div"); w.innerHTML = s + "</svg>"; b.append(w);
    w.querySelectorAll(".isl").forEach(g => g.onclick = () => { if (!st.path.includes(g.dataset.id)) { st.path.push(g.dataset.id); tone(300 + st.path.length * 60, .15); draw(); } });
    const row = el("div", "row"), cl = el("button", "", L.clear), ok = el("button", "go", L.confirm);
    cl.onclick = () => { st.path = []; draw(); }; ok.onclick = () => { if (st.path.join() === P.answer.join()) solved(c); else { st.path = []; draw(); wrong(c); } }; row.append(cl, ok); b.append(row); };
  draw();
};
function beam(P, m) {                                  // pure beam trace; the solvability test repeats this logic
  let col = 0, row = P.lamp, dx = 1, dy = 0; const pts = [[col, row]];
  for (let n = 0; n < 60; n++) {
    col += dx; row += dy; pts.push([col, row]);
    if (col === P.cols + 1) return { pts, lit: row === P.window && dx === 1 };
    if (col < 1 || row < 1 || row > P.rows) return { pts, lit: false };
    if (col === P.pillar[0] && row === P.pillar[1]) return { pts, lit: false };
    const mir = P.mirrors.find(x => x.col === col && x.row === row);
    if (mir) [dx, dy] = m[mir.id] === "/" ? [-dy, -dx] : [dy, dx];
  }
  return { pts, lit: false };
}
PANEL.mirrors = (b, P, c) => {
  const st = c.st; if (!st.m) { st.m = {}; P.mirrors.forEach(x => st.m[x.id] = x.start); } const Z = 52;
  const draw = () => { b.innerHTML = ""; const r = beam(P, st.m), w = el("div", "mgrid"); w.style.cssText = `width:${(P.cols + 2) * Z}px;height:${P.rows * Z}px`;
    for (let rw = 1; rw <= P.rows; rw++) for (let cl = 0; cl <= P.cols + 1; cl++) { const cell = el("div", "mc"); cell.style.cssText = `left:${cl * Z}px;top:${(rw - 1) * Z}px;width:${Z}px;height:${Z}px`;
      if (cl === 0 && rw === P.lamp) cell.classList.add("lamp"); if (cl === P.cols + 1 && rw === P.window) { cell.classList.add("win"); if (r.lit) cell.classList.add("lit"); }
      if (cl === P.pillar[0] && rw === P.pillar[1]) cell.classList.add("pillar");
      const m = P.mirrors.find(x => x.col === cl && x.row === rw); if (m) { const k = el("button", "mir", ""); k.innerHTML = `<svg viewBox="0 0 10 10"><line x1="${st.m[m.id] === "/" ? 1 : 1}" y1="${st.m[m.id] === "/" ? 9 : 1}" x2="9" y2="${st.m[m.id] === "/" ? 1 : 9}"/></svg>`; k.onclick = () => { st.m[m.id] = st.m[m.id] === "/" ? "\\" : "/"; draw(); }; cell.append(k); }
      w.append(cell); }
    const sv = document.createElementNS("http://www.w3.org/2000/svg", "svg"); sv.setAttribute("class", "beam"); sv.setAttribute("width", (P.cols + 2) * Z); sv.setAttribute("height", P.rows * Z);
    const pl = document.createElementNS(sv.namespaceURI, "polyline"); pl.setAttribute("points", r.pts.map(([x, y]) => `${x * Z + Z / 2},${(y - 1) * Z + Z / 2}`).join(" ")); sv.append(pl); w.append(sv);
    const go = el("button", "go", L.fire); go.onclick = () => r.lit ? solved(c) : wrong(c); b.append(w, go); };
  draw();
};
PANEL.knock = (b, P, c) => {
  const st = c.st; st.slots = st.slots || [];
  const draw = () => { b.innerHTML = ""; const top = el("div", "row"), rp = el("button", "", L.replay); rp.onclick = () => knocks(P.groups); top.append(rp); b.append(top);
    if (S.flags.pool) b.append(el("p", "rings", P.groups.map(n => "○".repeat(n)).join("   ")));
    const sl = el("div", "slots"); for (let i = 0; i < P.answer.length; i++) sl.append(el("span", "s", st.slots[i] || "")); b.append(sl);
    const sh = el("div", "shells"); P.letters.forEach(l => { const k = el("button", "shell", l); k.disabled = st.slots.includes(l); k.onclick = () => { st.slots.push(l); tone(200, .1);
      if (st.slots.length === P.answer.length) { const ok = st.slots.join("") === P.answer; st.slots = []; if (ok) solved(c); else { draw(); wrong(c); } } else draw(); }; sh.append(k); }); b.append(sh);
    const cl = el("button", "", L.clear); cl.onclick = () => { st.slots = []; draw(); }; b.append(cl); };
  draw();
};
const GL = { star: `<path d="M12 2l3 7 7 .6-5.4 4.6L18.2 22 12 18l-6.2 4 1.6-7.8L2 9.6 9 9z"/>`, shell: `<path d="M12 3a9 9 0 1 0 0 18 7 7 0 0 0 0-14 5 5 0 0 0 0 10"/>`,
  wave: `<path d="M2 9q5-6 10 0t10 0M2 15q5-6 10 0t10 0"/>`, fish: `<path d="M3 12q6-8 13 0-7 8-13 0zM16 12l6-5v10z"/>` };
PANEL.bridge = (b, P, c) => {
  const st = c.st; st.step = st.step || 0; st.marks = st.marks || {};
  const draw = () => { b.innerHTML = ""; const grid = el("div", "bgrid");
    for (let r = P.rows.length; r >= 1; r--) for (let k = 1; k <= 4; k++) { const sym = P.rows[r - 1][k - 1], s = el("button", "stone"); s.innerHTML = `<svg viewBox="0 0 24 24" class="${sym}">${GL[sym]}</svg>`;
      if (P.answer.slice(0, st.step).some(([a, z]) => a === r && z === k)) s.classList.add("trod"); if (st.marks[r + "," + k]) s.classList.add("marked");
      s.onclick = () => { if (st.mark) { st.marks[r + "," + k] = !st.marks[r + "," + k]; return draw(); }
        const [er, ek] = P.answer[st.step]; if (r === er && k === ek) { st.step++; tone(260 + st.step * 80, .2); draw(); if (st.step === P.answer.length) { st.step = 0; solved(c); } }
        else { s.classList.add("crumb"); wrong(c); } }; grid.append(s); }
    b.append(grid);
    if (S.flags.chalk) { const m = el("button", st.mark ? "on" : "", L.markMode); m.onclick = () => { st.mark = !st.mark; draw(); }; b.append(m); } };
  draw();
};
PANEL.lock = (b, P, c) => {
  const st = c.st; const draw = () => { b.innerHTML = ""; S.rulesOpen = !!st.choosing; updateBookBtn();
    if (!st.choosing) { b.append(el("small", "", L.gate), el("p", "gate", P.says)); const k = el("button", "go", L.chooseRule); k.onclick = () => { st.choosing = true; st.pick = null; draw(); }; b.append(k); return; }
    const list = el("div", "rulelist"); G.rules.forEach((r, i) => { const k = el("button", "rulecard" + (st.pick === i ? " on" : ""), r); k.onclick = () => { st.pick = i; draw(); }; list.append(k); });
    const row = el("div", "row"), back = el("button", "", L.cont), ok = el("button", "go", L.answer); ok.disabled = st.pick == null;
    back.onclick = () => { st.choosing = false; draw(); };
    ok.onclick = () => { const good = st.pick === P.answer; st.choosing = false; st.pick = null; S.rulesOpen = false; updateBookBtn(); if (good) solved(c); else { draw(); wrong(c); } };
    row.append(back, ok); b.append(list, row); };
  draw();
};

/* ---------- timer + idle + compass ---------- */
function tick() {
  const now = performance.now(), dt = (now - T.last) / 1000; T.last = now;
  syncVoice();
  if (!S.playing) return;
  if (!T.holds.size) S.left -= dt;
  $("#timer").textContent = fmt(S.left); $("#timer").classList.toggle("low", S.left <= 30);
  if (S.left <= 0) return timeUp();
  const idle = (now - S.lastInput) / 1000, [a, b] = G.config.idleSeconds;
  if (!T.holds.size && !modalOpen() && $("#dlg").hidden) {
    if (S.idle === 0 && idle > a) { S.idle = 1; const t = nextTarget(); if (t && t.hint) { flash(t); say(pointer(t)); } else say(room().idle); }
    else if (S.idle === 1 && idle > a + b) { S.idle = 2; say({ pausesTimer: false, lines: [{ who: "pip", text: G.ui.toasts.turnAround, audioFile: (G.audio || {}).turnAround }] }); }
  }
}
function compassLoop() {
  const t = nextTarget(), n = $("#needle");
  if (t && S.playing && viewer) { n.classList.remove("wobble"); let d = t.yaw - viewer.getYaw(); d = ((d + 540) % 360) - 180; n.style.transform = `rotate(${d}deg)`; }
  else n.classList.add("wobble");
  requestAnimationFrame(compassLoop);
}

/* ---------- end screens ---------- */
function endShell(title, lines, stats, btns) {
  S.playing = false; stopVoice(); $("#dlg").hidden = true; closeCard(); closePanel(); closeBook(); const p = $("#end"); p.querySelector("h3").textContent = title;
  $("#end-lines").innerHTML = lines; $("#end-stats").innerHTML = stats; const bx = $("#end-btns"); bx.innerHTML = ""; btns.forEach(([t, f]) => { const b = el("button", "", t); b.onclick = f; bx.append(b); }); p.hidden = false;
}
const again = () => location.reload();
function timeUp() {
  const e = G.ui.end.timeUp;
  endShell(e.title, e.lines.map(l => `<p><b>${G.speakers[l.who].name}:</b> ${l.text}</p>`).join(""),
    `${e.rules}: ${S.rules.length}<br>${S.rules.map(r => `<i>${r}</i>`).join("<br>")}<br>${e.fortune}: ${S.fortune}`, [[G.ui.buttons.tryAgain, again]]);
}
async function ending() {
  hold("end"); await say("ending"); release("end");
  const w = G.ui.end.win, sc = G.config.scores, t = S.tally, bonus = Math.floor(S.left) * sc.perSecond, pen = t.wrongs * sc.wrong + t.hints * sc.hint, total = S.fortune + bonus;
  const row = (k, v) => `<p><b>${k}</b> ${v}</p>`;
  endShell(w.title, `<div class="win">${["juno", "pip"].map(k => `<span class="face" style="background:${G.speakers[k].color}"><img src="assets/cut/bust_${k}_happy.png" alt="" onerror="this.remove()">${G.speakers[k].name[0]}</span>`).join("")}</div>`,
    row(w.items, `${t.items} × ${sc.item} = ${t.items * sc.item}`) + row(w.secrets, `${t.secrets} × ${sc.secret} = ${t.secrets * sc.secret}`) + row(w.rooms, `${t.rooms} × ${sc.room} = ${t.rooms * sc.room}`) +
    row(w.locks, `${t.locks} × ${sc.lock} = ${t.locks * sc.lock}`) + row(w.time, `+${bonus}`) + row(w.penalties, `−${pen}`) + `<h3>${w.total}: ${total}</h3>` + row(w.timeLeft, fmt(S.left)),
    [[G.ui.buttons.playAgain, again], [w.close, () => $("#end").hidden = true]]);
}

/* ---------- start flow + rooms ---------- */
const tap = e => new Promise(r => e.addEventListener("click", r, { once: true }));
async function tutorial() {
  const t = $("#tut"), spot = $("#spot"), p = t.querySelector("p"); t.hidden = false;
  $("#tut-next").textContent = G.ui.buttons.next; $("#tut-skip").textContent = G.ui.buttons.skip;
  await new Promise(res => {
    let i = 0; const show = () => {
      const s = G.ui.tutorial[i]; p.textContent = s.text;
      const e = s.target && $(s.target), r = e ? e.getBoundingClientRect() : { left: innerWidth * .15, top: innerHeight * .25, width: innerWidth * .7, height: innerHeight * .3 };
      Object.assign(spot.style, { left: r.left - 6 + "px", top: r.top - 6 + "px", width: r.width + 12 + "px", height: r.height + 12 + "px" });
    };
    $("#tut-next").onclick = () => { if (++i >= G.ui.tutorial.length) res(); else show(); };
    $("#tut-skip").onclick = res; show();
  });
  t.hidden = true;
}
function blur(on) { const p = $("#pano"); p.style.transition = `filter ${G.config.sharpenMs}ms ease`; p.style.filter = on ? `blur(${G.config.blurPx}px)` : "none"; }
function enterRoom(id) {
  S.room = id; S.cleared = false; S.hold = null; S.idle = 0; S.lastInput = performance.now(); shown = new Map(); const r = room();
  document.documentElement.style.setProperty("--accent", r.accent);
  $("#objective").textContent = r.objective; updateHeld(); updateStrip(); updateHint();
  if (viewer) viewer.destroy();
  viewer = pannellum.viewer("pano", { type: "equirectangular", panorama: r.panorama, autoLoad: true, showControls: false, hfov: 100, minHfov: 60, maxHfov: 120, compass: false, mouseZoom: false });
  viewer.on("load", () => { renderHotspots(); const t = nextTarget(); if (t && t.yaw != null) { viewer.setYaw(t.yaw, false); viewer.setPitch(Math.max(-20, Math.min(20, t.pitch)), false); } });   // face the first thing to do
  if (DEBUG) viewer.on("mousedown", e => { const [pitch, yaw] = viewer.mouseEventToCoords(e); const m = `yaw ${yaw.toFixed(1)}  pitch ${pitch.toFixed(1)}`; $("#debug").textContent = m; $("#debug").hidden = false; console.log(m); });
}
async function travel(h) {
  if (!$("#dlg").hidden) $("#dlg .skip").click();
  const f = $("#fade"); f.classList.add("on"); await new Promise(r => setTimeout(r, G.config.fadeMs));
  enterRoom(h.to); await new Promise(r => setTimeout(r, G.config.fadeMs)); f.classList.remove("on");
  await arrive();
}
async function arrive() { const r = room(); await say(r.enter); }
async function startFlow() {
  const st = $("#s-start"), info = $("#s-info"), m = G.ui.mission;
  await tap(st); S.unlocked = true; st.hidden = true;
  if (window.speechSynthesis) speechSynthesis.cancel();
  bgm = new Audio("assets/audio/bgm.mp3"); bgm.loop = true; bgm.volume = G.config.musicVolume; bgm.onerror = () => bgm = null;
  info.hidden = false; narrate([m.heading, ...m.paragraphs].join(". "), "narrator", m.audioFile);
  await tap(info.querySelector("button")); stopVoice(); info.hidden = true;
  showHud(); await tutorial();
  await say("opening");
  beginPlay();
}
const showHud = () => { $("#hud").hidden = false; $("#hud-top").hidden = false; };
async function beginPlay() {
  blur(false); $("#objective").hidden = false; S.playing = true; S.left = G.config.timerSeconds; S.lastInput = performance.now();
  if (bgm && S.music) bgm.play().catch(() => {});
  await arrive();
}

/* ---------- boot ---------- */
async function boot() {
  G = await (await fetch("game.json")).json(); L = G.ui.labels; SC = G.config.scores;
  const errs = validate(G);
  if (errs.length) { console.error("game.json invalid:\n" + errs.join("\n")); if (DEBUG) { $("#debug").textContent = errs.join("\n"); $("#debug").hidden = false; } }
  const u = G.ui, b = u.buttons;
  document.title = u.title;
  $("#s-start h1").textContent = u.title; $("#s-start .tap").textContent = u.tapToStart;
  $("#s-info small").textContent = u.mission.kicker; $("#s-info h2").textContent = u.mission.heading;
  $("#s-info .paras").innerHTML = u.mission.paragraphs.map(t => `<p>${t}</p>`).join(""); $("#s-info button").textContent = u.mission.button;
  $("#fortune small").textContent = u.hud.fortune; $("#timer").textContent = fmt(G.config.timerSeconds);
  document.querySelectorAll(".x").forEach(x => x.setAttribute("aria-label", b.close));
  const sk = el("button", "skip", b.skip); $("#dlg-box").append(sk);
  const pa = $("#pause"); pa.querySelector("h3").textContent = u.pause.title;
  const pb = a => pa.querySelector(`[data-a=${a}]`); pb("resume").textContent = b.resume; pb("quit").textContent = b.quit;
  const labels = () => { pb("voice").textContent = S.voice ? u.pause.narrationOn : u.pause.narrationOff; pb("music").textContent = S.music ? u.pause.musicOn : u.pause.musicOff; }; labels();

  $("#card .x").onclick = closeCard; $("#panel .x").onclick = closePanel; $("#book .x").onclick = closeBook;
  for (const [id, f] of [["card", closeCard], ["panel", closePanel], ["book", closeBook]]) $("#" + id).onclick = e => { if (e.target.id === id) f(); };
  addEventListener("keydown", e => { if (e.key !== "Escape") return; if (!$("#book").hidden) closeBook(); else if (!$("#panel").hidden) closePanel(); else closeCard(); });
  $("#btn-book").onclick = () => S.playing && openBook(2); $("#btn-hint").onclick = hint;
  $("#btn-pause").onclick = () => { if (!S.playing) return; hold("pause"); pa.hidden = false; window.speechSynthesis && speechSynthesis.pause(); };
  pb("resume").onclick = () => { pa.hidden = true; release("pause"); window.speechSynthesis && speechSynthesis.resume(); };
  pb("voice").onclick = () => { S.voice = !S.voice; if (!S.voice) stopVoice(); labels(); };
  pb("music").onclick = () => { S.music = !S.music; if (bgm) S.music ? bgm.play().catch(() => {}) : bgm.pause(); labels(); };
  pb("quit").onclick = () => location.reload();
  addEventListener("pointerdown", () => { S.lastInput = performance.now(); S.idle = 0; }, true);

  $("#objective").hidden = true; enterRoom("r1"); blur(true);
  T.last = performance.now(); setInterval(tick, 250); compassLoop();
  if (DEBUG) window.__bfs = { S, G, T, say, validate, run, hsById, enterRoom, openPanel, solved, beam, arrive, reward, ending, hint, v: () => viewer, bgm: () => bgm };
  if (DEBUG && /[?&]go=play/.test(location.search)) { S.unlocked = true; $("#s-start").hidden = true; showHud(); beginPlay(); return; }
  startFlow();
}
boot();
})();
