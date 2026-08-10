<# DevicePassport Tester V4 interactive hardware checks. Dot-source this file from the agent. #>

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function New-DpTestResult {
    param(
        [Parameter(Mandatory = $true)][ValidateSet("pass", "fail", "not-run")][string]$Status,
        [Parameter(Mandatory = $true)][string]$Detail,
        [hashtable]$Metrics = @{},
        [string]$PhotoPath = ""
    )
    return [pscustomobject]@{
        status = $Status
        detail = $Detail
        metrics = $Metrics
        photoPath = $PhotoPath
        completedAt = (Get-Date).ToUniversalTime().ToString("o")
    }
}

function Invoke-DpScreenTest {
    $form = New-Object System.Windows.Forms.Form
    $form.Text = "DevicePassport - Screen test"
    $form.WindowState = "Maximized"
    $form.FormBorderStyle = "None"
    $form.TopMost = $true
    $form.KeyPreview = $true
    $form.BackColor = [Drawing.Color]::Black

    $state = @{ index = 0; status = "not-run" }
    $colors = @(
        @{ name = "Black"; color = [Drawing.Color]::Black; foreground = [Drawing.Color]::White },
        @{ name = "White"; color = [Drawing.Color]::White; foreground = [Drawing.Color]::Black },
        @{ name = "Red"; color = [Drawing.Color]::Red; foreground = [Drawing.Color]::White },
        @{ name = "Green"; color = [Drawing.Color]::Lime; foreground = [Drawing.Color]::Black },
        @{ name = "Blue"; color = [Drawing.Color]::Blue; foreground = [Drawing.Color]::White },
        @{ name = "Mid grey"; color = [Drawing.Color]::Gray; foreground = [Drawing.Color]::White }
    )
    $instructions = New-Object System.Windows.Forms.Label
    $instructions.AutoSize = $false
    $instructions.Dock = "Top"
    $instructions.Height = 62
    $instructions.TextAlign = "MiddleCenter"
    $instructions.Font = New-Object Drawing.Font("Segoe UI Semibold", 14)
    $form.Controls.Add($instructions)

    $actions = New-Object System.Windows.Forms.FlowLayoutPanel
    $actions.Dock = "Bottom"
    $actions.Height = 64
    $actions.FlowDirection = "LeftToRight"
    $actions.Padding = New-Object Windows.Forms.Padding(20, 12, 0, 0)
    $form.Controls.Add($actions)
    $next = New-Object System.Windows.Forms.Button
    $next.Text = "Next colour (Space)"
    $next.Size = New-Object Drawing.Size(170, 34)
    $pass = New-Object System.Windows.Forms.Button
    $pass.Text = "No defects - Pass"
    $pass.Size = New-Object Drawing.Size(170, 34)
    $pass.Enabled = $false
    $fail = New-Object System.Windows.Forms.Button
    $fail.Text = "Defect found - Fail"
    $fail.Size = New-Object Drawing.Size(170, 34)
    $actions.Controls.AddRange(@($next, $pass, $fail))

    $showColor = {
        $item = $colors[$state.index]
        $form.BackColor = $item.color
        $instructions.BackColor = $item.color
        $instructions.ForeColor = $item.foreground
        $instructions.Text = "$($item.name) screen - inspect every edge and pixel. Space moves to the next colour."
    }
    $advance = {
        if ($state.index -lt ($colors.Count - 1)) { $state.index++; & $showColor }
        else { $pass.Enabled = $true; $instructions.Text = "All six colours displayed. Choose Pass or Fail." }
    }
    $next.Add_Click($advance)
    $form.Add_KeyDown({
        param($sender, $event)
        if ($event.KeyCode -eq [Windows.Forms.Keys]::Space) { & $advance; $event.SuppressKeyPress = $true }
        elseif ($event.KeyCode -eq [Windows.Forms.Keys]::Escape) { $form.Close() }
    })
    $pass.Add_Click({ $state.status = "pass"; $form.Close() })
    $fail.Add_Click({ $state.status = "fail"; $form.Close() })
    & $showColor
    [void]$form.ShowDialog()
    if ($state.status -eq "pass") { return New-DpTestResult -Status pass -Detail "Six full-screen solid colours inspected; no pixel, brightness, or panel defects marked." -Metrics @{ colorsShown = $colors.Count } }
    if ($state.status -eq "fail") { return New-DpTestResult -Status fail -Detail "A screen or pixel defect was marked during the six-colour panel inspection." -Metrics @{ colorsShown = ($state.index + 1) } }
    return New-DpTestResult -Status not-run -Detail "Screen test was closed before a result was approved." -Metrics @{ colorsShown = ($state.index + 1) }
}

