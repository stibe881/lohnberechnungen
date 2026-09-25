/* ============================================
   Lebenslauf-Rechner — Parser & Berechnung
   Läuft im Browser (window.CVParser) und in Node (require) für Tests.
   ============================================ */
(function (root) {
    'use strict';

    // --- Monatsnamen (DE / EN / FR) ---
    const MONTHS = {
        jan: 1, januar: 1, january: 1, janvier: 1, janv: 1, jänner: 1,
        feb: 2, febr: 2, februar: 2, february: 2, 'février': 2, fevrier: 2, 'févr': 2,
        'mär': 3, mar: 3, 'märz': 3, maerz: 3, mrz: 3, march: 3, mars: 3,
        apr: 4, april: 4, avril: 4, avr: 4,
        mai: 5, may: 5,
        jun: 6, juni: 6, june: 6, juin: 6,
        jul: 7, juli: 7, july: 7, juillet: 7, juil: 7,
        aug: 8, august: 8, 'août': 8, aout: 8,
        sep: 9, sept: 9, september: 9, septembre: 9,
        okt: 10, oct: 10, oktober: 10, october: 10, octobre: 10,
        nov: 11, november: 11, novembre: 11,
        dez: 12, dec: 12, dezember: 12, december: 12, 'décembre': 12, decembre: 12, 'déc': 12
    };
    const MONTH_ALT = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
    const YEAR = '((?:19|20)\\d{2})';
    const PRESENT = "(heute|dato|jetzt|aktuell|laufend|present|today|now|current(?:ly)?|aujourd['’]hui|ce jour|actuel(?:lement)?)";

    // Reihenfolge = Priorität (längere/spezifischere Muster zuerst)
    const TOKEN_RE = new RegExp(
        '(?<![\\d\\p{L}])(?:' +
            '(?<dmyD>\\d{1,2})\\.\\s?(?<dmyM>\\d{1,2})\\.\\s?(?<dmyY>(?:19|20)\\d{2})' +
            '|(?<nameM>' + MONTH_ALT + ')\\.?\\s*(?<nameY>(?:19|20)\\d{2})' +
            '|(?<numM>\\d{1,2})\\s*[./-]\\s*(?<numY>(?:19|20)\\d{2})' +
            '|(?<yearY>(?:19|20)\\d{2})' +
            '|(?<present>' + PRESENT.slice(1, -1) + ')' +
        ')(?![\\d\\p{L}])',
        'giu'
    );
    const RANGE_SEP_RE = /^\s*(?:-{1,2}|–|—|‒|bis(?:\s+zum)?|to|until|till|à|au|jusqu['’]?(?:à|en)?)\s*$/i;
    const OPEN_START_RE = /(?:seit|ab|since|depuis|from)\s*$/i;

    function tokenize(line) {
        const tokens = [];
        TOKEN_RE.lastIndex = 0;
        let m;
        while ((m = TOKEN_RE.exec(line)) !== null) {
            const g = m.groups;
            let tok = null;
            if (g.dmyY) tok = { y: +g.dmyY, m: +g.dmyM };
            else if (g.nameY) tok = { y: +g.nameY, m: MONTHS[g.nameM.toLowerCase()] };
            else if (g.numY) tok = { y: +g.numY, m: +g.numM };
            else if (g.yearY) tok = { y: +g.yearY, m: null };
            else if (g.present) tok = { present: true };
            if (tok && tok.m !== null && tok.m !== undefined && (tok.m < 1 || tok.m > 12)) tok = null;
            if (tok) {
                tok.index = m.index;
                tok.end = m.index + m[0].length;
                tokens.push(tok);
            }
        }
        return tokens;
    }

    /** Findet Zeiträume in einer Zeile. Gibt [{start, end, index, endIndex, imprecise}] zurück. */
    function findRanges(line, today) {
        const tokens = tokenize(line);
        const ranges = [];
        for (let i = 0; i < tokens.length; i++) {
            const a = tokens[i];
            if (a.present) continue;
            const b = tokens[i + 1];
            if (b && RANGE_SEP_RE.test(line.slice(a.end, b.index))) {
                ranges.push(buildRange(a, b, today, a.index, b.end));
                i++;
                continue;
            }
            if (OPEN_START_RE.test(line.slice(0, a.index))) {
                const kw = line.slice(0, a.index).match(OPEN_START_RE);
                ranges.push(buildRange(a, { present: true }, today, a.index - kw[0].length, a.end));
            }
        }
        return ranges;
    }

    function buildRange(a, b, today, index, endIndex) {
        let imprecise = a.m === null || (!b.present && b.m === null);
        let start, end;
        if (b.present) {
            start = { y: a.y, m: a.m === null ? 1 : a.m };
            end = null; // heute
        } else if (a.m === null && b.m === null) {
            // "2015 – 2020": als 5 Jahre zählen (Jan 2015 – Dez 2019), "2020 – 2020" als 1 Jahr
            start = { y: a.y, m: 1 };
            end = b.y > a.y ? { y: b.y - 1, m: 12 } : { y: b.y, m: 12 };
        } else {
            start = { y: a.y, m: a.m === null ? 1 : a.m };
            end = { y: b.y, m: b.m === null ? 6 : b.m };
        }
        return { start, end, ongoing: b.present === true, index, endIndex, imprecise };
    }

    // --- Abschnitte ---
    const SECTION_PATTERNS = [
        ['experience', /^(?:beruf(?:liche[rns]?|s)?\s*(?:erfahrung(?:en)?|werdegang|tätigkeit(?:en)?|laufbahn|praxis|stationen)|werdegang|erfahrung|arbeitserfahrung|berufspraxis|praxiserfahrung|tätigkeiten|anstellungen|work experience|professional experience|experience|employment(?: history)?|career|expérience(?:s)? professionnelle(?:s)?|parcours professionnel)$/i],
        ['education', /^(?:aus-?\s*(?:und|&)\s*weiterbildung(?:en)?|ausbildung(?:en)?|schul(?:ische)?\s*(?:bildung|laufbahn)|schulen|bildung(?:sweg)?|bildungsweg|studium|weiterbildung(?:en)?|education|academic background|formation(?:s)?|diplome?|abschlüsse|qualifikationen|zertifikate|kurse)$/i],
        ['other', /^(?:sprachen|sprachkenntnisse|kenntnisse|edv(?:[- ]?kenntnisse)?|it[- ]?kenntnisse|hobbys?|hobbies|interessen|freizeit|referenzen|skills|languages|interests|references|persönliche angaben|personalien|kontakt|profil|über mich|kompetenzen)$/i]
    ];

    function detectSection(line) {
        const clean = line.replace(/[:|•\-–_=*#]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!clean || clean.length > 45) return null;
        for (const [name, re] of SECTION_PATTERNS) if (re.test(clean)) return name;
        return null;
    }

    const EDU_RE = /(studium|studiengang|student(?:in)?\b|gymnasium|kantonsschule|matura|maturität|bachelor|master of|master\b|diplomstudium|lehrdiplom|lehrabschluss|lehre als|lehre zum|lehre zur|ausbildung zu|ausbildung als|berufslehre|berufsschule|sekundarschule|primarschule|realschule|bezirksschule|obligatorische schule|university|universität|hochschule|fachhochschule|\bph\b|\beth\b|\bcas\b|\bdas\b|\bmas\b|weiterbildung|zertifikat|certificate|degree)/i;

    // --- Standardeinstellungen ---
    // Feste Sonderkategorien (nicht löschbar), mit eigenen Regeln in den Vorlagen
    const SPECIAL_CATEGORIES = [
        { id: '__praktikum', name: 'Praktikum', keywords: ['praktikum', 'praktikant', 'praktikantin', 'vorpraktikum', 'internship', 'intern ', 'stage '] },
        { id: '__assistenz', name: 'Assistenz-Einsatz', keywords: ['klassenassistenz', 'schulassistenz', 'pädagogische assistenz', 'pädagogischer assistent', 'pädagogische assistentin', 'betreuungsassistenz', 'unterrichtsassistenz', 'assistenzeinsatz', 'assistenz-einsatz'] },
        { id: '__familie', name: 'Familienarbeit', keywords: ['familienarbeit', 'familienpause', 'familienzeit', 'familienphase', 'elternzeit', 'elternurlaub', 'mutterschaft', 'hausfrau', 'hausmann', 'betreuung der eigenen kinder', 'betreuung eigener kinder', 'erziehungsarbeit', 'erziehungszeit'] },
        { id: '__dienst', name: 'Militär-/Zivildienst', keywords: ['militärdienst', 'militär', 'rekrutenschule', 'unteroffiziersschule', 'offiziersschule', 'durchdiener', 'zivildienst', 'zivi ', 'zivilschutz'] },
        { id: '__sonstige', name: 'Sonstige', keywords: [] },
        { id: '__ausbildung', name: 'Erstausbildung / Schule', keywords: [] },
        { id: '__zweitausbildung', name: 'Zweitausbildung', keywords: ['zweitausbildung', 'zweitstudium', 'zweitlehre', 'zweite ausbildung'] }
    ];

    const ROUNDING = [
        { id: 'none', name: 'nicht runden' },
        { id: 'half-down', name: 'auf halbe Jahre abrunden' },
        { id: 'down', name: 'auf ganze Jahre abrunden' },
        { id: 'nearest', name: 'auf ganze Jahre runden' }
    ];

    /** Anrechnungsarten: wie Pensum und Faktor zusammenspielen */
    const MODES = [
        { id: 'flat', name: 'Faktor (Pensum egal)' },
        { id: 'pensum', name: 'Faktor × Pensum' },
        { id: 'threshold', name: 'nach Pensum: bis 50 % / über 50 %' }
    ];

    /** Regelgruppen einer Vorlage (Reihenfolge = Anzeige) */
    const RULE_KEYS = [
        { id: 'same', name: 'Gleicher Beruf (Zielberuf)' },
        { id: 'related', name: 'Verwandte Berufe' },
        { id: 'other', name: 'Andere Berufe' },
        { id: 'internship', name: 'Praktikum' },
        { id: 'assistance', name: 'Assistenz-Einsatz' },
        { id: 'family', name: 'Familienarbeit' },
        { id: 'service', name: 'Militär-/Zivildienst' },
        { id: 'education', name: 'Erstausbildung / Schule' },
        { id: 'secondEducation', name: 'Zweitausbildung' }
    ];
    const TARGETABLE_SPECIALS = ['__assistenz', '__praktikum']; // als Zielberuf einer Vorlage wählbar
    const CATEGORY_RULE = { __praktikum: 'internship', __assistenz: 'assistance', __familie: 'family', __dienst: 'service', __ausbildung: 'education', __zweitausbildung: 'secondEducation' };

    const rule = (factor, mode, low) => ({ mode: mode || 'flat', factor, low: low ?? Math.round(factor / 2) });

    /** Anrechnungsregeln für eine Stelle (Vorlage). */
    function makeTemplate(target, name) {
        return {
            id: 't_' + target + '_' + Math.random().toString(36).slice(2, 6),
            name: name || 'Neue Vorlage',
            target,
            related: [],
            rules: {
                same: rule(100), related: rule(75), other: rule(50),
                internship: rule(50), assistance: rule(50), family: rule(50), service: rule(50),
                education: rule(0), secondEducation: rule(0)
            },
            combine: 'max',        // 'max' = pro Monat zählt die höchste Anrechnung, 'sum' = summiert bis 100 %
            familyMaxYears: null,
            minAge: null,
            maxYears: null,
            rounding: 'none',
            cutoff: 'today',       // 'today' | 'yearEnd' (Stichtag 31.12. des laufenden Jahres)
            classMin: null,        // Lohneinreihung (optional): tiefste/höchste Lohnklasse der Funktion
            classMax: null,
            classUpYears: [12, 24], // Aufstieg in die nächste Lohnklasse nach so vielen Jahren
            salaryTableId: '',     // '' = Gehaltstabelle automatisch nach Stichtag, sonst ID einer Tabelle
            payments: 13,          // Anzahl Monatslöhne pro Jahr (13 oder 12)
            lessonsFull: null,     // Lektionen pro Woche bei 100 % (optional; Pensum dann in Lektionen)
            keywords: [],          // Stichwörter für den automatischen Vorschlag der Funktion («a+b» = beide im gleichen Eintrag)
            note: '',              // Hinweis zur Einreihung (erscheint beim Lohnvorschlag und im Bericht)
            baseTemplateId: '',    // «gemäss Grundfunktion plus …»: Lohnklassen einer anderen Vorlage übernehmen
            baseDelta: 1,          //   … plus so viele Klassen
            classCap: null,        //   … höchstens bis zu dieser Klasse
            fixedAnnual: null      // fixer Jahreslohn bei 100 % statt Lohnklasse (z. B. Praktikum)
        };
    }

    /** Übernimmt Vorlagen der Version 2 (Faktoren als einzelne Felder, pensumMode). */
    function upgradeTemplate(t) {
        const out = Object.assign(makeTemplate(t.target), t);
        if (!t.rules) {
            const mode = t.pensumMode ? 'pensum' : 'flat';
            const map = { same: 'sameFactor', related: 'relatedFactor', other: 'otherFactor', family: 'familyFactor', service: 'serviceFactor', education: 'educationFactor' };
            for (const [k, f] of Object.entries(map)) out.rules[k] = rule(t[f] !== undefined ? t[f] : out.rules[k].factor, k === 'family' || k === 'education' ? 'flat' : mode);
            out.rules.internship = Object.assign({}, out.rules.other);
            out.rules.assistance = Object.assign({}, out.rules.other);
            out.rules.secondEducation = Object.assign({}, out.rules.education);
            out.combine = t.pensumMode ? 'sum' : 'max';
            ['sameFactor', 'relatedFactor', 'otherFactor', 'educationFactor', 'familyFactor', 'serviceFactor', 'pensumMode'].forEach(k => delete out[k]);
        } else {
            const base = makeTemplate(t.target).rules;
            out.rules = Object.assign({}, base, t.rules);
        }
        if (!Array.isArray(out.classUpYears)) out.classUpYears = [12, 24];
        if (out.payments !== 12) out.payments = 13;
        if (!Array.isArray(out.keywords)) out.keywords = [];
        return out;
    }

    const DEFAULT_SETTINGS = {
        categories: [
            { id: 'lehrperson', name: 'Lehrperson', keywords: ['lehrer', 'lehrerin', 'lehrperson', 'lehrkraft', 'primarlehr', 'sekundarlehr', 'reallehr', 'oberstufenlehr', 'kindergärtner', 'kindergartenlehr', 'kindergarten-lehr', 'fachlehr', 'klassenlehr', 'mittelschullehr', 'gymnasiallehr', 'berufsschullehr', 'heilpädagog', 'dozent', 'teacher', 'enseignant', 'vikariat', 'stellvertretung', 'lehrtätigkeit', 'unterricht'] },
            { id: 'sozial', name: 'Sozialpädagogik / Betreuung', keywords: ['sozialpädagog', 'sozialarbeit', 'betreuer', 'betreuung', 'fabe', 'fachperson betreuung', 'kita', 'hort', 'tagesstruktur', 'jugendarbeit', 'erzieher', 'klassenassistenz', 'schulassistenz', 'spielgruppe'] },
            { id: 'bildung', name: 'Erwachsenenbildung / Training', keywords: ['trainer', 'trainerin', 'kursleit', 'coach', 'ausbildner', 'ausbilder', 'berufsbildner', 'erwachsenenbildn', 'instruktor', 'nachhilfe', 'tutor'] },
            { id: 'fuehrung', name: 'Führung / Management', keywords: ['schulleit', 'geschäftsführ', 'geschäftsleit', 'leiter', 'leiterin', 'leitung', 'head of', 'manager', 'direktor', 'rektor', 'ceo', 'teamlead', 'abteilungsleit'] },
            { id: 'gesundheit', name: 'Gesundheit / Pflege', keywords: ['pflege', 'fage', 'fachperson gesundheit', 'arzt', 'ärztin', 'therapeut', 'mpa', 'spital', 'physiotherap', 'ergotherap', 'logopäd'] },
            { id: 'kaufm', name: 'Kaufmännisch / Verwaltung', keywords: ['kaufm', 'kauffrau', 'kaufmann', 'sachbearbeit', 'buchhalt', 'administration', 'sekretär', 'sekretariat', 'office', 'verkauf', 'verkäufer', 'marketing', 'personal', 'hr ', 'treuhand', 'bank', 'versicherung', 'controlling', 'accountant'] },
            { id: 'informatik', name: 'Informatik / Technik', keywords: ['informatik', 'software', 'entwickler', 'developer', 'engineer', 'ingenieur', 'ict', 'it-', 'support', 'applikation', 'system', 'programmier', 'techniker'] },
            { id: 'handwerk', name: 'Handwerk / Gewerbe', keywords: ['schreiner', 'elektriker', 'elektroinstall', 'mechaniker', 'polymechaniker', 'maurer', 'zimmermann', 'monteur', 'koch', 'köchin', 'bäcker', 'gärtner', 'maler', 'sanitär', 'logistik', 'lagerist', 'chauffeur', 'service', 'gastronomie'] }
        ]
    };

    /** Ergänzt fehlende Felder und übernimmt Einstellungen aus älteren Versionen (globale Faktoren, «verwandt» je Beruf). */
    function normalizeSettings(s) {
        const out = { categories: [], templates: [], classAdjustments: [], salaryTables: [] };
        out.categories = (s.categories || []).map(c => ({ id: c.id, name: c.name, keywords: c.keywords || [] }));
        if (Array.isArray(s.templates) && s.templates.length) {
            out.templates = s.templates.map(upgradeTemplate);
        } else {
            out.templates = (s.categories || []).map(c => {
                const old = { target: c.id, name: c.name, related: (c.related || []).slice() };
                for (const k of ['sameFactor', 'relatedFactor', 'otherFactor', 'educationFactor', 'pensumMode', 'maxYears']) if (s[k] !== undefined) old[k] = s[k];
                (s.categories || []).forEach(o => { if ((o.related || []).includes(c.id) && !old.related.includes(o.id)) old.related.push(o.id); });
                return Object.assign(upgradeTemplate(old), { id: 't_' + c.id });
            });
        }
        const ids = new Set(out.categories.map(c => c.id));
        const targets = new Set([...ids, ...TARGETABLE_SPECIALS]);
        out.templates.forEach(t => { t.related = (t.related || []).filter(r => ids.has(r)); });
        out.templates = out.templates.filter(t => targets.has(t.target));
        out.classAdjustments = Array.isArray(s.classAdjustments) ? s.classAdjustments : DEFAULT_ADJUSTMENTS.map(x => Object.assign({}, x));
        const tables = Array.isArray(s.salaryTables) ? s.salaryTables : s.salaryTable ? [s.salaryTable] : [];
        out.salaryTables = tables.filter(t => t && t.classes && Object.keys(t.classes).length).map(normalizeSalaryTable);
        const tableIds = new Set(out.salaryTables.map(t => t.id));
        out.templates.forEach(t => { if (t.salaryTableId && !tableIds.has(t.salaryTableId)) t.salaryTableId = ''; });
        const tplIds = new Set(out.templates.map(t => t.id));
        out.templates.forEach(t => { if (t.baseTemplateId && (!tplIds.has(t.baseTemplateId) || t.baseTemplateId === t.id)) t.baseTemplateId = ''; });
        return out;
    }

    const newTableId = () => 'g_' + Math.random().toString(36).slice(2, 9);

    /** Gehaltstabelle mit allen Feldern: {id, name, validFrom, classes, lessons, hours, note} */
    function normalizeSalaryTable(t) {
        const map = m => {
            const out = {};
            for (const [k, v] of Object.entries(m || {})) if (Array.isArray(v) && v.length) out[k] = v.map(Number);
            return out;
        };
        return {
            id: t.id || newTableId(),
            name: t.name || 'Gehaltstabelle',
            validFrom: /^\d{4}-\d{2}-\d{2}$/.test(t.validFrom || '') ? t.validFrom : null,
            classes: map(t.classes),
            lessons: map(t.lessons),
            hours: map(t.hours),
            note: t.note || ''
        };
    }

    /** Stichtag einer Vorlage als 'YYYY-MM-DD' (heute oder 31.12. des laufenden Jahres). */
    function cutoffDate(tpl, today) {
        today = today || new Date();
        const y = today.getFullYear();
        if (tpl.cutoff === 'yearEnd') return y + '-12-31';
        return y + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    }

    /**
     * Gehaltstabelle für eine Vorlage: die fest gewählte oder die am Stichtag gültige
     * (jüngstes «gültig ab» bis zum Stichtag; Tabellen ohne Datum gelten immer).
     * Gilt am Stichtag noch keine, wird die früheste genommen (future = true).
     * @returns {{table: object|null, future: boolean}}
     */
    function selectSalaryTable(tables, tpl, today) {
        tables = tables || [];
        if (!tables.length) return { table: null, future: false };
        if (tpl.salaryTableId) {
            const t = tables.find(x => x.id === tpl.salaryTableId);
            if (t) return { table: t, future: false };
        }
        const day = cutoffDate(tpl, today);
        const key = t => t.validFrom || '0000-00-00';
        const valid = tables.filter(t => key(t) <= day).sort((a, b) => key(b).localeCompare(key(a)));
        if (valid.length) return { table: valid[0], future: false };
        return { table: tables.slice().sort((a, b) => key(a).localeCompare(key(b)))[0], future: true };
    }

    /**
     * Vorlage mit den tatsächlich geltenden Lohnklassen: Bei «gemäss Grundfunktion plus 1 max. 18»
     * kommen die Klassen aus der Grundfunktion (fest in der Vorlage oder pro Person gewählt).
     */
    function effectiveTemplate(tpl, templates, baseOverride) {
        const baseId = baseOverride || tpl.baseTemplateId;
        if (!baseId || baseId === tpl.id) return tpl;
        let base = (templates || []).find(t => t.id === baseId);
        if (!base) return tpl;
        if (base.baseTemplateId && base.baseTemplateId !== tpl.id) base = effectiveTemplate(base, templates.filter(t => t.id !== tpl.id));
        if (!base.classMin) return tpl;
        const d = +tpl.baseDelta || 0, cap = tpl.classCap || Infinity;
        return Object.assign({}, tpl, {
            classMin: Math.min(cap, base.classMin + d),
            classMax: Math.min(cap, (base.classMax || base.classMin) + d),
            baseName: base.name,
            baseId: base.id
        });
    }

    /** Stichwort im Text? Kurze Stichwörter (bis 3 Zeichen, z. B. «hf», «efz») nur als ganzes Wort; «a+b» = beide. */
    function keywordHit(text, kw) {
        return kw.split('+').map(k => k.trim().toLowerCase()).filter(Boolean).every(k =>
            k.length <= 3 ? new RegExp('(^|[^a-zäöüéèà0-9])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-zäöüéèà0-9])').test(text) : text.includes(k));
    }

    /**
     * Schlägt die passende Vorlage (Funktion) aus den Einträgen des Lebenslaufs vor.
     * Pro Vorlage zählt je Eintrag das spezifischste Stichwort. Am stärksten zählen die aktuelle
     * Tätigkeit und die jüngste Ausbildung (höchste Qualifikation), ältere Einträge weniger;
     * bei Tätigkeiten zählt zusätzlich die Dauer.
     * @returns {Array<{id, score, hits: Array<{title, keyword}>}>} absteigend sortiert, nur Treffer
     */
    function suggestTemplates(entries, templates) {
        const isEdu = e => e.category === '__ausbildung' || e.category === '__zweitausbildung';
        const endOf = e => e.ongoing ? 99999 : ymToIndex(e.end) || ymToIndex(e.start) || 0;
        const rankIn = list => new Map(list.slice().sort((a, b) => endOf(b) - endOf(a)).map((e, i) => [e, i]));
        const all = entries || [];
        const eduRank = rankIn(all.filter(isEdu)), workRank = rankIn(all.filter(e => !isEdu(e)));
        const weight = e => {
            if (isEdu(e)) return (eduRank.get(e) === 0 ? 2 : 0.8) * 1.5;
            const s = ymToIndex(e.start), en = e.ongoing ? null : ymToIndex(e.end);
            const months = s !== null && en !== null ? Math.max(1, en - s + 1) : e.ongoing && s !== null ? 60 : 12;
            const r = workRank.get(e);
            return (r === 0 ? 2.5 : r === 1 ? 1.2 : 0.8) * (1 + Math.min(months, 120) / 60);
        };
        const out = [];
        for (const t of templates || []) {
            const kws = (t.keywords || []).filter(k => String(k).trim());
            if (!kws.length) continue;
            let score = 0;
            const hits = [];
            for (const e of all) {
                const text = ' ' + ((e.title || '') + ' ' + (e.details || '')).toLowerCase() + ' ';
                const best = kws.filter(k => keywordHit(text, k)).sort((a, b) => b.replace(/\+/g, '').length - a.replace(/\+/g, '').length)[0];
                if (!best) continue;
                score += best.replace(/\+/g, '').length * weight(e);
                hits.push({ title: e.title, keyword: best });
            }
            if (score > 0) out.push({ id: t.id, score, hits });
        }
        return out.sort((a, b) => b.score - a.score);
    }

    const DEFAULT_ADJUSTMENTS = [
        { id: 'minus1', label: '−1 Klasse (z. B. fehlende Ausbildung für die Funktion)', delta: -1, cap: null },
        { id: 'plus1', label: '+1 Klasse', delta: 1, cap: null }
    ];

    function classify(title, details, categories) {
        const t = ' ' + (title || '').toLowerCase() + ' ';
        const d = ' ' + (details || '').toLowerCase() + ' ';
        let best = null, bestScore = 0, titleHit = false;
        for (const cat of categories) {
            let score = 0, hitTitle = false;
            for (const raw of cat.keywords) {
                const kw = raw.toLowerCase();
                if (!kw.trim()) continue;
                if (t.includes(kw)) { score = Math.max(score, kw.length * 2); hitTitle = true; }
                else if (d.includes(kw)) score = Math.max(score, kw.length);
            }
            if (score > bestScore) { bestScore = score; best = cat.id; titleHit = hitTitle; }
        }
        return { category: best, titleHit };
    }

    function detectPensum(text) {
        const m = text.match(/(?:pensum|anstellung|teilzeit|beschäftigungsgrad|arbeitspensum)?\s*(\d{1,3})\s*(?:-\s*\d{1,3}\s*)?%/i);
        if (m) {
            const v = +m[1];
            if (v >= 5 && v <= 100) return v;
        }
        return 100;
    }

    function cleanTitle(s) {
        return s.replace(/^[\s:|,;•·\-–—/()]+|[\s:|,;•·\-–—/(]+$/g, '').replace(/\s{2,}/g, ' ').trim();
    }

    function letters(s) {
        return (s.match(/\p{L}/gu) || []).length;
    }

    /** Extrahiert Einträge (Zeiträume mit Funktion) aus dem Lebenslauf-Text. */
    function extractEntries(text, settings, today) {
        settings = settings || DEFAULT_SETTINGS;
        today = today || new Date();
        const lines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim());
        const info = lines.map(l => ({ text: l, section: detectSection(l), ranges: l ? findRanges(l, today) : [] }));

        const entries = [];
        let section = 'unknown';
        for (let i = 0; i < info.length; i++) {
            const li = info[i];
            if (li.section) { section = li.section; continue; }
            if (!li.ranges.length || section === 'other') continue;

            const r = li.ranges[0];
            let title = cleanTitle(li.text.slice(0, r.index) + ' ' + li.text.slice(r.endIndex));
            // Datumsreste (z. B. zweiter Zeitraum) entfernen
            title = cleanTitle(title.replace(TOKEN_RE, ' '));
            const used = new Set([i]);

            const isBlock = j => j < 0 || j >= info.length || !info[j].text || info[j].section || info[j].ranges.length;
            if (letters(title) < 3) {
                // nächste Zeile (auch nach einer Leerzeile), sonst vorherige Zeile
                const next = info[i + 1] && !info[i + 1].text ? i + 2 : i + 1;
                if (!isBlock(next)) { title = info[next].text; used.add(next); for (let k = i + 1; k < next; k++) used.add(k); }
                else if (!isBlock(i - 1)) { title = info[i - 1].text; used.add(i - 1); }
            }
            const detailLines = [];
            for (let j = i + 1; j < info.length && detailLines.length < 3; j++) {
                if (used.has(j)) continue;
                if (isBlock(j)) break;
                detailLines.push(info[j].text);
            }
            const details = detailLines.join(' · ');

            const cls = classify(title, details, settings.categories.concat(SPECIAL_CATEGORIES));
            let category = cls.category || '__sonstige';
            // Praktikum hat Vorrang vor dem Fachgebiet (z. B. «Praktikum Heilpädagogische Schule»)
            if (/praktik|internship/i.test(title)) category = '__praktikum';
            let isEdu = section === 'education';
            if (!isEdu && section !== 'experience' && !cls.titleHit && EDU_RE.test(title)) isEdu = true;
            if (isEdu) category = '__ausbildung';

            entries.push({
                id: 'e' + Math.random().toString(36).slice(2, 9),
                include: !isEdu,
                start: ym(r.start),
                end: r.end ? ym(r.end) : '',
                ongoing: r.ongoing,
                title: title || '(ohne Bezeichnung)',
                details,
                category,
                pensum: detectPensum(li.text + ' ' + details),
                factorOverride: null,
                raw: li.text,
                imprecise: r.imprecise
            });
        }
        markSecondEducation(entries);
        return entries;
    }

    const VOCATIONAL_RE = /(lehre|lehrabschluss|efz|eba|studium|bachelor|master|diplom|\bhf\b|\bfh\b|höhere fachschule|fachhochschule|universität|hochschule|ausbildung (?:zur|zum|als))/i;

    /** Erste Lehre/erstes Studium bleibt Erstausbildung, spätere Berufsausbildungen werden Zweitausbildung. */
    function markSecondEducation(entries) {
        const edu = entries.filter(e => e.category === '__ausbildung' && VOCATIONAL_RE.test(e.title))
            .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
        const first = edu[0];
        if (!first) return;
        const firstEnd = first.ongoing ? '9999-12' : first.end;
        edu.slice(1).forEach(e => {
            if ((e.start || '') > firstEnd) { e.category = '__zweitausbildung'; e.include = true; }
        });
    }

    function ym(p) {
        return p.y + '-' + String(p.m).padStart(2, '0');
    }

    function ymToIndex(s) {
        const m = /^(\d{4})-(\d{2})$/.exec(s || '');
        return m ? (+m[1]) * 12 + (+m[2] - 1) : null;
    }

    /** Welche Regelgruppe einer Vorlage für einen Eintrag gilt. */
    function ruleKeyFor(entry, tpl) {
        if (entry.category === tpl.target) return 'same'; // Zielberuf kann auch z. B. «Assistenz-Einsatz» sein
        if (CATEGORY_RULE[entry.category]) return CATEGORY_RULE[entry.category];
        if ((tpl.related || []).includes(entry.category)) return 'related';
        return 'other';
    }

    /** Anrechnung eines Monats für diesen Eintrag in Prozent (0–100). */
    function weightFor(entry, tpl) {
        if (entry.factorOverride !== null && entry.factorOverride !== undefined && entry.factorOverride !== '') return Math.max(0, Math.min(100, +entry.factorOverride));
        const r = tpl.rules[ruleKeyFor(entry, tpl)] || { mode: 'flat', factor: 0 };
        const pensum = Math.max(0, Math.min(100, +entry.pensum || 0));
        switch (r.mode) {
            case 'pensum': return r.factor * pensum / 100;
            case 'threshold': return pensum > 50 ? r.factor : +r.low;
            default: return +r.factor;
        }
    }

    /** Text zur Regel, z. B. «bis 50 %: 50 %, über 50 %: 100 %». */
    function describeRule(r) {
        const f = x => (Math.round(x * 10) / 10).toString().replace('.', ',');
        if (!r) return '–';
        if (r.mode === 'pensum') return `${f(r.factor)} % vom Pensum`;
        if (r.mode === 'threshold') return `Pensum bis 50 %: ${f(r.low)} %, über 50 %: ${f(r.factor)} %`;
        return `${f(r.factor)} %`;
    }

    function roundYears(y, mode) {
        switch (mode) {
            case 'down': return Math.floor(y + 1e-9);
            case 'nearest': return Math.round(y);
            case 'half-down': return Math.floor(y * 2 + 1e-9) / 2;
            default: return y;
        }
    }

    const NOT_WORK = new Set(['__ausbildung', '__zweitausbildung', '__familie']);

    /** Letzter Monat, der gezählt wird: heute oder Dezember des laufenden Jahres (Stichtag 31.12.). */
    function cutoffIndex(tpl, today) {
        return tpl.cutoff === 'yearEnd' ? today.getFullYear() * 12 + 11 : today.getFullYear() * 12 + today.getMonth();
    }

    /**
     * Berechnet die anrechenbaren Jahre nach den Regeln einer Vorlage.
     * Überschneidende Zeiträume werden nie doppelt gezählt: Pro Monat zählt die höchste Anrechnung
     * (combine 'max') oder die Summe aller Anrechnungen bis höchstens 100 % (combine 'sum').
     * Reihenfolge: Mindestalter → Obergrenze Familienarbeit → Maximum → Rundung.
     * @param {Array} entries
     * @param {object} tpl     Vorlage (target, rules, Grenzen, Rundung, Stichtag)
     * @param {Date}  [today]
     * @param {object} [opts]  { birth: 'YYYY-MM' }
     */
    function compute(entries, tpl, today, opts) {
        today = today || new Date();
        opts = opts || {};
        const target = tpl.target;
        const nowIdx = cutoffIndex(tpl, today);
        const birthIdx = ymToIndex(opts.birth);
        const minIdx = birthIdx !== null && tpl.minAge ? birthIdx + Math.round(tpl.minAge * 12) : null;
        const familyCap = tpl.familyMaxYears ? Math.round(tpl.familyMaxYears * 12) : Infinity;
        const months = new Map(); // idx -> [{i, w, cat}]
        const perEntry = entries.map(() => ({ months: 0, credited: 0, factor: 0, valid: false, ruleKey: '' }));

        entries.forEach((e, i) => {
            const s = ymToIndex(e.start);
            let en = e.ongoing ? nowIdx : ymToIndex(e.end);
            const f = weightFor(e, tpl);
            perEntry[i].factor = Math.round(f * 10) / 10;
            perEntry[i].ruleKey = ruleKeyFor(e, tpl);
            if (s === null || en === null) return;
            en = Math.min(en, nowIdx);
            if (en < s) return;
            perEntry[i].valid = true;
            perEntry[i].months = en - s + 1;
            if (!e.include) return;
            for (let k = s; k <= en; k++) {
                if (!months.has(k)) months.set(k, []);
                months.get(k).push({ i, w: f / 100, cat: e.category });
            }
        });

        let totalMonths = 0, targetMonths = 0, credited = 0, beforeMinAge = 0, familyUsed = 0, familyCapped = false;
        const perCategory = {};
        for (const k of [...months.keys()].sort((a, b) => a - b)) {
            let list = months.get(k);
            const work = list.filter(x => !NOT_WORK.has(x.cat));
            if (work.length) totalMonths++;
            if (target && list.some(x => x.cat === target)) targetMonths++;
            for (const cat of new Set(list.filter(x => x.cat !== '__ausbildung').map(x => x.cat))) perCategory[cat] = (perCategory[cat] || 0) + 1;

            if (minIdx !== null && k < minIdx) { if (list.some(x => x.w > 0)) beforeMinAge++; continue; }
            if (familyUsed >= familyCap && list.some(x => x.cat === '__familie' && x.w > 0)) {
                familyCapped = true;
                list = list.filter(x => x.cat !== '__familie');
                if (!list.length) continue;
            }

            list.sort((a, b) => b.w - a.w);
            let usedFamily = false;
            if (tpl.combine === 'sum') {
                let left = 1;
                for (const x of list) {
                    const take = Math.min(left, x.w);
                    if (take <= 0) break;
                    perEntry[x.i].credited += take;
                    if (x.cat === '__familie') usedFamily = true;
                    left -= take;
                }
                credited += 1 - left;
            } else if (list[0].w > 0) {
                const w = Math.min(1, list[0].w);
                perEntry[list[0].i].credited += w;
                if (list[0].cat === '__familie') usedFamily = true;
                credited += w;
            }
            if (usedFamily) familyUsed++;
        }

        const exactYears = credited / 12;
        let creditedYears = exactYears;
        let capped = false;
        if (tpl.maxYears && creditedYears > tpl.maxYears) { creditedYears = +tpl.maxYears; capped = true; }
        const beforeRounding = creditedYears;
        creditedYears = roundYears(creditedYears, tpl.rounding);

        return {
            totalYears: totalMonths / 12,
            targetYears: targetMonths / 12,
            otherYears: (totalMonths - targetMonths) / 12,
            exactYears,
            beforeRounding,
            creditedYears,
            capped,
            rounded: creditedYears !== beforeRounding,
            beforeMinAgeYears: beforeMinAge / 12,
            minAgeMonth: minIdx,
            cutoffMonth: nowIdx,
            familyCapped,
            perEntry,
            perCategory
        };
    }

    /**
     * Lohneinreihung aus den anrechenbaren Jahren: Start in der tiefsten Lohnklasse der Funktion,
     * pro Erfahrungsjahr eine Lohnstufe (höchstens so viele, wie die Gehaltstabelle hat, ohne Tabelle 10), Aufstieg in die nächste Klasse nach den Jahren in
     * classUpYears (bis zur höchsten Klasse der Funktion), danach Korrektur (z. B. −1 ohne Ausbildung).
     * @returns {null | {years, cls, stage, maxStage, baseCls, ups, adjustment, salary, lesson, hour}}
     */
    function placement(years, tpl, adjustment, salaryTable) {
        if (!tpl.classMin) return null;
        const y = Math.max(0, Math.floor(years + 1e-9));
        const max = tpl.classMax || tpl.classMin;
        const ups = (tpl.classUpYears || []).filter(n => y >= n).length;
        let cls = Math.min(max, tpl.classMin + ups);
        const adj = adjustment || { delta: 0, cap: null };
        cls += adj.delta || 0;
        if (adj.cap && adj.delta > 0) cls = Math.min(cls, adj.cap);
        const row = salaryTable && salaryTable.classes ? salaryTable.classes[cls] : null;
        const maxStage = row ? row.length : salaryTable && salaryTable.classes && Object.keys(salaryTable.classes).length
            ? Math.max(...Object.values(salaryTable.classes).map(r => r.length)) : 10;
        const stage = Math.min(maxStage, y + 1);
        const pick = m => m && m[cls] && m[cls][stage - 1] != null ? m[cls][stage - 1] : null;
        return { years: y, cls, stage, maxStage, baseCls: tpl.classMin, ups, adjustment: adj,
            salary: row && row[stage - 1] != null ? row[stage - 1] : null,
            lesson: pick(salaryTable && salaryTable.lessons), hour: pick(salaryTable && salaryTable.hours) };
    }

    /** Zahl aus einer Tabellenzelle: 85432, «85'432.50», «CHF 85 432», «85.432,50». Sonst null. */
    function parseAmount(v) {
        if (typeof v === 'number') return isFinite(v) ? v : null;
        let t = String(v ?? '').replace(/chf|fr\.|sfr/gi, '').replace(/['’\s ]/g, '');
        if (!/^-?[\d.,]+$/.test(t)) return null;
        const dot = t.lastIndexOf('.'), comma = t.lastIndexOf(',');
        if (dot >= 0 && comma >= 0) {
            const dec = dot > comma ? '.' : ',';
            t = t.split(dec === '.' ? ',' : '.').join('').replace(',', '.');
        } else if (comma >= 0) {
            t = /,\d{3}$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
        } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
            t = t.replace(/\./g, '');
        }
        const n = parseFloat(t);
        return isFinite(n) ? n : null;
    }

    /** Zerlegt CSV/Text aus Excel (Trennzeichen ; Tab oder , – wird erkannt) in Zeilen und Zellen. */
    function parseCsv(text) {
        const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
        const sample = lines.slice(0, 5).join('\n');
        const count = ch => sample.split(ch).length - 1;
        const sep = count('\t') ? '\t' : count(';') ? ';' : ',';
        return lines.map(line => {
            const cells = [];
            let cur = '', q = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (q) {
                    if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
                    else if (ch === '"') q = false;
                    else cur += ch;
                } else if (ch === '"') q = true;
                else if (ch === sep) { cells.push(cur); cur = ''; }
                else cur += ch;
            }
            cells.push(cur);
            return cells.map(c => c.trim());
        });
    }

    const CLASS_LABEL = /^\s*(?:lohnklasse|lk|klasse)?\s*(\d{1,2})\s*$/i;

    const ANNUAL_LABEL = /jahres/i;
    const LESSON_LABEL = /lektion/i;
    const HOUR_LABEL = /stunde/i;
    const OTHER_LABEL = /monat|auszahl|auzahl|zahlung|stunde|lektion|tag|woche|zulage|%/i;

    /**
     * Zeilen mit Lohnklasse in der ersten Zelle und Löhnen danach → {klasse: [Stufe 1, 2, …]}.
     * Hat eine Klasse mehrere Zeilen (Jahreslohn, Monatslohn, pro Stunde …), zählt «Jahreslohn»;
     * Zeilen «pro Lektion» / «pro Stunde» (auch ohne Klassennummer direkt darunter) werden separat
     * gesammelt, andere (z. B. «13 Auszahlungen») übersprungen.
     */
    function salaryRows(rows) {
        const classes = {}, annual = {}, lessons = {}, hours = {};
        let current = null;
        for (const row of rows) {
            const m = CLASS_LABEL.exec(String(row[0] ?? ''));
            const rest = m ? row.slice(1) : row;
            const label = rest.filter(c => String(c ?? '').trim() !== '' && parseAmount(c) === null).join(' ');
            const values = rest.map(parseAmount).filter(n => n !== null && n > 0);
            if (m && !OTHER_LABEL.test(label)) current = +m[1];
            else if (!m && !label) { current = null; continue; }
            if (current === null || !values.length) continue;
            if (LESSON_LABEL.test(label)) { if (!lessons[current]) lessons[current] = values; continue; }
            if (HOUR_LABEL.test(label)) { if (!hours[current]) hours[current] = values; continue; }
            if (!m || OTHER_LABEL.test(label)) continue;
            if (values.some(n => n < 100)) continue;
            const isAnnual = ANNUAL_LABEL.test(label);
            if (classes[current] && (annual[current] || !isAnnual)) continue;
            classes[current] = values.map(n => Math.round(n * 100) / 100);
            annual[current] = isAnnual;
        }
        for (const k of Object.keys(lessons)) if (!classes[k]) delete lessons[k];
        for (const k of Object.keys(hours)) if (!classes[k]) delete hours[k];
        return { classes, lessons, hours };
    }

    /**
     * Gehaltstabelle aus Tabellenzeilen (Excel, CSV oder PDF): pro Zeile eine Lohnklasse
     * (erste Zelle z. B. «12» oder «LK 12»), danach die Jahreslöhne der Stufen 1, 2, 3 …
     * Kopf- und Leerzeilen werden übersprungen. Stehen die Stufen in den Zeilen («Stufe 1», …)
     * oder die Lohnklassen im Kopf («LK 1», «LK 2», …), wird die Tabelle gedreht.
     * @returns {{id, name, validFrom, classes, lessons, hours, note, monthly: boolean} | null}
     */
    function parseSalaryTable(rows, name) {
        rows = (rows || []).map(r => Array.isArray(r) ? r : []);
        const stageRows = rows.filter(r => /^\s*stufe\s*\d+\s*$/i.test(String(r[0] ?? ''))).length;
        const classHeader = rows.some(r => r.slice(1).filter(c => /^\s*(?:lohnklasse|lk|klasse)\s*\d{1,2}\s*$/i.test(String(c ?? ''))).length >= 2);
        let parsed;
        if (stageRows >= 2 || classHeader) {
            const width = Math.max(0, ...rows.map(r => r.length));
            parsed = salaryRows(Array.from({ length: width }, (_, j) => rows.map(r => r[j] ?? '')));
        } else {
            parsed = salaryRows(rows);
        }
        const classes = parsed.classes;
        const all = Object.values(classes).flat().sort((a, b) => a - b);
        if (!all.length) return null;
        // Löhne unter 20'000 sind kaum Jahreslöhne → vermutlich Monatslöhne
        const monthly = all[Math.floor(all.length / 2)] < 20000;
        // «Stand: 01.01.2026» oder «gültig ab 1.1.2026» → Gültigkeitsbeginn
        const date = /(?:stand|gültig\s+ab|gültig\s+per|per)\s*:?\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/i.exec(rows.map(r => r.join(' ')).join('\n'));
        const validFrom = date ? `${date[3]}-${date[2].padStart(2, '0')}-${date[1].padStart(2, '0')}` : null;
        return Object.assign(normalizeSalaryTable({ name, validFrom, classes, lessons: parsed.lessons, hours: parsed.hours }), { monthly });
    }

    /**
     * Plausibilitätsprüfung einer Gehaltstabelle (findet Lesefehler, z. B. aus PDFs).
     * @returns {string[]} Warnungen, leer wenn alles plausibel ist
     */
    function checkSalaryTable(t) {
        const out = [];
        const cls = Object.keys(t.classes || {}).map(Number).sort((a, b) => a - b);
        if (!cls.length) return ['Die Tabelle enthält keine Lohnklassen.'];
        const missing = [];
        for (let k = cls[0]; k <= cls[cls.length - 1]; k++) if (!t.classes[k]) missing.push(k);
        if (missing.length) out.push(`Lohnklasse${missing.length > 1 ? 'n' : ''} ${missing.join(', ')} fehl${missing.length > 1 ? 'en' : 't'}.`);
        const lengths = cls.map(k => t.classes[k].length);
        const common = lengths.slice().sort((a, b) => lengths.filter(x => x === b).length - lengths.filter(x => x === a).length)[0];
        cls.forEach(k => { if (t.classes[k].length !== common) out.push(`LK ${k} hat ${t.classes[k].length} Stufen, die übrigen ${common}.`); });
        const rising = (label, m) => {
            for (const k of Object.keys(m || {}).map(Number).sort((a, b) => a - b)) {
                const row = m[k];
                for (let i = 1; i < row.length; i++) {
                    if (!(row[i] > row[i - 1])) { out.push(`LK ${k}${label}: Stufe ${i + 1} (${row[i]}) ist nicht höher als Stufe ${i} (${row[i - 1]}).`); break; }
                }
            }
        };
        rising('', t.classes);
        rising(' pro Lektion', t.lessons);
        rising(' pro Stunde', t.hours);
        for (let i = 1; i < cls.length; i++) {
            const a = t.classes[cls[i - 1]][0], b = t.classes[cls[i]][0];
            if (cls[i] === cls[i - 1] + 1 && !(b > a)) out.push(`LK ${cls[i]} Stufe 1 ist nicht höher als LK ${cls[i - 1]} Stufe 1.`);
        }
        return out;
    }

    const BIRTH_RE = /(?:geburtsdatum|geb\.|geboren(?:\s+am)?|jahrgang|date of birth|birth ?date|born|date de naissance|né(?:e)? le)\s*:?\s*(?:(\d{1,2})\.\s?(\d{1,2})\.\s?((?:19|20)\d{2})|(\d{1,2})[./-]((?:19|20)\d{2})|((?:19|20)\d{2}))/i;

    /** Sucht das Geburtsdatum im Text. Gibt 'YYYY-MM' oder '' zurück. */
    function extractBirth(text) {
        const m = BIRTH_RE.exec(text || '');
        if (!m) return '';
        if (m[3]) return m[3] + '-' + String(+m[2]).padStart(2, '0');
        if (m[5]) return m[5] + '-' + String(+m[4]).padStart(2, '0');
        return m[6] + '-01';
    }

    DEFAULT_SETTINGS.templates = DEFAULT_SETTINGS.categories.map(c => Object.assign(makeTemplate(c.id, c.name), { id: 't_' + c.id }));

    DEFAULT_SETTINGS.classAdjustments = DEFAULT_ADJUSTMENTS.map(x => Object.assign({}, x));
    DEFAULT_SETTINGS.salaryTables = [];

    const api = { extractEntries, extractBirth, findRanges, tokenize, classify, compute, placement, weightFor, ruleKeyFor, describeRule, roundYears, detectSection, ymToIndex, normalizeSettings, makeTemplate, parseAmount, parseCsv, parseSalaryTable, checkSalaryTable, normalizeSalaryTable, selectSalaryTable, cutoffDate, effectiveTemplate, suggestTemplates, keywordHit, upgradeTemplate, DEFAULT_SETTINGS, SPECIAL_CATEGORIES, TARGETABLE_SPECIALS, ROUNDING, MODES, RULE_KEYS };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.CVParser = api;
})(typeof self !== 'undefined' ? self : this);
