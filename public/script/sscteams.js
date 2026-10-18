/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// sscteams.js — tabel tim dari ssc2027.id (dataset "tim") di control panel.
// Klik BIRU / MERAH → nama tim, logo & 5 nickname pemain inti masuk ke sisi itu (lane, skor, hero tidak diubah).

(function () {
    const root = document.getElementById('ssc-teams');
    if (!root) return;
    const body = root.querySelector('tbody');
    const msg = root.querySelector('.ssct-msg');
    const search = root.querySelector('.ssct-search');
    let teams = [];
    let current = { blue: '', red: '' };

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function say(text, kind) {
        msg.textContent = text || '';
        msg.className = 'ssct-msg' + (kind ? ' ' + kind : '');
    }

    async function loadCurrent() {
        try {
            const md = await (await fetch('/api/matchdata')).json();
            current.blue = (md.teamdata && md.teamdata.blueteam && md.teamdata.blueteam.teamname) || '';
            current.red = (md.teamdata && md.teamdata.redteam && md.teamdata.redteam.teamname) || '';
        } catch (e) {}
    }

    function render() {
        const q = search.value.trim().toLowerCase();
        const rows = teams.filter(t => !q || t.tim.toLowerCase().includes(q) || (t.sekolah || '').toLowerCase().includes(q));
        if (!rows.length) {
            body.innerHTML = `<tr><td colspan="5" class="ssct-empty">${teams.length ? 'Tidak ada tim yang cocok.' : 'Belum ada tim terdaftar di website untuk kategori ini.'}</td></tr>`;
            return;
        }
        body.innerHTML = rows.map(t => {
            const isBlue = t.tim === current.blue, isRed = t.tim === current.red;
            const players = t.players.map(p => `<span class="${p.sub ? 'sub' : ''}" title="${esc(p.name)}">${esc(p.label)}${p.sub ? ' (C)' : ''}</span>`).join(', ');
            return `<tr class="${isBlue ? 'is-blue' : ''} ${isRed ? 'is-red' : ''}">
                <td><img class="ssct-logo" src="${esc(t.logo_url || 'Assets/Other/nologo.png')}" alt="" onerror="this.src='Assets/Other/nologo.png'"></td>
                <td><span class="ssct-name">${esc(t.tim)}</span>${isBlue ? '<span class="ssct-tag blue">BIRU</span>' : ''}${isRed ? '<span class="ssct-tag red">MERAH</span>' : ''}</td>
                <td>${esc(t.sekolah)}</td>
                <td class="ssct-players">${players || '<span class="sub">—</span>'}</td>
                <td class="ssct-pick"><button data-side="blue" data-team="${esc(t.tim)}">Biru</button><button data-side="red" data-team="${esc(t.tim)}">Merah</button></td>
            </tr>`;
        }).join('');
    }

    async function load(refresh) {
        say('Memuat daftar tim…');
        try {
            const res = await fetch('/api/ssc/teams' + (refresh ? '?refresh=1' : ''));
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);
            teams = data.teams || [];
            await loadCurrent();
            render();
            say(`${teams.length} tim · kategori ${data.game || '-'}`);
        } catch (e) {
            teams = [];
            render();
            say('Gagal memuat tim: ' + e.message, 'err');
        }
    }

    async function assign(side, team, btn) {
        btn.disabled = true;
        say(`Memasang ${team} ke tim ${side === 'blue' ? 'biru' : 'merah'}…`);
        try {
            const res = await fetch('/api/ssc/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ side, team }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);
            if (typeof loadFromServer === 'function') await loadFromServer(); // isi ulang form nama/logo di atas
            current[side] = team;
            render();
            say(`${team} dipasang di tim ${side === 'blue' ? 'BIRU' : 'MERAH'}.${data.lock ? ' Lock SSC Sync aktif, Auto sync tidak akan menimpa.' : ''}`, 'ok');
        } catch (e) {
            say('Gagal memasang tim: ' + e.message, 'err');
        } finally {
            btn.disabled = false;
        }
    }

    body.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-side]');
        if (btn) assign(btn.dataset.side, btn.dataset.team, btn);
    });
    search.addEventListener('input', render);
    root.querySelector('.ssct-refresh').addEventListener('click', () => load(true));

    // nama tim bisa berubah lewat SWITCH TEAM / ketik manual → tandai ulang
    for (const id of ['name-input-1', 'name-input-8']) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => { current.blue = document.getElementById('name-input-1').value; current.red = document.getElementById('name-input-8').value; render(); });
    }

    load(false);
})();
