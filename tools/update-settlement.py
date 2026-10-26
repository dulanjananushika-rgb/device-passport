import os

path = r"D:\Software_Projects\deploy\device-passport\lib\daily-settlement.ts"
with open(path, "r", encoding="utf-8") as f:
    code = f.read().replace("\r\n", "\n")

target_import = """import { formatMinorUnitsToLkr } from "./finance";"""
replacement_import = """import { formatCurrency } from "./finance";"""

code = code.replace(target_import, replacement_import)

target_get = """  // 1. Fetch sales on that date
  const salesRows = db.prepare(`"""

replacement_get = """  const fmt = (c: number) => formatCurrency(c, {
    symbol: settings.currencySymbol || "$",
    position: (settings.currencyPosition as any) || "prefix",
  });

  // 1. Fetch sales on that date
  const salesRows = db.prepare(`"""

code = code.replace(target_get, replacement_get)

target_block = """      salePriceCents: price,
      formattedPrice: formatMinorUnitsToLkr(price),"""

replacement_block = """      salePriceCents: price,
      formattedPrice: fmt(price),"""

code = code.replace(target_block, replacement_block)

code = code.replace("formattedGrossRevenue: formatMinorUnitsToLkr(totalGrossRevenueCents),", "formattedGrossRevenue: fmt(totalGrossRevenueCents),")
code = code.replace("formattedCash: formatMinorUnitsToLkr(totalCashCents),", "formattedCash: fmt(totalCashCents),")
code = code.replace("formattedCard: formatMinorUnitsToLkr(totalCardCents),", "formattedCard: fmt(totalCardCents),")
code = code.replace("formattedBankTransfer: formatMinorUnitsToLkr(totalBankTransferCents),", "formattedBankTransfer: fmt(totalBankTransferCents),")
code = code.replace("formattedInstallment: formatMinorUnitsToLkr(totalInstallmentCents),", "formattedInstallment: fmt(totalInstallmentCents),")
code = code.replace("formattedCogs: formatMinorUnitsToLkr(totalCogsCents),", "formattedCogs: fmt(totalCogsCents),")
code = code.replace("formattedPartsCost: formatMinorUnitsToLkr(totalPartsCostCents),", "formattedPartsCost: fmt(totalPartsCostCents),")
code = code.replace("formattedNetProfit: formatMinorUnitsToLkr(netRealizedProfitCents),", "formattedNetProfit: fmt(netRealizedProfitCents),")
code = code.replace("formattedPettyCashOut: formatMinorUnitsToLkr(totalPettyCashOutCents),", "formattedPettyCashOut: fmt(totalPettyCashOutCents),")
code = code.replace("formattedExpectedDrawerCash: formatMinorUnitsToLkr(expectedDrawerCashCents),", "formattedExpectedDrawerCash: fmt(expectedDrawerCashCents),")
code = code.replace("formattedServiceCost: formatMinorUnitsToLkr(serviceCostCents),", "formattedServiceCost: fmt(serviceCostCents),")

with open(path, "w", encoding="utf-8") as f:
    f.write(code)

print("lib/daily-settlement.ts updated to dynamic formatCurrency!")
