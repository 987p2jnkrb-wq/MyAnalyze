$ports = 3003, 5173
$processIds = Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

if (-not $processIds) {
    Write-Host "Frontend i backend nie są uruchomione." -ForegroundColor Yellow
    return
}

$processIds | ForEach-Object { Stop-Process -Id $_ -Force }
Write-Host "Zatrzymano frontend i backend." -ForegroundColor Green
