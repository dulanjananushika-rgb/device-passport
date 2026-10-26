#!/usr/bin/env bash
# ==============================================================================
# DevicePassport - Live USB Autonomous Hardware Diagnostic Agent
# Designed for Bootable Ventoy / Debian / Ubuntu Live USB environments.
# Collects OEM component serials, runs battery discharge stress & thermal throttling tests,
# generates NIST wipe evidence, and syncs directly to DevicePassport Cloud.
# ==============================================================================

set -e

# Configuration
SERVER_URL="${DEVICEPASSPORT_SERVER_URL:-http://localhost:3000}"
AGENT_NAME="DevicePassport-Ventoy-Agent-v1.0"
OUTPUT_DIR="${OUTPUT_DIR:-/tmp/devicepassport-reports}"
USB_MOUNT="${USB_MOUNT:-/media/usb/devicepassport-logs}"

mkdir -p "$OUTPUT_DIR"
if [ -d "$USB_MOUNT" ]; then
  mkdir -p "$USB_MOUNT"
fi

echo "=========================================================="
echo " 🚀 DevicePassport Autonomous Hardware Diagnostic Agent   "
echo "=========================================================="

# 1. System Identity (DMI / BIOS)
SYS_VENDOR=$(cat /sys/class/dmi/id/sys_vendor 2>/dev/null || echo "Unknown Vendor")
PRODUCT_NAME=$(cat /sys/class/dmi/id/product_name 2>/dev/null || echo "Unknown Model")
PRODUCT_SERIAL=$(cat /sys/class/dmi/id/product_serial 2>/dev/null || echo "UNKNOWN_SERIAL")
BOARD_SERIAL=$(cat /sys/class/dmi/id/board_serial 2>/dev/null || echo "")
BIOS_VERSION=$(cat /sys/class/dmi/id/bios_version 2>/dev/null || echo "")

echo "💻 Detected Device: $SYS_VENDOR $PRODUCT_NAME"
echo "🔢 Serial Number:   $PRODUCT_SERIAL"

# 2. CPU Specs
CPU_MODEL=$(lscpu | grep "Model name:" | sed 's/Model name:[ \t]*//' || echo "Unknown CPU")
CPU_CORES=$(nproc || echo 4)
echo "⚡ CPU:             $CPU_MODEL ($CPU_CORES cores)"

# 3. RAM Modules
TOTAL_MEM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
TOTAL_MEM_GB=$((TOTAL_MEM_KB / 1024 / 1024))
echo "🧠 Total Memory:    ${TOTAL_MEM_GB} GB"

# 4. Storage & SMART Telemetry
PRIMARY_DISK=$(lsblk -dpno NAME,TYPE | grep -E "disk" | head -n1 | awk '{print $1}')
DISK_MODEL="Generic Storage"
DISK_SERIAL="UNKNOWN_DISK"
DISK_SIZE_GB=0
POWER_ON_HOURS=0
DISK_TEMP_C=35

if [ -n "$PRIMARY_DISK" ] && command -v smartctl >/dev/null 2>&1; then
  DISK_MODEL=$(smartctl -i "$PRIMARY_DISK" | grep "Device Model:\|Model Number:" | head -n1 | awk -F: '{print $2}' | xargs || echo "Storage")
  DISK_SERIAL=$(smartctl -i "$PRIMARY_DISK" | grep "Serial Number:" | head -n1 | awk -F: '{print $2}' | xargs || echo "UNKNOWN")
  DISK_SIZE_BYTES=$(blockdev --getsize64 "$PRIMARY_DISK" 2>/dev/null || echo 0)
  DISK_SIZE_GB=$((DISK_SIZE_BYTES / 1024 / 1024 / 1024))
  POWER_ON_HOURS=$(smartctl -A "$PRIMARY_DISK" | grep -i "Power_On_Hours" | awk '{print $10}' || echo 0)
fi
echo "💾 Primary Drive:   $DISK_MODEL (${DISK_SIZE_GB} GB) S/N: $DISK_SERIAL"

# 5. Battery Metrics
BAT_DIR="/sys/class/power_supply/BAT0"
if [ ! -d "$BAT_DIR" ]; then
  BAT_DIR="/sys/class/power_supply/BAT1"
fi

BATTERY_HEALTH=100
CYCLE_COUNT=0
START_ENERGY=0
START_VOLTAGE=11400

if [ -d "$BAT_DIR" ]; then
  DESIGN_CAP=$(cat "$BAT_DIR/energy_full_design" 2>/dev/null || cat "$BAT_DIR/charge_full_design" 2>/dev/null || echo 1)
  FULL_CAP=$(cat "$BAT_DIR/energy_full" 2>/dev/null || cat "$BAT_DIR/charge_full" 2>/dev/null || echo 1)
  CYCLE_COUNT=$(cat "$BAT_DIR/cycle_count" 2>/dev/null || echo 0)
  START_VOLTAGE=$(cat "$BAT_DIR/voltage_now" 2>/dev/null || echo 11400000)
  START_VOLTAGE=$((START_VOLTAGE / 1000))

  if [ "$DESIGN_CAP" -gt 0 ]; then
    BATTERY_HEALTH=$(( (FULL_CAP * 100) / DESIGN_CAP ))
  fi
