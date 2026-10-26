export type MonthlyFinanceMetric = {
  month: string;
  label: string;
  sales: number;
  revenueCents: number;
  grossProfitCents: number;
};

export type ReliabilityMetric = {
  model: string;
  devices: number;
  sold: number;
  claims: number;
  affectedDevices: number;
  claimRate: number;
  averageHealth: number;
  warrantyCostCents: number;
};

export type TechnicianMetric = {
  id: string;
  name: string;
  role: string;
  assigned: number;
  completed: number;
  open: number;
  overdue: number;
  averageTurnaroundDays: number | null;
};

export type DeviceFinanceItem = {
  deviceId: string;
  deviceName: string;
  model: string;
  serial: string;
  lifecycleStatus: "Draft" | "Ready" | "Sold";
  soldAt: string;
  purchaseCostCents: number;
  refurbishmentCostCents: number;
  salePriceCents: number;
  warrantyCostCents: number;
  grossProfitCents: number | null;
  updatedAt: string;
};

export type FinanceAnalytics = {
  generatedAt: string;
  metrics: {
    revenueCents: number;
    realizedCostCents: number;
    grossProfitCents: number;
    grossMargin: number;
    inventoryInvestmentCents: number;
    warrantyCostCents: number;
    soldDevices: number;
    claimRate: number;
    completedClaims: number;
    slaMetRate: number;
    averageTurnaroundDays: number | null;
  };
  completeness: {
    missingPurchaseCosts: number;
    missingSalePrices: number;
    completeSoldRecords: number;
    soldRecords: number;
  };
  monthly: MonthlyFinanceMetric[];
  reliability: ReliabilityMetric[];
  technicians: TechnicianMetric[];
  devices: DeviceFinanceItem[];
};

export type CurrencyFormatOptions = {
  symbol?: string;
  code?: string;
  position?: "prefix" | "suffix";
  decimals?: number;
  locale?: string;
};

export function parseCurrencyAmountToCents(value: unknown, label: string, allowZero = true): number {
  const normalized = typeof value === "number" && Number.isFinite(value) ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`${label} must be a valid amount with up to two decimal places.`);
  }
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount > 100_000_000 || (!allowZero && amount <= 0)) {
    throw new Error(`${label} must be ${allowZero ? "between 0 and" : "greater than 0 and no more than"} 100,000,000.`);
  }
  return Math.round(amount * 100);
}

export function parseLkrToCents(value: unknown, label: string, allowZero = true): number {
  return parseCurrencyAmountToCents(value, label, allowZero);
}

export function formatCurrency(cents: number, options: CurrencyFormatOptions = {}): string {
  const {
    symbol = "$",
    position = "prefix",
    decimals = 2,
    locale = "en-US",
  } = options;
  const major = cents / 100;
  const formattedNumber = major.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (position === "suffix") {
    return `${formattedNumber} ${symbol.trim()}`;
  }
  const glue = symbol.endsWith(" ") ? "" : (symbol.length > 2 ? " " : "");
  return `${symbol}${glue}${formattedNumber}`;
}

export function formatMinorUnitsWithSettings(
  cents: number,
  settings?: { currencySymbol?: string; currencyCode?: string; currencyPosition?: "prefix" | "suffix" }
): string {
  const symbol = settings?.currencySymbol || "$";
  const position = settings?.currencyPosition || "prefix";
  return formatCurrency(cents, { symbol, position });
}

export function formatMinorUnitsToLkr(cents: number): string {
  return formatCurrency(cents, { symbol: "LKR ", position: "prefix" });
}
