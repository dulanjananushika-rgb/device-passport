import test from "node:test";
import assert from "node:assert/strict";
import { analyzeBatteryDischarge } from "../lib/battery-stress.ts";
import { analyzeThermalPerformance } from "../lib/thermal-diagnostics.ts";
import { verifyComponentAuthenticity, isSuspiciousSerial } from "../lib/component-authenticity.ts";
import {
  generateSanitizationCertificate,
  generateSanitizationHash,
  getSanitizationMethodDetails,
} from "../lib/data-sanitization.ts";
import { extractDeviceDiagnostics } from "../lib/inspection.ts";

test("Battery stress test analysis accurately calculates discharge curves and detects spoofed BMS", () => {
  // 1. Healthy Enterprise Battery Test (ThinkPad T14)
  const healthySamples = [
    { timestampMs: 1000, batteryPercent: 95, voltageMv: 11800, cpuLoadPercent: 100 },
    { timestampMs: 60000, batteryPercent: 95, voltageMv: 11750, cpuLoadPercent: 100 },
    { timestampMs: 120000, batteryPercent: 94, voltageMv: 11710, cpuLoadPercent: 100 },
    { timestampMs: 180000, batteryPercent: 94, voltageMv: 11690, cpuLoadPercent: 100 },
  ];

  const healthyResult = analyzeBatteryDischarge(healthySamples, {
    designCapacityMWh: 50000,
    fullChargeCapacityMWh: 44000,
    reportedHealthPercent: 88,
  });

  assert.equal(healthyResult.durationSeconds, 179);
  assert.equal(healthyResult.percentDrop, 1);
  assert.ok(healthyResult.projectedNormalUsageHours >= 4.0);
  assert.equal(healthyResult.spoofingDetected, false);
  assert.equal(healthyResult.cellStability, "Stable");
  assert.equal(healthyResult.healthGrade, "Excellent");

  // 2. Degraded / Spoofed Battery (Firmware reports 99% & 3 cycles, but drops fast under load)
  const degradedSamples = [
    { timestampMs: 1000, batteryPercent: 98, voltageMv: 11600, cpuLoadPercent: 100 },
    { timestampMs: 60000, batteryPercent: 94, voltageMv: 11100, cpuLoadPercent: 100 },
    { timestampMs: 120000, batteryPercent: 90, voltageMv: 10600, cpuLoadPercent: 100 },
    { timestampMs: 180000, batteryPercent: 86, voltageMv: 10200, cpuLoadPercent: 100 },
  ];

  const degradedResult = analyzeBatteryDischarge(degradedSamples, {
    designCapacityMWh: 52000,
    fullChargeCapacityMWh: 51000,
    reportedHealthPercent: 98,
  });

  assert.equal(degradedResult.percentDrop, 12);
  assert.ok(degradedResult.dischargeRatePercentPerHour > 100);
  assert.equal(degradedResult.spoofingDetected, true);
  assert.equal(degradedResult.cellStability, "Cell Degradation Detected");
  assert.equal(degradedResult.healthGrade, "Degraded");
  assert.ok(degradedResult.notes.some((n) => n.includes("Discrepancy: Firmware reports 98%")));
});

