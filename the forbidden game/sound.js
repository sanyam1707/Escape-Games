"use strict";
// All sound is synthesized with Web Audio: no audio files. It starts after the first tap (browser rule) and never throws.
const MASTER_VOL = .5, MUSIC_VOL = .13; // sound effects and music are kept quiet on purpose
let AC = null, MASTER = null, OUT = null, soundOn = true, NOISE = null, ambNodes = [], ambTimers = [];
function audioInit() {
  if (AC) { AC.resume?.(); return; }
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  MASTER = AC.createGain(); MASTER.gain.value = soundOn ? MASTER_VOL : 0; OUT = MASTER;
  const comp = AC.createDynamicsCompressor(); MASTER.connect(comp); comp.connect(AC.destination); // keeps loud moments from clipping
  loadSamples(); startMusic();
}
function setSound(on) { soundOn = on; if (MASTER) MASTER.gain.value = on ? MASTER_VOL : 0; }
const live = () => AC && soundOn;
function tone(f, dur, type = "sine", vol = .2, slide = 0, delay = 0, out = OUT) {
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + dur);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol * .6, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .05);
}
function noiseBuf() {
  if (!NOISE) { NOISE = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate); const d = NOISE.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  return NOISE;
}
function noise(dur, type, freq, vol = .2, delay = 0, q = 1) {
  const t = AC.currentTime + delay, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol * .6, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(OUT); s.start(t, Math.random()); s.stop(t + dur + .05);
}
const SFX = {
  tap: () => tone(620, .08, "triangle", .1),
  card: () => { tone(440, .12, "sine", .1); tone(660, .18, "sine", .08, 0, .06); },
  pickup: () => { tone(660, .12, "triangle", .16); tone(990, .22, "triangle", .14, 0, .09); },
  learn: () => { tone(523, .25, "sine", .14); tone(784, .4, "sine", .12, 0, .1); },
  place: () => { noise(.1, "lowpass", 500, .35); tone(190, .12, "sine", .22, -60); },
  wrong: () => { tone(170, .35, "sawtooth", .15, -90); tone(125, .4, "square", .07, -60, .05); },
  solve: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, .4, "triangle", .14, 0, i * .11)),
  chime: () => [880, 1320, 1760, 2640].forEach((f, i) => tone(f, 1.5, "sine", .2 / (i + 1))),
  page: () => { noise(.35, "highpass", 2500, .1); tone(392, .45, "sine", .08, 0, .1); },
  dice: () => {
    for (let k = 0; k < 14; k++) noise(.05, "bandpass", 1800 + Math.random() * 2200, .16, k * .075 + Math.random() * .03, 3);
    [1.0, 1.28, 1.55].forEach(d => tone(150, .12, "sine", .25, -50, d));
  },
  drum0: () => { tone(125, .55, "sine", .55, -75); noise(.08, "lowpass", 300, .3); },
  drum1: () => { tone(200, .38, "sine", .45, -100); noise(.06, "lowpass", 700, .25); },
  drum2: () => { tone(340, .24, "sine", .4, -150); noise(.04, "bandpass", 1900, .2, 0, 2); },
  plank: () => { noise(.55, "lowpass", 900, .3); tone(95, .45, "sawtooth", .09, -45); },
  bubble: () => [0, .12, .24].forEach(d => tone(280 + Math.random() * 250, .12, "sine", .14, 280, d)),
  fizz: () => noise(.8, "highpass", 3500, .22),
  beam: () => tone(440, 1.2, "sine", .1, 660),
  thunder: () => noise(2.6, "lowpass", 140, .9),
  rumble: () => noise(1, "lowpass", 90, .7),
  whoosh: () => noise(.7, "bandpass", 800, .22, 0, .8),
  rustle: () => noise(.9, "highpass", 3000, .14),
  sting: () => { tone(110, 1.4, "sawtooth", .16, -30); tone(117, 1.4, "sawtooth", .12, -30); }
};
/* real recorded sounds (CC0, see docs/CREDITS.md) are used when present; the synthesized version is the fallback */
const SAMPLE_FILES = { pickup: ["handleCoins", .8], dice: ["handleCoins2", .9], page: ["bookFlip1", .7], card: ["bookFlip2", .55], casebook: ["bookOpen", .7], place: ["dropLeather", .9], tap: ["metalClick", .35],
  latch: ["metalLatch", .7], plank: ["creak2", .9], door: ["doorOpen_1", .8], whoosh: ["knifeSlice", .5], rustle: ["cloth3", .6], bubble: ["metalPot1", .5] };
