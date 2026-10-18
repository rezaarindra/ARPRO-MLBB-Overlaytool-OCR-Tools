/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// tournament-common.js — helper bersama overlay turnamen: posisi lewat URL, data, gambar hero/pemain, WebSocket.
window.T = (() => {
    const q = new URLSearchParams(location.search);
    const heroMap = {};
    const strip = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    // ?x=960&y=540 (posisi tengah panel), &scale=0.9, &bg=green|dark
    function place(el) {
        if (q.get('bg')) document.body.classList.add('bg-' + q.get('bg'));
        if (q.get('x')) el.style.setProperty('--x', parseFloat(q.get('x')) + 'px');
        if (q.get('y')) el.style.setProperty('--y', parseFloat(q.get('y')) + 'px');
        if (q.get('scale')) el.style.setProperty('--s', parseFloat(q.get('scale')));
    }

    async function get(url) { return (await fetch(url, { cache: 'no-store' })).json(); }

    // nama hero ↔ file kadang beda ejaan (Arlott → arlot.png): cocokkan juga tanpa huruf ganda
    const loose = (s) => strip(s).replace(/(.)\1+/g, '$1');
    async function loadHeroes() {
        try {
            (await get('/database/herolist.json')).forEach(h => {
                const file = String(h.img || '').split('/').pop().replace(/\.[a-z]+$/i, '');
                for (const k of [strip(h.name), loose(h.name), strip(file), loose(file)]) if (k && !heroMap[k]) heroMap[k] = h.img;
            });
        } catch (e) {}
    }
    const heroImg = (name) => heroMap[strip(name)] || heroMap[loose(name)] || `/Assets/HeroPick/${encodeURIComponent(String(name || '').toLowerCase())}.png`;
    const playerImg = (name) => `/Assets/player/${encodeURIComponent(String(name || '').trim())}.png`;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const pct = (v) => Math.round((v || 0) * 100) + '%';
    const fmtTime = (s) => s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '-';

    // muat langsung saat halaman dibuka, lalu muat ulang saat data turnamen / match berubah (WebSocket)
    function live(load, types = ['tournament_update', 'matchdata_update']) {
        let timer = null;
        const safeLoad = () => Promise.resolve().then(load).catch(e => console.error('load:', e));
        const run = () => { clearTimeout(timer); timer = setTimeout(safeLoad, 150); };
        const connect = () => {
            const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
            ws.onopen = run;
            ws.onmessage = (ev) => { try { if (types.includes(JSON.parse(ev.data).type)) run(); } catch (e) {} };
            ws.onclose = () => setTimeout(connect, 2000);
        };
        loadHeroes().then(safeLoad);
        connect();
    }

    return { q, place, get, heroImg, playerImg, esc, pct, fmtTime, live };
})();
