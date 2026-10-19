@echo off
setlocal

:: If standalone exe exists, launch it directly
if exist "dist\LehengaBooking.exe" (
    echo Starting Lehenga Booking System (Standalone)...
    start "" "dist\LehengaBooking.exe"
    exit /b 0
)

if exist "LehengaBooking.exe" (
    echo Starting Lehenga Booking System (Standalone)...
    start "" "LehengaBooking.exe"
    exit /b 0
)

:: Otherwise run via Python
set "PY_CMD="
where py >nul 2>nul && set "PY_CMD=py"
if "%PY_CMD%"=="" where python >nul 2>nul && set "PY_CMD=python"
if "%PY_CMD%"=="" if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set "PY_CMD=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"

if "%PY_CMD%"=="" (
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python from https://www.python.org and check "Add Python to PATH".
    pause
    exit /b 1
)

:: Install requirements if not already present
%PY_CMD% -c "import fastapi, uvicorn, qrcode, PIL" >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo First-time setup: installing dependencies...
    %PY_CMD% -m pip install -r backend\requirements.txt
)

echo Starting Lehenga Booking System...
%PY_CMD% desktop_launcher.py
pause
