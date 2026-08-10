<# Removes the current-user DevicePassport Tester installation while preserving station settings and queued reports. #>

[CmdletBinding()]
param([string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "Programs\DevicePassportTester"))

$ErrorActionPreference = "Stop"
$desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "DevicePassport Tester.lnk"
$startMenuFolder = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\DevicePassport"
$startMenuShortcut = Join-Path $startMenuFolder "DevicePassport Tester.lnk"
Remove-Item -LiteralPath $desktopShortcut, $startMenuShortcut -Force -ErrorAction SilentlyContinue
if (Test-Path -LiteralPath $startMenuFolder) {
    $remaining = @(Get-ChildItem -LiteralPath $startMenuFolder -Force -ErrorAction SilentlyContinue)
    if ($remaining.Count -eq 0) { Remove-Item -LiteralPath $startMenuFolder -Force }
}

if (Test-Path -LiteralPath $InstallRoot) {
    $escaped = $InstallRoot.Replace("'", "''")
    $cleanup = "Start-Sleep -Milliseconds 700; Remove-Item -LiteralPath '$escaped' -Recurse -Force"
    Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $cleanup)
}
Write-Host "DevicePassport Tester removed. Station settings and offline queue were preserved." -ForegroundColor Green
