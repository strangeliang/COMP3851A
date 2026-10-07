@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.13 or newer, then run this file again.
  pause
  exit /b 1
)

node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || major === 22 && minor >= 13 ? 0 : 1)"
if errorlevel 1 (
  echo Install Node.js 22.13 or newer, then run this file again.
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
  echo Created backend\.env. Add your GEMINI_API_KEY there to enable AI.
  echo For local demo accounts only, uncomment STUDY_SEED_DEMO=1.
  echo Do not enable demo accounts on a public deployment.
  echo Save backend\.env, then run this file again. See README.md for details.
  pause
  exit /b 0
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
