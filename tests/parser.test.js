// Ausführen: node lebenslauf-rechner/tests/parser.test.js
const assert = require('assert');
const P = require('../parser.js');
const S = JSON.parse(JSON.stringify(P.DEFAULT_SETTINGS));
const rules = (target, extra) => Object.assign(P.makeTemplate(target), extra || {});
const today = new Date(2026, 8, 24);

const cv = `Anna Muster
Bahnhofstrasse 1, 6300 Zug

Berufserfahrung
08/2021 – heute    Primarlehrerin, Schule Herti Zug (Pensum 80%)
Klassenlehrperson 4. Klasse
08.2016 - 07.2021
Kaufmännische Sachbearbeiterin
Versicherung AG, Zürich
März 2014 bis Juli 2016: Verkäuferin, Migros
seit 2024 Nachhilfe Mathematik

Ausbildung
2011 – 2014 Studium Lehrdiplom Primarstufe, PH Zug
2007 - 2011 Kantonsschule Zug, Matura

Sprachen
Deutsch, Englisch 2019`;

const entries = P.extractEntries(cv, S, today);
console.table(entries.map(e => ({ start: e.start, end: e.end, ongoing: e.ongoing, title: e.title, cat: e.category, inc: e.include, pensum: e.pensum })));
assert.strictEqual(entries.length, 6);
assert.strictEqual(entries[0].category, 'lehrperson');
assert.strictEqual(entries[0].pensum, 80);
assert.strictEqual(entries[1].title, 'Kaufmännische Sachbearbeiterin');
assert.strictEqual(entries[1].category, 'kaufm');
assert.strictEqual(entries[2].start, '2014-03');
assert.strictEqual(entries[2].end, '2016-07');
assert.strictEqual(entries[3].category, 'bildung');
assert.ok(entries[3].ongoing);
assert.strictEqual(entries[4].category, '__ausbildung');
assert.strictEqual(entries[4].include, false);

// Beispiel des Auftrags: 10 Jahre total, 5 davon als Lehrer -> 5 + 5*0.5 = 7.5
const ex = [
  { include: true, start: '2010-01', end: '2014-12', category: 'kaufm', pensum: 100 },
  { include: true, start: '2015-01', end: '2019-12', category: 'lehrperson', pensum: 100 },
];
let r = P.compute(ex, rules('lehrperson'), today);
assert.strictEqual(r.totalYears, 10);
assert.strictEqual(r.targetYears, 5);
assert.strictEqual(r.creditedYears, 7.5);
// Gleicher Lebenslauf, Bewerbung als Kaufmann -> ebenfalls 7.5, aber andere Aufteilung
r = P.compute(ex, rules('kaufm'), today);
assert.strictEqual(r.creditedYears, 7.5);

// Überschneidung: nicht doppelt zählen, höherer Faktor gewinnt
const ov = [
  { include: true, start: '2015-01', end: '2019-12', category: 'lehrperson', pensum: 50 },
  { include: true, start: '2015-01', end: '2019-12', category: 'kaufm', pensum: 50 },
];
r = P.compute(ov, rules('lehrperson'), today);
assert.strictEqual(r.totalYears, 5);
assert.strictEqual(r.creditedYears, 5);
// Pensum-Modus: 50% Lehrer (1.0) + 50% Kaufm (0.5) = 0.75 pro Monat
r = P.compute(ov, P.upgradeTemplate({ target: 'lehrperson', pensumMode: true }), today);
assert.ok(Math.abs(r.creditedYears - 3.75) < 1e-9);

// Verwandte Berufe
r = P.compute([{ include: true, start: '2015-01', end: '2016-12', category: 'sozial', pensum: 100 }], rules('lehrperson', { related: ['sozial'] }), today);
assert.strictEqual(r.creditedYears, 1.5);

// Nur Jahreszahlen: 2015 – 2020 = 5 Jahre
const yr = P.findRanges('2015 – 2020 Lehrer', today)[0];
assert.strictEqual(yr.start.y * 12 + yr.start.m - (yr.end.y * 12 + yr.end.m) + 59, 0);
// Englische Monatsnamen
const en = P.findRanges('Jan 2018 - Present  Teacher', today)[0];
assert.ok(en.ongoing && en.start.m === 1);
// Postleitzahlen sind kein Zeitraum
assert.strictEqual(P.findRanges('2000 Neuchâtel', today).length, 0);

