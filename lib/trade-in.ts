import { randomUUID } from "node:crypto";
import { getDatabase, recordAuditEvent } from "./database";

export type DeviceCosmeticGrade = "A" | "B" | "C" | "D";
export type TradeInStatus = "Quoted" | "Accepted" | "Declined";

export interface TradeInEvaluation {
  id: string;
  organizationId: string;
  branchId: string;
  customerName: string;
  customerPhone: string;
  customerNicPassport: string;
  legalDeclarationSigned: boolean;
  legalNotes: string;
  brand: string;
  model: string;
  serial: string;
  specsSummary: string;
  grade: DeviceCosmeticGrade;
  estimatedMarketValueCents: number;
  estimatedRefurbishmentCostCents: number;
  offeredTradeInValueCents: number;
  acceptedForDeviceId: string | null;
  evaluatedBy: string;
  status: TradeInStatus;
  createdAt: string;
}

export interface TradeInQuoteInput {
  customerName: string;
  customerPhone: string;
  customerNicPassport?: string;
  legalDeclarationSigned?: boolean;
  legalNotes?: string;
  brand: string;
  model: string;
  serial: string;
  processorTier?: "Core i3" | "Core i5" | "Core i7" | "Ryzen 3" | "Ryzen 5" | "Ryzen 7" | "Other";
  ramGb?: number;
  storageGb?: number;
  grade: DeviceCosmeticGrade;
  batteryHealthPercent?: number;
  hasCharger?: boolean;
  baseMarketValueCents?: number;
  branchId?: string;
  organizationId?: string;
}

type TradeInRow = {
  id: string;
  organization_id: string;
  branch_id: string;
  customer_name: string;
  customer_phone: string;
  customer_nic_passport?: string;
  legal_declaration_signed?: number;
  legal_notes?: string;
  brand: string;
  model: string;
  serial: string;
  specs_summary: string;
  grade: DeviceCosmeticGrade;
  estimated_market_value_cents: number;
  estimated_refurbishment_cost_cents: number;
  offered_trade_in_value_cents: number;
  accepted_for_device_id: string | null;
  evaluated_by: string;
  status: TradeInStatus;
  created_at: string;
};

function rowToTradeIn(r: TradeInRow): TradeInEvaluation {
  return {
    id: r.id,
    organizationId: r.organization_id,
    branchId: r.branch_id,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    customerNicPassport: r.customer_nic_passport || "",
    legalDeclarationSigned: r.legal_declaration_signed === 1,
    legalNotes: r.legal_notes || "",
    brand: r.brand,
    model: r.model,
    serial: r.serial,
    specsSummary: r.specs_summary,
    grade: r.grade,
    estimatedMarketValueCents: r.estimated_market_value_cents,
    estimatedRefurbishmentCostCents: r.estimated_refurbishment_cost_cents,
    offeredTradeInValueCents: r.offered_trade_in_value_cents,
    acceptedForDeviceId: r.accepted_for_device_id,
    evaluatedBy: r.evaluated_by,
    status: r.status,
    createdAt: r.created_at,
  };
}

/**
 * Objective Trade-In Valuation Calculator
 * Computes estimated resale market value and deductions for cosmetic wear, degraded battery, or missing charger.
 */
