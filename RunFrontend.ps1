. (Join-Path $PSScriptRoot "Scripts.Common.ps1")

Write-Host "Frontend: http://127.0.0.1:5173" -ForegroundColor Cyan
Invoke-ProjectNpm -Arguments @("--prefix", "myanalyze-frontend", "run", "dev", "--", "--host", "127.0.0.1", "--configLoader", "runner")
