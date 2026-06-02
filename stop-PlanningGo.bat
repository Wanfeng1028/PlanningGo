@echo off
chcp 65001 >nul

echo.
echo ========================================
echo PlanningGo one-click stop
echo ========================================
echo.

echo Stopping ports: 3001, 5173, 5174, 5175
echo.

for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":3001 .*LISTENING" /C:":5173 .*LISTENING" /C:":5174 .*LISTENING" /C:":5175 .*LISTENING"') do (
  echo Killing PID %%p
  taskkill /PID %%p /F >nul 2>nul
)

timeout /t 1 /nobreak >nul

echo.
echo Current port status:
echo.

netstat -ano | findstr /R /C:":3001 .*LISTENING" /C:":5173 .*LISTENING" /C:":5174 .*LISTENING" /C:":5175 .*LISTENING"

echo.
echo Stop finished.
echo.
pause