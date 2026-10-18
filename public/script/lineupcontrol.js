/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// lineupcontrol.js — tombol Auto / Show / Hide untuk lineupdisplay.html (di control panel)

(function () {
    const buttons = document.querySelectorAll('[data-lineup-mode]');
    const COLORS = { auto: '#a855f7', show: '#00ff8c', hide: '#ff2828' };

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

    fetch('/api/lineup-control').then(r => r.json()).then(d => mark(d.mode)).catch(() => {});
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
