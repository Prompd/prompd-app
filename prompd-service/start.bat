@echo off
REM Start Prompd Service (Windows)

echo Starting Prompd Service...
echo.
echo Service will run at http://localhost:9876
echo Press Ctrl+C to stop
echo.

node src/server.js
