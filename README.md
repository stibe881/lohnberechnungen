# Lohnberechnungen – Lebenslauf-Rechner

Web-App, die Lebensläufe (PDF, Word `.docx`, Text) einliest, die Berufserfahrung erkennt, die anrechenbaren Jahre nach den Regeln einer Stelle berechnet und eine Lohneinreihung vorschlägt.

## Installation

Die App ist eine statische Web-App ohne Build-Schritt:

- **Lokal ausprobieren:** `python3 -m http.server` im Repository-Ordner starten und `http://localhost:8000` öffnen. Für die Server-Variante der KI-Auswertung stattdessen `php -S localhost:8000` verwenden.
- **Auf einen Webserver stellen:** Alle Dateien in ein Verzeichnis kopieren (z. B. per FTP). Für die zentrale KI-Auswertung braucht es PHP, siehe unten.
- Die Seite ist mit `noindex` markiert und erscheint nicht in Suchmaschinen. Für den produktiven Einsatz empfiehlt sich zusätzlich ein Verzeichnisschutz (z. B. `.htaccess` mit Passwort).

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

Die Regeln stehen in **Vorlagen** (Einstellungen → Vorlagen), eine pro Stelle. In der Auswertung öffnet «Gewichtungen anpassen» direkt die verwendete Vorlage. Für jede Tätigkeitsart legt die Vorlage eine Anrechnung fest:

| Tätigkeitsart | Standard |
| --- | --- |
| Gleicher Beruf (Zielberuf) | 100 % |
| Verwandte Berufe (frei wählbar) | 75 % |
| Andere Berufe | 50 % |
| Praktikum | 50 % |
| Assistenz-Einsatz | 50 % |
| Familienarbeit | 50 %, optional mit Höchstdauer |
| Militär-/Zivildienst | 50 % |
| Erstausbildung / Schule | 0 % |
| Zweitausbildung | 0 % |

Jede Anrechnung hat eine von drei **Anrechnungsarten**:
- **Faktor (Pensum egal):** z. B. 50 % der Zeit.
- **Faktor × Pensum:** z. B. «25 % vom geleisteten Pensum» → 80 % Pensum ergibt 20 %.
- **Nach Pensum:** ein Wert bis 50 % Pensum, ein anderer über 50 % (z. B. 50 % / 100 %).

Weitere Regeln pro Vorlage:
- **Gleichzeitige Tätigkeiten:** Entweder zählt die höchste Anrechnung, oder alle werden addiert, höchstens 100 % pro Monat.
- **Stichtag:** heute oder 31.12. des laufenden Jahres.
- **Anrechnung ab Alter** (braucht Geburtsdatum), **höchstens anrechenbare Jahre**, **Rundung**.
- **Lohneinreihung (optional):** Lohnklasse von–bis und Klassenaufstieg nach Jahren (Standard 12 und 24).

Ablauf: Monat für Monat wird die Anrechnung bestimmt, danach folgen Mindestalter, Obergrenze Familienarbeit, Maximum und zuletzt die Rundung. Rechenweg und Regeln stehen in der App und im Bericht.

### Lohneinreihung

Hat eine Vorlage Lohnklassen, schlägt die App eine Einreihung vor:
- **Lohnstufe:** volle anrechenbare Jahre + 1, höchstens Stufe 10.
- **Lohnklasse:** tiefste Klasse der Funktion, +1 nach jeder Jahresgrenze (z. B. 12 und 24 Jahre), höchstens bis zur obersten Klasse der Funktion.
- **Korrektur:** pro Person wählbar, z. B. −1 Klasse bei fehlender Ausbildung oder +1 mit Obergrenze.
- **Lohn:** Mit hinterlegter Gehaltstabelle zeigt die App Jahreslohn (100 % und «Pensum neue Stelle») und Monatslohn (13×).

Die **Gehaltstabelle** wird unter Einstellungen → Gehaltstabelle als PDF-, Excel- oder CSV-Datei hochgeladen: eine Zeile pro Lohnklasse, in der ersten Spalte die Lohnklasse (z. B. «12» oder «LK 12»), danach die Jahreslöhne für Stufe 1, 2, 3 … bei 100 %. Überschriften werden übersprungen. Hat eine Klasse mehrere Zeilen (Jahreslohn, 13/12 Auszahlungen, pro Stunde …), zählt die Zeile «Jahreslohn». Tabellen mit Stufen als Zeilen werden gedreht, Monatslöhne auf Wunsch × 13 umgerechnet, «Stand: TT.MM.JJJJ» wird als Gültigkeitsdatum übernommen. PDFs, die sich nicht direkt lesen lassen (z. B. eingescannte), liest Claude, falls die KI-Auswertung eingerichtet ist. Nach dem Hochladen zeigt eine Vorschau die erkannte Tabelle zum Prüfen. Vorlagen und Korrekturen werden als Einstellungsdatei (JSON) importiert; sie kann auch die Gehaltstabelle enthalten. Interne Reglemente, Einstellungsdateien und Lohntabellen gehören **nicht** in dieses Repository, denn es ist öffentlich. Die Datei wird intern weitergegeben und in jedem Browser einmal importiert. Die `.gitignore` schliesst `*einstellungen*.json` vorsorglich aus.

Beispiel mit den Standardregeln: 10 Jahre Berufserfahrung, davon 5 als Lehrperson, Vorlage «Lehrperson» → 5 × 100 % + 5 × 50 % = **7,5 Jahre**.

Einstellungen aus früheren Versionen werden beim Öffnen automatisch übernommen. Export/Import als JSON ist möglich (ohne API-Schlüssel und Passwort).

## Datenschutz

Ohne KI-Auswertung werden die Dateien ausschliesslich lokal im Browser verarbeitet und nicht hochgeladen oder gespeichert. Nach dem Neuladen der Seite sind die Lebensläufe weg, nur die Einstellungen bleiben erhalten.

## Grenzen

- Eingescannte PDFs (Bilder ohne Text) können nur mit der KI-Auswertung gelesen werden.
- Die Erkennung ohne KI arbeitet mit Regeln: Die erkannten Stellen sollten kurz geprüft werden. Alle Felder (Funktion, Beruf, Daten, Pensum, Faktor) sind direkt in der Tabelle korrigierbar.
- Wenn nur Jahreszahlen angegeben sind (z. B. «2015 – 2020»), wird mit ganzen Jahren gerechnet und der Eintrag als «ungenau» markiert.

## Tests

```sh
node tests/parser.test.js
```
