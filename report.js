/* ============================================
   Lebenslauf-Rechner — Bericht pro Person (Druck / PDF)
   Baut eine druckbare Seite pro Person und öffnet den Druckdialog
   («Als PDF speichern»). Stellt window.CVReport bereit.
   ============================================ */
(function (root) {
    'use strict';

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = y => (Math.round(y * 10) / 10).toLocaleString('de-CH', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const fmtDate = s => { const m = /^(\d{4})-(\d{2})$/.exec(s || ''); return m ? m[2] + '.' + m[1] : '–'; };

    /**
     * Eine Berichtsseite.
     * @param {object} v  vorbereitete Daten aus app.js (buildView)
     */
    function page(v) {
        const rows = v.entries.map((e, i) => {
            const pe = v.result.perEntry[i];
            return `<tr class="${e.include ? '' : 'r-off'}">
                <td>${esc(e.title)}${e.details ? `<div class="r-sub">${esc(e.details)}</div>` : ''}</td>
                <td>${esc(v.catName(e.category))}</td>
                <td>${fmtDate(e.start)}</td>
                <td>${e.ongoing ? 'heute' : fmtDate(e.end)}</td>
                <td class="num">${esc(e.pensum)} %</td>
                <td class="num">${pe.valid ? fmt(pe.months / 12) : '–'}</td>
                <td class="num">${e.include ? pe.factor + ' %' : 'nein'}${e.factorOverride !== null && e.factorOverride !== undefined && e.factorOverride !== '' ? '*' : ''}</td>
                <td class="num"><b>${fmt(pe.credited / 12)}</b></td>
            </tr>`;
        }).join('');
        const hasOverride = v.entries.some(e => e.factorOverride !== null && e.factorOverride !== undefined && e.factorOverride !== '');
        const r = v.result;
        return `<section class="r-page">
            <header class="r-head">
                <div>
                    <div class="r-kicker">Anrechnung der Berufserfahrung</div>
                    <h1>${esc(v.name)}</h1>
                </div>
                <div class="r-meta">Erstellt am ${esc(v.created)}</div>
            </header>
            <table class="r-facts">
                <tr><th>Stelle / Vorlage</th><td>${esc(v.template.name)} (Zielberuf: ${esc(v.catName(v.template.target))})</td></tr>
                <tr><th>Geburtsdatum</th><td>${v.birth ? fmtDate(v.birth) : 'nicht angegeben'}</td></tr>
                <tr><th>Auswertung</th><td>${esc(v.sourceText)}</td></tr>
                ${v.salaryTableText ? `<tr><th>Gehaltstabelle</th><td>${esc(v.salaryTableText)}</td></tr>` : ''}
                <tr><th>Einstellungen</th><td>${esc(v.settingsText)}</td></tr>
            </table>
            <div class="r-stats">
                <div><span>Berufserfahrung total</span><b>${fmt(r.totalYears)} J.</b></div>
                <div><span>davon im Zielberuf</span><b>${fmt(r.targetYears)} J.</b></div>
                <div><span>andere Berufe</span><b>${fmt(r.otherYears)} J.</b></div>
                <div class="r-main"><span>Anrechenbare Jahre</span><b>${fmt(r.creditedYears)} J.</b></div>
            </div>
            ${v.placementText ? `<p class="r-placement"><b>Vorschlag Lohneinreihung:</b> ${esc(v.placementText)}<br><span>${esc(v.placementWhy)}</span></p>` : ''}
            <p class="r-formula"><b>Berechnung:</b> ${v.formulaText}</p>
            <p class="r-rules"><b>Regeln:</b> ${esc(v.rulesText)}</p>
            ${v.timeline ? `<div class="r-timeline">${v.timeline}</div>` : ''}
            <table class="r-table">
                <thead><tr><th>Funktion / Stelle</th><th>Beruf</th><th>Von</th><th>Bis</th><th class="num">Pensum</th><th class="num">Dauer (J.)</th><th class="num">Anrechnung</th><th class="num">Angerechnet (J.)</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="8">Keine Einträge</td></tr>'}</tbody>
            </table>
            ${hasOverride ? `<p class="r-note">* Anrechnung manuell angepasst (${v.overrides} Eintr${v.overrides > 1 ? 'äge' : 'ag'}), abweichend von den Regeln der Vorlage.</p>` : ''}
            ${v.hinweise ? `<p class="r-note"><b>Hinweis aus der KI-Auswertung:</b> ${esc(v.hinweise)}</p>` : ''}
            <div class="r-sign">
                <div><span>Geprüft durch</span></div>
                <div><span>Datum</span></div>
                <div><span>Unterschrift</span></div>
            </div>
        </section>`;
    }

    /** Druckt einen Bericht pro Person (views = Array von buildView-Ergebnissen). */
    function print(views) {
        let area = document.getElementById('printArea');
        if (!area) {
            area = document.createElement('div');
            area.id = 'printArea';
            document.body.appendChild(area);
        }
        area.innerHTML = views.map(page).join('');
        document.body.classList.add('printing');
        const done = () => { document.body.classList.remove('printing'); area.innerHTML = ''; window.removeEventListener('afterprint', done); };
        window.addEventListener('afterprint', done);
        window.print();
    }

    root.CVReport = { print, page };
})(typeof self !== 'undefined' ? self : this);
