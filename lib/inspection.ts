export const inspectionKeys = ["display", "keyboard", "camera", "audio", "ports", "wireless"] as const;

export type InspectionKey = (typeof inspectionKeys)[number];
export type CheckStatus = "pass" | "fail";
export type InspectionChecks = Record<InspectionKey, CheckStatus>;

export type DiagnosticReport = {
  reportVersion?: string;
  collectedAt?: string;
  device?: {
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    processor?: string;
    memoryGB?: number;
  };
  battery?: { healthPercent?: number };
  storage?: Array<{ model?: string; healthStatus?: string; sizeGB?: number }>;
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
  const storageOkay = Boolean(firstDisk && /ok|healthy/i.test(firstDisk.healthStatus ?? ""));
  const storageHealth = firstDisk ? (storageOkay ? 98 : 62) : 0;
  const failedChecks = inspectionKeys.filter((key) => checks[key] === "fail");
  const manualScore = Math.round(
    inspectionKeys.reduce((sum, key) => sum + (checks[key] === "pass" ? 100 : 35), 0) / inspectionKeys.length,
  );
  const score = Math.round(batteryHealth * 0.4 + storageHealth * 0.3 + manualScore * 0.3);
  const grade = score >= 88 ? "A" : score >= 74 ? "B" : "C";
  const needsReview = batteryHealth < 75 || !storageOkay || failedChecks.length > 0;

  return { batteryHealth, storageHealth, manualScore, score, grade, needsReview, failedChecks } as const;
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
