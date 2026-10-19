/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// ocrcontrol.js — UI OCR Control: pilih sumber (HDMI capture / webcam / layar / file uji), luruskan gambar,
// atur kotak HUD di atas pratinjau, jalankan OCR → POST /api/ocr/data (dibaca scoreboard lewat /ocr/MLBB.json).
// Bantuan uji: ocrcontrol.html?test=<url gambar/video>&autostart=1

(function () {
    const E = window.OcrEngine;
    const $ = (id) => document.getElementById(id);
    const params = new URLSearchParams(location.search);
    const COLORS = ['#a855f7', '#00d2ff', '#ffd34d', '#4d84ff', '#ffffff', '#ff5a6b', '#ffd34d', '#00ff8c', '#ff9a3d'];

    const view = $('ocView'), vctx = view.getContext('2d');
    const frame = document.createElement('canvas');
    frame.width = E.FRAME_W; frame.height = E.FRAME_H;

    const state = {
        regions: E.DEFAULT_REGIONS.map(r => ({ ...r })),
        crop: null,             // potongan sumber → 1920×1080 (null = penuh)
        source: null,           // <video> atau <img>
        stream: null,
        running: false,
        busy: false,
        sel: 0,
        results: {},            // label → { value, text, conf, pre, stableFor }
        confirmed: {},          // label → nilai yang sudah stabil (dikirim)
        pending: {},            // label → { value } lonjakan yang menunggu konfirmasi
        confirmedAt: {},        // label → waktu nilai terakhir diterima (untuk validasi timer / gold)
        lastMs: 0,
        lastSend: 0,
        lastStart: 0,
        lastJson: ''
    };

    // ---------- Status ----------
    function setStatus(text, mode) {
        $('ocStatus').textContent = text;
        $('ocDot').className = 'oc-dot' + (mode ? ' ' + mode : '');
    }
    function warn(html) { const w = $('ocWarn'); w.hidden = !html; w.innerHTML = html || ''; }

    // browser hanya memberi akses kamera / HDMI capture di localhost atau https. Dari PC server, server sudah
    // mengalihkan ke localhost; pesan ini muncul bila OCR dibuka dari PC LAIN di jaringan.
    if (!window.isSecureContext) {
        const origin = location.origin;
        const firefox = /firefox/i.test(navigator.userAgent);
        warn(`Browser memblokir HDMI capture / webcam di alamat <b>${location.host}</b> (bukan localhost). ` +
            (firefox
                ? `Di Firefox: buka <b>about:config</b>, ubah <b>media.devices.insecure.enabled</b> dan <b>media.getusermedia.insecure.enabled</b> menjadi <b>true</b>, lalu muat ulang halaman ini.`
                : `Di Chrome / Edge: buka <b>chrome://flags/#unsafely-treat-insecure-origin-as-secure</b> (Edge: <b>edge://flags/#unsafely-treat-insecure-origin-as-secure</b>), isi <b>${origin}</b>, pilih <b>Enabled</b>, lalu klik Relaunch.`) +
            ` Cara lain: jalankan OCR di PC server lewat <a href="http://localhost:${location.port || 3000}/ocrcontrol.html" style="color:#fff">localhost</a>.`);
    }

    // ---------- Sumber ----------
    async function listSources() {
        const sel = $('ocSource');
        const keep = sel.value;
        sel.innerHTML = '';
        const groupCam = document.createElement('optgroup');
        groupCam.label = 'HDMI Capture / Webcam';
        try {
            if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
                let devices = await navigator.mediaDevices.enumerateDevices();
                // label perangkat baru muncul setelah izin kamera diberikan sekali
                if (devices.some(d => d.kind === 'videoinput' && !d.label)) {
                    try { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach(t => t.stop()); devices = await navigator.mediaDevices.enumerateDevices(); } catch (e) {}
                }
                devices.filter(d => d.kind === 'videoinput').forEach((d, i) => groupCam.appendChild(new Option(d.label || `Kamera ${i + 1}`, 'cam:' + d.deviceId)));
            }
        } catch (e) {}
        if (!groupCam.children.length) groupCam.appendChild(new Option('(tidak ada perangkat terdeteksi)', '', false, false));
        sel.appendChild(groupCam);
        const other = document.createElement('optgroup');
        other.label = 'Lainnya';
        other.appendChild(new Option('Tangkap layar / jendela (mis. aplikasi mirroring HP)', 'screen'));
        other.appendChild(new Option('File gambar / video (untuk uji)', 'file'));
        sel.appendChild(other);
        if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
    }

    function stopSource() {
        if (state.stream) state.stream.getTracks().forEach(t => t.stop());
        state.stream = null;
        state.source = null;
    }

    function useElement(el, info) {
        state.source = el;
        $('ocEmpty').hidden = true;
        $('ocStart').disabled = false;
        const w = el.videoWidth || el.naturalWidth, h = el.videoHeight || el.naturalHeight;
        $('ocSrcInfo').textContent = `${info}\nResolusi sumber: ${w}×${h}`;
        if (!state.crop) setCropInputs({ x: 0, y: 0, w, h });
        else setCropInputs(state.crop);
    }

    async function connectStream(stream, info) {
        stopSource();
        state.stream = stream;
        const v = document.createElement('video');
        v.muted = true; v.playsInline = true; v.srcObject = stream;
        await v.play();
        await new Promise(r => (v.videoWidth ? r() : v.addEventListener('loadedmetadata', r, { once: true })));
        stream.getVideoTracks()[0].addEventListener('ended', () => { setStatus('Sumber terputus', 'err'); stopSource(); });
        useElement(v, info);
    }

    async function connect() {
        const val = $('ocSource').value;
        try {
            if (val.startsWith('cam:')) {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: { deviceId: { exact: val.slice(4) }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }
                });
                await connectStream(stream, $('ocSource').selectedOptions[0].textContent);
            } else if (val === 'screen') {
                const stream = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
                await connectStream(stream, 'Tangkap layar');
            } else if (val === 'file') {
                $('ocFile').click();
            }
        } catch (e) {
            const busy = e && (e.name === 'NotReadableError' || e.name === 'TrackStartError');
            setStatus(busy ? 'Perangkat sedang dipakai aplikasi lain' : 'Gagal membuka sumber', 'err');
            warn(busy
                ? 'Capture card sedang dipakai aplikasi lain (mis. OBS). Di Windows umumnya satu capture card hanya bisa dibuka satu aplikasi. Solusi: HDMI splitter + capture card kedua, atau di OBS aktifkan <b>Start Virtual Camera</b> lalu pilih "OBS Virtual Camera" di sini (tanpa filter apa pun).'
                : `Tidak bisa membuka sumber: ${e && e.message ? e.message : e}`);
        }
    }

    async function loadUrl(url) {
        stopSource();
        if (/\.(mp4|webm|mov|mkv)(\?|$)/i.test(url)) {
            const v = document.createElement('video');
            v.muted = true; v.loop = true; v.playsInline = true; v.src = url;
            await v.play();
            useElement(v, 'File video (uji)');
        } else {
            const img = new Image();
            await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
            useElement(img, 'File gambar (uji)');
        }
    }

    $('ocFile').addEventListener('change', () => {
        const f = $('ocFile').files[0];
        if (f) loadUrl(URL.createObjectURL(f)).catch(e => setStatus('File tidak bisa dibuka', 'err'));
        $('ocFile').value = '';
    });

    // ---------- Crop ----------
    function setCropInputs(c) { $('cropX').value = c.x; $('cropY').value = c.y; $('cropW').value = c.w; $('cropH').value = c.h; }
    function readCrop() {
        const c = { x: +$('cropX').value || 0, y: +$('cropY').value || 0, w: +$('cropW').value || 0, h: +$('cropH').value || 0 };
        state.crop = c.w > 0 && c.h > 0 ? c : null;
    }
    ['cropX', 'cropY', 'cropW', 'cropH'].forEach(id => $(id).addEventListener('input', readCrop));
    $('ocAutoCrop').addEventListener('click', () => {
        if (!state.source) return;
        const c = E.detectBars(state.source);
        setCropInputs(c); readCrop();
        $('ocSrcInfo').textContent += `\nPotongan otomatis: ${c.w}×${c.h} @ ${c.x},${c.y}`;
    });
    $('ocResetCrop').addEventListener('click', () => {
        if (!state.source) return;
        const w = state.source.videoWidth || state.source.naturalWidth, h = state.source.videoHeight || state.source.naturalHeight;
        setCropInputs({ x: 0, y: 0, w, h }); readCrop();
    });

    // ---------- Tabel kotak ----------
    // 9 kotak bawaan (dipakai scoreboard & analitik server) namanya tetap; kotak tambahan (custom) bisa diganti nama & dihapus
    const BUILTIN = new Set(E.DEFAULT_REGIONS.map(r => r.label));
    const TYPES = [['number', 'Angka'], ['gold', 'Gold'], ['timer', 'Timer'], ['text', 'Teks']];
    const cleanLabel = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 24);
    function uniqueLabel(base, skip) {
        let l = cleanLabel(base) || 'kotak', n = 1;
        const taken = (x) => state.regions.some(r => r !== skip && r.label === x);
        while (taken(l) || (BUILTIN.has(l) && (!skip || skip.label !== l))) l = `${cleanLabel(base) || 'kotak'}_${++n}`;
        return l;
    }
    function forget(label) { delete state.results[label]; delete state.confirmed[label]; delete state.pending[label]; delete state.confirmedAt[label]; }

    function buildRows() {
        $('ocRows').innerHTML = state.regions.map((r, i) => `
            <tr data-i="${i}">
                <td><span class="oc-swatch" style="background:${COLORS[i % COLORS.length]}"></span></td>
                <td>${BUILTIN.has(r.label) ? `<span class="oc-label">${r.label}</span>` : `<input class="oc-name" data-k="label" value="${r.label}" maxlength="24" title="Nama data (huruf kecil, angka, _)">`}</td>
                <td><select data-k="type">${TYPES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></td>
                <td><canvas class="oc-prev" width="10" height="10"></canvas></td>
                <td><span class="oc-val stale">–</span><span class="oc-raw"></span></td>
                <td><input type="range" data-k="bias" min="-60" max="60" step="2"> <small></small></td>
                <td><input type="checkbox" data-k="invert"></td>
                <td>${BUILTIN.has(r.label) ? '' : '<button class="oc-del" data-del title="Hapus kotak">✕</button>'}</td>
            </tr>`).join('');
        $('ocRows').querySelectorAll('tr').forEach(tr => {
            const r = state.regions[+tr.dataset.i];
            tr.querySelector('[data-k=type]').value = r.type;
            tr.querySelector('[data-k=bias]').value = r.bias || 0;
            tr.querySelector('small').textContent = (r.bias > 0 ? '+' : '') + (r.bias || 0);
            tr.querySelector('[data-k=invert]').checked = !!r.invert;
        });
        markSel();
    }

    $('ocRows').addEventListener('input', (e) => {
        const tr = e.target.closest('tr'); if (!tr) return;
        const r = state.regions[+tr.dataset.i];
        const k = e.target.dataset.k;
        if (k === 'label') return; // diproses saat selesai mengetik (change)
        if (k === 'type') { r.type = e.target.value; forget(r.label); }
        if (k === 'bias') { r.bias = +e.target.value; tr.querySelector('small').textContent = (r.bias > 0 ? '+' : '') + r.bias; }
        if (k === 'invert') r.invert = e.target.checked;
        delete state.pending[r.label];
        if (!state.running) previewOnly();
    });
    $('ocRows').addEventListener('change', (e) => {
        if (e.target.dataset.k !== 'label') return;
        const r = state.regions[+e.target.closest('tr').dataset.i];
        const next = uniqueLabel(e.target.value, r);
        if (next !== r.label) { forget(r.label); r.label = next; }
        e.target.value = r.label;
        if (!state.running) previewOnly();
    });
    $('ocRows').addEventListener('click', (e) => {
        const tr = e.target.closest('tr'); if (!tr) return;
        if (e.target.closest('[data-del]')) {
            const r = state.regions[+tr.dataset.i];
            forget(r.label);
            state.regions.splice(+tr.dataset.i, 1);
            state.sel = Math.min(state.sel, state.regions.length - 1);
            buildRows();
            if (!state.running) previewOnly();
            return;
        }
        state.sel = +tr.dataset.i; markSel();
    });

    // ---------- Tambah kotak ----------
    function addRegion(r) {
        const reg = { type: 'number', w: 90, h: 34, bias: 0, invert: false, ...r };
        reg.label = uniqueLabel(reg.label || 'kotak');
        reg.x = Math.max(0, Math.min(E.FRAME_W - reg.w, Math.round(reg.x != null ? reg.x : 915)));
        reg.y = Math.max(0, Math.min(E.FRAME_H - reg.h, Math.round(reg.y != null ? reg.y : 520)));
        state.regions.push(reg);
        return reg;
    }
    $('ocAdd').addEventListener('click', () => {
        const type = $('ocAddType').value;
        const n = state.regions.filter(r => !BUILTIN.has(r.label)).length;
        addRegion({ label: { gold: 'gold_player', number: 'angka', timer: 'timer_custom', text: 'teks' }[type], type, w: type === 'text' ? 180 : 90, x: 860 + (n % 5) * 24, y: 480 + (n % 5) * 24 });
        state.sel = state.regions.length - 1;
        buildRows();
        if (!state.running) previewOnly();
    });
    // 10 kotak gold pemain: gold_b1–gold_b5 (tim biru, kiri) & gold_r1–gold_r5 (tim merah, kanan) — geser ke posisi gold di panel spectator
    $('ocAddGold').addEventListener('click', () => {
        let added = 0;
        ['b', 'r'].forEach(side => {
            for (let i = 1; i <= 5; i++) {
                const label = `gold_${side}${i}`;
                if (state.regions.some(r => r.label === label)) continue;
                addRegion({ label, type: 'gold', w: 84, h: 30, x: side === 'b' ? 160 : 1676, y: 300 + (i - 1) * 96 });
                added++;
            }
        });
        state.sel = state.regions.length - 1;
        buildRows();
        if (!state.running) previewOnly();
        $('ocProfileInfo').textContent = added ? `${added} kotak gold pemain ditambahkan. Geser ke posisi gold tiap pemain, lalu SIMPAN.` : 'Kotak gold pemain sudah ada.';
    });
    function markSel() { $('ocRows').querySelectorAll('tr').forEach(tr => tr.classList.toggle('sel', +tr.dataset.i === state.sel)); }

    function renderRow(i) {
        const r = state.regions[i], res = state.results[r.label];
        const tr = $('ocRows').querySelector(`tr[data-i="${i}"]`);
        if (!tr || !res) return;
        const pc = tr.querySelector('.oc-prev');
        pc.width = res.pre.canvas.width; pc.height = res.pre.canvas.height;
        pc.getContext('2d').drawImage(res.pre.canvas, 0, 0);
        const val = tr.querySelector('.oc-val');
        const shown = state.confirmed[r.label];
        val.textContent = shown != null ? shown : '–';
        val.classList.toggle('stale', res.value == null || res.value !== shown);
        tr.querySelector('.oc-raw').textContent = state.running ? `baca: "${res.text}" ${res.conf}%` : 'pratinjau';
    }

    // ---------- Pratinjau + seret kotak ----------
    let drag = null;
    function toFrame(e) {
        const rc = view.getBoundingClientRect();
        return { x: (e.clientX - rc.left) * E.FRAME_W / rc.width, y: (e.clientY - rc.top) * E.FRAME_H / rc.height };
    }
    view.addEventListener('mousedown', (e) => {
        const p = toFrame(e);
        for (let i = state.regions.length - 1; i >= 0; i--) {
            const r = state.regions[i];
            const corner = Math.abs(p.x - (r.x + r.w)) < 12 && Math.abs(p.y - (r.y + r.h)) < 12;
            if (corner || (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)) {
                drag = { i, mode: corner ? 'resize' : 'move', sx: p.x, sy: p.y, r0: { ...r } };
                state.sel = i; markSel();
                return;
            }
        }
        // area kosong: tarik untuk menggambar kotak baru (jenis = pilihan "Jenis kotak baru")
        const type = $('ocAddType').value;
        const n = state.regions.length;
        const r = addRegion({ label: { gold: 'gold_player', number: 'angka', timer: 'timer_custom', text: 'teks' }[type], type, x: p.x, y: p.y, w: 10, h: 10 });
        drag = { i: n, mode: 'create', sx: p.x, sy: p.y, r0: { ...r } };
        state.sel = n;
    });
    window.addEventListener('mousemove', (e) => {
        const p = toFrame(e);
        if (!drag) {
            const over = state.regions.find(r => Math.abs(p.x - (r.x + r.w)) < 12 && Math.abs(p.y - (r.y + r.h)) < 12);
            view.style.cursor = over ? 'nwse-resize' : state.regions.some(r => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) ? 'move' : 'crosshair';
            return;
        }
        const r = state.regions[drag.i], dx = Math.round(p.x - drag.sx), dy = Math.round(p.y - drag.sy);
        if (drag.mode === 'create') {
            r.x = Math.round(Math.min(drag.sx, p.x)); r.y = Math.round(Math.min(drag.sy, p.y));
            r.w = Math.max(10, Math.abs(dx)); r.h = Math.max(10, Math.abs(dy));
        } else if (drag.mode === 'move') { r.x = drag.r0.x + dx; r.y = drag.r0.y + dy; }
        else { r.w = Math.max(10, drag.r0.w + dx); r.h = Math.max(10, drag.r0.h + dy); }
        r.x = Math.max(0, Math.min(E.FRAME_W - r.w, r.x)); r.y = Math.max(0, Math.min(E.FRAME_H - r.h, r.y));
    });
    window.addEventListener('mouseup', () => {
        if (!drag) return;
        if (drag.mode === 'create') {
            const r = state.regions[drag.i];
            if (r.w < 14 || r.h < 10) { state.regions.splice(drag.i, 1); state.sel = Math.min(state.sel, state.regions.length - 1); } // hanya klik → batal
            buildRows();
        }
        drag = null;
        if (!state.running) previewOnly();
    });

    // tombol panah: geser kotak terpilih 1 px (Shift = 10 px)
    window.addEventListener('keydown', (e) => {
        if (/INPUT|SELECT/.test(e.target.tagName)) return;
        const r = state.regions[state.sel]; if (!r) return;
        const s = e.shiftKey ? 10 : 1;
        const m = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
        if (!m) return;
        e.preventDefault(); r.x += m[0]; r.y += m[1];
        if (!state.running) previewOnly();
    });

    // kanvas pratinjau setengah resolusi; koordinat tetap 1920×1080 lewat transform
    view.width = E.FRAME_W / 2; view.height = E.FRAME_H / 2;
    function drawView() {
        vctx.setTransform(0.5, 0, 0, 0.5, 0, 0);
        const sw = state.source.videoWidth || state.source.naturalWidth, sh = state.source.videoHeight || state.source.naturalHeight;
        const c = state.crop && state.crop.w ? state.crop : { x: 0, y: 0, w: sw, h: sh };
        if (sw) vctx.drawImage(state.source, c.x, c.y, c.w, c.h, 0, 0, E.FRAME_W, E.FRAME_H);
        state.regions.forEach((r, i) => {
            const c = COLORS[i % COLORS.length], sel = i === state.sel;
            vctx.lineWidth = sel ? 3 : 2;
            vctx.strokeStyle = c;
            vctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
            vctx.fillStyle = c;
            vctx.fillRect(r.x + r.w - 7, r.y + r.h - 7, 9, 9);
            const v = state.confirmed[r.label];
            const tag = `${r.label}${v != null ? ' = ' + v : ''}`;
            vctx.font = 'bold 20px Segoe UI';
            const tw = vctx.measureText(tag).width + 10;
            const ty = r.y + r.h + 4 + (i % 2) * 28; // label berselang-seling agar tidak bertumpuk
            vctx.fillStyle = 'rgba(0,0,0,.78)'; vctx.fillRect(r.x, ty, tw, 26);
            vctx.fillStyle = c; vctx.fillText(tag, r.x + 5, ty + 20);
        });
    }

    // pratinjau ±15 fps (cukup untuk operator) agar CPU tidak berebut dengan mesin OCR
    let lastView = 0;
    (function loop(ts) {
        if (state.source && (!ts || ts - lastView > 66)) { lastView = ts || 0; drawView(); }
        requestAnimationFrame(loop);
    })();

    function previewOnly() {
        if (!state.source) return;
        E.drawFrame(frame, state.source, state.crop);
        state.regions.forEach((r, i) => {
            const pre = E.preprocess(frame, r);
            state.results[r.label] = { ...(state.results[r.label] || {}), pre, text: '', value: null, conf: 0 };
            renderRow(i);
        });
    }

    // ---------- OCR ----------
    // timer di Web Worker: tetap berdetak saat tab tidak aktif (setTimeout di tab latar diperlambat browser)
    const ticker = new Worker(URL.createObjectURL(new Blob(['let t=null;onmessage=e=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}'], { type: 'text/javascript' })));
    ticker.onmessage = () => tick();

    // ---------- Penerimaan nilai: langsung bila masuk akal, konfirmasi 2× hanya untuk lonjakan aneh ----------
    const secs = (t) => { const m = /^(\d+):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
    const goldNum = (g) => (/k$/i.test(g) ? parseFloat(g) * 1000 : parseInt(g, 10));
    function plausible(r, oldV, newV, sinceMs) {
        if (oldV == null) return true;
        if (r.type === 'timer') {
            const o = secs(oldV), n = secs(newV);
            if (o == null || n == null) return false;
            const expect = o + sinceMs / 1000;               // timer game berjalan 1 detik / detik
            return n >= o && Math.abs(n - expect) <= 3;
        }
        if (r.type === 'text') return true;                  // teks (nickname) boleh berubah kapan saja
        if (r.type === 'gold') {
            const d = goldNum(newV) - goldNum(oldV);
            return d >= -60 && d <= 1500 + sinceMs * 0.8;    // gold tim hanya naik (toleransi format "k")
        }
        const d = +newV - +oldV;
        return d >= 0 && d <= 3;                             // kill / turret / lord: naik sedikit
    }
    function accept(r, v) {
        const now = Date.now();
        const cur = state.confirmed[r.label];
        const since = now - (state.confirmedAt[r.label] || now);
        const p = state.pending[r.label];
        if (cur === v) { delete state.pending[r.label]; return; }
        if (plausible(r, cur, v, since) || (p && p.value === v)) {
            state.confirmed[r.label] = v;
            state.confirmedAt[r.label] = now;
            delete state.pending[r.label];
        } else {
            state.pending[r.label] = { value: v };            // lonjakan aneh (salah baca / game baru) → tunggu sekali lagi
        }
    }

    async function tick() {
        if (!state.running || state.busy || !state.source) return;
        // jeda antar baca: 0 = secepatnya (baca berikutnya langsung setelah yang sebelumnya selesai)
        const gap = +$('ocInterval').value || 0;
        if (performance.now() - state.lastStart < gap) return;
        state.lastStart = performance.now();
        state.busy = true;
        const t0 = performance.now();
        try {
            E.drawFrame(frame, state.source, state.crop);
            const results = await Promise.all(state.regions.map(r => E.read(frame, r).then(res => [r, res])));
            const out = {};
            results.forEach(([r, res], i) => {
                state.results[r.label] = res;
                if (res.value != null) accept(r, res.value);
                renderRow(i);
            });
            state.regions.forEach(r => { if (state.confirmed[r.label] != null) out[r.label] = state.confirmed[r.label]; });
            state.lastMs = Math.round(performance.now() - t0);
            const json = JSON.stringify(out);
            // kirim saat berubah, dan minimal tiap 2 detik (penanda OCR masih hidup)
            if (json !== state.lastJson || Date.now() - state.lastSend > 2000) {
                $('ocJson').textContent = JSON.stringify(out, null, 2);
                await fetch('/api/ocr/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json });
                state.lastJson = json;
                state.lastSend = Date.now();
            }
            const fresh = results.filter(([, res]) => !res.cached).length;
            state.rate = state.rate ? state.rate * 0.8 + (1000 / Math.max(1, performance.now() - state.prevStart)) * 0.2 : 1;
            state.prevStart = t0;
            $('ocPerf').textContent = `Sekali baca: ${state.lastMs} ms (${fresh} kotak dibaca ulang, ${state.regions.length - fresh} tidak berubah)\n±${state.rate.toFixed(1)} baca / detik\nTerkirim: ${new Date(state.lastSend).toLocaleTimeString()}`;
            setStatus('OCR berjalan', 'on');
        } catch (e) {
            setStatus('Error: ' + (e.message || e), 'err');
        } finally {
            state.busy = false;
        }
    }

    async function startOcr() {
        if (!state.source) return;
        $('ocStart').disabled = true;
        try {
            await E.start(+$('ocThreads').value || 2, (s) => setStatus(s));
            state.running = true;
            state.pending = {};
            state.confirmed = {};
            state.confirmedAt = {};
            state.lastStart = 0;
            $('ocStart').textContent = 'STOP OCR';
            $('ocStart').className = 'danger';
            ticker.postMessage(40); // detak 40 ms; jeda sebenarnya diatur pilihan "Interval baca"
            tick();
        } catch (e) {
            setStatus('Mesin OCR gagal dimuat: ' + (e.message || e), 'err');
        } finally { $('ocStart').disabled = false; }
    }

    async function stopOcr() {
        state.running = false;
        ticker.postMessage(0);
        // tunggu putaran baca yang sedang berjalan selesai sebelum mesin dimatikan
        for (let i = 0; state.busy && i < 50; i++) await new Promise(r => setTimeout(r, 100));
        await E.stop();
        $('ocStart').textContent = 'START OCR';
        $('ocStart').className = 'primary';
        setStatus('Berhenti');
    }

    $('ocStart').addEventListener('click', () => (state.running ? stopOcr() : startOcr()));
    $('ocConnect').addEventListener('click', connect);
    $('ocRefresh').addEventListener('click', listSources);

    // ---------- Profil ----------
    function profile() { return { regions: state.regions, crop: state.crop, interval: +$('ocInterval').value, threads: +$('ocThreads').value, source: $('ocSource').value }; }
    function applyProfile(p) {
        if (!p) return;
        if (Array.isArray(p.regions) && p.regions.length) {
            // terima juga profil FalseOCR (label/x/y/w/h/invertText)
            state.regions = p.regions.filter(r => r && cleanLabel(r.label)).map(r => ({
                label: cleanLabel(r.label), type: ['gold', 'timer', 'number', 'text'].includes(r.type) ? r.type : (/gold/i.test(r.label) ? 'gold' : /timer/i.test(r.label) ? 'timer' : 'number'),
                x: +r.x, y: +r.y, w: +r.w, h: +r.h, bias: +r.bias || 0, invert: r.invert != null ? !!r.invert : r.invertText === false
            }));
        }
        state.crop = p.crop || null;
        if (p.interval != null && [...$('ocInterval').options].some(o => +o.value === +p.interval)) $('ocInterval').value = p.interval;
        if (p.threads) $('ocThreads').value = p.threads;
        if (p.source && [...$('ocSource').options].some(o => o.value === p.source)) $('ocSource').value = p.source;
        buildRows();
    }
    $('ocSave').addEventListener('click', async () => {
        await fetch('/api/ocr/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile()) });
        $('ocProfileInfo').textContent = 'Tersimpan ' + new Date().toLocaleTimeString();
    });
    $('ocDefault').addEventListener('click', () => { state.regions = E.DEFAULT_REGIONS.map(r => ({ ...r })); state.confirmed = {}; buildRows(); previewOnly(); });
    $('ocExport').addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(profile(), null, 2)], { type: 'application/json' }));
        a.download = 'ocr_profile_MLBB.json'; a.click();
    });
    $('ocImport').addEventListener('click', () => $('ocImportFile').click());
    $('ocImportFile').addEventListener('change', async () => {
        const f = $('ocImportFile').files[0]; if (!f) return;
        try { applyProfile(JSON.parse(await f.text())); previewOnly(); $('ocProfileInfo').textContent = 'Diimpor: ' + f.name; }
        catch (e) { $('ocProfileInfo').textContent = 'File profil tidak valid'; }
        $('ocImportFile').value = '';
    });

    // ---------- Mulai ----------
    (async () => {
        await listSources();
        try {
            const saved = await (await fetch('/api/ocr/profile', { cache: 'no-store' })).json();
            applyProfile(saved);
            $('ocProfileInfo').textContent = saved ? 'Profil tersimpan dimuat' : 'Memakai posisi bawaan (belum disimpan)';
        } catch (e) { buildRows(); }
        if (!$('ocRows').children.length) buildRows();
        const test = params.get('test');
        if (test) {
            await loadUrl(test);
            previewOnly();
            if (params.get('autostart')) startOcr();
        }
    })();

    window.OcrControl = { state, tick, previewOnly, connectStream };
})();
