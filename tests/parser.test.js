// Ausführen: node lebenslauf-rechner/tests/parser.test.js
const assert = require('assert');
const P = require('../parser.js');
const S = JSON.parse(JSON.stringify(P.DEFAULT_SETTINGS));
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
let r = P.compute(ex, 'lehrperson', S, today);
assert.strictEqual(r.totalYears, 10);
assert.strictEqual(r.targetYears, 5);
assert.strictEqual(r.creditedYears, 7.5);
// Gleicher Lebenslauf, Bewerbung als Kaufmann -> ebenfalls 7.5, aber andere Aufteilung
r = P.compute(ex, 'kaufm', S, today);
assert.strictEqual(r.creditedYears, 7.5);

// Überschneidung: nicht doppelt zählen, höherer Faktor gewinnt
const ov = [
  { include: true, start: '2015-01', end: '2019-12', category: 'lehrperson', pensum: 50 },
  { include: true, start: '2015-01', end: '2019-12', category: 'kaufm', pensum: 50 },
];
r = P.compute(ov, 'lehrperson', S, today);
assert.strictEqual(r.totalYears, 5);
assert.strictEqual(r.creditedYears, 5);
// Pensum-Modus: 50% Lehrer (1.0) + 50% Kaufm (0.5) = 0.75 pro Monat
r = P.compute(ov, 'lehrperson', { ...S, pensumMode: true }, today);
assert.ok(Math.abs(r.creditedYears - 3.75) < 1e-9);

// Verwandte Berufe
const S2 = JSON.parse(JSON.stringify(S));
S2.categories.find(c => c.id === 'lehrperson').related = ['sozial'];
r = P.compute([{ include: true, start: '2015-01', end: '2016-12', category: 'sozial', pensum: 100 }], 'lehrperson', S2, today);
assert.strictEqual(r.creditedYears, 1.5);

// Nur Jahreszahlen: 2015 – 2020 = 5 Jahre
const yr = P.findRanges('2015 – 2020 Lehrer', today)[0];
assert.strictEqual(yr.start.y * 12 + yr.start.m - (yr.end.y * 12 + yr.end.m) + 59, 0);
// Englische Monatsnamen
const en = P.findRanges('Jan 2018 - Present  Teacher', today)[0];
assert.ok(en.ongoing && en.start.m === 1);
// Postleitzahlen sind kein Zeitraum
assert.strictEqual(P.findRanges('2000 Neuchâtel', today).length, 0);

console.log('Alle Tests bestanden.');