export function calculateTradeInValuation(input: TradeInQuoteInput): {
  marketValueCents: number;
  refurbishmentCostCents: number;
  offeredValueCents: number;
  specsSummary: string;
} {
  // 1. Establish base market value if not manually provided
  let marketValue = input.baseMarketValueCents ?? 0;
  if (!marketValue) {
    // Benchmark heuristic based on processor tier
    switch (input.processorTier) {
      case "Core i7":
      case "Ryzen 7":
        marketValue = 7500000; // ~75,000 LKR
        break;
      case "Core i5":
      case "Ryzen 5":
        marketValue = 5500000; // ~55,000 LKR
        break;
      case "Core i3":
      case "Ryzen 3":
        marketValue = 4000000; // ~40,000 LKR
        break;
      default:
        marketValue = 3500000;
    }

    // Add RAM and storage premiums
    if (input.ramGb && input.ramGb > 8) marketValue += (input.ramGb - 8) * 100000;
    if (input.storageGb && input.storageGb > 256) marketValue += 500000;
  }

  // 2. Cosmetic Grade Multiplier
  let gradeMultiplier = 1.0;
  switch (input.grade) {
    case "A":
      gradeMultiplier = 0.90; // Clean, minor scuffs
      break;
    case "B":
      gradeMultiplier = 0.78; // Visible scratches/wear
      break;
    case "C":
      gradeMultiplier = 0.65; // Dents, keyboard shine, minor body cracks
      break;
    case "D":
      gradeMultiplier = 0.50; // Heavy damage, missing parts
      break;
  }

  // 3. Deductions for repairs needed before resale
  let refurbishmentCost = 250000; // Base intake inspection, cleaning, thermal paste (2,500 LKR)

  // Degraded battery deduction
  if (input.batteryHealthPercent !== undefined && input.batteryHealthPercent < 75) {
    refurbishmentCost += 800000; // ~8,000 LKR for replacement battery
  }

  // Missing original charger deduction
  if (input.hasCharger === false) {
    refurbishmentCost += 300000; // ~3,000 LKR for replacement adapter
  }

  // 4. Calculate Net Offered Value (with 20% minimum floor of adjusted market value)
  const adjustedMarket = Math.round(marketValue * gradeMultiplier);
  const rawOffer = adjustedMarket - refurbishmentCost;
  const minimumFloor = Math.round(marketValue * 0.15); // Guaranteed scrap/parts minimum
  const offeredValue = Math.max(rawOffer, minimumFloor);

  const ramText = input.ramGb ? `${input.ramGb}GB RAM` : "Standard RAM";
  const ssdText = input.storageGb ? `${input.storageGb}GB SSD` : "Storage";
  const specsSummary = `${input.processorTier || "CPU"} | ${ramText} | ${ssdText}`;

  return {
    marketValueCents: marketValue,
    refurbishmentCostCents: refurbishmentCost,
    offeredValueCents: offeredValue,
    specsSummary,
  };
}

export function evaluateTradeIn(input: TradeInQuoteInput, evaluator: string): TradeInEvaluation {
  const db = getDatabase();
  const id = `tin_${randomUUID().slice(0, 12)}`;
  const now = new Date().toISOString();

  const val = calculateTradeInValuation(input);

  db.prepare(`
    INSERT INTO trade_in_evaluations (
      id, organization_id, branch_id, customer_name, customer_phone,
      customer_nic_passport, legal_declaration_signed, legal_notes,
      brand, model, serial, specs_summary, grade,
      estimated_market_value_cents, estimated_refurbishment_cost_cents,
      offered_trade_in_value_cents, evaluated_by, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Quoted', ?)
  `).run(
    id,
    input.organizationId || "default_org",
    input.branchId || "default_branch",
    input.customerName.trim(),
    input.customerPhone.trim(),
    (input.customerNicPassport || "").trim(),
    input.legalDeclarationSigned ? 1 : 0,
    (input.legalNotes || "").trim(),
    input.brand.trim(),
    input.model.trim(),
    input.serial.trim().toUpperCase(),
    val.specsSummary,
    input.grade,
    val.marketValueCents,
    val.refurbishmentCostCents,
    val.offeredValueCents,
    evaluator,
    now
  );

  recordAuditEvent(
    evaluator,
    "trade_in.quoted",
    `Evaluated trade-in for ${input.customerName} (${input.brand} ${input.model} / ${input.serial}). Offered: ${val.offeredValueCents} cents.`
  );

  return getTradeInEvaluation(id)!;
}

