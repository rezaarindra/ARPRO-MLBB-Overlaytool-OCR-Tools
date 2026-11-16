@echo off
:: Build ARPRO-OCR-Observer.exe memakai C# compiler bawaan Windows (.NET Framework 4, tidak perlu install apa pun)
cd /d "%~dp0"
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe
if not exist "%CSC%" (
    echo [GAGAL] C# compiler .NET Framework 4 tidak ditemukan.
    exit /b 1
)
"%CSC%" /nologo /target:winexe /optimize+ /win32icon:observer.ico /out:ARPRO-OCR-Observer.exe /r:System.Windows.Forms.dll /r:System.Drawing.dll Program.cs
if errorlevel 1 (
    echo [GAGAL] Build gagal.
    exit /b 1
)
echo [OK] ARPRO-OCR-Observer.exe siap. Unduh dari tool: http://IP-SERVER:3000/download/ocr-observer
