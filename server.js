/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// server.js - PORT 3000 (Safe & Rare) & Strict IP Filter
// FULL REVISED VERSION - Fix WebSocket Freezing, Lag on LAN, Race Conditions, Manual IP Selector & Recursive GitHub Sync

const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const fs = require('fs').promises; 
const fsSync = require('fs');      
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const multer = require('multer');

// File JSON yang disimpan Notepad / PowerShell bisa diawali BOM → JSON.parse gagal diam-diam dan data/config tidak terbaca.
// Buang BOM di semua pembacaan JSON.
const parseJson = JSON.parse;
JSON.parse = (text, reviver) => parseJson(typeof text === 'string' && text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text, reviver);

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'public/Assets/Other/arpro-logo.png')));

// OCR Control butuh kamera / HDMI capture → browser hanya mengizinkannya di localhost (atau https).
// Bila halaman dibuka lewat IP dari PC server itu sendiri, alihkan otomatis ke localhost.
function isFromThisPc(req) {
    const ip = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    if (ip === '127.0.0.1' || ip === '::1') return true;
    return Object.values(os.networkInterfaces()).flat().some(n => n && n.address === ip);
}
app.get('/ocrcontrol.html', (req, res, next) => {
    const host = String(req.headers.host || '');
    if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host) || !isFromThisPc(req)) return next();
    const q = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    res.redirect(302, `http://localhost:${port}/ocrcontrol.html${q}`);
});
app.use(express.static('public'));

// ==========================================
// 1. ASYNC QUEUE WRITER
// ==========================================
class AsyncQueue {
    constructor() {
        this.queue = Promise.resolve();
    }
    enqueue(task) {
        this.queue = this.queue.then(task).catch(err => {
            console.error('Queue Error:', err);
        });
        return this.queue;
    }
}

// Tulis ke file sementara lalu rename → file asli tidak pernah setengah tertulis (aman bila PC mati / server crash saat menyimpan).
// Bila rename ditolak Windows (file sedang dikunci antivirus / dibaca), tulis langsung seperti biasa.
async function writeFileSafe(filePath, data) {
    const tmp = `${filePath}.tmp`;
    await fs.writeFile(tmp, data);
    try { await fs.rename(tmp, filePath); }
    catch (e) { await fs.writeFile(filePath, data); fs.unlink(tmp).catch(() => {}); }
}
const fileQueue = new AsyncQueue();

// ==========================================
// 2. FOLDER & FILE PREPARATION
// ==========================================
const dbDir = path.join(__dirname, 'public/database');
const savedMatchDir = path.join(dbDir, 'savedmatch'); 
const unifiedDir = path.join(__dirname, 'public/Assets/costum/Theme');
const flagDir = path.join(__dirname, 'public/Assets/nationalflag');

if (!fsSync.existsSync(dbDir)) fsSync.mkdirSync(dbDir, { recursive: true });
if (!fsSync.existsSync(savedMatchDir)) fsSync.mkdirSync(savedMatchDir, { recursive: true });
if (!fsSync.existsSync(unifiedDir)) fsSync.mkdirSync(unifiedDir, { recursive: true });
if (!fsSync.existsSync(flagDir)) fsSync.mkdirSync(flagDir, { recursive: true });

const matchDataPath  = path.join(dbDir, 'matchdatateam.json');
const draftDataPath  = path.join(dbDir, 'matchdraft.json');
const prevDraftPath  = path.join(dbDir, 'previousmatchdraft.json');
const mapDrawPath    = path.join(dbDir, 'mapdraw.json');
const mvpDataPath    = path.join(dbDir, 'mvpdata.json');
const notifPath      = path.join(dbDir, 'notification.json');
const schedulePath   = path.join(dbDir, 'schedule.json');
const itemsPath      = path.join(dbDir, 'items.json');
const flagJsonPath   = path.join(dbDir, 'flags.json'); 
const themePath      = path.join(unifiedDir, 'theme.json');
const playerLanePath = path.join(dbDir, 'playerlane.json'); 

const storageUnified = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, unifiedDir); },
    filename: (req, file, cb) => { cb(null, file.originalname); }
});
const uploadUnified = multer({ storage: storageUnified });

const storageFlag = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, flagDir); },
    filename: (req, file, cb) => { cb(null, file.originalname); }
});
const uploadFlag = multer({ storage: storageFlag });

// ==========================================
// 3. DEFAULT DATA GENERATORS
// ==========================================
const defaultMatchData = {
    "game_duration": "00:00", "game_number": 0, "winmatches": "none",
    "teamdata": {
        "blueteam": { "teamname": "BLUE TEAM", "score": "0", "logo": "", "totalgold": 0, "turret": 0, "lord": 0, "turtle": 0, "playerlist": Array(5).fill().map(() => ({ "name": "Player", "hero": "", "level": 0, "KDA": "0/0/0", "gold": 0, "spell": "idle", "banhero": "", "itemlist": ["idle","idle","idle","idle","idle","idle"] })) },
        "redteam": { "teamname": "RED TEAM", "score": "0", "logo": "", "totalgold": 0, "turret": 0, "lord": 0, "turtle": 0, "playerlist": Array(5).fill().map(() => ({ "name": "Player", "hero": "", "level": 0, "KDA": "0/0/0", "gold": 0, "spell": "idle", "banhero": "", "itemlist": ["idle","idle","idle","idle","idle","idle"] })) }
    }
};

const defaultTheme = {
    fontFile: "Renegade Pursuit.otf", useCustomFont: false, fontSizeMultiplier: 1.0, 
    images: { heroPickBg: "", lowerBg: "", lowerMidBg: "" },
    colors: { bluePrimary: "#00d2ff", blueDark: "#003e4d", redPrimary: "#ff2a2a", redDark: "#4d0000", scoreBlue: "#00d2ff", scoreRed: "#ff2a2a", upperBg: "#000000", lowerBg: "#0a0a0a", lowerMidBg: "#111111", heroPickBg: "#1e1e1e", logoTeamBg: "#000000", postDraftBg: "#1a1a1a", playerNameBg: "#000000", laneLogoBg: "rgba(0,0,0,0.8)", timerBlue: "#00d2ff", timerMid: "#ffffff", timerRed: "#ff2a2a", playerName: "#ffffff", phaseText: "#ffffff", laneIconType: "white", laneLogoBorder: "#ffffff", auraBan: "#ff0000", auraPick: "#ffffff", globalBorder: "rgba(255, 255, 255, 0.2)" },
    gradients: { upperBg: { enabled: false, colorB: "#333333", angle: 90 }, lowerBg: { enabled: false, colorB: "#333333", angle: 90 }, lowerMidBg: { enabled: false, colorB: "#333333", angle: 90 }, heroPickBg: { enabled: false, colorB: "#333333", angle: 90 }, logoTeamBg: { enabled: false, colorB: "#333333", angle: 90 }, sbBgTeamName: { enabled: false, colorB: "#333333", angle: 90 }, sbBgLogo: { enabled: false, colorB: "#333333", angle: 90 }, sbBgScore: { enabled: false, colorB: "#333333", angle: 90 }, sbBgCombined: { enabled: false, colorB: "#333333", angle: 90 }, sbBgBox1: { enabled: false, colorB: "#333333", angle: 90 }, sbBgSecondary: { enabled: false, colorB: "#333333", angle: 90 } },
    scoreboard: { teamNameBlue: "#00d2ff", teamNameRed: "#ff2a2a", bgTeamName: "#1e1e1e", bgLogo: "#000000", bgScore: "#000000", bgCombined: "#0a0a0a", bgBox1: "#1e1e1e", bgSecondary: "#1e1e1e", borderBottom: "rgba(255, 255, 255, 0.2)", activeFlag: "indonesia.png", disableGlow: false, disableShadow: false },
    opacity: { upper: 100, lower: 100, heroPick: 100, logoTeam: 60, postDraft: 100 },
    toggles: { hideLaneLogo: false, disableGlow: false, hidePattern: false, hidePostDraftBg: false, disableBoxShadow: false },
    animations: { banType: "pulse", pickType: "pulse", heroAnim: "fade" }
};

const defaultDraftData = {
    "draftdata": {
        "timer": "60", "timer_running": false, "current_phase": 0,
        "blueside": { "ban": [{},{},{},{},{}], "pick": [{},{},{},{},{}] },
        "redside": { "ban": [{},{},{},{},{}], "pick": [{},{},{},{},{}] }
    }
};

if (!fsSync.existsSync(matchDataPath)) fsSync.writeFileSync(matchDataPath, JSON.stringify(defaultMatchData, null, 2));
if (!fsSync.existsSync(draftDataPath)) fsSync.writeFileSync(draftDataPath, JSON.stringify(defaultDraftData, null, 2));
if (!fsSync.existsSync(prevDraftPath)) fsSync.writeFileSync(prevDraftPath, JSON.stringify(defaultDraftData, null, 2));
if (!fsSync.existsSync(themePath)) fsSync.writeFileSync(themePath, JSON.stringify(defaultTheme, null, 2)); 
if (!fsSync.existsSync(mapDrawPath)) fsSync.writeFileSync(mapDrawPath, JSON.stringify({ "drawdata": { "status": "idle" } }, null, 2));
if (!fsSync.existsSync(mvpDataPath)) fsSync.writeFileSync(mvpDataPath, JSON.stringify({ "mvp": null }, null, 2));
if (!fsSync.existsSync(schedulePath)) fsSync.writeFileSync(schedulePath, JSON.stringify({}, null, 2));
if (!fsSync.existsSync(notifPath)) fsSync.writeFileSync(notifPath, JSON.stringify({}, null, 2));
if (!fsSync.existsSync(playerLanePath)) fsSync.writeFileSync(playerLanePath, JSON.stringify({}, null, 2));

if (!fsSync.existsSync(itemsPath)) {
    const defaultItems = [ "winter_truncheon", "immortality", "athena_shield", "blade_armor", "antique_cuirass", "oracle", "radiant_armor", "twilight_armor", "guardian_helmet", "sky_guardian_helmet", "thunder_belt", "cursed_helmet" ];
    fsSync.writeFileSync(itemsPath, JSON.stringify(defaultItems, null, 2));
}

// ==========================================
// 4. IN-MEMORY CACHE
// ==========================================
let cache = {
    matchdata: defaultMatchData, matchdraft: defaultDraftData, theme: defaultTheme,
    mapdraw: { "drawdata": { "status": "idle" } }, mvp: { "mvp": null }, schedule: {}
};

async function loadCache() {
    try { cache.matchdata = JSON.parse(await fs.readFile(matchDataPath, 'utf8')); } catch(e) {}
    try { cache.matchdraft = JSON.parse(await fs.readFile(draftDataPath, 'utf8')); } catch(e) {}
    try { cache.theme = JSON.parse(await fs.readFile(themePath, 'utf8')); } catch(e) {}
    try { cache.mapdraw = JSON.parse(await fs.readFile(mapDrawPath, 'utf8')); } catch(e) {}
    try { cache.mvp = JSON.parse(await fs.readFile(mvpDataPath, 'utf8')); } catch(e) {}
    try { cache.schedule = JSON.parse(await fs.readFile(schedulePath, 'utf8')); } catch(e) {}
    pruneMissingSscFiles();
    console.log(">> In-Memory Cache Loaded!");
}

// Logo / foto dari ssc2027.id disimpan di Assets/costum/ssc. Bila file-nya terhapus, rujukannya dikosongkan agar
// overlay memakai cadangan (nologo / Assets/player) tanpa gambar rusak; sync berikutnya mengunduh ulang.
function pruneMissingSscFiles() {
    const md = cache.matchdata;
    if (!md || !md.teamdata) return;
    const missing = (p) => typeof p === 'string' && p.startsWith('/Assets/costum/ssc/') && !fsSync.existsSync(path.join(__dirname, 'public', p));
    let changed = false;
    for (const key of ['blueteam', 'redteam']) {
        const team = md.teamdata[key];
        if (team && missing(team.logo)) { team.logo = ''; changed = true; }
        const players = md.ssc && md.ssc.roster && md.ssc.roster[key] && md.ssc.roster[key].players;
        (players || []).forEach(p => { if (missing(p.foto)) { p.foto = ''; changed = true; } });
    }
    if (changed) {
        console.log('>> Rujukan logo/foto SSC yang file-nya hilang dibersihkan.');
        fileQueue.enqueue(() => writeFileSafe(matchDataPath, JSON.stringify(md, null, 2)));
    }
}
loadCache();

async function initFlagDB() {
    if (!fsSync.existsSync(flagJsonPath)) {
        try {
            const files = await fs.readdir(flagDir);
            const imageFiles = files.filter(file => /\.(png|jpg|jpeg|webp)$/i.test(file));
            await fs.writeFile(flagJsonPath, JSON.stringify(imageFiles, null, 2));
        } catch (error) { await fs.writeFile(flagJsonPath, JSON.stringify([], null, 2)); }
    }
}
initFlagDB();

// ==========================================
// 5. HELPER FUNCTIONS
// ==========================================
function getLocalIp() {
    const nets = os.networkInterfaces();
    let candidateIp = 'localhost';
    const virtualKeywords = ['virtual', 'vmware', 'vbox', 'virtualbox', 'wsl', 'hyper-v', 'vethernet', 'docker', 'vpn', 'zerotier', 'tap', 'tun'];
    for (const name of Object.keys(nets)) {
        const isVirtual = virtualKeywords.some(keyword => name.toLowerCase().includes(keyword));
        if (!isVirtual) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    if (name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('ethernet')) { return net.address; }
                    candidateIp = net.address;
                }
            }
        }
    }
    return candidateIp;
}

function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// Simpan matchdata ke cache + file, lalu kabari semua display (dipakai control panel & SSC Sync)
function saveMatchData(data) {
    cache.matchdata = data;
    broadcast({ type: 'matchdata_update', data: cache.matchdata });
    broadcast({ type: 'update', data: { matchdata: cache.matchdata } });
    const payload = JSON.stringify(cache.matchdata, null, 2);
    fileQueue.enqueue(() => writeFileSafe(matchDataPath, payload));
}

// ==========================================
// 6. WEBSOCKET SERVER
// ==========================================
function heartbeat() { this.isAlive = true; }

wss.on('connection', ws => {
    ws.isAlive = true;
    ws.on('pong', heartbeat);

    ws.on('message', message => {
        try {
            const msg = JSON.parse(message);
            if (msg.type === 'update') {
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(msg));
                    }
                });
            }
        } catch (e) { console.error('WebSocket Message Error:', e); }
    });
});

const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        if (ws.isAlive === false) return ws.terminate(); 
        ws.isAlive = false; ws.ping(); 
    });
}, 30000);

wss.on('close', function close() { clearInterval(interval); });

// ==========================================
// 7. API ROUTES
// ==========================================

// --- GITHUB ASSET UPDATER (WITH PROGRESS & STRUCTURAL PLACEMENT) ---
app.post('/api/sync-github', async (req, res) => {
    try {
        // github_config.json (lokal, boleh berisi token) → bila tidak ada, pakai github_config.example.json (repo resmi, tanpa token)
        let configPath = path.join(__dirname, 'github_config.json');
        if (!fsSync.existsSync(configPath)) configPath = path.join(__dirname, 'github_config.example.json');

        if (!fsSync.existsSync(configPath)) {
            return res.status(400).json({ message: 'github_config.json not found on server.' });
        }

        const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
        const { owner, repo, branch = 'main' } = config;
        // token hanya perlu untuk repo private; repo publik cukup tanpa token
        const token = (config.token || '').trim();
        const auth = token && !/^PUT_YOUR/i.test(token) ? { 'Authorization': `Bearer ${token}` } : {};

        const apiHeaders = {
            ...auth,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'ArproEsportTools-Updater'
        };

        const rawHeaders = {
            ...auth,
            'Accept': 'application/vnd.github.v3.raw',
            'User-Agent': 'ArproEsportTools-Updater'
        };

        const rawBaseUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;

        // 1. Fetch update.json (Manifest)
        const manifestResponse = await fetch(`${rawBaseUrl}/update.json`, { headers: rawHeaders });
        if (!manifestResponse.ok) throw new Error('Failed to read update.json from GitHub');
        
        const rawText = await manifestResponse.text();
        if (!rawText.trim()) throw new Error("update.json is empty or invalid!");
        
        const manifest = JSON.parse(rawText);
        const targets = manifest.files; 

        // 2. Fetch repo structure
        const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
        const treeResponse = await fetch(treeUrl, { headers: apiHeaders });
        if (!treeResponse.ok) throw new Error('Failed to read repository structure from GitHub API');
        
        const treeData = await treeResponse.json();
        const blobs = treeData.tree.filter(item => item.type === 'blob');
        const allRepoFiles = blobs.map(item => item.path);
        const repoSha = new Map(blobs.map(item => [item.path, item.sha]));

        let filesToDownload = new Set();

        // 3. Match targets
        for (const target of targets) {
            if (allRepoFiles.includes(target)) {
                filesToDownload.add(target);
            } else {
                const folderPrefix = target.endsWith('/') ? target : `${target}/`;
                const matchedFiles = allRepoFiles.filter(file => file.startsWith(folderPrefix));
                matchedFiles.forEach(file => filesToDownload.add(file));
            }
        }

        // Lewati file yang isinya sudah sama dengan di GitHub (bandingkan git blob SHA) → hanya unduh yang berubah
        const root = path.resolve(__dirname);
        const gitBlobSha = (buf) => crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
        for (const filePath of [...filesToDownload]) {
            const local = path.resolve(root, filePath);
            if (!local.startsWith(root + path.sep)) { filesToDownload.delete(filePath); continue; }
            try {
                if (gitBlobSha(await fs.readFile(local)) === repoSha.get(filePath)) filesToDownload.delete(filePath);
            } catch (e) { /* file belum ada → unduh */ }
        }

        let updatedCount = 0;
        let errors = [];
        const totalFiles = filesToDownload.size;

        if (totalFiles === 0) {
            return res.json({ message: "Already up to date. No files changed.", version: manifest.version });
        }

        // 4. Download and map exactly to the local directory structure
        for (const filePath of filesToDownload) {
            try {
                const fileUrl = `${rawBaseUrl}/${filePath}`;
                const fileRes = await fetch(fileUrl, { headers: rawHeaders });
                
                if (!fileRes.ok) {
                    errors.push(`${filePath} (Not Found)`);
                    continue;
                }

                const arrayBuffer = await fileRes.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                // This logic exactly mirrors the GitHub repo folder path to the local project path
                const targetLocalPath = path.join(__dirname, filePath);
                const targetDir = path.dirname(targetLocalPath);
                
                if (!fsSync.existsSync(targetDir)) {
                    await fs.mkdir(targetDir, { recursive: true });
                }

                await fileQueue.enqueue(() => fs.writeFile(targetLocalPath, buffer));
                
                updatedCount++;
                
                // Broadcast Progress to active WebSockets
                broadcast({
                    type: 'sync_progress',
                    current: updatedCount,
                    total: totalFiles,
                    filename: filePath
                });

            } catch (err) {
                errors.push(`${filePath} (Error: ${err.message})`);
            }
        }

        res.json({ 
            message: `Update Complete. ${updatedCount} files updated.`, 
            version: manifest.version,
            errors: errors.length > 0 ? errors : null
        });

    } catch (error) {
        console.error("GitHub Sync Error:", error);
        res.status(500).json({ message: 'Failed to synchronize with GitHub.', error: error.message });
    }
});

