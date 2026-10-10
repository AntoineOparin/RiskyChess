// Generates the placeholder sound effects in assets/sfx/ (mono 16-bit 44.1 kHz WAV).
// They are synthesized here, so there are no licensing strings attached. Replace with
// produced sounds by dropping files with the same names into assets/sfx/.
// Usage: node scripts/gen-sfx.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 44100;
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sfx');

/** A tone: sine at `freq` (optionally sweeping to `to`), exponential decay, short attack. */
function tone({ freq, to = freq, ms, decay = 6, gain = 0.6, at = 0, noise = 0 }) {
  return { freq, to, ms, decay, gain, at, noise };
}

function render(parts) {
  const total = Math.max(...parts.map((p) => p.at + p.ms));
  const buf = new Float32Array(Math.ceil((total / 1000) * RATE));
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (const p of parts) {
    const start = Math.floor((p.at / 1000) * RATE);
    const n = Math.floor((p.ms / 1000) * RATE);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const f = p.freq + (p.to - p.freq) * t;
      phase += (2 * Math.PI * f) / RATE;
      const env = Math.min(1, i / (RATE * 0.002)) * Math.exp(-p.decay * t);
      const s = Math.sin(phase) * (1 - p.noise) + rnd() * p.noise;
      buf[start + i] += s * env * p.gain;
    }
  }
  return buf;
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const knock = (at = 0, gain = 0.7) => [
  tone({ freq: 190, to: 140, ms: 90, decay: 9, gain, at }),
  tone({ freq: 1200, ms: 25, decay: 10, gain: gain * 0.5, at, noise: 0.8 }),
];

const sounds = {
  pick_a: [tone({ freq: 880, ms: 60, decay: 8, gain: 0.45 })],
  // A fifth above A, so the two slots sound different.
  pick_b: [tone({ freq: 1320, ms: 60, decay: 8, gain: 0.4 })],
  lock: [tone({ freq: 320, to: 260, ms: 90, decay: 8, gain: 0.5 }), tone({ freq: 2400, ms: 30, decay: 12, gain: 0.3, noise: 0.9 })],
  tick: [tone({ freq: 2100, ms: 22, decay: 10, gain: 0.35 })],
  land: [tone({ freq: 660, ms: 260, decay: 5, gain: 0.4 }), tone({ freq: 990, ms: 260, decay: 6, gain: 0.3, at: 40 })],
  move: knock(),
  capture: [...knock(0, 0.85), tone({ freq: 2600, ms: 50, decay: 8, gain: 0.35, noise: 0.95 })],
  check: [...knock(), tone({ freq: 1500, ms: 70, decay: 7, gain: 0.35, at: 60 }), tone({ freq: 1500, ms: 70, decay: 7, gain: 0.35, at: 150 })],
  castle: [...knock(0, 0.6), ...knock(90, 0.7)],
  promote: [...knock(), tone({ freq: 700, to: 1400, ms: 220, decay: 3, gain: 0.3, at: 50 })],
  forced: [tone({ freq: 120, to: 90, ms: 180, decay: 6, gain: 0.75 }), tone({ freq: 600, ms: 40, decay: 10, gain: 0.25, noise: 0.85 })],
  win: [523, 659, 784, 1047].map((f, i) => tone({ freq: f, ms: 260, decay: 4, gain: 0.35, at: i * 110 })),
  lose: [440, 392, 330, 262].map((f, i) => tone({ freq: f, ms: 300, decay: 4, gain: 0.35, at: i * 140 })),
  draw: [523, 523].map((f, i) => tone({ freq: f, ms: 260, decay: 4, gain: 0.35, at: i * 180 })),
};

mkdirSync(out, { recursive: true });
for (const [name, parts] of Object.entries(sounds)) writeFileSync(join(out, `${name}.wav`), wav(render(parts)));
console.log(`wrote ${Object.keys(sounds).length} files to ${out}`);
