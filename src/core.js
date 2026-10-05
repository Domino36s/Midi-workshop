'use strict';
/* ====== Kern: MIDI lesen/schreiben, Werkzeug, Generator (reine Funktionen) ====== */

const TPB = 480;
const S = TPB / 4;
const NAMEN = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

const SKALEN = {
  natuerlich: [0, 2, 3, 5, 7, 8, 10],
  dorisch: [0, 2, 3, 5, 7, 9, 10],
  phrygisch: [0, 1, 3, 5, 7, 8, 10],
  harmonisch: [0, 2, 3, 5, 7, 8, 11],
  pentatonik: [0, 3, 5, 7, 10],
};
const SKALEN7 = {};
for (const k in SKALEN) SKALEN7[k] = SKALEN[k].length === 7 ? SKALEN[k] : SKALEN.natuerlich;

const STIL_BPM = { hiphop: 90, trap: 140, techno: 128, house: 122, dnb: 174, ambient: 75 };
const STIL_ELEMENTE = {
  hiphop: ['drums', '808', 'melody'],
  trap: ['drums', '808', 'melody'],
  techno: ['drums', 'sub', 'melody'],
  house: ['drums', 'sub', 'chords', 'melody'],
  dnb: ['drums', 'sub', 'melody'],
  ambient: ['chords', 'sub', 'melody'],
};
const PROGRESSIONEN = [[0, 5, 2, 6], [0, 3, 5, 4], [0, 6, 5, 6], [0, 0, 5, 3], [0, 3, 0, 4], [0, 6, 0, 6]];
const MINIMAL_PROGRESSIONEN = [[0], [0, 0, 0, 6], [0, 0, 0, 5], [0, 3]];
const STUFEN = ['i', 'ii', 'III', 'iv', 'v', 'VI', 'VII'];

const STIL_WOERTER = {
  trap: ['trap', 'drill', 'phonk'],
  hiphop: ['hip[\\s-]?hop', 'boom[\\s-]?bap', '\\brap\\b', 'lo-?fi'],
  techno: ['techno'],
  house: ['house'],
  dnb: ['\\bdnb\\b', 'drum (?:and|&|n) bass', 'jungle'],
  ambient: ['ambient', 'drone', 'cinematic'],
};
const ELEMENT_WOERTER = {
  drums: '\\b(drums?|beats?|kicks?|snares?|hi-?hats?|hats|percussion|perkussion)\\b',
  '808': '\\b808s?\\b',
  sub: '\\bsub(?:-?bass)?\\b|\\bbass\\b',
  melody: '\\b(melod(?:y|ie|ien|ies)|lead|arp|arpeggio|synth)\\b',
  chords: '\\b(chords?|akkord\\w*|pads?)\\b',
};
const SKALA_WOERTER = [
  ['dorisch', 'dorian|dorisch'],
  ['phrygisch', 'phrygian|phrygisch'],
  ['harmonisch', 'harmonic minor|harmonisch'],
  ['pentatonik', 'pentatonic|pentatonik'],
  ['natuerlich', 'natural minor|natuerlich|natürlich|diatonic|diatonisch|aeolian|aeolisch|äolisch'],
];

/* ---------- Zufall (mit Seed) ---------- */
function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  const random = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo, hi) => lo + Math.floor(random() * (hi - lo + 1));
  const choice = (arr) => arr[Math.floor(random() * arr.length)];
  const sample = (arr, k) => {
    const c = arr.slice();
    for (let i = 0; i < Math.min(k, c.length); i++) {
      const j = i + Math.floor(random() * (c.length - i));
      [c[i], c[j]] = [c[j], c[i]];
    }
    return c.slice(0, k);
  };
  const choices = (pool, weights, k) => {
    const sum = weights.reduce((x, y) => x + y, 0);
    const out = [];
    for (let i = 0; i < k; i++) {
      let r = random() * sum, idx = 0;
      while (idx < pool.length - 1 && r >= weights[idx]) { r -= weights[idx]; idx++; }
      out.push(pool[idx]);
    }
    return out;
  };
  return { random, int, choice, sample, choices };
}

/* ---------- Prompt lesen ---------- */
function pcAus(l, v) {
  const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11, h: 11 }[l];
  let x = base;
  if (v === '#' || v === '♯') x++;
  else if (v === 'b' || v === '♭') x--;
  return ((x % 12) + 12) % 12;
}

