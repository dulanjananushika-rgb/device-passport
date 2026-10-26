import os

# 1. Fix lib/daily-settlement.ts
ds_path = r"D:\Software_Projects\deploy\device-passport\lib\daily-settlement.ts"
with open(ds_path, "r", encoding="utf-8") as f:
    ds_code = f.read().replace("\r\n", "\n")

ds_target = """export function getDailySettlement(dateIso: string, database?: DatabaseSync): DailySettlementData {
  const db = database || getDatabase();
  const settings = getShopSettings();
  const now = new Date().toISOString();"""

ds_replacement = """export function getDailySettlement(dateIso: string, database?: DatabaseSync): DailySettlementData {
  const db = database || getDatabase();
  const settings = getShopSettings();
  const now = new Date().toISOString();

  const fmt = (c: number) => formatCurrency(c, {
    symbol: settings.currencySymbol || "$",
    position: (settings.currencyPosition as any) || "prefix",
  });"""

if ds_target in ds_code:
    ds_code = ds_code.replace(ds_target, ds_replacement)
    with open(ds_path, "w", encoding="utf-8") as f:
        f.write(ds_code)
    print("daily-settlement.ts fmt definition fixed!")
else:
    print("ERROR: ds_target not found in daily-settlement.ts")

# 2. Fix lib/repairs.ts
rep_path = r"D:\Software_Projects\deploy\device-passport\lib\repairs.ts"
with open(rep_path, "r", encoding="utf-8") as f:
    rep_code = f.read().replace("\r\n", "\n")

rep_code = rep_code.replace(
    'import { formatCurrency, parseCurrencyAmountToCents } from "./finance";',
    'import { formatCurrency, formatMinorUnitsToLkr, parseCurrencyAmountToCents } from "./finance";'
)

with open(rep_path, "w", encoding="utf-8") as f:
    f.write(rep_code)
print("repairs.ts imports fixed!")
