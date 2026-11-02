@echo off
setlocal
cd /d "%~dp0"
start "PO Checker server" /min cmd /c "npm start"
set "URL=http://127.0.0.1:4174"
for /l %%i in (1,1,60) do (
  powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing '%URL%/api/status' -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 goto ready
  timeout /t 1 /nobreak >nul
)
echo PO Checker did not become ready. Check the server window.
pause
exit /b 1
:ready
start "" "%URL%"
endlocal
