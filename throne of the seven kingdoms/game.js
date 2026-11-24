/* Throne of the Seven Kingdoms. All text, hotspots, puzzle data and numbers live in game.json. */
(async function () {
"use strict";
const G = await (await fetch("game.json", { cache: "no-cache" })).json();
const C = G.config, U = G.ui, SC = C.score;
const DEBUG = /[?&]debug=1/.test(location.search) && /^(localhost|127\.|\[::1\])/.test(location.hostname);
const $ = id => document.getElementById(id);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k]);

/* ---------- validate ---------- */
function validate() {
  const bad = [], D = G.dialogue;
  const line = (id, where) => { if (!D[id]) bad.push(`missing dialogue ${id} (${where})`); else if (typeof D[id].p !== "boolean") bad.push(`no pausesTimer on ${id}`); };
  G.opening.concat(G.doorWarning, G.whispers, [G.idleLine]).forEach(i => line(i, "global"));
  Object.values(G.death).forEach(d => d.line && line(d.line, "death")); Object.values(G.endings).forEach(e => e.lines.forEach(i => line(i, "ending")));
  G.rooms.forEach(r => {
    const ids = new Set(r.hotspots.map(h => h.id));
    [r.enter, r.right, r.discuss, r.bank, r.bank2 || []].flat().forEach(i => line(i, r.id));
    r.hotspots.forEach(h => {
      h.after.forEach(a => { if (!ids.has(a) && a !== r.id + "_reward") bad.push(`${h.id}: unknown after ${a}`); });
      (h.lines || []).forEach(i => line(i, h.id)); (h.views || []).forEach(v => v.line && line(v.line, h.id));
      if (h.item && !G.items[h.item]) bad.push(`${h.id}: unknown item`);
      if (h.panel && !G.panels[h.panel]) bad.push(`${h.id}: unknown panel`);
    });
  });
  if (G.rooms.flatMap(r => r.hotspots).filter(h => h.kind === "FIND").length !== Object.keys(G.items).length) bad.push("item count mismatch");
  if (bad.length) { console.error("game.json invalid:\n" + bad.join("\n")); if (DEBUG) alert("game.json invalid:\n" + bad.join("\n")); }
  return !bad.length;
}
validate();
FX.setOn(C.sfx.enabled);

/* ---------- state ---------- */
let S;
function fresh() {
  return { phase: "title", room: 0, score: 0, hints: C.hintsPerGame, timeLeft: C.timerSeconds, done: new Set(), items: [], notes: [], secrets: [],
    proofs: [], banners: [], mistakes: 0, bankIdx: {}, ps: {}, menu: false, dead: false, cine: false, discussed: {}, stepIntro: {}, ending: null,
    dragged: false, idleFired: false, lastAct: performance.now(), sound: S ? S.sound : true, voice: S ? S.voice : true, timeBonus: 0 };
}
S = fresh();
const room = () => G.rooms[S.room];
const addScore = n => { S.score = Math.max(0, S.score + n); $("renown").textContent = S.score; };

/* ---------- art with fallbacks ---------- */
const ART = new Set(), probe = (u) => new Promise(r => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = u; });
const FILES = {};
await Promise.all([
  ...Object.values(G.sheets).flat().map(async s => { if (await probe(`assets/cut/${s}.png`)) ART.add(s); }),
  ...Object.entries({ ...G.backdrops, ...Object.fromEntries(Object.entries(G.death).filter(([, v]) => v.still).map(([k, v]) => ["d_" + k, v.still])),
    ...Object.fromEntries(Object.entries(G.endings).map(([k, v]) => ["e_" + k, v.still])), ...Object.fromEntries(G.rooms.map(r => [r.id, r.panorama])) })
    .map(async ([k, u]) => { FILES[k] = (await probe(u)) ? u : null; })]);
function tile(label, color, cls) { const d = el("div", (cls || "") + " fb", esc(label)); d.style.background = color || "#888"; return d; }
function img(slot, cls, fb) {
  if (ART.has(slot)) { const i = new Image(); i.src = `assets/cut/${slot}.png`; i.alt = ""; i.draggable = false; if (cls) i.className = cls; return i; }
  return fb();
}
function sigil(hid, cls) {
  const h = G.houses.find(x => x.id === hid);
  return img(h.slot, "sig " + (cls || ""), () => { const d = el("div", "sig " + (cls || ""), h.name[0]); d.style.background = h.color; return d; });
}
function setArt(sectionId, key, gradient) {
  const a = document.querySelector(`#${sectionId} .art`);
  a.style.backgroundImage = FILES[key] ? `url(${FILES[key]})` : (gradient || "");
}
setArt("screenStart", "start"); setArt("screenMission", "mission"); if (FILES.start) document.querySelector(".silhouette").hidden = true;

/* ---------- static text ---------- */
document.querySelectorAll("[data-ui]").forEach(e => e.textContent = U[e.dataset.ui]);
$("mKicker").textContent = U.mission.kicker; $("mHeading").textContent = U.mission.heading;
U.mission.paras.forEach(p => $("mParas").appendChild(el("p", "", esc(p)))); $("beginBtn").textContent = U.mission.begin;
$("tryBtn").textContent = U.tryAgain; $("overQuit").textContent = U.quit; $("againBtn").textContent = U.playAgain; $("dlgSkip").textContent = U.skip;
["book", "hint", "pause"].forEach(s => { const e = document.querySelector(`.ico[data-icon=${s}]`); if (ART.has(s)) { e.textContent = ""; e.appendChild(img(s)); } });
document.querySelectorAll(".close").forEach(c => { c.textContent = "×"; });
const kindOf = k => k.toLowerCase();

/* ---------- toast ---------- */
let toastT;
function toast(t) { const e = $("toast"); e.textContent = t; e.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove("on"), 2600); }