test("Thermal diagnostics assesses CPU throttling, fan curve responsiveness, and thermal paste decay", () => {
  // 1. Healthy Cooling System
  const healthyThermals = [
    { timestampMs: 0, cpuTemperatureC: 44, fanRpm: 1800, cpuClockMhz: 3800, baseClockMhz: 2400 },
    { timestampMs: 15000, cpuTemperatureC: 62, fanRpm: 2600, cpuClockMhz: 3700, baseClockMhz: 2400 },
    { timestampMs: 30000, cpuTemperatureC: 72, fanRpm: 3400, cpuClockMhz: 3600, baseClockMhz: 2400 },
    { timestampMs: 60000, cpuTemperatureC: 76, fanRpm: 3800, cpuClockMhz: 3600, baseClockMhz: 2400 },
  ];

  const healthyRes = analyzeThermalPerformance(healthyThermals);
  assert.equal(healthyRes.throttlingDetected, false);
  assert.equal(healthyRes.peakTempC, 76);
  assert.equal(healthyRes.fanResponsiveness, "Responsive");
  assert.equal(healthyRes.thermalPasteStatus, "Optimal");
  assert.equal(healthyRes.overallThermalGrade, "Passed");

  // 2. Overheating Laptop with Dried Thermal Paste & Throttling
  const overheatingThermals = [
    { timestampMs: 0, cpuTemperatureC: 58, fanRpm: 1200, cpuClockMhz: 2800, baseClockMhz: 2400 },
    { timestampMs: 5000, cpuTemperatureC: 94, fanRpm: 1400, cpuClockMhz: 2600, baseClockMhz: 2400 },
    { timestampMs: 15000, cpuTemperatureC: 99, fanRpm: 2100, cpuClockMhz: 1600, baseClockMhz: 2400, throttlingFlag: true },
    { timestampMs: 30000, cpuTemperatureC: 100, fanRpm: 2100, cpuClockMhz: 1400, baseClockMhz: 2400, throttlingFlag: true },
  ];

  const overRes = analyzeThermalPerformance(overheatingThermals);
  assert.equal(overRes.throttlingDetected, true);
  assert.equal(overRes.peakTempC, 100);
  assert.equal(overRes.thermalPasteStatus, "Critical - Immediate Repaste Required");
  assert.equal(overRes.overallThermalGrade, "Failed");
  assert.ok(overRes.actionableNotes.some((n) => n.includes("Repaste heatsink")));
});

test("Component authenticity verification detects genuine OEM hardware and flags component swaps", () => {
  assert.equal(isSuspiciousSerial("0000000000"), true);
  assert.equal(isSuspiciousSerial("12345678"), true);
  assert.equal(isSuspiciousSerial("Default string"), true);
  assert.equal(isSuspiciousSerial("41829B7F"), false);

  const baselineSnapshot = {
    motherboard: {
      manufacturer: "LENOVO",
      productName: "20W0S4KD00",
      serial: "L1HF19B0024",
    },
    memoryModules: [
      { slot: "0", manufacturer: "Samsung", partNumber: "M471A2K43DB1-CWE", serial: "38A190EF", sizeGb: 16 },
    ],
    storageDrives: [
      { model: "SAMSUNG MZVLB512HAJQ-000L7", serial: "S3W6NY0M123456", sizeGb: 512, interfaceType: "NVMe" },
    ],
    battery: {
      manufacturer: "SMP",
      serial: "9412",
      designCapacityMwh: 50500,
    },
  };

  // 1. Untampered Match
  const genuineRes = verifyComponentAuthenticity(baselineSnapshot, baselineSnapshot);
  assert.equal(genuineRes.authenticityScore, 100);
  assert.equal(genuineRes.authenticityGrade, "100% Genuine OEM Original");
  assert.equal(genuineRes.hasTampering, false);
  assert.equal(genuineRes.discrepancies.length, 0);

  // 2. Tampered / Swapped Components Snapshot
  const tamperedSnapshot = {
    motherboard: {
      manufacturer: "LENOVO",
      productName: "20W0S4KD00",
      serial: "L1HF19B0024",
    },
    memoryModules: [
      { slot: "0", manufacturer: "Generic", partNumber: "OEM-DDR4", serial: "00000000", sizeGb: 8 },
    ],
    storageDrives: [
      { model: "KingSpec SSD", serial: "KS88991122", sizeGb: 128, interfaceType: "SATA" },
    ],
    battery: {
      manufacturer: "Unknown",
      serial: "12345678",
    },
  };

  const tamperedRes = verifyComponentAuthenticity(tamperedSnapshot, baselineSnapshot);
  assert.ok(tamperedRes.authenticityScore < 70);
  assert.equal(tamperedRes.hasTampering, true);
  assert.equal(tamperedRes.authenticityGrade, "Tampered / Counterfeit Detected");
  assert.ok(tamperedRes.discrepancies.some((d) => d.componentType === "RAM" && d.issue === "Suspicious / Counterfeit"));
  assert.ok(tamperedRes.discrepancies.some((d) => d.componentType === "Storage" && d.issue === "Swapped"));
});

