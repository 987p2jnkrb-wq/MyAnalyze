$projectDir = (Get-Location).Path

Write-Host "Testy interfejsu..." -ForegroundColor Cyan

npm --prefix ".\myanalyze-frontend" run test:ui

if ($LASTEXITCODE -ne 0) {
    Write-Host "Testy interfejsu NIE powiodly sie." -ForegroundColor Red
    return
}

Write-Host ""
Write-Host "Testy API..." -ForegroundColor Cyan

npm run test:api

if ($LASTEXITCODE -ne 0) {
    Write-Host "Testy API NIE powiodly sie." -ForegroundColor Red
    return
}

Write-Host ""
Write-Host "Wszystkie autotesty zakonczone poprawnie." -ForegroundColor Green