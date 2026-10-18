/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// hero-assets.js — data hero bersama untuk overlay: nama hero, potret (Assets/HeroPick) & splash lebar (Assets/HeroFull)
// Nama file HeroFull tidak seragam dengan herolist.json (akhiran "_29", spasi, titik, ejaan berbeda),
// jadi dicocokkan lewat kunci yang dinormalisasi + daftar alias di bawah. File gambar tidak perlu di-rename.

(function () {
    // kunci herolist (dari nama file HeroPick) → kunci file HeroFull bila ejaannya berbeda
    const ALIAS = {
        arlot: 'arlott',
        beleric: 'belerick',
        carmila: 'carmilla',
        dyroth: 'dyrroth',
        fredrin: 'fredrinn',
        gloo: 'glooswampspirits',
        hirara: 'hiara'
    };

    // "Lapu-Lapu_29.png" → "lapulapu", "x.borg.png" → "xborg", "chang_e.png" → "change"
    const key = (s) => (s || '')
        .toLowerCase()
        .replace(/\.(png|jpe?g|webp)$/, '')
        .replace(/_\d+$/, '')
        .replace(/[^a-z0-9]/g, '');

    const fileOf = (src) => decodeURIComponent(String(src || '').split('?')[0].split('/').pop());

    let heroes = [];
    let fullByKey = {};
    let focus = {};
    let ready = null;

    function load() {
        if (!ready) {
            ready = Promise.all([
                fetch('/database/herolist.json').then(r => r.json()).catch(() => []),
                fetch('/api/herofull').then(r => r.json()).catch(() => []),
                // opsional: titik fokus potongan splash per hero, mis. { "zhuxin": "35% 30%" }
                fetch('/database/herofocus.json').then(r => (r.ok ? r.json() : {})).catch(() => ({}))
            ]).then(([list, files, focusMap]) => {
                heroes = Array.isArray(list) ? list : [];
                fullByKey = {};
                (Array.isArray(files) ? files : []).forEach(f => { fullByKey[key(f)] = '/Assets/HeroFull/' + encodeURIComponent(f); });
                focus = focusMap || {};
            });
        }
        return ready;
    }

    // src = path potret seperti di matchdraft.json ("/Assets/HeroPick/zhuxin.png")
    function byImg(src) {
        if (!src) return null;
        const file = fileOf(src);
        const k = key(file);
        const hero = heroes.find(h => h.img && fileOf(h.img).toLowerCase() === file.toLowerCase());
        const fullKey = fullByKey[k] ? k : (ALIAS[k] && fullByKey[ALIAS[k]] ? ALIAS[k] : null);
        return {
            key: k,
            name: hero ? hero.name : file.replace(/\.[a-z]+$/i, ''),
            portrait: src,
            full: fullKey ? fullByKey[fullKey] : null,
            voice: hero ? hero.voice : null,
            focus: focus[k] || null
        };
    }

    window.HeroAssets = { load, byImg, key };
})();