const SAMPLES = {};
async function loadSamples() {
  for (const [n, [f, v]] of Object.entries(SAMPLE_FILES)) {
    try { const r = await fetch(`assets/audio/sfx/${f}.ogg`); if (r.ok) SAMPLES[n] = [await AC.decodeAudioData(await r.arrayBuffer()), v]; } catch {}
  }
}
function playSample(n) { const [b, v] = SAMPLES[n], s = AC.createBufferSource(), g = AC.createGain(); s.buffer = b; s.playbackRate.value = .97 + Math.random() * .06; g.gain.value = v; s.connect(g); g.connect(OUT); s.start(); }
/* every sound is balanced to a target peak (measured with an analyser) so nothing is lost in the mix */
const LEVEL = { tap: 2.5, card: 2.5, casebook: 4, page: .85, pickup: 1, place: 1.7, latch: .8, door: .9, plank: 1.8, whoosh: 1.6, rustle: 2.5, bubble: 1.1, dice: 3.2,
  learn: 6, wrong: 7, solve: 6.8, chime: 3, drum0: 2.9, drum1: 3, drum2: 2.9, fizz: 2.5, beam: 6.5, thunder: 10, rumble: 14, sting: 4.3 };
function sfx(n) {
  if (!live()) return;
  try { const g = AC.createGain(); g.gain.value = LEVEL[n] ?? 1; g.connect(MASTER); OUT = g; SAMPLES[n] ? playSample(n) : SFX[n]?.(); } catch {} finally { OUT = MASTER; }
}

/* background music: one CC0 track on a quiet loop; it lowers itself while someone is talking */
let MUSIC = null, musicOn = true;
function startMusic() { if (!MUSIC) { MUSIC = new Audio("assets/audio/bgm.mp3"); MUSIC.loop = true; MUSIC.volume = MUSIC_VOL; } if (musicOn) MUSIC.play().catch(() => {}); }
function setMusic(on) { musicOn = on; if (!MUSIC) return; on ? MUSIC.play().catch(() => {}) : MUSIC.pause(); }
function duckMusic(on) { if (MUSIC) MUSIC.volume = on ? MUSIC_VOL * .35 : MUSIC_VOL; }

/* Looping sounds are tied to a visual: they play only while that effect is on screen and stop the moment it goes. */
const LOOPS = {};
function bed(out, nodes, type, f, vol, q = .7) { const s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain(); s.buffer = noiseBuf(); s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = vol; s.connect(fl); fl.connect(g); g.connect(out); s.start(); nodes.push(s); return g; }
function wobble(nodes, param, rate, depth) { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = rate; g.gain.value = depth; o.connect(g); g.connect(param); o.start(); nodes.push(o); }
function hum(out, nodes, f, vol) { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = f; g.gain.value = vol; o.connect(g); g.connect(out); o.start(); nodes.push(o); }
const LOOPDEF = {
  rain: (o, n) => { bed(o, n, "highpass", 3200, .6); bed(o, n, "lowpass", 700, .25); },
  creak: (o, n) => { wobble(n, bed(o, n, "lowpass", 220, .5, 2).gain, 3, .4); },
  skitter: (o, n) => { wobble(n, bed(o, n, "highpass", 5000, .4).gain, 9, .3); },
  rumble: (o, n) => { bed(o, n, "lowpass", 90, 1); },
  water: (o, n) => { wobble(n, bed(o, n, "lowpass", 520, .6).gain, .35, .3); },
  wind: (o, n) => { wobble(n, bed(o, n, "bandpass", 650, .8, .5).gain, .25, .4); bed(o, n, "highpass", 4000, .12); },
  drone: (o, n) => { hum(o, n, 68, .35); bed(o, n, "lowpass", 260, .35); },
  crackle: (o, n) => { wobble(n, bed(o, n, "bandpass", 2600, .35, 2).gain, 6, .35); }
};
const LOOPGAIN = { creak: 4, rumble: 8, water: 3.5, drone: 3, wind: 1.7, crackle: 2.5 }; // measured so every danger sound is clearly audible at full danger
function loopSet(name, v) {
  if (!live()) return; v *= LOOPGAIN[name] || 1; if (v <= .02) return loopStop(name);
  let l = LOOPS[name];
  if (!l) { const out = AC.createGain(), nodes = []; out.gain.value = 0; out.connect(MASTER); LOOPDEF[name](out, nodes); l = LOOPS[name] = { out, nodes, v: 0 }; }
  l.v = v; l.out.gain.linearRampToValueAtTime(v, AC.currentTime + .6);
}
function loopStop(name) {
  const l = LOOPS[name]; if (!l) return; delete LOOPS[name];
  l.out.gain.cancelScheduledValues(AC.currentTime); l.out.gain.linearRampToValueAtTime(0, AC.currentTime + .4);
  setTimeout(() => l.nodes.forEach(n => { try { n.stop(); } catch {} }), 600);
}
const loopStopAll = () => Object.keys(LOOPS).forEach(loopStop);
const loopsMute = m => Object.values(LOOPS).forEach(l => (l.out.gain.value = m ? 0 : l.v));
