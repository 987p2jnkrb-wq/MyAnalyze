$projectDir = $PSScriptRoot
$shellPath = (Get-Process -Id $PID).Path
$backendScript = Join-Path $projectDir "RunBackend.ps1"
$frontendScript = Join-Path $projectDir "RunFrontend.ps1"

function Start-ProjectScript([string]$scriptPath) {
    $quotedPath = '"' + $scriptPath.Replace('"', '""') + '"'
    Start-Process -FilePath $shellPath -ArgumentList "-NoExit -ExecutionPolicy Bypass -File $quotedPath" -WorkingDirectory $projectDir
}

Start-ProjectScript $backendScript
Start-ProjectScript $frontendScript
Write-Host "Uruchomiono backend i frontend w osobnych oknach." -ForegroundColor Green
Write-Host "Aplikacja: http://127.0.0.1:5173" -ForegroundColor Cyan
