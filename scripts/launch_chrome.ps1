param(
    [string]$BrowserType = ""
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       正在启动 ChatGPT 专属持久化浏览器 (Port 9222)       " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

if ($BrowserType) {
    node cli.js launch "--$BrowserType"
} else {
    node cli.js launch
}

Start-Sleep -Seconds 1
node cli.js status