// Familienarbeit mit Obergrenze: 6 Jahre à 50 %, max. 4 Jahre anrechenbar -> 2 Jahre
const fam = [{ include: true, start: '2010-01', end: '2015-12', category: '__familie', pensum: 100 }];
r = P.compute(fam, rules('lehrperson', { familyMaxYears: 4 }), today);
assert.strictEqual(r.creditedYears, 2);
assert.ok(r.familyCapped);
assert.strictEqual(r.totalYears, 0); // Familienarbeit ist keine Berufserfahrung
// Mindestalter 20, geboren 01.2000: Erfahrung vor 01.2020 zählt nicht
const young = [{ include: true, start: '2018-01', end: '2021-12', category: 'lehrperson', pensum: 100 }];
r = P.compute(young, rules('lehrperson', { minAge: 20 }), today, { birth: '2000-01' });
assert.strictEqual(r.creditedYears, 2);
assert.strictEqual(r.beforeMinAgeYears, 2);
// Maximum und Rundung
r = P.compute(ex, rules('lehrperson', { rounding: 'down' }), today);
assert.strictEqual(r.creditedYears, 7);
r = P.compute(ex, rules('lehrperson', { rounding: 'half-down' }), today);
assert.strictEqual(r.creditedYears, 7.5);
r = P.compute(ex, rules('lehrperson', { maxYears: 6 }), today);
assert.strictEqual(r.creditedYears, 6);
assert.ok(r.capped);
// Militärdienst und Familienarbeit erkennen, Geburtsdatum finden
const e2 = P.extractEntries('Berufserfahrung\n2012 – 2014 Familienpause (Betreuung der eigenen Kinder)\n03/2008 – 07/2008 Rekrutenschule', S, today);
assert.strictEqual(e2[0].category, '__familie');
assert.strictEqual(e2[1].category, '__dienst');
assert.strictEqual(P.extractBirth('Geburtsdatum: 12.03.1985'), '1985-03');
assert.strictEqual(P.extractBirth('Jahrgang 1990'), '1990-01');
// --- Regeln nach Reglement (Pensum-abhängig) ---
const reglement = rules('sozial', { combine: 'sum', cutoff: 'today', related: ['gesundheit'] });
reglement.rules.same = { mode: 'threshold', factor: 100, low: 50 };
reglement.rules.related = { mode: 'threshold', factor: 100, low: 50 };
reglement.rules.other = { mode: 'pensum', factor: 25, low: 0 };
reglement.rules.internship = { mode: 'threshold', factor: 50, low: 25 };
reglement.rules.assistance = { mode: 'pensum', factor: 100, low: 0 };
reglement.rules.family = { mode: 'flat', factor: 100 / 3, low: 0 };
reglement.rules.secondEducation = { mode: 'flat', factor: 50, low: 0 };
const y = (entries) => Math.round(P.compute(entries, reglement, today).exactYears * 1e9) / 1e9;
const one = (cat, pensum) => [{ include: true, start: '2020-01', end: '2020-12', category: cat, pensum }];
assert.strictEqual(y(one('sozial', 40)), 0.5);      // gleiche Funktion bis 50 %: 50 %
assert.strictEqual(y(one('sozial', 60)), 1);        // über 50 %: 100 %
assert.strictEqual(y(one('gesundheit', 80)), 1);    // verwandt: wie gleiche Funktion
assert.strictEqual(y(one('kaufm', 80)), 0.2);       // ohne Verbindung: 25 % vom Pensum
assert.strictEqual(y(one('__praktikum', 40)), 0.25);
assert.strictEqual(y(one('__praktikum', 100)), 0.5);
assert.strictEqual(y(one('__assistenz', 60)), 0.6); // 100 % vom geleisteten Pensum
assert.strictEqual(y(one('__zweitausbildung', 100)), 0.5);
// Familienzeit 1/3 zusätzlich zu 50 % Arbeit, zusammen max. 100 %: 0.5 + 0.333 = 0.833
const fam2 = one('sozial', 50).concat(one('__familie', 100));
assert.ok(Math.abs(y(fam2) - (0.5 + 1 / 3)) < 1e-9);
const fam3 = one('sozial', 80).concat(one('__familie', 100)); // 1.0 + 0.333 -> gedeckelt auf 1.0
assert.ok(Math.abs(y(fam3) - 1) < 1e-9);
// Stichtag 31.12.: laufende Stelle zählt bis Dezember
const cut = P.compute([{ include: true, start: '2026-01', end: '', ongoing: true, category: 'sozial', pensum: 100 }], Object.assign({}, reglement, { cutoff: 'yearEnd' }), today);
assert.strictEqual(cut.exactYears, 1);
// Lohneinreihung: 11–13, Aufstieg nach 12 und 24 Jahren
const pl = t => P.placement(t, Object.assign({}, reglement, { classMin: 11, classMax: 13 }), null, { classes: { 11: [1,2,3,4,5,6,7,8,9,10], 12: [11,12,13,14,15,16,17,18,19,20], 13: [21,22,23,24,25,26,27,28,29,30] } });
assert.deepStrictEqual([pl(0).cls, pl(0).stage, pl(0).salary], [11, 1, 1]);
assert.deepStrictEqual([pl(5.9).cls, pl(5.9).stage], [11, 6]);
assert.deepStrictEqual([pl(12).cls, pl(12).stage, pl(12).salary], [12, 10, 20]);
assert.deepStrictEqual([pl(30).cls, pl(30).stage], [13, 10]);
assert.strictEqual(P.placement(3, Object.assign({}, reglement, { classMin: 11, classMax: 13 }), { delta: -1 }).cls, 10);
assert.strictEqual(P.placement(30, Object.assign({}, reglement, { classMin: 16, classMax: 18 }), { delta: 1, cap: 18 }).cls, 18);
// Zweitausbildung erkennen
const e3 = P.extractEntries('Ausbildung\n2005 – 2008 Lehre als Kauffrau EFZ\n2015 – 2018 Studium Sozialpädagogik HF', S, today);
assert.strictEqual(e3[0].category, '__ausbildung');
assert.strictEqual(e3[1].category, '__zweitausbildung');
// Praktikum erkennen
assert.strictEqual(P.extractEntries('Berufserfahrung\n01/2019 – 06/2019 Praktikum Kita Sonnenschein', S, today)[0].category, '__praktikum');

