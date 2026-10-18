/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// lineupdisplay.js — layar lineup hasil draft (Task 2)
// Data: tim & nickname dari /api/matchdata (diisi SSC Sync dari ssc2027.id), hero dari /api/matchdraft,
// role = lane yang diatur di control panel. Tampil otomatis setelah 10 hero terpilih (mode "auto"),
// atau dipaksa tampil / sembunyi dari control panel (mode "show" / "hide").

(function () {
    const AUTO_DELAY = 4500; // tunggu animasi pick terakhir di overlay draft selesai
    const LANES = {
        gold: 'GOLD LANE', junggle: 'JUNGLE', jungle: 'JUNGLE', mid: 'MID LANE', roam: 'ROAM', exp: 'EXP LANE'
    };

    const bg = new URLSearchParams(location.search).get('bg') || 'dark';
    document.body.classList.add(`bg-${bg}`);

    const root = document.getElementById('luRoot');
    const state = { md: null, draft: null, mapdraw: null, mode: 'auto', visible: false, autoTimer: null, firstEval: true };

    // ---------- Kartu ----------
    function buildCards() {
        ['blue', 'red'].forEach(side => {
            const group = document.getElementById(side === 'blue' ? 'luGroupBlue' : 'luGroupRed');
            group.innerHTML = '';
            for (let k = 0; k < 5; k++) {
                const card = document.createElement('div');
                card.className = `lu-card ${side} empty`;
                // muncul berjenjang dari tengah layar ke luar
                card.style.setProperty('--d', side === 'blue' ? 4 - k : k);
                card.innerHTML = `
                    <div class="lu-art"><img alt=""></div>
                    <div class="lu-photo"><img alt=""></div>
                    <div class="lu-heroname"><span></span></div>
                    <div class="lu-foot">
                        <div class="lu-role none"><img alt=""><span></span></div>
                        <div class="lu-nick"></div>
                    </div>`;
                group.appendChild(card);
            }
        });
    }

    function fitText(el, maxPx, minPx) {
        el.style.fontSize = `${maxPx}px`;
        let size = maxPx;
        while (el.scrollWidth > el.clientWidth && size > minPx) {
            size -= 1;
            el.style.fontSize = `${size}px`;
        }
    }

    function logoOf(team) {
        return team && team.logo ? team.logo : 'Assets/Other/nologo.png';
    }

    function setImg(img, src) {
        if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    }

    function render() {
        const md = state.md;
        const draft = state.draft;
        if (!md || !md.teamdata) return;
        const ssc = md.ssc || {};

        ['blue', 'red'].forEach(side => {
            const team = md.teamdata[side === 'blue' ? 'blueteam' : 'redteam'] || {};
            const cap = side === 'blue' ? 'Blue' : 'Red';
            const nameEl = document.getElementById(`luName${cap}`);
            nameEl.textContent = team.teamname || '';
            fitText(nameEl, 46, 24);
            document.getElementById(`luScore${cap}`).textContent = team.score || '0';
            setImg(document.getElementById(`luLogo${cap}`), logoOf(team));
            const roster = ssc.roster && ssc.roster[side === 'blue' ? 'blueteam' : 'redteam'];
            document.getElementById(`luSchool${cap}`).textContent = roster ? roster.school : '';

            const picks = draft ? (side === 'blue' ? draft.blueside.pick : draft.redside.pick) || [] : [];
            const cards = document.querySelectorAll(`#luGroup${cap} .lu-card`);
            cards.forEach((card, k) => {
                const player = (team.playerlist || [])[k] || {};
                const heroSrc = picks[k] && picks[k].hero ? picks[k].hero : '';
                const info = heroSrc && window.HeroAssets ? HeroAssets.byImg(heroSrc) : null;

                card.classList.toggle('empty', !heroSrc);
                setImg(card.querySelector('.lu-art img'), heroSrc || logoOf(team));
                card.querySelector('.lu-heroname span').textContent = info ? info.name.toUpperCase() : '';

                // foto pemain dari ssc2027.id (md.ssc.roster, dicocokkan lewat nickname yang tampil)
                const n = (player.name || '').trim().toLowerCase();
                const rp = n && roster ? (roster.players || []).find(x => [x.label, x.nick, x.name].some(v => v && v.trim().toLowerCase() === n)) : null;
                // sama seperti overlay draft: foto website → Assets/player/<nickname>.png → tanpa foto
                const photo = rp && rp.foto ? rp.foto : (player.name ? `Assets/player/${encodeURIComponent(player.name.trim())}.png` : '');
                const pimg = card.querySelector('.lu-photo img');
                if (photo && pimg.getAttribute('src') !== photo) {
                    pimg.dataset.failed = '';
                    pimg.onerror = () => { pimg.dataset.failed = '1'; card.classList.remove('has-photo'); };
                    pimg.setAttribute('src', photo);
                }
                card.classList.toggle('has-photo', !!photo && pimg.dataset.failed !== '1');

                const nick = card.querySelector('.lu-nick');
                nick.textContent = (player.name || '').toUpperCase();
                fitText(nick, 36, 16);

                const lane = (player.lane || 'none').toLowerCase();
                const role = card.querySelector('.lu-role');
                role.classList.toggle('none', !LANES[lane]);
                role.querySelector('span').textContent = LANES[lane] || '';
                if (LANES[lane]) setImg(role.querySelector('img'), `Assets/lane/${lane === 'jungle' ? 'junggle' : lane}.png`);
            });
        });

        document.getElementById('luRound').textContent = ssc.babak || '';
        document.getElementById('luStation').textContent = ssc.meja || '';
        // GAME n = skor kedua tim + 1 (lineup tampil sebelum game dimainkan)
        const blue = md.teamdata.blueteam || {}, red = md.teamdata.redteam || {};
        const game = (parseInt(blue.score, 10) || 0) + (parseInt(red.score, 10) || 0) + 1;
        document.getElementById('luGame').textContent = `GAME ${game}${state.bo ? ' · BO' + state.bo : ''}`;
        renderMap();
    }

    // nama map dari Map Draw (drawcontrol.html): tampil bila undian sudah berjalan / selesai
    function renderMap() {
        const d = state.mapdraw;
        const show = d && d.result && (d.status === 'drawing' || d.status === 'finished');
        document.getElementById('luMap').textContent = show ? String(d.result).toUpperCase() : '';
    }

    async function loadSponsors() {
        const box = document.getElementById('luSponsors');
        const logos = document.getElementById('luSponsorLogos');
        try {
            const d = await fetchJson('/api/ssc/sponsors');
            const list = d.list || [];
            logos.innerHTML = '';
            list.forEach(s => {
                const img = document.createElement('img');
                img.src = s.logo;
                img.alt = s.nama || '';
                logos.appendChild(img);
            });
            box.classList.toggle('empty', !list.length);
        } catch (e) { box.classList.add('empty'); }
    }

    // ---------- Tampil / sembunyi ----------
    function allPicked() {
        const d = state.draft;
        if (!d || !d.blueside || !d.redside) return false;
        const picks = [...(d.blueside.pick || []).slice(0, 5), ...(d.redside.pick || []).slice(0, 5)];
        return picks.length === 10 && picks.every(p => p && p.hero);
    }

    function setVisible(v) {
        state.visible = v;
        root.classList.toggle('is-visible', v);
    }

    function evaluate() {
        const auto = state.mode === 'auto' && allPicked();
        const want = state.mode === 'show' || auto;

        if (!want) {
            clearTimeout(state.autoTimer);
            state.autoTimer = null;
            if (state.visible) setVisible(false);
        } else if (!state.visible) {
            if (state.mode === 'show' || state.firstEval) {
                setVisible(true);
            } else if (!state.autoTimer) {
                state.autoTimer = setTimeout(() => {
                    state.autoTimer = null;
                    if (state.mode === 'auto' && allPicked()) setVisible(true);
                }, AUTO_DELAY);
            }
        }
        state.firstEval = false;
    }

    // ---------- Data ----------
    async function fetchJson(url) {
        const res = await fetch(url, { cache: 'no-store' });
        return res.json();
    }

    async function loadMatch() {
        try { state.md = await fetchJson('/api/matchdata'); render(); } catch (e) { console.error('matchdata', e); }
    }

    async function loadDraft() {
        try { const d = await fetchJson('/api/matchdraft'); state.draft = d.draftdata; render(); } catch (e) { console.error('matchdraft', e); }
    }

    async function loadControl() {
        try { const c = await fetchJson('/api/lineup-control'); state.mode = c.mode || 'auto'; } catch (e) {}
    }

    async function loadMap() {
        try { const m = await fetchJson('/api/mapdraw'); state.mapdraw = m.drawdata; renderMap(); } catch (e) {}
    }

    async function loadFormat() {
        try { state.bo = (await fetchJson('/api/match-format')).bo; render(); } catch (e) {}
    }

    let ws = null;
    function connect() {
        const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
        ws = new WebSocket(`${protocol}://${location.host}`);
        ws.onopen = async () => {
            await Promise.all([loadMatch(), loadDraft(), loadControl(), loadMap(), loadSponsors(), loadFormat()]);
            evaluate();
        };
        ws.onmessage = (event) => {
            let msg;
            try { msg = JSON.parse(event.data); } catch (e) { return; }
            if (msg.type === 'matchdata_update') {
                if (msg.data) { state.md = msg.data; render(); } else loadMatch();
            } else if (msg.type === 'draftdata_update') {
                if (msg.data) { state.draft = msg.data; render(); evaluate(); } else loadDraft().then(evaluate);
            } else if (msg.type === 'lineup_control') {
                state.mode = msg.mode;
                evaluate();
            } else if (msg.type === 'matchformat_update' && msg.data) {
                state.bo = msg.data.bo;
                render();
            } else if (msg.type === 'mapdraw_update') {
                state.mapdraw = msg.data;
                renderMap();
            }
        };
        ws.onclose = () => setTimeout(connect, 3000);
        ws.onerror = () => ws.close();
    }

    buildCards();
    (window.HeroAssets ? HeroAssets.load() : Promise.resolve()).then(connect);
})();
