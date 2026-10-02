@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install from https://nodejs.org
  pause
  exit /b 1
)
start "Cassette Studio" http://127.0.0.1:8769
node server.mjs
pause
