/*!
 * ARPRO MLBB Overlay Tool & OCR
 * (c) 2026 CV. Arindra Production & ARPRO Esport
 * Released under the MIT License: https://github.com/rezaarindra/ARPRO-MLBB-Overlaytool-OCR-Tools
 */
// apply-ssc-theme.js — memasang tema SSC 2027 (ssc-theme.css + ssc-control.css + ssc-control.js) di halaman control.
// Dipasang tepat sebelum </head> agar menimpa gaya halaman. Aman dijalankan berulang.
//   node tools/apply-ssc-theme.js control.html notifcontrol.html ...
const fs = require('fs');
const path = require('path');
const MARK = '<!-- tema SSC 2027 (Design.md) -->';
const BLOCK = `    ${MARK}\n    <link rel="stylesheet" href="/ssc-theme.css">\n    <link rel="stylesheet" href="/ssc-control.css">\n    <script src="/script/ssc-control.js"></script>\n`;
for (const f of process.argv.slice(2)) {
    const p = path.join(__dirname, '..', 'public', f);
    let s = fs.readFileSync(p, 'utf8');
    if (s.includes(MARK)) { console.log('sudah:', f); continue; }
    const i = s.search(/<\/head>/i);
    if (i < 0) { console.log('TIDAK ADA </head>:', f); continue; }
    const eol = s.includes('\r\n') ? '\r\n' : '\n';
    s = s.slice(0, i) + BLOCK.replace(/\n/g, eol) + s.slice(i);
    fs.writeFileSync(p, s);
    console.log('terpasang:', f);
}
