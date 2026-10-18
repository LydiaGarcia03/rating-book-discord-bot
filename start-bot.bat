@echo off
title Book Rating Bot
rem Always run from the folder this file is in
cd /d "%~dp0"

rem Check that Node.js is installed
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)

rem Check that the .env file exists
if not exist ".env" (
  echo The .env file is missing. Copy .env.example to .env and fill in your bot token and IDs.
  pause
  exit /b 1
)

rem Install dependencies on the first run
if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 goto :error
)

echo Registering slash commands...
call npm run deploy
if errorlevel 1 goto :error

echo Starting the bot... (close this window to stop it)
call npm start
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo Something went wrong. Check the messages above.
pause
exit /b 1
