/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// draft-fx.js — animasi pick hero (Task 1), dipakai display.html, displayban6.html, display2.html & display2ban6.html
//
// Urutan per pick (timing mengikuti video referensi):
//   1. Splash hero penuh bergeser masuk menutupi 5 box tim (biru dari kiri, merah dari kanan — ref. "Revisi Splash Tool"):
//      splash art utuh tanpa terpotong (contain, sisi kosong diisi blur gambar yang sama), nama hero,
//      foto & nickname pemain yang memilih di sisi seberang
//   2. Tahan, lalu nama keluar dan splash bergeser kembali ke arah asalnya
//   3. Stinger logo tim menyapu diagonal di box pick → hero dipasang di balik stinger → stinger tersibak
// Pick yang datang bersamaan (fase 2 pick) diputar berurutan. Ban tidak dianimasikan di sini.
//
// Pratinjau tanpa control panel: display.html?fxdemo=1 (atau ?fxdemo=zhuxin untuk hero tertentu)

(function () {
    const T = {
        splashIn: 300,
        hold: 1700,
        nameOut: 180,
        splashOut: 320,
        stingerIn: 260,
        stingerHold: 380,
        stingerOut: 320
    };
    const EASE_IN_OUT = 'cubic-bezier(0.7, 0, 0.2, 1)';
    const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
    const EASE_SLIDE = 'cubic-bezier(0.25, 0.8, 0.25, 1)'; // kurva geser dari referensi (display2.css .splash-overlay)

    const queue = [];
    let current = null;
    const splashes = {};

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const sideOf = (slot) => (slot <= 5 ? 'blue' : 'red');
    const boxOf = (slot) => {
        const b = document.getElementById(`image-box-${slot}`);
        return b ? b.parentElement : null;
    };

    function loadImg(img, src) {
        return new Promise(resolve => {
            if (!src) { img.removeAttribute('src'); resolve(); return; }
            const done = () => resolve();
            img.onload = done;
            img.onerror = done;
            img.src = src;
            if (img.complete) resolve();
            setTimeout(done, 700); // jangan menahan animasi bila gambar lambat
        });
    }

    function teamLogo(side) {
        const el = document.getElementById(side === 'blue' ? 'displayImage1' : 'displayImage2');
        const src = el ? el.getAttribute('src') || '' : '';
        return src && !/nologo/i.test(src) ? src : '';
    }

    function teamName(side) {
        const el = document.getElementById(side === 'blue' ? 'name-box-1' : 'name-box-8');
        return el ? el.textContent.trim() : '';
    }

    // pemain yang memegang slot pick ini: nickname dari name-box, foto dari mugshot yang sudah dimuat
    // displaynicknamelogo.js (foto website ssc2027.id → Assets/player/<nick>.png); noplayer = tanpa foto
    function playerOf(slot) {
        const htmlId = slot <= 5 ? slot + 2 : slot + 4;
        const nameEl = document.getElementById(`name-box-${htmlId}`);
        const img = document.querySelector(`#name-image-box-${htmlId} img`);
        const src = img && img.complete && img.naturalWidth ? img.currentSrc || img.src : '';
        return {
            name: nameEl ? nameEl.textContent.trim() : '',
            photo: src && !/\/(noplayer|playertemp)\.png/i.test(src) ? src : ''
        };
    }

    // ---------- Splash ----------
    // .fx-splash = bingkai seukuran 5 box (overflow hidden); .fx-splash-inner yang digeser masuk / keluar
    function getSplash(side) {
        if (!splashes[side]) {
            const el = document.createElement('div');
            el.className = `fx-splash fx-${side}`;
            el.innerHTML = '<div class="fx-splash-inner">'
                + '<div class="fx-splash-bg"><img alt=""></div><div class="fx-splash-art"><img alt=""></div><div class="fx-splash-shade"></div>'
                + '<div class="fx-splash-player"><img alt=""><span></span></div>'
                + '<div class="fx-splash-name"><span class="fx-splash-hero"></span></div>'
                + '</div>';
            document.body.appendChild(el);
            splashes[side] = el;
        }
        return splashes[side];
    }

    // posisikan splash tepat menutupi 5 box pick tim tersebut
    function placeSplash(el, side) {
        const slots = side === 'blue' ? [1, 2, 3, 4, 5] : [6, 7, 8, 9, 10];
        let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
        slots.forEach(s => {
            const box = boxOf(s);
            if (!box) return;
            const rc = box.getBoundingClientRect();
            l = Math.min(l, rc.left); t = Math.min(t, rc.top);
            r = Math.max(r, rc.right); b = Math.max(b, rc.bottom);
        });
        if (l === Infinity) return false;
        Object.assign(el.style, {
            left: `${l + window.scrollX}px`,
            top: `${t + window.scrollY}px`,
            width: `${r - l}px`,
            height: `${b - t}px`
        });
        return true;
    }

    async function playSplash(job, side) {
        const dir = side === 'blue' ? 1 : -1;
        const info = (window.HeroAssets && HeroAssets.byImg(job.src)) || { name: '', portrait: job.src, full: null, focus: null };
        const el = getSplash(side);
        if (!placeSplash(el, side)) return false;

        // splash art utuh (contain, tanpa crop); latar = gambar yang sama diburamkan agar sisi kiri-kanan tidak kosong
        const src = info.full || info.portrait;
        const img = el.querySelector('.fx-splash-art img');
        const bg = el.querySelector('.fx-splash-bg img');
        const player = playerOf(job.slot);
        const pl = el.querySelector('.fx-splash-player');
        await Promise.all([
            loadImg(img, src),
            loadImg(bg, src),
            player.photo ? loadImg(pl.querySelector('img'), player.photo) : null
        ]);
        el.querySelector('.fx-splash-hero').textContent = (info.name || '').toUpperCase();
        pl.style.display = player.photo || player.name ? '' : 'none';
        pl.classList.toggle('no-photo', !player.photo);
        pl.querySelector('span').textContent = player.name.toUpperCase();

        // geser masuk dari luar sisi tim (biru: kiri, merah: kanan) dan keluar kembali ke sisi yang sama
        const hidden = `translateX(${-100 * dir}%)`;
        const shown = 'translateX(0)';
        const hold = queue.length >= 2 ? T.hold * 0.55 : T.hold; // antrean panjang: dipercepat
        const inner = el.querySelector('.fx-splash-inner');
        const name = el.querySelector('.fx-splash-name');

        el.style.visibility = 'visible';
        if (job.voice) job.voice();

        name.animate(
            [{ transform: `translateX(${-90 * dir}px)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }],
            { duration: 340, delay: T.splashIn * 0.45, easing: EASE_OUT, fill: 'both' }
        );
        // foto pemain naik dari bawah di sisi seberang nama hero
        pl.animate(
            [{ transform: 'translateY(40%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
            { duration: 420, delay: T.splashIn * 0.7, easing: EASE_OUT, fill: 'both' }
        );
        await inner.animate([{ transform: hidden }, { transform: shown }], { duration: T.splashIn, easing: EASE_SLIDE, fill: 'forwards' }).finished;

        await sleep(hold);

        pl.animate(
            [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(25%)', opacity: 0 }],
            { duration: T.nameOut, easing: 'cubic-bezier(0.6, 0, 0.9, 0.4)', fill: 'forwards' }
        );
        await name.animate(
            [{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${-70 * dir}px)`, opacity: 0 }],
            { duration: T.nameOut, easing: 'cubic-bezier(0.6, 0, 0.9, 0.4)', fill: 'forwards' }
        ).finished;

        const out = inner.animate([{ transform: shown }, { transform: hidden }], { duration: T.splashOut, easing: EASE_IN_OUT, fill: 'forwards' });
        await sleep(T.splashOut * 0.65); // stinger mulai sebelum splash benar-benar hilang
        const landing = playStinger(job, side);
        await out.finished;
        el.style.visibility = 'hidden';
        el.getAnimations({ subtree: true }).forEach(a => a.cancel());
        await landing;
        return true;
    }

    // ---------- Stinger logo tim ----------
    async function playStinger(job, side) {
        const box = boxOf(job.slot);
        if (!box) { if (!job.cancelled) job.apply(); return; }

        let st = box.querySelector(':scope > .fx-stinger');
        if (!st) {
            st = document.createElement('div');
            st.innerHTML = '<img alt=""><span></span>';
            box.appendChild(st);
        }
        st.className = `fx-stinger fx-${side}`;
        const logo = teamLogo(side);
        const im = st.querySelector('img');
        const label = st.querySelector('span');
        if (logo) {
            im.src = logo;
            im.style.display = '';
            label.textContent = '';
        } else {
            im.style.display = 'none';
            label.textContent = teamName(side);
        }

        // jajaran genjang miring: L = tepi kiri, R = tepi kanan (dalam %), dicerminkan untuk tim merah
        const m = side === 'red' ? (x => 100 - x) : (x => x);
        const poly = (L, R) => `polygon(${m(L)}% 0%, ${m(R)}% 0%, ${m(R - 40)}% 100%, ${m(L - 40)}% 100%)`;

        await st.animate([{ clipPath: poly(0, 0) }, { clipPath: poly(0, 140) }], { duration: T.stingerIn, easing: EASE_OUT, fill: 'forwards' }).finished;
        if (!job.cancelled) job.apply();
        st.querySelector(logo ? 'img' : 'span').animate(
            [{ transform: 'scale(0.55)', opacity: 0 }, { transform: 'scale(1.06)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }],
            { duration: 360, easing: 'ease-out', fill: 'both' }
        );
        await sleep(T.stingerHold);
        await st.animate([{ clipPath: poly(0, 140) }, { clipPath: poly(140, 140) }], { duration: T.stingerOut, easing: EASE_IN_OUT, fill: 'forwards' }).finished;
        st.getAnimations({ subtree: true }).forEach(a => a.cancel());
    }

    // ---------- Antrean ----------
    async function pump() {
        if (current) return;
        const job = queue.shift();
        if (!job) return;
        current = job;
        try {
            if (window.HeroAssets) await HeroAssets.load();
            const played = await playSplash(job, sideOf(job.slot));
            if (!played && !job.cancelled) job.apply();
        } catch (error) {
            console.error('DraftFX error:', error);
            if (!job.cancelled) job.apply();
        } finally {
            current = null;
            pump();
        }
    }

    // job = { slot: 1-10, src: path potret, apply: fn pasang hero di box, voice: fn putar voice line }
    function enqueue(job) {
        for (let i = queue.length - 1; i >= 0; i--) {
            if (queue[i].slot === job.slot) queue.splice(i, 1);
        }
        queue.push(job);
        pump();
    }

    function isPending(slot, src) {
        if (current && current.slot === slot && current.src === src && !current.cancelled) return true;
        return queue.some(j => j.slot === slot && j.src === src);
    }

    // slot dikosongkan (reset / koreksi) → batalkan animasi yang belum memasang hero
    function cancel(slot) {
        for (let i = queue.length - 1; i >= 0; i--) {
            if (queue[i].slot === slot) queue.splice(i, 1);
        }
        if (current && current.slot === slot) current.cancelled = true;
    }

    // ---------- Pratinjau (?fxdemo) ----------
    async function demo(param) {
        await HeroAssets.load();
        const res = await fetch('/database/herolist.json');
        const list = await res.json();
        const wanted = String(param).toLowerCase();
        const pick = (i) => {
            const h = list.find(x => HeroAssets.key(x.name) === HeroAssets.key(wanted)) || list[Math.floor(Math.random() * list.length)];
            return h.img;
        };
        [1, 6].forEach(slot => {
            const src = pick(slot);
            const img = document.getElementById(`image-display-${slot}`);
            const box = document.getElementById(`image-box-${slot}`);
            enqueue({ slot, src, apply: () => { if (img) { img.src = src; img.style.opacity = '1'; } if (box) box.classList.add('show'); } });
        });
    }

    // ---------- Giliran pick: tulisan "PICK" di box pemain yang sedang memilih (ref. CLD.mp4) ----------
    // mengikuti kelas "active-pick" yang dipasang displayhero.js pada #pick-left-N / #pick-right-N
    function syncTurn() {
        document.querySelectorAll('.box.pick').forEach(b => {
            const host = b.parentElement;
            if (!host) return;
            const on = b.classList.contains('active-pick');
            let t = host.querySelector(':scope > .fx-turn');
            if (!t && on) {
                t = document.createElement('div');
                t.className = `fx-turn ${/right/.test(b.id) ? 'fx-red' : 'fx-blue'}`;
                t.innerHTML = '<span>PICK</span>';
                host.appendChild(t);
            }
            if (t) t.classList.toggle('on', on);
        });
    }

    // ---------- Skor seri sebagai garis kemenangan (ref. CLD / Arcadia "III") ----------
    let bo = 3;
    function syncScore() {
        [['name-box-2', 'fx-blue'], ['name-box-9', 'fx-red']].forEach(([id, cls]) => {
            const el = document.getElementById(id);
            const box = el && el.parentElement;
            if (!box) return;
            let pips = box.querySelector(':scope > .fx-pips');
            const need = bo > 0 ? Math.ceil(bo / 2) : 0;
            box.classList.toggle('fx-pips-on', need > 0);
            if (!need) { if (pips) pips.remove(); return; }
            if (!pips) {
                pips = document.createElement('div');
                pips.className = `fx-pips ${cls}`;
                box.appendChild(pips);
            }
            const wins = Math.max(0, parseInt(el.textContent, 10) || 0);
            if (pips.childElementCount !== need) pips.innerHTML = '<i></i>'.repeat(need);
            [...pips.children].forEach((p, i) => p.classList.toggle('won', i < wins));
        });
    }

    // ---------- Label fase "BAN PHASE 1 / PICK PHASE 2" (ref. CLD "PICK PHASE 1") ----------
    // memakai daftar fase milik halaman (displayhero.js / displayheroban6.js) → otomatis benar untuk 5 ban & 3 ban
    // displayheroban6.js tidak mengisi "type" → jenis fase dibaca dari nama gif arah (LeftBanning / RightPicking / Adjustment)
    const typeOf = (p) => (p && p.type) || (/banning/i.test(p && p.direction) ? 'BANNING' : /picking/i.test(p && p.direction) ? 'PICKING' : 'ADJUSTMENT');

    function phaseLabel() {
        if (typeof phases === 'undefined' || typeof currentDraftData === 'undefined' || !currentDraftData) return '';
        const idx = parseInt(currentDraftData.current_phase, 10) || 0;
        if (!phases[idx]) return '';
        const type = typeOf(phases[idx]);
        if (type === 'ADJUSTMENT') return '';
        let n = 0, prev = null;
        for (let i = 0; i <= idx; i++) {
            const t = typeOf(phases[i]);
            if (t !== prev && t === type) n++;
            prev = t;
        }
        return `${type === 'BANNING' ? 'BAN' : 'PICK'} PHASE ${n}`;
    }

    // label kecil di kotak tengah (antara logo turnamen & angka timer); tulisan "PICKING ▸" di kotak merah adalah gif arah
    function syncPhase() {
        // display.html: kotak tengah atas · display2.html: di atas logo & skor tengah
        const host = document.querySelector('.uppermiddle > .tournamentinfo, .lowermid > .upperlowermid');
        if (!host) return;
        let el = host.querySelector(':scope > .fx-phase-no');
        if (!el) {
            el = document.createElement('div');
            el.className = 'fx-phase-no';
            host.appendChild(el);
        }
        const text = phaseLabel();
        if (el.textContent !== text) el.textContent = text;
    }

    async function loadFormat() {
        try { bo = (await (await fetch('/api/match-format', { cache: 'no-store' })).json()).bo; } catch (e) {}
        syncScore();
    }

    function connectFormat() {
        const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
        ws.onopen = loadFormat;
        ws.onmessage = (ev) => {
            let m;
            try { m = JSON.parse(ev.data); } catch (e) { return; }
            if (m.type === 'matchformat_update' && m.data) { bo = m.data.bo; syncScore(); }
            else if (m.type === 'draftdata_update') setTimeout(syncPhase, 80); // tunggu displayhero memproses data yang sama
        };
        ws.onclose = () => setTimeout(connectFormat, 3000);
        ws.onerror = () => ws.close();
    }

    function watchDom() {
        const mo = new MutationObserver(() => { syncTurn(); syncScore(); syncPhase(); });
        document.querySelectorAll('.box.pick').forEach(b => mo.observe(b, { attributes: true, attributeFilter: ['class'] }));
        ['name-box-2', 'name-box-9', 'phase'].forEach(id => {
            const el = document.getElementById(id);
            if (el) mo.observe(el, { childList: true, characterData: true, subtree: true });
        });
        syncTurn(); syncScore(); syncPhase();
        connectFormat();
    }

    function init() {
        document.body.classList.add('fx-ready');
        if (window.HeroAssets) HeroAssets.load();
        watchDom();
        const q = new URLSearchParams(location.search).get('fxdemo');
        if (q) setTimeout(() => demo(q), 1500);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.DraftFX = { enqueue, cancel, isPending, timing: T };
})();
