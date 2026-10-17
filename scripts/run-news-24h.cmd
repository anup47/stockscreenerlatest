@echo off
rem Hourly (Windows Task Scheduler): GPU rental market summary, then the 24H News Summary.
rem Log: %LOCALAPPDATA%\news-24h\news.log
cd /d "%~dp0.."
if not exist "%LOCALAPPDATA%\news-24h" mkdir "%LOCALAPPDATA%\news-24h"
echo ===== %date% %time% >> "%LOCALAPPDATA%\news-24h\news.log"
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts\gpu-market.mjs >> "%LOCALAPPDATA%\news-24h\news.log" 2>&1
node scripts\news-24h.mjs %* >> "%LOCALAPPDATA%\news-24h\news.log" 2>&1
