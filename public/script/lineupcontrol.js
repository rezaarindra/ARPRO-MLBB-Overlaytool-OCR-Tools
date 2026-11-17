/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// lineupcontrol.js — tombol Start / Hide untuk lineupdisplay.html (di control panel)

(function () {
    const buttons = document.querySelectorAll('[data-lineup-mode]');
    const COLORS = { show: '#00ff8c', hide: '#ff2828' };

    function mark(mode) {
        buttons.forEach(btn => {
            const active = btn.dataset.lineupMode === mode;
            btn.style.borderColor = active ? COLORS[mode] : '';
            btn.style.color = active ? COLORS[mode] : '';
            btn.style.boxShadow = active ? `0 0 10px ${COLORS[mode]}66` : '';
        });
    }

    async function setMode(mode) {
        try {
            const res = await fetch('/api/lineup-control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode })
            });
            const data = await res.json();
            mark(data.mode);
        } catch (e) {
            console.error('Gagal mengubah mode lineup:', e);
        }
    }

    buttons.forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.lineupMode)));

    // Statistik lineup (panel di antara dua baris, sama dengan tombol di area putih lineupdisplay.html)
    const statBtns = document.querySelectorAll('[data-lineup-stats]');
    const msg = document.getElementById('lineupStatsMsg');
    const msgHtml = msg ? msg.innerHTML : '';
    function markStats(on) {
        statBtns.forEach(btn => {
            const active = (btn.dataset.lineupStats === '1') === !!on;
            btn.style.borderColor = active ? COLORS[on ? 'show' : 'hide'] : '';
            btn.style.color = active ? COLORS[on ? 'show' : 'hide'] : '';
        });
    }
    statBtns.forEach(btn => btn.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/lineup-control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stats: btn.dataset.lineupStats === '1' }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Gagal');
            mark(data.mode); markStats(data.stats);
            if (msg) msg.innerHTML = msgHtml;
        } catch (e) {
            if (msg) { msg.textContent = e.message; setTimeout(() => { msg.innerHTML = msgHtml; }, 4000); }
        }
    }));
    // ikut berubah bila ditekan dari lineupdisplay.html / Stream Deck
    (function listen() {
        const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
        ws.onmessage = (ev) => { try { const m = JSON.parse(ev.data); if (m.type === 'lineup_control') { mark(m.mode); markStats(m.stats); } } catch (e) {} };
        ws.onclose = () => setTimeout(listen, 3000);
    })();

    fetch('/api/lineup-control').then(r => r.json()).then(d => { mark(d.mode); markStats(d.stats); }).catch(() => {});
})();

// Format seri (BO): skor overlay draft tampil sebagai garis kemenangan, chip "BO3" di layar lineup
(function () {
    const select = document.getElementById('boSelect');
    if (!select) return;
    fetch('/api/match-format').then(r => r.json()).then(d => { select.value = String(d.bo); }).catch(() => {});
    select.addEventListener('change', () => {
        fetch('/api/match-format', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bo: parseInt(select.value, 10) }) })
            .catch(e => console.error('Gagal mengubah format seri:', e));
    });
})();
