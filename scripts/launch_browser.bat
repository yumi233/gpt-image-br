@echo off
setlocal
cd /d "%~dp0"
echo ==========================================================
echo       正在启动 ChatGPT 专属持久化浏览器 (Port 9222)
echo ==========================================================
node cli.js launch %*
echo.
node cli.js status
pause
