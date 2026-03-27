@echo off
cd /d "%~dp0viewer-app"
npm run build
echo.
echo Build complete.
pause