assert.strictEqual(P.extractEntries('Berufserfahrung\n02/2015 – 06/2015 Praktikum Heilpädagogische Schule', S, today)[0].category, '__praktikum');

// Alte Einstellungen (globale Faktoren) werden in Vorlagen übernommen
const old = { sameFactor: 100, relatedFactor: 80, otherFactor: 40, educationFactor: 0, categories: [{ id: 'a', name: 'A', keywords: [], related: ['b'] }, { id: 'b', name: 'B', keywords: [], related: [] }] };
const norm = P.normalizeSettings(old);
assert.strictEqual(norm.templates.length, 2);
assert.deepStrictEqual(norm.templates[1].related, ['a']);
assert.strictEqual(norm.templates[0].rules.other.factor, 40);

console.log('Alle Tests bestanden.');

// Gehaltstabelle aus CSV / Excel
assert.strictEqual(P.parseAmount("85'432.50"), 85432.5);
assert.strictEqual(P.parseAmount('CHF 85 432'), 85432);
assert.strictEqual(P.parseAmount('85.432,50'), 85432.5);
assert.strictEqual(P.parseAmount('85.432'), 85432);
assert.strictEqual(P.parseAmount('85432,5'), 85432.5);
assert.strictEqual(P.parseAmount('Stufe'), null);
const csvRows = P.parseCsv('Lohnklasse;Stufe 1;Stufe 2;Stufe 3\n"LK 12";"80\'000";"82\'000";"84\'000"\n13;90000;92000;94000\n\nBemerkung;x\n');
const st = P.parseSalaryTable(csvRows, 'Test');
assert.deepStrictEqual(st.classes, { 12: [80000, 82000, 84000], 13: [90000, 92000, 94000] });
assert.deepStrictEqual(P.parseSalaryTable(P.parseCsv('1\t50000\t51000'), 'x').classes, { 1: [50000, 51000] });
assert.deepStrictEqual(P.parseSalaryTable([[12, 80000, 82000]], 'x').classes, { 12: [80000, 82000] });
assert.strictEqual(P.parseSalaryTable(P.parseCsv('a;b\nc;d')), null);
console.log('Gehaltstabelle-Tests bestanden.');

