/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// controlnicknamelogo.js (Versi API Node.js - Preserving Other Data + Lane Support)

// Variabel global untuk menyimpan state logo di memori browser
let currentBlueLogo = "";
let currentRedLogo = "";

// Battle spell tiap pemain (kolom "spell" di matchdata, sama dengan Postgame Control). Nama = file Assets/Itemandspell/<nama>.png
const SPELLS = ['Flicker', 'Retribution', 'Execute', 'Purify', 'Sprint', 'Aegis', 'Inspire', 'Vengeance', 'Flameshot', 'Petrify', 'Revitalize', 'Arrival'];
const SLOTS = [3, 4, 5, 6, 7, 10, 11, 12, 13, 14];
const spellOf = (p) => (p && SPELLS.includes(p.spell) ? p.spell : 'none');
// dropdown spell dibuat di samping dropdown lane (control.html tidak perlu diubah per slot)
function buildSpellSelects() {
    SLOTS.forEach(i => {
        const lane = document.getElementById(`lane-select-${i}`);
        if (!lane || document.getElementById(`spell-select-${i}`)) return;
        const sel = document.createElement('select');
        sel.id = `spell-select-${i}`;
        sel.className = 'lane-dropdown spell-dropdown';
        sel.title = 'Battle spell (tampil di Statistik Lineup & Postgame)';
        sel.innerHTML = '<option value="none">Spell</option>' + SPELLS.map(s => `<option value="${s}">${s}</option>`).join('');
        lane.insertAdjacentElement('afterend', sel);
    });
}
const spellSel = (i) => document.getElementById(`spell-select-${i}`);

// --- FUNGSI UTAMA: LOAD & SAVE DATA ---

// Mengambil data dari Server dan mengisi Input Form
async function loadFromServer() {
    try {
        const response = await fetch('/api/matchdata');
        const data = await response.json();

        // Cek struktur data agar tidak error
        if (!data.teamdata) return;

        const blue = data.teamdata.blueteam;
        const red = data.teamdata.redteam;

        // --- LOAD BLUE TEAM (Nama, Skor, Logo) ---
        document.getElementById('name-input-1').value = blue.teamname || "";
        document.getElementById('name-input-2').value = blue.score || "";
        currentBlueLogo = blue.logo || ""; 

        // Player Name & Lane Biru (Index 3-7)
        for(let i=0; i<5; i++) {
            // Load Nama
            const playerName = (blue.playerlist && blue.playerlist[i]) ? blue.playerlist[i].name : "";
            document.getElementById(`name-input-${3+i}`).value = playerName;
            
            // Load Lane (NEW) - Default 'none'
            const playerLane = (blue.playerlist && blue.playerlist[i]) ? blue.playerlist[i].lane : "none";
            const laneSelect = document.getElementById(`lane-select-${3+i}`);
            if (laneSelect) laneSelect.value = playerLane;
            if (spellSel(3 + i)) spellSel(3 + i).value = spellOf(blue.playerlist && blue.playerlist[i]);
        }

        // --- LOAD RED TEAM (Nama, Skor, Logo) ---
        document.getElementById('name-input-8').value = red.teamname || "";
        document.getElementById('name-input-9').value = red.score || "";
        currentRedLogo = red.logo || ""; 

        // Player Name & Lane Merah (Index 10-14)
        for(let i=0; i<5; i++) {
            // Load Nama
            const playerName = (red.playerlist && red.playerlist[i]) ? red.playerlist[i].name : "";
            document.getElementById(`name-input-${10+i}`).value = playerName;

            // Load Lane (NEW) - Default 'none'
            const playerLane = (red.playerlist && red.playerlist[i]) ? red.playerlist[i].lane : "none";
            const laneSelect = document.getElementById(`lane-select-${10+i}`);
            if (laneSelect) laneSelect.value = playerLane;
            if (spellSel(10 + i)) spellSel(10 + i).value = spellOf(red.playerlist && red.playerlist[i]);
        }

    } catch (error) {
        console.error("Gagal memuat data:", error);
    }
}