// --- MATCH DATA API ---
app.get('/api/matchdata', (req, res) => { res.json(cache.matchdata); });
app.post('/api/matchdata', (req, res) => {
    try {
        saveMatchData(req.body);
        res.json({ message: 'Match data saved' });
    } catch (error) { res.status(500).json({ message: 'Error saving match data' }); }
});

// --- MATCH DRAFT API ---
app.get('/api/matchdraft', (req, res) => { res.json(cache.matchdraft); });
app.post('/api/matchdraft', (req, res) => {
    try {
        const filledBefore = draftFilled(cache.matchdraft);
        cache.matchdraft = req.body;
        // draft baru dimulai (hero pertama masuk setelah draft kosong) → chapter VOD otomatis
        if (filledBefore === 0 && draftFilled(cache.matchdraft) > 0) vodLog(`DRAFT ${vodMatchLabel()}`, 'draft', { chapter: true });
        broadcast({ type: 'draftdata_update', data: cache.matchdraft.draftdata });
        recordPicks(cache.matchdraft.draftdata);
        
        const payload = JSON.stringify(cache.matchdraft, null, 2);
        fileQueue.enqueue(() => writeFileSafe(draftDataPath, payload));
        res.json({ message: 'Draft data saved' });
    } catch (error) { res.status(500).json({ message: 'Error saving draft' }); }
});

// --- THEME API ---
app.get('/api/theme', (req, res) => { res.json(cache.theme); });
app.post('/api/theme', (req, res) => {
    try {
        cache.theme = req.body; 
        broadcast({ type: 'theme_update', data: cache.theme });
        
        const payload = JSON.stringify(cache.theme, null, 2);
        fileQueue.enqueue(() => writeFileSafe(themePath, payload));
        res.json({ message: 'Theme saved' });
    } catch (error) { res.status(500).json({ message: 'Error saving theme' }); }
});

app.post('/api/theme-reset', (req, res) => {
    try {
        cache.theme = defaultTheme; 
        broadcast({ type: 'theme_update', data: cache.theme });
        
        const payload = JSON.stringify(cache.theme, null, 2);
        fileQueue.enqueue(() => writeFileSafe(themePath, payload));
        res.json({ message: 'Theme Reset to Default', theme: cache.theme });
    } catch (error) { res.status(500).json({ message: 'Error resetting theme' }); }
});

// --- UNIFIED UPLOAD API (Theme Assets) ---
app.post('/api/upload-asset', uploadUnified.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    
    const targetField = req.body.targetField; 
    const ext = path.extname(req.file.originalname).toLowerCase();
    
    try {
        if (!cache.theme.images) cache.theme.images = {};

        if (targetField === 'font' && (ext === '.ttf' || ext === '.otf')) {
            cache.theme.fontFile = req.file.originalname; 
            cache.theme.useCustomFont = true;
        } 
        else if (['.png', '.jpg', '.jpeg'].includes(ext)) {
            if (targetField === 'heroPickBg') cache.theme.images.heroPickBg = req.file.originalname;
            else if (targetField === 'lowerBg') cache.theme.images.lowerBg = req.file.originalname;
            else if (targetField === 'lowerMidBg') cache.theme.images.lowerMidBg = req.file.originalname;
        }
        
        broadcast({ type: 'theme_update', data: cache.theme });
        
        const payload = JSON.stringify(cache.theme, null, 2);
        fileQueue.enqueue(() => writeFileSafe(themePath, payload));
        
        res.json({ message: 'Asset uploaded successfully', filename: req.file.originalname, updatedTheme: cache.theme });
    } catch (error) {
        console.error("Upload Error:", error);
        res.status(500).json({ message: 'Error updating theme config' });
    }
});

// --- FLAG API ---
app.get('/api/flags', async (req, res) => {
    try {
        const files = await fs.readdir(flagDir);
        const imageFiles = files.filter(file => /\.(png|jpg|jpeg|webp)$/i.test(file));
        fileQueue.enqueue(() => writeFileSafe(flagJsonPath, JSON.stringify(imageFiles, null, 2)));
        res.json(imageFiles);
    } catch (error) { res.json([]); }
});

app.post('/api/upload-flag', uploadFlag.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    try {
        const files = await fs.readdir(flagDir);
        const imageFiles = files.filter(file => /\.(png|jpg|jpeg|webp)$/i.test(file));
        fileQueue.enqueue(() => writeFileSafe(flagJsonPath, JSON.stringify(imageFiles, null, 2)));
        res.json({ message: 'Flag uploaded successfully', filename: req.file.originalname, list: imageFiles });
    } catch (error) { res.status(500).json({ message: 'Error uploading flag' }); }
});

// --- EXTRAS API ---
app.get('/api/items', async (req, res) => {
    try { const data = await fs.readFile(itemsPath, 'utf8'); res.json(JSON.parse(data)); } catch (error) { res.json([]); }
});

app.get('/api/schedule', (req, res) => { res.json(cache.schedule); });
app.post('/api/schedule', (req, res) => {
    try {
        cache.schedule = req.body;
        broadcast({ type: 'schedule_update', data: cache.schedule });
        fileQueue.enqueue(() => writeFileSafe(schedulePath, JSON.stringify(cache.schedule, null, 2)));
        res.json({ message: 'Schedule saved' });
    } catch (error) { res.status(500).json({ message: 'Error' }); }
});

app.get('/api/mapdraw', (req, res) => { res.json(cache.mapdraw); });
app.post('/api/mapdraw', (req, res) => {
    try {
        cache.mapdraw = req.body;
        broadcast({ type: 'mapdraw_update', data: cache.mapdraw.drawdata });
        fileQueue.enqueue(() => writeFileSafe(mapDrawPath, JSON.stringify(cache.mapdraw, null, 2)));
        res.json({ message: 'Map saved' });
    } catch (error) { res.status(500).json({ message: 'Error' }); }
});

app.get('/api/mvp', (req, res) => { res.json(cache.mvp); });
app.post('/api/mvp', (req, res) => {
    try {
        cache.mvp = req.body;
        broadcast({ type: 'mvp_update', data: cache.mvp.mvp });
        fileQueue.enqueue(() => writeFileSafe(mvpDataPath, JSON.stringify(cache.mvp, null, 2)));
        res.json({ message: 'MVP saved' });
    } catch (error) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/notification', (req, res) => {
    try {
        const payload = { currentVideo: req.body.videoId, timestamp: Date.now() };
        broadcast({ type: 'notification_trigger', videoId: req.body.videoId });
        if (VIDEO_LABEL[req.body.videoId]) vodLog(VIDEO_LABEL[req.body.videoId], 'notif');
        // Turtle tidak terbaca OCR → tombol Blue/Red Turtle Slain di Notif Control memulai timer respawn turtle.
        // Lord Slain manual juga dipakai bila OCR belum menangkap kenaikan angka lord.
        if (['videoPlayer2', 'videoPlayer3'].includes(req.body.videoId) && ocrGame.lastT != null) ocrGame.turtleKilledAt = ocrGame.lastT;
        if (['videoPlayer5', 'videoPlayer6'].includes(req.body.videoId) && ocrGame.lastT != null
            && (ocrGame.lordKilledAt == null || ocrGame.lastT - ocrGame.lordKilledAt > 15)) ocrGame.lordKilledAt = ocrGame.lastT;
        fileQueue.enqueue(() => writeFileSafe(notifPath, JSON.stringify(payload, null, 2)));
        res.json({ message: 'Notification triggered' });
    } catch (error) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/save-match-record', async (req, res) => {
    try {
        fileQueue.enqueue(async () => {
            if (!fsSync.existsSync(savedMatchDir)) await fs.mkdir(savedMatchDir, { recursive: true });
            for (let i = 6; i >= 1; i--) {
                const currentFile = path.join(savedMatchDir, `matchdata${i}.json`);
                const nextFile = path.join(savedMatchDir, `matchdata${i + 1}.json`);
                try { await fs.access(currentFile); await fs.rename(currentFile, nextFile); } catch (err) {}
            }
            const destPath = path.join(savedMatchDir, 'matchdata1.json');
            await fs.writeFile(destPath, JSON.stringify(cache.matchdata, null, 2));
        });
        res.json({ message: 'Match archived successfully (Queued)' });
    } catch (error) { res.status(500).json({ message: 'Error archiving match data' }); }
});

app.post('/api/archive-draft', (req, res) => {
    try {
        fileQueue.enqueue(() => writeFileSafe(prevDraftPath, JSON.stringify(cache.matchdraft, null, 2)));
        broadcast({ type: 'analyzer_update' });
        res.json({ message: 'Draft archived (Queued)' });
    } catch (error) { res.status(500).json({ message: 'Error archiving draft' }); }
});

app.get('/api/previousdraft', async (req, res) => {
    try { const data = await fs.readFile(prevDraftPath, 'utf8'); res.json(JSON.parse(data)); } catch (error) { res.status(500).json({ message: 'Error reading prev draft' }); }
});

app.post('/api/analyzer-control', (req, res) => {
    broadcast({ type: 'analyzer_control', action: req.body.action });
    res.json({ message: `Analyzer command sent` });
});

app.post('/api/delete-all-records', async (req, res) => {
    try {
        fileQueue.enqueue(async () => {
            if (fsSync.existsSync(savedMatchDir)) {
                const files = await fs.readdir(savedMatchDir);
                for (const file of files) {
                    await fs.unlink(path.join(savedMatchDir, file));
                }
            }
        });
        res.json({ message: 'All match records deleted successfully (Queued)' });
    } catch (error) {
        console.error("Delete all records error:", error);
        res.status(500).json({ message: 'Error deleting match records' });
    }
});

// --- PICK STATS ("x TIMES PICKED" di splash pick) ---
// Dicatat otomatis: setiap draft yang lengkap 10 pick = 1 game. Koreksi pick sebelum draft direset memperbarui
// game yang sama; draft dikosongkan (Reset Draft) = game berikutnya. Disimpan di public/database/pickstats.json.
const pickStatsPath = path.join(dbDir, 'pickstats.json');
let pickStats = { games: [], open: null };
try { pickStats = { games: [], open: null, ...JSON.parse(fsSync.readFileSync(pickStatsPath, 'utf8')) }; } catch (e) {}

const heroKey = (src) => decodeURIComponent(String(src || '').split('?')[0].split('/').pop()).toLowerCase().replace(/\.[a-z]+$/, '');

function savePickStats() {
    const payload = JSON.stringify(pickStats, null, 2);
    fileQueue.enqueue(() => writeFileSafe(pickStatsPath, payload));
    broadcast({ type: 'pickstats_update' });
}

function recordPicks(draft) {
    if (!draft || !draft.blueside || !draft.redside) return;
    const picks = [...(draft.blueside.pick || []).slice(0, 5), ...(draft.redside.pick || []).slice(0, 5)].map(p => heroKey(p && p.hero));
    if (picks.every(p => !p)) {
        if (pickStats.open !== null) { pickStats.open = null; savePickStats(); }
        return;
    }
    if (picks.length < 10 || picks.some(p => !p)) return;

    const td = (cache.matchdata && cache.matchdata.teamdata) || {};
    const entry = { at: new Date().toISOString(), blue: (td.blueteam || {}).teamname || '', red: (td.redteam || {}).teamname || '', picks };
    const open = pickStats.open !== null ? pickStats.games[pickStats.open] : null;
    if (open) {
        const changed = open.picks.filter((p, i) => p !== picks[i]).length;
        if (changed === 0) return;
        // > 5 pick berbeda tanpa reset = game baru, selebihnya dianggap koreksi
        if (changed <= 5) { pickStats.games[pickStats.open] = entry; savePickStats(); return; }
    }
    pickStats.games.push(entry);
    pickStats.open = pickStats.games.length - 1;
    savePickStats();
}

// counts = berapa game (selain game yang sedang berjalan) yang memakai hero tsb
app.get('/api/pickstats', (req, res) => {
    const counts = {};
    pickStats.games.forEach((g, i) => {
        if (i === pickStats.open) return;
        new Set(g.picks).forEach(k => { counts[k] = (counts[k] || 0) + 1; });
    });
    res.json({ games: pickStats.games.length, open: pickStats.open, counts });
});

app.post('/api/pickstats/reset', (req, res) => {
    pickStats = { games: [], open: null };
    savePickStats();
    res.json({ games: 0 });
});

// ==========================================
// TURNAMEN: arsip hasil game → statistik hero (pick/ban/win rate), leaderboard pemain, klasemen, head-to-head, bracket
// ==========================================
// Hasil game disimpan dari Postgame Control / Tournament Control ("SIMPAN HASIL GAME") memakai data matchdata saat itu.
// Game antar dua tim yang sama dikelompokkan menjadi satu series sampai salah satu tim mencapai kemenangan BO.
const tournamentPath = path.join(dbDir, 'tournament.json');
const defaultTournament = () => ({ name: '', games: [], groups: {}, bracket: { size: 8, bo: [3, 3, 5], teams: [], scores: {} } });
let tournament = defaultTournament();
try { tournament = { ...tournament, ...JSON.parse(fsSync.readFileSync(tournamentPath, 'utf8')) }; } catch (e) {}

function saveTournament() {
    const payload = JSON.stringify(tournament, null, 2);
    fileQueue.enqueue(() => writeFileSafe(tournamentPath, payload));
    broadcast({ type: 'tournament_update' });
}

const tName = (s) => String(s == null ? '' : s).trim();
const tKey = (s) => tName(s).toLowerCase();
const tHero = (h) => { const s = tName(h); return s && !['idle', 'none', 'empty'].includes(s.toLowerCase()) ? s : ''; };
const kdaParse = (s) => { const m = String(s || '').match(/(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/); return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0]; };
const winsNeeded = (bo) => Math.ceil((+bo || 3) / 2);

function buildGameRecord() {
    const md = cache.matchdata || {}, td = md.teamdata || {};
    const side = (key) => {
        const t = td[key] || {};
        return {
            name: tName(t.teamname), logo: t.logo || '',
            players: (t.playerlist || []).slice(0, 5).map(p => {
                const [k, d, a] = kdaParse(p.KDA);
                return { name: tName(p.name), hero: tHero(p.hero), ban: tHero(p.banhero), lane: p.lane || '', k, d, a, gold: +p.gold || 0, level: +p.level || 0 };
            })
        };
    };
    const mvp = cache.mvp && cache.mvp.mvp ? tName(cache.mvp.mvp.nickname) : '';
    // grafik gold dari OCR game ini (bila OCR berjalan), maks. 120 titik; g1 = tim biru
    let goldHistory = null;
    if (ocrGame && ocrGame.gold.length >= 6) {
        const src = ocrGame.cur ? [...ocrGame.gold, ocrGame.cur] : ocrGame.gold, step = Math.ceil(src.length / 120);
        goldHistory = { points: src.filter((p, i) => i % step === 0 || i === src.length - 1).map(p => [p.t, p.g1, p.g2]), marks: ocrGame.marks };
    }
    return { id: crypto.randomBytes(5).toString('hex'), at: new Date().toISOString(), game: +md.game_number || null,
        duration: md.game_duration || '', winner: md.winmatches, blue: side('blueteam'), red: side('redteam'), mvp, goldHistory };
}

const pairKey = (g) => [tKey(g.blue.name), tKey(g.red.name)].sort().join(' vs ');

// kelompokkan game menjadi series (urut waktu)
function tournamentSeries() {
    const list = [], open = new Map();
    for (const g of [...tournament.games].sort((a, b) => a.at.localeCompare(b.at))) {
        const key = pairKey(g);
        let s = open.get(key);
        if (!s) {
            s = { id: g.id, a: g.blue.name, b: g.red.name, bo: g.bo || 3, wins: {}, games: [], done: false, winner: '' };
            s.wins[tKey(s.a)] = 0; s.wins[tKey(s.b)] = 0;
            list.push(s); open.set(key, s);
        }
        const w = tKey(g.winner === 'blue' ? g.blue.name : g.red.name);
        s.wins[w] = (s.wins[w] || 0) + 1;
        s.games.push(g.id);
        if (s.wins[w] >= winsNeeded(s.bo)) { s.done = true; s.winner = w === tKey(s.a) ? s.a : s.b; open.delete(key); }
    }
    return list.map(s => ({ ...s, winsA: s.wins[tKey(s.a)] || 0, winsB: s.wins[tKey(s.b)] || 0 }));
}

