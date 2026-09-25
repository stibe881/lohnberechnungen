/* ============================================
   Lebenslauf-Rechner — Zeitstrahl (SVG)
   Eine Zeile pro Stelle, Balkenfarbe nach Beruf (Kategorie), teilweise angerechnete Zeiten
   halbtransparent, nicht angerechnete grau schraffiert, Lücken im Lebenslauf schraffiert.
   Stellt window.CVTimeline bereit.
   ============================================ */
(function (root) {
    'use strict';

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const idx = s => { const m = /^(\d{4})-(\d{2})$/.exec(s || ''); return m ? +m[1] * 12 + (+m[2] - 1) : null; };
    const ym = i => String((i % 12) + 1).padStart(2, '0') + '.' + Math.floor(i / 12);

    /** Stufe für die Farbe: 3 = voll, 2 = ≥ 75 %, 1 = > 0 %, 0 = nicht angerechnet */
    function tier(include, factor) {
        if (!include || factor <= 0) return 0;
        if (factor >= 100) return 3;
        if (factor >= 75) return 2;
        return 1;
    }

    const N_COLORS = 12; // Farben .tl-cat-0 … .tl-cat-11 in app.css
    /** Farbklasse je Beruf: feste Reihenfolge nach erstem Auftreten, damit gleiche Berufe gleich gefärbt sind. */
    function colorMap(rows) {
        const map = new Map();
        rows.forEach(r => { if (!map.has(r.e.category)) map.set(r.e.category, map.size % N_COLORS); });
        return map;
    }
    /** Klassen eines Balkens: Farbe nach Beruf, halbtransparent bei Teil-Anrechnung, schraffiert wenn nicht angerechnet. */
    const barClass = (r, colors) => r.t === 0 ? 'tl-bar tl-off-bar' : `tl-bar tl-cat-${colors.get(r.e.category)}${r.t < 3 ? ' tl-part' : ''}`;

    /**
     * @param {object} o
     * @param {Array}  o.entries    Einträge der Person
     * @param {Array}  o.perEntry   Ergebnis von CVParser.compute(...).perEntry
     * @param {Function} o.catName  Kategorie-ID -> Name
     * @param {number} [o.minAgeMonth]  Monat, ab dem angerechnet wird (Mindestalter)
     * @param {number} [o.endMonth]  letzter gezählter Monat (Stichtag), Standard: aktueller Monat
     * @param {Date}   [o.today]
     * @returns {string} SVG + Legende als HTML, '' wenn keine gültigen Einträge
     */
    function render(o) {
        const today = o.today || new Date();
        const nowIdx = o.endMonth ?? (today.getFullYear() * 12 + today.getMonth());
        const rows = [];
        o.entries.forEach((e, i) => {
            const s = idx(e.start);
            let en = e.ongoing ? nowIdx : idx(e.end);
            if (s === null || en === null) return;
            en = Math.min(en, nowIdx);
            if (en < s) return;
            const pe = o.perEntry[i];
            rows.push({ e, s, en, factor: pe.factor, credited: pe.credited, t: tier(e.include, pe.factor) });
        });
        if (!rows.length) return '';
        rows.sort((a, b) => a.s - b.s || a.en - b.en);

        const first = Math.min(...rows.map(r => r.s));
        const startYear = Math.floor(first / 12);
        const x0 = startYear * 12, x1 = nowIdx + 1;

        // Lücken: Monate, in denen im Lebenslauf nichts steht (ab 3 Monaten); auch Ausbildung gilt als belegt
        const covered = new Set();
        rows.forEach(r => { for (let k = r.s; k <= r.en; k++) covered.add(k); });
        const gaps = [];
        for (let k = first, g = null; k <= nowIdx + 1; k++) {
            const free = k <= nowIdx && !covered.has(k);
            if (free && g === null) g = k;
            if (!free && g !== null) { if (k - g >= 3) gaps.push([g, k - 1]); g = null; }
        }

        const W = 1000, labelW = 260, padR = 16, rowH = 26, barH = 14, top = 8, axisH = 26;
        const plotW = W - labelW - padR;
        const H = top + rows.length * rowH + axisH;
        const X = m => labelW + ((m - x0) / (x1 - x0)) * plotW;

        const colors = colorMap(rows);
        let svg = `<svg class="timeline" viewBox="0 0 ${W} ${H}" role="img" aria-label="Zeitstrahl der Stellen">`;
        svg += `<defs><pattern id="tl-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" class="tl-gap-bg"/><line x1="0" y1="0" x2="0" y2="6" class="tl-gap-line"/></pattern>`
            + `<pattern id="tl-offhatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="5" height="5" class="tl-off-bg"/><line x1="0" y1="0" x2="0" y2="5" class="tl-off-line"/></pattern></defs>`;

        // Jahres-Raster
        const years = Math.ceil(x1 / 12) - startYear;
        const step = years > 30 ? 5 : years > 14 ? 2 : 1;
        for (let y = startYear; y * 12 <= x1; y += step) {
            const x = X(y * 12);
            svg += `<line x1="${x}" x2="${x}" y1="${top}" y2="${H - axisH}" class="tl-grid"/>`;
            svg += `<text x="${x}" y="${H - 8}" class="tl-axis" text-anchor="middle">${y}</text>`;
        }

        // Lücken
        gaps.forEach(([a, b]) => {
            const months = b - a + 1;
            svg += `<rect x="${X(a)}" y="${top}" width="${Math.max(2, X(b + 1) - X(a))}" height="${rows.length * rowH}" fill="url(#tl-hatch)" data-tip="${esc(`Lücke: ${ym(a)} – ${ym(b)} (${months} Monate)`)}"/>`;
        });

        // Mindestalter
        if (o.minAgeMonth !== null && o.minAgeMonth !== undefined && o.minAgeMonth > x0 && o.minAgeMonth < x1) {
            const x = X(o.minAgeMonth);
            svg += `<line x1="${x}" x2="${x}" y1="${top}" y2="${H - axisH}" class="tl-minage"/>`;
            svg += `<text x="${x + 4}" y="${top + 10}" class="tl-minage-label">Mindestalter</text>`;
        }

        // Balken
        rows.forEach((r, n) => {
            const y = top + n * rowH;
            const title = r.e.title.length > 34 ? r.e.title.slice(0, 33) + '…' : r.e.title;
            const w = Math.max(3, X(r.en + 1) - X(r.s));
            const tip = `${r.e.title} · ${o.catName(r.e.category)} · ${ym(r.s)} – ${r.e.ongoing ? 'heute' : ym(r.en)} · ` +
                (r.e.include ? `Faktor ${r.factor} % · angerechnet ${(Math.round(r.credited / 12 * 10) / 10).toFixed(1)} J.` : 'nicht angerechnet');
            svg += `<text x="${labelW - 10}" y="${y + rowH / 2 + 4}" class="tl-label${r.t === 0 ? ' tl-off' : ''}" text-anchor="end">${esc(title)}</text>`;
            svg += `<rect x="${X(r.s)}" y="${y + (rowH - barH) / 2}" width="${w}" height="${barH}" rx="3" class="${barClass(r, colors)}" data-tip="${esc(tip)}" tabindex="0" aria-label="${esc(tip)}"/>`;
        });
        svg += `<line x1="${labelW}" x2="${W - padR}" y1="${H - axisH}" y2="${H - axisH}" class="tl-baseline"/>`;
        svg += '</svg>';

        // Legende: ein Eintrag pro Beruf (nur angerechnete), dazu «teilweise», «nicht angerechnet» und Lücken
        const key = (cls, label, extra) => `<span class="tl-key"><svg width="14" height="10" aria-hidden="true">${extra || ''}<rect width="14" height="10" rx="2" class="${cls}"/></svg>${esc(label)}</span>`;
        const legend = [];
        const seen = new Set();
        rows.filter(r => r.t > 0).forEach(r => {
            if (seen.has(r.e.category)) return;
            seen.add(r.e.category);
            legend.push(key(`tl-bar tl-cat-${colors.get(r.e.category)}`, o.catName(r.e.category)));
        });
        if (rows.some(r => r.t > 0 && r.t < 3)) legend.push(key('tl-bar tl-cat-0 tl-part', 'heller = teilweise angerechnet'));
        if (rows.some(r => r.t === 0)) legend.push(`<span class="tl-key"><svg width="14" height="10" aria-hidden="true"><rect width="14" height="10" class="tl-off-bg"/><path d="M0 0 L10 10 M4 0 L14 10 M-4 4 L2 10" class="tl-off-line"/><rect width="14" height="10" rx="2" fill="none" class="tl-off-bar" style="fill:none"/></svg>nicht angerechnet</span>`);
        if (gaps.length) legend.push(`<span class="tl-key"><svg width="14" height="10" aria-hidden="true"><rect width="14" height="10" class="tl-gap-bg"/><path d="M0 10 L10 0 M4 10 L14 0 M-4 6 L2 0" class="tl-gap-line"/></svg>Lücke im Lebenslauf (ab 3 Monaten)</span>`);
        return `<div class="timeline-wrap">${svg}</div><div class="tl-legend">${legend.join('')}</div>`;

    }

    root.CVTimeline = { render };
})(typeof self !== 'undefined' ? self : this);
