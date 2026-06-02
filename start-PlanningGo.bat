@echo off
chcp 65001 >nul

set "PROJECT_ROOT=E:\code\javascript\project\PlanningGo"
set "RUN_SCRIPT=%PROJECT_ROOT%\scripts\windows\run-dev-window.bat"

echo.
echo ========================================
echo PlanningGo one-click start
echo ========================================
echo.

echo Project:
echo %PROJECT_ROOT%
echo.

if not exist "%PROJECT_ROOT%" (
  echo ERROR: Project folder not found.
  pause
  exit /b 1
)

if not exist "%RUN_SCRIPT%" (
  echo ERROR: Run script not found:
  echo %RUN_SCRIPT%
  pause
  exit /b 1
)

echo Step 1: Stop old frontend/backend ports...
echo.

for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":3001 .*LISTENING" /C:":5173 .*LISTENING" /C:":5174 .*LISTENING" /C:":5175 .*LISTENING"') do (
  echo Killing PID %%p
  taskkill /PID %%p /F >nul 2>nul
)

timeout /t 2 /nobreak >nul

echo.
echo Step 2: Current port status:
echo.

netstat -ano | findstr /R /C:":3001 .*LISTENING" /C:":5173 .*LISTENING" /C:":5174 .*LISTENING" /C:":5175 .*LISTENING"

echo.
echo Step 3: Start npm run dev:full in a new window...
echo.

start "PlanningGo Dev Server" "%RUN_SCRIPT%"

echo Waiting for backend to start...
timeout /t 10 /nobreak >nul

echo.
echo Step 4: Check backend ready:
echo.

curl http://127.0.0.1:3001/api/ready

echo.
echo.
echo Step 5: Open frontend page...
echo.

start http://localhost:5173/

echo.
echo Done.
echo If the browser page is blank, wait until the new window shows VITE ready.
echo Frontend: http://localhost:5173/
echo Backend:  http://127.0.0.1:3001
echo.
pause