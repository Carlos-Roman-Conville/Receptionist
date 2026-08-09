#Requires -RunAsAdministrator
<#
  Installs cloudflared as a Windows service using the user's tunnel config.
  Run once after `cloudflared tunnel login` and config.yml are in place.
#>
$ErrorActionPreference = 'Stop'

$cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
$config = Join-Path $env:USERPROFILE '.cloudflared\config.yml'

if (-not (Test-Path $cloudflared)) {
  Write-Error "cloudflared not found at $cloudflared"
}

if (-not (Test-Path $config)) {
  Write-Error "Missing tunnel config: $config"
}

Write-Host "Installing cloudflared Windows service..."
Write-Host "Config: $config"

& $cloudflared service install --config $config

Write-Host ""
Write-Host "Starting service..."
Start-Service cloudflared -ErrorAction SilentlyContinue
Get-Service cloudflared | Format-Table Name, Status, StartType

Write-Host ""
Write-Host "Verify: curl.exe -s https://voice.crc-solutions.org/health"