function tournamentStats() {
    const games = tournament.games, heroes = new Map(), players = new Map(), teams = new Map();
    const team = (t) => {
        const k = tKey(t.name);
        if (!teams.has(k)) teams.set(k, { name: t.name, logo: t.logo, group: tournament.groups[t.name] || tournament.groups[k] || '',
            games: 0, gameWins: 0, series: 0, seriesWins: 0, seriesLosses: 0, kills: 0, deaths: 0, gold: 0, durSum: 0, durN: 0, heroes: {} });
        const x = teams.get(k);
        if (t.logo) x.logo = t.logo;
        return x;
    };
    const hero = (name) => {
        const k = tKey(name);
        if (!heroes.has(k)) heroes.set(k, { hero: name, picks: 0, bans: 0, wins: 0, present: 0 });
        return heroes.get(k);
    };
    for (const g of games) {
        const dur = (() => { const m = /^(\d{1,3}):(\d{2})$/.exec(String(g.duration || '').trim()); return m ? +m[1] * 60 + +m[2] : 0; })();
        // ban & presence dihitung per game (hero yang di-ban dua tim di game yang sama tetap 1)
        const bans = new Set(), present = new Set();
        for (const sideKey of ['blue', 'red']) {
            const s = g[sideKey], won = g.winner === sideKey, tm = team(s);
            tm.games++; if (won) tm.gameWins++;
            if (dur) { tm.durSum += dur; tm.durN++; }
            for (const p of s.players) {
                if (p.ban) { hero(p.ban); bans.add(tKey(p.ban)); present.add(tKey(p.ban)); }
                if (p.hero) { const h = hero(p.hero); h.picks++; if (won) h.wins++; present.add(tKey(p.hero)); tm.heroes[p.hero] = (tm.heroes[p.hero] || 0) + 1; }
                tm.kills += p.k; tm.deaths += p.d; tm.gold += p.gold;
                if (!p.name) continue;
                const pk = tKey(p.name);
                if (!players.has(pk)) players.set(pk, { name: p.name, team: s.name, lane: '', games: 0, wins: 0, k: 0, d: 0, a: 0, gold: 0, mvp: 0, heroes: {}, heroWins: {} });
                const pl = players.get(pk);
                pl.team = s.name; pl.games++; if (won) pl.wins++;
                if (p.lane && p.lane !== 'none') pl.lane = p.lane;
                if (p.hero && won) pl.heroWins[p.hero] = (pl.heroWins[p.hero] || 0) + 1;
                pl.k += p.k; pl.d += p.d; pl.a += p.a; pl.gold += p.gold;
                if (p.hero) pl.heroes[p.hero] = (pl.heroes[p.hero] || 0) + 1;
                if (g.mvp && tKey(g.mvp) === pk) pl.mvp++;
            }
        }
        for (const b of bans) heroes.get(b).bans++;
        for (const k of present) heroes.get(k).present++;
    }
    const series = tournamentSeries();
    for (const s of series) {
        if (!s.done) continue;
        for (const [n, won] of [[s.a, s.winner === s.a], [s.b, s.winner === s.b]]) {
            const tm = teams.get(tKey(n)); if (!tm) continue;
            tm.series++; if (won) tm.seriesWins++; else tm.seriesLosses++;
        }
    }
    const top = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([hero, count]) => ({ hero, count }));
    const N = games.length;
    return {
        name: tournament.name, totalGames: N,
        heroes: [...heroes.values()].map(h => ({ ...h, pickRate: N ? h.picks / N : 0, banRate: N ? h.bans / N : 0,
            presence: N ? h.present / N : 0, winRate: h.picks ? h.wins / h.picks : 0 })),
        players: [...players.values()].map(p => ({ ...p, heroes: top(p.heroes, 3), heroWins: undefined,
            pool: Object.entries(p.heroes).map(([hero, games]) => ({ hero, games, wins: p.heroWins[hero] || 0 })).sort((a, b) => b.games - a.games || b.wins - a.wins),
            kda: (p.k + p.a) / Math.max(1, p.d),
            avgGold: p.games ? Math.round(p.gold / p.games) : 0, winRate: p.games ? p.wins / p.games : 0 })),
        teams: [...teams.values()].map(t => ({ ...t, heroes: top(t.heroes, 5), gameLosses: t.games - t.gameWins, gameDiff: 2 * t.gameWins - t.games,
            winRate: t.games ? t.gameWins / t.games : 0, avgDuration: t.durN ? Math.round(t.durSum / t.durN) : 0 }))
            .sort((a, b) => b.seriesWins - a.seriesWins || b.gameDiff - a.gameDiff || b.gameWins - a.gameWins || a.name.localeCompare(b.name)),
        series
    };
}

function tournamentBracket() {
    const b = tournament.bracket || {}, size = [4, 8, 16].includes(+b.size) ? +b.size : 8;
    const rounds = [];
    let entrants = Array.from({ length: size }, (_, i) => tName((b.teams || [])[i]));
    for (let r = 0; entrants.length > 1; r++) {
        const bo = +(b.bo || [])[r] || +(b.bo || [])[(b.bo || []).length - 1] || 3, matches = [];
        for (let m = 0; m < entrants.length / 2; m++) {
            const [sa, sb] = (b.scores || {})[`r${r}m${m}`] || [0, 0];
            const a = entrants[m * 2], bb = entrants[m * 2 + 1], need = winsNeeded(bo);
            // slot kosong di ronde pertama = bye (lawan lolos); di ronde berikutnya = lawan belum ditentukan (TBD)
            const winner = a && bb ? (+sa >= need ? a : +sb >= need ? bb : '') : r === 0 ? (a || bb || '') : '';
            matches.push({ a, b: bb, sa: +sa || 0, sb: +sb || 0, winner, bo });
        }
        rounds.push({ name: entrants.length === 2 ? 'GRAND FINAL' : entrants.length === 4 ? 'SEMI FINAL' : entrants.length === 8 ? 'QUARTER FINAL' : 'ROUND OF ' + entrants.length, matches });
        entrants = matches.map(x => x.winner);
    }
    return { size, rounds, champion: entrants[0] || '' };
}

app.get('/api/tournament', (req, res) => {
    res.json({ name: tournament.name, groups: tournament.groups, bracket: tournament.bracket, matchFormat: matchFormat, autoMilestones: tournament.autoMilestones !== false,
        games: tournament.games.map(g => ({ id: g.id, at: g.at, game: g.game, duration: g.duration, winner: g.winner, blue: g.blue.name, red: g.red.name, mvp: g.mvp })) });
});
app.get('/api/tournament/stats', (req, res) => { res.json(tournamentStats()); });
app.get('/api/tournament/bracket', (req, res) => { res.json(tournamentBracket()); });

// head-to-head dua tim (default: tim biru vs merah yang sedang dimainkan)
app.get('/api/tournament/h2h', (req, res) => {
    const td = (cache.matchdata && cache.matchdata.teamdata) || {};
    const a = tName(req.query.a || (td.blueteam || {}).teamname), b = tName(req.query.b || (td.redteam || {}).teamname);
    const st = tournamentStats(), find = (n) => st.teams.find(t => tKey(t.name) === tKey(n)) || null;
    const meet = tournament.games.filter(g => pairKey(g) === [tKey(a), tKey(b)].sort().join(' vs '));
    const winsOf = (n) => meet.filter(g => tKey(g.winner === 'blue' ? g.blue.name : g.red.name) === tKey(n)).length;
    const series = st.series.filter(s => [tKey(s.a), tKey(s.b)].sort().join(' vs ') === [tKey(a), tKey(b)].sort().join(' vs '));
    res.json({ a: { name: a, logo: (td.blueteam || {}).logo || '', stats: find(a), h2hWins: winsOf(a) },
        b: { name: b, logo: (td.redteam || {}).logo || '', stats: find(b), h2hWins: winsOf(b) },
        meetings: meet.length, series: series.map(s => ({ a: s.a, b: s.b, winsA: s.winsA, winsB: s.winsB, done: s.done, winner: s.winner })) });
});

// simpan hasil game yang sedang tampil; simpan ulang game yang sama (tim & nomor game sama) = koreksi, bukan game baru
app.post('/api/tournament/game', (req, res) => {
    const g = buildGameRecord();
    if (g.winner !== 'blue' && g.winner !== 'red') return res.status(400).json({ message: 'Pilih pemenang dulu (BLUE WIN / RED WIN) di Postgame Control.' });
    if (!g.blue.name || !g.red.name) return res.status(400).json({ message: 'Nama tim biru / merah masih kosong.' });
    if (tKey(g.blue.name) === tKey(g.red.name)) return res.status(400).json({ message: 'Nama tim biru dan merah sama.' });
    const last = tournament.games[tournament.games.length - 1];
    if (last && pairKey(last) === pairKey(g) && last.game === g.game && g.game) {
        g.id = last.id; g.bo = last.bo;
        tournament.games[tournament.games.length - 1] = g;
        saveTournament();
        return res.json({ updated: true, message: `Game ${g.game} ${g.blue.name} vs ${g.red.name} diperbarui.`, total: tournament.games.length });
    }
    g.bo = matchFormat.bo || 3;
    const milestones = detectMilestones(g, tournament.games);
    tournament.games.push(g);
    tournament.milestones = [...(tournament.milestones || []), ...milestones].slice(-50);
    saveTournament();
    vodLog(`POST-GAME${g.game ? ' ' + g.game : ''} · ${g.winner === 'blue' ? g.blue.name : g.red.name} menang (${g.duration || '-'})`, 'result', { chapter: true });
    milestones.forEach(m => vodLog(`${m.title}: ${m.player || m.team} · ${m.text}`, 'milestone'));
    if (milestones.length && tournament.autoMilestones !== false) broadcast({ type: 'milestone', data: milestones });
    res.json({ updated: false, milestones: milestones.length, message: `Tersimpan: ${g.blue.name} vs ${g.red.name}${g.game ? ' · game ' + g.game : ''} (${g.winner === 'blue' ? g.blue.name : g.red.name} menang).`, total: tournament.games.length });
});
app.post('/api/tournament/game/delete', (req, res) => {
    const before = tournament.games.length;
    const id = (req.body || {}).id;
    tournament.games = tournament.games.filter(g => g.id !== id);
    if (tournament.games.length === before) return res.status(404).json({ message: 'Game tidak ditemukan.' });
    tournament.milestones = (tournament.milestones || []).filter(m => m.gameId !== id);
    saveTournament();
    res.json({ total: tournament.games.length });
});
app.post('/api/tournament/settings', (req, res) => {
    const b = req.body || {};
    if (typeof b.name === 'string') tournament.name = b.name.trim().slice(0, 80);
    if (typeof b.autoMilestones === 'boolean') tournament.autoMilestones = b.autoMilestones;
    if (b.groups && typeof b.groups === 'object') {
        tournament.groups = {};
        for (const [team, grp] of Object.entries(b.groups)) if (tName(team) && tName(grp)) tournament.groups[tName(team)] = tName(grp).slice(0, 20);
    }
    saveTournament();
    res.json({ name: tournament.name, groups: tournament.groups, autoMilestones: tournament.autoMilestones !== false });
});
app.post('/api/tournament/bracket', (req, res) => {
    const b = req.body || {}, size = [4, 8, 16].includes(+b.size) ? +b.size : 8;
    tournament.bracket = {
        size,
        bo: (Array.isArray(b.bo) ? b.bo : [3, 3, 5]).map(x => [1, 3, 5, 7].includes(+x) ? +x : 3),
        teams: (Array.isArray(b.teams) ? b.teams : []).slice(0, size).map(tName),
        scores: Object.fromEntries(Object.entries(b.scores || {}).filter(([k]) => /^r\d+m\d+$/.test(k))
            .map(([k, v]) => [k, [Math.max(0, parseInt(v[0], 10) || 0), Math.max(0, parseInt(v[1], 10) || 0)]]))
    };
    saveTournament();
    res.json(tournamentBracket());
});
app.post('/api/tournament/reset', (req, res) => {
    if ((req.body || {}).confirm !== 'RESET') return res.status(400).json({ message: 'Konfirmasi dengan { "confirm": "RESET" }' });
    tournament = defaultTournament();
    saveTournament();
    res.json({ ok: true });
});

// --- SERIES RECAP: game-game dalam series dua tim (default: tim biru vs merah yang sedang main), tim A selalu di kiri ---
app.get('/api/tournament/series/current', (req, res) => { res.json(currentSeries(req.query.a, req.query.b, req.query.id)); });
// detail lengkap satu game (kartu media sosial)
app.get('/api/tournament/game/:id', (req, res) => {
    const g = tournament.games.find(x => x.id === req.params.id);
    if (!g) return res.status(404).json({ message: 'Game tidak ditemukan.' });
    res.json({ ...g, goldHistory: undefined });
});

// id = id series dari /api/tournament/stats (tanpa id: series terakhir kedua tim)
function currentSeries(qa, qb, sid) {
    const td = (cache.matchdata && cache.matchdata.teamdata) || {};
    let a = tName(qa || (td.blueteam || {}).teamname), b = tName(qb || (td.redteam || {}).teamname);
    const key = [tKey(a), tKey(b)].sort().join(' vs ');
    const list = tournamentSeries().filter(s => sid ? s.id === sid : [tKey(s.a), tKey(s.b)].sort().join(' vs ') === key);
    const s = list[list.length - 1];
    if (sid && s) { a = s.a; b = s.b; }
    const byId = new Map(tournament.games.map(g => [g.id, g]));
    const games = s ? s.games.map(id => byId.get(id)).filter(Boolean).map(g => {
        const aSide = tKey(g.blue.name) === tKey(a) ? 'blue' : 'red', bSide = aSide === 'blue' ? 'red' : 'blue';
        const gh = g.goldHistory;
        return {
            game: g.game, duration: g.duration, mvp: g.mvp, winner: g.winner === aSide ? a : b, aSide,
            aPicks: g[aSide].players.map(p => p.hero), bPicks: g[bSide].players.map(p => p.hero),
            aBans: g[aSide].players.map(p => p.ban).filter(Boolean), bBans: g[bSide].players.map(p => p.ban).filter(Boolean),
            aKills: g[aSide].players.reduce((x, p) => x + p.k, 0), bKills: g[bSide].players.reduce((x, p) => x + p.k, 0),
            // selisih gold dari sudut pandang tim A (positif = A unggul)
            lead: gh ? gh.points.map(([t, g1, g2]) => [t, aSide === 'blue' ? g1 - g2 : g2 - g1]) : null
        };
    }) : [];
    const winsA = games.filter(g => tKey(g.winner) === tKey(a)).length;
    return { a, b, aLogo: (td.blueteam || {}).logo || '', bLogo: (td.redteam || {}).logo || '', bo: s ? s.bo : (matchFormat.bo || 3),
        winsA, winsB: games.length - winsA, done: s ? s.done : false, winner: s ? s.winner : '', games };
}

// --- KARTU PROFIL PEMAIN / TIM: dipilih operator di Tournament Control, tampil di profile.html ---
let profileCard = { show: false, type: 'player', name: '' };
app.get('/api/profile-card', (req, res) => { res.json(profileCard); });
app.post('/api/profile-card', (req, res) => {
    const b = req.body || {};
    profileCard = {
        show: typeof b.show === 'boolean' ? b.show : profileCard.show,
        type: b.type === 'team' ? 'team' : b.type === 'player' ? 'player' : profileCard.type,
        name: typeof b.name === 'string' ? tName(b.name) : profileCard.name
    };
    broadcast({ type: 'profile_card', data: profileCard });
    res.json(profileCard);
});

// --- REKOR & MILESTONE: dicek setiap hasil game baru disimpan, tampil di milestone.html ---
const durSec = (d) => { const m = /^(\d{1,3}):(\d{2})$/.exec(String(d || '').trim()); return m ? +m[1] * 60 + +m[2] : 0; };
const gamePlayers = (g) => ['blue', 'red'].flatMap(s => g[s].players.filter(p => p.name).map(p => ({ ...p, team: g[s].name, logo: g[s].logo, won: g.winner === s })));

function detectMilestones(g, prev) {
    const out = [], cur = gamePlayers(g), prevPlayers = prev.flatMap(gamePlayers), enough = prev.length >= 2;
    const winner = g.winner === 'blue' ? g.blue : g.red;
    // 1. kill terbanyak dalam satu game (rekor turnamen)
    const best = cur.slice().sort((x, y) => y.k - x.k)[0];
    if (enough && best && best.k >= 5 && best.k > Math.max(0, ...prevPlayers.map(p => p.k)))
        out.push({ title: 'REKOR BARU', text: `Kill terbanyak dalam satu game: ${best.k} kill`, player: best.name, team: best.team, logo: best.logo, hero: best.hero });
    // 2. game tercepat / terlama
    const d = durSec(g.duration), prevD = prev.map(x => durSec(x.duration)).filter(Boolean);
    if (enough && d && prevD.length >= 2 && d < Math.min(...prevD))
        out.push({ title: 'GAME TERCEPAT', text: `Game tercepat turnamen ini: ${g.duration}`, team: winner.name, logo: winner.logo });
    if (enough && d && prevD.length >= 2 && d > Math.max(...prevD))
        out.push({ title: 'GAME TERLAMA', text: `Game terlama turnamen ini: ${g.duration}`, team: winner.name, logo: winner.logo });
    // 3. perfect game: tanpa mati dengan kontribusi besar
    cur.filter(p => p.d === 0 && p.k + p.a >= 10).sort((x, y) => (y.k + y.a) - (x.k + x.a)).slice(0, 1)
        .forEach(p => out.push({ title: 'PERFECT GAME', text: `${p.k}/${p.d}/${p.a} tanpa mati sekali pun`, player: p.name, team: p.team, logo: p.logo, hero: p.hero }));
    // 4. MVP ke-3 / 5 / 10
    if (g.mvp) {
        const n = prev.filter(x => tKey(x.mvp) === tKey(g.mvp)).length + 1;
        const p = cur.find(x => tKey(x.name) === tKey(g.mvp));
        if ([3, 5, 10, 15, 20].includes(n)) out.push({ title: 'MILESTONE', text: `MVP ke-${n} di turnamen ini`, player: g.mvp, team: p ? p.team : '', logo: p ? p.logo : '', hero: p ? p.hero : '' });
    }
    // 5. total kill pemain menembus kelipatan 50
    for (const p of cur) {
        const before = prevPlayers.filter(x => tKey(x.name) === tKey(p.name)).reduce((s, x) => s + x.k, 0), after = before + p.k;
        const mark = Math.floor(after / 50) * 50;
        if (mark >= 50 && before < mark) out.push({ title: 'MILESTONE', text: `${mark} kill di turnamen ini`, player: p.name, team: p.team, logo: p.logo, hero: p.hero });
    }
    // 6. kemenangan pertama tim di turnamen
    if (prev.length && !prev.some(x => tKey(x.winner === 'blue' ? x.blue.name : x.red.name) === tKey(winner.name)))
        out.push({ title: 'KEMENANGAN PERTAMA', text: `Kemenangan pertama ${winner.name} di turnamen ini`, team: winner.name, logo: winner.logo });
    return out.slice(0, 4).map((m, i) => ({ id: `${g.id}-${i}`, gameId: g.id, at: g.at, ...m }));
}