// Gedrehte Tabelle: Stufen als Zeilen, Lohnklassen im Kopf
const rot = P.parseSalaryTable([['Stufe', 'LK 1', 'LK 2'], ['Stufe 1', '50000', '60000'], ['Stufe 2', '51000', '61000']], 'r');
assert.deepStrictEqual(rot.classes, { 1: [50000, 51000], 2: [60000, 61000] });
assert.strictEqual(rot.monthly, false);
const rot2 = P.parseSalaryTable([['', '1', '2'], ['Stufe 1', '50000', '60000'], ['Stufe 2', '51000', '61000']], 'r');
assert.deepStrictEqual(rot2.classes, { 1: [50000, 51000], 2: [60000, 61000] });
// Monatslöhne erkennen
assert.strictEqual(P.parseSalaryTable([[12, 6500, 6700]], 'm').monthly, true);
console.log('Gehaltstabelle (gedreht/Monat) bestanden.');

// Mehrzeilige Klassen (Jahreslohn, 13/12 Auszahlungen, pro Stunde, pro Lektion)
const multi = P.parseSalaryTable([
    ['Klasse', 'Stufe', '1', '2'],
    ['12', 'Jahreslohn', "82’160.95", "85’596.15"],
    ['13 Auzahlungen', "6’320.05", "6’584.30"],
    ['13', 'Auzahlungen', "6’320.05", "6’584.30"],
    ['12', 'Auzahlungen', "6’846.75", "7’133.00"],
    ['pro Stunde', '37.62', '39.19'],
    ['13', 'Jahreslohn', "87’219.75", "90’771.60"]
], 'g');
assert.deepStrictEqual(multi.classes, { 12: [82160.95, 85596.15], 13: [87219.75, 90771.6] });
assert.strictEqual(multi.monthly, false);
console.log('Gehaltstabelle (mehrzeilig) bestanden.');
assert.strictEqual(P.parseSalaryTable([['Stand:', '01.01.2026', 'Beträge in CHF'], ['4', 'Jahreslohn', '50000']], 'g').validFrom, '2026-01-01');
assert.strictEqual(P.parseSalaryTable([['4', '50000']], 'g').validFrom, null);

// Lektionen/Stunden pro Klasse, Prüfung, Tabellenwahl nach Stichtag, Stufen aus der Tabelle
const withLessons = P.parseSalaryTable([
    ['4', 'Jahreslohn', '50000', '52000'],
    ['13 Auzahlungen', '3846', '4000'],
    ['pro Stunde', '23.17', '24.26'],
    ['pro Lektion', '36.48', '38.20'],
    ['5', 'Jahreslohn', '54000', '56000'],
    ['pro Lektion', '40.73', '42.53']
], 'l');
assert.deepStrictEqual(withLessons.classes, { 4: [50000, 52000], 5: [54000, 56000] });
assert.deepStrictEqual(withLessons.lessons, { 4: [36.48, 38.2], 5: [40.73, 42.53] });
assert.deepStrictEqual(withLessons.hours, { 4: [23.17, 24.26] });
assert.deepStrictEqual(P.checkSalaryTable(withLessons), []);
const bad = P.checkSalaryTable({ classes: { 4: [50000, 49000, 52000], 6: [60000, 61000, 62000], 7: [59000, 60000] } });
assert.ok(bad.some(w => /Lohnklasse 5 fehlt/.test(w)), bad);
assert.ok(bad.some(w => /LK 4: Stufe 2/.test(w)), bad);
assert.ok(bad.some(w => /LK 7 hat 2 Stufen/.test(w)), bad);
assert.ok(bad.some(w => /LK 7 Stufe 1 ist nicht höher als LK 6/.test(w)), bad);

