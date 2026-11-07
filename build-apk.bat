@echo off
title VoltShare - Build Android APK
color 0A

echo =========================================================================
echo       VOLTSHARE: REBUILD ANDROID APK WITH CAPACITOR
echo =========================================================================
echo  Entry UI: index.html
echo  Excludes: landing.html, db-admin.html, app.html
echo =========================================================================
echo.

set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"
set "PATH=%JAVA_HOME%\bin;%LOCALAPPDATA%\Android\Sdk\platform-tools;%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest\bin;%PATH%"
set "_JAVA_OPTIONS=-XX:TieredStopAtLevel=1"
set "ANDROID_HOME=C:\Users\Adithya Hari Bhat\AppData\Local\Android\Sdk"
set "ANDROID_SDK_ROOT=C:\Users\Adithya Hari Bhat\AppData\Local\Android\Sdk"

echo [1/3] Preparing clean web bundle with index.html only...
node scripts/prepare-www.js
if %errorlevel% neq 0 (
    echo [ERROR] Failed to assemble web assets!
    pause
    exit /b 1
)

echo.
echo [2/4] Syncing Capacitor Android assets and plugins...
call npx cap sync android
if %errorlevel% neq 0 (
    echo [ERROR] Capacitor sync failed!
    pause
    exit /b 1
)

echo.
echo [3/4] Ensuring VoltShare brand launcher icons and splash screens...
powershell -ExecutionPolicy Bypass -File scripts/generate-android-icons.ps1

echo.
echo [4/4] Compiling native Android APK with Gradle...
cd android
call gradlew.bat assembleDebug
cd ..

if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
    copy /Y "android\app\build\outputs\apk\debug\app-debug.apk" "VoltShare-app-debug.apk" >nul
    echo.
    echo =========================================================================
    echo  APK BUILD SUCCESSFUL!
    echo  Output file: VoltShare-app-debug.apk
    echo =========================================================================
) else (
    echo.
    echo [ERROR] APK build encountered an issue. Check Gradle logs above.
)

pause