function Invoke-DpKeyboardTest {
    $required = New-Object System.Collections.Generic.List[string]
    foreach ($letter in [char[]]"ABCDEFGHIJKLMNOPQRSTUVWXYZ") { $required.Add([string]$letter) }
    foreach ($number in 0..9) { $required.Add([string]$number) }
    foreach ($functionKey in 1..12) { $required.Add("F$functionKey") }
    @("Left", "Right", "Up", "Down", "Space", "Enter", "Tab", "Backspace", "Shift", "Ctrl", "Alt", "Escape") | ForEach-Object { $required.Add($_) }
    $pressed = New-Object 'System.Collections.Generic.HashSet[string]'
    $chips = @{}
    $state = @{ status = "not-run" }

    $form = New-Object Windows.Forms.Form
    $form.Text = "DevicePassport - Keyboard test"
    $form.Size = New-Object Drawing.Size(820, 600)
    $form.MinimumSize = New-Object Drawing.Size(720, 520)
    $form.StartPosition = "CenterScreen"
    $form.KeyPreview = $true
    $form.Font = New-Object Drawing.Font("Segoe UI", 9)
    $heading = New-Object Windows.Forms.Label
    $heading.Dock = "Top"
    $heading.Height = 62
    $heading.Padding = New-Object Windows.Forms.Padding(18, 15, 0, 0)
    $heading.Font = New-Object Drawing.Font("Segoe UI Semibold", 13)
    $form.Controls.Add($heading)
    $panel = New-Object Windows.Forms.FlowLayoutPanel
    $panel.Dock = "Fill"
    $panel.Padding = New-Object Windows.Forms.Padding(16)
    $panel.AutoScroll = $true
    $panel.WrapContents = $true
    $form.Controls.Add($panel)
    $actions = New-Object Windows.Forms.FlowLayoutPanel
    $actions.Dock = "Bottom"
    $actions.Height = 62
    $actions.Padding = New-Object Windows.Forms.Padding(16, 12, 0, 0)
    $form.Controls.Add($actions)
    $pass = New-Object Windows.Forms.Button
    $pass.Text = "All keys detected - Pass"
    $pass.Size = New-Object Drawing.Size(190, 34)
    $pass.Enabled = $false
    $fail = New-Object Windows.Forms.Button
    $fail.Text = "Missing / faulty key - Fail"
    $fail.Size = New-Object Drawing.Size(190, 34)
    $cancel = New-Object Windows.Forms.Button
    $cancel.Text = "Cancel"
    $cancel.Size = New-Object Drawing.Size(100, 34)
    $actions.Controls.AddRange(@($pass, $fail, $cancel))
    foreach ($key in $required) {
        $chip = New-Object Windows.Forms.Label
        $chip.Text = $key
        $chip.TextAlign = "MiddleCenter"
        $chip.Size = New-Object Drawing.Size(65, 34)
        $chip.Margin = New-Object Windows.Forms.Padding(4)
        $chip.BorderStyle = "FixedSingle"
        $chip.BackColor = [Drawing.Color]::White
        $chips[$key] = $chip
        $panel.Controls.Add($chip)
    }
    $refresh = {
        $heading.Text = "Press every highlighted key - $($pressed.Count) / $($required.Count) detected"
        $pass.Enabled = ($pressed.Count -eq $required.Count)
    }
    $form.Add_KeyDown({
        param($sender, $event)
        $name = $event.KeyCode.ToString()
        if ($name -match '^D([0-9])$') { $name = $Matches[1] }
        elseif ($name -eq "Return") { $name = "Enter" }
        elseif ($name -eq "Back") { $name = "Backspace" }
        elseif ($name -match 'ShiftKey$') { $name = "Shift" }
        elseif ($name -match 'ControlKey$') { $name = "Ctrl" }
        elseif ($name -match 'Menu$') { $name = "Alt" }
        if ($chips.ContainsKey($name)) {
            [void]$pressed.Add($name)
            $chips[$name].BackColor = [Drawing.Color]::FromArgb(220, 245, 225)
            $chips[$name].ForeColor = [Drawing.Color]::FromArgb(25, 105, 65)
            & $refresh
        }
        $event.SuppressKeyPress = $true
    })
    $pass.Add_Click({ $state.status = "pass"; $form.Close() })
    $fail.Add_Click({ $state.status = "fail"; $form.Close() })
    $cancel.Add_Click({ $form.Close() })
    & $refresh
    [void]$form.ShowDialog()
    $missing = @($required | Where-Object { -not $pressed.Contains($_) })
    $metrics = @{ requiredKeys = $required.Count; detectedKeys = $pressed.Count; missingKeys = $missing }
    if ($state.status -eq "pass") { return New-DpTestResult -Status pass -Detail "$($pressed.Count)/$($required.Count) common keyboard keys detected." -Metrics $metrics }
    if ($state.status -eq "fail") { return New-DpTestResult -Status fail -Detail "$($missing.Count) common keyboard key(s) were missing or marked faulty." -Metrics $metrics }
    return New-DpTestResult -Status not-run -Detail "Keyboard test was closed before a result was approved." -Metrics $metrics
}

