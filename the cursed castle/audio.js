// audio.js: generated music pad per room, sound effects (Web Audio), and narration (speechSynthesis).
// Nothing runs before the first tap (Snd.start). Every call is safe when audio or voices are missing.
const Snd = (() => {
  let ctx, master, music, fxBus, pad = null, soundOn = true, voiceOn = true, started = false;
  const ROOT = [110, 123.47, 98, 130.81, 146.83, 87.31, 116.54]; // one root note per room

  function start() {
    if (started) return; started = true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = soundOn ? 1 : 0; master.connect(ctx.destination);
      music = ctx.createGain(); music.gain.value = 0.16; music.connect(master);
      fxBus = ctx.createGain(); fxBus.gain.value = 0.5; fxBus.connect(master);
    } catch (e) { ctx = null; }
  }
  const ok = () => ctx && ctx.state !== 'closed';
  function noise(dur) {
    const b = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * dur), ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = b; return s;
  }
  // tone: oscillator with attack/decay envelope, optional pitch glide
  function tone(f, dur, { type = 'sine', vol = 0.3, to = 0, at = 0, a = 0.01 } = {}) {
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(fxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  function hiss(dur, { type = 'lowpass', freq = 800, vol = 0.4, at = 0 } = {}) {
    const t = ctx.currentTime + at, n = noise(dur), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(fxBus); n.start(t);
  }
  const bell = (f, at = 0) => { tone(f, 1.4, { vol: 0.22, at }); tone(f * 2.01, 0.9, { vol: 0.08, at }); };
  const FX = {
    slam: () => { tone(90, 0.7, { to: 30, vol: 0.6 }); hiss(0.8, { freq: 300, vol: 0.8 }); },
    grind: () => hiss(1.6, { freq: 220, vol: 0.7 }),
    hum: () => tone(130, 1.1, { type: 'triangle', vol: 0.25 }),
    slide: () => hiss(0.5, { type: 'bandpass', freq: 500, vol: 0.4 }),
    key: () => { tone(1800, 0.15, { vol: 0.2 }); tone(2400, 0.2, { vol: 0.15, at: 0.08 }); },
    clink: () => { tone(1800, 0.15, { vol: 0.2 }); tone(2400, 0.2, { vol: 0.15, at: 0.08 }); },
    page: () => hiss(0.25, { type: 'highpass', freq: 3000, vol: 0.3 }),
    bubble: () => [0, 0.15, 0.32, 0.5].forEach(t => tone(300, 0.12, { to: 700, vol: 0.2, at: t })),
    fizz: () => hiss(0.7, { type: 'highpass', freq: 2500, vol: 0.5 }),
    chime: () => [660, 880, 1320].forEach((f, i) => bell(f, i * 0.12)),
    click: () => tone(1200, 0.05, { vol: 0.2, type: 'square' }),
    beam: () => tone(140, 1.4, { type: 'sawtooth', vol: 0.12 }),
    seal: () => [523, 659, 784, 1047].forEach((f, i) => bell(f, i * 0.14)),
    vault: () => { hiss(2, { freq: 160, vol: 0.8 }); bell(330, 1.2); },
    clunk: () => tone(110, 0.25, { to: 60, vol: 0.5, type: 'triangle' }),
    rumble: () => hiss(1.1, { freq: 120, vol: 0.9 }),
    guardian: () => tone(70, 1.5, { type: 'sawtooth', vol: 0.2 }),
  };
  function fx(name) { if (!ok() || !soundOn || !FX[name]) return; try { ctx.resume(); FX[name](); } catch (e) { /* no sound is fine */ } }

  function padRoom(i) {
    if (!ok()) return;
    ctx.resume();
    if (pad) { const old = pad; old.g.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5); setTimeout(() => old.nodes.forEach(n => { try { n.stop(); } catch (e) {} }), 1700); }
    const g = ctx.createGain(), f = ctx.createBiquadFilter(), nodes = [], r = ROOT[i % 7];
    f.type = 'lowpass'; f.frequency.value = 700; g.gain.value = 0; g.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    [[1, 'sine'], [1.5, 'triangle'], [2, 'sine'], [1.2 + (i % 2) * 0.07, 'sine']].forEach(([m, type], k) => {
      const o = ctx.createOscillator(), og = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = type; o.frequency.value = r * m; og.gain.value = 0.25;
      lfo.frequency.value = 0.07 + k * 0.05; lg.gain.value = 0.12; lfo.connect(lg); lg.connect(og.gain);
      o.connect(og); og.connect(f); o.start(); lfo.start(); nodes.push(o, lfo);
    });
    f.connect(g); g.connect(music); pad = { g, nodes };
  }
  // Room music: assets/audio/room<N>.mp3 (CC0, see assets/audio/CREDITS.md). If the file is missing, the generated pad plays instead.
  let cur = null; const MUSIC_VOL = 0.3;
  function fadeEl(a, to, ms, then) {
    const from = a.volume, t0 = performance.now();
    (function step() { const k = Math.min(1, (performance.now() - t0) / ms); a.volume = from + (to - from) * k; if (k < 1) requestAnimationFrame(step); else if (then) then(); })();
  }
  function setRoom(i) {
    if (!started) return;
    if (pad) { pad.g.gain.value = 0; }
    if (cur) { const old = cur; cur = null; fadeEl(old, 0, 1200, () => old.pause()); }
    const a = new Audio(`assets/audio/room${i + 1}.mp3`); a.loop = true; a.volume = 0; a.muted = !soundOn; cur = a;
    const fallback = () => { if (cur === a) { cur = null; padRoom(i); } };
    a.addEventListener('error', fallback);
    a.play().then(() => fadeEl(a, MUSIC_VOL, 1800)).catch(fallback);
  }
  function stopMusic() { if (pad) { pad.g.gain.value = 0; } if (cur) fadeEl(cur, 0, 800); }

  function setSound(v) { soundOn = v; if (master) master.gain.value = v ? 1 : 0; if (cur) cur.muted = !v; }
  function setVoice(v) { voiceOn = v; if (!v) cancelVoice(); }

  // narrate(line | text, speakerCfg) -> Promise that resolves when the voice ends or is cancelled/paused-out.
  // A line with audioFile plays the recorded mp3; anything else falls back to the browser voice.
  let audio = null, held = false, finish = null;
  const pre = {};
  function preload(line) { const f = line && line.audioFile; if (f && !pre[f]) { const a = new Audio(); a.preload = 'auto'; a.src = f; pre[f] = a; } }
  function narrate(line, speakerCfg) {
    if (!started || !voiceOn) return Promise.resolve();
    cancelVoice();
    return new Promise(res => {
      let fin = () => { if (finish === fin) finish = null; res(); }; finish = fin;
      const f = line && line.audioFile;
      if (f) {
        const a = pre[f] || new Audio(f); delete pre[f]; audio = a;
        try { a.currentTime = 0; } catch (e) {}
        a.onended = a.onerror = fin; a.play().catch(fin); return;
      }
      if (!('speechSynthesis' in window)) return fin();
      const u = new SpeechSynthesisUtterance(typeof line === 'string' ? line : line.text), v = (speakerCfg && speakerCfg.voice) || {};
      u.pitch = v.pitch || 1; u.rate = v.rate || 1; u.lang = 'en-GB'; u.onend = u.onerror = fin;
      try { speechSynthesis.speak(u); } catch (e) { fin(); }
    });
  }
  function cancelVoice() {
    held = false;
    if (audio) { audio.onended = audio.onerror = null; audio.pause(); audio = null; }
    if ('speechSynthesis' in window) try { speechSynthesis.cancel(); } catch (e) {}
    if (finish) finish();
  }
  // pauseVoice/resumeVoice: pause menu, notebook and panels hold the current line, then continue it.
  function pauseVoice() {
    if (audio && !audio.paused) { audio.pause(); held = true; }
    if ('speechSynthesis' in window) try { if (speechSynthesis.speaking) { speechSynthesis.pause(); held = true; } } catch (e) {}
  }
  function resumeVoice() {
    if (!held) return; held = false;
    if (audio) audio.play().catch(() => {});
    if ('speechSynthesis' in window) try { speechSynthesis.resume(); } catch (e) {}
  }
  return { start, fx, setRoom, stopMusic, setSound, setVoice, narrate, preload, cancelVoice, pauseVoice, resumeVoice, get soundOn() { return soundOn; }, get voiceOn() { return voiceOn; } };
})();
