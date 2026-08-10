<#
  DevicePassport Windows Tester Agent V3

  Runs the built-in hardware collector, records the physical inspection,
  attaches device photos, signs the exact JSON report, and uploads it to a
  standalone DevicePassport server. Failed uploads are queued for retry.

  Start:
    powershell -ExecutionPolicy Bypass -File .\start-device-passport-tester.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:AppVersion = "0.3.0"
$script:Root = Join-Path $env:LOCALAPPDATA "DevicePassport"
$script:Queue = Join-Path $script:Root "queue"
$script:ConfigPath = Join-Path $script:Root "agent-config.json"
$script:CollectorPath = Join-Path $PSScriptRoot "collect-device-health.ps1"
$script:PhotoPaths = New-Object System.Collections.Generic.List[string]
New-Item -ItemType Directory -Path $script:Queue -Force | Out-Null

function ConvertTo-ProtectedToken {
    param([Parameter(Mandatory = $true)][string]$Token)
    $secure = ConvertTo-SecureString -String $Token -AsPlainText -Force
    return ConvertFrom-SecureString -SecureString $secure
}

function ConvertFrom-ProtectedToken {
    param([string]$ProtectedToken)
    if ([string]::IsNullOrWhiteSpace($ProtectedToken)) { return "" }
    try {
        $secure = ConvertTo-SecureString -String $ProtectedToken
        return (New-Object System.Net.NetworkCredential("", $secure)).Password
    }
    catch { return "" }
}

function Get-AgentConfig {
    if (-not (Test-Path -LiteralPath $script:ConfigPath)) { return @{ serverUrl = "http://localhost:3000"; token = "" } }
    try {
        $saved = Get-Content -LiteralPath $script:ConfigPath -Raw | ConvertFrom-Json
        return @{
            serverUrl = ([string]$saved.serverUrl).TrimEnd("/")
            token = ConvertFrom-ProtectedToken -ProtectedToken ([string]$saved.protectedToken)
        }
    }
    catch { return @{ serverUrl = "http://localhost:3000"; token = "" } }
}

function Save-AgentConfig {
    param([string]$ServerUrl, [string]$Token)
    $config = [ordered]@{
        serverUrl = $ServerUrl.TrimEnd("/")
        protectedToken = ConvertTo-ProtectedToken -Token $Token
        savedAt = (Get-Date).ToUniversalTime().ToString("o")
    }
    $config | ConvertTo-Json | Set-Content -LiteralPath $script:ConfigPath -Encoding UTF8
}

function Get-HmacSignature {
    param([Parameter(Mandatory = $true)][string]$Text, [Parameter(Mandatory = $true)][string]$Token)
    $hmac = New-Object System.Security.Cryptography.HMACSHA256
    try {
        $hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($Token)
        $hash = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Text))
        return ([System.BitConverter]::ToString($hash)).Replace("-", "").ToLowerInvariant()
    }
    finally { $hmac.Dispose() }
}

function Get-PhotoPayload {
    $photos = @()
    foreach ($path in $script:PhotoPaths) {
        $file = Get-Item -LiteralPath $path
        if ($file.Length -gt 2MB) { throw "$($file.Name) is larger than 2 MB." }
        $extension = $file.Extension.ToLowerInvariant()
        $mime = switch ($extension) { ".jpg" { "image/jpeg" } ".jpeg" { "image/jpeg" } ".png" { "image/png" } ".webp" { "image/webp" } default { throw "$($file.Name) is not a supported image." } }
        $photos += [ordered]@{ name = $file.Name; dataUrl = "data:$mime;base64,$([Convert]::ToBase64String([IO.File]::ReadAllBytes($file.FullName)))" }
    }
    return $photos
}

function Send-TestEnvelope {
    param([Parameter(Mandatory = $true)]$Envelope, [Parameter(Mandatory = $true)][string]$ServerUrl, [Parameter(Mandatory = $true)][string]$Token)
    $headers = @{ Authorization = "Bearer $Token" }
    try {
        Invoke-RestMethod -Uri "$($ServerUrl.TrimEnd('/'))/api/agent/test-runs" -Method Post -Headers $headers -ContentType "application/json" -Body ($Envelope | ConvertTo-Json -Depth 12 -Compress) -TimeoutSec 45 | Out-Null
        return $true
    }
    catch {
        $statusCode = 0
        try { $statusCode = [int]$_.Exception.Response.StatusCode } catch { $statusCode = 0 }
        if ($statusCode -eq 409) { return $true }
        throw
    }
}