app.get('/api/tournament/milestones', (req, res) => { res.json((tournament.milestones || []).slice().reverse()); });
app.post('/api/tournament/milestone/show', (req, res) => {
    const m = (tournament.milestones || []).find(x => x.id === (req.body || {}).id);
    if (!m) return res.status(404).json({ message: 'Milestone tidak ditemukan.' });
    broadcast({ type: 'milestone', data: [m] });
    res.json({ ok: true });
});

// ==========================================
// CASTER DASHBOARD (casterdashboard.html): bahan bicara caster untuk match yang sedang tampil
// ==========================================
// H2H, form & streak tim, posisi series, statistik pemain + hero andalan, catatan draft, rekor turnamen.
const heroLoose = (s) => tName(s).toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(.)\1+/g, '$1');
const fileBase = (s) => tName(s).split('?')[0].split('/').pop().replace(/\.[a-z]+$/i, '');
const herolistPath = path.join(dbDir, 'herolist.json');

// "Assets/HeroPick/xborg.png" / "xborg" / "X.Borg" → "X.Borg" (nama dari herolist)
function heroResolver() {
    let list = [];
    try { list = JSON.parse(fsSync.readFileSync(herolistPath, 'utf8')); } catch (e) {}
    const map = new Map();
    for (const h of list) for (const k of [heroLoose(h.name), heroLoose(fileBase(h.img))]) if (k && !map.has(k)) map.set(k, h.name);
    return (v) => { const s = tHero(fileBase(v)); return s ? map.get(heroLoose(s)) || s : ''; };
}

function teamForm(name) {
    const k = tKey(name);
    const res = [...tournament.games].sort((a, b) => a.at.localeCompare(b.at))
        .filter(g => tKey(g.blue.name) === k || tKey(g.red.name) === k)
        .map(g => tKey(g.winner === 'blue' ? g.blue.name : g.red.name) === k ? 'W' : 'L');
    let n = 0;
    const last = res[res.length - 1];
    for (let i = res.length - 1; i >= 0 && res[i] === last; i--) n++;
    return { last5: res.slice(-5), streak: last ? { type: last, n } : null };
}

function casterData() {
    const md = cache.matchdata || {}, td = md.teamdata || {};
    const st = tournamentStats(), hero = heroResolver(), series = currentSeries();
    const heroStat = (h) => st.heroes.find(x => heroLoose(x.hero) === heroLoose(h)) || null;
    const allPlayers = tournament.games.flatMap(gamePlayers);
    const fmtGold = (n) => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);

    const side = (key) => {
        const t = td[key] || {}, name = tName(t.teamname);
        const stats = st.teams.find(x => tKey(x.name) === tKey(name)) || null;
        const players = (t.playerlist || []).slice(0, 5).map(p => {
            const ps = st.players.find(x => tKey(x.name) === tKey(p.name)), cur = hero(p.hero);
            const onHero = ps && cur ? ps.pool.find(x => heroLoose(x.hero) === heroLoose(cur)) : null;
            const killsTotal = ps ? ps.k : 0;
            return {
                name: tName(p.name), lane: p.lane && p.lane !== 'none' ? p.lane : (ps && ps.lane) || '', hero: cur, ban: hero(p.banhero),
                games: ps ? ps.games : 0, wins: ps ? ps.wins : 0, winRate: ps ? ps.winRate : 0, mvp: ps ? ps.mvp : 0,
                kda: ps ? ps.kda : 0, avg: ps && ps.games ? [ps.k, ps.d, ps.a].map(v => +(v / ps.games).toFixed(1)) : [0, 0, 0],
                avgGold: ps ? ps.avgGold : 0, killsTotal, nextKillMark: (Math.floor(killsTotal / 50) + 1) * 50,
                pool: ps ? ps.pool.slice(0, 3) : [], onHero: onHero ? { games: onHero.games, wins: onHero.wins } : null
            };
        });
        return { name, logo: t.logo || '', score: t.score || '0', stats, form: teamForm(name), players };
    };
    const blue = side('blueteam'), red = side('redteam');

    // head-to-head semua game kedua tim
    const pk = [tKey(blue.name), tKey(red.name)].sort().join(' vs ');
    const meet = tournament.games.filter(g => pairKey(g) === pk);
    const winsOf = (n) => meet.filter(g => tKey(g.winner === 'blue' ? g.blue.name : g.red.name) === tKey(n)).length;
    const h2h = { games: meet.length, blue: winsOf(blue.name), red: winsOf(red.name) };

    // rekor turnamen
    const killRec = allPlayers.slice().sort((a, b) => b.k - a.k)[0] || null;
    const timed = tournament.games.filter(g => durSec(g.duration)).sort((a, b) => durSec(a.duration) - durSec(b.duration));
    const mvpLead = st.players.slice().sort((a, b) => b.mvp - a.mvp)[0];
    const records = {
        kills: killRec && killRec.k ? { k: killRec.k, player: killRec.name, team: killRec.team, hero: killRec.hero } : null,
        fastest: timed[0] ? { duration: timed[0].duration, winner: timed[0].winner === 'blue' ? timed[0].blue.name : timed[0].red.name, vs: `${timed[0].blue.name} vs ${timed[0].red.name}` } : null,
        longest: timed.length > 1 ? { duration: timed[timed.length - 1].duration, vs: `${timed[timed.length - 1].blue.name} vs ${timed[timed.length - 1].red.name}` } : null,
        mvp: mvpLead && mvpLead.mvp ? { player: mvpLead.name, team: mvpLead.team, mvp: mvpLead.mvp } : null
    };

    // --- talking points ---
    const tp = [], add = (tag, text, sideName) => tp.push({ tag, text, side: sideName || '' });
    const need = winsNeeded(series.bo);
    if (blue.name && red.name) {
        // skor series: skor overlay (control panel) bila sudah diisi, selain itu dari arsip turnamen
        const sb = parseInt(blue.score, 10) || 0, sr = parseInt(red.score, 10) || 0, manual = sb + sr > 0;
        if (manual) Object.assign(series, { a: blue.name, b: red.name, winsA: sb, winsB: sr, done: Math.max(sb, sr) >= need, games: [1] });
        if (series.games.length && !series.done) {
            const [wa, wb] = [series.winsA, series.winsB];
            if (wa === need - 1 && wb === need - 1) add('SERIES', `GAME PENENTUAN! ${series.a} dan ${series.b} sama-sama ${wa} kemenangan di BO${series.bo}.`);
            else for (const [n, w, o] of [[series.a, wa, wb], [series.b, wb, wa]]) if (w === need - 1) add('SERIES', `${n} MATCH POINT: satu kemenangan lagi untuk menutup series BO${series.bo} (skor ${w}-${o}).`, n);
            if (wa !== wb && Math.max(wa, wb) < need - 1) add('SERIES', `${wa > wb ? series.a : series.b} unggul ${Math.max(wa, wb)}-${Math.min(wa, wb)} di series ini.`);
        }
        if (!h2h.games) add('H2H', `Pertemuan pertama ${blue.name} vs ${red.name} di turnamen ini.`);
        else {
            add('H2H', `Head-to-head: ${blue.name} ${h2h.blue} - ${h2h.red} ${red.name} dari ${h2h.games} game.`);
            for (const [a, b, wa, wb] of [[blue.name, red.name, h2h.blue, h2h.red], [red.name, blue.name, h2h.red, h2h.blue]])
                if (wa === 0 && wb >= 2) add('H2H', `${a} belum pernah menang melawan ${b} (0-${wb}).`, a);
        }
    }
    for (const t of [blue, red]) {
        if (!t.name) continue;
        const s = t.form.streak, x = t.stats;
        if (s && s.n >= 2) add('FORM', s.type === 'W' ? `${t.name} sedang on fire: menang ${s.n} game beruntun.` : `${t.name} kalah ${s.n} game beruntun, butuh kebangkitan.`, t.name);
        if (x && x.games) {
            add('TIM', `${t.name}: series ${x.seriesWins}-${x.seriesLosses}, game ${x.gameWins}-${x.gameLosses} (win rate ${Math.round(x.winRate * 100)}%)${x.avgDuration ? `, rata-rata durasi ${Math.floor(x.avgDuration / 60)}:${String(x.avgDuration % 60).padStart(2, '0')}` : ''}.`, t.name);
            if (x.heroes[0] && x.heroes[0].count >= 2) add('TIM', `Hero favorit ${t.name}: ${x.heroes.slice(0, 3).map(h => `${h.hero} (${h.count}x)`).join(', ')}.`, t.name);
        } else add('TIM', `${t.name} belum punya game tersimpan di turnamen ini.`, t.name);
        const key = t.players.filter(p => p.games).sort((a, b) => b.kda - a.kda)[0];
        if (key) add('PEMAIN', `Pemain kunci ${t.name}: ${key.name}, KDA ${key.kda.toFixed(1)} · rata-rata ${key.avg.join('/')}${key.mvp ? ` · ${key.mvp}x MVP` : ''}.`, t.name);
        for (const p of t.players) {
            const left = p.nextKillMark - p.killsTotal;
            if (p.killsTotal && left <= 8) add('MILESTONE', `${p.name} butuh ${left} kill lagi untuk ${p.nextKillMark} kill di turnamen ini (sekarang ${p.killsTotal}).`, t.name);
            if (records.kills && p.games && p.killsTotal && records.kills.player !== p.name && p.avg[0] >= records.kills.k * 0.6)
                add('REKOR', `${p.name} rata-rata ${p.avg[0]} kill/game, rekor turnamen ${records.kills.k} kill (${records.kills.player}) bisa terancam.`, t.name);
        }
    }
    // draft: hero andalan, hero baru, ban yang menarget pemain lawan
    for (const [t, o] of [[blue, red], [red, blue]]) {
        for (const p of t.players) {
            if (!p.hero) continue;
            const hs = heroStat(p.hero);
            if (!hs || !hs.picks) { if (tournament.games.length >= 2) add('DRAFT', `${p.hero} (${p.name}, ${t.name}) baru pertama kali dipick di turnamen ini.`, t.name); }
            else if (hs.picks >= 3 && hs.winRate >= 0.7) add('DRAFT', `${p.hero} punya win rate ${Math.round(hs.winRate * 100)}% dari ${hs.picks} pick di turnamen ini.`, t.name);
            else if (hs.picks >= 3 && hs.winRate <= 0.3) add('DRAFT', `${p.hero} baru menang ${hs.wins} dari ${hs.picks} pick di turnamen ini.`, t.name);
            if (p.onHero && p.onHero.games >= 2) add('DRAFT', `${p.name} kembali ke ${p.hero}: ${p.onHero.games} game, menang ${p.onHero.wins}.`, t.name);
        }
        for (const b of new Set(t.players.map(p => p.ban).filter(Boolean))) {
            const target = o.players.find(p => p.pool[0] && heroLoose(p.pool[0].hero) === heroLoose(b) && p.pool[0].games >= 2);
            if (target) add('DRAFT', `${t.name} mem-ban ${b}, hero andalan ${target.name} (${o.name}, ${target.pool[0].games} game).`, t.name);
        }
    }
    if (records.kills) add('REKOR', `Rekor kill satu game: ${records.kills.k} kill oleh ${records.kills.player}${records.kills.hero ? ` (${records.kills.hero})` : ''}.`);
    if (records.fastest && timed.length >= 2) add('REKOR', `Game tercepat turnamen: ${records.fastest.duration} (${records.fastest.vs}, ${records.fastest.winner} menang).`);
    if (records.mvp && records.mvp.mvp >= 2) add('REKOR', `MVP terbanyak: ${records.mvp.player} (${records.mvp.team}) dengan ${records.mvp.mvp} MVP.`);
    const live = ocrGameSummary(false);
    if (live.live && live.lead != null && live.t != null)
        add('LIVE', live.lead === 0 ? `Gold imbang di menit ${Math.floor(live.t / 60)}.` : `${live.lead > 0 ? blue.name : red.name} unggul ${fmtGold(Math.abs(live.lead))} gold di menit ${Math.floor(live.t / 60)}.`);

    return { tournament: tournament.name, game: md.game_number || '', bo: series.bo, totalGames: tournament.games.length,
        series: { winsA: series.winsA, winsB: series.winsB, a: series.a, b: series.b, done: series.done, games: series.games.length },
        blue, red, h2h, records, live, talkingPoints: tp };
}

app.get('/api/caster', (req, res) => { res.json(casterData()); });

// ==========================================
// VOD TIMELINE (vodtimeline.html): semua event siaran dicatat dengan jam → chapter YouTube & marker editor
// ==========================================
// Event otomatis: draft mulai, game mulai (timer OCR), notifikasi video/pemain, multikill, hasil game, milestone.
// Waktu rekaman dihitung dari startAt (tombol MULAI REKAM, bisa diberi offset bila rekaman sudah berjalan).
const vodPath = path.join(dbDir, 'vod.json');
let vod = { startAt: null, stopAt: null, events: [] };
try { vod = { ...vod, ...JSON.parse(fsSync.readFileSync(vodPath, 'utf8')) }; } catch (e) {}
const VIDEO_LABEL = {
    videoPlayer1: 'TURTLE SPAWN', videoPlayer2: 'BLUE TURTLE SLAIN', videoPlayer3: 'RED TURTLE SLAIN',
    videoPlayer4: 'LORD SPAWN', videoPlayer5: 'BLUE LORD SLAIN', videoPlayer6: 'RED LORD SLAIN',
    videoPlayer7: 'FIRST BLOOD', videoPlayer8: 'DOUBLE KILL', videoPlayer9: 'TRIPLE KILL',
    videoPlayer10: 'MANIAC', videoPlayer11: 'SAVAGE', videoPlayer12: 'WIPE OUT'
};
const VOD_KINDS = ['draft', 'game', 'result', 'notif', 'ocr', 'multikill', 'event', 'pause', 'milestone', 'manual'];
let vodSaveTimer = null;

function saveVod() {
    clearTimeout(vodSaveTimer);
    vodSaveTimer = setTimeout(() => { const p = JSON.stringify(vod, null, 2); fileQueue.enqueue(() => writeFileSafe(vodPath, p)); }, 300);
    broadcast({ type: 'vod_update' });
}

const draftFilled = (d) => { const x = (d && d.draftdata) || {}; return ['blueside', 'redside'].reduce((n, s) => n + ['ban', 'pick'].reduce((m, k) => m + ((x[s] || {})[k] || []).filter(h => h && tHero(fileBase(h.hero))).length, 0), 0); };

function vodMatchLabel() {
    const md = cache.matchdata || {}, td = md.teamdata || {};
    const a = tName((td.blueteam || {}).teamname), b = tName((td.redteam || {}).teamname);
    return `GAME${md.game_number ? ' ' + md.game_number : ''}${a || b ? ` · ${a || 'BIRU'} vs ${b || 'MERAH'}` : ''}`;
}

function vodLog(label, kind, opts = {}) {
    const at = Math.round(opts.at || Date.now());
    // multikill beruntun (double → triple → maniac) cukup satu marker, labelnya naik
    if (kind === 'multikill' && opts.side) {
        const prev = [...vod.events].reverse().find(e => e.kind === 'multikill' && e.side === opts.side);
        if (prev && at - prev.at <= ((opts.window || 10) + 5) * 1000) { prev.label = label; saveVod(); return prev; }
    }
    // chapter game ganda (OCR di-reset di tengah game yang sama) diabaikan
    if (kind === 'game' && vod.events.some(e => e.kind === 'game' && Math.abs(e.at - at) < 30000)) return null;
    const e = { id: crypto.randomBytes(4).toString('hex'), at, kind: VOD_KINDS.includes(kind) ? kind : 'manual', label: tName(label).slice(0, 100) || 'MARKER', chapter: !!opts.chapter };
    if (opts.side) e.side = opts.side;
    vod.events.push(e);
    vod.events.sort((a, b) => a.at - b.at);
    if (vod.events.length > 2000) vod.events.splice(0, vod.events.length - 2000);
    saveVod();
    return e;
}

// "1:02:03" / "12:30" / "90" → detik
const parseDur = (v) => {
    const s = String(v == null ? '' : v).trim();
    if (/^\d+$/.test(s)) return +s;
    const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(s);
    return m ? (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3] : null;
};
const hms = (sec, long) => {
    const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60, p = (n) => String(n).padStart(2, '0');
    return long ? `${h}:${p(m)}:${p(s)}` : `${Math.floor(sec / 60)}:${p(s)}`;
};
const vodInRange = () => vod.startAt ? vod.events.filter(e => e.at >= vod.startAt && (!vod.stopAt || e.at <= vod.stopAt)) : [];
const vodSec = (e) => Math.floor((e.at - vod.startAt) / 1000);
const vodLong = () => vod.startAt && ((vod.stopAt || Date.now()) - vod.startAt) >= 3600 * 1000;

