<#
  DevicePassport Universal Windows Hardware Collector (Tester V2.5)
  Compatible with all PC Laptop & Desktop brands: Dell, Lenovo, HP, Asus, Acer, Surface, MSI.
  
  Features:
  - Resilient Battery Health & Multi-Battery detection (e.g. ThinkPad / Surface dual batteries)
  - powercfg XML fallback for non-elevated Windows 11 accounts
  - Desktop / Workstation AC power detection
  - Dedicated & Integrated GPU detection (NVIDIA GeForce, AMD Radeon, Intel Iris/UHD)
  - Display Resolution & Refresh Rate
  - Motherboard RAM slots, used count, free upgradeable slots, and speed
  - SSD / NVMe / RAID storage reliability and SMART status
  - Wi-Fi & Bluetooth adapter identification
  - Non-BOM standard UTF-8 JSON output conforming to DevicePassport schema
#>

[CmdletBinding()]
param(
    [string]$OutputPath,
    [ValidateRange(0, 60)][int]$StressSeconds = 10
)

$ErrorActionPreference = "SilentlyContinue"

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

# 1. Base Computer & OS Identity
$computer = Get-SafeCimInstance -ClassName "Win32_ComputerSystem" | Select-Object -First 1
$bios = Get-SafeCimInstance -ClassName "Win32_BIOS" | Select-Object -First 1
$processor = Get-SafeCimInstance -ClassName "Win32_Processor" | Select-Object -First 1
$operatingSystem = Get-SafeCimInstance -ClassName "Win32_OperatingSystem" | Select-Object -First 1
$physicalMemory = @(Get-SafeCimInstance -ClassName "Win32_PhysicalMemory")
$disks = @(Get-SafeCimInstance -ClassName "Win32_DiskDrive")
$physicalDisks = @()
try { $physicalDisks = @(Get-PhysicalDisk -ErrorAction Stop) } catch { $physicalDisks = @() }
$systemRegistry = Get-SafeRegistryProperties -Path "HKLM:\HARDWARE\DESCRIPTION\System\BIOS"
$cpuRegistry = Get-SafeRegistryProperties -Path "HKLM:\HARDWARE\DESCRIPTION\System\CentralProcessor\0"

# 2. Resilient Multi-Battery Detection & Fallback
$batteryStaticList = @(Get-SafeCimInstance -Namespace "root/wmi" -ClassName "BatteryStaticData")
$batteryFullList = @(Get-SafeCimInstance -Namespace "root/wmi" -ClassName "BatteryFullChargedCapacity")
$batteryCycleList = @(Get-SafeCimInstance -Namespace "root/wmi" -ClassName "BatteryCycleCount")
$batteryStatusList = @(Get-SafeCimInstance -Namespace "root/wmi" -ClassName "BatteryStatus")

$totalDesignCapacity = 0.0
$totalFullCapacity = 0.0
$batteryArray = @()
$maxCycleCount = 0
$isCharging = $false

if ($batteryStaticList.Count -gt 0 -and $batteryFullList.Count -gt 0) {
    for ($i = 0; $i -lt $batteryStaticList.Count; $i++) {
        $des = [double]$batteryStaticList[$i].DesignedCapacity
        $ful = if ($i -lt $batteryFullList.Count) { [double]$batteryFullList[$i].FullChargedCapacity } else { 0.0 }
        $cyc = if ($i -lt $batteryCycleList.Count) { [int]$batteryCycleList[$i].CycleCount } else { 0 }
        if ($des -gt 0) {
            $totalDesignCapacity += $des
            $totalFullCapacity += $ful
            if ($cyc -gt $maxCycleCount) { $maxCycleCount = $cyc }
            $h = if ($ful -gt 0) { [math]::Min(100, [math]::Round(($ful / $des) * 100)) } else { 0 }
            $batteryArray += [ordered]@{
                index = $i + 1
                designCapacityMWh = $des
                fullChargeCapacityMWh = $ful
                healthPercent = $h
                cycleCount = $cyc
            }
        }
    }
}

if ($batteryStatusList.Count -gt 0) {
    $isCharging = [bool]$batteryStatusList[0].Charging
}