function Get-DpCameraRollFiles {
    $pictures = [Environment]::GetFolderPath("MyPictures")
    $folders = @((Join-Path $pictures "Camera Roll"), $pictures) | Where-Object { Test-Path -LiteralPath $_ }
    return @($folders | ForEach-Object { Get-ChildItem -LiteralPath $_ -File -ErrorAction SilentlyContinue } | Where-Object { $_.Extension -match '^\.(jpg|jpeg|png)$' })
}

function Invoke-DpCameraTest {
    $started = Get-Date
    $before = @(Get-DpCameraRollFiles | ForEach-Object { $_.FullName })
    try { Start-Process "microsoft.windows.camera:" } catch { return New-DpTestResult -Status fail -Detail "Windows Camera could not be opened: $($_.Exception.Message)" }
    $wait = New-Object Windows.Forms.Form
    $wait.Text = "DevicePassport camera capture"
    $wait.Size = New-Object Drawing.Size(400, 170)
    $wait.StartPosition = "Manual"
    $wait.Location = New-Object Drawing.Point(24, 24)
    $wait.TopMost = $true
    $wait.FormBorderStyle = "FixedToolWindow"
    $copy = New-Object Windows.Forms.Label
    $copy.Text = "Use Windows Camera to capture the actual device. Return here after the photo is saved."
    $copy.Location = New-Object Drawing.Point(18, 18)
    $copy.Size = New-Object Drawing.Size(350, 48)
    $wait.Controls.Add($copy)
    $done = New-Object Windows.Forms.Button
    $done.Text = "Photo captured"
    $done.Location = New-Object Drawing.Point(18, 82)
    $done.Size = New-Object Drawing.Size(160, 34)
    $cancel = New-Object Windows.Forms.Button
    $cancel.Text = "Cancel"
    $cancel.Location = New-Object Drawing.Point(190, 82)
    $cancel.Size = New-Object Drawing.Size(100, 34)
    $wait.Controls.AddRange(@($done, $cancel))
    $state = @{ captured = $false }
    $done.Add_Click({ $state.captured = $true; $wait.Close() })
    $cancel.Add_Click({ $wait.Close() })
    [void]$wait.ShowDialog()
    if (-not $state.captured) { return New-DpTestResult -Status not-run -Detail "Camera capture was cancelled." }

    $candidate = Get-DpCameraRollFiles | Where-Object { $_.LastWriteTime -ge $started.AddSeconds(-2) -or $before -notcontains $_.FullName } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($null -eq $candidate) {
        $picker = New-Object Windows.Forms.OpenFileDialog
        $picker.Title = "Select the photo just captured"
        $picker.Filter = "Camera photos|*.jpg;*.jpeg;*.png"
        if ($picker.ShowDialog() -ne "OK") { return New-DpTestResult -Status fail -Detail "No saved webcam photo was found or selected." }
        $candidate = Get-Item -LiteralPath $picker.FileName
    }
    if ($candidate.Length -gt 2MB) { return New-DpTestResult -Status fail -Detail "Captured photo is larger than the 2 MB evidence limit." -PhotoPath $candidate.FullName }

    $review = New-Object Windows.Forms.Form
    $review.Text = "DevicePassport - Review camera photo"
    $review.Size = New-Object Drawing.Size(720, 590)
    $review.StartPosition = "CenterScreen"
    $picture = New-Object Windows.Forms.PictureBox
    $picture.Dock = "Fill"
    $picture.SizeMode = "Zoom"
    $bytes = [IO.File]::ReadAllBytes($candidate.FullName)
    $stream = New-Object IO.MemoryStream(,$bytes)
    $picture.Image = [Drawing.Image]::FromStream($stream)
    $review.Controls.Add($picture)
    $buttons = New-Object Windows.Forms.FlowLayoutPanel
    $buttons.Dock = "Bottom"
    $buttons.Height = 60
    $buttons.Padding = New-Object Windows.Forms.Padding(16, 12, 0, 0)
    $review.Controls.Add($buttons)
    $clear = New-Object Windows.Forms.Button
    $clear.Text = "Clear image - Pass"
    $clear.Size = New-Object Drawing.Size(170, 34)
    $bad = New-Object Windows.Forms.Button
    $bad.Text = "Camera issue - Fail"
    $bad.Size = New-Object Drawing.Size(170, 34)
    $buttons.Controls.AddRange(@($clear, $bad))
    $reviewState = @{ status = "not-run" }
    $clear.Add_Click({ $reviewState.status = "pass"; $review.Close() })
    $bad.Add_Click({ $reviewState.status = "fail"; $review.Close() })
    [void]$review.ShowDialog()
    $picture.Image.Dispose()
    $stream.Dispose()
    if ($reviewState.status -eq "pass") { return New-DpTestResult -Status pass -Detail "Native Windows Camera photo captured and visually approved." -Metrics @{ fileName = $candidate.Name } -PhotoPath $candidate.FullName }
    if ($reviewState.status -eq "fail") { return New-DpTestResult -Status fail -Detail "Webcam image was captured but a camera/image issue was marked." -Metrics @{ fileName = $candidate.Name } -PhotoPath $candidate.FullName }
    return New-DpTestResult -Status not-run -Detail "Captured camera photo was not approved." -Metrics @{ fileName = $candidate.Name } -PhotoPath $candidate.FullName
}

