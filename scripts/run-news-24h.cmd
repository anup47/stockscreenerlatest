@echo off
rem Hourly (Windows Task Scheduler): GPU rental market, market leverage (MTF + futures OI),
rem then the 24H News Summary. The first two are quick and write only when data changes.
rem Log: %LOCALAPPDATA%\news-24h\news.log
cd /d "%~dp0.."
if not exist "%LOCALAPPDATA%\news-24h" mkdir "%LOCALAPPDATA%\news-24h"
echo ===== %date% %time% >> "%LOCALAPPDATA%\news-24h\news.log"
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts\gpu-market.mjs >> "%LOCALAPPDATA%\news-24h\news.log" 2>&1
node scripts\leverage.mjs >> "%LOCALAPPDATA%\news-24h\news.log" 2>&1
node scripts\news-24h.mjs %* >> "%LOCALAPPDATA%\news-24h\news.log" 2>&1
