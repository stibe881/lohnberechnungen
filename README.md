# Lebenslauf-Rechner

Web-App, die Lebensläufe (PDF, Word `.docx`, Text) einliest, die Berufserfahrung erkennt und die anrechenbaren Jahre je nach Zielberuf berechnet.

Aufruf: `/lebenslauf-rechner/` (nicht in der Navigation der Website verlinkt, `noindex`).

## Funktionen

- **Mehrere Lebensläufe gleichzeitig** hochladen: Mit Claude werden je 3 parallel ausgewertet.
- **Vorlagen (Stellen):** Pro Stelle eigene Anrechnungsregeln, z. B. nach Lohnreglement (siehe «Berechnung»).
- **Zeitstrahl** pro Person: Stellen nach Faktor eingefärbt, Lücken ab 3 Monaten schraffiert, Mindestalter als Linie.
- **Bericht (PDF)** pro Person oder für alle: Regeln, Rechenweg, Zeitstrahl, Stellenliste und Unterschriftenfeld «Geprüft durch». Öffnet den Druckdialog, dort «Als PDF speichern» wählen.
- **CSV-Export** der Übersicht und aller Stellen.

## KI-Auswertung mit Claude (optional)

Unter «Einstellungen → KI-Auswertung mit Claude» einschalten. Claude liest jeden Lebenslauf und erkennt Stellen, Zeiträume, Pensum, Beruf, Familienarbeit, Militär-/Zivildienst, Ausbildungen und das Geburtsdatum. Die Gewichtung rechnet die App nach der Vorlage, alle Einträge bleiben editierbar. Schlägt die KI-Auswertung fehl, rechnet die App mit den Regeln weiter und zeigt den Grund an.

Zwei Betriebsarten:

1. **Über euren Server (empfohlen):** Der API-Schlüssel liegt zentral auf dem Webserver, die Nutzenden geben nur ein Zugangspasswort ein. Einrichtung siehe unten.
2. **Eigener API-Schlüssel:** Jede Person trägt einen Anthropic API-Schlüssel ein. Er wird nur in ihrem Browser gespeichert und nie exportiert.

Weitere Einstellungen:
- **Modell:** Claude Opus 5 (Standard) oder Claude Sonnet 5 (günstiger).
- **Nur Text an Claude senden** (Standard: an): Aus PDFs wird nur der Text gesendet, keine Fotos oder Bilder. Eingescannte PDFs brauchen diese Option ausgeschaltet.
- **Datenschutz-Hinweis:** Vor dem ersten Senden fragt die App nach, ob die Bewerbenden informiert sind (Art. 19 DSG). «Nur mit Regeln auswerten» sendet nichts.

### Server einrichten (API-Schlüssel zentral)

Voraussetzung: Webhosting mit PHP 7.4+ und der cURL-Erweiterung (bei Schweizer Hostern wie Hostpoint, Infomaniak oder Cyon Standard).

1. `api/config.sample.php` nach `api/config.php` kopieren (direkt auf dem Server, nicht ins Git).
2. In `config.php` den API-Schlüssel der Organisation und ein langes Zugangspasswort eintragen.
3. In der App unter «Einstellungen» die Option «Über euren Server» wählen und das Passwort eingeben. Der Status zeigt «Server ist eingerichtet».

Schutzmassnahmen in `api/claude.php`: Zugangspasswort (mit Verzögerung bei falscher Eingabe), nur `POST /v1/messages`, nur freigegebene Modelle, Grössenlimit. `config.php` ist per `.htaccess` gesperrt und steht in `.gitignore`.

## Berechnung

Die Regeln stehen in **Vorlagen** (Einstellungen → Vorlagen). Pro Vorlage einstellbar:

| Regel | Standard |
| --- | --- |
| Zielberuf (gleicher Beruf) | 100 % |
| Verwandte Berufe (frei wählbar) | 75 % |
| Andere Berufe | 50 % |
| Ausbildung (Schule, Lehre, Studium) | 0 % |
| Familienarbeit | 50 %, optional mit Höchstdauer |
| Militär-/Zivildienst | 50 % |
| Anrechnung ab Alter | keine (braucht Geburtsdatum) |
| Höchstens anrechenbare Jahre | kein Maximum |
| Rundung | nicht runden (wählbar: auf halbe oder ganze Jahre abrunden, auf ganze Jahre runden) |
| Teilzeit anteilig | aus |

Ablauf: Überschneidende Zeiträume werden nie doppelt gezählt, pro Monat zählt die Tätigkeit mit dem höchsten Faktor. Danach folgen Mindestalter, Obergrenze Familienarbeit, Maximum und zuletzt die Rundung. Der Rechenweg wird in der App und im Bericht angezeigt.

Beispiel: 10 Jahre Berufserfahrung, davon 5 als Lehrperson, Vorlage «Lehrperson» → 5 × 100 % + 5 × 50 % = **7,5 Jahre**.

Einstellungen aus der ersten Version (globale Faktoren) werden beim ersten Öffnen automatisch in Vorlagen übernommen. Export/Import als JSON ist möglich (ohne API-Schlüssel und Passwort).

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
