/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// ocr-engine.js — mesin OCR HUD MLBB untuk ocrcontrol.html (tanpa OBS: langsung dari HDMI capture / webcam / layar)
//
// Alur per kotak (region, koordinat 1920×1080 setelah frame diluruskan):
//   potong → perbesar ×3 (halus) → luminansi = kanal warna paling terang (teks biru/merah tetap terang)
//   → ambang otomatis Otsu (+ bias per kotak) → teks hitam di atas putih → buang bintik / sisa ikon
//   → Tesseract (satu baris, whitelist angka) → normalisasi sesuai tipe (number / gold / timer)
// Nilai baru baru dipakai bila terbaca sama 2× berturut-turut (anti kedip).

(function () {
    const FRAME_W = 1920, FRAME_H = 1080;
    const SCALE = 3;
    const NORM_H = 36;

    // posisi bawaan: HUD penonton/observer MLBB 1920×1080 (diukur dari contoh gameplay)
    const DEFAULT_REGIONS = [
        { label: 'lord1', type: 'number', x: 528, y: 12, w: 46, h: 34 },
        { label: 'turret1', type: 'number', x: 630, y: 12, w: 48, h: 34 },
        { label: 'gold1', type: 'gold', x: 712, y: 12, w: 92, h: 34 },
        { label: 'killscore1', type: 'number', x: 842, y: 8, w: 62, h: 40 },
        { label: 'timer', type: 'timer', x: 914, y: 10, w: 94, h: 36 },
        { label: 'killscore2', type: 'number', x: 1018, y: 8, w: 62, h: 40 },
        { label: 'gold2', type: 'gold', x: 1184, y: 12, w: 82, h: 34 },
        { label: 'turret2', type: 'number', x: 1304, y: 12, w: 48, h: 34 },
        { label: 'lord2', type: 'number', x: 1397, y: 12, w: 48, h: 34 }
    ].map(r => ({ ...r, bias: 0, invert: false }));

    // ---------- Pra-proses ----------
    function otsu(hist, total) {
        let sum = 0;
        for (let i = 0; i < 256; i++) sum += i * hist[i];
        let sumB = 0, wB = 0, best = 0, th = 128;
        for (let t = 0; t < 256; t++) {
            wB += hist[t];
            if (!wB) continue;
            const wF = total - wB;
            if (!wF) break;
            sumB += t * hist[t];
            const mB = sumB / wB, mF = (sum - sumB) / wF;
            const v = wB * wF * (mB - mF) * (mB - mF);
            if (v > best) { best = v; th = t; }
        }
        return th;
    }

    // komponen terhubung pada mask teks; buang yang terlalu kecil / pendek dibanding komponen tertinggi
    function cleanComponents(mask, w, h) {
        const label = new Int32Array(w * h).fill(-1);
        const comps = [];
        const stack = [];
        for (let p = 0; p < w * h; p++) {
            if (!mask[p] || label[p] !== -1) continue;
            const c = { id: comps.length, area: 0, minY: h, maxY: 0, minX: w, maxX: 0, pix: [] };
            stack.push(p); label[p] = c.id;
            while (stack.length) {
                const q = stack.pop();
                const x = q % w, y = (q / w) | 0;
                c.area++; c.pix.push(q);
                if (y < c.minY) c.minY = y; if (y > c.maxY) c.maxY = y;
                if (x < c.minX) c.minX = x; if (x > c.maxX) c.maxX = x;
                const nb = [q - 1, q + 1, q - w, q + w];
                if (x === 0) nb[0] = -1; if (x === w - 1) nb[1] = -1;
                for (const n of nb) if (n >= 0 && n < w * h && mask[n] && label[n] === -1) { label[n] = c.id; stack.push(n); }
            }
            comps.push(c);
        }
        if (!comps.length) return 0;
        const tallest = Math.max(...comps.map(c => c.maxY - c.minY + 1));
        let kept = 0;
        for (const c of comps) {
            const ch = c.maxY - c.minY + 1;
            const cw = c.maxX - c.minX + 1;
            const atEdge = c.minX === 0 || c.maxX === w - 1;
            // sisa ikon di tepi kotak: lebih pendek dari angka, atau potongan sempit-tinggi yang terpotong tepi
            const touchesEdgeOnly = atEdge && (ch < tallest * 0.9 || cw < ch * 0.35);
            const tiny = c.area < (w * h) * 0.002 || ch < tallest * 0.45;
            const isFrame = (c.maxX - c.minX + 1) > w * 0.92; // garis/bingkai melintang
            if (tiny || touchesEdgeOnly || isFrame) c.pix.forEach(q => { mask[q] = 0; });
            else kept++;
        }
        return kept;
    }

    // hasil: { canvas (teks hitam di atas putih), blobs } — canvas juga dipakai sebagai pratinjau di UI
    function preprocess(frameCanvas, r) {
        const w = Math.max(4, Math.round(r.w * SCALE)), h = Math.max(4, Math.round(r.h * SCALE));
        const src = document.createElement('canvas');
        src.width = w; src.height = h;
        const sctx = src.getContext('2d', { willReadFrequently: true });
        sctx.imageSmoothingEnabled = true;
        sctx.imageSmoothingQuality = 'high';
        sctx.drawImage(frameCanvas, r.x, r.y, r.w, r.h, 0, 0, w, h);
        const d = sctx.getImageData(0, 0, w, h).data;

        const lum = new Uint8Array(w * h);
        const hist = new Uint32Array(256);
        for (let i = 0, p = 0; p < w * h; p++, i += 4) {
            const v = Math.max(d[i], d[i + 1], d[i + 2]);
            lum[p] = v; hist[v]++;
        }
        const th = Math.min(250, Math.max(5, otsu(hist, w * h) + (r.bias || 0)));
        const mask = new Uint8Array(w * h);
        for (let p = 0; p < w * h; p++) mask[p] = r.invert ? (lum[p] < th ? 1 : 0) : (lum[p] > th ? 1 : 0);
        const blobs = cleanComponents(mask, w, h);

        // teks hitam di atas putih, dipotong ke batas teks
        let l = w, t = h, rr = -1, b = -1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { if (x < l) l = x; if (x > rr) rr = x; if (y < t) t = y; if (y > b) b = y; }
        const bw = Math.max(1, rr - l + 1), bh = Math.max(1, b - t + 1);
        const bin = document.createElement('canvas');
        bin.width = blobs ? bw : w; bin.height = blobs ? bh : h;
        const bctx = bin.getContext('2d');
        const img = bctx.createImageData(bin.width, bin.height);
        for (let y = 0; y < bin.height; y++) for (let x = 0; x < bin.width; x++) {
            const on = blobs ? mask[(y + t) * w + (x + l)] : 0;
            const i = (y * bin.width + x) * 4;
            img.data[i] = img.data[i + 1] = img.data[i + 2] = on ? 0 : 255; img.data[i + 3] = 255;
        }
        bctx.putImageData(img, 0, 0);

        // tinggi teks disamakan ±36 px (ukuran yang paling andal untuk Tesseract), beri margin putih
        // angka tunggal digandakan "000" → dibaca sebagai satu baris (Tesseract sering kosong pada 1 karakter)
        // hanya bila potongan memang selebar satu angka (dua angka yang menempel jangan digandakan)
        const tiles = blobs === 1 && r.type === 'number' && bin.width / bin.height < 0.9 ? 3 : 1;
        const H = NORM_H, s = H / bin.height, gw = Math.max(1, Math.round(bin.width * s)), gap = Math.round(H * 0.35);
        const out = document.createElement('canvas');
        out.width = H * 2 + tiles * gw + (tiles - 1) * gap; out.height = H * 3;
        const octx = out.getContext('2d');
        octx.fillStyle = '#fff';
        octx.fillRect(0, 0, out.width, out.height);
        octx.imageSmoothingEnabled = true;
        octx.imageSmoothingQuality = 'high';
        if (blobs) for (let k = 0; k < tiles; k++) octx.drawImage(bin, 0, 0, bin.width, bin.height, H + k * (gw + gap), H, gw, H);
        return { canvas: out, blobs, tiles, threshold: th, sig: signature(mask, w, h) };
    }

    // sidik gambar teks (grid 48×16 rasio piksel teks) — untuk melewati OCR bila angka di kotak tidak berubah
    const SIG_W = 48, SIG_H = 16;
    function signature(mask, w, h) {
        const sig = new Float32Array(SIG_W * SIG_H);
        for (let y = 0; y < h; y++) {
            const gy = Math.min(SIG_H - 1, (y * SIG_H / h) | 0);
            for (let x = 0; x < w; x++) if (mask[y * w + x]) sig[gy * SIG_W + Math.min(SIG_W - 1, (x * SIG_W / w) | 0)]++;
        }
        const cell = (w / SIG_W) * (h / SIG_H);
        for (let i = 0; i < sig.length; i++) sig[i] /= cell;
        return sig;
    }
    // dibandingkan per kolom: satu digit yang berubah membuat beberapa kolom berbeda jauh,
    // sedangkan derau kompresi / tepi ambang tersebar tipis di semua kolom
    function sameSig(a, b) {
        if (!a || !b) return false;
        for (let x = 0; x < SIG_W; x++) {
            let col = 0;
            for (let y = 0; y < SIG_H; y++) col += Math.abs(a[y * SIG_W + x] - b[y * SIG_W + x]);
            if (col > 1.2) return false;
        }
        return true;
    }
    const lastRead = {}; // label → { sig, text, value, conf, type, bias, invert }

    // ---------- Normalisasi teks ----------
    const FIX = { o: '0', O: '0', Q: '0', D: '0', l: '1', I: '1', '|': '1', i: '1', '!': '1', Z: '2', z: '2', S: '5', s: '5', B: '8', G: '6', g: '9', T: '7' };
    const fixChars = (t) => t.replace(/[oOQDlI|i!ZzSsBGgT]/g, c => FIX[c]);

    function normalize(type, raw) {
        let t = fixChars(String(raw || '').replace(/\s+/g, ''));
        if (type === 'timer') {
            const digits = t.replace(/[^0-9]/g, '');
            if (digits.length < 3 || digits.length > 4) return null;
            const mm = digits.slice(0, digits.length - 2), ss = digits.slice(-2);
            if (+ss > 59) return null;
            return `${mm.padStart(2, '0')}:${ss}`;
        }
        if (type === 'gold') {
            const hasK = /[kK]/.test(t);
            const digits = t.split(/[kK]/)[0].replace(/[^0-9]/g, '');
            if (!digits) return null;
            if (hasK) {
                if (digits.length === 3) return `${digits.slice(0, 2)}.${digits[2]}k`;
                if (digits.length === 2) return `${digits}k`;
                if (digits.length === 4 && digits[2] === '0') return `${digits.slice(0, 2)}.${digits[3]}k`;
                return null;
            }
            if (digits.length === 4 && digits[0] !== '0') return digits; // fase awal: 1500 – 9999
            if (digits.length === 3 && t.includes('.')) return null;
            return null;
        }
        const digits = t.replace(/[^0-9]/g, '');
        if (!digits || digits.length > 3) return null;
        return String(parseInt(digits, 10));
    }

    // ---------- Tesseract ----------
    let scheduler = null;
    async function makeWorker(psm, whitelist) {
        const base = `${location.origin}/vendor/tesseract`;
        const worker = await Tesseract.createWorker('eng', 1, {
            workerPath: `${base}/worker.min.js`,
            corePath: `${base}/core`,
            langPath: `${base}/lang`,
            gzip: false,
            cacheMethod: 'none'
        });
        await worker.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: whitelist });
        return worker;
    }

    async function start(threads, onStatus) {
        await stop();
        const s = Tesseract.createScheduler();
        for (let i = 0; i < threads; i++) {
            if (onStatus) onStatus(`Menyiapkan mesin OCR (${i + 1}/${threads})…`);
            s.addWorker(await makeWorker(Tesseract.PSM.SINGLE_LINE, '0123456789.:kK'));
        }
        scheduler = s;
    }

    async function stop() {
        const s = scheduler;
        scheduler = null;
        Object.keys(lastRead).forEach(k => delete lastRead[k]);
        if (s) await s.terminate();
    }

    async function read(frameCanvas, r) {
        const pre = preprocess(frameCanvas, r);
        if (!scheduler || !pre.blobs) return { pre, text: '', value: null, conf: 0 };
        // angka di kotak tidak berubah sejak baca terakhir → pakai hasil lama tanpa Tesseract
        const prev = lastRead[r.label];
        if (prev && prev.type === r.type && prev.bias === r.bias && prev.invert === r.invert && sameSig(prev.sig, pre.sig)) {
            return { pre, text: prev.text, value: prev.value, conf: prev.conf, cached: true };
        }
        const { data } = await scheduler.addJob('recognize', pre.canvas);
        let text = (data.text || '').replace(/\s+/g, '');
        if (pre.tiles > 1) {
            // "000" → "0": ambil karakter angka yang paling sering muncul
            const counts = {};
            for (const ch of text.replace(/[^0-9]/g, '')) counts[ch] = (counts[ch] || 0) + 1;
            const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
            text = best && best[1] >= 2 ? best[0] : '';
        }
        const res = { pre, text, value: normalize(r.type, text), conf: Math.round(data.confidence || 0) };
        // simpan untuk dilewati berikutnya hanya bila terbaca valid (yang gagal dibaca ulang terus)
        if (res.value != null) lastRead[r.label] = { sig: pre.sig, text, value: res.value, conf: res.conf, type: r.type, bias: r.bias, invert: r.invert };
        else delete lastRead[r.label];
        return res;
    }

    // ---------- Frame: luruskan sumber (crop bingkai hitam) ke kanvas 1920×1080 ----------
    function drawFrame(frameCanvas, source, crop) {
        const ctx = frameCanvas.getContext('2d', { willReadFrequently: true });
        const sw = source.videoWidth || source.naturalWidth || source.width;
        const sh = source.videoHeight || source.naturalHeight || source.height;
        if (!sw || !sh) return false;
        const c = crop && crop.w ? crop : { x: 0, y: 0, w: sw, h: sh };
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(source, c.x, c.y, c.w, c.h, 0, 0, FRAME_W, FRAME_H);
        return true;
    }

    // deteksi bingkai hitam (letterbox / pillarbox) pada sumber
    function detectBars(source) {
        const sw = source.videoWidth || source.naturalWidth || source.width;
        const sh = source.videoHeight || source.naturalHeight || source.height;
        const c = document.createElement('canvas');
        c.width = sw; c.height = sh;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(source, 0, 0);
        const d = x.getImageData(0, 0, sw, sh).data;
        const rowDark = (y) => { let s = 0; for (let i = 0; i < sw; i += 4) { const k = (y * sw + i) * 4; s += Math.max(d[k], d[k + 1], d[k + 2]); } return s / (sw / 4) < 18; };
        const colDark = (xx) => { let s = 0; for (let j = 0; j < sh; j += 4) { const k = (j * sw + xx) * 4; s += Math.max(d[k], d[k + 1], d[k + 2]); } return s / (sh / 4) < 18; };
        let top = 0, bottom = sh - 1, left = 0, right = sw - 1;
        while (top < sh / 3 && rowDark(top)) top++;
        while (bottom > sh * 2 / 3 && rowDark(bottom)) bottom--;
        while (left < sw / 3 && colDark(left)) left++;
        while (right > sw * 2 / 3 && colDark(right)) right--;
        return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
    }

    window.OcrEngine = { FRAME_W, FRAME_H, DEFAULT_REGIONS, preprocess, normalize, start, stop, read, drawFrame, detectBars, ready: () => !!scheduler };
})();
