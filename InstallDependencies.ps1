. (Join-Path $PSScriptRoot "Scripts.Common.ps1")

Write-Host "Instalowanie zależności projektu..." -ForegroundColor Cyan
Invoke-ProjectNpm -Arguments @("install")
Invoke-ProjectNpm -Arguments @("--prefix", "backend", "install")
Invoke-ProjectNpm -Arguments @("--prefix", "myanalyze-frontend", "install")
Write-Host "Zależności zostały zainstalowane." -ForegroundColor Green
