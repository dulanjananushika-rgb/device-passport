/**
 * DevicePassport - Thermal Throttling & Fan RPM Health Diagnostic Engine
 * Analyzes CPU junction temperatures, throttling events, and fan curve responsiveness
 * to detect dried thermal paste, clogged cooling fins, and failing fan bearings.
 */

export interface ThermalSample {
  timestampMs: number;
  cpuTemperatureC: number;
  gpuTemperatureC?: number;
  fanRpm?: number;
  cpuClockMhz?: number;
  baseClockMhz?: number;
  throttlingFlag?: boolean;
}

export interface ThermalThresholds {
  maxSafeTempC?: number; // Default: 92°C
  criticalThrottleTempC?: number; // Default: 97°C
  minLoadFanRpm?: number; // Default: 2200 RPM
}

export interface ThermalDiagnosticResult {
  durationSeconds: number;
  idleTempC: number;
  peakTempC: number;
  averageTempC: number;
  peakGpuTempC?: number;
  peakFanRpm?: number;
  throttlingDetected: boolean;
  throttleDurationSeconds: number;
  thermalRiseRateCPerSec: number;
  fanResponsiveness: "Responsive" | "Sluggish" | "No Fan Detected / Passive" | "Fan Failure Risk";
  thermalPasteStatus: "Optimal" | "Degraded - Repaste Advised" | "Critical - Immediate Repaste Required";
  overallThermalGrade: "Passed" | "Warning" | "Failed";
  actionableNotes: string[];
}

/**
 * Assesses thermal performance and cooling efficiency from time-series stress samples.
 */
