/**
 * DevicePassport - Component Genuine & Tamper Verification Engine
 * Cross-references Motherboard UUID, RAM module serials, Storage WWNs, and Battery BMS serials
 * to detect component swapping, unauthorized parts downgrades, and counterfeit replacements.
 */

export interface MemoryModuleSnapshot {
  slot: string;
  manufacturer: string;
  partNumber: string;
  serial: string;
  sizeGb: number;
  speedMhz?: number;
}

export interface StorageDriveSnapshot {
  model: string;
  serial: string;
  sizeGb: number;
  interfaceType?: "NVMe" | "SATA" | "eMMC" | "Unknown";
  firmwareRevision?: string;
}

export interface BatterySnapshot {
  manufacturer: string;
  serial: string;
  designCapacityMwh?: number;
  chemistry?: string;
}

export interface MotherboardSnapshot {
  manufacturer: string;
  productName: string;
  serial: string;
  uuid?: string;
  biosVersion?: string;
}

export interface HardwareInventorySnapshot {
  motherboard?: MotherboardSnapshot;
  memoryModules: MemoryModuleSnapshot[];
  storageDrives: StorageDriveSnapshot[];
  battery?: BatterySnapshot;
}

export interface ComponentDiscrepancy {
  componentType: "Motherboard" | "RAM" | "Storage" | "Battery";
  identifier: string;
  issue: "Swapped" | "Missing" | "Suspicious / Counterfeit" | "Unverified Replacement";
  baselineSerial?: string;
  currentSerial?: string;
  details: string;
}

export interface AuthenticityAssessmentResult {
  authenticityScore: number; // 0 - 100
  authenticityGrade:
    | "100% Genuine OEM Original"
    | "Verified OEM Upgraded"
    | "Warning - Non-OEM Replaced"
    | "Tampered / Counterfeit Detected";
  hasTampering: boolean;
  discrepancies: ComponentDiscrepancy[];
  verifiedComponentsSummary: string[];
}

const TIER1_RAM_OEM = [
  "samsung",
  "sk hynix",
  "hynix",
  "micron",
  "crucial",
  "kingston",
  "transcend",
  "adata",
  "nanya",
  "elpida",
  "ramaxel",
  "corsair",
];

const SUSPICIOUS_SERIAL_PATTERNS = [
  /^0+$/,
  /^f+$/i,
  /^12345678/,
  /none/i,
  /default string/i,
  /to be filled by o\.e\.m/i,
  /unknown/i,
  /not specified/i,
];

/**
 * Checks whether a serial string matches known bogus or dummy firmware placeholders.
 */
export function isSuspiciousSerial(serial: string): boolean {
  if (!serial || serial.trim().length < 4) return true;
  const s = serial.trim();
  return SUSPICIOUS_SERIAL_PATTERNS.some((pattern) => pattern.test(s));
}

/**
 * Performs anti-tamper verification by comparing current hardware to intake baseline
 * and validating component authenticity against OEM manufacturer signatures.
 */
