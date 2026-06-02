@echo off
chcp 65001 >nul

cd /d "E:\code\javascript\project\PlanningGo"

echo.
echo ========================================
echo PlanningGo dev server window
echo ========================================
echo.
echo Running: npm run dev:full
echo Do not close this window while developing.
echo.

npm run dev:full

echo.
echo Dev server stopped.
pause