test("NIST 800-88 sanitization engine generates valid legal certificates and audit hashes", async () => {
  const method = getSanitizationMethodDetails("NIST_800_88_PURGE_CRYPTO");
  assert.equal(method.level, "Purge");
  assert.ok(method.standard.includes("NIST SP 800-88"));

  const cert = await generateSanitizationCertificate({
    organizationName: "Lapmart Engineering Lab",
    clientName: "Seylan Bank PLC",
    deviceModel: "Dell Latitude 7420",
    deviceSerial: "7H2Q1D3",
    assetTag: "SEYLAN-AST-8821",
    driveModel: "KIOXIA KBG40ZNS512G",
    driveSerial: "Y19C48192801",
    driveCapacityGb: 512,
    driveInterface: "NVMe",
    method: "NIST_800_88_PURGE_CRYPTO",
    wipeDurationSeconds: 42,
    technicianName: "Kasun Perera",
  });

  assert.ok(cert.certificateNumber.startsWith("CERT-NIST-"));
  assert.equal(cert.sanitizationLevel, "Purge");
  assert.equal(cert.verificationHash.length, 64); // SHA-256 length
  assert.ok(cert.qrDataUrl.startsWith("data:image/png;base64,"));
  assert.ok(cert.certificateHtml.includes("Certificate of Data Sanitization"));
  assert.ok(cert.certificateHtml.includes("Y19C48192801"));
  assert.ok(cert.certificateHtml.includes("Seylan Bank PLC"));

  // Deterministic hash check
  const calculatedHash = generateSanitizationHash("Y19C48192801", cert.wipedAt, "NIST_800_88_PURGE_CRYPTO");
  assert.equal(cert.verificationHash, calculatedHash);
});

test("Bootable Linux live agent report JSON conforms to DevicePassport diagnostic schema", () => {
  const linuxAgentJson = {
    reportVersion: "2.0.0",
    collectedAt: "2026-10-26T01:00:00Z",
    collector: {
      name: "DevicePassport-Ventoy-Agent-v1.0",
      version: "1.0.0",
      hostname: "live-usb-node",
    },
    device: {
      manufacturer: "LENOVO",
      model: "20W0S4KD00",
      serialNumber: "PF3K9L2A",
      processor: "Intel Core i5-1135G7",
      memoryGB: 16,
    },
    battery: {
      healthPercent: 88,
      cycleCount: 142,
    },
    storage: [
      {
        model: "SAMSUNG MZVLB512HAJQ-000L7",
        serial: "S3W6NY0M123456",
        sizeGB: 512,
        healthStatus: "Good",
        powerOnHours: 1240,
        temperatureC: 38,
      },
    ],
    performance: {
      stressTest: {
        executed: true,
        durationSeconds: 60,
        passed: true,
        idleTemperatureC: 45,
        peakTemperatureC: 78,
        throttlingDetected: false,
      },
    },
  };

  const parsed = extractDeviceDiagnostics(linuxAgentJson);
  assert.equal(parsed.reportVersion, "2.0.0");
  assert.equal(parsed.batteryCycleCount, 142);
  assert.equal(parsed.storagePowerOnHours, 1240);
  assert.equal(parsed.storageTemperatureC, 38);
  assert.equal(parsed.cpuStressExecuted, true);
  assert.equal(parsed.cpuStressPassed, true);
  assert.equal(parsed.cpuPeakTemperatureC, 78);
});
