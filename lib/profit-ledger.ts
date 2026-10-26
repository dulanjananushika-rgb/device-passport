import { getDatabase } from "./database";

export interface DeviceFinancialLedger {
  deviceId: string;
  serial: string;
  model: string;
  brand: string;
  status: "In refurbishment" | "Ready" | "Sold";
  purchaseCostCents: number;
  partsCostCents: number;
  laborCostCents: number;
  warrantyCostCents: number;
  totalInvestedCostCents: number;
  salePriceCents: number;
  realizedProfitCents: number;
  marginPercent: number;
  soldAt: string | null;
  customerName: string | null;
}

export interface ShopLedgerSummary {
  totalGrossRevenueCents: number;
  totalIntakeCostCents: number;
  totalPartsCostCents: number;
  totalLaborCostCents: number;
  totalWarrantyCostCents: number;
  totalRealizedProfitCents: number;
  overallMarginPercent: number;
  totalUnitsSold: number;
  totalUnitsInStock: number;
  currentStockValueCents: number;
  devices: DeviceFinancialLedger[];
}

export function calculateDeviceLedger(serial: string): DeviceFinancialLedger | null {
  const db = getDatabase();

  const row = db.prepare(`
    SELECT
      d.id as device_id,
      i.serial,
      i.device_name as brand,
      i.model,
      i.status as intake_status,
      d.status as device_status,
      COALESCE(i.purchase_cost_cents, 0) as purchase_cost_cents,
      COALESCE((SELECT SUM(a.total_cost_cents) FROM task_part_allocations a WHERE a.intake_id = i.id), 0) as parts_cost_cents,
      COALESCE((SELECT SUM(t.cost_cents) FROM refurbishment_tasks t WHERE t.intake_id = i.id AND t.id NOT IN (SELECT task_id FROM task_part_allocations)), 0) as labor_cost_cents,
      COALESCE((SELECT SUM(c.service_cost_cents) FROM warranty_claims c WHERE c.device_id = d.id), 0) as warranty_cost_cents,
      COALESCE(s.sale_price_cents, 0) as sale_price_cents,
      s.sold_at,
      s.customer_name
    FROM stock_intakes i
    LEFT JOIN devices d ON d.serial = i.serial
    LEFT JOIN device_sales s ON s.device_id = d.id
    WHERE i.serial = ?
  `).get(serial) as any;

  if (!row) return null;

  const purchaseCost = Number(row.purchase_cost_cents);
  const partsCost = Number(row.parts_cost_cents);
  const laborCost = Number(row.labor_cost_cents);
  const warrantyCost = Number(row.warranty_cost_cents);
  const salePrice = Number(row.sale_price_cents);

  const totalInvested = purchaseCost + partsCost + laborCost + warrantyCost;
  const isSold = Boolean(row.sold_at && salePrice > 0);
  const realizedProfit = isSold ? salePrice - totalInvested : 0;
  const marginPercent = isSold && salePrice > 0 ? Number(((realizedProfit / salePrice) * 100).toFixed(2)) : 0;

  let status: DeviceFinancialLedger["status"] = "In refurbishment";
  if (isSold) {
    status = "Sold";
  } else if (row.device_status === "Ready" || row.intake_status === "Ready") {
    status = "Ready";
  }

  return {
    deviceId: row.device_id || `intake_${row.serial}`,
    serial: row.serial,
    model: row.model,
    brand: row.brand,
    status,
    purchaseCostCents: purchaseCost,
    partsCostCents: partsCost,
    laborCostCents: laborCost,
    warrantyCostCents: warrantyCost,
    totalInvestedCostCents: totalInvested,
    salePriceCents: salePrice,
    realizedProfitCents: realizedProfit,
    marginPercent,
    soldAt: row.sold_at || null,
    customerName: row.customer_name || null,
  };
}

