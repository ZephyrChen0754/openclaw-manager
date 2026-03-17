param(
    [switch]$InstallSkill,
    [string]$CodexHome = $env:CODEX_HOME,
    [string]$StateRoot
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Require-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

Require-Command node
Require-Command npm

Push-Location $repoRoot
try {
    npm install
    npm run build

    $envExample = Join-Path $repoRoot '.env.example'
    $envLocal = Join-Path $repoRoot '.env.local'
    if (-not (Test-Path $envLocal)) {
        Copy-Item $envExample $envLocal
    }

    if (-not $StateRoot) {
        $StateRoot = Join-Path $HOME '.openclaw\skills\manager'
    }
    New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null

    if ($InstallSkill) {
        if (-not $CodexHome) {
            throw "CODEX_HOME is required when -InstallSkill is used."
        }

        $target = Join-Path $CodexHome 'skills\openclaw-manager'
        New-Item -ItemType Directory -Force -Path $target | Out-Null
        robocopy $repoRoot $target /E /NFL /NDL /NJH /NJS /NP /XD node_modules dist .git /XF .env .env.local | Out-Null
        if ($LASTEXITCODE -gt 7) {
            throw "robocopy failed with exit code $LASTEXITCODE"
        }
    }

    Write-Host ''
    Write-Host 'OpenClaw Manager installed.'
    Write-Host "Repo:       $repoRoot"
    Write-Host "State root: $StateRoot"
    if ($InstallSkill) {
        Write-Host "Skill dir:  $(Join-Path $CodexHome 'skills\\openclaw-manager')"
    }
    Write-Host ''
    Write-Host 'Next steps:'
    Write-Host '1. Review .env.local and adjust local manager settings if needed.'
    Write-Host '2. Start the sidecar with: npm run dev'
}
finally {
    Pop-Location
}
