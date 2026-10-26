import os

# 1. Update lib/finance.ts
finance_path = r"D:\Software_Projects\deploy\device-passport\lib\finance.ts"
with open(finance_path, "r", encoding="utf-8") as f:
    finance_code = f.read().replace("\r\n", "\n")

finance_target = """export function parseLkrToCents(value: unknown, label: string, allowZero = true) {
  const normalized = typeof value === "number" && Number.isFinite(value) ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\\d{1,9}(?:\\.\\d{1,2})?$/.test(normalized)) throw new Error(`${label} must be a valid LKR amount with up to two decimal places.`);
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount > 100_000_000 || (!allowZero && amount <= 0)) {
    throw new Error(`${label} must be ${allowZero ? "between 0 and" : "greater than 0 and no more than"} LKR 100,000,000.`);
  }
  return Math.round(amount * 100);
}


export function formatMinorUnitsToLkr(cents: number): string {
  const lkr = cents / 100;
  return "LKR " + lkr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}"""

finance_replacement = """export type CurrencyFormatOptions = {
  symbol?: string;
  code?: string;
  position?: "prefix" | "suffix";
  decimals?: number;
  locale?: string;
};

export function parseCurrencyAmountToCents(value: unknown, label: string, allowZero = true): number {
  const normalized = typeof value === "number" && Number.isFinite(value) ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\\d{1,9}(?:\\.\\d{1,2})?$/.test(normalized)) {
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
}"""

if finance_target in finance_code:
    finance_code = finance_code.replace(finance_target, finance_replacement)
    with open(finance_path, "w", encoding="utf-8") as f:
        f.write(finance_code)
    print("lib/finance.ts updated successfully")
else:
    print("WARNING: finance_target not found in lib/finance.ts")
