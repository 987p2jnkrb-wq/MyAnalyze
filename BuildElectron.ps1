$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Scripts.Common.ps1")

Write-Host "Budowanie instalatora Electron..." -ForegroundColor Cyan
Invoke-ProjectNpm -Arguments @("run", "build:desktop")
Write-Host "Gotowe. Instalator jest w folderze dist." -ForegroundColor Green
