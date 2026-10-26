import os

# 1. Update lib/analytics.ts
analytics_path = r"D:\Software_Projects\deploy\device-passport\lib\analytics.ts"
with open(analytics_path, "r", encoding="utf-8") as f:
    analytics_code = f.read().replace("\r\n", "\n")

target_csv_headers = """const headers = ["Passport ID", "Device", "Model", "Serial", "Lifecycle", "Sold date", "Purchase cost (LKR)", "Refurbishment cost (LKR)", "Sale price (LKR)", "Warranty cost (LKR)", "Gross profit (LKR)"];"""
replacement_csv_headers = """const headers = ["Passport ID", "Device", "Model", "Serial", "Lifecycle", "Sold date", "Purchase cost", "Refurbishment cost", "Sale price", "Warranty cost", "Gross profit"];"""

if target_csv_headers in analytics_code:
    analytics_code = analytics_code.replace(target_csv_headers, replacement_csv_headers)
    with open(analytics_path, "w", encoding="utf-8") as f:
        f.write(analytics_code)
    print("lib/analytics.ts updated successfully")
else:
    print("target_csv_headers not found in lib/analytics.ts")

# 2. Update lib/bulk-intake.ts
bulk_path = r"D:\Software_Projects\deploy\device-passport\lib\bulk-intake.ts"
with open(bulk_path, "r", encoding="utf-8") as f:
    bulk_code = f.read().replace("\r\n", "\n")

target_get_field = """const cost = getField(["cost", "unitcost", "purchasecost", "costlkr", "price", "buyprice"]);"""
replacement_get_field = """const cost = getField(["cost", "unitcost", "purchasecost", "costlkr", "costusd", "costeur", "costgbp", "costaud", "price", "buyprice", "unitprice"]);"""

if target_get_field in bulk_code:
    bulk_code = bulk_code.replace(target_get_field, replacement_get_field)
    with open(bulk_path, "w", encoding="utf-8") as f:
        f.write(bulk_code)
    print("lib/bulk-intake.ts updated successfully")
else:
    print("target_get_field not found in lib/bulk-intake.ts")

# 3. Update lib/repairs.ts
repairs_path = r"D:\Software_Projects\deploy\device-passport\lib\repairs.ts"
with open(repairs_path, "r", encoding="utf-8") as f:
    repairs_code = f.read().replace("\r\n", "\n")

target_repairs_import = """import { formatMinorUnitsToLkr, parseLkrToCents } from "./finance";"""
replacement_repairs_import = """import { formatCurrency, parseCurrencyAmountToCents } from "./finance";
import { LEGAL_DISCLAIMERS } from "./international-standards";"""

repairs_code = repairs_code.replace(target_repairs_import, replacement_repairs_import)
repairs_code = repairs_code.replace("parseLkrToCents(", "parseCurrencyAmountToCents(")

target_row_to_repair = """function rowToRepair(r: any): CustomerRepairJob {
  const parts = r.parts_cost_cents || 0;
  const labor = r.labor_fee_cents || 0;
  let total = r.total_amount_cents || 0;
  if (total === 0 && (parts > 0 || labor > 0)) {
    total = parts + labor;
  }
  const advance = r.advance_paid_cents || 0;
  const balance = Math.max(0, total - advance);

  return {
    id: r.id,
    jobNumber: r.job_number,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    customerEmail: r.customer_email || "",
    deviceBrand: r.device_brand,
    deviceModel: r.device_model,
    serial: r.serial || "N/A",
    devicePasswordPin: r.device_password_pin || "",
    accessoriesReceived: r.accessories_received || "",
    reportedFault: r.reported_fault,
    physicalCondition: r.physical_condition || "",
    status: r.status as RepairStatus,
    assignedTechnician: r.assigned_technician || "",
    technicianNotes: r.technician_notes || "",
    estimatedCostCents: r.estimated_cost_cents || 0,
    advancePaidCents: advance,
    partsCostCents: parts,
    laborFeeCents: labor,
    totalAmountCents: total,
    balanceDueCents: balance,
    formattedTotalAmount: formatMinorUnitsToLkr(total),
    formattedBalanceDue: formatMinorUnitsToLkr(balance),
    formattedAdvancePaid: formatMinorUnitsToLkr(advance),"""

replacement_row_to_repair = """function rowToRepair(r: any): CustomerRepairJob {
  const parts = r.parts_cost_cents || 0;
  const labor = r.labor_fee_cents || 0;
  let total = r.total_amount_cents || 0;
  if (total === 0 && (parts > 0 || labor > 0)) {
    total = parts + labor;
  }
  const advance = r.advance_paid_cents || 0;
  const balance = Math.max(0, total - advance);

  let sym = "$";
  let pos: "prefix" | "suffix" = "prefix";
  try {
    const s = getShopSettings();
    if (s.currencySymbol) sym = s.currencySymbol;
    if (s.currencyPosition === "suffix") pos = "suffix";
  } catch {}

  const fmt = (c: number) => formatCurrency(c, { symbol: sym, position: pos });

  return {
    id: r.id,
    jobNumber: r.job_number,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    customerEmail: r.customer_email || "",
    deviceBrand: r.device_brand,
    deviceModel: r.device_model,
    serial: r.serial || "N/A",
    devicePasswordPin: r.device_password_pin || "",
    accessoriesReceived: r.accessories_received || "",
    reportedFault: r.reported_fault,
    physicalCondition: r.physical_condition || "",
    status: r.status as RepairStatus,
    assignedTechnician: r.assigned_technician || "",
    technicianNotes: r.technician_notes || "",
    estimatedCostCents: r.estimated_cost_cents || 0,
    advancePaidCents: advance,
    partsCostCents: parts,
    laborFeeCents: labor,
    totalAmountCents: total,
    balanceDueCents: balance,
    formattedTotalAmount: fmt(total),
    formattedBalanceDue: fmt(balance),
    formattedAdvancePaid: fmt(advance),"""

repairs_code = repairs_code.replace(target_row_to_repair, replacement_row_to_repair)

# Replace formatMinorUnitsToLkr in invoice rendering
repairs_code = repairs_code.replace(
    "${formatMinorUnitsToLkr(job.partsCostCents)}",
    "${formatCurrency(job.partsCostCents, { symbol: settings.currencySymbol || '$', position: (settings.currencyPosition as any) || 'prefix' })}"
)
repairs_code = repairs_code.replace(
    "${formatMinorUnitsToLkr(job.laborFeeCents)}",
    "${formatCurrency(job.laborFeeCents, { symbol: settings.currencySymbol || '$', position: (settings.currencyPosition as any) || 'prefix' })}"
)

# Add Magnuson-Moss term into service terms
target_service_terms = """    4. 30-day checking warranty applies only to the specific part or board repair performed."""
replacement_service_terms = """    4. 30-day checking warranty applies only to the specific part or board repair performed.<br/>
    5. Tamper-evident seals are affixed solely to verify warranty authenticity and technician service integrity in accordance with consumer rights laws."""

repairs_code = repairs_code.replace(target_service_terms, replacement_service_terms)

with open(repairs_path, "w", encoding="utf-8") as f:
    f.write(repairs_code)
print("lib/repairs.ts updated successfully")
