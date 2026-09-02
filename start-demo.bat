@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 20.19 or newer, then run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing frontend dependencies...
  call npm.cmd ci
  if errorlevel 1 goto install_failed
)
if not exist backend\node_modules (
  echo Installing backend dependencies...
  call npm.cmd --prefix backend ci
  if errorlevel 1 goto install_failed
)
if not exist backend\.env (
  copy /y backend\.env.example backend\.env >nul
  echo Created backend\.env. Add GEMINI_API_KEY there to enable AI.
)

echo Starting the backend in a separate window...
start "Study Companion Backend" cmd /k "npm.cmd --prefix backend start"
echo Starting the frontend. Open http://localhost:5173 after both servers are ready.
echo Close both terminal windows to stop the app.
call npm.cmd run dev
exit /b %errorlevel%

:install_failed
echo Dependency installation failed. Check your Node.js version and network, then retry.
pause
exit /b 1
