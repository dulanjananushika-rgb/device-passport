import { DatabaseSync } from "node:sqlite";
import { getDatabase, getShopSettings } from "./database";
import { formatCurrency } from "./finance";
import { listPettyCashExpenses, type PettyCashExpense } from "./petty-cash";

export interface SettlementSaleItem {
  deviceId: string;
  deviceName: string;
  model: string;
  serial: string;
  invoiceReference: string;
  customerName: string;
  customerPhone: string;
  salePriceCents: number;
  formattedPrice: string;
  paymentMethod: string;
  cashReceivedCents: number;
  cardAmountCents: number;
  bankTransferCents: number;
  installmentCents: number;
  paymentReference: string;
  soldAt: string;
  activatedBy: string;
}

export interface DailySettlementData {
  reportId: string;
  dateIso: string;
  generatedAt: string;
  shop: {
    name: string;
    tagline: string;
    address: string;
    phone: string;
  };
  totalUnitsSold: number;
  totalGrossRevenueCents: number;
  formattedGrossRevenue: string;
  totalCashCents: number;
  formattedCash: string;
  totalCardCents: number;
  formattedCard: string;
  totalBankTransferCents: number;
  formattedBankTransfer: string;
  totalInstallmentCents: number;
  formattedInstallment: string;
  totalCostOfGoodsSoldCents: number;
  formattedCogs: string;
  totalRefurbPartsCostCents: number;
  formattedPartsCost: string;
  netRealizedProfitCents: number;
  formattedNetProfit: string;
  totalPettyCashOutCents: number;
  formattedPettyCashOut: string;
  expectedDrawerCashCents: number;
  formattedExpectedDrawerCash: string;
  pettyCashExpenses: PettyCashExpense[];
  sales: SettlementSaleItem[];
  claimsSummary: {
    openedCount: number;
    resolvedCount: number;
    serviceCostCents: number;
    formattedServiceCost: string;
  };
}

/**
 * Calculates complete day-end financial and inventory settlement figures for a given date.
 */
export function getDailySettlement(dateIso: string, database?: DatabaseSync): DailySettlementData {
  const db = database || getDatabase();
  const settings = getShopSettings();
  const now = new Date().toISOString();

  const fmt = (c: number) => formatCurrency(c, {
    symbol: settings.currencySymbol || "$",
    position: (settings.currencyPosition as any) || "prefix",
  });

  // 1. Fetch all sales for the date
  const salesRows = db.prepare(`
    SELECT
      s.device_id,
      s.invoice_reference,
      s.customer_name,
      s.customer_phone,
      s.sale_price_cents,
      s.payment_method,
      s.cash_received_cents,
      s.card_amount_cents,
      s.bank_transfer_cents,
      s.installment_cents,
      s.payment_reference,
      s.sold_at,
      s.activated_by,
      d.name as dev_name,
      d.model,
      d.serial,
      COALESCE(f.purchase_cost_cents, 0) as purchase_cost_cents,
      COALESCE(f.parts_cost_cents, 0) as parts_cost_cents
    FROM device_sales s
    JOIN devices d ON d.id = s.device_id
    LEFT JOIN device_finance f ON f.device_id = s.device_id
    WHERE s.sold_at = ?
    ORDER BY s.created_at ASC
  `).all(dateIso) as any[];

  let totalGrossRevenueCents = 0;
  let totalCashCents = 0;
  let totalCardCents = 0;
  let totalBankTransferCents = 0;
  let totalInstallmentCents = 0;
  let totalCogsCents = 0;
  let totalPartsCostCents = 0;

  const sales: SettlementSaleItem[] = salesRows.map((r) => {
    const price = r.sale_price_cents || 0;
    const method = r.payment_method || "Cash";
    let cash = r.cash_received_cents || 0;
    let card = r.card_amount_cents || 0;
    let bank = r.bank_transfer_cents || 0;
    let inst = r.installment_cents || 0;

    // Fallback if specific amounts weren't entered for single payment methods
    if (cash === 0 && card === 0 && bank === 0 && inst === 0) {
      if (method === "Cash") cash = price;
      else if (method === "Card") card = price;
      else if (method === "Bank Transfer") bank = price;
      else if (method === "Installment") inst = price;
    }

    totalGrossRevenueCents += price;
    totalCashCents += cash;
    totalCardCents += card;
    totalBankTransferCents += bank;
    totalInstallmentCents += inst;
    totalCogsCents += r.purchase_cost_cents || 0;
    totalPartsCostCents += r.parts_cost_cents || 0;

    return {
      deviceId: r.device_id,
      deviceName: r.dev_name,
      model: r.model,
      serial: r.serial,
      invoiceReference: r.invoice_reference,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      salePriceCents: price,
      formattedPrice: fmt(price),
      paymentMethod: method,
      cashReceivedCents: cash,
      cardAmountCents: card,
      bankTransferCents: bank,
      installmentCents: inst,
      paymentReference: r.payment_reference || "",
      soldAt: r.sold_at,
      activatedBy: r.activated_by,
    };
  });

  // 2. Fetch petty cash / till cash outflows
  const pettyCashExpenses = listPettyCashExpenses(dateIso, db);
  const totalPettyCashOutCents = pettyCashExpenses.reduce((sum, e) => sum + e.amountCents, 0);
  const expectedDrawerCashCents = Math.max(0, totalCashCents - totalPettyCashOutCents);

  const netRealizedProfitCents = totalGrossRevenueCents - totalCogsCents - totalPartsCostCents;

  // 2. Warranty claims on that date
  const claimsOpened = (db.prepare(`
    SELECT COUNT(*) as count FROM warranty_claims WHERE created_at LIKE ?
  `).get(`${dateIso}%`) as any)?.count || 0;

  const claimsResolved = (db.prepare(`
    SELECT COUNT(*) as count FROM warranty_claims WHERE status IN ('Resolved', 'Closed') AND updated_at LIKE ?
  `).get(`${dateIso}%`) as any)?.count || 0;

  const claimsCostRow = db.prepare(`
    SELECT COALESCE(SUM(service_cost_cents), 0) as total FROM warranty_claims WHERE status IN ('Resolved', 'Closed') AND updated_at LIKE ?
  `).get(`${dateIso}%`) as any;
  const serviceCostCents = claimsCostRow?.total || 0;

  const reportId = `Z-${dateIso.replaceAll("-", "")}`;

  return {
    reportId,
    dateIso,
    generatedAt: now,
    shop: {
      name: settings.shopName,
      tagline: settings.tagline,
      address: settings.address,
      phone: settings.phone,
    },
    totalUnitsSold: sales.length,
    totalGrossRevenueCents,
    formattedGrossRevenue: fmt(totalGrossRevenueCents),
    totalCashCents,
    formattedCash: fmt(totalCashCents),
    totalCardCents,
    formattedCard: fmt(totalCardCents),
    totalBankTransferCents,
    formattedBankTransfer: fmt(totalBankTransferCents),
    totalInstallmentCents,
    formattedInstallment: fmt(totalInstallmentCents),
    totalCostOfGoodsSoldCents: totalCogsCents,
    formattedCogs: fmt(totalCogsCents),
    totalRefurbPartsCostCents: totalPartsCostCents,
    formattedPartsCost: fmt(totalPartsCostCents),
    netRealizedProfitCents,
    formattedNetProfit: fmt(netRealizedProfitCents),
    totalPettyCashOutCents,
    formattedPettyCashOut: fmt(totalPettyCashOutCents),
    expectedDrawerCashCents,
    formattedExpectedDrawerCash: fmt(expectedDrawerCashCents),
    pettyCashExpenses,
    sales,
    claimsSummary: {
      openedCount: claimsOpened,
      resolvedCount: claimsResolved,
      serviceCostCents,
      formattedServiceCost: fmt(serviceCostCents),
    },
  };
}

