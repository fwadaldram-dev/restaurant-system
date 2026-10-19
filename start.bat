@echo off
echo Running Restaurant POS Server...
cd /d "%~dp0"
start http://localhost:3000/takeaway.html
node server.js
pause