# DevicePassport Apple macOS Hardware Tester

Compatible with all Apple MacBooks (MacBook Pro, MacBook Air), iMacs, Mac minis, Mac Studios, and Mac Pros running Apple Silicon (M1/M2/M3/M4) or Intel processors.

## Features
- **Zero Installation**: Native bash script utilizing macOS built-in `system_profiler`, `sysctl`, `diskutil`, and `pmset`.
- **Hardware Telemetry**:
  - Model Name, Identifier, Processor/Chip (e.g. M3 Pro, M2 Max), Core count, Unified Memory.
  - Native Battery Health %, Cycle count, Condition (Normal / Service Recommended / Replace Soon).
  - Apple Fabric NVMe SSD storage capacity, model and SMART status.
  - Retina / Liquid Retina display resolution, ProMotion 120Hz refresh rate, GPU cores.
  - Multi-threaded CPU stability stress test.
- **Direct Cloud Sync**: Signs report via HMAC-SHA256 and uploads directly to your DevicePassport intake queue.

## Quickstart

### Option 1: Standalone Report (Save JSON locally)
Open Terminal on the Mac and run:
```bash
bash collect-device-health.sh
```
Or with a 15-second stress test:
```bash
bash collect-device-health.sh -s 15 -o /tmp/macbook-report.json
```

### Option 2: Automatic Upload to Shop Server
```bash
bash collect-device-health.sh --server http://192.168.1.100:3000 --token YOUR_STATION_TOKEN
```
