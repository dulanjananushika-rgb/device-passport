<#
  DevicePassport Windows Collector (Tester V2)
  Reads hardware health data using built-in Windows interfaces and creates a
  JSON report that can be imported into the DevicePassport web dashboard.

  Usage:
    powershell -ExecutionPolicy Bypass -File .\collect-device-health.ps1
    powershell -ExecutionPolicy Bypass -File .\collect-device-health.ps1 -OutputPath C:\Reports\device.json
    powershell -ExecutionPolicy Bypass -File .\collect-device-health.ps1 -StressSeconds 20
#>

[CmdletBinding()]
param(
    [string]$OutputPath,
    [ValidateRange(0, 60)][int]$StressSeconds = 10
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

function Get-CpuTemperatureC {
    $temperatures = @()
    foreach ($zone in @(Get-SafeCimInstance -Namespace "root/wmi" -ClassName "MSAcpi_ThermalZoneTemperature")) {
        $raw = [double]$zone.CurrentTemperature
        if ($raw -gt 0) {
            $celsius = [math]::Round(($raw / 10) - 273.15, 1)
            if ($celsius -ge -20 -and $celsius -le 150) { $temperatures += $celsius }
        }
    }
    if ($temperatures.Count -eq 0) { return $null }
    return [math]::Round(($temperatures | Measure-Object -Average).Average, 1)
}

function Get-CpuLoadPercent {
    $loads = @(
        Get-SafeCimInstance -ClassName "Win32_Processor" |
            ForEach-Object { if ($null -ne $_.LoadPercentage) { [double]$_.LoadPercentage } }
    )
    if ($loads.Count -gt 0) { return [math]::Round(($loads | Measure-Object -Average).Average, 1) }
    $total = Get-SafeCimInstance -ClassName "Win32_PerfFormattedData_PerfOS_Processor" |
        Where-Object { $_.Name -eq "_Total" } |
        Select-Object -First 1
    if ($null -ne $total -and $null -ne $total.PercentProcessorTime) { return [math]::Round([double]$total.PercentProcessorTime, 1) }
    return $null
}

$computer = Get-SafeCimInstance -ClassName "Win32_ComputerSystem" | Select-Object -First 1
$bios = Get-SafeCimInstance -ClassName "Win32_BIOS" | Select-Object -First 1
$processor = Get-SafeCimInstance -ClassName "Win32_Processor" | Select-Object -First 1
$operatingSystem = Get-SafeCimInstance -ClassName "Win32_OperatingSystem" | Select-Object -First 1
$physicalMemory = Get-SafeCimInstance -ClassName "Win32_PhysicalMemory"
$disks = Get-SafeCimInstance -ClassName "Win32_DiskDrive"
$physicalDisks = @()
try { $physicalDisks = @(Get-PhysicalDisk -ErrorAction Stop) } catch { $physicalDisks = @() }
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

$memoryAvailableGB = if ($null -ne $operatingSystem -and $operatingSystem.FreePhysicalMemory) {
    [math]::Round(([double]$operatingSystem.FreePhysicalMemory * 1KB) / 1GB, 1)
} else { $null }
$memoryUsedPercent = if ($memoryBytes -gt 0 -and $null -ne $memoryAvailableGB) {
    [math]::Max(0, [math]::Min(100, [math]::Round((1 - (($memoryAvailableGB * 1GB) / $memoryBytes)) * 100, 1)))
} else { $null }

$diskReports = @()
foreach ($disk in $disks) {
    $matchingPhysicalDisk = $physicalDisks | Where-Object {
        (([string]$_.SerialNumber).Trim() -and ([string]$_.SerialNumber).Trim() -eq ([string]$disk.SerialNumber).Trim()) -or
        (([string]$_.FriendlyName).Trim() -and ([string]$disk.Model).Trim() -like "*$(([string]$_.FriendlyName).Trim())*")
    } | Select-Object -First 1
    $reliability = $null
    if ($null -ne $matchingPhysicalDisk) {
        try { $reliability = $matchingPhysicalDisk | Get-StorageReliabilityCounter -ErrorAction Stop } catch { $reliability = $null }
    }
    $diskReports += [ordered]@{
        model        = [string]$disk.Model
        serialNumber = ([string]$disk.SerialNumber).Trim()
        interface    = [string]$disk.InterfaceType
        mediaType    = [string]$disk.MediaType
        sizeGB       = Convert-BytesToGB -Bytes ([double]$disk.Size)
        healthStatus = if ([string]::IsNullOrWhiteSpace([string]$disk.Status)) { "Unknown" } else { [string]$disk.Status }
        powerOnHours  = if ($null -ne $reliability -and $null -ne $reliability.PowerOnHours) { [long]$reliability.PowerOnHours } else { $null }
        temperatureC = if ($null -ne $reliability -and $null -ne $reliability.Temperature) { [double]$reliability.Temperature } else { $null }
        wearPercent   = if ($null -ne $reliability -and $null -ne $reliability.Wear) { [double]$reliability.Wear } else { $null }
        smartSource   = if ($null -ne $reliability) { "Windows Storage Reliability Counter" } else { "Unavailable" }
    }
}

if ($diskReports.Count -eq 0) {
    try {
        foreach ($disk in @(Get-PhysicalDisk -ErrorAction Stop)) {
            $reliability = $null
            try { $reliability = $disk | Get-StorageReliabilityCounter -ErrorAction Stop } catch { $reliability = $null }
            $diskReports += [ordered]@{
                model        = [string]$disk.FriendlyName
                serialNumber = ([string]$disk.SerialNumber).Trim()
                interface    = [string]$disk.BusType
                mediaType    = [string]$disk.MediaType
                sizeGB       = Convert-BytesToGB -Bytes ([double]$disk.Size)
                healthStatus = [string]$disk.HealthStatus
                powerOnHours  = if ($null -ne $reliability -and $null -ne $reliability.PowerOnHours) { [long]$reliability.PowerOnHours } else { $null }
                temperatureC = if ($null -ne $reliability -and $null -ne $reliability.Temperature) { [double]$reliability.Temperature } else { $null }
                wearPercent   = if ($null -ne $reliability -and $null -ne $reliability.Wear) { [double]$reliability.Wear } else { $null }
                smartSource   = if ($null -ne $reliability) { "Windows Storage Reliability Counter" } else { "Unavailable" }
            }
        }
    }
    catch {
        # Some restricted Windows accounts cannot query the Storage subsystem.
    }
}

$cpuLoadBefore = Get-CpuLoadPercent
$cpuTemperatureBefore = Get-CpuTemperatureC
$stress = [ordered]@{
    executed          = $false
    durationSeconds   = $StressSeconds
    passed            = $null
    averageLoadPercent = $null
    peakTemperatureC  = $null
    sampleCount       = 0
    workerCount       = 0
    completedWorkers  = 0
    note              = if ($StressSeconds -eq 0) { "Stress test skipped by technician." } else { "Not started." }
}

if ($StressSeconds -gt 0) {
    $jobs = @()
    $loadSamples = @()
    $temperatureSamples = @()
    try {
        $logicalProcessors = [math]::Max(1, [int]$computer.NumberOfLogicalProcessors)
        $workerCount = [math]::Min(4, $logicalProcessors)
        $stress.workerCount = $workerCount
        for ($worker = 0; $worker -lt $workerCount; $worker++) {
            $jobs += Start-Job -ScriptBlock {
                param([int]$Duration)
                $deadline = [DateTime]::UtcNow.AddSeconds($Duration)
                $seed = 2.0
                while ([DateTime]::UtcNow -lt $deadline) {
                    for ($index = 1; $index -le 25000; $index++) {
                        $seed = [math]::Sqrt(($seed * $seed) + $index)
                    }
                }
            } -ArgumentList $StressSeconds
        }

        $sampleDeadline = [DateTime]::UtcNow.AddSeconds($StressSeconds)
        while ([DateTime]::UtcNow -lt $sampleDeadline) {
            Start-Sleep -Seconds 1
            $load = Get-CpuLoadPercent
            $temperature = Get-CpuTemperatureC
            if ($null -ne $load) { $loadSamples += $load }
            if ($null -ne $temperature) { $temperatureSamples += $temperature }
        }
        $jobs | Wait-Job | Out-Null
        $failedJobs = @($jobs | Where-Object { $_.State -ne "Completed" }).Count
        $completedJobs = @($jobs | Where-Object { $_.State -eq "Completed" }).Count
        $stress.executed = $true
        $stress.completedWorkers = $completedJobs
        $stress.passed = ($failedJobs -eq 0 -and $completedJobs -eq $workerCount)
        $stress.averageLoadPercent = if ($loadSamples.Count -gt 0) { [math]::Round(($loadSamples | Measure-Object -Average).Average, 1) } else { $null }
        $stress.peakTemperatureC = if ($temperatureSamples.Count -gt 0) { [math]::Round(($temperatureSamples | Measure-Object -Maximum).Maximum, 1) } else { $null }
        $stress.sampleCount = [math]::Max($loadSamples.Count, $temperatureSamples.Count)
        $stress.note = if ($failedJobs -eq 0) {
            if ($temperatureSamples.Count -gt 0) { "CPU load workers completed without an execution error." } else { "CPU load workers completed; this device did not expose a temperature sensor through Windows ACPI." }
        } else { "$failedJobs CPU load worker(s) did not complete." }
    }
    catch {
        $stress.executed = $true
        $stress.passed = $false
        $stress.note = "Stress test error: $($_.Exception.Message)"
    }
    finally {
        if ($jobs.Count -gt 0) { $jobs | Remove-Job -Force -ErrorAction SilentlyContinue }
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
    reportVersion = "2.0"
    collectedAt   = (Get-Date).ToUniversalTime().ToString("o")
    collector     = [ordered]@{
        name     = "DevicePassport Windows Collector"
        version  = "0.2.0"
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
    performance   = [ordered]@{
        memory = [ordered]@{
            availableGB = $memoryAvailableGB
            usedPercent = $memoryUsedPercent
        }
        cpu = [ordered]@{
            logicalProcessors      = if ($null -ne $computer) { [int]$computer.NumberOfLogicalProcessors } else { $null }
            loadPercentBeforeTest  = $cpuLoadBefore
            temperatureCBeforeTest = $cpuTemperatureBefore
        }
        stressTest = $stress
    }
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
        note   = "Tester V2 report. Temperature and SMART fields remain null when Windows or the device firmware does not expose them. Report signing will be added before production use."
    }
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $safeSerial = $serialNumber -replace '[^a-zA-Z0-9_-]', '-'
    $OutputPath = Join-Path -Path (Get-Location) -ChildPath ("device-report-{0}.json" -f $safeSerial)
}

$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
Write-Host "DevicePassport report created:" -ForegroundColor Green
Write-Host (Resolve-Path -LiteralPath $OutputPath)