// aturan YouTube: chapter pertama 0:00, minimal 3 chapter, jarak antar chapter minimal 10 detik
function vodYoutube(intro) {
    const out = [];
    for (const e of vodInRange().filter(x => x.chapter)) {
        const c = { s: vodSec(e), label: e.label }, prev = out[out.length - 1];
        if (prev && c.s - prev.s < 10) { prev.label = c.label; continue; }
        out.push(c);
    }
    if (!out.length || out[0].s >= 10) out.unshift({ s: 0, label: tName(intro) || 'Pembukaan' });
    else out[0].s = 0;
    const warnings = [];
    if (!vod.startAt) warnings.push('Rekaman belum dimulai: tekan MULAI REKAM (atau isi offset) agar waktu chapter benar.');
    if (out.length < 3) warnings.push(`YouTube butuh minimal 3 chapter (sekarang ${out.length}).`);
    const long = vodLong();
    return { chapters: out, warnings, text: out.map(c => `${hms(c.s, long)} ${c.label}`).join('\n') };
}

const EDL_COLOR = { draft: 'ResolveColorBlue', game: 'ResolveColorGreen', result: 'ResolveColorYellow', notif: 'ResolveColorRed', ocr: 'ResolveColorRed',
    multikill: 'ResolveColorPink', event: 'ResolveColorPurple', pause: 'ResolveColorLemon', milestone: 'ResolveColorCyan', manual: 'ResolveColorCream' };

function vodExport(format, opts) {
    const list = vodInRange(), long = vodLong();
    const clock = (at) => new Date(at).toLocaleTimeString('en-GB', { hour12: false });
    if (format === 'csv') {
        const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
        return ['timecode,seconds,type,chapter,label,clock', ...list.map(e => [hms(vodSec(e), true), vodSec(e), e.kind, e.chapter ? 1 : 0, q(e.label), clock(e.at)].join(','))].join('\r\n');
    }
    if (format === 'edl') {
        // marker DaVinci Resolve: Timeline › Import › Timeline Markers from EDL
        const fps = [24, 25, 30, 50, 60].includes(+opts.fps) ? +opts.fps : 30, base = Math.max(0, parseInt(opts.base, 10) || 0);
        const tc = (sec, plus) => { const f = (base * 3600 + sec) * fps + (plus || 0), p = (n) => String(n).padStart(2, '0');
            return `${p(Math.floor(f / (3600 * fps)))}:${p(Math.floor(f / (60 * fps)) % 60)}:${p(Math.floor(f / fps) % 60)}:${p(f % fps)}`; };
        return [`TITLE: ARPRO VOD MARKERS`, 'FCM: NON-DROP FRAME', '',
            ...list.map((e, i) => `${String(i + 1).padStart(3, '0')}  001      V     C        ${tc(vodSec(e))} ${tc(vodSec(e), 1)} ${tc(vodSec(e))} ${tc(vodSec(e), 1)}  \n |C:${EDL_COLOR[e.kind] || 'ResolveColorBlue'} |M:${e.label.replace(/\|/g, '/')} |D:1\n`)].join('\r\n');
    }
    if (format === 'txt') return list.map(e => `${hms(vodSec(e), long)} ${e.chapter ? '[CHAPTER] ' : ''}${e.label}`).join('\n');
    return vodYoutube(opts.intro).text;
}

app.get('/api/vod', (req, res) => {
    res.json({ startAt: vod.startAt, stopAt: vod.stopAt, recording: !!vod.startAt && !vod.stopAt, now: Date.now(), events: vod.events, youtube: vodYoutube(req.query.intro) });
});
app.get('/api/vod/export', (req, res) => {
    const format = ['youtube', 'csv', 'edl', 'txt'].includes(req.query.format) ? req.query.format : 'youtube';
    const body = vodExport(format, req.query);
    res.type(format === 'csv' ? 'text/csv' : 'text/plain; charset=utf-8');
    if (req.query.download) res.attachment(`vod-${format === 'youtube' ? 'chapters' : 'markers'}-${new Date().toISOString().slice(0, 10)}.${format === 'csv' ? 'csv' : format === 'edl' ? 'edl' : 'txt'}`);
    res.send(body);
});
// body: { offset: "12:30" } → rekaman sudah berjalan 12 menit 30 detik
app.post('/api/vod/start', (req, res) => {
    const off = parseDur((req.body || {}).offset || 0);
    if (off == null) return res.status(400).json({ message: 'Offset harus berformat m:ss atau h:mm:ss, contoh 12:30' });
    vod.startAt = Date.now() - off * 1000;
    vod.stopAt = null;
    saveVod();
    res.json({ startAt: vod.startAt });
});
app.post('/api/vod/stop', (req, res) => {
    if (!vod.startAt) return res.status(400).json({ message: 'Rekaman belum dimulai.' });
    vod.stopAt = Date.now();
    saveVod();
    res.json({ stopAt: vod.stopAt });
});
app.post('/api/vod/mark', (req, res) => {
    const b = req.body || {};
    res.json(vodLog(b.label || 'HIGHLIGHT', 'manual', { chapter: b.chapter === true || b.chapter === '1' || b.chapter === 'true' }));
});
// edit satu event: label, chapter on/off, geser waktu (detik, +/-), atau hapus
app.post('/api/vod/event', (req, res) => {
    const b = req.body || {}, e = vod.events.find(x => x.id === b.id);
    if (!e) return res.status(404).json({ message: 'Event tidak ditemukan.' });
    if (b.delete) vod.events = vod.events.filter(x => x !== e);
    else {
        if (typeof b.label === 'string' && tName(b.label)) e.label = tName(b.label).slice(0, 100);
        if (typeof b.chapter === 'boolean') e.chapter = b.chapter;
        if (Number.isFinite(+b.shift) && +b.shift) { e.at += Math.round(+b.shift * 1000); vod.events.sort((x, y) => x.at - y.at); }
    }
    saveVod();
    res.json({ ok: true });
});
app.post('/api/vod/clear', (req, res) => {
    if ((req.body || {}).confirm !== 'CLEAR') return res.status(400).json({ message: 'Konfirmasi dengan { "confirm": "CLEAR" }' });
    vod = { startAt: null, stopAt: null, events: [] };
    saveVod();
    res.json({ ok: true });
});

// ==========================================
// BAHASA OVERLAY (ID / EN): script/i18n.js di overlay menerjemahkan label saat bahasa diganti
// ==========================================
// '' = teks asli tiap overlay (seperti sebelumnya), 'id' = Indonesia, 'en' = English
const langPath = path.join(dbDir, 'lang.json');
let overlayLang = '';
try { const l = JSON.parse(fsSync.readFileSync(langPath, 'utf8')).lang; if (['id', 'en'].includes(l)) overlayLang = l; } catch (e) {}
app.get('/api/lang', (req, res) => { res.json({ lang: overlayLang }); });
app.post('/api/lang', (req, res) => {
    const l = (req.body || {}).lang;
    if (!['', 'id', 'en'].includes(l)) return res.status(400).json({ message: 'lang harus "", "id", atau "en"' });
    overlayLang = l;
    fileQueue.enqueue(() => writeFileSafe(langPath, JSON.stringify({ lang: overlayLang }, null, 2)));
    broadcast({ type: 'lang_update', lang: overlayLang });
    res.json({ lang: overlayLang });
});

// ==========================================
// TECHNICAL PAUSE (pause.html): timer jeda per tim dengan jatah waktu, seperti aturan MPL
// ==========================================
const pausePath = path.join(dbDir, 'pause.json');
const defaultPause = () => ({ allowance: 300, active: null, used: { blue: 0, red: 0 }, count: { blue: 0, red: 0 }, log: [] });
let pause = defaultPause();
try { pause = { ...pause, ...JSON.parse(fsSync.readFileSync(pausePath, 'utf8')) }; } catch (e) {}

function pauseTeams() {
    const td = (cache.matchdata && cache.matchdata.teamdata) || {};
    const t = (k, d) => ({ name: tName((td[k] || {}).teamname) || d, logo: (td[k] || {}).logo || '' });
    return { blue: t('blueteam', 'BLUE'), red: t('redteam', 'RED'), admin: { name: 'ADMIN', logo: '' } };
}
function pauseState() {
    const now = Date.now(), a = pause.active, elapsed = a ? Math.floor((now - a.startAt) / 1000) : 0;
    const remain = (s) => pause.allowance - pause.used[s] - (a && a.side === s ? elapsed : 0);
    return { allowance: pause.allowance, active: a ? { ...a, elapsed } : null, used: pause.used, count: pause.count,
        remaining: { blue: remain('blue'), red: remain('red') }, teams: pauseTeams(), now, log: pause.log.slice(-12).reverse() };
}
function savePause() {
    const p = JSON.stringify(pause, null, 2);
    fileQueue.enqueue(() => writeFileSafe(pausePath, p));
    broadcast({ type: 'pause_update', data: pauseState() });
}
function pauseStop() {
    const a = pause.active;
    if (!a) return null;
    const dur = Math.max(0, Math.floor((Date.now() - a.startAt) / 1000));
    if (a.side !== 'admin') pause.used[a.side] += dur;
    pause.log.push({ side: a.side, reason: a.reason, startAt: a.startAt, dur });
    pause.log = pause.log.slice(-50);
    pause.active = null;
    vodLog(`RESUME · ${pauseTeams()[a.side].name} (${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')})`, 'pause');
    return dur;
}
app.get('/api/pause', (req, res) => { res.json(pauseState()); });
// body: { side: blue|red|admin, reason }
app.post('/api/pause/start', (req, res) => {
    const b = req.body || {};
    if (!['blue', 'red', 'admin'].includes(b.side)) return res.status(400).json({ message: 'side harus blue, red, atau admin' });
    pauseStop();
    pause.active = { side: b.side, reason: tName(b.reason).slice(0, 40).toUpperCase() || 'TECHNICAL ISSUE', startAt: Date.now() };
    if (b.side !== 'admin') pause.count[b.side]++;
    vodLog(`TECHNICAL PAUSE · ${pauseTeams()[b.side].name} (${pause.active.reason})`, 'pause');
    savePause();
    res.json(pauseState());
});
app.post('/api/pause/stop', (req, res) => {
    if (pauseStop() == null) return res.status(400).json({ message: 'Tidak ada pause yang berjalan.' });
    savePause();
    res.json(pauseState());
});
app.post('/api/pause/reset', (req, res) => {
    pause = { ...defaultPause(), allowance: pause.allowance };
    savePause();
    res.json(pauseState());
});
app.post('/api/pause/settings', (req, res) => {
    const s = parseDur((req.body || {}).allowance);
    if (s == null || s < 0 || s > 3600) return res.status(400).json({ message: 'Jatah pause harus m:ss, contoh 5:00' });
    pause.allowance = s;
    savePause();
    res.json(pauseState());
});

// ==========================================
// ANALISIS KOMPOSISI DRAFT (draftanalysis.html): tipe komposisi, power curve, damage, sinergi hero di turnamen
// ==========================================
// Atribut hero di public/database/herometa.json (bisa diedit, dibaca ulang setiap kali dipakai).
const AXES = ['early', 'late', 'teamfight', 'poke', 'pickoff', 'push'];
const herometaPath = path.join(dbDir, 'herometa.json');
let draftAnalysisMode = 'auto'; // auto = tampil saat 10 hero terpilih, show / hide = paksa

function heroMetaMap() {
    const map = new Map();
    try {
        const j = JSON.parse(fsSync.readFileSync(herometaPath, 'utf8'));
        for (const [n, v] of Object.entries(j.heroes || {})) if (Array.isArray(v))
            map.set(heroLoose(n), { role: v[0] || '', dmg: v[1] || '', axes: (Array.isArray(v[2]) ? v[2] : []).concat([1, 1, 1, 1, 1, 1]).slice(0, 6).map(x => Math.max(0, Math.min(3, +x || 0))) });
    } catch (e) {}
    return map;
}

function draftAnalysis() {
    const md = cache.matchdata || {}, td = md.teamdata || {}, dd = (cache.matchdraft && cache.matchdraft.draftdata) || {};
    const hero = heroResolver(), meta = heroMetaMap(), st = tournamentStats(), games = tournament.games;
    const side = (dkey, tkey) => {
        let picks = ((dd[dkey] || {}).pick || []).map(p => hero(p && p.hero));
        if (!picks.some(Boolean)) picks = ((td[tkey] || {}).playerlist || []).map(p => hero(p.hero)); // draft sudah di-reset: pakai hero di matchdata
        const list = picks.slice(0, 5).filter(Boolean).map(h => {
            const m = meta.get(heroLoose(h)), hs = st.heroes.find(x => heroLoose(x.hero) === heroLoose(h));
            return { hero: h, role: m ? m.role : '', dmg: m ? m.dmg : '', known: !!(m && m.role), axes: m ? m.axes : null, picks: hs ? hs.picks : 0, wins: hs ? hs.wins : 0 };
        });
        const known = list.filter(x => x.known);
        const axes = Object.fromEntries(AXES.map((a, i) => [a, known.length ? known.reduce((s, x) => s + x.axes[i], 0) / (3 * known.length) : 0]));
        const style = ['teamfight', 'poke', 'pickoff', 'push'].sort((a, b) => axes[b] - axes[a]);
        const diff = axes.early - axes.late;
        const dmgW = { P: [1, 0], M: [0, 1], X: [0.5, 0.5] };
        const dsum = known.reduce((s, x) => { const w = dmgW[x.dmg] || [0.5, 0.5]; return [s[0] + w[0], s[1] + w[1]]; }, [0, 0]);
        const physical = known.length ? dsum[0] / known.length : 0.5;
        const roles = {};
        known.forEach(x => { roles[x.role] = (roles[x.role] || 0) + 1; });
        const warnings = [];
        if (known.length >= 4) {
            if (!roles.tank && !roles.support) warnings.push('notank');
            if (physical >= 0.85) warnings.push('allphysical');
            if (physical <= 0.15) warnings.push('allmagic');
        }
        // sinergi: pasangan hero draft ini yang pernah dipakai bersama oleh satu tim di turnamen
        const synergy = [];
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
            const ka = heroLoose(list[i].hero), kb = heroLoose(list[j].hero);
            let n = 0, w = 0;
            for (const g of games) for (const s of ['blue', 'red']) {
                const hs = g[s].players.map(p => heroLoose(p.hero));
                if (hs.includes(ka) && hs.includes(kb)) { n++; if (g.winner === s) w++; }
            }
            if (n) synergy.push({ a: list[i].hero, b: list[j].hero, games: n, wins: w });
        }
        synergy.sort((x, y) => y.games - x.games || y.wins - x.wins);
        const t = td[tkey] || {};
        return { name: tName(t.teamname), logo: t.logo || '', heroes: list, count: list.length, known: known.length, axes,
            type: known.length ? style[0] : '', type2: known.length ? style[1] : '',
            curve: !known.length ? '' : diff >= 0.12 ? 'early' : diff <= -0.12 ? 'late' : 'balanced',
            physical, roles, warnings, synergy: synergy.slice(0, 3), unknown: list.filter(x => !x.known).map(x => x.hero) };
    };
    const blue = side('blueside', 'blueteam'), red = side('redside', 'redteam');
    return { mode: draftAnalysisMode, complete: blue.count === 5 && red.count === 5, totalGames: games.length, blue, red };
}

// ==========================================
// EFEK DRAFT (draft-fx.js di display / display2 / ban6): teks & warna giliran pick, kecepatan, lama splash
// ==========================================
const draftFxPath = path.join(dbDir, 'draftfx.json');
const defaultDraftFx = { turnText: '', blue: '#1b5cff', red: '#e3263b', intensity: 0.55, speed: 1.6, splashHold: 1.7 };
let draftFx = { ...defaultDraftFx };
try { draftFx = { ...defaultDraftFx, ...JSON.parse(fsSync.readFileSync(draftFxPath, 'utf8')) }; } catch (e) {}
app.get('/api/draftfx', (req, res) => { res.json({ config: draftFx, defaults: defaultDraftFx }); });
app.post('/api/draftfx', (req, res) => {
    const b = req.body || {}, next = { ...draftFx };
    if (b.reset) Object.assign(next, defaultDraftFx);
    if (typeof b.turnText === 'string') next.turnText = b.turnText.trim().slice(0, 12).toUpperCase();
    for (const k of ['blue', 'red']) {
        if (b[k] == null) continue;
        if (!/^#[0-9a-f]{6}$/i.test(b[k])) return res.status(400).json({ message: `Warna ${k} harus format #RRGGBB` });
        next[k] = b[k].toLowerCase();
    }
    for (const [k, lo, hi] of [['intensity', 0.1, 1], ['speed', 0.4, 5], ['splashHold', 0.6, 5]]) {
        if (b[k] == null) continue;
        const n = +b[k];
        if (!(n >= lo && n <= hi)) return res.status(400).json({ message: `${k} harus ${lo}–${hi}` });
        next[k] = Math.round(n * 100) / 100;
    }
    draftFx = next;
    fileQueue.enqueue(() => writeFileSafe(draftFxPath, JSON.stringify(draftFx, null, 2)));
    broadcast({ type: 'draftfx_update', data: draftFx });
    res.json({ config: draftFx });
});

// --- POSISI SPLASH PER HERO (database/herofocus.json): titik fokus x / y (% gambar) + zoom, diatur di Broadcast Control ---
const heroFocusPath = path.join(dbDir, 'herofocus.json');
app.post('/api/herofocus', async (req, res) => {
    const b = req.body || {}, key = String(b.key || '');
    if (!/^[a-z0-9]{1,40}$/.test(key)) return res.status(400).json({ message: 'key hero tidak valid' });
    let map = {};
    try { map = JSON.parse(await fs.readFile(heroFocusPath, 'utf8')) || {}; } catch (e) {}
    if (b.reset) delete map[key];
    else {
        const x = +b.x, y = +b.y, zoom = +b.zoom;
        if (!(x >= 0 && x <= 100 && y >= 0 && y <= 100 && zoom >= 1 && zoom <= 3)) return res.status(400).json({ message: 'x / y 0–100, zoom 1–3' });
        map[key] = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, zoom: Math.round(zoom * 100) / 100 };
    }
    await fileQueue.enqueue(() => writeFileSafe(heroFocusPath, JSON.stringify(map, null, 2)));
    broadcast({ type: 'herofocus_update' });
    res.json({ key, focus: map[key] || null });
});

