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
        ['experience', /^(?:beruf(?:liche[rns]?)?\s*(?:erfahrung(?:en)?|werdegang|tätigkeit(?:en)?|laufbahn|praxis|stationen)|werdegang|erfahrung|arbeitserfahrung|berufspraxis|praxiserfahrung|tätigkeiten|anstellungen|work experience|professional experience|experience|employment(?: history)?|career|expérience(?:s)? professionnelle(?:s)?|parcours professionnel)$/i],
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
    // Feste Sonderkategorien (nicht löschbar), mit eigenen Faktoren in den Vorlagen
    const SPECIAL_CATEGORIES = [
        { id: '__familie', name: 'Familienarbeit', keywords: ['familienarbeit', 'familienpause', 'familienzeit', 'familienphase', 'elternzeit', 'elternurlaub', 'mutterschaft', 'hausfrau', 'hausmann', 'betreuung der eigenen kinder', 'betreuung eigener kinder', 'erziehungsarbeit', 'erziehungszeit'] },
        { id: '__dienst', name: 'Militär-/Zivildienst', keywords: ['militärdienst', 'militär', 'rekrutenschule', 'unteroffiziersschule', 'offiziersschule', 'durchdiener', 'zivildienst', 'zivi ', 'zivilschutz'] },
        { id: '__sonstige', name: 'Sonstige', keywords: [] },
        { id: '__ausbildung', name: 'Ausbildung', keywords: [] }
    ];

    const ROUNDING = [
        { id: 'none', name: 'nicht runden' },
        { id: 'half-down', name: 'auf halbe Jahre abrunden' },
        { id: 'down', name: 'auf ganze Jahre abrunden' },
        { id: 'nearest', name: 'auf ganze Jahre runden' }
    ];

    /** Anrechnungsregeln für eine Stelle (Vorlage). */
    function makeTemplate(target, name) {
        return {
            id: 't_' + target + '_' + Math.random().toString(36).slice(2, 6),
            name: name || 'Neue Vorlage',
            target,
            related: [],
            sameFactor: 100,
            relatedFactor: 75,
            otherFactor: 50,
            educationFactor: 0,
            familyFactor: 50,
            familyMaxYears: null,
            serviceFactor: 50,
            pensumMode: false,
            minAge: null,
            maxYears: null,
            rounding: 'none'
        };
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
        const out = { categories: [], templates: [] };
        out.categories = (s.categories || []).map(c => ({ id: c.id, name: c.name, keywords: c.keywords || [] }));
        if (Array.isArray(s.templates) && s.templates.length) {
            out.templates = s.templates.map(t => Object.assign(makeTemplate(t.target), t));
        } else {
            out.templates = (s.categories || []).map(c => {
                const t = makeTemplate(c.id, c.name);
                t.id = 't_' + c.id;
                for (const k of ['sameFactor', 'relatedFactor', 'otherFactor', 'educationFactor', 'pensumMode', 'maxYears']) if (s[k] !== undefined) t[k] = s[k];
                t.related = (c.related || []).slice();
                (s.categories || []).forEach(o => { if ((o.related || []).includes(c.id) && !t.related.includes(o.id)) t.related.push(o.id); });
                return t;
            });
        }
        const ids = new Set(out.categories.map(c => c.id));
        out.templates.forEach(t => { t.related = (t.related || []).filter(r => ids.has(r)); });
        out.templates = out.templates.filter(t => ids.has(t.target));
        return out;
    }

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
        return entries;
    }

    function ym(p) {
        return p.y + '-' + String(p.m).padStart(2, '0');
    }

    function ymToIndex(s) {
        const m = /^(\d{4})-(\d{2})$/.exec(s || '');
        return m ? (+m[1]) * 12 + (+m[2] - 1) : null;
    }

    function factorFor(entry, rules) {
        if (entry.factorOverride !== null && entry.factorOverride !== undefined && entry.factorOverride !== '') return +entry.factorOverride;
        switch (entry.category) {
            case '__ausbildung': return rules.educationFactor;
            case '__familie': return rules.familyFactor;
            case '__dienst': return rules.serviceFactor;
        }
        if (entry.category === rules.target) return rules.sameFactor;
        if ((rules.related || []).includes(entry.category)) return rules.relatedFactor;
        return rules.otherFactor;
    }

    function roundYears(y, mode) {
        switch (mode) {
            case 'down': return Math.floor(y + 1e-9);
            case 'nearest': return Math.round(y);
            case 'half-down': return Math.floor(y * 2 + 1e-9) / 2;
            default: return y;
        }
    }

    const NOT_WORK = new Set(['__ausbildung', '__familie']);

    /**
     * Berechnet die anrechenbaren Jahre nach den Regeln einer Vorlage.
     * Überschneidende Zeiträume werden nie doppelt gezählt: Pro Monat zählt die Tätigkeit mit dem
     * höchsten Faktor (im Pensum-Modus werden die Pensen summiert, max. 100 %).
     * Reihenfolge: Mindestalter → Obergrenze Familienarbeit → Maximum → Rundung.
     * @param {Array} entries
     * @param {object} rules   Vorlage (target, Faktoren, Grenzen, Rundung)
     * @param {Date}  [today]
     * @param {object} [opts]  { birth: 'YYYY-MM' }
     */
    function compute(entries, rules, today, opts) {
        today = today || new Date();
        opts = opts || {};
        const target = rules.target;
        const nowIdx = today.getFullYear() * 12 + today.getMonth();
        const birthIdx = ymToIndex(opts.birth);
        const minIdx = birthIdx !== null && rules.minAge ? birthIdx + Math.round(rules.minAge * 12) : null;
        const familyCap = rules.familyMaxYears ? Math.round(rules.familyMaxYears * 12) : Infinity;
        const months = new Map(); // idx -> [{i, w, cat}]
        const perEntry = entries.map(() => ({ months: 0, credited: 0, factor: 0, valid: false }));

        entries.forEach((e, i) => {
            const s = ymToIndex(e.start);
            let en = e.ongoing ? nowIdx : ymToIndex(e.end);
            const f = factorFor(e, rules);
            perEntry[i].factor = f;
            if (s === null || en === null) return;
            en = Math.min(en, nowIdx);
            if (en < s) return;
            perEntry[i].valid = true;
            perEntry[i].months = en - s + 1;
            if (!e.include) return;
            const p = rules.pensumMode ? Math.max(0, Math.min(100, +e.pensum || 0)) / 100 : 1;
            for (let k = s; k <= en; k++) {
                if (!months.has(k)) months.set(k, []);
                months.get(k).push({ i, w: (f / 100) * p, cat: e.category });
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
            if (rules.pensumMode) {
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
        if (rules.maxYears && creditedYears > rules.maxYears) { creditedYears = +rules.maxYears; capped = true; }
        const beforeRounding = creditedYears;
        creditedYears = roundYears(creditedYears, rules.rounding);

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
            familyCapped,
            perEntry,
            perCategory
        };
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

    const api = { extractEntries, extractBirth, findRanges, tokenize, classify, compute, factorFor, roundYears, detectSection, ymToIndex, normalizeSettings, makeTemplate, DEFAULT_SETTINGS, SPECIAL_CATEGORIES, ROUNDING };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.CVParser = api;
})(typeof self !== 'undefined' ? self : this);
