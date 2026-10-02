@echo off
rem Hourly 24H News Summary build (Windows Task Scheduler). Log: %LOCALAPPDATA%\news-24h\news.log
cd /d "%~dp0.."
if not exist "%LOCALAPPDATA%\news-24h" mkdir "%LOCALAPPDATA%\news-24h"
echo ===== %date% %time% >> "%LOCALAPPDATA%\news-24h\news.log"
node scripts\news-24h.mjs %* >> "%LOCALAPPDATA%\news-24h\news.log" 2>&1