export function acceptTradeIn(
  evaluationId: string,
  purchasedDeviceId: string,
  actor: string,
  database?: any
): TradeInEvaluation & { promotedIntakeId?: string } {
  const db = database || getDatabase();
  const evaluation = getTradeInEvaluation(evaluationId, db);
  if (!evaluation) throw new Error("Trade-in evaluation not found.");
  if (evaluation.status !== "Quoted") {
    throw new Error(`Trade-in is already ${evaluation.status.toLowerCase()}.`);
  }

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE trade_in_evaluations
    SET status = 'Accepted', accepted_for_device_id = ?
    WHERE id = ?
  `).run(purchasedDeviceId, evaluationId);

  // Auto-promote traded-in laptop into stock_intakes (Procurement Queue)
  let promotedIntakeId: string | undefined;
  try {
    let supplier = db.prepare("SELECT id FROM suppliers WHERE name = 'Customer Trade-Ins'").get() as any;
    if (!supplier) {
      const supId = `sup-trade-ins`;
      db.prepare(`
        INSERT OR IGNORE INTO suppliers (id, name, contact_name, email, phone, active, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
      `).run(supId, "Customer Trade-Ins", "Retail Trade-in Desk", "tradeins@shop.internal", "0770000000", actor, now, now);
      supplier = { id: supId };
    }

    promotedIntakeId = `INT-TI-${now.slice(2, 10).replace(/-/g, "")}-${randomUUID().slice(0, 4).toUpperCase()}`;
    const deviceName = `${evaluation.brand} ${evaluation.model}`.trim();
    const supplierInvoice = `TI-${evaluation.id.slice(0, 8).toUpperCase()}`;
    const notes = `Customer trade-in from ${evaluation.customerName} (${evaluation.customerPhone}) accepted towards purchase of #${purchasedDeviceId}. Offered Credit: Rs. ${(evaluation.offeredTradeInValueCents / 100).toLocaleString()}. Specs: ${evaluation.specsSummary}. Grade: ${evaluation.grade}.`;

    let serial = evaluation.serial?.trim() || `TI-SN-${randomUUID().slice(0, 8).toUpperCase()}`;
    const existingIntake = db.prepare("SELECT id FROM stock_intakes WHERE serial = ? COLLATE NOCASE").get(serial);
    if (existingIntake) {
      serial = `${serial}-TI`;
    }

    db.prepare(`
      INSERT INTO stock_intakes (
        id, supplier_id, device_name, model, serial, supplier_invoice,
        purchased_at, purchase_cost_cents, status, notes, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Awaiting test', ?, ?, ?, ?)
    `).run(
      promotedIntakeId,
      supplier.id,
      deviceName,
      evaluation.model,
      serial,
      supplierInvoice,
      now.slice(0, 10),
      evaluation.offeredTradeInValueCents,
      notes,
      actor,
      now,
      now
    );
  } catch (err) {
    console.error("Failed to auto-create stock intake for trade-in:", err);
  }

  recordAuditEvent(
    actor,
    "trade_in.accepted",
    `Accepted trade-in ${evaluation.brand} ${evaluation.model} (Credit: ${evaluation.offeredTradeInValueCents} cents) towards purchase of ${purchasedDeviceId}. Auto-promoted to intake ${promotedIntakeId || ""}.`
  );

  const updated = getTradeInEvaluation(evaluationId, db)!;
  return { ...updated, promotedIntakeId };
}

export function getTradeInEvaluation(id: string, database?: any): TradeInEvaluation | null {
  const db = database || getDatabase();
  const row = db.prepare("SELECT * FROM trade_in_evaluations WHERE id = ?").get(id) as TradeInRow | undefined;
  return row ? rowToTradeIn(row) : null;
}

export function listTradeInEvaluations(filter?: { status?: TradeInStatus; phone?: string }): TradeInEvaluation[] {
  const db = getDatabase();
  let sql = "SELECT * FROM trade_in_evaluations WHERE 1=1";
  const params: any[] = [];

  if (filter?.status) {
    sql += " AND status = ?";
    params.push(filter.status);
  }
  if (filter?.phone) {
    sql += " AND customer_phone LIKE ?";
    params.push(`%${filter.phone.replace(/\D/g, "")}%`);
  }

  sql += " ORDER BY created_at DESC";
  const rows = db.prepare(sql).all(...params) as unknown as TradeInRow[];
  return rows.map(rowToTradeIn);
}

