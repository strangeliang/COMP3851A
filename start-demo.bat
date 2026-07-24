@echo off
cd /d "%~dp0"

if not exist node_modules (
  echo Installing React dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

echo.
echo Starting Study Companion...
echo Open the Local URL shown below in your browser.
call npm.cmd run dev
