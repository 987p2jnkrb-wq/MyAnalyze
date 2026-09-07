$projectDir = $PSScriptRoot
$nodeDir = Join-Path $projectDir "tools\node-v22.23.2-win-x64"
$npm = Join-Path $nodeDir "npm.cmd"

if (-not (Test-Path -LiteralPath $npm)) {
  throw "Nie znaleziono lokalnego Node.js: $npm"
}

$env:Path = "$nodeDir;$env:Path"
Set-Location -LiteralPath $projectDir
& $npm start
