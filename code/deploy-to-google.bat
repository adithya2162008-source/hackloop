@echo off
title VoltShare - Deploy to Google Cloud / Firebase
color 0A

echo =========================================================================
echo       VOLTSHARE: DEPLOY TO OFFICIAL GOOGLE WEB HOSTING
echo =========================================================================
echo Project: voltcharge-a5c69
echo Target: https://voltcharge-a5c69.web.app
echo =========================================================================
echo.

:: Refresh environment PATH
set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python312\Scripts;%PATH%"

:: Check if firebase-tools is installed
where firebase >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] Installing Firebase CLI tools...
    call npm install -g firebase-tools
)

echo [INFO] Logging into Google Firebase...
call firebase login

echo.
echo [INFO] Deploying site to Google Cloud / Firebase Hosting...
call firebase deploy --only hosting

echo.
echo =========================================================================
echo  DEPLOYMENT COMPLETE!
echo  Your official live Google URL: https://voltcharge-a5c69.web.app
echo =========================================================================
pause
