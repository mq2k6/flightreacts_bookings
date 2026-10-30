@echo off
cd /d "%~dp0"

start "Backend" cmd /k "cd src\backend && call ..\..\.venv\Scripts\activate.bat && uvicorn main:app --reload"
start "Frontend" cmd /k "cd src\frontend && npm install && npm run dev"