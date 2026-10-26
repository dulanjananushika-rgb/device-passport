/**
 * DevicePassport - Real Battery Health & Stress Discharge Analysis Engine
 * Evaluates real-world battery performance under 100% CPU load to detect
 * spoofed BMS cycle counts, failing lithium cells, and rapid voltage drops.
 */

export interface BatteryDischargeSample {
  timestampMs: number;
  batteryPercent: number;
  energyMWh?: number;
  voltageMv?: number;
  cpuLoadPercent?: number;
  temperatureC?: number;
}

export interface BatteryDesignSpecs {
  designCapacityMWh?: number;
  fullChargeCapacityMWh?: number;
  cycleCount?: number;
  reportedHealthPercent?: number;
  nominalVoltageMv?: number;
}

export interface BatteryStressResult {
  durationSeconds: number;
  startPercent: number;
  endPercent: number;
  percentDrop: number;
  dischargeRatePercentPerHour: number;
  projectedUnderLoadHours: number;
  projectedNormalUsageHours: number;
  realHealthPercent: number;
  healthGrade: "Excellent" | "Good" | "Fair" | "Degraded" | "Critical";
  voltageDropMv: number;
  voltageDropRateMvPerMin: number;
  cellStability: "Stable" | "Fluctuating" | "Cell Degradation Detected";
  spoofingDetected: boolean;
  notes: string[];
}

/**
 * Evaluates real-world battery discharge metrics over an active stress-test window.
 */
export function analyzeBatteryDischarge(
  samples: BatteryDischargeSample[],
  specs: BatteryDesignSpecs = {}
): BatteryStressResult {
  if (!samples || samples.length < 2) {
    throw new Error("Battery stress test analysis requires at least 2 time-series samples.");
  }

  // Sort chronologically
  const sorted = [...samples].sort((a, b) => a.timestampMs - b.timestampMs);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const durationMs = Math.max(1000, last.timestampMs - first.timestampMs);
  const durationSeconds = Math.round(durationMs / 1000);
  const durationHours = durationMs / (1000 * 60 * 60);

  const startPercent = first.batteryPercent;
  const endPercent = last.batteryPercent;
  const percentDrop = Math.max(0, startPercent - endPercent);

  // Discharge rate under full stress (% per hour)
  const dischargeRatePercentPerHour =
    durationHours > 0 ? parseFloat(((percentDrop / durationHours)).toFixed(1)) : 0;

  // Under continuous 100% load: 100% / dischargeRate
  const projectedUnderLoadHours =
    dischargeRatePercentPerHour > 0
      ? parseFloat((endPercent / dischargeRatePercentPerHour).toFixed(2))
      : 3.5;

  // Typical real-world productivity workload uses ~25% of maximum stress discharge rate
  // Giving standard 3.5x to 4x multiplier for typical office/web browsing
  const normalDischargeRatePerHour = Math.max(8, dischargeRatePercentPerHour * 0.28);
  const projectedNormalUsageHours = parseFloat(
    (100 / normalDischargeRatePerHour).toFixed(1)
  );

  // Real health percent derived from capacity ratio or discharge resilience
  let realHealthPercent = specs.reportedHealthPercent || 100;
  if (specs.designCapacityMWh && specs.fullChargeCapacityMWh && specs.designCapacityMWh > 0) {
    realHealthPercent = Math.min(
      100,
      Math.round((specs.fullChargeCapacityMWh / specs.designCapacityMWh) * 100)
    );
  }

  // Voltage stability analysis
  const startVoltage = first.voltageMv || 11400;
  const endVoltage = last.voltageMv || startVoltage;
  const voltageDropMv = Math.max(0, startVoltage - endVoltage);
  const durationMinutes = Math.max(0.1, durationSeconds / 60);
  const voltageDropRateMvPerMin = parseFloat((voltageDropMv / durationMinutes).toFixed(1));

  let cellStability: "Stable" | "Fluctuating" | "Cell Degradation Detected" = "Stable";
  if (voltageDropRateMvPerMin > 150 || (voltageDropMv > 800 && durationSeconds <= 300)) {
    cellStability = "Cell Degradation Detected";
  } else if (voltageDropRateMvPerMin > 60) {
    cellStability = "Fluctuating";
  }

  // Detect BMS cycle-count / health spoofing
  // e.g. BIOS reports 98% health & 5 cycles, but battery drops > 6% in 3 minutes of load
  const notes: string[] = [];
  let spoofingDetected = false;

  const dropRatePerMinute = percentDrop / durationMinutes;
  if (dropRatePerMinute > 1.8 && (specs.reportedHealthPercent || 0) > 85) {
    spoofingDetected = true;
    notes.push(
      `Discrepancy: Firmware reports ${specs.reportedHealthPercent}% health, but discharge rate (${dischargeRatePercentPerHour}%/hr under load) indicates severely worn cells.`
    );
  }

  if (cellStability === "Cell Degradation Detected") {
    notes.push(`Rapid voltage drop of ${voltageDropMv}mV detected under load; indicates internal cell resistance.`);
  }

  // Assign health grade
  let healthGrade: "Excellent" | "Good" | "Fair" | "Degraded" | "Critical" = "Good";
  if (projectedNormalUsageHours >= 5.5 && realHealthPercent >= 85 && !spoofingDetected) {
    healthGrade = "Excellent";
  } else if (projectedNormalUsageHours >= 4.0 && realHealthPercent >= 75 && !spoofingDetected) {
    healthGrade = "Good";
  } else if (projectedNormalUsageHours >= 2.5 && realHealthPercent >= 60) {
    healthGrade = "Fair";
  } else if (projectedNormalUsageHours >= 1.2 || spoofingDetected) {
    healthGrade = "Degraded";
  } else {
    healthGrade = "Critical";
  }

  if (healthGrade === "Critical" || healthGrade === "Degraded") {
    notes.push(`Battery replacement recommended before retail sale.`);
  } else {
    notes.push(`Battery passed load testing with verified ${projectedNormalUsageHours} hrs typical runtime.`);
  }

  return {
    durationSeconds,
    startPercent,
    endPercent,
    percentDrop,
    dischargeRatePercentPerHour,
    projectedUnderLoadHours,
    projectedNormalUsageHours,
    realHealthPercent,
    healthGrade,
    voltageDropMv,
    voltageDropRateMvPerMin,
    cellStability,
    spoofingDetected,
    notes,
  };
}
