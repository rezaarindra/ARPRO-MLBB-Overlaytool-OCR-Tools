/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// ocrauto.js — panel "5 · OTOMASI & GOLD" di OCR Control: status gold/objektif, saran multikill, pengaturan notifikasi otomatis.
// Logika deteksi ada di server (/api/ocr/game, /api/ocr/auto), halaman ini hanya menampilkan & mengatur.
(() => {
    const $ = (id) => document.getElementById(id);
    const CHECKS = { oaFirstBlood: 'autoFirstBlood', oaLord: 'autoLordSlain', oaSpawn: 'autoObjectiveSpawn', oaHint: 'multikillHints' };
    const FIELDS = { oaTurtleFirst: 'turtleFirst', oaTurtleRespawn: 'turtleRespawn', oaLordFirst: 'lordFirst', oaLordRespawn: 'lordRespawn', oaWarn: 'warnBefore', oaWindow: 'multikillWindow' };
    const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const fmtK = (v) => (v / 1000).toFixed(1) + 'K';
    const dismissed = new Set();

    async function loadConfig() {
        try {
            const { config } = await (await fetch('/api/ocr/auto', { cache: 'no-store' })).json();
            for (const [id, k] of Object.entries(CHECKS)) $(id).checked = !!config[k];
            for (const [id, k] of Object.entries(FIELDS)) $(id).value = config[k];
        } catch (e) {}
    }

    async function saveConfig() {
        const body = {};
        for (const [id, k] of Object.entries(CHECKS)) body[k] = $(id).checked;
        for (const [id, k] of Object.entries(FIELDS)) body[k] = $(id).value.trim();
        const btn = $('oaSave');
        try {
            const res = await fetch('/api/ocr/auto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const out = await res.json();
            if (!res.ok) { alert(out.message || 'Gagal menyimpan'); return; }
            btn.textContent = 'TERSIMPAN ✓';
            setTimeout(() => { btn.textContent = 'SIMPAN OTOMASI'; }, 1500);
        } catch (e) { alert('Server tidak merespons'); }
    }

    function render(d) {
        if (!d) return;
        const lines = [];
        if (d.gold) {
            const lead = d.lead, who = Math.abs(lead) < 100 ? 'IMBANG' : `${lead > 0 ? 'BIRU' : 'MERAH'} unggul ${fmtK(Math.abs(lead))}`;
            lines.push(`Gold  ${fmtK(d.gold.g1)} : ${fmtK(d.gold.g2)}  → ${who}`);
        } else lines.push('Gold  belum terbaca');
        for (const o of d.objectives || []) lines.push(`${o.label.padEnd(7)}${o.alive ? 'SUDAH MUNCUL' : 'muncul ' + fmtTime(o.spawn) + '  (' + fmtTime(o.remain) + ' lagi)'}`);
        if (d.t != null) lines.push(`Waktu game  ${fmtTime(d.t)}${d.live ? '' : '  · OCR BERHENTI'}`);
        $('oaStatus').textContent = lines.join('\n');

        $('oaHints').innerHTML = (d.hints || []).filter(h => !dismissed.has(h.id)).map(h => `
            <div class="oa-hint ${h.side === 1 ? 'blue' : 'red'}">
                <span>${h.side === 1 ? 'BIRU' : 'MERAH'} · ${h.count} kill beruntun → ${h.label}?</span>
                <button class="primary" data-play="${h.videoId}" data-id="${h.id}">TAYANG</button>
                <button data-id="${h.id}">✕</button>
            </div>`).join('');

        $('oaLog').textContent = (d.log || []).slice(0, 5)
            .map(l => `${new Date(l.at).toLocaleTimeString('id-ID', { hour12: false })}  otomatis: ${l.text}`).join('\n');
    }

    $('oaHints').addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        dismissed.add(b.dataset.id);
        if (b.dataset.play) await fetch('/api/notification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoId: b.dataset.play }) });
        b.closest('.oa-hint').remove();
    });
    $('oaSave').addEventListener('click', saveConfig);
    $('oaReset').addEventListener('click', async () => {
        if (!confirm('Reset data game (grafik gold, timer objektif, first blood)? Biasanya otomatis saat timer game kembali ke 0.')) return;
        await fetch('/api/ocr/game/reset', { method: 'POST' });
        load();
    });

    async function load() {
        try { render(await (await fetch('/api/ocr/game', { cache: 'no-store' })).json()); } catch (e) {}
    }
    function connect() {
        const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
        ws.onopen = load;
        ws.onmessage = (ev) => {
            const m = JSON.parse(ev.data);
            if (m.type === 'ocr_game') render(m.data);
            else if (m.type === 'ocr_game_reset') load();
        };
        ws.onclose = () => setTimeout(connect, 2000);
    }
    loadConfig();
    connect();
    setInterval(load, 5000);
})();
