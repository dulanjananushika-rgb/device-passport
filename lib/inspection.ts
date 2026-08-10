export const inspectionKeys = ["display", "keyboard", "camera", "audio", "ports", "wireless"] as const;

export type InspectionKey = (typeof inspectionKeys)[number];
export type CheckStatus = "pass" | "fail";
export type InspectionChecks = Record<InspectionKey, CheckStatus>;

export type InteractiveTestEvidence = {
  key: InspectionKey;
  status: CheckStatus | "not-run";
  detail: string;
  metrics: Record<string, unknown>;
  completedAt: string;
};

export type DiagnosticReport = {
  reportVersion?: string;
  collector?: {
    name?: string;
    version?: string;
    hostname?: string;
  };
  collectedAt?: string;
  device?: {
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    processor?: string;
    memoryGB?: number;
  };
  battery?: { healthPercent?: number; cycleCount?: number };
  storage?: Array<{
    model?: string;
    healthStatus?: string;
    sizeGB?: number;
    powerOnHours?: number;
    temperatureC?: number;
    wearPercent?: number;
  }>;
  performance?: {
    memory?: {
      availableGB?: number;
      usedPercent?: number;
    };
    cpu?: {
      logicalProcessors?: number;
      loadPercentBeforeTest?: number;
      temperatureCBeforeTest?: number;
    };
    stressTest?: {
      executed?: boolean;
      durationSeconds?: number;
      passed?: boolean;
      averageLoadPercent?: number;
      peakTemperatureC?: number;
      sampleCount?: number;
      workerCount?: number;
      completedWorkers?: number;
      note?: string;
    };
  };
  manualChecks?: Partial<Record<InspectionKey, CheckStatus>> & { wifiBluetooth?: CheckStatus };
  interactiveTests?: {
    suiteVersion?: string;
    completedAt?: string;
    results?: Partial<Record<InspectionKey, {
      status?: CheckStatus | "not-run";
      detail?: string;
      metrics?: Record<string, unknown>;
      completedAt?: string;
    }>>;
  };
  integrity?: {
    source?: string;
    signed?: boolean;
    note?: string;
    serverSignatureVerified?: boolean;
    verifiedTestRunId?: string;
    verifiedAgentName?: string;
  };
};

export type DeviceDiagnostics = {
  reportVersion: string;
  collectorVersion: string;
  batteryCycleCount: number | null;
  storagePowerOnHours: number | null;
  storageTemperatureC: number | null;
  storageWearPercent: number | null;
  memoryUsedPercent: number | null;
  cpuTemperatureC: number | null;
  cpuStressExecuted: boolean;
  cpuStressPassed: boolean | null;
  cpuStressDurationSeconds: number | null;
  cpuStressWorkerCount: number | null;
  cpuStressCompletedWorkers: number | null;
  cpuAverageLoadPercent: number | null;
  cpuPeakTemperatureC: number | null;
  interactiveSuiteVersion: string;
  interactiveTests: InteractiveTestEvidence[];
  serverSignatureVerified: boolean;
  verifiedAgentName: string;
};

export type InspectionPhotoInput = {
  name: string;
  dataUrl: string;
};

export const inspectionLabels: Record<InspectionKey, { label: string; hint: string }> = {
  display: { label: "Display", hint: "Pixels, brightness, hinges and touch" },
  keyboard: { label: "Keyboard & trackpad", hint: "Every key, buttons and gestures" },
  camera: { label: "Camera", hint: "Image, microphone and privacy shutter" },
  audio: { label: "Audio", hint: "Speakers and headphone output" },
  ports: { label: "Physical ports", hint: "USB, USB-C, HDMI and charging" },
  wireless: { label: "Wireless", hint: "Wi-Fi and Bluetooth connection" },
};

