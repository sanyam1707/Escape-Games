"use strict";
/* Legacy of Olympus. All text and numbers come from game.json. */

// ---------- pure logic (also used by tools/solvability_test.js) ----------
const TURN = { "/": { E: "N", N: "E", W: "S", S: "W" }, "\\": { E: "S", S: "E", W: "N", N: "W" } };
const STEP = { E: [0, 1], N: [-1, 0], W: [0, -1], S: [1, 0] };
function traceBeam(p, states) { // beam enters the left socket of entryRow going east
  let r = p.entryRow, c = 1, d = "E"; const path = [];
  for (let i = 0; i < 100 && r >= 1 && r <= p.size && c >= 1 && c <= p.size; i++) {
    path.push([r, c]);
    if (r === p.target[0] && c === p.target[1]) return { hit: true, path };
    const m = p.mirrors.findIndex(x => x[0] === r && x[1] === c);
    if (m >= 0) d = TURN[states[m]][d];
    r += STEP[d][0]; c += STEP[d][1];
  }
  return { hit: false, path };
}
const shiftBack = (t, n) => [...t].map(ch => String.fromCharCode((ch.charCodeAt(0) - 65 - n + 260) % 26 + 65)).join("");
const bowlsOk = v => v[0] === 2 * v[1] && v[2] === v[1] + 4 && v[0] + v[1] + v[2] === 20;
const currentHint = (room, done) => room.hints.find(s => !s.done.every(d => done.has(d)));

