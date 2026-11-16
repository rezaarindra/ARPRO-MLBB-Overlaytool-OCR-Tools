/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// ocrpair.js — kartu "6 · OCR OBSERVER" di OCR Control (PC server): IP server, kode pasangan 6 digit, unduh aplikasi,
// dan daftar sumber data OCR yang aktif (PC server / Observer). Di PC lain kartu ini disembunyikan.
(function () {
    const $ = (id) => document.getElementById(id);
    const card = $('ocPairCard');
    if (!card || document.documentElement.classList.contains('oc-observer')) return;
    const fmtAge = (ms) => (ms < 5000 ? 'baru saja' : `${Math.round(ms / 1000)} dtk lalu`);

    async function ip() {
        try { const t = (await (await fetch('/serverip.txt', { cache: 'no-store' })).text()).trim(); if (/^[\d.]+$/.test(t)) return t; } catch (e) {}
        return /^(localhost|127\.)/.test(location.hostname) ? '' : location.hostname;
    }
    async function load() {
        try {
            const res = await fetch('/api/ocr/pair', { cache: 'no-store' });
            if (res.status === 403) { card.style.display = 'none'; return; }
            const d = await res.json();
            const host = await ip();
            $('ocPairIp').textContent = host ? `${host}:${d.port}` : `IP PC ini, port ${d.port}`;
            $('ocPairKey').textContent = d.key;
            $('ocPairDownload').classList.toggle('disabled', !d.download);
            if (!d.download) $('ocPairDownload').title = 'File observer/ARPRO-OCR-Observer.exe belum ada';
            const live = d.sources.filter(s => s.age < 15000);
            $('ocPairSources').innerHTML = d.sources.length
                ? (live.length > 1 ? '<span class="oc-pair-warn">Dua sumber OCR mengirim bersamaan! Hentikan salah satu.</span>\n' : '') +
                  d.sources.map(s => `${s.age < 15000 ? '●' : '○'} ${s.name.replace(/[<>&]/g, '')} · ${fmtAge(s.age)}`).join('\n')
                : 'Belum ada data OCR.';
        } catch (e) {}
    }
    $('ocPairNew').addEventListener('click', async () => {
        if (!confirm('Ganti kode pasangan? Observer yang sedang tersambung harus memasukkan kode baru.')) return;
        await fetch('/api/ocr/pair/new', { method: 'POST' });
        load();
    });
    load();
    setInterval(load, 3000);
})();