// FUNGSI SAVE YANG AMAN
async function saveToServer() {
    try {
        // 1. AMBIL DATA TERBARU DARI SERVER DULU
        const getResponse = await fetch('/api/matchdata');
        let fullData = await getResponse.json();

        // 2. MODIFIKASI HANYA FIELD YANG DIURUS TOOL INI
        
        // --- Update Blue Team ---
        fullData.teamdata.blueteam.teamname = document.getElementById('name-input-1').value;
        fullData.teamdata.blueteam.score = document.getElementById('name-input-2').value;
        fullData.teamdata.blueteam.logo = currentBlueLogo; 

        // Update Player Names & Lanes Biru
        for(let i=0; i<5; i++) {
            if (!fullData.teamdata.blueteam.playerlist[i]) fullData.teamdata.blueteam.playerlist[i] = {}; 
            
            // Simpan Nama
            fullData.teamdata.blueteam.playerlist[i].name = document.getElementById(`name-input-${3+i}`).value;
            
            // Simpan Lane (NEW)
            const laneVal = document.getElementById(`lane-select-${3+i}`).value;
            fullData.teamdata.blueteam.playerlist[i].lane = laneVal;
            if (spellSel(3 + i)) fullData.teamdata.blueteam.playerlist[i].spell = spellSel(3 + i).value === 'none' ? '' : spellSel(3 + i).value;
        }

        // --- Update Red Team ---
        fullData.teamdata.redteam.teamname = document.getElementById('name-input-8').value;
        fullData.teamdata.redteam.score = document.getElementById('name-input-9').value;
        fullData.teamdata.redteam.logo = currentRedLogo;

        // Update Player Names & Lanes Merah
        for(let i=0; i<5; i++) {
            if (!fullData.teamdata.redteam.playerlist[i]) fullData.teamdata.redteam.playerlist[i] = {}; 
            
            // Simpan Nama
            fullData.teamdata.redteam.playerlist[i].name = document.getElementById(`name-input-${10+i}`).value;

            // Simpan Lane (NEW)
            const laneVal = document.getElementById(`lane-select-${10+i}`).value;
            fullData.teamdata.redteam.playerlist[i].lane = laneVal;
            if (spellSel(10 + i)) fullData.teamdata.redteam.playerlist[i].spell = spellSel(10 + i).value === 'none' ? '' : spellSel(10 + i).value;
        }

        // 3. KIRIM DATA LENGKAP KEMBALI KE SERVER
        await fetch('/api/matchdata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fullData)
        });

    } catch (error) {
        console.error("Gagal menyimpan data (Save Error):", error);
    }
}

// --- EVENT HANDLERS ---

// Auto Save saat mengetik atau mengganti dropdown
function setupAutoSave() {
    // Listener untuk Input Nama (1-14)
    for (let i = 1; i <= 14; i++) {
        const input = document.getElementById(`name-input-${i}`);
        if (input) {
            input.addEventListener('input', saveToServer);
        }
    }

    // Listener untuk Dropdown Lane (3-7 & 10-14)
    const laneIndices = [3, 4, 5, 6, 7, 10, 11, 12, 13, 14];
    laneIndices.forEach(i => {
        const select = document.getElementById(`lane-select-${i}`);
        if (select) {
            select.addEventListener('change', saveToServer); // Gunakan 'change' untuk dropdown
        }
        if (spellSel(i)) spellSel(i).addEventListener('change', saveToServer);
    });
}

// Handle Upload Logo
function setupLogoUpload() {
    document.getElementById('file1').addEventListener('change', function() {
        const file = this.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                currentBlueLogo = e.target.result; 
                saveToServer(); 
            };
            reader.readAsDataURL(file);
        }
    });

    document.getElementById('file2').addEventListener('change', function() {
        const file = this.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                currentRedLogo = e.target.result;
                saveToServer();
            };
            reader.readAsDataURL(file);
        }
    });
}

// --- LOGIKA TOMBOL (Reset, Switch, Swap) ---

async function resetNames() {
    // 1. Reset Nama
    for (let i = 1; i <= 14; i++) {
        const input = document.getElementById(`name-input-${i}`);
        if(input) input.value = "";
    }

    // 2. Reset Lane ke 'none'
    const laneIndices = [3, 4, 5, 6, 7, 10, 11, 12, 13, 14];
    laneIndices.forEach(i => {
        const select = document.getElementById(`lane-select-${i}`);
        if(select) select.value = "none";
        if (spellSel(i)) spellSel(i).value = "none";
    });

    await saveToServer(); 
}

async function resetImages() {
    currentBlueLogo = "";
    currentRedLogo = "";
    document.getElementById('file1').value = ""; 
    document.getElementById('file2').value = ""; 
    await saveToServer();
}