// ---------- validate(): ids, references, cycles, dialogue fields ----------
function validate(G) {
  const errs = [], ids = new Map(), L = G.lines || {}, sp = G.speakers || {}, items = G.items || {};
  const key = (k, where) => { if (!L[k]) errs.push(`${where}: unknown line "${k}"`); };
  for (const [k, l] of Object.entries(L)) {
    if (!sp[l.speaker]) errs.push(`line ${k}: unknown speaker "${l.speaker}"`);
    if (typeof l.pausesTimer !== "boolean") errs.push(`line ${k}: pausesTimer must be true or false`);
    if (!l.text) errs.push(`line ${k}: empty text`);
  }
  for (const [k, i] of Object.entries(items)) if (!i.name || !i.desc) errs.push(`item ${k}: needs name and desc`);
  (G.start.opening || []).forEach(k => key(k, "opening")); key(G.start.idle, "idle");
  const obtainable = new Set();
  for (const r of G.rooms) {
    (r.enter || []).forEach(k => key(k, r.id + ".enter"));
    if (r.reward) { if (!items[r.reward.id]) errs.push(`${r.id}: reward item unknown`); obtainable.add(r.reward.id); }
    for (const h of r.hotspots) {
      if (ids.has(h.id)) errs.push(`duplicate id ${h.id}`);
      ids.set(h.id, h);
      if (h.say) key(h.say, h.id);
      if (h.kind !== "AUTO" && !(Number.isFinite(h.yaw) && Number.isFinite(h.pitch))) errs.push(`${h.id}: needs yaw and pitch`);
      if (h.kind === "FIND") { if (!items[h.item]) errs.push(`${h.id}: unknown item ${h.item}`); if (!h.say) errs.push(`${h.id}: FIND needs a spoken line telling what the item is for`); obtainable.add(h.item); }
      if (h.kind === "USE" && !h.card) errs.push(`${h.id}: USE needs result text`);
      if (h.kind === "INSPECT" && !(h.views && h.views.length >= 2 && h.views.length <= 4)) errs.push(`${h.id}: INSPECT needs 2 to 4 views`);
      if (h.kind === "PANEL" && !(r.panels && r.panels[h.id])) errs.push(`${h.id}: PANEL has no panel data`);
      for (const v of h.views || []) if (v.clue && !(G.clues || {})[v.clue]) errs.push(`${h.id}: unknown clue ${v.clue}`);
    }
    for (const [pid, p] of Object.entries(r.panels || {})) [].concat(p.wrong || [], p.right || [], p.after || [], p.stuck || []).forEach(k => key(k, pid));
  }
  for (const r of G.rooms) for (const s of r.hints || []) {
    if (!(s.lines && s.lines.length === 2 && s.lines.every(Boolean))) errs.push(`${r.id}: each hint step needs 2 lines`);
    for (const d of s.done) if (!r.hotspots.some(h => h.id === d)) errs.push(`${r.id}: hint step refers to unknown ${d}`);
  }
  for (const h of ids.values()) {
    if (h.kind === "USE" && !obtainable.has(h.needs)) errs.push(`${h.id}: needs ${h.needs}, which nothing gives`);
    for (const a of h.after) if (!ids.has(a)) errs.push(`${h.id}: after "${a}" does not exist`);
  }
  const state = {};
  const visit = id => {
    if (state[id] === 2) return; if (state[id] === 1) { errs.push(`cycle through ${id}`); return; }
    state[id] = 1; (ids.get(id)?.after || []).forEach(a => ids.has(a) && visit(a)); state[id] = 2;
  };
  ids.forEach((_, id) => visit(id));
  return errs;
}
if (typeof module !== "undefined") module.exports = { validate, traceBeam, shiftBack, bowlsOk, currentHint };
if (typeof document !== "undefined") {

const $ = s => document.querySelector(s);
const DEBUG = false; // production build
let G, C, UI, room, viewer, D = null, idleT, last = performance.now(), hotIds = [], onClose = null, lockT = null, playTok = 0;
const S = { t: 0, score: 0, started: false, playing: false, paused: false, done: new Set(), items: [], notes: [], held: null, hintsUsed: 0, stepHints: {},
  unlocked: false, voice: true, roomIdx: 0, prog: {}, wrongN: {}, ember: 1 };
const modalOpen = () => !$("#modal").hidden || !$("#book").hidden;
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
const itemName = id => G.items[id].name;
const ICON = {
  menu: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" stroke-width="3.4"/></svg>', // pause bars
  hint: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4zM8 17h11M9 8h6"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19"/></svg>',
  learn: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"/></svg>',
  inspect: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l6 6"/></svg>',
  use: '<svg viewBox="0 0 24 24"><circle cx="8" cy="12" r="3.5"/><path d="M11.5 12H21M17 12v4M20 12v3"/></svg>',
  panel: '<svg viewBox="0 0 24 24"><path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/></svg>',
  exit: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' };
const svg = (name, host) => { host.innerHTML = ICON[name]; return host; };

// ---------- voice: recorded files first, the browser voice only for a line with no file ----------
let audio = null, speakT = null, voices = []; const preloaded = {};
const loadVoices = () => { voices = window.speechSynthesis?.getVoices() || []; };
if ("speechSynthesis" in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
function stopAudio() { if (audio) { audio.onplaying = audio.onended = audio.onerror = null; audio.pause(); audio = null; } }
function cancelSpeech() { clearTimeout(speakT); window.Snd && Snd.duck(false); window.speechSynthesis?.cancel(); stopAudio(); } // never two voices at once
function pauseSpeech() { audio && !audio.paused && audio.pause(); window.speechSynthesis?.pause?.(); window.Snd && Snd.duck(false); }
function resumeSpeech() { if (audio && audio.paused && !audio.ended) { audio.play().catch(() => {}); window.Snd && Snd.duck(true); } else if (window.speechSynthesis?.paused) speechSynthesis.resume(); }
function preload(url) { if (url && !preloaded[url]) { const a = new Audio(); a.preload = "auto"; a.src = url; preloaded[url] = a; } }
function speakTTS(text, p) {
  if (!("speechSynthesis" in window)) return;
  // Chrome drops speak() right after cancel(), and cuts long utterances: wait a moment and speak sentence by sentence
  speakT = setTimeout(() => {
    if (!voices.length) loadVoices();
    const en = voices.filter(x => /^en/i.test(x.lang)), v = (p.voice && en.find(x => new RegExp(p.voice, "i").test(x.name))) || en.find(x => /US|GB/i.test(x.lang)) || en[0];
    (text.match(/[^.!?]+[.!?]*/g) || [text]).forEach(part => { const u = new SpeechSynthesisUtterance(part.trim()); if (!u.text) return;
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-US"; u.pitch = p.pitch || 1; u.rate = p.rate || 1; u.onend = u.onerror = () => { if (!speechSynthesis.speaking && !speechSynthesis.pending) window.Snd && Snd.duck(false); }; speechSynthesis.speak(u); });
    window.Snd && Snd.duck(true);
  }, 80);
}
function narrate(textOrKey, speaker) {
  const l = typeof textOrKey === "object" ? textOrKey : G.lines[textOrKey], text = l ? l.text : textOrKey, p = G.speakers[l ? l.speaker : speaker] || {};
  cancelSpeech();
  if (!S.unlocked || !S.voice) return; // nothing speaks before the first tap
  if (l?.audioFile) {
    const a = audio = new Audio(l.audioFile), fallback = () => { if (audio === a) { audio = null; speakTTS(text, p); } };
    a.onplaying = () => window.Snd && Snd.duck(true); a.onended = () => { if (audio === a) window.Snd && Snd.duck(false); }; a.onerror = fallback;
    a.play().catch(() => { if (a.error) fallback(); }); // blocked by the browser: stay silent until the next tap; missing file: browser voice
    return;
  }
  speakTTS(text, p);
}
// the first tap anywhere unlocks voice (also when a debug URL skips Tap to Start)
const sfx = (name, arg) => { try { window.Snd && Snd.fx(name, arg); } catch (e) { /* sound is optional */ } };
document.addEventListener("pointerdown", () => { S.unlocked = true; window.Snd && Snd.unlock(); }, { once: true, capture: true });

// ---------- timer ----------
const running = () => S.playing && !S.paused && !(D && D.cur && D.cur.pausesTimer);
function fmt(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
function tick() {
  const n = performance.now(), dt = (n - last) / 1000; last = n;
  if (running()) { S.t -= dt; if (S.t <= 0) { S.t = 0; timeUp(); } }
  $("#clock").textContent = fmt(S.t); $("#clock").classList.toggle("low", S.playing && S.t < 60);
}
function showEnd(e, withScore) {
  sfx(e === G.ending.win ? "win" : "lose");
  $("#end-title").textContent = e.title; $("#end-text").textContent = e.text; $("#end-score").textContent = withScore ? UI.finalKleos + ": " + S.score : "";
  $("#end-again").textContent = e.again; $("#end-close").textContent = e.close; $("#end").hidden = false;
}
function timeUp() { S.playing = false; cancelSpeech(); D = null; $("#dialogue").hidden = true; closeModal(); closeBook(); showEnd(G.ending.lose, true); }

// ---------- score and toast ----------
function add(n) { S.score = Math.max(0, S.score + n); $("#kleos").textContent = S.score; }
function toast(t, ms = 2600) { const e = $("#toast"); e.textContent = t; e.hidden = false; e.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(() => { e.style.opacity = 0; setTimeout(() => e.hidden = true, 260); }, ms); }

// ---------- dialogue: every line waits for a tap, Skip always visible ----------
const lineOf = k => typeof k === "string" ? G.lines[k] : k;
function say(keys) {
  return new Promise(res => { D = { q: [...keys], res, cur: null }; document.body.classList.add("talking"); $("#dialogue").hidden = false; nextLine(); });
}
function nextLine() {
  if (!D) return;
  const k = D.q.shift(); if (!k) return endTalk();
  const l = D.cur = lineOf(k), s = G.speakers[l.speaker];
  $("#d-name").textContent = s.name; $("#d-text").textContent = l.text; $("#d-tap").textContent = UI.tapContinue + " ▸";
  const b = $("#bust"); b.style.background = s.color; b.replaceChildren(s.bust ? sprite(s.bust, s.name) : el("span", "", s.name[0]));
  $("#dialogue").classList.toggle("nobust", l.speaker === "narrator");
  narrate(l);
  const nx = D.q[0] && lineOf(D.q[0]); if (nx && nx.audioFile) preload(nx.audioFile); // the next line is ready before it is needed
}
function endTalk() {
  if (!D) return; const { res } = D; D = null; cancelSpeech();
  $("#dialogue").hidden = true; document.body.classList.remove("talking");
  document.dispatchEvent(new CustomEvent("dialogue-finished")); res();
}
$("#dialogue").onclick = nextLine; $("#skip").onclick = e => { e.stopPropagation(); endTalk(); };

// ---------- modals and the Casebook layer: X, Esc, outside tap; closing is free ----------
function openModal(node, cb) { cancelSpeech(); closeModal(); $("#modal-body").replaceChildren(node); onClose = cb || null; $("#modal").hidden = false; syncPauseBtn(); }
function closeModal() {
  if ($("#modal").hidden) return; $("#modal").hidden = true; playTok++; clearLock(); const f = onClose; onClose = null; syncPauseBtn(); f && f();
}
function closeBook() { $("#book").hidden = true; syncPauseBtn(); }
$("#modal-x").onclick = closeModal; $("#modal").onclick = e => { if (e.target.id === "modal") closeModal(); };
$("#book-x").onclick = closeBook; $("#book").onclick = e => { if (e.target.id === "book") closeBook(); };
document.addEventListener("keydown", e => { if (e.key !== "Escape") return; if (S.paused) resume(); else if (!$("#book").hidden) closeBook(); else closeModal(); });
function sprite(name, label) {
  const w = el("span", "spr"), i = new Image(); i.src = G.art.cutDir + name + "." + (G.config.cutExt || "png"); i.alt = label;
  i.onerror = () => { w.innerHTML = `<svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="19" fill="#5a3d20" stroke="#B87333" stroke-width="3"/><text x="22" y="29" text-anchor="middle" font-size="20" font-family="Cinzel,serif" fill="#F4EBD6">${label[0]}</text></svg>`; };
  w.append(i); return w;
}
function card(title, text, tag, cb, dropcap) { const n = el("div"); n.append(el("h2", "", title), dropcap ? scrollText(text) : el("p", "", text)); if (tag) n.append(el("span", "tag", "✓ " + tag)); openModal(n, cb); }

// ---------- pause: menu with the controls a player needs ----------
function syncPauseBtn() { $("#btn-pause2").hidden = !(modalOpen() && S.started); } // Pause stays reachable above every panel
function pause() { if (S.paused || !S.started) return; sfx("ui"); S.paused = true; document.body.classList.add("paused"); pauseSpeech(); $("#toast").hidden = true; pauseView("main"); $("#pause").hidden = false; }
function resume() { if (!S.paused) return; sfx("ui"); S.paused = false; document.body.classList.remove("paused"); $("#pause").hidden = true; resumeSpeech(); }
function pauseView(v) {
  const b = $("#pause-box"), btn = (t, cls, f) => { const x = el("button", "btn " + (cls || ""), t); x.onclick = f; return x; }; b.replaceChildren();
  if (v === "main") b.append(el("h2", "", UI.paused), btn(UI.resume, "big", resume), btn(UI.casebook, "", () => openBook()), btn(UI.howto, "ghost", () => pauseView("how")),
    btn(Snd.music ? UI.musicOn : UI.musicOff, "ghost", () => { Snd.setMusic(!Snd.music); pauseView("main"); }),
      btn(Snd.sfxOn ? UI.fxOn : UI.fxOff, "ghost", () => { Snd.setFx(!Snd.sfxOn); sfx("ui"); pauseView("main"); }),
      btn(S.voice ? UI.voiceOn : UI.voiceOff, "ghost", () => { S.voice = !S.voice; if (!S.voice) cancelSpeech(); pauseView("main"); }), btn(UI.restart, "ghost", () => pauseView("ask")), el("p", "", UI.timerPaused));
  else if (v === "how") { const ol = el("ol"); G.start.tutorial.forEach(s => ol.append(el("li", "", s.text))); b.append(el("h2", "", UI.howto), ol, btn(UI.back, "", () => pauseView("main"))); }
  else b.append(el("h2", "", UI.restart), el("p", "", UI.restartAsk), btn(UI.yes, "", () => location.reload()), btn(UI.no, "ghost", () => pauseView("main")));
}
$("#btn-pause").onclick = pause;

// ---------- hotspots ----------
const visible = h => h.kind !== "AUTO" && h.after.every(a => S.done.has(a)) && (h.kind === "INSPECT" || !S.done.has(h.id));
const hotName = h => h.name || (h.item && itemName(h.item)) || "";
function mkHot(h) {
  const d = el("div", "hot k-" + h.kind.toLowerCase()); /* k- prefix: "panel" must not match the panel styles */ d.dataset.id = h.id; d.setAttribute("aria-label", hotName(h));
  if (h.kind === "FIND") d.append(sprite(h.item, hotName(h)));
  else d.append(svg(h.kind === "EXIT" ? "exit" : h.kind.toLowerCase(), el("span", "mk")));
  return d;
}
function refresh() {
  const hs = room.hotspots.filter(visible);
  if (viewer) {
    hotIds.forEach(id => { try { viewer.removeHotSpot(id); } catch (e) {} }); hotIds = [];
    hs.forEach(h => { hotIds.push(h.id); viewer.addHotSpot({ id: h.id, pitch: h.pitch, yaw: h.yaw, type: "custom", createTooltipFunc: div => div.append(mkHot(h)), clickHandlerFunc: ev => activate(h, ev.target) }); });
  } else {
    const f = $("#pano .fallback"); f.querySelectorAll(".hot").forEach(x => x.remove());
    hs.forEach(h => { const d = mkHot(h); d.onclick = () => activate(h, d); f.append(d); });
  }
  const strip = $("#strip"); strip.replaceChildren(el("span", "", UI.find));
  room.hotspots.filter(h => h.kind === "FIND").forEach(h => strip.append(el("span", "sil" + (S.done.has(h.id) ? " done" : ""), S.done.has(h.id) ? "✓" : "?")));
  const held = $("#held"); held.hidden = !S.held; if (S.held) held.replaceChildren(sprite(S.held, itemName(S.held)), el("span", "", UI.holding + ": " + itemName(S.held) + "  ✕"));
  const step = currentHint(room, S.done); $("#objective-text").textContent = room.objective;
  $("#hints-left").textContent = Math.max(0, C.hintsPerRoom - S.hintsUsed) || ""; void step;
}
function fly(item, from) {
  const r = from ? from.getBoundingClientRect() : { left: innerWidth / 2 - 28, top: innerHeight / 2 - 28 }, b = $("#btn-book").getBoundingClientRect(), f = el("div", "fly");
  f.append(sprite(item, itemName(item))); f.style.left = r.left + "px"; f.style.top = r.top + "px"; document.body.append(f);
  requestAnimationFrame(() => { f.style.left = b.left + "px"; f.style.top = b.top + "px"; f.style.opacity = .25; f.style.transform = "scale(.4)"; });
  setTimeout(() => f.remove(), 900);
}
function addNote(group, title, text, dropcap) { if (text && !S.notes.some(n => n.group === group && n.title === title)) S.notes.push({ group, title, text, dropcap }); }
// a scroll with illuminated first letters: each line is its own row and its first letter stands out
function scrollText(text, tag = "p") { const box = el(tag === "p" ? "div" : tag, "scroll"); text.split("\n").forEach(l => { const row = el("div", "sline"); row.append(el("span", "cap", l[0]), document.createTextNode(l.slice(1))); box.append(row); }); return box; }
function activate(h, from) {
  if (h.kind === "FIND") { // item flies into the Casebook, then a line tells what it is for
    sfx("pickup"); S.done.add(h.id); S.items.push(h.item); (h.notes || []).forEach(n => addNote(room.name, n.title, n.text)); add(C.itemPoints); fly(h.item, from); toast(UI.added + ": " + itemName(h.item)); refresh(); if (h.say) say([h.say]);
  } else if (h.kind === "LEARN") {
    sfx("page");
    S.done.add(h.id); addNote(room.name, h.name, h.card, h.dropcap); refresh(); card(h.name, h.card, UI.saved, h.say ? () => say([h.say]) : null, h.dropcap);
  } else if (h.kind === "USE") {
    if (S.held) tryUse(h, S.held); else chooser(h);
  } else if (h.kind === "INSPECT") { sfx("page"); inspect(h); }
  else if (h.kind === "PANEL") openPanel(h);
  else if (h.kind === "EXIT") { sfx("exit"); nextRoom(); }
}
function tryUse(h, id) {
  if (id !== h.needs) { sfx("nope"); return toast(UI.wrongItem); }
  sfx("use");
  S.done.add(h.id); if (S.held === id) S.held = null;
  (h.notes || []).forEach(n => addNote(room.name, n.title, n.text)); refresh(); toast(h.card, 3600); if (h.say) say([h.say]);
}
function chooser(h) { // tap a glowing diamond, then pick the item to use: nothing is held automatically
  if (!S.items.length) return toast(UI.noItemsToUse);
  const box = el("div"); box.append(el("h2", "", UI.chooseItem));
  S.items.forEach(id => { const r = el("button", "row2"); r.style.width = "100%"; const t = el("span", "t"); t.append(el("b", "", itemName(id))); r.append(sprite(id, itemName(id)), t);
    r.onclick = () => { closeModal(); tryUse(h, id); }; box.append(r); });
  openModal(box);
}
function inspect(h) {
  let i = 0; const box = el("div"), body = el("div"), nav = el("div", "dots");
  const show = () => {
    const v = h.views[i]; body.replaceChildren(el("h2", "", h.name + ": " + v.title), el("p", "", v.text), el("span", "tag", "✓ " + UI.saved));
    addNote(room.name, h.name + ": " + v.title, v.text); // every detail you inspect is kept
    const ct = v.clue ? "Clue " + v.clue.slice(1) : "";
    if (v.clue && !S.notes.some(n => n.title === ct)) { if (v.secret) { sfx("secret"); add(C.secretPoints); toast(UI.secret + " +" + C.secretPoints); } addNote(UI.clues, ct, G.clues[v.clue]); }
    if (v.alibi) addNote(UI.alibis, h.name, v.alibi);
    nav.replaceChildren(...h.views.map((_, j) => { const b = el("button", "dotb" + (j === i ? " on" : ""), j + 1); b.onclick = () => { i = j; show(); }; return b; }));
  };
  show(); box.append(body, nav); S.done.add(h.id); refresh(); openModal(box, h.say ? () => say([h.say]) : null);
}

// ---------- Casebook ----------
function openBook(tab = 0) {
  const box = el("div"), tabs = el("div", "tabs"), body = el("div");
  const views = [
    () => { const d = el("div"); d.append(el("p", "hint", S.items.length ? UI.holdHelp : UI.noItems));
      S.items.forEach(id => { const r = el("div", "row2" + (S.held === id ? " held" : "")), t = el("span", "t"), b = el("button", "btn", S.held === id ? UI.holding : UI.hold);
        t.append(el("b", "", itemName(id)), el("span", "", G.items[id].desc)); b.onclick = () => { S.held = S.held === id ? null : id; refresh(); pick(0); };
        r.append(sprite(id, itemName(id)), t, b); d.append(r); }); return d; },
    () => { const d = el("div"); if (!S.notes.length) d.append(el("p", "", UI.noNotes));
      const order = [UI.clues, UI.alibis, ...new Set(S.notes.map(n => n.group))].filter((g, i, a) => a.indexOf(g) === i);
      for (const g of order) { const ns = S.notes.filter(n => n.group === g); if (!ns.length) continue; d.append(el("div", "grouphead", g));
        ns.forEach(n => { const x = el("div", "note"); x.append(el("h4", "", n.title), n.dropcap ? scrollText(n.text) : el("p", "", n.text)); d.append(x); }); } return d; },
    () => { const d = el("div", "prog"); [[UI.kleos, S.score], [UI.rooms, S.roomIdx + " / " + G.rooms.length], [UI.hintsUsed, S.hintsUsed + " / " + C.hintsPerRoom], [UI.tabs[0], S.items.length]].forEach(([a, b]) => { const p = el("p"); p.append(el("span", "", a), el("b", "", b)); d.append(p); }); return d; }];
  const pick = n => { body.replaceChildren(views[n]()); [...tabs.children].forEach((b, i) => b.classList.toggle("on", i === n)); };
  UI.tabs.forEach((n, i) => { const b = el("button", "tab", n); b.onclick = () => pick(i); tabs.append(b); });
  box.append(el("h2", "", UI.casebook), tabs, body); cancelSpeech(); $("#book-body").replaceChildren(box); $("#book").hidden = false; syncPauseBtn(); pick(tab);
}
$("#btn-book").onclick = () => openBook(); $("#held").onclick = () => { S.held = null; refresh(); };

// ---------- hints: always about the first step that is not finished yet ----------
$("#btn-hint").onclick = () => {
  if (!S.playing || S.paused || modalOpen()) return; if (D) endTalk();
  const step = currentHint(room, S.done); if (!step) return toast(UI.noHintNeeded);
  if (S.hintsUsed >= C.hintsPerRoom) return toast(UI.noHints);
  const k = room.id + ":" + step.done.join(), n = S.stepHints[k] || 0; S.stepHints[k] = n + 1; sfx("hint"); S.hintsUsed++; add(-C.hintCost); refresh(); // clock keeps running
  say([{ speaker: "brindle", text: step.lines[Math.min(n, 1)], pausesTimer: false, audioFile: step.audio && step.audio[Math.min(n, 1)] }]);
};

// ---------- puzzle panels ----------
function clearLock() { clearTimeout(lockT); $("#panel").classList.remove("locked"); $("#panel .lockmsg")?.remove(); }
function lock() {
  clearLock(); const p = $("#panel"), m = el("div", "lockmsg"); p.classList.add("locked"); p.append(m);
  let n = C.lockoutSeconds; const t = () => { m.textContent = UI.blocked + "… " + n; if (n-- <= 0) clearLock(); else lockT = setTimeout(t, 1000); }; t();
}
function wrong(h, p) { // -10, lockout, escalating hint from Brindle, the Ember dims
  sfx("wrong");
  add(-C.wrongPenalty); const n = S.wrongN[h.id] = (S.wrongN[h.id] || 0) + 1;
  S.ember = Math.max(.25, S.ember - .12); document.querySelectorAll(".ember").forEach(e => e.style.opacity = S.ember);
  if (p.wrong?.length) say([p.wrong[Math.min(n, p.wrong.length) - 1]]); lock();
}
async function solved(h, p) {
  sfx("solve");
  S.done.add(h.id); closeModal();
  if (p.after) { // room 7 step
    add(C.finalStepPoints); toast("+" + C.finalStepPoints + " " + UI.kleos); await say(p.after); refresh();
    if (h.id === "r7_step3") { S.done.add("r7_end"); ending(); } return;
  }
  await say(p.right); // reward only after the narration finished or was skipped
  const rw = room.reward; S.items.push(rw.id); add(C.rewardPoints); S.done.add(room.hotspots.find(x => x.id.endsWith("_reward")).id);
  refresh(); sfx("reward"); fly(rw.id, null); toast(UI.added + ": " + itemName(rw.id)); setTimeout(() => toast(UI.wayOpens), 2800);
}
const emberEl = () => { const e = el("div", "ember"); e.style.opacity = S.ember; return e; };
function dial(get, set, redraw) { const c = el("div", "dial"), u = el("button", "btn", "▲"), d = el("button", "btn", "▼"), l = el("b", "", String.fromCharCode(65 + get()));
  u.onclick = () => { sfx("tick"); set((get() + 1) % 26); redraw(); }; d.onclick = () => { sfx("tick"); set((get() + 25) % 26); redraw(); }; c.append(u, l, d); return c; }
function openPanel(h) {
  const p = room.panels[h.id], box = el("div"); box.append(el("h2", "", p.title)); if (p.intro) box.append(el("p", "hint", p.intro));
  if (p.type === "accuse" || p.type === "rekindle" || p.type === "law") box.append(emberEl());
  ({ match: pMatch, dials: pDials, mirrors: pMirrors, path: pPath, bowls: pBowls, cipher: pCipher, accuse: pAccuse, rekindle: pRekindle, law: pLaw })[p.type](h, p, box);
  const cb = el("button", "btn ghost", UI.casebook); // clues stay checkable: the Casebook opens above the puzzle
  cb.onclick = () => { if (p.type === "accuse") closeModal(); openBook(1); }; const f = el("div", "pfoot"); f.append(cb); box.append(f);
  openModal(box);
}
function pMatch(h, p, box) {
  const pr = S.prog[h.id] ??= { placed: {}, sel: null }, body = el("div"); box.append(body);
  const draw = () => {
    body.replaceChildren();
    const tray = el("div", "tray"), row = el("div", "plinths");
    p.weapons.filter(w => !Object.values(pr.placed).includes(w.id)).forEach(w => { const b = el("button", "wbtn" + (pr.sel === w.id ? " on" : "")); b.append(sprite(w.id, w.name), el("span", "", w.name)); b.onclick = () => { sfx("tick"); pr.sel = w.id; draw(); }; tray.append(b); });
    p.plinths.forEach((pl, i) => {
      const b = el("button", "plinth" + (pr.placed[i] ? " ok" : "")); b.append(el("b", "", pl.domain)); if (pr.placed[i]) b.append(sprite(pr.placed[i], pl.domain));
      b.onclick = () => { if (!pr.sel || pr.placed[i]) return;
        if (pr.sel === pl.weapon) { sfx("step"); pr.placed[i] = pr.sel; pr.sel = null; draw(); if (Object.keys(pr.placed).length === p.plinths.length) solved(h, p); }
        else { pr.sel = null; draw(); wrong(h, p); } }; row.append(b); });
    body.append(tray, row);
  }; draw();
}
function pDials(h, p, box) {
  const pr = S.prog[h.id] ??= { l: Array(p.answer.length).fill(0) }, row = el("div", "dials"), go = el("button", "btn big go", UI.open); box.append(row, go);
  const draw = () => { row.replaceChildren(...pr.l.map((_, i) => dial(() => pr.l[i], v => pr.l[i] = v, draw))); }; draw();
  go.onclick = () => pr.l.map(n => String.fromCharCode(65 + n)).join("") === p.answer ? solved(h, p) : wrong(h, p);
}
function pMirrors(h, p, box) {
  const pr = S.prog[h.id] ??= { st: p.mirrors.map(() => "\\"), n: 0 }, grid = el("div", "grid"); box.append(grid);
  grid.style.gridTemplateColumns = `repeat(${p.size},48px)`;
  const draw = () => {
    const t = traceBeam(p, pr.st), on = new Set(t.path.map(x => x.join(",")));
    grid.replaceChildren(); for (let r = 1; r <= p.size; r++) for (let c = 1; c <= p.size; c++) {
      const m = p.mirrors.findIndex(x => x[0] === r && x[1] === c), eye = r === p.target[0] && c === p.target[1];
      const b = el(m >= 0 ? "button" : "div", "cell" + (on.has(r + "," + c) ? " beam" : "") + (eye ? " eye" : ""), m >= 0 ? pr.st[m] : eye ? "◉" : (c === 1 && r === p.entryRow ? "▶" : ""));
      if (m >= 0) { b.classList.add("mirror"); b.onclick = () => { sfx("mirror"); pr.st[m] = pr.st[m] === "/" ? "\\" : "/"; pr.n++; draw();
        if (traceBeam(p, pr.st).hit) setTimeout(() => solved(h, p), 700); else if (pr.n % p.stuckEvery === 0) say([p.stuck[Math.min(pr.n / p.stuckEvery, p.stuck.length) - 1]]); }; }
      grid.append(b);
    }
  }; draw();
}
function pPath(h, p, box) {
  const pr = S.prog[h.id] ??= { i: 0 }, grid = el("div", "grid"); grid.style.gridTemplateColumns = `repeat(${p.cols},56px)`;
  box.append(el("div", "rose", "N ▼   E ▶   S ▲   W ◀"), grid);
  const draw = () => {
    grid.replaceChildren(); for (let r = 1; r <= p.rows; r++) for (let c = 1; c <= p.cols; c++) {
      const k = p.path.findIndex(x => x[0] === r && x[1] === c), safe = k >= 0 && k < pr.i, cur = pr.i > 0 && k === pr.i - 1;
      const b = el("button", "cell stone" + (safe ? " beam" : "") + (cur ? " cur" : ""), cur ? "●" : r === p.rows ? "✦" : "");
      b.onclick = () => { const nx = p.path[pr.i]; if (nx[0] === r && nx[1] === c) { sfx("step"); pr.i++; draw(); if (pr.i === p.path.length) solved(h, p); } else { b.classList.add("swept"); wrong(h, p); } };
      grid.append(b);
    }
  }; draw();
}
function pBowls(h, p, box) {
  const pr = S.prog[h.id] ??= { v: [0, 0, 0] }, row = el("div", "bowls"), info = el("p", "hint"), go = el("button", "btn big go", UI.pay); box.append(row, info, go);
  const draw = () => {
    row.replaceChildren(...pr.v.map((n, i) => { const c = el("div", "bowl"), m = el("button", "btn", "−"), a = el("button", "btn", "+");
      m.onclick = () => { sfx("coin"); pr.v[i] = Math.max(0, n - 1); draw(); }; a.onclick = () => { sfx("coin"); pr.v[i] = Math.min(p.bowlMax, n + 1); draw(); };
      c.append(el("small", "", "Bowl " + (i + 1)), a, el("b", "", n), m); return c; }));
    info.textContent = `Obols in bowls: ${pr.v.reduce((a, b) => a + b)}`;
  }; draw();
  go.onclick = () => { const t = pr.v.reduce((a, b) => a + b); if (t > p.purse) return toast(UI.purseFull); pr.v.join() === p.answer.join() ? solved(h, p) : wrong(h, p); };
}
function pCipher(h, p, box) {
  const n = p.answer.length, pr = S.prog[h.id] ??= { l: Array(n).fill(0), shift: 0, back: false }, row = el("div", "dials"), wheel = el("p", "wheel"), go = el("button", "btn big go", UI.open);
  box.append(el("p", "msg", "Carved: " + p.cipher), wheel, row, go);
  const draw = () => {
    row.replaceChildren(...pr.l.map((_, i) => dial(() => pr.l[i], v => pr.l[i] = v, draw)));
    const m = el("button", "btn", "−"), a = el("button", "btn", "+"), d = el("button", "btn dirbtn", pr.back ? UI.wheelBack : UI.wheelForward);
    m.onclick = () => { sfx("tick"); pr.shift = Math.max(0, pr.shift - 1); draw(); }; a.onclick = () => { sfx("tick"); pr.shift = Math.min(25, pr.shift + 1); draw(); }; d.onclick = () => { sfx("tick"); pr.back = !pr.back; draw(); };
    wheel.replaceChildren(el("small", "", UI.wheel), m, el("b", "", " " + pr.shift + " "), a, d, el("div", "", p.cipher + " → " + shiftBack(p.cipher, pr.back ? pr.shift : -pr.shift)));
  }; draw();
  go.onclick = () => pr.l.map(x => String.fromCharCode(65 + x)).join("") === p.answer ? solved(h, p) : wrong(h, p);
}
function pAccuse(h, p, box) { // the Casebook is its own screen, never beside the answers: the footer button closes this panel first
  const pr = S.prog[h.id] ??= { ok: [] }, body = el("div"); box.append(body);
  const draw = () => {
    body.replaceChildren(); p.questions.forEach((q, i) => { const s = el("div", "q"); s.append(el("p", "", q.q));
      if (pr.ok[i]) s.append(el("b", "good", "✓ " + q.answer)); else p.suspects.forEach(n => { const b = el("button", "btn", n);
        b.onclick = () => { if (n === q.answer) { sfx("step"); pr.ok[i] = true; draw(); if (p.questions.every((_, j) => pr.ok[j])) solved(h, p); } else wrong(h, p); }; s.append(b); });
      body.append(s); });
  }; draw();
}
function pRekindle(h, p, box) {
  const pr = S.prog[h.id] ??= { pos: 0 }, row = el("div", "sockets"), msg = el("p", "hint"), again = el("button", "btn", UI.watchAgain); box.append(row, msg, again);
  let playing = false, lit = -1; const socks = [...p.sequence].sort((a, b) => a.localeCompare(b)); // fixed order that is not the answer order
  const draw = () => { row.replaceChildren(...socks.map(id => { const b = el("button", "sock" + (socks[lit] === id ? " lit" : ""));
    b.append(sprite(id, itemName(id)), el("small", "", itemName(id))); b.onclick = () => tap(id); return b; })); };
  const tap = id => { if (playing) return;
    if (id === p.sequence[pr.pos]) { pr.pos++; lit = socks.indexOf(id); sfx("note", lit); draw(); setTimeout(() => { lit = -1; draw(); }, 300); msg.textContent = `Beat ${pr.pos} of ${p.sequence.length}`; if (pr.pos === p.sequence.length) solved(h, p); }
    else { pr.pos = 0; wrong(h, p); setTimeout(play, C.lockoutSeconds * 1000 + 300); } };
  const play = async () => { const tok = ++playTok; playing = true; pr.pos = 0; msg.textContent = "Watch the Ember…";
    for (let r = 0; r < 2; r++) for (const id of p.sequence) { lit = socks.indexOf(id); sfx("note", lit); draw(); await new Promise(r => setTimeout(r, 650)); if (tok !== playTok) return; lit = -1; draw(); await new Promise(r => setTimeout(r, 250)); if (tok !== playTok) return; }
    playing = false; msg.textContent = "Your turn. Copy the Ember, beat for beat."; };
  again.onclick = play; draw(); play();
}
function pLaw(h, p, box) {
  p.options.forEach((o, i) => { const b = el("button", "btn opt", o); b.onclick = () => i === p.answer ? solved(h, p) : wrong(h, p); box.append(b); });
}

// ---------- rooms ----------
async function loadRoom(r) {
  room = r; document.documentElement.style.setProperty("--accent", r.accent);
  $("#room-name").textContent = r.name; $("#objective-text").textContent = r.objective;
  const ok = await new Promise(res => { const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = r.panorama; });
  const p = $("#pano"); try { viewer?.destroy(); } catch (e) {} viewer = null; hotIds = []; p.replaceChildren();
  if (ok && window.pannellum) {
    viewer = pannellum.viewer("pano", { type: "equirectangular", panorama: r.panorama, autoLoad: true, showControls: false, hfov: 100, minHfov: 60, maxHfov: 120, compass: false, hotSpots: [] });
    await new Promise(res => { viewer.on("load", res); viewer.on("error", res); setTimeout(res, 8000); }); // place hotspots only once the viewer is ready
    if (DEBUG) p.addEventListener("mousedown", e => { const c = viewer.mouseEventToCoords(e); $("#dbg").hidden = false; $("#dbg").textContent = `yaw ${c[1].toFixed(1)}  pitch ${c[0].toFixed(1)}`; });
  } else p.innerHTML = `<div class="fallback"><h2>${r.name}</h2></div>`;
  refresh();
}
const blur = on => { const p = $("#pano"); p.style.transition = on ? "none" : `filter ${C.sharpenSeconds}s ease`; p.style.filter = on ? `blur(${C.blurPx}px)` : "none"; }; // inline: Pannellum overwrites the class
async function beginRoom() { await say(room.enter); S.done.add(room.hotspots[0].id); refresh(); } // Kade and Isla talk: clock paused by pausesTimer
async function nextRoom() {
  const i = ++S.roomIdx; S.loading = true; $("#pano").style.opacity = 0; S.hintsUsed = 0; S.held = null; closeModal(); closeBook();
  await new Promise(r => setTimeout(r, 250)); await loadRoom(G.rooms[i]); $("#pano").style.opacity = 1; S.loading = false; armIdle(); beginRoom();
}

// ---------- ending ----------
function ending() {
  S.playing = false; clearTimeout(idleT); const cine = $("#cine"), ring = $("#cine-ring"), txt = $("#cine-text"); let i = 0;
  ring.replaceChildren(...Array.from({ length: 13 }, () => el("i", "flame")));
  cine.hidden = false; $("#hud").hidden = $("#bar").hidden = true; $("#held").hidden = true;
  const fl = [...ring.children]; fl.forEach((f, k) => { const a = k / 12 * 2 * Math.PI; f.style.left = k < 12 ? 50 + Math.cos(a) * 42 + "%" : "96%"; f.style.top = k < 12 ? 50 + Math.sin(a) * 40 + "%" : "12%"; });
  const finish = () => { cancelSpeech(); cine.hidden = true; showEnd(G.ending.win, true); };
  const beat = () => { const b = G.ending.beats; sfx("chime"); txt.textContent = b[i]; narrate({ speaker: "narrator", text: b[i], audioFile: G.ending.audio && G.ending.audio[i] });
    fl.forEach((f, k) => f.className = "flame" + (i === 0 ? (k === 0 ? " big on" : " hide") : k < 12 ? " on" : i < 4 ? " hide" : i === 4 ? " cold" : " cold far")); };
  cine.onclick = () => { if (++i < G.ending.beats.length) beat(); else finish(); }; $("#cine-skip").onclick = e => { e.stopPropagation(); finish(); }; beat();
}

// ---------- start flow: Tap to Start, Mission Info, tutorial, opening, play ----------
function showHud() { $("#hud").hidden = $("#bar").hidden = false; }
function tutorial() {
  return new Promise(res => {
    const T = G.start.tutorial; let i = 0; $("#tut").hidden = false; showHud(); S.started = true;
    const step = () => {
      const s = T[i], t = s.target && $(s.target), card = $("#tut-card"), sp = $("#spot");
      const r = t ? t.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
      const pad = t ? 8 : 0; sp.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;
      $("#tut-text").textContent = s.text; $("#tut-count").textContent = `${i + 1} / ${T.length}`; $("#tut-next").textContent = i === T.length - 1 ? "Done" : "Next";
      const low = r.top + r.height / 2 < innerHeight / 2; card.style.top = low ? "auto" : "130px"; card.style.bottom = low ? "24px" : "auto";
    };
    const end = () => { $("#tut").hidden = true; res(); };
    $("#tut-next").onclick = () => { sfx("ui"); ++i < T.length ? step() : end(); }; $("#tut-skip").onclick = end; step();
  });
}
async function play() { S.playing = true; blur(false); armIdle(); await beginRoom(); }
function armIdle() { clearTimeout(idleT); if (S.playing) idleT = setTimeout(() => { if (!D && !S.paused && !S.loading && !modalOpen()) say([G.start.idle]).then(armIdle); else armIdle(); }, C.idleSeconds * 1000); }
document.addEventListener("pointerdown", () => S.playing && armIdle(), true);

// ?debug=1&room=N starts in room N with only the Boon the previous room gives. Add &carry=1 to carry everything earlier rooms would have given (Boons, notes, clues, score).
async function debugStart(i, carry) {
  $("#title").hidden = $("#brief").hidden = true; showHud(); S.started = true; blur(false);
  for (let k = 0; k < i; k++) {
    const R = G.rooms[k]; if (!R.reward) continue;
    if (carry || k === i - 1) S.items.push(R.reward.id);
    if (!carry) continue;
    R.hotspots.forEach(h => { S.done.add(h.id);
      if (h.kind === "LEARN") addNote(R.name, h.name, h.card, h.dropcap);
      (h.notes || []).forEach(n => addNote(R.name, n.title, n.text));
      (h.views || []).forEach(v => { addNote(R.name, h.name + ": " + v.title, v.text); if (v.clue) addNote(UI.clues, "Clue " + v.clue.slice(1), G.clues[v.clue]); if (v.alibi) addNote(UI.alibis, h.name, v.alibi); }); });
    S.score += 2 * C.itemPoints + C.secretPoints + C.rewardPoints;
  }
  add(0); S.roomIdx = i; S.playing = true; room = G.rooms[i]; await loadRoom(room); armIdle(); beginRoom();
}
async function init() {
  G = await (await fetch("game.json", { cache: "no-store" })).json(); C = G.config; UI = G.ui;
  const errs = validate(G); if (errs.length) { console.error("validate():", errs); if (DEBUG) { $("#dbg").hidden = false; $("#dbg").textContent = errs.join("\n"); } }
  document.title = G.title; $("#btn-start").textContent = G.start.titleButton; $("#t-title").textContent = UI.title; $("#t-tag").textContent = UI.tagline;
  const m = G.start.mission; $("#b-kicker").textContent = m.kicker; $("#b-head").textContent = m.heading; $("#btn-begin").textContent = m.button;
  $("#b-paras").replaceChildren(...m.paragraphs.map(t => el("p", "", t)));
  svg("menu", $("#btn-pause")); svg("hint", $("#btn-hint")); svg("book", $("#btn-book")); [$("#modal-x"), $("#book-x")].forEach(x => svg("close", x));
  const pb = el("button", "ibtn"); pb.id = "btn-pause2"; pb.hidden = true; pb.setAttribute("aria-label", UI.menu); document.body.append(pb); svg("menu", pb);
  Object.assign(pb.style, { position: "fixed", bottom: "16px", left: "16px", zIndex: 70, width: "46px", height: "46px" });
  $("#lbl-menu").textContent = UI.menu; $("#btn-pause").setAttribute("aria-label", UI.menu); $("#lbl-hint").textContent = UI.hint; $("#lbl-book").textContent = UI.casebook; $("#lbl-obj").textContent = UI.objective; $("#lbl-room").textContent = m.heading; $("#lbl-kleos").textContent = UI.kleos;
  $("#skip").textContent = UI.skip; $("#tut-skip").textContent = UI.skip; $("#cine-skip").textContent = UI.skip; $("#cine-tap").textContent = UI.tapContinue;
  const bg = (id, url) => { const i = new Image(); i.onload = () => $(id + " .art").style.backgroundImage = `url(${url})`; i.src = url; }; bg("#title", G.art.title); bg("#brief", G.art.briefing);
  S.t = C.timerSeconds; $("#clock").textContent = fmt(S.t); blur(true); await loadRoom(G.rooms[0]);
  setInterval(tick, 200); $("#btn-pause2").onclick = pause;
  $("#btn-start").onclick = () => { S.unlocked = true; window.Snd && Snd.unlock(); sfx("ui"); $("#title").hidden = true; $("#brief").hidden = false; narrate({ speaker: "narrator", text: m.paragraphs.join(" "), audioFile: m.audioFile }); };
  $("#btn-begin").onclick = async () => { sfx("ui"); cancelSpeech(); $("#brief").hidden = true; await tutorial(); await say(G.start.opening); play(); };
  $("#end-again").onclick = () => location.reload(); $("#end-close").onclick = () => $("#end").hidden = true;
  const Q = new URLSearchParams(location.search), startRoom = DEBUG ? parseInt(Q.get("room"), 10) : NaN;
  if (DEBUG && Q.get("test") === "1") { const sc = document.createElement("script"); sc.src = "tools/playthrough.js"; document.body.append(sc); }
  else if (startRoom >= 1 && startRoom <= G.rooms.length) await debugStart(startRoom - 1, Q.get("carry") === "1");
  if (DEBUG) window.__g = { S, G, activate, openPanel, solved, say, refresh, openBook, traceBeam, get viewer() { return viewer; }, // test helpers, localhost only
    async goto(i, skipTalk = true) { // jump to room i with every earlier room cleared
      $("#title").hidden = true; showHud(); S.started = true; blur(false);
      for (let k = 0; k < i; k++) { G.rooms[k].hotspots.forEach(h => S.done.add(h.id)); if (G.rooms[k].reward && !S.items.includes(G.rooms[k].reward.id)) S.items.push(G.rooms[k].reward.id); }
      S.roomIdx = i; S.playing = true; S.paused = false; await loadRoom(G.rooms[i]); if (skipTalk) { S.done.add(room.hotspots[0].id); refresh(); } else beginRoom(); } };
}
init();
}
