$ErrorActionPreference = "Stop"

$ProjectRoot = $PSScriptRoot
$BundledNodeDir = Join-Path $ProjectRoot "tools\node-v22.23.2-win-x64"
$BundledNpm = Join-Path $BundledNodeDir "npm.cmd"
$BundledNode = Join-Path $BundledNodeDir "node.exe"

if ((Test-Path -LiteralPath $BundledNpm) -and (Test-Path -LiteralPath $BundledNode)) {
    $env:Path = "$BundledNodeDir;$env:Path"
    $NpmCommand = $BundledNpm
    $NodeCommand = $BundledNode
} else {
    $NpmCommand = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
    $NodeCommand = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
    if (-not $NpmCommand -or -not $NodeCommand) {
        throw "Nie znaleziono Node.js. Zainstaluj Node.js albo dodaj folder tools\node-v22.23.2-win-x64."
    }
}

function Invoke-ProjectNpm {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    Push-Location -LiteralPath $ProjectRoot
    try {
        & $NpmCommand @Arguments
        if ($LASTEXITCODE -ne 0) { throw "Polecenie npm zakonczylo sie kodem $LASTEXITCODE." }
    } finally {
        Pop-Location
    }
}
