/* Sound effects, ambient pads and speech narration. */
'use strict';
/* ---------- audio ---------- */
const A = { ctx: null, master: null, on: true, voice: true, music: null };
function initAudio() {
  startMusic(); if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
  try { A.ctx = new (window.AudioContext || window.webkitAudioContext)(); A.master = A.ctx.createGain(); A.master.gain.value = .5; A.master.connect(A.ctx.destination); } catch (e) { A.ctx = null; }
}
function tone(f, d = .1, type = 'sine', v = .12, slide = 0, delay = 0) {
  if (!A.ctx || !A.on) return; const t = A.ctx.currentTime + delay, o = A.ctx.createOscillator(), g = A.ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d); o.connect(g); g.connect(A.master); o.start(t); o.stop(t + d + .02);
}
function noise(d = .2, v = .1, fc = 2000) {
  if (!A.ctx || !A.on) return; const n = A.ctx.sampleRate * d, b = A.ctx.createBuffer(1, n, A.ctx.sampleRate), a = b.getChannelData(0);
  for (let i = 0; i < n; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = A.ctx.createBufferSource(), f = A.ctx.createBiquadFilter(), g = A.ctx.createGain(); s.buffer = b; f.type = 'bandpass'; f.frequency.value = fc; g.gain.value = v;
  s.connect(f); f.connect(g); g.connect(A.master); s.start();
}
const SFX = {
  click: () => tone(700, .04, 'square', .04), buzz: () => tone(110, .1, 'sawtooth', .1), chime: () => { tone(880, .25, 'sine', .12); tone(1320, .35, 'sine', .08, 0, .12); },
  toast: () => tone(990, .15, 'triangle', .08), page: () => noise(.18, .12, 4000), zap: () => { tone(1200, .25, 'sawtooth', .1, -1000); noise(.25, .12, 3000); },
  burst: () => noise(.4, .2, 1500), bleep: () => tone(520, .06, 'square', .06), unlock: () => { tone(300, .1, 'square', .08); tone(600, .15, 'square', .08, 0, .1); },
  door: () => noise(.8, .12, 300), tile: () => tone(180, .08, 'triangle', .1), crank: () => noise(.05, .05, 800), hiss: () => noise(.3, .04, 6000), tune: () => tone(400, .3, 'sine', .06, 600),
  hum: () => tone(82, 1, 'sine', .1), close: () => tone(500, 1.5, 'sine', .1, -400), wrong: () => tone(160, .25, 'sawtooth', .1, -60)
};
const sfx = n => { try { SFX[n] && SFX[n](); } catch (e) {} };
/* one CC0 music loop for the whole game (see info screen credits); it keeps playing across rooms and the ending */
const MUSIC_VOL = .28, MUSIC_DUCK = .12;
const mixMusic = () => { if (A.music) A.music.volume = (voiceEl && !voiceEl.paused) ? MUSIC_DUCK : MUSIC_VOL; };
function startMusic() {
  if (A.music) return;
  const m = A.music = new Audio('assets/audio/music.mp3'); m.loop = true; m.volume = MUSIC_VOL; m.addEventListener('error', () => { A.music = null; });
  if (A.on) m.play().catch(() => {});
}
function setSound(on) { A.on = on; if (A.master) A.master.gain.value = on ? .5 : 0; if (A.music) on ? A.music.play().catch(() => {}) : A.music.pause(); }

/* ---------- narration ---------- */
let voiceEl = null; // one element only, so two voices can never overlap
function narrate(ln, onend) {
  if (!A.voice) return false;
  stopSpeech();
  if (ln.audioFile) {
    const el = voiceEl = new Audio(ln.audioFile); el.volume = .95; el.onended = () => { mixMusic(); onend && onend(); }; el.onplaying = mixMusic;
    el.onerror = () => { if (voiceEl === el) { voiceEl = null; speak(ln, onend); } };
    el.play().catch(() => { if (voiceEl === el) { voiceEl = null; speak(ln, onend); } }); return true;
  }
  return speak(ln, onend);
}
function speak(ln, onend) { // browser voice, only for lines with no recorded file
  if (!('speechSynthesis' in window)) return false;
  try {
    const c = G.characters[ln.who] || G.characters.narrator, u = new SpeechSynthesisUtterance(ln.text);
    u.pitch = c.pitch; u.rate = c.rate; u.volume = .9; u.onend = onend; u.onerror = onend; speechSynthesis.speak(u); return true;
  } catch (e) { return false; }
}
function stopSpeech() { if (voiceEl) { voiceEl.onended = voiceEl.onerror = null; voiceEl.pause(); voiceEl = null; mixMusic(); } if ('speechSynthesis' in window) speechSynthesis.cancel(); }
const pauseSpeech = () => { if (voiceEl) voiceEl.pause(); if ('speechSynthesis' in window) speechSynthesis.pause(); };
const resumeSpeech = () => { if (voiceEl) voiceEl.play().catch(() => {}); if ('speechSynthesis' in window) speechSynthesis.resume(); };
const preloadVoice = ln => { if (ln && ln.audioFile) { const e = new Audio(); e.preload = 'auto'; e.src = ln.audioFile; } };

function setVoice(on) { A.voice = on; if (!on) stopSpeech(); }
