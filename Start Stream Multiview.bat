@echo off
title Stream Multiview
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nonode
rem The app engine needs Node.js 22.12 or newer
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)"
if errorlevel 1 goto oldnode

if exist ".needs-install" goto install
if exist "node_modules\electron\dist\electron.exe" goto run

:install
echo.
echo  Installing the app engine (first launch, or after an update that needs it).
echo  This takes about a minute...
echo.
call npm install --no-audit --no-fund
if errorlevel 1 goto installfail
rem The engine itself downloads separately (npm install no longer fetches it).
if not exist "node_modules\electron\dist\electron.exe" call node node_modules\electron\install.js
if errorlevel 1 goto installfail
if exist ".needs-install" del ".needs-install"

:run
rem Make sure saved logins are stored encrypted (only changes anything the first time).
node src\main\harden.js >nul 2>nul
start "" "node_modules\electron\dist\electron.exe" .
exit /b

:nonode
echo.
echo  Stream Multiview needs Node.js (free) installed one time.
echo  Opening the download page now. Install the "LTS" version,
echo  then double-click this file again.
echo.
start https://nodejs.org/
pause
exit /b

:oldnode
echo.
echo  Stream Multiview needs a newer Node.js (22.12 or newer; you have one that's older).
echo  Opening the download page now. Install the "LTS" version,
echo  then double-click this file again.
echo.
start https://nodejs.org/
pause
exit /b

:installfail
echo.
echo  The install didn't finish. Check your internet connection and
echo  double-click this file to try again.
echo.
pause
exit /b
