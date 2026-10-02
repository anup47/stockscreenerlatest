@echo off
rem Daily research-targets sync (Windows Task Scheduler). Log: %LOCALAPPDATA%\research-sync\sync.log
cd /d "%~dp0.."
if not exist "%LOCALAPPDATA%\research-sync" mkdir "%LOCALAPPDATA%\research-sync"
echo ===== %date% %time% >> "%LOCALAPPDATA%\research-sync\sync.log"
node scripts\sync-research-targets.mjs %* >> "%LOCALAPPDATA%\research-sync\sync.log" 2>&1
