<#
  DevicePassport Windows Collector (MVP)
  Reads hardware health data using built-in Windows interfaces and creates a
  JSON report that can be imported into the DevicePassport web dashboard.

  Usage:
    powershell -ExecutionPolicy Bypass -File .\collect-device-health.ps1
    powershell -ExecutionPolicy Bypass -File .\collect-device-health.ps1 -OutputPath C:\Reports\device.json
#>

[CmdletBinding()]
param(
    [string]$OutputPath
)

$ErrorActionPreference = "Stop"

function Get-SafeCimInstance {
    param(
        [Parameter(Mandatory = $true)][string]$ClassName,
        [string]$Namespace = "root/cimv2"
    )

    try {
        return @(Get-CimInstance -Namespace $Namespace -ClassName $ClassName -ErrorAction Stop)
    }
    catch {
        return @()
    }
}

function Convert-BytesToGB {
    param([double]$Bytes)
    if ($Bytes -le 0) { return 0 }
    return [math]::Round($Bytes / 1GB, 1)
}

function Get-SafeRegistryProperties {
    param([Parameter(Mandatory = $true)][string]$Path)

    try {
        return Get-ItemProperty -LiteralPath $Path -ErrorAction Stop
    }
    catch {
        return $null
    }
}

$computer = Get-SafeCimInstance -ClassName "Win32_ComputerSystem" | Select-Object -First 1
$bios = Get-SafeCimInstance -ClassName "Win32_BIOS" | Select-Object -First 1
$processor = Get-SafeCimInstance -ClassName "Win32_Processor" | Select-Object -First 1
$operatingSystem = Get-SafeCimInstance -ClassName "Win32_OperatingSystem" | Select-Object -First 1
$physicalMemory = Get-SafeCimInstance -ClassName "Win32_PhysicalMemory"
$disks = Get-SafeCimInstance -ClassName "Win32_DiskDrive"
$systemRegistry = Get-SafeRegistryProperties -Path "HKLM:\HARDWARE\DESCRIPTION\System\BIOS"
$cpuRegistry = Get-SafeRegistryProperties -Path "HKLM:\HARDWARE\DESCRIPTION\System\CentralProcessor\0"

$batteryStatic = Get-SafeCimInstance -Namespace "root/wmi" -ClassName "BatteryStaticData" | Select-Object -First 1
$batteryFull = Get-SafeCimInstance -Namespace "root/wmi" -ClassName "BatteryFullChargedCapacity" | Select-Object -First 1
$batteryCycle = Get-SafeCimInstance -Namespace "root/wmi" -ClassName "BatteryCycleCount" | Select-Object -First 1
$batteryStatus = Get-SafeCimInstance -Namespace "root/wmi" -ClassName "BatteryStatus" | Select-Object -First 1

$designedCapacity = [double]($batteryStatic.DesignedCapacity)
$fullChargeCapacity = [double]($batteryFull.FullChargedCapacity)
$batteryHealth = $null
if ($designedCapacity -gt 0 -and $fullChargeCapacity -gt 0) {
    $batteryHealth = [math]::Min(100, [math]::Round(($fullChargeCapacity / $designedCapacity) * 100))
}

$memoryBytes = 0
foreach ($module in $physicalMemory) {
    $memoryBytes += [double]$module.Capacity
}

$diskReports = @()
foreach ($disk in $disks) {
    $diskReports += [ordered]@{
        model        = [string]$disk.Model
        serialNumber = ([string]$disk.SerialNumber).Trim()
        interface    = [string]$disk.InterfaceType
        mediaType    = [string]$disk.MediaType
        sizeGB       = Convert-BytesToGB -Bytes ([double]$disk.Size)
        healthStatus = if ([string]::IsNullOrWhiteSpace([string]$disk.Status)) { "Unknown" } else { [string]$disk.Status }
    }
}

if ($diskReports.Count -eq 0) {
    try {
        foreach ($disk in @(Get-PhysicalDisk -ErrorAction Stop)) {
            $diskReports += [ordered]@{
                model        = [string]$disk.FriendlyName
                serialNumber = ([string]$disk.SerialNumber).Trim()
                interface    = [string]$disk.BusType
                mediaType    = [string]$disk.MediaType
                sizeGB       = Convert-BytesToGB -Bytes ([double]$disk.Size)
                healthStatus = [string]$disk.HealthStatus
            }
        }
    }
    catch {
        # Some restricted Windows accounts cannot query the Storage subsystem.
    }
}

$serialNumber = ([string]$bios.SerialNumber).Trim()
if ([string]::IsNullOrWhiteSpace($serialNumber)) {
    $serialNumber = ([string]$systemRegistry.SystemSerialNumber).Trim()
}
if ([string]::IsNullOrWhiteSpace($serialNumber)) {
    $serialNumber = "UNKNOWN-SERIAL"
}

$manufacturer = [string]$computer.Manufacturer
if ([string]::IsNullOrWhiteSpace($manufacturer)) {
    $manufacturer = [string]$systemRegistry.SystemManufacturer
}

$model = [string]$computer.Model
if ([string]::IsNullOrWhiteSpace($model)) {
    $model = [string]$systemRegistry.SystemProductName
}
if ([string]::IsNullOrWhiteSpace($model)) {
    $model = "Unknown Windows device"
}

$processorName = [string]$processor.Name
if ([string]::IsNullOrWhiteSpace($processorName)) {
    $processorName = [string]$cpuRegistry.ProcessorNameString
}

$report = [ordered]@{
    reportVersion = "1.0"
    collectedAt   = (Get-Date).ToUniversalTime().ToString("o")
    collector     = [ordered]@{
        name     = "DevicePassport Windows Collector"
        version  = "0.1.0"
        hostname = $env:COMPUTERNAME
    }
    device        = [ordered]@{
        manufacturer = $manufacturer
        model        = $model
        serialNumber = $serialNumber
        processor    = $processorName
        memoryGB     = Convert-BytesToGB -Bytes $memoryBytes
        biosVersion  = (@($bios.SMBIOSBIOSVersion) -join ", ")
        operatingSystem = [string]$operatingSystem.Caption
    }
    battery       = [ordered]@{
        present            = ($null -ne $batteryStatic -or $null -ne $batteryStatus)
        designedCapacityMWh = if ($designedCapacity -gt 0) { $designedCapacity } else { $null }
        fullChargeCapacityMWh = if ($fullChargeCapacity -gt 0) { $fullChargeCapacity } else { $null }
        healthPercent      = $batteryHealth
        cycleCount         = if ($null -ne $batteryCycle) { [int]$batteryCycle.CycleCount } else { $null }
        charging           = if ($null -ne $batteryStatus) { [bool]$batteryStatus.Charging } else { $null }
    }
    storage       = $diskReports
    manualChecks  = [ordered]@{
        display      = "Not checked"
        keyboard     = "Not checked"
        camera       = "Not checked"
        audio        = "Not checked"
        ports        = "Not checked"
        wifiBluetooth = "Not checked"
    }
    integrity     = [ordered]@{
        source = "local-windows-cim"
        signed = $false
        note   = "MVP collector report. Report signing will be added before production use."
    }
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $safeSerial = $serialNumber -replace '[^a-zA-Z0-9_-]', '-'
    $OutputPath = Join-Path -Path (Get-Location) -ChildPath ("device-report-{0}.json" -f $safeSerial)
}

$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
Write-Host "DevicePassport report created:" -ForegroundColor Green
Write-Host (Resolve-Path -LiteralPath $OutputPath)
