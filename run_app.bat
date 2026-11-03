@echo off
title YouTube to MP4 Converter
cd /d "%~dp0"

echo ======================================================
echo           YouTube to MP4 Web Converter
echo ======================================================
echo.
echo Demarrage du serveur web local...
echo Ouverture de votre navigateur...
echo.

start http://localhost:5000

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" server.py
) else (
    python server.py
)

pause

