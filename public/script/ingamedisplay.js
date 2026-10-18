/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// ingamedisplay.js — badge HIGHLIGHTS + banner MVP saat in-game
// Data: tim, logo, skor & nickname dari /api/matchdata (foto pemain dari md.ssc.roster, hasil SSC Sync),
// hero MVP = pick di slot pemain yang sama (/api/matchdraft), status tampil dari /api/ingame (control panel).

(function () {
    const params = new URLSearchParams(location.search);
    const accent = (params.get('accent') || '').replace(/[^0-9a-f]/gi, '');
    if (accent.length === 6 || accent.length === 3) document.documentElement.style.setProperty('--ig-accent', '#' + accent);
    if (params.get('bg') === 'green') document.body.classList.add('bg-green');

    const TEAM_COLOR = { blue: '#1b5cff', red: '#e3263b' };
    const SWAP_MS = 450; // ganti MVP saat banner tampil: sembunyikan dulu, lalu tampil lagi
    const $ = (id) => document.getElementById(id);
    const mvpEl = $('igMvp');
    const hlEl = $('igHl');
    const state = { md: null, draft: null, ingame: null, shownKey: null, swapTimer: null, sponsors: [], sponsorIdx: 0 };

    function setImg(img, src) {
        if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    }

    function fitText(el, maxPx, minPx) {
        el.style.fontSize = `${maxPx}px`;
        let size = maxPx;
        while (el.scrollWidth > el.clientWidth && size > minPx) {
            size -= 2;
            el.style.fontSize = `${size}px`;
        }
    }

    const logoOf = (team) => (team && team.logo ? team.logo : 'Assets/Other/nologo.png');
    const teamKey = (side) => (side === 'red' ? 'redteam' : 'blueteam');

    function photoOf(side, playerName) {
        const roster = state.md && state.md.ssc && state.md.ssc.roster && state.md.ssc.roster[teamKey(side)];
        if (!roster || !playerName) return '';
        const n = playerName.trim().toLowerCase();
        const p = (roster.players || []).find(x => [x.label, x.nick, x.name].some(v => v && v.trim().toLowerCase() === n));
        return p && p.foto ? p.foto : '';
    }

    // ---------- Isi banner ----------
    function fillMvp() {
        const md = state.md, ig = state.ingame;
        if (!md || !md.teamdata || !ig) return;
        const { side, slot } = ig.mvp;
        const team = md.teamdata[teamKey(side)] || {};
        const player = (team.playerlist || [])[slot] || {};
        const picks = state.draft ? ((side === 'red' ? state.draft.redside : state.draft.blueside) || {}).pick || [] : [];
        const heroSrc = picks[slot] && picks[slot].hero ? picks[slot].hero : '';
        const info = heroSrc && window.HeroAssets ? HeroAssets.byImg(heroSrc) : null;

        document.documentElement.style.setProperty('--ig-team', TEAM_COLOR[side]);
        const art = $('igHeroArt');
        setImg(art, info ? (info.full || info.portrait) : logoOf(team));
        art.style.objectPosition = info && info.focus ? info.focus : (info && info.full ? '50% 22%' : '50% 15%');

        const photo = photoOf(side, player.name);
        mvpEl.classList.toggle('no-photo', !photo);
        if (photo) setImg($('igPhoto'), photo);

        setImg($('igTeamLogo'), logoOf(team));
        const nick = $('igNick');
        nick.textContent = (player.name || '').toUpperCase();
        fitText(nick, 76, 36);
        $('igMeta').textContent = [info ? info.name : '', team.teamname || ''].filter(Boolean).join('  ·  ');

        const blue = md.teamdata.blueteam || {}, red = md.teamdata.redteam || {};
        setImg($('igLogoBlue'), logoOf(blue));
        setImg($('igLogoRed'), logoOf(red));
        $('igScoreBlue').textContent = blue.score || '0';
        $('igScoreRed').textContent = red.score || '0';
    }

    function render() {
        const ig = state.ingame;
        if (!ig) return;
        hlEl.classList.toggle('show', !!ig.highlights.show);

        const key = `${ig.mvp.side}:${ig.mvp.slot}`;
        clearTimeout(state.swapTimer);
        if (!ig.mvp.show) {
            mvpEl.classList.remove('show');
            state.shownKey = null;
            fillMvp(); // tetap perbarui isi di balik layar
        } else if (state.shownKey && state.shownKey !== key && mvpEl.classList.contains('show')) {
            mvpEl.classList.remove('show');
            state.swapTimer = setTimeout(() => { fillMvp(); mvpEl.classList.add('show'); }, SWAP_MS);
            state.shownKey = key;
        } else {
            fillMvp();
            mvpEl.classList.add('show');
            state.shownKey = key;
        }
    }

    // ---------- Sponsor (dari website, bergantian tiap 6 detik) ----------
    async function loadSponsors() {
        try {
            const d = await (await fetch('/api/ssc/sponsors', { cache: 'no-store' })).json();
            state.sponsors = d.list || [];
        } catch (e) { state.sponsors = []; }
        $('igSponsorBox').classList.toggle('empty', !state.sponsors.length);
        if (state.sponsors.length) setImg($('igSponsor'), state.sponsors[0].logo);
    }

    setInterval(() => {
        if (state.sponsors.length < 2) return;
        const img = $('igSponsor');
        img.style.opacity = '0';
        setTimeout(() => {
            state.sponsorIdx = (state.sponsorIdx + 1) % state.sponsors.length;
            setImg(img, state.sponsors[state.sponsorIdx].logo);
            img.style.opacity = '1';
        }, 400);
    }, 6000);
    setInterval(loadSponsors, 300000);

    // ---------- Data ----------
    const fetchJson = async (url) => (await fetch(url, { cache: 'no-store' })).json();

    async function loadAll() {
        try {
            const [md, d, ig] = await Promise.all([fetchJson('/api/matchdata'), fetchJson('/api/matchdraft'), fetchJson('/api/ingame')]);
            state.md = md; state.draft = d.draftdata; state.ingame = ig;
            render();
        } catch (e) { console.error('ingame load', e); }
    }

    let ws = null;
    function connect() {
        const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
        ws = new WebSocket(`${protocol}://${location.host}`);
        ws.onopen = loadAll;
        ws.onmessage = (event) => {
            let msg;
            try { msg = JSON.parse(event.data); } catch (e) { return; }
            if (msg.type === 'matchdata_update' && msg.data) {
                state.md = msg.data;
                if (state.ingame) fillMvp();
            } else if (msg.type === 'draftdata_update') {
                if (msg.data) { state.draft = msg.data; if (state.ingame) fillMvp(); } else loadAll();
            } else if (msg.type === 'ingame_update') {
                state.ingame = msg.state;
                render();
            }
        };
        ws.onclose = () => setTimeout(connect, 3000);
        ws.onerror = () => ws.close();
    }

    loadSponsors();
    (window.HeroAssets ? HeroAssets.load() : Promise.resolve()).then(connect);
})();
