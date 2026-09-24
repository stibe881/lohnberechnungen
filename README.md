# Lebenslauf-Rechner

Web-App, die Lebensläufe (PDF, Word `.docx`, Text) einliest, die Berufserfahrung erkennt und die anrechenbaren Jahre je nach Zielberuf berechnet.

Aufruf: `/lebenslauf-rechner/` (nicht in der Navigation der Website verlinkt, `noindex`).

## Berechnung

- Erfahrung im **gleichen Beruf** wie die Stelle zählt voll (Standard 100 %).
- Erfahrung in einem **verwandten Beruf** zählt mit dem Faktor «Verwandter Beruf» (Standard 75 %, nur wenn in den Einstellungen als verwandt markiert).
- **Andere Berufe** zählen zur Hälfte (Standard 50 %).
- **Ausbildung** (Studium, Lehre, Schule) zählt nicht (Standard 0 %).
- Überschneidende Zeiträume werden nie doppelt gezählt: Pro Monat zählt die Tätigkeit mit dem höchsten Faktor.
- Optional: Teilzeit anteilig anrechnen (Pensum) und ein Maximum an anrechenbaren Jahren.

Beispiel: 10 Jahre Berufserfahrung, davon 5 als Lehrperson, Bewerbung als Lehrperson → 5 × 100 % + 5 × 50 % = **7,5 Jahre**.

Alle Faktoren, Berufe und Stichwörter sind unter «Einstellungen» anpassbar und werden im Browser gespeichert (Export/Import als JSON möglich).

## Datenschutz

Die Dateien werden ausschliesslich lokal im Browser verarbeitet und nicht hochgeladen oder gespeichert. Nach dem Neuladen der Seite sind die Lebensläufe weg, nur die Einstellungen bleiben erhalten.

## Grenzen

- Eingescannte PDFs (Bilder ohne Text) können nicht gelesen werden.
- Die Erkennung ist heuristisch: Die erkannten Stellen sollten kurz geprüft werden. Alle Felder (Funktion, Beruf, Daten, Pensum, Faktor) sind direkt in der Tabelle korrigierbar.
- Wenn nur Jahreszahlen angegeben sind (z. B. «2015 – 2020»), wird mit ganzen Jahren gerechnet und der Eintrag als «ungenau» markiert.

## Tests

```sh
node lebenslauf-rechner/tests/parser.test.js
```
