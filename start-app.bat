@echo off
title Unified Supervisor
cd /d "%~dp0"
echo ===================================================
echo   Launching Unified Supervisor (AutoGen + ChatALL)
echo ===================================================
echo.
npm run dev
pause
