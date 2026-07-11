// WebAudio, zero asset files. The mains hum is the score: a low drone whose
// volume scales with MW online. A trip cuts it to silence — the loudest
// sound in the game.

let ac = null;
let humOsc = null;
let humOsc2 = null;
let humGain = null;
let enabled = true;

export const initAudio = () => {
  if (ac) return;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    humGain = ac.createGain();
    humGain.gain.value = 0;
    humGain.connect(ac.destination);
    humOsc = ac.createOscillator();
    humOsc.frequency.value = 60;
    humOsc.type = 'sawtooth';
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 140;
    humOsc.connect(f);
    f.connect(humGain);
    humOsc.start();
    humOsc2 = ac.createOscillator();
    humOsc2.frequency.value = 120;
    humOsc2.type = 'sine';
    const g2 = ac.createGain();
    g2.gain.value = 0.35;
    humOsc2.connect(g2);
    g2.connect(humGain);
    humOsc2.start();
  } catch { ac = null; }
};

export const setEnabled = (on) => {
  enabled = on;
  if (!on && humGain) humGain.gain.setTargetAtTime(0, ac.currentTime, 0.1);
};
export const isEnabled = () => enabled;

export const setHumMW = (mw) => {
  if (!ac || !enabled) return;
  const target = Math.min(0.05, (mw / 600) * 0.05);
  humGain.gain.setTargetAtTime(target, ac.currentTime, 1.5);
};

export const humCut = () => {
  if (!ac) return;
  humGain.gain.setTargetAtTime(0, ac.currentTime, 0.02);
};

const env = (freq, type, dur, vol = 0.08, when = 0) => {
  if (!ac || !enabled) return;
  const t = ac.currentTime + when;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(ac.destination);
  o.start(t); o.stop(t + dur);
};

const noise = (dur, vol = 0.1, when = 0) => {
  if (!ac || !enabled) return;
  const t = ac.currentTime + when;
  const len = ac.sampleRate * dur;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const g = ac.createGain();
  g.gain.value = vol;
  src.connect(g); g.connect(ac.destination);
  src.start(t);
};

export const sfx = (name) => {
  if (!ac || !enabled) return;
  switch (name) {
    case 'relay':    noise(0.06, 0.12); env(90, 'square', 0.05, 0.05); break;
    case 'annunc':   env(880, 'square', 0.12, 0.04); env(880, 'square', 0.12, 0.04, 0.2); break;
    case 'chirp':    env(1400, 'sine', 0.05, 0.03); break;
    case 'squelch':  noise(0.08, 0.05); env(300, 'sine', 0.06, 0.02, 0.05); break;
    case 'tick':     env(2100, 'square', 0.015, 0.015); break;
    case 'confirm':  env(660, 'sine', 0.08, 0.05); env(990, 'sine', 0.1, 0.05, 0.08); break;
    case 'syncok':   env(523, 'sine', 0.15, 0.05); env(659, 'sine', 0.15, 0.05, 0.12);
                     env(784, 'sine', 0.25, 0.05, 0.24); break;
    case 'energize': env(220, 'sawtooth', 0.5, 0.03); env(440, 'sine', 0.4, 0.04, 0.1); break;
    case 'trip':     noise(0.25, 0.2); env(55, 'square', 0.4, 0.12); humCut(); break;
    case 'alarm':    env(440, 'square', 0.3, 0.05); env(349, 'square', 0.3, 0.05, 0.35); break;
    case 'dawn':     env(392, 'sine', 0.3, 0.04); env(523, 'sine', 0.4, 0.04, 0.25); break;
    case 'ending':   [523, 659, 784, 1047].forEach((f, i) => env(f, 'sine', 0.5, 0.05, i * 0.2)); break;
  }
};
