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
        cache.matchdraft = req.body;
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
    return { id: crypto.randomBytes(5).toString('hex'), at: new Date().toISOString(), game: +md.game_number || null,
        duration: md.game_duration || '', winner: md.winmatches, blue: side('blueteam'), red: side('redteam'), mvp };
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
                if (!players.has(pk)) players.set(pk, { name: p.name, team: s.name, games: 0, wins: 0, k: 0, d: 0, a: 0, gold: 0, mvp: 0, heroes: {} });
                const pl = players.get(pk);
                pl.team = s.name; pl.games++; if (won) pl.wins++;
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
        players: [...players.values()].map(p => ({ ...p, heroes: top(p.heroes, 3), kda: (p.k + p.a) / Math.max(1, p.d),
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
    res.json({ name: tournament.name, groups: tournament.groups, bracket: tournament.bracket, matchFormat: matchFormat,
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
    tournament.games.push(g);
    saveTournament();
    res.json({ updated: false, message: `Tersimpan: ${g.blue.name} vs ${g.red.name}${g.game ? ' · game ' + g.game : ''} (${g.winner === 'blue' ? g.blue.name : g.red.name} menang).`, total: tournament.games.length });
});
app.post('/api/tournament/game/delete', (req, res) => {
    const before = tournament.games.length;
    tournament.games = tournament.games.filter(g => g.id !== (req.body || {}).id);
    if (tournament.games.length === before) return res.status(404).json({ message: 'Game tidak ditemukan.' });
    saveTournament();
    res.json({ total: tournament.games.length });
});
app.post('/api/tournament/settings', (req, res) => {
    const b = req.body || {};
    if (typeof b.name === 'string') tournament.name = b.name.trim().slice(0, 80);
    if (b.groups && typeof b.groups === 'object') {
        tournament.groups = {};
        for (const [team, grp] of Object.entries(b.groups)) if (tName(team) && tName(grp)) tournament.groups[tName(team)] = tName(grp).slice(0, 20);
    }
    saveTournament();
    res.json({ name: tournament.name, groups: tournament.groups });
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
    'ocr-reset': ['Reset data game OCR (gold / timer)', '/api/ocr/game/reset', () => ({})]
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

async function eventNotifConfig() {
    try { return JSON.parse((await fs.readFile(eventNotifPath, 'utf8')).replace(/^﻿/, '')); } catch (e) { return { templates: {} }; }
}

// "database" pemain untuk notifikasi: nickname, role + logo role, foto (website SSC → Assets/player/<nick>.png → kosong)
function eventNotifPlayers() {
    const md = cache.matchdata || defaultMatchData;
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
                    photo_url: (web && web.foto) || local
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
    for (const [k, v] of Object.entries(b)) if (/^[a-z0-9_]{1,24}$/i.test(k)) out[k] = String(v == null ? '' : v).slice(0, 16);
    const changed = JSON.stringify(out) !== JSON.stringify(ocrState.data);
    ocrState = { data: out, at: Date.now() };
    Object.assign(ocrVmixLast, out);
    ocrAnalyze(out);
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
    multikillWindow: 10        // detik: kill satu tim dalam rentang ini dihitung beruntun
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

app.get('/api/ocr/game', (req, res) => { res.json(ocrGameSummary(true)); });
app.post('/api/ocr/game/reset', (req, res) => {
    ocrGame = newOcrGame();
    broadcast({ type: 'ocr_game_reset' });
    res.json({ ok: true });
});
app.get('/api/ocr/auto', (req, res) => { res.json({ config: ocrAuto, defaults: defaultOcrAuto }); });
app.post('/api/ocr/auto', async (req, res) => {
    const b = req.body || {}, next = { ...ocrAuto };
    for (const k of ['autoFirstBlood', 'autoLordSlain', 'autoObjectiveSpawn', 'multikillHints']) if (typeof b[k] === 'boolean') next[k] = b[k];
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