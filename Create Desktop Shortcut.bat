@echo off
rem Makes a "Stream Multiview" shortcut with the pear icon on your desktop (and in the Start menu).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s=New-Object -ComObject WScript.Shell; $dir=(Get-Location).Path;" ^
  "foreach($f in @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))){" ^
  "$l=$s.CreateShortcut((Join-Path $f 'Stream Multiview.lnk'));" ^
  "$l.TargetPath=(Join-Path $dir 'Start Stream Multiview.bat'); $l.WorkingDirectory=$dir;" ^
  "$l.IconLocation=(Join-Path $dir 'icon.ico'); $l.WindowStyle=7; $l.Description='Stream Multiview'; $l.Save() }"
echo.
echo  Done. "Stream Multiview" (with the pear icon) is on your desktop and in the Start menu.
echo.
pause
