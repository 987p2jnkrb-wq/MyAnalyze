$projectDir = (Get-Location).Path
$shell = (Get-Process -Id $PID).Path

$escapedProjectDir = $projectDir.Replace("'", "''")

$backendCommand = @"
Set-Location -LiteralPath '$escapedProjectDir'
Write-Host 'Budowanie backendu...' -ForegroundColor Cyan
npm run build:backend

if (`$LASTEXITCODE -ne 0) {
    Write-Host 'BLAD podczas budowania backendu.' -ForegroundColor Red
    return
}

Write-Host 'Backend: http://127.0.0.1:3003' -ForegroundColor Green
node '.\backend-dist\index.js'
"@

$frontendCommand = @"
Set-Location -LiteralPath '$escapedProjectDir'
Write-Host 'Frontend: http://127.0.0.1:5173' -ForegroundColor Cyan
npm --prefix '.\myanalyze-frontend' run dev -- --host 127.0.0.1 --configLoader runner
"@

Start-Process -FilePath $shell `
    -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $backendCommand) `
    -WorkingDirectory $projectDir

Start-Sleep -Seconds 2

Start-Process -FilePath $shell `
    -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $frontendCommand) `
    -WorkingDirectory $projectDir

Write-Host ""
Write-Host "Uruchomiono backend i frontend." -ForegroundColor Green
Write-Host "Backend:  http://127.0.0.1:3003" -ForegroundColor Green
Write-Host "Frontend: http://127.0.0.1:5173" -ForegroundColor Cyan