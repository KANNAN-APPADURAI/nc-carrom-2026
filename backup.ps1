<#
    NC Carrom 2026 - take a backup.

    Right-click -> "Run with PowerShell", or from a terminal:
        .\backup.ps1
        .\backup.ps1 -OutDir "D:\Carrom backups"

    Saves an Excel workbook (Summary, Teams, Matches, Standings) and a raw
    JSON copy into the backups folder, named with the date and time.
    Read-only - the live data is never changed.
#>

param(
  [string]$OutDir = (Join-Path $PSScriptRoot 'backups')
)

$ErrorActionPreference = 'Stop'
$backend = Join-Path $PSScriptRoot 'backend'
$python = Join-Path $backend '.venv\Scripts\python.exe'

Write-Host ''
Write-Host '  NC Carrom 2026 - Backup' -ForegroundColor Yellow
Write-Host '  -----------------------' -ForegroundColor DarkGray

if (-not (Test-Path $python)) {
  Write-Host '  Python environment not found - run start.ps1 once first.' -ForegroundColor Red
  exit 1
}

& $python -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('openpyxl') else 1)"
if ($LASTEXITCODE -ne 0) {
  Write-Host '  Installing openpyxl (first run only)...' -ForegroundColor Cyan
  & $python -m pip install openpyxl --quiet
}

Push-Location $backend
try {
  & $python backup_xlsx.py $OutDir
  if ($LASTEXITCODE -ne 0) { throw 'Backup failed.' }
  Write-Host '  Backup complete.' -ForegroundColor Green
} finally {
  Pop-Location
}
Write-Host ''