# Resilient fallback via powercfg XML (bypasses restricted root/wmi in Windows 11 / Dell / Lenovo)
if ($totalDesignCapacity -le 0 -or $totalFullCapacity -le 0) {
    try {
        $xmlTemp = Join-Path $env:TEMP ("dpreport_" + [guid]::NewGuid().ToString() + ".xml")
        $p = Start-Process -FilePath "powercfg.exe" -ArgumentList ("/batteryreport", "/xml", "/output", "`"$xmlTemp`"") -NoNewWindow -Wait -PassThru
        if (Test-Path -LiteralPath $xmlTemp) {
            [xml]$xml = Get-Content -LiteralPath $xmlTemp -Raw
            $batteries = @($xml.BatteryReport.Batteries.Battery)
            if ($batteries.Count -gt 0) {
                $totalDesignCapacity = 0.0
                $totalFullCapacity = 0.0
                $batteryArray = @()
                $idx = 1
                foreach ($b in $batteries) {
                    $d = [double]$b.DesignCapacity
                    $f = [double]$b.FullChargeCapacity
                    $c = [int]$b.CycleCount
                    if ($d -gt 0) {
                        $totalDesignCapacity += $d
                        $totalFullCapacity += $f
                        if ($c -gt $maxCycleCount) { $maxCycleCount = $c }
                        $h = if ($f -gt 0) { [math]::Min(100, [math]::Round(($f / $d) * 100)) } else { 0 }
                        $batteryArray += [ordered]@{
                            index = $idx
                            designCapacityMWh = $d
                            fullChargeCapacityMWh = $f
                            healthPercent = $h
                            cycleCount = $c
                        }
                        $idx++
                    }
                }
            }
        }
    }
    catch {}
    finally {
        if ($null -ne $xmlTemp -and (Test-Path -LiteralPath $xmlTemp)) { Remove-Item -LiteralPath $xmlTemp -Force -ErrorAction SilentlyContinue }
    }
}

$hasBattery = ($totalDesignCapacity -gt 0 -or $totalFullCapacity -gt 0 -or $batteryArray.Count -gt 0)
$combinedBatteryHealth = if ($hasBattery -and $totalDesignCapacity -gt 0 -and $totalFullCapacity -gt 0) {
    [math]::Min(100, [math]::Round(($totalFullCapacity / $totalDesignCapacity) * 100))
} else { $null }

# 3. RAM Modules & Motherboard Expansion Slots
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

$memArray = Get-SafeCimInstance -ClassName "Win32_PhysicalMemoryArray" | Select-Object -First 1
$totalRamSlots = if ($null -ne $memArray -and $memArray.MemoryDevices) { [int]$memArray.MemoryDevices } else { $physicalMemory.Count }
$usedRamSlots = $physicalMemory.Count
$freeRamSlots = [math]::Max(0, $totalRamSlots - $usedRamSlots)
$ramSpeed = if ($physicalMemory.Count -gt 0 -and $physicalMemory[0].ConfiguredClockSpeed) {
    [int]$physicalMemory[0].ConfiguredClockSpeed
} elseif ($physicalMemory.Count -gt 0 -and $physicalMemory[0].Speed) {
    [int]$physicalMemory[0].Speed
} else { $null }

# 4. Storage Drives with SMART Telemetry
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
    $resolvedMediaType = if ($null -ne $matchingPhysicalDisk -and -not [string]::IsNullOrWhiteSpace($matchingPhysicalDisk.MediaType) -and $matchingPhysicalDisk.MediaType -ne "Unspecified") {
        [string]$matchingPhysicalDisk.MediaType
    } elseif (-not [string]::IsNullOrWhiteSpace($disk.MediaType)) {
        [string]$disk.MediaType
    } else {
        "Unknown"
    }
    $resolvedInterface = if ($null -ne $matchingPhysicalDisk -and -not [string]::IsNullOrWhiteSpace($matchingPhysicalDisk.BusType)) {
        [string]$matchingPhysicalDisk.BusType
    } else {
        [string]$disk.InterfaceType
    }
    $resolvedHealth = if ($null -ne $matchingPhysicalDisk -and -not [string]::IsNullOrWhiteSpace($matchingPhysicalDisk.HealthStatus)) {
        [string]$matchingPhysicalDisk.HealthStatus
    } elseif ([string]::IsNullOrWhiteSpace([string]$disk.Status)) {
        "Unknown"
    } else {
        [string]$disk.Status
    }
    $diskReports += [ordered]@{
        model        = [string]$disk.Model
        serialNumber = ([string]$disk.SerialNumber).Trim()
        interface    = $resolvedInterface
        mediaType    = $resolvedMediaType
        sizeGB       = Convert-BytesToGB -Bytes ([double]$disk.Size)
        healthStatus = $resolvedHealth
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
    catch {}
}

# 5. Dedicated & Integrated GPUs & Display
$videoControllers = @(Get-SafeCimInstance -ClassName "Win32_VideoController")
$gpus = @()
$primaryResolution = $null
foreach ($gpu in $videoControllers) {
    $gpuName = [string]$gpu.Name
    if ([string]::IsNullOrWhiteSpace($gpuName) -or $gpuName -match "Remote|Virtual|Mirror|VNC|Citrix|TeamViewer") { continue }
    $vramBytes = [double]$gpu.AdapterRAM
    $vramGB = if ($vramBytes -gt 0) { [math]::Round($vramBytes / 1GB, 1) } else { $null }
    $res = if ($gpu.CurrentHorizontalResolution -gt 0) { ("{0}x{1} @ {2}Hz" -f $gpu.CurrentHorizontalResolution, $gpu.CurrentVerticalResolution, $gpu.CurrentRefreshRate) } else { $null }
    if ($null -ne $res -and $null -eq $primaryResolution) { $primaryResolution = $res }
    $gpus += [ordered]@{
        name          = $gpuName
        vramGB        = $vramGB
        driverVersion = [string]$gpu.DriverVersion
        resolution    = $res
    }
}

# 6. Wireless & Network Hardware
$wifiAdapter = Get-SafeCimInstance -ClassName "Win32_NetworkAdapter" |
    Where-Object { $_.Name -like "*Wireless*" -or $_.Name -like "*Wi-Fi*" -or $_.Name -like "*802.11*" } |
    Select-Object -First 1
$bluetoothAdapter = Get-SafeCimInstance -ClassName "Win32_NetworkAdapter" |
    Where-Object { $_.Name -like "*Bluetooth*" } |
    Select-Object -First 1

# 7. CPU Stress Test & Thermals
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

$primaryGpuName = if ($gpus.Count -gt 0) { $gpus[0].name } else { "Generic Display Adapter" }

$report = [ordered]@{
    reportVersion = "2.5"
    collectedAt   = (Get-Date).ToUniversalTime().ToString("o")
    collector     = [ordered]@{
        name     = "DevicePassport Universal Windows Collector"
        version  = "2.5.0"
        hostname = $env:COMPUTERNAME
    }
    device        = [ordered]@{
        manufacturer       = $manufacturer
        model              = $model
        serialNumber       = $serialNumber
        processor          = $processorName
        gpu                = $primaryGpuName
        gpus               = $gpus
        displayResolution  = $primaryResolution
        memoryGB           = Convert-BytesToGB -Bytes $memoryBytes
        ramSlotsTotal      = $totalRamSlots
        ramSlotsUsed       = $usedRamSlots
        ramSlotsFree       = $freeRamSlots
        ramSpeedMT         = $ramSpeed
        biosVersion        = (@($bios.SMBIOSBIOSVersion) -join ", ")
        operatingSystem    = [string]$operatingSystem.Caption
        wifiAdapter        = if ($null -ne $wifiAdapter) { [string]$wifiAdapter.Name } else { $null }
        bluetoothPresent   = ($null -ne $bluetoothAdapter)
        isDesktop          = (-not $hasBattery)
    }
    battery       = [ordered]@{
        present             = $hasBattery
        designedCapacityMWh  = if ($totalDesignCapacity -gt 0) { $totalDesignCapacity } else { $null }
        fullChargeCapacityMWh= if ($totalFullCapacity -gt 0) { $totalFullCapacity } else { $null }
        healthPercent       = $combinedBatteryHealth
        cycleCount          = if ($maxCycleCount -gt 0) { $maxCycleCount } else { $null }
        charging            = $isCharging
        batteries           = $batteryArray
        note                = if (-not $hasBattery) { "No battery detected (Desktop / AC Mains Power)" } else { $null }
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
        note   = "Tester V2.5 report. Temperature and SMART fields remain null when firmware restricts non-elevated queries. UTF-8 No-BOM standard."
    }
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $safeSerial = $serialNumber -replace '[^a-zA-Z0-9_-]', '-'
    $OutputPath = Join-Path -Path (Get-Location) -ChildPath ("device-report-{0}.json" -f $safeSerial)
}

$jsonContent = $report | ConvertTo-Json -Depth 8
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($OutputPath, $jsonContent, $utf8NoBom)
Write-Host "DevicePassport report created:" -ForegroundColor Green
Write-Host (Resolve-Path -LiteralPath $OutputPath)
