param(
    [Parameter(Mandatory = $false)]
    [string]$Tag = "latest",

    [Parameter(Mandatory = $false)]
    [string]$Registry = "host.docker.internal:8086",

    [Parameter(Mandatory = $false)]
    [string]$ImageName = "dnd-vtt",

    [Parameter(Mandatory = $false)]
    [string]$ComposeFile = "docker-compose.nexus.yml",

    [Parameter(Mandatory = $false)]
    [string]$DmPassword,

    [Parameter(Mandatory = $false)]
    [switch]$FollowLogs,

    [Parameter(Mandatory = $false)]
    [switch]$SkipLogin
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Path $MyInvocation.MyCommand.Path -Parent
Set-Location $repoRoot

if (-not (Test-Path $ComposeFile)) {
    throw "Compose file not found: $ComposeFile"
}

$imageRef = "$Registry/${ImageName}:$Tag"
$env:NEXUS_IMAGE = $imageRef

if ($DmPassword) {
    $env:DM_PASSWORD = $DmPassword
}

Write-Host "Deploying image: $imageRef" -ForegroundColor Cyan
Write-Host "Using compose file: $ComposeFile" -ForegroundColor Cyan

if (-not $SkipLogin) {
    Write-Host "Docker login required for $Registry" -ForegroundColor Yellow
    docker login $Registry
}

Write-Host "Pulling image..." -ForegroundColor Cyan
docker compose -f $ComposeFile pull

Write-Host "Starting services..." -ForegroundColor Cyan
docker compose -f $ComposeFile up -d

Write-Host "Current status:" -ForegroundColor Cyan
docker compose -f $ComposeFile ps

if ($FollowLogs) {
    Write-Host "Following logs..." -ForegroundColor Cyan
    docker compose -f $ComposeFile logs -f
}
