@echo off
title Pinterest Pin Publisher Launcher
echo ===================================================
echo     Pinterest Pin Publisher Launcher
echo ===================================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not added to your system PATH.
    echo Please install Node.js from https://nodejs.org/ first.
    echo.
    pause
    exit /b 1
)

:: Check if node_modules folder exists, if not run npm install
if not exist node_modules (
    echo [INFO] node_modules not found. Installing dependencies...
    echo This might take a couple of minutes to download Electron and Playwright Chromium...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] npm install failed. Please check the logs.
        pause
        exit /b 1
      )
)

echo.
echo [SUCCESS] Dependencies verified. Starting Pinterest Pin Publisher dev server...
echo Close the application window or press Ctrl+C in this terminal to shut down.
echo.
call npm run dev

pause
