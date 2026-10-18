/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// ingamecontrol.js — kontrol ingamedisplay.html di control panel: pilih MVP, tampil/sembunyi banner MVP & HIGHLIGHTS,
// atau ambil MVP terbaru yang diinput panitia di ssc2027.id (dataset "mvp").

(function () {
    const select = document.getElementById('igMvpSelect');
    if (!select) return;
    const msg = document.getElementById('igMsg');
    const buttons = document.querySelectorAll('[data-ig]');
    const ON = '#00ff8c';
    let state = null;
    let md = null;

    function say(text, err) {
        msg.textContent = text || '';
        msg.style.color = err ? '#ff5c5c' : '';
    }

    function mark() {
        if (!state) return;
        const active = {
            'mvp-show': state.mvp.show, 'mvp-hide': !state.mvp.show,
            'hl-show': state.highlights.show, 'hl-hide': !state.highlights.show
        };
        buttons.forEach(btn => {
            const on = active[btn.dataset.ig];
            btn.style.borderColor = on ? ON : '';
            btn.style.color = on ? ON : '';
            btn.style.boxShadow = on ? `0 0 10px ${ON}66` : '';
        });
        select.value = `${state.mvp.side}:${state.mvp.slot}`;
    }

    // daftar 10 pemain: "BIRU · Kyy — Ling"
    async function loadOptions() {
        try {
            const [m, d] = await Promise.all([
                fetch('/api/matchdata', { cache: 'no-store' }).then(r => r.json()),
                fetch('/api/matchdraft', { cache: 'no-store' }).then(r => r.json())
            ]);
            md = m;
            const draft = d.draftdata || {};
            const keep = select.value;
            select.innerHTML = '';
            ['blue', 'red'].forEach(side => {
                const team = (m.teamdata || {})[side === 'blue' ? 'blueteam' : 'redteam'] || {};
                const picks = ((side === 'blue' ? draft.blueside : draft.redside) || {}).pick || [];
                const group = document.createElement('optgroup');
                group.label = `${side === 'blue' ? 'BIRU' : 'MERAH'} · ${team.teamname || '-'}`;
                for (let i = 0; i < 5; i++) {
                    const p = (team.playerlist || [])[i] || {};
                    const hero = picks[i] && picks[i].hero ? decodeURIComponent(picks[i].hero.split('/').pop().replace(/\.[a-z]+$/i, '')) : '';
                    const opt = document.createElement('option');
                    opt.value = `${side}:${i}`;
                    opt.textContent = `${p.name || `Pemain ${i + 1}`}${hero ? ' — ' + hero.toUpperCase() : ''}`;
                    group.appendChild(opt);
                }
                select.appendChild(group);
            });
            select.value = state ? `${state.mvp.side}:${state.mvp.slot}` : keep || 'blue:0';
        } catch (e) { console.error('ingame options', e); }
    }

    async function post(body) {
        try {
            const res = await fetch('/api/ingame', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            state = await res.json();
            mark();
        } catch (e) { say('Gagal mengubah overlay in-game: ' + e.message, true); }
    }

    function picked() {
        const [side, slot] = select.value.split(':');
        return { side, slot: parseInt(slot, 10) || 0 };
    }

    // cocokkan MVP dari website (nickname / nama + tim) ke pemain di tim biru / merah
    async function mvpFromWeb() {
        say('Mengambil MVP dari website…');
        try {
            const res = await fetch('/api/ssc/mvp', { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);
            const row = (data.rows || [])[0];
            if (!row) return say('Belum ada MVP yang diinput di website.', true);
            await loadOptions();
            const low = (s) => (s || '').trim().toLowerCase();
            for (const side of ['blue', 'red']) {
                const key = side === 'blue' ? 'blueteam' : 'redteam';
                const team = (md.teamdata || {})[key] || {};
                if (low(team.teamname) !== low(row.tim)) continue;
                const roster = (md.ssc && md.ssc.roster && md.ssc.roster[key] && md.ssc.roster[key].players) || [];
                const fromRoster = roster.find(p => low(p.name) === low(row.nama));
                const names = [row.nickname, row.nama, fromRoster && fromRoster.label].map(low).filter(Boolean);
                const slot = (team.playerlist || []).slice(0, 5).findIndex(p => names.includes(low(p.name)));
                if (slot < 0) return say(`MVP ${row.nickname} (${row.tim}) tidak ada di 5 pemain inti yang tampil.`, true);
                select.value = `${side}:${slot}`;
                await post({ mvp: { side, slot, show: true } });
                return say(`MVP dari website: ${row.nickname} · ${row.tim}${row.waktu ? ' · ' + row.waktu : ''}`);
            }
            say(`MVP terbaru di website (${row.nickname}, ${row.tim}) bukan dari tim yang sedang tampil.`, true);
        } catch (e) { say('Gagal mengambil MVP: ' + e.message, true); }
    }

    buttons.forEach(btn => btn.addEventListener('click', () => {
        say('');
        switch (btn.dataset.ig) {
            case 'mvp-show': post({ mvp: { ...picked(), show: true } }); break;
            case 'mvp-hide': post({ mvp: { show: false } }); break;
            case 'mvp-web': mvpFromWeb(); break;
            case 'hl-show': post({ highlights: { show: true } }); break;
            case 'hl-hide': post({ highlights: { show: false } }); break;
        }
    }));

    // ganti pilihan saat banner tampil → langsung pindah ke pemain baru
    select.addEventListener('change', () => post({ mvp: picked() }));
    // nama pemain / hero berubah dari panel di atas → perbarui daftar (tidak saat dropdown sedang dibuka)
    setInterval(() => { if (document.activeElement !== select) loadOptions(); }, 4000);

    fetch('/api/ingame').then(r => r.json()).then(s => { state = s; return loadOptions(); }).then(mark).catch(() => {});
})();

// Hitungan "x TIMES PICKED" (splash pick): info jumlah game tercatat + tombol reset (klik 2x untuk konfirmasi)
(function () {
    const btn = document.getElementById('pickStatsReset');
    const info = document.getElementById('pickStatsInfo');
    if (!btn) return;
    let armed = null;

    async function refresh() {
        try {
            const d = await (await fetch('/api/pickstats', { cache: 'no-store' })).json();
            info.textContent = `Pick stats: ${d.games} game tercatat otomatis (tiap draft lengkap 10 hero)`;
        } catch (e) {}
    }

    btn.addEventListener('click', async () => {
        if (!armed) {
            btn.textContent = 'ARE U SURE?';
            armed = setTimeout(() => { armed = null; btn.textContent = 'RESET PICK STATS'; }, 3000);
            return;
        }
        clearTimeout(armed);
        armed = null;
        await fetch('/api/pickstats/reset', { method: 'POST' });
        btn.textContent = 'RESET!';
        setTimeout(() => { btn.textContent = 'RESET PICK STATS'; }, 1500);
        refresh();
    });

    refresh();
    setInterval(refresh, 10000);
})();
