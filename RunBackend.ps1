. (Join-Path $PSScriptRoot "Scripts.Common.ps1")

Write-Host "Budowanie backendu..." -ForegroundColor Cyan
Invoke-ProjectNpm -Arguments @("run", "build:backend")
Write-Host "Backend: http://127.0.0.1:3003" -ForegroundColor Green
Set-Location -LiteralPath $ProjectRoot
& $NodeCommand (Join-Path $ProjectRoot "backend-dist\index.js")
if ($LASTEXITCODE -ne 0) { throw "Backend zakonczyl sie kodem $LASTEXITCODE." }