/* ---------- voice ---------- */
let voices = [];
const loadVoices = () => { voices = (window.speechSynthesis ? speechSynthesis.getVoices() : []).filter(v => /^en/i.test(v.lang)); };
if (window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
const FEM = /female|zira|samantha|aria|jenny|susan|hazel|karen|victoria|moira|tessa|libby|sonia|natasha|emma|amy|catherine|heera/i;
const MALE = /\bmale\b|david|mark|daniel|alex|guy|george|james|ryan|oliver|thomas|fred|rishi|brian|eric|davis|liam|ravi/i;
function pickVoice(g) { const want = g === "f" ? FEM : MALE; return voices.find(v => want.test(v.name) && (g === "f" || !FEM.test(v.name))) || voices[0] || null; }
let bgm = null, speaking = false, curAudio = null;
function duck(on) { if (bgm) bgm.volume = on ? C.bgmDuck : C.bgmVolume; }
const clips = new Map();  // audioFile -> Audio, so the next line is already loaded when it starts
function clip(f) { let a = clips.get(f); if (!a) { a = new Audio(f); a.preload = "auto"; clips.set(f, a); } return a; }
function stopVoice() { if (window.speechSynthesis) speechSynthesis.cancel(); if (curAudio) { curAudio.pause(); curAudio.onended = curAudio.onerror = null; curAudio = null; } speaking = false; duck(false); }
function speakBrowser(l) {
  if (!window.speechSynthesis) return;
  const sp = G.speakers[l.s], u = new SpeechSynthesisUtterance(l.t);
  u.rate = sp.rate; u.pitch = sp.pitch; const v = pickVoice(sp.gender); if (v) u.voice = v;
  u.onstart = () => { speaking = true; duck(true); }; u.onend = u.onerror = () => { speaking = false; duck(false); };
  speechSynthesis.speak(u);
}
function narrate(x) {  // x: a dialogue id, or a line object {s, t, audioFile}
  const l = typeof x === "object" ? x : G.dialogue[x] || { s: "narrator", t: x };
  stopVoice();
  if (!S.voice) return;
  if (!l.audioFile) { speakBrowser(l); return; }  // browser voice only for lines with no recording
  const a = curAudio = clip(l.audioFile); a.currentTime = 0; duck(true);
  a.onended = () => { duck(false); if (curAudio === a) curAudio = null; };
  a.onerror = () => { if (curAudio === a) { curAudio = null; speakBrowser(l); } };
  a.play().catch(() => {});
}
(async () => { if (await (fetch(C.bgm, { method: "HEAD" }).then(r => r.ok).catch(() => false))) FILES.bgm_ok = true; })();
function playBgm() {
  if (bgm || !FILES.bgm_ok) return;
  bgm = new Audio(C.bgm); bgm.loop = true; bgm.volume = C.bgmVolume;
  const go = () => { if (S.sound) bgm.play().catch(() => document.addEventListener("pointerdown", go, { once: true })); };  // blocked by the browser: retry on the next tap
  go();
}

/* ---------- dialogue ---------- */
const dlg = { q: [], cur: null };
function fig(box, slot) {
  box.hidden = false; box.innerHTML = ""; box.classList.remove("chip");
  const sp = G.speakers[slot];
  if (sp.slot && ART.has(sp.slot)) box.appendChild(img(sp.slot));
  else { box.classList.add("chip"); const c = el("span", "", esc(sp.name[0])); c.style.background = sp.color; box.appendChild(c); }
}
function paintDlg() {
  const c = dlg.cur, d = $("dlg");
  if (!c) { d.hidden = true; document.body.classList.remove("dlg-on"); return; }
  const l = G.dialogue[c.id], narr = l.s === "narrator", right = l.s !== "edda";
  d.hidden = false; document.body.classList.add("dlg-on"); d.classList.toggle("block", l.p);
  $("dlgName").textContent = G.speakers[l.s].name; $("dlgLine").textContent = l.t;
  const bar = $("dlgBar"); bar.classList.toggle("narr", narr); bar.classList.toggle("right", !narr && right);
  $("figL").hidden = $("figR").hidden = true;
  if (!narr) fig(right ? $("figR") : $("figL"), l.s);  // the speaker only, inside the box; the narrator has no portrait
  bar.style.animation = "none"; void bar.offsetWidth; bar.style.animation = "";
  document.documentElement.style.setProperty("--dlg-h", bar.offsetHeight + "px");
}
function say(ids, done) {
  const seq = { done, left: ids.length };
  if (!ids.length) { done && done(); return; }
  ids.forEach(id => dlg.q.push({ id, seq }));
  if (!dlg.cur) nextLine();
}
function nextLine() { dlg.cur = dlg.q.shift() || null; paintDlg(); if (dlg.cur) narrate(dlg.cur.id); else stopVoice(); const nx = dlg.q[0]; if (nx && G.dialogue[nx.id].audioFile) clip(G.dialogue[nx.id].audioFile); }
function finishSeq(seq) { const f = seq.done; seq.done = null; if (f) f(); }
function advance() {
  const c = dlg.cur; if (!c) return;
  if (transient) closeModal();
  c.seq.left--; nextLine();
  if (c.seq.left <= 0) finishSeq(c.seq);
}
function skipSeq() {
  const c = dlg.cur; if (!c) return;
  dlg.q = dlg.q.filter(x => x.seq !== c.seq); c.seq.left = 0; nextLine(); finishSeq(c.seq);
}
function clearDlg() { dlg.q = []; dlg.cur = null; paintDlg(); stopVoice(); }
$("dlgCatch").onclick = advance; $("dlgBar").onclick = e => { if (e.target.id !== "dlgSkip") advance(); }; $("dlgSkip").onclick = e => { e.stopPropagation(); skipSeq(); };

/* ---------- timer ---------- */
const modalOpen = () => !$("panel").hidden || !$("book").hidden;
const running = () => S.phase === "play" && !S.menu && !S.dead && !S.cine && !(dlg.cur && G.dialogue[dlg.cur.id].p);
let lastTick = performance.now();
function showTime() {
  const t = Math.max(0, Math.ceil(S.timeLeft)), e = $("timer");
  e.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  e.classList.toggle("low", t <= 60 && S.phase === "play"); e.classList.toggle("paused", S.phase === "play" && !running());
}
setInterval(() => {
  const now = performance.now(), dt = (now - lastTick) / 1000; lastTick = now;
  if (running()) { S.timeLeft -= dt; if (S.timeLeft <= 0) { S.timeLeft = 0; showTime(); die("frost"); return; } }
  showTime();
  if (S.phase === "play" && S.room === 0 && !S.idleFired && !S.dragged && !dlg.cur && !modalOpen() && now - S.lastAct > C.idleSeconds * 1000) { S.idleFired = true; say([G.idleLine]); }
}, 200);
document.addEventListener("pointerdown", e => { S.lastAct = performance.now(); if (!e.target.closest("#intro")) $("intro").hidden = true; }, true);

/* ---------- panorama ---------- */
let viewer = null, shown = new Map(), loadedRoom = -1;
function fallbackPano(r) {
  const c = document.createElement("canvas"); c.width = 2048; c.height = 1024; const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 1024); grad.addColorStop(0, "#0b0a0d"); grad.addColorStop(.55, r.accent + "55"); grad.addColorStop(1, "#141211");
  g.fillStyle = grad; g.fillRect(0, 0, 2048, 1024); g.fillStyle = "#0008";
  for (let i = 0; i < 8; i++) { const x = i * 256 + 128; g.beginPath(); g.moveTo(x - 90, 800); g.lineTo(x - 90, 520); g.arc(x, 520, 90, Math.PI, 0); g.lineTo(x + 90, 800); g.fill(); }
  g.fillStyle = "#0b0a0c"; g.fillRect(0, 780, 2048, 244);
  if (r.n === 7) { for (let i = 0; i < 6; i++) { g.fillStyle = "#8E1B25"; g.fillRect(150 + i * 300, 200, 90, 300); } }
  return c.toDataURL("image/png");
}
function loadRoom(i, then) {
  S.room = i; const r = G.rooms[i];
  document.documentElement.style.setProperty("--accent", r.accent);
  if (viewer) { try { viewer.destroy(); } catch (e) {} viewer = null; }
  shown = new Map(); $("pano").innerHTML = "";
  viewer = pannellum.viewer("pano", { type: "equirectangular", panorama: FILES[r.id] || fallbackPano(r), autoLoad: true, showControls: false, compass: false,
    hfov: 100, minHfov: 60, maxHfov: 110, pitch: 0, yaw: 0, mouseZoom: false, keyboardZoom: false, friction: .12 });
  viewer.on("load", () => { loadedRoom = i; refreshHotspots(); then && then(); });
  viewer.on("error", e => console.error("pannellum", e));
  const pano = $("pano");
  pano.onpointermove = e => { if (e.buttons) S.dragged = true; };
  if (DEBUG) pano.onclick = e => { const [p, y] = viewer.mouseEventToCoords(e); dbg(`yaw ${y.toFixed(1)}  pitch ${p.toFixed(1)}`); };
  paintHud();
}
function dbg(t) { let d = document.querySelector(".debug-xy"); if (!d) { d = el("div", "debug-xy"); document.body.appendChild(d); } d.textContent = t; console.log(t); }