app.get('/api/draft-analysis', (req, res) => { res.json(draftAnalysis()); });
app.post('/api/draft-analysis/mode', (req, res) => {
    const m = (req.body || {}).mode;
    if (!['auto', 'show', 'hide'].includes(m)) return res.status(400).json({ message: 'mode harus auto, show, atau hide' });
    draftAnalysisMode = m;
    broadcast({ type: 'draft_analysis_mode', mode: m });
    res.json({ mode: m });
});

// ==========================================
// STREAM DECK / BITFOCUS COMPANION: satu URL per tombol (GET atau POST, tanpa body)
// ==========================================
// Contoh: http://IP-SERVER:3000/api/companion/notif/firstblood · daftar lengkap di companion.html / GET /api/companion
const COMPANION_NOTIF = { turtlespawn: 1, blueturtle: 2, redturtle: 3, lordspawn: 4, bluelord: 5, redlord: 6, firstblood: 7, doublekill: 8, triplekill: 9, maniac: 10, savage: 11, wipeout: 12 };
const COMPANION_ACTIONS = {
    'event-stop': ['Hentikan notifikasi pemain', '/api/eventnotif', () => ({ stop: true })],
    'event-replay': ['Ulangi notifikasi pemain terakhir', '/api/eventnotif', () => ({ replay: true })],
    'event': ['Notifikasi pemain (event · tim · slot)', '/api/eventnotif', (q) => ({ event: q.event, side: q.side, slot: q.slot })],
    'mvp-show': ['Tampilkan banner MVP in-game', '/api/ingame', (q) => ({ mvp: { show: true, ...(q.side ? { side: q.side } : {}), ...(q.slot != null ? { slot: q.slot } : {}) } })],
    'mvp-hide': ['Sembunyikan banner MVP in-game', '/api/ingame', () => ({ mvp: { show: false } })],
    'highlights-show': ['Tampilkan badge HIGHLIGHTS', '/api/ingame', () => ({ highlights: { show: true } })],
    'highlights-hide': ['Sembunyikan badge HIGHLIGHTS', '/api/ingame', () => ({ highlights: { show: false } })],
    'lineup-show': ['Tampilkan lineup', '/api/lineup-control', () => ({ mode: 'show' })],
    'lineup-hide': ['Sembunyikan lineup', '/api/lineup-control', () => ({ mode: 'hide' })],
    'lineup-auto': ['Lineup mode otomatis', '/api/lineup-control', () => ({ mode: 'auto' })],
    'save-result': ['Simpan hasil game ke turnamen', '/api/tournament/game', () => ({})],
    'profile-hide': ['Sembunyikan kartu profil', '/api/profile-card', () => ({ show: false })],
    'profile-show': ['Tampilkan kartu profil', '/api/profile-card', (q) => ({ show: true, ...(q.type ? { type: q.type } : {}), ...(q.name ? { name: q.name } : {}) })],
    'ocr-reset': ['Reset data game OCR (gold / timer)', '/api/ocr/game/reset', () => ({})],
    'vod-mark': ['Tandai highlight di timeline VOD (?label=...)', '/api/vod/mark', (q) => ({ label: q.label || 'HIGHLIGHT' })],
    'vod-chapter': ['Chapter baru di timeline VOD (?label=...)', '/api/vod/mark', (q) => ({ label: q.label || 'CHAPTER', chapter: true })],
    'vod-start': ['Mulai hitung waktu rekaman VOD', '/api/vod/start', (q) => ({ offset: q.offset || 0 })],
    'vod-stop': ['Stop hitung waktu rekaman VOD', '/api/vod/stop', () => ({})],
    'pause-blue': ['Technical pause tim biru (?reason=...)', '/api/pause/start', (q) => ({ side: 'blue', reason: q.reason })],
    'pause-red': ['Technical pause tim merah (?reason=...)', '/api/pause/start', (q) => ({ side: 'red', reason: q.reason })],
    'pause-admin': ['Pause admin / wasit', '/api/pause/start', (q) => ({ side: 'admin', reason: q.reason || 'ADMIN PAUSE' })],
    'pause-stop': ['Lanjutkan game (stop pause)', '/api/pause/stop', () => ({})],
    'pause-reset': ['Reset jatah pause (game baru)', '/api/pause/reset', () => ({})],
    'analysis-show': ['Tampilkan analisis draft', '/api/draft-analysis/mode', () => ({ mode: 'show' })],
    'analysis-hide': ['Sembunyikan analisis draft', '/api/draft-analysis/mode', () => ({ mode: 'hide' })],
    'analysis-auto': ['Analisis draft otomatis (10 hero)', '/api/draft-analysis/mode', () => ({ mode: 'auto' })],
    'lang-id': ['Bahasa overlay: Indonesia', '/api/lang', () => ({ lang: 'id' })],
    'lang-en': ['Bahasa overlay: English', '/api/lang', () => ({ lang: 'en' })],
    'lang-original': ['Bahasa overlay: teks asli', '/api/lang', () => ({ lang: '' })]
};

app.get('/api/companion', (req, res) => {
    const list = [
        ...Object.keys(COMPANION_NOTIF).map(n => ({ group: 'Video notifikasi', path: `/api/companion/notif/${n}`, label: n.toUpperCase() })),
        ...Object.entries(COMPANION_ACTIONS).map(([k, v]) => ({ group: 'Aksi', path: `/api/companion/${k}`, label: v[0] })),
        ...['blue', 'red'].flatMap(s => [['up', '+1'], ['down', '-1']].map(([d, l]) => ({ group: 'Skor series', path: `/api/companion/score/${s}/${d}`, label: `Skor ${s === 'blue' ? 'biru' : 'merah'} ${l}` }))),
        { group: 'Skor series', path: '/api/companion/score/reset', label: 'Reset skor 0-0' },
        ...['blue', 'red'].map(s => ({ group: 'Pemenang game', path: `/api/companion/win/${s}`, label: `${s === 'blue' ? 'BLUE' : 'RED'} WIN` }))
    ];
    res.json(list);
});

