// Tiny UI sounds, made on the fly (no audio files). Off when muted, or by default when the device asks for less motion.
const KEY = 'echoes-sound';
let ac;

export function soundOn() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return saved === 'on';
  } catch {}
  return !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function setSound(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch {}
}

function out() {
  ac ??= new AudioContext();
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

function tone(freq, dur, vol, delay = 0) {
  const a = out(), t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function tick(dur, vol, highpass) {
  const a = out(), buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = buf;
  f.type = 'highpass';
  f.frequency.value = highpass;
  g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination);
  s.start();
}

const SOUNDS = {
  tap: () => tick(0.03, 0.3, 3000),
  tab: () => tone(1800, 0.04, 0.07),
  big: () => { tick(0.04, 0.3, 1500); tone(900, 0.08, 0.09); },
  ok: () => { tone(1320, 0.09, 0.07); tone(1760, 0.14, 0.07, 0.07); },
};

export function play(name) {
  if (soundOn()) SOUNDS[name]();
}

// One listener for the whole app; the kind of control picks the sound. Fires on press, not release, so it feels instant.
export function listen() {
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('button, a, label, .story-stage');
    if (!el || el.disabled) return;
    play(el.matches('.button') ? 'big' : el.matches('.nav, .tab, .pill') ? 'tab' : 'tap');
  });
}
