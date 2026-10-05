// Info-Skript (kein Pass/Fail): zeigt, wie gut die Tempo-Schaetzung bei synthetischen Drum-Mustern trifft. Start: node tests/tempo_schaetzung.js
const C = require('../src/core.js');
const rng = (() => { let a = 7; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
function drums(bpm, bars, jitterMs, mapWobble) {
  // Muster: Kick 0,6,10  Snare 4,12  Hats auf Achteln, in realer Zeit; optional Tempo-Map die den Schwankungen folgt
  const notes = [], secPer16 = 60 / bpm / 4, tempos = [];
  let t = 0;
  const tpb = 480;
  for (let b = 0; b < bars; b++) for (let s = 0; s < 16; s++) {
    const wob = mapWobble ? 1 + mapWobble * Math.sin((b * 16 + s) / 50) : 1;
    const tick = (b * 16 + s) * 120;
    if (mapWobble && s % 4 === 0) tempos.push({ t: tick, tp: Math.round(60e6 / (bpm / wob)) });
    const hits = [];
    if ([0, 6, 10].includes(s)) hits.push(36);
    if ([4, 12].includes(s)) hits.push(38);
    if (s % 2 === 0) hits.push(42);
    for (const n of hits) notes.push({ s: tick + Math.round((rng() - .5) * 2 * jitterMs / 1000 / secPer16 * 120), e: tick + 60, n, v: 90, c: 9 });
  }
  if (!tempos.length) tempos.push({ t: 0, tp: Math.round(60e6 / bpm) });
  return { tpb, format: 1, timeSig: false, meta: {}, tempos, tracks: [{ name: 'drums', channel: 9, notes, other: [], end: bars * 1920 }] };
}
for (const [bpm, jit, wob] of [[96, 12, 0], [120, 12, 0], [85, 15, 0], [140, 10, 0], [96, 8, 0.12], [113, 8, 0.07]]) {
  const m = drums(bpm, 40, jit, wob);
  const r = C.schaetzeTempo(m);
  console.log(`echt ${String(bpm).padStart(3)} BPM, Jitter ${jit} ms, Tempo-Map-Schwankung ${wob * 100}% ->`, r ? `Schaetzung ${r.bpm} (Kandidaten ${r.kand.join(' / ')}, Sicherheit ${r.sicher.toFixed(2)})` : 'zu wenig Noten');
}
