#!/usr/bin/env python3
"""Baut aus src/ die auslieferbaren Dateien.

  python3 build.py

  index.html          Eine einzelne Datei mit allem Inline. Das ist die Seite, die GitHub Pages ausliefert.
  dist/artifact.html  Variante ohne <html>-Rahmen fuer die Claude-Artifact-Ansicht (nicht eingecheckt).
"""
import pathlib

root = pathlib.Path(__file__).parent
app = (root / 'src' / 'app.html').read_text(encoding='utf-8')
core = (root / 'src' / 'core.js').read_text(encoding='utf-8').replace("'use strict';\n", '', 1)
page = app.replace('/*@CORE@*/', core)

(root / 'dist').mkdir(exist_ok=True)
(root / 'dist' / 'artifact.html').write_text(page, encoding='utf-8')

split = page.index('<div class="wrap">')
head, body = page[:split], page[split:]
web = (
    '<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="author" content="Domino">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    '<meta name="description" content="MIDI Werkstatt: Moll-Melodien und Beats aus Suno-Prompts erzeugen, '
    'MIDI-Dateien quantisieren, Tempo glätten und Drift korrigieren. Läuft komplett im Browser.">\n'
    '<style>html{color-scheme:light}body{margin:0}</style>\n'
    + head + '</head>\n<body>\n' + body + '</body>\n</html>\n'
)
(root / 'index.html').write_text(web, encoding='utf-8')
print('index.html', len(web) // 1024, 'KB | dist/artifact.html', len(page) // 1024, 'KB')
