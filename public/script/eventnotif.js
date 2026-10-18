/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// eventnotif.js — overlay notifikasi pemain (First Blood, Turtle/Lord Slain & Stolen)
// Dimuat oleh eventdisplay.html dan notifdisplay.html. Dipicu dari notifcontrol.html (panel PLAYER NOTIFICATION)
// lewat POST /api/eventnotif → WebSocket "event_notif" berisi data pemain yang sudah lengkap:
//   { id, event, title, side, player: { nickname, role, role_label, role_logo_url, photo_url }, team: { name, logo_url, color } }
//
// Mode render:
//   1. GIF kosongan (template di eventnotif.json → "gif"/"gif_red") diputar dari frame pertama, lalu foto, nickname,
//      logo role & logo tim ditempel di atasnya (absolute, posisi % dari "gif_layout") pada show_at..hide_at ms.
//   2. Bila GIF belum ada → template bawaan (CSS) yang meniru video referensi: bingkai perisai muncul → foto terbuka →
//      strip tim & panel judul melebar → teks pixel acak lalu tersusun → kilau → kartu menutup kembali.
// Bantuan: eventdisplay.html?calib=turtle_slain (kotak bantu + loop), ?test=first_blood&side=red (putar sekali).

(function () {
    const params = new URLSearchParams(location.search);
    const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
    const EASE_IN = 'cubic-bezier(0.6, 0, 0.9, 0.4)';
    const EASE_POP = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    const state = { cfg: null, queue: [], playing: null, sponsors: [], sponsorIdx: 0, gifCache: {}, runId: 0 };

    // ---------- DOM ----------
    const stage = document.createElement('div');
    stage.className = 'en-stage';
    stage.innerHTML = `
        <div class="en-gif">
            <img class="en-gif-bg" alt="">
            <div class="en-slot photo" data-name="photo"><img alt=""></div>
            <div class="en-slot team_logo" data-name="team_logo"><img alt=""></div>
            <div class="en-slot role" data-name="role"><img alt=""></div>
            <div class="en-slot nickname" data-name="nickname"><span></span></div>
        </div>
        <div class="en-card">
            <div class="en-burst"></div>
            <div class="en-strip"><img class="en-logo" alt=""><img class="en-role" alt=""></div>
            <div class="en-title"><div class="en-line"></div><div class="en-line"></div></div>
            <div class="en-tag"><span></span></div>
            <div class="en-frame"><div class="en-photo"><img alt=""></div></div>
            <div class="en-sponsor"><b>BY</b><img alt=""></div>
            <i class="en-spark" style="--s:34px; top:2px; inset-inline-start:300px; --d:0s"></i>
            <i class="en-spark" style="--s:26px; top:212px; inset-inline-start:724px; --d:.35s"></i>
            <i class="en-spark" style="--s:20px; top:40px; inset-inline-start:744px; --d:.7s"></i>
            <i class="en-spark" style="--s:30px; top:250px; inset-inline-start:72px; --d:.5s"></i>
            <i class="en-spark" style="--s:18px; top:6px; inset-inline-start:150px; --d:.9s"></i>
        </div>`;
    const $ = (sel) => stage.querySelector(sel);
    const card = $('.en-card');
    const gif = $('.en-gif');

    function mount() {
        document.body.appendChild(stage);
        if (params.get('calib')) stage.classList.add('en-calib');
    }

    // ---------- Data ----------
    async function loadConfig() {
        try { state.cfg = await (await fetch('/api/eventnotif/config', { cache: 'no-store' })).json(); } catch (e) { state.cfg = state.cfg || { templates: {} }; }
        return state.cfg;
    }

    async function loadSponsors() {
        try { state.sponsors = ((await (await fetch('/api/ssc/sponsors', { cache: 'no-store' })).json()).list) || []; } catch (e) { state.sponsors = []; }
    }

    // GIF diunduh sekali; tiap pemutaran memakai object URL baru agar GIF selalu mulai dari frame pertama
    async function gifBlob(src) {
        if (!src) return null;
        if (!(src in state.gifCache)) {
            state.gifCache[src] = fetch(src, { cache: 'no-store' })
                .then(r => (r.ok && /image/i.test(r.headers.get('content-type') || '') ? r.blob() : null))
                .catch(() => null);
        }
        return state.gifCache[src];
    }

    function sponsorLogo() {
        const s = state.cfg && state.cfg.sponsor;
        if (s === '' || s === null || s === false) return '';
        if (s && s !== 'auto') return s;
        if (!state.sponsors.length) return '';
        const logo = state.sponsors[state.sponsorIdx % state.sponsors.length].logo;
        state.sponsorIdx++;
        return logo;
    }

    // ---------- Util warna & teks ----------
    const hex = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    function gradient(stops, t) {
        const seg = t * (stops.length - 1);
        const i = Math.min(stops.length - 2, Math.floor(seg));
        const f = seg - i;
        const a = hex(stops[i]), b = hex(stops[i + 1]);
        return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',')})`;
    }

    function fitText(el, maxPx, minPx) {
        el.style.fontSize = `${maxPx}px`;
        let size = maxPx;
        while (el.scrollWidth > el.clientWidth + 1 && size > minPx) {
            size -= 2;
            el.style.fontSize = `${size}px`;
        }
    }

    function splitTitle(title) {
        const words = String(title || '').toUpperCase().trim().split(/\s+/).filter(Boolean);
        if (words.length <= 1) return [words[0] || '', ''];
        if (words.length === 2) return words;
        const mid = Math.ceil(words.length / 2);
        return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
    }

    // ===================== MODE 2: TEMPLATE BAWAAN =====================
    function fillCard(p) {
        const red = p.side === 'red';
        card.classList.toggle('red', red);
        const cs = getComputedStyle(card);
        const stops = ['--title-a', '--title-b', '--title-c'].map(v => cs.getPropertyValue(v).trim());

        const logo = (p.team && p.team.logo_url) || 'Assets/Other/nologo.png';
        $('.en-strip .en-logo').src = logo;
        $('.en-strip .en-role').setAttribute('src', p.player.role_logo_url || '');

        const photo = $('.en-photo img');
        photo.classList.toggle('logo-fallback', !p.player.photo_url);
        photo.src = p.player.photo_url || logo; // tanpa foto → logo tim (seperti contoh "PERFECT TURTLE" di referensi)

        const tag = $('.en-tag span');
        tag.textContent = (p.player.nickname || '').toUpperCase();
        fitText(tag, 48, 22);

        const sp = sponsorLogo();
        $('.en-sponsor').classList.toggle('none', !sp);
        if (sp) $('.en-sponsor img').src = sp;

        const chars = [];
        card.querySelectorAll('.en-line').forEach((line, li) => {
            const text = splitTitle(p.title)[li];
            line.innerHTML = '';
            line.style.display = text ? '' : 'none';
            [...text].forEach((ch, i) => {
                const s = document.createElement('span');
                s.className = 'en-ch' + (ch === ' ' ? ' sp' : '');
                s.dataset.ch = ch;
                s.textContent = ch === ' ' ? ' ' : ch;
                s.style.color = gradient(stops, text.length > 1 ? i / (text.length - 1) : 0);
                line.appendChild(s);
                if (ch !== ' ') chars.push(s);
            });
            fitText(line, 92, 40);
        });
        return chars;
    }

    // huruf acak lalu tersusun kiri → kanan (ref: "WZIST BLEET" → "FIRST BLOOD")
    function scramble(chars, run, duration) {
        const t0 = performance.now();
        const reveal = chars.map((c, i) => 120 + i * (duration / Math.max(chars.length, 1)) * 0.8 + Math.random() * 140);
        chars.forEach(c => { c.classList.add('scr'); c.textContent = LETTERS[Math.floor(Math.random() * 26)]; });
        return new Promise(resolve => {
            const tick = () => {
                if (run !== state.runId) return resolve();
                const t = performance.now() - t0;
                let left = 0;
                chars.forEach((c, i) => {
                    if (t >= reveal[i]) {
                        if (c.classList.contains('scr')) { c.classList.remove('scr'); c.textContent = c.dataset.ch; }
                    } else {
                        left++;
                        c.textContent = LETTERS[Math.floor(Math.random() * 26)];
                    }
                });
                if (left) setTimeout(tick, 55); else resolve();
            };
            tick();
        });
    }

    // selama tampil: 1–2 huruf berkedip blur sesekali (seperti di referensi)
    function glitchLoop(chars, run, until) {
        const step = () => {
            if (run !== state.runId || performance.now() > until) return;
            const picks = [chars[Math.floor(Math.random() * chars.length)], chars[Math.floor(Math.random() * chars.length)]];
            picks.forEach(c => c && c.classList.add('glitch'));
            setTimeout(() => picks.forEach(c => c && c.classList.remove('glitch')), 260);
            setTimeout(step, 550 + Math.random() * 450);
        };
        setTimeout(step, 300);
    }

    async function playCard(p, tpl, run) {
        const D = Math.max(3000, tpl.duration || 5200);
        const c = state.cfg.card || {};
        const scale = c.scale || 1;
        card.style.left = `${(c.x || 960) - 380}px`;
        card.style.top = `${c.y || 250}px`;
        card.style.transform = `scale(${scale})`;

        const chars = fillCard(p);
        const red = p.side === 'red';
        const frame = $('.en-frame'), tag = $('.en-tag'), strip = $('.en-strip'), title = $('.en-title');
        const burst = $('.en-burst'), sponsor = $('.en-sponsor'), photo = $('.en-photo img');
        // arah sapuan: biru melebar ke kanan, merah ke kiri (dicerminkan)
        const hideFromStart = red ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)';
        const hideFromEnd = red ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)';
        const shown = 'inset(0 0 0 0)';
        const anims = [];
        const A = (el, kf, opt) => { const a = el.animate(kf, { fill: 'both', ...opt }); anims.push(a); return a; };

        card.classList.remove('sparkle', 'shine');
        card.classList.add('on');

        A(frame, [{ transform: 'scale(0.25)', opacity: 0 }, { transform: 'scale(1.08)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }], { duration: 420, easing: EASE_OUT });
        A(tag, [{ transform: 'translateY(-70px) scale(0.6)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], { duration: 380, delay: 220, easing: EASE_POP });
        A(photo, [{ clipPath: 'inset(100% 0 0 0)', transform: 'scale(1.15)' }, { clipPath: 'inset(0 0 0 0)', transform: 'scale(1)' }], { duration: 420, delay: 320, easing: EASE_OUT });
        A(burst, [{ opacity: 0, transform: 'scale(0.6) rotate(0deg)' }, { opacity: 1, transform: 'scale(1) rotate(25deg)', offset: 0.35 }, { opacity: 0, transform: 'scale(1.25) rotate(60deg)' }], { duration: 1100, delay: 380, easing: 'ease-out' });
        A(strip, [{ clipPath: hideFromEnd }, { clipPath: shown }], { duration: 300, delay: 620, easing: EASE_OUT });
        A(title, [{ clipPath: hideFromStart }, { clipPath: shown }], { duration: 360, delay: 640, easing: EASE_OUT });
        A(sponsor, [{ transform: 'scale(0.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 300, delay: 980, easing: EASE_POP });

        setTimeout(() => { if (run === state.runId) card.classList.add('shine'); }, 720);
        setTimeout(() => { if (run === state.runId) card.classList.add('sparkle'); }, 900);
        await sleep(700);
        if (run !== state.runId) return;
        await scramble(chars, run, 1000);
        glitchLoop(chars, run, performance.now() + D - 2600);

        await sleep(Math.max(0, D - 900 - 1750));
        if (run !== state.runId) return;

        // keluar: panel judul & strip menutup ke belakang bingkai, lalu bingkai mengecil hilang
        card.classList.remove('sparkle');
        A(title, [{ clipPath: shown }, { clipPath: hideFromStart }], { duration: 300, easing: EASE_IN });
        A(strip, [{ clipPath: shown }, { clipPath: hideFromEnd }], { duration: 260, easing: EASE_IN });
        A(sponsor, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
        await sleep(300);
        A(frame, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.8)', opacity: 0 }], { duration: 300, easing: EASE_IN });
        A(tag, [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-40px)', opacity: 0 }], { duration: 260, easing: EASE_IN });
        await sleep(320);
        if (run !== state.runId) return;
        card.classList.remove('on', 'shine');
        anims.forEach(a => a.cancel());
    }

    // ===================== MODE 1: GIF KOSONGAN + ELEMEN DINAMIS =====================
    function placeSlot(el, rect) {
        if (!rect) { el.style.display = 'none'; return; }
        el.style.display = '';
        Object.assign(el.style, { left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%` });
    }

    async function playGif(p, tpl, blob, run) {
        const L = (p.side === 'red' && tpl.gif_layout_red) || tpl.gif_layout || state.cfg.gif_layout || {};
        const box = L.box || { x: 560, y: 210, w: 800, h: 340 };
        Object.assign(gif.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` });

        const logo = (p.team && p.team.logo_url) || 'Assets/Other/nologo.png';
        ['photo', 'team_logo', 'role', 'nickname'].forEach(k => placeSlot(gif.querySelector(`.en-slot.${k}`), L[k]));
        const ph = gif.querySelector('.en-slot.photo img');
        ph.classList.toggle('logo-fallback', !p.player.photo_url);
        ph.src = p.player.photo_url || logo;
        gif.querySelector('.en-slot.team_logo img').src = logo;
        const roleImg = gif.querySelector('.en-slot.role img');
        roleImg.style.display = p.player.role_logo_url ? '' : 'none';
        if (p.player.role_logo_url) roleImg.src = p.player.role_logo_url;
        const nick = gif.querySelector('.en-slot.nickname');
        const n = L.nickname || {};
        nick.style.color = !n.color || n.color === 'team' ? (p.team && p.team.color) || '#fff' : n.color;
        nick.querySelector('span').textContent = (p.player.nickname || '').toUpperCase();
        if (L.nickname) fitText(nick.querySelector('span'), n.size || 40, 14);

        const url = URL.createObjectURL(blob); // URL baru = GIF diputar ulang dari frame pertama
        const bg = gif.querySelector('.en-gif-bg');
        await new Promise(r => { bg.onload = r; bg.onerror = r; bg.src = url; });
        if (run !== state.runId) { URL.revokeObjectURL(url); return; }
        gif.classList.remove('dyn');
        gif.classList.add('on');

        const D = Math.max(1000, tpl.duration || 5200);
        const showAt = L.show_at != null ? L.show_at : 550;
        const hideAt = L.hide_at != null ? L.hide_at : D - 700;
        setTimeout(() => { if (run === state.runId) gif.classList.add('dyn'); }, showAt);
        setTimeout(() => { if (run === state.runId) gif.classList.remove('dyn'); }, hideAt);
        await sleep(D);
        if (run === state.runId) gif.classList.remove('on', 'dyn');
        URL.revokeObjectURL(url);
    }

    // ---------- Antrean ----------
    async function play(p) {
        const run = ++state.runId;
        state.playing = p;
        const cfg = await loadConfig();
        const tpl = (cfg.templates || {})[p.event] || { title: p.title, duration: 5200 };
        if (!p.title) p.title = tpl.title;
        const src = (p.side === 'red' && tpl.gif_red) || tpl.gif;
        const blob = await gifBlob(src);
        if (run !== state.runId) return;
        try {
            if (blob) await playGif(p, tpl, blob, run);
            else await playCard(p, tpl, run);
        } catch (e) {
            console.error('Event notif error:', e);
        }
        if (run !== state.runId) return;
        state.playing = null;
        const next = state.queue.shift();
        if (next) { await sleep(150); play(next); }
        else if (params.get('calib')) setTimeout(() => play(p), 600); // mode kalibrasi: ulang terus
    }

    function enqueue(p) {
        if (!p || !p.player) return;
        if (state.playing) {
            if (state.queue.length < 3) state.queue.push(p);
        } else play(p);
    }

    function stop() {
        state.runId++;
        state.queue = [];
        state.playing = null;
        stage.getAnimations({ subtree: true }).forEach(a => a.cancel());
        card.classList.remove('on', 'sparkle', 'shine');
        gif.classList.remove('on', 'dyn');
    }

    // ---------- Koneksi ----------
    function connect() {
        const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
        ws.onmessage = (ev) => {
            let m;
            try { m = JSON.parse(ev.data); } catch (e) { return; }
            if (m.type === 'event_notif') enqueue(m.data);
            else if (m.type === 'event_notif_stop') stop();
        };
        ws.onclose = () => setTimeout(connect, 3000);
        ws.onerror = () => ws.close();
    }

    // contoh data untuk ?calib / ?test (pemain pertama tim yang dipilih)
    async function sample(event, side) {
        const d = await (await fetch('/api/eventnotif/players', { cache: 'no-store' })).json();
        const team = d.teams[side] || d.teams.blue;
        const player = team.players.find(x => x.nickname) || team.players[0] || { nickname: 'PLAYER' };
        return { id: 0, event, side, player, team: { name: team.name, logo_url: team.logo_url, color: team.color } };
    }

    async function init() {
        mount();
        await Promise.all([loadConfig(), loadSponsors()]);
        connect();
        const ev = params.get('calib') || params.get('test');
        if (ev) setTimeout(async () => enqueue(await sample(ev, params.get('side') === 'red' ? 'red' : 'blue')), 800);
        setInterval(loadSponsors, 300000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
    window.EventNotif = { enqueue, stop };
})();
