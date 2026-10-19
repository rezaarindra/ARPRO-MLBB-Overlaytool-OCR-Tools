/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// broadcastfx.js — Broadcast Control panel 5 (Efek Draft → /api/draftfx) & 6 (Posisi Splash Hero → /api/herofocus).
(() => {
    const $ = (id) => document.getElementById(id);
    const post = async (url, body) => {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.message || r.statusText);
        return j;
    };
    const say = (id, text, cls = '') => { $(id).textContent = text; $(id).className = 'bc-msg ' + cls; };
    const rgb = (h) => { const n = parseInt(String(h).slice(1), 16); return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`; };

    // ===================== 5 · EFEK DRAFT =====================
    function fxShow(c) {
        $('fxText').value = c.turnText || '';
        $('fxBlue').value = c.blue; $('fxRed').value = c.red;
        $('fxInt').value = c.intensity; $('fxSpeed').value = c.speed; $('fxHold').value = c.splashHold;
        fxPreview();
    }
    function fxPreview() {
        $('fxIntV').textContent = Math.round($('fxInt').value * 100) + '%';
        $('fxSpeedV').textContent = (+$('fxSpeed').value).toFixed(1) + ' s';
        $('fxHoldV').textContent = (+$('fxHold').value).toFixed(1) + ' s';
        for (const [id, color] of [['fxPrevB', $('fxBlue').value], ['fxPrevR', $('fxRed').value]]) {
            const el = $(id);
            el.style.setProperty('--c', rgb(color));
            el.style.setProperty('--a', $('fxInt').value);
            el.style.setProperty('--sp', $('fxSpeed').value + 's');
            el.querySelector('span').textContent = $('fxText').value.trim().toUpperCase();
        }
    }
    let fxTimer = null;
    function fxSave() {
        fxPreview();
        clearTimeout(fxTimer);
        fxTimer = setTimeout(async () => {
            try {
                await post('/api/draftfx', { turnText: $('fxText').value, blue: $('fxBlue').value, red: $('fxRed').value, intensity: +$('fxInt').value, speed: +$('fxSpeed').value, splashHold: +$('fxHold').value });
                say('fxMsg', 'Tersimpan, overlay draft langsung berubah.', 'ok');
            } catch (e) { say('fxMsg', e.message, 'err'); }
        }, 300);
    }
    ['fxText', 'fxBlue', 'fxRed', 'fxInt', 'fxSpeed', 'fxHold'].forEach(id => $(id).addEventListener('input', fxSave));
    $('fxReset').addEventListener('click', async () => {
        try { fxShow((await post('/api/draftfx', { reset: true })).config); say('fxMsg', 'Kembali ke pengaturan bawaan.', 'ok'); } catch (e) { say('fxMsg', e.message, 'err'); }
    });
    fetch('/api/draftfx', { cache: 'no-store' }).then(r => r.json()).then(d => fxShow(d.config)).catch(() => say('fxMsg', 'Gagal memuat pengaturan efek.', 'err'));

    // ===================== 6 · POSISI SPLASH HERO =====================
    const D = HeroAssets.DEFAULT_FOCUS;
    let heroes = [];      // { name, img, key, full }
    let saved = {};       // isi herofocus.json
    let cur = null;       // hero terpilih
    let focus = { ...D };
    const prevs = [...document.querySelectorAll('.sp-prev')];

    function render() {
        $('spZoom').value = focus.zoom; $('spX').value = focus.x; $('spY').value = focus.y;
        $('spZoomV').textContent = (+focus.zoom).toFixed(2) + '×';
        $('spXV').textContent = (+focus.x).toFixed(1) + '%';
        $('spYV').textContent = (+focus.y).toFixed(1) + '%';
        prevs.forEach(p => {
            const img = p.querySelector('img'), W = p.clientWidth, H = p.clientHeight;
            p.querySelector('.sp-name').textContent = cur ? cur.name.toUpperCase() : '';
            p.querySelector('.sp-name').style.fontSize = Math.round(H * 0.405) + 'px';
            if (!img.naturalWidth || !W) return;
            const L = HeroAssets.splashLayout(img.naturalWidth, img.naturalHeight, W, H, focus, p.dataset.side);
            Object.assign(img.style, { left: L.left + 'px', top: L.top + 'px', width: L.width + 'px', height: L.height + 'px' });
        });
    }

    function listDone() {
        const keys = Object.keys(saved);
        $('spDone').innerHTML = keys.length
            ? '<small style="color:var(--muted);font-size:11px;align-self:center">SUDAH DIATUR:</small>' + keys.map(k => { const h = heroes.find(x => x.key === k); return `<button data-k="${k}">${T.esc(h ? h.name : k)}</button>`; }).join('')
            : '<small style="color:var(--muted);font-size:11px">Belum ada hero yang diatur khusus (semua memakai posisi default).</small>';
    }

    function fillSelect() {
        const q = $('spSearch').value.trim().toLowerCase();
        const list = heroes.filter(h => !q || h.name.toLowerCase().includes(q));
        $('spHero').innerHTML = list.map(h => `<option value="${h.key}">${T.esc(h.name)}${saved[h.key] ? ' ✓' : ''}${h.full ? '' : ' (tanpa splash)'}</option>`).join('');
        if (cur && list.some(h => h.key === cur.key)) $('spHero').value = cur.key;
        else if (list[0]) select(list[0].key);
    }

    function select(key) {
        cur = heroes.find(h => h.key === key) || null;
        if (!cur) return;
        $('spHero').value = key;
        focus = { ...D, ...(saved[key] || {}) };
        const src = cur.full || cur.img;
        prevs.forEach(p => { const img = p.querySelector('img'); img.onload = render; img.src = src; });
        say('spMsg', saved[key] ? 'Hero ini memakai posisi khusus.' : 'Hero ini memakai posisi default.');
        render();
    }

    // geser gambar di pratinjau: titik fokus ikut berpindah berlawanan arah seret
    prevs.forEach(p => {
        let drag = null;
        p.addEventListener('pointerdown', (e) => {
            const img = p.querySelector('img');
            if (!img.naturalWidth) return;
            p.setPointerCapture(e.pointerId);
            drag = { x: e.clientX, y: e.clientY, f: { ...focus }, w: parseFloat(img.style.width) || p.clientWidth, h: parseFloat(img.style.height) || p.clientHeight };
        });
        p.addEventListener('pointermove', (e) => {
            if (!drag) return;
            focus.x = Math.max(0, Math.min(100, drag.f.x - (e.clientX - drag.x) / drag.w * 100));
            focus.y = Math.max(0, Math.min(100, drag.f.y - (e.clientY - drag.y) / drag.h * 100));
            render();
        });
        const end = () => { drag = null; };
        p.addEventListener('pointerup', end);
        p.addEventListener('pointercancel', end);
        p.addEventListener('wheel', (e) => {
            e.preventDefault();
            focus.zoom = Math.max(1, Math.min(2.5, +focus.zoom - Math.sign(e.deltaY) * 0.04));
            render();
        }, { passive: false });
    });
    $('spZoom').addEventListener('input', () => { focus.zoom = +$('spZoom').value; render(); });
    $('spX').addEventListener('input', () => { focus.x = +$('spX').value; render(); });
    $('spY').addEventListener('input', () => { focus.y = +$('spY').value; render(); });
    $('spHero').addEventListener('change', () => select($('spHero').value));
    $('spSearch').addEventListener('input', fillSelect);
    $('spDone').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) { $('spSearch').value = ''; fillSelect(); select(b.dataset.k); } });
    $('spSave').addEventListener('click', async () => {
        if (!cur) return;
        try {
            const r = await post('/api/herofocus', { key: cur.key, x: focus.x, y: focus.y, zoom: focus.zoom });
            saved[cur.key] = r.focus;
            fillSelect(); listDone();
            say('spMsg', `Posisi ${cur.name} tersimpan, dipakai pick berikutnya.`, 'ok');
        } catch (e) { say('spMsg', e.message, 'err'); }
    });
    $('spReset').addEventListener('click', async () => {
        if (!cur) return;
        try {
            await post('/api/herofocus', { key: cur.key, reset: true });
            delete saved[cur.key];
            focus = { ...D };
            fillSelect(); listDone(); render();
            say('spMsg', `${cur.name} kembali ke posisi default.`, 'ok');
        } catch (e) { say('spMsg', e.message, 'err'); }
    });
    window.addEventListener('resize', render);

    (async () => {
        await HeroAssets.load();
        try { saved = (await (await fetch('/database/herofocus.json', { cache: 'no-store' })).json()) || {}; } catch (e) { saved = {}; }
        try {
            const list = await (await fetch('/database/herolist.json', { cache: 'no-store' })).json();
            heroes = list.map(h => { const i = HeroAssets.byImg(h.img) || {}; return { name: h.name, img: h.img, key: i.key, full: i.full }; })
                .filter(h => h.key).sort((a, b) => a.name.localeCompare(b.name));
        } catch (e) { heroes = []; }
        fillSelect();
        listDone();
    })();
})();
