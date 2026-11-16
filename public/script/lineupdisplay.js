/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// lineupdisplay.js — Lineup + Statistik (tema SSC 2027).
// Data: tim & nickname dari /api/matchdata (SSC Sync), hero dari /api/matchdraft, spell = pilihan di Control Panel.
// Lineup tampil otomatis setelah 10 hero terpilih (mode "auto") atau dipaksa show / hide. Tombol TAMPILKAN STATISTIK
// (area putih di bawah 1080 px, Control Panel, atau Stream Deck) membuka panel statistik di antara dua baris:
// angka dihitung server (/api/lineup-stats) dari data Academy MLBB.

(function () {
    const AUTO_DELAY = 4500; // tunggu animasi pick terakhir di overlay draft selesai
    const SPELLS = ['Flicker', 'Retribution', 'Execute', 'Purify', 'Sprint', 'Aegis', 'Inspire', 'Vengeance', 'Flameshot', 'Petrify', 'Revitalize', 'Arrival'];
    const CTRL_H = 170;

    const qs = new URLSearchParams(location.search);
    const bg = qs.get('bg') || 'poster';
    document.body.classList.add(`bg-${bg}`);
    // area tombol: tidak dipakai di OBS (window.obsstudio) atau bila ?ctrl=0
    const withCtrl = qs.get('ctrl') !== '0' && !window.obsstudio;
    if (!withCtrl) document.body.classList.add('no-ctrl');

    const $ = (id) => document.getElementById(id);
    const root = $('luRoot');
    const state = { md: null, draft: null, mapdraw: null, mode: 'auto', stats: false, statsData: null, visible: false, autoTimer: null, firstEval: true };
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    // ---------- Pratinjau di browser biasa: area siaran diperkecil agar tombol di bawah ikut terlihat ----------
    function fit() {
        const vp = $('luViewport');
        if (!withCtrl || (window.innerWidth === 1920 && window.innerHeight >= 1080)) {
            root.style.transform = '';
            vp.style.width = '1920px';
            vp.style.height = '1080px';
            return;
        }
        const s = Math.min(1, window.innerWidth / 1920, Math.max(0.3, (window.innerHeight - CTRL_H) / 1080));
        root.style.transform = `scale(${s})`;
        vp.style.width = `${1920 * s}px`;
        vp.style.height = `${1080 * s}px`;
    }
    window.addEventListener('resize', fit);

    // ---------- Kartu ----------
    function buildCards() {
        ['blue', 'red'].forEach(side => {
            const group = $(side === 'blue' ? 'luGroupBlue' : 'luGroupRed');
            group.innerHTML = '';
            for (let k = 0; k < 5; k++) {
                const card = document.createElement('div');
                card.className = `lu-card ${side} empty`;
                card.style.setProperty('--d', k);
                card.innerHTML = `
                    <div class="lu-art"><img alt=""></div>
                    <div class="lu-photo"><img alt=""></div>
                    <div class="lu-tags">
                        <div class="lu-heroname"></div>
                        <div class="lu-nick"></div>
                        <div class="lu-spell none"><img alt=""><span></span></div>
                    </div>`;
                group.appendChild(card);
            }
        });
    }

    function fitText(el, maxPx, minPx) {
        el.style.fontSize = '';
        let size = maxPx;
        el.style.fontSize = `${size}px`;
        while (el.scrollWidth > el.clientWidth && size > minPx) {
            size -= 1;
            el.style.fontSize = `${size}px`;
        }
    }
    const logoOf = (team) => (team && team.logo ? team.logo : 'Assets/Other/nologo.png');
    function setImg(img, src) { if (img.getAttribute('src') !== src) img.setAttribute('src', src); }

    function render() {
        const md = state.md, draft = state.draft;
        if (!md || !md.teamdata) return;
        const ssc = md.ssc || {};
        const compact = state.stats && state.visible;

        ['blue', 'red'].forEach(side => {
            const team = md.teamdata[side === 'blue' ? 'blueteam' : 'redteam'] || {};
            const cap = side === 'blue' ? 'Blue' : 'Red';
            const nameEl = $(`luName${cap}`);
            nameEl.textContent = (team.teamname || '').toUpperCase();
            fitText(nameEl, 54, 26);
            $(`luScore${cap}`).textContent = team.score || '0';
            for (const id of [`luLogo${cap}`, `luTagLogo${cap}`, `lsLogo${cap}`]) setImg($(id), logoOf(team));
            $(`luTagName${cap}`).textContent = (team.teamname || '').toUpperCase();
            $(`lsName${cap}`).textContent = (team.teamname || '').toUpperCase();
            const roster = ssc.roster && ssc.roster[side === 'blue' ? 'blueteam' : 'redteam'];
            $(`luSchool${cap}`).textContent = roster ? roster.school || '' : '';

            const picks = draft ? ((side === 'blue' ? draft.blueside : draft.redside) || {}).pick || [] : [];
            document.querySelectorAll(`#luGroup${cap} .lu-card`).forEach((card, k) => {
                const player = (team.playerlist || [])[k] || {};
                const heroSrc = picks[k] && picks[k].hero ? picks[k].hero : '';
                const info = heroSrc && window.HeroAssets ? HeroAssets.byImg(heroSrc) : null;

                card.classList.toggle('empty', !heroSrc);
                const art = card.querySelector('.lu-art img');
                setImg(art, heroSrc ? (info && info.full) || heroSrc : logoOf(team));
                const f = info && info.focus ? info.focus : null;
                art.style.setProperty('--fx', `${f && f.x != null ? f.x : 50}%`);
                art.style.setProperty('--fy', `${f && f.y != null ? f.y : 25}%`);
                card.querySelector('.lu-heroname').textContent = info ? info.name.toUpperCase() : '';

                // foto pemain dari ssc2027.id (md.ssc.roster) → Assets/player/<nickname>.png → tanpa foto
                const n = (player.name || '').trim().toLowerCase();
                const rp = n && roster ? (roster.players || []).find(x => [x.label, x.nick, x.name].some(v => v && v.trim().toLowerCase() === n)) : null;
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
                fitText(nick, compact ? 32 : 40, 16);

                const spell = SPELLS.includes(player.spell) ? player.spell : '';
                const sp = card.querySelector('.lu-spell');
                sp.classList.toggle('none', !spell);
                sp.querySelector('span').textContent = spell.toUpperCase();
                if (spell) setImg(sp.querySelector('img'), `Assets/Itemandspell/${spell}.png`);
            });
        });

        $('luRound').textContent = ssc.babak || '';
        $('luStation').textContent = ssc.meja || '';
        // GAME n = skor kedua tim + 1 (lineup tampil sebelum game dimainkan)
        const blue = md.teamdata.blueteam || {}, red = md.teamdata.redteam || {};
        const game = (parseInt(blue.score, 10) || 0) + (parseInt(red.score, 10) || 0) + 1;
        $('luGame').textContent = `GAME ${game}${state.bo ? ' · BO' + state.bo : ''}`;
        renderMap();
    }

    function renderMap() {
        const d = state.mapdraw;
        const show = d && d.result && (d.status === 'drawing' || d.status === 'finished');
        $('luMap').textContent = show ? String(d.result).toUpperCase() : '';
    }

    // ---------- Statistik ----------
    const fmt2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
    const fmtSigned = (v) => (v > 0 ? '+' : '') + (Math.round(v * 10) / 10).toFixed(1);
    function renderStats() {
        const d = state.statsData;
        if (!d || !d.blue || !d.red) return;
        $('lsBars').innerHTML = (d.keys || []).map((k, i) => {
            const a = d.blue.stats[k], b = d.red.stats[k];
            return `<div class="ls-row" style="--i:${i}">
                <div class="ls-label">${esc(d.labels[k])}</div>
                <div class="ls-line">
                    <span class="ls-val l ${a > b ? 'lead' : ''}">${fmt2(a)}</span>
                    <span class="ls-track l"><span class="ls-fill" style="--w:${Math.max(0, Math.min(100, a * 10))}%"></span></span>
                    <span class="ls-mid"></span>
                    <span class="ls-track r"><span class="ls-fill" style="--w:${Math.max(0, Math.min(100, b * 10))}%"></span></span>
                    <span class="ls-val r ${b > a ? 'lead' : ''}">${fmt2(b)}</span>
                </div>
            </div>`;
        }).join('');
        for (const [side, cap] of [['blue', 'Blue'], ['red', 'Red']]) {
            const c = d[side].counter;
            const el = $(`lsCounter${cap}`);
            el.textContent = fmtSigned(c);
            el.className = 'ls-counter' + (c > 0 ? ' pos' : c < 0 ? ' neg' : '');
            $(`lsRating${cap}`).textContent = (Math.round(d[side].rating * 10) / 10).toFixed(1);
        }
    }

    async function loadStats() {
        try { state.statsData = await fetchJson('/api/lineup-stats'); renderStats(); renderCtrl(); } catch (e) {}
    }

    function applyStats() {
        const on = state.stats && state.visible;
        if (on && !root.classList.contains('stats-on')) {
            renderStats();
            // bar mulai dari 0 lalu tumbuh (paksa reflow sebelum kelas aktif)
            void root.offsetWidth;
        }
        root.classList.toggle('stats-on', on);
        render();
    }

    // ---------- Sponsor ----------
    async function loadSponsors() {
        const box = $('luSponsors'), logos = $('luSponsorLogos');
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
        applyStats();
        renderCtrl();
    }

    function evaluate() {
        const auto = state.mode === 'auto' && allPicked();
        const want = state.mode === 'show' || auto;
        if (!want) {
            clearTimeout(state.autoTimer);
            state.autoTimer = null;
            if (state.visible) setVisible(false);
        } else if (!state.visible) {
            if (state.mode === 'show' || state.firstEval || state.stats) {
                setVisible(true);
            } else if (!state.autoTimer) {
                state.autoTimer = setTimeout(() => {
                    state.autoTimer = null;
                    if (state.mode === 'auto' && allPicked()) setVisible(true);
                }, AUTO_DELAY);
            }
        }
        state.firstEval = false;
        applyStats();
        renderCtrl();
    }

    // ---------- Area tombol operator ----------
    let ctrlMsg = null, ctrlMsgTimer = null;
    function renderCtrl() {
        if (!withCtrl) return;
        document.querySelectorAll('.lu-ctrl [data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === state.mode));
        const ready = !!(state.statsData && state.statsData.ready);
        $('luStatsShow').disabled = !ready || state.stats;
        $('luStatsHide').disabled = !state.stats;
        const el = $('luCtrlStatus');
        let text, cls = '';
        if (ctrlMsg) { text = ctrlMsg.text; cls = ctrlMsg.err ? 'err' : 'ok'; }
        else if (!ready) text = 'Statistik menunggu 10 hero terpilih di draft.';
        else if (state.stats && state.visible) { text = 'Statistik sedang TAMPIL.'; cls = 'ok'; }
        else if (state.stats) text = 'Statistik aktif, lineup sedang disembunyikan.';
        else text = state.visible ? 'Lineup tampil · statistik tersembunyi.' : 'Lineup tersembunyi.';
        const unknown = state.statsData && state.statsData.unknown && state.statsData.unknown.length ? ` Hero tanpa data (dihitung 5): ${state.statsData.unknown.join(', ')}.` : '';
        el.textContent = text + (ctrlMsg ? '' : unknown);
        el.className = cls;
    }
    function flash(text, err) {
        ctrlMsg = { text, err };
        clearTimeout(ctrlMsgTimer);
        ctrlMsgTimer = setTimeout(() => { ctrlMsg = null; renderCtrl(); }, 4000);
        renderCtrl();
    }
    async function control(body) {
        try {
            const res = await fetch('/api/lineup-control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const out = await res.json();
            if (!res.ok) throw new Error(out.message || 'Gagal');
            state.mode = out.mode; state.stats = !!out.stats;
            evaluate();
        } catch (e) { flash(e.message, true); }
    }
    if (withCtrl) {
        $('luStatsShow').addEventListener('click', () => control({ stats: true }));
        $('luStatsHide').addEventListener('click', () => control({ stats: false }));
        document.querySelectorAll('.lu-ctrl [data-mode]').forEach(b => b.addEventListener('click', () => control({ mode: b.dataset.mode })));
    }

    // ---------- Data ----------
    async function fetchJson(url) {
        const res = await fetch(url, { cache: 'no-store' });
        return res.json();
    }
    async function loadMatch() { try { state.md = await fetchJson('/api/matchdata'); render(); } catch (e) { console.error('matchdata', e); } }
    async function loadDraft() { try { const d = await fetchJson('/api/matchdraft'); state.draft = d.draftdata; render(); } catch (e) { console.error('matchdraft', e); } }
    async function loadControl() { try { const c = await fetchJson('/api/lineup-control'); state.mode = c.mode || 'auto'; state.stats = !!c.stats; } catch (e) {} }
    async function loadMap() { try { const m = await fetchJson('/api/mapdraw'); state.mapdraw = m.drawdata; renderMap(); } catch (e) {} }
    async function loadFormat() { try { state.bo = (await fetchJson('/api/match-format')).bo; render(); } catch (e) {} }

    let statsTimer = null;
    const loadStatsSoon = () => { clearTimeout(statsTimer); statsTimer = setTimeout(loadStats, 250); };

    let ws = null;
    function connect() {
        const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
        ws = new WebSocket(`${protocol}://${location.host}`);
        ws.onopen = async () => {
            await Promise.all([loadMatch(), loadDraft(), loadControl(), loadMap(), loadSponsors(), loadFormat(), loadStats()]);
            evaluate();
        };
        ws.onmessage = (event) => {
            let msg;
            try { msg = JSON.parse(event.data); } catch (e) { return; }
            if (msg.type === 'matchdata_update') {
                if (msg.data) { state.md = msg.data; render(); } else loadMatch();
                loadStatsSoon();
            } else if (msg.type === 'draftdata_update') {
                if (msg.data) { state.draft = msg.data; render(); evaluate(); } else loadDraft().then(evaluate);
                loadStatsSoon();
            } else if (msg.type === 'lineup_control') {
                state.mode = msg.mode || state.mode;
                if (msg.stats != null) state.stats = !!msg.stats;
                evaluate();
            } else if (msg.type === 'lineup_stats_update') {
                loadStatsSoon();
            } else if (msg.type === 'matchformat_update' && msg.data) {
                state.bo = msg.data.bo;
                render();
            } else if (msg.type === 'mapdraw_update') {
                state.mapdraw = msg.data;
                renderMap();
            } else if (msg.type === 'herofocus_update' && window.HeroAssets) {
                HeroAssets.reload().then(render);
            }
        };
        ws.onclose = () => setTimeout(connect, 3000);
        ws.onerror = () => ws.close();
    }

    fit();
    buildCards();
    const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    Promise.all([window.HeroAssets ? HeroAssets.load() : Promise.resolve(), fontsReady]).then(connect);
})();
