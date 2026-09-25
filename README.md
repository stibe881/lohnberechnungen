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
- **Zeitstrahl** pro Person: Stellen nach Beruf eingefärbt (teilweise angerechnete heller, nicht angerechnete grau schraffiert), Lücken ab 3 Monaten schraffiert, Mindestalter als Linie, Legende darunter.
- **Personenkarte:** Oben auf einen Blick Funktion, anrechenbare Jahre, Lohnklasse/Stufe mit Balken «Stufe x von y» und Lohnspanne der Klasse sowie Jahres- und Monatslohn. Wird die Funktion von Hand geändert, bleibt der ursprüngliche Vorschlag durchgestrichen sichtbar (auch bei Einreihung, Lohn und manuell überschriebenen Anrechnungen). «Warum diese Einreihung?» erklärt Stichwörter, gewertete Ausbildung, Stufe, Aufstieg, Korrektur, Zulagen und Gehaltstabelle. Die Abschnitte darunter lassen sich ein- und ausklappen.
- **Bericht (PDF)** pro Person oder für alle: Regeln, Rechenweg, Zeitstrahl, Stellenliste und Unterschriftenfeld «Geprüft durch». Hält fest, womit gerechnet wurde: verwendete Gehaltstabelle mit Gültigkeit, Version der zentralen Einstellungen und Zeitpunkt der Berechnung. Vor dem Drucken erscheint eine Vorschau; Logo, Organisation und Fusszeile stehen unter Einstellungen → Import & Export → Druck. Beträge im Schweizer Format (CHF 87’450.–).
- **Meldungen und Rückgängig:** Hinweise erscheinen kurz unten rechts. Löschen (Personen, Stellen, Funktionen, Gehaltstabellen, Berufe, Korrekturen), Statuswechsel und «Neu auswerten» lassen sich 8 Sekunden lang rückgängig machen; gespeicherte Personen werden erst danach aus der Datenbank gelöscht. Bei mehreren Lebensläufen zeigt ein Balken «2 von 5 ausgewertet» und pro Person den Schritt.
- **Manuelle Anpassungen** (von Hand überschriebene Anrechnungen) sind in der Übersicht mit «manuell» (Stift-Symbol) markiert, im Bericht vermerkt und im CSV gezählt.
- **Zentrale Einstellungen:** Vorlagen, Berufe und Gehaltstabellen liegen auf dem Server, alle Nutzenden rechnen mit demselben Stand (siehe «Server einrichten»).
- **Offene Stellen** (Button oben): Stellen mit Funktion, Pensum/Lektionen, Antritt und Status erfassen. Beim Hochladen lässt sich eine offene Stelle wählen («Stelle / Vorlage»); die Bewerbenden übernehmen Funktion und Pensum der Stelle. Pro Stelle «Bewerbende vergleichen».
- **Status und Vergleich:** Jede Person hat einen Status (neu, geprüft, Angebot, eingestellt, abgesagt). Die Seite «Bewerbende» filtert nach Status und Stelle und vergleicht die Bewerbenden einer Stelle nebeneinander (anrechenbare Jahre, Einreihung, Lohn, Korrekturen).
- **Prüfung und Freigabe:** «Als geprüft markieren» hält Name und Zeitpunkt fest (Name unter Einstellungen → Zugang). Mit dem Vier-Augen-Prinzip muss eine zweite Person freigeben. Ändert sich die Auswertung danach, muss neu geprüft werden. Bericht und Lohnblatt zeigen Prüfung und Freigabe.
- **Korrekturen vorschlagen:** Korrekturen der Lohnklasse können eine Regel haben (fehlende Ausbildung für die Funktion, Ausbildung im Ausland, Führungsausbildung mit Mindestjahren Führung, beschränkt auf Funktionen z. B. «2.»). Trifft sie zu, schlägt die App die Korrektur mit Begründung vor – «Übernehmen» oder «Ignorieren». Mit KI-Auswertung liefert Claude die Angaben dazu.
- **Zulagen, Lohnentwicklung, Lohnblatt:** Zulagen pro Funktion (z. B. CHF 4'042/Jahr) werden anteilig zum Pensum zum Lohn gerechnet und bei passender Ausbildung vorgeschlagen. Die Lohnentwicklung zeigt Stufe, Klasse und Lohn der nächsten 10 Jahre. «Lohnblatt (PDF)» fasst Einreihung, Begründung, Lohn, Entwicklung und Prüfung für die Personalakte zusammen.
- **Doppelbewerbungen** (gleicher Name, gleiches oder fehlendes Geburtsdatum) werden markiert.
- **Bewerbende:** Mit Datenbank (MySQL/MariaDB) bleiben ausgewertete Personen samt Lebenslauf-Datei erhalten. Die Seite «Bewerbende» (Button oben) listet alle mit Suche, sortierbaren Spalten (Klick auf die Überschrift, bleibt gespeichert) und Schnellaktionen in der Zeile (Status ändern, Lohnblatt, Vergleichen, Löschen), zeigt die Auswertung und den Lebenslauf (eingeklappt, wird beim Aufklappen geladen) und bei jeder Person, wie viele Tage sie noch aufbewahrt wird. Die Startseite zeigt nur die letzten 2 (siehe «Datenbank»).
- **Einstellungen:** Suchfeld oben durchsucht Funktionen, Zulagen, Korrekturen, Gehaltstabellen, Berufe, Stellen und alle Felder. Im Funktions-Editor rechnet ein Testrechner («Erfahrung 8 Jahre, Pensum 80 %») sofort Lohnklasse, Stufe und Lohn aus. Beim Schliessen mit ungespeicherten Änderungen fragt die App nach. Der Bereich «Verlauf» zeigt alle zentral gespeicherten Versionen mit Datum und Name und stellt eine frühere wieder her.
- **Aus Dokumenten erstellen:** Besoldungsreglement und Gehaltstabelle einlesen – jede Funktion des Einreihungsplans wird eine Vorlage (mit Lohnklassen, Aufstieg, Stichtag) und ein Beruf. Mit Claude kommen passende Stichwörter, verwandte Funktionen und Anrechnungsregeln dazu; ohne KI sind die Stichwörter nur grob und sollten ergänzt werden.
- **Funktion automatisch vorschlagen:** Aus Ausbildung und Tätigkeiten im Lebenslauf schlägt die App die passende Vorlage (Funktion des Einreihungsplans) vor – mit Claude oder über Stichwörter pro Vorlage – samt Begründung und Alternativen.
- **CSV-Export** der Übersicht und aller Stellen.
- **Excel im Aufbau der Berechnungsvorlage der Personalabteilung:** Pro Person «Excel (Vorlage Personal)» – Zuordnung 1) bis 6), Von/Bis, Pensum, Dauer in Tagen, Anrechnung in %, Σ DJ (Tage × Anrechnung / 365.2425), «x» für nicht mitgerechnete Zeilen und ein Blatt «Einstellungen» mit den Anrechnungssätzen (siehe «Berechnung»).

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
- Die Daten liegen in `api/data/` (per `.htaccess` gesperrt, nicht im Git). Die letzten 30 Versionen bleiben in `api/data/history/` erhalten (`keep_versions` in `config.php`) und sind in der App unter Einstellungen → Verlauf sichtbar (mit dem Namen aus «Zugang → Dein Name») und wiederherstellbar. Der Ordner muss für PHP beschreibbar sein; die App legt ihn selbst an.

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

