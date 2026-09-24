/* ============================================
   Lebenslauf-Rechner — Oberfläche
   ============================================ */
(function () {
    'use strict';

    const P = window.CVParser;
    const SETTINGS_KEY = 'cvrechner.settings.v1';
    const TARGET_KEY = 'cvrechner.target.v1';
    const AI_KEY = 'cvrechner.ai.v1'; // getrennt von den Einstellungen, damit der API-Schlüssel nie exportiert wird
    const SPECIAL = [
        { id: '__sonstige', name: 'Sonstige' },
        { id: '__ausbildung', name: 'Ausbildung' }
    ];

    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    // --- State ---
    const clone = o => JSON.parse(JSON.stringify(o));
    let settings = loadSettings();
    let defaultTarget = storageGet(TARGET_KEY) || settings.categories[0]?.id || '';
    const candidates = []; // bewusst nur im Speicher: Lebensläufe werden nicht im Browser abgelegt
    let selectedId = null;

    function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignorieren */ } }
    function loadSettings() {
        try {
            const s = JSON.parse(storageGet(SETTINGS_KEY));
            if (s && Array.isArray(s.categories)) return Object.assign(clone(P.DEFAULT_SETTINGS), s);
        } catch (e) { /* Standard verwenden */ }
        return clone(P.DEFAULT_SETTINGS);
    }
    function saveSettings() { storageSet(SETTINGS_KEY, JSON.stringify(settings)); }

    let ai = loadAi();
    function loadAi() {
        try {
            const a = JSON.parse(storageGet(AI_KEY));
            if (a) return { enabled: !!a.enabled, apiKey: a.apiKey || '', model: a.model || '' };
        } catch (e) { /* Standard verwenden */ }
        return { enabled: false, apiKey: '', model: '' };
    }
    const aiActive = () => ai.enabled && !!ai.apiKey;

    // --- Helpers ---
    const $ = s => document.querySelector(s);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = y => (Math.round(y * 10) / 10).toLocaleString('de-CH', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    function fmtYM(y) {
        const m = Math.round(y * 12);
        const yy = Math.floor(m / 12), mm = m % 12;
        return yy + ' J.' + (mm ? ' ' + mm + ' Mt.' : '');
    }
    const allCats = () => settings.categories.concat(SPECIAL);
    const catName = id => (allCats().find(c => c.id === id) || { name: '–' }).name;
    const uid = () => 'c' + Math.random().toString(36).slice(2, 9);

    function setStatus(msg, isError) {
        const el = $('#status');
        el.textContent = msg || '';
        el.classList.toggle('error', !!isError);
    }

    // --- Datei lesen ---
    async function readFile(file) {
        const name = file.name.toLowerCase();
        if (name.endsWith('.pdf') || file.type === 'application/pdf') {
            const buf = await file.arrayBuffer();
            // Mit Claude wird das PDF direkt gelesen (auch eingescannte); der Text dient dann nur der Anzeige
            const pdfBase64 = aiActive() ? toBase64(buf) : null;
            let text = '';
            if (window.pdfjsLib) text = await pdfToText(buf.slice(0)).catch(() => '');
            else if (!pdfBase64) throw new Error('PDF-Bibliothek konnte nicht geladen werden (Internetverbindung?).');
            return { text, pdfBase64 };
        }
        if (name.endsWith('.docx')) {
            if (!window.mammoth) throw new Error('Word-Bibliothek konnte nicht geladen werden (Internetverbindung?).');
            const res = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
            return { text: res.value.replace(/\n{2,}/g, '\n'), pdfBase64: null };
        }
        if (name.endsWith('.doc')) throw new Error('Alte .doc-Dateien werden nicht unterstützt – bitte als PDF oder .docx speichern.');
        return { text: await file.text(), pdfBase64: null };
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

    /** Wertet einen Lebenslauf aus: mit Claude, falls eingerichtet, sonst (oder bei Fehlern) mit den Regeln. */
    async function analyzeCandidate(c) {
        c.aiError = '';
        c.hinweise = '';
        if (aiActive()) {
            try {
                if (!window.CVAi) throw new Error('KI-Modul konnte nicht geladen werden (Internetverbindung?).');
                const res = await window.CVAi.analyze({
                    apiKey: ai.apiKey, model: ai.model, categories: settings.categories,
                    pdfBase64: c.pdfBase64, text: c.text
                });
                c.entries = res.entries;
                c.hinweise = res.hinweise;
                if (res.name && c.autoName) { c.name = res.name; c.autoName = false; }
                c.source = 'ki';
                return;
            } catch (e) {
                c.aiError = e.message;
            }
        }
        c.entries = P.extractEntries(c.text, settings);
        c.source = 'regeln';
    }

    async function addCandidate(name, text, pdfBase64) {
        const c = {
            id: uid(),
            name: name.replace(/\.(pdf|docx|txt)$/i, '').replace(/[_]+/g, ' ').trim() || 'Unbenannt',
            autoName: true,
            text,
            pdfBase64: pdfBase64 || null,
            target: defaultTarget,
            entries: []
        };
        await analyzeCandidate(c);
        candidates.push(c);
        selectedId = c.id;
        return c;
    }

    let busy = false;
    async function withBusy(fn) {
        if (busy) return;
        busy = true;
        document.body.classList.add('busy');
        try { await fn(); } finally { busy = false; document.body.classList.remove('busy'); }
    }

    async function handleFiles(files) {
        const list = Array.from(files);
        if (!list.length) return;
        await withBusy(async () => {
            let ok = 0;
            const errors = [];
            for (const [i, f] of list.entries()) {
                const progress = list.length > 1 ? ` (${i + 1}/${list.length})` : '';
                setStatus((aiActive() ? 'Claude wertet ' : 'Lese ') + f.name + ' aus' + progress + ' …');
                try {
                    const { text, pdfBase64 } = await readFile(f);
                    if (!text.trim() && !pdfBase64) throw new Error('kein Text gefunden (eingescanntes Dokument? Mit der KI-Auswertung lesbar)');
                    const c = await addCandidate(f.name, text, pdfBase64);
                    if (c.aiError) errors.push(f.name + ': KI-Auswertung fehlgeschlagen (' + c.aiError + ') – Regeln verwendet');
                    if (!c.entries.length) errors.push(f.name + ': keine Zeiträume erkannt – bitte manuell ergänzen');
                    ok++;
                    render();
                } catch (e) {
                    errors.push(f.name + ': ' + e.message);
                }
            }
            setStatus((ok ? ok + ' Lebenslauf/-läufe ausgewertet. ' : '') + errors.join(' · '), errors.length > 0 && !ok);
            render();
            $('#detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    // --- Rendering ---
    function catOptions(selected, includeSpecial) {
        const cats = includeSpecial ? allCats() : settings.categories;
        return cats.map(c => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
    }

    function renderTargetSelect() {
        if (!settings.categories.some(c => c.id === defaultTarget)) defaultTarget = settings.categories[0]?.id || '';
        $('#defaultTarget').innerHTML = catOptions(defaultTarget, false);
    }

    function render() {
        renderTargetSelect();
        $('#privacy').innerHTML = aiActive()
            ? '✨ KI-Auswertung mit Claude ist aktiv: Lebensläufe werden zur Auswertung an Anthropic (Claude API) gesendet.'
            : '🔒 Dateien werden nur lokal in diesem Browser verarbeitet und nirgends hochgeladen.';
        renderOverview();
        renderDetail();
    }

    function renderOverview() {
        $('#overview').hidden = candidates.length === 0;
        $('#overviewBody').innerHTML = candidates.map(c => {
            const r = P.compute(c.entries, c.target, settings);
            return `<tr data-select="${c.id}" class="${c.id === selectedId ? 'active' : ''}">
                <td><strong>${esc(c.name)}</strong></td>
                <td>${esc(catName(c.target))}</td>
                <td class="num">${fmt(r.totalYears)}</td>
                <td class="num">${fmt(r.targetYears)}</td>
                <td class="num">${fmt(r.otherYears)}</td>
                <td class="num"><strong>${fmt(r.creditedYears)}</strong></td>
                <td class="num"><button class="btn-icon" type="button" data-remove="${c.id}" title="Entfernen" aria-label="Entfernen">✕</button></td>
            </tr>`;
        }).join('');
    }

    function renderDetail() {
        const c = candidates.find(x => x.id === selectedId);
        const el = $('#detail');
        if (!c) { el.innerHTML = ''; return; }
        const r = P.compute(c.entries, c.target, settings);

        // Aufschlüsselung nach Faktor
        const groups = new Map();
        c.entries.forEach((e, i) => {
            const pe = r.perEntry[i];
            if (!e.include || pe.factor <= 0 || pe.credited <= 0) return;
            groups.set(pe.factor, (groups.get(pe.factor) || 0) + pe.credited / (pe.factor / 100));
        });
        const parts = [...groups.entries()].sort((a, b) => b[0] - a[0])
            .map(([f, m]) => `${fmt(m / 12)} J. × ${f} %`);
        const formula = parts.length
            ? `${parts.join(' + ')} = <b>${fmt(r.capped ? r.creditedYears : [...groups.entries()].reduce((s, [f, m]) => s + m * f / 100, 0) / 12)} Jahre</b>${r.capped ? ` (begrenzt auf Maximum ${fmt(settings.maxYears)} J.)` : ''}`
            : 'Noch keine anrechenbare Erfahrung erfasst.';

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
                    ${auto ? '<div class="factor-auto">automatisch</div>' : ''}
                </td>
                <td class="num"><strong>${fmt(pe.credited / 12)}</strong></td>
                <td><button class="btn-icon" type="button" data-del="${e.id}" title="Zeile löschen" aria-label="Zeile löschen">✕</button></td>
            </tr>`;
        }).join('');

        el.innerHTML = `<div class="card">
            <div class="detail-head">
                <input type="text" class="name-input" data-cf="name" value="${esc(c.name)}" aria-label="Name">
                <label class="field"><span>Bewerbung als</span><select data-cf="target">${catOptions(c.target, false)}</select></label>
            </div>
            <p class="source">${c.source === 'ki' ? '<span class="pill pill-ai">✨ ausgewertet mit Claude</span>' : '<span class="pill">ausgewertet mit Regeln</span>'}
                ${c.aiError ? `<span class="source-error">KI-Auswertung fehlgeschlagen: ${esc(c.aiError)}</span>` : ''}</p>
            ${c.hinweise ? `<div class="notice"><b>Hinweis von Claude:</b> ${esc(c.hinweise)}</div>` : ''}
            <div class="stats">
                <div class="stat"><div class="label">Berufserfahrung total</div><div class="value">${fmt(r.totalYears)}<span class="unit">J.</span></div><div class="extra">${fmtYM(r.totalYears)}</div></div>
                <div class="stat"><div class="label">davon als ${esc(catName(c.target))}</div><div class="value">${fmt(r.targetYears)}<span class="unit">J.</span></div><div class="extra">${fmtYM(r.targetYears)}</div></div>
                <div class="stat"><div class="label">andere Berufe</div><div class="value">${fmt(r.otherYears)}<span class="unit">J.</span></div><div class="extra">${fmtYM(r.otherYears)}</div></div>
                <div class="stat primary"><div class="label">Anrechenbare Jahre</div><div class="value">${fmt(r.creditedYears)}<span class="unit">J.</span></div><div class="extra">${fmtYM(r.creditedYears)}</div></div>
            </div>
            <div class="formula">${formula}</div>
            ${c.entries.length ? `<div class="table-scroll"><table class="table entries-table">
                <thead><tr>
                    <th title="Anrechnen">✓</th><th>Funktion / Stelle</th><th>Beruf</th><th>Von</th><th>Bis</th>
                    <th>Pensum</th><th class="num">Dauer</th><th>Faktor</th><th class="num">Angerechnet</th><th></th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table></div>` : '<p class="empty">Keine Zeiträume erkannt. Bitte Stellen manuell hinzufügen.</p>'}
            <div class="detail-actions">
                <button class="btn btn-ghost btn-sm" type="button" data-action="add">+ Stelle hinzufügen</button>
                <button class="btn btn-ghost btn-sm" type="button" data-action="reparse">Neu auswerten</button>
            </div>
            ${c.text.trim() ? `<details class="rawtext"><summary>Erkannter Text anzeigen</summary><pre>${esc(c.text)}</pre></details>` : ''}
        </div>`;
    }

    // --- Events: Upload ---
    const dz = $('#dropzone');
    dz.addEventListener('click', () => $('#fileInput').click());
    dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#fileInput').click(); } });
    $('#fileInput').addEventListener('change', e => { handleFiles(e.target.files); e.target.value = ''; });
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', e => handleFiles(e.dataTransfer.files));

    $('#defaultTarget').addEventListener('change', e => {
        defaultTarget = e.target.value;
        storageSet(TARGET_KEY, defaultTarget);
        candidates.forEach(c => { c.target = defaultTarget; });
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
        const name = $('#pasteName').value;
        withBusy(async () => {
            setStatus(aiActive() ? 'Claude wertet den Text aus …' : '');
            const c = await addCandidate(name || 'Eingefügter Text', text);
            if (name) c.autoName = false;
            setStatus(c.aiError ? 'KI-Auswertung fehlgeschlagen (' + c.aiError + ') – Regeln verwendet' : '', !!c.aiError);
            render();
        });
    });

    $('#exampleBtn').addEventListener('click', () => {
        withBusy(async () => {
            setStatus(aiActive() ? 'Claude wertet das Beispiel aus …' : '');
            const c = await addCandidate('Beispiel Anna Muster', EXAMPLE);
            setStatus(c.aiError ? 'KI-Auswertung fehlgeschlagen (' + c.aiError + ') – Regeln verwendet' : '', !!c.aiError);
            render();
        });
    });

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

    // --- Events: Detail ---
    const detail = $('#detail');
    detail.addEventListener('change', e => {
        const c = candidates.find(x => x.id === selectedId);
        if (!c) return;
        const t = e.target;
        if (t.dataset.cf) {
            c[t.dataset.cf] = t.value;
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
        if (f === 'category') entry.include = t.value !== '__ausbildung' || settings.educationFactor > 0;
        render();
    });
    detail.addEventListener('click', e => {
        const c = candidates.find(x => x.id === selectedId);
        if (!c) return;
        const del = e.target.closest('[data-del]');
        if (del) {
            c.entries = c.entries.filter(x => x.id !== del.dataset.del);
            render();
            return;
        }
        const act = e.target.closest('[data-action]');
        if (!act) return;
        if (act.dataset.action === 'add') {
            c.entries.push({
                id: 'e' + Math.random().toString(36).slice(2, 9), include: true, start: '', end: '', ongoing: false,
                title: '', details: '', category: c.target, pensum: 100, factorOverride: null, raw: '', imprecise: false
            });
            render();
            const inputs = detail.querySelectorAll('input[data-f="title"]');
            inputs[inputs.length - 1]?.focus();
        } else if (act.dataset.action === 'reparse') {
            if (confirm('Lebenslauf neu auswerten? Manuelle Änderungen an den Stellen gehen verloren.')) {
                withBusy(async () => {
                    setStatus(aiActive() ? 'Claude wertet ' + c.name + ' neu aus …' : '');
                    await analyzeCandidate(c);
                    setStatus(c.aiError ? 'KI-Auswertung fehlgeschlagen (' + c.aiError + ') – Regeln verwendet' : '', !!c.aiError);
                    render();
                });
            }
        }
    });

    // --- CSV-Export ---
    $('#exportCsv').addEventListener('click', () => {
        const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
        const n = y => (Math.round(y * 100) / 100).toFixed(2).replace('.', ',');
        const lines = [['Person', 'Bewerbung als', 'Total Jahre', 'Jahre im Zielberuf', 'Jahre andere Berufe', 'Anrechenbare Jahre'].map(q).join(';')];
        const details = [['Person', 'Funktion', 'Beruf', 'Von', 'Bis', 'Pensum %', 'Angerechnet (ja/nein)', 'Faktor %', 'Dauer Jahre', 'Angerechnete Jahre'].map(q).join(';')];
        for (const c of candidates) {
            const r = P.compute(c.entries, c.target, settings);
            lines.push([q(c.name), q(catName(c.target)), n(r.totalYears), n(r.targetYears), n(r.otherYears), n(r.creditedYears)].join(';'));
            c.entries.forEach((e, i) => {
                const pe = r.perEntry[i];
                details.push([q(c.name), q(e.title), q(catName(e.category)), q(e.start), q(e.ongoing ? 'heute' : e.end), e.pensum,
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

    function renderAiForm() {
        const models = window.CVAi ? window.CVAi.MODELS : [{ id: 'claude-opus-5', name: 'Claude Opus 5' }];
        const current = ai.model || (window.CVAi ? window.CVAi.DEFAULT_MODEL : 'claude-opus-5');
        $('#aiEnabled').checked = ai.enabled;
        $('#aiKey').value = ai.apiKey;
        $('#aiModel').innerHTML = models.map(m => `<option value="${esc(m.id)}"${m.id === current ? ' selected' : ''}>${esc(m.name)}</option>`).join('');
    }

    function renderSettingsForm() {
        $('#sSame').value = draft.sameFactor;
        $('#sRelated').value = draft.relatedFactor;
        $('#sOther').value = draft.otherFactor;
        $('#sEdu').value = draft.educationFactor;
        $('#sPensum').checked = !!draft.pensumMode;
        $('#sMax').value = draft.maxYears ?? '';
        $('#catList').innerHTML = draft.categories.map(cat => `<div class="cat-item" data-cat="${esc(cat.id)}">
            <label class="field"><span>Bezeichnung</span><input type="text" data-k="name" value="${esc(cat.name)}" required></label>
            <label class="field"><span>Stichwörter (durch Komma getrennt)</span><textarea rows="2" data-k="keywords">${esc(cat.keywords.join(', '))}</textarea></label>
            <button class="btn-icon" type="button" data-delcat="${esc(cat.id)}" title="Beruf löschen" aria-label="Beruf löschen">✕</button>
            <div class="cat-related"><span>Verwandt mit:</span>${draft.categories.filter(o => o.id !== cat.id).map(o =>
                `<label class="check"><input type="checkbox" data-rel="${esc(o.id)}" ${cat.related.includes(o.id) ? 'checked' : ''}> ${esc(o.name)}</label>`).join('')}</div>
        </div>`).join('');
    }

    function readSettingsForm() {
        const num = (id, d) => { const v = $(id).value; return v === '' ? d : Math.max(0, Math.min(100, +v)); };
        draft.sameFactor = num('#sSame', 100);
        draft.relatedFactor = num('#sRelated', 75);
        draft.otherFactor = num('#sOther', 50);
        draft.educationFactor = num('#sEdu', 0);
        draft.pensumMode = $('#sPensum').checked;
        draft.maxYears = $('#sMax').value === '' ? null : Math.max(0, +$('#sMax').value);
        document.querySelectorAll('#catList .cat-item').forEach(item => {
            const cat = draft.categories.find(c => c.id === item.dataset.cat);
            cat.name = item.querySelector('[data-k="name"]').value.trim() || 'Unbenannt';
            cat.keywords = item.querySelector('[data-k="keywords"]').value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
            cat.related = [...item.querySelectorAll('[data-rel]:checked')].map(x => x.dataset.rel);
        });
    }

    $('#openSettings').addEventListener('click', () => {
        draft = clone(settings);
        renderAiForm();
        renderSettingsForm();
        $('#settingsDialog').showModal();
    });
    $('#addCat').addEventListener('click', () => {
        readSettingsForm();
        draft.categories.push({ id: 'k' + Math.random().toString(36).slice(2, 8), name: 'Neuer Beruf', keywords: [], related: [] });
        renderSettingsForm();
        const names = document.querySelectorAll('#catList [data-k="name"]');
        names[names.length - 1].select();
    });
    $('#catList').addEventListener('click', e => {
        const b = e.target.closest('[data-delcat]');
        if (!b) return;
        readSettingsForm();
        const id = b.dataset.delcat;
        draft.categories = draft.categories.filter(c => c.id !== id);
        draft.categories.forEach(c => { c.related = c.related.filter(r => r !== id); });
        renderSettingsForm();
    });
    $('#resetSettings').addEventListener('click', () => {
        if (!confirm('Alle Einstellungen auf den Standard zurücksetzen?')) return;
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
            const s = JSON.parse(await f.text());
            if (!Array.isArray(s.categories)) throw new Error();
            draft = Object.assign(clone(P.DEFAULT_SETTINGS), s);
            renderSettingsForm();
        } catch (err) {
            alert('Die Datei enthält keine gültigen Einstellungen.');
        }
    });
    $('#settingsDialog').addEventListener('close', () => {
        if ($('#settingsDialog').returnValue !== 'save') return;
        readSettingsForm();
        if (!draft.categories.length) { alert('Es muss mindestens ein Beruf vorhanden sein.'); return; }
        settings = draft;
        saveSettings();
        ai = { enabled: $('#aiEnabled').checked, apiKey: $('#aiKey').value.trim(), model: $('#aiModel').value };
        storageSet(AI_KEY, JSON.stringify(ai));
        if (ai.enabled && !ai.apiKey) setStatus('KI-Auswertung ist eingeschaltet, aber es fehlt der API-Schlüssel.', true);
        const ids = new Set(allCats().map(c => c.id));
        for (const c of candidates) {
            if (!settings.categories.some(k => k.id === c.target)) c.target = settings.categories[0].id;
            c.entries.forEach(e => { if (!ids.has(e.category)) e.category = '__sonstige'; });
        }
        render();
    });

    const EXAMPLE = `Anna Muster
Bahnhofstrasse 1, 6300 Zug

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
})();
