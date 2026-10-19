/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// public/script/displaynicknamelogo.js

// 1. Inisialisasi WebSocket ke Server
const socket = new WebSocket(`ws://${window.location.host}`);

// 2. Fungsi untuk mengambil data dari Server (matchdatateam.json)
async function fetchDataAndUpdate() {
    try {
        const response = await fetch('/api/matchdata');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        updateUI(data);
    } catch (error) {
        console.error("Gagal mengambil data match:", error);
    }
}

// 3. Fungsi Mapping Data JSON ke HTML
function updateUI(data) {
    if (!data || !data.teamdata) return;

    const blue = data.teamdata.blueteam;
    const red = data.teamdata.redteam;

    // --- TIM BIRU ---
    // Pastikan ID ini ada di HTML (misal: teamnameblue diberi id="name-box-1")
    setText('name-box-1', blue.teamname);
    setText('name-box-2', blue.score);
    setImage('displayImage1', blue.logo, "Logo Biru");

    if (blue.playerlist) {
        blue.playerlist.forEach((player, index) => {
            const htmlId = 3 + index; 
            setText(`name-box-${htmlId}`, player.name);
            setMugshot(`name-image-box-${htmlId}`, player.name, sscPhotoOf(data, 'blueteam', player.name));
        });
    }

    // --- TIM MERAH ---
    setText('name-box-8', red.teamname);
    setText('name-box-9', red.score);
    setImage('displayImage2', red.logo, "Logo Merah");

    if (red.playerlist) {
        red.playerlist.forEach((player, index) => {
            const htmlId = 10 + index; 
            setText(`name-box-${htmlId}`, player.name);
            setMugshot(`name-image-box-${htmlId}`, player.name, sscPhotoOf(data, 'redteam', player.name));
        });
    }
}

// Foto pemain dari ssc2027.id (diisi SSC Sync / tabel TIM SSC2027 di md.ssc.roster), dicocokkan lewat nickname yang tampil
function sscPhotoOf(data, teamKey, playerName) {
    const roster = data.ssc && data.ssc.roster && data.ssc.roster[teamKey];
    const n = (playerName || '').trim().toLowerCase();
    if (!roster || !n) return '';
    const p = (roster.players || []).find(x => [x.label, x.nick, x.name].some(v => v && v.trim().toLowerCase() === n));
    return p && p.foto ? p.foto : '';
}

// --- FUNGSI BANTUAN (HELPER) ---

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) {
        // Update teks hanya jika ada perubahan untuk efisiensi
        if (el.textContent !== text) {
            el.textContent = text || "";
            // Panggil resize
            autoResizeText(el);
        } else {
            // Jika teks sama, tetap panggil resize (untuk handle perubahan layout/window resize)
            autoResizeText(el);
        }
    }
}

// BARU: Fungsi Resize yang Lebih Kuat & Akurat
function autoResizeText(element) {
    // Validasi elemen
    if (!element || element.clientWidth === 0) return;

    // 1. Reset styling agar kita bisa mengukur ukuran "asli" berdasarkan CSS
    element.style.fontSize = ""; 
    element.style.whiteSpace = "nowrap"; // Wajib satu baris
    element.style.overflow = "hidden";   // Sembunyikan overflow saat perhitungan
    
    // 2. Ambil ukuran saat ini dari CSS (misal dari clamp/cqi)
    const style = window.getComputedStyle(element);
    let currentSize = parseFloat(style.fontSize);
    
    // Setting batas
    const minSize = 8; // Pixel
    
    // Padding horizontal (kiri + kanan) penting agar teks tidak menempel ke pinggir
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const availableWidth = element.clientWidth - padding;

    // 3. Loop Pengecilan
    // Selama lebar konten teks (scrollWidth) lebih besar dari lebar wadah (clientWidth)
    while ((element.scrollWidth > element.clientWidth) && currentSize > minSize) {
        currentSize -= 1; // Turunkan 1px setiap iterasi (bisa 0.5 jika ingin lebih presisi)
        element.style.fontSize = `${currentSize}px`;
    }

    // 4. Double Check (Safety)
    // Terkadang browser butuh 1 cycle render lagi, jika masih overflow, kurangi sedikit lagi
    if (element.scrollWidth > element.clientWidth) {
         currentSize -= 1;
         element.style.fontSize = `${currentSize}px`;
    }
}

function setImage(id, base64Data, altText) {
    const img = document.getElementById(id);
    const defaultLogo = "Assets/other/nologo.png"; 

    if (img) {
        if (base64Data && base64Data.trim() !== "") {
            img.src = base64Data;
        } else {
            img.src = defaultLogo;
        }

        img.onerror = function() {
            this.onerror = null; 
            this.src = defaultLogo;
        };

        img.style.display = "block"; 
        img.alt = altText;
    }
}

// Ukuran desain foto pemain = file lama 812×1080 (display / postdraft / postgame mengecilkannya dengan "scale").
// Foto apa pun (website 720×960, Assets/player 1200×1600, dll.) dipaksa ke ukuran itu tanpa terpotong.
// :where() = prioritas nol → halaman yang punya aturan sendiri (display2 / displaycostum: ".heropick img") tetap menang.
const MUGSHOT_CSS = ':where(.name-image-box img.mugshot){width:812px;height:1080px;object-fit:contain;object-position:50% 100%;}';
(function addMugshotCss() {
    if (document.getElementById('mugshot-css')) return;
    const st = document.createElement('style');
    st.id = 'mugshot-css';
    st.textContent = MUGSHOT_CSS;
    (document.head || document.documentElement).prepend(st);
})();

// Urutan foto: foto dari website (bila ada) → Assets/player/<nickname>.png → Assets/player/noplayer.png
function setMugshot(containerId, playerName, webPhoto) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const sources = [];
    if (webPhoto) sources.push(webPhoto);
    if (playerName && playerName.trim() !== "") sources.push(`Assets/player/${encodeURIComponent(playerName)}.png`);
    sources.push("Assets/player/noplayer.png");

    // tidak digambar ulang bila sumbernya sama (mencegah foto berkedip tiap update data)
    const key = sources.join('|');
    if (container.dataset.mugshot === key && container.querySelector('img')) return;
    container.dataset.mugshot = key;

    container.innerHTML = '';
    const img = document.createElement('img');
    img.className = 'mugshot';
    let i = 0;

    // ukuran foto diatur CSS (lihat MUGSHOT_CSS), bukan inline, agar aturan tiap halaman (mis. .heropick img di display2) tetap berlaku
    const load = () => { img.src = sources[i]; };
    img.onerror = function () {
        if (i < sources.length - 1) { i++; load(); } else { this.onerror = null; }
    };
    load();

    container.appendChild(img);
}

// --- LOGIKA KONEKSI REALTIME ---

socket.onopen = () => {
    console.log("Terhubung ke Server Overlay via WebSocket");
    fetchDataAndUpdate(); 
};

socket.onmessage = (event) => {
    try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'matchdata_update') {
            fetchDataAndUpdate();
        }
    } catch (e) {
        console.error("Error parsing WebSocket message:", e);
    }
};

socket.onclose = () => {
    console.log("Terputus dari server.");
    setTimeout(() => {
        window.location.reload(); 
    }, 3000);
};