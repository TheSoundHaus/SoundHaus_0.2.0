param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("local", "remote")]
    [string]$Mode,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ComposeArgs
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path $ScriptDir
$ComposeEnvFile = Join-Path $RepoRoot ".env.compose.$Mode"
$ProfileFile = Join-Path $RepoRoot ".soundhaus-compose-profile"

if (-not (Test-Path $ComposeEnvFile)) {
    Write-Error "Missing $ComposeEnvFile`nCreate it from: .env.compose.$Mode.example"
}

$backendEnv = $null
foreach ($line in Get-Content $ComposeEnvFile) {
    if ($line -match '^\s*BACKEND_ENV_FILE\s*=\s*(.+)\s*$') {
        $backendEnv = $Matches[1].Trim().Trim('"')
        break
    }
}
if ($backendEnv) {
    $backendPath = Join-Path $RepoRoot $backendEnv
    if (-not (Test-Path $backendPath)) {
        Write-Warning "BACKEND_ENV_FILE points to missing file: $backendEnv"
        Write-Warning "Create it from: $backendEnv.example"
    }
}

Set-Content -Path $ProfileFile -Value $Mode -NoNewline
Write-Host "profile=$Mode"
Write-Host "compose_env_file=.env.compose.$Mode"

Push-Location $RepoRoot
try {
    & docker compose --env-file ".env.compose.$Mode" @ComposeArgs
}
finally {
    Pop-Location
}
