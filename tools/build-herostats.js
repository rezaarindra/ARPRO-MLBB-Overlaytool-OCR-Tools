/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// build-herostats.js — menyusun data statistik lineup (public/database/herostats.json) dari data Academy MLBB.
// Sumber: API komunitas arena.rone.dev (membaca endpoint publik mobilelegends.com/academy).
// Jalankan sekali per patch:  node tools/build-herostats.js
// Isi: rating hero (durability / offense / control / difficulty), role, lane, speciality,
// matriks counter & teammate (kenaikan win rate dalam poin persen, semua pasangan hero),
// plus kamus ID spell & item (dipakai data after match matchTools: battle_skill_id, equip_list).
const fs = require('fs');
const path = require('path');

const BASE = 'https://arena.rone.dev';
const OUT = path.join(__dirname, '..', 'public', 'database', 'herostats.json');
const OUT_IDS = path.join(__dirname, '..', 'public', 'database', 'mlbbids.json');
const GAP = 700; // jeda antar permintaan (sopan ke server)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function get(url, tries = 3) {
    for (let i = 1; ; i++) {
        try {
            const res = await fetch(BASE + url, { headers: { 'User-Agent': 'ARPRO-Overlay-Tool' }, signal: AbortSignal.timeout(30000) });
            const body = await res.json();
            if (body.code !== 0 || !body.data) throw new Error(`${url}: ${body.message || res.status}`);
            await sleep(GAP);
            return body.data;
        } catch (e) {
            if (i >= tries) throw e;
            await sleep(3000 * i);
        }
    }
}
const r1 = (v) => Math.round(v * 100) / 100;
const words = (a) => (a || []).map(s => String(s || '').trim()).filter(Boolean);

(async () => {
    const list = (await get('/api/heroes?size=200')).records.map(r => ({ id: r.data.hero_id, name: r.data.hero.data.name }));
    console.log(`${list.length} hero`);
    const heroes = {}, counter = {}, teammate = {};
    for (const [i, h] of list.entries()) {
        const d = (await get(`/api/heroes/${h.id}`)).records[0].data.hero.data;
        const a = (d.abilityshow || []).map(n => (+n || 0) / 10);
        heroes[h.id] = {
            name: d.name || h.name,
            roles: words(d.sortlabel),
            lanes: words(d.roadsortlabel),
            speciality: words(d.speciality),
            ratings: { durability: a[0] || 0, offense: a[1] || 0, control: a[2] || 0, difficulty: a[3] || 0 }
        };
        for (const [kind, store] of [['counters', counter], ['teammates', teammate]]) {
            const rec = (await get(`/api/academy/heroes/${h.id}/${kind}`)).records[0];
            store[h.id] = {};
            for (const s of (rec && rec.data.sub_hero) || []) store[h.id][s.heroid] = r1((+s.increase_win_rate || 0) * 100);
        }
        console.log(`${i + 1}/${list.length} ${heroes[h.id].name}`);
    }
    const spells = Object.fromEntries((await get('/api/academy/spells')).records.map(r => {
        const d = r.data.__data || r.data;
        return [d.skillid, d.skillname];
    }));
    const items = Object.fromEntries((await get('/api/academy/equipment?size=300')).records.map(r => [r.data.equipid, r.data.equipname]));

    const meta = { source: 'MLBB Academy via arena.rone.dev', builtAt: new Date().toISOString() };
    fs.writeFileSync(OUT, JSON.stringify({
        _info: 'Data statistik lineup. ratings 0-10 (rating resmi hero). counter[A][B] = kenaikan win rate A saat melawan B (poin persen); teammate[A][B] = kenaikan win rate A bila satu tim dengan B. Dibuat oleh tools/build-herostats.js. Nilai per hero bisa dikoreksi di herostats-override.json (halaman Statistik Lineup).',
        ...meta, heroes, counter, teammate
    }));
    fs.writeFileSync(OUT_IDS, JSON.stringify({ _info: 'Kamus ID MLBB: heroid, battle_skill_id (spell) & equipid (item) untuk data after match (matchTools).', ...meta,
        heroes: Object.fromEntries(Object.entries(heroes).map(([id, h]) => [id, h.name])), spells, items }, null, 1));
    console.log('selesai:', OUT);
})().catch(e => { console.error('GAGAL:', e.message); process.exit(1); });
