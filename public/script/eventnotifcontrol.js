/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// eventnotifcontrol.js — panel PLAYER NOTIFICATION di notifcontrol.html
// Alur: pilih TURTLE / LORD → klik SLAIN atau STOLEN (atau FIRST BLOOD / kill streak) → dropdown pemain Tim Biru & Tim Merah →
// klik nickname → POST /api/eventnotif { event, side, slot } → overlay memutar animasi dengan foto, role & nickname pemain.
// Data pemain (GET /api/eventnotif/players) = nickname & lane dari control panel + foto dari website SSC / Assets/player.

(function () {
    const panel = document.getElementById('pnPanel');
    if (!panel) return;
    const $ = (sel) => panel.querySelector(sel);
    const drop = $('#pnDrop');
    const status = $('#pnStatus');
    const NAMES = {
        first_blood: 'FIRST BLOOD', turtle_slain: 'TURTLE SLAIN', turtle_stolen: 'TURTLE STOLEN',
        lord_slain: 'LORD SLAIN', lord_stolen: 'LORD STOLEN',
        double_kill: 'DOUBLE KILL', triple_kill: 'TRIPLE KILL', maniac: 'MANIAC', savage: 'SAVAGE', wipe_out: 'WIPE OUT'
    };
    let monster = 'turtle';
    let pending = null; // event yang sedang dipilihkan pemainnya
    let statusTimer = null;

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    function say(text, err) {
        clearTimeout(statusTimer);
        status.textContent = text;
        status.classList.toggle('err', !!err);
        if (!err) statusTimer = setTimeout(() => { status.textContent = 'Standby'; }, 5000);
    }

    // ---------- Pilihan objektif & aksi ----------
    function setMonster(m) {
        monster = m;
        panel.querySelectorAll('[data-monster]').forEach(b => b.classList.toggle('on', b.dataset.monster === m));
        panel.querySelectorAll('.pn-action [data-obj]').forEach(el => { el.textContent = m.toUpperCase(); });
        if (pending && /^(turtle|lord)_/.test(pending)) openDrop(pending.endsWith('stolen') ? `${m}_stolen` : `${m}_slain`);
    }

    // tombol objektif (data-action: slain / stolen / first_blood) atau kill streak (data-event langsung)
    function eventOf(btn) {
        if (btn.dataset.event) return btn.dataset.event;
        const action = btn.dataset.action;
        return action === 'first_blood' ? 'first_blood' : `${monster}_${action}`;
    }

    // ---------- Dropdown pemain ----------
    function playerButton(side, team, p) {
        const logo = team.logo_url || 'Assets/Other/nologo.png';
        const thumb = p.photo_url ? `<img src="${esc(p.photo_url)}" alt="">` : `<img class="logo" src="${esc(logo)}" alt="">`;
        const role = p.role_logo_url ? `<img src="${esc(p.role_logo_url)}" alt="">` : '';
        const meta = [p.hero, p.role_label, p.photo_url ? '' : 'TANPA FOTO'].filter(Boolean).join(' · '); // hero yang sedang dipakai ikut tampil
        return `<button class="pn-player" data-side="${side}" data-slot="${p.slot}" ${p.nickname ? '' : 'disabled'}>
            <span class="pn-thumb">${thumb}</span>
            <span class="pn-role">${role}</span>
            <span class="pn-nick">${esc(p.nickname || `Pemain ${p.slot + 1} (kosong)`)}</span>
            <span class="pn-meta ${p.photo_url ? '' : 'nophoto'}">${esc(meta)}</span>
        </button>`;
    }

    async function openDrop(event) {
        pending = event;
        panel.querySelectorAll('.pn-action').forEach(b => b.classList.toggle('on', eventOf(b) === event));
        $('#pnDropEvent').textContent = NAMES[event] || event;
        drop.hidden = false;
        try {
            const d = await (await fetch('/api/eventnotif/players', { cache: 'no-store' })).json();
            ['blue', 'red'].forEach(side => {
                const team = d.teams[side];
                const box = panel.querySelector(`.pn-team.${side}`);
                box.querySelector('.pn-team-name').innerHTML =
                    `<img src="${esc(team.logo_url || 'Assets/Other/nologo.png')}" alt="">${esc(team.name || (side === 'blue' ? 'TIM BIRU' : 'TIM MERAH'))}`;
                box.querySelector('.pn-players').innerHTML = team.players.map(p => playerButton(side, team, p)).join('');
            });
        } catch (e) {
            say('Gagal memuat daftar pemain', true);
        }
    }

    function closeDrop() {
        pending = null;
        drop.hidden = true;
        panel.querySelectorAll('.pn-action').forEach(b => b.classList.remove('on'));
    }

    async function post(body) {
        const res = await fetch('/api/eventnotif', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'HTTP ' + res.status);
        return data;
    }

    function showLast(p) {
        $('#pnLast').textContent = p ? `Terakhir: ${p.title} · ${p.player.nickname} (${p.team.name || (p.side === 'blue' ? 'Tim Biru' : 'Tim Merah')})` : 'Belum ada notifikasi';
    }

    async function trigger(side, slot) {
        const event = pending;
        const btn = panel.querySelector(`.pn-player[data-side="${side}"][data-slot="${slot}"]`);
        if (!event || !btn || btn.disabled) return; // slot pemain kosong
        closeDrop();
        say(`SENDING ${NAMES[event]}…`);
        try {
            const p = await post({ event, side, slot });
            say(`PLAYING ${p.title} · ${p.player.nickname}`);
            showLast(p);
        } catch (e) { say(e.message, true); }
    }

    // ---------- Event ----------
    panel.querySelectorAll('[data-monster]').forEach(b => b.addEventListener('click', () => setMonster(b.dataset.monster)));
    panel.querySelectorAll('.pn-action').forEach(b => b.addEventListener('click', () => {
        const ev = eventOf(b);
        if (pending === ev) closeDrop(); else openDrop(ev);
    }));
    $('#pnDropClose').addEventListener('click', closeDrop);
    drop.addEventListener('click', (e) => {
        const btn = e.target.closest('.pn-player');
        if (btn) trigger(btn.dataset.side, parseInt(btn.dataset.slot, 10));
    });
    $('#pnReplay').addEventListener('click', async () => {
        try { const p = await post({ replay: true }); say(`REPLAY ${p.title} · ${p.player.nickname}`); } catch (e) { say(e.message, true); }
    });
    $('#pnStop').addEventListener('click', async () => {
        try { await post({ stop: true }); say('STOPPED'); } catch (e) { say(e.message, true); }
    });

    // saat dropdown terbuka: Esc menutup, angka 1–5 = Tim Biru, Q W E R T = Tim Merah; shortcut video lain ditahan
    window.addEventListener('keydown', (e) => {
        if (drop.hidden || e.target.tagName === 'INPUT') return;
        const k = e.key.toLowerCase();
        const blue = ['1', '2', '3', '4', '5'].indexOf(k);
        const red = ['q', 'w', 'e', 'r', 't'].indexOf(k);
        if (k === 'escape') closeDrop();
        else if (blue >= 0) trigger('blue', blue);
        else if (red >= 0) trigger('red', red);
        else return;
        e.preventDefault();
        e.stopImmediatePropagation();
    }, true);

    fetch('/api/eventnotif/players', { cache: 'no-store' }).then(r => r.json()).then(d => showLast(d.last)).catch(() => {});
    setMonster('turtle');
})();
