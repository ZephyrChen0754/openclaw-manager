param(
    [switch]$InstallSkill,
    [string]$CodexHome = $env:CODEX_HOME,
    [string]$StateRoot,
    [switch]$AllowAutostart
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$expectedRegistry = 'https://registry.npmjs.org/'

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
    $currentRegistry = (npm config get registry).Trim()
    if ($currentRegistry -ne $expectedRegistry) {
        Write-Warning "npm registry is '$currentRegistry'. This repo pins '$expectedRegistry' via .npmrc."
    }

    if (Select-String -Path 'package-lock.json' -Pattern 'registry\.npmmirror\.com' -Quiet) {
        throw 'package-lock.json still references registry.npmmirror.com. Regenerate the lockfile with the official npm registry before installing.'
    }

    npm ci
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

    $isInteractiveConsole = -not [Console]::IsInputRedirected -and -not [Console]::IsOutputRedirected -and -not $env:CI
    if (-not $AllowAutostart -and $isInteractiveConsole) {
        $reply = Read-Host 'Allow OpenClaw Manager to auto-start its local loopback-only sidecar on future bootstrap? [y/N]'
        if ($reply -match '^(y|yes)$') {
            $AllowAutostart = $true
        }
    }

    if ($AllowAutostart) {
        node dist/skill/autostart-consent.js --allow --source=install_script
    }
    else {
        node dist/skill/autostart-consent.js --deny --source=install_script
    }

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
    Write-Host "Registry:   $expectedRegistry"
    if ($InstallSkill) {
        Write-Host "Skill dir:  $(Join-Path $CodexHome 'skills\\openclaw-manager')"
    }
    Write-Host ''
    Write-Host 'Next steps:'
    Write-Host '1. Review .env.local. The sidecar is loopback-only by default (OPENCLAW_MANAGER_BIND_HOST=127.0.0.1).'
    Write-Host '2. Start the sidecar manually with: npm run dev'
    Write-Host '3. If you skipped autostart consent, you can allow it later with: npm run consent:autostart'
}
finally {
    Pop-Location
}
