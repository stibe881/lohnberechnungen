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
            fixedAnnual: null,     // fixer Jahreslohn bei 100 % statt Lohnklasse (z. B. Praktikum)
            group: '',             // Abschnitt im Einreihungsplan (z. B. «Führungsebene 1»), für die Übersicht
            allowances: []         // Zulagen: [{id, label, annual (CHF/Jahr bei 100 %), autoKeywords (Ausbildung, bei der sie vorgeschlagen wird)}]
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
        out.allowances = (Array.isArray(out.allowances) ? out.allowances : []).filter(a => a && a.label).map((a, i) => ({
            id: a.id || 'z' + (i + 1), label: String(a.label), annual: Math.max(0, +a.annual || 0),
            autoKeywords: Array.isArray(a.autoKeywords) ? a.autoKeywords.map(k => String(k).toLowerCase().trim()).filter(Boolean) : []
        }));
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
        const out = { categories: [], templates: [], classAdjustments: [], salaryTables: [], retentionDays: null };
        if (s.retentionDays !== null && s.retentionDays !== undefined && s.retentionDays !== '' && +s.retentionDays >= 0) out.retentionDays = Math.round(+s.retentionDays);
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
        out.classAdjustments = (Array.isArray(s.classAdjustments) ? s.classAdjustments : DEFAULT_ADJUSTMENTS).map(normalizeAdjustment);
        out.positions = (Array.isArray(s.positions) ? s.positions : []).filter(p => p && p.title).map(normalizePosition);
        out.retentionByStatus = {};
        for (const st of STATUSES) {
            const v = s.retentionByStatus && s.retentionByStatus[st.id];
            if (v !== null && v !== undefined && v !== '' && +v >= 0) out.retentionByStatus[st.id] = Math.round(+v);
        }
        out.fourEyes = !!s.fourEyes;
        // Kopf- und Fusszeile der Druckausgaben (Bericht, Lohnblatt)
        const pr = s.print || {};
        out.print = { org: String(pr.org || '').slice(0, 120), footer: String(pr.footer || '').slice(0, 400), logo: /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/.test(pr.logo || '') && pr.logo.length < 400000 ? pr.logo : '' };
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
        text = fold(text);
        return kw.split('+').map(k => fold(k.trim().toLowerCase())).filter(Boolean).every(k =>
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
        { id: 'minus1', label: '−1 Klasse (z. B. fehlende Ausbildung für die Funktion)', delta: -1, cap: null, auto: { kind: 'missingQualification' } },
        { id: 'plus1', label: '+1 Klasse', delta: 1, cap: null }
    ];

    /** Bearbeitungsstand einer Bewerbung (Reihenfolge = Ablauf). */
    const STATUSES = [
        { id: 'neu', name: 'Neu' },
        { id: 'geprueft', name: 'Geprüft' },
        { id: 'angebot', name: 'Angebot' },
        { id: 'eingestellt', name: 'Eingestellt' },
        { id: 'abgesagt', name: 'Abgesagt' }
    ];

    /** Regeln, nach denen eine Korrektur automatisch vorgeschlagen wird. */
    const AUTO_KINDS = [
        { id: '', name: 'nicht automatisch' },
        { id: 'missingQualification', name: 'wenn keine passende Ausbildung erkannt wird' },
        { id: 'foreignDiploma', name: 'bei Ausbildung im Ausland' },
        { id: 'leadershipTraining', name: 'bei Führungsausbildung (optional mit Mindestjahren Führung)' }
    ];

    function normalizeAdjustment(a, i) {
        const auto = a.auto && AUTO_KINDS.some(k => k.id === a.auto.kind && k.id) ? {
            kind: a.auto.kind,
            minYears: +a.auto.minYears > 0 ? +a.auto.minYears : null,
            prefix: String(a.auto.prefix || '').trim()   // nur Funktionen, deren Name so beginnt (mehrere mit Komma)
        } : null;
        return { id: a.id || 'k' + (i + 1), label: String(a.label || 'Korrektur'), delta: Math.round(+a.delta) || 0, cap: a.cap ? +a.cap : null, auto };
    }

    function normalizePosition(p, i) {
        return {
            id: p.id || 'p_' + Math.random().toString(36).slice(2, 9),
            title: String(p.title).trim(),
            templateId: p.templateId || '',
            pensum: Math.max(1, Math.min(100, +p.pensum || 100)),
            lessons: +p.lessons > 0 ? +p.lessons : null,
            start: /^\d{4}-\d{2}-\d{2}$/.test(p.start || '') ? p.start : null,
            status: ['offen', 'besetzt', 'geschlossen'].includes(p.status) ? p.status : 'offen',
            note: String(p.note || '')
        };
    }

    /** Umlaute und «ae/oe/ue» gleich behandeln («Sozialpaedagogin» = «Sozialpädagogin»). */
    const fold = s => s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');

    // Ein Treffer in der Funktionsbezeichnung schlägt immer einen Treffer beim Arbeitgeber; innerhalb
    // der Zeile zählt der Teil vor dem ersten Komma («Koch, Altersheim Baar» ist Koch, nicht Betreuung).
    const TITLE_BONUS = 1000;
    const FUNCTION_PART = /^(.*?)(?:,|\s[–-]\s|\s\|\s|\s\(|\sbei\s|\sim\s|\sin der\s|\sat\s|$)/i;

    function classify(title, details, categories) {
        const f = fold(' ' + ((FUNCTION_PART.exec((title || '').toLowerCase()) || [])[1] || '') + ' ');
        const t = fold(' ' + (title || '').toLowerCase() + ' ');
        const d = fold(' ' + (details || '').toLowerCase() + ' ');
        let best = null, bestScore = 0, titleHit = false;
        for (const cat of categories) {
            let score = 0, hitTitle = false;
            for (const raw of cat.keywords) {
                const kw = fold(raw.toLowerCase());
                if (!kw.trim()) continue;
                if (kw.includes('+')) {
                    // «a+b»: beide Teile im gleichen Eintrag, zählt wie ein langes Stichwort
                    const len = kw.replace(/\+/g, '').length;
                    if (!keywordHit(t + d, kw)) continue;
                    const inTitle = keywordHit(t, kw.split('+')[0]); // Hauptteil in der Funktionsbezeichnung
                    const inFunction = keywordHit(f, kw.split('+')[0]);
                    score = Math.max(score, inFunction ? 2 * TITLE_BONUS + len * 2 : inTitle ? TITLE_BONUS + len * 2 : len);
                    if (inTitle) hitTitle = true;
                    continue;
                }
                if (f.includes(kw)) { score = Math.max(score, 2 * TITLE_BONUS + kw.length * 2); hitTitle = true; }
                else if (t.includes(kw)) { score = Math.max(score, TITLE_BONUS + kw.length * 2); hitTitle = true; }
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

    /**
     * Schweizer Geldformat: «CHF 87’450.–» für ganze Franken, sonst «CHF 87’450.50».
     * Tausender mit Apostroph (’), Rappen mit Punkt.
     */
    function formatChf(v, opts) {
        opts = opts || {};
        const n = Math.round((+v || 0) * 100) / 100;
        const neg = n < 0;
        const abs = Math.abs(n);
        const whole = Math.floor(abs + 1e-9);
        const cents = Math.round((abs - whole) * 100);
        const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, '’');
        const dec = cents === 0 ? '.–' : '.' + String(cents).padStart(2, '0');
        return (opts.plain ? '' : 'CHF ') + (neg ? '−' : '') + grouped + dec;
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

    // --- Korrekturen vorschlagen, Zulagen, Lohnentwicklung, Doppelbewerbungen ---

    const isEducation = e => e.category === '__ausbildung' || e.category === '__zweitausbildung';
    const entryText = e => fold(' ' + ((e.title || '') + ' ' + (e.details || '')).toLowerCase() + ' ');
    // Text ist mit fold() umgewandelt (ä → ae …), daher nur Schreibweisen ohne Umlaute
    const FOREIGN_RE = /\b(deutschland|germany|oesterreich|austria|frankreich|france|italien|italia|italy|spanien|spain|portugal|polen|poland|kosovo|serbien|kroatien|bosnien|albanien|mazedonien|tuerkei|turkey|niederlande|belgien|ungarn|rumaenien|ukraine|russland|usa|united states|england|united kingdom|brasilien|indien|wien|graz|innsbruck|salzburg|linz|berlin|hamburg|muenchen|koeln|frankfurt am main|stuttgart|dresden|leipzig|mailand|milano|roma|paris|lyon|strasbourg|madrid|barcelona|lissabon|lisboa|porto|warschau|zagreb|belgrad|pristina|sarajevo|budapest|bukarest|london)\b/i;
    const LEAD_TRAINING_RE = /(führung|fuehrung|leadership|management|leitungs|mba\b|cas .*leit|mas .*leit|sve\b|institutionsleit|heimleit|teamleiter(in)? mit|führungsfach|fuehrungsfach|betriebswirtschaft)/i;
    const LEAD_WORK_RE = /(leiter|leiterin|leitung|führung|fuehrung|head of|chef|manager|direktor|direktorin|geschäftsführ|geschaeftsfuehr|vorgesetzt)/i;

    /** Jahre in Führungsfunktionen (überlappende Stellen zählen nur einmal). */
    function leadershipYears(entries, today) {
        const nowIdx = (today || new Date()).getFullYear() * 12 + (today || new Date()).getMonth();
        const months = new Set();
        for (const e of entries || []) {
            if (isEducation(e) || e.include === false || !LEAD_WORK_RE.test(e.title || '')) continue;
            const s = ymToIndex(e.start), en = e.ongoing ? nowIdx : ymToIndex(e.end);
            if (s === null || en === null) continue;
            for (let k = s; k <= Math.min(en, nowIdx); k++) months.add(k);
        }
        return months.size / 12;
    }

    /**
     * Schlägt Korrekturen der Lohnklasse vor, deren Regel (auto) im Lebenslauf zutrifft:
     * fehlende Ausbildung für die Funktion, Ausbildung im Ausland, Führungsausbildung (+ Mindestjahre Führung).
     * flags (optional, von Claude) übersteuern die eigene Erkennung.
     * @returns {Array<{id, label, delta, reason}>} stärkste zuerst; bei Führung nur die höchste passende
     */
    function suggestCorrections(entries, tpl, adjustments, flags, today) {
        const edu = (entries || []).filter(isEducation);
        const out = [];
        flags = flags || {};
        const applies = a => !a.auto.prefix || a.auto.prefix.split(',').map(x => x.trim()).filter(Boolean).some(p => (tpl.name || '').startsWith(p));
        for (const a of (adjustments || []).filter(x => x.auto && x.auto.kind)) {
            if (!applies(a)) continue;
            if (a.auto.kind === 'missingQualification') {
                const kws = (tpl.keywords || []).filter(Boolean);
                if (!kws.length) continue;
                const ok = typeof flags.qualificationMatches === 'boolean' ? flags.qualificationMatches : edu.some(e => kws.some(k => keywordHit(entryText(e), k)));
                if (!ok) out.push({ id: a.id, label: a.label, delta: a.delta, reason: edu.length ? `Keine Ausbildung gefunden, die zur Funktion «${tpl.name}» passt` : 'Keine Ausbildung im Lebenslauf erkannt' });
            } else if (a.auto.kind === 'foreignDiploma') {
                const hit = edu.find(e => FOREIGN_RE.test(entryText(e)));
                if (flags.foreignDiploma === true || (flags.foreignDiploma !== false && hit)) out.push({ id: a.id, label: a.label, delta: a.delta, reason: hit ? `Ausbildung im Ausland: «${hit.title}» – prüfen, ob in der Schweiz anerkannt` : 'Ausbildung im Ausland – Anerkennung prüfen' });
            } else if (a.auto.kind === 'leadershipTraining') {
                const training = edu.find(e => LEAD_TRAINING_RE.test(entryText(e)));
                const hasTraining = typeof flags.leadershipTraining === 'boolean' ? flags.leadershipTraining : !!training;
                const years = typeof flags.leadershipYears === 'number' ? flags.leadershipYears : leadershipYears(entries, today);
                if (!hasTraining || (a.auto.minYears && years < a.auto.minYears)) continue;
                out.push({ id: a.id, label: a.label, delta: a.delta, lead: true,
                    reason: (training ? `Führungsausbildung «${training.title}»` : 'Führungsausbildung') + (a.auto.minYears ? `, ${Math.round(years * 10) / 10} Jahre Führungserfahrung (mind. ${a.auto.minYears})` : '') });
            }
        }
        // Von mehreren Führungs-Korrekturen nur die höchste
        const lead = out.filter(x => x.lead).sort((x, y) => y.delta - x.delta)[0];
        return out.filter(x => !x.lead || x === lead).map(({ lead: _, ...x }) => x).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
    }

    /** Zulagen einer Funktion, die aufgrund der Ausbildung vorgeschlagen werden (autoKeywords). */
    function suggestedAllowances(tpl, entries) {
        const edu = (entries || []).filter(isEducation);
        return (tpl.allowances || []).filter(a => a.autoKeywords.length && edu.some(e => a.autoKeywords.some(k => keywordHit(entryText(e), k)))).map(a => a.id);
    }

    /**
     * Lohnentwicklung der nächsten Jahre: pro Kalenderjahr ein Erfahrungsjahr mehr (Stufenaufstieg auf den
     * 1. Januar), mit Klassenaufstieg und der Gehaltstabelle, die im jeweiligen Jahr gilt (sonst die neueste).
     * @returns {Array<{year, years, cls, stage, salary}>}
     */
    function salaryOutlook(creditedYears, tpl, adjustment, tables, today, count) {
        today = today || new Date();
        const rows = [];
        for (let k = 0; k <= (count || 10); k++) {
            const year = today.getFullYear() + k;
            const sel = selectSalaryTable(tables, Object.assign({}, tpl, { cutoff: 'today' }), new Date(year, 0, 1));
            const pl = placement(creditedYears + k, tpl, adjustment, sel.table);
            if (!pl) return [];
            rows.push({ year, years: pl.years, cls: pl.cls, stage: pl.stage, salary: pl.salary });
        }
        return rows;
    }

    /** Mögliche Doppelbewerbungen: gleicher Name und gleiches (oder fehlendes) Geburtsdatum. */
    function findDuplicates(list) {
        const key = n => fold(String(n || '').toLowerCase()).replace(/[^a-z]+/g, ' ').trim().split(' ').sort().join(' ');
        const groups = new Map();
        for (const c of list || []) {
            const k = key(c.name);
            if (!k || /^(unbenannt|eingefuegter text)$/.test(k)) continue;
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(c);
        }
        const out = new Map();
        for (const g of groups.values()) {
            for (const a of g) {
                const others = g.filter(b => b !== a && (!a.birth || !b.birth || a.birth === b.birth)).map(b => b.id);
                if (others.length) out.set(a.id, others);
            }
        }
        return out;
    }

    // --- Besoldungsreglement / Einreihungsplan einlesen ---

    const STOP_WORDS = new Set(['mit', 'ohne', 'und', 'oder', 'der', 'die', 'das', 'für', 'von', 'bzw', 'gemäss', 'stufe', 'mitarbeiter', 'mitarbeitende', 'mitarbeiterin', 'höherer', 'höhere', 'ausbildung', 'fachausbildung', 'funktion', 'zyklus', 'leitung']);
    /** Stichwörter aus einem Funktionsnamen, z. B. «Dipl. Sozialpädagog*in (HF/FH)» → sozialpädagog, hf, fh. */
    function keywordsFromName(name) {
        const words = name.toLowerCase().replace(/\*(?:in|innen|r|e)\b/g, '').replace(/\(([^)]*)\)/g, ' $1 ').split(/[^a-zäöüéèà]+/).filter(Boolean);
        const out = new Set();
        for (const w of words) {
            if (['efz', 'eba', 'hf', 'fh', 'uni'].includes(w)) continue;
            if (w.length >= 5 && !STOP_WORDS.has(w)) out.add(w.replace(/(?:innen|in|en|e)$/, ''));
        }
        const degree = ['efz', 'eba', 'hf', 'fh'].filter(d => new RegExp('\\b' + d + '\\b').test(name.toLowerCase()));
        const main = [...out][0];
        if (main) degree.forEach(d => out.add(main + '+' + d));
        return [...out].filter(k => k.length >= 4);
    }

    /**
     * Liest den Einreihungsplan aus dem Text eines Besoldungsreglements (ohne KI). Erwartet eine Tabelle
     * «Nr. | Funktion | Lohnklasse | Zulagen» (Spalten durch mehrere Leerzeichen getrennt, wie pdf.js sie liefert):
     * «5.1 Dipl. Sozialpädagog*in (HF/FH)   11 - 13», «gemäss Grundfunktion plus 1 max. 18», «CHF 30'054.00/Jahr».
     * Dazu Klassenaufstieg («12. und 24. Dienstjahr»), Stichtag 31.12. und 13. Monatslohn.
     * @returns {{functions: Array, classUpYears: number[]|null, cutoff: string|null, payments: number|null}}
     */
    function parseRegulationText(text) {
        const t = String(text || '').replace(/\r/g, '');
        const head = t.search(/Nr\.?\s+Funktion\s+Lohnklasse/i);
        let body = head >= 0 ? t.slice(head) : t;
        const footnotes = {};
        for (const m of body.matchAll(/(?:^|\n)\s*(\d)\)\s+([^\n]+)/g)) footnotes[m[1]] = m[2].trim();
        const endAt = body.search(/\n\s*\d\)\s+\S|\n\s*\d+\s+Zulagen\s*\n|\nNr\.?\s+Zulage/);
        if (endAt > 0) body = body.slice(0, endAt);
        const lines = body.split('\n');
        const functions = [];
        // Abschnittstitel («1.   Führungsebene 1 (Geschäftsleitung)» oder über drei Zeilen «Pädagogische … / 5. / Funktionen»)
        const sections = {};
        lines.forEach((l, i) => {
            let m = /^\s*(\d{1,2})\.\s{2,}(\S.*)$/.exec(l);
            if (m) { sections[m[1]] = m[2].split(/\s{3,}/)[0].trim(); return; }
            m = /^\s*(\d{1,2})\.\s*$/.exec(l);
            if (m) sections[m[1]] = [lines[i - 1], lines[i + 1]].map(x => (x || '').split(/\s{3,}/)[0].trim()).filter(x => x && !/^Nr\.?\s/.test(x)).join(' ');
        });
        const joinPart = (a, b) => /[A-Za-zäöü]-$/.test(a) && /^[a-zäöü]/.test(b) ? a.slice(0, -1) + b : a + ' ' + b;
        const isNoise = l => !l.trim() || /^\s*\d{1,3}\s*$/.test(l) || /^\s*Nr\.?\s/.test(l);
        const isSection = (l, next) => /^\s*\d{1,2}\.(\s{2,}\S|\s*$)/.test(l) || (next !== undefined && /^\s*\d{1,2}\.\s*$/.test(next));
        for (let i = 0; i < lines.length; i++) {
            const m = /^\s*(\d{1,2}\.\d{1,2})\s+(.*)$/.exec(lines[i]);
            if (!m) continue;
            const cols = m[2].split(/\s{3,}/).map(c => c.trim()).filter(Boolean);
            let name = cols[0] || '', pay = cols[1] || '', extra = cols.slice(2).join(' ');
            const notes = [];
            for (let j = i + 1; j < lines.length && !/^\s*\d{1,2}\.\d{1,2}\s/.test(lines[j]); j++) {
                const l = lines[j].trim();
                if (isNoise(lines[j])) continue;
                if (isSection(lines[j], lines[j + 1])) break;
                if (/^(?:tion\b|plus\b|max\.?\s*\d)/i.test(l) || (/-$/.test(pay) && !/-$/.test(name))) pay = joinPart(pay, l);
                else if (!notes.length && (/-$/.test(name) || (name.split('(').length > name.split(')').length) || l.length <= 25)) name = joinPart(name, l);
                else if (notes.length) notes[notes.length - 1] = joinPart(notes[notes.length - 1], l);
                else notes.push(l);
            }
            let fn = null, hit;
            if ((hit = /gemäss\s+Grundfunktion\s+plus\s+(\d+)(?:\s+max\.?\s*(\d{1,2}))?/i.exec(pay))) fn = { baseDelta: +hit[1], classCap: hit[2] ? +hit[2] : null };
            else if ((hit = /CHF\s*([\d'’.,]+)\s*\/\s*Jahr/i.exec(pay)) && !/max\./i.test(pay)) fn = { fixedAnnual: parseAmount(hit[1]) };
            else if ((hit = /^(\d{1,2})\s*[-–]\s*(\d{1,2})$/.exec(pay.trim())) && +hit[1] <= +hit[2]) fn = { classMin: +hit[1], classMax: +hit[2] };
            if (!fn || !name || /\.{4,}/.test(name)) continue;
            // Lange Klammer-Erläuterungen gehören in den Hinweis, nicht in den Namen
            const paren = /\s*\(([^)]{30,})\)?\s*$/.exec(name);
            if (paren) { notes.unshift(paren[1].replace(/\)$/, '')); name = name.slice(0, paren.index); }
            const fnote = /(\d)\)/.exec(extra);
            if (fnote && footnotes[fnote[1]]) notes.push(footnotes[fnote[1]]);
            functions.push(Object.assign({ nr: m[1], name: name.replace(/\s+/g, ' ').trim(), note: notes.join(' ').replace(/\s+/g, ' ').trim(), group: sections[m[1].split('.')[0]] || '' }, fn));
        }
        const up = /(\d{1,2})\.\s*und\s*(\d{1,2})\.\s*Dienstjahr/i.exec(t);
        return {
            functions,
            classUpYears: up ? [+up[1], +up[2]] : null,
            cutoff: /per\s*31\.\s*12\./i.test(t) || /31\.\s*Dezember/i.test(t) ? 'yearEnd' : null,
            payments: /13\.\s*Monats(?:gehalt|lohn)/i.test(t) ? 13 : null
        };
    }

    const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'beruf';

    const sectionOf = nr => String(nr || '').split('.')[0];
    const significantWords = name => new Set(name.toLowerCase().replace(/\*(?:in|innen|r|e)\b/g, '').split(/[^a-zäöü]+/).filter(w => w.length >= 5 && !STOP_WORDS.has(w)).map(w => w.slice(0, 7)));

    /**
     * Baut Berufe und Vorlagen aus einem eingelesenen Reglement (von Claude oder parseRegulationText).
     * Jede Funktion des Einreihungsplans wird ein Beruf (Assistenz- und Praktikumsfunktionen nutzen die
     * eingebauten Berufe «Assistenz-Einsatz» / «Praktikum») und eine Vorlage mit diesem Beruf als Zielberuf.
     * «In Verbindung» (verwandt): von Claude angegebene Funktionsnummern, sonst Funktionen desselben
     * Abschnitts mit gemeinsamem Wortstamm sowie die Grundfunktion.
     */
    function buildFromRegulation(reg, current) {
        const fns = (reg.functions || []).filter(f => f && f.name);
        const special = f => /assistenz/i.test(f.name) ? '__assistenz' : /praktikant|praktikum/i.test(f.name) ? '__praktikum' : null;
        const ids = new Set(), catIds = new Set();
        const uniq = (set, id) => { while (set.has(id)) id += '_2'; set.add(id); return id; };
        // Ohne Stichwörter von Claude: aus dem Namen, von einer gleichnamigen bisherigen Vorlage und von
        // bisherigen Berufen – jeder bisherige Beruf gibt seine Stichwörter genau einer Funktion weiter,
        // deren Name am deutlichsten passt («Lehrperson» → «Fachlehrperson Zyklus 1 und 2»);
        // Leitungsfunktionen erben nur von Leitungsberufen.
        const heirs = new Map();
        for (const c of current.categories || []) {
            const kws = (c.keywords || []).map(k => fold(k.trim().toLowerCase())).filter(k => k.length >= 5 && !k.includes('+'));
            const lead = kws.some(k => k.includes('leit'));
            let best = null, bestLen = 0;
            fns.forEach((f, i) => {
                const n = fold(' ' + f.name.toLowerCase() + ' ');
                if (!lead && /leit/.test(n)) return;
                const len = Math.max(0, ...kws.filter(k => n.includes(k)).map(k => k.length));
                if (len > bestLen) { bestLen = len; best = i; }
            });
            if (best !== null) heirs.set(best, (heirs.get(best) || []).concat(c.keywords || []));
        }
        const inherit = (name, i) => {
            const same = (current.templates || []).find(t => t.name.replace(/^\d+\.\d+\s+/, '').toLowerCase() === name.toLowerCase());
            return [...(same ? same.keywords || [] : []), ...(heirs.get(i) || [])];
        };
        const items = fns.map((f, i) => {
            const kws = Array.isArray(f.keywords) && f.keywords.length ? f.keywords.map(k => String(k).toLowerCase().trim()).filter(Boolean)
                : [...new Set([...keywordsFromName(f.name), ...inherit(f.name, i)].map(k => k.toLowerCase().trim()).filter(Boolean))];
            const sp = special(f);
            return {
                f, kws, special: sp,
                catId: sp ? null : uniq(catIds, 'b_' + slug(f.nr || f.name)),
                tplId: uniq(ids, 'f_' + slug(f.nr || f.name)),
                name: (f.nr ? f.nr + ' ' : '') + f.name,
                words: significantWords(f.name)
            };
        });
        const categories = items.filter(x => x.catId).map(x => ({ id: x.catId, name: x.name, keywords: x.kws }));
        if (!categories.length) return normalizeSettings(current);
        const byNr = new Map(items.filter(x => x.f.nr).map(x => [String(x.f.nr), x]));
        const base = makeTemplate(categories[0].id).rules;
        const mergeRules = (...parts) => {
            const out = JSON.parse(JSON.stringify(base));
            for (const p of parts) for (const k of Object.keys(out)) if (p && p[k] && MODES.some(m => m.id === p[k].mode)) out[k] = { mode: p[k].mode, factor: +p[k].factor || 0, low: +p[k].low || 0 };
            return out;
        };
        const withClasses = items.filter(x => x.f.classMin);
        const templates = items.map(x => {
            const f = x.f;
            // Grundfunktion: über die Nummer oder die ähnlichste Funktion mit Lohnklassen
            let baseItem = null;
            if ((f.baseDelta != null && !f.classMin && !f.fixedAnnual) || f.baseNr) {
                baseItem = f.baseNr && byNr.get(String(f.baseNr));
                if (!baseItem || baseItem === x) {
                    const best = withClasses.filter(y => y !== x).map(y => ({ y, n: [...x.words].filter(w => y.words.has(w)).length })).sort((a, b) => b.n - a.n)[0];
                    baseItem = best && best.n > 0 ? best.y : withClasses.find(y => y !== x) || null;
                }
            }
            // verwandte Berufe
            let related;
            if (Array.isArray(f.related) && f.related.length) {
                related = f.related.map(n => byNr.get(String(n))).filter(Boolean).map(y => y.catId);
            } else {
                related = items.filter(y => y !== x && sectionOf(y.f.nr) === sectionOf(f.nr) && [...x.words].some(w => y.words.has(w))).map(y => y.catId);
            }
            if (baseItem) related.push(baseItem.catId);
            const target = x.special || x.catId;
            return Object.assign(makeTemplate(target, x.name), {
                id: x.tplId,
                related: [...new Set(related.filter(r => r && r !== target))],
                rules: mergeRules(reg.defaultRules, f.rules),
                combine: reg.combine === 'max' || reg.combine === 'sum' ? reg.combine : 'max',
                cutoff: reg.cutoff === 'yearEnd' ? 'yearEnd' : 'today',
                classMin: f.classMin || null, classMax: f.classMax || f.classMin || null,
                classUpYears: Array.isArray(reg.classUpYears) && reg.classUpYears.length ? reg.classUpYears : [12, 24],
                baseTemplateId: baseItem ? baseItem.tplId : '',
                baseDelta: f.baseDelta != null ? +f.baseDelta : 1, classCap: f.classCap || null,
                fixedAnnual: f.fixedAnnual || null,
                payments: reg.payments === 12 ? 12 : 13,
                keywords: x.kws,
                note: (f.note || '').trim(),
                group: f.group || ''
            });
        });
        const classAdjustments = Array.isArray(reg.adjustments) && reg.adjustments.length
            ? reg.adjustments.filter(a => a && a.label && +a.delta).map((a, i) => ({ id: 'k' + (i + 1) + '_' + slug(a.label).slice(0, 12), label: a.label, delta: +a.delta, cap: null }))
            : (current.classAdjustments || []).slice();
        return normalizeSettings(Object.assign({}, current, { categories, templates, classAdjustments }));
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

    const api = { extractEntries, extractBirth, findRanges, tokenize, classify, compute, placement, weightFor, ruleKeyFor, describeRule, roundYears, detectSection, ymToIndex, normalizeSettings, makeTemplate, parseAmount, formatChf,
 parseCsv, parseSalaryTable, checkSalaryTable, normalizeSalaryTable, selectSalaryTable, cutoffDate, effectiveTemplate, suggestTemplates, keywordHit, parseRegulationText, buildFromRegulation, keywordsFromName, suggestCorrections, suggestedAllowances, salaryOutlook, findDuplicates, leadershipYears, STATUSES, AUTO_KINDS, upgradeTemplate, DEFAULT_SETTINGS, SPECIAL_CATEGORIES, TARGETABLE_SPECIALS, ROUNDING, MODES, RULE_KEYS };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.CVParser = api;
})(typeof self !== 'undefined' ? self : this);
