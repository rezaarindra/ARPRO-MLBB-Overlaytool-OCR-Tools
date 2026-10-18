/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// i18n.js — bahasa overlay ID / EN. Bahasa dipilih di Broadcast Control (semua overlay ikut berganti),
// atau dikunci per Browser Source dengan ?lang=id / ?lang=en (contoh: siaran dua bahasa di dua OBS).
// 1) Overlay lama: teks yang dikenal (PAIRS / PATTERNS) diterjemahkan otomatis, teks asli dikembalikan saat mode "asli".
// 2) Overlay baru: I18N.t('KEY') + I18N.onChange(render).
// Elemen dengan atribut data-noi18n (nama tim / pemain) tidak pernah diterjemahkan.
window.I18N = (() => {
    // [English, Indonesia] — urutan sama di semua daftar
    const DICT = {
        TECHNICAL_PAUSE: ['TECHNICAL PAUSE', 'JEDA TEKNIS'], ADMIN_PAUSE: ['ADMIN PAUSE', 'JEDA ADMIN'],
        PAUSE_TIME: ['PAUSE TIME', 'DURASI JEDA'], REMAINING: ['REMAINING ALLOWANCE', 'SISA JATAH'], OVER_LIMIT: ['OVER LIMIT', 'MELEBIHI JATAH'],
        RESUME_SOON: ['THE GAME WILL RESUME SHORTLY', 'GAME AKAN SEGERA DILANJUTKAN'], PAUSES: ['PAUSES', 'JEDA'],
        DRAFT_ANALYSIS: ['DRAFT ANALYSIS', 'ANALISIS DRAFT'], WAITING_DRAFT: ['WAITING FOR DRAFT', 'MENUNGGU DRAFT'],
        early: ['EARLY GAME', 'EARLY GAME'], late: ['LATE GAME', 'LATE GAME'], teamfight: ['TEAMFIGHT', 'TEAMFIGHT'],
        poke: ['POKE', 'POKE'], pickoff: ['PICK-OFF', 'PICK-OFF'], push: ['SPLIT PUSH', 'SPLIT PUSH'],
        comp_teamfight: ['TEAMFIGHT COMP', 'KOMPOSISI TEAMFIGHT'], comp_poke: ['POKE COMP', 'KOMPOSISI POKE'],
        comp_pickoff: ['PICK-OFF COMP', 'KOMPOSISI PICK-OFF'], comp_push: ['SPLIT PUSH COMP', 'KOMPOSISI SPLIT PUSH'],
        curve_early: ['STRONG EARLY GAME', 'KUAT DI EARLY GAME'], curve_late: ['LATE GAME SCALING', 'KUAT DI LATE GAME'], curve_balanced: ['BALANCED POWER CURVE', 'KEKUATAN SEIMBANG'],
        DAMAGE: ['DAMAGE PROFILE', 'TIPE DAMAGE'], PHYSICAL: ['PHYSICAL', 'FISIK'], MAGIC: ['MAGIC', 'MAGIC'],
        SYNERGY: ['TOURNAMENT SYNERGY', 'SINERGI DI TURNAMEN'], NEW_COMBO: ['NO SHARED HISTORY YET', 'BELUM PERNAH DIPAKAI BERSAMA'],
        warn_notank: ['NO FRONTLINE', 'TANPA FRONTLINE'], warn_allphysical: ['FULL PHYSICAL', 'FULL FISIK'], warn_allmagic: ['FULL MAGIC', 'FULL MAGIC'],
        G: ['G', 'G'], W: ['W', 'M'], NO_META: ['HERO DATA MISSING', 'DATA HERO BELUM ADA'],
        tank: ['TANK', 'TANK'], fighter: ['FIGHTER', 'FIGHTER'], assassin: ['ASSASSIN', 'ASSASSIN'], mage: ['MAGE', 'MAGE'], marksman: ['MARKSMAN', 'MARKSMAN'], support: ['SUPPORT', 'SUPPORT']
    };
    const PAIRS = [
        ['GOLD DIFFERENCE', 'SELISIH GOLD'], ['EVEN', 'IMBANG'], ['BLUE', 'BIRU'], ['RED', 'MERAH'],
        ['WAITING FOR OCR DATA', 'MENUNGGU DATA OCR'], ['HERO STATISTICS', 'STATISTIK HERO'], ['MOST PICKED', 'PALING BANYAK DIPICK'],
        ['MOST BANNED', 'PALING BANYAK DI-BAN'], ['HIGHEST PRESENCE', 'PRESENCE TERTINGGI'], ['NO SAVED GAME RESULTS YET', 'BELUM ADA HASIL GAME YANG DISIMPAN'],
        ['PLAYER LEADERBOARD', 'PERINGKAT PEMAIN'], ['PLAYER', 'PEMAIN'], ['SIGNATURE HEROES', 'HERO ANDALAN'], ['TOP KDA', 'KDA TERTINGGI'],
        ['MOST KILLS', 'KILL TERBANYAK'], ['MOST ASSISTS', 'ASSIST TERBANYAK'], ['MOST MVP', 'MVP TERBANYAK'], ['HIGHEST AVG GOLD', 'RATA-RATA GOLD TERTINGGI'],
        ['KILLS', 'KILL'], ['ASSISTS', 'ASSIST'], ['AVG GOLD', 'RATA-RATA GOLD'], ['STANDINGS', 'KLASEMEN'], ['TEAM', 'TIM'],
        ['MATCH W-L', 'MATCH M-K'], ['GAME W-L', 'GAME M-K'], ['WIN%', 'MENANG%'], ['ADVANCE TO NEXT ROUND', 'LOLOS KE BABAK BERIKUTNYA'],
        ['PLAYOFF BRACKET', 'BAGAN PLAYOFF'], ['CHAMPION', 'JUARA'], ['AVG DURATION', 'RATA-RATA DURASI'], ['AVG KILLS', 'RATA-RATA KILL'],
        ['FIRST MEETING', 'PERTEMUAN PERTAMA'], ['FIRST APPEARANCE', 'PENAMPILAN PERDANA'], ['NO TOURNAMENT DATA YET', 'BELUM ADA DATA TURNAMEN'],
        ['NO DATA YET', 'BELUM ADA DATA'], ['AVG TEAM GOLD', 'RATA-RATA GOLD TIM'], ['AVG K / D / A', 'RATA-RATA K / D / A'], ['SERIES RECAP', 'REKAP SERIES'],
        ['WIN', 'MENANG'], ['NEW RECORD', 'REKOR BARU'], ['FASTEST GAME', 'GAME TERCEPAT'], ['LONGEST GAME', 'GAME TERLAMA'], ['FIRST WIN', 'KEMENANGAN PERTAMA']
    ];
    const ALIAS = { 'AVG DURASI': 'AVG DURATION' }; // teks campuran di overlay lama
    // [regex English, regex Indonesia, template English, template Indonesia]
    const PATTERNS = [
        ['BAN PHASE (\\d+)', 'FASE BAN (\\d+)', 'BAN PHASE $1', 'FASE BAN $1'],
        ['PICK PHASE (\\d+)', 'FASE PICK (\\d+)', 'PICK PHASE $1', 'FASE PICK $1'],
        ['NO TEAMS IN GROUP (.+)', 'BELUM ADA TIM DI GRUP (.+)', 'NO TEAMS IN GROUP $1', 'BELUM ADA TIM DI GRUP $1'],
        ['Most kills in a single game: (\\d+)', 'Kill terbanyak dalam satu game: (\\d+) kill', 'Most kills in a single game: $1', 'Kill terbanyak dalam satu game: $1 kill'],
        ['Fastest game of the tournament: (.+)', 'Game tercepat turnamen ini: (.+)', 'Fastest game of the tournament: $1', 'Game tercepat turnamen ini: $1'],
        ['Longest game of the tournament: (.+)', 'Game terlama turnamen ini: (.+)', 'Longest game of the tournament: $1', 'Game terlama turnamen ini: $1'],
        ['(\\d+)/(\\d+)/(\\d+) without a single death', '(\\d+)/(\\d+)/(\\d+) tanpa mati sekali pun', '$1/$2/$3 without a single death', '$1/$2/$3 tanpa mati sekali pun'],
        ['MVP #(\\d+) of the tournament', 'MVP ke-(\\d+) di turnamen ini', 'MVP #$1 of the tournament', 'MVP ke-$1 di turnamen ini'],
        ['(\\d+) kills this tournament', '(\\d+) kill di turnamen ini', '$1 kills this tournament', '$1 kill di turnamen ini'],
        ['First tournament win for (.+)', 'Kemenangan pertama (.+) di turnamen ini', 'First tournament win for $1', 'Kemenangan pertama $1 di turnamen ini']
    ].map(([a, b, c, d]) => [new RegExp('^' + a + '$', 'i'), new RegExp('^' + b + '$', 'i'), c, d]);

    const index = new Map();
    PAIRS.forEach((p, i) => p.forEach(s => index.set(s.toUpperCase(), i)));
    Object.entries(ALIAS).forEach(([a, b]) => index.set(a, index.get(b)));

    const urlLang = new URLSearchParams(location.search).get('lang');
    let lang = ['id', 'en'].includes(urlLang) ? urlLang : '';
    const listeners = [];
    const col = () => lang === 'id' ? 1 : 0;

    function t(key) { const d = DICT[key]; return d ? d[col()] : key; }

    // terjemahkan satu teks (teks asli → bahasa aktif); teks tak dikenal dikembalikan apa adanya
    function tr(text) {
        if (!lang) return text;
        const m = /^(\s*)(.*?)(\s*)$/s.exec(text), core = m[2];
        if (!core) return text;
        const upper = core === core.toUpperCase() && /[A-Z]/i.test(core);
        let out = null;
        const i = index.get(core.toUpperCase());
        if (i != null) out = PAIRS[i][col()];
        else for (const [re0, re1, tp0, tp1] of PATTERNS) {
            const hit = re0.exec(core) || re1.exec(core);
            if (hit) { out = (lang === 'id' ? tp1 : tp0).replace(/\$(\d)/g, (_, n) => hit[+n]); break; }
        }
        if (out == null) return text;
        return m[1] + (upper ? out.toUpperCase() : out) + m[3];
    }

    const orig = new WeakMap(), last = new WeakMap();
    function walk(node) {
        if (node.nodeType === 3) {
            const cur = node.nodeValue;
            if (last.get(node) !== cur) orig.set(node, cur); // diubah overlay sendiri → teks asli baru
            const out = tr(orig.get(node));
            if (out !== cur) node.nodeValue = out;
            last.set(node, out);
        } else if (node.nodeType === 1 && !/^(SCRIPT|STYLE|TEXTAREA|INPUT)$/.test(node.tagName) && !node.hasAttribute('data-noi18n')) {
            node.childNodes.forEach(walk);
        }
    }
    const inSkipped = (n) => { for (let e = n.nodeType === 1 ? n : n.parentElement; e; e = e.parentElement) if (e.hasAttribute && e.hasAttribute('data-noi18n')) return true; return false; };
    const obs = new MutationObserver(list => {
        for (const m of list) {
            if (m.type === 'characterData') { if (!inSkipped(m.target)) walk(m.target); }
            else m.addedNodes.forEach(n => { if (!inSkipped(n)) walk(n); });
        }
    });
    function start() {
        walk(document.body);
        obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

    function set(l) {
        if (['id', 'en'].includes(urlLang)) l = urlLang; // dikunci lewat URL
        if (l === lang) return;
        lang = l;
        document.documentElement.lang = lang || 'id';
        if (document.body) walk(document.body);
        listeners.forEach(fn => { try { fn(lang); } catch (e) { console.error(e); } });
    }

    fetch('/api/lang', { cache: 'no-store' }).then(r => r.json()).then(j => set(j.lang || '')).catch(() => {});
    (function connect() {
        const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
        ws.onmessage = (ev) => { try { const m = JSON.parse(ev.data); if (m.type === 'lang_update') set(m.lang || ''); } catch (e) {} };
        ws.onclose = () => setTimeout(connect, 3000);
    })();

    return { t, tr, get lang() { return lang; }, onChange: (fn) => listeners.push(fn) };
})();