/* ---------- hotspots ---------- */
const avail = h => !S.done.has(h.id) && h.after.every(a => S.done.has(a));
function hsElement(h) {
  const k = kindOf(h.kind), e = el("div", "hs-el " + k);
  if (h.kind === "FIND") {
    const it = G.items[h.item]; e.appendChild(img(h.item, "", () => tile(it[0], it[2], "")));
  } else e.appendChild(el("span", "hs-lab", esc(h.label)));
  e.setAttribute("role", "button"); e.setAttribute("aria-label", h.label);
  return e;
}
function refreshHotspots() {
  if (!viewer || loadedRoom !== S.room || S.phase !== "play") return;
  const r = room();
  r.hotspots.forEach(h => {
    const on = avail(h), has = shown.has(h.id);
    if (on && !has) {
      viewer.addHotSpot({ id: h.id, type: "custom", yaw: h.yaw, pitch: h.pitch, cssClass: "hs",
        createTooltipFunc: div => div.appendChild(hsElement(h)), clickHandlerFunc: () => onHotspot(h) });
      shown.set(h.id, 1);
      if (h.kind === "PANEL" && r.n < 7 && !S.discussed[r.id]) { S.discussed[r.id] = 1; say(r.discuss); }
    } else if (!on && has) { try { viewer.removeHotSpot(h.id); } catch (e) {} shown.delete(h.id); }
  });
  paintFind();
}
function onHotspot(h) {
  if (S.phase !== "play" || S.menu || S.dead || modalOpen()) return;
  if (dlg.cur && G.dialogue[dlg.cur.id].p) return;
  if (h.kind === "FIND") return pickUp(h);
  if (h.kind === "LEARN") return showLearn(h);
  if (h.kind === "INSPECT") return showInspect(h);
  if (h.kind === "PANEL") return openPanel(h);
  if (h.kind === "AUTO") return useExit(h);
}

/* ---------- modal helpers ---------- */
let modalClose = null;
let transient = false; // item and clue cards: one tap on the dialogue also closes them
function openModal(build, onClose, compact, isTransient) {
  transient = !!isTransient;
  $("panelBox").classList.toggle("compact", !!compact);
  const body = $("panelBody"); body.innerHTML = ""; build(body);
  modalClose = onClose || null; $("panel").hidden = false; $("panelBox").scrollTop = 0;
}
function closeModal() {
  if ($("panel").hidden) return;
  transient = false; $("panel").hidden = true; const f = modalClose; modalClose = null; $("panelBody").innerHTML = ""; f && f();
}
$("panelClose").onclick = closeModal; $("panelBack").onclick = closeModal;

