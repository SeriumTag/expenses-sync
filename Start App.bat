@echo off
title Expense Sync (keep this window open)
cd /d "%~dp0"
echo Starting Expense Sync... your browser will open in a moment.
echo Keep this window open while you use the app. Close it to stop the app.
echo.
call npm run dev -- --open
pause
