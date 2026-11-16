/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// lineupstats.js — pengaturan Statistik Lineup: pratinjau draft, bobot Line Up Rating, koreksi nilai per hero, perbarui data.
(function () {
    const $ = (id) => document.getElementById(id);
    const KEYS = ['early', 'late', 'damage', 'survivability', 'control', 'push'];
    const WKEYS = ['early', 'late', 'damage', 'survivability', 'control', 'push', 'synergy', 'counter'];
    const WLABEL = { early: 'Early–Mid', late: 'Late game', damage: 'Damage', survivability: 'Survivability', control: 'Control', push: 'Objective & Push', synergy: 'Team synergy', counter: 'Counter index' };
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const post = async (url, body) => {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out.message || 'Gagal');
        return out;
    };
    const note = (id, text, err) => { const el = $(id); el.textContent = text; el.style.color = err ? 'var(--sc-red)' : 'var(--sc-green)'; clearTimeout(el._t); el._t = setTimeout(() => { el.textContent = ''; }, 4000); };
    let settings = null;

    // ---------- Pratinjau draft ----------
    async function loadPreview() {
        try {
            const d = await (await fetch('/api/lineup-stats', { cache: 'no-store' })).json();
            const box = $('lsPreview');
            if (!d.blue.heroes.length && !d.red.heroes.length) { box.textContent = 'Belum ada hero terpilih di draft.'; return; }
            const v = (x) => (Math.round(x * 100) / 100).toFixed(2);
            const rows = d.keys.map(k => {
                const a = d.blue.stats[k], b = d.red.stats[k];
                return `<span class="v ${a > b ? 'lead' : ''}">${v(a)}</span><span class="k">${esc(d.labels[k])}</span><span class="v r ${b > a ? 'lead' : ''}">${v(b)}</span>`;
            }).join('');
            const sg = (x) => (x > 0 ? '+' : '') + x.toFixed(1);
            box.innerHTML = `<div class="ls-prev">
                <span class="t">BIRU</span><span></span><span class="t r">MERAH</span>
                <span class="heroes">${esc(d.blue.heroes.map(h => h.name).join(', ') || '—')}</span><span></span><span class="heroes r">${esc(d.red.heroes.map(h => h.name).join(', ') || '—')}</span>
                ${rows}
                <span class="v">${sg(d.blue.counter)}</span><span class="k">COUNTER INDEX</span><span class="v r">${sg(d.red.counter)}</span>
                <span class="v ${d.blue.rating > d.red.rating ? 'lead' : ''}">${d.blue.rating.toFixed(1)}</span><span class="k">LINE UP RATING</span><span class="v r ${d.red.rating > d.blue.rating ? 'lead' : ''}">${d.red.rating.toFixed(1)}</span>
            </div>
            ${d.ready ? '' : '<p class="sc-muted">Draft belum lengkap: statistik baru bisa ditampilkan setelah 10 hero terpilih.</p>'}
            ${d.unknown.length ? `<p class="sc-muted">Hero tanpa data (dihitung 5): ${esc(d.unknown.join(', '))}</p>` : ''}`;
        } catch (e) { $('lsPreview').textContent = 'Server tidak merespons.'; }
    }

    // ---------- Bobot ----------
    function renderWeights() {
        $('lsWeights').innerHTML = WKEYS.map(k => `<label>${WLABEL[k]}<input type="number" min="0" max="5" step="0.1" data-w="${k}" value="${settings.weights[k]}"></label>`).join('');
    }
    $('lsSaveWeights').addEventListener('click', async () => {
        const weights = {};
        document.querySelectorAll('[data-w]').forEach(i => { weights[i.dataset.w] = i.value; });
        try { const out = await post('/api/lineup-stats/settings', { weights }); settings.weights = out.weights; note('lsWeightMsg', 'Tersimpan'); loadPreview(); }
        catch (e) { note('lsWeightMsg', e.message, true); }
    });
    $('lsResetWeights').addEventListener('click', async () => {
        try { const out = await post('/api/lineup-stats/settings', { resetWeights: true }); settings.weights = out.weights; renderWeights(); note('lsWeightMsg', 'Bobot bawaan dipakai'); loadPreview(); }
        catch (e) { note('lsWeightMsg', e.message, true); }
    });

    // ---------- Tabel hero ----------
    function renderRows() {
        const q = $('lsSearch').value.trim().toLowerCase(), only = $('lsOnlyEdited').checked;
        const list = settings.heroes.filter(h => (!q || h.name.toLowerCase().includes(q)) && (!only || h.override));
        $('lsRows').innerHTML = list.map(h => {
            const cells = KEYS.map(k => {
                const base = h.base ? (Math.round(h.base[k] * 10) / 10) : '';
                const val = h.override && h.override[k] != null ? h.override[k] : '';
                return `<td><input type="number" min="1" max="10" step="0.1" data-hero="${esc(h.name)}" data-k="${k}" value="${val}" placeholder="${base}" class="${val !== '' ? 'edited' : ''}" title="Otomatis: ${base || '5 (tanpa data)'}"></td>`;
            }).join('');
            const data = h.inData ? '<span class="sc-pill ok">ACADEMY</span>' : h.base ? '<span class="sc-pill warn">SEBAGIAN</span>' : '<span class="sc-pill bad">TANPA DATA</span>';
            return `<tr><td class="ls-name">${esc(h.name)}</td><td>${data}</td>${cells}<td>${h.override ? `<button class="sc-btn" data-reset="${esc(h.name)}" style="padding:4px 10px;font-size:12px">Reset</button>` : ''}</td></tr>`;
        }).join('') || '<tr><td colspan="9" class="sc-muted">Tidak ada hero.</td></tr>';
    }
    const timers = {};
    function saveHero(name) {
        clearTimeout(timers[name]);
        timers[name] = setTimeout(async () => {
            const override = {};
            document.querySelectorAll(`#lsRows input[data-hero="${CSS.escape(name)}"]`).forEach(i => { if (i.value !== '') override[i.dataset.k] = i.value; });
            try {
                await post('/api/lineup-stats/settings', { hero: name, override });
                const h = settings.heroes.find(x => x.name === name);
                if (h) h.override = Object.keys(override).length ? Object.fromEntries(Object.entries(override).map(([k, v]) => [k, +v])) : null;
                loadPreview();
            } catch (e) { alert(e.message); }
        }, 500);
    }
    $('lsRows').addEventListener('input', (e) => {
        const i = e.target.closest('input[data-hero]');
        if (!i) return;
        i.classList.toggle('edited', i.value !== '');
        saveHero(i.dataset.hero);
    });
    $('lsRows').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-reset]');
        if (!b) return;
        try {
            await post('/api/lineup-stats/settings', { hero: b.dataset.reset, override: {} });
            const h = settings.heroes.find(x => x.name === b.dataset.reset);
            if (h) h.override = null;
            renderRows(); loadPreview();
        } catch (err) { alert(err.message); }
    });
    $('lsSearch').addEventListener('input', renderRows);
    $('lsOnlyEdited').addEventListener('change', renderRows);

    // ---------- Tampilkan statistik ----------
    async function lineupStats(on) {
        try { await post('/api/lineup-control', { stats: on }); note('lsShowMsg', on ? 'Statistik tampil' : 'Statistik disembunyikan'); }
        catch (e) { note('lsShowMsg', e.message, true); }
    }
    $('lsShow').addEventListener('click', () => lineupStats(true));
    $('lsHide').addEventListener('click', () => lineupStats(false));

    // ---------- Perbarui data ----------
    function dataInfo() {
        const n = settings.heroes.filter(h => h.inData).length;
        $('lsDataInfo').textContent = settings.dataBuiltAt
            ? `Sumber: ${settings.dataSource} · diperbarui ${new Date(settings.dataBuiltAt).toLocaleString('id-ID')} · ${n} dari ${settings.heroes.length} hero punya data Academy.`
            : 'Data hero belum ada. Klik PERBARUI DATA HERO (butuh internet).';
    }
    async function pollRebuild() {
        try {
            const s = await (await fetch('/api/lineup-stats/rebuild', { cache: 'no-store' })).json();
            const last = (s.log || '').trim().split('\n').pop() || '';
            $('lsRebuild').disabled = s.running;
            if (s.running) { $('lsRebuildMsg').textContent = `Sedang memperbarui… ${last}`; setTimeout(pollRebuild, 2000); }
            else if (s.finishedAt) { $('lsRebuildMsg').textContent = s.ok ? 'Selesai, data hero diperbarui.' : `Gagal: ${last}`; if (s.ok) init(); }
        } catch (e) { setTimeout(pollRebuild, 4000); }
    }
    $('lsRebuild').addEventListener('click', async () => {
        if (!confirm('Perbarui data hero dari MLBB Academy? Butuh internet, sekitar 5 menit.')) return;
        try { await post('/api/lineup-stats/rebuild', {}); pollRebuild(); } catch (e) { $('lsRebuildMsg').textContent = e.message; }
    });

    async function init() {
        settings = await (await fetch('/api/lineup-stats/settings', { cache: 'no-store' })).json();
        renderWeights(); renderRows(); dataInfo(); loadPreview();
    }
    (function listen() {
        const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
        ws.onmessage = (ev) => { try { const m = JSON.parse(ev.data); if (m.type === 'draftdata_update' || m.type === 'lineup_stats_update') loadPreview(); } catch (e) {} };
        ws.onclose = () => setTimeout(listen, 3000);
    })();
    init().catch(() => { $('lsPreview').textContent = 'Server tidak merespons.'; });
    pollRebuild();
})();
