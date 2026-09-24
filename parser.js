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
    const DEFAULT_SETTINGS = {
        sameFactor: 100,
        relatedFactor: 75,
        otherFactor: 50,
        educationFactor: 0,
        pensumMode: false,
        maxYears: null,
        categories: [
            { id: 'lehrperson', name: 'Lehrperson', related: [], keywords: ['lehrer', 'lehrerin', 'lehrperson', 'lehrkraft', 'primarlehr', 'sekundarlehr', 'reallehr', 'oberstufenlehr', 'kindergärtner', 'kindergartenlehr', 'kindergarten-lehr', 'fachlehr', 'klassenlehr', 'mittelschullehr', 'gymnasiallehr', 'berufsschullehr', 'heilpädagog', 'dozent', 'teacher', 'enseignant', 'vikariat', 'stellvertretung', 'lehrtätigkeit', 'unterricht'] },
            { id: 'sozial', name: 'Sozialpädagogik / Betreuung', related: [], keywords: ['sozialpädagog', 'sozialarbeit', 'betreuer', 'betreuung', 'fabe', 'fachperson betreuung', 'kita', 'hort', 'tagesstruktur', 'jugendarbeit', 'erzieher', 'klassenassistenz', 'schulassistenz', 'spielgruppe'] },
            { id: 'bildung', name: 'Erwachsenenbildung / Training', related: [], keywords: ['trainer', 'trainerin', 'kursleit', 'coach', 'ausbildner', 'ausbilder', 'berufsbildner', 'erwachsenenbildn', 'instruktor', 'nachhilfe', 'tutor'] },
            { id: 'fuehrung', name: 'Führung / Management', related: [], keywords: ['schulleit', 'geschäftsführ', 'geschäftsleit', 'leiter', 'leiterin', 'leitung', 'head of', 'manager', 'direktor', 'rektor', 'ceo', 'teamlead', 'abteilungsleit'] },
            { id: 'gesundheit', name: 'Gesundheit / Pflege', related: [], keywords: ['pflege', 'fage', 'fachperson gesundheit', 'arzt', 'ärztin', 'therapeut', 'mpa', 'spital', 'physiotherap', 'ergotherap', 'logopäd'] },
            { id: 'kaufm', name: 'Kaufmännisch / Verwaltung', related: [], keywords: ['kaufm', 'kauffrau', 'kaufmann', 'sachbearbeit', 'buchhalt', 'administration', 'sekretär', 'sekretariat', 'office', 'verkauf', 'verkäufer', 'marketing', 'personal', 'hr ', 'treuhand', 'bank', 'versicherung', 'controlling', 'accountant'] },
            { id: 'informatik', name: 'Informatik / Technik', related: [], keywords: ['informatik', 'software', 'entwickler', 'developer', 'engineer', 'ingenieur', 'ict', 'it-', 'support', 'applikation', 'system', 'programmier', 'techniker'] },
            { id: 'handwerk', name: 'Handwerk / Gewerbe', related: [], keywords: ['schreiner', 'elektriker', 'elektroinstall', 'mechaniker', 'polymechaniker', 'maurer', 'zimmermann', 'monteur', 'koch', 'köchin', 'bäcker', 'gärtner', 'maler', 'sanitär', 'logistik', 'lagerist', 'chauffeur', 'service', 'gastronomie'] }
        ]
    };

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

            const cls = classify(title, details, settings.categories);
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

    function factorFor(entry, target, settings) {
        if (entry.factorOverride !== null && entry.factorOverride !== undefined && entry.factorOverride !== '') return +entry.factorOverride;
        if (entry.category === '__ausbildung') return settings.educationFactor;
        if (target && entry.category === target) return settings.sameFactor;
        const t = settings.categories.find(c => c.id === target);
        const c = settings.categories.find(x => x.id === entry.category);
        if ((t && t.related.includes(entry.category)) || (c && c.related.includes(target))) return settings.relatedFactor;
        return settings.otherFactor;
    }

    /**
     * Berechnet die anrechenbaren Jahre. Überschneidende Zeiträume werden nie doppelt gezählt:
     * Pro Monat zählt die Tätigkeit mit dem höchsten Faktor (im Pensum-Modus werden die Pensen
     * summiert, max. 100 %).
     */
    function compute(entries, target, settings, today) {
        today = today || new Date();
        const nowIdx = today.getFullYear() * 12 + today.getMonth();
        const months = new Map(); // idx -> [{entryIdx, w, cat}]
        const perEntry = entries.map(() => ({ months: 0, credited: 0, factor: 0, valid: false }));

        entries.forEach((e, i) => {
            const s = ymToIndex(e.start);
            let en = e.ongoing ? nowIdx : ymToIndex(e.end);
            const f = factorFor(e, target, settings);
            perEntry[i].factor = f;
            if (s === null || en === null) return;
            en = Math.min(en, nowIdx);
            if (en < s) return;
            perEntry[i].valid = true;
            perEntry[i].months = en - s + 1;
            if (!e.include) return;
            const p = settings.pensumMode ? Math.max(0, Math.min(100, +e.pensum || 0)) / 100 : 1;
            for (let k = s; k <= en; k++) {
                if (!months.has(k)) months.set(k, []);
                months.get(k).push({ i, w: (f / 100) * p, cat: e.category });
            }
        });

        let totalMonths = 0, targetMonths = 0, credited = 0;
        const perCategory = {};
        for (const list of months.values()) {
            const work = list.filter(x => x.cat !== '__ausbildung');
            if (work.length) totalMonths++;
            if (target && list.some(x => x.cat === target)) targetMonths++;
            for (const cat of new Set(work.map(x => x.cat))) perCategory[cat] = (perCategory[cat] || 0) + 1;

            list.sort((a, b) => b.w - a.w);
            if (settings.pensumMode) {
                let left = 1;
                for (const x of list) {
                    const take = Math.min(left, x.w);
                    if (take <= 0) break;
                    perEntry[x.i].credited += take;
                    left -= take;
                }
                credited += 1 - left;
            } else if (list[0].w > 0) {
                const w = Math.min(1, list[0].w);
                perEntry[list[0].i].credited += w;
                credited += w;
            }
        }

        let creditedYears = credited / 12;
        let capped = false;
        if (settings.maxYears && creditedYears > settings.maxYears) { creditedYears = +settings.maxYears; capped = true; }

        return {
            totalYears: totalMonths / 12,
            targetYears: targetMonths / 12,
            otherYears: (totalMonths - targetMonths) / 12,
            creditedYears,
            capped,
            perEntry,
            perCategory
        };
    }

    const api = { extractEntries, findRanges, tokenize, classify, compute, factorFor, detectSection, ymToIndex, DEFAULT_SETTINGS };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.CVParser = api;
})(typeof self !== 'undefined' ? self : this);