const t26 = { id: 'a', validFrom: '2026-01-01', classes: { 12: [1] } };
const t27 = { id: 'b', validFrom: '2027-01-01', classes: { 12: [2] } };
const tplToday = rules('lehrperson');
const tplYearEnd = rules('lehrperson', { cutoff: 'yearEnd' });
assert.strictEqual(P.selectSalaryTable([t26, t27], tplToday, new Date(2026, 8, 24)).table.id, 'a');
assert.strictEqual(P.selectSalaryTable([t26, t27], tplToday, new Date(2027, 0, 5)).table.id, 'b');
assert.strictEqual(P.selectSalaryTable([t26, t27], tplYearEnd, new Date(2026, 11, 31)).table.id, 'a');
assert.strictEqual(P.selectSalaryTable([t27], tplToday, new Date(2026, 8, 24)).future, true);
assert.strictEqual(P.selectSalaryTable([t26, t27], rules('lehrperson', { salaryTableId: 'b' }), new Date(2026, 8, 24)).table.id, 'b');
assert.strictEqual(P.selectSalaryTable([], tplToday).table, null);

const plTpl = rules('lehrperson', { classMin: 4, classMax: 4 });
const small = { classes: { 4: [50000, 52000, 54000] }, lessons: { 4: [36, 38, 40] } };
const plS = P.placement(20, plTpl, null, small);
assert.strictEqual(plS.stage, 3);
assert.strictEqual(plS.maxStage, 3);
assert.strictEqual(plS.salary, 54000);
assert.strictEqual(plS.lesson, 40);
assert.strictEqual(P.placement(20, plTpl, null, null).stage, 10);

// Alte Einstellungen mit einer einzelnen Gehaltstabelle werden übernommen
const migrated = P.normalizeSettings(Object.assign({}, S, { salaryTables: undefined, salaryTable: { name: 'Alt', classes: { 4: [1, 2] } } }));
assert.strictEqual(migrated.salaryTables.length, 1);
assert.strictEqual(migrated.salaryTables[0].name, 'Alt');
assert.ok(migrated.salaryTables[0].id);
assert.strictEqual(migrated.templates[0].payments, 13);
console.log('Gehaltstabellen (Lektionen/Prüfung/Stichtag/Stufen) bestanden.');

// Grundfunktion plus 1 max. 18, Vorschlag der Funktion
const base = rules('sozial', { id: 'sp', name: 'Sozialpädagogik', classMin: 11, classMax: 13 });
const lead = rules('sozial', { id: 'tl', name: 'Teamleitung', baseTemplateId: 'sp', baseDelta: 1, classCap: 18 });
const shp = rules('lehrperson', { id: 'shp', classMin: 16, classMax: 18 });
assert.deepStrictEqual([P.effectiveTemplate(lead, [base, lead, shp]).classMin, P.effectiveTemplate(lead, [base, lead, shp]).classMax], [12, 14]);
assert.deepStrictEqual([P.effectiveTemplate(lead, [base, lead, shp], 'shp').classMin, P.effectiveTemplate(lead, [base, lead, shp], 'shp').classMax], [17, 18]);
assert.strictEqual(P.effectiveTemplate(base, [base]).classMin, 11);

assert.ok(P.keywordHit(' sozialpädagogin hf ', 'hf'));
assert.ok(!P.keywordHit(' hofhaus ', 'hf'));
assert.ok(P.keywordHit(' kauffrau efz, bank ', 'kauf+efz'));
assert.ok(!P.keywordHit(' kauffrau ', 'kauf+efz'));

const tpls = [
    rules('kaufm', { id: 'kv', keywords: ['kaufm', 'kauffrau', 'sachbearbeit'] }),
    rules('sozial', { id: 'sp', keywords: ['sozialpädagog', 'sozialpädagog+hf'] }),
    rules('sozial', { id: 'fabe', keywords: ['fabe', 'fachfrau betreuung', 'fachmann betreuung'] }),
    rules('handwerk', { id: 'none' })
];
const cvEntries = [
    { title: 'Kauffrau EFZ', details: 'Bank AG', start: '2008-08', end: '2011-07', category: '__ausbildung' },
    { title: 'Sachbearbeiterin', details: 'Versicherung', start: '2011-08', end: '2015-07', category: 'kaufm' },
    { title: 'Studium Sozialpädagogik HF', details: 'HSL Luzern', start: '2015-08', end: '2018-07', category: '__zweitausbildung' },
    { title: 'Sozialpädagogin', details: 'Wohnheim', start: '2018-08', ongoing: true, category: 'sozial' }
];
const sug = P.suggestTemplates(cvEntries, tpls);
assert.strictEqual(sug[0].id, 'sp', JSON.stringify(sug));
assert.ok(sug.some(x => x.id === 'kv'));
assert.ok(!sug.some(x => x.id === 'none'));
assert.deepStrictEqual(P.suggestTemplates([], tpls), []);
console.log('Grundfunktion und Funktionsvorschlag bestanden.');

