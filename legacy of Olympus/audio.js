"use strict";
/* audio.js: original generated music and sound effects (Web Audio). No files, no network.
   Nothing starts before the first tap (Snd.unlock). Every call is safe when audio is missing or off. */
const Snd = (() => {
  let ctx = null, master, musicBus, fxBus, reverb, delayIn, an, timer = null, step = 0, nextT = 0, melodyIx = 3, hum = null;
  const prefs = { music: true, fx: true }, MUSIC_VOL = 0.85, FX_VOL = 0.75, lastFx = {}; let recent = [], ducked = false, unlocked = false;
  try { Object.assign(prefs, JSON.parse(localStorage.getItem("lo_audio") || "{}")); } catch (e) { /* no storage is fine */ }
  const save = () => { try { localStorage.setItem("lo_audio", JSON.stringify(prefs)); } catch (e) { /* ignore */ } };

  // ---- D Dorian / Aeolian, a slow mythic progression: Dm, Bb, C, Am ----
  const CHORDS = [[146.83, 220, 293.66, 349.23], [116.54, 233.08, 293.66, 349.23], [130.81, 261.63, 329.63, 392], [110, 220, 261.63, 329.63]];
  const BASS = [73.42, 58.27, 65.41, 55];
  const SCALE = [293.66, 329.63, 349.23, 392, 440, 466.16, 523.25, 587.33, 698.46]; // D4 E4 F4 G4 A4 Bb4 C5 D5 F5
  const STEP = 0.5; // seconds per step; a chord lasts 16 steps (8 s)

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(comp);
      an = ctx.createAnalyser(); an.fftSize = 2048; comp.connect(an); an.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
      fxBus = ctx.createGain(); fxBus.gain.value = FX_VOL; fxBus.connect(master);
      // reverb from a generated impulse (a soft stone hall)
      const len = ctx.sampleRate * 3, imp = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = imp.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      reverb = ctx.createConvolver(); reverb.buffer = imp; const rw = ctx.createGain(); rw.gain.value = 0.55; reverb.connect(rw); rw.connect(musicBus);
      const fr = ctx.createGain(); fr.gain.value = 0.2; reverb.connect(fr); fr.connect(fxBus);
      // an echo for the lyre
      delayIn = ctx.createGain(); const dl = ctx.createDelay(1.5), fb = ctx.createGain(), lp = ctx.createBiquadFilter();
      dl.delayTime.value = 0.75; fb.gain.value = 0.32; lp.type = "lowpass"; lp.frequency.value = 1800;
      delayIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(musicBus); lp.connect(reverb);
    } catch (e) { ctx = null; }
    return !!ctx;
  }
  const level = () => { if (!an) return { rms: 0, peak: 0 }; const d = new Float32Array(an.fftSize); an.getFloatTimeDomainData(d); let s = 0, p = 0; for (const v of d) { s += v * v; p = Math.max(p, Math.abs(v)); } return { rms: Math.sqrt(s / d.length), peak: p }; };

  // ---- music ----
  function env(g, t, a, hold, r, v) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.setValueAtTime(v, t + a + hold); g.gain.linearRampToValueAtTime(0.0001, t + a + hold + r); }
  function pad(freqs, t, dur) {
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1100; lp.Q.value = 0.4; lp.connect(musicBus); lp.connect(reverb);
    freqs.forEach(f => [-6, 6].forEach((cents, k) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = k ? "triangle" : "sine"; o.frequency.value = f; o.detune.value = cents;
      env(g, t, 2.4, dur - 2.4, 3, 0.028); o.connect(g); g.connect(lp); o.start(t); o.stop(t + dur + 3.2);
    }));
  }
  function bass(f, t, dur) {
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter(); o.type = "triangle"; o.frequency.value = f; lp.type = "lowpass"; lp.frequency.value = 300;
    env(g, t, 1.2, dur - 1.2, 2, 0.1); o.connect(lp); lp.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + 2.2);
  }
  function drum(t) { // one soft frame-drum thump on each chord change
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.35);
    g.gain.setValueAtTime(0.13, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6); o.connect(g); g.connect(musicBus); g.connect(reverb); o.start(t); o.stop(t + 0.7);
  }
  function pluck(f, t, v) { // a lyre-like plucked string
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600; const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 2);
    [[f, "triangle", 1], [f * 2, "sine", 0.3]].forEach(([fr, ty, m]) => { const o = ctx.createOscillator(), gg = ctx.createGain(); o.type = ty; o.frequency.value = fr; gg.gain.value = m; o.connect(gg); gg.connect(lp); o.start(t); o.stop(t + 2.1); });
    lp.connect(g); g.connect(musicBus); g.connect(reverb); g.connect(delayIn);
  }
  function playStep(i, t) {
    const ci = ((i / 16) | 0) % CHORDS.length;
    if (i % 16 === 0) { pad(CHORDS[ci], t, 8); bass(BASS[ci], t, 8); drum(t); }
    const strong = i % 4 === 0; if (Math.random() < (strong ? 0.8 : 0.28)) {
      const tones = CHORDS[ci].map(f => f * 2); let best = melodyIx + Math.round(Math.random() * 4 - 2); best = Math.max(0, Math.min(SCALE.length - 1, best));
      if (strong) { let d = 99; SCALE.forEach((f, k) => { const near = Math.min(...tones.map(x => Math.abs(Math.log2(f / x)))); if (near < 0.03 && Math.abs(k - best) < d) { d = Math.abs(k - best); melodyIx = k; } }); } else melodyIx = best;
      pluck(SCALE[melodyIx], t, 0.07 + Math.random() * 0.05);
    }
  }
  function schedule() { if (!ctx) return; while (nextT < ctx.currentTime + 2.5) { playStep(step++, nextT); nextT += STEP; } }
  function runMusic() {
    if (!ensure() || timer || !prefs.music) return;
    ctx.resume(); nextT = ctx.currentTime + 0.15; schedule(); timer = setInterval(schedule, 400);
    musicBus.gain.cancelScheduledValues(ctx.currentTime); musicBus.gain.setTargetAtTime(ducked ? MUSIC_VOL * 0.35 : MUSIC_VOL, ctx.currentTime, 1.2);
  }
  function stopMusic() { clearInterval(timer); timer = null; if (ctx) musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.25); }

  // ---- sound effects ----
  function tone(f, dur, { type = "sine", vol = 0.2, to = 0, at = 0, a = 0.004, wet = 0, lp = 0 } = {}) {
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g; if (lp) { const b = ctx.createBiquadFilter(); b.type = "lowpass"; b.frequency.value = lp; g.connect(b); out = b; }
    o.connect(g); out.connect(fxBus); if (wet) out.connect(reverb); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, { type = "bandpass", freq = 1000, q = 1, vol = 0.1, at = 0, to = 0 } = {}) {
    const t = ctx.currentTime + at, n = Math.max(1, (ctx.sampleRate * dur) | 0), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = b; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t); if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(fxBus); s.start(t);
  }
  const bell = (f, at = 0, vol = 0.14) => { tone(f, 1.3, { vol, at, wet: 1 }); tone(f * 2.76, 0.5, { vol: vol * 0.25, at, wet: 1 }); };
  const NOTE = [587.33, 698.46, 783.99, 880, 1046.5, 1174.66]; // D5 F5 G5 A5 C6 D6 for the six Ember sockets
  const FX = {
    ui: () => tone(1500, 0.05, { vol: 0.05, type: "triangle" }),
    tick: () => tone(1100, 0.035, { vol: 0.05, type: "triangle" }),
    pickup: () => { bell(1174.66, 0, 0.12); bell(1568, 0.09, 0.1); },
    page: () => noise(0.2, { type: "highpass", freq: 3200, vol: 0.07 }),
    use: () => { tone(200, 0.16, { to: 90, vol: 0.22, type: "triangle" }); bell(1318.5, 0.08, 0.09); },
    nope: () => tone(120, 0.2, { to: 75, vol: 0.2, type: "triangle", lp: 500 }),
    secret: () => [1568, 1976, 2349].forEach((f, i) => tone(f, 0.35, { vol: 0.07, at: i * 0.07, wet: 1 })),
    hint: () => { bell(880, 0, 0.1); bell(1318.5, 0.16, 0.08); },
    step: () => { tone(200, 0.09, { to: 140, vol: 0.18, type: "triangle", lp: 900 }); noise(0.05, { freq: 600, vol: 0.05 }); },
    mirror: () => { tone(1400, 0.08, { to: 900, vol: 0.07 }); tone(2100, 0.05, { vol: 0.03 }); },
    coin: () => { tone(2200, 0.08, { vol: 0.05 }); tone(3000, 0.1, { vol: 0.04, at: 0.04 }); },
    wrong: () => tone(160, 0.3, { type: "sawtooth", to: 105, vol: 0.09, lp: 600 }),
    solve: () => [587.33, 739.99, 880].forEach((f, i) => bell(f, i * 0.12, 0.13)),
    reward: () => [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => bell(f, i * 0.11, 0.13)),
    exit: () => { noise(0.7, { type: "bandpass", freq: 300, to: 1400, q: 0.8, vol: 0.12 }); tone(70, 0.6, { vol: 0.12, to: 50 }); },
    chime: () => bell(783.99, 0, 0.1),
    win: () => [[293.66, 440, 587.33], [349.23, 523.25, 698.46], [392, 587.33, 783.99], [440, 659.25, 880, 1174.66]].forEach((c, i) => c.forEach(f => bell(f, i * 0.35, 0.09))),
    lose: () => [440, 392, 349.23, 293.66].forEach((f, i) => tone(f, 1.2, { vol: 0.1, at: i * 0.4, type: "triangle", wet: 1, lp: 1200 })),
    note: i => bell(NOTE[i % NOTE.length], 0, 0.16)
  };
  function fx(name, arg) {
    if (!prefs.fx || !unlocked || !ensure() || !FX[name]) return;
    const now = performance.now(); if (lastFx[name] && now - lastFx[name] < 70) return; recent = recent.filter(x => now - x < 400); if (recent.length >= 7) return; // never a pile-up
    lastFx[name] = now; recent.push(now); try { ctx.resume(); FX[name](arg); } catch (e) { /* no sound is fine */ }
  }

  return {
    unlock() { unlocked = true; if (ensure()) { ctx.resume(); runMusic(); } },
    get music() { return prefs.music; }, get sfxOn() { return prefs.fx; },
    setMusic(on) { prefs.music = !!on; save(); on ? (unlocked && runMusic()) : stopMusic(); },
    setFx(on) { prefs.fx = !!on; save(); },
    duck(on) { ducked = on; if (ctx && timer) musicBus.gain.setTargetAtTime(on ? MUSIC_VOL * 0.35 : MUSIC_VOL, ctx.currentTime, 0.2); },
    fx, level, FXNAMES: Object.keys(FX), get state() { return ctx && ctx.state; }
  };
})();

window.Snd = Snd;