/**
 * Generates an 80mm ESC/POS Thermal Slip for the Day-End Z-Report (Daily Settlement).
 */
export function generateDailySettlementThermalHtml(data: DailySettlementData): string {
  const salesRowsHtml = data.sales.length === 0
    ? `<tr><td colspan="4" style="text-align:center; padding: 8px 0;">No laptop sales recorded for this date.</td></tr>`
    : data.sales.map((s, idx) => `
      <tr>
        <td style="padding: 2px 0;">${idx + 1}. ${s.invoiceReference}</td>
        <td>${s.serial}</td>
        <td>${s.paymentMethod}</td>
        <td style="text-align: right; font-weight: bold;">${s.formattedPrice}</td>
      </tr>
      <tr>
        <td colspan="4" style="font-size: 0.85em; color: #333; padding-bottom: 4px; border-bottom: 1px dotted #ccc;">
          ${s.deviceName} (${s.customerName})
        </td>
      </tr>
    `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Z-Report - ${data.dateIso} - ${data.reportId}</title>
  <style>
    @page { size: auto; margin: 0; }
    body {
      font-family: 'Courier New', Courier, monospace;
      color: #000;
      background: #fff;
      margin: 0 auto;
      padding: 10px 4px;
      max-width: 76mm;
      font-size: 13px;
      line-height: 1.25;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .line { border-top: 1px dashed #000; margin: 6px 0; }
    .double-line { border-top: 2px solid #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; border-bottom: 1px solid #000; padding-bottom: 3px; }
    .drawer-box {
      border: 1px solid #000;
      padding: 6px;
      margin: 8px 0;
      background: #fdfdfd;
    }
    .sign-line {
      margin-top: 24px;
      border-top: 1px dashed #000;
      text-align: center;
      padding-top: 4px;
      font-size: 11px;
    }
  </style>
</head>
<body onload="window.print()">
  <div class="center">
    <div class="bold" style="font-size: 1.25em;">${data.shop.name}</div>
    <div>${data.shop.tagline}</div>
    <div>${data.shop.address}</div>
    <div>Tel: ${data.shop.phone}</div>
  </div>

  <div class="double-line"></div>
  <div class="center bold" style="font-size: 1.1em;">*** DAY-END Z-REPORT ***</div>
  <div class="center">DAILY CASH & SALES SETTLEMENT</div>
  <div class="line"></div>

  <div class="row"><span>Report ID:</span><span class="bold">${data.reportId}</span></div>
  <div class="row"><span>Trading Date:</span><span class="bold">${data.dateIso}</span></div>
  <div class="row"><span>Printed At:</span><span>${data.generatedAt.slice(0, 19).replace("T", " ")}</span></div>

  <div class="double-line"></div>
  <div class="row bold" style="font-size: 1.05em;">
    <span>Laptops Sold:</span>
    <span>${data.totalUnitsSold} Units</span>
  </div>
  <div class="row bold" style="font-size: 1.15em;">
    <span>GROSS SALES:</span>
    <span>${data.formattedGrossRevenue}</span>
  </div>
  <div class="double-line"></div>

  <div class="bold" style="margin-top: 6px;">TENDER BREAKDOWN:</div>
  <div class="row"><span>• Cash Collections:</span><span class="bold">${data.formattedCash}</span></div>
  <div class="row"><span>• Credit / Debit Cards:</span><span class="bold">${data.formattedCard}</span></div>
  <div class="row"><span>• Direct Bank Transfers:</span><span class="bold">${data.formattedBankTransfer}</span></div>
  <div class="row"><span>• Installments / BNPL:</span><span class="bold">${data.formattedInstallment}</span></div>

  <div class="line"></div>
  <div class="drawer-box">
    <div class="center bold">CASH DRAWER RECONCILIATION</div>
    <div class="row" style="margin-top: 4px;">
      <span>Gross Cash Collections:</span>
      <span>${data.formattedCash}</span>
    </div>
    <div class="row" style="margin-top: 2px;">
      <span>Less Petty Cash Paid Out:</span>
      <span style="color: #b91c1c;">- ${data.formattedPettyCashOut}</span>
    </div>
    <div class="row bold" style="margin-top: 4px; border-top: 1px dotted #000; padding-top: 2px;">
      <span>EXPECTED DRAWER CASH:</span>
      <span>${data.formattedExpectedDrawerCash}</span>
    </div>
    <div class="row" style="margin-top: 6px;">
      <span>Actual Physical Count:</span>
      <span>[ .................... ]</span>
    </div>
    <div class="row" style="margin-top: 6px;">
      <span>Cash Over / Short:</span>
      <span>[ .................... ]</span>
    </div>
  </div>

  ${data.pettyCashExpenses.length > 0 ? `
  <div class="line"></div>
  <div class="bold" style="margin-top: 4px;">TILL CASH OUTFLOWS (${data.pettyCashExpenses.length}):</div>
  ${data.pettyCashExpenses.map(e => `
    <div class="row" style="font-size: 11px;">
      <span>${e.category} (${e.paidTo}):</span>
      <span>- ${e.formattedAmount}</span>
    </div>
    <div style="font-size: 10px; color: #444; margin-bottom: 2px;">${e.description} (Voucher #${e.receiptVoucherRef})</div>
  `).join("")}
  ` : ""}

  <div class="line"></div>
  <div class="bold" style="margin-top: 4px;">PROFIT & COST AUDIT:</div>
  <div class="row"><span>Total Inventory Cost:</span><span>-${data.formattedCogs}</span></div>
  <div class="row"><span>Refurb / Parts Cost:</span><span>-${data.formattedPartsCost}</span></div>
  <div class="row bold" style="font-size: 1.05em; color: #000; margin-top: 3px;">
    <span>REALIZED NET PROFIT:</span>
    <span>${data.formattedNetProfit}</span>
  </div>

  <div class="line"></div>
  <div class="bold">CUSTOMER SERVICE & CLAIMS:</div>
  <div class="row"><span>Claims Opened Today:</span><span>${data.claimsSummary.openedCount}</span></div>
  <div class="row"><span>Claims Resolved Today:</span><span>${data.claimsSummary.resolvedCount}</span></div>
  <div class="row"><span>Warranty Service Cost:</span><span>${data.claimsSummary.formattedServiceCost}</span></div>

  <div class="double-line"></div>
  <div class="bold" style="margin-bottom: 4px;">SALES JOURNAL:</div>
  <table>
    <thead>
      <tr>
        <th>Inv #</th>
        <th>Serial</th>
        <th>Method</th>
        <th style="text-align: right;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${salesRowsHtml}
    </tbody>
  </table>

  <div class="double-line" style="margin-top: 14px;"></div>
  <div style="display: flex; justify-content: space-between; gap: 8px;">
    <div style="flex: 1;">
      <div class="sign-line">Cashier Signature</div>
    </div>
    <div style="flex: 1;">
      <div class="sign-line">Manager Signature</div>
    </div>
  </div>

  <div class="center" style="font-size: 0.75em; margin-top: 14px; color: #444;">
    <div>DevicePassport Enterprise ERP • End of Day Audit</div>
    <div>System Certified Accurate</div>
  </div>
</body>
</html>`;
}