// Überschrift «Berufserfahrung» (mit Fugen-s) nach «Ausbildung»
for (const h of ['Berufserfahrung', 'Berufstätigkeit', 'Berufspraxis', 'Berufliche Erfahrung', 'BERUFSERFAHRUNG:']) assert.strictEqual(P.detectSection(h), 'experience', h);
const eduFirst = P.extractEntries(`Ausbildung
2010 – 2013 Kaufmann EFZ, Gemeindeverwaltung Baar
Berufserfahrung
08/2013 – 12/2019 Sachbearbeiter Personal, Versicherung AG Zug
01/2020 – heute Sachbearbeiter Verwaltung, Stiftung XY (Pensum 90%)`, S, today);
assert.deepStrictEqual(eduFirst.map(e => e.category), ['__ausbildung', 'kaufm', 'kaufm']);
console.log('Abschnitt «Berufserfahrung» bestanden.');

// Einreihungsplan ohne KI lesen (erfundenes Beispiel im Format von pdf.js)
const regText = `Inhalt
2.1 Einleitung ........................................ 3
Der Aufstieg erfolgt zu Beginn jenes Kalenderjahres, in welchem das 10. und 20. Dienstjahr erfüllt wird.
Massgebend sind die Dienstjahre per 31.12. des Kalenderjahres. Das 13. Monatsgehalt wird im November ausbezahlt.
Nr.   Funktion   Lohnklasse   Zulagen

1.   Leitung
1.1   Gesamtleitung   20 - 23   -
2.   Betreuung
2.1   Fachperson Betreuung (Menschen mit Beeinträchti-   10 - 12   -
gung) EFZ
2.2   Teamleitung Betreuung   gemäss Grundfunk-   -
tion plus 1 max. 16
3

Nr.   Funktion   Lohnklasse   Zulagen
2.3   Lehrperson Primarstufe   13 - 15   1)
3.   Ausbildung
3.1   Praktikant*in   CHF 30'000.00/Jahr   -
Stufe P2 (mit abgeschlossener Berufsausbildung im nicht pä-
dagogischen Bereich)
3.2   Schnupperpraktikum   max. CHF 30.00/Tag   -
3.3   Lernende*r   gemäss Lehrvertrag   -

1) Zulage für Zusatzausbildung CHF 1'000.00/Jahr`;
const reg = P.parseRegulationText(regText);
assert.deepStrictEqual(reg.functions.map(f => f.nr), ['1.1', '2.1', '2.2', '2.3', '3.1']);
assert.strictEqual(reg.functions[1].name, 'Fachperson Betreuung (Menschen mit Beeinträchtigung) EFZ');
assert.deepStrictEqual([reg.functions[1].classMin, reg.functions[1].classMax], [10, 12]);
assert.deepStrictEqual([reg.functions[2].baseDelta, reg.functions[2].classCap], [1, 16]);
assert.ok(/Zulage für Zusatzausbildung/.test(reg.functions[3].note));
assert.strictEqual(reg.functions[4].fixedAnnual, 30000);
assert.ok(/nicht pädagogischen/.test(reg.functions[4].note), reg.functions[4].note);
assert.deepStrictEqual([reg.classUpYears, reg.cutoff, reg.payments], [[10, 20], 'yearEnd', 13]);

