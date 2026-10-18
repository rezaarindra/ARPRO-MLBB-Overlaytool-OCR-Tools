/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// vodtimeline.js — daftar event dari GET /api/vod, diperbarui lewat WebSocket vod_update.
(() => {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const KIND = { draft: 'DRAFT', game: 'GAME', result: 'HASIL', notif: 'VIDEO', ocr: 'OCR AUTO', multikill: 'MULTIKILL', event: 'PEMAIN', pause: 'PAUSE', milestone: 'MILESTONE', manual: 'MANUAL' };
    let vod = null, skew = 0, filter = 'all', pending = false;

    const msg = (t, cls = '') => { $('vtMsg').textContent = t; $('vtMsg').className = 'vt-msg ' + cls; };
    const hms = (sec) => { const s = Math.max(0, Math.floor(sec)), h = Math.floor(s / 3600), p = (n) => String(n).padStart(2, '0'); return `${h ? h + ':' + p(Math.floor(s / 60) % 60) : Math.floor(s / 60)}:${p(s % 60)}`; };
    const clock = (at) => new Date(at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    async function post(url, body) {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.message || r.statusText);
        return j;
    }

    function tick() {
        if (!vod) return;
        const rec = vod.recording, now = Date.now() + skew;
        $('vtDot').classList.toggle('on', rec);
        $('vtState').textContent = rec ? 'MEREKAM' : vod.startAt ? 'REKAMAN DIHENTIKAN' : 'REKAMAN BELUM DIMULAI';
        $('vtElapsed').textContent = vod.startAt ? hms(((vod.stopAt || now) - vod.startAt) / 1000) : '--:--';
    }
    setInterval(tick, 500);

    function render() {
        // jangan timpa label yang sedang diketik operator
        if (document.activeElement && document.activeElement.classList.contains('lbl')) { pending = true; return; }
        pending = false;
        const counts = {};
        vod.events.forEach(e => { counts[e.kind] = (counts[e.kind] || 0) + 1; });
        $('vtFilter').innerHTML = [['all', `SEMUA ${vod.events.length}`], ['chapter', `CHAPTER ${vod.events.filter(e => e.chapter).length}`],
            ...Object.keys(KIND).filter(k => counts[k]).map(k => [k, `${KIND[k]} ${counts[k]}`])]
            .map(([k, l]) => `<button data-f="${k}" class="${filter === k ? 'on' : ''}">${l}</button>`).join('');
        const list = vod.events.filter(e => filter === 'all' || (filter === 'chapter' ? e.chapter : e.kind === filter)).slice().reverse();
        $('vtBody').innerHTML = list.map(e => {
            const out = !vod.startAt || e.at < vod.startAt || (vod.stopAt && e.at > vod.stopAt);
            return `<tr data-id="${e.id}" class="${e.chapter ? 'ch' : ''} ${out ? 'out' : ''}" title="${out ? 'Di luar rentang rekaman: tidak ikut diekspor' : ''}">
                <td class="tc">${vod.startAt && !out ? hms((e.at - vod.startAt) / 1000) : '—'}</td>
                <td class="clk">${clock(e.at)}</td>
                <td><span class="vt-kind ${e.kind}">${KIND[e.kind] || e.kind}</span></td>
                <td><input class="lbl" value="${esc(e.label)}" maxlength="100"></td>
                <td><input type="checkbox" class="chk" ${e.chapter ? 'checked' : ''}></td>
                <td class="vt-nudge"><button data-shift="-5">-5s</button> <button data-shift="5">+5s</button></td>
                <td><button data-del title="Hapus">✕</button></td>
            </tr>`;
        }).join('') || `<tr><td colspan="7" class="vt-empty">Belum ada event. Event akan muncul otomatis selama siaran berjalan.</td></tr>`;
        const yt = vod.youtube;
        $('vtYt').value = yt.text;
        $('vtWarn').innerHTML = yt.warnings.map(esc).join('<br>');
        $('vtInfo').textContent = vod.startAt
            ? `Mulai: ${clock(vod.startAt)}${vod.stopAt ? `\nStop : ${clock(vod.stopAt)}` : ''}\nEvent di rentang rekaman: ${vod.events.filter(e => e.at >= vod.startAt && (!vod.stopAt || e.at <= vod.stopAt)).length}`
            : 'Belum mulai. Event tetap dicatat dan ikut terhitung setelah MULAI REKAM (bila terjadi sesudahnya).';
        tick();
    }

    async function load() {
        const intro = $('vtIntro').value.trim();
        vod = await (await fetch('/api/vod' + (intro ? '?intro=' + encodeURIComponent(intro) : ''), { cache: 'no-store' })).json();
        skew = vod.now - Date.now();
        render();
    }

    // ---------- tabel ----------
    $('vtFilter').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { filter = b.dataset.f; render(); } });
    $('vtBody').addEventListener('change', async (e) => {
        const id = e.target.closest('tr').dataset.id;
        try {
            if (e.target.classList.contains('lbl')) await post('/api/vod/event', { id, label: e.target.value });
            if (e.target.classList.contains('chk')) await post('/api/vod/event', { id, chapter: e.target.checked });
        } catch (err) { msg(err.message, 'err'); }
    });
    $('vtBody').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('lbl')) e.target.blur(); });
    $('vtBody').addEventListener('focusout', () => { setTimeout(() => { if (pending) render(); }, 50); });
    $('vtBody').addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        const id = b.closest('tr').dataset.id;
        try {
            if (b.dataset.shift) await post('/api/vod/event', { id, shift: +b.dataset.shift });
            if (b.hasAttribute('data-del')) await post('/api/vod/event', { id, delete: true });
        } catch (err) { msg(err.message, 'err'); }
    });

    // ---------- rekaman ----------
    $('vtStart').addEventListener('click', async () => {
        if (vod && vod.recording && !confirm('Rekaman sedang berjalan. Mulai ulang hitungan waktu dari sekarang?')) return;
        try { await post('/api/vod/start', { offset: $('vtOffset').value.trim() || 0 }); $('vtOffset').value = ''; msg('Waktu rekaman mulai dihitung.', 'ok'); }
        catch (err) { msg(err.message, 'err'); }
    });
    $('vtStop').addEventListener('click', async () => { try { await post('/api/vod/stop'); msg('Rekaman dihentikan.', 'ok'); } catch (err) { msg(err.message, 'err'); } });

    // ---------- tanda manual ----------
    async function mark(label, chapter) {
        try {
            const e = await post('/api/vod/mark', { label: label || (chapter ? 'CHAPTER' : 'HIGHLIGHT'), chapter });
            msg(`${chapter ? 'Chapter' : 'Highlight'} "${e.label}" ditandai${vod && vod.startAt ? ' di ' + hms((e.at - vod.startAt) / 1000) : ''}.`, 'ok');
            $('vtLabel').value = '';
        } catch (err) { msg(err.message, 'err'); }
    }
    $('vtMark').addEventListener('click', () => mark($('vtLabel').value.trim(), false));
    $('vtChapter').addEventListener('click', () => mark($('vtLabel').value.trim(), true));
    $('vtQuick').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) mark(b.textContent.trim(), true); });
    $('vtLabel').addEventListener('keydown', (e) => { if (e.key === 'Enter') mark($('vtLabel').value.trim(), false); });
    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() !== 'h' || e.ctrlKey || e.altKey || e.metaKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
        e.preventDefault(); mark('', false);
    });

    // ---------- ekspor ----------
    let introTimer = null;
    $('vtIntro').addEventListener('input', () => { clearTimeout(introTimer); introTimer = setTimeout(load, 300); });
    $('vtCopy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText($('vtYt').value); msg('Chapter disalin.', 'ok'); }
        catch (e) { $('vtYt').select(); document.execCommand('copy'); msg('Chapter disalin.', 'ok'); }
    });
    const dl = (format, extra = '') => { location.href = `/api/vod/export?format=${format}&download=1${extra}`; };
    $('vtYtDl').addEventListener('click', () => dl('youtube', $('vtIntro').value.trim() ? '&intro=' + encodeURIComponent($('vtIntro').value.trim()) : ''));
    $('vtEdl').addEventListener('click', () => dl('edl', `&fps=${$('vtFps').value}&base=${$('vtBase').value}`));
    $('vtCsv').addEventListener('click', () => dl('csv'));
    $('vtTxt').addEventListener('click', () => dl('txt'));
    $('vtClear').addEventListener('click', async () => {
        if (!confirm('Hapus semua event & waktu rekaman? Lakukan setelah chapter / marker diekspor.')) return;
        try { await post('/api/vod/clear', { confirm: 'CLEAR' }); msg('Timeline dikosongkan.', 'ok'); } catch (err) { msg(err.message, 'err'); }
    });

    // ---------- WebSocket ----------
    let reloadTimer = null;
    (function connect() {
        const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
        ws.onopen = load;
        ws.onmessage = (ev) => { try { if (JSON.parse(ev.data).type === 'vod_update') { clearTimeout(reloadTimer); reloadTimer = setTimeout(load, 150); } } catch (e) {} };
        ws.onclose = () => setTimeout(connect, 2000);
    })();
    load().catch(e => msg('Server tidak terjangkau: ' + e.message, 'err'));
})();