function New-DpStereoWaveFile {
    param([ValidateSet("left", "right")][string]$Channel)
    $path = Join-Path $env:TEMP ("devicepassport-audio-{0}-{1}.wav" -f $Channel, [guid]::NewGuid().ToString("N"))
    $sampleRate = 44100
    $seconds = 1.2
    $sampleCount = [int]($sampleRate * $seconds)
    $writer = New-Object IO.BinaryWriter([IO.File]::Create($path))
    try {
        $dataLength = $sampleCount * 4
        $writer.Write([Text.Encoding]::ASCII.GetBytes("RIFF")); $writer.Write(36 + $dataLength)
        $writer.Write([Text.Encoding]::ASCII.GetBytes("WAVEfmt ")); $writer.Write(16); $writer.Write([int16]1); $writer.Write([int16]2)
        $writer.Write($sampleRate); $writer.Write($sampleRate * 4); $writer.Write([int16]4); $writer.Write([int16]16)
        $writer.Write([Text.Encoding]::ASCII.GetBytes("data")); $writer.Write($dataLength)
        foreach ($sample in 0..($sampleCount - 1)) {
            $value = [int16](9000 * [math]::Sin(2 * [math]::PI * 520 * $sample / $sampleRate))
            if ($Channel -eq "left") { $writer.Write($value); $writer.Write([int16]0) } else { $writer.Write([int16]0); $writer.Write($value) }
        }
    }
    finally { $writer.Dispose() }
    return $path
}

