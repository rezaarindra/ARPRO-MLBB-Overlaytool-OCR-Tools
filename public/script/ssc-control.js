/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// ssc-control.js — tema SSC 2027 untuk halaman control: bar atas ungu (logo, judul, Hub, Terang / Gelap) + garis 5 warna.
// Pilihan tema disimpan per perangkat (localStorage). Pasang bersama ssc-theme.css & ssc-control.css.
(function () {
    const KEY = 'arpro.sc-theme';
    let theme = 'light';
    try { theme = localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch (e) {}
    document.documentElement.setAttribute('data-sc-theme', theme);

    const ICON = {
        home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
        sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
        moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
    };

    function mount() {
        document.body.classList.add('ssc-ui');
        // nama halaman → body[data-sc-page] untuk penyesuaian tema per halaman (ssc-control.css bagian 2)
        document.body.dataset.scPage = (location.pathname.split('/').pop() || 'hub.html').replace(/\.html$/i, '') || 'hub';
        if (document.querySelector('.sc-topbar, .sct-actions')) return;
        const actions = `<a class="sc-link" href="/hub.html">${ICON.home}Hub</a><button type="button" class="sc-link" id="scThemeBtn"></button>`;
        let host;
        const ownHead = document.querySelector('.oc-head, .sticky-header');
        if (ownHead) {
            // halaman yang sudah punya bar atas (.oc-head / .sticky-header): bar itu yang dijadikan bar ungu SSC,
            // cukup ditambah tombol Hub & tema
            ownHead.classList.add('sc-ownhead');
            host = document.createElement('div');
            host.className = 'sct-actions';
            host.innerHTML = actions;
            (ownHead.querySelector('.header-content') || ownHead).appendChild(host);
        } else if (document.body.hasAttribute('data-sc-nobar')) {
            // halaman dengan navigasi / strip sendiri (Hub, Notif Control): tombol tema kecil di pojok
            host = document.createElement('div');
            host.className = 'sct-actions sc-floating';
            host.innerHTML = `<button type="button" class="sc-link" id="scThemeBtn"></button>`;
            document.body.appendChild(host);
        } else {
            const title = document.body.dataset.scTitle || document.title || 'Control';
            host = document.createElement('header');
            host.className = 'sc-topbar';
            host.innerHTML = `
                <a class="sc-badge" href="/hub.html" title="Hub"><img src="/Assets/Other/OVERLAYTOOLLOGO.png" alt="ARPRO"></a>
                <span class="sc-title"></span>
                <span class="sc-sub">ARPRO Esport Tools</span>
                <span class="sc-sp"></span>
                <div class="sct-actions">${actions}</div>`;
            host.querySelector('.sc-title').textContent = title.toUpperCase();
            document.body.insertBefore(host, document.body.firstChild);
            // bar menempel di atas selebar layar; isi halaman digeser sebesar tinggi bar (padding asli halaman tetap)
            const basePad = parseFloat(getComputedStyle(document.body).paddingTop) || 0;
            const fit = () => { document.body.style.paddingTop = `${basePad + host.offsetHeight + 5}px`; };
            fit();
            if (window.ResizeObserver) new ResizeObserver(fit).observe(host);
        }
        const btn = host.querySelector('#scThemeBtn');
        const label = () => { btn.innerHTML = theme === 'dark' ? `${ICON.sun}Terang` : `${ICON.moon}Gelap`; };
        label();
        btn.addEventListener('click', () => {
            theme = theme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-sc-theme', theme);
            try { localStorage.setItem(KEY, theme); } catch (e) {}
            label();
        });
    }
    if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