/**
 * Generates an official Anti-Stolen Equipment Declaration & Trade-In Purchase Voucher
 * For police clearance and legal transfer of ownership.
 */
export function generateTradeInLegalVoucherHtml(evaluationId: string): string {
  const evaluation = getTradeInEvaluation(evaluationId);
  if (!evaluation) throw new Error("Trade-in evaluation not found.");

  const payout = (evaluation.offeredTradeInValueCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });
  const dateFormatted = new Date(evaluation.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Legal Trade-In Ownership Transfer - ${evaluation.serial}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #111827; max-width: 800px; margin: 0 auto; line-height: 1.5; }
    .header { text-align: center; border-bottom: 2px solid #111827; padding-bottom: 20px; margin-bottom: 25px; }
    .title { font-size: 22px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
    .subtitle { font-size: 13px; color: #4b5563; margin-top: 4px; }
    .section-title { font-size: 15px; font-weight: 700; background: #f3f4f6; padding: 6px 12px; margin: 20px 0 12px 0; border-left: 4px solid #111827; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 14px; }
    .grid div { padding: 4px 0; }
    .grid span { font-weight: 600; color: #374151; }
    .declaration-box { border: 1px solid #d1d5db; background: #fafafa; padding: 16px; border-radius: 6px; font-size: 13px; color: #1f2937; margin: 20px 0; text-align: justify; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 50px; }
    .sign-line { border-top: 1px dashed #374151; padding-top: 8px; text-align: center; font-size: 13px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">Legal Equipment Purchase & Ownership Transfer Voucher</div>
    <div class="subtitle">Anti-Stolen Property Compliance & Trade-In Declaration • Ref: ${evaluation.id}</div>
  </div>

  <div class="section-title">1. SELLER / CUSTOMER IDENTITY</div>
  <div class="grid">
    <div><span>Full Legal Name:</span> ${evaluation.customerName}</div>
    <div><span>National Identity / Passport #:</span> <strong>${evaluation.customerNicPassport || "VERIFIED AT TILL"}</strong></div>
    <div><span>Primary Phone:</span> ${evaluation.customerPhone}</div>
    <div><span>Transaction Date:</span> ${dateFormatted}</div>
  </div>

  <div class="section-title">2. SURRENDERED EQUIPMENT SPECIFICATIONS</div>
  <div class="grid">
    <div><span>Equipment Brand:</span> ${evaluation.brand}</div>
    <div><span>Model Number:</span> ${evaluation.model}</div>
    <div><span>Hardware Serial Number:</span> <strong>${evaluation.serial}</strong></div>
    <div><span>Cosmetic Grade:</span> Grade ${evaluation.grade}</div>
    <div style="grid-column: span 2;"><span>Configuration Summary:</span> ${evaluation.specsSummary}</div>
    <div><span>Agreed Purchase / Credit Payout:</span> <strong style="font-size: 16px;">LKR ${payout}</strong></div>
    <div><span>Evaluating Inspector:</span> ${evaluation.evaluatedBy}</div>
  </div>

  <div class="section-title">3. LEGAL OWNERSHIP & ANTI-STOLEN GOODS DECLARATION</div>
  <div class="declaration-box">
    I hereby solemnly declare and warrant that I am the sole lawful owner of the equipment specified above. I certify that all personal accounts (iCloud, Google, Microsoft, BitLocker encryption, BIOS passwords) have been permanently disassociated and removed. I confirm that this device is not stolen property, is not subject to any active police investigation, and has no outstanding financial liens or hire-purchase encumbrances. I willingly surrender ownership to the store in exchange for the agreed consideration.
  </div>

  <div class="signatures">
    <div>
      <div style="height: 50px;"></div>
      <div class="sign-line">Customer / Seller Signature & Date</div>
    </div>
    <div>
      <div style="height: 50px;"></div>
      <div class="sign-line">Authorized Store Manager & Seal</div>
    </div>
  </div>
</body>
</html>`;
}
