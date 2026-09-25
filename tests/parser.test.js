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