async function switchNames() {
    // 1. Ambil nilai UI saat ini (lokal) - Nama & Score
    let blueTeamName = document.getElementById('name-input-1').value;
    let blueScore = document.getElementById('name-input-2').value;
    
    // Ambil Player & Lane Biru
    let bluePlayers = [];
    let blueLanes = [];
    const blueSpells = [], redSpells = [];
    for(let i=3; i<=7; i++) {
        bluePlayers.push(document.getElementById(`name-input-${i}`).value);
        blueLanes.push(document.getElementById(`lane-select-${i}`).value);
        blueSpells.push(spellSel(i) ? spellSel(i).value : 'none');
    }

    // Ambil Player & Lane Merah
    let redTeamName = document.getElementById('name-input-8').value;
    let redScore = document.getElementById('name-input-9').value;
    let redPlayers = [];
    let redLanes = [];
    for(let i=10; i<=14; i++) {
        redPlayers.push(document.getElementById(`name-input-${i}`).value);
        redLanes.push(document.getElementById(`lane-select-${i}`).value);
        redSpells.push(spellSel(i) ? spellSel(i).value : 'none');
    }

    // 2. Tukar Nilai di UI
    // Set Sisi Biru dengan data Merah
    document.getElementById('name-input-1').value = redTeamName;
    document.getElementById('name-input-2').value = redScore;
    for(let i=0; i<5; i++) {
        document.getElementById(`name-input-${3+i}`).value = redPlayers[i];
        document.getElementById(`lane-select-${3+i}`).value = redLanes[i];
        if (spellSel(3 + i)) spellSel(3 + i).value = redSpells[i];
    }

    // Set Sisi Merah dengan data Biru
    document.getElementById('name-input-8').value = blueTeamName;
    document.getElementById('name-input-9').value = blueScore;
    for(let i=0; i<5; i++) {
        document.getElementById(`name-input-${10+i}`).value = bluePlayers[i];
        document.getElementById(`lane-select-${10+i}`).value = blueLanes[i];
        if (spellSel(10 + i)) spellSel(10 + i).value = blueSpells[i];
    }

    // 3. Simpan
    await saveToServer();
}

async function switchImages() {
    let temp = currentBlueLogo;
    currentBlueLogo = currentRedLogo;
    currentRedLogo = temp;
    await saveToServer();
}

// SWAP INDIVIDUAL (Logic Swap Player + Lane)
let firstSwapSelection = null;

function handleSwapClick(index, button) {
    if (firstSwapSelection === null) {
        // Klik Pertama (Pilih sumber)
        firstSwapSelection = { index: index, button: button };
        button.textContent = "Cancel";
        button.style.backgroundColor = '#ffc107';
    } else {
        // Klik Kedua (Pilih target)
        if (firstSwapSelection.index === index) {
            // Jika klik tombol yang sama -> Cancel
            resetSwapUI();
            return;
        }

        // Ambil Elemen Input & Select
        const input1 = document.getElementById(`name-input-${firstSwapSelection.index}`);
        const lane1 = document.getElementById(`lane-select-${firstSwapSelection.index}`);
        
        const input2 = document.getElementById(`name-input-${index}`);
        const lane2 = document.getElementById(`lane-select-${index}`);

        // Swap Nama
        const tempVal = input1.value;
        input1.value = input2.value;
        input2.value = tempVal;

        // Swap Lane (Pastikan elemen ada sebelum swap)
        if (lane1 && lane2) {
            const tempLane = lane1.value;
            lane1.value = lane2.value;
            lane2.value = tempLane;
        }
        const sp1 = spellSel(firstSwapSelection.index), sp2 = spellSel(index);
        if (sp1 && sp2) { const t = sp1.value; sp1.value = sp2.value; sp2.value = t; }

        saveToServer(); 
        resetSwapUI();
    }
}

function resetSwapUI() {
    if (firstSwapSelection) {
        firstSwapSelection.button.textContent = "Swap";
        firstSwapSelection.button.style.backgroundColor = '';
        firstSwapSelection = null;
    }
    const allButtons = document.querySelectorAll('button[id^="swap-btn-"]');
    allButtons.forEach(btn => {
        btn.textContent = "Swap";
        btn.style.backgroundColor = '';
    });
}

// --- INITIALIZATION ---

function initializeApp() {
    buildSpellSelects();
    loadFromServer(); 
    setupAutoSave(); 
    setupLogoUpload(); 
}

window.onload = initializeApp;