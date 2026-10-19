@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo   Building LehengaBooking.exe (Windows Standalone)
echo ===================================================
echo.

:: 1. Check Python
set "PY_CMD="
where py >nul 2>nul && set "PY_CMD=py"
if "%PY_CMD%"=="" where python >nul 2>nul && set "PY_CMD=python"
if "%PY_CMD%"=="" if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set "PY_CMD=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"

if "%PY_CMD%"=="" (
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python 3.10+ from python.org and check "Add Python to PATH".
    pause
    exit /b 1
)

echo Using Python: %PY_CMD%

:: 2. Install requirements & PyInstaller
echo [1/3] Installing dependencies...
%PY_CMD% -m pip install --upgrade pip
%PY_CMD% -m pip install -r backend\requirements.txt pyinstaller

:: 3. Verify vanilla web frontend
if not exist "frontend\index.html" (
    echo [ERROR] Frontend directory or frontend\index.html not found!
    pause
    exit /b 1
)
echo [2/3] Verified vanilla web assets in frontend\...

:: 4. Build single-file executable using PyInstaller spec
echo [3/3] Compiling LehengaBooking.exe with PyInstaller...
%PY_CMD% -m PyInstaller --noconfirm LehengaBooking.spec

if exist "dist\LehengaBooking.exe" (
    echo.
    echo ===================================================
    echo   SUCCESS! Standalone Executable Created:
    echo   %CD%\dist\LehengaBooking.exe
    echo ===================================================
    echo.
    echo You can copy LehengaBooking.exe to any Windows PC!
    echo When you double-click it, it will launch the app and open the browser.
    echo.
    explorer.exe dist
) else (
    echo [ERROR] Build failed! Check the output above.
)

pause
