# SOMA UI V2 — consolidated Windows acceptance gate.
# Read-only verification except for the intentional Vite-generated static files.
# Never resets, cleans, commits or overwrites unrelated local changes.
[CmdletBinding()]
param([switch]$SkipBackend)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $root '.venv\Scripts\python.exe'
$specs = @(
    'infrastructure-rack-v2.spec.mjs'
    'infrastructure-site-v2.spec.mjs'
    'infrastructure.spec.mjs'
    'infrastructure-return.spec.mjs'
    'infrastructure-workbooks.spec.mjs'
    'owner-local-time-v2.spec.mjs'
    'infrastructure-model-v2.spec.mjs'
    'infrastructure-site-blockers-v2.spec.mjs'
    'infrastructure-context-v2.spec.mjs'
    'infrastructure-ip-v2.spec.mjs'
    'infrastructure-candidates-v2.spec.mjs'
    'tickets-device-references-v2.spec.mjs'
    'infrastructure-structure-v2.spec.mjs'
    'infrastructure-explorer-filters-v2.spec.mjs'
    'infrastructure-component-filters-v2.spec.mjs'
    'infrastructure-relationship-navigation-v2.spec.mjs'
)
function Invoke-Checked {
    param([string]$Label, [string]$Exe, [string[]]$Arguments)
    Write-Host "`n=== $Label ===" -ForegroundColor Cyan
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE"
    }
}
Push-Location $root
try {
    Write-Host 'SOMA UI V2 — source-matched Infrastructure gate' -ForegroundColor Green
    Write-Host 'WARNING: Production build regenerates src/soma/ui/static assets in this worktree.'
    Write-Host 'This script never runs git reset/clean, never commits, and never updates the branch.'
    Invoke-Checked 'LOCAL GIT STATUS' 'git' @('status','-sb')
    if (-not (Test-Path $venvPython)) {
        throw 'SOMA Python environment missing: .venv\Scripts\python.exe'
    }
    Invoke-Checked 'FRONTEND NODE / TYPE TESTS' 'npm.cmd' @('--prefix','src/web','test')
    Write-Host "`n=== PRODUCTION BUILD (inspect warnings) ===" -ForegroundColor Cyan
    $buildLines = @(& npm.cmd --prefix src/web run build 2>&1)
    $buildLines | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { throw "Production build failed with exit code $LASTEXITCODE" }
    if ($buildLines | Where-Object { "$_" -match 'chunks? (?:are|is) larger than \d+ kB' }) {
        Write-Warning 'Vite emitted a large-chunk warning: inspect generated per-chunk sizes.'
    }
    Invoke-Checked 'FROZEN ASSET SOURCE MATCH' 'py' @('-3.14','tools\verify_ui_build.py')
    if (-not $SkipBackend) {
        $temp = Join-Path $env:TEMP ('soma-infrastructure-' + [guid]::NewGuid().ToString('N'))
        Invoke-Checked 'FOCUSED INFRASTRUCTURE BACKEND' $venvPython @(
            '-m','pytest','tests/test_infrastructure_routes.py',
            'tests/test_infrastructure_query_certification.py','-q',"--basetemp=$temp"
        )
    }
    if (-not $env:SOMA_TEST_BROWSER) {
        $edge = @(
            'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
            'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
        ) | Where-Object { Test-Path $_ } | Select-Object -First 1
        if (-not $edge) { throw 'Microsoft Edge not found. Set SOMA_TEST_BROWSER explicitly.' }
        $env:SOMA_TEST_BROWSER = $edge
    }
    Invoke-Checked 'FULL INFRASTRUCTURE / STUDY29 EDGE REGRESSION' $venvPython (@(
        'tools\run_ui_browser_tests.py'
    ) + $specs)
    Invoke-Checked 'FINAL LOCAL STATUS — GENERATED ASSETS ARE EXPECTED' 'git' @('status','-sb')
    Write-Host "`nALL SELECTED CHECKS PASSED. Review warnings and generated assets separately." -ForegroundColor Green
}
finally {
    Pop-Location
}
