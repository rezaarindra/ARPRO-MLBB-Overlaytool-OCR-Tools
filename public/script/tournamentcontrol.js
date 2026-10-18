/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// tournamentcontrol.js — simpan hasil game, daftar game, grup, editor bracket, link overlay turnamen.
(() => {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const get = async (url) => (await fetch(url, { cache: 'no-store' })).json();
    const post = async (url, body) => {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.message || 'Gagal');
        return j;
    };
    const msg = (id, text, ok = true) => { const el = $(id); el.textContent = text; el.className = 'tc-msg ' + (ok ? 'ok' : 'err'); };
    let state = { games: [], bracket: { size: 8, bo: [3, 3, 5], teams: [], scores: {} } };

    // ---------- 1 · pertandingan yang sedang tampil ----------
    async function loadMatch() {
        try {
            const [md, mvp, tour] = await Promise.all([get('/api/matchdata'), get('/api/mvp'), get('/api/tournament')]);
            const b = md.teamdata.blueteam, r = md.teamdata.redteam, w = md.winmatches;
            $('tcMatch').innerHTML = `<div class="b ${w === 'blue' ? 'w' : ''}">${esc(b.teamname || 'BLUE')}</div><div class="v">VS</div><div class="r ${w === 'red' ? 'w' : ''}">${esc(r.teamname || 'RED')}</div>`;
            const mvpName = mvp && mvp.mvp ? mvp.mvp.nickname : '-';
            const bo = tour.matchFormat && tour.matchFormat.bo ? 'BO' + tour.matchFormat.bo : 'skor angka (dihitung BO3)';
            $('tcMatchMeta').textContent = `Game ${md.game_number || '-'} · durasi ${md.game_duration || '-'} · MVP ${mvpName}\nPemenang: ${w === 'blue' ? b.teamname : w === 'red' ? r.teamname : 'BELUM DIPILIH'} · format ${bo}`;
        } catch (e) {}
    }
    $('tcSaveGame').addEventListener('click', async () => {
        try { const r = await post('/api/tournament/game'); msg('tcSaveMsg', r.message); }
        catch (e) { msg('tcSaveMsg', e.message, false); }
    });

    // ---------- 2 · pengaturan ----------
    async function loadSettings() {
        const t = await get('/api/tournament');
        state.games = t.games; state.bracket = t.bracket || state.bracket;
        $('tcName').value = t.name || '';
        $('tcGroups').value = Object.entries(t.groups || {}).map(([team, g]) => `${team} = ${g}`).join('\n');
        renderGames(); renderBracketForm();
    }
    $('tcFillTeams').addEventListener('click', async () => {
        const st = await get('/api/tournament/stats');
        const have = new Set($('tcGroups').value.split('\n').map(l => l.split('=')[0].trim().toLowerCase()).filter(Boolean));
        const add = st.teams.filter(t => !have.has(t.name.toLowerCase())).map(t => `${t.name} = `);
        $('tcGroups').value = [$('tcGroups').value.trim(), ...add].filter(Boolean).join('\n');
    });
    $('tcSaveSettings').addEventListener('click', async () => {
        const groups = {};
        for (const line of $('tcGroups').value.split('\n')) {
            const i = line.lastIndexOf('=');
            if (i > 0 && line.slice(i + 1).trim()) groups[line.slice(0, i).trim()] = line.slice(i + 1).trim();
        }
        try { await post('/api/tournament/settings', { name: $('tcName').value, groups }); msg('tcSettingsMsg', 'Tersimpan.'); }
        catch (e) { msg('tcSettingsMsg', e.message, false); }
    });

    // ---------- 3 · daftar game ----------
    function renderGames() {
        $('tcCount').textContent = `${state.games.length} game tersimpan`;
        $('tcGames').innerHTML = state.games.slice().reverse().map(g => `
            <tr><td>${new Date(g.at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                <td>${g.game || '-'}</td>
                <td class="${g.winner === 'blue' ? 'win' : ''}">${esc(g.blue)}</td>
                <td class="${g.winner === 'red' ? 'win' : ''}">${esc(g.red)}</td>
                <td>${esc(g.mvp || '-')}</td>
                <td><button data-del="${g.id}">HAPUS</button></td></tr>`).join('') || '<tr><td colspan="6" style="color:var(--muted)">Belum ada game.</td></tr>';
    }
    $('tcGames').addEventListener('click', async (e) => {
        const b = e.target.closest('button[data-del]');
        if (!b) return;
        if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'YAKIN?'; b.classList.add('danger'); setTimeout(() => { b.dataset.armed = ''; b.textContent = 'HAPUS'; b.classList.remove('danger'); }, 2500); return; }
        await post('/api/tournament/game/delete', { id: b.dataset.del });
    });
    $('tcReset').addEventListener('click', async () => {
        const typed = prompt('Semua hasil game, grup, dan bracket akan dihapus.\nKetik RESET untuk melanjutkan:');
        if (typed !== 'RESET') return;
        await post('/api/tournament/reset', { confirm: 'RESET' });
    });

    // ---------- 4 · bracket ----------
    document.querySelectorAll('.br-bo').forEach((s, i) => {
        s.innerHTML = [1, 3, 5, 7].map(v => `<option value="${v}">BO${v}</option>`).join('');
        s.dataset.round = i;
    });
    function renderBracketForm(view) {
        const b = state.bracket, size = +b.size || 8;
        $('brSize').value = size;
        document.querySelectorAll('.br-bo').forEach((s, i) => { s.value = (b.bo || [])[i] || (b.bo || [3])[(b.bo || [3]).length - 1] || 3; });
        const draw = (v) => {
            $('brRounds').innerHTML = v.rounds.map((r, ri) => `<div class="br-round"><h4>${r.name} · BO${r.matches[0] ? r.matches[0].bo : ''}</h4>${r.matches.map((m, mi) => `
                <div class="br-m">${[['a', 'sa', 0], ['b', 'sb', 1]].map(([t, s, k]) => `
                    <div class="br-t ${m.winner && m.winner === m[t] ? 'win' : ''}">
                        ${ri === 0 ? `<input class="team" data-slot="${mi * 2 + k}" value="${esc(m[t])}" placeholder="Tim ${mi * 2 + k + 1}">` : `<div class="nm">${esc(m[t]) || 'TBD'}</div>`}
                        <input type="number" min="0" max="4" data-score="r${ri}m${mi}" data-k="${k}" value="${m[s] || 0}">
                    </div>`).join('')}</div>`).join('')}</div>`).join('');
        };
        if (view) draw(view); else get('/api/tournament/bracket').then(draw);
    }
    function collectBracket() {
        const size = +$('brSize').value, teams = Array(size).fill(''), scores = {};
        document.querySelectorAll('#brRounds input.team').forEach(i => { if (+i.dataset.slot < size) teams[+i.dataset.slot] = i.value.trim(); });
        document.querySelectorAll('#brRounds input[data-score]').forEach(i => {
            const k = i.dataset.score; scores[k] = scores[k] || [0, 0]; scores[k][+i.dataset.k] = +i.value || 0;
        });
        return { size, bo: [...document.querySelectorAll('.br-bo')].map(s => +s.value), teams, scores };
    }
    $('brSize').addEventListener('change', async () => {
        const v = await post('/api/tournament/bracket', { ...collectBracket(), size: +$('brSize').value });
        state.bracket = { ...collectBracket(), size: v.size }; renderBracketForm(v);
    });
    $('brSave').addEventListener('click', async () => {
        try { const v = await post('/api/tournament/bracket', collectBracket()); renderBracketForm(v); msg('brMsg', v.champion ? `Tersimpan · juara: ${v.champion}` : 'Tersimpan.'); }
        catch (e) { msg('brMsg', e.message, false); }
    });

    // ---------- 5 · link overlay ----------
    const LINKS = [
        ['herostats.html', 'Hero Stats: most picked / banned / presence + win rate'],
        ['leaderboard.html', 'Leaderboard ringkas: KDA, Kills, MVP, Avg Gold'],
        ['leaderboard.html?stat=kda', 'Leaderboard detail KDA (ganti stat=kills|assists|mvp|gold)'],
        ['standings.html', 'Klasemen semua tim (tambah &group=A, &advance=4)'],
        ['bracket.html', 'Bracket playoff'],
        ['h2h.html', 'Head-to-head tim biru vs merah yang sedang main'],
        ['companion.html', 'Daftar URL tombol Stream Deck / Companion']
    ];
    $('tcLinks').innerHTML = LINKS.map(([p, d]) => {
        const url = `${location.protocol}//${location.host}/${p}`;
        return `<div class="lk"><div><code>${esc(url)}</code><small>${esc(d)}</small></div><button data-copy="${esc(url)}">COPY</button><a href="/${p}" target="_blank">BUKA</a></div>`;
    }).join('');
    $('tcLinks').addEventListener('click', async (e) => {
        const b = e.target.closest('button[data-copy]');
        if (!b) return;
        try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'COPIED'; }
        catch (err) { prompt('Salin URL:', b.dataset.copy); }
        setTimeout(() => { b.textContent = 'COPY'; }, 1200);
    });

    // ---------- live ----------
    function connect() {
        const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
        ws.onopen = () => { loadMatch(); loadSettings(); };
        ws.onmessage = (ev) => {
            const m = JSON.parse(ev.data);
            if (m.type === 'tournament_update') { get('/api/tournament').then(t => { state.games = t.games; renderGames(); }); loadMatch(); }
            else if (['matchdata_update', 'mvp_update', 'matchformat_update'].includes(m.type)) loadMatch();
        };
        ws.onclose = () => setTimeout(connect, 2000);
    }
    connect();
})();