function Save-QueuedEnvelope {
    param([Parameter(Mandatory = $true)]$Envelope, [Parameter(Mandatory = $true)][string]$ServerUrl)
    $queued = [ordered]@{ serverUrl = $ServerUrl.TrimEnd("/"); envelope = $Envelope; queuedAt = (Get-Date).ToUniversalTime().ToString("o") }
    $path = Join-Path $script:Queue ("test-{0}.json" -f ([guid]::NewGuid().ToString("N")))
    $queued | ConvertTo-Json -Depth 14 | Set-Content -LiteralPath $path -Encoding UTF8
    return $path
}

function Get-QueueCount {
    return @(Get-ChildItem -LiteralPath $script:Queue -Filter "*.json" -File -ErrorAction SilentlyContinue).Count
}

$config = Get-AgentConfig
$form = New-Object System.Windows.Forms.Form
$form.Text = "DevicePassport Windows Tester V3"
$form.Size = New-Object System.Drawing.Size(780, 720)
$form.MinimumSize = New-Object System.Drawing.Size(720, 650)
$form.StartPosition = "CenterScreen"
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$form.BackColor = [System.Drawing.Color]::FromArgb(244, 247, 243)

$title = New-Object System.Windows.Forms.Label
$title.Text = "DevicePassport Tester"
$title.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 20)
$title.Location = New-Object System.Drawing.Point(24, 18)
$title.AutoSize = $true
$form.Controls.Add($title)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Text = "One-click hardware collection, signed upload, and offline retry"
$subtitle.ForeColor = [System.Drawing.Color]::DimGray
$subtitle.Location = New-Object System.Drawing.Point(28, 58)
$subtitle.AutoSize = $true
$form.Controls.Add($subtitle)

function Add-FieldLabel([string]$Text, [int]$X, [int]$Y) {
    $label = New-Object System.Windows.Forms.Label
    $label.Text = $Text
    $label.Location = New-Object System.Drawing.Point($X, $Y)
    $label.AutoSize = $true
    $form.Controls.Add($label)
}

Add-FieldLabel "Server URL" 28 96
$serverBox = New-Object System.Windows.Forms.TextBox
$serverBox.Location = New-Object System.Drawing.Point(28, 117)
$serverBox.Size = New-Object System.Drawing.Size(330, 28)
$serverBox.Text = $config.serverUrl
$form.Controls.Add($serverBox)

Add-FieldLabel "Agent token (encrypted for this Windows user)" 378 96
$tokenBox = New-Object System.Windows.Forms.TextBox
$tokenBox.Location = New-Object System.Drawing.Point(378, 117)
$tokenBox.Size = New-Object System.Drawing.Size(350, 28)
$tokenBox.UseSystemPasswordChar = $true
$tokenBox.Text = $config.token
$form.Controls.Add($tokenBox)

$checkGroup = New-Object System.Windows.Forms.GroupBox
$checkGroup.Text = "Physical inspection"
$checkGroup.Location = New-Object System.Drawing.Point(28, 160)
$checkGroup.Size = New-Object System.Drawing.Size(700, 168)
$form.Controls.Add($checkGroup)

$checkDefinitions = [ordered]@{
    display = "Screen / hinges"
    keyboard = "Keyboard / trackpad"
    camera = "Webcam / microphone"
    audio = "Speakers / audio jack"
    ports = "USB / HDMI / charging"
    wireless = "Wi-Fi / Bluetooth"
}
$checkControls = @{}
$index = 0
foreach ($key in $checkDefinitions.Keys) {
    $column = $index % 2
    $row = [math]::Floor($index / 2)
    $x = 18 + ($column * 344)
    $y = 28 + ($row * 42)
    $label = New-Object System.Windows.Forms.Label
    $label.Text = $checkDefinitions[$key]
    $label.Location = New-Object System.Drawing.Point($x, ($y + 5))
    $label.Size = New-Object System.Drawing.Size(170, 22)
    $checkGroup.Controls.Add($label)
    $combo = New-Object System.Windows.Forms.ComboBox
    $combo.DropDownStyle = "DropDownList"
    $combo.Items.AddRange(@("Not checked", "Pass", "Fail"))
    $combo.SelectedIndex = 0
    $combo.Location = New-Object System.Drawing.Point(($x + 178), $y)
    $combo.Size = New-Object System.Drawing.Size(135, 26)
    $checkGroup.Controls.Add($combo)
    $checkControls[$key] = $combo
    $index++
}