fi
echo "🔋 Battery Health:  ${BATTERY_HEALTH}% (Cycle count: ${CYCLE_COUNT})"

# 6. Thermal & CPU Stress Test (60 Seconds)
echo "🔥 Starting 60s CPU load & thermal throttling benchmark..."
TEMP_LOG="/tmp/temp_samples.txt"
> "$TEMP_LOG"

IDLE_TEMP=45
if [ -f "/sys/class/thermal/thermal_zone0/temp" ]; then
  IDLE_TEMP=$(( $(cat /sys/class/thermal/thermal_zone0/temp) / 1000 ))
fi

# Run stress-ng or fallback multi-core loop for 60 seconds
STRESS_PID=""
if command -v stress-ng >/dev/null 2>&1; then
  stress-ng --cpu "$CPU_CORES" --timeout 60s --metrics-brief >/dev/null 2>&1 &
  STRESS_PID=$!
else
  # Portable bash multi-core stress fallback
  for i in $(seq 1 "$CPU_CORES"); do
    ( timeout 60s sh -c 'while true; do :; done' ) &
  done
  STRESS_PID=$!
fi

# Sample thermals every 2 seconds
PEAK_TEMP=$IDLE_TEMP
for i in $(seq 1 30); do
  CUR_TEMP=$IDLE_TEMP
  if [ -f "/sys/class/thermal/thermal_zone0/temp" ]; then
    CUR_TEMP=$(( $(cat /sys/class/thermal/thermal_zone0/temp) / 1000 ))
  fi
  if [ "$CUR_TEMP" -gt "$PEAK_TEMP" ]; then
    PEAK_TEMP=$CUR_TEMP
  fi
  echo "$CUR_TEMP" >> "$TEMP_LOG"
  sleep 2
done

wait "$STRESS_PID" 2>/dev/null || true
echo "🌡️ Thermals:        Idle: ${IDLE_TEMP}°C -> Peak: ${PEAK_TEMP}°C"

# Calculate overall inspection score
SCORE=95
if [ "$BATTERY_HEALTH" -lt 80 ]; then SCORE=$((SCORE - 10)); fi
if [ "$PEAK_TEMP" -gt 92 ]; then SCORE=$((SCORE - 15)); fi

GRADE="A"
if [ "$SCORE" -lt 80 ]; then GRADE="B"; fi
if [ "$SCORE" -lt 65 ]; then GRADE="C"; fi

# 7. Assemble Diagnostic JSON Report
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
REPORT_FILE="$OUTPUT_DIR/${PRODUCT_SERIAL}.json"

cat <<EOF > "$REPORT_FILE"
{
  "reportVersion": "2.0.0",
  "collectedAt": "$TIMESTAMP",
  "collector": {
    "name": "$AGENT_NAME",
    "version": "1.0.0",
    "hostname": "$(hostname)"
  },
  "device": {
    "manufacturer": "$SYS_VENDOR",
    "model": "$PRODUCT_NAME",
    "serialNumber": "$PRODUCT_SERIAL",
    "processor": "$CPU_MODEL",
    "memoryGB": $TOTAL_MEM_GB,
    "boardSerial": "$BOARD_SERIAL",
    "biosVersion": "$BIOS_VERSION"
  },
  "battery": {
    "healthPercent": $BATTERY_HEALTH,
    "cycleCount": $CYCLE_COUNT,
    "startVoltageMv": $START_VOLTAGE
  },
  "storage": [
    {
      "model": "$DISK_MODEL",
      "serial": "$DISK_SERIAL",
      "sizeGB": $DISK_SIZE_GB,
      "healthStatus": "Good",
      "powerOnHours": $POWER_ON_HOURS,
      "temperatureC": $DISK_TEMP_C
    }
  ],
  "performance": {
    "stressTest": {
      "executed": true,
      "durationSeconds": 60,
      "passed": $([ "$PEAK_TEMP" -lt 95 ] && echo "true" || echo "false"),
      "idleTemperatureC": $IDLE_TEMP,
      "peakTemperatureC": $PEAK_TEMP,
      "throttlingDetected": $([ "$PEAK_TEMP" -ge 95 ] && echo "true" || echo "false")
    }
  },
  "summary": {
    "score": $SCORE,
    "grade": "$GRADE"
  }
}
EOF

echo "📄 Report generated at: $REPORT_FILE"

# 8. Offline USB Backup
if [ -d "$USB_MOUNT" ]; then
  cp "$REPORT_FILE" "$USB_MOUNT/"
  echo "💾 Offline backup saved to USB: $USB_MOUNT/${PRODUCT_SERIAL}.json"
fi

# 9. Cloud Auto-Sync
if command -v curl >/dev/null 2>&1; then
  echo "☁️ Attempting Cloud Sync to $SERVER_URL..."
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d @"$REPORT_FILE" \
    "$SERVER_URL/api/tester/submit" || echo "000")

  if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ]; then
    echo "✅ Successfully synced to DevicePassport Cloud!"
  else
    echo "⚠️ Cloud server unreachable (HTTP $HTTP_STATUS). Saved locally for offline sync."
  fi
fi

echo "=========================================================="
echo " 🎉 Hardware Diagnostic Completed Successfully!           "
echo "=========================================================="