### Abgleich mit der Berechnungsvorlage der Personalabteilung

Die Excel-Vorlage «Vorlage Berechnung» (Stand 2024.06) rechnet pro Tätigkeit Tage × Anrechnung / 365.2425 und unterscheidet nach Pensum bis 50 % und über 50 %. Die App bildet dieselben Regeln ab; das Beispiel der Vorlage ergibt in beiden 17.42 Dienstjahre (Test in `tests/parser.test.js`).

| Zuordnung in der Vorlage | Regel in der App | Anrechnung |
|---|---|---|
| 1) Ausbildungszeit (Studium, Lehre) | Erstausbildung, Zweitausbildung | 0 % |
| 2a) Praktikumseinsätze | Praktikum | bis 50 %: 25 %, über 50 %: 50 % |
| 2b) Frühere Tätigkeit als Klassenassistenz | Assistenz-Einsatz | Pensum × 100 % |
| 3) Berufliche Tätigkeit ohne Verbindung | Andere Berufe | Pensum × 25 % |
| 4) Assistenz → Tätigkeit ohne Verbindung | Andere Berufe bei Funktionen mit Zielberuf Assistenz | bis 50 %: 50 %, über 50 %: 100 % |
| 5) In Verbindung bzw. identisch mit der Funktion | Zielberuf und verwandte Berufe | bis 50 %: 50 %, über 50 %: 100 % |
| 6) Familienzeit | Familienarbeit | 33.33 % |
| «Nicht mit berechnen» (x) | Häkchen «Anrechnen» entfernen | – |
| Gleichzeitige Tätigkeiten | «addieren ohne Begrenzung (Vorlage Personal)» je Funktion | Familienzeit 33 % + Teilzeitjob werden addiert, auch über 100 % |

