/**
 * DevicePassport - Live Public E-Commerce Stock Catalog
 * Powers the customer-facing refurbished laptop showroom with verified hardware specs,
 * diagnostic test scores, battery health badges, transparent pricing, and 1-click WhatsApp inquiries.
 */

import type { DatabaseSync } from "node:sqlite";
import { getDatabase, getShopSettings } from "./database";
import { formatMinorUnitsToLkr } from "./finance";
import { generateWhatsAppClickToChatUrl, normalizeWhatsAppPhone } from "./whatsapp";

export interface CatalogFilterOptions {
  organizationId?: string;
  branchId?: string;
  brand?: string;
  processorTier?: "i3" | "i5" | "i7" | "i9" | "ryzen3" | "ryzen5" | "ryzen7" | "apple_m" | "other";
  minRamGb?: number;
  maxPriceCents?: number;
  minPriceCents?: number;
  grade?: "A" | "B" | "C";
  search?: string;
  sort?: "price_asc" | "price_desc" | "score_desc" | "newest";
  page?: number;
  pageSize?: number;
  includeSold?: boolean;
}

export interface CatalogItem {
  id: string;
  name: string;
  model: string;
  brand: string;
  serialMasked: string;
  serial: string;
  grade: "A" | "B" | "C";
  score: number;
  batteryHealth: number;
  storageHealth: number;
  memory: string;
  ramGb: number;
  storage: string;
  processor: string;
  processorTier: string;
  warrantyDurationMonths: number;
  priceCents: number;
  formattedPrice: string;
  status: string;
  testedAt: string;
  thumbnailUrl?: string;
  passportUrl: string;
  inquiryWhatsAppUrl: string;
}