function findeTonart(t) {
  let m = t.match(/\b([cdfga])is(?:[- ]?moll)?\b/);
  if (m) return pcAus(m[1], '#');
  m = t.match(/\b(as|des|es|ges)[- ]?moll\b/);
  if (m) return { as: 8, des: 1, es: 3, ges: 6 }[m[1]];
  m = t.match(/(?:^|[^a-z])([a-gh])\s?(#|♯)/);
  if (m) return pcAus(m[1], '#');
  m = t.match(/\b([a-gh])\s?(b|♭)?\s?[- ]?(?:minor|moll|min)\b/);
  if (m) return pcAus(m[1], m[2] || '');
  m = t.match(/\b(?:in|key of|key|tonart)\s+([a-gh])(#|♯|b|♭)?(?=\W|$)/);
  if (m) return pcAus(m[1], m[2] || '');
  return null;
}

function parsePrompt(text) {
  const t = text.toLowerCase();
  const p = { stil: null, pc: null, bpm: null, skala: null, takte: 8, elemente: [],
    minimal: false, abstract: false, heavy: false, poly: false, swing: null, dark: false };

  let best = 0;
  for (const s in STIL_WOERTER) {
    const n = STIL_WOERTER[s].reduce((a, w) => a + (t.match(new RegExp(w, 'g')) || []).length, 0);
    if (n > best) { best = n; p.stil = s; }
  }
  p.pc = findeTonart(t);
  let m = t.match(/(\d{2,3})\s*bpm/) || t.match(/bpm\s*[:=]?\s*(\d{2,3})/);
  if (m) p.bpm = Math.max(50, Math.min(220, parseInt(m[1], 10)));
  m = t.match(/(\d{1,3})\s*(?:takte|takt|bars?)\b/);
  if (m) p.takte = Math.max(1, Math.min(64, parseInt(m[1], 10)));
  for (const [name, w] of SKALA_WOERTER) {
    if (new RegExp(w).test(t)) { p.skala = name; break; }
  }
  p.elemente = Object.keys(ELEMENT_WOERTER).filter((e) => new RegExp(ELEMENT_WOERTER[e]).test(t));
  p.minimal = /minimal|sparse|reduced|reduziert|spärlich|spaerlich/.test(t);
  p.abstract = /abstract|abstrakt|experimental|glitch|\bidm\b|weird/.test(t);
  p.heavy = /heavy|\bhard\b|hart|aggressive|aggressiv|brutal|distorted/.test(t);
  p.dark = /dark|düster|duester|dunkel|ominous|gloomy/.test(t);
  p.poly = /polyrhythm|polymeter|polymetric|polymetrisch/.test(t);
  if (/swing|swung|shuffle/.test(t)) p.swing = 0.25;
  return p;
}

function vervollstaendige(p) {
  const annahmen = [];
  if (p.stil === null) { p.stil = 'hiphop'; annahmen.push('Stil nicht erkannt, daher Hip-Hop'); }
  if (p.pc === null) { p.pc = 9; annahmen.push('Tonart nicht erkannt, daher A-Moll'); }
  if (p.skala === null) {
    p.skala = p.dark ? 'phrygisch' : 'natuerlich';
    if (p.dark) annahmen.push('"dark" erkannt: phrygisch (Moll mit kleiner Sekunde)');
  }
  if (p.bpm === null) p.bpm = STIL_BPM[p.stil];
  if (!p.elemente.length) {
    p.elemente = STIL_ELEMENTE[p.stil].slice();
    annahmen.push('Keine Elemente genannt, daher Standard für ' + p.stil);
  }
  if (p.swing === null) p.swing = p.stil === 'hiphop' ? 0.12 : 0;
  return annahmen;
}

/* ---------- Generator ---------- */
function stufeZuNote(stufe, skala, grundton) {
  const n = skala.length;
  const okt = Math.floor(stufe / n);
  const idx = ((stufe % n) + n) % n;
  return grundton + skala[idx] + 12 * okt;
}
function tiefsterTon(pc, unter) { let n = unter; while (n % 12 !== pc) n++; return n; }
const clamp = (v, lo = 1, hi = 127) => Math.max(lo, Math.min(hi, Math.round(v)));
const range = (a, b, st = 1) => { const o = []; for (let i = a; i < b; i += st) o.push(i); return o; };

function addNote(list, start, len, note, vel, ch) {
  list.push({ s: Math.round(start), e: Math.round(start) + Math.max(1, Math.round(len)), n: note, v: clamp(vel), c: ch });
}

function drumMuster(p, rng) {
  const notes = [], kickMap = {};
  const st = p.stil, sw = Math.floor(p.swing * S);
  const { heavy, minimal, abstract } = p;
  const kickV = heavy ? 122 : 105, snareV = heavy ? 118 : 100;

  for (let b = 0; b < p.takte; b++) {
    const o = b * 16;
    let kicks, snares, hats, snareNote;
    if (st === 'hiphop') {
      kicks = [0].concat(rng.sample([3, 7, 10, 11, 14], minimal ? 1 : 2));
      snares = [4, 12]; hats = range(0, 16, 2); snareNote = 38;
    } else if (st === 'trap') {
      kicks = [0].concat(rng.sample([3, 6, 7, 10, 11, 14], minimal ? 1 : rng.choice([2, 3])));
      snares = [8]; hats = range(0, 16); snareNote = 39;
    } else if (st === 'techno' || st === 'house') {
      kicks = [0, 4, 8, 12]; snares = [4, 12]; hats = [2, 6, 10, 14]; snareNote = 39;
    } else if (st === 'dnb') {
      kicks = [0, 10]; snares = [4, 12]; hats = range(0, 16, 2); snareNote = 38;
    } else { kickMap[b] = [0]; continue; }

    if (minimal) hats = hats.filter((_, i) => i % 2 === 0);
    if (abstract) {
      const versetze = (liste, behalteErste) => {
        const neu = [];
        liste.forEach((s, i) => {
          if (behalteErste && i === 0) { neu.push(s); return; }
          const r = rng.random();
          if (r < 0.15) return;
          if (r < 0.40) s = Math.max(0, Math.min(15, s + rng.choice([-1, 1])));
          neu.push(s);
        });
        return Array.from(new Set(neu)).sort((x, y) => x - y);
      };
      kicks = versetze(kicks, true);
      snares = versetze(snares); if (!snares.length) snares = [snares0(st)];
      hats = versetze(hats);
    }
    kickMap[b] = kicks.slice().sort((x, y) => x - y);
    const tick = (step) => (o + step) * S + (step % 2 === 1 ? sw : 0);

    for (const s of kicks) addNote(notes, tick(s), 60, 36, kickV + rng.int(-5, 5), 9);
    for (const s of snares) addNote(notes, tick(s), 60, snareNote, snareV + rng.int(-5, 5), 9);
    for (const s of hats) {
      const note = rng.random() < 0.06 ? 46 : 42;
      addNote(notes, tick(s), 40, note, 62 + (s % 4 === 0 ? 16 : 0) + rng.int(-10, 10), 9);
    }
    if (st === 'trap' && !minimal && b % 2 === 1) {
      for (let k = 0; k < 4; k++) addNote(notes, (o + 14) * S + k * (S / 2), S / 2 - 5, 42, 60 + k * 12, 9);
    }
    if (abstract) {
      const n = rng.int(1, 3);
      for (let i = 0; i < n; i++) addNote(notes, tick(rng.int(0, 15)), 40, rng.choice([37, 45, 39]), rng.int(40, 70), 9);
    }
  }
  return { notes, kickMap };
}
function snares0(st) { return st === 'trap' ? 8 : 4; }

function compose(p) {
  const rng = makeRng(p.seed);
  const sk = SKALEN[p.skala], sk7 = SKALEN7[p.skala];
  const { pc, takte, stil: st, elemente: elems, minimal, abstract, heavy } = p;
  const sw = Math.floor(p.swing * S);
  const has = (e) => elems.includes(e);

  const liste = (minimal || abstract) ? MINIMAL_PROGRESSIONEN : PROGRESSIONEN;
  const folge = rng.choice(liste);
  const akkordTakte = (st === 'ambient' || minimal) ? 2 : 1;
  const stufeBei = (bar) => folge[Math.floor(bar / akkordTakte) % folge.length];
  const wurzelPc = (bar) => (pc + sk7[stufeBei(bar) % 7]) % 12;

  const drums = drumMuster(p, rng);
  const tracks = [];
  const mk = (name, ch, program, notes) => ({
    name, channel: ch, notes,
    other: program === null ? [] : [{ t: 0, bytes: [0xC0 | ch, program] }],
  });

  if (has('drums') && drums.notes.length) tracks.push(mk('Drums', 9, null, drums.notes));

  if (has('808')) {
    const notes = [];
    const lo = has('sub') ? 36 : 31;
    for (let b = 0; b < takte; b++) {
      const note = tiefsterTon(wurzelPc(b), lo);
      let steps = drums.kickMap[b] || [0];
      if (minimal) steps = steps.slice(0, 1);
      steps.forEach((s, i) => {
        const ende = i + 1 < steps.length ? steps[i + 1] : 16;
        addNote(notes, (b * 16 + s) * S, (ende - s) * S - 10, note, heavy ? 118 : 100, 2);
      });
    }
    tracks.push(mk('808', 2, 38, notes));
  }

  if (has('sub')) {
    const notes = [];
    const lo = has('808') ? 24 : 31;
    for (let b = 0; b < takte; b++) {
      const note = tiefsterTon(wurzelPc(b), lo);
      if (['techno', 'house', 'dnb'].includes(st) && !has('808')) {
        for (const s of [2, 6, 10, 14]) addNote(notes, (b * 16 + s) * S, 2 * S - 15, note, 95, 3);
      } else if (b % akkordTakte === 0) {
        addNote(notes, b * 16 * S, Math.min(akkordTakte, takte - b) * 16 * S - 15, note, 90, 3);
      }
    }
    tracks.push(mk('Sub', 3, 38, notes));
  }

  if (has('chords')) {
    const notes = [];
    const basis = 48 + pc;
    for (let b = 0; b < takte; b += akkordTakte) {
      const s_ = stufeBei(b);
      const len = Math.min(akkordTakte, takte - b) * 16 * S - 15;
      for (const i of [0, 2, 4]) addNote(notes, b * 16 * S, len, stufeZuNote(s_ + i, sk7, basis), 58, 1);
    }
    tracks.push(mk('Akkorde', 1, 89, notes));
  }

  let polyInfo = null;
  if (has('melody')) {
    const notes = [];
    const basis = 60 + pc - (pc >= 7 ? 12 : 0);
    const dichte = minimal ? 0.3 : 0.55;
    const total = takte * 16;
    let r, rhythmus, pitchLen, muster;

    if (p.poly) {
      r = rng.choice([3, 5, 7]);
      const kT = Math.max(1, Math.round(r * (minimal ? 0.3 : 0.45)));
      rhythmus = new Array(r).fill(false);
      [0].concat(rng.sample(range(1, r), kT - 1)).forEach((pos) => { rhythmus[pos] = true; });
      pitchLen = rng.choice([2, 3, 4, 5].filter((x) => x !== r));
      muster = () => rhythmus;
      polyInfo = r + ' gegen 16, Tonzyklus ' + pitchLen;
    } else {
      r = 16;
      const basisMuster = [true];
      for (let i = 1; i < 16; i++) basisMuster.push(rng.random() < (i % 4 === 0 ? 0.7 : dichte * 0.6));
      muster = (bar) => {
        if (bar % 4 === 3) {
          const m = basisMuster.slice();
          for (const s of rng.sample(range(1, 16), 2)) m[s] = !m[s];
          return m;
        }
        return basisMuster;
      };
      pitchLen = abstract ? rng.choice([3, 5]) : 4;
    }
    const tonfolge = rng.choices([0, 2, 4, 1, 3, 5, 6, 7], [5, 4, 4, 2, 2, 2, 1, 2], pitchLen);
    let k = 0;
    for (let i = 0; i < total; i++) {
      const bar = Math.floor(i / 16);
      const pat = muster(bar);
      const c = i % r;
      if (!pat[c]) continue;
      let nxt = r;
      for (let j = 1; j <= r; j++) { if (pat[(c + j) % r]) { nxt = j; break; } }
      const shift = sk.length === 7 ? stufeBei(bar) : 0;
      const note = stufeZuNote(tonfolge[k % pitchLen] + shift, sk, basis);
      k++;
      const start = i * S + (i % 2 === 1 ? sw : 0);
      let len = Math.max(S / 2, Math.floor(Math.min(nxt, 4) * S * 0.9));
      len = Math.min(len, total * S - start);
      addNote(notes, start, len, note, 82 + (i % 4 === 0 ? 14 : 0) + (heavy ? 10 : 0) + rng.int(-8, 8), 0);
    }
    tracks.push(mk('Melodie', 0, 81, notes));
  }

  return {
    tpb: TPB, format: 1, timeSig: true,
    tempos: [{ t: 0, tp: Math.round(60000000 / p.bpm) }],
    tracks,
    meta: { folge: folge.map((s) => STUFEN[s]).join('-'), polyInfo },
  };
}

/* ---------- MIDI lesen ---------- */
function parseMidi(buf) {
  const d = new Uint8Array(buf);
  const u32 = (i) => ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0;
  const u16 = (i) => (d[i] << 8) | d[i + 1];
  if (d.length < 14 || u32(0) !== 0x4d546864) throw new Error('Das ist keine MIDI-Datei.');
  const format = u16(8), ntrks = u16(10), div = u16(12);
  if (div & 0x8000) throw new Error('SMPTE-Zeitbasis wird nicht unterstützt.');
  let pos = 8 + u32(4);
  const tempos = [], tracks = [];

  for (let ti = 0; ti < ntrks && pos + 8 <= d.length; ti++) {
    if (u32(pos) !== 0x4d54726b) throw new Error('Spur ' + ti + ' ist beschädigt.');
    const len = u32(pos + 4);
    let i = pos + 8;
    const endPos = Math.min(d.length, i + len);
    pos = endPos;
    let t = 0, running = 0, name = '';
    const open = {}, notes = [], other = [];
    const vlq = () => { let v = 0, b; do { b = d[i++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80 && i < endPos); return v; };

    while (i < endPos) {
      t += vlq();
      let st = d[i];
      if (st < 0x80) st = running; else i++;
      if (st === 0xff) {
        const type = d[i++]; const l = vlq(); const data = Array.from(d.slice(i, i + l)); i += l;
        if (type === 0x51 && l === 3) tempos.push({ t, tp: (data[0] << 16) | (data[1] << 8) | data[2] });
        else if (type === 0x2f) { /* Ende */ }
        else {
          if (type === 0x03) name = String.fromCharCode.apply(null, data);
          const lv = []; let x = l; lv.unshift(x & 0x7f); while ((x >>= 7)) lv.unshift((x & 0x7f) | 0x80);
          other.push({ t, bytes: [0xff, type, ...lv, ...data] });
        }
      } else if (st === 0xf0 || st === 0xf7) {
        const l = vlq(); const data = Array.from(d.slice(i, i + l)); i += l;
        const lv = []; let x = l; lv.unshift(x & 0x7f); while ((x >>= 7)) lv.unshift((x & 0x7f) | 0x80);
        other.push({ t, bytes: [st, ...lv, ...data] });
      } else {
        running = st;
        const type = st & 0xf0, ch = st & 0x0f;
        const n = (type === 0xc0 || type === 0xd0) ? 1 : 2;
        const a = d[i], b2 = n === 2 ? d[i + 1] : 0;
        i += n;
        if (type === 0x90 && b2 > 0) {
          const nn = { s: t, e: null, n: a, v: b2, c: ch };
          (open[ch + ':' + a] = open[ch + ':' + a] || []).push(nn); notes.push(nn);
        } else if (type === 0x80 || type === 0x90) {
          const q = open[ch + ':' + a];
          if (q && q.length) q.shift().e = t;
        } else {
          other.push({ t, bytes: n === 2 ? [st, a, b2] : [st, a] });
        }
      }
    }
    for (const n of notes) if (n.e === null) n.e = t;
    tracks.push({ name, notes, other, end: t, channel: notes.length ? notes[0].c : 0 });
  }
  tempos.sort((a, b) => a.t - b.t);
  return { tpb: div, format, tempos, tracks, timeSig: false, meta: {} };
}

/* ---------- MIDI schreiben ---------- */
function vlqBytes(v) {
  const o = [v & 0x7f];
  while ((v >>= 7)) o.unshift((v & 0x7f) | 0x80);
  return o;
}
function trackBytes(events) {
  events.sort((a, b) => a.t - b.t || a.o - b.o);
  const out = [];
  let last = 0;
  for (const e of events) { out.push(...vlqBytes(Math.max(0, e.t - last)), ...e.bytes); last = Math.max(last, e.t); }
  out.push(0, 0xff, 0x2f, 0);
  return out;
}
function writeMidi(model) {
  const chunks = [];
  const tempoEv = model.tempos.map((x) => ({ t: x.t, o: 0, bytes: [0xff, 0x51, 3, (x.tp >> 16) & 255, (x.tp >> 8) & 255, x.tp & 255] }));
  if (model.timeSig) tempoEv.push({ t: 0, o: 0, bytes: [0xff, 0x58, 4, 4, 2, 24, 8] });
  chunks.push(trackBytes(tempoEv));
  for (const tr of model.tracks) {
    const ev = [];
    if (tr.name && !tr.other.some((o) => o.bytes[0] === 0xff && o.bytes[1] === 0x03)) {
      const nb = Array.from(new TextEncoder().encode(tr.name));
      ev.push({ t: 0, o: 0, bytes: [0xff, 0x03, ...vlqBytes(nb.length), ...nb] });
    }
    for (const o of tr.other) ev.push({ t: o.t, o: 1, bytes: o.bytes });
    for (const n of tr.notes) {
      ev.push({ t: n.s, o: 2, bytes: [0x90 | n.c, n.n, n.v] });
      ev.push({ t: n.e, o: 0, bytes: [0x80 | n.c, n.n, 0] });
    }
    if (!ev.length) continue;
    chunks.push(trackBytes(ev));
  }
  const out = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, chunks.length, (model.tpb >> 8) & 255, model.tpb & 255];
  for (const c of chunks) {
    const l = c.length;
    out.push(0x4d, 0x54, 0x72, 0x6b, (l >>> 24) & 255, (l >> 16) & 255, (l >> 8) & 255, l & 255);
    for (let i = 0; i < c.length; i++) out.push(c[i]);
  }
  return new Uint8Array(out);
}

/* ---------- ZIP (nur speichern, ohne Kompression) ---------- */
function crc32(bytes) {
  if (!crc32.t) {
    crc32.t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc32.t[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crc32.t[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function makeZip(name, data) {
  const nb = new TextEncoder().encode(name), crc = crc32(data), n = data.length;
  const date = ((2026 - 1980) << 9) | (10 << 5) | 4;
  const le16 = (v) => [v & 255, (v >> 8) & 255];
  const le32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  const local = [...le32(0x04034b50), ...le16(20), ...le16(0x0800), ...le16(0), ...le16(0), ...le16(date),
    ...le32(crc), ...le32(n), ...le32(n), ...le16(nb.length), ...le16(0), ...nb];
  const central = [...le32(0x02014b50), ...le16(20), ...le16(20), ...le16(0x0800), ...le16(0), ...le16(0), ...le16(date),
    ...le32(crc), ...le32(n), ...le32(n), ...le16(nb.length), ...le16(0), ...le16(0), ...le16(0), ...le16(0), ...le32(0), ...le32(0), ...nb];
  const cdOffset = local.length + n;
  const end = [...le32(0x06054b50), ...le16(0), ...le16(0), ...le16(1), ...le16(1), ...le32(central.length), ...le32(cdOffset), ...le16(0)];
  const out = new Uint8Array(local.length + n + central.length + end.length);
  out.set(local, 0); out.set(data, local.length); out.set(central, local.length + n); out.set(end, local.length + n + central.length);
  return out;
}

/* ---------- Werkzeug: Analyse, Quantisieren, Tempo, Drift ---------- */
const endTick = (m) => { let e = 0; for (const tr of m.tracks) { e = Math.max(e, tr.end || 0); for (const n of tr.notes) e = Math.max(e, n.e); } return e; };
const tp2bpm = (tp) => 60000000 / tp;

function tempoStats(tempos, total) {
  if (!tempos.length) return { mittel: 120, lo: 120, hi: 120, anz: 0 };
  const pts = tempos.slice();
  if (pts[0].t > 0) pts.unshift({ t: 0, tp: 500000 });
  let summe = 0, dauer = 0;
  pts.forEach((p, i) => {
    const bis = i + 1 < pts.length ? pts[i + 1].t : Math.max(total, p.t + 1);
    summe += p.tp * (bis - p.t); dauer += bis - p.t;
  });
  const bpms = pts.map((p) => tp2bpm(p.tp));
  return { mittel: tp2bpm(summe / Math.max(1, dauer)), lo: Math.min(...bpms), hi: Math.max(...bpms), anz: tempos.length };
}
function tickZuSek(tick, tempos, tpb) {
  const pts = tempos.slice();
  if (!pts.length || pts[0].t > 0) pts.unshift({ t: 0, tp: 500000 });
  let sek = 0;
  for (let i = 0; i < pts.length; i++) {
    const bis = i + 1 < pts.length ? pts[i + 1].t : Infinity;
    if (tick <= bis) return sek + (tick - pts[i].t) * pts[i].tp / 1e6 / tpb;
    sek += (bis - pts[i].t) * pts[i].tp / 1e6 / tpb;
  }
  return sek;
}
function rasterTicks(g, tpb) {
  const tri = g.endsWith('t'), n = parseInt(g, 10), base = tpb * 4 / n;
  return tri ? base * 2 / 3 : base;
}
function abweichungen(starts, raster) {
  return starts.map((s) => { const r = ((s % raster) + raster) % raster; return r > raster / 2 ? r - raster : r; });
}
function driftSchaetzung(starts, raster) {
  const st = Array.from(new Set(starts)).sort((a, b) => a - b);
  if (st.length < 8) return null;
  const res = abweichungen(st, raster), entw = [res[0]];
  let versatz = 0;
  for (let i = 1; i < res.length; i++) {
    const d = res[i] - res[i - 1];
    if (d > raster / 2) versatz -= raster; else if (d < -raster / 2) versatz += raster;
    entw.push(res[i] + versatz);
  }
  const n = st.length, mx = st.reduce((a, b) => a + b, 0) / n, my = entw.reduce((a, b) => a + b, 0) / n;
  let zae = 0, nen = 0;
  for (let i = 0; i < n; i++) { zae += (st[i] - mx) * (entw[i] - my); nen += (st[i] - mx) ** 2; }
  return nen === 0 ? null : zae / nen;
}
const allStarts = (m) => m.tracks.flatMap((tr) => tr.notes.map((n) => n.s));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function analysiere(m) {
  const total = endTick(m);
  const ts = tempoStats(m.tempos, total);
  const starts = allStarts(m);
  const ms = 60000 / ts.mittel / m.tpb;
  const out = { ts, dauer: tickZuSek(total, m.tempos, m.tpb), anzNoten: starts.length, spuren: [], dev: {}, drift: null };
  m.tracks.forEach((tr, i) => {
    if (!tr.notes.length) return;
    const ns = tr.notes.map((n) => n.n);
    out.spuren.push({ name: tr.name || ('Spur ' + (i + 1)), anz: ns.length, lo: Math.min(...ns), hi: Math.max(...ns), drums: tr.notes[0].c === 9 });
  });
  if (starts.length) {
    for (const g of ['16', '8']) {
      const ab = abweichungen(starts, rasterTicks(g, m.tpb)).map(Math.abs);
      out.dev[g] = { mittel: mean(ab) * ms, max: Math.max(...ab) * ms };
    }
    const sl = driftSchaetzung(starts, rasterTicks('16', m.tpb));
    if (sl !== null && Math.abs(sl) > 0.002) out.drift = { prozent: sl * 100, scheinbar: ts.mittel / (1 + sl) };
  }
  return out;
}

function kopie(m) {
  return {
    tpb: m.tpb, format: m.format, timeSig: m.timeSig, meta: m.meta,
    tempos: m.tempos.map((x) => ({ ...x })),
    tracks: m.tracks.map((tr) => ({
      name: tr.name, channel: tr.channel, end: tr.end,
      notes: tr.notes.map((n) => ({ ...n })),
      other: tr.other.map((o) => ({ t: o.t, bytes: o.bytes.slice() })),
    })),
  };
}

function bearbeite(m0, o) {
  const m = kopie(m0);
  const tpb = m.tpb, total = endTick(m);
  const ts = tempoStats(m.tempos, total);
  const g = rasterTicks(o.raster, tpb);
  const vorher = allStarts(m);
  const abVor = vorher.length ? abweichungen(vorher, g).map(Math.abs) : [0];

  let neuesTempo = null;
  if (o.tempoModus === 'fest') neuesTempo = o.tempo;
  else if (o.tempoModus === 'glatt') neuesTempo = ts.mittel;
  let tempos = m.tempos.length ? m.tempos : [{ t: 0, tp: 500000 }];
  if (neuesTempo) {
    const neuTp = Math.round(60000000 / neuesTempo);
    if (o.zeitModus === 'sekunden') {
      const um = (t) => Math.round(tickZuSek(t, m.tempos, tpb) / (neuTp / 1e6) * tpb);
      for (const tr of m.tracks) {
        for (const n of tr.notes) { n.s = um(n.s); n.e = um(n.e); }
        for (const e of tr.other) e.t = um(e.t);
      }
    }
    tempos = [{ t: 0, tp: neuTp }];
  }
  const bpmOut = tempos.length === 1 ? tp2bpm(tempos[0].tp) : ts.mittel;
  const ms = 60000 / bpmOut / tpb;

  const korr = new Map();
  if (o.drift) {
    let off = 0;
    for (const t of Array.from(new Set(allStarts(m))).sort((a, b) => a - b)) {
      let r = (((t - off) % g) + g) % g;
      if (r > g / 2) r -= g;
      off += o.traegheit * r;
      korr.set(t, off);
    }
  }
  for (const tr of m.tracks) {
    for (const n of tr.notes) {
      const start = n.s - (korr.get(n.s) || 0);
      let dauer = n.e - n.s;
      const q = Math.round(start / g) * g;
      let neu = start + (q - start) * o.staerke / 100;
      if (o.swing && Math.round(q / g) % 2 === 1) neu += o.swing / 100 * g;
      if (o.laengen) dauer = Math.max(g, Math.round(dauer / g) * g);
      n.s = Math.max(0, Math.round(neu));
      n.e = n.s + Math.max(1, Math.round(dauer));
    }
  }
  const nachher = allStarts(m);
  const abNach = nachher.length ? abweichungen(nachher, g).map(Math.abs) : [0];
  m.tempos = tempos;
  m.tracks = m.tracks.filter((tr) => tr.notes.length || tr.other.length);
  m.timeSig = false;
  return {
    model: m,
    bericht: {
      tempoVon: ts, tempoNach: neuesTempo ? bpmOut : null, anz: m.tempos.length,
      devVor: { mittel: mean(abVor) * ms, max: Math.max(...abVor) * ms },
      devNach: { mittel: mean(abNach) * ms, max: Math.max(...abNach) * ms },
    },
  };
}


function tempoMedian(tempos, total) {
  if (!tempos.length) return 120;
  const pts = tempos.slice();
  if (pts[0].t > 0) pts.unshift({ t: 0, tp: 500000 });
  const seg = pts.map((p, i) => ({ bpm: tp2bpm(p.tp), w: (i + 1 < pts.length ? pts[i + 1].t : Math.max(total, p.t + 1)) - p.t })).sort((a, b) => a.bpm - b.bpm);
  const half = seg.reduce((a, x) => a + x.w, 0) / 2;
  let acc = 0;
  for (const x of seg) { acc += x.w; if (acc >= half) return x.bpm; }
  return seg[seg.length - 1].bpm;
}

/* ---------- Tempo-Schaetzung aus den Notenabstaenden (reale Zeit, mit Tempo-Map) ---------- */
function schaetzeTempo(m) {
  const secs = allStarts(m).map((t) => tickZuSek(t, m.tempos, m.tpb));
  const bins = Array.from(new Set(secs.map((x) => Math.round(x * 100)))).sort((a, b) => a - b);
  if (bins.length < 24) return null;
  const arr = new Float32Array(bins[bins.length - 1] + 900);
  for (const b of bins) for (let d = -2; d <= 2; d++) { const k = b + d; if (k >= 0) arr[k] = Math.max(arr[k], 1 - Math.abs(d) * 0.3); }
  const score = (lagSek) => {
    let sum = 0;
    for (const b of bins) { const k = Math.round(b + lagSek * 100); if (k < arr.length) sum += arr[k]; }
    return sum / bins.length;
  };
  const kurve = [];
  for (let bpm = 60; bpm <= 190; bpm += 0.25) {
    const lag = 60 / bpm;
    let sc = 0;
    for (let k = 1; k <= 4; k++) sc += score(k * lag) / Math.sqrt(k);
    kurve.push([bpm, sc]);
  }
  let best = kurve[0];
  for (const p of kurve) if (p[1] > best[1]) best = p;
  const mittel = kurve.reduce((a, p) => a + p[1], 0) / kurve.length;
  const bpm = Math.round(best[0] * 2) / 2;
  const kand = [bpm];
  for (const f of [2, 0.5]) { const x = bpm * f; if (x >= 40 && x <= 240) kand.push(Math.round(x * 2) / 2); }
  return { bpm, kand, sicher: best[1] / mittel };
}

/* ---------- Beispiel mit Tempo-Drift (Suno-artige Aufnahme) ---------- */
function beispielDrift() {
  const rng = makeRng(11);
  const notes = [];
  let T = 0;
  const pcs = [0, 3, 7, 10, 7, 3, 12, 10];
  for (let j = 0; j < 16 * 8; j++) {
    const beat = j / 2, tempo = 100 + 8 * (beat / 64);
    const tick = Math.max(0, Math.round(T * 100 / 60 * TPB + rng.int(-7, 7)));
    notes.push({ s: tick, e: tick + 190, n: 56 + pcs[j % 8], v: 90, c: 0 });
    T += 0.5 * 60 / tempo;
  }
  return {
    tpb: TPB, format: 1, timeSig: false, meta: {},
    tempos: [{ t: 0, tp: 600000 }],
    tracks: [{ name: 'Beispiel mit Drift', channel: 0, notes, other: [], end: notes[notes.length - 1].e }],
  };
}

if (typeof module !== 'undefined') {
  module.exports = { parsePrompt, vervollstaendige, compose, parseMidi, writeMidi, makeZip, analysiere, bearbeite,
    beispielDrift, endTick, tickZuSek, schaetzeTempo, tempoMedian, NAMEN, SKALEN, STIL_BPM };
}
