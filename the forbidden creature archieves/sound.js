/* Sound: a quiet looping score and all sound effects, made in the browser (no audio files needed).
   If assets/audio/bgm.mp3 exists the game plays that for music instead; the effects stay synthesized. */
(function () {
  const Snd = window.Snd = { ctx: null, musicOn: true, sfxOn: true, musicVol: .22, duck: false };
  let master, mus, fx, verb, started = false, timer = null, nextT = 0, step = 0, noiseBuf = null;

  Snd.unlock = function () {
    if (Snd.ctx) { try { Snd.ctx.resume(); } catch (e) {} return Snd.ctx; }
    try {
      const c = Snd.ctx = new (window.AudioContext || window.webkitAudioContext)(); c.resume();
      master = c.createGain(); master.gain.value = 1; master.connect(c.destination);
      mus = c.createGain(); mus.gain.value = 0; mus.connect(master);
      fx = c.createGain(); fx.gain.value = .55; fx.connect(master);
      verb = c.createConvolver(); verb.buffer = impulse(2.8); const vg = c.createGain(); vg.gain.value = .55; verb.connect(vg); vg.connect(mus);
      noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { Snd.ctx = null; }
    return Snd.ctx;
  };
  function impulse(sec) { const c = Snd.ctx, n = c.sampleRate * sec, b = c.createBuffer(2, n, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); } return b; }
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  /* ---------- music: slow minor chords, a soft pad, a deep root and sparse music-box notes ---------- */
  const CHORDS = [[57, 60, 64, 71], [53, 57, 60, 67], [48, 55, 59, 64], [52, 55, 59, 66]]; // Am9, Fmaj7, Cmaj7, Em7
  const BELL = [69, 72, 74, 76, 79, 81];
  function voice(t, midi, dur, type, peak, dest, detune) {
    const c = Snd.ctx, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter(); o.type = type; o.frequency.value = hz(midi); if (detune) o.detune.value = detune;
    f.type = 'lowpass'; f.frequency.value = 1100; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + dur * .35); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(f); f.connect(g); g.connect(dest); g.connect(verb); o.start(t); o.stop(t + dur + .1);
  }
  function bell(t, midi, peak) {
    const c = Snd.ctx; [[1, 1], [2.76, .25], [5.4, .08]].forEach(([m, a]) => { const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = hz(midi) * m;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak * a, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + 2.6); o.connect(g); g.connect(mus); g.connect(verb); o.start(t); o.stop(t + 2.8); });
  }
  function chord(t) {
    const ch = CHORDS[step++ % CHORDS.length], dur = 9;
    ch.forEach((m, i) => { voice(t, m, dur, 'sine', .05, mus, -4); voice(t, m, dur, 'triangle', .02, mus, 5); });
    voice(t, ch[0] - 12, dur, 'sine', .08, mus);
    let tt = t + 1.2; while (tt < t + dur - 1.5) { if (Math.random() < .6) bell(tt, BELL[Math.floor(Math.random() * BELL.length)], .045); tt += 1.4 + Math.random() * 1.6; }
  }
  function pump() { const c = Snd.ctx; if (!c) return; while (nextT < c.currentTime + 4) { if (nextT < c.currentTime) nextT = c.currentTime + .1; chord(nextT); nextT += 8.2; } }
  Snd.startMusic = function () { if (!Snd.ctx || started) return; started = true; nextT = Snd.ctx.currentTime + .3; pump(); timer = setInterval(pump, 1500); Snd.level(); };
  Snd.level = function () { if (!Snd.ctx) return; const v = Snd.musicOn ? (Snd.duck ? Snd.musicVol * .35 : Snd.musicVol) : 0; mus.gain.setTargetAtTime(v * 2.2, Snd.ctx.currentTime, .4); };

  /* ---------- effects ---------- */
  function tone(type, f0, f1, t0, dur, peak, dest) {
    const c = Snd.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t0); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + .008); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur); o.connect(g); g.connect(dest || fx); o.start(t0); o.stop(t0 + dur + .05);
  }
  function noise(t0, dur, peak, ftype, f0, f1, dest) {
    const c = Snd.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = noiseBuf; s.loop = true; f.type = ftype; f.frequency.setValueAtTime(f0, t0); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + .01); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur); s.connect(f); f.connect(g); g.connect(dest || fx); s.start(t0); s.stop(t0 + dur + .05);
  }
  const chime = (t, notes, gap, peak, dur) => notes.forEach((m, i) => { tone('sine', hz(m), 0, t + i * gap, dur || .7, peak); tone('sine', hz(m) * 2.01, 0, t + i * gap, (dur || .7) * .6, peak * .3); });
  const R = {
    tap: t => tone('triangle', 520, 380, t, .07, .12),
    tick: t => tone('square', 900, 0, t, .03, .05),
    next: t => tone('sine', 700, 0, t, .05, .06),
    open: t => noise(t, .2, .18, 'bandpass', 700, 2200),
    close: t => noise(t, .16, .14, 'bandpass', 1800, 500),
    page: t => noise(t, .28, .2, 'bandpass', 500, 2600),
    find: t => { chime(t, [76, 83], .09, .22, .6); noise(t, .12, .06, 'highpass', 5000, 8000); },
    learn: t => chime(t, [79, 86], .12, .2, 1),
    inspect: t => { tone('square', 1400, 0, t, .03, .06); tone('square', 1800, 0, t + .09, .03, .06); },
    secret: t => chime(t, [72, 76, 79, 84], .08, .2, .9),
    wrong: t => { tone('sawtooth', 150, 80, t, .38, .22); tone('square', 120, 70, t, .38, .08); },
    right: t => chime(t, [72, 76, 79, 84], .1, .22, .9),
    reward: t => { chime(t, [72, 79, 84, 88, 91], .11, .2, 1.2); noise(t + .3, .7, .05, 'highpass', 6000, 9000); },
    latch: t => { noise(t, .06, .3, 'bandpass', 2500, 1200); tone('triangle', 300, 150, t, .12, .25); noise(t + .13, .05, .25, 'bandpass', 3200, 1500); tone('triangle', 420, 200, t + .13, .1, .2); },
    hint: t => chime(t, [84, 91], .1, .16, .6),
    creature: t => { tone('sine', 900, 1600, t, .12, .16); tone('sine', 1500, 1000, t + .13, .16, .14); tone('sine', 1100, 1700, t + .3, .1, .12); },
    unlock: t => chime(t, [67, 74], .12, .18, .8),
    swap: t => { tone('triangle', 330, 520, t, .09, .13); },
    place: t => tone('triangle', 260, 140, t, .1, .2),
    lock: t => tone('square', 180, 120, t, .12, .1),
    pop: t => tone('sine', 600, 1000, t, .08, .12),
    strike: t => { tone('sine', 90, 40, t, .9, .5); noise(t, .6, .3, 'lowpass', 700, 80); },
    thunder: t => { noise(t, 1.8, .45, 'lowpass', 500, 60); tone('sine', 70, 35, t, 1.4, .3); },
    ink: t => { tone('sawtooth', 220, 40, t, 3, .12); noise(t, 3, .12, 'lowpass', 900, 60); },
    calm: t => chime(t, [69, 76, 81, 88], .18, .16, 2),
    seal: t => { tone('sine', 880, 220, t, 1.6, .18); noise(t, 1.4, .07, 'bandpass', 3000, 400); },
    win: t => { chime(t, [72, 76, 79, 84, 88, 91, 96], .13, .22, 1.6); },
    lose: t => { tone('sawtooth', 196, 98, t, 1.6, .18); tone('sawtooth', 185, 92, t + .05, 1.6, .12); },
    whoosh: t => noise(t, .5, .2, 'bandpass', 300, 3000)
  };
  Snd.master = () => master; // for level checks in tests
  Snd.sfx = function (name, delay) { if (!Snd.ctx || !Snd.sfxOn || !R[name]) return; try { R[name](Snd.ctx.currentTime + (delay || 0) + .005); } catch (e) {} };
})();