export function analyzeThermalPerformance(
  samples: ThermalSample[],
  thresholds: ThermalThresholds = {}
): ThermalDiagnosticResult {
  if (!samples || samples.length < 2) {
    throw new Error("Thermal performance analysis requires at least 2 time-series samples.");
  }

  const maxSafe = thresholds.maxSafeTempC ?? 92;
  const criticalTemp = thresholds.criticalThrottleTempC ?? 97;
  const minFanRpm = thresholds.minLoadFanRpm ?? 2200;

  const sorted = [...samples].sort((a, b) => a.timestampMs - b.timestampMs);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const durationMs = Math.max(1000, last.timestampMs - first.timestampMs);
  const durationSeconds = Math.round(durationMs / 1000);

  let peakTempC = -Infinity;
  let idleTempC = Infinity;
  let totalTemp = 0;
  let peakGpuTempC: number | undefined = undefined;
  let peakFanRpm: number | undefined = undefined;
  let initialFanRpm: number | undefined = undefined;
  let throttleSamples = 0;

  // Track early temperature rise rate (first 10 seconds of load)
  let earlySample = sorted[0];
  for (const s of sorted) {
    if (s.timestampMs - sorted[0].timestampMs <= 10000) {
      earlySample = s;
    }
  }

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if (s.cpuTemperatureC > peakTempC) peakTempC = s.cpuTemperatureC;
    if (s.cpuTemperatureC < idleTempC) idleTempC = s.cpuTemperatureC;
    totalTemp += s.cpuTemperatureC;

    if (s.gpuTemperatureC !== undefined) {
      if (peakGpuTempC === undefined || s.gpuTemperatureC > peakGpuTempC) {
        peakGpuTempC = s.gpuTemperatureC;
      }
    }

    if (s.fanRpm !== undefined) {
      if (initialFanRpm === undefined) initialFanRpm = s.fanRpm;
      if (peakFanRpm === undefined || s.fanRpm > peakFanRpm) {
        peakFanRpm = s.fanRpm;
      }
    }

    // Detect thermal throttling trigger
    const isClockThrottled =
      s.cpuClockMhz && s.baseClockMhz && s.cpuClockMhz < s.baseClockMhz * 0.85 && s.cpuTemperatureC >= maxSafe;
    if (s.throttlingFlag || s.cpuTemperatureC >= criticalTemp || isClockThrottled) {
      throttleSamples++;
    }
  }

  const averageTempC = Math.round(totalTemp / sorted.length);
  const throttleDurationSeconds = Math.round(
    (throttleSamples / sorted.length) * durationSeconds
  );
  const throttlingDetected = throttleSamples > 0;

  // Thermal rise rate (°C/sec in initial spike)
  const earlyDeltaMs = Math.max(1000, earlySample.timestampMs - first.timestampMs);
  const thermalRiseRateCPerSec = parseFloat(
    ((earlySample.cpuTemperatureC - first.cpuTemperatureC) / (earlyDeltaMs / 1000)).toFixed(2)
  );

  // Fan assessment
  let fanResponsiveness: ThermalDiagnosticResult["fanResponsiveness"] = "Responsive";
  if (peakFanRpm === undefined) {
    fanResponsiveness = "No Fan Detected / Passive";
  } else if (peakFanRpm === 0 && peakTempC > 80) {
    fanResponsiveness = "Fan Failure Risk";
  } else if (peakFanRpm < minFanRpm && peakTempC > maxSafe) {
    fanResponsiveness = "Sluggish";
  } else {
    fanResponsiveness = "Responsive";
  }

  // Thermal paste assessment
  let thermalPasteStatus: ThermalDiagnosticResult["thermalPasteStatus"] = "Optimal";
  if (peakTempC >= criticalTemp || thermalRiseRateCPerSec > 6.0 || throttlingDetected) {
    thermalPasteStatus = "Critical - Immediate Repaste Required";
  } else if (peakTempC > maxSafe || thermalRiseRateCPerSec > 3.5) {
    thermalPasteStatus = "Degraded - Repaste Advised";
  } else {
    thermalPasteStatus = "Optimal";
  }

  // Actionable technician notes
  const actionableNotes: string[] = [];
  if (throttlingDetected) {
    actionableNotes.push(
      `Thermal throttling detected for ${throttleDurationSeconds}s (Peak ${peakTempC}°C). Processor reduced clock frequencies to prevent damage.`
    );
  }

  if (thermalPasteStatus === "Critical - Immediate Repaste Required") {
    actionableNotes.push(
      "Thermal interface material (TIM) has dried or pumped out. Repaste heatsink with high-viscosity paste (e.g. Arctic MX-4 / Honeywell PTM7950)."
    );
  } else if (thermalPasteStatus === "Degraded - Repaste Advised") {
    actionableNotes.push("Thermal paste performance is degrading; preventative repaste recommended before sale.");
  }

  if (fanResponsiveness === "Fan Failure Risk") {
    actionableNotes.push("Cooling fan reported 0 RPM under high heat load. Check fan header connection or replace fan motor.");
  } else if (fanResponsiveness === "Sluggish") {
    actionableNotes.push("Cooling fan RPM ramped up slowly; inspect heatsink fins for dust clogging or clean fan bearing.");
  } else if (thermalPasteStatus === "Optimal" && !throttlingDetected) {
    actionableNotes.push(`Cooling system passed with stable peak temperature of ${peakTempC}°C under full stress.`);
  }

  // Overall grade
  let overallThermalGrade: "Passed" | "Warning" | "Failed" = "Passed";
  if (throttlingDetected || peakTempC >= criticalTemp || fanResponsiveness === "Fan Failure Risk") {
    overallThermalGrade = "Failed";
  } else if (peakTempC > maxSafe || thermalPasteStatus === "Degraded - Repaste Advised") {
    overallThermalGrade = "Warning";
  } else {
    overallThermalGrade = "Passed";
  }

  return {
    durationSeconds,
    idleTempC,
    peakTempC,
    averageTempC,
    peakGpuTempC,
    peakFanRpm,
    throttlingDetected,
    throttleDurationSeconds,
    thermalRiseRateCPerSec,
    fanResponsiveness,
    thermalPasteStatus,
    overallThermalGrade,
    actionableNotes,
  };
}
