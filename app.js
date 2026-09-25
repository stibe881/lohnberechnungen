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
        const d = { enabled: false, mode: 'server', apiKey: '', password: '', model: '', textOnly: true };
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
    const tplOf = c => settings.templates.find(t => t.id === c.templateId) || settings.templates[0];
    const computeFor = c => P.compute(c.entries, tplOf(c), undefined, { birth: c.birth });
    const adjustmentOf = c => (settings.classAdjustments || []).find(a => a.id === c.adjustmentId) || null;
    const placementFor = (c, r) => P.placement(r.creditedYears, tplOf(c), adjustmentOf(c), settings.salaryTable);
    const chf = v => 'CHF ' + (Math.round(v * 20) / 20).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    /** Lohneinreihung als Text, z. B. «Lohnklasse 12, Stufe 6 · Jahreslohn CHF 95'000.00 (100 %)». */
    function placementText(c, pl) {
        if (!pl) return '';
        const parts = [`Lohnklasse ${pl.cls}, Stufe ${pl.stage}`];
        if (pl.salary) {
            const p = Math.max(0, Math.min(100, +c.newPensum || 100));
            parts.push(`Jahreslohn ${chf(pl.salary)} bei 100 %`);
            if (p !== 100) parts.push(`${chf(pl.salary * p / 100)} bei ${p} %`);
            parts.push(`Monatslohn (13×) ${chf(pl.salary * p / 100 / 13)}`);
        }
        return parts.join(' · ');
    }
    function placementWhy(t, pl) {
        if (!pl) return '';
        let s = `${pl.years} volle Erfahrungsjahre → Stufe ${pl.stage}; Grundklasse ${t.classMin}` + (t.classMax && t.classMax !== t.classMin ? ` (Funktion ${t.classMin}–${t.classMax})` : '');
        if (pl.ups) s += `, +${pl.ups} Klasse${pl.ups > 1 ? 'n' : ''} nach ${(t.classUpYears || []).slice(0, pl.ups).join(' und ')} Jahren`;
        if (pl.adjustment && pl.adjustment.delta) s += `, Korrektur: ${pl.adjustment.label}`;
        return s + (settings.salaryTable ? '' : ' (keine Gehaltstabelle hinterlegt)');
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

    async function pdfToText(buf) {
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        const out = [];
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
            let prevY = null, prevH = 0;
            for (const line of lines) {
                line.items.sort((a, b) => a.x - b.x);
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
                    { model: ai.model, categories: settings.categories, pdfBase64: c.pdfBase64, text: c.text },
                    ai.mode === 'server' ? { serverUrl: SERVER_URL, password: ai.password } : { apiKey: ai.apiKey }
                ));
                c.entries = res.entries;
                c.hinweise = res.hinweise;
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
            templateId: defaultTemplateId,
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

    function buildView(c) {
        const r = computeFor(c);
        const t = tplOf(c);
        const modelName = (window.CVAi?.MODELS.find(m => m.id === c.model) || { name: c.model || 'Claude' }).name.replace(/ \(.*\)$/, '');
        return {
            name: c.name, birth: c.birth, entries: c.entries, result: r, template: t, catName,
            hinweise: c.hinweise,
            created: new Date().toLocaleDateString('de-CH'),
            sourceText: c.source === 'ki' ? `KI-gestützt mit ${modelName} (Anthropic), durch eine Person geprüft` : 'regelbasiert (ohne KI), durch eine Person geprüft',
            rulesText: rulesText(t),
            formulaText: formulaHtml(c, r, t),
            placementText: placementText(c, placementFor(c, r)),
            placementWhy: placementWhy(t, placementFor(c, r)),
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
        if (!settings.templates.some(t => t.id === defaultTemplateId)) defaultTemplateId = settings.templates[0]?.id || '';
        $('#defaultTemplate').innerHTML = tplOptions(defaultTemplateId);
        $('#privacy').innerHTML = aiActive()
            ? `✨ KI-Auswertung mit Claude ist aktiv${ai.mode === 'server' ? ' (über euren Server)' : ''}: Lebensläufe werden an Anthropic (USA) gesendet${ai.textOnly ? ', nur als Text ohne Bilder' : ''}.`
            : ai.enabled
                ? '⚠️ KI-Auswertung ist eingeschaltet, aber nicht eingerichtet (Einstellungen prüfen). Es wird mit den Regeln gerechnet.'
                : '🔒 Dateien werden nur lokal in diesem Browser verarbeitet und nirgends hochgeladen.';
        renderOverview();
        renderDetail();
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
                <td><strong>${esc(c.name)}</strong>${c.source === 'ki' ? ' <span class="mini-ai" title="ausgewertet mit Claude">✨</span>' : ''}</td>
                <td>${esc(tplOf(c).name)}</td>
                <td class="num">${fmt(r.totalYears)}</td>
                <td class="num">${fmt(r.targetYears)}</td>
                <td class="num">${fmt(r.otherYears)}</td>
                <td class="num"><strong>${fmt(r.creditedYears)}</strong></td>
                <td class="num">${(pl => pl ? `LK ${pl.cls} / St. ${pl.stage}` : '–')(placementFor(c, r))}</td>
                <td class="num"><button class="btn-icon" type="button" data-remove="${c.id}" title="Entfernen" aria-label="Entfernen">✕</button></td>
            </tr>`;
        }).join('');
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
                <td><button class="btn-icon" type="button" data-del="${e.id}" title="Zeile löschen" aria-label="Zeile löschen">✕</button></td>
            </tr>`;
        }).join('');

        const tl = timelineHtml(c, r);
        el.innerHTML = `<div class="card">
            <div class="detail-head">
                <input type="text" class="name-input" data-cf="name" value="${esc(c.name)}" aria-label="Name">
                <div class="head-fields">
                    <label class="field"><span>Geburtsdatum</span><input type="month" data-cf="birth" value="${esc(c.birth)}"></label>
                    <label class="field"><span>Stelle / Vorlage</span><select data-cf="templateId">${tplOptions(t.id)}</select></label>
                    ${t.classMin ? `<label class="field"><span>Pensum neue Stelle</span><div class="suffix"><input type="number" min="1" max="100" data-cf="newPensum" value="${esc(c.newPensum)}"><em>%</em></div></label>
                    <label class="field"><span>Korrektur Lohnklasse</span><select data-cf="adjustmentId"><option value="">keine</option>${(settings.classAdjustments || []).map(a => `<option value="${esc(a.id)}"${a.id === c.adjustmentId ? ' selected' : ''}>${esc(a.label)}</option>`).join('')}</select></label>` : ''}
                </div>
            </div>
            <p class="source">${c.source === 'ki' ? '<span class="pill pill-ai">✨ ausgewertet mit Claude</span>' : '<span class="pill">ausgewertet mit Regeln</span>'}
                ${c.aiError ? `<span class="source-error">KI-Auswertung fehlgeschlagen: ${esc(c.aiError)}</span>` : ''}
                ${t.minAge && !c.birth ? '<span class="source-error">Geburtsdatum fehlt – Mindestalter wird nicht geprüft</span>' : ''}</p>
            ${c.hinweise ? `<div class="notice"><b>Hinweis von Claude:</b> ${esc(c.hinweise)}</div>` : ''}
            <div class="stats">
                <div class="stat"><div class="label">Berufserfahrung total</div><div class="value">${fmt(r.totalYears)}<span class="unit">J.</span></div><div class="extra">${fmtYM(r.totalYears)}</div></div>
                <div class="stat"><div class="label">davon als ${esc(catName(t.target))}</div><div class="value">${fmt(r.targetYears)}<span class="unit">J.</span></div><div class="extra">${fmtYM(r.targetYears)}</div></div>
                <div class="stat"><div class="label">andere Berufe</div><div class="value">${fmt(r.otherYears)}<span class="unit">J.</span></div><div class="extra">${fmtYM(r.otherYears)}</div></div>
                <div class="stat primary"><div class="label">Anrechenbare Jahre</div><div class="value">${fmt(r.creditedYears)}<span class="unit">J.</span></div><div class="extra">${r.rounded || r.capped ? 'ungerundet ' + fmt(r.exactYears) + ' J.' : fmtYM(r.creditedYears)}</div></div>
            </div>
            ${(pl => pl ? `<div class="placement"><div class="placement-main"><span class="label">Vorschlag Lohneinreihung</span><b>${esc(placementText(c, pl))}</b></div><div class="placement-why">${esc(placementWhy(t, pl))}</div></div>` : '')(placementFor(c, r))}
            <div class="formula">${formulaHtml(c, r, t)}<div class="rules">Regeln «${esc(t.name)}»: ${esc(rulesText(t))} <button type="button" class="link-btn" data-edittpl="${esc(t.id)}">Gewichtungen anpassen</button></div></div>
            ${tl ? `<h3 class="sub-h">Zeitstrahl</h3>${tl}` : ''}
            ${c.entries.length ? `<h3 class="sub-h">Stellen</h3><div class="table-scroll"><table class="table entries-table">
                <thead><tr>
                    <th title="Anrechnen">✓</th><th>Funktion / Stelle</th><th>Beruf</th><th>Von</th><th>Bis</th>
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
        candidates.forEach(c => { c.templateId = defaultTemplateId; });
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
            if (i >= 0) candidates.splice(i, 1);
            if (selectedId === rm.dataset.remove) selectedId = candidates[0]?.id || null;
            render();
            return;
        }
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
            c[t.dataset.cf] = t.dataset.cf === 'newPensum' ? Math.max(1, Math.min(100, +t.value || 100)) : t.value;
            if (t.dataset.cf === 'name') c.autoName = false;
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
        const lines = [['Person', 'Geburtsdatum', 'Stelle / Vorlage', 'Total Jahre', 'Jahre im Zielberuf', 'Jahre andere Berufe', 'Anrechenbare Jahre (ungerundet)', 'Anrechenbare Jahre', 'Lohnklasse', 'Lohnstufe', 'Jahreslohn 100 %', 'Pensum neue Stelle %', 'Auswertung'].map(q).join(';')];
        const details = [['Person', 'Funktion', 'Details', 'Beruf', 'Von', 'Bis', 'Pensum %', 'Angerechnet (ja/nein)', 'Anrechnung %', 'Dauer Jahre', 'Angerechnete Jahre'].map(q).join(';')];
        for (const c of candidates.filter(x => !x.loading)) {
            const r = computeFor(c);
            const pl = placementFor(c, r);
            lines.push([q(c.name), q(c.birth), q(tplOf(c).name), n(r.totalYears), n(r.targetYears), n(r.otherYears), n(r.exactYears), n(r.creditedYears),
                pl ? pl.cls : '', pl ? pl.stage : '', pl && pl.salary ? n(pl.salary) : '', c.newPensum, q(c.source === 'ki' ? 'Claude' : 'Regeln')].join(';'));
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
        $('#aiTextOnly').checked = draftAi.textOnly;
        $('#aiModel').innerHTML = models.map(m => `<option value="${esc(m.id)}"${m.id === current ? ' selected' : ''}>${esc(m.name)}</option>`).join('');
        $('#serverStatus').innerHTML = server.configured
            ? '<span class="ok">✓ Server ist eingerichtet' + (server.passwordRequired ? ', Zugangspasswort erforderlich' : '') + '</span>'
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
        draftAi.textOnly = $('#aiTextOnly').checked;
        draftAi.model = $('#aiModel').value;
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
        $('#tplList').innerHTML = draft.templates.map(t => `<details class="tpl-item" data-tpl="${esc(t.id)}" ${t.id === openId ? 'open' : ''}>
            <summary><span class="tpl-name">${esc(t.name)}</span><span class="tpl-target">Zielberuf: ${esc((draft.categories.concat(P.SPECIAL_CATEGORIES).find(c => c.id === t.target) || { name: '–' }).name)}${t.classMin ? ` · Lohnklasse ${t.classMin}${t.classMax && t.classMax !== t.classMin ? '–' + t.classMax : ''}` : ''}</span></summary>
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
            <button class="btn-icon" type="button" data-delcat="${esc(cat.id)}" title="Beruf löschen" aria-label="Beruf löschen">✕</button>
        </div>`).join('');
    }

    function renderSalaryStatus() {
        const st = draft.salaryTable;
        const cls = st ? Object.keys(st.classes).map(Number).sort((a, b) => a - b) : [];
        $('#salaryStatus').innerHTML = st
            ? `<span class="ok">✓ ${esc(st.name || 'Gehaltstabelle')}</span>${st.validFrom ? ', gültig ab ' + esc(st.validFrom) : ''} · Lohnklassen ${cls[0]}–${cls[cls.length - 1]}`
            : 'Keine Gehaltstabelle hinterlegt.';
        $('#removeSalary').hidden = !st;
    }

    function renderSettingsForm(openTplId) {
        renderTemplatesForm(openTplId);
        renderCatsForm();
        renderSalaryStatus();
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
            t.related = [...item.querySelectorAll('[data-rel]:checked')].map(x => x.dataset.rel).filter(r => r !== t.target);
        });
    }

    /** Öffnet die Einstellungen; mit tplId wird diese Vorlage aufgeklappt und angezeigt. */
    async function openSettings(tplId) {
        draft = clone(settings);
        draftAi = clone(ai);
        renderAiForm();
        renderSettingsForm(tplId);
        $('#settingsDialog').showModal();
        if (tplId) document.querySelector(`#tplList [data-tpl="${CSS.escape(tplId)}"] .rules-grid`)?.scrollIntoView({ block: 'center' });
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
    $('#removeSalary').addEventListener('click', () => {
        if (!confirm('Gehaltstabelle entfernen?')) return;
        readSettingsForm();
        draft.salaryTable = null;
        renderSalaryStatus();
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
        draft = clone(P.DEFAULT_SETTINGS);
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
    $('#settingsDialog').addEventListener('close', () => {
        if ($('#settingsDialog').returnValue !== 'save') return;
        readSettingsForm();
        readAiForm();
        settings = draft;
        saveSettings();
        ai = draftAi;
        storageSet(AI_KEY, JSON.stringify(ai));
        if (ai.enabled && !aiReady()) setStatus(ai.mode === 'server' ? 'KI-Auswertung ist eingeschaltet, aber der Server ist nicht eingerichtet.' : 'KI-Auswertung ist eingeschaltet, aber es fehlt der API-Schlüssel.', true);
        const ids = new Set(allCats().map(c => c.id));
        for (const c of candidates) {
            if (!settings.templates.some(t => t.id === c.templateId)) c.templateId = settings.templates[0].id;
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
    if (window.CVAi) initServer(); else window.addEventListener('cvai-ready', initServer, { once: true });
})();
