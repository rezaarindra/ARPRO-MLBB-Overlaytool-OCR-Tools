/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// socialcard.js — kartu media sosial digambar di <canvas> (semua gambar dari server ini → PNG bisa diunduh).
(() => {
    const $ = (id) => document.getElementById(id);
    const cv = $('scCanvas');
    let ctx = cv.getContext('2d');
    const W = 1080, PAD = 64;
    const TITLES = { series: 'MATCH RESULT', game: 'GAME RESULT', mvp: 'MVP OF THE GAME', standings: 'STANDINGS', top: 'TOP PLAYERS', hero: 'HERO META' };
    const METRIC = {
        kda: ['KDA', p => p.kda, v => v.toFixed(2)], k: ['KILL', p => p.k, v => v], mvp: ['MVP', p => p.mvp, v => v],
        winRate: ['WIN RATE', p => p.winRate, v => Math.round(v * 100) + '%'], avgGold: ['GOLD / GAME', p => p.avgGold, v => (v / 1000).toFixed(1) + 'k']
    };
    const st = { tpl: 'series', H: 1080, logo: null, bg: null, stats: null, list: null, heroFull: [] };
    const NOODLE = "'Noodle', Impact, sans-serif", SANS = "'Segoe UI', system-ui, sans-serif";
    const msg = (t, cls = '') => { $('scMsg').textContent = t; $('scMsg').className = 'sc-msg ' + cls; };

    // ---------- gambar ----------
    const imgCache = new Map();
    function img(src) {
        if (!src) return Promise.resolve(null);
        if (!imgCache.has(src)) imgCache.set(src, new Promise(res => {
            const i = new Image();
            if (/^https?:/i.test(src) && !src.startsWith(location.origin)) i.crossOrigin = 'anonymous'; // logo dari web lain: tanpa CORS → dilewati agar PNG tetap bisa diunduh
            i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
        }));
        return imgCache.get(src);
    }
    const strip = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(.)\1+/g, '$1');
    const heroFullSrc = (name) => { const f = st.heroFull.find(x => strip(x.replace(/\.[a-z]+$/i, '')) === strip(name)); return f ? `/Assets/HeroFull/${encodeURIComponent(f)}` : null; };
    const teamLogo = (name) => { const t = (st.stats.teams || []).find(x => x.name.toLowerCase() === String(name || '').toLowerCase()); return t && t.logo ? t.logo : '/Assets/Other/nologo.png'; };

    function cover(im, x, y, w, h, py = 0.5) {
        if (!im) return;
        const s = Math.max(w / im.width, h / im.height), sw = w / s, sh = h / s;
        ctx.drawImage(im, (im.width - sw) / 2, (im.height - sh) * py, sw, sh, x, y, w, h);
    }
    function contain(im, x, y, w, h, ay = 0.5) {
        if (!im) return;
        const s = Math.min(w / im.width, h / im.height), dw = im.width * s, dh = im.height * s;
        ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) * ay, dw, dh);
    }
    // teks dikecilkan otomatis sampai muat di lebar maxW
    function text(t, x, y, { size = 40, font = NOODLE, color = '#fff', align = 'left', maxW = 0, weight = '', base = 'alphabetic', spacing = 0 } = {}) {
        t = String(t == null ? '' : t);
        let s = size;
        const set = () => { ctx.font = `${weight} ${s}px ${font}`.trim(); };
        set();
        if ('letterSpacing' in ctx) ctx.letterSpacing = spacing + 'px';
        while (maxW && s > 10 && ctx.measureText(t).width > maxW) { s -= 2; set(); }
        ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base;
        ctx.fillText(t, x, y);
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
        return s;
    }
    function rect(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
    function skew(x, y, w, h, k, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x + k, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - k, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill(); }
    const accent = () => $('scAccent').value;
    const alpha = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

    // ---------- bingkai: latar, header, judul, footer ----------
    async function frame(title) {
        const H = st.H, A = accent();
        rect(0, 0, W, H, '#07090f');
        if (st.bg) { cover(st.bg, 0, 0, W, H); rect(0, 0, W, H, 'rgba(5,7,12,0.72)'); }
        else {
            let g = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 1.1); g.addColorStop(0, alpha(A, 0.45)); g.addColorStop(1, 'rgba(0,0,0,0)'); rect(0, 0, W, H, g);
            g = ctx.createRadialGradient(W, H, 0, W, H, W); g.addColorStop(0, alpha(A, 0.25)); g.addColorStop(1, 'rgba(0,0,0,0)'); rect(0, 0, W, H, g);
        }
        ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.025)'; ctx.lineWidth = 12;
        for (let x = -H; x < W; x += 34) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + H, 0); ctx.stroke(); }
        ctx.restore();
        skew(W - 300, 0, 300, 18, 18, A);

        const logo = st.logo || await img('/Assets/Other/arpro-logo.png');
        contain(logo, PAD, 46, 96, 96);
        const tour = (st.stats && st.stats.name) || 'TOURNAMENT';
        text(tour.toUpperCase(), PAD + 120, 96, { size: 48, maxW: W - PAD * 2 - 300, spacing: 1 });
        const sub = $('scSub').value.trim();
        if (sub) text(sub.toUpperCase(), PAD + 122, 130, { size: 22, font: SANS, weight: '600', color: 'rgba(255,255,255,0.65)', maxW: W - PAD * 2 - 300, spacing: 2 });
        text(new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase(), W - PAD, 96, { size: 22, font: SANS, weight: '600', color: 'rgba(255,255,255,0.6)', align: 'right', spacing: 1 });

        const t = ($('scTitle').value.trim() || title).toUpperCase();
        const ts = text(t, PAD - 4, 270, { size: 132, maxW: W - PAD * 2, spacing: 2 });
        rect(PAD, 290, Math.min(W - PAD * 2, 140), 8, A);

        skew(-30, H - 92, W * 0.62, 92, 40, A);
        text(($('scFoot').value.trim() || '#' + tour.replace(/\s+/g, '').toUpperCase()).slice(0, 60), PAD, H - 34, { size: 40, maxW: W * 0.55 - PAD, spacing: 1 });
        text('ARPRO ESPORT TOOLS', W - PAD, H - 38, { size: 26, color: 'rgba(255,255,255,0.55)', align: 'right', spacing: 2 });
        return { top: 290 + Math.max(40, ts * 0.3), bottom: H - 130 };
    }

    function empty(area, line) {
        text(line, W / 2, (area.top + area.bottom) / 2, { size: 34, font: SANS, weight: '600', color: 'rgba(255,255,255,0.6)', align: 'center', maxW: W - PAD * 2 });
    }

    // ---------- template ----------
    async function drawSeries(area) {
        const id = $('scSeries').value;
        if (!id) return empty(area, 'Belum ada series tersimpan.');
        const d = await T.get('/api/tournament/series/current?id=' + encodeURIComponent(id));
        const [la, lb] = await Promise.all([img(teamLogo(d.a)), img(teamLogo(d.b))]);
        const L = Math.min(250, (area.bottom - area.top) * 0.36), A = accent();
        const blockH = L + 150 + Math.max(3, d.games.length) * 70, y0 = area.top + 10 + Math.max(0, (area.bottom - area.top - 10 - blockH) / 2);
        for (const [im, x, name, win] of [[la, W * 0.21, d.a, d.done && d.winner === d.a], [lb, W * 0.79, d.b, d.done && d.winner === d.b]]) {
            if (win) { rect(x - L / 2 - 16, y0 - 16, L + 32, L + 32, alpha(A, 0.25)); ctx.strokeStyle = A; ctx.lineWidth = 4; ctx.strokeRect(x - L / 2 - 16, y0 - 16, L + 32, L + 32); }
            contain(im, x - L / 2, y0, L, L);
            text(String(name).toUpperCase(), x, y0 + L + 62, { size: 54, align: 'center', maxW: 400, spacing: 1 });
            if (win) { skew(x - 90, y0 + L + 80, 180, 40, 12, A); text('WINNER', x, y0 + L + 109, { size: 30, align: 'center', spacing: 3 }); }
        }
        text(`${d.winsA} - ${d.winsB}`, W / 2, y0 + L / 2 + 70, { size: 200, align: 'center', spacing: 4 });
        text(d.done ? `BEST OF ${d.bo}` : `BO${d.bo} · BERLANGSUNG`, W / 2, y0 + L / 2 + 120, { size: 30, align: 'center', color: 'rgba(255,255,255,0.7)', spacing: 3 });
        let y = y0 + L + 150;
        const rowH = Math.min(70, (area.bottom - y) / Math.max(3, d.games.length));
        for (const g of d.games) {
            if (y + rowH > area.bottom + 8) break;
            rect(PAD, y, W - PAD * 2, rowH - 10, 'rgba(255,255,255,0.06)');
            rect(PAD, y, 8, rowH - 10, A);
            const cy = y + (rowH - 10) / 2 + 12;
            text(`GAME ${g.game || ''}`, PAD + 30, cy, { size: 34, spacing: 1 });
            text(String(g.winner).toUpperCase(), PAD + 220, cy, { size: 34, color: A, maxW: 330 });
            text(g.duration || '-', PAD + 600, cy, { size: 34, color: 'rgba(255,255,255,0.8)' });
            if (g.mvp) text(`MVP ${g.mvp}`.toUpperCase(), W - PAD - 24, cy, { size: 30, align: 'right', maxW: 260, color: 'rgba(255,255,255,0.8)' });
            y += rowH;
        }
    }

    async function gameData() {
        const id = $('scGame').value;
        return id ? T.get('/api/tournament/game/' + encodeURIComponent(id)) : null;
    }

    async function drawGame(area) {
        const g = await gameData();
        if (!g) return empty(area, 'Belum ada game tersimpan.');
        const A = accent(), kills = (s) => g[s].players.reduce((n, p) => n + p.k, 0);
        const [lb, lr] = await Promise.all([img(g.blue.logo || teamLogo(g.blue.name)), img(g.red.logo || teamLogo(g.red.name))]);
        const L = 150, y0 = area.top + 56 + (st.H > 1500 ? 60 : 0);
        for (const [im, x, s] of [[lb, PAD, 'blue'], [lr, W - PAD - L, 'red']]) {
            contain(im, x, y0, L, L);
            const cx = x + L / 2;
            text(g[s].name.toUpperCase(), cx, y0 + L + 44, { size: 38, align: 'center', maxW: 300 });
            if (g.winner === s) { skew(cx - 60, y0 - 46, 120, 36, 10, A); text('WIN', cx, y0 - 18, { size: 28, align: 'center', spacing: 3 }); }
        }
        text(`${kills('blue')} - ${kills('red')}`, W / 2, y0 + 112, { size: 130, align: 'center', spacing: 3 });
        text(`GAME ${g.game || ''} · ${g.duration || '-'}`.toUpperCase(), W / 2, y0 + 160, { size: 30, align: 'center', color: 'rgba(255,255,255,0.7)', spacing: 2 });
        let y = y0 + L + 80;
        const rowH = Math.min(st.H > 1500 ? 150 : 104, (area.bottom - y) / 5), ic = rowH - 16;
        const heroes = await Promise.all(['blue', 'red'].flatMap(s => g[s].players.map(p => img(p.hero ? T.heroImg(p.hero) : null))));
        for (let i = 0; i < 5; i++) {
            const yy = y + i * rowH;
            for (const [s, k] of [['blue', 0], ['red', 1]]) {
                const p = g[s].players[i]; if (!p) continue;
                const mvp = g.mvp && g.mvp.toLowerCase() === p.name.toLowerCase();
                const x0 = k ? W / 2 + 8 : PAD, w = W / 2 - PAD - 8;
                rect(x0, yy, w, rowH - 8, mvp ? alpha(A, 0.3) : 'rgba(255,255,255,0.06)');
                const hx = k ? x0 + w - ic - 4 : x0 + 4;
                cover(heroes[k * 5 + i], hx, yy + 4, ic, ic - 0);
                const tx = k ? hx - 16 : hx + ic + 16, al = k ? 'right' : 'left';
                text(p.name.toUpperCase(), tx, yy + rowH * 0.45, { size: Math.min(36, rowH * 0.38), align: al, maxW: w - ic - 40 });
                text(`${p.k} / ${p.d} / ${p.a}${mvp ? '  ·  MVP' : ''}`, tx, yy + rowH * 0.78, { size: Math.min(26, rowH * 0.27), font: SANS, weight: '700', align: al, color: mvp ? '#fff' : 'rgba(255,255,255,0.7)' });
            }
        }
    }

    async function drawMvp(area) {
        const g = await gameData();
        if (!g) return empty(area, 'Belum ada game tersimpan.');
        const side = ['blue', 'red'].find(s => g[s].players.some(p => g.mvp && p.name.toLowerCase() === g.mvp.toLowerCase()));
        if (!side) return empty(area, 'Game ini belum punya MVP (pilih MVP lalu simpan ulang hasil game).');
        const p = g[side].players.find(x => x.name.toLowerCase() === g.mvp.toLowerCase()), A = accent(), H = st.H;
        const [splash, photo, hero, logo] = await Promise.all([img(heroFullSrc(p.hero)), img(T.playerImg(p.name)), img(p.hero ? T.heroImg(p.hero) : null), img(g[side].logo || teamLogo(g[side].name))]);
        const top = area.top - 10, bot = H - 92;
        ctx.save(); ctx.beginPath(); ctx.rect(0, top, W, bot - top); ctx.clip();
        if (splash) cover(splash, 0, top, W, bot - top, 0.2);
        else if (hero) { ctx.globalAlpha = 0.35; cover(hero, W * 0.3, top, W * 0.7, bot - top, 0.2); ctx.globalAlpha = 1; }
        let gr = ctx.createLinearGradient(0, 0, W * 0.7, 0); gr.addColorStop(0, 'rgba(7,9,15,0.92)'); gr.addColorStop(0.45, 'rgba(7,9,15,0.55)'); gr.addColorStop(1, 'rgba(7,9,15,0)'); rect(0, top, W, bot - top, gr);
        gr = ctx.createLinearGradient(0, bot - 420, 0, bot); gr.addColorStop(0, 'rgba(7,9,15,0)'); gr.addColorStop(1, 'rgba(7,9,15,0.95)'); rect(0, bot - 420, W, 420, gr);
        if (photo) contain(photo, W * 0.3, top + 20, W * 0.62, bot - top - 20, 1);
        ctx.restore();
        const by = bot - 50;
        rect(PAD, by - 196, 10, 150, A);
        const ns = text(p.name.toUpperCase(), PAD + 28, by - 92, { size: 150, maxW: W - PAD * 2 - 40, spacing: 2 });
        contain(logo, PAD + 28, by - 76, 52, 52);
        text(`${g[side].name} · ${p.hero || ''}`.toUpperCase(), PAD + 92, by - 38, { size: 40, color: A, maxW: W - PAD * 2 - 100, spacing: 1 });
        const boxes = [['KDA', `${p.k}/${p.d}/${p.a}`], ['GOLD', p.gold ? (p.gold / 1000).toFixed(1) + 'k' : '-'], ['GAME', `${g.game || '-'}`]];
        const bw = 190, bh = 110, bx = PAD + 28, byy = by - 196 - ns * 0.1 - bh - 30;
        boxes.forEach(([k, v], i) => {
            rect(bx + i * (bw + 14), byy, bw, bh, 'rgba(7,9,15,0.75)');
            rect(bx + i * (bw + 14), byy, bw, 5, A);
            text(k, bx + i * (bw + 14) + bw / 2, byy + 40, { size: 24, font: SANS, weight: '700', color: 'rgba(255,255,255,0.6)', align: 'center', spacing: 2 });
            text(v, bx + i * (bw + 14) + bw / 2, byy + 92, { size: 50, align: 'center', maxW: bw - 16 });
        });
        text(`${g.blue.name} VS ${g.red.name}`.toUpperCase(), W - PAD, area.top + 30, { size: 30, align: 'right', color: 'rgba(255,255,255,0.75)', maxW: 520, spacing: 1 });
    }

    async function drawStandings(area) {
        const grp = $('scGroup').value, A = accent();
        const teams = st.stats.teams.filter(t => !grp || t.group === grp).slice(0, st.H > 1500 ? 14 : st.H > 1200 ? 10 : 8);
        if (!teams.length) return empty(area, 'Belum ada tim di klasemen.');
        const top = area.top + 10, rowH = Math.min(st.H > 1500 ? 96 : 84, (area.bottom - top) / (teams.length + 1));
        const cols = [[W - PAD - 330, 'SERIES'], [W - PAD - 190, 'GAME'], [W - PAD - 60, 'DIFF']];
        text('#', PAD + 30, top + rowH * 0.6, { size: 24, font: SANS, weight: '700', color: 'rgba(255,255,255,0.55)', align: 'center' });
        text('TEAM', PAD + 160, top + rowH * 0.6, { size: 24, font: SANS, weight: '700', color: 'rgba(255,255,255,0.55)', spacing: 2 });
        cols.forEach(([x, l]) => text(l, x, top + rowH * 0.6, { size: 24, font: SANS, weight: '700', color: 'rgba(255,255,255,0.55)', align: 'center', spacing: 2 }));
        const logos = await Promise.all(teams.map(t => img(t.logo || '/Assets/Other/nologo.png')));
        teams.forEach((t, i) => {
            const y = top + rowH * (i + 1), h = rowH - 8, cy = y + h / 2 + h * 0.18;
            rect(PAD, y, W - PAD * 2, h, i === 0 ? alpha(A, 0.35) : 'rgba(255,255,255,0.06)');
            if (i === 0) rect(PAD, y, 8, h, A);
            text(i + 1, PAD + 30, cy, { size: h * 0.55, align: 'center' });
            contain(logos[i], PAD + 72, y + 6, h - 12, h - 12);
            text(t.name.toUpperCase(), PAD + 160, cy, { size: h * 0.5, maxW: cols[0][0] - PAD - 230 });
            text(`${t.seriesWins}-${t.seriesLosses}`, cols[0][0], cy, { size: h * 0.5, align: 'center' });
            text(`${t.gameWins}-${t.gameLosses}`, cols[1][0], cy, { size: h * 0.5, align: 'center', color: 'rgba(255,255,255,0.85)' });
            text((t.gameDiff > 0 ? '+' : '') + t.gameDiff, cols[2][0], cy, { size: h * 0.5, align: 'center', color: t.gameDiff > 0 ? '#00ff8c' : t.gameDiff < 0 ? '#ff4d5e' : '#fff' });
        });
    }

    async function drawTop(area) {
        const [label, get, fmt] = METRIC[$('scMetric').value], A = accent();
        const n = st.H > 1500 ? 10 : st.H > 1200 ? 7 : 5;
        const list = st.stats.players.filter(p => p.games).sort((a, b) => get(b) - get(a) || b.games - a.games).slice(0, n);
        if (!list.length) return empty(area, 'Belum ada data pemain.');
        const photos = await Promise.all(list.map(p => img(T.playerImg(p.name))));
        const top = area.top + 10, bigH = Math.min(st.H > 1500 ? 420 : 300, (area.bottom - top) * 0.45);
        // #1 besar
        const p0 = list[0];
        rect(PAD, top, W - PAD * 2, bigH, alpha(A, 0.28));
        rect(PAD, top, 10, bigH, A);
        ctx.save(); ctx.beginPath(); ctx.rect(PAD, top, W - PAD * 2, bigH); ctx.clip();
        if (photos[0]) contain(photos[0], W - PAD - bigH * 1.0, top + 10, bigH * 0.95, bigH - 10, 1);
        else { const lg = await img(teamLogo(p0.team)); ctx.globalAlpha = 0.5; contain(lg, W - PAD - bigH * 0.9, top + bigH * 0.1, bigH * 0.8, bigH * 0.8); ctx.globalAlpha = 1; }
        ctx.restore();
        text('#1', PAD + 40, top + bigH * 0.3, { size: bigH * 0.2, color: A });
        text(p0.name.toUpperCase(), PAD + 40, top + bigH * 0.58, { size: bigH * 0.26, maxW: W - PAD * 2 - bigH - 40, spacing: 1 });
        text(String(p0.team || '').toUpperCase(), PAD + 42, top + bigH * 0.72, { size: bigH * 0.1, color: 'rgba(255,255,255,0.75)', maxW: W - PAD * 2 - bigH - 40, spacing: 1 });
        text(`${fmt(get(p0))} ${label}`, PAD + 40, top + bigH * 0.9, { size: bigH * 0.15, color: '#fff', spacing: 1 });
        // #2 dst.
        const y0 = top + bigH + 16, rowH = Math.min(st.H > 1500 ? 100 : 86, (area.bottom - y0) / Math.max(1, list.length - 1));
        list.slice(1).forEach((p, j) => {
            const y = y0 + j * rowH, h = rowH - 8, cy = y + h / 2 + h * 0.18;
            rect(PAD, y, W - PAD * 2, h, 'rgba(255,255,255,0.06)');
            text('#' + (j + 2), PAD + 24, cy, { size: h * 0.5, color: A });
            ctx.save(); ctx.beginPath(); ctx.rect(PAD + 100, y, h, h); ctx.clip(); rect(PAD + 100, y, h, h, 'rgba(255,255,255,0.05)'); cover(photos[j + 1], PAD + 100, y, h, h, 0.1); ctx.restore();
            text(p.name.toUpperCase(), PAD + 120 + h, cy, { size: h * 0.5, maxW: 360 });
            text(String(p.team || '').toUpperCase(), PAD + 500 + h * 0.4, cy, { size: h * 0.36, color: 'rgba(255,255,255,0.6)', maxW: 250 });
            text(fmt(get(p)), W - PAD - 24, cy, { size: h * 0.55, align: 'right' });
        });
    }

    async function drawHero(area) {
        const A = accent(), n = st.H > 1500 ? 12 : st.H > 1200 ? 8 : 6;
        const list = st.stats.heroes.slice().sort((a, b) => b.presence - a.presence || b.picks - a.picks).slice(0, n);
        if (!list.length) return empty(area, 'Belum ada data hero.');
        const icons = await Promise.all(list.map(h => img(T.heroImg(h.hero))));
        const top = area.top + 10, rowH = Math.min(st.H > 1500 ? 112 : 96, (area.bottom - top) / (list.length + 0.6));
        const cols = [[W - PAD - 380, 'PICK'], [W - PAD - 250, 'BAN'], [W - PAD - 110, 'WIN RATE']];
        cols.forEach(([x, l]) => text(l, x, top + rowH * 0.4, { size: 22, font: SANS, weight: '700', color: 'rgba(255,255,255,0.55)', align: 'center', spacing: 2 }));
        text(`PRESENCE · ${st.stats.totalGames} GAME`, PAD + rowH + 20, top + rowH * 0.4, { size: 22, font: SANS, weight: '700', color: 'rgba(255,255,255,0.55)', spacing: 2 });
        list.forEach((h, i) => {
            const y = top + rowH * (i + 0.6), hh = rowH - 10, cy = y + hh * 0.48;
            rect(PAD, y, W - PAD * 2, hh, 'rgba(255,255,255,0.06)');
            cover(icons[i], PAD, y, hh, hh, 0.2);
            text(h.hero.toUpperCase(), PAD + hh + 20, cy, { size: hh * 0.42, maxW: cols[0][0] - PAD - hh - 80 });
            const bw = cols[0][0] - PAD - hh - 160;
            rect(PAD + hh + 20, y + hh * 0.66, bw, 10, 'rgba(255,255,255,0.12)');
            rect(PAD + hh + 20, y + hh * 0.66, bw * Math.min(1, h.presence), 10, A);
            text(Math.round(h.presence * 100) + '%', PAD + hh + 30 + bw, y + hh * 0.66 + 11, { size: 24, font: SANS, weight: '700', color: 'rgba(255,255,255,0.8)' });
            text(h.picks, cols[0][0], cy + hh * 0.15, { size: hh * 0.45, align: 'center' });
            text(h.bans, cols[1][0], cy + hh * 0.15, { size: hh * 0.45, align: 'center' });
            text(h.picks ? Math.round(h.winRate * 100) + '%' : '-', cols[2][0], cy + hh * 0.15, { size: hh * 0.45, align: 'center', color: h.picks && h.winRate >= 0.5 ? '#00ff8c' : '#fff' });
        });
    }

    const DRAW = { series: drawSeries, game: drawGame, mvp: drawMvp, standings: drawStandings, top: drawTop, hero: drawHero };

    // ---------- render ----------
    // render berurutan (satu per satu) di canvas cadangan, lalu disalin ke preview → tidak berkedip saat gambar dimuat
    let renderSeq = 0, renderTimer = null, chain = Promise.resolve();
    const schedule = () => { clearTimeout(renderTimer); renderTimer = setTimeout(render, 120); };
    function render() {
        const seq = ++renderSeq;
        chain = chain.then(async () => {
            if (seq !== renderSeq || !st.stats) return;
            const off = document.createElement('canvas'); off.width = W; off.height = st.H;
            const main = ctx;
            ctx = off.getContext('2d');
            try {
                const area = await frame(TITLES[st.tpl]);
                await DRAW[st.tpl](area);
            } catch (e) { console.error(e); msg('Gagal menggambar: ' + e.message, 'err'); }
            finally { ctx = main; }
            if (seq !== renderSeq) return;
            cv.width = W; cv.height = st.H;
            ctx.drawImage(off, 0, 0);
        });
        return chain;
    }

    // ---------- kontrol ----------
    function syncFields() {
        document.querySelectorAll('[data-for]').forEach(el => { el.hidden = !el.dataset.for.split(' ').includes(st.tpl); });
    }
    $('scTpl').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        st.tpl = b.dataset.tpl;
        $('scTpl').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        syncFields(); schedule();
    });
    $('scSize').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        st.H = +b.dataset.h;
        $('scSize').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        schedule();
    });
    ['scSeries', 'scGame', 'scMetric', 'scGroup', 'scAccent', 'scTitle', 'scSub', 'scFoot'].forEach(id => $(id).addEventListener('input', schedule));
    for (const [id, key] of [['scLogo', 'logo'], ['scBg', 'bg']]) {
        $(id).addEventListener('change', (e) => {
            const f = e.target.files[0]; if (!f) return;
            const url = URL.createObjectURL(f), i = new Image();
            i.onload = () => { st[key] = i; schedule(); }; i.src = url;
        });
    }
    document.querySelectorAll('[data-clear]').forEach(b => b.addEventListener('click', (e) => {
        e.preventDefault(); const k = b.dataset.clear; st[k] = null; $(k === 'logo' ? 'scLogo' : 'scBg').value = ''; schedule();
    }));
    try { const a = localStorage.getItem('scAccent'); if (a) $('scAccent').value = a; } catch (e) {}
    $('scAccent').addEventListener('change', () => { try { localStorage.setItem('scAccent', $('scAccent').value); } catch (e) {} });

    const blob = () => new Promise((res, rej) => { try { cv.toBlob(b => b ? res(b) : rej(new Error('kosong')), 'image/png'); } catch (e) { rej(e); } });
    $('scDownload').addEventListener('click', async () => {
        try {
            await render();
            const b = await blob(), a = document.createElement('a');
            a.href = URL.createObjectURL(b);
            a.download = `${st.tpl}-${st.H === 1080 ? 'feed' : st.H === 1350 ? 'portrait' : 'story'}-${new Date().toISOString().slice(0, 10)}.png`;
            a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
            msg('PNG diunduh.', 'ok');
        } catch (e) { msg('Gagal mengunduh: ' + e.message + ' (logo dari website lain tanpa izin CORS tidak bisa ikut diekspor).', 'err'); }
    });
    $('scCopy').addEventListener('click', async () => {
        try {
            if (!window.ClipboardItem || !navigator.clipboard) throw new Error('browser hanya mengizinkan salin gambar di http://localhost');
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob() })]);
            msg('Gambar disalin, tinggal paste (Ctrl+V).', 'ok');
        } catch (e) { msg('Tidak bisa menyalin: ' + e.message + '. Pakai Unduh PNG.', 'err'); }
    });

    // ---------- data ----------
    async function load() {
        const [stats, list, hf] = await Promise.all([T.get('/api/tournament/stats'), T.get('/api/tournament'), T.get('/api/herofull').catch(() => [])]);
        st.stats = stats; st.list = list; st.heroFull = hf;
        $('scCount').textContent = `${list.games.length} game tersimpan`;
        const keep = (sel, opts) => { const v = sel.value; sel.innerHTML = opts; if ([...sel.options].some(o => o.value === v)) sel.value = v; };
        keep($('scSeries'), stats.series.slice().reverse().map(s => `<option value="${s.id}">${T.esc(s.a)} ${s.winsA}-${s.winsB} ${T.esc(s.b)}${s.done ? '' : ' (berlangsung)'}</option>`).join('') || '<option value="">Belum ada series</option>');
        keep($('scGame'), list.games.slice().reverse().map(g => `<option value="${g.id}">G${g.game || '?'} · ${T.esc(g.blue)} vs ${T.esc(g.red)}${g.mvp ? ' · MVP ' + T.esc(g.mvp) : ''}</option>`).join('') || '<option value="">Belum ada game</option>');
        const groups = [...new Set(stats.teams.map(t => t.group).filter(Boolean))];
        keep($('scGroup'), '<option value="">Semua tim</option>' + groups.map(g => `<option value="${T.esc(g)}">Grup ${T.esc(g)}</option>`).join(''));
        schedule();
    }

    syncFields();
    const font = new FontFace('Noodle', "url('Assets/Font/big_noodle_titling.ttf')");
    font.load().then(f => document.fonts.add(f)).catch(() => {}).finally(() => T.live(load, ['tournament_update']));
})();