export interface CatalogQueryResult {
  items: CatalogItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Extracts the primary brand name from device title/model.
 */
export function extractBrand(name: string, model: string): string {
  const text = `${name} ${model}`.toLowerCase();
  if (text.includes("lenovo") || text.includes("thinkpad")) return "Lenovo";
  if (text.includes("dell") || text.includes("latitude") || text.includes("xps") || text.includes("precision")) return "Dell";
  if (text.includes("hp") || text.includes("elitebook") || text.includes("probook") || text.includes("zbook")) return "HP";
  if (text.includes("apple") || text.includes("macbook")) return "Apple";
  if (text.includes("asus") || text.includes("zenbook") || text.includes("rog")) return "Asus";
  if (text.includes("acer")) return "Acer";
  if (text.includes("microsoft") || text.includes("surface")) return "Microsoft";
  if (text.includes("toshiba") || text.includes("dynabook")) return "Toshiba";
  if (text.includes("msi")) return "MSI";
  return name.split(" ")[0] || "Custom";
}

/**
 * Parses numeric RAM capacity in gigabytes from strings like "16 GB DDR4" or "8GB".
 */
export function parseRamGb(memoryStr: string): number {
  if (!memoryStr) return 0;
  const match = memoryStr.match(/(\d+)\s*(?:gb|g)/i);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Identifies CPU class / family for filtering.
 */
export function extractProcessorTier(processor: string): "i3" | "i5" | "i7" | "i9" | "ryzen3" | "ryzen5" | "ryzen7" | "apple_m" | "other" {
  const p = processor.toLowerCase();
  if (p.includes("i9") || p.includes("core 9")) return "i9";
  if (p.includes("i7") || p.includes("core 7")) return "i7";
  if (p.includes("i5") || p.includes("core 5")) return "i5";
  if (p.includes("i3") || p.includes("core 3")) return "i3";
  if (p.includes("ryzen 7")) return "ryzen7";
  if (p.includes("ryzen 5")) return "ryzen5";
  if (p.includes("ryzen 3")) return "ryzen3";
  if (p.includes("m1") || p.includes("m2") || p.includes("m3") || p.includes("apple silicon")) return "apple_m";
  return "other";
}

/**
 * Masks serial numbers for public web listings to prevent unauthorized warranty scrape abuse.
 * Example: 'PF3K9L2A' -> 'PF****2A'
 */
export function maskSerialNumber(serial: string): string {
  if (!serial || serial.length <= 4) return serial || "****";
  const start = serial.slice(0, 2);
  const end = serial.slice(-2);
  const middle = "*".repeat(Math.max(3, serial.length - 4));
  return `${start}${middle}${end}`;
}

/**
 * Resolves or realistically estimates market selling price in cents based on specs, grade, and intake cost.
 */
export function resolveCatalogPriceCents(device: any, intakeCostCents?: number, soldPriceCents?: number): number {
  if (soldPriceCents && soldPriceCents > 0) {
    return soldPriceCents;
  }
  if (intakeCostCents && intakeCostCents > 0) {
    // 35% standard refurbished retail markup
    return Math.round(intakeCostCents * 1.35);
  }

  // Realistic market benchmark baseline (LKR cents)
  let baseLkr = 75000;
  const proc = device.processor?.toLowerCase() || "";
  if (proc.includes("i7") || proc.includes("ryzen 7")) baseLkr += 35000;
  else if (proc.includes("i5") || proc.includes("ryzen 5")) baseLkr += 18000;
  else if (proc.includes("m1") || proc.includes("m2")) baseLkr += 65000;

  const ram = parseRamGb(device.memory || "");
  if (ram >= 32) baseLkr += 20000;
  else if (ram >= 16) baseLkr += 10000;

  if (device.grade === "A") baseLkr += 8000;
  else if (device.grade === "C") baseLkr -= 10000;

  return baseLkr * 100;
}

/**
 * Queries the public inventory catalog with rich filtering, pagination, and instant WhatsApp inquiry URLs.
 */
export async function queryPublicCatalog(
  filters: CatalogFilterOptions = {},
  database?: DatabaseSync
): Promise<CatalogQueryResult> {
  const db = database || getDatabase();
  const settings = getShopSettings();
  const shopPhone = settings?.phone || "0771234567";
  const shopName = settings?.shopName || "Lapmart";

  // Raw query for active devices
  const rawRows = db.prepare(`
    SELECT
      d.id,
      d.name,
      d.model,
      d.serial,
      d.grade,
      d.score,
      d.battery_health,
      d.storage_health,
      d.memory,
      d.storage,
      d.processor,
      d.tested_at,
      d.status,
      s.sold_at,
      s.sale_price_cents as sold_price,
      i.purchase_cost_cents,
      f.purchase_cost_cents as finance_purchase_cost
    FROM devices d
    LEFT JOIN device_sales s ON s.device_id = d.id
    LEFT JOIN stock_intakes i ON i.device_id = d.id
    LEFT JOIN device_finance f ON f.device_id = d.id
    WHERE d.status != 'Draft'
    ORDER BY d.created_at DESC
  `).all() as any[];

  // Map into rich catalog items
  let catalogItems: CatalogItem[] = rawRows.map((row) => {
    const brand = extractBrand(row.name, row.model);
    const ramGb = parseRamGb(row.memory);
    const processorTier = extractProcessorTier(row.processor);
    const intakeCost = row.purchase_cost_cents || row.finance_purchase_cost || 0;
    const priceCents = resolveCatalogPriceCents(row, intakeCost, row.sold_price);
    const formattedPrice = formatMinorUnitsToLkr(priceCents);
    const serialMasked = maskSerialNumber(row.serial);
    const passportUrl = `/passport/${row.serial}`;

    const inquiryMessage =
      `Hi ${shopName}! I'm interested in the certified ${brand} ${row.name} ` +
      `(Grade ${row.grade}, Battery ${row.battery_health}%, Price: ${formattedPrice}). ` +
      `Is it still available in stock?`;
    const inquiryWhatsAppUrl = generateWhatsAppClickToChatUrl(shopPhone, inquiryMessage);

    return {
      id: row.id,
      name: row.name,
      model: row.model,
      brand,
      serialMasked,
      serial: row.serial,
      grade: row.grade,
      score: row.score,
      batteryHealth: row.battery_health,
      storageHealth: row.storage_health,
      memory: row.memory,
      ramGb,
      storage: row.storage,
      processor: row.processor,
      processorTier,
      warrantyDurationMonths: settings?.warrantyMonths || 6,
      priceCents,
      formattedPrice,
      status: row.sold_at ? "Sold" : "Available",
      testedAt: row.tested_at,
      passportUrl,
      inquiryWhatsAppUrl,
    };
  });

  // Apply filters in memory
  if (!filters.includeSold) {
    catalogItems = catalogItems.filter((item) => item.status === "Available");
  }

  if (filters.brand) {
    const brandFilter = filters.brand.toLowerCase();
    catalogItems = catalogItems.filter((item) => item.brand.toLowerCase() === brandFilter);
  }

  if (filters.grade) {
    catalogItems = catalogItems.filter((item) => item.grade === filters.grade);
  }

  if (filters.minRamGb) {
    catalogItems = catalogItems.filter((item) => item.ramGb >= filters.minRamGb!);
  }

  if (filters.processorTier) {
    catalogItems = catalogItems.filter((item) => item.processorTier === filters.processorTier);
  }

  if (filters.minPriceCents !== undefined) {
    catalogItems = catalogItems.filter((item) => item.priceCents >= filters.minPriceCents!);
  }

  if (filters.maxPriceCents !== undefined) {
    catalogItems = catalogItems.filter((item) => item.priceCents <= filters.maxPriceCents!);
  }

  if (filters.search) {
    const query = filters.search.toLowerCase();
    catalogItems = catalogItems.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.model.toLowerCase().includes(query) ||
        item.processor.toLowerCase().includes(query) ||
        item.brand.toLowerCase().includes(query) ||
        item.serial.toLowerCase().includes(query)
    );
  }

  // Sorting
  const sort = filters.sort || "newest";
  if (sort === "price_asc") {
    catalogItems.sort((a, b) => a.priceCents - b.priceCents);
  } else if (sort === "price_desc") {
    catalogItems.sort((a, b) => b.priceCents - a.priceCents);
  } else if (sort === "score_desc") {
    catalogItems.sort((a, b) => b.score - a.score);
  }

  // Pagination
  const totalCount = catalogItems.length;
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.max(1, Math.min(50, filters.pageSize || 12));
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const startIndex = (page - 1) * pageSize;
  const paginatedItems = catalogItems.slice(startIndex, startIndex + pageSize);

  return {
    items: paginatedItems,
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * Retrieves a single catalog item by ID or full serial number.
 */
export async function getCatalogItemBySerial(
  serialOrId: string,
  database?: DatabaseSync
): Promise<CatalogItem | null> {
  const result = await queryPublicCatalog({ search: serialOrId, includeSold: true }, database);
  const item = result.items.find(
    (i) => i.serial.toLowerCase() === serialOrId.toLowerCase() || i.id === serialOrId
  );
  return item || null;
}