app.all(/^\/api\/companion\/(.+)$/, async (req, res) => {
    const parts = req.params[0].split('/').filter(Boolean), q = { ...req.query, ...(req.body || {}) };
    try {
        if (parts[0] === 'notif') {
            const n = COMPANION_NOTIF[parts[1]];
            if (!n) return res.status(404).json({ message: `Notifikasi "${parts[1]}" tidak dikenal.` });
            return res.json(await (await fetch(`http://127.0.0.1:${port}/api/notification`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoId: 'videoPlayer' + n }) })).json());
        }
        if (parts[0] === 'score' || parts[0] === 'win') {
            const md = JSON.parse(JSON.stringify(cache.matchdata || defaultMatchData));
            if (parts[0] === 'win') {
                if (!['blue', 'red'].includes(parts[1])) return res.status(400).json({ message: 'win/blue atau win/red' });
                md.winmatches = parts[1];
            } else if (parts[1] === 'reset') {
                md.teamdata.blueteam.score = '0'; md.teamdata.redteam.score = '0';
            } else {
                const t = md.teamdata[parts[1] === 'blue' ? 'blueteam' : parts[1] === 'red' ? 'redteam' : ''];
                if (!t || !['up', 'down'].includes(parts[2])) return res.status(400).json({ message: 'score/blue/up, score/red/down, score/reset' });
                t.score = String(Math.max(0, (parseInt(t.score, 10) || 0) + (parts[2] === 'up' ? 1 : -1)));
            }
            saveMatchData(md);
            return res.json({ blue: md.teamdata.blueteam.score, red: md.teamdata.redteam.score, winner: md.winmatches });
        }
        const act = COMPANION_ACTIONS[parts[0]];
        if (!act) return res.status(404).json({ message: `Aksi "${parts[0]}" tidak dikenal. Lihat GET /api/companion` });
        const r = await fetch(`http://127.0.0.1:${port}${act[1]}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(act[2](q)) });
        res.status(r.status).json(await r.json());
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- HERO SPLASH ART (Assets/HeroFull) ---
const heroFullDir = path.join(__dirname, 'public/Assets/HeroFull');
app.get('/api/herofull', async (req, res) => {
    try {
        const files = await fs.readdir(heroFullDir);
        res.json(files.filter(f => /\.(png|jpe?g|webp)$/i.test(f)));
    } catch (error) { res.json([]); }
});

// --- LINEUP OVERLAY CONTROL (lineupdisplay.html) ---
// auto = tampil sendiri saat 10 hero sudah terpilih (fase ADJUSTMENT), show / hide = paksa dari control panel
let lineupState = { mode: 'auto' };
app.get('/api/lineup-control', (req, res) => { res.json(lineupState); });
app.post('/api/lineup-control', (req, res) => {
    const mode = req.body.mode;
    if (!['auto', 'show', 'hide'].includes(mode)) return res.status(400).json({ message: 'Mode harus auto, show, atau hide' });
    lineupState = { mode };
    broadcast({ type: 'lineup_control', mode });
    res.json(lineupState);
});

// --- PLAYER NOTIFICATION (eventdisplay.html / notifdisplay.html): First Blood, Turtle/Lord Slain & Stolen ---
// Template tiap event (judul, GIF kosongan, posisi elemen dinamis) di public/database/eventnotif.json — dibaca ulang
// setiap kali dipakai, jadi posisi bisa disetel tanpa restart server.
const eventNotifPath = path.join(dbDir, 'eventnotif.json');
const NOTIF_ROLE = { gold: 'GOLD LANE', junggle: 'JUNGLE', jungle: 'JUNGLE', mid: 'MID LANE', roam: 'ROAM', exp: 'EXP LANE' };
const NOTIF_COLOR = { blue: '#1b5cff', red: '#e3263b' };
let eventNotifSeq = 0;
let eventNotifLast = null;

// multikill: video webm notifikasi sebagai latar + kartu pemain (foto, hero, logo tim) di atasnya.
// Ditambahkan otomatis bila belum ada di eventnotif.json; isi "video" bisa diganti file kosongan buatan sendiri.
const EVENT_NOTIF_MULTIKILL = {
    double_kill: { title: 'DOUBLE KILL', video: 'Assets/notification/doublekill.webm', duration: 4500 },
    triple_kill: { title: 'TRIPLE KILL', video: 'Assets/notification/triplekill.webm', duration: 4500 },
    maniac: { title: 'MANIAC', video: 'Assets/notification/maniac.webm', duration: 4500 },
    savage: { title: 'SAVAGE', video: 'Assets/notification/savage.webm', duration: 4500 },
    wipe_out: { title: 'WIPE OUT', video: 'Assets/notification/wipeout.webm', duration: 4500, team_focus: true }
};
async function eventNotifConfig() {
    let cfg;
    try { cfg = JSON.parse((await fs.readFile(eventNotifPath, 'utf8')).replace(/^﻿/, '')); } catch (e) { cfg = { templates: {} }; }
    cfg.templates = { ...EVENT_NOTIF_MULTIKILL, ...(cfg.templates || {}) };
    return cfg;
}

// nama hero → potret (Assets/HeroPick) dari herolist
function heroImgOf(name) {
    if (!name) return '';
    try {
        const list = JSON.parse(fsSync.readFileSync(herolistPath, 'utf8'));
        const h = list.find(x => heroLoose(x.name) === heroLoose(name) || heroLoose(fileBase(x.img)) === heroLoose(name));
        return h ? h.img : '';
    } catch (e) { return ''; }
}

// "database" pemain untuk notifikasi: nickname, role + logo role, foto (website SSC → Assets/player/<nick>.png → kosong)
function eventNotifPlayers() {
    const md = cache.matchdata || defaultMatchData;
    const hero = heroResolver(); // hero yang sedang dipakai pemain (dari draft / control panel)
    const out = {};
    for (const side of ['blue', 'red']) {
        const key = side === 'blue' ? 'blueteam' : 'redteam';
        const team = (md.teamdata && md.teamdata[key]) || {};
        const roster = (md.ssc && md.ssc.roster && md.ssc.roster[key] && md.ssc.roster[key].players) || [];
        out[side] = {
            side,
            name: team.teamname || '',
            logo_url: team.logo || '',
            color: NOTIF_COLOR[side],
            players: (team.playerlist || []).slice(0, 5).map((p, slot) => {
                const nickname = (p.name || '').trim();
                const low = nickname.toLowerCase();
                const web = low ? roster.find(x => [x.label, x.nick, x.name].some(v => v && v.trim().toLowerCase() === low)) : null;
                const local = nickname && fsSync.existsSync(path.join(__dirname, 'public/Assets/player', `${nickname}.png`)) ? `/Assets/player/${encodeURIComponent(nickname)}.png` : '';
                const role = (p.lane || 'none').toLowerCase();
                return {
                    slot,
                    nickname,
                    role: NOTIF_ROLE[role] ? role : '',
                    role_label: NOTIF_ROLE[role] || '',
                    role_logo_url: NOTIF_ROLE[role] ? `/Assets/lane/${role === 'jungle' ? 'junggle' : role}.png` : '',
                    photo_url: (web && web.foto) || local,
                    hero: hero(p.hero),
                    hero_img: heroImgOf(hero(p.hero))
                };
            })
        };
    }
    return out;
}

app.get('/api/eventnotif/config', async (req, res) => { res.json(await eventNotifConfig()); });
app.get('/api/eventnotif/players', (req, res) => { res.json({ teams: eventNotifPlayers(), last: eventNotifLast }); });

// body: { event, side, slot } → putar notifikasi; { replay: true } → ulang yang terakhir; { stop: true } → hentikan
app.post('/api/eventnotif', async (req, res) => {
    const b = req.body || {};
    if (b.stop) {
        broadcast({ type: 'event_notif_stop' });
        return res.json({ stopped: true });
    }
    let payload;
    if (b.replay) {
        if (!eventNotifLast) return res.status(400).json({ message: 'Belum ada notifikasi untuk diulang.' });
        payload = { ...eventNotifLast, id: ++eventNotifSeq };
    } else {
        const cfg = await eventNotifConfig();
        const tpl = (cfg.templates || {})[b.event];
        if (!tpl) return res.status(400).json({ message: `Event "${b.event}" tidak ada di eventnotif.json` });
        if (b.side !== 'blue' && b.side !== 'red') return res.status(400).json({ message: 'Pilih tim biru / merah.' });
        const team = eventNotifPlayers()[b.side];
        const player = team.players[parseInt(b.slot, 10)];
        if (!player) return res.status(400).json({ message: 'Pemain tidak ditemukan.' });
        payload = {
            id: ++eventNotifSeq,
            event: b.event,
            title: tpl.title,
            side: b.side,
            player,
            team: { name: team.name, logo_url: team.logo_url, color: team.color },
            at: new Date().toISOString()
        };
    }
    if (!b.replay) vodLog(`${payload.title || String(payload.event).toUpperCase()} · ${payload.player.nickname} (${payload.team.name})`, 'event');
    eventNotifLast = payload;
    broadcast({ type: 'event_notif', data: payload });
    res.json(payload);
});

// --- OCR GAMEPLAY (ocrcontrol.html): baca HUD MLBB langsung dari HDMI capture / webcam / layar ---
// Halaman OCR mengirim hasil ke POST /api/ocr/data; scoreboard OCR membaca GET /ocr/MLBB.json
// (format sama dengan FalseOCR: turret1, lord1, gold1, killscore1, timer, killscore2, gold2, turret2, lord2).
const ocrProfilePath = path.join(dbDir, 'ocrprofile.json');
let ocrState = { data: null, at: 0 };

app.get('/ocr/MLBB.json', (req, res) => {
    if (!ocrState.data || Date.now() - ocrState.at > 15000) return res.status(404).json({ error: 'OCR belum berjalan. Buka OCR Control lalu tekan START.' });
    res.json(ocrState.data);
});
// Untuk vMix Data Sources (JSON): selalu 200, kolom selalu lengkap, nilai terakhir dipertahankan saat OCR jeda
// (grafis tidak kosong/error di tengah siaran). Kolom status: LIVE / STALE (>15 dtk tanpa data) / OFF (belum pernah jalan).
const OCR_VMIX_FIELDS = ['turret1', 'lord1', 'gold1', 'killscore1', 'timer', 'killscore2', 'gold2', 'turret2', 'lord2'];
let ocrVmixLast = {};
app.get('/ocr/vmix.json', (req, res) => {
    const age = ocrState.data ? Date.now() - ocrState.at : null;
    const row = {};
    for (const k of OCR_VMIX_FIELDS) row[k] = ocrVmixLast[k] != null ? ocrVmixLast[k] : '';
    for (const [k, v] of Object.entries(ocrVmixLast)) if (!(k in row)) row[k] = v;
    row.status = age == null ? 'OFF' : (age > 15000 ? 'STALE' : 'LIVE');
    res.set('Cache-Control', 'no-store');
    res.json([row]);
});
app.get('/api/ocr/data', (req, res) => { res.json({ data: ocrState.data, age: ocrState.data ? Date.now() - ocrState.at : null }); });
app.post('/api/ocr/data', (req, res) => {
    const b = req.body || {};
    const out = {};
    for (const [k, v] of Object.entries(b)) if (/^[a-z0-9_]{1,24}$/i.test(k)) out[k] = String(v == null ? '' : v).slice(0, 32); // 32: kotak tipe teks (nickname)
    const changed = JSON.stringify(out) !== JSON.stringify(ocrState.data);
    ocrState = { data: out, at: Date.now() };
    Object.assign(ocrVmixLast, out);
    ocrAnalyze(out);
    ocrPlayerGold(out);
    if (changed) broadcast({ type: 'ocr_update', data: out }); // scoreboard OCR langsung diperbarui (tanpa menunggu polling)
    res.json({ ok: true });
});
app.get('/api/ocr/profile', async (req, res) => {
    try { res.json(JSON.parse(await fs.readFile(ocrProfilePath, 'utf8'))); } catch (e) { res.json(null); }
});
app.post('/api/ocr/profile', async (req, res) => {
    await fileQueue.enqueue(() => writeFileSafe(ocrProfilePath, JSON.stringify(req.body || {}, null, 2)));
    res.json({ ok: true });
});

// --- OCR ANALITIK: gold lead + grafik gold, timer Turtle/Lord, notifikasi otomatis (first blood, lord slain, spawn) ---
// Dihitung di server dari setiap data OCR, jadi tetap jalan walau overlay belum dibuka.
// Sisi 1 = tim kiri HUD = tim biru, sisi 2 = tim kanan = tim merah.
const ocrAutoPath = path.join(dbDir, 'ocrauto.json');
const defaultOcrAuto = {
    autoFirstBlood: true,      // video First Blood saat kill pertama game
    autoLordSlain: true,       // video Blue/Red Lord Slain saat angka lord naik
    autoObjectiveSpawn: true,  // video Turtle/Lord Spawn saat waktunya tiba
    multikillHints: true,      // saran Double/Triple/Maniac/Savage di OCR Control (operator yang memutuskan)
    turtleFirst: '2:00', turtleRespawn: '2:00', lordFirst: '8:00', lordRespawn: '2:00',
    warnBefore: 30,            // detik: chip timer menyala sebelum spawn
    multikillWindow: 10,       // detik: kill satu tim dalam rentang ini dihitung beruntun
    fillPlayerGold: false      // kotak OCR gold_b1–b5 / gold_r1–r5 mengisi gold pemain di matchdata
};
let ocrAuto = { ...defaultOcrAuto };
try { ocrAuto = { ...defaultOcrAuto, ...JSON.parse(fsSync.readFileSync(ocrAutoPath, 'utf8')) }; } catch (e) {}

const OCR_VIDEO = { turtleSpawn: 'videoPlayer1', lordSpawn: 'videoPlayer4', lord1: 'videoPlayer5', lord2: 'videoPlayer6', firstBlood: 'videoPlayer7' };
const MULTIKILL = { 2: ['DOUBLE KILL', 'videoPlayer8'], 3: ['TRIPLE KILL', 'videoPlayer9'], 4: ['MANIAC', 'videoPlayer10'], 5: ['SAVAGE / WIPEOUT', 'videoPlayer11'] };
const GOLD_STEP = 5; // detik antar titik grafik gold

const mmss = (v) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(v == null ? '' : v).trim()); return m && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };
const goldNum = (v) => {
    const s = String(v == null ? '' : v).trim();
    const k = /^(\d+(?:\.\d)?)k$/i.exec(s);
    if (k) return Math.round(parseFloat(k[1]) * 1000);
    return /^\d+$/.test(s) ? +s : null;
};

function newOcrGame() {
    return { maxT: 0, lastT: null, cur: null, gold: [], kills: { 1: null, 2: null }, lords: { 1: null, 2: null },
        killLog: { 1: [], 2: [] }, fired: {}, turtleKilledAt: null, lordKilledAt: null, marks: [], hints: [], log: [] };
}
let ocrGame = newOcrGame();

function ocrPlay(videoId, text) {
    broadcast({ type: 'notification_trigger', videoId });
    vodLog(text, 'ocr');
    ocrGame.log.unshift({ at: Date.now(), text });
    ocrGame.log.length = Math.min(ocrGame.log.length, 12);
}

// Jadwal Turtle / Lord pada detik game t
function ocrObjectives(t) {
    if (t == null) return [];
    const g = ocrGame, sec = (v, d) => { const s = mmss(v); return s == null ? mmss(d) : s; };
    const lordFirst = sec(ocrAuto.lordFirst, defaultOcrAuto.lordFirst);
    const out = [];
    const turtleNext = g.turtleKilledAt != null ? g.turtleKilledAt + sec(ocrAuto.turtleRespawn, defaultOcrAuto.turtleRespawn) : sec(ocrAuto.turtleFirst, defaultOcrAuto.turtleFirst);
    if (t < lordFirst && turtleNext < lordFirst) out.push({ id: 'turtle', label: 'TURTLE', spawn: turtleNext, remain: Math.max(0, turtleNext - t) });
    const lordNext = g.lordKilledAt != null ? g.lordKilledAt + sec(ocrAuto.lordRespawn, defaultOcrAuto.lordRespawn) : lordFirst;
    out.push({ id: 'lord', label: 'LORD', spawn: lordNext, remain: Math.max(0, lordNext - t) });
    return out.map(o => ({ ...o, alive: o.remain === 0, warn: o.remain > 0 && o.remain <= (+ocrAuto.warnBefore || 30) }));
}

function ocrAnalyze(d) {
    const t = mmss(d.timer);
    if (t != null && ocrGame.lastT != null && t < ocrGame.maxT - 20) {
        ocrGame = newOcrGame();                                   // timer mundur jauh → game baru
        broadcast({ type: 'ocr_game_reset' });
    }
    const g = ocrGame, prevT = g.lastT;
    if (t != null) { g.lastT = t; g.maxT = Math.max(g.maxT, t); }
    // timer game pertama kali terbaca → chapter VOD di detik 0:00 game (dihitung mundur dari timer)
    if (t != null && !g.fired.vodStart) { g.fired.vodStart = true; vodLog(vodMatchLabel(), 'game', { chapter: true, at: Date.now() - t * 1000 }); }

    // 1. Gold: titik grafik tiap GOLD_STEP detik + nilai terkini
    const g1 = goldNum(d.gold1), g2 = goldNum(d.gold2);
    if (t != null && g1 != null && g2 != null) {
        g.cur = { t, g1, g2 };
        const last = g.gold[g.gold.length - 1];
        if (!last || t - last.t >= GOLD_STEP) g.gold.push({ t, g1, g2 });
    }

    // 2. Kill: first blood otomatis, multikill sebagai saran untuk operator
    const prevK = { ...g.kills };
    for (const s of [1, 2]) { const k = parseInt(d['killscore' + s], 10); if (Number.isFinite(k)) g.kills[s] = k; }
    for (const s of [1, 2]) {
        const delta = prevK[s] == null || g.kills[s] == null ? 0 : g.kills[s] - prevK[s];
        if (delta <= 0 || delta > 5) continue;
        if (!g.fired.firstBlood && prevK[1] === 0 && prevK[2] === 0) {
            g.fired.firstBlood = true;
            g.marks.push({ t: g.lastT, side: s, kind: 'FB' });
            if (ocrAuto.autoFirstBlood) ocrPlay(OCR_VIDEO.firstBlood, `FIRST BLOOD (${s === 1 ? 'biru' : 'merah'})`);
            else vodLog(`FIRST BLOOD (${s === 1 ? 'biru' : 'merah'})`, 'ocr');
        }
        // jendela beruntun memakai waktu game (detik OCR); jam komputer hanya cadangan bila timer belum terbaca
        const now = Date.now(), gameSec = g.lastT != null ? g.lastT : Math.floor(now / 1000), win = +ocrAuto.multikillWindow || 10;
        for (let i = 0; i < delta; i++) g.killLog[s].push(gameSec);
        g.killLog[s] = g.killLog[s].filter(x => x <= gameSec && gameSec - x <= win);
        const n = Math.min(5, g.killLog[s].length);
        if (ocrAuto.multikillHints && MULTIKILL[n]) {
            g.hints = g.hints.filter(h => h.side !== s || now - h.at > win * 1000);  // naikkan saran yang sama (double → triple)
            g.hints.unshift({ id: `${s}-${now}`, side: s, count: n, label: MULTIKILL[n][0], videoId: MULTIKILL[n][1], at: now });
            g.hints.length = Math.min(g.hints.length, 6);
            vodLog(`${MULTIKILL[n][0]} (${s === 1 ? 'biru' : 'merah'})`, 'multikill', { side: s, window: win });
        }
    }

    // 3. Lord: angka lord naik → notifikasi + mulai hitung respawn
    for (const s of [1, 2]) {
        const l = parseInt(d['lord' + s], 10);
        if (!Number.isFinite(l)) continue;
        const prev = g.lords[s];
        g.lords[s] = l;
        if (prev != null && l === prev + 1) {
            g.lordKilledAt = g.lastT;
            g.marks.push({ t: g.lastT, side: s, kind: 'LORD' });
            if (ocrAuto.autoLordSlain) ocrPlay(OCR_VIDEO['lord' + s], `LORD SLAIN (${s === 1 ? 'biru' : 'merah'})`);
            else vodLog(`LORD SLAIN (${s === 1 ? 'biru' : 'merah'})`, 'ocr');
        }
    }

    // 4. Spawn Turtle / Lord: putar video tepat saat waktunya (tidak menyusul bila OCR baru dinyalakan di tengah game)
    if (t != null && prevT != null && t > prevT) {
        for (const o of ocrObjectives(prevT)) {
            const key = `${o.id}@${o.spawn}`;
            if (!g.fired[key] && prevT < o.spawn && t >= o.spawn && t - o.spawn <= 5) {
                g.fired[key] = true;
                if (ocrAuto.autoObjectiveSpawn) ocrPlay(o.id === 'lord' ? OCR_VIDEO.lordSpawn : OCR_VIDEO.turtleSpawn, `${o.label} SPAWN`);
            }
        }
    }
    broadcast({ type: 'ocr_game', data: ocrGameSummary(false) });
}

function ocrGameSummary(withHistory) {
    const g = ocrGame, now = Date.now();
    const s = {
        live: !!ocrState.data && now - ocrState.at <= 15000,
        t: g.lastT, gold: g.cur, lead: g.cur ? g.cur.g1 - g.cur.g2 : null,
        kills: g.kills, lords: g.lords, objectives: ocrObjectives(g.lastT), marks: g.marks,
        hints: g.hints.filter(h => now - h.at < 30000), log: g.log
    };
    if (withHistory) s.history = g.cur && (!g.gold.length || g.gold[g.gold.length - 1].t < g.cur.t) ? [...g.gold, g.cur] : g.gold;
    return s;
}

// gold pemain dari kotak OCR gold_b1–gold_b5 (tim biru) / gold_r1–gold_r5 (tim merah) → matchdata, maks. tiap 3 detik
let ocrGoldAt = 0;
function ocrPlayerGold(d) {
    if (!ocrAuto.fillPlayerGold || Date.now() - ocrGoldAt < 3000) return;
    const md = cache.matchdata;
    if (!md || !md.teamdata) return;
    const next = JSON.parse(JSON.stringify(md));
    let changed = false;
    for (const [s, key] of [['b', 'blueteam'], ['r', 'redteam']]) {
        const list = (next.teamdata[key] || {}).playerlist || [];
        for (let i = 0; i < 5; i++) {
            const g = goldNum(d[`gold_${s}${i + 1}`]);
            if (g == null || !list[i] || +list[i].gold === g) continue;
            list[i].gold = g;
            changed = true;
        }
    }
    if (changed) { ocrGoldAt = Date.now(); saveMatchData(next); }
}

app.get('/api/ocr/game', (req, res) => { res.json(ocrGameSummary(true)); });
app.post('/api/ocr/game/reset', (req, res) => {
    ocrGame = newOcrGame();
    broadcast({ type: 'ocr_game_reset' });
    res.json({ ok: true });
});
app.get('/api/ocr/auto', (req, res) => { res.json({ config: ocrAuto, defaults: defaultOcrAuto }); });
app.post('/api/ocr/auto', async (req, res) => {
    const b = req.body || {}, next = { ...ocrAuto };
    for (const k of ['autoFirstBlood', 'autoLordSlain', 'autoObjectiveSpawn', 'multikillHints', 'fillPlayerGold']) if (typeof b[k] === 'boolean') next[k] = b[k];
    for (const k of ['turtleFirst', 'turtleRespawn', 'lordFirst', 'lordRespawn']) {
        if (b[k] == null) continue;
        if (mmss(b[k]) == null) return res.status(400).json({ message: `${k} harus berformat m:ss, contoh 2:00` });
        next[k] = String(b[k]).trim();
    }
    for (const [k, lo, hi] of [['warnBefore', 5, 120], ['multikillWindow', 3, 30]]) {
        if (b[k] == null) continue;
        const n = parseInt(b[k], 10);
        if (!(n >= lo && n <= hi)) return res.status(400).json({ message: `${k} harus ${lo}-${hi} detik` });
        next[k] = n;
    }
    ocrAuto = next;
    await fileQueue.enqueue(() => writeFileSafe(ocrAutoPath, JSON.stringify(ocrAuto, null, 2)));
    broadcast({ type: 'ocr_game', data: ocrGameSummary(false) });
    res.json({ config: ocrAuto });
});

// --- FORMAT SERI (BO): skor overlay draft tampil sebagai garis kemenangan (ref. CLD / Arcadia) ---
// bo = 0 → skor angka seperti semula; 1/3/5/7 → jumlah garis = kemenangan yang dibutuhkan
const matchFormatPath = path.join(dbDir, 'matchformat.json');
let matchFormat = { bo: 3 };
try { matchFormat = { ...matchFormat, ...JSON.parse(fsSync.readFileSync(matchFormatPath, 'utf8')) }; } catch (e) {}
app.get('/api/match-format', (req, res) => { res.json(matchFormat); });
app.post('/api/match-format', (req, res) => {
    const bo = parseInt(req.body && req.body.bo, 10);
    if (![0, 1, 3, 5, 7].includes(bo)) return res.status(400).json({ message: 'bo harus 0, 1, 3, 5, atau 7' });
    matchFormat = { bo };
    fileQueue.enqueue(() => writeFileSafe(matchFormatPath, JSON.stringify(matchFormat, null, 2)));
    broadcast({ type: 'matchformat_update', data: matchFormat });
    res.json(matchFormat);
});

// --- IN-GAME OVERLAY (ingamedisplay.html): banner MVP & badge HIGHLIGHTS ---
// mvp.side + mvp.slot = pemain ke-(slot+1) tim biru / merah; hero diambil dari pick di slot yang sama
let ingameState = { mvp: { show: false, side: 'blue', slot: 0 }, highlights: { show: false } };
app.get('/api/ingame', (req, res) => { res.json(ingameState); });
app.post('/api/ingame', (req, res) => {
    const b = req.body || {};
    const mvp = { ...ingameState.mvp };
    const highlights = { ...ingameState.highlights };
    if (b.mvp) {
        if (typeof b.mvp.show === 'boolean') mvp.show = b.mvp.show;
        if (b.mvp.side === 'blue' || b.mvp.side === 'red') mvp.side = b.mvp.side;
        const slot = parseInt(b.mvp.slot, 10);
        if (slot >= 0 && slot <= 4) mvp.slot = slot;
    }
    if (b.highlights && typeof b.highlights.show === 'boolean') highlights.show = b.highlights.show;
    ingameState = { mvp, highlights };
    broadcast({ type: 'ingame_update', state: ingameState });
    res.json(ingameState);
});

// ==========================================
// 7b. SSC2027.ID SYNC (Data Live feed → matchdata)
// ==========================================
// Membaca dataset "lineup" dari feed.php ssc2027.id (hanya-baca, link rahasia ?t=TOKEN) untuk meja/ruangan
// yang sedang di-streaming, lalu mengisi nama tim, logo & nickname pemain di matchdata. Feed baru diambil ulang
// bila live/rev.json kanal "match" / "att" berubah (atau paling lama tiap 20 detik).
const sscConfigPath = path.join(__dirname, 'ssc_config.json');
const sscLogoDir = path.join(__dirname, 'public/Assets/costum/ssc');
const sscMockPath = path.join(__dirname, 'mock/ssc-mock.json');
const defaultSscConfig = { enabled: false, feedUrl: '', game: 'ML', station: 'Ruangan 1', homeSide: 'blue', lock: false, interval: 1000 };

let sscConfig = { ...defaultSscConfig };
try { sscConfig = { ...defaultSscConfig, ...JSON.parse(fsSync.readFileSync(sscConfigPath, 'utf8')) }; } catch (e) {}

let sscState = { status: 'idle', lastCheck: null, lastSync: null, error: null, rev: null, lastFetch: 0, signature: null, lineup: null };
let sscBusy = false;
let sscTimer = null;
let sscLastBroadcast = '';

function sscPublicState() {
    const { rev, lastFetch, signature, ...rest } = sscState;
    return rest;
}

// kabari Hub hanya bila status benar-benar berubah (pengecekan tiap detik tidak membanjiri semua overlay)
function sscBroadcast(force) {
    const { lastCheck, ...rest } = sscPublicState();
    const key = JSON.stringify(rest);
    if (!force && key === sscLastBroadcast) return;
    sscLastBroadcast = key;
    broadcast({ type: 'ssc_status', state: sscPublicState() });
}

function sscUrls() {
    const feed = new URL(sscConfig.feedUrl);
    const lineup = new URL(feed.href);
    lineup.searchParams.set('data', 'lineup');
    if (sscConfig.game) lineup.searchParams.set('c', sscConfig.game);
    if (sscConfig.station) lineup.searchParams.set('meja', sscConfig.station);
    lineup.searchParams.delete('format');
    const rev = new URL('live/rev.json', feed.href);
    return { lineup, rev };
}

async function sscFetchJson(url, timeoutMs) {
    const u = new URL(url.href);
    u.searchParams.set('_', Date.now());
    const response = await fetch(u, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
        let msg = `HTTP ${response.status}`;
        try { const j = await response.json(); if (j && j.error) msg += ` - ${j.error}`; } catch (e) {}
        throw new Error(msg);
    }
    return response.json();
}

// Logo diunduh sekali ke Assets/costum/ssc/ agar overlay tetap tampil walau internet sempat putus
async function sscCacheLogo(url) {
    if (!url) return '';
    try {
        const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
        const existing = fsSync.existsSync(sscLogoDir) ? (await fs.readdir(sscLogoDir)).find(f => f.startsWith(hash + '.')) : null;
        if (existing) return `/Assets/costum/ssc/${existing}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const type = response.headers.get('content-type') || '';
        const ext = type.includes('jpeg') ? 'jpg' : type.includes('webp') ? 'webp' : type.includes('svg') ? 'svg' : 'png';
        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.mkdir(sscLogoDir, { recursive: true });
        await fs.writeFile(path.join(sscLogoDir, `${hash}.${ext}`), buffer);
        return `/Assets/costum/ssc/${hash}.${ext}`;
    } catch (error) {
        console.error('SSC logo cache error:', error.message);
        return url; // tetap pakai URL asli
    }
}

