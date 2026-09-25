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
- **Bericht (PDF)** pro Person oder für alle: Regeln, Rechenweg, Zeitstrahl, Stellenliste und Unterschriftenfeld «Geprüft durch». Hält fest, womit gerechnet wurde: verwendete Gehaltstabelle mit Gültigkeit, Version der zentralen Einstellungen und Zeitpunkt der Berechnung. Öffnet den Druckdialog, dort «Als PDF speichern» wählen.
- **Manuelle Anpassungen** (von Hand überschriebene Anrechnungen) sind in der Übersicht mit «manuell» (Stift-Symbol) markiert, im Bericht vermerkt und im CSV gezählt.
- **Zentrale Einstellungen:** Vorlagen, Berufe und Gehaltstabellen liegen auf dem Server, alle Nutzenden rechnen mit demselben Stand (siehe «Server einrichten»).
- **Offene Stellen** (Button oben): Stellen mit Funktion, Pensum/Lektionen, Antritt und Status erfassen. Beim Hochladen lässt sich eine offene Stelle wählen («Stelle / Vorlage»); die Bewerbenden übernehmen Funktion und Pensum der Stelle. Pro Stelle «Bewerbende vergleichen».
- **Status und Vergleich:** Jede Person hat einen Status (neu, geprüft, Angebot, eingestellt, abgesagt). Die Seite «Bewerbende» filtert nach Status und Stelle und vergleicht die Bewerbenden einer Stelle nebeneinander (anrechenbare Jahre, Einreihung, Lohn, Korrekturen).
- **Prüfung und Freigabe:** «Als geprüft markieren» hält Name und Zeitpunkt fest (Name unter Einstellungen → Zugang). Mit dem Vier-Augen-Prinzip muss eine zweite Person freigeben. Ändert sich die Auswertung danach, muss neu geprüft werden. Bericht und Lohnblatt zeigen Prüfung und Freigabe.
- **Korrekturen vorschlagen:** Korrekturen der Lohnklasse können eine Regel haben (fehlende Ausbildung für die Funktion, Ausbildung im Ausland, Führungsausbildung mit Mindestjahren Führung, beschränkt auf Funktionen z. B. «2.»). Trifft sie zu, schlägt die App die Korrektur mit Begründung vor – «Übernehmen» oder «Ignorieren». Mit KI-Auswertung liefert Claude die Angaben dazu.
- **Zulagen, Lohnentwicklung, Lohnblatt:** Zulagen pro Funktion (z. B. CHF 4'042/Jahr) werden anteilig zum Pensum zum Lohn gerechnet und bei passender Ausbildung vorgeschlagen. Die Lohnentwicklung zeigt Stufe, Klasse und Lohn der nächsten 10 Jahre. «Lohnblatt (PDF)» fasst Einreihung, Begründung, Lohn, Entwicklung und Prüfung für die Personalakte zusammen.
- **Doppelbewerbungen** (gleicher Name, gleiches oder fehlendes Geburtsdatum) werden markiert.
- **Bewerbende:** Mit Datenbank (MySQL/MariaDB) bleiben ausgewertete Personen samt Lebenslauf-Datei erhalten. Die Seite «Bewerbende» (Button oben) listet alle mit Suche, zeigt Auswertung und Lebenslauf und bei jeder Person, wie viele Tage sie noch aufbewahrt wird. Die Startseite zeigt nur die letzten 2 (siehe «Datenbank»).
- **Aus Dokumenten erstellen:** Besoldungsreglement und Gehaltstabelle einlesen – jede Funktion des Einreihungsplans wird eine Vorlage (mit Lohnklassen, Aufstieg, Stichtag) und ein Beruf. Mit Claude kommen passende Stichwörter, verwandte Funktionen und Anrechnungsregeln dazu; ohne KI sind die Stichwörter nur grob und sollten ergänzt werden.
- **Funktion automatisch vorschlagen:** Aus Ausbildung und Tätigkeiten im Lebenslauf schlägt die App die passende Vorlage (Funktion des Einreihungsplans) vor – mit Claude oder über Stichwörter pro Vorlage – samt Begründung und Alternativen.
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

### Datenbank (ausgewertete Personen speichern)

Mit `api/candidates.php` werden die ausgewerteten Personen in einer MySQL-/MariaDB-Datenbank gespeichert. In `config.php` den Block `db` mit Server, Datenbankname, Benutzer und Passwort ausfüllen (siehe `config.sample.php`); die Tabelle `lr_candidates` wird beim ersten Aufruf automatisch angelegt.

- Gespeichert werden die Lebenslauf-Datei (PDF/Word, bis 12 MB, `max_file_mb`), Name, Geburtsdatum, erkannter Text, Stellen, gewählte Vorlage und Anpassungen (Tabellen `lr_candidates` und `lr_candidates_files`). «Neu auswerten» gibt die gespeicherte PDF-Datei wieder an Claude.
- Änderungen werden automatisch gespeichert. Alle mit Zugangspasswort sehen dieselben Personen; das Kreuz-Symbol löscht eine Person samt Datei endgültig.
- **Aufbewahrung:** Personen werden so viele Tage nach der letzten Änderung samt Lebenslauf gelöscht, wie unter «Einstellungen → Zugang → Aufbewahrung» eingestellt – auf Wunsch mit eigener Frist pro Status (z. B. Absagen nach 90 Tagen) (gilt für alle, wenn die Einstellungen zentral gespeichert sind; 0 = nie). Ohne Angabe gilt `keep_days` aus `config.php` (Standard 180). Die Seite «Bewerbende» zeigt pro Person, wie viele Tage sie noch aufbewahrt wird. Die Frist an die internen Vorgaben zur Aufbewahrung von Bewerbungsunterlagen anpassen.
- Die Datenbank muss Dateien in dieser Grösse annehmen (`max_allowed_packet`, bei den meisten Hostern 16 MB oder mehr).
- Zugangsdaten der Datenbank gehören nur in `config.php` auf dem Server, nie ins Repository.

### Zentrale Einstellungen

Mit `api/settings.php` speichert die App Vorlagen, Berufe und Gehaltstabellen auf dem Server. Dafür reicht eine `config.php` mit Zugangspasswort (ein API-Schlüssel ist dafür nicht nötig).

- In der App unter «Einstellungen → Server und Zugang» das Zugangspasswort eingeben und speichern. Beim ersten Speichern werden die Einstellungen dieses Browsers für alle übernommen. Browser, die schon zentrale Einstellungen vorfinden, fragen, ob sie diese übernehmen sollen.
- Beim Start und beim Öffnen der Einstellungen lädt die App automatisch die neueste Version. Hat jemand anderes inzwischen gespeichert, fragt die App vor dem Überschreiben nach.
- Optional `admin_password` in `config.php`: Dann können alle mit Zugangspasswort rechnen, speichern kann aber nur, wer auch das Admin-Passwort kennt.
- Die Daten liegen in `api/data/` (per `.htaccess` gesperrt, nicht im Git). Die letzten 30 Versionen bleiben in `api/data/history/` erhalten (`keep_versions` in `config.php`). Der Ordner muss für PHP beschreibbar sein; die App legt ihn selbst an.
- API-Schlüssel und Passwörter werden nie zentral gespeichert.

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
- **Lohnstufe:** volle anrechenbare Jahre + 1, höchstens die letzte Stufe der Gehaltstabelle (ohne Tabelle Stufe 10).
- **Lohnklasse:** tiefste Klasse der Funktion, +1 nach jeder Jahresgrenze (z. B. 12 und 24 Jahre), höchstens bis zur obersten Klasse der Funktion.
- **Korrektur:** pro Person wählbar, z. B. −1 Klasse bei fehlender Ausbildung oder +1 mit Obergrenze.
- **Lohn:** Mit hinterlegter Gehaltstabelle zeigt die App Jahreslohn (100 % und «Pensum neue Stelle») und Monatslohn. Pro Vorlage einstellbar: 13 oder 12 Auszahlungen (der andere Betrag steht zum Vergleich daneben).
- **Funktion (Vorlage):** Oben «Funktion automatisch vorschlagen» wählen: Die App wählt pro Person die passende Vorlage. Mit KI-Auswertung entscheidet Claude anhand von Ausbildung und Erfahrung, sonst zählen die «Stichwörter für den automatischen Vorschlag» der Vorlagen (aktuelle Tätigkeit und jüngste Ausbildung am stärksten). Vorschlag, Begründung und Alternativen stehen bei der Person und im Bericht; die Vorlage lässt sich jederzeit ändern.
- **Gemäss Grundfunktion:** Vorlagen wie «Teamleitung: gemäss Grundfunktion plus 1, max. 18» übernehmen die Lohnklassen einer anderen Vorlage; die Grundfunktion lässt sich pro Person wählen.
- **Fixer Lohn:** Funktionen mit festem Jahreslohn (z. B. Praktika) statt Lohnklasse.
- **Lektionen:** Ist in der Vorlage «Lektionen bei 100 %» gesetzt (z. B. 28), wird für die neue Stelle die Anzahl Lektionen eingegeben; das Pensum ergibt sich daraus. Enthält die Gehaltstabelle «pro Lektion» (sonst «pro Stunde»), steht der Ansatz im Lohnvorschlag.

**Gehaltstabellen** werden unter Einstellungen → Gehaltstabellen als PDF-, Excel- oder CSV-Datei hochgeladen: eine Zeile pro Lohnklasse, in der ersten Spalte die Lohnklasse (z. B. «12» oder «LK 12»), danach die Jahreslöhne für Stufe 1, 2, 3 … bei 100 %.
- Überschriften werden übersprungen. Hat eine Klasse mehrere Zeilen (Jahreslohn, 13/12 Auszahlungen, pro Stunde, pro Lektion), zählt «Jahreslohn»; «pro Lektion» und «pro Stunde» werden zusätzlich gespeichert.
- Tabellen mit Stufen als Zeilen werden gedreht, Monatslöhne auf Wunsch × 13 umgerechnet, «Stand: TT.MM.JJJJ» wird als «gültig ab» übernommen. PDFs, die sich nicht direkt lesen lassen (z. B. eingescannte), liest Claude, falls die KI-Auswertung eingerichtet ist.
- **Mehrere Tabellen:** z. B. 2026 und 2027. Jede Vorlage nimmt automatisch die Tabelle, die an ihrem Stichtag gilt (jüngstes «gültig ab» bis zum Stichtag), oder eine fest gewählte. Eine neue Tabelle mit gleichem Datum ersetzt auf Wunsch die alte.
- **Prüfung:** Nach dem Hochladen prüft die App, ob die Löhne pro Klasse mit jeder Stufe steigen, ob Klassen fehlen, ob alle Klassen gleich viele Stufen haben und ob höhere Klassen höher beginnen. Auffälligkeiten stehen bei der Tabelle.
- **Korrigieren:** Alle Werte (Jahreslohn, pro Lektion, pro Stunde) lassen sich direkt in der Tabelle ändern; die Prüfung läuft sofort neu.

Interne Reglemente, Einstellungsdateien und Lohntabellen gehören **nicht** in dieses Repository, denn es ist öffentlich. Sie liegen zentral auf dem Server (siehe oben) oder werden als Einstellungsdatei (JSON) intern weitergegeben. Die `.gitignore` schliesst `*einstellungen*.json` und `api/data/` aus.

Beispiel mit den Standardregeln: 10 Jahre Berufserfahrung, davon 5 als Lehrperson, Vorlage «Lehrperson» → 5 × 100 % + 5 × 50 % = **7,5 Jahre**.

Einstellungen aus früheren Versionen werden beim Öffnen automatisch übernommen. Export/Import als JSON ist möglich (ohne API-Schlüssel und Passwort).

## Datenschutz

Die Dateien werden im Browser ausgelesen. Ohne KI-Auswertung und ohne Datenbank werden sie nirgends hochgeladen oder gespeichert; nach dem Neuladen der Seite sind die Lebensläufe weg, nur die Einstellungen bleiben erhalten. Mit Datenbank werden Lebenslauf-Datei, erkannter Text und Auswertung auf eurem Server gespeichert und nach der eingestellten Aufbewahrungsfrist gelöscht.

## Grenzen

- Eingescannte PDFs (Bilder ohne Text) können nur mit der KI-Auswertung gelesen werden.
- Die Erkennung ohne KI arbeitet mit Regeln: Die erkannten Stellen sollten kurz geprüft werden. Alle Felder (Funktion, Beruf, Daten, Pensum, Faktor) sind direkt in der Tabelle korrigierbar.
- Wenn nur Jahreszahlen angegeben sind (z. B. «2015 – 2020»), wird mit ganzen Jahren gerechnet und der Eintrag als «ungenau» markiert.

## Tests

```sh
node tests/parser.test.js
```