Add-FieldLabel "Technician notes" 28 344
$notesBox = New-Object System.Windows.Forms.TextBox
$notesBox.Location = New-Object System.Drawing.Point(28, 365)
$notesBox.Size = New-Object System.Drawing.Size(700, 65)
$notesBox.Multiline = $true
$notesBox.MaxLength = 800
$form.Controls.Add($notesBox)

Add-FieldLabel "Device photos (maximum 4, 2 MB each)" 28 446
$photoList = New-Object System.Windows.Forms.ListBox
$photoList.Location = New-Object System.Drawing.Point(28, 469)
$photoList.Size = New-Object System.Drawing.Size(465, 70)
$form.Controls.Add($photoList)

$addPhotos = New-Object System.Windows.Forms.Button
$addPhotos.Text = "Add photos"
$addPhotos.Location = New-Object System.Drawing.Point(508, 469)
$addPhotos.Size = New-Object System.Drawing.Size(105, 30)
$form.Controls.Add($addPhotos)

$openCamera = New-Object System.Windows.Forms.Button
$openCamera.Text = "Open Camera"
$openCamera.Location = New-Object System.Drawing.Point(623, 469)
$openCamera.Size = New-Object System.Drawing.Size(105, 30)
$form.Controls.Add($openCamera)

$clearPhotos = New-Object System.Windows.Forms.Button
$clearPhotos.Text = "Clear photos"
$clearPhotos.Location = New-Object System.Drawing.Point(508, 509)
$clearPhotos.Size = New-Object System.Drawing.Size(220, 30)
$form.Controls.Add($clearPhotos)

$status = New-Object System.Windows.Forms.Label
$status.Text = "Ready. Queue: $(Get-QueueCount)"
$status.Location = New-Object System.Drawing.Point(28, 558)
$status.Size = New-Object System.Drawing.Size(700, 24)
$status.ForeColor = [System.Drawing.Color]::FromArgb(34, 92, 67)
$form.Controls.Add($status)

$progress = New-Object System.Windows.Forms.ProgressBar
$progress.Location = New-Object System.Drawing.Point(28, 585)
$progress.Size = New-Object System.Drawing.Size(700, 14)
$progress.Minimum = 0
$progress.Maximum = 100
$form.Controls.Add($progress)

$runButton = New-Object System.Windows.Forms.Button
$runButton.Text = "RUN FULL TEST + UPLOAD"
$runButton.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 10)
$runButton.Location = New-Object System.Drawing.Point(28, 616)
$runButton.Size = New-Object System.Drawing.Size(470, 38)
$runButton.BackColor = [System.Drawing.Color]::FromArgb(35, 91, 67)
$runButton.ForeColor = [System.Drawing.Color]::White
$runButton.FlatStyle = "Flat"
$form.Controls.Add($runButton)

$retryButton = New-Object System.Windows.Forms.Button
$retryButton.Text = "Retry offline queue"
$retryButton.Location = New-Object System.Drawing.Point(508, 616)
$retryButton.Size = New-Object System.Drawing.Size(220, 38)
$form.Controls.Add($retryButton)

function Set-TesterStatus([string]$Text, [int]$Percent) {
    $status.Text = $Text
    $progress.Value = [math]::Max(0, [math]::Min(100, $Percent))
    [System.Windows.Forms.Application]::DoEvents()
}

$addPhotos.Add_Click({
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Filter = "Device photos|*.jpg;*.jpeg;*.png;*.webp"
    $dialog.Multiselect = $true
    if ($dialog.ShowDialog() -eq "OK") {
        foreach ($path in $dialog.FileNames) {
            if ($script:PhotoPaths.Count -ge 4) { break }
            if (-not $script:PhotoPaths.Contains($path)) { $script:PhotoPaths.Add($path); $photoList.Items.Add([IO.Path]::GetFileName($path)) | Out-Null }
        }
    }
})

$openCamera.Add_Click({
    try { Start-Process "microsoft.windows.camera:" } catch { [System.Windows.Forms.MessageBox]::Show("Windows Camera could not be opened. Use Add photos to select an existing image.", "DevicePassport") | Out-Null }
})

$clearPhotos.Add_Click({ $script:PhotoPaths.Clear(); $photoList.Items.Clear() })

