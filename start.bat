@echo off
echo ======================================
echo   PingHub Bot - Optimized for Low-Resource Servers
echo ======================================
echo.

REM Check if node_modules exists
if not exist "node_modules\" (
    echo [INFO] Installing dependencies...
    call npm install
    echo.
)

REM Check if .env exists
if not exist ".env" (
    echo [WARNING] .env file not found!
    echo [INFO] Please create a .env file with your bot token.
    echo [INFO] You can copy .env.example and rename it to .env
    echo.
    pause
    exit /b 1
)

echo [INFO] Starting PingHub bot with memory limit...
echo [INFO] Max RAM: 256 MiB
echo [INFO] Press Ctrl+C to stop the bot
echo.

node --max-old-space-size=256 index.js

pause