function Invoke-DpAudioTest {
    $leftFile = New-DpStereoWaveFile -Channel left
    $rightFile = New-DpStereoWaveFile -Channel right
    $state = @{ status = "not-run" }
    try {
        $form = New-Object Windows.Forms.Form
        $form.Text = "DevicePassport - Speaker test"
        $form.Size = New-Object Drawing.Size(530, 300)
        $form.StartPosition = "CenterScreen"
        $copy = New-Object Windows.Forms.Label
        $copy.Text = "Play each channel and confirm clear sound from the correct side."
        $copy.Location = New-Object Drawing.Point(20, 20)
        $copy.Size = New-Object Drawing.Size(470, 35)
        $form.Controls.Add($copy)
        $playLeft = New-Object Windows.Forms.Button
        $playLeft.Text = "Play LEFT tone"
        $playLeft.Location = New-Object Drawing.Point(20, 70)
        $playLeft.Size = New-Object Drawing.Size(220, 40)
        $playRight = New-Object Windows.Forms.Button
        $playRight.Text = "Play RIGHT tone"
        $playRight.Location = New-Object Drawing.Point(260, 70)
        $playRight.Size = New-Object Drawing.Size(220, 40)
        $form.Controls.AddRange(@($playLeft, $playRight))
        $heardLeft = New-Object Windows.Forms.CheckBox
        $heardLeft.Text = "Left channel clear"
        $heardLeft.Location = New-Object Drawing.Point(22, 128)
        $heardLeft.AutoSize = $true
        $heardRight = New-Object Windows.Forms.CheckBox
        $heardRight.Text = "Right channel clear"
        $heardRight.Location = New-Object Drawing.Point(262, 128)
        $heardRight.AutoSize = $true
        $form.Controls.AddRange(@($heardLeft, $heardRight))
        $pass = New-Object Windows.Forms.Button
        $pass.Text = "Both clear - Pass"
        $pass.Location = New-Object Drawing.Point(20, 188)
        $pass.Size = New-Object Drawing.Size(220, 36)
        $pass.Enabled = $false
        $fail = New-Object Windows.Forms.Button
        $fail.Text = "Audio issue - Fail"
        $fail.Location = New-Object Drawing.Point(260, 188)
        $fail.Size = New-Object Drawing.Size(220, 36)
        $form.Controls.AddRange(@($pass, $fail))
        $refresh = { $pass.Enabled = ($heardLeft.Checked -and $heardRight.Checked) }
        $playLeft.Add_Click({ (New-Object Media.SoundPlayer($leftFile)).PlaySync() })
        $playRight.Add_Click({ (New-Object Media.SoundPlayer($rightFile)).PlaySync() })
        $heardLeft.Add_CheckedChanged($refresh); $heardRight.Add_CheckedChanged($refresh)
        $pass.Add_Click({ $state.status = "pass"; $form.Close() })
        $fail.Add_Click({ $state.status = "fail"; $form.Close() })
        [void]$form.ShowDialog()
        $metrics = @{ leftConfirmed = $heardLeft.Checked; rightConfirmed = $heardRight.Checked }
        if ($state.status -eq "pass") { return New-DpTestResult -Status pass -Detail "Left and right stereo speaker channels played and were confirmed clear." -Metrics $metrics }
        if ($state.status -eq "fail") { return New-DpTestResult -Status fail -Detail "A speaker/channel problem was marked during the stereo test." -Metrics $metrics }
        return New-DpTestResult -Status not-run -Detail "Audio test was closed before a result was approved." -Metrics $metrics
    }
    finally { Remove-Item -LiteralPath $leftFile, $rightFile -Force -ErrorAction SilentlyContinue }
}

function Get-DpPortSnapshot {
    $usb = @(Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object { $_.PNPDeviceID -like "USB*" -and $_.Status -eq "OK" }).Count
    $displays = @(Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorID -ErrorAction SilentlyContinue | Where-Object { $_.Active }).Count
    $battery = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1
    $acConnected = if ($null -eq $battery) { $null } else { [int]$battery.BatteryStatus -in @(2, 3, 6, 7, 8, 9, 11) }
    return @{ usbDevices = $usb; activeDisplays = $displays; acConnected = $acConnected }
}

