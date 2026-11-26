@echo off
setlocal
title ARPRO - Buat ZIP untuk PC Kantor
color 5

:: buat-zip.bat - membuat ZIP aplikasi untuk dikirim ke PC lain (WA / SSD), hasil di Desktop.
:: [1] UPDATE      : data pertandingan (public\database), ssc_config.json & salinan foto SSC TIDAK ikut,
::                   jadi data & pengaturan di PC kantor tidak berubah. Data hero (herolist, items, dll) ikut.
:: [2] PASANG BARU : untuk PC yang belum ada aplikasinya, semua ikut (termasuk ssc_config.json berisi link feed).
:: Tidak pernah ikut: .git, bahan development, foto asli, video _original, github_config.json, serverip.txt, output.
:: Tanpa menu: buat-zip.bat 1  /  buat-zip.bat 2

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "NAME=ARPRO MLBB Overlaytool V5"

echo.
echo ====================================================================
echo   BUAT ZIP APLIKASI UNTUK DIKIRIM KE PC KANTOR
echo ====================================================================
echo.
echo   [1] UPDATE      - PC kantor sudah ada aplikasinya.
echo                     Data pertandingan, jadwal, tema, pengaturan SSC
echo                     dan foto pemain di PC kantor TIDAK berubah.
echo   [2] PASANG BARU - PC belum ada aplikasinya (semua data ikut).
echo.

set "PILIH=%~1"
if "%PILIH%"=="" (
    choice /c 12 /n /m "Pilih 1 atau 2: "
    if errorlevel 2 (set "PILIH=2") else (set "PILIH=1")
)
if "%PILIH%"=="2" (set "MODE=pasang-baru") else (set "MODE=update")

for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "OUTDIR=%%d"
if defined ARPRO_ZIP_OUT set "OUTDIR=%ARPRO_ZIP_OUT%"
for /f "usebackq delims=" %%t in (`powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmm"`) do set "STAMP=%%t"
set "OUT=%OUTDIR%\ARPRO-Overlay-%MODE%-%STAMP%.zip"
set "STAGE=%TEMP%\arpro-zip"
set "DEST=%STAGE%\%NAME%"

echo.
echo [1/3] Menyalin file (mode %MODE%)...
if exist "%STAGE%" rmdir /s /q "%STAGE%"

set XD="%ROOT%\.git" "%ROOT%\.claude" "%ROOT%\.vscode" "%ROOT%\bahan re engine" "%ROOT%\bahan re-engine" "%ROOT%\Revisi Splash Tool" "%ROOT%\_original_player_photos" "%ROOT%\Logo Sponsor" "%ROOT%\output" "%ROOT%\public\Assets\Hero_Animation\_original"
set XF="%ROOT%\Hasil jawaban AI All Request.docx" "%ROOT%\Berhasil" "%ROOT%\Ditemukan" "%ROOT%\github_config.json" "%ROOT%\public\serverip.txt" "~$*" "*.tmp" "*.log" "Thumbs.db" "desktop.ini" "*.zip"
if "%MODE%"=="update" set XD=%XD% "%ROOT%\public\database" "%ROOT%\public\Assets\costum\ssc"
if "%MODE%"=="update" set XF=%XF% "%ROOT%\ssc_config.json"

robocopy "%ROOT%" "%DEST%" /E /XD %XD% /XF %XF% /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto gagal

:: mode update: hanya data hero / aplikasi dari public\database (bukan data pertandingan)
if "%MODE%"=="update" (
    robocopy "%ROOT%\public\database" "%DEST%\public\database" herolist.json herostats.json herometa.json items.json mlbbids.json flag.json flags.json /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
    if errorlevel 8 goto gagal
)

echo [2/3] Membuat ZIP...
if exist "%OUT%" del /q "%OUT%"
pushd "%STAGE%"
"%SystemRoot%\System32\tar.exe" -a -c -f "%OUT%" "%NAME%"
set "TARERR=%errorlevel%"
popd
if not "%TARERR%"=="0" goto gagal

echo [3/3] Membersihkan file sementara...
rmdir /s /q "%STAGE%"

for /f "usebackq delims=" %%s in (`powershell -NoProfile -Command "'{0:N0} MB' -f ((Get-Item -LiteralPath $env:OUT).Length / 1MB)"`) do set "SIZE=%%s"
echo.
echo ====================================================================
echo   SELESAI: %OUT%
echo   Ukuran : %SIZE%
echo ====================================================================
echo.
echo   Di PC kantor:
echo   1. Tutup server (jendela ARPROESPORTTOOLS).
echo   2. Extract ZIP, buka folder "%NAME%" di dalamnya.
echo   3. Salin SEMUA isinya ke folder aplikasi di PC kantor,
echo      pilih "Replace / Ganti file". Jangan hapus folder lama.
echo   4. Jalankan lagi ARPROESPORTTOOLS.BAT.
if "%MODE%"=="pasang-baru" echo.
if "%MODE%"=="pasang-baru" echo   ZIP ini berisi link rahasia feed SSC dan foto pemain: kirim lewat chat pribadi / SSD.
echo.
if "%~1"=="" explorer /select,"%OUT%"
if "%~1"=="" pause
exit /b 0

:gagal
echo.
echo [GAGAL] ZIP tidak berhasil dibuat. Pastikan ruang disk cukup dan file tidak sedang dibuka.
if exist "%STAGE%" rmdir /s /q "%STAGE%"
if "%~1"=="" pause
exit /b 1