// URL dataset lain dari link Data Live yang sama (mis. "pemain", "mvp", "sponsor")
function sscDatasetUrl(ds, params) {
    const u = new URL(sscConfig.feedUrl);
    u.searchParams.set('data', ds);
    u.searchParams.delete('format');
    for (const [k, v] of Object.entries(params || {})) if (v) u.searchParams.set(k, v);
    return u;
}

// Foto pemain (dataset "pemain": foto_url + ada_foto) → p.foto berisi path lokal; pemain tanpa foto dibiarkan kosong
// (website memberi siluet abu-abu untuk mereka, overlay memakai tampilan tanpa foto)
async function sscAttachPhotos(teamName, players) {
    if (!teamName || !players.length) return;
    try {
        const rows = await sscFetchJson(sscDatasetUrl('pemain', { c: sscConfig.game, q: teamName }), 8000);
        const mine = (Array.isArray(rows) ? rows : []).filter(r => (r.tim || '').trim() === teamName);
        for (const p of players) {
            const r = mine.find(x => (x.nama || '').trim() === p.name) || mine.find(x => p.nick && (x.nickname || '').trim() === p.nick);
            p.foto = r && r.ada_foto === 'ya' && r.foto_url ? await sscCacheLogo(r.foto_url) : '';
        }
    } catch (error) {
        console.error('SSC foto pemain:', error.message);
    }
}

// 5 pemain utama (tanpa tanda "(C)" = cadangan); bila kurang dari 5, diisi cadangan
function sscPlayers(row, side) {
    const starters = [], subs = [];
    for (let i = 1; i <= 7; i++) {
        const raw = (row[`${side}_${i}`] || '').trim();
        if (!raw) continue;
        const isSub = / \(C\)$/.test(raw);
        const nick = (row[`${side}_${i}_nick`] || '').trim();
        const label = nick || raw.replace(/ \(C\)$/, '');
        (isSub ? subs : starters).push({ label, name: raw.replace(/ \(C\)$/, ''), nick, sub: isSub });
    }
    return { starters: starters.concat(subs).slice(0, 5), all: starters.concat(subs) };
}

async function sscApply(row) {
    const md = JSON.parse(JSON.stringify(cache.matchdata || defaultMatchData));
    if (!md.teamdata) md.teamdata = JSON.parse(JSON.stringify(defaultMatchData.teamdata));
    const map = sscConfig.homeSide === 'red' ? { home: 'redteam', away: 'blueteam' } : { home: 'blueteam', away: 'redteam' };
    const roster = {};

    for (const [side, key] of Object.entries(map)) {
        const team = md.teamdata[key];
        if (row[`${side}_tim`]) team.teamname = row[`${side}_tim`];
        if (row[`${side}_logo_url`]) team.logo = await sscCacheLogo(row[`${side}_logo_url`]);
        if (!Array.isArray(team.playerlist)) team.playerlist = [];
        const players = sscPlayers(row, side);
        await sscAttachPhotos(row[`${side}_tim`], players.all);
        for (let i = 0; i < 5; i++) {
            if (!team.playerlist[i]) team.playerlist[i] = { name: '', lane: 'none', hero: '', banhero: '', level: 0, gold: 0, KDA: '0/0/0', spell: '', itemlist: ['idle', 'idle', 'idle', 'idle', 'idle', 'idle'] };
            team.playerlist[i].name = players.starters[i] ? players.starters[i].label : '';
        }
        roster[key] = { school: row[`${side}_sekolah`] || '', players: players.all };
    }

    md.ssc = { cabang: row.cabang || '', babak: row.babak || '', meja: row.meja || '', status: row.status || '', roster, syncedAt: new Date().toISOString() };
    saveMatchData(md);
    sscState.lastSync = Date.now();
}

async function sscCheck(force) {
    if (sscBusy) return;
    sscBusy = true;
    try {
        const urls = sscUrls();
        sscState.lastCheck = Date.now();

        let revKey = null;
        try {
            const rev = await sscFetchJson(urls.rev, 4000);
            revKey = `${rev.match || 0}|${rev.att || 0}`;
        } catch (e) { revKey = null; } // tanpa sinyal: andalkan batas 20 detik

        const stale = Date.now() - sscState.lastFetch > 20000;
        if (!force && revKey !== null && revKey === sscState.rev && !stale) return;

        const rows = await sscFetchJson(urls.lineup, 6000);
        sscState.rev = revKey;
        sscState.lastFetch = Date.now();
        sscState.error = null;
        const row = Array.isArray(rows) && rows.length ? rows[0] : null;
        sscState.lineup = row;

        if (!row) {
            sscState.status = 'empty';
        } else {
            const signature = JSON.stringify(row);
            if (sscConfig.lock && !force) {
                sscState.status = 'locked';
            } else if (force || signature !== sscState.signature) {
                sscState.signature = signature;
                await sscApply(row);
                sscState.status = 'synced';
            } else {
                sscState.status = 'synced';
            }
        }
    } catch (error) {
        sscState.status = 'error';
        sscState.error = error.message;
    } finally {
        sscBusy = false;
        sscBroadcast(force);
    }
}

function sscLoop() {
    clearTimeout(sscTimer);
    const run = async () => {
        if (sscConfig.enabled && sscConfig.feedUrl) await sscCheck(false);
        sscTimer = setTimeout(run, Math.max(500, Number(sscConfig.interval) || 1000));
    };
    run();
}

app.get('/api/ssc', (req, res) => { res.json({ config: sscConfig, state: sscPublicState() }); });

app.post('/api/ssc/config', async (req, res) => {
    const b = req.body || {};
    const next = { ...sscConfig };
    if (typeof b.feedUrl === 'string') next.feedUrl = b.feedUrl.trim();
    if (typeof b.game === 'string') next.game = b.game.trim().toUpperCase();
    if (typeof b.station === 'string') next.station = b.station.trim();
    if (b.homeSide === 'blue' || b.homeSide === 'red') next.homeSide = b.homeSide;
    if (typeof b.enabled === 'boolean') next.enabled = b.enabled;
    if (typeof b.lock === 'boolean') next.lock = b.lock;
    if (b.interval !== undefined) next.interval = Math.min(10000, Math.max(500, parseInt(b.interval, 10) || 1000));

    if (next.feedUrl) {
        try { new URL(next.feedUrl); } catch (e) { return res.status(400).json({ message: 'Link feed tidak valid.' }); }
    }

    const sourceChanged = ['feedUrl', 'game', 'station', 'homeSide'].some(k => next[k] !== sscConfig[k]);
    sscConfig = next;
    await fileQueue.enqueue(() => writeFileSafe(sscConfigPath, JSON.stringify(sscConfig, null, 2)));
    if (sourceChanged) { sscState.rev = null; sscState.signature = null; sscState.lineup = null; }
    if (!sscConfig.enabled) sscState.status = 'idle';
    sscBroadcast(true);
    if (sscConfig.enabled && sscConfig.feedUrl && sourceChanged) sscCheck(false);
    res.json({ config: sscConfig, state: sscPublicState() });
});

// Sync paksa (tetap jalan walau "lock" aktif): menimpa nama tim, logo & nickname dengan data website
app.post('/api/ssc/sync', async (req, res) => {
    if (!sscConfig.feedUrl) return res.status(400).json({ message: 'Isi link Data Live dulu.' });
    await sscCheck(true);
    res.status(sscState.status === 'error' ? 502 : 200).json({ config: sscConfig, state: sscPublicState() });
});

// --- DAFTAR TIM (dataset "tim") untuk tabel di control panel: pilih tim → langsung masuk ke sisi biru / merah ---
let sscTeamsCache = { key: '', at: 0, teams: [] };

function sscTeamFromRow(r) {
    const players = [];
    for (let i = 1; i <= 6; i++) {
        const name = (r[`pemain_${i}`] || '').trim();
        if (name) players.push({ name, nick: (r[`pemain_${i}_nick`] || '').trim(), sub: false });
    }
    for (let i = 1; i <= 2; i++) {
        const name = (r[`cadangan_${i}`] || '').trim();
        if (name) players.push({ name, nick: (r[`cadangan_${i}_nick`] || '').trim(), sub: true });
    }
    players.forEach(p => { p.label = p.nick || p.name; });
    return { tim: (r.tim || '').trim(), sekolah: r.sekolah || '', cabang: r.cabang || '', logo_url: r.logo_url || '', kapten: r.kapten || '', official: r.official || '', players };
}

async function sscTeams(force) {
    if (!sscConfig.feedUrl) throw new Error('Isi link Data Live di Hub › SSC2027 SYNC dulu.');
    const u = new URL(sscConfig.feedUrl);
    u.searchParams.set('data', 'tim');
    if (sscConfig.game) u.searchParams.set('c', sscConfig.game);
    u.searchParams.delete('format');
    if (!force && sscTeamsCache.key === u.href && Date.now() - sscTeamsCache.at < 15000) return sscTeamsCache.teams;
    const rows = await sscFetchJson(u, 8000);
    const teams = (Array.isArray(rows) ? rows : []).map(sscTeamFromRow).filter(t => t.tim);
    sscTeamsCache = { key: u.href, at: Date.now(), teams };
    return teams;
}

app.get('/api/ssc/teams', async (req, res) => {
    try {
        const teams = await sscTeams(req.query.refresh === '1');
        res.json({ game: sscConfig.game, lock: sscConfig.lock, teams });
    } catch (error) { res.status(502).json({ message: error.message }); }
});

// Pilihan manual dari tabel otomatis menyalakan Lock, supaya Auto sync tidak menimpanya
app.post('/api/ssc/assign', async (req, res) => {
    const b = req.body || {};
    const key = b.side === 'blue' ? 'blueteam' : b.side === 'red' ? 'redteam' : null;
    if (!key || !b.team) return res.status(400).json({ message: 'Pilih tim dan sisi (biru/merah).' });
    try {
        let t = (await sscTeams(false)).find(x => x.tim === b.team);
        if (!t) t = (await sscTeams(true)).find(x => x.tim === b.team);
        if (!t) return res.status(404).json({ message: `Tim "${b.team}" tidak ditemukan di website.` });

        const players = t.players.map(p => ({ ...p }));
        await sscAttachPhotos(t.tim, players);

        const md = JSON.parse(JSON.stringify(cache.matchdata || defaultMatchData));
        if (!md.teamdata) md.teamdata = JSON.parse(JSON.stringify(defaultMatchData.teamdata));
        const team = md.teamdata[key];
        team.teamname = t.tim;
        team.logo = t.logo_url ? await sscCacheLogo(t.logo_url) : '';
        if (!Array.isArray(team.playerlist)) team.playerlist = [];
        const starters = t.players.filter(p => !p.sub).concat(t.players.filter(p => p.sub)).slice(0, 5);
        for (let i = 0; i < 5; i++) {
            if (!team.playerlist[i]) team.playerlist[i] = { name: '', lane: 'none', hero: '', banhero: '', level: 0, gold: 0, KDA: '0/0/0', spell: '', itemlist: ['idle', 'idle', 'idle', 'idle', 'idle', 'idle'] };
            team.playerlist[i].name = starters[i] ? starters[i].label : '';
        }
        const ssc = md.ssc || {};
        md.ssc = { ...ssc, cabang: t.cabang || ssc.cabang || '', roster: { ...(ssc.roster || {}), [key]: { school: t.sekolah, players } }, syncedAt: new Date().toISOString() };
        saveMatchData(md);

        if (!sscConfig.lock) {
            sscConfig.lock = true;
            await fileQueue.enqueue(() => writeFileSafe(sscConfigPath, JSON.stringify(sscConfig, null, 2)));
            if (sscConfig.enabled) sscState.status = 'locked';
        }
        sscBroadcast(true);
        res.json({ ok: true, side: b.side, team: t.tim, lock: sscConfig.lock });
    } catch (error) { res.status(502).json({ message: error.message }); }
});

// MVP terbaru yang diinput panitia di website (dataset "mvp"), untuk tombol "MVP dari Website" di control panel
app.get('/api/ssc/mvp', async (req, res) => {
    if (!sscConfig.feedUrl) return res.status(400).json({ message: 'Isi link Data Live di Hub › SSC2027 SYNC dulu.' });
    try {
        const rows = await sscFetchJson(sscDatasetUrl('mvp', { c: sscConfig.game, top: '5' }), 8000);
        res.json({ rows: Array.isArray(rows) ? rows : [] });
    } catch (error) { res.status(502).json({ message: error.message }); }
});

// Logo sponsor (dataset "sponsor") untuk banner MVP; logo disimpan lokal, daftar di-cache 5 menit
let sscSponsorCache = { key: '', at: 0, list: [] };
app.get('/api/ssc/sponsors', async (req, res) => {
    if (!sscConfig.feedUrl) return res.json({ list: [] });
    try {
        const u = sscDatasetUrl('sponsor');
        if (sscSponsorCache.key !== u.href || Date.now() - sscSponsorCache.at > 300000) {
            const rows = await sscFetchJson(u, 8000);
            const list = [];
            for (const r of Array.isArray(rows) ? rows : []) {
                if (r.logo_url) list.push({ nama: r.nama || '', logo: await sscCacheLogo(r.logo_url) });
            }
            sscSponsorCache = { key: u.href, at: Date.now(), list };
        }
        res.json({ list: sscSponsorCache.list });
    } catch (error) { res.json({ list: sscSponsorCache.list, error: error.message }); }
});

// --- FEED TIRUAN (format persis feed.php ssc2027.id) untuk uji tanpa menyentuh database website ---
// Ubah mock/ssc-mock.json → rev.json ikut berubah → SSC Sync mengambil data baru.
app.get('/mock-ssc/feed.php', async (req, res) => {
    try {
        const mock = JSON.parse((await fs.readFile(sscMockPath, 'utf8')).replace(/^﻿/, '')); // BOM dari Notepad
        const ds = req.query.data || '';
        if (!ds) return res.json({ ok: true, event: 'MOCK', dataset: Object.keys(mock).map(k => ({ data: k })) });
        let rows = Array.isArray(mock[ds]) ? mock[ds] : [];
        if (ds === 'lineup') {
            if (req.query.c) rows = rows.filter(r => !r.cabang_kode || r.cabang_kode === String(req.query.c).toUpperCase());
            if (req.query.meja) rows = rows.filter(r => r.meja === req.query.meja);
            rows = rows.slice(0, 1).map(({ cabang_kode, ...r }) => r);
        } else if (ds === 'tim' || ds === 'pemain' || ds === 'mvp') {
            if (req.query.c) rows = rows.filter(r => !r.cabang_kode || r.cabang_kode === String(req.query.c).toUpperCase());
            if (req.query.q) rows = rows.filter(r => (r.tim || '').toLowerCase().includes(String(req.query.q).toLowerCase()));
            rows = rows.map(({ cabang_kode, ...r }) => r);
        }
        res.json(rows);
    } catch (error) { res.status(500).json({ ok: false, error: 'mock/ssc-mock.json tidak bisa dibaca: ' + error.message }); }
});
app.get('/mock-ssc/live/rev.json', async (req, res) => {
    try {
        const stat = await fs.stat(sscMockPath);
        const ms = Math.round(stat.mtimeMs);
        res.json({ att: ms, match: ms, cfg: ms, t: {} });
    } catch (error) { res.json({}); }
});

// --- IP MANAGEMENT API ---
app.get('/api/ips', (req, res) => {
    const nets = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                ips.push({ name: name, ip: net.address });
            }
        }
    }
    res.json(ips);
});

app.post('/api/set-ip', (req, res) => {
    try {
        const newIp = req.body.ip;
        fsSync.writeFileSync(path.join(__dirname, 'public/serverip.txt'), newIp);
        res.json({ message: 'IP updated to ' + newIp });
    } catch (error) { 
        res.status(500).json({ message: 'Error saving IP' }); 
    }
});

// ==========================================
// 8. START SERVER
// ==========================================
const port = 3000;
const ipFilePath = path.join(__dirname, 'public/serverip.txt');

let localIp = getLocalIp(); 
if (fsSync.existsSync(ipFilePath)) {
    const savedIp = fsSync.readFileSync(ipFilePath, 'utf8').trim();
    if (savedIp) localIp = savedIp;
}

server.listen(port, async () => {
    console.log('=============================================');
    console.log(` SERVER STARTED (ARPRO ESPORT TOOLS V5) `);
    console.log(` Local:   http://localhost:${port}`);
    console.log(` Network: http://${localIp}:${port}`);
    console.log(` Status:  Cache & Async Queue Active! `);
    console.log('=============================================');

    try { await fs.writeFile(ipFilePath, localIp); } catch (error) {}

    sscLoop();
    if (sscConfig.enabled) console.log(` SSC Sync: ON (${sscConfig.station} · ${sscConfig.game})`);
});