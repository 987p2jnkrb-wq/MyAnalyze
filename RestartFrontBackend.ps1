$projectDir = (Get-Location).Path
$shell = (Get-Process -Id $PID).Path

$backendPort = 3003
$frontendPort = 5173

$escapedProjectDir = $projectDir.Replace("'", "''")


function Test-PortListening {
    param(
        [int]$Port
    )

    return $null -ne (
        Get-NetTCPConnection `
            -LocalPort $Port `
            -State Listen `
            -ErrorAction SilentlyContinue |
        Select-Object -First 1
    )
}


function Stop-Port {
    param(
        [int]$Port
    )

    $processIds = Get-NetTCPConnection `
        -LocalPort $Port `
        -State Listen `
        -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique

    foreach ($processId in $processIds) {
        try {
            Write-Host "Zatrzymywanie PID $processId na porcie $Port..." -ForegroundColor Yellow
            Stop-Process -Id $processId -Force -ErrorAction Stop
        }
        catch {
            Write-Host "Nie udało się zatrzymać PID $processId." -ForegroundColor Red
        }
    }
}


function Wait-PortFree {
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 10
    )

    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

    while ($stopwatch.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        if (-not (Test-PortListening -Port $Port)) {
            return $true
        }

        Start-Sleep -Milliseconds 250
    }

    return $false
}


function Wait-PortListening {
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 30
    )

    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

    while ($stopwatch.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        if (Test-PortListening -Port $Port) {
            return $true
        }

        Start-Sleep -Milliseconds 300
    }

    return $false
}


Write-Host ""
Write-Host "=== Restart MyAnalyze ===" -ForegroundColor Cyan
Write-Host ""


# ============================================================
# 1. STOP
# ============================================================

Write-Host "Zatrzymywanie poprzednich instancji..." -ForegroundColor Cyan

Stop-Port -Port $backendPort
Stop-Port -Port $frontendPort

Write-Host "Oczekiwanie na zwolnienie portów..." -ForegroundColor DarkGray

$backendFree = Wait-PortFree -Port $backendPort
$frontendFree = Wait-PortFree -Port $frontendPort

if (-not $backendFree) {
    Write-Host "Port $backendPort nie został zwolniony." -ForegroundColor Red
    exit 1
}

if (-not $frontendFree) {
    Write-Host "Port $frontendPort nie został zwolniony." -ForegroundColor Red
    exit 1
}

Write-Host "Porty zwolnione." -ForegroundColor Green
Write-Host ""


# ============================================================
# 2. BACKEND
# ============================================================

$backendCommand = @"
Set-Location -LiteralPath '$escapedProjectDir'

Write-Host 'Budowanie backendu...' -ForegroundColor Cyan
npm run build:backend

if (`$LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host 'BLAD podczas budowania backendu.' -ForegroundColor Red
    return
}

Write-Host ''
Write-Host 'Backend: http://127.0.0.1:$backendPort' -ForegroundColor Green

node '.\backend-dist\index.js'
"@

Write-Host "Uruchamianie backendu..." -ForegroundColor Cyan

Start-Process `
    -FilePath $shell `
    -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        $backendCommand
    ) `
    -WorkingDirectory $projectDir


# ============================================================
# 3. CZEKANIE NA BACKEND
# ============================================================

Write-Host "Oczekiwanie na backend..." -ForegroundColor DarkGray

if (-not (Wait-PortListening -Port $backendPort -TimeoutSeconds 30)) {
    Write-Host ""
    Write-Host "Backend nie uruchomił się na porcie $backendPort." -ForegroundColor Red
    Write-Host "Frontend nie zostanie uruchomiony." -ForegroundColor Yellow
    exit 1
}

Write-Host "Backend działa." -ForegroundColor Green
Write-Host ""


# ============================================================
# 4. FRONTEND
# ============================================================

$frontendCommand = @"
Set-Location -LiteralPath '$escapedProjectDir'

Write-Host 'Frontend: http://127.0.0.1:$frontendPort' -ForegroundColor Cyan

npm --prefix '.\myanalyze-frontend' run dev -- --host 127.0.0.1 --configLoader runner
"@

Write-Host "Uruchamianie frontendu..." -ForegroundColor Cyan

Start-Process `
    -FilePath $shell `
    -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        $frontendCommand
    ) `
    -WorkingDirectory $projectDir


# ============================================================
# 5. CZEKANIE NA FRONTEND
# ============================================================

Write-Host "Oczekiwanie na frontend..." -ForegroundColor DarkGray

if (-not (Wait-PortListening -Port $frontendPort -TimeoutSeconds 30)) {
    Write-Host ""
    Write-Host "Frontend nie uruchomił się na porcie $frontendPort." -ForegroundColor Red
    Write-Host "Backend nadal działa." -ForegroundColor Yellow
    exit 1
}


# ============================================================
# DONE
# ============================================================

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "MyAnalyze został uruchomiony ponownie." -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""

Write-Host "Backend:  http://127.0.0.1:$backendPort" -ForegroundColor Green
Write-Host "Frontend: http://127.0.0.1:$frontendPort" -ForegroundColor Cyan
Write-Host ""