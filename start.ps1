<#
    NC Carrom 2026 - one-command start.

    Right-click -> "Run with PowerShell", or from a terminal:
        .\start.ps1

    First run installs everything (Python venv + npm packages), which takes a
    minute or two. After that it just starts up.
#>

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$python = Join-Path $backend '.venv\Scripts\python.exe'

Write-Host ''
Write-Host '  NC Carrom 2026 - Team Selection' -ForegroundColor Yellow
Write-Host '  -------------------------------' -ForegroundColor DarkGray

# --- backend dependencies -------------------------------------------------
if (-not (Test-Path $python)) {
  Write-Host '  Creating the Python environment...' -ForegroundColor Cyan
  py -m venv (Join-Path $backend '.venv')
  & $python -m pip install --upgrade pip --quiet
  & $python -m pip install -r (Join-Path $backend 'requirements.txt') --quiet
}

# --- frontend dependencies ------------------------------------------------
if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
  Write-Host '  Installing the web packages...' -ForegroundColor Cyan
  Push-Location $frontend
  npm install --no-fund --no-audit
  Pop-Location
}

# --- database reminder ----------------------------------------------------
$envFile = Join-Path $backend '.env'
if (-not (Test-Path $envFile)) {
  Write-Host ''
  Write-Host '  No backend\.env found - running on the local JSON file.' -ForegroundColor DarkYellow
  Write-Host '  To use your Neon database: copy backend\.env.example to' -ForegroundColor DarkYellow
  Write-Host '  backend\.env and paste your connection string into DATABASE_URL.' -ForegroundColor DarkYellow
}

# --- start both services --------------------------------------------------
Write-Host ''
Write-Host '  Starting the API on  http://127.0.0.1:8000' -ForegroundColor Green
Start-Process powershell -ArgumentList @(
  '-NoExit', '-Command',
  "Set-Location '$backend'; & '$python' -m uvicorn app.main:app --reload --port 8000"
)

Write-Host '  Starting the site on http://localhost:5173' -ForegroundColor Green
Start-Process powershell -ArgumentList @(
  '-NoExit', '-Command',
  "Set-Location '$frontend'; npm run dev"
)

Start-Sleep -Seconds 4
Start-Process 'http://localhost:5173'

Write-Host ''
Write-Host '  Two windows opened - leave them running.' -ForegroundColor DarkGray
Write-Host '  Close them (or press Ctrl+C in each) to stop.' -ForegroundColor DarkGray
Write-Host ''
