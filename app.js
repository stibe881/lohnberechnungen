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
    const OVERVIEW_MAX = 2; // so viele Personen zeigt die Übersicht auf der Startseite

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
        users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
        copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
        trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
        check: '<path d="M20 6 9 17l-5-5"/>',
        clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
        file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
        download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
        external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
        briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
        info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
        compare: '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"/><path d="m15 9 6-6"/>',
        print: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3h12v6"/><rect width="12" height="8" x="6" y="14"/>',
        history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>'
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
    const isPosChoice = v => typeof v === 'string' && v.startsWith('pos:');
    const positionOf = id => (settings.positions || []).find(p => p.id === id) || null;
    /** Person einer offenen Stelle zuordnen: Funktion und Pensum der Stelle übernehmen. */
    function applyPosition(c, pos) {
        c.positionId = pos.id;
        if (pos.templateId && settings.templates.some(t => t.id === pos.templateId)) { c.templateId = pos.templateId; c.autoTemplate = false; c.baseTemplateId = ''; }
        c.newPensum = pos.pensum || 100;
        c.newLessons = pos.lessons ?? null;
        if (!c.startDateEdited) c.startDate = pos.start || '';
    }
    /**
     * Einträge für die Berechnung: die Stellen aus dem Lebenslauf plus – wie in der Berechnungsvorlage der
     * Personalabteilung – die neue Stelle selbst ab Stellenantritt bis zum Stichtag (zählt als Zielberuf).
     */
    function newJobEntry(c) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(c.startDate || '')) return null;
        const t = tplOf(c);
        const cutoff = P.cutoffDate(t);
        if (c.startDate > cutoff) return null;
        return { id: '__newjob', include: true, start: c.startDate.slice(0, 7), end: '', ongoing: true, title: 'Neue Stelle ab Stellenantritt', details: `${fmtDay(c.startDate)} bis Stichtag ${fmtDay(cutoff)}`, category: t.target, pensum: Math.round(pensumOf(c, t)), factorOverride: null, synthetic: true };
    }
    const entriesFor = c => { const j = newJobEntry(c); return j ? c.entries.concat(j) : c.entries; };
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
    const computeFor = c => P.compute(entriesFor(c), tplOf(c), undefined, { birth: c.birth });
    const adjustmentOf = c => (settings.classAdjustments || []).find(a => a.id === c.adjustmentId) || null;
    /** Lohneinreihung mit der Gehaltstabelle, die für die Vorlage gilt (fest gewählt oder am Stichtag gültig). */
    function placementFor(c, r) {
        const t = tplOf(c);
        if (t.fixedAnnual) return { fixed: true, salary: +t.fixedAnnual, table: null, future: false, years: Math.floor(r.creditedYears + 1e-9) };
        const sel = P.selectSalaryTable(settings.salaryTables, t);
        const pl = P.placement(r.creditedYears, t, adjustmentOf(c), sel.table);
        return pl && Object.assign(pl, { table: sel.table, future: sel.future });
    }
    /** Schweizer Geldformat: CHF 87’450.– bzw. CHF 87’450.50 (Apostroph als Tausendertrennzeichen, auf 5 Rappen gerundet). */
    const chf = v => P.formatChf(Math.round(v * 20) / 20);
    const chfExact = v => P.formatChf(v);
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

    /** Gewählte Zulagen der Person (ohne eigene Wahl: vorgeschlagen aufgrund der Ausbildung). */
    function allowancesOf(c, t) {
        const all = t.allowances || [];
        const ids = Array.isArray(c.allowances) ? c.allowances : P.suggestedAllowances(t, c.entries);
        return all.filter(a => ids.includes(a.id));
    }
    /** Lohn der Person: Jahreslohn beim Pensum, Zulagen (anteilig), Total und Monatslohn. */
    function salaryOf(c, pl) {
        const t = tplOf(c);
        if (!pl || !pl.salary) return null;
        const p = pensumOf(c, t);
        const base = pl.salary * p / 100;
        const allowances = allowancesOf(c, t).map(a => ({ label: a.label, annual: a.annual, amount: a.annual * p / 100 }));
        const total = base + allowances.reduce((x, a) => x + a.amount, 0);
        return { pensum: p, full: pl.salary, base, allowances, total, payments: t.payments, monthly: total / t.payments, monthlyOther: total / (t.payments === 12 ? 13 : 12) };
    }
    /** Angaben von Claude zur Korrektur – «Ausbildung passt» nur für die Funktion, die Claude beurteilt hat. */
    function flagsFor(c) {
        if (!c.aiFlags) return null;
        const f = Object.assign({}, c.aiFlags);
        if (f.forFunction !== c.templateId) delete f.qualificationMatches;
        return f;
    }
    /** Vorgeschlagene Korrekturen, die noch nicht übernommen oder ignoriert wurden. */
    function correctionsFor(c) {
        return P.suggestCorrections(c.entries, tplOf(c), settings.classAdjustments, flagsFor(c))
            .filter(x => x.id !== c.adjustmentId && !(c.dismissedAdj || []).includes(x.id));
    }
    /** Fingerabdruck der Auswertung: ändert sich etwas nach der Prüfung, muss neu geprüft werden. */
    function reviewSnapshot(c) {
        const r = computeFor(c), pl = placementFor(c, r), sal = salaryOf(c, pl);
        return JSON.stringify([c.templateId, c.baseTemplateId || '', Math.round(r.creditedYears * 100), pl ? [pl.cls, pl.stage] : null, c.adjustmentId || '', sal ? Math.round(sal.total) : null]);
    }
    function reviewState(c) {
        const rv = c.review;
        if (!rv || !rv.checkedBy) return { checked: false, approved: false, stale: false };
        const stale = rv.snapshot !== reviewSnapshot(c);
        return { checked: !stale, approved: !stale && (!settings.fourEyes || !!rv.approvedBy), stale, needsApproval: !stale && settings.fourEyes && !rv.approvedBy };
    }
    const fmtWhen = iso => iso ? new Date(iso).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' }) : '';

    /** Lohneinreihung als Text, z. B. «Lohnklasse 12, Stufe 6 · Jahreslohn CHF 95'000.00 bei 100 % · …». */
    function placementText(c, pl) {
        if (!pl) return '';
        const t = tplOf(c);
        const parts = [pl.fixed ? 'Fixer Lohn gemäss Funktion' : `Lohnklasse ${pl.cls}, Stufe ${pl.stage}`];
        const sal = salaryOf(c, pl);
        if (sal) {
            const p = sal.pensum, other = t.payments === 12 ? 13 : 12;
            parts.push(`Jahreslohn ${chf(sal.full)} bei 100 %`);
            if (t.lessonsFull && p !== 100) parts.push(`${chf(sal.base)} bei ${fmtNum(c.newLessons ?? t.lessonsFull)} von ${fmtNum(t.lessonsFull)} Lektionen (${fmtNum(p)} %)`);
            else if (t.lessonsFull) parts[parts.length - 1] += ` (${fmtNum(t.lessonsFull)} Lektionen)`;
            else if (p !== 100) parts.push(`${chf(sal.base)} bei ${fmtNum(p)} %`);
            sal.allowances.forEach(a => parts.push(`+ ${a.label} ${chf(a.amount)}`));
            if (sal.allowances.length) parts.push(`Total ${chf(sal.total)} pro Jahr`);
            parts.push(`Monatslohn ${chf(sal.monthly)} (${t.payments} Auszahlungen; bei ${other}: ${chf(sal.monthlyOther)})`);
        }
        if (t.lessonsFull && pl.lesson) parts.push(`pro Lektion ${chfExact(pl.lesson)}`);
        else if (pl.hour) parts.push(`pro Stunde ${chfExact(pl.hour)}`);
        return parts.join(' · ');
    }
    function placementWhy(t, pl) {
        if (!pl) return '';
        if (pl.fixed) return `Fixer Jahreslohn der Funktion «${t.name}», unabhängig von der Erfahrung` + (t.note ? '. ' + t.note : '');
        let s = `${pl.years} volle Erfahrungsjahre → Stufe ${pl.stage}${pl.stage >= pl.maxStage ? ` (höchste Stufe ${pl.maxStage})` : t.stageMode === 'plusOne' ? ' (Dienstjahre + 1)' : pl.years < 1 ? ' (mindestens Stufe 1)' : ''}; Grundklasse ${t.classMin}` + (t.classMax && t.classMax !== t.classMin ? ` (Funktion ${t.classMin}–${t.classMax})` : '');
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

    // --- Meldungen (Toasts) und Fortschritt ---
    const toastBox = document.createElement('div');
    toastBox.className = 'toasts';
    toastBox.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastBox);
    /**
     * Kurze Meldung unten rechts. kind: 'ok' | 'info' | 'warn' | 'error'.
     * opts.action = {label, fn} zeigt einen Knopf (z. B. «Rückgängig»); opts.ms = Anzeigedauer; opts.onExpire läuft, wenn die Meldung ohne Klick verschwindet.
     */
    function toast(msg, kind, opts) {
        opts = opts || {};
        kind = kind || 'info';
        const el = document.createElement('div');
        el.className = 'toast toast-' + kind;
        el.setAttribute('role', kind === 'error' || kind === 'warn' ? 'alert' : 'status');
        const icons = { ok: 'check', info: 'info', warn: 'alert', error: 'alert' };
        el.innerHTML = `<span class="toast-icon">${icon(icons[kind])}</span><span class="toast-text">${esc(msg)}</span>`
            + (opts.action ? `<button type="button" class="toast-action">${esc(opts.action.label)}</button>` : '')
            + `<button type="button" class="toast-close" aria-label="Schliessen">${icon('x')}</button>`;
        let done = false;
        const remove = () => { if (el.isConnected) { el.classList.add('out'); setTimeout(() => el.remove(), 180); } };
        const finish = expired => { if (done) return; done = true; clearTimeout(timer); remove(); if (expired && opts.onExpire) opts.onExpire(); };
        const ms = opts.ms || (opts.action ? 8000 : kind === 'error' ? 9000 : 4500);
        const timer = setTimeout(() => finish(true), ms);
        el.querySelector('.toast-close').addEventListener('click', () => finish(true));
        if (opts.action) el.querySelector('.toast-action').addEventListener('click', () => { finish(false); opts.action.fn(); });
        // In einem offenen modalen Dialog ist die Seite dahinter gesperrt – die Meldung muss dann im Dialog liegen
        const box = toastContainer();
        box.appendChild(el);
        while (box.children.length > 4) box.firstChild.remove();
        return { close: () => finish(true) };
    }
    function toastContainer() {
        const dlg = [...document.querySelectorAll('dialog[open]')].pop();
        if (!dlg) return toastBox;
        let box = dlg.querySelector(':scope > .toasts');
        if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('aria-live', 'polite'); dlg.appendChild(box); }
        return box;
    }
    /** Meldung zur Auswertung: Fehler als rote Meldung, sonst kurze Bestätigung. Leer = nur die Statuszeile löschen. */
    function setStatus(msg, isError) {
        const el = $('#status');
        el.textContent = isError ? msg || '' : ''; // Fehler bleiben stehen, alles andere erscheint nur kurz als Meldung
        el.classList.toggle('error', !!isError);
        if (msg) toast(msg, isError ? 'error' : 'ok');
    }

    /**
     * Etwas sofort tun und 8 Sekunden lang «Rückgängig» anbieten. undo() stellt den vorherigen Zustand wieder her,
     * commit() (optional) läuft erst, wenn die Frist ohne Klick abgelaufen ist – z. B. das endgültige Löschen auf dem Server.
     */
    function undoable(msg, undo, commit) {
        return toast(msg, 'info', { action: { label: 'Rückgängig', fn: undo }, onExpire: commit, ms: 8000 });
    }
    /** Fortschrittsbalken unter der Ablagefläche: done von total, mit Beschriftung. */
    function setProgress(done, total, label) {
        const box = $('#progress');
        if (!total) { box.hidden = true; return; }
        box.hidden = false;
        box.querySelector('.progress-bar').style.width = Math.round(done / total * 100) + '%';
        box.querySelector('.progress-text').textContent = label || `${done} von ${total} ausgewertet`;
        box.setAttribute('aria-valuenow', done);
        box.setAttribute('aria-valuemax', total);
    }
    /** Arbeitsschritt einer Person während der Auswertung (für Übersicht und Personenansicht). */
    function setStep(c, step) {
        c.step = step;
        const els = document.querySelectorAll(`[data-step="${c.id}"]`);
        els.forEach(el => { el.textContent = step; });
    }
    const STEP_TEXT = { read: 'Text wird gelesen …', ai: 'Claude wertet aus …', rules: 'Regeln werden angewendet …', calc: 'Einreihung wird berechnet …' };


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
                setStep(c, STEP_TEXT.ai);
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
                c.aiFlags = res.flags || null;
                applySuggestion(c, res);
                if (res.name && c.autoName) { c.name = res.name; c.autoName = false; }
                if (res.birth && !c.birthEdited) c.birth = res.birth;
                c.source = 'ki';
                c.model = ai.model || window.CVAi.DEFAULT_MODEL;
                setStep(c, STEP_TEXT.calc);
                return;
            } catch (e) {
                c.aiError = e.message;
            }
        }
        setStep(c, STEP_TEXT.rules);
        c.entries = P.extractEntries(c.text, settings);
        c.aiFlags = null;
        applySuggestion(c, null);
        if (!c.birthEdited) c.birth = P.extractBirth(c.text) || c.birth || '';
        c.source = 'regeln';
        setStep(c, STEP_TEXT.calc);
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
            templateId: defaultTemplateId === AUTO || isPosChoice(defaultTemplateId) ? settings.templates[0].id : defaultTemplateId,
            autoTemplate: defaultTemplateId === AUTO, // Funktion aus dem Lebenslauf vorschlagen
            positionId: '',
            startDate: '',         // Stellenantritt (aus der Stelle oder von Hand); zählt bis zum Stichtag als Erfahrung
            startDateEdited: false,
            status: 'neu',
            review: null,          // {checkedBy, checkedAt, approvedBy, approvedAt, snapshot}
            allowances: null,      // gewählte Zulagen (null = Vorschlag aus der Ausbildung)
            dismissedAdj: [],      // ignorierte Korrekturvorschläge
            suggestion: null,
            baseTemplateId: '',
            adjustmentId: '',
            newPensum: 100,
            entries: [],
            createdAt: new Date().toISOString(),
            file: null,        // Originaldatei (nur im Speicher, bis sie in der Datenbank liegt)
            hasFile: false,    // Datei liegt in der Datenbank
            fileName: '',
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
            setProgress(0, sources.length, `Dateien werden gelesen (0 von ${sources.length}) …`);
            let read = 0;
            for (const src of sources) {
                try {
                    const { text, pdfBase64 } = src.file ? await readFile(src.file, useAi) : { text: src.text, pdfBase64: null };
                    setProgress(++read, sources.length, `Dateien werden gelesen (${read} von ${sources.length}) …`);
                    const c = newCandidate(src.name, text, pdfBase64);
                    if (src.fixedName) c.autoName = false;
                    if (src.file) { c.file = src.file; c.fileName = src.file.name; }
                    if (isPosChoice(defaultTemplateId)) { const pos = positionOf(defaultTemplateId.slice(4)); if (pos) applyPosition(c, pos); }
                    batch.push(c);
                } catch (e) {
                    errors.push(src.name + ': ' + e.message);
                }
            }
            if (!batch.length) { setProgress(0, 0); setStatus(errors.join(' · '), true); return; }
            candidates.push(...batch);
            batch.forEach(c => { c.step = STEP_TEXT.read; });
            selectedId = batch[0].id;
            render();

            let done = 0;
            const progress = () => setProgress(done, batch.length, `${done} von ${batch.length} ausgewertet` + (useAi ? ' (mit Claude)' : ''));
            progress();
            await pool(batch, useAi ? CONCURRENCY : 1, async c => {
                await analyzeCandidate(c, useAi);
                c.loading = false;
                c.step = '';
                if (c.aiError) errors.push(c.name + ': KI-Auswertung fehlgeschlagen (' + c.aiError + ') – Regeln verwendet');
                if (!c.entries.length) errors.push(c.name + ': keine Zeiträume erkannt – bitte manuell ergänzen');
                done++;
                progress();
                renderOverview();
                if (c.id === selectedId) renderDetail();
            });
            setProgress(0, 0);
            if (errors.length) errors.forEach(e => toast(e, 'warn', { ms: 9000 }));
            toast(batch.length === 1 ? `${batch[0].name} ausgewertet.` : `${batch.length} Lebensläufe ausgewertet.`, 'ok');
            $('#status').textContent = '';
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
        parts.push(t.combine === 'sumAll' ? 'gleichzeitige Tätigkeiten werden ohne Begrenzung addiert (wie Vorlage Personal)' : t.combine === 'sum' ? 'gleichzeitige Tätigkeiten werden addiert, max. 100 % pro Monat' : 'bei gleichzeitigen Tätigkeiten zählt die höchste Anrechnung');
        if (t.cutoff === 'yearEnd') parts.push('Stichtag 31.12. des laufenden Jahres');
        if (t.minAge) parts.push(`angerechnet ab Alter ${t.minAge}`);
        if (t.maxYears) parts.push(`höchstens ${fmt(t.maxYears)} J.`);
        if (t.rounding && t.rounding !== 'none') parts.push((P.ROUNDING.find(r => r.id === t.rounding) || {}).name);
        return parts.join(' · ');
    }

    /** Rechenweg als HTML (Werte sind Zahlen, Texte escaped). */
    function formulaHtml(c, r, t) {
        const groups = new Map();
        entriesFor(c).forEach((e, i) => {
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
        return window.CVTimeline ? CVTimeline.render({ entries: entriesFor(c), perEntry: r.perEntry, catName, minAgeMonth: r.minAgeMonth, endMonth: r.cutoffMonth }) : '';
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
            name: c.name, birth: c.birth, entries: entriesFor(c), result: r, template: t, catName,
            startDateText: newJobEntry(c) ? `${fmtDay(c.startDate)} (zählt bis Stichtag ${fmtDay(P.cutoffDate(t))} als Erfahrung im Zielberuf)` : c.startDate ? fmtDay(c.startDate) : '',
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
            statusText: (P.STATUSES.find(x => x.id === (c.status || 'neu')) || {}).name || '',
            positionText: c.positionId && positionOf(c.positionId) ? positionOf(c.positionId).title : '',
            placement: pl,
            salary: salaryOf(c, pl),
            adjustmentText: adjustmentOf(c) ? adjustmentOf(c).label : '',
            openCorrections: correctionsFor(c).map(x => `${x.label} (${x.reason})`),
            outlook: pl && !pl.fixed ? P.salaryOutlook(r.creditedYears, t, adjustmentOf(c), settings.salaryTables, undefined, 10).map(x => {
                const sal = salaryOf(c, pl), p = pensumOf(c, t), allow = allowancesOf(c, t).reduce((a, z) => a + z.annual, 0);
                return Object.assign(x, { amount: x.salary ? (x.salary + allow) * p / 100 : null, monthly: x.salary ? (x.salary + allow) * p / 100 / t.payments : null, sal });
            }) : [],
            pensumText: t.lessonsFull ? `${fmtNum(c.newLessons ?? t.lessonsFull)} von ${fmtNum(t.lessonsFull)} Lektionen (${fmtNum(pensumOf(c, t))} %)` : `${fmtNum(pensumOf(c, t))} %`,
            review: (st => ({
                checked: st.checked ? `${c.review.checkedBy}, ${fmtWhen(c.review.checkedAt)}` : st.stale ? `nach Prüfung durch ${c.review.checkedBy} geändert – nicht geprüft` : '',
                approved: st.checked && c.review.approvedBy ? `${c.review.approvedBy}, ${fmtWhen(c.review.approvedAt)}` : '',
                fourEyes: !!settings.fourEyes
            }))(reviewState(c)),
            chf, fmtNum,
            print: settings.print || {},
            timeline: timelineHtml(c, r)
        };
    }

    // --- Druckvorschau ---
    let printHtml = '';
    /** Zeigt Bericht oder Lohnblatt als Vorschau; gedruckt wird erst mit «Drucken / als PDF speichern». */
    function previewPrint(title, html) {
        printHtml = html;
        $('#printTitle').textContent = `${title} – Vorschau`;
        $('#printPreview').innerHTML = html;
        const n = $('#printPreview').querySelectorAll('.r-page').length;
        $('#printHint').textContent = `${n} Seite${n === 1 ? '' : 'n'} · A4`;
        $('#printDialog').showModal();
        $('#printPreview').scrollTop = 0;
    }
    $('#printGo').addEventListener('click', () => { $('#printDialog').close(); CVReport.printPages(printHtml); });
    ['#printClose', '#printCancel'].forEach(s => $(s).addEventListener('click', () => $('#printDialog').close()));

    // --- Rendering ---
    function catOptions(selected, includeSpecial) {
        const cats = includeSpecial ? allCats() : settings.categories;
        return cats.map(c => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
    }
    function tplOptions(selected) {
        return settings.templates.map(t => `<option value="${esc(t.id)}"${t.id === selected ? ' selected' : ''}>${esc(t.name)}</option>`).join('');
    }

    function render() {
        // Vorlage gibt es nicht mehr (z. B. nach dem Einlesen eines Reglements): automatisch vorschlagen, falls Stichwörter vorhanden
        if (isPosChoice(defaultTemplateId) && !(positionOf(defaultTemplateId.slice(4)) || {}).status) defaultTemplateId = AUTO;
        if (defaultTemplateId !== AUTO && !isPosChoice(defaultTemplateId) && !settings.templates.some(t => t.id === defaultTemplateId)) {
            defaultTemplateId = settings.templates.some(t => t.keywords && t.keywords.length) ? AUTO : settings.templates[0]?.id || '';
        }
        const openPos = (settings.positions || []).filter(p => p.status === 'offen');
        $('#defaultTemplate').innerHTML = `<option value="${AUTO}"${defaultTemplateId === AUTO ? ' selected' : ''}>Funktion automatisch vorschlagen (aus dem Lebenslauf)</option>`
            + (openPos.length ? `<optgroup label="Offene Stellen">${openPos.map(p => `<option value="pos:${esc(p.id)}"${defaultTemplateId === 'pos:' + p.id ? ' selected' : ''}>${esc(p.title)}</option>`).join('')}</optgroup>` : '')
            + `<optgroup label="Funktionen">${tplOptions(defaultTemplateId)}</optgroup>`;
        $('#privacy').innerHTML = aiActive()
            ? `${icon('sparkles')} KI-Auswertung mit Claude ist aktiv${ai.mode === 'server' ? ' (über euren Server)' : ''}: Lebensläufe werden an Anthropic (USA) gesendet${ai.textOnly ? ', nur als Text ohne Bilder' : ''}.`
            : ai.enabled
                ? icon('alert') + ' KI-Auswertung ist eingeschaltet, aber nicht eingerichtet (Einstellungen prüfen). Es wird mit den Regeln gerechnet.'
                : storeActive() ? icon('lock') + ' Lebensläufe werden in diesem Browser ausgelesen und nicht an Claude gesendet.' : icon('lock') + ' Dateien werden nur lokal in diesem Browser verarbeitet und nirgends hochgeladen.';
        if (storeActive()) $('#privacy').innerHTML += `<br>${icon('database')} Lebensläufe und Auswertungen werden in eurer Datenbank gespeichert${store.keepDays ? ` und nach ${store.keepDays} Tagen ohne Änderung gelöscht` : ''}.`
            + (store.error ? `<br><span class="warn store-warn">${icon('alert')} ${esc(store.error)}</span>` : '');
        else if (store.available) $('#privacy').innerHTML += `<br><span class="warn store-warn">${icon('alert')} Personen werden nicht gespeichert und sind nach dem Neuladen weg: ${esc(storeReason())}</span>`;
        // Einstieg: ohne Personen die Ablagefläche gross und die drei Schritte zeigen
        const empty = candidates.length === 0;
        $('#onboarding').hidden = !empty;
        document.querySelector('.upload-card').classList.toggle('empty-start', empty);
        renderOverview();
        renderDetail();
        if (view === 'applicants') { renderApplicants(); renderCv(); }
        if (view === 'positions') renderPositions();
        scheduleSave();
    }

    // --- Seite «Bewerbende» ---
    let view = 'main';
    const fileUrls = new Map(); // Objekt-URLs der Lebenslauf-Dateien (pro Person)
    let cvShownId = null;
    const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('de-CH') : '–';

    /** Wechselt zwischen Startseite und «Bewerbende» (#bewerbende); die Personenansicht wandert mit. */
    function showView() {
        view = location.hash === '#bewerbende' ? 'applicants' : location.hash === '#stellen' ? 'positions' : 'main';
        $('#viewMain').hidden = view !== 'main';
        $('#viewApplicants').hidden = view !== 'applicants';
        $('#viewPositions').hidden = view !== 'positions';
        $('#openApplicants').classList.toggle('active', view === 'applicants');
        $('#openPositions').classList.toggle('active', view === 'positions');
        const target = view === 'applicants' ? $('#applicantDetail') : $('#viewMain');
        if (detail.parentNode !== target) target.appendChild(detail);
        if (view === 'applicants') { cvShownId = null; if (!candidates.some(c => c.id === selectedId)) selectedId = null; }
        render();
        window.scrollTo(0, 0);
    }

    // --- Seite «Offene Stellen» ---
    let posFilter = 'offen', editingPos = null;
    const POS_STATUS = { offen: 'offen', besetzt: 'besetzt', geschlossen: 'geschlossen' };
    function renderPositions() {
        const all = settings.positions || [];
        const list = all.filter(p => posFilter === 'alle' || p.status === 'offen');
        const byPos = id => candidates.filter(c => c.positionId === id);
        $('#positionsInfo').textContent = `${all.filter(p => p.status === 'offen').length} offen, ${all.length} insgesamt. Bewerbende ordnest du beim Hochladen (Auswahl «Stelle / Vorlage») oder bei der Person einer Stelle zu.`;
        document.querySelectorAll('[data-posfilter]').forEach(b => b.classList.toggle('active', b.dataset.posfilter === posFilter));
        $('#positionsList').innerHTML = list.length ? list.map(p => {
            const t = settings.templates.find(x => x.id === p.templateId);
            const e = t ? P.effectiveTemplate(t, settings.templates) : null;
            const cands = byPos(p.id);
            const counts = P.STATUSES.map(st => [st, cands.filter(c => (c.status || 'neu') === st.id).length]).filter(([, n]) => n);
            return `<article class="pos-card pos-${p.status}">
                <header><h3>${esc(p.title)}</h3><span class="badge ${p.status === 'offen' ? 'badge-ok' : 'badge-off'}">${esc(POS_STATUS[p.status])}</span></header>
                <p class="pos-fn">${t ? esc(t.name) : '<span class="warn">keine Funktion gewählt</span>'}${e && e.classMin ? ` · LK ${e.classMin}${e.classMax && e.classMax !== e.classMin ? '–' + e.classMax : ''}` : e && e.fixedAnnual ? ' · fixer Lohn' : ''}</p>
                <dl class="pos-facts">
                    <div><dt>Pensum</dt><dd>${p.lessons ? `${fmtNum(p.lessons)} Lektionen` : `${p.pensum} %`}</dd></div>
                    <div><dt>Antritt</dt><dd>${p.start ? fmtDay(p.start) : '–'}</dd></div>
                    <div><dt>Bewerbende</dt><dd>${cands.length}</dd></div>
                </dl>
                ${counts.length ? `<div class="pos-status">${counts.map(([st, n]) => `<span class="status-pill st-${st.id}">${esc(st.name)} ${n}</span>`).join('')}</div>` : ''}
                ${p.note ? `<p class="hint">${esc(p.note)}</p>` : ''}
                <footer class="row-gap">
                    <button class="btn btn-primary btn-sm" type="button" data-posapplicants="${esc(p.id)}">${icon('users')} Bewerbende vergleichen</button>
                    <button class="btn btn-ghost btn-sm" type="button" data-editpos="${esc(p.id)}">${icon('pencil')} Bearbeiten</button>
                </footer>
            </article>`;
        }).join('') : `<p class="empty">${all.length ? 'Keine offenen Stellen. Unter «Alle» siehst du besetzte und geschlossene.' : 'Noch keine Stellen erfasst. Mit «Neue Stelle» legst du die erste an.'}</p>`;
    }
    function openPositionDialog(pos) {
        editingPos = pos;
        $('#positionDialogTitle').textContent = pos ? 'Stelle bearbeiten' : 'Neue Stelle';
        $('#posTemplate').innerHTML = settings.templates.map(t => `<option value="${esc(t.id)}"${pos && pos.templateId === t.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('');
        $('#posTitle').value = pos ? pos.title : '';
        $('#posPensum').value = pos ? pos.pensum : 100;
        $('#posLessons').value = pos && pos.lessons ? pos.lessons : '';
        $('#posStart').value = pos && pos.start ? pos.start : '';
        $('#posStatus').value = pos ? pos.status : 'offen';
        $('#posNote').value = pos ? pos.note : '';
        $('#deletePosition').hidden = !pos;
        updatePosLessons();
        $('#positionDialog').showModal();
        $('#posTitle').focus();
    }
    function updatePosLessons() {
        const t = settings.templates.find(x => x.id === $('#posTemplate').value);
        $('#posLessonsField').hidden = !(t && t.lessonsFull);
    }
    /** Stellen gehören zu den Einstellungen und werden für alle gespeichert. */
    function savePositions() {
        saveSettings();
        pushShared().catch(err => setStatus('Stelle nur in diesem Browser gespeichert: ' + err.message, true));
        render();
    }
    $('#addPosition').addEventListener('click', () => openPositionDialog(null));
    $('#posTemplate').addEventListener('change', updatePosLessons);
    $('#positionsList').addEventListener('click', e => {
        const ed = e.target.closest('[data-editpos]');
        if (ed) { openPositionDialog(positionOf(ed.dataset.editpos)); return; }
        const ap = e.target.closest('[data-posapplicants]');
        if (ap) { applicantPos = ap.dataset.posapplicants; applicantStatus = 'alle'; location.hash = '#bewerbende'; }
    });
    document.querySelectorAll('[data-posfilter]').forEach(b => b.addEventListener('click', () => { posFilter = b.dataset.posfilter; renderPositions(); }));
    $('#deletePosition').addEventListener('click', () => {
        if (!editingPos) return;
        const pos = editingPos, idx = settings.positions.indexOf(pos);
        const linked = candidates.filter(c => c.positionId === pos.id);
        settings.positions = settings.positions.filter(p => p !== pos);
        linked.forEach(c => { c.positionId = ''; });
        $('#positionDialog').close('deleted');
        savePositions();
        undoable(`Stelle «${pos.title}» gelöscht${linked.length ? ` – ${linked.length} Bewerbende ohne Stelle` : ''}.`, () => {
            settings.positions.splice(Math.min(idx, settings.positions.length), 0, pos);
            linked.forEach(c => { c.positionId = pos.id; });
            savePositions();
        });
    });
    $('#positionDialog').addEventListener('close', () => {
        if ($('#positionDialog').returnValue !== 'save') return;
        const title = $('#posTitle').value.trim();
        if (!title) return;
        const data = P.normalizeSettings({ categories: [], templates: [], positions: [{
            id: editingPos ? editingPos.id : undefined, title, templateId: $('#posTemplate').value,
            pensum: +$('#posPensum').value || 100, lessons: $('#posLessons').closest('label').hidden ? null : +$('#posLessons').value || null,
            start: $('#posStart').value, status: $('#posStatus').value, note: $('#posNote').value.trim()
        }] }).positions[0];
        settings.positions = settings.positions || [];
        if (editingPos) settings.positions[settings.positions.indexOf(editingPos)] = data;
        else settings.positions.unshift(data);
        savePositions();
    });

    /** Wie lange eine Person noch aufbewahrt wird (Tage bis zur Löschung). */
    function retentionBadge(c) {
        if (!savedJson.has(c.id)) return `<span class="badge" title="Nur in diesem Browser – nach dem Neuladen weg">nicht gespeichert</span>`;
        const own = (store.keepByStatus || {})[c.status || 'neu'];
        const days = own !== undefined && own > 0 ? own : store.keepDays;
        if (!days) return `<span class="badge badge-info" title="Wird nicht automatisch gelöscht">unbefristet</span>`;
        const until = (c.savedAt ? Date.parse(c.savedAt) : Date.now()) + days * 864e5;
        const left = Math.ceil((until - Date.now()) / 864e5);
        const title = `Wird am ${new Date(until).toLocaleDateString('de-CH')} endgültig gelöscht (${days} Tage nach der letzten Änderung${own !== undefined && own > 0 ? `, Frist für Status «${(P.STATUSES.find(x => x.id === (c.status || 'neu')) || {}).name}»` : ''})`;
        return `<span class="badge ${left <= 14 ? '' : 'badge-info'}" title="${esc(title)}">${icon(left <= 14 ? 'alert' : 'clock')} ${left <= 0 ? 'wird gelöscht' : `noch ${left} Tag${left === 1 ? '' : 'e'}`}</span>`;
    }

    let applicantStatus = 'alle', applicantPos = '';
    // Sortierung der Bewerbenden-Tabelle (bleibt im Browser gespeichert)
    const SORT_KEY = 'cvrechner.sort.v1';
    let applicantSort = (() => { try { return JSON.parse(storageGet(SORT_KEY)) || { key: 'created', dir: 'desc' }; } catch (e) { return { key: 'created', dir: 'desc' }; } })();
    /** Sortierwert einer Person für die Spalte key. */
    function sortValue(c, key) {
        if (c.loading) return null;
        const r = computeFor(c), pl = placementFor(c, r), sal = salaryOf(c, pl);
        switch (key) {
            case 'status': return P.STATUSES.findIndex(s => s.id === (c.status || 'neu'));
            case 'name': return (c.name || '').toLowerCase();
            case 'function': return tplOf(c).name.toLowerCase();
            case 'years': return r.creditedYears;
            case 'placement': return pl ? pl.fixed ? 0 : pl.cls * 100 + pl.stage : -1;
            case 'salary': return sal ? sal.total : -1;
            default: return c.createdAt || '';
        }
    }
    function sortApplicants(list) {
        const { key, dir } = applicantSort;
        const vals = new Map(list.map(c => [c.id, sortValue(c, key)]));
        const sign = dir === 'asc' ? 1 : -1;
        return list.slice().sort((a, b) => {
            const va = vals.get(a.id), vb = vals.get(b.id);
            if (va === null) return 1; if (vb === null) return -1;
            return (typeof va === 'string' ? va.localeCompare(vb, 'de') : va - vb) * sign;
        });
    }
    document.querySelector('.applicants-table thead').addEventListener('click', e => {
        const b = e.target.closest('[data-sort]');
        if (!b) return;
        const key = b.dataset.sort;
        applicantSort = { key, dir: applicantSort.key === key && applicantSort.dir === 'asc' ? 'desc' : applicantSort.key === key ? 'asc' : (key === 'name' || key === 'function' || key === 'status' ? 'asc' : 'desc') };
        storageSet(SORT_KEY, JSON.stringify(applicantSort));
        renderApplicants();
    });
    const statusName = id => (P.STATUSES.find(x => x.id === (id || 'neu')) || {}).name || '';
    const statusPill = c => `<span class="status-pill st-${esc(c.status || 'neu')}">${esc(statusName(c.status))}</span>`;
    function reviewPill(c) {
        const st = reviewState(c);
        if (st.stale) return `<span class="badge" title="Nach der Prüfung geändert">${icon('alert')} geändert</span>`;
        if (st.needsApproval) return `<span class="badge badge-info" title="Geprüft von ${esc(c.review.checkedBy)}, Freigabe ausstehend">${icon('check')} geprüft</span>`;
        if (st.approved) return `<span class="badge badge-ok" title="${esc(c.review.checkedBy)}${c.review.approvedBy ? ' / ' + esc(c.review.approvedBy) : ''}">${icon('check')} ${settings.fourEyes ? 'freigegeben' : 'geprüft'}</span>`;
        return '';
    }

    function renderApplicants() {
        const terms = $('#applicantSearch').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const hay = c => [c.name, tplOf(c).name, c.fileName, c.hinweise, c.birth, statusName(c.status), c.positionId && positionOf(c.positionId) ? positionOf(c.positionId).title : '', ...(c.entries || []).map(e => e.title + ' ' + e.details), c.text].join(' ').toLowerCase();
        const byPos = c => !applicantPos || (applicantPos === '__none' ? !c.positionId : c.positionId === applicantPos);
        const base = candidates.slice().reverse().filter(c => byPos(c) && terms.every(t => hay(c).includes(t)));
        const list = sortApplicants(base.filter(c => applicantStatus === 'alle' || (c.status || 'neu') === applicantStatus));
        document.querySelectorAll('.applicants-table [data-sort]').forEach(b => {
            const on = b.dataset.sort === applicantSort.key;
            b.classList.toggle('asc', on && applicantSort.dir === 'asc');
            b.classList.toggle('desc', on && applicantSort.dir === 'desc');
            b.closest('th').setAttribute('aria-sort', on ? (applicantSort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
        });
        // Filter: Status mit Anzahl, Stelle
        $('#statusFilter').innerHTML = [{ id: 'alle', name: 'Alle' }].concat(P.STATUSES).map(st => {
            const n = st.id === 'alle' ? base.length : base.filter(c => (c.status || 'neu') === st.id).length;
            return `<button type="button" class="seg-btn${applicantStatus === st.id ? ' active' : ''}" data-stfilter="${st.id}">${esc(st.name)} <span class="seg-count">${n}</span></button>`;
        }).join('');
        const positions = settings.positions || [];
        if (applicantPos && applicantPos !== '__none' && !positionOf(applicantPos)) applicantPos = '';
        $('#positionFilter').innerHTML = `<option value="">alle Stellen</option>${positions.map(p => `<option value="${esc(p.id)}"${p.id === applicantPos ? ' selected' : ''}>${esc(p.title)}${p.status !== 'offen' ? ` (${p.status})` : ''}</option>`).join('')}<option value="__none"${applicantPos === '__none' ? ' selected' : ''}>ohne Stelle</option>`;
        renderCompare(applicantPos && applicantPos !== '__none' ? list : []);
        const filtered = terms.length || applicantPos || applicantStatus !== 'alle';
        const sortName = { status: 'Status', name: 'Name', function: 'Funktion', years: 'anrechenbaren Jahren', placement: 'Einreihung', salary: 'Jahreslohn', created: 'Datum' }[applicantSort.key];
        $('#applicantsInfo').innerHTML = (filtered ? `${list.length} von ${candidates.length} Bewerbenden` : `${candidates.length} Bewerbende`) + `, sortiert nach ${sortName} (${applicantSort.dir === 'asc' ? 'aufsteigend' : 'absteigend'}).`
            + (storeActive() ? store.keepDays ? ` Gespeicherte Personen werden ${store.keepDays} Tage nach der letzten Änderung samt Lebenslauf gelöscht.` : ''
                : ` <span class="warn">${icon('alert')} Personen werden nicht gespeichert: ${esc(storeReason())}</span>`);
        $('#applicantsBody').innerHTML = list.length ? list.map(c => {
            if (c.loading) return `<tr data-select="${c.id}"><td><strong>${esc(c.name)}</strong></td><td colspan="8" class="loading-cell"><span class="spinner"></span> <span data-step="${c.id}">${esc(c.step || 'wird ausgewertet …')}</span></td></tr>`;
            const r = computeFor(c), pl = placementFor(c, r), n = overrideCount(c), sal = salaryOf(c, pl);
            const dup = P.findDuplicates(candidates).has(c.id);
            return `<tr data-select="${c.id}" class="${c.id === selectedId ? 'active' : ''}" tabindex="0">
                <td>${statusPill(c)} ${reviewPill(c)}</td>
                <td><strong>${esc(c.name)}</strong>${dup ? ` <span class="badge" title="Mögliche Doppelbewerbung">${icon('alert')} doppelt?</span>` : ''}${c.source === 'ki' ? ` <span class="mini-ai" title="ausgewertet mit Claude">${icon('sparkles', 'ausgewertet mit Claude')}</span>` : ''}${n ? ` <span class="badge badge-manual">${icon('pencil')} ${n} manuell</span>` : ''}
                    ${c.hasFile || c.file ? `<div class="details">${icon('file')} ${esc(c.fileName || 'Lebenslauf')}</div>` : ''}</td>
                <td>${esc(tplOf(c).name)}${c.positionId && positionOf(c.positionId) ? `<div class="details">${icon('briefcase')} ${esc(positionOf(c.positionId).title)}</div>` : ''}</td>
                <td class="num"><strong>${fmt(r.creditedYears)}</strong> J.</td>
                <td class="num">${pl ? pl.fixed ? 'fixer Lohn' : `LK ${pl.cls} / St. ${pl.stage}` : '–'}</td>
                <td class="num">${sal ? esc(chf(sal.total)) : '–'}</td>
                <td>${fmtDate(c.createdAt)}</td>
                <td>${retentionBadge(c)}</td>
                <td class="num"><span class="row-actions">
                    <select class="status-mini st-${esc(c.status || 'neu')}" data-rowstatus="${c.id}" aria-label="Status von ${esc(c.name)} ändern" title="Status ändern">${P.STATUSES.map(st => `<option value="${st.id}"${(c.status || 'neu') === st.id ? ' selected' : ''}>${esc(st.name)}</option>`).join('')}</select>
                    ${pl ? `<button class="btn-icon" type="button" data-rowsalary="${c.id}" title="Lohnblatt (PDF)" aria-label="Lohnblatt von ${esc(c.name)}">${icon('file')}</button>` : ''}
                    ${c.positionId ? `<button class="btn-icon" type="button" data-rowcompare="${esc(c.positionId)}" title="Mit den anderen Bewerbenden dieser Stelle vergleichen" aria-label="Vergleichen">${icon('compare')}</button>` : ''}
                    <button class="btn-icon" type="button" data-remove="${c.id}" title="Löschen" aria-label="${esc(c.name)} löschen">${icon('x')}</button>
                </span></td>
            </tr>`;
        }).join('') : `<tr><td colspan="9" class="empty">${candidates.length ? 'Keine Bewerbenden gefunden.' : 'Noch keine Bewerbenden ausgewertet.'}</td></tr>`;
    }

    /** Vergleich der Bewerbenden einer Stelle nebeneinander. */
    function renderCompare(list) {
        const ready = list.filter(c => !c.loading);
        $('#compareCard').hidden = !ready.length;
        if (!ready.length) return;
        const pos = positionOf(applicantPos);
        const cols = ready.map(c => { const r = computeFor(c), pl = placementFor(c, r); return { c, r, pl, sal: salaryOf(c, pl), corr: correctionsFor(c) }; })
            .sort((a, b) => b.r.creditedYears - a.r.creditedYears);
        $('#compareTitle').textContent = `Vergleich: ${pos ? pos.title : ''} (${cols.length})`;
        const row = (label, f) => `<tr><th>${label}</th>${cols.map(x => `<td>${f(x)}</td>`).join('')}</tr>`;
        $('#compareTable').innerHTML = `<thead><tr><th></th>${cols.map(x => `<th><button type="button" class="link-btn" data-select="${x.c.id}">${esc(x.c.name)}</button></th>`).join('')}</tr></thead><tbody>
            ${row('Status', x => statusPill(x.c) + ' ' + reviewPill(x.c))}
            ${row('Funktion', x => esc(tplOf(x.c).name))}
            ${row('Anrechenbare Jahre', x => `<b>${fmt(x.r.creditedYears)} J.</b>`)}
            ${row('davon im Zielberuf', x => `${fmt(x.r.targetYears)} J.`)}
            ${row('Berufserfahrung total', x => `${fmt(x.r.totalYears)} J.`)}
            ${row('Einreihung', x => x.pl ? x.pl.fixed ? 'fixer Lohn' : `LK ${x.pl.cls}, Stufe ${x.pl.stage}` : '–')}
            ${row('Korrektur', x => (adjustmentOf(x.c) ? esc(adjustmentOf(x.c).label) : '–') + (x.corr.length ? `<div class="details">${icon('lightbulb')} Vorschlag: ${esc(x.corr.map(k => k.label).join(', '))}</div>` : ''))}
            ${row(`Jahreslohn${pos ? ` (${pos.lessons ? fmtNum(pos.lessons) + ' Lekt.' : pos.pensum + ' %'})` : ''}`, x => x.sal ? `<b>${chf(x.sal.total)}</b>` : '–')}
            ${row('Monatslohn', x => x.sal ? chf(x.sal.monthly) : '–')}
            ${row('Zulagen', x => x.sal && x.sal.allowances.length ? esc(x.sal.allowances.map(a => a.label).join(', ')) : '–')}
        </tbody>`;
    }

    /** Datei des Lebenslaufs als Objekt-URL (aus dem Speicher oder aus der Datenbank). */
    async function fileUrlOf(c) {
        if (fileUrls.has(c.id)) return fileUrls.get(c.id);
        let blob = c.file;
        if (!blob && c.hasFile) {
            const res = await fetch(CANDIDATES_URL + '?action=file&id=' + encodeURIComponent(c.id), { cache: 'no-store', headers: { 'x-app-password': ai.password || '' } });
            if (!res.ok) throw new Error(res.status === 404 ? 'Datei nicht gefunden' : `Fehler ${res.status}`);
            blob = await res.blob();
        }
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        fileUrls.set(c.id, url);
        return url;
    }

    /** Zeichnet alle Seiten eines PDFs in voller Breite (funktioniert in jedem Browser, auch ohne PDF-Viewer). */
    async function renderPdfPages(buf, box, stillWanted) {
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        const ratio = window.devicePixelRatio || 1;
        for (let n = 1; n <= pdf.numPages; n++) {
            if (!stillWanted() || !box.isConnected) return;
            const page = await pdf.getPage(n);
            const base = page.getViewport({ scale: 1 });
            const vp = page.getViewport({ scale: Math.max(1, (box.clientWidth || 800) / base.width) * ratio });
            const canvas = document.createElement('canvas');
            canvas.width = vp.width;
            canvas.height = vp.height;
            canvas.setAttribute('aria-label', `Seite ${n} von ${pdf.numPages}`);
            box.appendChild(canvas);
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        }
    }

    /**
     * Zeigt den Lebenslauf der gewählten Person. Das PDF ist eingeklappt und wird erst beim Aufklappen
     * gezeichnet (als Seiten); sonst Download und erkannter Text.
     */
    let cvLoadedId = null; // Person, deren PDF-Seiten bereits gezeichnet sind
    async function renderCv() {
        const c = view === 'applicants' ? candidates.find(x => x.id === selectedId) : null;
        $('#cvCard').hidden = !c;
        if (!c || c.id === cvShownId) return;
        cvShownId = c.id;
        cvLoadedId = null;
        const isPdf = /\.pdf$/i.test(c.fileName || '') || (c.file && c.file.type === 'application/pdf');
        const det = $('#cvDetails');
        det.open = false;
        $('#cvActions').innerHTML = '';
        $('#cvSummary').innerHTML = (c.hasFile || c.file)
            ? `${icon('file')} Lebenslauf anzeigen <span class="hint">${esc(c.fileName || '')}${isPdf ? ' (PDF)' : ''}</span>`
            : `${icon('file')} Erkannten Text anzeigen`;
        $('#cvViewer').innerHTML = '';
        if (!c.hasFile && !c.file) {
            $('#cvViewer').innerHTML = `<p class="hint">Keine Datei gespeichert (Text eingefügt oder vor dem Speichern der Dateien ausgewertet).</p>${c.text && c.text.trim() ? `<pre class="rawtext-pre">${esc(c.text)}</pre>` : ''}`;
            return;
        }
        // Download-Knopf sofort, wenn die Datei schon im Speicher liegt; sonst beim Aufklappen
        if (c.file) {
            const url = await fileUrlOf(c);
            if (cvShownId === c.id) $('#cvActions').innerHTML = cvActionsHtml(c, url, isPdf);
        }
    }
    const cvActionsHtml = (c, url, isPdf) => `<a class="btn btn-ghost btn-sm" href="${url}" download="${esc(c.fileName || 'lebenslauf')}">${icon('download')} Herunterladen</a>`
        + (isPdf ? `<a class="btn btn-ghost btn-sm" href="${url}" target="_blank" rel="noopener">${icon('external')} In neuem Tab öffnen</a>` : '');
    /** Beim Aufklappen: Datei laden und PDF-Seiten zeichnen (nur einmal pro Person). */
    $('#cvDetails').addEventListener('toggle', () => { if ($('#cvDetails').open) loadCv(); });
    async function loadCv() {
        const c = candidates.find(x => x.id === cvShownId);
        if (!c || cvLoadedId === c.id || (!c.hasFile && !c.file)) return;
        cvLoadedId = c.id;
        const textHtml = c.text && c.text.trim() ? `<details class="rawtext"><summary>Erkannter Text</summary><pre>${esc(c.text)}</pre></details>` : '';
        const isPdf = /\.pdf$/i.test(c.fileName || '') || (c.file && c.file.type === 'application/pdf');
        $('#cvViewer').innerHTML = '<p class="hint"><span class="spinner"></span> Lebenslauf wird geladen …</p>';
        try {
            const url = await fileUrlOf(c);
            if (cvShownId !== c.id) return; // inzwischen andere Person gewählt
            $('#cvActions').innerHTML = cvActionsHtml(c, url, isPdf);
            if (isPdf && window.pdfjsLib) {
                $('#cvViewer').innerHTML = `<div class="cv-pages" aria-label="Lebenslauf von ${esc(c.name)}"></div>${textHtml}`;
                await renderPdfPages(await (await fetch(url)).arrayBuffer(), $('#cvViewer .cv-pages'), () => cvShownId === c.id);
            } else if (isPdf) {
                $('#cvViewer').innerHTML = `<iframe class="cv-frame" src="${url}" title="Lebenslauf von ${esc(c.name)}"></iframe>${textHtml}`;
            } else {
                $('#cvViewer').innerHTML = `<p class="hint">Word-Dateien lassen sich im Browser nicht anzeigen – bitte herunterladen. Unten steht der erkannte Text.</p>${textHtml}`;
            }
        } catch (err) {
            if (cvShownId === c.id) { cvLoadedId = null; $('#cvViewer').innerHTML = `<p class="hint warn">Lebenslauf konnte nicht geladen werden: ${esc(err.message)}</p>${textHtml}`; }
        }
    }


    // --- Auswertungen in der Datenbank (api/candidates.php) ---
    let store = { available: false, enabled: false, keepDays: 0, problem: '', error: '' };
    const savedJson = new Map(); // zuletzt gespeicherter Stand pro Person
    const PERSIST_FIELDS = ['id', 'name', 'autoName', 'birth', 'birthEdited', 'text', 'templateId', 'autoTemplate', 'suggestion', 'baseTemplateId',
        'adjustmentId', 'newPensum', 'newLessons', 'entries', 'source', 'model', 'hinweise', 'aiError', 'createdAt', 'hasFile', 'fileName',
        'status', 'positionId', 'review', 'allowances', 'dismissedAdj', 'aiFlags', 'startDate', 'startDateEdited'];
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
            store = d ? Object.assign(store, { available: true, enabled: !!d.enabled, keepDays: d.keepDays || 0, keepByStatus: d.keepByStatus || {}, maxFileMb: d.maxFileMb || 12, problem: d.problem || '' }) : Object.assign(store, { available: false, enabled: false });
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
                if (!cand.status) cand.status = 'neu';
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
    /** Speichert die Datei des Lebenslaufs (PDF/Word) in der Datenbank. */
    async function uploadFile(c) {
        const maxMb = store.maxFileMb || 12;
        if (c.file.size > maxMb * 1024 * 1024) {
            c.fileError = `Datei grösser als ${maxMb} MB – nur die Auswertung wird gespeichert`;
            setStatus(`${c.name}: ${c.fileError}.`, true);
            return;
        }
        const res = await fetch(CANDIDATES_URL + '?action=file&id=' + encodeURIComponent(c.id), {
            method: 'POST', cache: 'no-store', body: c.file,
            headers: { 'x-app-password': ai.password || '', 'content-type': c.file.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(c.file.name) }
        });
        let data = {};
        try { data = await res.json(); } catch (e) { /* keine JSON-Antwort */ }
        if (!res.ok) { c.fileError = data.error || `Fehler ${res.status}`; setStatus(`${c.name}: Lebenslauf-Datei nicht gespeichert (${c.fileError}).`, true); return; }
        c.hasFile = true;
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
                if (c.file && !c.hasFile && !c.fileError) await uploadFile(c);
                const json = persistable(c);
                if (savedJson.get(c.id) === json) continue;
                const res = await storeRequest('POST', '', { candidate: JSON.parse(json) });
                savedJson.set(c.id, json);
                c.savedAt = res.savedAt;
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
        const shown = candidates.slice(-OVERVIEW_MAX).reverse();
        $('#overviewBody').innerHTML = shown.map(c => {
            if (c.loading) {
                return `<tr data-select="${c.id}" class="${c.id === selectedId ? 'active' : ''}">
                    <td><strong>${esc(c.name)}</strong></td><td>${esc(tplOf(c).name)}</td>
                    <td colspan="5" class="loading-cell"><span class="spinner"></span> <span data-step="${c.id}">${esc(c.step || 'wird ausgewertet …')}</span></td><td></td></tr>`;
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

    /** Hinweis, wenn bei angerechneten Stellen kein Pensum im Lebenslauf steht (100 % angenommen). */
    function pensumNoticeHtml(c) {
        const list = c.entries.filter(e => e.pensumUnknown && e.include && e.category !== '__ausbildung' && e.category !== '__familie');
        if (!list.length) return '';
        return `<div class="notice">${icon('alert')} <b>Pensum unbekannt bei ${list.length} Stelle${list.length > 1 ? 'n' : ''}:</b> ${list.slice(0, 4).map(e => `«${esc(e.title)}»`).join(', ')}${list.length > 4 ? ` und ${list.length - 4} weitere` : ''}. Der Lebenslauf nennt kein Pensum, gerechnet wird mit 100 %. Bis 50 % Pensum zählt nach den Regeln oft nur die Hälfte – bitte die Pensen in der Tabelle unten eintragen (z. B. aus dem Bewerbungsdossier oder Arbeitszeugnis).</div>`;
    }
    /** Hinweis auf mögliche Doppelbewerbung. */

    function duplicateHtml(c) {
        const others = (P.findDuplicates(candidates).get(c.id) || []).map(id => candidates.find(x => x.id === id)).filter(Boolean);
        if (!others.length) return '';
        return `<div class="notice">${icon('alert')} <b>Mögliche Doppelbewerbung:</b> ${others.map(o => `<button type="button" class="link-btn" data-opendup="${esc(o.id)}">${esc(o.name)}</button> (${fmtDate(o.createdAt)}${o.positionId && positionOf(o.positionId) ? ', ' + esc(positionOf(o.positionId).title) : ''})`).join(', ')}</div>`;
    }
    /** Vorgeschlagene Korrekturen der Lohnklasse mit «Übernehmen» / «Ignorieren». */
    function correctionsHtml(c) {
        const list = correctionsFor(c);
        if (!list.length) return '';
        return list.map(x => `<div class="suggestion suggestion-adj">${icon('lightbulb')} <b>Korrektur vorgeschlagen: ${esc(x.label)}</b> – ${esc(x.reason)}.
            <span class="row-gap inline-actions"><button type="button" class="btn btn-primary btn-sm" data-applyadj="${esc(x.id)}">Übernehmen</button><button type="button" class="btn btn-ghost btn-sm" data-dismissadj="${esc(x.id)}">Ignorieren</button></span></div>`).join('');
    }
    /** Lohnentwicklung der nächsten Jahre (Stufen- und Klassenaufstieg). */
    function outlookHtml(c, r) {
        const t = tplOf(c);
        if (t.fixedAnnual) return '';
        const rows = P.salaryOutlook(r.creditedYears, t, adjustmentOf(c), settings.salaryTables, undefined, 10);
        if (!rows.length) return '';
        const p = pensumOf(c, t);
        const allow = allowancesOf(c, t).reduce((x, a) => x + a.annual, 0);
        return `<details class="outlook"><summary>Lohnentwicklung der nächsten 10 Jahre</summary><div class="table-scroll"><table class="table outlook-table">
            <thead><tr><th>Jahr</th><th class="num">Erfahrungsjahre</th><th class="num">Lohnklasse</th><th class="num">Stufe</th><th class="num">Jahreslohn${p !== 100 ? ` (${fmtNum(p)} %)` : ''}</th><th class="num">Monatslohn</th></tr></thead>
            <tbody>${rows.map((x, i) => {
                const y = x.salary ? (x.salary + allow) * p / 100 : null;
                const up = i > 0 && x.cls !== rows[i - 1].cls;
                return `<tr${up ? ' class="up"' : ''}><td>${x.year}</td><td class="num">${x.years}</td><td class="num">${x.cls}${up ? ' ↑' : ''}</td><td class="num">${x.stage}</td><td class="num">${y ? chf(y) : '–'}</td><td class="num">${y ? chf(y / t.payments) : '–'}</td></tr>`;
            }).join('')}</tbody></table></div>
            <p class="hint">Stufenaufstieg jeweils auf den 1. Januar, Klassenaufstieg nach ${(t.classUpYears || []).join(' und ') || '–'} Jahren; gerechnet mit der jeweils gültigen, sonst der neuesten Gehaltstabelle (ohne Teuerung).</p></details>`;
    }
    /** Prüfung und Freigabe (Vier-Augen-Prinzip). */
    function reviewHtml(c) {
        const rv = c.review, st = reviewState(c);
        const who = x => `${esc(x.by)} am ${esc(fmtWhen(x.at))}`;
        let body;
        if (!rv || !rv.checkedBy) {
            body = `<span class="review-state">${icon('clock')} Noch nicht geprüft</span><button type="button" class="btn btn-primary btn-sm" data-review="check">${icon('check')} Als geprüft markieren</button>`;
        } else if (st.stale) {
            body = `<span class="review-state warn">${icon('alert')} Nach der Prüfung durch ${esc(rv.checkedBy)} geändert – bitte erneut prüfen</span><button type="button" class="btn btn-primary btn-sm" data-review="check">${icon('check')} Erneut prüfen</button>`;
        } else {
            body = `<span class="review-state ok">${icon('check')} Geprüft von ${who({ by: rv.checkedBy, at: rv.checkedAt })}</span>`
                + (settings.fourEyes ? rv.approvedBy ? `<span class="review-state ok">${icon('check')} Freigegeben von ${who({ by: rv.approvedBy, at: rv.approvedAt })}</span>`
                    : `<button type="button" class="btn btn-primary btn-sm" data-review="approve">${icon('users')} Freigeben (zweite Person)</button>` : '')
                + `<button type="button" class="btn btn-ghost btn-sm" data-review="reset">Zurücksetzen</button>`;
        }
        return `<div class="review-bar"><span class="label">Prüfung${settings.fourEyes ? ' (Vier-Augen-Prinzip)' : ''}</span>${body}</div>`;
    }
    /** Eigener Name für Prüfung/Freigabe (einmal fragen, im Browser merken). */
    function currentUser() {
        if (!ai.userName) {
            const n = (prompt('Dein Name für die Prüfung (wird in diesem Browser gespeichert, änderbar unter Einstellungen → Zugang):') || '').trim();
            if (!n) return '';
            ai.userName = n;
            storageSet(AI_KEY, JSON.stringify(ai));
        }
        return ai.userName;
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

    // --- Personenkarte: Kopf, Vorher/Nachher, «Warum?», einklappbare Abschnitte ---
    const SECTIONS_KEY = 'cvrechner.sections.v1';
    let openSections = (() => { try { return JSON.parse(storageGet(SECTIONS_KEY)) || {}; } catch (e) { return {}; } })();
    /** Einklappbarer Abschnitt der Personenkarte; der Zustand bleibt im Browser gespeichert. */
    function section(id, title, html, defaultOpen, count) {
        const open = openSections[id] !== undefined ? openSections[id] : defaultOpen;
        return `<details class="section" data-section="${id}" ${open ? 'open' : ''}><summary>${esc(title)}${count ? ` <span class="count">${esc(count)}</span>` : ''}</summary>${html}</details>`;
    }
    /** Auswertung, wie sie mit der vorgeschlagenen Funktion aussähe (für Vorher/Nachher nach manueller Wahl). */
    function suggestedView(c) {
        const sg = c.suggestion;
        if (!sg || sg.id === c.templateId || !settings.templates.some(t => t.id === sg.id)) return null;
        const alt = Object.assign({}, c, { templateId: sg.id, baseTemplateId: '' });
        const r = computeFor(alt), pl = placementFor(alt, r);
        return { tpl: tplOf(alt), r, pl, sal: salaryOf(alt, pl) };
    }
    /** Kopf der Personenkarte: Funktion, anrechenbare Jahre, Einreihung mit Stufenbalken, Lohn. */
    function heroHtml(c, r, t, pl) {
        const sal = salaryOf(c, pl);
        const was = suggestedView(c);
        const fnWas = was ? `<span class="was" title="Vom Lebenslauf vorgeschlagen, manuell geändert">${esc(was.tpl.name)}</span>` : '';
        const fnExtra = was ? `<span class="was-note">manuell gewählt statt Vorschlag</span>` : c.suggestion && c.suggestion.id === c.templateId ? `<span class="was-note">${icon('sparkles')} aus dem Lebenslauf vorgeschlagen (${c.suggestion.source === 'ki' ? 'Claude' : 'Stichwörter'})</span>` : c.positionId && positionOf(c.positionId) ? `<span class="was-note">${icon('briefcase')} ${esc(positionOf(c.positionId).title)}</span>` : '';
        let placeHtml, placeExtra = '';
        if (!pl) { placeHtml = '<span class="value">–</span>'; placeExtra = '<div class="extra">Keine Lohnklassen bei dieser Funktion</div>'; }
        else if (pl.fixed) { placeHtml = '<span class="value">Fixer Lohn</span>'; placeExtra = '<div class="extra">gemäss Funktion, unabhängig von der Erfahrung</div>'; }
        else {
            const wasPl = was && was.pl && !was.pl.fixed && (was.pl.cls !== pl.cls || was.pl.stage !== pl.stage) ? `<span class="was">LK ${was.pl.cls} / St. ${was.pl.stage}</span>` : '';
            placeHtml = `<div class="value">LK ${pl.cls} <span class="unit">·</span> Stufe ${pl.stage}${wasPl}</div>`;
            const row = pl.table && pl.table.classes ? pl.table.classes[pl.cls] : null;
            const pct = Math.round(pl.stage / Math.max(1, pl.maxStage) * 100);
            placeExtra = `<div class="range"><div class="range-track"><div class="range-fill" style="width:${pct}%"></div></div>
                <div class="range-text"><span>Stufe ${pl.stage} von ${pl.maxStage}</span>${row && row.length ? `<span title="Spanne der Lohnklasse ${pl.cls} bei 100 %">${esc(P.formatChf(row[0], { plain: true }))} – ${esc(P.formatChf(row[row.length - 1], { plain: true }))}</span>` : ''}</div></div>`;
        }
        const p = pensumOf(c, t);
        const wasSal = was && was.sal && sal && Math.round(was.sal.total) !== Math.round(sal.total) ? `<span class="was">${esc(chf(was.sal.total))}</span>` : '';
        const salHtml = sal ? `<div class="value">${esc(chf(sal.total))}${wasSal}</div><div class="extra">Monatslohn ${esc(chf(sal.monthly))} · ${t.payments} Auszahlungen${sal.allowances.length ? ` · inkl. ${sal.allowances.map(a => esc(a.label)).join(', ')}` : ''}</div>`
            : `<div class="value">–</div><div class="extra">${pl && !pl.table ? 'Keine Gehaltstabelle hinterlegt' : pl ? 'Lohnklasse nicht in der Tabelle' : 'Kein Lohn berechenbar'}</div>`;
        return `<div class="hero">
            <div class="hero-box hero-fn"><div class="label">Funktion</div><div class="value">${esc(t.name)}${fnWas}</div><div class="extra">${fnExtra}</div></div>
            <div class="hero-box"><div class="label">Anrechenbare Jahre</div><div class="value">${fmt(r.creditedYears)}<span class="unit"> J.</span></div><div class="extra">${fmtYM(r.creditedYears)}${r.rounded || r.capped ? ` · ungerundet ${fmt(r.exactYears)} J.` : ''}</div></div>
            <div class="hero-box"><div class="label">Einreihung</div>${placeHtml}${placeExtra}</div>
            <div class="hero-box hero-salary"><div class="label">Jahreslohn bei ${t.lessonsFull ? `${fmtNum(c.newLessons ?? t.lessonsFull)} Lekt.` : `${fmtNum(p)} %`}</div>${salHtml}</div>
        </div>`;
    }
    /** «Warum diese Einreihung?» – nachvollziehbar: Stichwörter, gewertete Ausbildung, Stufe, Aufstieg, Korrektur, Zulagen, Tabelle. */
    function whyHtml(c, r, t, pl) {
        const items = [];
        const li = (k, v) => items.push(`<li><b>${esc(k)}</b><span>${v}</span></li>`);
        const ranked = P.suggestTemplates(c.entries, settings.templates);
        const mine = ranked.find(x => x.id === c.templateId);
        const sg = c.suggestion;
        let fn = '';
        if (sg && sg.id === c.templateId && sg.source === 'ki') fn = `Claude: ${esc(sg.reason || 'passt laut Lebenslauf')}`;
        else if (mine && mine.hits.length) fn = 'Stichwörter im Lebenslauf: ' + mine.hits.slice(0, 5).map(h => `<span class="kw">${esc(h.keyword)}</span> in «${esc(h.title)}»`).join(', ');
        else if (c.positionId && positionOf(c.positionId)) fn = `von der Stelle «${esc(positionOf(c.positionId).title)}» übernommen`;
        else fn = 'manuell gewählt' + (sg && sg.id !== c.templateId ? ` – vorgeschlagen war «${esc((settings.templates.find(x => x.id === sg.id) || {}).name || '')}»` : '');
        if (sg && sg.id !== c.templateId && !fn.includes('vorgeschlagen war')) fn += ` (Vorschlag war «${esc((settings.templates.find(x => x.id === sg.id) || {}).name || '')}»)`;
        li('Funktion', fn);
        const edu = c.entries.map((e, i) => [e, r.perEntry[i]]).filter(([e]) => e.category === '__ausbildung' || e.category === '__zweitausbildung');
        if (edu.length) li('Ausbildung', edu.map(([e, pe]) => `«${esc(e.title)}»${e.include && pe.factor > 0 ? ` (${pe.factor} % angerechnet)` : ' (nicht angerechnet)'}`).join(', '));
        li('Erfahrung', formulaHtml(c, r, t));
        if (pl && !pl.fixed) {
            const nj = newJobEntry(c);
            if (nj) li('Neue Stelle', `ab ${esc(fmtDay(c.startDate))} bis Stichtag ${esc(fmtDay(P.cutoffDate(t)))} bei ${nj.pensum} % → ${fmt(r.perEntry[c.entries.length].credited / 12)} J. im Zielberuf (wie in der Berechnungsvorlage der Personalabteilung)`);
            li('Stufe', `${pl.years} volle Erfahrungsjahre → Stufe ${pl.stage}${pl.stage >= pl.maxStage ? ` (höchste Stufe ${pl.maxStage})` : t.stageMode === 'plusOne' ? ' (Dienstjahre + 1)' : pl.years < 1 ? ' (mindestens Stufe 1)' : ' (volle Dienstjahre = Stufe)'}`);
            const ups = t.classUpYears || [];
            const next = ups.find(n => pl.years < n);
            li('Lohnklasse', `Grundklasse ${t.classMin}${t.baseName ? ` (Grundfunktion «${esc(t.baseName)}» +${t.baseDelta})` : ''}${pl.ups ? `, +${pl.ups} nach ${ups.slice(0, pl.ups).join(' und ')} Jahren` : ''}${next ? ` · nächster Aufstieg nach ${next} Jahren (in ${next - pl.years} J.)` : t.classMax && t.classMax !== t.classMin && !next ? ' · höchste Klasse der Funktion erreicht' : ''}`);
            const adj = adjustmentOf(c);
            const open = correctionsFor(c);
            li('Korrektur', adj ? `${esc(adj.label)} (${adj.delta > 0 ? '+' : ''}${adj.delta} Klasse${Math.abs(adj.delta) === 1 ? '' : 'n'})${(() => { const why = P.suggestCorrections(c.entries, t, settings.classAdjustments, flagsFor(c)).find(x => x.id === adj.id); return why ? ' – ' + esc(why.reason) : ' – manuell gesetzt'; })()}`
                : open.length ? `keine – vorgeschlagen: ${open.map(x => esc(x.label)).join(', ')}` : 'keine');
        } else if (pl && pl.fixed) li('Lohn', `Fixer Jahreslohn der Funktion, unabhängig von der Erfahrung${t.note ? '. ' + esc(t.note) : ''}`);
        if (pl && (t.allowances || []).length) {
            const chosen = allowancesOf(c, t);
            li('Zulagen', chosen.length ? chosen.map(a => `${esc(a.label)} (${esc(chf(a.annual))} bei 100 %)`).join(', ') + (c.allowances === null ? ' – aufgrund der Ausbildung vorgeschlagen' : ' – manuell gewählt') : 'keine');
        }
        const f = flagsFor(c);
        if (f && (f.leadershipYears || f.leadershipTraining || f.foreignDiploma || f.qualificationMatches === false)) {
            li('Claude hat erkannt', [f.leadershipYears ? `${f.leadershipYears} Jahre Führungsverantwortung` : '', f.leadershipTraining ? 'Führungsausbildung' : '', f.foreignDiploma ? 'ausländisches Diplom' : '', f.qualificationMatches === false ? 'Ausbildung passt nicht zur Funktion' : ''].filter(Boolean).map(esc).join(', '));
        }
        if (pl) li('Gehaltstabelle', pl.table ? esc(tableLabel(pl.table)) + (pl.future ? ' – gilt am Stichtag noch nicht' : '') : 'keine hinterlegt');
        if (t.note) li('Hinweis', esc(t.note));
        return `<details class="why"><summary>Warum diese Einreihung?</summary><ul class="why-list">${items.join('')}</ul></details>`;
    }

    function renderDetail() {
        const c = candidates.find(x => x.id === selectedId);
        const el = $('#detail');
        if (!c) { el.innerHTML = ''; return; }
        if (c.loading) {
            el.innerHTML = `<div class="card"><h2>${esc(c.name)}</h2><p class="empty"><span class="spinner"></span> <span data-step="${c.id}">${esc(c.step || 'wird ausgewertet …')}</span></p></div>`;
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
                <td class="c-small"><div class="suffix"><input type="number" min="0" max="100" data-f="pensum" value="${esc(e.pensum)}" aria-label="Pensum"><em>%</em></div>${e.pensumUnknown && e.include && e.category !== '__ausbildung' ? '<span class="badge" title="Im Lebenslauf steht kein Pensum – 100 % angenommen. Bis 50 % zählt meist nur die Hälfte, bitte prüfen.">Pensum?</span>' : ''}</td>
                <td class="num">${pe.valid ? fmtYM(pe.months / 12) : '<span class="badge">Datum?</span>'}${e.imprecise ? '<span class="badge" title="Nur Jahreszahl angegeben – bitte Monate prüfen">ungenau</span>' : ''}</td>
                <td class="c-small">
                    <div class="suffix"><input type="number" min="0" max="100" data-f="factorOverride" value="${auto ? '' : esc(e.factorOverride)}" placeholder="${pe.factor}" aria-label="Faktor"><em>%</em></div>
                    ${auto ? `<div class="factor-auto" title="${esc(P.describeRule(t.rules[pe.ruleKey]))}">${esc((P.RULE_KEYS.find(k => k.id === pe.ruleKey) || {}).name || 'automatisch')}</div>`
                        : `<div class="factor-auto" title="Manuell überschrieben; nach den Regeln wären es ${autoFactor(e, t)} %">manuell <span class="factor-was">${autoFactor(e, t)} %</span></div>`}
                </td>
                <td class="num"><strong>${fmt(pe.credited / 12)}</strong></td>
                <td><button class="btn-icon" type="button" data-del="${e.id}" title="Zeile löschen" aria-label="Zeile löschen">${icon('x')}</button></td>
            </tr>`;
        }).join('');

        const tl = timelineHtml(c, r);
        const pl0 = placementFor(c, r);
        el.innerHTML = `<div class="card">
            <div class="detail-head">
                <input type="text" class="name-input" data-cf="name" value="${esc(c.name)}" aria-label="Name">
                <div class="head-fields">
                    <label class="field"><span>Status</span><select data-cf="status" class="status-select st-${esc(c.status || 'neu')}">${P.STATUSES.map(st => `<option value="${st.id}"${(c.status || 'neu') === st.id ? ' selected' : ''}>${esc(st.name)}</option>`).join('')}</select></label>
                    <label class="field"><span>Geburtsdatum</span><input type="month" data-cf="birth" value="${esc(c.birth)}"></label>
                    <label class="field"><span>Offene Stelle</span><select data-cf="positionId"><option value="">keine</option>${(settings.positions || []).filter(p => p.status === 'offen' || p.id === c.positionId).map(p => `<option value="${esc(p.id)}"${p.id === c.positionId ? ' selected' : ''}>${esc(p.title)}</option>`).join('')}</select></label>
                    <label class="field" title="Die neue Stelle zählt ab Stellenantritt bis zum Stichtag als Erfahrung im Zielberuf (wie in der Berechnungsvorlage der Personalabteilung)"><span>Stellenantritt</span><input type="date" data-cf="startDate" value="${esc(c.startDate || '')}"></label>
                    <label class="field"><span>Funktion</span><select data-cf="templateId">${tplOptions(t.id)}</select></label>
                    ${rawTplOf(c).baseTemplateId ? `<label class="field"><span>Grundfunktion</span><select data-cf="baseTemplateId">${settings.templates.filter(x => x.id !== t.id && x.classMin && !x.baseTemplateId).map(x => `<option value="${esc(x.id)}"${x.id === (c.baseTemplateId || rawTplOf(c).baseTemplateId) ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : ''}
                    ${t.classMin || t.fixedAnnual ? `${t.lessonsFull
                        ? `<label class="field"><span>Lektionen neue Stelle</span><div class="suffix"><input type="number" min="0.5" max="${esc(t.lessonsFull)}" step="0.5" data-cf="newLessons" value="${esc(c.newLessons ?? t.lessonsFull)}"><em>von ${esc(fmtNum(t.lessonsFull))}</em></div></label>`
                        : `<label class="field"><span>Pensum neue Stelle</span><div class="suffix"><input type="number" min="1" max="100" data-cf="newPensum" value="${esc(c.newPensum)}"><em>%</em></div></label>`}
                    <label class="field"><span>Korrektur Lohnklasse</span><select data-cf="adjustmentId"><option value="">keine</option>${(settings.classAdjustments || []).map(a => `<option value="${esc(a.id)}"${a.id === c.adjustmentId ? ' selected' : ''}>${esc(a.label)}</option>`).join('')}</select></label>` : ''}
                </div>
            </div>
            <p class="source">${c.source === 'ki' ? `<span class="pill pill-ai">${icon('sparkles')} ausgewertet mit Claude</span>` : '<span class="pill">ausgewertet mit Regeln</span>'}
                ${statusPill(c)} ${reviewPill(c)}
                ${c.aiError ? `<span class="source-error">KI-Auswertung fehlgeschlagen: ${esc(c.aiError)}</span>` : ''}
                ${t.minAge && !c.birth ? '<span class="source-error">Geburtsdatum fehlt – Mindestalter wird nicht geprüft</span>' : ''}</p>
            ${heroHtml(c, r, t, pl0)}
            ${duplicateHtml(c)}
            ${pensumNoticeHtml(c)}
            ${suggestionHtml(c)}
            ${correctionsHtml(c)}
            ${c.hinweise ? `<div class="notice"><b>Hinweis:</b> ${esc(c.hinweise)}</div>` : ''}
            ${!pl0 && t.note ? `<div class="notice"><b>Hinweis zur Einreihung:</b> ${esc(t.note)}</div>` : ''}
            ${!pl0 ? `<div class="notice"><b>Keine Lohneinreihung:</b> Die Vorlage «${esc(t.name)}» hat keine Lohnklassen. Eine Vorlage des Einreihungsplans wählen oder bei dieser Vorlage «Lohnklasse von/bis» eintragen. <button type="button" class="link-btn" data-edittpl="${esc(t.id)}">Vorlage bearbeiten</button></div>` : ''}
            ${reviewHtml(c)}
            <div class="detail-actions">
                <button class="btn btn-ghost btn-sm" type="button" data-action="add">${icon('plus')} Stelle hinzufügen</button>
                <button class="btn btn-ghost btn-sm" type="button" data-action="reparse">Neu auswerten</button>
                <button class="btn btn-ghost btn-sm" type="button" data-action="report">Bericht (PDF)</button>
                <button class="btn btn-ghost btn-sm" type="button" data-action="hrxlsx" title="Excel im Aufbau der Berechnungsvorlage der Personalabteilung (Zuordnung 1–6, Tage, Anrechnung, Σ DJ)">${icon('download')} Excel (Vorlage Personal)</button>
                ${pl0 ? `<button class="btn btn-primary btn-sm" type="button" data-action="salary">${icon('file')} Lohnblatt (PDF)</button>` : ''}
            </div>
            ${section('salary', 'Lohn und Einreihung', pl0 ? `<div class="placement"><div class="placement-main"><span class="label">Vorschlag Lohneinreihung</span><b>${esc(placementText(c, pl0))}</b></div><div class="placement-why">${esc(placementWhy(t, pl0))}</div>
                ${(t.allowances || []).length ? `<div class="allow-row"><span class="label">Zulagen</span>${t.allowances.map(a => `<label class="check"><input type="checkbox" data-allow="${esc(a.id)}" ${allowancesOf(c, t).includes(a) ? 'checked' : ''}> ${esc(a.label)} (${chf(a.annual)}/Jahr bei 100 %)</label>`).join('')}${c.allowances === null && allowancesOf(c, t).length ? '<span class="hint">aufgrund der Ausbildung vorgeschlagen</span>' : ''}</div>` : ''}
                ${whyHtml(c, r, t, pl0)}
                ${outlookHtml(c, r)}</div>` : `<div class="formula">${whyHtml(c, r, t, null)}</div>`, true, pl0 && !pl0.fixed ? `LK ${pl0.cls}, Stufe ${pl0.stage}` : '')}
            ${section('experience', 'Erfahrung', `<div class="stats">
                <div class="stat"><div class="label">Berufserfahrung total</div><div class="value">${fmt(r.totalYears)}<span class="unit">J.</span></div><div class="extra">${fmtYM(r.totalYears)}</div></div>
                <div class="stat"><div class="label">davon als ${esc(catName(t.target))}</div><div class="value">${fmt(r.targetYears)}<span class="unit">J.</span></div><div class="extra">${fmtYM(r.targetYears)}</div></div>
                <div class="stat"><div class="label">andere Berufe</div><div class="value">${fmt(r.otherYears)}<span class="unit">J.</span></div><div class="extra">${fmtYM(r.otherYears)}</div></div>
                <div class="stat primary"><div class="label">Anrechenbare Jahre</div><div class="value">${fmt(r.creditedYears)}<span class="unit">J.</span></div><div class="extra">${r.rounded || r.capped ? 'ungerundet ' + fmt(r.exactYears) + ' J.' : fmtYM(r.creditedYears)}</div></div>
            </div>
            <div class="formula">${formulaHtml(c, r, t)}<div class="rules">Regeln «${esc(t.name)}»: ${esc(rulesText(t))} <button type="button" class="link-btn" data-edittpl="${esc(t.id)}">Gewichtungen anpassen</button></div></div>`, true, `${fmt(r.creditedYears)} J. anrechenbar`)}
            ${tl ? section('timeline', 'Zeitstrahl', tl, true) : ''}
            ${section('entries', 'Stellen und Ausbildung', c.entries.length ? `<div class="table-scroll"><table class="table entries-table">
                <thead><tr>
                    <th title="Anrechnen">${icon('check', 'Anrechnen')}</th><th>Funktion / Stelle</th><th>Beruf</th><th>Von</th><th>Bis</th>
                    <th>Pensum</th><th class="num">Dauer</th><th title="Anrechnung pro Monat nach den Regeln der Vorlage; überschreibbar">Anrechnung</th><th class="num">Angerechnet</th><th></th>
                </tr></thead>
                <tbody>${rows}${(j => j ? `<tr class="newjob" title="Wie in der Berechnungsvorlage der Personalabteilung: Die neue Stelle zählt ab Stellenantritt bis zum Stichtag. Datum oben bei «Stellenantritt» ändern oder leeren."><td>${icon('check')}</td><td class="c-title"><b>${esc(j.title)}</b><div class="details">${esc(j.details)}</div></td><td>${esc(catName(j.category))}</td><td>${esc(fmtDay(c.startDate))}</td><td>${esc(fmtDay(P.cutoffDate(t)))}</td><td>${j.pensum} %</td><td class="num">${fmtYM(r.perEntry[c.entries.length].months / 12)}</td><td><div class="factor-auto">${r.perEntry[c.entries.length].factor} % · Zielberuf</div></td><td class="num"><strong>${fmt(r.perEntry[c.entries.length].credited / 12)}</strong></td><td></td></tr>` : '')(newJobEntry(c))}</tbody>
            </table></div>` : '<p class="empty">Keine Zeiträume erkannt. Bitte Stellen manuell hinzufügen.</p>', true, `${c.entries.length} Einträge${newJobEntry(c) ? ' + neue Stelle' : ''}${overrideCount(c) ? `, ${overrideCount(c)} manuell` : ''}`)}
            ${c.text.trim() ? section('text', 'Erkannter Text', `<pre class="rawtext-pre">${esc(c.text)}</pre>`, false) : ''}
        </div>`;
    }
    /** Anrechnung nach den Regeln (ohne manuelle Überschreibung), in %. */
    const autoFactor = (e, t) => Math.round(P.weightFor(Object.assign({}, e, { factorOverride: null }), t) * 10) / 10;
    // Auf-/Zuklappen der Abschnitte merken
    $('#detail').addEventListener('toggle', e => {
        const d = e.target.closest('details.section');
        if (!d) return;
        openSections[d.dataset.section] = d.open;
        storageSet(SECTIONS_KEY, JSON.stringify(openSections));
    }, true);


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

    // Auswahl oben gilt für die nächsten Lebensläufe; bereits ausgewertete Personen behalten Stelle und Funktion
    $('#defaultTemplate').addEventListener('change', e => {
        defaultTemplateId = e.target.value;
        storageSet(TEMPLATE_KEY, defaultTemplateId);
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

    $('#exampleBtn').addEventListener('click', () => {
        const ex = exampleCv();
        processSources([{ name: ex.name, text: ex.text, fixedName: true }]);
    });

    /**
     * Person entfernen – sofort aus der Liste, 8 Sekunden lang «Rückgängig». Erst danach wird sie
     * (falls gespeichert) endgültig aus der Datenbank gelöscht.
     */
    const pendingRemoval = new Set(); // Personen, deren Löschung noch rückgängig gemacht werden kann
    function removeCandidate(id) {
        const i = candidates.findIndex(c => c.id === id);
        if (i < 0) return;
        const c = candidates[i];
        const wasSelected = selectedId === id;
        candidates.splice(i, 1);
        pendingRemoval.add(id);
        if (selectedId === id) selectedId = view === 'main' ? candidates[candidates.length - 1]?.id || null : null;
        render();
        const saved = savedJson.has(id);
        undoable(`«${c.name}» entfernt${saved ? ' – wird in 8 Sekunden endgültig gelöscht' : ''}.`, () => {
            pendingRemoval.delete(id);
            candidates.splice(Math.min(i, candidates.length), 0, c);
            if (wasSelected) selectedId = id;
            render();
        }, () => {
            pendingRemoval.delete(id);
            if (fileUrls.has(id)) { URL.revokeObjectURL(fileUrls.get(id)); fileUrls.delete(id); }
            if (!saved) return;
            storeRequest('DELETE', '?id=' + encodeURIComponent(id)).then(() => savedJson.delete(id))
                .catch(err => toast(`«${c.name}» konnte nicht aus der Datenbank gelöscht werden: ${err.message}`, 'error'));
        });
    }


    // --- Events: Übersicht ---
    $('#overviewBody').addEventListener('click', e => {
        const rm = e.target.closest('[data-remove]');
        if (rm) { removeCandidate(rm.dataset.remove); return; }
        const edit = e.target.closest('[data-edittpl]');
        if (edit) { openSettings(edit.dataset.edittpl); return; }
        const row = e.target.closest('[data-select]');
        if (row) { selectedId = row.dataset.select; render(); }
    });
    $('#reportAll').addEventListener('click', () => {
        const ready = candidates.slice(-OVERVIEW_MAX).reverse().filter(c => !c.loading);
        if (ready.length) previewPrint('Berichte', ready.map(c => CVReport.page(buildView(c))).join(''));
    });

    // --- Events: Detail ---
    const detail = $('#detail');
    detail.addEventListener('change', e => {
        const c = candidates.find(x => x.id === selectedId);
        if (!c || c.loading) return;
        const t = e.target;
        if (t.dataset.allow) {
            const tpl = tplOf(c);
            const chosen = new Set(allowancesOf(c, tpl).map(a => a.id));
            if (t.checked) chosen.add(t.dataset.allow); else chosen.delete(t.dataset.allow);
            c.allowances = [...chosen];
            render();
            return;
        }
        if (t.dataset.cf === 'positionId') {
            const pos = positionOf(t.value);
            if (pos) applyPosition(c, pos); else c.positionId = '';
            render();
            return;
        }
        if (t.dataset.cf) {
            const lessonsFull = tplOf(c).lessonsFull || 0;
            c[t.dataset.cf] = t.dataset.cf === 'newPensum' ? Math.max(1, Math.min(100, +t.value || 100))
                : t.dataset.cf === 'newLessons' ? (t.value === '' ? null : Math.max(0.5, Math.min(lessonsFull, +t.value)))
                : t.value;
            if (t.dataset.cf === 'name') c.autoName = false;
            if (t.dataset.cf === 'startDate') c.startDateEdited = true;
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
        if (f === 'pensum') entry.pensumUnknown = false;
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
        const dup = e.target.closest('[data-opendup]');
        if (dup) { selectedId = dup.dataset.opendup; cvShownId = null; render(); return; }
        const ap = e.target.closest('[data-applyadj]');
        if (ap) { c.adjustmentId = ap.dataset.applyadj; render(); return; }
        const dm = e.target.closest('[data-dismissadj]');
        if (dm) { c.dismissedAdj = (c.dismissedAdj || []).concat(dm.dataset.dismissadj); render(); return; }
        const rvBtn = e.target.closest('[data-review]');
        if (rvBtn) {
            const kind = rvBtn.dataset.review;
            if (kind === 'reset') { if (confirm('Prüfung und Freigabe zurücksetzen?')) { c.review = null; render(); } return; }
            const name = currentUser();
            if (!name) return;
            if (kind === 'check') {
                c.review = { checkedBy: name, checkedAt: new Date().toISOString(), approvedBy: '', approvedAt: '', snapshot: reviewSnapshot(c) };
                if ((c.status || 'neu') === 'neu') c.status = 'geprueft';
            } else if (kind === 'approve') {
                if (name === c.review.checkedBy) { alert('Beim Vier-Augen-Prinzip muss eine andere Person freigeben als die, die geprüft hat.'); return; }
                Object.assign(c.review, { approvedBy: name, approvedAt: new Date().toISOString() });
            }
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
            previewPrint('Bericht', CVReport.page(buildView(c)));
        } else if (act.dataset.action === 'hrxlsx') {
            exportHrXlsx(c).catch(err => toast('Excel konnte nicht erstellt werden: ' + err.message, 'error'));
        } else if (act.dataset.action === 'salary') {
            previewPrint('Lohnblatt', CVReport.salaryPage(buildView(c)));
        } else if (act.dataset.action === 'reparse') {
            // Vorherigen Stand aufbewahren, damit die Neuauswertung rückgängig gemacht werden kann
            const before = clone({ entries: c.entries, hinweise: c.hinweise, aiFlags: c.aiFlags, suggestion: c.suggestion, templateId: c.templateId, autoTemplate: c.autoTemplate, baseTemplateId: c.baseTemplateId, name: c.name, birth: c.birth, source: c.source, model: c.model, aiError: c.aiError });
            withBusy(async () => {
                let useAi = aiActive() && (await ensurePrivacyAck());
                // Gespeicherte PDF-Datei wieder an Claude geben (liest auch Bilder und eingescannte Seiten)
                if (useAi && !c.pdfBase64 && !ai.textOnly && /\.pdf$/i.test(c.fileName || '')) {
                    try {
                        const blob = c.file || await (await fetch(await fileUrlOf(c))).blob();
                        c.pdfBase64 = toBase64(await blob.arrayBuffer());
                    } catch (e) { /* dann mit dem erkannten Text */ }
                }
                if (useAi && !c.pdfBase64 && !c.text.trim()) useAi = false; // nichts zum Senden vorhanden
                setStatus(useAi ? 'Claude wertet ' + c.name + ' neu aus …' : '');
                c.loading = true;
                render();
                await analyzeCandidate(c, useAi);
                c.loading = false;
                c.step = '';
                $('#status').textContent = '';
                if (c.aiError) toast('KI-Auswertung fehlgeschlagen (' + c.aiError + ') – Regeln verwendet', 'warn');
                render();
                undoable(`${c.name} neu ausgewertet${overrideCount({ entries: before.entries }) ? ' – manuelle Anpassungen ersetzt' : ''}.`, () => { Object.assign(c, clone(before)); render(); });
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
            entriesFor(c).forEach((e, i) => {
                const pe = r.perEntry[i];
                details.push([q(c.name), q(e.title), q(e.details), q(catName(e.category)), q(e.start), q(e.ongoing ? 'heute' : e.end), e.pensum,
                    q(e.include ? 'ja' : 'nein'), pe.factor, n(pe.months / 12), n(pe.credited / 12)].join(';'));
            });
        }
        const csv = '﻿' + lines.join('\r\n') + '\r\n\r\n' + details.join('\r\n') + '\r\n';
        download('berufserfahrung.csv', csv, 'text/csv;charset=utf-8');
    });

    /**
     * Excel im Aufbau der Berechnungsvorlage der Personalabteilung («Vorlage Berechnung»): pro Tätigkeit
     * Zuordnung 1)–6), Von (1. Tag), Bis (letzter Tag), Pensum, Dauer in Tagen, Anrechnung in %, Σ DJ (Tage × Anrechnung / 365.2425),
     * «x» für nicht mitgerechnete Zeilen. Dazu ein Blatt «Einstellungen» mit den Anrechnungssätzen der Funktion.
     */
    async function exportHrXlsx(c) {
        const X = await loadXlsx();
        const t = tplOf(c), r = computeFor(c);
        const cutoffIso = P.cutoffDate(t);
        const cutoff = new Date(cutoffIso + 'T00:00:00');
        const lastDay = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0); };
        const firstDay = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1); };
        const DAYS = 365.2425;
        const rows = [];
        let total = 0;
        entriesFor(c).forEach((e, i) => {
            const pe = r.perEntry[i];
            if (!/^\d{4}-\d{2}$/.test(e.start) || (!e.ongoing && !/^\d{4}-\d{2}$/.test(e.end))) return;
            const von = e.synthetic ? new Date(c.startDate + 'T00:00:00') : firstDay(e.start);

            const bis = e.ongoing ? cutoff : lastDay(e.end);
            const days = Math.round((bis - von) / 864e5) + 1;
            const factor = e.include ? P.weightFor(e, t) : 0;
            const dj = e.include && days > 0 ? days * factor / 100 / DAYS : null;
            if (dj) total += dj;
            const key = P.ruleKeyFor(e, t);
            // Fussnote: gleichzeitige Tätigkeiten (die Vorlage summiert sie; die App begrenzt pro Monat auf 100 %)
            const overlaps = e.include ? c.entries.filter(o => o !== e && o.include && /^\d{4}-\d{2}$/.test(o.start) && (o.ongoing || /^\d{4}-\d{2}$/.test(o.end))
                && o.start <= (e.ongoing ? '9999-12' : e.end) && (o.ongoing ? '9999-12' : o.end) >= e.start && P.weightFor(o, t) > 0).map(o => `«${o.title}»`) : [];
            const notes = [e.factorOverride !== null && e.factorOverride !== undefined && e.factorOverride !== '' ? 'Anrechnung manuell gesetzt' : '', overlaps.length ? 'gleichzeitig mit ' + overlaps.join(', ') : ''].filter(Boolean).join('; ');
            rows.push([`${P.hrCategory(key, t)} ${P.HR_CATEGORY_NAMES[P.hrCategory(key, t)]}`, [e.title, e.details].filter(Boolean).join(' – '), von, bis, +e.pensum || 0, days > 0 ? days : '', Math.round(factor * 100) / 100, dj === null ? '' : Math.round(dj * 10000) / 10000, e.include ? '' : 'x', notes]);

        });
        const head = [
            ['Berufsdienstjahre – Berechnung', '', '', '', '', '', '', '', '', ''],
            ['Name', c.name], ['Geburtsdatum', c.birth ? fmtDay(c.birth + '-01').slice(3) : ''], ['Funktion', t.name], ['Stichtag', fmtDay(cutoffIso)],

            ['Total Tätigkeiten in Jahren (Tage / 365.2425)', Math.round(total * 100) / 100],
            [`Total in der App (monatsgenau, gleichzeitige Tätigkeiten ${t.combine === 'sumAll' ? 'addiert' : t.combine === 'sum' ? 'addiert bis 100 %' : 'höchste zählt'})`, Math.round(r.exactYears * 100) / 100, r.rounded || r.capped ? `gerundet/begrenzt: ${fmt(r.creditedYears)}` : ''],

            [],
            ['Zuordnung Tätigkeit', 'Beschreibung Tätigkeit', 'Von (1. Tag) Datum', 'Bis (letzter Tag) Datum', 'Pensum in %', 'Dauer in Tagen', 'Anrechnung in %', 'Σ DJ', 'Nicht mit berechnen', '# Fussnote']
        ];
        const ws = X.utils.aoa_to_sheet(head.concat(rows), { cellDates: true });
        ws['!cols'] = [{ wch: 62 }, { wch: 60 }, { wch: 14 }, { wch: 14 }, { wch: 11 }, { wch: 13 }, { wch: 14 }, { wch: 9 }, { wch: 12 }, { wch: 28 }];
        rows.forEach((row, i) => ['C', 'D'].forEach(col => { const cell = ws[col + (head.length + i + 1)]; if (cell) { cell.t = 'd'; cell.z = 'dd.mm.yyyy'; } }));
        const th = (k, label) => { const R = t.rules[k]; return [label, R.mode === 'threshold' ? R.low : R.mode === 'pensum' ? `Pensum × ${R.factor} %` : R.factor, R.mode === 'threshold' ? R.factor : R.mode === 'pensum' ? `Pensum × ${R.factor} %` : R.factor]; };
        const settingsRows = [['Anrechnung in %', '<=50 % Pensum', '>50 % Pensum'],
            th('education', '1) ' + P.HR_CATEGORY_NAMES['1)']), th('internship', '2a) ' + P.HR_CATEGORY_NAMES['2a)']), th('assistance', '2b) ' + P.HR_CATEGORY_NAMES['2b)']),
            th('other', (t.target === '__assistenz' ? '4) ' + P.HR_CATEGORY_NAMES['4)'] : '3) ' + P.HR_CATEGORY_NAMES['3)'])), th('same', '5) ' + P.HR_CATEGORY_NAMES['5)']), th('family', '6) ' + P.HR_CATEGORY_NAMES['6)']),
            [], ['Funktion', t.name], ['Regeln', rulesText(t)], ['Erstellt', new Date().toLocaleString('de-CH')], ['Quelle', settingsSourceText()]];
        const ws2 = X.utils.aoa_to_sheet(settingsRows);
        ws2['!cols'] = [{ wch: 80 }, { wch: 18 }, { wch: 18 }];
        const wb = X.utils.book_new();
        X.utils.book_append_sheet(wb, ws, 'Tätigkeit');
        X.utils.book_append_sheet(wb, ws2, 'Einstellungen');
        X.writeFile(wb, `Berechnung ${c.name.replace(/[\\/:*?"<>|]+/g, ' ').trim()}.xlsx`, { cellDates: true });
        toast('Excel im Aufbau der Berechnungsvorlage erstellt.', 'ok');
    }

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
        setTimeout(updateSettingsNav);
        const models = window.CVAi ? window.CVAi.MODELS : [{ id: 'claude-opus-5', name: 'Claude Opus 5' }];
        const current = draftAi.model || (window.CVAi ? window.CVAi.DEFAULT_MODEL : 'claude-opus-5');
        $('#aiEnabled').checked = draftAi.enabled;
        document.querySelectorAll('input[name="aiMode"]').forEach(r => { r.checked = r.value === draftAi.mode; });
        $('#aiKey').value = draftAi.apiKey;
        $('#aiPassword').value = draftAi.password;
        $('#adminPassword').value = draftAi.adminPassword || '';
        $('#userName').value = draftAi.userName || '';
        $('#adminPasswordField').hidden = !shared.adminRequired;
        $('#sharedEnabled').checked = draftAi.shared !== false;
        $('#sharedEnabled').disabled = !shared.enabled;
        $('#sharedStatus').innerHTML = sharedStatusHtml();
        $('#storeCandidates').checked = draftAi.storeCandidates !== false;
        $('#storeCandidates').disabled = !store.enabled;
        $('#storeStatus').innerHTML = !store.available ? '<span class="warn">Keine Datenbank-Anbindung gefunden (braucht PHP-Hosting und api/candidates.php). Personen sind nach dem Neuladen weg.</span>'
            : !store.enabled ? `<span class="warn">${esc(store.problem || 'Datenbank ist nicht eingerichtet.')}</span>`
            : draftAi.storeCandidates === false ? 'Personen werden nicht gespeichert und sind nach dem Neuladen weg.'
            : `<span class="ok">${icon('check')} Datenbank verbunden</span>${store.keepDays ? ` – Personen ohne Änderung werden nach ${store.keepDays} Tagen samt Lebenslauf gelöscht` : ' – Personen werden nicht automatisch gelöscht'}. Gespeichert werden Lebenslauf-Datei (bis ${store.maxFileMb || 12} MB), erkannter Text und Auswertung.`
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
        draftAi.userName = $('#userName').value.trim();
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

    // --- Funktionen: Liste links, gewählte Funktion rechts (mit Reitern) ---
    let tplSel = null, tplTab = 'general';
    const TPL_TABS = [{ id: 'general', name: 'Allgemein' }, { id: 'pay', name: 'Lohn' }, { id: 'credit', name: 'Anrechnung' }, { id: 'suggest', name: 'Vorschlag & Hinweis' }];
    const tplGroup = t => t.group || ((/^(\d+)\./.exec(t.name) || [])[1] ? 'Abschnitt ' + /^(\d+)\./.exec(t.name)[1] : 'Weitere Funktionen');
    const splitNr = name => { const m = /^(\d+(?:\.\d+)?)\s+(.*)$/.exec(name); return m ? [m[1], m[2]] : ['', name]; };
    function payBadge(e) {
        if (e.fixedAnnual) return `<span class="fn-badge">fix ${chf(+e.fixedAnnual).replace('CHF ', '')}</span>`;
        if (e.classMin) return `<span class="fn-badge">LK ${e.classMin}${e.classMax && e.classMax !== e.classMin ? '–' + e.classMax : ''}</span>`;
        return '<span class="fn-badge fn-badge-off">keine LK</span>';
    }

    function renderTemplatesForm(openId) {
        if (openId) tplSel = openId;
        if (!draft.templates.some(t => t.id === tplSel)) tplSel = draft.templates[0]?.id || null;
        const groups = [];
        for (const t of draft.templates) {
            const g = tplGroup(t);
            let grp = groups.find(x => x.name === g);
            if (!grp) groups.push(grp = { name: g, items: [] });
            grp.items.push(t);
        }
        const list = groups.map(g => `<div class="fn-group" data-group="${esc(g.name)}"><div class="fn-group-title">${esc(g.name)}</div>${g.items.map(t => {
            const e = P.effectiveTemplate(t, draft.templates);
            const [nr, name] = splitNr(t.name);
            return `<button type="button" class="fn-item${t.id === tplSel ? ' active' : ''}" data-selt="${esc(t.id)}">
                ${nr ? `<span class="fn-nr">${esc(nr)}</span>` : ''}<span class="fn-name" data-fnname="${esc(t.id)}">${esc(name)}</span>
                <span class="fn-meta">${payBadge(e)}${t.keywords && t.keywords.length ? icon('sparkles', 'Stichwörter für den Vorschlag') : ''}${t.allowances && t.allowances.length ? `<span class="fn-badge fn-badge-info" title="Zulagen">+ Zulage</span>` : ''}</span>
            </button>`;
        }).join('')}</div>`).join('');
        const t = draft.templates.find(x => x.id === tplSel);
        $('#tplList').innerHTML = `<div class="fn-layout">
            <aside class="fn-list" aria-label="Funktionen">${list}<p class="hint fn-empty" hidden>Keine Funktion gefunden.</p></aside>
            ${t ? templateEditor(t) : '<section class="fn-editor"><p class="hint">Noch keine Funktion vorhanden.</p></section>'}
        </div>`;
        filterTemplates();
        updateSettingsNav();
    }

    function templateEditor(t) {
        const e = P.effectiveTemplate(t, draft.templates);
        const catsAll = draft.categories.concat(P.SPECIAL_CATEGORIES.filter(x => P.TARGETABLE_SPECIALS.includes(x.id)));
        const targetName = (catsAll.find(c => c.id === t.target) || { name: '–' }).name;
        const summary = [
            e.fixedAnnual ? `Fixer Jahreslohn ${chf(+e.fixedAnnual)}` : e.classMin ? `Lohnklasse ${e.classMin}${e.classMax && e.classMax !== e.classMin ? '–' + e.classMax : ''}` + (e.baseName ? ` (gemäss «${e.baseName}» +${e.baseDelta})` : '') : 'Keine Lohnklassen',
            (t.classUpYears || []).length ? `Aufstieg nach ${t.classUpYears.join(' und ')} J.` : '',
            `Zielberuf: ${targetName}`,
            t.related.length ? `${t.related.length} verwandte Berufe` : ''
        ].filter(Boolean).join(' · ');
        const panel = (id, html) => `<div class="fn-panel" data-tpanel="${id}" ${tplTab === id ? '' : 'hidden'}>${html}</div>`;
        return `<section class="fn-editor tpl-item" data-tpl="${esc(t.id)}">
            <header class="fn-editor-head">
                <div class="fn-editor-title">
                    <input type="text" class="fn-title-input" data-t="name" value="${esc(t.name)}" aria-label="Name der Funktion">
                    <p class="hint">${esc(summary)}</p>
                </div>
                <div class="row-gap">
                    <button class="btn btn-ghost btn-sm" type="button" data-copytpl="${esc(t.id)}">${icon('copy')} Duplizieren</button>
                    <button class="btn btn-ghost btn-sm btn-danger" type="button" data-deltpl="${esc(t.id)}">${icon('trash')} Löschen</button>
                </div>
            </header>
            <nav class="fn-tabs" role="tablist">${TPL_TABS.map(x => `<button type="button" role="tab" class="fn-tab${tplTab === x.id ? ' active' : ''}" data-ttab="${x.id}" aria-selected="${tplTab === x.id}">${x.name}</button>`).join('')}</nav>
            ${panel('general', `
                <div class="grid-2">
                    <label class="field"><span>Zielberuf (Erfahrung zählt als «gleiche Funktion»)</span><select data-t="target">${catsAll.map(c => `<option value="${esc(c.id)}"${c.id === t.target ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
                    <label class="field"><span>Gruppe (Abschnitt im Einreihungsplan)</span><input type="text" data-t="group" value="${esc(t.group || '')}" placeholder="${esc(tplGroup(Object.assign({}, t, { group: '' })))}"></label>
                </div>
                <div class="field"><span>Verwandte Berufe – Erfahrung «in Verbindung mit der Funktion» (${t.related.length} gewählt)</span>
                    <div class="chip-list">${draft.categories.filter(o => o.id !== t.target).map(o =>
                        `<label class="chip"><input type="checkbox" data-rel="${esc(o.id)}" ${t.related.includes(o.id) ? 'checked' : ''}><span>${esc(o.name)}</span></label>`).join('')}</div>
                </div>`)}
            ${panel('pay', `
                <div class="grid-4">
                    ${numField('Lohnklasse von', 'classMin', t.classMin, { unit: 'LK', placeholder: 'keine' })}
                    ${numField('Lohnklasse bis', 'classMax', t.classMax, { unit: 'LK', placeholder: 'keine' })}
                    <label class="field"><span>Klassenaufstieg nach Jahren</span><input type="text" data-t="classUpYears" value="${esc((t.classUpYears || []).join(', '))}" placeholder="z. B. 12, 24"></label>
                    <label class="field"><span>Gehaltstabelle</span><select data-t="salaryTableId">
                        <option value="">automatisch (am Stichtag gültig)</option>
                        ${draft.salaryTables.map(st => `<option value="${esc(st.id)}"${st.id === t.salaryTableId ? ' selected' : ''}>${esc(st.name)}${st.validFrom ? ' ab ' + esc(fmtDay(st.validFrom)) : ''}</option>`).join('')}</select></label>
                </div>
                <div class="sub-card">
                    <h5>Sonderfälle</h5>
                    <div class="grid-4">
                        <label class="field"><span>Gemäss Grundfunktion</span><select data-t="baseTemplateId">
                            <option value="">nein (eigene Lohnklassen)</option>
                            ${draft.templates.filter(x => x.id !== t.id && !x.baseTemplateId).map(x => `<option value="${esc(x.id)}"${x.id === t.baseTemplateId ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
                        ${numField('plus Klassen', 'baseDelta', t.baseDelta, { unit: 'LK', placeholder: '1' })}
                        ${numField('höchstens Klasse', 'classCap', t.classCap, { unit: 'LK', placeholder: 'keine' })}
                        ${numField('Fixer Jahreslohn', 'fixedAnnual', t.fixedAnnual, { unit: 'CHF', step: 0.05, placeholder: 'kein' })}
                    </div>
                </div>
                <div class="grid-4">
                    <label class="field"><span>Lohnstufe bei n vollen Dienstjahren</span><select data-t="stageMode">
                        <option value="years"${t.stageMode !== 'plusOne' ? ' selected' : ''}>Stufe n (3.35 J. → Stufe 3, Praxis Personal)</option>
                        <option value="plusOne"${t.stageMode === 'plusOne' ? ' selected' : ''}>Stufe n + 1 (3.35 J. → Stufe 4)</option></select></label>
                    <label class="field"><span>Monatslohn</span><select data-t="payments">
                        <option value="13"${t.payments !== 12 ? ' selected' : ''}>13 Auszahlungen</option>
                        <option value="12"${t.payments === 12 ? ' selected' : ''}>12 Auszahlungen</option></select></label>
                    ${numField('Lektionen bei 100 %', 'lessonsFull', t.lessonsFull, { unit: 'Lekt.', step: 0.5, placeholder: 'Pensum in %' })}
                </div>
                <div class="test-calc" aria-label="Testrechner">
                    <label class="field"><span>Testrechner: Erfahrung</span><div class="suffix"><input type="number" data-tc="years" min="0" max="60" step="0.5" value="${testCalc.years}"><em>J.</em></div></label>
                    <label class="field"><span>Pensum</span><div class="suffix"><input type="number" data-tc="pensum" min="1" max="100" step="1" value="${testCalc.pensum}"><em>%</em></div></label>
                    <div class="test-calc-result" data-tcres>${testCalcHtml(t)}</div>
                </div>
                <div class="sub-card">
                    <div class="card-head-row"><h5>Zulagen</h5><button class="btn btn-ghost btn-sm" type="button" data-addal>${icon('plus')} Zulage</button></div>
                    ${(t.allowances || []).length ? `<div class="al-list">${t.allowances.map(a => `<div class="al-row" data-al="${esc(a.id)}">
                        <label class="field"><span>Bezeichnung</span><input type="text" data-alf="label" value="${esc(a.label)}"></label>
                        <label class="field"><span>Betrag pro Jahr bei 100 %</span><div class="suffix"><input type="number" data-alf="annual" min="0" step="0.05" value="${esc(a.annual)}"><em>CHF</em></div></label>
                        <label class="field"><span>Vorschlagen bei Ausbildung (Stichwörter)</span><input type="text" data-alf="autoKeywords" value="${esc(a.autoKeywords.join(', '))}" placeholder="z. B. heilpädagog, hfh"></label>
                        <button class="btn-icon" type="button" data-delal="${esc(a.id)}" title="Zulage entfernen" aria-label="Zulage entfernen">${icon('trash')}</button>
                    </div>`).join('')}</div>` : '<p class="hint">Keine Zulagen. Zulagen werden anteilig zum Pensum zum Lohn gerechnet und lassen sich pro Person an- und abwählen.</p>'}
                </div>`)}
            ${panel('credit', `
                ${rulesGrid(t)}
                <div class="grid-3">
                    <label class="field"><span>Gleichzeitige Tätigkeiten</span><select data-t="combine">
                        <option value="max"${t.combine === 'max' ? ' selected' : ''}>höchste Anrechnung zählt</option>
                        <option value="sum"${t.combine === 'sum' ? ' selected' : ''}>addieren, max. 100 % pro Monat</option>
                        <option value="sumAll"${t.combine === 'sumAll' ? ' selected' : ''}>addieren ohne Begrenzung (Vorlage Personal)</option></select></label>

                    <label class="field"><span>Stichtag</span><select data-t="cutoff">
                        <option value="today"${t.cutoff !== 'yearEnd' ? ' selected' : ''}>heute</option>
                        <option value="yearEnd"${t.cutoff === 'yearEnd' ? ' selected' : ''}>31.12. des laufenden Jahres</option></select></label>
                    <label class="field"><span>Rundung</span><select data-t="rounding">${P.ROUNDING.map(r => `<option value="${r.id}"${r.id === t.rounding ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
                    ${numField('Familienarbeit höchstens', 'familyMaxYears', t.familyMaxYears, { unit: 'J.', step: 0.5, placeholder: 'kein' })}
                    ${numField('Anrechnung ab Alter', 'minAge', t.minAge, { unit: 'J.', placeholder: 'kein' })}
                    ${numField('Höchstens anrechenbar', 'maxYears', t.maxYears, { unit: 'J.', step: 0.5, placeholder: 'kein' })}
                </div>`)}
            ${panel('suggest', `
                <label class="field"><span>Stichwörter für den automatischen Vorschlag – Ausbildung oder Tätigkeit im Lebenslauf, durch Komma getrennt; «a+b» = beide im gleichen Eintrag</span><textarea rows="4" data-t="keywords" placeholder="z. B. sozialpädagog+hf, sozialpädagog+fh">${esc((t.keywords || []).join(', '))}</textarea></label>
                <label class="field"><span>Hinweis zur Einreihung (erscheint beim Lohnvorschlag und im Bericht)</span><textarea rows="3" data-t="note">${esc(t.note || '')}</textarea></label>`)}
        </section>`;
    }

    /** Testrechner im Funktions-Editor: zeigt sofort, was die Einstellungen für eine Beispielperson ergeben. */
    const testCalc = { years: 8, pensum: 80 };
    function testCalcHtml(t) {
        const e = P.effectiveTemplate(t, draft.templates);
        if (e.fixedAnnual) return `<b>${esc(chf(+e.fixedAnnual))}</b> pro Jahr bei 100 % – fixer Lohn, unabhängig von der Erfahrung.<span class="hint">Bei ${testCalc.pensum} %: ${esc(chf(+e.fixedAnnual * testCalc.pensum / 100))}</span>`;
        if (!e.classMin) return '<span class="hint">Keine Lohnklassen eingetragen – ohne «Lohnklasse von» gibt es keine Einreihung.</span>';
        const sel = P.selectSalaryTable(draft.salaryTables, e);
        const pl = P.placement(testCalc.years, e, null, sel.table);
        if (!pl) return '';
        let s = `<b>Lohnklasse ${pl.cls}, Stufe ${pl.stage}</b> bei ${fmtNum(testCalc.years)} Jahren Erfahrung`;
        if (pl.ups) s += ` (+${pl.ups} Klasse${pl.ups > 1 ? 'n' : ''} durch Aufstieg)`;
        if (pl.salary) {
            const p = testCalc.pensum / 100;
            s += `<br>Jahreslohn ${esc(chf(pl.salary))} bei 100 %, <b>${esc(chf(pl.salary * p))}</b> bei ${testCalc.pensum} % · Monatslohn ${esc(chf(pl.salary * p / (e.payments || 13)))} (${e.payments || 13} Auszahlungen)`;
            s += `<span class="hint">Gehaltstabelle ${esc(tableLabel(sel.table))}${sel.future ? ' – gilt am Stichtag noch nicht' : ''}${(e.allowances || []).length ? ' · Zulagen nicht eingerechnet' : ''}</span>`;
        } else s += `<span class="hint">${sel.table ? `Lohnklasse ${pl.cls} steht nicht in der Gehaltstabelle «${esc(sel.table.name)}»` : 'Keine Gehaltstabelle hinterlegt – Lohn kann nicht berechnet werden'}</span>`;
        return s;
    }
    $('#tplList').addEventListener('input', e => {
        if (e.target.dataset.tc) {
            testCalc[e.target.dataset.tc] = e.target.dataset.tc === 'years' ? Math.max(0, +e.target.value || 0) : Math.max(1, Math.min(100, +e.target.value || 100));
        } else if (!e.target.closest('.fn-panel[data-tpanel="pay"]') && !e.target.closest('.fn-panel[data-tpanel="general"]')) return;
        readSettingsForm();
        const t = draft.templates.find(x => x.id === tplSel);
        const res = document.querySelector('#tplList [data-tcres]');
        if (t && res) res.innerHTML = testCalcHtml(t);
    });

    /** Korrekturen der Lohnklasse (z. B. −1 ohne Ausbildung) mit Regel für den automatischen Vorschlag. */
    function renderAdjList() {
        $('#adjList').innerHTML = (draft.classAdjustments || []).map(a => `<div class="adj-row" data-adj="${esc(a.id)}">
            <label class="field"><span>Bezeichnung</span><input type="text" data-af="label" value="${esc(a.label)}"></label>
            <label class="field"><span>Klassen</span><input type="number" data-af="delta" step="1" value="${esc(a.delta)}"></label>
            <label class="field"><span>Automatisch vorschlagen</span><select data-af="kind">${P.AUTO_KINDS.map(k => `<option value="${k.id}"${(a.auto?.kind || '') === k.id ? ' selected' : ''}>${esc(k.name)}</option>`).join('')}</select></label>
            <label class="field"><span>Mind. Jahre Führung</span><input type="number" data-af="minYears" min="0" step="1" value="${esc(a.auto?.minYears ?? '')}" placeholder="–" ${a.auto?.kind === 'leadershipTraining' ? '' : 'disabled'}></label>
            <label class="field"><span>Nur Funktionen, beginnend mit</span><input type="text" data-af="prefix" value="${esc(a.auto?.prefix || '')}" placeholder="alle (z. B. 2.)" ${a.auto?.kind ? '' : 'disabled'}></label>
            <button class="btn-icon" type="button" data-deladj="${esc(a.id)}" title="Korrektur löschen" aria-label="Korrektur löschen">${icon('trash')}</button>
        </div>`).join('') || '<p class="hint">Keine Korrekturen.</p>';
    }

    function renderCatsForm() {
        $('#catList').innerHTML = draft.categories.map(cat => `<div class="cat-item" data-cat="${esc(cat.id)}">
            <label class="field"><span>Bezeichnung</span><input type="text" data-k="name" value="${esc(cat.name)}" required></label>
            <label class="field"><span>Stichwörter (durch Komma getrennt)</span><textarea rows="2" data-k="keywords">${esc(cat.keywords.join(', '))}</textarea></label>
            <button class="btn-icon" type="button" data-delcat="${esc(cat.id)}" title="Beruf löschen" aria-label="Beruf löschen">${icon('x')}</button>
        </div>`).join('');
        updateSettingsNav();
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
                <summary><span class="tpl-name">${esc(st.name)}</span><span class="tpl-target" data-sum>${salarySummary(st)}</span>
                    <button class="btn-icon summary-action" type="button" data-delst="${esc(st.id)}" title="Gehaltstabelle löschen" aria-label="Gehaltstabelle «${esc(st.name)}» löschen">${icon('trash')}</button></summary>
                <div class="tpl-body">
                    <div class="grid-2">
                        <label class="field"><span>Bezeichnung</span><input type="text" data-sf="name" value="${esc(st.name)}"></label>
                        <label class="field"><span>Gültig ab (leer = immer)</span><input type="date" data-sf="validFrom" value="${esc(st.validFrom || '')}"></label>
                    </div>
                    ${st.note ? `<p class="hint">${esc(st.note)}</p>` : ''}
                    <div data-warn>${salaryWarnings(st)}</div>
                    <div class="salary-row">
                        ${kinds.length > 1 ? `<label class="field inline"><span>Anzeigen</span><select data-sview>${kinds.map(k => `<option value="${k.id}"${k.id === view ? ' selected' : ''}>${k.name}</option>`).join('')}</select></label>` : '<span></span>'}
                        <button class="btn btn-ghost btn-sm btn-danger" type="button" data-delst="${esc(st.id)}">${icon('trash')} Tabelle löschen</button>
                    </div>
                    <div class="table-scroll"><table class="table salary-table">
                        <thead><tr><th>LK</th>${Array.from({ length: stages }, (_, i) => `<th class="num">Stufe ${i + 1}</th>`).join('')}</tr></thead>
                        <tbody>${cls.map(k => `<tr><th>${k}</th>${Array.from({ length: stages }, (_, i) => `<td><input type="text" inputmode="decimal" class="cell" data-cell data-kind="${view}" data-cls="${k}" data-i="${i}" value="${esc(cell(m[k] ? m[k][i] : null))}" aria-label="LK ${k} Stufe ${i + 1}"></td>`).join('')}</tr>`).join('')}</tbody>
                    </table></div>
                </div>
            </details>`;
        }).join('') : '<p class="hint">Keine Gehaltstabelle hinterlegt.</p>';
        updateSettingsNav();
    }

    function renderSettingsForm(openTplId) {
        renderTemplatesForm(openTplId);
        renderCatsForm();
        renderSalaryList();
        renderAdjList();
        $('#retentionDays').value = draft.retentionDays ?? '';
        $('#retentionByStatus').innerHTML = P.STATUSES.map(st => `<label class="field"><span>${esc(st.name)}</span><div class="suffix"><input type="number" min="0" step="1" data-rs="${st.id}" value="${draft.retentionByStatus?.[st.id] ?? ''}" placeholder="–"><em>Tage</em></div></label>`).join('');
        $('#fourEyes').checked = !!draft.fourEyes;
        renderPrintForm();
        updateSettingsNav();
    }
    // --- Druckeinstellungen (Logo, Organisation, Fusszeile) ---
    function renderPrintForm() {
        const p = draft.print || (draft.print = { org: '', footer: '', logo: '' });
        $('#printOrg').value = p.org || '';
        $('#printFooter').value = p.footer || '';
        $('#printLogoPreview').hidden = !p.logo;
        $('#printLogoPreview').src = p.logo || '';
        $('#printLogoRemove').hidden = !p.logo;
    }
    $('#printLogo').addEventListener('change', e => {
        const f = e.target.files[0];
        e.target.value = '';
        if (!f) return;
        if (f.size > 300 * 1024) { toast('Das Logo ist grösser als 300 KB – bitte verkleinern.', 'warn'); return; }
        const rd = new FileReader();
        rd.onload = () => { readSettingsForm(); draft.print.logo = String(rd.result); renderPrintForm(); markDirty(); };
        rd.readAsDataURL(f);
    });
    $('#printLogoRemove').addEventListener('click', () => { readSettingsForm(); draft.print.logo = ''; renderPrintForm(); markDirty(); });

    // --- Ungespeicherte Änderungen abfangen ---
    let settingsSnapshot = '';
    /** Aktueller Stand der Formulare als Text (zum Vergleich mit dem Stand beim Öffnen). */
    function snapshotSettings() {
        readSettingsForm();
        readAiForm();
        return JSON.stringify([draft, draftAi]);
    }
    const settingsDirty = () => snapshotSettings() !== settingsSnapshot;
    let dirtyTimer = null;
    function markDirty() {
        clearTimeout(dirtyTimer);
        dirtyTimer = setTimeout(() => {
            if (!draft) return;
            const dirty = settingsDirty();
            $('#setFootHint').innerHTML = dirty ? `<span class="set-dirty">${icon('pencil')} Ungespeicherte Änderungen</span>` : '';
            $('#setSub').textContent = dirty ? 'Änderungen werden erst mit «Speichern» übernommen – für alle, wenn zentrale Einstellungen aktiv sind.' : 'Änderungen werden erst mit «Speichern» übernommen.';
        }, 250);
    }
    /** Schliessen mit Nachfrage, wenn etwas geändert wurde. */
    function tryCloseSettings() {
        if (!draft || !settingsDirty()) { $('#settingsDialog').close('cancel'); return; }
        const dlg = $('#discardDialog');
        const changes = [];
        const before = JSON.parse(settingsSnapshot);
        if (JSON.stringify(before[0].templates) !== JSON.stringify(draft.templates)) changes.push('Funktionen');
        if (JSON.stringify(before[0].salaryTables) !== JSON.stringify(draft.salaryTables)) changes.push('Gehaltstabellen');
        if (JSON.stringify(before[0].categories) !== JSON.stringify(draft.categories)) changes.push('Berufe');
        if (JSON.stringify(before[0].classAdjustments) !== JSON.stringify(draft.classAdjustments)) changes.push('Korrekturen');
        if (JSON.stringify(before[0].print) !== JSON.stringify(draft.print)) changes.push('Druck');
        if (JSON.stringify(before[0].positions) !== JSON.stringify(draft.positions)) changes.push('Stellen');
        if (before[0].fourEyes !== draft.fourEyes || before[0].retentionDays !== draft.retentionDays || JSON.stringify(before[0].retentionByStatus) !== JSON.stringify(draft.retentionByStatus)) changes.push('Aufbewahrung / Prüfung');
        if (JSON.stringify(before[1]) !== JSON.stringify(draftAi)) changes.push('Zugang / KI');

        $('#discardText').textContent = `Ungespeicherte Änderungen${changes.length ? ' bei: ' + changes.join(', ') : ''}. Verwerfen, weiter bearbeiten oder speichern?`;
        dlg.returnValue = '';
        dlg.showModal();
        dlg.addEventListener('close', () => {
            if (dlg.returnValue === 'discard') $('#settingsDialog').close('cancel');
            else if (dlg.returnValue === 'save') $('#settingsDialog').close('save');
        }, { once: true });
    }
    document.querySelectorAll('[data-setclose]').forEach(b => b.addEventListener('click', tryCloseSettings));
    $('#settingsDialog').addEventListener('cancel', e => { e.preventDefault(); tryCloseSettings(); });
    $('#settingsDialog').addEventListener('input', markDirty);
    $('#settingsDialog').addEventListener('change', markDirty);

    // --- Suche über alle Einstellungen ---
    /** Alle durchsuchbaren Einträge: Funktionen, Zulagen, Korrekturen, Gehaltstabellen, Berufe, Stellen und die Felder der Bereiche. */
    function settingsIndex() {
        readSettingsForm();
        const out = [];
        const paneName = { access: 'Zugang', ai: 'KI', templates: 'Funktionen', salary: 'Gehaltstabellen', categories: 'Berufe', data: 'Import & Export', history: 'Verlauf' };
        for (const t of draft.templates) {
            const e = P.effectiveTemplate(t, draft.templates);
            out.push({ kind: 'Funktion', title: t.name, text: [e.classMin ? `LK ${e.classMin}–${e.classMax || e.classMin}` : '', t.group, (t.keywords || []).join(', '), t.note].filter(Boolean).join(' · '), go: () => { tplTab = 'general'; renderTemplatesForm(t.id); }, pane: 'templates', sel: `#tplList [data-tpl]` });
            for (const a of t.allowances || []) out.push({ kind: 'Zulage', title: a.label, text: `${chf(a.annual)} · ${t.name}`, go: () => { tplTab = 'pay'; renderTemplatesForm(t.id); }, pane: 'templates', sel: `#tplList [data-al="${a.id}"]` });
        }
        for (const a of draft.classAdjustments || []) out.push({ kind: 'Korrektur', title: a.label, text: `${a.delta > 0 ? '+' : ''}${a.delta} Klasse(n)${a.auto && a.auto.kind ? ' · automatisch: ' + ((P.AUTO_KINDS.find(k => k.id === a.auto.kind) || {}).name || '') : ''}`, pane: 'templates', sel: `#adjList [data-adj="${a.id}"]` });
        for (const st of draft.salaryTables) out.push({ kind: 'Gehaltstabelle', title: st.name, text: st.validFrom ? 'gültig ab ' + fmtDay(st.validFrom) : 'ohne Gültigkeitsdatum', go: () => renderSalaryList(st.id), pane: 'salary', sel: `#salaryList [data-st="${st.id}"]` });
        for (const c of draft.categories) out.push({ kind: 'Beruf', title: c.name, text: c.keywords.join(', '), pane: 'categories', sel: `#catList [data-cat="${c.id}"]` });
        for (const p of draft.positions || []) out.push({ kind: 'Stelle', title: p.title, text: `${p.status} · ${(draft.templates.find(t => t.id === p.templateId) || {}).name || ''}`, go: () => { $('#settingsDialog').close('cancel'); location.hash = '#stellen'; openPositionDialog(positionOf(p.id)); } });
        // Felder und Schalter der Bereiche (Beschriftungen aus dem Dialog)
        document.querySelectorAll('.set-pane').forEach(pane => {
            if (pane.dataset.pane === 'templates') return;
            pane.querySelectorAll('.set-card h4, .switch-row b, label.field > span, .feature-text h4').forEach(el => {
                const card = el.closest('.set-card, .field, .switch-row');
                if (!card) return;
                if (!card.id) card.id = 'sx_' + Math.random().toString(36).slice(2, 8);
                out.push({ kind: paneName[pane.dataset.pane] || 'Einstellung', title: el.textContent.trim(), text: (card.querySelector('small, .hint') || {}).textContent || '', pane: pane.dataset.pane, sel: '#' + card.id });
            });
        });
        return out;
    }
    function highlight(text, terms) {
        let s = esc(text);
        terms.forEach(t => { s = s.replace(new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); });
        return s;
    }
    let searchHits = [];
    function runSettingsSearch() {
        const q = $('#setSearch').value.trim().toLowerCase();
        const box = $('#setSearchResults');
        if (q.length < 2) { box.hidden = true; box.innerHTML = ''; return; }
        const terms = q.split(/\s+/).filter(Boolean);
        searchHits = settingsIndex().filter(h => terms.every(t => (h.title + ' ' + h.text).toLowerCase().includes(t)))
            .sort((a, b) => (b.title.toLowerCase().includes(q) ? 1 : 0) - (a.title.toLowerCase().includes(q) ? 1 : 0)).slice(0, 25);
        box.hidden = false;
        box.innerHTML = searchHits.length ? searchHits.map((h, i) => `<button type="button" class="set-hit" data-hit="${i}"><b>${highlight(h.title, terms)}</b><span class="set-hit-kind">${esc(h.kind)}</span>${h.text ? `<small>${highlight(h.text.slice(0, 140), terms)}</small>` : ''}</button>`).join('')
            : '<p class="empty">Nichts gefunden.</p>';
    }
    function gotoHit(h) {
        $('#setSearchResults').hidden = true;
        $('#setSearch').value = '';
        if (h.go) h.go();
        if (h.pane) showPane(h.pane);
        if (h.sel) {
            const el = document.querySelector(h.sel);
            if (el) {
                el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                el.classList.add('flash');
                setTimeout(() => el.classList.remove('flash'), 1600);
                const inp = el.querySelector('input:not([type="checkbox"]), textarea, select');
                if (inp && el.closest('.set-pane')?.dataset.pane !== 'templates') inp.focus({ preventScroll: true });
            }
        }
    }
    $('#setSearch').addEventListener('input', runSettingsSearch);
    $('#setSearch').addEventListener('focus', runSettingsSearch);
    $('#setSearch').addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); $('#setSearchResults').hidden = true; $('#setSearch').value = ''; }
        if (e.key === 'Enter' && searchHits.length) { e.preventDefault(); gotoHit(searchHits[0]); }
        if (e.key === 'ArrowDown') { e.preventDefault(); $('#setSearchResults .set-hit')?.focus(); }
    });
    $('#setSearchResults').addEventListener('click', e => { const b = e.target.closest('[data-hit]'); if (b) gotoHit(searchHits[+b.dataset.hit]); });
    $('#setSearchResults').addEventListener('keydown', e => {
        const items = [...$('#setSearchResults').querySelectorAll('.set-hit')];
        const i = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown' && i < items.length - 1) { e.preventDefault(); items[i + 1].focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); if (i > 0) items[i - 1].focus(); else $('#setSearch').focus(); }
    });
    document.addEventListener('click', e => { if (!e.target.closest('.set-search')) $('#setSearchResults').hidden = true; });

    // --- Verlauf der zentralen Einstellungen ---
    async function renderHistory() {
        const box = $('#historyList');
        if (!shared.enabled) { box.innerHTML = `<p class="hint">Der Verlauf gibt es nur mit zentralen Einstellungen auf dem Server (Bereich «Zugang»).</p>`; return; }
        if (!draftAi.password) { box.innerHTML = `<p class="hint warn">Für den Verlauf fehlt das Zugangspasswort (Bereich «Zugang»).</p>`; return; }
        box.innerHTML = '<p class="hint"><span class="spinner"></span> Verlauf wird geladen …</p>';
        try {
            const res = await fetch(SETTINGS_URL + '?action=history', { cache: 'no-store', headers: { 'x-app-password': draftAi.password } });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
            const list = data.versions || [];
            if (!list.length) { box.innerHTML = '<p class="hint">Noch keine Versionen gespeichert.</p>'; return; }
            box.innerHTML = list.map((v, i) => {
                const prev = list[i + 1];
                const diff = prev ? ['templates', 'salaryTables', 'categories', 'positions', 'classAdjustments'].map(k => {
                    const d = (v.counts[k] || 0) - (prev.counts[k] || 0);
                    return d ? `${d > 0 ? '+' : ''}${d} ${{ templates: 'Funktionen', salaryTables: 'Tabellen', categories: 'Berufe', positions: 'Stellen', classAdjustments: 'Korrekturen' }[k]}` : '';
                }).filter(Boolean).join(', ') : `${v.counts.templates || 0} Funktionen, ${v.counts.salaryTables || 0} Tabellen`;
                return `<div class="history-row${v.version === data.current ? ' current' : ''}">
                    <span class="v">v${v.version}</span>
                    <span class="meta"><span>${esc(fmtWhen(v.updatedAt))}${v.version === data.current ? ' · <b>aktuell</b>' : ''}</span><small>${v.updatedBy ? 'von ' + esc(v.updatedBy) : 'ohne Namen gespeichert'}</small></span>
                    <span class="diff">${esc(diff || 'keine Änderung der Anzahl')}</span>
                    ${v.version === data.current ? '<span></span>' : `<button class="btn btn-ghost btn-sm" type="button" data-restore="${v.version}">${icon('history')} Wiederherstellen</button>`}
                </div>`;
            }).join('');
        } catch (err) {
            box.innerHTML = `<p class="hint warn">Verlauf konnte nicht geladen werden: ${esc(err.message)}</p>`;
        }
    }
    $('#historyList').addEventListener('click', async e => {
        const b = e.target.closest('[data-restore]');
        if (!b) return;
        b.disabled = true;
        try {
            const res = await fetch(SETTINGS_URL + '?action=version&v=' + encodeURIComponent(b.dataset.restore), { cache: 'no-store', headers: { 'x-app-password': draftAi.password } });
            const data = await res.json();
            if (!res.ok || !data.settings) throw new Error(data.error || `Fehler ${res.status}`);
            const n = P.normalizeSettings(data.settings);
            if (!n.templates.length) throw new Error('Die Version enthält keine Funktionen.');
            readSettingsForm();
            const before = clone(draft);
            draft = n;
            renderSettingsForm();
            markDirty();
            showPane('templates');
            undoable(`Version ${data.version} geladen – wird erst mit «Speichern» für alle übernommen.`, () => { draft = before; renderSettingsForm(); markDirty(); });
        } catch (err) {
            toast('Version konnte nicht geladen werden: ' + err.message, 'error');
            b.disabled = false;
        }
    });

    // --- Navigation im Einstellungsdialog ---
    let settingsPane = 'access';
    function showPane(id) {
        settingsPane = id;
        document.querySelectorAll('.set-nav-item').forEach(b => { b.classList.toggle('active', b.dataset.pane === id); b.setAttribute('aria-current', b.dataset.pane === id ? 'page' : 'false'); });
        document.querySelectorAll('.set-pane').forEach(p => { p.hidden = p.dataset.pane !== id; });
        $('.set-content').scrollTop = 0;
        if (id === 'history' && draft) renderHistory();
    }
    /** Anzahl bzw. Status neben jedem Bereich. */
    function updateSettingsNav() {
        if (!draft) return;
        const dot = (ok, title) => `<span class="dot ${ok ? 'dot-ok' : 'dot-warn'}" title="${esc(title)}"></span>`;
        const counts = {
            access: shared.enabled && store.enabled && draftAi.password ? dot(true, 'Server verbunden') : dot(false, 'Nicht vollständig eingerichtet'),
            ai: draftAi.enabled ? dot(draftAi.mode === 'server' ? server.configured : !!draftAi.apiKey, draftAi.enabled ? 'eingeschaltet' : '') : '<span class="off">aus</span>',
            templates: draft.templates.length,
            salary: draft.salaryTables.length || '<span class="off">–</span>',
            categories: draft.categories.length,
            data: '',
            history: shared.enabled && shared.version ? `v${shared.version}` : ''
        };
        document.querySelectorAll('[data-count]').forEach(el => { el.innerHTML = counts[el.dataset.count] ?? ''; });
        const n = draft.templates.length;
        $('#tplSearch').placeholder = `${n} Funktion${n === 1 ? '' : 'en'} durchsuchen …`;
    }
    function filterTemplates() {
        const terms = $('#tplSearch').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        let shown = 0;
        document.querySelectorAll('#tplList .fn-item').forEach(item => {
            item.hidden = !terms.every(t => item.textContent.toLowerCase().includes(t));
            if (!item.hidden) shown++;
        });
        document.querySelectorAll('#tplList .fn-group').forEach(g => { g.hidden = ![...g.querySelectorAll('.fn-item')].some(i => !i.hidden); });
        const empty = document.querySelector('#tplList .fn-empty');
        if (empty) empty.hidden = shown > 0;
    }
    document.querySelector('.set-nav').addEventListener('click', e => {
        const b = e.target.closest('[data-pane]');
        if (b) showPane(b.dataset.pane);
    });
    $('#settingsDialog').addEventListener('click', e => {
        const go = e.target.closest('[data-goto]');
        if (go) showPane(go.dataset.goto);
    });
    $('#tplSearch').addEventListener('input', filterTemplates);

    function readSettingsForm() {
        document.querySelectorAll('#adjList .adj-row').forEach(row => {
            const a = draft.classAdjustments.find(x => x.id === row.dataset.adj);
            if (!a) return;
            const f = k => row.querySelector(`[data-af="${k}"]`).value;
            a.label = f('label').trim() || 'Korrektur';
            a.delta = Math.round(+f('delta')) || 0;
            a.auto = f('kind') ? { kind: f('kind'), minYears: +f('minYears') > 0 ? +f('minYears') : null, prefix: f('prefix').trim() } : null;
        });
        draft.retentionByStatus = {};
        document.querySelectorAll('[data-rs]').forEach(inp => { if (inp.value.trim() !== '' && +inp.value >= 0) draft.retentionByStatus[inp.dataset.rs] = Math.round(+inp.value); });
        draft.fourEyes = $('#fourEyes').checked;
        const days = $('#retentionDays').value.trim();
        draft.retentionDays = days === '' ? null : Math.max(0, Math.round(+days) || 0);
        draft.print = Object.assign(draft.print || { logo: '' }, { org: $('#printOrg').value.trim(), footer: $('#printFooter').value.trim() });
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
            t.stageMode = v('stageMode') === 'plusOne' ? 'plusOne' : 'years';
            t.lessonsFull = optNum('lessonsFull');
            t.baseTemplateId = v('baseTemplateId') === t.id ? '' : v('baseTemplateId');
            t.baseDelta = v('baseDelta') === '' ? 1 : +v('baseDelta');
            t.classCap = optNum('classCap');
            t.fixedAnnual = optNum('fixedAnnual');
            t.keywords = v('keywords').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
            t.note = v('note').trim();
            t.group = v('group').trim();
            t.allowances = [...item.querySelectorAll('.al-row')].map(row => {
                const f = k => row.querySelector(`[data-alf="${k}"]`).value;
                return { id: row.dataset.al, label: f('label').trim() || 'Zulage', annual: Math.max(0, +f('annual') || 0), autoKeywords: f('autoKeywords').split(',').map(x => x.trim().toLowerCase()).filter(Boolean) };
            });
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
            const { status, data } = await sharedRequest('POST', { baseVersion: base, settings, updatedBy: ai.userName || '' }, ai.password, ai.adminPassword);

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
        $('#tplSearch').value = '';
        $('#setSearch').value = '';
        $('#setSearchResults').hidden = true;
        $('#importResult').innerHTML = '';
        $('#setFootHint').innerHTML = '';
        settingsSnapshot = snapshotSettings();
        showPane(tplId ? 'templates' : settingsPane === 'history' ? 'access' : settingsPane);
        $('#settingsDialog').showModal();
        if (tplId) document.querySelector(`#tplList [data-tpl="${CSS.escape(tplId)}"]`)?.scrollIntoView({ block: 'start' });
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
            const id = e.target.closest('.tpl-item')?.dataset.tpl;
            const el = id && document.querySelector(`#tplList [data-fnname="${CSS.escape(id)}"]`);
            if (el) el.textContent = splitNr(e.target.value || 'Unbenannte Funktion')[1];
        }
    });
    $('#addAdj').addEventListener('click', () => {
        readSettingsForm();
        draft.classAdjustments.push({ id: 'k' + Math.random().toString(36).slice(2, 7), label: 'Neue Korrektur', delta: -1, cap: null, auto: null });
        renderAdjList();
    });
    $('#adjList').addEventListener('click', e => {
        const d = e.target.closest('[data-deladj]');
        if (!d) return;
        readSettingsForm();
        const a = draft.classAdjustments.find(x => x.id === d.dataset.deladj);
        const i = draft.classAdjustments.indexOf(a);
        draft.classAdjustments = draft.classAdjustments.filter(x => x !== a);
        renderAdjList();
        markDirty();
        undoable(`Korrektur «${a.label}» gelöscht.`, () => { draft.classAdjustments.splice(Math.min(i, draft.classAdjustments.length), 0, a); renderAdjList(); markDirty(); });
    });
    $('#adjList').addEventListener('change', e => {
        if (e.target.dataset.af === 'kind') { readSettingsForm(); renderAdjList(); }
    });
    $('#addTpl').addEventListener('click', () => {
        readSettingsForm();
        const t = P.makeTemplate(draft.categories[0].id, 'Neue Funktion');
        tplTab = 'general';
        draft.templates.push(t);
        renderTemplatesForm(t.id);
        document.querySelector(`#tplList [data-tpl="${t.id}"] [data-t="name"]`)?.select();
    });
    $('#tplList').addEventListener('click', e => {
        const sel = e.target.closest('[data-selt]');
        if (sel) { readSettingsForm(); renderTemplatesForm(sel.dataset.selt); $('#tplList .fn-editor')?.scrollIntoView({ block: 'nearest' }); return; }
        const tab = e.target.closest('[data-ttab]');
        if (tab) {
            tplTab = tab.dataset.ttab;
            document.querySelectorAll('#tplList .fn-tab').forEach(b => { b.classList.toggle('active', b === tab); b.setAttribute('aria-selected', b === tab); });
            document.querySelectorAll('#tplList .fn-panel').forEach(p => { p.hidden = p.dataset.tpanel !== tplTab; });
            return;
        }
        if (e.target.closest('[data-addal]') || e.target.closest('[data-delal]')) {
            readSettingsForm();
            const t = draft.templates.find(x => x.id === tplSel);
            const delId = e.target.closest('[data-delal]')?.dataset.delal;
            if (delId) t.allowances = t.allowances.filter(a => a.id !== delId);
            else t.allowances.push({ id: 'z' + Math.random().toString(36).slice(2, 7), label: 'Neue Zulage', annual: 0, autoKeywords: [] });
            renderTemplatesForm();
            return;
        }
        const del = e.target.closest('[data-deltpl]');
        const cp = e.target.closest('[data-copytpl]');
        if (!del && !cp) return;
        readSettingsForm();
        if (del) {
            if (draft.templates.length === 1) { toast('Es muss mindestens eine Funktion vorhanden sein.', 'warn'); return; }
            const t = draft.templates.find(x => x.id === del.dataset.deltpl);
            const i = draft.templates.indexOf(t);
            const usedBy = draft.templates.filter(x => x.baseTemplateId === t.id);
            const posUsed = (draft.positions || []).filter(p => p.templateId === t.id);
            draft.templates.splice(i, 1);
            tplSel = (draft.templates[i] || draft.templates[i - 1]).id;
            renderTemplatesForm();
            markDirty();
            undoable(`Funktion «${t.name}» gelöscht${usedBy.length ? ` – Grundfunktion von ${usedBy.map(x => x.name).join(', ')}` : ''}${posUsed.length ? ` – ${posUsed.length} Stelle(n) ohne Funktion` : ''}.`, () => {
                draft.templates.splice(Math.min(i, draft.templates.length), 0, t);
                renderTemplatesForm(t.id);
                markDirty();
            });
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

    /** Zeigt auf einem Button-Label einen Fortschrittstext (null = ursprünglicher Text); das Icon bleibt. */
    function busyLabel(label) {
        const node = [...label.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
        const original = node ? node.textContent : '';
        return text => {
            if (node) node.textContent = text === null ? original : ' ' + text;
            label.classList.toggle('busy', text !== null);
        };
    }
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
        const setBusy = busyLabel(label);
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
            setBusy(null);
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
        const setBusy = busyLabel(label);
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
                    `${reg.functions.length} Funktionen – jede wird eine Vorlage und ein Beruf`,
                    reg.classUpYears && reg.classUpYears.length ? `Klassenaufstieg nach ${reg.classUpYears.join(' und ')} Dienstjahren` : '',
                    reg.cutoff === 'yearEnd' ? 'Stichtag 31.12.' : '',
                    reg.payments ? `${reg.payments} Monatslöhne` : '',
                    reg.adjustments && reg.adjustments.length ? `${reg.adjustments.length} Korrekturen` : ''
                ].filter(Boolean);
                if (!confirm(`«${f.name}» (gelesen ${source}):\n– ${lines.join('\n– ')}` + (reg.summary ? `\n\n${reg.summary}` : '')
                    + '\n\nOK = Vorlagen, Berufe und Korrekturen durch diese ersetzen (Gehaltstabellen bleiben)\nAbbrechen = nichts ändern')) continue;
                draft = P.buildFromRegulation(reg, draft);
                done.push(`Reglement «${f.name}»: ${reg.functions.length} Funktionen und Berufe` + (source === 'ohne KI' ? ' (Stichwörter ohne KI nur grob – bitte bei den Funktionen ergänzen oder mit KI-Auswertung einlesen)' : ''));
            }
        } catch (err) {
            alert('Einlesen fehlgeschlagen: ' + err.message);
        } finally {
            setBusy(null);
        }
        if (done.length) {
            renderSettingsForm();
            $('#importResult').innerHTML = `<span class="ok">${icon('check')} Übernommen: ${esc(done.join(' · '))}.</span> Bitte die Vorlagen kurz prüfen und dann «Speichern».`;
        }
    });
    $('#salaryList').addEventListener('click', e => {
        const del = e.target.closest('[data-delst]');
        if (!del) return;
        e.preventDefault(); // Klick im Tabellenkopf soll die Tabelle nicht auf-/zuklappen
        readSettingsForm();
        const st = draft.salaryTables.find(x => x.id === del.dataset.delst);
        const used = draft.templates.filter(t => t.salaryTableId === st.id);
        const i = draft.salaryTables.indexOf(st);
        draft.salaryTables = draft.salaryTables.filter(x => x !== st);
        used.forEach(t => { t.salaryTableId = ''; });
        renderSalaryList();
        renderTemplatesForm();
        markDirty();
        undoable(`Gehaltstabelle «${st.name}» gelöscht${used.length ? ` – ${used.length} Funktion(en) nehmen nun die am Stichtag gültige Tabelle` : ''}.`, () => {
            draft.salaryTables.splice(Math.min(i, draft.salaryTables.length), 0, st);
            used.forEach(t => { t.salaryTableId = st.id; });
            renderSalaryList(st.id);
            renderTemplatesForm();
            markDirty();
        });
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
        if (draft.categories.length === 1) { toast('Es muss mindestens ein Beruf vorhanden sein.', 'warn'); return; }
        const cat = draft.categories.find(c => c.id === id);
        const affected = draft.templates.filter(t => t.target === id);
        const before = clone({ categories: draft.categories, templates: draft.templates });
        draft.categories = draft.categories.filter(c => c.id !== id);
        draft.templates = draft.templates.filter(t => t.target !== id);
        draft.templates.forEach(t => { t.related = t.related.filter(r => r !== id); });
        if (!draft.templates.length) draft.templates.push(P.makeTemplate(draft.categories[0].id, draft.categories[0].name));
        renderSettingsForm();
        markDirty();
        undoable(`Beruf «${cat.name}» gelöscht${affected.length ? ` – samt ${affected.length} Funktion(en) mit diesem Zielberuf` : ''}.`, () => { Object.assign(draft, before); renderSettingsForm(); markDirty(); });
    });
    $('#resetSettings').addEventListener('click', () => {
        readSettingsForm();
        const before = clone(draft);
        draft = Object.assign(clone(P.DEFAULT_SETTINGS), { salaryTables: draft.salaryTables, print: draft.print, positions: draft.positions, retentionDays: draft.retentionDays, retentionByStatus: draft.retentionByStatus, fourEyes: draft.fourEyes });
        renderSettingsForm();
        markDirty();
        undoable('Berufe und Funktionen auf den Standard zurückgesetzt – gilt erst mit «Speichern».', () => { draft = before; renderSettingsForm(); markDirty(); });
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
        pushShared().catch(err => setStatus('Nur in diesem Browser gespeichert – Server nicht erreichbar: ' + err.message, true))
            .then(checkStore).then(() => render());
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

    // Beispiel-Lebenslauf: bei jedem Klick eine neue (erfundene) Person
    const EXAMPLE_FIRST = {
        f: ['Anna', 'Laura', 'Sarah', 'Lea', 'Nina', 'Julia', 'Mirjam', 'Sandra', 'Carla', 'Elena', 'Fabienne', 'Jana', 'Selina', 'Corinne', 'Tamara', 'Noemi'],
        m: ['Lukas', 'Marco', 'David', 'Simon', 'Jonas', 'Fabian', 'Reto', 'Michael', 'Stefan', 'Nico', 'Adrian', 'Pascal', 'Thomas', 'Samuel', 'Raphael', 'Dominik']
    };
    const EXAMPLE_LAST = ['Muster', 'Meier', 'Keller', 'Steiner', 'Huber', 'Brunner', 'Frei', 'Baumann', 'Gerber', 'Widmer', 'Schmid', 'Moser', 'Zimmermann', 'Bachmann', 'Iten', 'Hess', 'Kälin', 'Suter', 'Arnold', 'Odermatt'];
    const pick = list => list[Math.floor(Math.random() * list.length)];
    function exampleCv() {
        const used = new Set(candidates.map(c => c.name));
        const g = Math.random() < 0.5 ? 'f' : 'm';
        let name = '';
        for (let i = 0; i < 50 && (!name || used.has(name)); i++) name = pick(EXAMPLE_FIRST[g]) + ' ' + pick(EXAMPLE_LAST);
        const day = String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
        const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, '0');
        const w = (fem, masc) => g === 'f' ? fem : masc;
        const text = EXAMPLE
            .replace('Anna Muster', name)
            .replace('14.05.1988', `${day}.${month}.${1986 + Math.floor(Math.random() * 5)}`)
            .replace('Primarlehrerin', w('Primarlehrerin', 'Primarlehrer'))
            .replace('Kaufmännische Sachbearbeiterin', w('Kaufmännische Sachbearbeiterin', 'Kaufmännischer Sachbearbeiter'))
            .replace('Verkäuferin', w('Verkäuferin', 'Verkäufer'));
        return { name, text };
    }

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

    // --- Events: Bewerbende ---
    $('#applicantSearch').addEventListener('input', renderApplicants);
    $('#statusFilter').addEventListener('click', e => {
        const b = e.target.closest('[data-stfilter]');
        if (b) { applicantStatus = b.dataset.stfilter; renderApplicants(); }
    });
    $('#positionFilter').addEventListener('change', e => { applicantPos = e.target.value; renderApplicants(); });
    $('#compareTable').addEventListener('click', e => {
        const b = e.target.closest('[data-select]');
        if (!b) return;
        selectedId = b.dataset.select;
        render();
        $('#applicantDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#applicantsBody').addEventListener('click', e => {
        const rm = e.target.closest('[data-remove]');
        if (rm) { removeCandidate(rm.dataset.remove); return; }
        if (e.target.closest('select')) return;
        const ps = e.target.closest('[data-rowsalary]');
        if (ps) { const c = candidates.find(x => x.id === ps.dataset.rowsalary); if (c) previewPrint('Lohnblatt', CVReport.salaryPage(buildView(c))); return; }
        const cp = e.target.closest('[data-rowcompare]');
        if (cp) { applicantPos = cp.dataset.rowcompare; applicantStatus = 'alle'; renderApplicants(); $('#compareCard').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
        const row = e.target.closest('[data-select]');
        if (!row) return;
        selectedId = row.dataset.select;
        render();
        $('#applicantDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#applicantsBody').addEventListener('change', e => {
        const s = e.target.closest('[data-rowstatus]');
        if (!s) return;
        const c = candidates.find(x => x.id === s.dataset.rowstatus);
        if (!c) return;
        const before = c.status || 'neu';
        c.status = s.value;
        render();
        undoable(`${c.name}: Status «${statusName(c.status)}».`, () => { c.status = before; render(); });
    });
    // Tastatur: Enter/Leertaste auf einer Zeile öffnet die Person
    $('#applicantsBody').addEventListener('keydown', e => {
        if ((e.key !== 'Enter' && e.key !== ' ') || e.target.tagName !== 'TR') return;
        e.preventDefault();
        selectedId = e.target.dataset.select;
        render();
        $('#applicantDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    window.addEventListener('hashchange', showView);
    showView();
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