/* ---------- FIND ---------- */
function pickUp(h) {
  FX.snd("pick"); const it = G.items[h.item]; S.done.add(h.id); S.items.push(h.item); addScore(SC.item); refreshHotspots();
  let imgEl;
  openModal(b => {
    b.appendChild(el("h2", "", esc(it[0])));
    const w = el("div", "card-img"); imgEl = img(h.item, "", () => tile(it[0], it[2])); w.appendChild(imgEl); b.appendChild(w);
    b.appendChild(el("p", "card-text", esc(it[1]))); b.appendChild(el("p", "saved", `${U.addedBook} (+${SC.item})`));
    const ok = el("button", "seal sm", U.ok); ok.onclick = closeModal; b.appendChild(ok);
  }, () => flyToBook(imgEl), true, true);
  say(h.lines);
}
function flyToBook(src) {
  if (!src) return;
  const f = $("flyer"), r = src.getBoundingClientRect(), t = $("bookBtn").getBoundingClientRect();
  f.innerHTML = ""; f.appendChild(src.cloneNode(true)); f.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;transition:none;opacity:1`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    f.style.transition = "all .8s ease-in"; f.style.left = t.left + "px"; f.style.top = t.top + "px"; f.style.width = f.style.height = "30px"; f.style.opacity = ".2";
  }));
  setTimeout(() => { f.innerHTML = ""; }, 900);
}

/* ---------- LEARN ---------- */
function showLearn(h) {
  S.done.add(h.id); S.notes.push({ t: h.title, x: h.text }); refreshHotspots();
  openModal(b => {
    b.appendChild(el("h2", "", esc(h.title))); b.appendChild(el("div", "parch card-text", esc(h.text)));
    b.appendChild(el("p", "saved", U.savedNotes));
    const ok = el("button", "seal sm", U.ok); ok.onclick = closeModal; b.appendChild(ok);
  }, null, true, true);
  say(h.lines || []);
}

/* ---------- INSPECT ---------- */
function showInspect(h) {
  let i = 0; const seen = new Set(), got = new Set();
  const render = body => {
    body.innerHTML = ""; const v = h.views[i]; body.appendChild(el("h2", "", esc(v.title)));
    const w = el("div", "card-img"); w.appendChild(img(v.slot, "", () => el("div", "parchfb", esc(v.title)))); body.appendChild(w);
    body.appendChild(el("p", "card-text", esc(v.text)));
    if (v.teach) body.appendChild(el("p", "saved", esc(v.teach)));
    if (v.secret) {
      if (got.has(v.secret.id) || S.secrets.includes(v.secret.id)) body.appendChild(el("div", "secret-got", esc(v.secret.text)));
      else { const sb = el("button", "secret-btn", esc(v.secret.label)); sb.onclick = () => { S.secrets.push(v.secret.id); got.add(v.secret.id); addScore(SC.secret); S.notes.push({ t: U.secretFound, x: v.secret.text }); toast(`${U.secretFound} (+${SC.secret})`); render(body); }; body.appendChild(sb); }
    }
    const dots = el("div", "dots"); h.views.forEach((_, k) => dots.appendChild(el("i", k === i ? "on" : ""))); if (h.views.length > 1) body.appendChild(dots);
    const row = el("div", "btnrow");
    if (i > 0) { const p = el("button", "seal sm ghost", "‹"); p.onclick = () => { i--; render(body); }; row.appendChild(p); }
    if (i < h.views.length - 1) { const n = el("button", "seal sm", U.next + " ›"); n.onclick = () => { FX.snd("page"); i++; render(body); }; row.appendChild(n); }
    else { const ok = el("button", "seal sm", U.ok); ok.onclick = closeModal; row.appendChild(ok); }
    body.appendChild(row);
    if (!seen.has(i)) { seen.add(i); if (v.line) say([v.line]); }
  };
  openModal(b => render(b), () => { if (seen.size === h.views.length) { S.done.add(h.id); refreshHotspots(); } }, true);
  say(h.lines || []);
}

/* ---------- hints & wrong answers ---------- */
function bankKey() { const r = room(); return r.id === "r2" && (S.ps.r2_rings || {}).stage === 2 ? "r2b" : r.id; }
function bankLines() { const r = room(); return bankKey() === "r2b" ? r.bank2 : r.bank; }
function nextBank() { const k = bankKey(), b = bankLines(), i = S.bankIdx[k] || 0; S.bankIdx[k] = i + 1; return b[Math.min(i, b.length - 1)]; }
$("hintBtn").onclick = () => {
  if (S.phase !== "play" || S.hints <= 0 || room().n === 7 || S.dead) return;
  if (S.score < C.hintCost) { toast(U.noRenown); return; }
  S.hints--; addScore(-C.hintCost); paintHud(); say([nextBank()]);
};
function wrong(btns, boxEl) {
  FX.snd("buzz");
  addScore(-C.wrongCost); toast(fmt(U.wrong, { n: C.wrongCost })); say([nextBank()]);
  const b = boxEl || $("panelBox"); b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake");
  (btns || []).forEach(x => { const t = x.textContent, was = x.disabled; x.disabled = true; let s = C.lockoutSeconds; x.textContent = `${U.lockout} ${s}`;
    const iv = setInterval(() => { s--; if (s <= 0 || !document.body.contains(x)) { clearInterval(iv); x.disabled = was; x.textContent = t; } else x.textContent = `${U.lockout} ${s}`; }, 1000); });
}
function solved(panelId) {
  FX.snd("chime");
  closeModal(); S.done.add(panelId); const r = room();
  say(r.right, () => reward(r));
}
function reward(r) {
  FX.snd("banner");
  const h = G.houses.find(x => x.id === r.banner);
  S.banners.push(h.id); S.proofs.push(r.proof); addScore(SC.reward); S.done.add(r.id + "_reward"); paintHud(true);
  toast(fmt(U.toastReward, { house: h.name })); setTimeout(() => toast(U.toastExit), 2700); refreshHotspots();
}
function useExit(h) {
  FX.snd("door"); S.done.add(h.id); refreshHotspots();
  const go = () => fadeTo(() => enterRoom(+h.opens.slice(1) - 1));
  if (room().n === 6) say(G.doorWarning, go); else go();
}
function fadeTo(fn) {
  let f = $("fade"); if (!f) { f = el("div"); f.id = "fade"; f.style.cssText = "position:fixed;inset:0;background:#000;z-index:35;opacity:0;transition:opacity .6s;pointer-events:none"; document.body.appendChild(f); }
  f.style.opacity = 1; f.style.pointerEvents = "auto";
  setTimeout(() => { fn(); setTimeout(() => { f.style.opacity = 0; f.style.pointerEvents = "none"; }, 600); }, 650);
}

/* ---------- HUD ---------- */
function paintHud(winAnim) {
  const r = room();
  $("renown").textContent = S.score; $("hintCount").textContent = S.hints;
  $("hintBtn").disabled = S.hints <= 0 || r.n === 7; $("hintBtn").title = S.hints <= 0 ? U.noHints : r.n === 7 ? U.hintsOff : U.hintBtn;
  const bn = $("banners"); bn.innerHTML = "";
  G.rooms.slice(0, 6).forEach((rm, i) => {
    const won = S.banners.includes(rm.banner), s = el("div", "bslot" + (won ? " won" : ""));
    if (won) { s.appendChild(sigil(rm.banner)); s.style.background = G.houses.find(x => x.id === rm.banner).color + "55"; if (!winAnim || S.banners.length - 1 !== i) s.style.animation = "none"; }
    bn.appendChild(s);
  });
  $("objective").textContent = r.objective;
  paintFind();
}
function paintFind() {
  const r = room(), f = $("findStrip"); f.innerHTML = ""; if (!r.items.length) return;
  f.appendChild(el("span", "fl", U.findStrip));
  r.items.forEach(id => { const got = S.items.includes(id), s = el("div", "fslot" + (got ? " got" : ""));
    if (got) s.appendChild(img(id, "", () => el("span", "", "✓"))); else s.textContent = "?"; f.appendChild(s); });
}

/* ---------- Proof Book ---------- */
let bookTab = "items";
function paintBook() {
  const tabs = $("bookTabs"); tabs.innerHTML = "";
  [["items", U.tabItems], ["proofs", U.tabProofs], ["progress", U.tabProgress]].forEach(([k, t]) => { const b = el("button", "tab" + (k === bookTab ? " on" : ""), t); b.onclick = () => { bookTab = k; paintBook(); }; tabs.appendChild(b); });
  const b = $("bookBody"); b.innerHTML = "";
  if (bookTab === "items") {
    const g = el("div", "item-grid");
    Object.keys(G.items).forEach(id => { const it = G.items[id], got = S.items.includes(id), s = el("div", "item-slot" + (got ? "" : " empty"));
      if (got) { s.appendChild(img(id, "", () => tile(it[0], it[2]))); s.appendChild(el("div", "", esc(it[0]))); } else s.appendChild(el("div", "", "?")); g.appendChild(s); });
    b.appendChild(g);
  } else if (bookTab === "proofs") {
    if (!S.proofs.length) b.appendChild(el("p", "help", U.noProofs));
    S.proofs.forEach((p, i) => b.appendChild(el("div", "proof", `<i>${i + 1}</i><br>${esc(p)}`)));
  } else {
    b.appendChild(el("h3", "", `${U.banners}: ${S.banners.length} / 6`));
    const row = el("div", "banner-row"); S.banners.forEach(x => row.appendChild(sigil(x))); b.appendChild(row);
    b.appendChild(el("h3", "", `${U.roomsDone}: ${S.proofs.length} / 6`));
    if (S.notes.length) b.appendChild(el("h3", "", U.notes));
    S.notes.forEach(n => b.appendChild(el("div", "proof", `<i>${esc(n.t)}</i><br>${esc(n.x)}`)));
  }
}
function openBook() { if (S.phase !== "play" || S.menu || S.dead) return; FX.snd("bookOpen"); paintBook(); $("book").hidden = false; }
$("bookBtn").onclick = openBook; $("bookClose").onclick = $("bookBack").onclick = () => { FX.snd("bookClose"); $("book").hidden = true; };

/* ---------- pause ---------- */
function openPause() {
  if (S.phase !== "play" || S.menu || S.dead || S.cine) return;
  S.menu = true; $("panel").style.visibility = $("book").style.visibility = "hidden"; if (window.speechSynthesis) speechSynthesis.pause(); if (curAudio) curAudio.pause();
  const l = $("pauseList"); l.innerHTML = "";
  const add = (t, f, ghost) => { const b = el("button", "seal" + (ghost ? " ghost" : ""), t); b.onclick = f; l.appendChild(b); return b; };
  add(U.resume, resume);
  add(U.restart, () => { resume(); restart(); }, true);
  const s = add(S.sound ? U.soundOn : U.soundOff, () => { S.sound = !S.sound; FX.setOn(C.sfx.enabled && S.sound); s.textContent = S.sound ? U.soundOn : U.soundOff; if (bgm) S.sound ? bgm.play().catch(() => {}) : bgm.pause(); }, true);
  const v = add(S.voice ? U.voiceOn : U.voiceOff, () => { S.voice = !S.voice; v.textContent = S.voice ? U.voiceOn : U.voiceOff; if (!S.voice) stopVoice(); }, true);
  add(U.quit, () => location.reload(), true);
  $("pauseMenu").hidden = false;
}
function resume() { S.menu = false; $("pauseMenu").hidden = true; $("panel").style.visibility = $("book").style.visibility = ""; if (window.speechSynthesis) speechSynthesis.resume(); if (curAudio && S.voice) curAudio.play().catch(() => {}); lastTick = performance.now(); }
$("pauseBtn").onclick = openPause;
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (S.menu) resume(); else if (!$("book").hidden) $("book").hidden = true; else if (!$("panel").hidden) closeModal(); else openPause();
});

/* ---------- start flow ---------- */
let tutIdx = 0;
$("screenStart").onclick = () => {
  if (S.phase !== "title") return;
  if (window.speechSynthesis) { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); }
  S.phase = "mission"; $("screenStart").hidden = true; $("screenMission").hidden = false;
  loadRoom(0); $("pano").classList.add("blur"); $("pano").style.setProperty("--blur", C.blurPx + "px");
  narrate({ s: "narrator", t: U.mission.paras.join(" "), audioFile: U.mission.audioFile });
};
$("beginBtn").onclick = () => { stopVoice(); $("screenMission").hidden = true; startTutorial(); };
function startTutorial() {
  S.phase = "tutorial"; $("hud").hidden = false; paintHud(); $("tutorial").hidden = false; tutIdx = 0; showTut();
}
function showTut() {
  const t = U.tutorial[tutIdx]; $("tutTitle").textContent = t.title; $("tutText").textContent = t.text;
  $("tutStep").textContent = `${tutIdx + 1} / ${U.tutorial.length}`; $("tutNext").textContent = tutIdx === U.tutorial.length - 1 ? U.done : U.next; $("tutSkip").textContent = U.skip;
  const d = $("tutDim"), target = t.target === "book" ? $("bookBtn") : t.target === "banners" ? $("banners") : t.target === "stats" ? document.querySelector(".hud-top") : null;
  if (target) { const r = target.getBoundingClientRect(), p = 6; d.style.cssText = `left:${r.left - p}px;top:${r.top - p}px;width:${r.width + 2 * p}px;height:${r.height + 2 * p}px`; }
  else d.style.cssText = "left:50%;top:50%;width:0;height:0";
}
$("tutNext").onclick = () => { if (++tutIdx >= U.tutorial.length) endTutorial(); else showTut(); };
$("tutSkip").onclick = endTutorial;
function endTutorial() {
  $("tutorial").hidden = true; S.phase = "opening";
  say(G.opening, beginPlay);
}
function beginPlay() {
  S.phase = "play"; S.lastAct = performance.now(); lastTick = performance.now();
  $("pano").style.transition = `filter ${C.sharpenMs}ms ease`; $("pano").classList.remove("blur");
  playBgm(); refreshHotspots(); enterLines();
}
function enterLines() { const r = room(); say(r.enter); if (r.n === 7) refreshHotspots(); }
function enterRoom(i) {
  closeModal();
  loadRoom(i, () => { paintHud(); enterLines(); });
}

/* ---------- death, game over, restart ---------- */
function die(kind) {
  if (S.dead) return; S.dead = true; FX.stopAll(); FX.death(kind); clearDlg(); closeModal(); $("book").hidden = true; $("pauseMenu").hidden = true; $("intro").hidden = true;
  const d = G.death[kind]; setArt("screenDeath", "d_" + kind, "radial-gradient(ellipse at 50% 40%,#3a1018,#0b0a0d)");
  const sc = $("screenDeath"); sc.hidden = false; $("deathLine").textContent = G.dialogue[d.line].t;
  narrate(d.line); sc.onclick = () => { stopVoice(); sc.hidden = true; setArt("screenOver", "d_" + kind, "#120c0c"); $("overScore").textContent = S.score; $("screenOver").hidden = false; };
}
$("tryBtn").onclick = () => { $("screenOver").hidden = true; restart(); };
$("overQuit").onclick = () => location.reload();
function restart() {
  FX.stopAll();
  clearDlg(); closeModal(); $("book").hidden = true; $("intro").hidden = true;
  document.body.classList.remove("threat1", "threat2"); $("screenWin").hidden = $("screenEnding").hidden = $("screenDeath").hidden = true;
  S = fresh(); S.phase = "play"; $("hud").hidden = false; lastTick = performance.now();
  $("pano").classList.remove("blur"); loadRoom(0, () => { paintHud(); enterLines(); }); addScore(0);
}

/* ---------- puzzle panels ---------- */
function openPanel(h) {
  const id = h.panel, P = G.panels[id], st = S.ps[id] = S.ps[id] || {};
  if (id.startsWith("r7_")) return openFinal(h, P, st);
  openModal(b => PUZ[id](b, P, st));
}
const confirmBtn = () => el("button", "seal confirm", U.confirm);
const hdr = (b, P, help) => { b.appendChild(el("h2", "", esc(P.title))); b.appendChild(el("p", "help", esc(help || P.help))); };
const msg = b => { const m = el("div", "msg"); b.appendChild(m); return m; };
const PUZ = {
  r1_desk(b, P, st) {
    st.sel = st.sel || new Set(); hdr(b, P);
    const L = el("div", "letters"); [["real_letter", U.realLetter], ["treason_letter", U.treasonLetter]].forEach(([s, t]) => {
      const c = el("div", "parch", `<div class="lt">${t}</div>`); if (ART.has(s)) { const i = img(s); i.style.cssText = "max-height:64px;max-width:100%"; c.appendChild(i); } L.appendChild(c); });
    b.appendChild(L);
    P.traits.forEach((t, i) => { const e = el("button", "trait" + (st.sel.has(i) ? " on" : ""), `<span class="nm">${esc(t.name)}</span><span class="v"><small>${U.real}</small>${esc(t.real)}</span><span class="v"><small>${U.treason}</small>${esc(t.treason)}</span>`);
      e.onclick = () => { st.sel.has(i) ? st.sel.delete(i) : st.sel.add(i); e.classList.toggle("on"); }; b.appendChild(e); });
    const row = el("div", "btnrow"), cb = confirmBtn(); row.appendChild(cb); b.appendChild(row);
    cb.onclick = () => {
      const ans = new Set(P.traits.map((t, i) => t.real !== t.treason ? i : -1).filter(i => i >= 0));
      if (ans.size === st.sel.size && [...ans].every(i => st.sel.has(i))) solved("r1_desk"); else wrong([cb]);
    };
  },
  r2_rings(b, P, st) {
    st.stage = st.stage || 1; if (st.off == null) st.off = P.startOffset; hdr(b, P, st.stage === 1 ? P.help1 : P.help2);
    const n = P.yearTo - P.yearFrom + 1;
    if (st.stage === 1) {
      const wrap = el("div", "ring-wrap"), ruler = el("div", "ruler");
      for (let y = P.yearFrom; y <= P.yearTo; y++) ruler.appendChild(el("div", "", `<b>${y}</b><span>${P.marks[y] || ""}</span>`));
      const strip = el("div", "strip"); for (let i = 1; i <= P.rings; i++) strip.appendChild(el("div", "ring" + (P.dark.includes(i) ? " dark" : P.thin.includes(i) ? " thin" : ""), String(i)));
      wrap.appendChild(ruler); wrap.appendChild(strip); b.appendChild(wrap);
      const stat = el("p", "help"); b.appendChild(stat); const yy = i => P.yearFrom + st.off + i - 1;
      const apply = () => { strip.style.transform = `translateX(${st.off * (wrap.clientWidth - 20) / n}px)`; const d = yy(P.dark[0]), t = yy(P.thin[0]); stat.innerHTML = `${esc(fmt(U.ringStatus, { d: (d === P.darkMark ? "\u2713 " : "") + d, t: (t === P.thinMark ? "\u2713 " : "") + t }))}<br>${esc(fmt(U.ringNeed, { d: P.darkMark, t: P.thinMark }))}`; }; setTimeout(apply, 0);
      let x0 = null, o0 = 0; wrap.onpointerdown = e => { x0 = e.clientX; o0 = st.off; wrap.setPointerCapture(e.pointerId); };
      wrap.onpointermove = e => { if (x0 == null) return; st.off = Math.max(-4, Math.min(4, o0 + Math.round((e.clientX - x0) / ((wrap.clientWidth - 20) / n)))); apply(); };
      wrap.onpointerup = () => { x0 = null; };
      const sl = el("div", "slide"), l = el("button", "seal sm ghost", "◀"), r = el("button", "seal sm ghost", "▶");
      l.onclick = () => { st.off = Math.max(-4, st.off - 1); apply(); }; r.onclick = () => { st.off = Math.min(4, st.off + 1); apply(); }; sl.append(l, r); b.appendChild(sl);
      const row = el("div", "btnrow"), cb = el("button", "seal confirm", U.lock); row.appendChild(cb); b.appendChild(row);
      cb.onclick = () => { const y = i => P.yearFrom + st.off + i - 1;
        if (y(P.dark[0]) === P.darkMark && y(P.thin[0]) === P.thinMark) { st.stage = 2; S.ps.r2_rings = st; closeModal(); toast(U.savedNotes); openPanelAgain(); } else wrong([cb]); };
    } else {
      const y = i => P.yearFrom + st.off + i - 1, c = el("div", "carv");
      P.carvings.forEach(cv => { const e = el("button", "", `${esc(cv.title)}<small>${fmt(U.notch, { ring: cv.ring, year: y(cv.ring) })}</small>`); e.onclick = () => { if (y(cv.ring) === P.deathYear) solved("r2_rings"); else wrong([...c.children]); }; c.appendChild(e); });
      b.appendChild(c);
    }
  },
  r3_line(b, P, st) {
    st.place = st.place || {}; hdr(b, P); const laws = el("div", "parch laws"); P.laws.forEach(l => laws.appendChild(el("p", "", esc(l)))); b.appendChild(laws);
    const area = el("div"), paint = () => {
      area.innerHTML = "";
      const mk = bu => { const e = el("button", "bust" + (st.sel === bu.id ? " sel" : "")); e.appendChild(img(bu.slot, "", () => tile(bu.name[0], "#9a9a9a"))); e.appendChild(el("div", "", esc(bu.name))); e.appendChild(el("small", "", esc(bu.fact))); e.onclick = () => { st.sel = st.sel === bu.id ? null : bu.id; paint(); }; return e; };
      const pool = el("div", "busts"); P.busts.filter(bu => !st.place[bu.id]).forEach(bu => pool.appendChild(mk(bu))); area.appendChild(pool);
      const pl = el("div", "places"); P.places.forEach(p => { const d = el("div", "place" + (st.sel ? " hot" : ""), `<h4>${p.name}</h4>`);
        P.busts.filter(bu => st.place[bu.id] === p.id).forEach(bu => d.appendChild(mk(bu)));
        d.onclick = e => { if (e.target.closest(".bust") || !st.sel) return; const cap = p.id !== "barred";
          if (cap) P.busts.forEach(bu => { if (st.place[bu.id] === p.id) delete st.place[bu.id]; }); st.place[st.sel] = p.id; st.sel = null; paint(); }; pl.appendChild(d); });
      area.appendChild(pl);
    };
    paint(); b.appendChild(area);
    const row = el("div", "btnrow"), cb = confirmBtn(), m = msg(b); row.appendChild(cb); b.insertBefore(row, m);
    cb.onclick = () => {
      if (P.busts.some(bu => !st.place[bu.id])) { m.textContent = U.placeBusts; m.className = "msg"; return; }
      const ok = P.places.every(p => { const got = P.busts.filter(bu => st.place[bu.id] === p.id).map(bu => bu.id).sort(); return JSON.stringify(got) === JSON.stringify([...P.answer[p.id]].sort()); });
      if (ok) solved("r3_line"); else { const right = P.busts.filter(bu => P.answer[st.place[bu.id]] && P.answer[st.place[bu.id]].includes(bu.id)).length; wrong([cb]); m.textContent = fmt(U.bustsRight, { n: right, total: P.busts.length }); m.className = "msg bad"; }
    };
  },
  r4_goblets(b, P, st) {
    st.tests = st.tests == null ? P.tests : st.tests; st.res = st.res || {}; hdr(b, P);
    const s = el("div", "parch laws"); P.statements.forEach((x, i) => s.appendChild(el("p", "stmt", `<b>${i + 1}.</b> ${esc(x.t)}`))); b.appendChild(s);
    const m = el("div", "msg"), cup = '<svg viewBox="0 0 32 40" width="34" height="42"><path d="M5 3h22c0 12-4 18-11 19-7-1-11-7-11-19z" fill="currentColor"/><rect x="14" y="22" width="4" height="10" fill="currentColor"/><rect x="8" y="33" width="16" height="4" rx="2" fill="currentColor"/></svg>';
    const row = el("div", "gob-row"); b.appendChild(row); b.appendChild(el("p", "help", `${U.ratsLeft}: <b id="ratN">${st.tests}</b>`)); b.appendChild(m);
    const paint = () => { row.innerHTML = ""; for (let n = 1; n <= P.goblets; n++) {
      const r = st.res[n], liars = P.statements.map((x, i) => x.true.includes(n) ? 0 : i + 1).filter(Boolean), g = el("div", "gob" + (r === "dead" ? " dead" : r === "clean" ? " clean" : ""), `<div class="cup">${cup}</div>${n}<small>${esc(fmt(U.liarsIf, { l: liars.join(", ") || U.liarsNone }))}</small>`);
      const t = el("button", "", U.testRat); t.disabled = !!r || st.tests <= 0;
      t.onclick = () => { st.tests--; st.res[n] = n === P.poisoned ? "dead" : "clean"; m.textContent = n === P.poisoned ? U.ratDead : U.ratFine; m.className = "msg " + (n === P.poisoned ? "bad" : "good"); paint(); b.querySelector("#ratN").textContent = st.tests; };
      const nm = el("button", "confirm", U.poisoned); nm.onclick = () => { if (n === P.answer) solved("r4_goblets"); else wrong([...row.querySelectorAll("button")]); };
      g.append(t, nm); row.appendChild(g); } };
    paint();
  },
  r5_scales(b, P, st) {
    st.pos = st.pos || {}; st.sel = st.sel || new Set(); st.log = st.log || []; st.left = st.left == null ? P.weighings : st.left; st.tilt = st.tilt || 0;
    hdr(b, P); const steps = el("div", "parch laws"); U.scaleSteps.forEach(t => steps.appendChild(el("p", "", esc(t)))); b.appendChild(steps);
    const wt = n => n === P.shortSack ? P.shortWeight : P.normal, list = side => Object.keys(st.pos).filter(n => st.pos[n] === side).map(Number).sort((x, y) => x - y);
    const sc = el("div", "scales"), beam = el("div", "beam"), L = el("div", "pan L"), R = el("div", "pan R"); sc.append(beam, L, R); b.appendChild(sc);
    const put = el("div", "btnrow"), bl = el("button", "seal sm", U.putLeft), br = el("button", "seal sm", U.putRight), be = el("button", "seal sm ghost", U.emptyPans); put.append(bl, br, be); b.appendChild(put);
    b.appendChild(el("h3", "", U.floorSacks)); const floor = el("div", "sacks"); b.appendChild(floor);
    const row = el("div", "btnrow"), wb = el("button", "seal", U.weigh), wl = el("span", "help", ""); row.append(wb, wl); b.appendChild(row);
    const m = el("div", "msg"), log = el("div", "help"); b.append(m, log);
    b.appendChild(el("h3", "", U.nameHeading)); b.appendChild(el("p", "help", U.nameHelp)); const name = el("div", "sacks"); b.appendChild(name);
    const paint = () => {
      beam.style.transform = `rotate(${st.tilt}deg)`; L.style.transform = `translateY(${-st.tilt * 2.2}px)`; R.style.transform = `translateY(${st.tilt * 2.2}px)`;
      L.innerHTML = `<h4>${U.left}</h4>`; R.innerHTML = `<h4>${U.right}</h4>`; floor.innerHTML = "";
      list("l").forEach(n => L.appendChild(chip(n))); list("r").forEach(n => R.appendChild(chip(n)));
      for (let n = 1; n <= P.sacks; n++) if (!st.pos[n]) { const s = el("button", "sack" + (st.sel.has(n) ? " sel" : ""), String(n)); s.onclick = () => { st.sel.has(n) ? st.sel.delete(n) : st.sel.add(n); paint(); }; floor.appendChild(s); }
      wl.textContent = `${U.weighLeft}: ${st.left}`; log.innerHTML = st.log.length ? `<b>${U.weighLog}</b><br>` + st.log.map((x, i) => esc(fmt(U.logLine, { n: i + 1, l: x.l.join(", "), r: x.r.join(", "), res: x.res }))).join("<br>") : "";
    };
    const chip = n => { const s = el("button", "sack " + (st.pos[n] === "l" ? "l" : "r"), String(n)); s.onclick = () => { delete st.pos[n]; paint(); }; return s; };
    const placeSel = side => { if (!st.sel.size) { m.textContent = U.pickFirst; m.className = "msg"; return; } st.sel.forEach(n => st.pos[n] = side); st.sel.clear(); m.textContent = ""; paint(); };
    bl.onclick = () => placeSel("l"); br.onclick = () => placeSel("r"); be.onclick = () => { st.pos = {}; st.sel.clear(); paint(); };
    wb.onclick = () => {
      const sum = side => list(side).reduce((a, n) => a + wt(n), 0);
      if (!list("l").length || !list("r").length) { m.textContent = U.pickBoth; m.className = "msg"; return; }
      if (st.left <= 0) { m.textContent = U.noneLeft; m.className = "msg bad"; return; }
      st.left--; const a = sum("l"), c = sum("r"); st.tilt = a === c ? 0 : a > c ? 9 : -9;
      const res = a === c ? U.resBalanced : a > c ? U.resLeftHeavy : U.resRightHeavy; st.log.push({ l: list("l"), r: list("r"), res });
      m.textContent = a === c ? U.balanced : a > c ? U.leftHeavier : U.rightHeavier; m.className = "msg good"; paint();
    };
    for (let n = 1; n <= P.sacks; n++) { const t = el("button", "sack confirm", String(n)); t.onclick = () => { if (n === P.answer) solved("r5_scales"); else { st.left = P.weighings; st.pos = {}; st.log = []; st.tilt = 0; st.sel.clear(); paint(); wrong([...name.children]); } }; name.appendChild(t); }
    paint();
  },
  r6_board(b, P, st) {
    st.cells = st.cells || { ...P.prefill }; hdr(b, P); const N = P.size, key = (r, c) => r + "," + c, nm = id => G.houses.find(x => x.id === id).name;
    const isCamp = (r, c) => P.camps.some(x => x[0] === r && x[1] === c), isK = (r, c) => r === P.kingsmoor[0] && c === P.kingsmoor[1];
    const rules = el("div", "parch laws"); rules.textContent = G.rooms[5].hotspots.find(x => x.id === "r6_rules").text; rules.style.whiteSpace = "pre-line"; b.appendChild(rules);
    const board = el("div", "board"), tray = el("div", "tokens"), warn = el("div", "msg bad"); b.append(board, tray, warn);
    const adj8 = (a, c) => Math.max(Math.abs(a[0] - c[0]), Math.abs(a[1] - c[1])) === 1, adj4 = (a, c) => Math.abs(a[0] - c[0]) + Math.abs(a[1] - c[1]) === 1;
    const check = () => {  // live rule check on whatever is placed so far
      const at = {}, out = []; Object.entries(st.cells).forEach(([k, v]) => at[v] = k.split(",").map(Number));
      P.feuds.forEach(([x, y]) => { if (at[x] && at[y] && adj8(at[x], at[y])) out.push([fmt(U.feudTouch, { a: nm(x), b: nm(y) }), [x, y]]); });
      if (at[P.northRow] && at[P.northRow][0] !== 0) out.push([fmt(U.rowNorth, { a: nm(P.northRow) }), [P.northRow]]);
      if (at[P.southRow] && at[P.southRow][0] !== N - 1) out.push([fmt(U.rowSouth, { a: nm(P.southRow) }), [P.southRow]]);
      const [i, w, m] = P.sideBy; if (at[i] && at[w] && at[m] && !(adj4(at[i], at[w]) && adj4(at[i], at[m]))) out.push([fmt(U.sideBy, { a: nm(i), b: nm(w), c: nm(m) }), [i, w, m]]);
      return out;
    };
    const paint = () => {
      board.innerHTML = ""; tray.innerHTML = ""; const v = check(), badH = new Set(v.flatMap(x => x[1]));
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const hs = st.cells[key(r, c)], fixed = !!P.prefill[key(r, c)], cell = el("button", "cell" + (isK(r, c) ? " k" : isCamp(r, c) ? " c" : "") + (hs && badH.has(hs) ? " bad" : "") + (fixed ? " fix" : ""), isK(r, c) ? U.kingsmoor : isCamp(r, c) ? U.camp : "");
        if (hs) { cell.innerHTML = ""; cell.appendChild(sigil(hs)); cell.appendChild(el("small", "", nm(hs))); }
        cell.onclick = () => { if (isK(r, c) || isCamp(r, c) || fixed) return; if (hs) { delete st.cells[key(r, c)]; st.sel = hs; } else if (st.sel) { st.cells[key(r, c)] = st.sel; st.sel = null; } paint(); };
        board.appendChild(cell); }
      P.houses.forEach(hid => { const used = Object.values(st.cells).includes(hid), t = el("button", "tok" + (st.sel === hid ? " sel" : "") + (used ? " used" : "")); t.appendChild(sigil(hid)); t.appendChild(el("div", "", nm(hid)));
        t.onclick = () => { if (!used) { st.sel = st.sel === hid ? null : hid; paint(); } }; tray.appendChild(t); });
      warn.innerHTML = v.map(x => esc(x[0])).join("<br>"); warn.className = "msg bad";
      if (!v.length && Object.keys(st.cells).length === P.houses.length) { warn.textContent = U.boardOk; warn.className = "msg good"; }
    };
    paint(); const row = el("div", "btnrow"), cb = confirmBtn(), m = msg(b); row.appendChild(cb); b.insertBefore(row, m);
    cb.onclick = () => {
      if (Object.keys(st.cells).length < P.houses.length) { m.textContent = U.placeSix; return; }
      if (check().length) wrong([cb]); else solved("r6_board");
    };
  },
};
function openPanelAgain() { const h = room().hotspots.find(x => x.panel === "r2_rings"); setTimeout(() => openPanel(h), 0); }

/* ---------- final room ---------- */
function setThreat(n) { document.body.classList.remove("threat1", "threat2"); if (n) document.body.classList.add("threat" + Math.min(n, 2)); }
function openFinal(h, P, st) {
  const k = h.step, go = () => openModal(b => FIN[h.panel](b, P, st, h));
  if (!S.stepIntro[k] && k < 4) { S.stepIntro[k] = 1; const l = G.stepLines[k] + "_start"; say([l], go); } else go();
}
function finalMistake(h, btns) {
  S.mistakes++; addScore(-SC.finalMistake); const k = h.step;
  if (S.mistakes >= C.finalMistakes) { die(G.death.stepDeath[k]); return; }
  setThreat(S.mistakes); toast(fmt(U.wrong, { n: SC.finalMistake })); FX.wrong(S.mistakes);
  say([`${G.stepLines[k]}_m${S.mistakes}`, G.whispers[S.mistakes - 1]]);
  const b = $("panelBox"); b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake");
}
function look(step) { const c = C.fx.camera[step]; if (c && viewer) viewer.lookAt(c[0], c[1], c[2], C.fx.cameraMs); }
function finalRight(h, after) {
  closeModal(); S.done.add(h.id); addScore(SC.finalStep); toast(`+${SC.finalStep}`); refreshHotspots();
  const k = h.step; FX.right(); FX.splash(U["splash" + k], U["splash" + k + "Sub"]); look(k + 1);
  if (k === 1) FX.reveal(img("veyl", "", () => tile("V", "#7a7a7a")), G.speakers.veyl.name, U.revealSub);
  if (k === 2) FX.chain(G.panels.r7_chain.cards.length);
  if (k === 3) FX.ceremony(G.panels.r7_lock.answer.map(id => sigil(id)), G.panels.r7_lock.answer.map(id => G.houses.find(x => x.id === id).color));
  const lines = [G.stepLines[k] + "_right"]; if (k === 3) lines.push(G.stepLines[4] + "_start");
  say(lines, after);
}
const FIN = {
  r7_accuse(b, P, st, h) {
    hdr(b, P); const g = el("div", "pcards");
    P.cards.forEach(c => { const e = el("button", "pcard" + (st.sel === c.id ? " sel" : ""), ""); e.appendChild(img(c.slot, "", () => tile(c.name[0], "#7a7a7a"))); e.appendChild(el("div", "", esc(c.name)));
      e.onclick = () => { st.sel = c.id; g.querySelectorAll(".pcard").forEach(x => x.classList.remove("sel")); e.classList.add("sel"); }; g.appendChild(e); });
    b.appendChild(g); const row = el("div", "btnrow"), cb = confirmBtn(); row.appendChild(cb); b.appendChild(row);
    cb.onclick = () => { if (!st.sel) return; if (st.sel === P.answer) finalRight(h); else finalMistake(h); };
  },
  r7_chain(b, P, st, h) {
    st.seq = st.seq || []; hdr(b, P); const g = el("div", "pcards"), paint = () => { g.innerHTML = "";
      P.cards.forEach(c => { const i = st.seq.indexOf(c.id), e = el("button", "pcard" + (i >= 0 ? " sel" : ""), `${i >= 0 ? `<span class="n">${i + 1}</span>` : ""}${esc(c.t)}`);
        e.onclick = () => { if (i >= 0) st.seq.splice(i, 1); else { st.seq.push(c.id); FX.snd("link", st.seq.length); } paint(); }; g.appendChild(e); }); };
    paint(); b.appendChild(g); const row = el("div", "btnrow"), cb = confirmBtn(); row.appendChild(cb); b.appendChild(row);
    cb.onclick = () => { if (st.seq.length < P.cards.length) return; if (JSON.stringify(st.seq) === JSON.stringify(P.answer)) finalRight(h); else { st.seq = []; finalMistake(h); paint(); } };
  },
  r7_lock(b, P, st, h) {
    st.seq = st.seq || []; hdr(b, P); const nm = id => G.houses.find(x => x.id === id).name;
    const br = el("div", "banner-row"); S.banners.forEach(id => br.appendChild(sigil(id))); b.appendChild(br);
    const seq = el("div", "seq"), g = el("div", "blades"), paint = () => { seq.textContent = st.seq.map(nm).join("  →  "); g.innerHTML = "";
      P.blades.forEach(id => { const on = st.seq.includes(id), e = el("button", "blade" + (on ? " on" : "")); e.appendChild(sigil(id)); e.appendChild(el("div", "", nm(id)));
        e.onclick = () => { if (!on && st.seq.length < P.answer.length) { st.seq.push(id); FX.blade(st.seq.length - 1, e, G.houses.find(x => x.id === id).color); paint(); } }; g.appendChild(e); }); };
    paint(); b.append(seq, g); const row = el("div", "btnrow"), cb = confirmBtn(), cl = el("button", "seal sm ghost", U.clear); row.append(cb, cl); b.appendChild(row);
    cl.onclick = () => { st.seq = []; paint(); };
    cb.onclick = () => { if (st.seq.length < P.answer.length) return; if (JSON.stringify(st.seq) === JSON.stringify(P.answer)) finalRight(h); else { st.seq = []; finalMistake(h); paint(); } };
  },
  r7_call(b, P, st, h) {
    hdr(b, P); const c = el("div", "choices");
    P.choices.forEach(ch => { const e = el("button", "seal", esc(ch.t)); e.onclick = () => { closeModal(); S.done.add(h.id); startEnding(ch.id); }; c.appendChild(e); }); b.appendChild(c);
  },
};

/* ---------- endings ---------- */
function startEnding(kind) {
  FX.stopAll(); S.cine = true; S.ending = kind; S.timeBonus = Math.floor(S.timeLeft) * SC.timePerSecond; addScore(S.timeBonus); setThreat(0);
  const E = G.endings[kind]; setArt("screenEnding", "e_" + kind, "radial-gradient(ellipse at 50% 40%,#2a2410,#0b0a0d)");
  $("screenEnding").hidden = false; $("hud").hidden = true; let i = 0;
  if (kind === "justice") { const ids = G.panels.r7_lock.answer; FX.justice(ids.map(id => sigil(id)), ids.map(id => G.houses.find(x => x.id === id).color)); } else FX.war();
  const show = () => { if (i >= E.lines.length) { $("screenEnding").hidden = true; showWin(); return; } const id = E.lines[i++]; $("endLine").textContent = G.dialogue[id].t; narrate(id); };
  $("screenEnding").onclick = () => { stopVoice(); show(); }; show();
}
function showWin() {
  FX.stopAll();
  const E = G.endings[S.ending]; $("winHeading").textContent = fmt(U.winHeading, { name: E.name }); setArt("screenWin", "e_" + S.ending, "#0b0a0d");
  const t = $("winScore"); t.innerHTML = `<tr><td>${U.renown}</td><td>${S.score - S.timeBonus}</td></tr><tr><td>${U.timeBonus}</td><td>+${S.timeBonus}</td></tr><tr><td><b>${U.total}</b></td><td><b>${S.score}</b></td></tr>`;
  const o = $("winProofs"); o.innerHTML = ""; S.proofs.forEach(p => o.appendChild(el("li", "", esc(p)))); $("screenWin").hidden = false;
}
$("againBtn").onclick = () => { $("screenWin").hidden = true; restart(); };

/* ?debug=1&room=5 : start in room 5 with rooms 1 to 4 already solved (items, secrets, notes, proofs, banners, Renown). Localhost only. */
function jumpTo(n) {
  S = fresh(); S.phase = "play";
  G.rooms.slice(0, n - 1).forEach(r => {
    r.hotspots.forEach(h => {
      S.done.add(h.id);
      if (h.kind === "FIND") { S.items.push(h.item); addScore(SC.item); }
      if (h.kind === "LEARN") S.notes.push({ t: h.title, x: h.text });
      (h.views || []).forEach(v => { if (v.secret) { S.secrets.push(v.secret.id); addScore(SC.secret); S.notes.push({ t: U.secretFound, x: v.secret.text }); } });
    });
    S.done.add(r.id + "_reward"); S.discussed[r.id] = 1; S.banners.push(r.banner); S.proofs.push(r.proof); addScore(SC.reward);
  });
  $("screenStart").hidden = true; $("hud").hidden = false; lastTick = performance.now();
  playBgm();
  loadRoom(n - 1, () => {
    paintHud();
    const open = /[&?]open=(\w+)/.exec(location.search);  // &open=r6_board : skip the room's clues and open that panel at once
    const h = open && G.rooms[n - 1].hotspots.find(x => x.id === open[1]);
    if (!h) return enterLines();
    G.rooms[n - 1].hotspots.forEach(x => { if (x.kind === "FIND" || x.kind === "LEARN" || x.kind === "INSPECT") { S.done.add(x.id); if (x.item) S.items.push(x.item); } });
    S.discussed[G.rooms[n - 1].id] = 1; refreshHotspots(); openPanel(h);
  });
}
if (DEBUG && /[?&]room=([2-7])/.test(location.search)) { const n = +RegExp.$1; $("screenStart").onclick = null; setTimeout(() => jumpTo(n), 0); }
if (DEBUG) window.__game = { G, get S() { return S; }, click: id => onHotspot(G.rooms.flatMap(r => r.hotspots).find(h => h.id === id)), closeModal, openBook, die, say, advance, skipSeq, reward, beginPlay, enterRoom, refreshHotspots, finalMistake, startEnding, get viewer() { return viewer; }, dlg };
})();
