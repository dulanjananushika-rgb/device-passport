# DevicePassport — Bootable Live USB Diagnostic Agent (Ventoy / Linux)

This directory contains the autonomous hardware diagnostic agent designed to test wholesale container laptops with **zero OS installed** (blank or securely wiped storage).

---

## 1. Overview & Capabilities

When refurbished laptop shops receive bulk shipments (e.g. 50–200 off-lease Dell, ThinkPad, or HP laptops), booting into Windows on every machine is impossible or too time-consuming.

The **DevicePassport Live USB Agent** solves this:
- **Instant Boot**: Boots in under 15 seconds from a lightweight Linux live image (Debian, Ubuntu, or Alpine).
- **Automated Execution**: Runs immediately on boot via systemd service or `.bashrc` without requiring technician mouse clicks.
- **Hardware Telemetry Extraction**:
  - DMI/SMBIOS: System Vendor, Product Name, Serial Number, Motherboard UUID, BIOS version.
  - CPU: Core count, model, frequencies.
  - RAM: Total GB, slot configurations.
  - Storage: SMART status, drive model, serial, power-on hours, temperatures via `smartctl`.
  - Battery: Design capacity vs full charge capacity, cycle count, voltage via ACPI/sysfs.
- **Active Stress & Thermal Benchmark**:
  - Runs a 60-second multi-core stress test (`stress-ng`).
  - Monitors junction temperature curve to verify thermal paste condition and detect fan throttling.
- **Dual-Mode Sync**:
  - **Online**: Auto-POSTs the diagnostic report directly to the DevicePassport Cloud API (`POST /api/tester/submit`).
  - **Offline**: If the workshop Wi-Fi is unavailable, writes the report JSON into `/media/usb/devicepassport-logs/{SERIAL}.json`. When the USB drive is plugged into the main manager PC, reports are bulk imported with 1 click.

---

## 2. Fast Setup with Ventoy (Recommended)

Ventoy allows multiple ISOs to be placed on a single flash drive without reformatting.

### Step 1: Install Ventoy
1. Download Ventoy from [ventoy.net](https://www.ventoy.net/).
2. Insert a USB flash drive (8GB+ recommended) and install Ventoy.

### Step 2: Copy Live Linux ISO
1. Download a lightweight live Linux ISO (e.g., [Ubuntu Live Server / Desktop](https://ubuntu.com/download/desktop) or [Debian Live](https://www.debian.org/CD/live/)).
2. Copy the `.iso` file directly into the root of the Ventoy USB drive.

### Step 3: Add `devicepassport-agent.sh`
1. Create a folder named `devicepassport/` on the Ventoy USB partition.
2. Copy `devicepassport-agent.sh` into `devicepassport/`.
3. Configure your server URL:
   ```bash
   export DEVICEPASSPORT_SERVER_URL="https://your-shop.devicepassport.io"
   ```

### Step 4: Run at Boot
In the live OS `/etc/rc.local` or user `.bashrc`:
```bash
bash /media/usb/devicepassport/devicepassport-agent.sh
```

---

## 3. Supported Architecture
- **x86_64 / AMD64** (Intel Core i3/i5/i7/i9, AMD Ryzen 3/5/7/9)
- **ARM64** (Apple Silicon via Asahi / Linux live ARM, Qualcomm Snapdragon X Elite)
- Minimum RAM: 2 GB
- Boot mode: UEFI (Secure Boot off or Ventoy standard key enrolled)
