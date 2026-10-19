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
                // posisi splash per hero (Broadcast Control › Posisi Splash): { "zhuxin": { "x": 50, "y": 30, "zoom": 1.2 } }
                fetch('/database/herofocus.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : {})).catch(() => ({}))
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

    // muat ulang (dipanggil saat posisi splash diubah di Broadcast Control)
    function reload() { ready = null; return load(); }

    // ---------- Tata letak splash di area 5 box ----------
    // focus = { x, y: titik pada gambar (%) yang ditaruh di tengah area kosong, zoom ≥ 1 }.
    // Area kosong = area splash dikurangi foto pemain (biru: foto di kanan → hero agak ke kiri; merah: dicerminkan).
    const DEFAULT_FOCUS = { x: 50, y: 30, zoom: 1.12 };
    function splashLayout(iw, ih, W, H, focus, side) {
        const f = { ...DEFAULT_FOCUS, ...(focus || {}) };
        const zoom = Math.max(1, Math.min(3, +f.zoom || 1));
        const s = Math.max(W / iw, H / ih) * zoom, dw = iw * s, dh = ih * s;
        const photoW = H * 0.75 + 24;
        const tx = side === 'red' ? photoW + (W - photoW) / 2 : (W - photoW) / 2;
        const ty = H * 0.42;
        const left = Math.min(0, Math.max(W - dw, tx - (f.x / 100) * dw));
        const top = Math.min(0, Math.max(H - dh, ty - (f.y / 100) * dh));
        return { left, top, width: dw, height: dh };
    }

    window.HeroAssets = { load, reload, byImg, key, splashLayout, DEFAULT_FOCUS };
})();
