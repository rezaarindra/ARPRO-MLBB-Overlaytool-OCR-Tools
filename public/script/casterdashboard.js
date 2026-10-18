/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// casterdashboard.js — data dari GET /api/caster (dihitung server), live strip dari WebSocket ocr_game.
(() => {
    const $ = (id) => document.getElementById(id);
    const { esc, heroImg, playerImg } = T;
    const LANE = { gold: 'GOLD LANE', junggle: 'JUNGLE', jungle: 'JUNGLE', mid: 'MID LANE', roam: 'ROAM', exp: 'EXP LANE' };
    const TAGS = ['SEMUA', 'SERIES', 'H2H', 'FORM', 'TIM', 'PEMAIN', 'DRAFT', 'MILESTONE', 'REKOR', 'LIVE'];
    let data = null, filter = 'SEMUA';

    // poin yang sudah dibacakan caster dicoret (disimpan di browser ini saja)
    let used = new Set();
    try { used = new Set(JSON.parse(localStorage.getItem('cdUsed') || '[]')); } catch (e) {}
    const saveUsed = () => { try { localStorage.setItem('cdUsed', JSON.stringify([...used].slice(-300))); } catch (e) {} };

    setInterval(() => { $('cdClock').textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); }, 1000);

    const fmtDur = (s) => s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '-';
    const fmtGold = (n) => Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);

    function team(el, t, side) {
        const x = t.stats, f = t.form;
        const streak = f.streak && f.streak.n >= 2 ? `<span>${f.streak.type === 'W' ? 'MENANG' : 'KALAH'} ${f.streak.n}x BERUNTUN</span>` : '';
        const pills = f.last5.map(r => `<i class="${r}">${r}</i>`).join('');
        el.innerHTML = `
            <img class="cd-logo" src="${esc(t.logo || 'Assets/Other/nologo.png')}" onerror="this.src='Assets/Other/nologo.png'">
            <div>
                <div class="cd-tname">${esc(t.name || (side === 'blue' ? 'TIM BIRU' : 'TIM MERAH'))}</div>
                <div class="cd-rec">${x && x.games ? `Series <b>${x.seriesWins}-${x.seriesLosses}</b> · Game <b>${x.gameWins}-${x.gameLosses}</b> · WR <b>${Math.round(x.winRate * 100)}%</b> · Durasi rata-rata <b>${fmtDur(x.avgDuration)}</b>` : 'Belum ada game tersimpan'}</div>
                <div class="cd-form">${side === 'red' ? streak + pills : pills + streak}</div>
            </div>`;
    }

    function players(el, t) {
        el.innerHTML = t.players.map(p => {
            const pool = p.pool.map(h => `<span class="${p.hero && T.sameHero(h.hero, p.hero) ? 'cur' : ''}"><img src="${esc(heroImg(h.hero))}" onerror="this.style.visibility='hidden'">${esc(h.hero)} ${h.games}G ${h.wins}W</span>`).join('');
            const initial = esc((p.name || '?').slice(0, 2).toUpperCase());
            return `<div class="cd-p">
                <div class="cd-ph"><img src="${esc(playerImg(p.name))}" onerror="this.remove()">${initial}</div>
                <img class="cd-hero ${p.hero ? '' : 'none'}" src="${esc(p.hero ? heroImg(p.hero) : 'Assets/Other/noslot.png')}" onerror="this.classList.add('none')">
                <div>
                    <div class="cd-pn"><b>${esc(p.name || '-')}</b><em>${esc(LANE[p.lane] || '')}</em>${p.hero ? `<span class="hn">${esc(p.hero)}${p.onHero ? ` · ${p.onHero.games}G ${p.onHero.wins}W` : ''}</span>` : ''}</div>
                    ${p.games ? `<div class="cd-stats">
                        <span><b>${p.games}</b> game</span><span>WR <b>${Math.round(p.winRate * 100)}%</b></span>
                        <span>KDA <b>${p.kda.toFixed(1)}</b></span><span>avg <b>${p.avg.join('/')}</b></span>
                        <span>kill <b>${p.killsTotal}</b></span>${p.mvp ? `<span>MVP <b>${p.mvp}</b></span>` : ''}
                    </div><div class="cd-pool">${pool}</div>` : '<div class="cd-new">Belum ada data di turnamen ini</div>'}
                </div>
            </div>`;
        }).join('') || '<div class="cd-empty">Daftar pemain kosong. Isi di control panel.</div>';
    }

    function talkingPoints() {
        const tp = data.talkingPoints, present = new Set(tp.map(x => x.tag));
        $('cdFilter').innerHTML = TAGS.filter(t => t === 'SEMUA' || present.has(t))
            .map(t => `<button data-tag="${t}" class="${t === filter ? 'on' : ''}">${t}${t === 'SEMUA' ? '' : ' ' + tp.filter(x => x.tag === t).length}</button>`).join('');
        const sideOf = (n) => n && n === data.blue.name ? 'blue' : n && n === data.red.name ? 'red' : '';
        const list = tp.filter(x => filter === 'SEMUA' || x.tag === filter);
        $('cdList').innerHTML = list.map(x => `<div class="cd-item ${sideOf(x.side)} ${used.has(x.text) ? 'used' : ''}" data-text="${esc(x.text)}" title="Klik untuk menandai sudah dibacakan">
            <span class="cd-tag ${x.tag}">${x.tag}</span><span>${esc(x.text)}</span></div>`).join('')
            || '<div class="cd-empty">Belum ada talking point. Simpan hasil game di Tournament Control agar statistik terisi.</div>';
        const r = data.records;
        $('cdRecords').innerHTML = [
            `<div>Total game tersimpan: <b>${data.totalGames}</b></div>`,
            r.kills ? `<div>Rekor kill: <b>${r.kills.k}</b> · ${esc(r.kills.player)} (${esc(r.kills.hero || '-')})</div>` : '',
            r.fastest ? `<div>Game tercepat: <b>${esc(r.fastest.duration)}</b> · ${esc(r.fastest.vs)}</div>` : '',
            r.longest ? `<div>Game terlama: <b>${esc(r.longest.duration)}</b> · ${esc(r.longest.vs)}</div>` : '',
            r.mvp ? `<div>MVP terbanyak: <b>${esc(r.mvp.player)}</b> (${r.mvp.mvp}x)</div>` : ''
        ].join('');
    }

    $('cdFilter').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { filter = b.dataset.tag; talkingPoints(); } });
    $('cdList').addEventListener('click', (e) => {
        const it = e.target.closest('.cd-item'); if (!it) return;
        const t = it.dataset.text;
        used.has(t) ? used.delete(t) : used.add(t);
        it.classList.toggle('used');
        saveUsed();
    });

    function live(s) {
        if (!s || !s.live || s.t == null) { $('cdLive').hidden = true; return; }
        $('cdLive').hidden = false;
        $('cdKb').textContent = s.kills[1] ?? 0;
        $('cdKr').textContent = s.kills[2] ?? 0;
        $('cdTime').textContent = fmtDur(s.t) === '-' ? '0:00' : fmtDur(s.t);
        const bn = data ? data.blue.name || 'BIRU' : 'BIRU', rn = data ? data.red.name || 'MERAH' : 'MERAH';
        $('cdLead').innerHTML = s.lead == null ? '' : s.lead === 0 ? 'GOLD IMBANG'
            : `<span style="color:var(--${s.lead > 0 ? 'blue' : 'red'})">${esc(s.lead > 0 ? bn : rn)} +${fmtGold(Math.abs(s.lead))} GOLD</span>`;
        $('cdObj').innerHTML = (s.objectives || []).map(o => `<span class="${o.alive ? 'alive' : o.warn ? 'warn' : ''}">${o.label} ${o.alive ? 'AKTIF' : fmtDur(o.remain)}</span>`).join('');
    }

    async function load() {
        data = await T.get('/api/caster');
        $('cdTour').textContent = data.tournament || 'TALKING POINTS · STATISTIK';
        $('cdGame').textContent = data.game || '-';
        $('cdBo').textContent = data.bo ? 'BO' + data.bo : '-';
        // skor series = skor yang sedang tampil di overlay (control panel)
        $('cdSa').textContent = data.blue.score; $('cdSb').textContent = data.red.score;
        $('cdH2h').textContent = data.h2h.games ? `HEAD-TO-HEAD ${data.h2h.blue} - ${data.h2h.red} (${data.h2h.games} GAME)` : 'HEAD-TO-HEAD: PERTEMUAN PERTAMA';
        team($('cdBlue'), data.blue, 'blue');
        team($('cdRed'), data.red, 'red');
        players($('cdPb'), data.blue);
        players($('cdPr'), data.red);
        talkingPoints();
        live(data.live);
    }

    T.live(load, ['tournament_update', 'matchdata_update', 'draftdata_update', 'matchformat_update']);
    setInterval(() => load().catch(() => {}), 20000); // talking point LIVE (gold) ikut segar

    // live strip OCR: langsung dari WebSocket tanpa memuat ulang semua data
    (function connect() {
        const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
        ws.onmessage = (ev) => { try { const m = JSON.parse(ev.data); if (m.type === 'ocr_game') live(m.data); if (m.type === 'ocr_game_reset') $('cdLive').hidden = true; } catch (e) {} };
        ws.onclose = () => setTimeout(connect, 2000);
    })();
})();
