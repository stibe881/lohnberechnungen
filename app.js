/* ============================================
   Lebenslauf-Rechner — Oberfläche
   ============================================ */
(function () {
    'use strict';

    const P = window.CVParser;
    const SETTINGS_KEY = 'cvrechner.settings.v1';
    const TEMPLATE_KEY = 'cvrechner.template.v1';
    const AI_KEY = 'cvrechner.ai.v1'; // getrennt von den Einstellungen, damit Schlüssel/Passwort nie exportiert werden
    const PRIVACY_KEY = 'cvrechner.privacy-ack.v1';
    const SERVER_URL = new URL('api/claude.php', location.href).href.replace(/\/$/, '');
    const SETTINGS_URL = new URL('api/settings.php', location.href).href;
    const CANDIDATES_URL = new URL('api/candidates.php', location.href).href;
    const SHARED_KEY = 'cvrechner.shared.v1'; // Version der zuletzt geladenen/gespeicherten zentralen Einstellungen
    const CONCURRENCY = 3; // so viele Lebensläufe wertet Claude gleichzeitig aus

    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    // --- State ---
    const clone = o => JSON.parse(JSON.stringify(o));
    let settings = loadSettings();
    let defaultTemplateId = storageGet(TEMPLATE_KEY) || settings.templates[0]?.id || '';
    const candidates = []; // bewusst nur im Speicher: Lebensläufe werden nicht im Browser abgelegt
    let selectedId = null;
    let ai = loadAi();
    let server = { available: false, configured: false, passwordRequired: false };
    // Zentrale Einstellungen (api/settings.php): Status vom Server und zuletzt bekannte Version
    let shared = { available: false, enabled: false, exists: false, version: 0, updatedAt: null, adminRequired: false, problem: '', error: '' };
    let sharedMeta = (() => { try { return JSON.parse(storageGet(SHARED_KEY)) || null; } catch (e) { return null; } })();
    let privacyAckSession = false;

    function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignorieren */ } }
    function loadSettings() {
        try {
            const s = JSON.parse(storageGet(SETTINGS_KEY));
            if (s && Array.isArray(s.categories) && s.categories.length) {
                const n = P.normalizeSettings(s);
                if (n.templates.length) return n;
            }
        } catch (e) { /* Standard verwenden */ }
        return clone(P.DEFAULT_SETTINGS);
    }
    function saveSettings() { storageSet(SETTINGS_KEY, JSON.stringify(settings)); }
    function loadAi() {
        const d = { enabled: false, mode: 'server', apiKey: '', password: '', adminPassword: '', model: '', textOnly: true, shared: true, storeCandidates: true };
        try {
            const a = JSON.parse(storageGet(AI_KEY));
            if (a) return Object.assign(d, a, { mode: a.mode || (a.apiKey ? 'key' : 'server') });
        } catch (e) { /* Standard verwenden */ }
        return d;
    }
    const aiReady = () => ai.mode === 'server' ? server.configured : !!ai.apiKey;
    const aiActive = () => ai.enabled && aiReady();

    // --- Helpers ---
    const $ = s => document.querySelector(s);
    // Icons (Linien-Icons als inline SVG, Farbe = Textfarbe)
    const ICONS = {
        sparkles: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96l-6.14 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/>',
        alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
        lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
        database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
        lightbulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
        pencil: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>',
        x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
        check: '<path d="M20 6 9 17l-5-5"/>'
    };
    const icon = (name, label) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}>${ICONS[name]}</svg>`;
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = y => (Math.round(y * 10) / 10).toLocaleString('de-CH', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    function fmtYM(y) {
        const m = Math.round(y * 12);
        const yy = Math.floor(m / 12), mm = m % 12;
        if (!yy) return mm + ' Mt.';
        return yy + ' J.' + (mm ? ' ' + mm + ' Mt.' : '');
    }
    const allCats = () => settings.categories.concat(P.SPECIAL_CATEGORIES);
    const catName = id => (allCats().find(c => c.id === id) || { name: '–' }).name;
    const uid = () => 'c' + Math.random().toString(36).slice(2, 9);
    const AUTO = '__auto'; // «Funktion automatisch vorschlagen»
    const rawTplOf = c => settings.templates.find(t => t.id === c.templateId) || settings.templates[0];
    /** Vorlage der Person; bei «gemäss Grundfunktion plus …» mit den Klassen der (gewählten) Grundfunktion. */
    const tplOf = c => P.effectiveTemplate(rawTplOf(c), settings.templates, c.baseTemplateId);
    /** Vorschlag der Funktion aus dem Lebenslauf (Claude oder Stichwörter der Vorlagen). */
    function applySuggestion(c, aiRes) {
        const ranked = P.suggestTemplates(c.entries, settings.templates);
        const valid = id => settings.templates.some(t => t.id === id);
        if (aiRes && aiRes.functionId && valid(aiRes.functionId)) {
            c.suggestion = { id: aiRes.functionId, reason: aiRes.functionReason || '', source: 'ki' };
        } else if (ranked.length) {
            const h = ranked[0].hits;
            c.suggestion = { id: ranked[0].id, reason: 'Treffer in ' + h.slice(0, 2).map(x => `«${x.title}»`).join(', ') + (h.length > 2 ? ` und ${h.length - 2} weiteren` : ''), source: 'regeln' };
        } else {
            c.suggestion = null;
        }
        if (c.suggestion) c.suggestion.alternatives = ranked.map(x => x.id).filter(id => id !== c.suggestion.id).slice(0, 3);
        if (c.autoTemplate && c.suggestion) { c.templateId = c.suggestion.id; c.baseTemplateId = ''; }
    }
    const computeFor = c => P.compute(c.entries, tplOf(c), undefined, { birth: c.birth });
    const adjustmentOf = c => (settings.classAdjustments || []).find(a => a.id === c.adjustmentId) || null;
    /** Lohneinreihung mit der Gehaltstabelle, die für die Vorlage gilt (fest gewählt oder am Stichtag gültig). */
    function placementFor(c, r) {
        const t = tplOf(c);
        if (t.fixedAnnual) return { fixed: true, salary: +t.fixedAnnual, table: null, future: false, years: Math.floor(r.creditedYears + 1e-9) };
        const sel = P.selectSalaryTable(settings.salaryTables, t);
        const pl = P.placement(r.creditedYears, t, adjustmentOf(c), sel.table);
        return pl && Object.assign(pl, { table: sel.table, future: sel.future });
    }
    const chf = v => 'CHF ' + (Math.round(v * 20) / 20).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const chfExact = v => 'CHF ' + v.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtDay = d => d ? d.split('-').reverse().join('.') : '';
    const fmtNum = v => (Math.round(v * 10) / 10).toLocaleString('de-CH', { maximumFractionDigits: 1 });
    /** Pensum der neuen Stelle in %: aus den Lektionen, wenn die Vorlage Lektionen für 100 % kennt. */
    function pensumOf(c, t) {
        if (t.lessonsFull) {
            const l = c.newLessons ?? t.lessonsFull;
            return Math.max(0, Math.min(100, l / t.lessonsFull * 100));
        }
        return Math.max(0, Math.min(100, +c.newPensum || 100));
    }
    const tableLabel = st => `«${st.name}»${st.validFrom ? ', gültig ab ' + fmtDay(st.validFrom) : ''}`;

    /** Lohneinreihung als Text, z. B. «Lohnklasse 12, Stufe 6 · Jahreslohn CHF 95'000.00 bei 100 % · …». */
    function placementText(c, pl) {
        if (!pl) return '';
        const t = tplOf(c);
        const parts = [pl.fixed ? 'Fixer Lohn gemäss Funktion' : `Lohnklasse ${pl.cls}, Stufe ${pl.stage}`];
        if (pl.salary) {
            const p = pensumOf(c, t);
            const year = pl.salary * p / 100;
            const other = t.payments === 12 ? 13 : 12;
            parts.push(`Jahreslohn ${chf(pl.salary)} bei 100 %`);
            if (t.lessonsFull && p !== 100) parts.push(`${chf(year)} bei ${fmtNum(c.newLessons ?? t.lessonsFull)} von ${fmtNum(t.lessonsFull)} Lektionen (${fmtNum(p)} %)`);
            else if (t.lessonsFull) parts[parts.length - 1] += ` (${fmtNum(t.lessonsFull)} Lektionen)`;
            else if (p !== 100) parts.push(`${chf(year)} bei ${fmtNum(p)} %`);
            parts.push(`Monatslohn ${chf(year / t.payments)} (${t.payments} Auszahlungen; bei ${other}: ${chf(year / other)})`);
        }
        if (t.lessonsFull && pl.lesson) parts.push(`pro Lektion ${chfExact(pl.lesson)}`);
        else if (pl.hour) parts.push(`pro Stunde ${chfExact(pl.hour)}`);
        return parts.join(' · ');
    }
    function placementWhy(t, pl) {
        if (!pl) return '';
        if (pl.fixed) return `Fixer Jahreslohn der Funktion «${t.name}», unabhängig von der Erfahrung` + (t.note ? '. ' + t.note : '');
        let s = `${pl.years} volle Erfahrungsjahre → Stufe ${pl.stage}${pl.years + 1 > pl.maxStage ? ` (höchste Stufe ${pl.maxStage})` : ''}; Grundklasse ${t.classMin}` + (t.classMax && t.classMax !== t.classMin ? ` (Funktion ${t.classMin}–${t.classMax})` : '');
        if (pl.ups) s += `, +${pl.ups} Klasse${pl.ups > 1 ? 'n' : ''} nach ${(t.classUpYears || []).slice(0, pl.ups).join(' und ')} Jahren`;
        if (pl.adjustment && pl.adjustment.delta) s += `, Korrektur: ${pl.adjustment.label}`;
        if (t.baseName) s = s.replace(`Grundklasse ${t.classMin}`, `Grundklasse ${t.classMin} (Grundfunktion «${t.baseName}» +${t.baseDelta}${t.classCap ? `, max. ${t.classCap}` : ''})`);
        if (t.note) s += '. Hinweis: ' + t.note.replace(/[.\s]+$/, '');
        if (!pl.table) return s + ' (keine Gehaltstabelle hinterlegt)';
        s += `. Gehaltstabelle ${tableLabel(pl.table)}`;
        if (pl.future) s += ' – gilt am Stichtag noch nicht, keine gültige Tabelle vorhanden';
        if (!pl.salary) s += ` – Lohnklasse ${pl.cls} ist darin nicht enthalten`;
        return s;
    }

    function setStatus(msg, isError) {
        const el = $('#status');
        el.textContent = msg || '';
        el.classList.toggle('error', !!isError);
    }

    // --- Datei lesen ---
    async function readFile(file, useAi) {
        const name = file.name.toLowerCase();
        if (name.endsWith('.pdf') || file.type === 'application/pdf') {
            const buf = await file.arrayBuffer();
            // Ohne «Nur Text senden» liest Claude das PDF direkt (auch eingescannte); der Text dient dann nur der Anzeige
            const pdfBase64 = useAi && !ai.textOnly ? toBase64(buf) : null;
            let text = '';
            if (window.pdfjsLib) text = await pdfToText(buf.slice(0)).catch(() => '');
            else if (!pdfBase64) throw new Error('PDF-Bibliothek konnte nicht geladen werden (Internetverbindung?).');
            if (!text.trim() && !pdfBase64) {
                throw new Error(useAi
                    ? 'kein Text gefunden (eingescannt?) – in den Einstellungen «Nur Text an Claude senden» ausschalten, damit Claude das PDF selbst liest'
                    : 'kein Text gefunden (eingescanntes Dokument? Mit der KI-Auswertung lesbar)');
            }
            return { text, pdfBase64 };
        }
        if (name.endsWith('.docx')) {
            if (!window.mammoth) throw new Error('Word-Bibliothek konnte nicht geladen werden (Internetverbindung?).');
            const res = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
            return { text: res.value.replace(/\n{2,}/g, '\n'), pdfBase64: null };
        }
        if (name.endsWith('.doc')) throw new Error('Alte .doc-Dateien werden nicht unterstützt – bitte als PDF oder .docx speichern.');
        const text = await file.text();
        if (!text.trim()) throw new Error('die Datei ist leer');
        return { text, pdfBase64: null };
    }

    function toBase64(buf) {
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(bin);
    }

    /** Liest die Textstücke eines PDFs und fasst sie pro Seite zu Zeilen zusammen (Stücke nach X sortiert). */
    async function pdfLines(buf) {
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        const pages = [];
        for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const content = await page.getTextContent();
            const items = content.items
                .filter(it => typeof it.str === 'string' && it.str.trim())
                .map(it => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || it.height || 10 }))
                .sort((a, b) => (b.y - a.y) || (a.x - b.x));

            // Textstücke mit (fast) gleicher Y-Position zu Zeilen zusammenfassen
            const lines = [];
            for (const it of items) {
                const line = lines[lines.length - 1];
                if (line && Math.abs(line.y - it.y) <= Math.max(2, it.h * 0.45)) line.items.push(it);
                else lines.push({ y: it.y, h: it.h, items: [it] });
            }
            lines.forEach(line => line.items.sort((a, b) => a.x - b.x));
            pages.push(lines);
        }
        return pages;
    }

    /** PDF-Tabelle als Zeilen und Zellen: Ein grösserer Abstand zwischen Textstücken beginnt eine neue Zelle. */
    async function pdfToRows(buf) {
        const rows = [];
        for (const lines of await pdfLines(buf)) {
            for (const line of lines) {
                const cells = [];
                let end = null;
                for (const it of line.items) {
                    if (end === null || it.x - end > it.h * 0.8) cells.push(it.s.trim());
                    else cells[cells.length - 1] += (it.x - end > 1 ? ' ' : '') + it.s.trim();
                    end = it.x + it.w;
                }
                rows.push(cells);
            }
        }
        return rows;
    }

    async function pdfToText(buf) {
        const out = [];
        for (const lines of await pdfLines(buf)) {
            let prevY = null, prevH = 0;
            for (const line of lines) {
                let s = '', end = null;
                for (const it of line.items) {
                    if (end !== null) {
                        const gap = it.x - end;
                        if (gap > 18) s += '   ';
                        else if (gap > 1 && !s.endsWith(' ') && !it.s.startsWith(' ')) s += ' ';
                    }
                    s += it.s;
                    end = it.x + it.w;
                }
                if (prevY !== null && prevY - line.y > Math.max(prevH, line.h) * 2.1) out.push('');
                out.push(s.trim());
                prevY = line.y; prevH = line.h;
            }
            out.push('');
        }
        return out.join('\n');
    }

    // --- Auswertung ---

    /** Wertet einen Lebenslauf aus: mit Claude, falls gewünscht, sonst (oder bei Fehlern) mit den Regeln. */
    async function analyzeCandidate(c, useAi) {
        c.aiError = '';
        c.hinweise = '';
        if (useAi) {
            try {
                if (!window.CVAi) throw new Error('KI-Modul konnte nicht geladen werden (Internetverbindung?).');
                const res = await window.CVAi.analyze(Object.assign(
                    { model: ai.model, categories: settings.categories, pdfBase64: c.pdfBase64, text: c.text,
                        functions: settings.templates.map(t => {
                            const e = P.effectiveTemplate(t, settings.templates);
                            return { id: t.id, name: t.name, classes: t.fixedAnnual ? 'fixer Lohn' : e.classMin ? `LK ${e.classMin}–${e.classMax || e.classMin}` : '', hint: [t.keywords.slice(0, 8).join(', '), t.note].filter(Boolean).join(' · ') };
                        }) },
                    ai.mode === 'server' ? { serverUrl: SERVER_URL, password: ai.password } : { apiKey: ai.apiKey }
                ));
                c.entries = res.entries;
                c.hinweise = res.hinweise;
                applySuggestion(c, res);
                if (res.name && c.autoName) { c.name = res.name; c.autoName = false; }
                if (res.birth && !c.birthEdited) c.birth = res.birth;
                c.source = 'ki';
                c.model = ai.model || window.CVAi.DEFAULT_MODEL;
                return;
            } catch (e) {
                c.aiError = e.message;
            }
        }
        c.entries = P.extractEntries(c.text, settings);
        applySuggestion(c, null);
        if (!c.birthEdited) c.birth = P.extractBirth(c.text) || c.birth || '';
        c.source = 'regeln';
    }

    function newCandidate(name, text, pdfBase64) {
        return {
            id: uid(),
            name: name.replace(/\.(pdf|docx|txt)$/i, '').replace(/[_]+/g, ' ').trim() || 'Unbenannt',
            autoName: true,
            birth: '',
            birthEdited: false,
            text,
            pdfBase64: pdfBase64 || null,
            templateId: defaultTemplateId === AUTO ? settings.templates[0].id : defaultTemplateId,
            autoTemplate: defaultTemplateId === AUTO, // Funktion aus dem Lebenslauf vorschlagen
            suggestion: null,
            baseTemplateId: '',
            adjustmentId: '',
            newPensum: 100,
            entries: [],
            loading: true
        };
    }

    /** Führt fn für alle Elemente aus, höchstens `limit` gleichzeitig. */
    async function pool(items, limit, fn) {
        let next = 0;
        const worker = async () => { while (next < items.length) { const i = next++; await fn(items[i], i); } };
        await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    }

    let busy = false;
    async function withBusy(fn) {
        if (busy) return;
        busy = true;
        document.body.classList.add('busy');
        try { await fn(); } finally { busy = false; document.body.classList.remove('busy'); }
    }

    /** Fragt vor dem ersten Senden an Claude nach, ob die Bewerbenden informiert sind. */
    function ensurePrivacyAck() {
        if (privacyAckSession || storageGet(PRIVACY_KEY) === '1') return Promise.resolve(true);
        const dlg = $('#privacyDialog');
        $('#privacyRemember').checked = false;
        dlg.returnValue = '';
        dlg.showModal();
        return new Promise(resolve => {
            dlg.addEventListener('close', () => {
                const ok = dlg.returnValue === 'ok';
                if (ok) {
                    privacyAckSession = true;
                    if ($('#privacyRemember').checked) storageSet(PRIVACY_KEY, '1');
                }
                resolve(ok);
            }, { once: true });
        });
    }

    /** Liest Dateien/Texte ein und wertet sie parallel aus. sources = [{name, file?, text?}] */
    async function processSources(sources) {
        if (!sources.length) return;
        await withBusy(async () => {
            let useAi = aiActive();
            if (useAi && !(await ensurePrivacyAck())) {
                useAi = false;
                setStatus('Nicht an Claude gesendet – Auswertung mit den Regeln.');
            }
            const errors = [];
            const batch = [];
            for (const src of sources) {
                try {
                    const { text, pdfBase64 } = src.file ? await readFile(src.file, useAi) : { text: src.text, pdfBase64: null };
                    const c = newCandidate(src.name, text, pdfBase64);
                    if (src.fixedName) c.autoName = false;
                    batch.push(c);
                } catch (e) {
                    errors.push(src.name + ': ' + e.message);
                }
            }
            if (!batch.length) { setStatus(errors.join(' · '), true); return; }
            candidates.push(...batch);
            selectedId = batch[0].id;
            render();

            let done = 0;
            const progress = () => setStatus((useAi ? 'Claude wertet aus: ' : 'Ausgewertet: ') + done + ' von ' + batch.length + ' …');
            progress();
            await pool(batch, useAi ? CONCURRENCY : 1, async c => {
                await analyzeCandidate(c, useAi);
                c.loading = false;
                if (c.aiError) errors.push(c.name + ': KI-Auswertung fehlgeschlagen (' + c.aiError + ') – Regeln verwendet');
                if (!c.entries.length) errors.push(c.name + ': keine Zeiträume erkannt – bitte manuell ergänzen');
                done++;
                progress();
                renderOverview();
                if (c.id === selectedId) renderDetail();
            });
            setStatus(batch.length + ' Lebenslauf/-läufe ausgewertet.' + (errors.length ? ' ' + errors.join(' · ') : ''), false);
            render();
            $('#detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    // --- Darstellung der Regeln & Berechnung (auch für den Bericht) ---
    function rulesText(t) {
        const R = t.rules;
        const d = k => P.describeRule(R[k]);
        const parts = [`Zielberuf (${catName(t.target)}): ${d('same')}`];
        if (t.related.length) parts.push(`verwandte Berufe (${t.related.map(catName).join(', ')}): ${d('related')}`);
        parts.push(`andere Berufe: ${d('other')}`);
        parts.push(`Praktikum: ${d('internship')}`);
        parts.push(`Assistenz: ${d('assistance')}`);
        parts.push(`Familienarbeit: ${d('family')}` + (t.familyMaxYears ? ` (max. ${fmt(t.familyMaxYears)} J.)` : ''));
        parts.push(`Militär-/Zivildienst: ${d('service')}`);
        parts.push(`Erstausbildung: ${d('education')}`);
        parts.push(`Zweitausbildung: ${d('secondEducation')}`);
        parts.push(t.combine === 'sum' ? 'gleichzeitige Tätigkeiten werden addiert, max. 100 % pro Monat' : 'bei gleichzeitigen Tätigkeiten zählt die höchste Anrechnung');
        if (t.cutoff === 'yearEnd') parts.push('Stichtag 31.12. des laufenden Jahres');
        if (t.minAge) parts.push(`angerechnet ab Alter ${t.minAge}`);
        if (t.maxYears) parts.push(`höchstens ${fmt(t.maxYears)} J.`);
        if (t.rounding && t.rounding !== 'none') parts.push((P.ROUNDING.find(r => r.id === t.rounding) || {}).name);
        return parts.join(' · ');
    }

    /** Rechenweg als HTML (Werte sind Zahlen, Texte escaped). */
    function formulaHtml(c, r, t) {
        const groups = new Map();
        c.entries.forEach((e, i) => {
            const pe = r.perEntry[i];
            if (!e.include || pe.factor <= 0 || pe.credited <= 0) return;
            groups.set(pe.factor, (groups.get(pe.factor) || 0) + pe.credited / (pe.factor / 100));
        });
        if (!groups.size) return 'Noch keine anrechenbare Erfahrung erfasst.';
        const parts = [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([f, m]) => `${fmt(m / 12)} J. × ${f} %`);
        let html = `${parts.join(' + ')} = <b>${fmt(r.exactYears)} J.</b>`;
        const notes = [];
        if (r.beforeMinAgeYears > 0) notes.push(`${fmt(r.beforeMinAgeYears)} J. vor dem Mindestalter von ${t.minAge} nicht angerechnet`);
        if (!c.birth && t.minAge) notes.push(`Mindestalter ${t.minAge} nicht geprüft (Geburtsdatum fehlt)`);
        if (r.familyCapped) notes.push(`Familienarbeit auf ${fmt(t.familyMaxYears)} J. begrenzt`);
        if (r.capped) notes.push(`begrenzt auf ${fmt(t.maxYears)} J.`);
        if (r.rounded) notes.push(`${(P.ROUNDING.find(x => x.id === t.rounding) || {}).name}: <b>${fmt(r.creditedYears)} J.</b>`);
        else if (r.capped) notes.push(`<b>${fmt(r.creditedYears)} J.</b>`);
        return html + (notes.length ? ' → ' + notes.join(' → ') : '');
    }

    function timelineHtml(c, r) {
        return window.CVTimeline ? CVTimeline.render({ entries: c.entries, perEntry: r.perEntry, catName, minAgeMonth: r.minAgeMonth, endMonth: r.cutoffMonth }) : '';
    }

    const overrideCount = c => c.entries.filter(e => e.factorOverride !== null && e.factorOverride !== undefined && e.factorOverride !== '').length;

    /** Womit gerechnet wurde (für den Bericht): Stand der Einstellungen. */
    function settingsSourceText() {
        const now = new Date().toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' });
        if (ai.shared && shared.enabled && sharedMeta && sharedMeta.version) {
            return `zentrale Einstellungen Version ${sharedMeta.version}` + (sharedMeta.updatedAt ? ` vom ${new Date(sharedMeta.updatedAt).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' })}` : '') + `; berechnet am ${now}`;
        }
        return `Einstellungen dieses Browsers; berechnet am ${now}`;
    }

    function buildView(c) {
        const r = computeFor(c);
        const t = tplOf(c);
        const pl = placementFor(c, r);
        const modelName = (window.CVAi?.MODELS.find(m => m.id === c.model) || { name: c.model || 'Claude' }).name.replace(/ \(.*\)$/, '');
        return {
            name: c.name, birth: c.birth, entries: c.entries, result: r, template: t, catName,
            hinweise: c.hinweise,
            created: new Date().toLocaleDateString('de-CH'),
            sourceText: c.source === 'ki' ? `KI-gestützt mit ${modelName} (Anthropic), durch eine Person geprüft` : 'regelbasiert (ohne KI), durch eine Person geprüft',
            rulesText: rulesText(t),
            formulaText: formulaHtml(c, r, t),
            placementText: placementText(c, pl),
            placementWhy: placementWhy(t, pl),
            salaryTableText: pl && pl.table ? tableLabel(pl.table) + (pl.future ? ' (am Stichtag noch nicht gültig)' : '') + ` · Monatslohn mit ${t.payments} Auszahlungen` : '',
            settingsText: settingsSourceText(),
            overrides: overrideCount(c),
            note: pl ? '' : t.note,
            suggestionText: c.suggestion && c.suggestion.id === c.templateId ? 'aus dem Lebenslauf vorgeschlagen' + (c.suggestion.reason ? ': ' + c.suggestion.reason : '') + (c.suggestion.source === 'ki' ? ' (Claude)' : ' (Stichwörter)') : '',
            baseText: t.baseName ? `Grundfunktion «${t.baseName}» +${t.baseDelta}` + (t.classCap ? `, max. LK ${t.classCap}` : '') : '',
            timeline: timelineHtml(c, r)
        };
    }

    // --- Rendering ---
    function catOptions(selected, includeSpecial) {
        const cats = includeSpecial ? allCats() : settings.categories;
        return cats.map(c => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
    }
    function tplOptions(selected) {
        return settings.templates.map(t => `<option value="${esc(t.id)}"${t.id === selected ? ' selected' : ''}>${esc(t.name)}</option>`).join('');
    }

    function render() {
        if (defaultTemplateId !== AUTO && !settings.templates.some(t => t.id === defaultTemplateId)) defaultTemplateId = settings.templates[0]?.id || '';
        $('#defaultTemplate').innerHTML = `<option value="${AUTO}"${defaultTemplateId === AUTO ? ' selected' : ''}>Funktion automatisch vorschlagen (aus dem Lebenslauf)</option>` + tplOptions(defaultTemplateId);
        $('#privacy').innerHTML = aiActive()
            ? `${icon('sparkles')} KI-Auswertung mit Claude ist aktiv${ai.mode === 'server' ? ' (über euren Server)' : ''}: Lebensläufe werden an Anthropic (USA) gesendet${ai.textOnly ? ', nur als Text ohne Bilder' : ''}.`
            : ai.enabled
                ? icon('alert') + ' KI-Auswertung ist eingeschaltet, aber nicht eingerichtet (Einstellungen prüfen). Es wird mit den Regeln gerechnet.'
                : storeActive() ? icon('lock') + ' Lebensläufe werden in diesem Browser ausgelesen und nicht an Claude gesendet.' : icon('lock') + ' Dateien werden nur lokal in diesem Browser verarbeitet und nirgends hochgeladen.';
        if (storeActive()) $('#privacy').innerHTML += `<br>${icon('database')} Auswertungen (erkannter Text und Ergebnis, ohne PDF-Dateien) werden in eurer Datenbank gespeichert${store.keepDays ? ` und nach ${store.keepDays} Tagen ohne Änderung gelöscht` : ''}.`
            + (store.error ? `<br><span class="warn store-warn">${icon('alert')} ${esc(store.error)}</span>` : '');
        else if (store.available) $('#privacy').innerHTML += `<br><span class="warn store-warn">${icon('alert')} Personen werden nicht gespeichert und sind nach dem Neuladen weg: ${esc(storeReason())}</span>`;
        renderOverview();
        renderDetail();
        scheduleSave();
    }

    // --- Auswertungen in der Datenbank (api/candidates.php) ---
    let store = { available: false, enabled: false, keepDays: 0, problem: '', error: '' };
    const savedJson = new Map(); // zuletzt gespeicherter Stand pro Person
    const PERSIST_FIELDS = ['id', 'name', 'autoName', 'birth', 'birthEdited', 'text', 'templateId', 'autoTemplate', 'suggestion', 'baseTemplateId',
        'adjustmentId', 'newPensum', 'newLessons', 'entries', 'source', 'model', 'hinweise', 'aiError'];
    const persistable = c => JSON.stringify(Object.fromEntries(PERSIST_FIELDS.map(k => [k, c[k] ?? null])));
    const storeActive = () => store.enabled && ai.storeCandidates !== false && !!ai.password;
    /** Warum nicht gespeichert wird (für den Hinweis auf der Startseite). */
    const storeReason = () => !store.enabled ? (store.problem || 'Die Datenbank ist nicht eingerichtet.')
        : !ai.password ? 'In den Einstellungen unter «Server und Zugang» fehlt das Zugangspasswort.'
        : 'Speichern ist in den Einstellungen ausgeschaltet.';
    async function storeRequest(method, query, body) {
        const res = await fetch(CANDIDATES_URL + (query || ''), {
            method, cache: 'no-store',
            headers: Object.assign({ 'x-app-password': ai.password || '' }, body ? { 'content-type': 'application/json' } : {}),
            body: body ? JSON.stringify(body) : undefined
        });
        let data = {};
        try { data = await res.json(); } catch (e) { /* keine JSON-Antwort */ }
        if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
        return data;
    }
    async function checkStore() {
        try {
            const res = await fetch(CANDIDATES_URL + '?action=status', { cache: 'no-store' });
            const d = res.ok ? await res.json() : null;
            store = d ? Object.assign(store, { available: true, enabled: !!d.enabled, keepDays: d.keepDays || 0, problem: d.problem || '' }) : Object.assign(store, { available: false, enabled: false });
        } catch (e) {
            store.available = store.enabled = false;
        }
    }
    /** Lädt die gespeicherten Personen (ergänzt, was noch nicht geladen ist). */
    async function loadStored() {
        await checkStore();
        if (!storeActive()) return 0;
        try {
            const { candidates: list } = await storeRequest('GET');
            let added = 0;
            for (const c of list || []) {
                if (candidates.some(x => x.id === c.id)) continue;
                const cand = Object.assign(newCandidate(c.name || 'Unbenannt', c.text || '', null), c, { loading: false, pdfBase64: null });
                if (!Array.isArray(cand.entries)) cand.entries = [];
                candidates.push(cand);
                savedJson.set(cand.id, persistable(cand));
                added++;
            }
            if (added && !selectedId) selectedId = candidates[0].id;
            store.error = '';
            return added;
        } catch (e) {
            store.error = 'Gespeicherte Auswertungen konnten nicht geladen werden: ' + e.message;
            setStatus(store.error, true);
            return 0;
        }
    }
    let saveTimer = null, saving = false;
    /** Speichert geänderte Personen kurz nach der letzten Änderung. */
    function scheduleSave() {
        if (!storeActive()) return;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveChanged, 300);
    }
    async function saveChanged() {
        if (saving) { scheduleSave(); return; }
        saving = true;
        try {
            for (const c of candidates.filter(x => !x.loading)) {
                const json = persistable(c);
                if (savedJson.get(c.id) === json) continue;
                await storeRequest('POST', '', { candidate: JSON.parse(json) });
                savedJson.set(c.id, json);
            }
            if (store.error) { store.error = ''; setStatus('Auswertungen wieder gespeichert.'); }
        } catch (e) {
            if (!store.error) setStatus('Auswertung konnte nicht in der Datenbank gespeichert werden: ' + e.message, true);
            store.error = 'Speichern fehlgeschlagen: ' + e.message;
            $('#privacy').innerHTML = $('#privacy').innerHTML.replace(/<br><span class="warn store-warn">.*$/, '') + `<br><span class="warn store-warn">${icon('alert')} ${esc(store.error)}</span>`;
        } finally {
            saving = false;
        }
    }

    function renderOverview() {
        $('#overview').hidden = candidates.length === 0;
        $('#overviewBody').innerHTML = candidates.map(c => {
            if (c.loading) {
                return `<tr data-select="${c.id}" class="${c.id === selectedId ? 'active' : ''}">
                    <td><strong>${esc(c.name)}</strong></td><td>${esc(tplOf(c).name)}</td>
                    <td colspan="5" class="loading-cell"><span class="spinner"></span> wird ausgewertet …</td><td></td></tr>`;
            }
            const r = computeFor(c);
            return `<tr data-select="${c.id}" class="${c.id === selectedId ? 'active' : ''}">
                <td><strong>${esc(c.name)}</strong>${c.source === 'ki' ? ` <span class="mini-ai" title="ausgewertet mit Claude">${icon('sparkles', 'ausgewertet mit Claude')}</span>` : ''}${(n => n ? ` <span class="badge badge-manual" title="${n} Anrechnung${n > 1 ? 'en' : ''} manuell angepasst">${icon('pencil')} ${n} manuell</span>` : '')(overrideCount(c))}</td>
                <td>${esc(tplOf(c).name)}${c.autoTemplate && c.suggestion && c.suggestion.id === c.templateId ? ' <span class="mini-ai" title="aus dem Lebenslauf vorgeschlagen">vorgeschlagen</span>' : ''}</td>
                <td class="num">${fmt(r.totalYears)}</td>
                <td class="num">${fmt(r.targetYears)}</td>
                <td class="num">${fmt(r.otherYears)}</td>
                <td class="num"><strong>${fmt(r.creditedYears)}</strong></td>
                <td class="num">${(pl => pl ? pl.fixed ? 'fixer Lohn' : `LK ${pl.cls} / St. ${pl.stage}` : `<button type="button" class="link-btn" data-edittpl="${esc(tplOf(c).id)}" title="Die Vorlage hat keine Lohnklassen">Lohnklassen fehlen</button>`)(placementFor(c, r))}</td>
                <td class="num"><button class="btn-icon" type="button" data-remove="${c.id}" title="Entfernen" aria-label="Entfernen">${icon('x')}</button></td>
            </tr>`;
        }).join('');
    }

    /** Vorgeschlagene Funktion mit Begründung und Alternativen (anklickbar). */
    function suggestionHtml(c) {
        const sg = c.suggestion;
        if (!sg) return c.autoTemplate ? '<p class="suggestion">Keine passende Funktion erkannt – bitte die Vorlage von Hand wählen. (Stichwörter für den Vorschlag stehen in den Einstellungen bei jeder Vorlage.)</p>' : '';
        const name = id => (settings.templates.find(t => t.id === id) || { name: '–' }).name;
        const btn = id => `<button type="button" class="link-btn" data-usetpl="${esc(id)}">${esc(name(id))}</button>`;
        const active = sg.id === c.templateId;
        return `<p class="suggestion">${active ? icon('sparkles') + ' Vorgeschlagene Funktion' : icon('lightbulb') + ' Laut Lebenslauf passt eher'}: <b>${active ? esc(name(sg.id)) : btn(sg.id)}</b>`
            + (sg.reason ? ` – ${esc(sg.reason)}` : '') + (sg.source === 'ki' ? ' (Claude)' : ' (Stichwörter)')
            + (sg.alternatives && sg.alternatives.length ? `<br>Weitere mögliche: ${sg.alternatives.filter(id => id !== c.templateId).map(btn).join(', ')}` : '')
            + '</p>';
    }

    function renderDetail() {
        const c = candidates.find(x => x.id === selectedId);
        const el = $('#detail');
        if (!c) { el.innerHTML = ''; return; }
        if (c.loading) {
            el.innerHTML = `<div class="card"><h2>${esc(c.name)}</h2><p class="empty"><span class="spinner"></span> wird ausgewertet …</p></div>`;
            return;
        }
        const t = tplOf(c);
        const r = computeFor(c);

        const rows = c.entries.map((e, i) => {
            const pe = r.perEntry[i];
            const auto = e.factorOverride === null || e.factorOverride === undefined || e.factorOverride === '';
            return `<tr class="${e.include ? '' : 'excluded'}" data-id="${e.id}">
                <td><input type="checkbox" data-f="include" ${e.include ? 'checked' : ''} aria-label="Anrechnen"></td>
                <td class="c-title">
                    <input type="text" data-f="title" value="${esc(e.title)}" aria-label="Funktion">
                    ${e.details ? `<div class="details" title="${esc(e.details)}">${esc(e.details)}</div>` : ''}
                </td>
                <td class="c-cat"><select data-f="category" aria-label="Beruf">${catOptions(e.category, true)}</select></td>
                <td class="c-date"><input type="month" data-f="start" value="${esc(e.start)}" aria-label="Von"></td>
                <td class="c-date">
                    ${e.ongoing ? '<div class="today">heute</div>' : `<input type="month" data-f="end" value="${esc(e.end)}" aria-label="Bis">`}
                    <label class="ongoing"><input type="checkbox" data-f="ongoing" ${e.ongoing ? 'checked' : ''}> bis heute</label>
                </td>
                <td class="c-small"><div class="suffix"><input type="number" min="0" max="100" data-f="pensum" value="${esc(e.pensum)}" aria-label="Pensum"><em>%</em></div></td>
                <td class="num">${pe.valid ? fmtYM(pe.months / 12) : '<span class="badge">Datum?</span>'}${e.imprecise ? '<span class="badge" title="Nur Jahreszahl angegeben – bitte Monate prüfen">ungenau</span>' : ''}</td>
                <td class="c-small">
                    <div class="suffix"><input type="number" min="0" max="100" data-f="factorOverride" value="${auto ? '' : esc(e.factorOverride)}" placeholder="${pe.factor}" aria-label="Faktor"><em>%</em></div>
                    ${auto ? `<div class="factor-auto" title="${esc(P.describeRule(t.rules[pe.ruleKey]))}">${esc((P.RULE_KEYS.find(k => k.id === pe.ruleKey) || {}).name || 'automatisch')}</div>` : '<div class="factor-auto">manuell</div>'}
                </td>
                <td class="num"><strong>${fmt(pe.credited / 12)}</strong></td>
                <td><button class="btn-icon" type="button" data-del="${e.id}" title="Zeile löschen" aria-label="Zeile löschen">${icon('x')}</button></td>
            </tr>`;
        }).join('');

        const tl = timelineHtml(c, r);
        el.innerHTML = `<div class="card">
            <div class="detail-head">
                <input type="text" class="name-input" data-cf="name" value="${esc(c.name)}" aria-label="Name">
                <div class="head-fields">
                    <label class="field"><span>Geburtsdatum</span><input type="month" data-cf="birth" value="${esc(c.birth)}"></label>
                    <label class="field"><span>Stelle / Vorlage</span><select data-cf="templateId">${tplOptions(t.id)}</select></label>
                    ${rawTplOf(c).baseTemplateId ? `<label class="field"><span>Grundfunktion</span><select data-cf="baseTemplateId">${settings.templates.filter(x => x.id !== t.id && x.classMin && !x.baseTemplateId).map(x => `<option value="${esc(x.id)}"${x.id === (c.baseTemplateId || rawTplOf(c).baseTemplateId) ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : ''}
                    ${t.classMin || t.fixedAnnual ? `${t.lessonsFull
                        ? `<label class="field"><span>Lektionen neue Stelle</span><div class="suffix"><input type="number" min="0.5" max="${esc(t.lessonsFull)}" step="0.5" data-cf="newLessons" value="${esc(c.newLessons ?? t.lessonsFull)}"><em>von ${esc(fmtNum(t.lessonsFull))}</em></div></label>`
                        : `<label class="field"><span>Pensum neue Stelle</span><div class="suffix"><input type="number" min="1" max="100" data-cf="newPensum" value="${esc(c.newPensum)}"><em>%</em></div></label>`}
                    <label class="field"><span>Korrektur Lohnklasse</span><select data-cf="adjustmentId"><option value="">keine</option>${(settings.classAdjustments || []).map(a => `<option value="${esc(a.id)}"${a.id === c.adjustmentId ? ' selected' : ''}>${esc(a.label)}</option>`).join('')}</select></label>` : ''}
                </div>
            </div>
            <p class="source">${c.source === 'ki' ? `<span class="pill pill-ai">${icon('sparkles')} ausgewertet mit Claude</span>` : '<span class="pill">ausgewertet mit Regeln</span>'}
                ${c.aiError ? `<span class="source-error">KI-Auswertung fehlgeschlagen: ${esc(c.aiError)}</span>` : ''}
                ${t.minAge && !c.birth ? '<span class="source-error">Geburtsdatum fehlt – Mindestalter wird nicht geprüft</span>' : ''}</p>
            ${suggestionHtml(c)}
            ${c.hinweise ? `<div class="notice"><b>Hinweis von Claude:</b> ${esc(c.hinweise)}</div>` : ''}
            <div class="stats">
                <div class="stat"><div class="label">Berufserfahrung total</div><div class="value">${fmt(r.totalYears)}<span class="unit">J.</span></div><div class="extra">${fmtYM(r.totalYears)}</div></div>
                <div class="stat"><div class="label">davon als ${esc(catName(t.target))}</div><div class="value">${fmt(r.targetYears)}<span class="unit">J.</span></div><div class="extra">${fmtYM(r.targetYears)}</div></div>
                <div class="stat"><div class="label">andere Berufe</div><div class="value">${fmt(r.otherYears)}<span class="unit">J.</span></div><div class="extra">${fmtYM(r.otherYears)}</div></div>
                <div class="stat primary"><div class="label">Anrechenbare Jahre</div><div class="value">${fmt(r.creditedYears)}<span class="unit">J.</span></div><div class="extra">${r.rounded || r.capped ? 'ungerundet ' + fmt(r.exactYears) + ' J.' : fmtYM(r.creditedYears)}</div></div>
            </div>
            ${!placementFor(c, r) && t.note ? `<div class="notice"><b>Hinweis zur Einreihung:</b> ${esc(t.note)}</div>` : ''}
            ${!placementFor(c, r) ? `<div class="notice"><b>Keine Lohneinreihung:</b> Die Vorlage «${esc(t.name)}» hat keine Lohnklassen. Eine Vorlage des Einreihungsplans wählen oder bei dieser Vorlage «Lohnklasse von/bis» eintragen. <button type="button" class="link-btn" data-edittpl="${esc(t.id)}">Vorlage bearbeiten</button></div>` : ''}
            ${(pl => pl ? `<div class="placement"><div class="placement-main"><span class="label">Vorschlag Lohneinreihung</span><b>${esc(placementText(c, pl))}</b></div><div class="placement-why">${esc(placementWhy(t, pl))}</div></div>` : '')(placementFor(c, r))}
            <div class="formula">${formulaHtml(c, r, t)}<div class="rules">Regeln «${esc(t.name)}»: ${esc(rulesText(t))} <button type="button" class="link-btn" data-edittpl="${esc(t.id)}">Gewichtungen anpassen</button></div></div>
            ${tl ? `<h3 class="sub-h">Zeitstrahl</h3>${tl}` : ''}
            ${c.entries.length ? `<h3 class="sub-h">Stellen</h3><div class="table-scroll"><table class="table entries-table">
                <thead><tr>
                    <th title="Anrechnen">${icon('check', 'Anrechnen')}</th><th>Funktion / Stelle</th><th>Beruf</th><th>Von</th><th>Bis</th>
                    <th>Pensum</th><th class="num">Dauer</th><th title="Anrechnung pro Monat nach den Regeln der Vorlage; überschreibbar">Anrechnung</th><th class="num">Angerechnet</th><th></th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table></div>` : '<p class="empty">Keine Zeiträume erkannt. Bitte Stellen manuell hinzufügen.</p>'}
            <div class="detail-actions">
                <button class="btn btn-ghost btn-sm" type="button" data-action="add">+ Stelle hinzufügen</button>
                <button class="btn btn-ghost btn-sm" type="button" data-action="reparse">Neu auswerten</button>
                <button class="btn btn-primary btn-sm" type="button" data-action="report">Bericht (PDF)</button>
            </div>
            ${c.text.trim() ? `<details class="rawtext"><summary>Erkannter Text anzeigen</summary><pre>${esc(c.text)}</pre></details>` : ''}
        </div>`;
    }

    // --- Tooltip für den Zeitstrahl ---
    const tip = document.createElement('div');
    tip.className = 'tip';
    tip.hidden = true;
    document.body.appendChild(tip);
    function showTip(target, x, y) {
        tip.textContent = target.dataset.tip;
        tip.hidden = false;
        const w = tip.offsetWidth, h = tip.offsetHeight;
        tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2)) + 'px';
        tip.style.top = Math.max(8, y - h - 12) + 'px';
    }
    document.addEventListener('mousemove', e => {
        const t = e.target.closest?.('[data-tip]');
        if (t) showTip(t, e.clientX, e.clientY); else tip.hidden = true;
    });
    document.addEventListener('focusin', e => {
        const t = e.target.closest?.('[data-tip]');
        if (t) { const b = t.getBoundingClientRect(); showTip(t, b.left + b.width / 2, b.top); } else tip.hidden = true;
    });
    document.addEventListener('scroll', () => { tip.hidden = true; }, true);

    // --- Events: Upload ---
    const dz = $('#dropzone');
    dz.addEventListener('click', () => $('#fileInput').click());
    dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#fileInput').click(); } });
    $('#fileInput').addEventListener('change', e => {
        const files = Array.from(e.target.files);
        e.target.value = '';
        processSources(files.map(f => ({ name: f.name, file: f })));
    });
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', e => processSources(Array.from(e.dataTransfer.files).map(f => ({ name: f.name, file: f }))));

    $('#defaultTemplate').addEventListener('change', e => {
        defaultTemplateId = e.target.value;
        storageSet(TEMPLATE_KEY, defaultTemplateId);
        candidates.forEach(c => {
            c.autoTemplate = defaultTemplateId === AUTO;
            c.baseTemplateId = '';
            if (!c.autoTemplate) c.templateId = defaultTemplateId;
            else if (c.suggestion) c.templateId = c.suggestion.id;
        });
        render();
    });

    $('#pasteBtn').addEventListener('click', () => {
        $('#pasteName').value = '';
        $('#pasteText').value = '';
        $('#pasteDialog').showModal();
    });
    $('#pasteDialog').addEventListener('close', () => {
        if ($('#pasteDialog').returnValue !== 'ok') return;
        const text = $('#pasteText').value;
        if (!text.trim()) return;
        const name = $('#pasteName').value.trim();
        processSources([{ name: name || 'Eingefügter Text', text, fixedName: !!name }]);
    });

    $('#exampleBtn').addEventListener('click', () => processSources([{ name: 'Beispiel Anna Muster', text: EXAMPLE }]));

    // --- Events: Übersicht ---
    $('#overviewBody').addEventListener('click', e => {
        const rm = e.target.closest('[data-remove]');
        if (rm) {
            const i = candidates.findIndex(c => c.id === rm.dataset.remove);
            if (i < 0) return;
            if (savedJson.has(candidates[i].id)) {
                if (!confirm(`«${candidates[i].name}» endgültig löschen? Die Auswertung wird auch aus der Datenbank entfernt.`)) return;
                const id = candidates[i].id;
                storeRequest('DELETE', '?id=' + encodeURIComponent(id)).then(() => savedJson.delete(id))
                    .catch(err => setStatus('Konnte nicht aus der Datenbank gelöscht werden: ' + err.message, true));
            }
            candidates.splice(i, 1);
            if (selectedId === rm.dataset.remove) selectedId = candidates[0]?.id || null;
            render();
            return;
        }
        const edit = e.target.closest('[data-edittpl]');
        if (edit) { openSettings(edit.dataset.edittpl); return; }
        const row = e.target.closest('[data-select]');
        if (row) { selectedId = row.dataset.select; render(); }
    });
    $('#reportAll').addEventListener('click', () => {
        const ready = candidates.filter(c => !c.loading);
        if (ready.length) CVReport.print(ready.map(buildView));
    });

    // --- Events: Detail ---
    const detail = $('#detail');
    detail.addEventListener('change', e => {
        const c = candidates.find(x => x.id === selectedId);
        if (!c || c.loading) return;
        const t = e.target;
        if (t.dataset.cf) {
            const lessonsFull = tplOf(c).lessonsFull || 0;
            c[t.dataset.cf] = t.dataset.cf === 'newPensum' ? Math.max(1, Math.min(100, +t.value || 100))
                : t.dataset.cf === 'newLessons' ? (t.value === '' ? null : Math.max(0.5, Math.min(lessonsFull, +t.value)))
                : t.value;
            if (t.dataset.cf === 'name') c.autoName = false;
            if (t.dataset.cf === 'templateId') { c.autoTemplate = false; c.baseTemplateId = ''; }
            if (t.dataset.cf === 'birth') c.birthEdited = true;
            render();
            return;
        }
        const row = t.closest('tr[data-id]');
        if (!row || !t.dataset.f) return;
        const entry = c.entries.find(x => x.id === row.dataset.id);
        const f = t.dataset.f;
        if (t.type === 'checkbox') entry[f] = t.checked;
        else if (f === 'pensum') entry[f] = t.value === '' ? 100 : Math.max(0, Math.min(100, +t.value));
        else if (f === 'factorOverride') entry[f] = t.value === '' ? null : Math.max(0, Math.min(100, +t.value));
        else entry[f] = t.value;
        if (f === 'start' || f === 'end') entry.imprecise = false;
        if (f === 'ongoing' && !t.checked && !entry.end) {
            const now = new Date();
            entry.end = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        }
        if (f === 'category') entry.include = t.value !== '__ausbildung' || tplOf(c).rules.education.factor > 0;
        render();
    });
    detail.addEventListener('click', e => {
        const c = candidates.find(x => x.id === selectedId);
        if (!c || c.loading) return;
        const del = e.target.closest('[data-del]');
        if (del) {
            c.entries = c.entries.filter(x => x.id !== del.dataset.del);
            render();
            return;
        }
        const use = e.target.closest('[data-usetpl]');
        if (use) { c.templateId = use.dataset.usetpl; c.baseTemplateId = ''; c.autoTemplate = false; render(); return; }
        const edit = e.target.closest('[data-edittpl]');
        if (edit) { openSettings(edit.dataset.edittpl); return; }
        const act = e.target.closest('[data-action]');
        if (!act) return;
        if (act.dataset.action === 'add') {
            c.entries.push({
                id: 'e' + Math.random().toString(36).slice(2, 9), include: true, start: '', end: '', ongoing: false,
                title: '', details: '', category: tplOf(c).target, pensum: 100, factorOverride: null, raw: '', imprecise: false
            });
            render();
            const inputs = detail.querySelectorAll('input[data-f="title"]');
            inputs[inputs.length - 1]?.focus();
        } else if (act.dataset.action === 'report') {
            CVReport.print([buildView(c)]);
        } else if (act.dataset.action === 'reparse') {
            if (!confirm('Lebenslauf neu auswerten? Manuelle Änderungen an den Stellen gehen verloren.')) return;
            withBusy(async () => {
                let useAi = aiActive() && (await ensurePrivacyAck());
                if (useAi && !c.pdfBase64 && !c.text.trim()) useAi = false; // nichts zum Senden vorhanden
                setStatus(useAi ? 'Claude wertet ' + c.name + ' neu aus …' : '');
                c.loading = true;
                render();
                await analyzeCandidate(c, useAi);
                c.loading = false;
                setStatus(c.aiError ? 'KI-Auswertung fehlgeschlagen (' + c.aiError + ') – Regeln verwendet' : '', !!c.aiError);
                render();
            });
        }
    });

    // --- CSV-Export ---
    $('#exportCsv').addEventListener('click', () => {
        const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
        const n = y => (Math.round(y * 100) / 100).toFixed(2).replace('.', ',');
        const lines = [['Person', 'Geburtsdatum', 'Stelle / Vorlage', 'Total Jahre', 'Jahre im Zielberuf', 'Jahre andere Berufe', 'Anrechenbare Jahre (ungerundet)', 'Anrechenbare Jahre', 'Lohnklasse', 'Lohnstufe', 'Jahreslohn 100 %', 'Pensum neue Stelle %', 'Jahreslohn neue Stelle', 'Monatslohn', 'Gehaltstabelle', 'Manuell angepasste Anrechnungen', 'Auswertung'].map(q).join(';')];
        const details = [['Person', 'Funktion', 'Details', 'Beruf', 'Von', 'Bis', 'Pensum %', 'Angerechnet (ja/nein)', 'Anrechnung %', 'Dauer Jahre', 'Angerechnete Jahre'].map(q).join(';')];
        for (const c of candidates.filter(x => !x.loading)) {
            const r = computeFor(c);
            const pl = placementFor(c, r);
            lines.push([q(c.name), q(c.birth), q(tplOf(c).name), n(r.totalYears), n(r.targetYears), n(r.otherYears), n(r.exactYears), n(r.creditedYears),
                pl && !pl.fixed ? pl.cls : '', pl && !pl.fixed ? pl.stage : '', pl && pl.salary ? n(pl.salary) : '', n(pensumOf(c, tplOf(c))),
                pl && pl.salary ? n(pl.salary * pensumOf(c, tplOf(c)) / 100) : '', pl && pl.salary ? n(pl.salary * pensumOf(c, tplOf(c)) / 100 / tplOf(c).payments) : '',
                q(pl && pl.table ? pl.table.name + (pl.table.validFrom ? ' ab ' + fmtDay(pl.table.validFrom) : '') : ''), overrideCount(c), q(c.source === 'ki' ? 'Claude' : 'Regeln')].join(';'));
            c.entries.forEach((e, i) => {
                const pe = r.perEntry[i];
                details.push([q(c.name), q(e.title), q(e.details), q(catName(e.category)), q(e.start), q(e.ongoing ? 'heute' : e.end), e.pensum,
                    q(e.include ? 'ja' : 'nein'), pe.factor, n(pe.months / 12), n(pe.credited / 12)].join(';'));
            });
        }
        const csv = '﻿' + lines.join('\r\n') + '\r\n\r\n' + details.join('\r\n') + '\r\n';
        download('berufserfahrung.csv', csv, 'text/csv;charset=utf-8');
    });

    function download(name, content, type) {
        const url = URL.createObjectURL(new Blob([content], { type }));
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // --- Einstellungen ---
    let draft = null;
    let draftAi = null;

    function renderAiForm() {
        const models = window.CVAi ? window.CVAi.MODELS : [{ id: 'claude-opus-5', name: 'Claude Opus 5' }];
        const current = draftAi.model || (window.CVAi ? window.CVAi.DEFAULT_MODEL : 'claude-opus-5');
        $('#aiEnabled').checked = draftAi.enabled;
        document.querySelectorAll('input[name="aiMode"]').forEach(r => { r.checked = r.value === draftAi.mode; });
        $('#aiKey').value = draftAi.apiKey;
        $('#aiPassword').value = draftAi.password;
        $('#adminPassword').value = draftAi.adminPassword || '';
        $('#adminPasswordField').hidden = !shared.adminRequired;
        $('#sharedEnabled').checked = draftAi.shared !== false;
        $('#sharedEnabled').disabled = !shared.enabled;
        $('#sharedStatus').innerHTML = sharedStatusHtml();
        $('#storeCandidates').checked = draftAi.storeCandidates !== false;
        $('#storeCandidates').disabled = !store.enabled;
        $('#storeStatus').innerHTML = !store.available ? '<span class="warn">Keine Datenbank-Anbindung gefunden (braucht PHP-Hosting und api/candidates.php). Personen sind nach dem Neuladen weg.</span>'
            : !store.enabled ? `<span class="warn">${esc(store.problem || 'Datenbank ist nicht eingerichtet.')}</span>`
            : draftAi.storeCandidates === false ? 'Personen werden nicht gespeichert und sind nach dem Neuladen weg.'
            : `<span class="ok">${icon('check')} Datenbank verbunden</span>${store.keepDays ? ` – Personen ohne Änderung werden nach ${store.keepDays} Tagen gelöscht` : ''}. PDF-Dateien werden nicht gespeichert, nur der erkannte Text und die Auswertung.`
              + (store.error ? `<br><span class="warn">${esc(store.error)}</span>` : '');
        $('#aiTextOnly').checked = draftAi.textOnly;
        $('#aiModel').innerHTML = models.map(m => `<option value="${esc(m.id)}"${m.id === current ? ' selected' : ''}>${esc(m.name)}</option>`).join('');
        $('#serverStatus').innerHTML = server.configured
            ? '<span class="ok">' + icon('check') + ' Server ist eingerichtet' + (server.passwordRequired ? ', Zugangspasswort erforderlich' : '') + '</span>'
                + (server.passwordRequired ? '' : '<br><span class="warn">Achtung: kein Zugangspasswort gesetzt – bitte in config.php «password» eintragen.</span>')
                + (server.keyFormatOk ? '' : '<br><span class="warn">Der Schlüssel beginnt nicht mit «sk-ant-» – bitte prüfen.</span>')
            : server.available
                ? `<span class="warn">Server erreichbar, aber noch nicht eingerichtet: ${esc(server.problem || 'config.php fehlt, siehe Anleitung.')}</span>`
                : '<span class="warn">Kein Server gefunden. Die Website braucht PHP-Hosting, siehe Anleitung.</span>';
        $('#aiServerFields').hidden = draftAi.mode !== 'server';
        $('#aiKeyFields').hidden = draftAi.mode !== 'key';
    }
    function readAiForm() {
        draftAi.enabled = $('#aiEnabled').checked;
        draftAi.mode = document.querySelector('input[name="aiMode"]:checked')?.value || 'server';
        draftAi.apiKey = $('#aiKey').value.trim();
        draftAi.password = $('#aiPassword').value;
        draftAi.adminPassword = $('#adminPassword').value;
        draftAi.shared = $('#sharedEnabled').checked;
        draftAi.storeCandidates = $('#storeCandidates').checked;
        draftAi.textOnly = $('#aiTextOnly').checked;
        draftAi.model = $('#aiModel').value;
    }

    function sharedStatusHtml() {
        if (!shared.available) return '<span class="warn">Kein Server für zentrale Einstellungen gefunden (braucht PHP-Hosting und api/settings.php). Einstellungen werden nur in diesem Browser gespeichert.</span>';
        if (!shared.enabled) return `<span class="warn">${esc(shared.problem || 'Zentrale Einstellungen sind auf dem Server nicht eingerichtet.')}</span>`;
        if (draftAi.shared === false) return 'Einstellungen werden nur in diesem Browser gespeichert.';
        const when = shared.updatedAt ? ' vom ' + new Date(shared.updatedAt).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' }) : '';
        let html = shared.exists
            ? `<span class="ok">${icon('check')} Zentrale Einstellungen: Version ${shared.version}${esc(when)}</span>`
            : '<span class="ok">' + icon('check') + ' Server bereit</span> – noch keine zentralen Einstellungen gespeichert. Beim nächsten «Speichern» werden die Einstellungen dieses Browsers für alle übernommen.';
        if (shared.error) html += `<br><span class="warn">${esc(shared.error)}</span>`;
        if (shared.adminRequired) html += '<br>Zum Speichern braucht es das Admin-Passwort.';
        return html;
    }

    const numField = (label, key, val, opts) => {
        opts = opts || {};
        return `<label class="field"><span>${label}</span><div class="suffix"><input type="number" data-t="${key}" min="0" ${opts.max !== undefined ? `max="${opts.max}"` : ''} step="${opts.step || 1}" value="${val ?? ''}" placeholder="${opts.placeholder || ''}"><em>${opts.unit || '%'}</em></div></label>`;
    };
    const r1 = v => Math.round(v * 100) / 100;

    function rulesGrid(t) {
        return `<div class="rules-grid">
            <div class="rg-head">Tätigkeit</div><div class="rg-head">Anrechnungsart</div><div class="rg-head">Anrechnung</div><div class="rg-head">bis 50 % Pensum</div>
            ${P.RULE_KEYS.map(k => {
                const r = t.rules[k.id];
                return `<div class="rg-name">${esc(k.name)}</div>
                <select data-r="${k.id}" data-rf="mode" aria-label="${esc(k.name)}: Anrechnungsart">${P.MODES.map(m => `<option value="${m.id}"${m.id === r.mode ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
                <div class="suffix"><input type="number" min="0" max="100" step="0.01" data-r="${k.id}" data-rf="factor" value="${r1(r.factor)}" aria-label="${esc(k.name)}: Anrechnung"><em>%</em></div>
                <div class="suffix"><input type="number" min="0" max="100" step="0.01" data-r="${k.id}" data-rf="low" value="${r1(r.low)}" ${r.mode === 'threshold' ? '' : 'disabled'} aria-label="${esc(k.name)}: bis 50 % Pensum"><em>%</em></div>`;
            }).join('')}
        </div>`;
    }

    function renderTemplatesForm(openId) {
        const open = new Set([...document.querySelectorAll('#tplList details[open]')].map(d => d.dataset.tpl));
        if (openId) open.add(openId);
        $('#tplList').innerHTML = draft.templates.map(t => `<details class="tpl-item" data-tpl="${esc(t.id)}" ${open.has(t.id) ? 'open' : ''}>
            <summary><span class="tpl-name">${esc(t.name)}</span><span class="tpl-target">Zielberuf: ${esc((draft.categories.concat(P.SPECIAL_CATEGORIES).find(c => c.id === t.target) || { name: '–' }).name)}${(e => e.fixedAnnual ? ` · fixer Lohn ${chf(+e.fixedAnnual)}` : e.classMin ? ` · Lohnklasse ${e.classMin}${e.classMax && e.classMax !== e.classMin ? '–' + e.classMax : ''}${e.baseName ? ' (Grundfunktion +' + e.baseDelta + ')' : ''}` : '')(P.effectiveTemplate(t, draft.templates))}${t.keywords && t.keywords.length ? ' · ' + icon('sparkles', 'mit Stichwörtern für den Vorschlag') : ''}</span></summary>
            <div class="tpl-body">
                <div class="grid-2">
                    <label class="field"><span>Name der Vorlage (z. B. «Primarlehrperson»)</span><input type="text" data-t="name" value="${esc(t.name)}"></label>
                    <label class="field"><span>Zielberuf (zählt als «gleicher Beruf»)</span><select data-t="target">${draft.categories.concat(P.SPECIAL_CATEGORIES.filter(x => P.TARGETABLE_SPECIALS.includes(x.id))).map(c => `<option value="${esc(c.id)}"${c.id === t.target ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
                </div>
                <div class="cat-related"><span>Verwandte Berufe:</span>${draft.categories.filter(o => o.id !== t.target).map(o =>
                    `<label class="check"><input type="checkbox" data-rel="${esc(o.id)}" ${t.related.includes(o.id) ? 'checked' : ''}> ${esc(o.name)}</label>`).join('')}</div>
                ${rulesGrid(t)}
                <div class="grid-4">
                    <label class="field"><span>Gleichzeitige Tätigkeiten</span><select data-t="combine">
                        <option value="max"${t.combine === 'max' ? ' selected' : ''}>höchste Anrechnung zählt</option>
                        <option value="sum"${t.combine === 'sum' ? ' selected' : ''}>addieren, max. 100 % pro Monat</option></select></label>
                    <label class="field"><span>Stichtag</span><select data-t="cutoff">
                        <option value="today"${t.cutoff !== 'yearEnd' ? ' selected' : ''}>heute</option>
                        <option value="yearEnd"${t.cutoff === 'yearEnd' ? ' selected' : ''}>31.12. des laufenden Jahres</option></select></label>
                    ${numField('Familienarbeit max.', 'familyMaxYears', t.familyMaxYears, { unit: 'J.', step: 0.5, placeholder: 'kein' })}
                    ${numField('Anrechnung ab Alter', 'minAge', t.minAge, { unit: 'J.', placeholder: 'kein' })}
                    ${numField('Höchstens anrechenbar', 'maxYears', t.maxYears, { unit: 'J.', step: 0.5, placeholder: 'kein' })}
                    <label class="field"><span>Rundung</span><select data-t="rounding">${P.ROUNDING.map(r => `<option value="${r.id}"${r.id === t.rounding ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
                </div>
                <div class="grid-4">
                    ${numField('Lohnklasse von', 'classMin', t.classMin, { unit: 'LK', placeholder: 'keine' })}
                    ${numField('Lohnklasse bis', 'classMax', t.classMax, { unit: 'LK', placeholder: 'keine' })}
                    <label class="field"><span>Klassenaufstieg nach Jahren</span><input type="text" data-t="classUpYears" value="${esc((t.classUpYears || []).join(', '))}" placeholder="z. B. 12, 24"></label>
                    <label class="field"><span>Gehaltstabelle</span><select data-t="salaryTableId">
                        <option value="">automatisch (gültig am Stichtag)</option>
                        ${draft.salaryTables.map(st => `<option value="${esc(st.id)}"${st.id === t.salaryTableId ? ' selected' : ''}>${esc(st.name)}${st.validFrom ? ' ab ' + esc(fmtDay(st.validFrom)) : ''}</option>`).join('')}</select></label>
                </div>
                <div class="grid-4">
                    <label class="field"><span>Gemäss Grundfunktion</span><select data-t="baseTemplateId">
                        <option value="">nein (eigene Lohnklassen)</option>
                        ${draft.templates.filter(x => x.id !== t.id && !x.baseTemplateId).map(x => `<option value="${esc(x.id)}"${x.id === t.baseTemplateId ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
                    ${numField('plus Klassen', 'baseDelta', t.baseDelta, { unit: 'LK', placeholder: '1' })}
                    ${numField('höchstens Klasse', 'classCap', t.classCap, { unit: 'LK', placeholder: 'keine' })}
                    ${numField('Fixer Jahreslohn (statt Lohnklasse)', 'fixedAnnual', t.fixedAnnual, { unit: 'CHF', step: 0.05, placeholder: 'kein' })}
                </div>
                <div class="grid-4">
                    <label class="field"><span>Monatslohn</span><select data-t="payments">
                        <option value="13"${t.payments !== 12 ? ' selected' : ''}>13 Auszahlungen</option>
                        <option value="12"${t.payments === 12 ? ' selected' : ''}>12 Auszahlungen</option></select></label>
                    ${numField('Lektionen bei 100 % (optional)', 'lessonsFull', t.lessonsFull, { unit: 'Lekt.', step: 0.5, placeholder: 'Pensum in %' })}
                </div>
                <div class="grid-2">
                    <label class="field"><span>Stichwörter für den automatischen Vorschlag (Ausbildung/Tätigkeit im Lebenslauf; «a+b» = beide im gleichen Eintrag)</span><textarea rows="2" data-t="keywords" placeholder="z. B. sozialpädagog+hf, sozialpädagog+fh">${esc((t.keywords || []).join(', '))}</textarea></label>
                    <label class="field"><span>Hinweis zur Einreihung (erscheint beim Lohnvorschlag und im Bericht)</span><textarea rows="2" data-t="note">${esc(t.note || '')}</textarea></label>
                </div>
                <div class="row-gap">
                    <button class="btn btn-ghost btn-sm" type="button" data-copytpl="${esc(t.id)}">Duplizieren</button>
                    <button class="btn btn-ghost btn-sm" type="button" data-deltpl="${esc(t.id)}">Löschen</button>
                </div>
            </div>
        </details>`).join('');
    }

    function renderCatsForm() {
        $('#catList').innerHTML = draft.categories.map(cat => `<div class="cat-item" data-cat="${esc(cat.id)}">
            <label class="field"><span>Bezeichnung</span><input type="text" data-k="name" value="${esc(cat.name)}" required></label>
            <label class="field"><span>Stichwörter (durch Komma getrennt)</span><textarea rows="2" data-k="keywords">${esc(cat.keywords.join(', '))}</textarea></label>
            <button class="btn-icon" type="button" data-delcat="${esc(cat.id)}" title="Beruf löschen" aria-label="Beruf löschen">${icon('x')}</button>
        </div>`).join('');
    }

    const SALARY_KINDS = [{ id: 'classes', name: 'Jahreslohn' }, { id: 'lessons', name: 'pro Lektion' }, { id: 'hours', name: 'pro Stunde' }];
    const salaryView = {}; // pro Tabelle: welche Werte gerade angezeigt werden

    function salarySummary(st) {
        const cls = Object.keys(st.classes).map(Number).sort((a, b) => a - b);
        const stages = Math.max(0, ...cls.map(k => st.classes[k].length));
        const extra = SALARY_KINDS.slice(1).filter(k => Object.keys(st[k.id] || {}).length).map(k => k.name);
        const n = P.checkSalaryTable(st).length;
        return `${st.validFrom ? 'gültig ab ' + esc(fmtDay(st.validFrom)) : 'ohne Gültigkeitsdatum'} · LK ${cls[0]}–${cls[cls.length - 1]} · ${stages} Stufen${extra.length ? ' · ' + extra.join(', ') : ''}`
            + (n ? ` <span class="badge">${icon('alert')} ${n} Hinweis${n > 1 ? 'e' : ''}</span>` : ` <span class="ok">${icon('check')} geprüft</span>`);
    }
    function salaryWarnings(st) {
        const w = P.checkSalaryTable(st);
        return w.length ? `<div class="notice"><b>Bitte prüfen:</b><ul>${w.slice(0, 8).map(x => `<li>${esc(x)}</li>`).join('')}${w.length > 8 ? `<li>… und ${w.length - 8} weitere</li>` : ''}</ul></div>` : '';
    }

    /** Gehaltstabellen im Einstellungsdialog: Übersicht, Prüfung und bearbeitbare Werte. */
    function renderSalaryList(openId) {
        const open = new Set([...document.querySelectorAll('#salaryList details[open]')].map(d => d.dataset.st));
        if (openId) open.add(openId);
        const sorted = draft.salaryTables.slice().sort((a, b) => (b.validFrom || '').localeCompare(a.validFrom || ''));
        $('#salaryList').innerHTML = sorted.length ? sorted.map(st => {
            const cls = Object.keys(st.classes).map(Number).sort((a, b) => a - b);
            const stages = Math.max(0, ...cls.map(k => st.classes[k].length));
            const kinds = SALARY_KINDS.filter(k => k.id === 'classes' || Object.keys(st[k.id] || {}).length);
            const view = kinds.some(k => k.id === salaryView[st.id]) ? salaryView[st.id] : 'classes';
            const m = st[view] || {};
            const cell = v => v == null ? '' : Number.isInteger(v) ? String(v) : v.toFixed(2);
            return `<details class="tpl-item" data-st="${esc(st.id)}" ${open.has(st.id) ? 'open' : ''}>
                <summary><span class="tpl-name">${esc(st.name)}</span><span class="tpl-target" data-sum>${salarySummary(st)}</span></summary>
                <div class="tpl-body">
                    <div class="grid-2">
                        <label class="field"><span>Bezeichnung</span><input type="text" data-sf="name" value="${esc(st.name)}"></label>
                        <label class="field"><span>Gültig ab (leer = immer)</span><input type="date" data-sf="validFrom" value="${esc(st.validFrom || '')}"></label>
                    </div>
                    ${st.note ? `<p class="hint">${esc(st.note)}</p>` : ''}
                    <div data-warn>${salaryWarnings(st)}</div>
                    <div class="salary-row">
                        ${kinds.length > 1 ? `<label class="field inline"><span>Anzeigen</span><select data-sview>${kinds.map(k => `<option value="${k.id}"${k.id === view ? ' selected' : ''}>${k.name}</option>`).join('')}</select></label>` : '<span></span>'}
                        <button class="btn btn-ghost btn-sm" type="button" data-delst="${esc(st.id)}">Tabelle löschen</button>
                    </div>
                    <div class="table-scroll"><table class="table salary-table">
                        <thead><tr><th>LK</th>${Array.from({ length: stages }, (_, i) => `<th class="num">Stufe ${i + 1}</th>`).join('')}</tr></thead>
                        <tbody>${cls.map(k => `<tr><th>${k}</th>${Array.from({ length: stages }, (_, i) => `<td><input type="text" inputmode="decimal" class="cell" data-cell data-kind="${view}" data-cls="${k}" data-i="${i}" value="${esc(cell(m[k] ? m[k][i] : null))}" aria-label="LK ${k} Stufe ${i + 1}"></td>`).join('')}</tr>`).join('')}</tbody>
                    </table></div>
                </div>
            </details>`;
        }).join('') : '<p class="hint">Keine Gehaltstabelle hinterlegt.</p>';
    }

    function renderSettingsForm(openTplId) {
        renderTemplatesForm(openTplId);
        renderCatsForm();
        renderSalaryList();
    }

    function readSettingsForm() {
        document.querySelectorAll('#catList .cat-item').forEach(item => {
            const cat = draft.categories.find(c => c.id === item.dataset.cat);
            cat.name = item.querySelector('[data-k="name"]').value.trim() || 'Unbenannt';
            cat.keywords = item.querySelector('[data-k="keywords"]').value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        });
        document.querySelectorAll('#tplList .tpl-item').forEach(item => {
            const t = draft.templates.find(x => x.id === item.dataset.tpl);
            const v = k => item.querySelector(`[data-t="${k}"]`).value;
            const optNum = k => v(k) === '' || +v(k) <= 0 ? null : +v(k);
            t.name = v('name').trim() || 'Unbenannte Vorlage';
            t.target = v('target');
            P.RULE_KEYS.forEach(k => {
                const f = rf => item.querySelector(`[data-r="${k.id}"][data-rf="${rf}"]`).value;
                const pct = (x, d) => x === '' ? d : Math.max(0, Math.min(100, +x));
                t.rules[k.id] = { mode: f('mode'), factor: pct(f('factor'), 0), low: pct(f('low'), 0) };
            });
            t.combine = v('combine');
            t.cutoff = v('cutoff');
            t.familyMaxYears = optNum('familyMaxYears');
            t.minAge = optNum('minAge');
            t.maxYears = optNum('maxYears');
            t.rounding = v('rounding');
            t.classMin = optNum('classMin');
            t.classMax = optNum('classMax');
            if (t.classMin && t.classMax && t.classMax < t.classMin) t.classMax = t.classMin;
            t.classUpYears = v('classUpYears').split(/[,; ]+/).map(Number).filter(n => n > 0).sort((a, b) => a - b);
            t.salaryTableId = v('salaryTableId');
            t.payments = +v('payments') === 12 ? 12 : 13;
            t.lessonsFull = optNum('lessonsFull');
            t.baseTemplateId = v('baseTemplateId') === t.id ? '' : v('baseTemplateId');
            t.baseDelta = v('baseDelta') === '' ? 1 : +v('baseDelta');
            t.classCap = optNum('classCap');
            t.fixedAnnual = optNum('fixedAnnual');
            t.keywords = v('keywords').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
            t.note = v('note').trim();
            t.related = [...item.querySelectorAll('[data-rel]:checked')].map(x => x.dataset.rel).filter(r => r !== t.target);
        });
        document.querySelectorAll('#salaryList [data-st]').forEach(item => {
            const st = draft.salaryTables.find(x => x.id === item.dataset.st);
            if (!st) return;
            st.name = item.querySelector('[data-sf="name"]').value.trim() || 'Gehaltstabelle';
            const d = item.querySelector('[data-sf="validFrom"]').value;
            st.validFrom = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
        });
    }

    // --- Zentrale Einstellungen (api/settings.php) ---
    async function sharedRequest(method, body, password, adminPassword) {
        const headers = { 'x-app-password': password || '' };
        if (adminPassword) headers['x-admin-password'] = adminPassword;
        if (body) headers['content-type'] = 'application/json';
        const res = await fetch(SETTINGS_URL, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
        let data = null;
        try { data = await res.json(); } catch (e) { /* keine JSON-Antwort */ }
        return { status: res.status, data: data || {} };
    }
    async function checkShared() {
        try {
            const res = await fetch(SETTINGS_URL + '?action=status', { cache: 'no-store' });
            const d = res.ok ? await res.json() : null;
            shared = d ? Object.assign(shared, { available: true, enabled: !!d.enabled, exists: !!d.exists, version: d.version || 0, updatedAt: d.updatedAt, adminRequired: !!d.adminRequired, problem: d.problem || '' })
                : Object.assign(shared, { available: false, enabled: false });
        } catch (e) {
            shared.available = shared.enabled = false; // z. B. Hosting ohne PHP oder offline
        }
    }
    function rememberShared(version, updatedAt) {
        sharedMeta = { version, updatedAt };
        storageSet(SHARED_KEY, JSON.stringify(sharedMeta));
        Object.assign(shared, { exists: true, version, updatedAt, error: '' });
    }
    /** Lädt die zentralen Einstellungen, wenn es eine neuere Version gibt. Gibt true zurück, wenn sich etwas geändert hat. */
    async function pullShared(force) {
        await checkShared();
        if (!shared.enabled || !shared.exists || ai.shared === false) return false;
        if (!ai.password) { shared.error = 'Für die zentralen Einstellungen fehlt das Zugangspasswort.'; return false; }
        if (!force && sharedMeta && sharedMeta.version === shared.version && sharedMeta.updatedAt === shared.updatedAt) return false;
        const { status, data } = await sharedRequest('GET', null, ai.password);
        if (status !== 200 || !data.settings) { shared.error = data.error || `Zentrale Einstellungen konnten nicht geladen werden (${status}).`; return false; }
        const n = P.normalizeSettings(data.settings);
        if (!n.templates.length) { shared.error = 'Die zentralen Einstellungen sind unvollständig.'; return false; }
        settings = n;
        saveSettings();
        rememberShared(data.version, data.updatedAt);
        return true;
    }
    /** Speichert die Einstellungen zentral. Bei einem Konflikt wird nachgefragt. */
    async function pushShared() {
        if (!shared.enabled || ai.shared === false) return;
        if (!ai.password) { setStatus('Nur in diesem Browser gespeichert: Für die zentralen Einstellungen fehlt das Zugangspasswort.', true); return; }
        await checkShared();
        if (!shared.enabled) return;
        let base = sharedMeta ? sharedMeta.version : 0;
        if (shared.exists && !(sharedMeta && sharedMeta.version)) {
            // Dieser Browser hat die zentralen Einstellungen noch nie geladen
            if (confirm(`Auf dem Server gibt es bereits zentrale Einstellungen (Version ${shared.version}).\n\nOK = die zentralen Einstellungen übernehmen (die Änderungen in diesem Browser werden verworfen)\nAbbrechen = die Einstellungen dieses Browsers für alle speichern`)) {
                if (await pullShared(true)) { render(); setStatus(`Zentrale Einstellungen übernommen (Version ${sharedMeta.version}).`); }
                else setStatus(shared.error || 'Zentrale Einstellungen konnten nicht geladen werden.', true);
                return;
            }
            base = shared.version;
        }
        for (let attempt = 0; attempt < 2; attempt++) {
            const { status, data } = await sharedRequest('POST', { baseVersion: base, settings }, ai.password, ai.adminPassword);
            if (status === 200) {
                rememberShared(data.version, data.updatedAt);
                setStatus(`Einstellungen zentral gespeichert (Version ${data.version}).`);
                return;
            }
            if (status === 409 && attempt === 0 && confirm(`Die zentralen Einstellungen wurden inzwischen von jemand anderem geändert (Version ${data.version}).\n\nOK = deine Einstellungen trotzdem speichern (überschreibt die andere Version; sie bleibt im Verlauf auf dem Server)\nAbbrechen = nicht zentral speichern`)) {
                base = data.version;
                continue;
            }
            shared.error = data.error || `Fehler ${status}`;
            setStatus('Nur in diesem Browser gespeichert – zentral nicht gespeichert: ' + shared.error, true);
            return;
        }
    }

    /** Öffnet die Einstellungen; mit tplId wird diese Vorlage aufgeklappt und angezeigt. */
    async function openSettings(tplId) {
        // Vorher die neueste zentrale Version holen, damit niemand auf einem alten Stand weiterarbeitet
        if (await pullShared().catch(() => false)) render();
        draft = clone(settings);
        draftAi = clone(ai);
        renderAiForm();
        renderSettingsForm(tplId);
        $('#settingsDialog').showModal();
        if (tplId) document.querySelector(`#tplList [data-tpl="${CSS.escape(tplId)}"] .rules-grid`)?.scrollIntoView({ block: 'center' });
        await checkStore();
        renderAiForm();
        if (window.CVAi) { server = await CVAi.checkServer(SERVER_URL); renderAiForm(); }
    }
    $('#openSettings').addEventListener('click', () => openSettings());
    $('#settingsDialog').addEventListener('change', e => {
        if (e.target.name === 'aiMode' || e.target.id === 'aiEnabled') { readAiForm(); renderAiForm(); }
        if (e.target.dataset.rf === 'mode') {
            const low = e.target.closest('.rules-grid').querySelector(`[data-r="${e.target.dataset.r}"][data-rf="low"]`);
            low.disabled = e.target.value !== 'threshold';
        }
        // Nur beim Zielberuf neu aufbauen (Liste «verwandt» ändert sich); sonst ginge die Eingabe im nächsten Feld verloren
        if (e.target.dataset.t === 'target') {
            readSettingsForm();
            renderTemplatesForm(e.target.closest('.tpl-item')?.dataset.tpl);
        }
    });
    $('#settingsDialog').addEventListener('input', e => {
        if (e.target.dataset.t === 'name') {
            const name = e.target.closest('.tpl-item')?.querySelector('.tpl-name');
            if (name) name.textContent = e.target.value || 'Unbenannte Vorlage';
        }
    });
    $('#addTpl').addEventListener('click', () => {
        readSettingsForm();
        const t = P.makeTemplate(draft.categories[0].id, 'Neue Vorlage');
        draft.templates.push(t);
        renderTemplatesForm(t.id);
        document.querySelector(`#tplList [data-tpl="${t.id}"] [data-t="name"]`)?.select();
    });
    $('#tplList').addEventListener('click', e => {
        const del = e.target.closest('[data-deltpl]');
        const cp = e.target.closest('[data-copytpl]');
        if (!del && !cp) return;
        readSettingsForm();
        if (del) {
            if (draft.templates.length === 1) { alert('Es muss mindestens eine Vorlage vorhanden sein.'); return; }
            draft.templates = draft.templates.filter(t => t.id !== del.dataset.deltpl);
            renderTemplatesForm();
        } else {
            const src = draft.templates.find(t => t.id === cp.dataset.copytpl);
            const t = Object.assign(clone(src), { id: P.makeTemplate(src.target).id, name: src.name + ' (Kopie)' });
            draft.templates.splice(draft.templates.indexOf(src) + 1, 0, t);
            renderTemplatesForm(t.id);
        }
    });
    const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    let xlsxLoading = null;
    function loadXlsx() {
        if (window.XLSX) return Promise.resolve(window.XLSX);
        xlsxLoading = xlsxLoading || new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = XLSX_URL;
            s.onload = () => resolve(window.XLSX);
            s.onerror = () => { xlsxLoading = null; reject(new Error('Excel-Leser konnte nicht geladen werden')); };
            document.head.appendChild(s);
        });
        return xlsxLoading;
    }
    /** Liest Excel (erstes Blatt), CSV oder PDF in Zeilen und Zellen. */
    async function readTableFile(f, buf) {
        if (/\.(csv|txt)$/i.test(f.name)) return P.parseCsv(await f.text());
        if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
            if (!window.pdfjsLib) throw new Error('PDF-Bibliothek konnte nicht geladen werden (Internetverbindung?)');
            return pdfToRows(buf.slice(0));
        }
        const X = await loadXlsx();
        const wb = X.read(buf, { type: 'array' });
        return X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
    }
    /** Mit den KI-Einstellungen aus dem offenen Dialog (auch wenn noch nicht gespeichert). */
    const draftAiReady = () => draftAi.mode === 'server' ? server.configured : !!draftAi.apiKey;

    const aiOpts = () => draftAi.mode === 'server' ? { serverUrl: SERVER_URL, password: draftAi.password } : { apiKey: draftAi.apiKey };
    const isPdfFile = f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf';

    /** Liest eine Gehaltstabelle (Excel, CSV, PDF; PDF notfalls mit Claude). Gibt null zurück, wenn keine erkannt wurde. */
    async function readSalaryFile(f, buf, setBusy) {
        const name = f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ');
        let st = null, readErr = null;
        try { st = P.parseSalaryTable(await readTableFile(f, buf), name); } catch (err) { readErr = err; }
        if (!st && isPdfFile(f) && window.CVAi && draftAiReady()) {
            setBusy('Claude liest die Gehaltstabelle …');
            const res = await window.CVAi.readSalaryTable(Object.assign({ model: draftAi.model, pdfBase64: toBase64(buf) }, aiOpts()));
            if (Object.keys(res.classes).length) {
                st = Object.assign(P.normalizeSalaryTable({ name: res.name || name, validFrom: res.validFrom, classes: res.classes, note: ['von Claude gelesen', res.note].filter(Boolean).join(' · ') }), { monthly: res.monthly });
            }
        }
        if (!st && readErr) throw readErr;
        return st;
    }
    /** Fügt eine gelesene Gehaltstabelle den Einstellungen hinzu (Monatslöhne umrechnen, gleiche Gültigkeit ersetzen). */
    function addSalaryTable(st) {
        if (st.monthly && confirm('Die Beträge sehen nach Monatslöhnen aus. Für die Berechnung braucht es Jahreslöhne.\n\nOK = mit 13 multiplizieren (13 Monatslöhne)\nAbbrechen = Beträge unverändert übernehmen')) {
            for (const k of Object.keys(st.classes)) st.classes[k] = st.classes[k].map(v => Math.round(v * 13 * 100) / 100);
            st.note = [st.note, 'Monatslöhne × 13 umgerechnet'].filter(Boolean).join(' · ');
        }
        delete st.monthly;
        // Gleiche Gültigkeit wie eine vorhandene Tabelle → ersetzen (Vorlagen, die sie fest gewählt haben, behalten die Wahl)
        const same = st.validFrom && draft.salaryTables.find(x => x.validFrom === st.validFrom);
        if (same && confirm(`Es gibt bereits eine Gehaltstabelle gültig ab ${fmtDay(st.validFrom)} («${same.name}»). Ersetzen?\n\nAbbrechen = als zusätzliche Tabelle hinzufügen`)) {
            st.id = same.id;
            draft.salaryTables[draft.salaryTables.indexOf(same)] = st;
        } else {
            draft.salaryTables.push(st);
        }
    }
    const NO_TABLE = 'In der Datei wurde keine Gehaltstabelle erkannt. Erwartet: pro Zeile die Lohnklasse in der ersten Spalte, danach die Jahreslöhne der Stufen.';

    $('#uploadSalary').addEventListener('change', async e => {
        const f = e.target.files[0];
        e.target.value = '';
        if (!f) return;
        const label = e.target.closest('label');
        const setBusy = text => { label.firstChild.textContent = text; };
        setBusy('Gehaltstabelle wird gelesen …');
        readAiForm();
        readSettingsForm();
        try {
            const st = await readSalaryFile(f, await f.arrayBuffer(), setBusy);
            if (!st) {
                alert(NO_TABLE + (isPdfFile(f) && !draftAiReady() ? '\n\nBei eingescannten oder ungewöhnlich aufgebauten PDFs hilft die KI-Auswertung mit Claude (oben in den Einstellungen einrichten).' : ''));
                return;
            }
            addSalaryTable(st);
            renderSalaryList(st.id);
            renderTemplatesForm();
            document.querySelector(`#salaryList [data-st="${CSS.escape(st.id)}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        } catch (err) {
            alert('Die Datei konnte nicht gelesen werden: ' + err.message);
        } finally {
            setBusy('+ Gehaltstabelle hochladen');
        }
    });

    /**
     * «Dokumente einlesen»: Besoldungsreglement (Einreihungsplan) und Gehaltstabelle(n) in einem Schritt.
     * Gehaltstabellen werden an ihren Zahlenreihen erkannt; das Reglement liest Claude (mit KI-Auswertung)
     * oder die App selbst (Funktionen, Lohnklassen, Aufstieg, Stichtag).
     */
    $('#importDocs').addEventListener('change', async e => {
        const files = Array.from(e.target.files);
        e.target.value = '';
        if (!files.length) return;
        const label = e.target.closest('label');
        const setBusy = text => { label.firstChild.textContent = text; };
        readAiForm();
        readSettingsForm();
        const done = [];
        try {
            for (const f of files) {
                setBusy(`«${f.name}» wird gelesen …`);
                const buf = await f.arrayBuffer();
                if (!isPdfFile(f)) {
                    const st = await readSalaryFile(f, buf, setBusy);
                    if (st) { addSalaryTable(st); done.push(`Gehaltstabelle «${st.name}»`); } else alert(`«${f.name}»: ${NO_TABLE}`);
                    continue;
                }
                // Eine Gehaltstabelle hat viele Zeilen «Klasse + Beträge»
                const st = P.parseSalaryTable(await pdfToRows(buf.slice(0)), f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' '));
                if (st && Object.keys(st.classes).length >= 5) { addSalaryTable(st); done.push(`Gehaltstabelle «${st.name}»`); continue; }
                let reg, source;
                if (window.CVAi && draftAiReady()) {
                    setBusy('Claude liest das Reglement (kann 1–2 Minuten dauern) …');
                    reg = await window.CVAi.readRegulation(Object.assign({ model: draftAi.model, pdfBase64: toBase64(buf) }, aiOpts()));
                    source = 'Claude';
                } else {
                    reg = P.parseRegulationText(await pdfToText(buf.slice(0)));
                    source = 'ohne KI';
                }
                if (!reg.functions.length) { alert(`«${f.name}»: Kein Einreihungsplan erkannt (Tabelle «Nr. | Funktion | Lohnklasse»).`); continue; }
                const lines = [
                    `${reg.functions.length} Funktionen` + (reg.categories && reg.categories.length ? `, ${reg.categories.length} Berufe` : ' (Berufe bleiben wie bisher)'),
                    reg.classUpYears && reg.classUpYears.length ? `Klassenaufstieg nach ${reg.classUpYears.join(' und ')} Dienstjahren` : '',
                    reg.cutoff === 'yearEnd' ? 'Stichtag 31.12.' : '',
                    reg.payments ? `${reg.payments} Monatslöhne` : '',
                    reg.adjustments && reg.adjustments.length ? `${reg.adjustments.length} Korrekturen` : ''
                ].filter(Boolean);
                if (!confirm(`«${f.name}» (gelesen ${source}):\n– ${lines.join('\n– ')}` + (reg.summary ? `\n\n${reg.summary}` : '')
                    + '\n\nOK = Vorlagen' + (reg.categories && reg.categories.length ? ', Berufe' : '') + ' und Korrekturen durch diese ersetzen (Gehaltstabellen bleiben)\nAbbrechen = nichts ändern')) continue;
                draft = P.buildFromRegulation(reg, draft);
                done.push(`Reglement «${f.name}»: ${reg.functions.length} Funktionen`);
            }
        } catch (err) {
            alert('Einlesen fehlgeschlagen: ' + err.message);
        } finally {
            setBusy('Dokumente einlesen (Reglement, Gehaltstabelle)');
        }
        if (done.length) {
            renderSettingsForm();
            $('#importResult').innerHTML = `<span class="ok">${icon('check')} Übernommen: ${esc(done.join(' · '))}.</span> Bitte die Vorlagen kurz prüfen und dann «Speichern».`;
        }
    });
    $('#salaryList').addEventListener('click', e => {
        const del = e.target.closest('[data-delst]');
        if (!del) return;
        readSettingsForm();
        const st = draft.salaryTables.find(x => x.id === del.dataset.delst);
        const used = draft.templates.filter(t => t.salaryTableId === st.id);
        if (!confirm(`Gehaltstabelle «${st.name}» löschen?` + (used.length ? `\n\nDiese Vorlagen verwenden sie fest und nehmen danach automatisch die am Stichtag gültige: ${used.map(t => t.name).join(', ')}` : ''))) return;
        draft.salaryTables = draft.salaryTables.filter(x => x !== st);
        used.forEach(t => { t.salaryTableId = ''; });
        renderSalaryList();
        renderTemplatesForm();
    });
    $('#salaryList').addEventListener('change', e => {
        const item = e.target.closest('[data-st]');
        if (!item) return;
        const st = draft.salaryTables.find(x => x.id === item.dataset.st);
        if (e.target.matches('[data-sview]')) {
            salaryView[st.id] = e.target.value;
            renderSalaryList();
        } else if (e.target.matches('[data-cell]')) {
            // Korrigierter Wert; nur die letzte Stufe einer Zeile kann geleert (entfernt) werden
            const { kind, cls, i } = e.target.dataset;
            const m = st[kind] || (st[kind] = {});
            const row = m[cls] || (m[cls] = []);
            const v = P.parseAmount(e.target.value);
            if (e.target.value.trim() === '' && +i === row.length - 1) row.pop();
            else if (v !== null && v > 0) row[+i] = v;
            else alert(e.target.value.trim() === '' ? 'Nur die letzte Stufe einer Zeile kann entfernt werden.' : 'Bitte eine Zahl eingeben, z. B. 82160.95');
            if (!row.length) delete m[cls];
            e.target.value = row[+i] == null ? '' : Number.isInteger(row[+i]) ? String(row[+i]) : row[+i].toFixed(2);
            item.querySelector('[data-warn]').innerHTML = salaryWarnings(st);
            item.querySelector('[data-sum]').innerHTML = salarySummary(st);
        } else if (e.target.dataset.sf) {
            readSettingsForm();
            item.querySelector('.tpl-name').textContent = st.name;
            item.querySelector('[data-sum]').innerHTML = salarySummary(st);
            renderTemplatesForm();
        }
    });
    $('#addCat').addEventListener('click', () => {
        readSettingsForm();
        draft.categories.push({ id: 'k' + Math.random().toString(36).slice(2, 8), name: 'Neuer Beruf', keywords: [] });
        renderSettingsForm();
        const names = document.querySelectorAll('#catList [data-k="name"]');
        names[names.length - 1].select();
    });
    $('#catList').addEventListener('click', e => {
        const b = e.target.closest('[data-delcat]');
        if (!b) return;
        readSettingsForm();
        const id = b.dataset.delcat;
        if (draft.categories.length === 1) { alert('Es muss mindestens ein Beruf vorhanden sein.'); return; }
        const affected = draft.templates.filter(t => t.target === id);
        if (affected.length && !confirm(`Vorlagen mit diesem Zielberuf werden ebenfalls gelöscht: ${affected.map(t => t.name).join(', ')}. Fortfahren?`)) return;
        draft.categories = draft.categories.filter(c => c.id !== id);
        draft.templates = draft.templates.filter(t => t.target !== id);
        draft.templates.forEach(t => { t.related = t.related.filter(r => r !== id); });
        if (!draft.templates.length) draft.templates.push(P.makeTemplate(draft.categories[0].id, draft.categories[0].name));
        renderSettingsForm();
    });
    $('#resetSettings').addEventListener('click', () => {
        if (!confirm('Berufe und Vorlagen auf den Standard zurücksetzen?')) return;
        readSettingsForm();
        draft = Object.assign(clone(P.DEFAULT_SETTINGS), { salaryTables: draft.salaryTables });
        renderSettingsForm();
    });
    $('#exportSettings').addEventListener('click', () => {
        readSettingsForm();
        download('lebenslauf-rechner-einstellungen.json', JSON.stringify(draft, null, 2), 'application/json');
    });
    $('#importSettings').addEventListener('change', async e => {
        const f = e.target.files[0];
        e.target.value = '';
        if (!f) return;
        try {
            const s = P.normalizeSettings(JSON.parse(await f.text()));
            if (!s.categories.length || !s.templates.length) throw new Error();
            draft = s;
            renderSettingsForm();
        } catch (err) {
            alert('Die Datei enthält keine gültigen Einstellungen.');
        }
    });
    $('#settingsDialog').addEventListener('close', async () => {
        if ($('#settingsDialog').returnValue !== 'save') return;
        readSettingsForm();
        readAiForm();
        settings = draft;
        saveSettings();
        ai = draftAi;
        storageSet(AI_KEY, JSON.stringify(ai));
        pushShared().catch(err => setStatus('Nur in diesem Browser gespeichert – Server nicht erreichbar: ' + err.message, true));
        loadStored().then(n => { if (n) render(); scheduleSave(); });
        if (ai.enabled && !aiReady()) setStatus(ai.mode === 'server' ? 'KI-Auswertung ist eingeschaltet, aber der Server ist nicht eingerichtet.' : 'KI-Auswertung ist eingeschaltet, aber es fehlt der API-Schlüssel.', true);
        const ids = new Set(allCats().map(c => c.id));
        for (const c of candidates) {
            if (!settings.templates.some(t => t.id === c.templateId)) c.templateId = settings.templates[0].id;
            if (!c.loading) applySuggestion(c, c.suggestion && c.suggestion.source === 'ki' ? { functionId: c.suggestion.id, functionReason: c.suggestion.reason } : null);
            c.entries.forEach(e => { if (!ids.has(e.category)) e.category = '__sonstige'; });
        }
        render();
    });

    const EXAMPLE = `Anna Muster
Bahnhofstrasse 1, 6300 Zug
Geburtsdatum: 14.05.1988

Berufserfahrung
08/2021 – heute    Primarlehrerin, Schule Herti Zug (Pensum 80%)
Klassenlehrperson 4. Klasse
08.2016 - 07.2021
Kaufmännische Sachbearbeiterin
Versicherung AG, Zürich
März 2014 bis Juli 2016: Verkäuferin, Detailhandel
seit 2024 Nachhilfe Mathematik

Ausbildung
2011 – 2014 Studium Lehrdiplom Primarstufe, PH Zug
2007 - 2011 Kantonsschule Zug, Matura

Sprachen
Deutsch, Englisch`;

    render();
    // Beim Laden prüfen, ob ein eingerichteter Server vorhanden ist (sobald das KI-Modul geladen ist)
    const initServer = async () => { server = await CVAi.checkServer(SERVER_URL); render(); };
    pullShared().then(changed => {
        if (changed) { render(); setStatus(`Zentrale Einstellungen geladen (Version ${sharedMeta.version}).`); }
        else if (shared.error) setStatus(shared.error, true);
    }).catch(() => {}).then(loadStored).then(n => {
        render();
        if (n) setStatus(`${n} gespeicherte Auswertung${n > 1 ? 'en' : ''} geladen.`);
    });
    if (window.CVAi) initServer(); else window.addEventListener('cvai-ready', initServer, { once: true });
})();
