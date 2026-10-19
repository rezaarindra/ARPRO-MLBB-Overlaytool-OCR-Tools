/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// ocrauto.js — panel "5 · OTOMASI & GOLD" di OCR Control: status gold/objektif, saran multikill, pengaturan notifikasi otomatis.
// Logika deteksi ada di server (/api/ocr/game, /api/ocr/auto), halaman ini hanya menampilkan & mengatur.
(() => {
    const $ = (id) => document.getElementById(id);
    const CHECKS = { oaFirstBlood: 'autoFirstBlood', oaLord: 'autoLordSlain', oaSpawn: 'autoObjectiveSpawn', oaHint: 'multikillHints', oaPlayerGold: 'fillPlayerGold' };
    const FIELDS = { oaTurtleFirst: 'turtleFirst', oaTurtleRespawn: 'turtleRespawn', oaLordFirst: 'lordFirst', oaLordRespawn: 'lordRespawn', oaWarn: 'warnBefore', oaWindow: 'multikillWindow' };
    const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const fmtK = (v) => (v / 1000).toFixed(1) + 'K';
    const dismissed = new Set();
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    // saran multikill → notifikasi pemain (Player Notification): operator memilih pemain tim tersebut
    const EVENT = { 2: [['double_kill', 'DOUBLE KILL']], 3: [['triple_kill', 'TRIPLE KILL']], 4: [['maniac', 'MANIAC']], 5: [['savage', 'SAVAGE'], ['wipe_out', 'WIPE OUT']] };
    // tombol VIDEO = video yang sama persis dengan tombol KILL STREAK di panel VIDEO NOTIFICATION (notifcontrol.html)
    const VIDEO = { 2: [['videoPlayer8', 'VIDEO']], 3: [['videoPlayer9', 'VIDEO']], 4: [['videoPlayer10', 'VIDEO']], 5: [['videoPlayer11', 'VIDEO SAVAGE'], ['videoPlayer12', 'VIDEO WIPE OUT']] };
    const dismiss = (id) => fetch('/api/ocr/hint/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => {});
    let autoSeen = null;  // saklar diubah dari halaman lain (Notif Control) → centang di sini ikut berubah
    let picking = null;   // { id, side: 'blue'|'red', event, title }
    let roster = null;    // daftar pemain dari /api/eventnotif/players
    let lastData = null;

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
        if (d.auto) {
            const key = JSON.stringify(d.auto);
            if (autoSeen !== null && key !== autoSeen) for (const [id, k] of Object.entries(CHECKS)) if (k in d.auto) $(id).checked = !!d.auto[k];
            autoSeen = key;
        }
        const lines = [];
        if (d.gold) {
            const lead = d.lead, who = Math.abs(lead) < 100 ? 'IMBANG' : `${lead > 0 ? 'BIRU' : 'MERAH'} unggul ${fmtK(Math.abs(lead))}`;
            lines.push(`Gold  ${fmtK(d.gold.g1)} : ${fmtK(d.gold.g2)}  → ${who}`);
        } else lines.push('Gold  belum terbaca');
        for (const o of d.objectives || []) lines.push(`${o.label.padEnd(7)}${o.alive ? 'SUDAH MUNCUL' : 'muncul ' + fmtTime(o.spawn) + '  (' + fmtTime(o.remain) + ' lagi)'}`);
        if (d.t != null) lines.push(`Waktu game  ${fmtTime(d.t)}${d.live ? '' : '  · OCR BERHENTI'}`);
        $('oaStatus').textContent = lines.join('\n');

        lastData = d;
        const hints = (d.hints || []).filter(h => !dismissed.has(h.id));
        if (picking && !hints.some(h => h.id === picking.id)) picking = null;
        $('oaHints').innerHTML = hints.map(h => {
            const side = h.side === 1 ? 'blue' : 'red';
            const team = roster && roster.teams[side];
            const pick = picking && picking.id === h.id && team
                ? `<div class="oa-pick">${esc(picking.title)} · pilih pemain:${team.players.map(p => `<button data-pick="${p.slot}" data-id="${h.id}" ${p.nickname ? '' : 'disabled'}>${esc(p.nickname || 'kosong')}</button>`).join('')}</div>` : '';
            return `<div class="oa-hint ${side}">
                <span>${h.side === 1 ? 'BIRU' : 'MERAH'} · ${h.count} kill beruntun → ${h.label}?</span>
                ${(EVENT[h.count] || []).map(([ev, title]) => `<button class="primary" data-player="${ev}" data-title="${title}" data-side="${side}" data-id="${h.id}" title="Notifikasi pemain: foto, hero & logo tim">${EVENT[h.count].length > 1 ? title : 'PEMAIN'}</button>`).join('')}
                ${(VIDEO[h.count] || [[h.videoId, 'VIDEO']]).map(([v, t]) => `<button data-play="${v}" data-id="${h.id}" title="Video saja tanpa data pemain (sama dengan panel Video Notification)">${t}</button>`).join('')}
                <button data-id="${h.id}">✕</button>
                ${pick}
            </div>`;
        }).join('');

        $('oaLog').textContent = (d.log || []).slice(0, 5)
            .map(l => `${new Date(l.at).toLocaleTimeString('id-ID', { hour12: false })}  otomatis: ${l.text}`).join('\n');
    }

    $('oaHints').addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b || b.disabled) return;
        if (b.dataset.player) {
            picking = { id: b.dataset.id, side: b.dataset.side, event: b.dataset.player, title: b.dataset.title };
            try { roster = await (await fetch('/api/eventnotif/players', { cache: 'no-store' })).json(); } catch (err) { roster = null; }
            render(lastData);
            return;
        }
        if (b.dataset.pick != null && picking) {
            const body = { event: picking.event, side: picking.side, slot: +b.dataset.pick };
            dismissed.add(b.dataset.id);
            dismiss(b.dataset.id);
            picking = null;
            b.closest('.oa-hint').remove();
            const res = await fetch('/api/eventnotif', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) alert((await res.json().catch(() => ({}))).message || 'Gagal mengirim notifikasi');
            return;
        }
        dismissed.add(b.dataset.id);
        dismiss(b.dataset.id);
        if (picking && picking.id === b.dataset.id) picking = null;
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
