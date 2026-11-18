// All sound is synthesized with WebAudio — no audio files. A tiny synth: engine hum
// (two detuned oscillators whose pitch follows speed), gunshots, crash thuds, pickup
// chimes, a two-tone police siren, and UI clicks. AudioContext starts on the first
// user gesture, so it never autoplays.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Engine hum: sawtooth + square an octave up, through a lowpass.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 110;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filter);
      engineOsc2.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      // Police siren: a sine that alternates between two notes.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, lowFreq) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowFreq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
  }

  return {
    unlock() { ensure(); },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    isMuted() { return muted; },
    // speed01: 0..1 of the car's top speed. Call every frame while driving.
    engine(speed01, on) {
      if (!ensure() || muted) return;
      const target = on ? 0.05 + speed01 * 0.09 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      const freq = 52 + speed01 * 130;
      engineOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.06);
      engineOsc2.frequency.setTargetAtTime(freq * 2, ctx.currentTime, 0.06);
    },
    // policeActive: whether any police car is chasing. Call every frame.
    siren(policeActive, dt) {
      if (!ensure()) return;
      sirenTimer += dt;
      if (sirenOsc) {
        sirenOsc.frequency.value = policeActive && !muted ? (Math.floor(sirenTimer * 1.6) % 2 === 0 ? 720 : 540) : 700;
        sirenGain.gain.setTargetAtTime(policeActive && !muted ? 0.045 : 0, ctx.currentTime, 0.1);
      }
    },
    shoot() { noise(0.09, 0.5, 2600); blip(190, 0.07, 'square', 0.22, 70); },
    enemyShoot() { noise(0.08, 0.3, 2000); },
    crash(strength) { noise(0.22, Math.min(0.8, 0.25 + strength), 500); blip(90, 0.18, 'sine', 0.4, 40); },
    pickup() { blip(660, 0.09, 'sine', 0.3); setTimeout(() => blip(990, 0.14, 'sine', 0.3), 90); },
    mission() { blip(523, 0.12, 'sine', 0.32); setTimeout(() => blip(659, 0.12, 'sine', 0.32), 110); setTimeout(() => blip(784, 0.22, 'sine', 0.32), 220); },
    busted() { blip(392, 0.25, 'sawtooth', 0.3, 180); setTimeout(() => blip(311, 0.4, 'sawtooth', 0.3, 150), 220); },
    click() { blip(800, 0.05, 'sine', 0.2); },
  };
}
