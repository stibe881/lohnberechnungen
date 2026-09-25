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

    /** Kopf mit Logo und Organisation (aus den Druckeinstellungen), leer wenn nichts hinterlegt. */
    function orgHtml(v) {
        const p = v.print || {};
        if (!p.logo && !p.org) return '';
        return `<div class="r-org">${p.logo ? `<img class="r-logo" src="${esc(p.logo)}" alt="">` : ''}${p.org ? `<span class="r-orgname">${esc(p.org)}</span>` : ''}</div>`;
    }
    /** Fusszeile: Text aus den Druckeinstellungen und Erstelldatum. */
    function footHtml(v, kind) {
        const p = v.print || {};
        return `<footer class="r-foot"><span>${esc(p.footer || '')}</span><span>${esc(kind)} · ${esc(v.name)} · erstellt am ${esc(v.created)}</span></footer>`;
    }
    function headHtml(v, kicker) {
        return `<header class="r-head">
                <div>
                    <div class="r-kicker">${esc(kicker)}</div>
                    <h1>${esc(v.name)}</h1>
                </div>
                <div class="r-meta">${orgHtml(v)}Erstellt am ${esc(v.created)}</div>
            </header>`;
    }

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
            ${headHtml(v, 'Anrechnung der Berufserfahrung')}
            <table class="r-facts">
                <tr><th>Stelle / Vorlage</th><td>${esc(v.template.name)} (Zielberuf: ${esc(v.catName(v.template.target))}${v.baseText ? '; ' + esc(v.baseText) : ''})${v.suggestionText ? `<div class="r-sub">${esc(v.suggestionText)}</div>` : ''}</td></tr>
                <tr><th>Geburtsdatum</th><td>${v.birth ? fmtDate(v.birth) : 'nicht angegeben'}</td></tr>
                ${v.positionText ? `<tr><th>Offene Stelle</th><td>${esc(v.positionText)}</td></tr>` : ''}
                <tr><th>Status</th><td>${esc(v.statusText)}</td></tr>
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
            ${v.note ? `<p class="r-note"><b>Hinweis zur Einreihung:</b> ${esc(v.note)}</p>` : ''}
            <p class="r-formula"><b>Berechnung:</b> ${v.formulaText}</p>
            <p class="r-rules"><b>Regeln:</b> ${esc(v.rulesText)}</p>
            ${v.timeline ? `<div class="r-timeline">${v.timeline}</div>` : ''}
            <table class="r-table">
                <thead><tr><th>Funktion / Stelle</th><th>Beruf</th><th>Von</th><th>Bis</th><th class="num">Pensum</th><th class="num">Dauer (J.)</th><th class="num">Anrechnung</th><th class="num">Angerechnet (J.)</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="8">Keine Einträge</td></tr>'}</tbody>
            </table>
            ${hasOverride ? `<p class="r-note">* Anrechnung manuell angepasst (${v.overrides} Eintr${v.overrides > 1 ? 'äge' : 'ag'}), abweichend von den Regeln der Vorlage.</p>` : ''}
            ${v.hinweise ? `<p class="r-note"><b>Hinweis:</b> ${esc(v.hinweise)}</p>` : ''}
            ${signHtml(v)}
            ${footHtml(v, 'Bericht Berufserfahrung')}
        </section>`;
    }

    /** Unterschriftenfeld; mit Prüfung/Freigabe aus der App vorausgefüllt. */
    function signHtml(v) {
        const rv = v.review || {};
        const row = (label, value) => `<div class="r-sign">
                <div><b>${esc(value || '')}</b><span>${label}</span></div>
                <div><span>Datum</span></div>
                <div><span>Unterschrift</span></div>
            </div>`;
        return row('Geprüft durch', rv.checked) + (rv.fourEyes || rv.approved ? row('Freigegeben durch', rv.approved) : '');
    }

    /** Lohnblatt: Lohnvorschlag für die Personalakte bzw. den Vertragsentwurf. */
    function salaryPage(v) {
        const r = v.result, pl = v.placement, sal = v.salary;
        const facts = [
            ['Person', v.name + (v.birth ? `, geb. ${fmtDate(v.birth)}` : '')],
            ['Stelle', v.positionText || '–'],
            ['Funktion', v.template.name + (v.baseText ? ` (${v.baseText})` : '')],
            ['Pensum', v.pensumText],
            ['Status', v.statusText]
        ];
        const amounts = sal ? [
            ['Jahreslohn bei 100 %', v.chf(sal.full)],
            ...(sal.pensum !== 100 ? [[`Jahreslohn bei ${v.pensumText}`, v.chf(sal.base)]] : []),

            ...sal.allowances.map(a => [`${a.label} (${v.chf(a.annual)} bei 100 %)`, v.chf(a.amount)]),
            ...(sal.allowances.length ? [['Total pro Jahr', v.chf(sal.total)]] : []),
            [`Monatslohn (${sal.payments} Auszahlungen)`, v.chf(sal.monthly)],
            [`Monatslohn bei ${sal.payments === 12 ? 13 : 12} Auszahlungen`, v.chf(sal.monthlyOther)]
        ] : [];
        return `<section class="r-page">
            ${headHtml(v, 'Lohnblatt')}
            <table class="r-facts">${facts.map(([k, x]) => `<tr><th>${esc(k)}</th><td>${esc(x)}</td></tr>`).join('')}</table>
            <h2 class="r-h2">Einreihung</h2>
            <table class="r-facts">
                <tr><th>Anrechenbare Erfahrung</th><td>${fmt(r.creditedYears)} Jahre (total ${fmt(r.totalYears)} J., davon ${fmt(r.targetYears)} J. im Zielberuf)</td></tr>
                <tr><th>Lohnklasse / Stufe</th><td><b>${pl ? pl.fixed ? 'fixer Lohn gemäss Funktion' : `Lohnklasse ${pl.cls}, Stufe ${pl.stage}` : '–'}</b></td></tr>
                <tr><th>Begründung</th><td>${esc(v.placementWhy)}</td></tr>
                ${v.adjustmentText ? `<tr><th>Korrektur</th><td>${esc(v.adjustmentText)}</td></tr>` : ''}
                ${v.openCorrections.length ? `<tr><th>Offene Vorschläge</th><td>${esc(v.openCorrections.join('; '))}</td></tr>` : ''}
                ${v.salaryTableText ? `<tr><th>Gehaltstabelle</th><td>${esc(v.salaryTableText)}</td></tr>` : ''}
            </table>
            <h2 class="r-h2">Lohn</h2>
            <table class="r-table r-amounts"><tbody>${amounts.map(([k, x], i) => `<tr class="${/^Total|^Monatslohn \(/.test(k) ? 'r-strong' : ''}"><td>${esc(k)}</td><td class="num">${esc(x)}</td></tr>`).join('') || '<tr><td>Kein Lohn berechnet (keine Gehaltstabelle)</td><td></td></tr>'}</tbody></table>
            ${v.outlook.length ? `<h2 class="r-h2">Lohnentwicklung (ohne Teuerung)</h2>
            <table class="r-table"><thead><tr><th>Jahr</th><th class="num">Erfahrungsjahre</th><th class="num">Lohnklasse</th><th class="num">Stufe</th><th class="num">Jahreslohn</th><th class="num">Monatslohn</th></tr></thead>
                <tbody>${v.outlook.map(x => `<tr><td>${x.year}</td><td class="num">${x.years}</td><td class="num">${x.cls}</td><td class="num">${x.stage}</td><td class="num">${x.amount ? esc(v.chf(x.amount)) : '–'}</td><td class="num">${x.monthly ? esc(v.chf(x.monthly)) : '–'}</td></tr>`).join('')}</tbody></table>` : ''}
            <p class="r-note">${esc(v.settingsText)}. Die Einreihung ist ein Vorschlag nach dem Besoldungsreglement und muss von der zuständigen Stelle bestätigt werden.</p>
            ${signHtml(v)}
            ${footHtml(v, 'Lohnblatt')}
        </section>`;
    }

    function printPages(html) {
        let area = document.getElementById('printArea');
        if (!area) {
            area = document.createElement('div');
            area.id = 'printArea';
            document.body.appendChild(area);
        }
        area.innerHTML = html;
        document.body.classList.add('printing');
        const done = () => { document.body.classList.remove('printing'); area.innerHTML = ''; window.removeEventListener('afterprint', done); };
        window.addEventListener('afterprint', done);
        window.print();
    }
    const printSalarySheet = v => printPages(salaryPage(v));

    /** Druckt einen Bericht pro Person (views = Array von buildView-Ergebnissen). */
    function print(views) { printPages(views.map(page).join('')); }

    root.CVReport = { print, page, printSalarySheet, salaryPage, printPages };

})(typeof self !== 'undefined' ? self : this);