function Invoke-DpPortsTest {
    $snapshot = Get-DpPortSnapshot
    $state = @{ status = "not-run"; snapshot = $snapshot }
    $form = New-Object Windows.Forms.Form
    $form.Text = "DevicePassport - Ports and charging test"
    $form.Size = New-Object Drawing.Size(600, 390)
    $form.StartPosition = "CenterScreen"
    $summary = New-Object Windows.Forms.Label
    $summary.Location = New-Object Drawing.Point(20, 18)
    $summary.Size = New-Object Drawing.Size(540, 62)
    $form.Controls.Add($summary)
    $refresh = New-Object Windows.Forms.Button
    $refresh.Text = "Re-scan connected hardware"
    $refresh.Location = New-Object Drawing.Point(20, 88)
    $refresh.Size = New-Object Drawing.Size(230, 34)
    $form.Controls.Add($refresh)
    $usbCheck = New-Object Windows.Forms.CheckBox
    $usbCheck.Text = "All advertised USB / USB-C data ports tested"
    $usbCheck.Location = New-Object Drawing.Point(22, 150)
    $usbCheck.AutoSize = $true
    $displayCheck = New-Object Windows.Forms.CheckBox
    $displayCheck.Text = "HDMI / display output tested (or confirmed not fitted)"
    $displayCheck.Location = New-Object Drawing.Point(22, 185)
    $displayCheck.AutoSize = $true
    $chargeCheck = New-Object Windows.Forms.CheckBox
    $chargeCheck.Text = "Charging connector and power delivery tested"
    $chargeCheck.Location = New-Object Drawing.Point(22, 220)
    $chargeCheck.AutoSize = $true
    $form.Controls.AddRange(@($usbCheck, $displayCheck, $chargeCheck))
    $pass = New-Object Windows.Forms.Button
    $pass.Text = "Ports verified - Pass"
    $pass.Location = New-Object Drawing.Point(20, 280)
    $pass.Size = New-Object Drawing.Size(240, 38)
    $pass.Enabled = $false
    $fail = New-Object Windows.Forms.Button
    $fail.Text = "Port issue - Fail"
    $fail.Location = New-Object Drawing.Point(280, 280)
    $fail.Size = New-Object Drawing.Size(240, 38)
    $form.Controls.AddRange(@($pass, $fail))
    $render = {
        $power = if ($null -eq $state.snapshot.acConnected) { "not exposed" } elseif ($state.snapshot.acConnected) { "AC connected" } else { "running on battery" }
        $summary.Text = "Automatic evidence: $($state.snapshot.usbDevices) active USB device(s), $($state.snapshot.activeDisplays) active display(s), power state $power. Connect test devices, then re-scan."
        $pass.Enabled = ($usbCheck.Checked -and $displayCheck.Checked -and $chargeCheck.Checked)
    }
    $refresh.Add_Click({ $state.snapshot = Get-DpPortSnapshot; & $render })
    $usbCheck.Add_CheckedChanged($render); $displayCheck.Add_CheckedChanged($render); $chargeCheck.Add_CheckedChanged($render)
    $pass.Add_Click({ $state.status = "pass"; $form.Close() })
    $fail.Add_Click({ $state.status = "fail"; $form.Close() })
    & $render
    [void]$form.ShowDialog()
    $metrics = @{ usbDevices = $state.snapshot.usbDevices; activeDisplays = $state.snapshot.activeDisplays; acConnected = $state.snapshot.acConnected; usbConfirmed = $usbCheck.Checked; displayConfirmed = $displayCheck.Checked; chargingConfirmed = $chargeCheck.Checked }
    if ($state.status -eq "pass") { return New-DpTestResult -Status pass -Detail "USB/data, display output, and charging connector checks were confirmed." -Metrics $metrics }
    if ($state.status -eq "fail") { return New-DpTestResult -Status fail -Detail "One or more physical ports or charging checks were marked faulty." -Metrics $metrics }
    return New-DpTestResult -Status not-run -Detail "Ports test was closed before a result was approved." -Metrics $metrics
}

function Get-DpWirelessSnapshot {
    param([string]$ServerUrl)
    $wifi = @()
    try { $wifi = @(Get-NetAdapter -Physical -ErrorAction Stop | Where-Object { $_.Name -match 'wi-?fi|wireless|wlan' -or $_.InterfaceDescription -match 'wi-?fi|wireless|802\.11' }) } catch { $wifi = @() }
    $wifiUp = @($wifi | Where-Object { $_.Status -eq "Up" }).Count -gt 0
    $bluetooth = @()
    try { $bluetooth = @(Get-PnpDevice -Class Bluetooth -Status OK -ErrorAction Stop) } catch { $bluetooth = @() }
    $serverReachable = $false
    try {
        $health = Invoke-RestMethod -Uri "$($ServerUrl.TrimEnd('/'))/api/health" -Method Get -TimeoutSec 8
        $serverReachable = ($health.status -eq "healthy")
    }
    catch { $serverReachable = $false }
    return @{ wifiAdapters = $wifi.Count; wifiConnected = $wifiUp; bluetoothDevices = $bluetooth.Count; serverReachable = $serverReachable }
}

