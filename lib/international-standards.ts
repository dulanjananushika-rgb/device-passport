/**
 * International Hardware, Grading & Legal Standards Engine for DevicePassport
 * Conforms to:
 * 1. R2v3 / SERI Certified Refurbished Cosmetic Grading Standards
 * 2. International 80% Battery Health Threshold for Certified Electronics
 * 3. Global Keyboard Layouts & Power Plug Form Factors
 * 4. US FTC Magnuson-Moss & EU Statutory Consumer Protection Disclaimers
 */

export const INTERNATIONAL_KEYBOARD_LAYOUTS = [
  "US QWERTY",
  "UK English",
  "German QWERTZ",
  "French AZERTY",
  "Spanish QWERTY",
  "Nordic (Swedish/Finnish/Danish)",
  "Japanese JIS",
  "Arabic Bilingual",
  "Italian QWERTY",
  "Other / Custom Layout",
] as const;

export type InternationalKeyboardLayout = (typeof INTERNATIONAL_KEYBOARD_LAYOUTS)[number];

export const POWER_ADAPTER_PLUG_TYPES = [
  "Type A/B (US / Canada / Japan - 110V/120V)",
  "Type G (UK / Ireland / Singapore / UAE - 3-pin 230V)",
  "Type C/F (EU / Schuko / India - 2-pin 230V)",
  "Type I (Australia / New Zealand - 3-pin 240V)",
  "USB-C Universal GaN (65W Fast Charge)",
  "USB-C Universal GaN (100W/140W Performance)",
  "OEM Proprietary Barrel Jack",
] as const;

export type PowerAdapterPlugType = (typeof POWER_ADAPTER_PLUG_TYPES)[number];

export interface R2v3CosmeticGrade {
  grade: "A+" | "A" | "B" | "C" | "D";
  title: string;
  description: string;
  cosmeticCriteria: string;
  functionalStandard: string;
}

export const R2V3_COSMETIC_GRADES: Record<string, R2v3CosmeticGrade> = {
  "A+": {
    grade: "A+",
    title: "Pristine / Like-New",
    description: "Mint cosmetic condition with zero visible scratches or signs of handling.",
    cosmeticCriteria: "No blemishes, screen is immaculate, chassis pristine, zero keyboard shine.",
    functionalStandard: "100% Fully Functional, OEM Diagnostic Passed.",
  },
  "A": {
    grade: "A",
    title: "Excellent Condition",
    description: "Near-mint with minimal micro-scratches imperceptible from an arm's length (12 inches).",
    cosmeticCriteria: "Flawless display panel, negligible faint hairline marks on bottom plate.",
    functionalStandard: "100% Fully Functional, Certified Diagnostic Passed.",
  },
  "B": {
    grade: "B",
    title: "Very Good Condition",
    description: "Light cosmetic wear consistent with normal professional office use.",
    cosmeticCriteria: "Minor scuffs on outer casing, light keyboard keycap shine, screen free of dead pixels.",
    functionalStandard: "100% Fully Functional, Certified Diagnostic Passed.",
  },
  "C": {
    grade: "C",
    title: "Good / Fair Condition",
    description: "Noticeable cosmetic blemishes, scuffs or small casing dings; structurally 100% sound.",
    cosmeticCriteria: "Moderate scratches or edge scuffs. Display may have minor pressure spots not hindering usage.",
    functionalStandard: "100% Fully Functional, All Ports & Features Tested.",
  },
  "D": {
    grade: "D",
    title: "As-Is / Salvage / Parts",
    description: "Heavy wear, broken casing, or hardware defects requiring technician refurbishment.",
    cosmeticCriteria: "Cracked chassis, missing keycaps, or defective display.",
    functionalStandard: "For parts harvesting or chip-level motherboard repair.",
  },
};

export interface BatteryComplianceCheck {
  healthPercentage: number;
  isCompliant: boolean;
  tier: "Pristine" | "Certified" | "Deficient";
  badgeLabel: string;
  statusColor: string;
  recommendation: string;
}

/**
 * Validates laptop battery health against the global 80% Certified Refurbished threshold.
 * (Apple Certified Refurbished, Amazon Renewed, and Back Market require >= 80% maximum capacity).
 */
export function checkRefurbishedBatteryCompliance(healthPercentage: number): BatteryComplianceCheck {
  const health = Math.max(0, Math.min(100, Math.round(healthPercentage)));

  if (health >= 85) {
    return {
      healthPercentage: health,
      isCompliant: true,
      tier: "Pristine",
      badgeLabel: `✓ ${health}% - Pristine Battery`,
      statusColor: "#16a34a",
      recommendation: "Exceeds enterprise certified standards. No battery servicing required.",
    };
  }

  if (health >= 80) {
    return {
      healthPercentage: health,
      isCompliant: true,
      tier: "Certified",
      badgeLabel: `✓ ${health}% - Certified Standard`,
      statusColor: "#0284c7",
      recommendation: "Meets international 80% Certified Refurbished minimum threshold.",
    };
  }

  return {
    healthPercentage: health,
    isCompliant: false,
    tier: "Deficient",
    badgeLabel: `⚠️ ${health}% - Below 80% Threshold`,
    statusColor: "#dc2626",
    recommendation: "Fails international 80% Certified Refurbished standard. Requires battery pack replacement or customer disclosure.",
  };
}

export const LEGAL_DISCLAIMERS = {
  MAGNUSON_MOSS: "Tamper-Evident Security Seal: Applied solely for warranty tracking, component identification, and device authenticity verification. Does not alter or restrict statutory consumer warranty rights under the Magnuson-Moss Warranty Act.",
  EU_CONSUMER_RIGHTS: "Statutory Consumer Rights: Includes mandatory 14-day distance selling satisfaction guarantee and statutory commercial defect warranty.",
  UK_EU_MARGIN_SCHEME: "Margin scheme — Second-hand goods (Article 313 of Council Directive 2006/112/EC / HMRC Notice 718).",
};