export function calculateShopLedgerSummary(filter?: { branchId?: string; startDate?: string; endDate?: string }): ShopLedgerSummary {
  const db = getDatabase();

  let sql = `
    SELECT
      d.id as device_id,
      i.serial,
      i.device_name as brand,
      i.model,
      i.status as intake_status,
      d.status as device_status,
      COALESCE(i.purchase_cost_cents, 0) as purchase_cost_cents,
      COALESCE((SELECT SUM(a.total_cost_cents) FROM task_part_allocations a WHERE a.intake_id = i.id), 0) as parts_cost_cents,
      COALESCE((SELECT SUM(t.cost_cents) FROM refurbishment_tasks t WHERE t.intake_id = i.id AND t.id NOT IN (SELECT task_id FROM task_part_allocations)), 0) as labor_cost_cents,
      COALESCE((SELECT SUM(c.service_cost_cents) FROM warranty_claims c WHERE c.device_id = d.id), 0) as warranty_cost_cents,
      COALESCE(s.sale_price_cents, 0) as sale_price_cents,
      s.sold_at,
      s.customer_name
    FROM stock_intakes i
    LEFT JOIN devices d ON d.serial = i.serial
    LEFT JOIN device_sales s ON s.device_id = d.id
    WHERE 1=1
  `;

  const params: any[] = [];
  if (filter?.branchId) {
    sql += " AND i.branch_id = ?";
    params.push(filter.branchId);
  }
  if (filter?.startDate) {
    sql += " AND (s.sold_at >= ? OR i.purchased_at >= ?)";
    params.push(filter.startDate, filter.startDate);
  }
  if (filter?.endDate) {
    sql += " AND (s.sold_at <= ? OR i.purchased_at <= ?)";
    params.push(filter.endDate, filter.endDate);
  }

  sql += " ORDER BY s.sold_at DESC, i.created_at DESC";

  const rows = db.prepare(sql).all(...params) as any[];

  let totalGrossRevenue = 0;
  let totalIntakeCost = 0;
  let totalPartsCost = 0;
  let totalLaborCost = 0;
  let totalWarrantyCost = 0;
  let totalRealizedProfit = 0;
  let unitsSold = 0;
  let unitsInStock = 0;
  let currentStockValue = 0;

  const devices: DeviceFinancialLedger[] = rows.map((row) => {
    const purchaseCost = Number(row.purchase_cost_cents);
    const partsCost = Number(row.parts_cost_cents);
    const laborCost = Number(row.labor_cost_cents);
    const warrantyCost = Number(row.warranty_cost_cents);
    const salePrice = Number(row.sale_price_cents);

    const totalInvested = purchaseCost + partsCost + laborCost + warrantyCost;
    const isSold = Boolean(row.sold_at && salePrice > 0);
    const realizedProfit = isSold ? salePrice - totalInvested : 0;
    const marginPercent = isSold && salePrice > 0 ? Number(((realizedProfit / salePrice) * 100).toFixed(2)) : 0;

    let status: DeviceFinancialLedger["status"] = "In refurbishment";
    if (isSold) {
      status = "Sold";
      totalGrossRevenue += salePrice;
      totalRealizedProfit += realizedProfit;
      unitsSold += 1;
    } else {
      unitsInStock += 1;
      currentStockValue += purchaseCost + partsCost + laborCost;
      if (row.device_status === "Ready" || row.intake_status === "Ready") {
        status = "Ready";
      }
    }

    totalIntakeCost += purchaseCost;
    totalPartsCost += partsCost;
    totalLaborCost += laborCost;
    totalWarrantyCost += warrantyCost;

    return {
      deviceId: row.device_id || `intake_${row.serial}`,
      serial: row.serial,
      model: row.model,
      brand: row.brand,
      status,
      purchaseCostCents: purchaseCost,
      partsCostCents: partsCost,
      laborCostCents: laborCost,
      warrantyCostCents: warrantyCost,
      totalInvestedCostCents: totalInvested,
      salePriceCents: salePrice,
      realizedProfitCents: realizedProfit,
      marginPercent,
      soldAt: row.sold_at || null,
      customerName: row.customer_name || null,
    };
  });

  const overallMarginPercent =
    totalGrossRevenue > 0
      ? Number(((totalRealizedProfit / totalGrossRevenue) * 100).toFixed(2))
      : 0;

  return {
    totalGrossRevenueCents: totalGrossRevenue,
    totalIntakeCostCents: totalIntakeCost,
    totalPartsCostCents: totalPartsCost,
    totalLaborCostCents: totalLaborCost,
    totalWarrantyCostCents: totalWarrantyCost,
    totalRealizedProfitCents: totalRealizedProfit,
    overallMarginPercent,
    totalUnitsSold: unitsSold,
    totalUnitsInStock: unitsInStock,
    currentStockValueCents: currentStockValue,
    devices,
  };
}