const built = P.buildFromRegulation(reg, S);
assert.strictEqual(built.templates.length, 5);
// Berufe = Funktionen des Einreihungsplans (Praktikum nutzt den eingebauten Beruf)
assert.deepStrictEqual(built.categories.map(c => c.name), ['1.1 Gesamtleitung', '2.1 Fachperson Betreuung (Menschen mit Beeinträchtigung) EFZ', '2.2 Teamleitung Betreuung', '2.3 Lehrperson Primarstufe']);
assert.strictEqual(built.templates.find(t => t.name.startsWith('2.1')).target, 'b_2_1');
assert.ok(built.templates.find(t => t.name.startsWith('2.2')).related.includes('b_2_1'), 'Grundfunktion ist verwandt');
const lead2 = built.templates.find(t => t.name.startsWith('2.2'));
assert.ok(lead2.baseTemplateId, 'Grundfunktion gesetzt');
assert.deepStrictEqual([P.effectiveTemplate(lead2, built.templates).classMin, P.effectiveTemplate(lead2, built.templates).classMax], [11, 13]);
assert.ok(built.templates.every(t => t.cutoff === 'yearEnd' && t.classUpYears.join() === '10,20'));
assert.strictEqual(built.templates.find(t => t.name.startsWith('3.1')).target, '__praktikum');
assert.ok(built.templates.find(t => t.name.startsWith('2.1')).keywords.includes('fachperson+efz'));
// mit Angaben von Claude: eigene Berufe, Regeln, Korrekturen
const builtAi = P.buildFromRegulation({
    categories: [{ id: 'betreuung', name: 'Betreuung', keywords: ['betreu'] }],
    functions: [{ nr: '2.1', name: 'Fachperson Betreuung', target: 'betreuung', classMin: 10, classMax: 12, keywords: ['fabe'], rules: { other: { mode: 'pensum', factor: 25, low: 0 } } }],
    defaultRules: { family: { mode: 'flat', factor: 33.33, low: 0 } }, combine: 'sum', cutoff: 'yearEnd', classUpYears: [12, 24], payments: 13,
    adjustments: [{ label: 'fehlende Ausbildung', delta: -1 }]
}, S);
assert.strictEqual(builtAi.categories.length, 1);
assert.strictEqual(builtAi.categories[0].name, '2.1 Fachperson Betreuung');
assert.deepStrictEqual(builtAi.categories[0].keywords, ['fabe']);
assert.deepStrictEqual(builtAi.templates[0].rules.other, { mode: 'pensum', factor: 25, low: 0 });
assert.strictEqual(builtAi.templates[0].rules.family.factor, 33.33);
assert.strictEqual(builtAi.templates[0].combine, 'sum');
assert.strictEqual(builtAi.classAdjustments[0].delta, -1);
console.log('Reglement einlesen bestanden.');

// Umlaute ausgeschrieben
assert.ok(P.keywordHit(' sozialpaedagogin hf ', 'sozialpädagog+hf'));
assert.strictEqual(P.classify('Sozialpaedagogin', '', S.categories).category, 'sozial');
console.log('ae/oe/ue bestanden.');

// Stichwörter «a+b» auch beim Einordnen der Stellen
const cats2 = [{ id: 'fabe', name: 'FaBe', keywords: ['fabe', 'fachfrau betreuung'] }, { id: 'fabe_b', name: 'FaBe Beeinträchtigung', keywords: ['fabe+behinder', 'fachfrau betreuung+behinder'] }];
assert.strictEqual(P.classify('Fachfrau Betreuung EFZ', 'Kita Sonnenschein', cats2).category, 'fabe');
assert.strictEqual(P.classify('Fachfrau Betreuung EFZ', 'Wohnheim für Menschen mit Behinderung', cats2).category, 'fabe_b');
console.log('Stichwörter a+b beim Einordnen bestanden.');

// Funktion vor dem Arbeitgeber: «Koch, Altersheim» ist Koch
const catsWork = [{ id: 'koch', name: 'Koch', keywords: ['koch'] }, { id: 'betreuung', name: 'Betreuung', keywords: ['altersheim', 'betreuung'] }];
assert.strictEqual(P.classify('Koch, Altersheim Baar (Pensum 100%)', '', catsWork).category, 'koch');
assert.strictEqual(P.classify('Koch', 'Altersheim Baar', catsWork).category, 'koch');
assert.strictEqual(P.classify('Mitarbeiterin', 'Altersheim Baar', catsWork).category, 'betreuung');
console.log('Funktion vor Arbeitgeber bestanden.');