$retryButton.Add_Click({
    try {
        $serverUrl = $serverBox.Text.Trim().TrimEnd("/")
        $token = $tokenBox.Text.Trim()
        if (-not $serverUrl -or -not $token) { throw "Enter the server URL and agent token first." }
        Save-AgentConfig -ServerUrl $serverUrl -Token $token
        $files = @(Get-ChildItem -LiteralPath $script:Queue -Filter "*.json" -File -ErrorAction SilentlyContinue)
        if ($files.Count -eq 0) { Set-TesterStatus "Offline queue is empty." 0; return }
        $completed = 0
        foreach ($file in $files) {
            Set-TesterStatus "Retrying queued upload $($completed + 1) of $($files.Count)..." ([math]::Round(($completed / $files.Count) * 100))
            $queued = Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
            if (Send-TestEnvelope -Envelope $queued.envelope -ServerUrl ([string]$queued.serverUrl) -Token $token) { Remove-Item -LiteralPath $file.FullName -Force; $completed++ }
        }
        Set-TesterStatus "Uploaded $completed queued report(s). Queue: $(Get-QueueCount)" 100
    }
    catch { Set-TesterStatus "Retry stopped: $($_.Exception.Message)" 0 }
})

$runButton.Add_Click({
    $runButton.Enabled = $false
    $retryButton.Enabled = $false
    $temporaryReport = Join-Path $env:TEMP ("devicepassport-{0}.json" -f ([guid]::NewGuid().ToString("N")))
    try {
        $serverUrl = $serverBox.Text.Trim().TrimEnd("/")
        $token = $tokenBox.Text.Trim()
        if (-not [uri]::IsWellFormedUriString($serverUrl, [UriKind]::Absolute)) { throw "Enter a valid DevicePassport server URL." }
        if ($token -notmatch '^agent_[^.]+\..+$') { throw "Paste the complete tester agent token from Owner Settings." }
        $checks = [ordered]@{}
        foreach ($key in $checkDefinitions.Keys) {
            $value = [string]$checkControls[$key].SelectedItem
            if ($value -ne "Pass" -and $value -ne "Fail") { throw "Complete every physical inspection result before running the test." }
            $checks[$key] = $value.ToLowerInvariant()
        }
        Save-AgentConfig -ServerUrl $serverUrl -Token $token
        if (-not (Test-Path -LiteralPath $script:CollectorPath)) { throw "The hardware collector was not found beside this agent script." }

        Set-TesterStatus "1/4 Collecting battery, SSD, memory, CPU and BIOS data..." 15
        & $script:CollectorPath -OutputPath $temporaryReport -StressSeconds 10 | Out-Null
        $report = Get-Content -LiteralPath $temporaryReport -Raw | ConvertFrom-Json
        $report.reportVersion = "3.0"
        $report.collector.name = "DevicePassport Windows Tester Agent"
        $report.collector.version = $script:AppVersion
        $report.integrity.source = "devicepassport-windows-agent"
        $report.integrity.signed = $true
        $report.integrity.note = "The exact compact report JSON is signed with the station credential and verified by the server."
        $reportJson = $report | ConvertTo-Json -Depth 10 -Compress

        Set-TesterStatus "2/4 Preparing physical checks and device photos..." 55
        $photos = @(Get-PhotoPayload)
        $signature = Get-HmacSignature -Text $reportJson -Token $token
        $envelope = [ordered]@{
            reportJson = $reportJson
            signature = $signature
            checks = $checks
            notes = $notesBox.Text.Trim()
            photos = $photos
        }

        Set-TesterStatus "3/4 Uploading signed report to DevicePassport..." 78
        try {
            Send-TestEnvelope -Envelope $envelope -ServerUrl $serverUrl -Token $token | Out-Null
            Set-TesterStatus "4/4 Upload verified. Open New device test in the dashboard." 100
            [System.Windows.Forms.MessageBox]::Show("The signed report is now waiting in the dashboard Connected reports inbox.", "DevicePassport upload complete") | Out-Null
        }
        catch {
            Save-QueuedEnvelope -Envelope $envelope -ServerUrl $serverUrl | Out-Null
            Set-TesterStatus "Offline: report saved safely. Queue: $(Get-QueueCount)" 100
            [System.Windows.Forms.MessageBox]::Show("Upload failed, so the signed report was saved to the offline queue. Use Retry offline queue when the server is reachable.", "DevicePassport offline queue") | Out-Null
        }
    }
    catch { Set-TesterStatus "Test stopped: $($_.Exception.Message)" 0; [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "DevicePassport error") | Out-Null }
    finally {
        Remove-Item -LiteralPath $temporaryReport -Force -ErrorAction SilentlyContinue
        $runButton.Enabled = $true
        $retryButton.Enabled = $true
    }
})

[void]$form.ShowDialog()
