@echo off
rem Starts the CivicSense Go engine (http://localhost:8080) and the Next.js web app (http://localhost:3000),
rem each in its own window. Close a window (or press Ctrl+C in it) to stop that server.
setlocal
cd /d "%~dp0"

if not exist ".env.local" (
  echo .env.local is missing. Copy .env.example to .env.local and fill it in first.
  pause
  exit /b 1
)

rem Keep Go's caches and temp files off C: (the two windows inherit these).
set "GOCACHE=E:\civicsense\.gocache\build"
set "GOPATH=E:\civicsense\.gocache\path"
set "GOMODCACHE=E:\civicsense\.gocache\mod"
set "GOTMPDIR=E:\civicsense\.gocache\tmp"
set "GOTOOLCHAIN=local"
set "GOTELEMETRY=off"
set "TMP=%GOTMPDIR%"
set "TEMP=%GOTMPDIR%"
if not exist "%GOTMPDIR%" mkdir "%GOTMPDIR%"

start "CivicSense engine" /d "%~dp0engine" cmd /k go run ./cmd/engine
start "CivicSense web" /d "%~dp0" cmd /k corepack pnpm dev

echo Engine: http://localhost:8080/health
echo Web:    http://localhost:3000
endlocal
