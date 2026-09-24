# Lebenslauf-Rechner

Web-App, die Lebensläufe (PDF, Word `.docx`, Text) einliest, die Berufserfahrung erkennt und die anrechenbaren Jahre je nach Zielberuf berechnet.

Aufruf: `/lebenslauf-rechner/` (nicht in der Navigation der Website verlinkt, `noindex`).

## KI-Auswertung mit Claude (optional)

Unter «Einstellungen → KI-Auswertung mit Claude» einschalten und einen Anthropic API-Schlüssel eintragen (erhältlich unter https://platform.claude.com/settings/keys). Dann liest Claude jeden Lebenslauf und erkennt Stellen, Zeiträume, Pensum, Beruf und Ausbildungen. Das klappt auch bei ungewöhnlichen Layouts und eingescannten PDFs.

- PDFs werden direkt an Claude gesendet, Word- und Textdateien als Text.
- Modell: Claude Opus 5 (Standard) oder Claude Sonnet 5 (günstiger).
- Claude liefert nur die Einträge. Die Gewichtung rechnet die App wie bisher nach den eingestellten Faktoren, und alle Einträge bleiben editierbar.
- Schlägt die KI-Auswertung fehl (z. B. ungültiger Schlüssel, keine Verbindung), rechnet die App automatisch mit den Regeln weiter und zeigt den Grund an.
- Der API-Schlüssel wird nur im Browser der jeweiligen Person gespeichert (`localStorage`) und nie mit den Einstellungen exportiert. Die Seite ruft die Claude API direkt aus dem Browser auf. Deshalb darf der Schlüssel nicht fest im Code stehen, denn auf einer öffentlichen Website könnte ihn sonst jede Person auslesen.
- **Datenschutz:** Bei aktiver KI-Auswertung werden die Lebensläufe an Anthropic übermittelt. Vorgaben zum Umgang mit Bewerbungsunterlagen (nDSG) beachten.

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

Ohne KI-Auswertung werden die Dateien ausschliesslich lokal im Browser verarbeitet und nicht hochgeladen oder gespeichert. Nach dem Neuladen der Seite sind die Lebensläufe weg, nur die Einstellungen bleiben erhalten.

## Grenzen

- Eingescannte PDFs (Bilder ohne Text) können nur mit der KI-Auswertung gelesen werden.
- Die Erkennung ohne KI arbeitet mit Regeln: Die erkannten Stellen sollten kurz geprüft werden. Alle Felder (Funktion, Beruf, Daten, Pensum, Faktor) sind direkt in der Tabelle korrigierbar.
- Wenn nur Jahreszahlen angegeben sind (z. B. «2015 – 2020»), wird mit ganzen Jahren gerechnet und der Eintrag als «ungenau» markiert.

## Tests

```sh
node lebenslauf-rechner/tests/parser.test.js
```