Weitere Regeln aus der Praxis der Personalabteilung, die die App übernimmt:

- **Lohnstufe = volle Dienstjahre** (3.35 Jahre → Stufe 3, mindestens Stufe 1). Pro Funktion umstellbar auf «Dienstjahre + 1» (Einstellungen → Funktion → Lohn).
- **Die neue Stelle zählt ab Stellenantritt bis zum Stichtag 31.12.** als Erfahrung im Zielberuf. Das Datum kommt aus der offenen Stelle oder wird bei der Person unter «Stellenantritt» eingetragen; die Zeile erscheint grün in der Stellenliste.
- **Familienzeit automatisch aus den Kindern.** Bei der Person unter «Kinder (Geburtsmonate)» eintragen (Claude liest sie aus dem Lebenslauf, z. B. «Kinder: Lena (2009), Noah (2012)»). Jeder Monat mit einem Kind unter 18, in dem das Arbeitspensum aller Stellen unter 100 % liegt (Grenze unter Einstellungen → Funktionen → «Familienzeit automatisch»), zählt als Familienzeit mit 33 % – zusätzlich zu Teilzeitstellen, wie in der Vorlage. Eigene Familienzeit-Einträge im Lebenslauf haben Vorrang.
- **Laufende Stellen enden mit dem Stellenantritt.** Ist ein Stellenantritt gesetzt, zählen «bis heute»-Stellen nur bis zum Monat davor; ab dann zählt die neue Stelle.
- **Stundenlohn-Jobs während einer Ausbildung** (Studium, Lehre) werden nicht angerechnet; Stundenlohn-Jobs danach mit 100 % (Pensum unbekannt, änderbar). Einträge unter «Öffentlichkeitsarbeit», «Ehrenamt», «Vereine» werden erfasst, aber nicht angerechnet. Sprachaufenthalte gelten als Ausbildungszeit.
- Pensum-Angaben vor der Tätigkeit («(73%) Sprachheilschule», «(Std) Skischule») und offene Zeiträume mit Strich («08. 2025 –») werden erkannt; «Berufliche Aus- und Weiterbildungen» und «Zusätzliche Weiterbildung» gelten als Ausbildung.

Die App rechnet wie die Vorlage tagesgenau: erster bis letzter Tag inklusive, Tage × Anrechnung / 365.2425, auf zwei Dezimalen. Daten werden als TT.MM.JJJJ eingegeben; steht im Lebenslauf nur ein Monat, gilt der ganze Monat (1. bis letzter Tag). Unterschiede: Gleichzeitige Tätigkeiten summiert die Vorlage ohne Begrenzung (Beispiel: Familienzeit 33 % plus zwei Teilzeitjobs ergeben 133 %); überzählige Zeilen streicht die Personalabteilung bei Bedarf von Hand mit «x». Dafür gibt es je Funktion die Einstellung «addieren ohne Begrenzung (Vorlage Personal)»; die Variante «addieren, max. 100 % pro Monat» folgt dem Wortlaut des Reglements (Art. 2.7 Ziffer 6). Der Excel-Export zeigt beide Totale und vermerkt gleichzeitige Tätigkeiten in der Fussnote. Militär- und Zivildienst kommt in der Vorlage nicht vor und wird wie «ohne Verbindung» behandelt. Als Treuejahre angerechnete Zeiten (Vermerk in der Vorlage) bildet die App nicht ab.

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
