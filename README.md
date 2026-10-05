# MIDI Werkstatt

Ein Browser-Werkzeug für Musikproduzenten, gebaut für den Weg von Suno nach FL Studio und FL Studio Mobile.
Es läuft komplett im Browser. Es gibt keine Installation, keinen Server und nichts wird hochgeladen.

*English: a small browser tool that (1) generates minor-key melodies and beats from a Suno-style text prompt and
(2) cleans up MIDI files: quantize, flatten tempo maps to a fixed tempo, correct tempo drift. Runs entirely client-side.*

## Ausprobieren

Öffne `index.html` im Browser (Doppelklick genügt). Online-Version: über GitHub Pages, siehe Link im Repository.

## Was es kann

**Komponieren.** Du fügst einen Suno-Prompt ein, deutsch oder englisch, zum Beispiel
`minimal abstract heavy hiphop drums, sub, 808 and a melody, polyrhythmic, diatonic, in G# minor`.
Das Werkzeug liest daraus Tonart, Skala, Tempo, Elemente (Drums, 808, Sub, Melodie, Akkorde) und Charakter
(minimal, abstrakt, heavy, polyrhythmisch). Alle Werte lassen sich von Hand ändern. Es gibt nur Moll-Tonarten
(natürlich, dorisch, phrygisch, harmonisch, Pentatonik). Das Ergebnis ist eine MIDI-Datei mit je einer Spur pro Element,
die Drums liegen auf Kanal 10. Ein Seed macht ein Ergebnis wiederholbar.

**Bearbeiten.** Du lädst eine MIDI-Datei, zum Beispiel einen Suno-Stem:
- quantisieren (1/4 bis 1/32, auch Triolen), mit einstellbarer Stärke, Swing und optional gerasterten Notenlängen
- die Tempo-Map glätten oder auf ein festes Tempo setzen, wahlweise Positionen in Takten behalten oder die reale Zeit
- Tempo-Drift verfolgen und herausrechnen, wenn die Noten gegen das Raster wandern
- vorher und nachher in einer Piano-Roll vergleichen und einen einfachen Testklang anhören

Der Knopf "Suno-MIDI auf festes Tempo" setzt dafür die passenden Einstellungen in einem Schritt.

## Was es nicht ist

- Der Generator ist regelbasiert mit Zufall. Er ist keine KI und erzeugt keine fertigen Songs, sondern Ausgangsmaterial.
- Der Prompt-Leser erkennt Schlüsselwörter. Was er nicht kennt, ignoriert er. Die erkannten Werte siehst du immer vor dem Komponieren.
- Das Vorhören ist ein einfacher Testklang, kein Sound aus einem Instrument.
- Die Tempo-Schätzung aus den Notenabständen ist grob. Bei stark schwankendem Tempo liegt sie manchmal daneben.
  Dateien mit Tempo-Map zeigen deshalb Mittel und Median der Map.
- Getestet wurde bisher mit synthetischen Daten und einer echten Suno-Drum-MIDI. Rückmeldungen mit anderen Dateien sind willkommen.

## Entwicklung

```
python3 build.py               # baut index.html (alles in einer Datei) aus src/
node tests/test_core.js        # automatische Tests für den Kern
node tests/tempo_schaetzung.js # Info-Skript zur Tempo-Schätzung
```

Der Kern (`src/core.js`) enthält MIDI lesen und schreiben, Generator, Quantisierung, Tempo und Drift, ohne Abhängigkeiten.
Die Oberfläche (`src/app.html`) ist reines HTML, CSS und JavaScript.

## Nutzung

Ausprobieren ist erwünscht. Der Code hat keine Open-Source-Lizenz, alle Rechte bleiben beim Autor. Wer ihn weitergeben oder wiederverwenden möchte, fragt bitte vorher nach.

Made by Domino