export function verifyComponentAuthenticity(
  current: HardwareInventorySnapshot,
  baseline?: HardwareInventorySnapshot
): AuthenticityAssessmentResult {
  const discrepancies: ComponentDiscrepancy[] = [];
  const verifiedSummary: string[] = [];
  let score = 100;

  // 1. Motherboard Verification
  if (current.motherboard) {
    const mb = current.motherboard;
    if (isSuspiciousSerial(mb.serial)) {
      discrepancies.push({
        componentType: "Motherboard",
        identifier: mb.productName || "Mainboard",
        issue: "Suspicious / Counterfeit",
        currentSerial: mb.serial,
        details: "Motherboard serial number appears to be a generic placeholder or reprogrammed chip.",
      });
      score -= 25;
    } else {
      verifiedSummary.push(`Motherboard verified (S/N: ${mb.serial})`);
    }

    if (baseline?.motherboard && baseline.motherboard.serial) {
      if (baseline.motherboard.serial.toLowerCase() !== mb.serial.toLowerCase()) {
        discrepancies.push({
          componentType: "Motherboard",
          identifier: mb.productName,
          issue: "Swapped",
          baselineSerial: baseline.motherboard.serial,
          currentSerial: mb.serial,
          details: "Motherboard does not match intake baseline snapshot.",
        });
        score -= 40;
      }
    }
  }

  // 2. RAM Modules Verification
  const baselineRamBySlot = new Map<string, MemoryModuleSnapshot>();
  if (baseline) {
    for (const mod of baseline.memoryModules) {
      baselineRamBySlot.set(mod.slot, mod);
    }
  }

  for (const mod of current.memoryModules) {
    const isSuspicious = isSuspiciousSerial(mod.serial);
    const mfgLower = (mod.manufacturer || "").toLowerCase().trim();
    const isKnownOem = TIER1_RAM_OEM.some((oem) => mfgLower.includes(oem));

    if (isSuspicious) {
      discrepancies.push({
        componentType: "RAM",
        identifier: `Slot ${mod.slot}`,
        issue: "Suspicious / Counterfeit",
        currentSerial: mod.serial,
        details: `RAM module in slot ${mod.slot} has invalid or dummy serial number '${mod.serial}'.`,
      });
      score -= 15;
    } else if (!isKnownOem && mfgLower.length > 0) {
      discrepancies.push({
        componentType: "RAM",
        identifier: `Slot ${mod.slot}`,
        issue: "Unverified Replacement",
        currentSerial: mod.serial,
        details: `RAM manufacturer '${mod.manufacturer}' is a generic third-party brand rather than Tier-1 OEM.`,
      });
      score -= 5;
    } else {
      verifiedSummary.push(`RAM ${mod.sizeGb}GB ${mod.manufacturer} (Slot ${mod.slot}) genuine`);
    }

    // Compare with baseline if present
    if (baseline) {
      const bMod = baselineRamBySlot.get(mod.slot);
      if (bMod && bMod.serial && mod.serial && bMod.serial.toLowerCase() !== mod.serial.toLowerCase()) {
        discrepancies.push({
          componentType: "RAM",
          identifier: `Slot ${mod.slot}`,
          issue: "Swapped",
          baselineSerial: bMod.serial,
          currentSerial: mod.serial,
          details: `RAM module in slot ${mod.slot} changed from ${bMod.sizeGb}GB (${bMod.serial}) to ${mod.sizeGb}GB (${mod.serial}).`,
        });
        score -= 10;
      }
    }
  }

  // 3. Storage Drives Verification
  const baselineDrives = new Map<string, StorageDriveSnapshot>();
  if (baseline) {
    for (const d of baseline.storageDrives) {
      baselineDrives.set(d.serial.toLowerCase(), d);
    }
  }

  for (const drive of current.storageDrives) {
    if (isSuspiciousSerial(drive.serial)) {
      discrepancies.push({
        componentType: "Storage",
        identifier: drive.model,
        issue: "Suspicious / Counterfeit",
        currentSerial: drive.serial,
        details: `Storage drive serial number '${drive.serial}' appears invalid or simulated.`,
      });
      score -= 15;
    } else {
      verifiedSummary.push(`Storage ${drive.model} (${drive.sizeGb}GB) S/N: ${drive.serial} verified`);
    }

    if (baseline && baseline.storageDrives.length > 0) {
      const matched = baselineDrives.get(drive.serial.toLowerCase());
      if (!matched) {
        discrepancies.push({
          componentType: "Storage",
          identifier: drive.model,
          issue: "Swapped",
          currentSerial: drive.serial,
          details: `Storage drive '${drive.model}' (S/N: ${drive.serial}) was replaced after intake.`,
        });
        score -= 10;
      }
    }
  }

  // 4. Battery Verification
  if (current.battery) {
    const bat = current.battery;
    if (isSuspiciousSerial(bat.serial)) {
      discrepancies.push({
        componentType: "Battery",
        identifier: bat.manufacturer || "Battery",
        issue: "Suspicious / Counterfeit",
        currentSerial: bat.serial,
        details: `Battery BMS serial '${bat.serial}' is missing or generic.`,
      });
      score -= 15;
    } else {
      verifiedSummary.push(`Battery BMS S/N: ${bat.serial} verified`);
    }

    if (baseline?.battery?.serial && bat.serial) {
      if (baseline.battery.serial.toLowerCase() !== bat.serial.toLowerCase()) {
        discrepancies.push({
          componentType: "Battery",
          identifier: bat.manufacturer,
          issue: "Swapped",
          baselineSerial: baseline.battery.serial,
          currentSerial: bat.serial,
          details: `Battery pack was replaced after intake.`,
        });
        score -= 10;
      }
    }
  }

  score = Math.max(0, Math.min(100, score));
  const hasTampering = discrepancies.some(
    (d) => d.issue === "Swapped" || d.issue === "Suspicious / Counterfeit"
  );

  let authenticityGrade: AuthenticityAssessmentResult["authenticityGrade"] = "100% Genuine OEM Original";
  if (discrepancies.some((d) => d.issue === "Suspicious / Counterfeit")) {
    authenticityGrade = "Tampered / Counterfeit Detected";
  } else if (discrepancies.some((d) => d.issue === "Swapped")) {
    // If upgraded with clean OEM parts
    authenticityGrade = score >= 80 ? "Verified OEM Upgraded" : "Tampered / Counterfeit Detected";
  } else if (discrepancies.some((d) => d.issue === "Unverified Replacement")) {
    authenticityGrade = "Warning - Non-OEM Replaced";
  } else {
    authenticityGrade = "100% Genuine OEM Original";
  }

  return {
    authenticityScore: score,
    authenticityGrade,
    hasTampering,
    discrepancies,
    verifiedComponentsSummary: verifiedSummary,
  };
}
