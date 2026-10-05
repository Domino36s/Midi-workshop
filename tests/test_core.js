// Tests fuer den Kern (src/core.js). Start: node tests/test_core.js
const assert = require('assert');
const C = require('../src/core.js');
let fehler = 0;
const test = (name, fn) => { try { fn(); console.log('ok   ', name); } catch (e) { fehler++; console.log('FEHL ', name, '\n     ', e.message); } };

const SK = [0, 2, 3, 5, 7, 8, 10];
const gen = (prompt, seed = 5) => { const p = C.parsePrompt(prompt); C.vervollstaendige(p); p.seed = seed; return { p, m: C.compose(p) }; };

test('Prompt-Parser: Tonart, Stil, Elemente, Charakter', () => {
  const p = C.parsePrompt('minimal abstract heavy hiphop-drums, sub, 808, and a melody polyrhythmisch, diatonisch, oder in g#');
  C.vervollstaendige(p);
  assert.strictEqual(C.NAMEN[p.pc], 'G#');
  assert.strictEqual(p.stil, 'hiphop');
  assert.strictEqual(p.skala, 'natuerlich');
  assert.deepStrictEqual(p.elemente.slice().sort(), ['808', 'drums', 'melody', 'sub']);
  assert(p.minimal && p.abstract && p.heavy && p.poly);
});

test('Prompt-Parser: Tempo, Takte, deutsche und englische Tonarten', () => {
  let p = C.parsePrompt('dark trap 140 bpm, eerie melody in F# phrygian');
  assert.strictEqual(p.bpm, 140); assert.strictEqual(C.NAMEN[p.pc], 'F#'); assert.strictEqual(p.skala, 'phrygisch');
  p = C.parsePrompt('düsterer Techno, Gis-Moll, 16 Takte'); assert.strictEqual(C.NAMEN[p.pc], 'G#'); assert.strictEqual(p.takte, 16);
  p = C.parsePrompt('ambient pad, Bb minor'); assert.strictEqual(C.NAMEN[p.pc], 'Bb');
});

test('Generator: alle Toene liegen in der gewaehlten Moll-Tonleiter', () => {
  for (const prompt of ['minimal abstract heavy hiphop 808 sub melody polyrhythmic in g#', 'techno melody sub drums in A minor', 'ambient pad sub melody in Bb minor dorian']) {
    for (let seed = 1; seed <= 8; seed++) {
      const { p, m } = gen(prompt, seed);
      const sk = C.SKALEN[p.skala];
      for (const tr of m.tracks) {
        if (tr.notes[0] && tr.notes[0].c === 9) continue;
        for (const n of tr.notes) assert(sk.includes(((n.n - p.pc) % 12 + 12) % 12), `${tr.name}: Note ${n.n} nicht in ${p.skala} (Seed ${seed})`);
      }
    }
  }
});

test('Generator: gleicher Seed gibt gleiches Ergebnis', () => {
  const a = gen('trap melody 808 drums in C minor', 3).m, b = gen('trap melody 808 drums in C minor', 3).m;
  assert.deepStrictEqual(a.tracks.map((t) => t.notes), b.tracks.map((t) => t.notes));
});

test('MIDI schreiben und wieder lesen ergibt dieselben Noten', () => {
  const { m } = gen('hiphop drums 808 sub melody in G# minor');
  const back = C.parseMidi(new Uint8Array(C.writeMidi(m)));
  const a = m.tracks.map((t) => t.notes.length), b = back.tracks.filter((t) => t.notes.length).map((t) => t.notes.length);
  assert.deepStrictEqual(b, a);
  assert(Math.abs(C.analysiere(back).ts.mittel - 90) < 0.01);
});

test('ZIP: gueltige Struktur und Inhalt', () => {
  const data = new Uint8Array([1, 2, 3, 4, 5]);
  const z = C.makeZip('x.mid', data);
  assert.strictEqual(z[0], 0x50); assert.strictEqual(z[1], 0x4b);
  assert.strictEqual(z.length, 30 + 5 + 5 + 46 + 5 + 22);
});

test('Drift-Korrektur: 128 von 128 Noten auf der richtigen Position (normal quantisiert: weniger)', () => {
  const bsp = C.beispielDrift();
  const opt = { raster: '8', staerke: 100, swing: 0, laengen: false, tempoModus: 'behalten', tempo: 100, zeitModus: 'takte', drift: false, traegheit: 0.2 };
  const treffer = (drift) => C.bearbeite(bsp, { ...opt, drift }).model.tracks[0].notes.map((n) => n.s).sort((x, y) => x - y).filter((s, i) => s === i * 240).length;
  assert.strictEqual(treffer(true), 128);
  assert(treffer(false) < 60);
});

test('Tempo glaetten: Tempo-Map wird zu einem festen Tempo, Dauer bleibt', () => {
  const tm = { tpb: 480, format: 1, timeSig: false, meta: {}, tempos: [], tracks: [{ name: 'x', channel: 0, notes: [], other: [], end: 64 * 240 }] };
  for (let b = 0; b < 8; b++) tm.tempos.push({ t: b * 1920, tp: Math.round(60000000 / (100 + b * 1.5)) });
  for (let j = 0; j < 64; j++) tm.tracks[0].notes.push({ s: j * 240, e: j * 240 + 200, n: 62, v: 90, c: 0 });
  const o = { raster: '16', staerke: 100, swing: 0, laengen: false, tempoModus: 'glatt', tempo: 100, zeitModus: 'takte', drift: false, traegheit: 0.2 };
  const r = C.bearbeite(tm, o);
  assert.strictEqual(r.model.tempos.length, 1);
  const vor = C.tickZuSek(C.endTick(tm), tm.tempos, 480), nach = C.tickZuSek(C.endTick(r.model), r.model.tempos, 480);
  assert(Math.abs(vor - nach) < 0.05, `Dauer ${vor} vs ${nach}`);
});

process.exitCode = fehler ? 1 : 0;
console.log(fehler ? `\n${fehler} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden');
