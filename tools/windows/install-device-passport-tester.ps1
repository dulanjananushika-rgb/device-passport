<# Installs DevicePassport Tester V4 for the current Windows user. #>

[CmdletBinding()]
param(
    [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "Programs\DevicePassportTester"),
    [switch]$NoShortcuts,
    [switch]$Launch
)

$ErrorActionPreference = "Stop"
$requiredFiles = @(
    "collect-device-health.ps1",
    "DevicePassport.InteractiveTests.ps1",
    "start-device-passport-tester.ps1",
    "uninstall-device-passport-tester.ps1"
)
foreach ($name in $requiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $name))) { throw "Installer source is missing $name." }
}

New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
foreach ($name in $requiredFiles) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $InstallRoot $name) -Force }

$powershellPath = (Get-Command powershell.exe).Source
$agentPath = Join-Path $InstallRoot "start-device-passport-tester.ps1"
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$agentPath`""
$desktopShortcut = ""
if (-not $NoShortcuts) {
    $shell = New-Object -ComObject WScript.Shell
    $desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "DevicePassport Tester.lnk"
    $startMenuFolder = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\DevicePassport"
    New-Item -ItemType Directory -Path $startMenuFolder -Force | Out-Null
    $startMenuShortcut = Join-Path $startMenuFolder "DevicePassport Tester.lnk"
    foreach ($shortcutPath in @($desktopShortcut, $startMenuShortcut)) {
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $powershellPath
        $shortcut.Arguments = $arguments
        $shortcut.WorkingDirectory = $InstallRoot
        $shortcut.Description = "DevicePassport signed Windows hardware tester"
        $shortcut.IconLocation = "$powershellPath,0"
        $shortcut.Save()
    }
}

[ordered]@{
    product = "DevicePassport Windows Tester"
    version = "0.4.0"
    installedAt = (Get-Date).ToUniversalTime().ToString("o")
    installRoot = $InstallRoot
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $InstallRoot "installation.json") -Encoding UTF8

Write-Host "DevicePassport Tester V4 installed successfully." -ForegroundColor Green
if ($desktopShortcut) { Write-Host "Desktop shortcut: $desktopShortcut" }
Write-Host "Station settings and offline queue remain under $env:LOCALAPPDATA\DevicePassport."
if ($Launch) { Start-Process $powershellPath -ArgumentList $arguments }