export function calculateInspectionScore(report: DiagnosticReport, checks: InspectionChecks) {
  const batteryHealth = clamp(report.battery?.healthPercent ?? 0);
  const firstDisk = report.storage?.[0];
  const storageTemperatureHigh = typeof firstDisk?.temperatureC === "number" && firstDisk.temperatureC > 75;
  const storageWearHigh = typeof firstDisk?.wearPercent === "number" && firstDisk.wearPercent > 90;
  const storageOkay = Boolean(firstDisk && /ok|healthy/i.test(firstDisk.healthStatus ?? "") && !storageTemperatureHigh && !storageWearHigh);
  const storageHealth = firstDisk ? (storageOkay ? 98 : 62) : 0;
  const failedChecks = inspectionKeys.filter((key) => checks[key] === "fail");
  const manualScore = Math.round(
    inspectionKeys.reduce((sum, key) => sum + (checks[key] === "pass" ? 100 : 35), 0) / inspectionKeys.length,
  );
  const stressTest = report.performance?.stressTest;
  const cpuTemperatureHigh = typeof stressTest?.peakTemperatureC === "number" && stressTest.peakTemperatureC > 95;
  const stressPassed = stressTest?.executed ? stressTest.passed === true && !cpuTemperatureHigh : null;
  const performanceScore = stressTest?.executed ? (stressPassed ? 100 : 35) : 85;
  const score = Math.round(batteryHealth * 0.35 + storageHealth * 0.25 + performanceScore * 0.15 + manualScore * 0.25);
  const grade = score >= 88 ? "A" : score >= 74 ? "B" : "C";
  const needsReview = batteryHealth < 75 || !storageOkay || stressPassed === false || failedChecks.length > 0;

  return { batteryHealth, storageHealth, performanceScore, manualScore, score, grade, needsReview, failedChecks } as const;
}

export function extractDeviceDiagnostics(report: DiagnosticReport | null | undefined): DeviceDiagnostics {
  const firstDisk = report?.storage?.[0];
  const stressTest = report?.performance?.stressTest;
  const peakTemperatureC = optionalNumber(stressTest?.peakTemperatureC, -20, 150);
  const stressPassed = stressTest?.executed === true && typeof stressTest.passed === "boolean"
    ? stressTest.passed && (peakTemperatureC === null || peakTemperatureC <= 95)
    : null;
  const interactiveTests = inspectionKeys.flatMap((key) => {
    const result = report?.interactiveTests?.results?.[key];
    if (!result || (result.status !== "pass" && result.status !== "fail" && result.status !== "not-run")) return [];
    return [{
      key,
      status: result.status,
      detail: typeof result.detail === "string" ? result.detail.slice(0, 500) : "Interactive check completed.",
      metrics: result.metrics && typeof result.metrics === "object" && !Array.isArray(result.metrics) ? result.metrics : {},
      completedAt: typeof result.completedAt === "string" ? result.completedAt : "",
    } satisfies InteractiveTestEvidence];
  });
  return {
    reportVersion: report?.reportVersion?.trim() || "Legacy",
    collectorVersion: report?.collector?.version?.trim() || "Unknown",
    batteryCycleCount: optionalNumber(report?.battery?.cycleCount, 0, 100_000),
    storagePowerOnHours: optionalNumber(firstDisk?.powerOnHours, 0, 10_000_000),
    storageTemperatureC: optionalNumber(firstDisk?.temperatureC, -20, 150),
    storageWearPercent: optionalNumber(firstDisk?.wearPercent, 0, 100),
    memoryUsedPercent: optionalNumber(report?.performance?.memory?.usedPercent, 0, 100),
    cpuTemperatureC: optionalNumber(report?.performance?.cpu?.temperatureCBeforeTest, -20, 150),
    cpuStressExecuted: stressTest?.executed === true,
    cpuStressPassed: stressPassed,
    cpuStressDurationSeconds: optionalNumber(stressTest?.durationSeconds, 0, 3_600),
    cpuStressWorkerCount: optionalNumber(stressTest?.workerCount, 0, 256),
    cpuStressCompletedWorkers: optionalNumber(stressTest?.completedWorkers, 0, 256),
    cpuAverageLoadPercent: optionalNumber(stressTest?.averageLoadPercent, 0, 100),
    cpuPeakTemperatureC: peakTemperatureC,
    interactiveSuiteVersion: report?.interactiveTests?.suiteVersion?.trim() || "",
    interactiveTests,
    serverSignatureVerified: report?.integrity?.serverSignatureVerified === true,
    verifiedAgentName: report?.integrity?.verifiedAgentName?.trim() || "",
  };
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function optionalNumber(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(minimum, Math.min(maximum, Math.round(value * 10) / 10));
}
