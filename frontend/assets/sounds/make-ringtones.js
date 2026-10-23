// Synthesises the fake-call ringtones (no third-party audio). Run: node make-ringtones.js
const fs = require("fs"), path = require("path");
const RATE = 22050;
const wav = (samples) => {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write("WAVE", 8);
  b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(s * 32767))), 44 + i * 2));
  return b;
};
const out = (name, s) => fs.writeFileSync(path.join(__dirname, name), wav(s));
// Classic phone ring: 440 + 480 Hz, two short bursts, then a pause (loops)
const ring = [];
for (let i = 0; i < RATE * 3.2; i++) {
  const t = i / RATE;
  const on = (t < 0.4) || (t > 0.6 && t < 1.0);
  const env = on ? Math.min(1, Math.min(t % 0.6, 0.4 - (t % 0.6) + 0.0001) * 60) : 0;
  ring.push(on ? 0.35 * env * (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t)) : 0);
}
out("ring_classic.wav", ring);
// Soft bell: three decaying chimes, then a pause
const bell = new Array(Math.round(RATE * 3)).fill(0);
[[0, 880], [0.35, 1108.7], [0.7, 1318.5]].forEach(([start, f]) => {
  for (let i = 0; i < RATE * 1.4; i++) {
    const t = i / RATE, j = Math.round(start * RATE) + i;
    if (j < bell.length) bell[j] += 0.3 * Math.exp(-t * 3.5) * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2 * t));
  }
});
out("ring_soft.wav", bell);
console.log("ok");