function Invoke-DpWirelessTest {
    param([Parameter(Mandatory = $true)][string]$ServerUrl)
    $snapshot = Get-DpWirelessSnapshot -ServerUrl $ServerUrl
    $state = @{ status = "not-run"; snapshot = $snapshot }
    $form = New-Object Windows.Forms.Form
    $form.Text = "DevicePassport - Wireless test"
    $form.Size = New-Object Drawing.Size(600, 350)
    $form.StartPosition = "CenterScreen"
    $summary = New-Object Windows.Forms.Label
    $summary.Location = New-Object Drawing.Point(20, 18)
    $summary.Size = New-Object Drawing.Size(540, 70)
    $form.Controls.Add($summary)
    $scan = New-Object Windows.Forms.Button
    $scan.Text = "Re-scan Wi-Fi, Bluetooth and server"
    $scan.Location = New-Object Drawing.Point(20, 92)
    $scan.Size = New-Object Drawing.Size(270, 34)
    $form.Controls.Add($scan)
    $wifiCheck = New-Object Windows.Forms.CheckBox
    $wifiCheck.Text = "Wi-Fi connected and DevicePassport server reached"
    $wifiCheck.Location = New-Object Drawing.Point(22, 152)
    $wifiCheck.AutoSize = $true
    $wifiCheck.Checked = ($snapshot.wifiConnected -and $snapshot.serverReachable)
    $bluetoothCheck = New-Object Windows.Forms.CheckBox
    $bluetoothCheck.Text = "Bluetooth tested (or confirmed not fitted)"
    $bluetoothCheck.Location = New-Object Drawing.Point(22, 188)
    $bluetoothCheck.AutoSize = $true
    $form.Controls.AddRange(@($wifiCheck, $bluetoothCheck))
    $pass = New-Object Windows.Forms.Button
    $pass.Text = "Wireless verified - Pass"
    $pass.Location = New-Object Drawing.Point(20, 242)
    $pass.Size = New-Object Drawing.Size(240, 38)
    $pass.Enabled = $false
    $fail = New-Object Windows.Forms.Button
    $fail.Text = "Wireless issue - Fail"
    $fail.Location = New-Object Drawing.Point(280, 242)
    $fail.Size = New-Object Drawing.Size(240, 38)
    $form.Controls.AddRange(@($pass, $fail))
    $render = {
        $summary.Text = "Automatic evidence: Wi-Fi adapters $($state.snapshot.wifiAdapters), connected $($state.snapshot.wifiConnected); Bluetooth devices $($state.snapshot.bluetoothDevices); DevicePassport server reachable $($state.snapshot.serverReachable)."
        $pass.Enabled = ($wifiCheck.Checked -and $bluetoothCheck.Checked)
    }
    $scan.Add_Click({ $state.snapshot = Get-DpWirelessSnapshot -ServerUrl $ServerUrl; $wifiCheck.Checked = ($state.snapshot.wifiConnected -and $state.snapshot.serverReachable); & $render })
    $wifiCheck.Add_CheckedChanged($render); $bluetoothCheck.Add_CheckedChanged($render)
    $pass.Add_Click({ $state.status = "pass"; $form.Close() })
    $fail.Add_Click({ $state.status = "fail"; $form.Close() })
    & $render
    [void]$form.ShowDialog()
    $metrics = @{ wifiAdapters = $state.snapshot.wifiAdapters; wifiConnected = $state.snapshot.wifiConnected; bluetoothDevices = $state.snapshot.bluetoothDevices; serverReachable = $state.snapshot.serverReachable; bluetoothConfirmed = $bluetoothCheck.Checked }
    if ($state.status -eq "pass") { return New-DpTestResult -Status pass -Detail "Wi-Fi data path, DevicePassport server connection, and Bluetooth status were confirmed." -Metrics $metrics }
    if ($state.status -eq "fail") { return New-DpTestResult -Status fail -Detail "A Wi-Fi, Bluetooth, or server-connectivity issue was marked." -Metrics $metrics }
    return New-DpTestResult -Status not-run -Detail "Wireless test was closed before a result was approved." -Metrics $metrics
}
