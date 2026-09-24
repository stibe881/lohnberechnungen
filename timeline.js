/* ============================================
   Lebenslauf-Rechner — Zeitstrahl (SVG)
   Eine Zeile pro Stelle, Balkenfarbe nach Anrechnungsfaktor, Lücken schraffiert.
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

    const LEGEND = [
        { tier: 3, label: 'voll angerechnet (100 %)' },
        { tier: 2, label: 'teilweise (75–99 %)' },
        { tier: 1, label: 'teilweise (unter 75 %)' },
        { tier: 0, label: 'nicht angerechnet' }
    ];

    /**
     * @param {object} o
     * @param {Array}  o.entries    Einträge der Person
     * @param {Array}  o.perEntry   Ergebnis von CVParser.compute(...).perEntry
     * @param {Function} o.catName  Kategorie-ID -> Name
     * @param {number} [o.minAgeMonth]  Monat, ab dem angerechnet wird (Mindestalter)
     * @param {Date}   [o.today]
     * @returns {string} SVG + Legende als HTML, '' wenn keine gültigen Einträge
     */
    function render(o) {
        const today = o.today || new Date();
        const nowIdx = today.getFullYear() * 12 + today.getMonth();
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

        let svg = `<svg class="timeline" viewBox="0 0 ${W} ${H}" role="img" aria-label="Zeitstrahl der Stellen">`;
        svg += `<defs><pattern id="tl-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" class="tl-gap-bg"/><line x1="0" y1="0" x2="0" y2="6" class="tl-gap-line"/></pattern></defs>`;

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
            svg += `<rect x="${X(r.s)}" y="${y + (rowH - barH) / 2}" width="${w}" height="${barH}" rx="3" class="tl-bar tl-f${r.t}" data-tip="${esc(tip)}" tabindex="0" aria-label="${esc(tip)}"/>`;
        });
        svg += `<line x1="${labelW}" x2="${W - padR}" y1="${H - axisH}" y2="${H - axisH}" class="tl-baseline"/>`;
        svg += '</svg>';

        const used = new Set(rows.map(r => r.t));
        const legend = LEGEND.filter(l => used.has(l.tier))
            .map(l => `<span class="tl-key"><svg width="14" height="10" aria-hidden="true"><rect width="14" height="10" rx="2" class="tl-bar tl-f${l.tier}"/></svg>${l.label}</span>`);
        if (gaps.length) legend.push(`<span class="tl-key"><svg width="14" height="10" aria-hidden="true"><rect width="14" height="10" class="tl-gap-bg"/><path d="M0 10 L10 0 M4 10 L14 0 M-4 6 L2 0" class="tl-gap-line"/></svg>Lücke (ab 3 Monaten)</span>`);
        return `<div class="timeline-wrap">${svg}</div><div class="tl-legend">${legend.join('')}</div>`;
    }

    root.CVTimeline = { render };
})(typeof self !== 'undefined' ? self : this);
