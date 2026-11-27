@echo off
title DataInsight Pro
cd /d "%~dp0"
echo Starting DataInsight Pro on http://localhost:3000 ...
start "" http://localhost:3000
npm run dev
pause
