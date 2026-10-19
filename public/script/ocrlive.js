/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// ocrlive.js — strip "LIVE OCR" di atas notifcontrol.html: status gold / waktu / Turtle & Lord, saran multikill
// (berkedip + bunyi ding), saklar otomasi & RESET GAME. Data sama dengan panel "5 · OTOMASI & GOLD" di OCR Control
// (dihitung server: /api/ocr/game), jadi kedua halaman selalu sinkron. Halaman OCR Control tetap harus terbuka.
(() => {
    const bar = document.getElementById('oxBar');
    if (!bar) return;
    const $ = (sel) => bar.querySelector(sel);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const fmtK = (v) => (v / 1000).toFixed(1) + 'K';
    // sama dengan OCR Control: PEMAIN = Player Notification, VIDEO = video yang sama dengan panel VIDEO NOTIFICATION
    const EVENT = { 2: [['double_kill', 'DOUBLE KILL']], 3: [['triple_kill', 'TRIPLE KILL']], 4: [['maniac', 'MANIAC']], 5: [['savage', 'SAVAGE'], ['wipe_out', 'WIPE OUT']] };
    const VIDEO = { 2: [['videoPlayer8', 'VIDEO']], 3: [['videoPlayer9', 'VIDEO']], 4: [['videoPlayer10', 'VIDEO']], 5: [['videoPlayer11', 'VIDEO SAVAGE'], ['videoPlayer12', 'VIDEO WIPE OUT']] };
    const TOGGLES = [['autoFirstBlood', 'FIRST BLOOD'], ['autoLordSlain', 'LORD SLAIN'], ['autoObjectiveSpawn', 'TURTLE / LORD SPAWN'], ['multikillHints', 'SARAN MULTIKILL']];
    const dismissed = new Set();
    let seen = null;      // id saran yang sudah pernah tampil (null = data pertama, tanpa bunyi)
    let picking = null;   // { id, side, event, title }
    let roster = null;
    let last = null;
    let auto = {};

    // ---------- bunyi ding (WebAudio, tanpa file). Browser baru mengizinkan suara setelah halaman diklik sekali. ----------
    let dingOn = true;
    try { dingOn = localStorage.getItem('ocrlive.ding') !== '0'; } catch (e) {}
    let actx = null;
    const unlock = () => {
        try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {}
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    function ding() {
        if (!dingOn || !actx || actx.state !== 'running') return;
        const t0 = actx.currentTime;
        [[1318.5, 0], [1760, 0.12]].forEach(([f, d]) => {
            const o = actx.createOscillator(), g = actx.createGain();
            o.type = 'sine'; o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, t0 + d);
            g.gain.exponentialRampToValueAtTime(0.35, t0 + d + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.45);
            o.connect(g).connect(actx.destination);
            o.start(t0 + d); o.stop(t0 + d + 0.5);
        });
    }
    function renderDing() {
        const b = $('#oxDing');
        b.classList.toggle('on', dingOn);
        b.textContent = dingOn ? 'DING: ON' : 'DING: OFF';
    }

    // ---------- tampilan ----------
    let flashTimer = null;
    function flash(text, err) {
        const el = $('#oxMsg');
        el.textContent = text;
        el.classList.toggle('err', !!err);
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => { el.textContent = ''; }, 5000);
    }

    function render(d) {
        if (!d) return;
        last = d;
        const running = !!d.live;
        const live = $('#oxLive');
        live.className = 'ox-live ' + (running ? 'on' : d.t != null ? 'stop' : 'off');
        live.textContent = running ? 'OCR LIVE' : d.t != null ? 'OCR BERHENTI' : 'OCR TIDAK AKTIF';
        live.title = running ? 'OCR Control sedang membaca layar game' : 'Buka / START ocrcontrol.html (jendela terpisah, jangan tab di belakang)';
        bar.classList.toggle('stale', !running);

        $('#oxTime').textContent = d.t != null ? fmtTime(d.t) : '–';
        if (d.gold) {
            const lead = d.lead, who = Math.abs(lead) < 100 ? '<i>IMBANG</i>'
                : `<i class="${lead > 0 ? 'b' : 'r'}">${lead > 0 ? 'BIRU' : 'MERAH'} +${fmtK(Math.abs(lead))}</i>`;
            $('#oxGold').innerHTML = `<span class="b">${fmtK(d.gold.g1)}</span> : <span class="r">${fmtK(d.gold.g2)}</span> ${who}`;
        } else $('#oxGold').textContent = 'belum terbaca';
        $('#oxObj').innerHTML = (d.objectives || []).map(o =>
            `<span class="ox-chip ${o.alive ? 'alive' : o.warn ? 'warn' : ''}"><small>${esc(o.label)}</small><b>${o.alive ? 'SUDAH MUNCUL' : fmtTime(o.remain)}</b></span>`).join('');
        const l = (d.log || [])[0];
        $('#oxLog').textContent = l ? `otomatis: ${l.text} · ${new Date(l.at).toLocaleTimeString('id-ID', { hour12: false })}` : '';

        if (d.auto) {
            auto = d.auto;
            bar.querySelectorAll('[data-auto]').forEach(b => b.classList.toggle('on', !!auto[b.dataset.auto]));
        }

        const hints = (d.hints || []).filter(h => !dismissed.has(h.id));
        const fresh = seen ? hints.filter(h => !seen.has(h.id)) : [];
        seen = new Set([...(seen || []), ...(d.hints || []).map(h => h.id)]);
        if (fresh.length) ding();
        if (picking && !hints.some(h => h.id === picking.id)) picking = null;
        $('#oxHints').innerHTML = hints.map(h => {
            const side = h.side === 1 ? 'blue' : 'red';
            const team = roster && roster.teams[side];
            const pick = picking && picking.id === h.id && team
                ? `<div class="ox-pick"><em>${esc(picking.title)} · pilih pemain:</em>${team.players.map(p =>
                    `<button data-pick="${p.slot}" data-id="${h.id}" ${p.nickname ? '' : 'disabled'}>${p.photo_url ? `<img src="${esc(p.photo_url)}" alt="">` : ''}<span>${esc(p.nickname || 'kosong')}</span>${p.hero ? `<small>${esc(p.hero)}</small>` : ''}</button>`).join('')}</div>` : '';
            const events = EVENT[h.count] || [];
            return `<div class="ox-hint ${side}">
                <span class="ox-hint-t">${h.side === 1 ? 'BIRU' : 'MERAH'} · ${h.count} kill beruntun → <b>${esc(h.label)}?</b></span>
                ${events.map(([ev, title]) => `<button class="pri" data-player="${ev}" data-title="${title}" data-side="${side}" data-id="${h.id}" title="Player Notification: foto, hero & logo tim">${events.length > 1 ? title : 'PEMAIN'}</button>`).join('')}
                ${(VIDEO[h.count] || [[h.videoId, 'VIDEO']]).map(([v, t]) => `<button data-play="${v}" data-id="${h.id}" title="Video saja, sama dengan tombol di panel Video Notification">${t}</button>`).join('')}
                <button class="x" data-close data-id="${h.id}" title="Abaikan">✕</button>
                ${pick}
            </div>`;
        }).join('');
    }

    const dismiss = (id) => {
        dismissed.add(id);
        if (picking && picking.id === id) picking = null;
        fetch('/api/ocr/hint/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => {});
    };

    $('#oxHints').addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b || b.disabled) return;
        const id = b.dataset.id;
        if (b.dataset.player) {
            if (picking && picking.id === id && picking.event === b.dataset.player) picking = null;
            else {
                picking = { id, side: b.dataset.side, event: b.dataset.player, title: b.dataset.title };
                try { roster = await (await fetch('/api/eventnotif/players', { cache: 'no-store' })).json(); } catch (err) { roster = null; flash('Gagal memuat daftar pemain', true); }
            }
            render(last);
            return;
        }
        if (b.dataset.pick != null && picking) {
            const body = { event: picking.event, side: picking.side, slot: +b.dataset.pick };
            dismiss(id);
            render(last);
            try {
                const res = await fetch('/api/eventnotif', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                const p = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(p.message || 'Gagal mengirim notifikasi');
                flash(`TAYANG: ${p.title} · ${p.player.nickname}`);
            } catch (err) { flash(err.message, true); }
            return;
        }
        if (b.dataset.play) {
            // fungsi yang sama dengan tombol panel VIDEO NOTIFICATION (status panel itu ikut berubah)
            if (typeof window.setVideo === 'function') window.setVideo(b.dataset.play);
            else fetch('/api/notification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoId: b.dataset.play }) });
            const name = b.textContent === 'VIDEO' ? b.closest('.ox-hint').querySelector('b').textContent.replace('?', '') : b.textContent.slice(6);
            flash(`TAYANG: VIDEO ${name}`);
        }
        dismiss(id);
        render(last);
    });

    $('#oxDing').addEventListener('click', () => {
        dingOn = !dingOn;
        try { localStorage.setItem('ocrlive.ding', dingOn ? '1' : '0'); } catch (e) {}
        renderDing();
        unlock();
        if (dingOn) setTimeout(ding, 50);
    });
    $('#oxReset').addEventListener('click', async () => {
        if (!confirm('Reset data game (grafik gold, timer Turtle/Lord, first blood, saran multikill)?\nBiasanya otomatis saat timer game kembali ke 0.')) return;
        try { await fetch('/api/ocr/game/reset', { method: 'POST' }); flash('GAME DIRESET'); } catch (e) { flash('Server tidak merespons', true); }
        load();
    });

    // strip menempel di atas → beri ruang di atas halaman setinggi strip
    const fit = () => { document.body.style.paddingTop = bar.offsetHeight + 'px'; };
    if (window.ResizeObserver) new ResizeObserver(fit).observe(bar);
    fit();

    async function load() {
        try { render(await (await fetch('/api/ocr/game', { cache: 'no-store' })).json()); } catch (e) {}
    }
    function connect() {
        const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
        ws.onopen = load;
        ws.onmessage = (ev) => {
            let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
            if (m.type === 'ocr_game') render(m.data);
            else if (m.type === 'ocr_game_reset') load();
        };
        ws.onclose = () => setTimeout(connect, 2000);
    }
    $('#oxTog').innerHTML = TOGGLES.map(([k, t]) => `<button data-auto="${k}" title="Klik untuk ON / OFF (sinkron dengan OCR Control)">${t}</button>`).join('');
    bar.querySelectorAll('[data-auto]').forEach(b => b.addEventListener('click', async () => {
        const k = b.dataset.auto;
        try {
            const res = await fetch('/api/ocr/auto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [k]: !auto[k] }) });
            const out = await res.json();
            if (!res.ok) throw new Error(out.message || 'Gagal menyimpan');
            auto = { ...auto, [k]: !!out.config[k] };
            b.classList.toggle('on', auto[k]);
        } catch (err) { flash(err.message, true); }
    }));
    renderDing();
    connect();
    setInterval(load, 3000); // status OCR LIVE / BERHENTI tetap benar walau OCR tidak mengirim data
})();
