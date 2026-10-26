import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { getDatabase } from "./database";
import { formatMinorUnitsToLkr } from "./finance";

export interface ReturnInput {
  originalDeviceId: string;
  returnType: "Exchange" | "Refund";
  replacementDeviceId?: string;
  reason: string;
  restockCondition?: "Needs Re-test" | "Damaged" | "Returned to Stock";
}

export interface ReturnRecord {
  id: string;
  originalDeviceId: string;
  originalDeviceName: string;
  originalSerial: string;
  originalInvoiceReference: string;
  returnType: "Exchange" | "Refund";
  replacementDeviceId?: string;
  replacementDeviceName?: string;
  customerName: string;
  customerPhone: string;
  reason: string;
  originalSalePriceCents: number;
  formattedOriginalPrice: string;
  exchangeDifferenceCents: number;
  formattedDifference: string;
  restockCondition: string;
  processedBy: string;
  createdAt: string;
}

export function ensureReturnsSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS device_returns (
      id TEXT PRIMARY KEY,
      original_device_id TEXT NOT NULL,
      original_invoice_reference TEXT NOT NULL,
      return_type TEXT NOT NULL,
      replacement_device_id TEXT,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      reason TEXT NOT NULL,
      original_sale_price_cents INTEGER NOT NULL,
      exchange_difference_cents INTEGER NOT NULL DEFAULT 0,
      restock_condition TEXT NOT NULL DEFAULT 'Needs Re-test',
      processed_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_returns_original ON device_returns(original_device_id);
    CREATE INDEX IF NOT EXISTS idx_returns_type ON device_returns(return_type);
  `);
}

export function processReturnOrExchange(
  input: ReturnInput,
  actor: string,
  database?: DatabaseSync
): ReturnRecord {
  const db = database || getDatabase();
  ensureReturnsSchema(db);

  const originalDevice = db.prepare("SELECT * FROM devices WHERE id = ?").get(input.originalDeviceId) as any;
  if (!originalDevice) throw new Error("Original device not found.");

  const sale = db.prepare("SELECT * FROM device_sales WHERE device_id = ?").get(input.originalDeviceId) as any;
  if (!sale) throw new Error("This device is not marked as sold; cannot process return.");

  const reason = (input.reason || "").trim();
  if (!reason || reason.length < 5) throw new Error("Please state a valid reason for return / exchange (min 5 characters).");

  const restockCondition = input.restockCondition || "Needs Re-test";
  const now = new Date().toISOString();
  const returnId = `RET-${randomUUID().slice(0, 8).toUpperCase()}`;

  let replacementDevice: any = null;
  let exchangeDifferenceCents = 0;

  if (input.returnType === "Exchange") {
    if (!input.replacementDeviceId) throw new Error("Replacement device ID is required for an exchange.");
    replacementDevice = db.prepare("SELECT * FROM devices WHERE id = ?").get(input.replacementDeviceId) as any;
    if (!replacementDevice) throw new Error("Replacement device not found.");
    if (replacementDevice.status !== "Published") throw new Error("Replacement device is not ready for sale.");

    const replSale = db.prepare("SELECT device_id FROM device_sales WHERE device_id = ?").get(replacementDevice.id);
    if (replSale) throw new Error("Replacement device has already been sold.");

    // Fetch finance or default price for replacement device
    const replFinance = db.prepare("SELECT * FROM device_finance WHERE device_id = ?").get(replacementDevice.id) as any;
    const replCost = replFinance?.purchase_cost_cents || 0;
    // Expected sale price of replacement: assume at least purchase cost * 1.2 or similar
    const replPrice = Math.max(replCost, sale.sale_price_cents);
    exchangeDifferenceCents = replPrice - sale.sale_price_cents;
  }

  db.exec("BEGIN");
  try {
    // 1. Record Return Log
    db.prepare(`
      INSERT INTO device_returns (
        id, original_device_id, original_invoice_reference, return_type,
        replacement_device_id, customer_name, customer_phone, reason,
        original_sale_price_cents, exchange_difference_cents, restock_condition,
        processed_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      returnId,
      originalDevice.id,
      sale.invoice_reference,
      input.returnType,
      replacementDevice?.id || null,
      sale.customer_name,
      sale.customer_phone,
      reason,
      sale.sale_price_cents,
      exchangeDifferenceCents,
      restockCondition,
      actor,
      now
    );

    // 2. Remove sale record of original device and reset its status
    db.prepare("DELETE FROM device_sales WHERE device_id = ?").run(originalDevice.id);
    db.prepare("UPDATE devices SET status = 'Needs review', warranty_ends = '' WHERE id = ?").run(originalDevice.id);

    // 3. If Exchange: activate the replacement device under customer's name!
    if (input.returnType === "Exchange" && replacementDevice) {
      const exchangeInv = `EXC-${sale.invoice_reference}`;
      const handoverToken = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
      const warrantyEnd = new Date(Date.now() + 180 * 86_400_000).toISOString().slice(0, 10);
      const todayDate = now.slice(0, 10);

      db.prepare(`
        INSERT INTO device_sales (
          device_id, customer_name, customer_email, customer_phone, invoice_reference, sale_price_cents,
          payment_method, cash_received_cents, card_amount_cents, bank_transfer_cents, installment_cents, payment_reference,
          sold_at, warranty_starts, warranty_ends, handover_token, activated_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'Split', 0, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        replacementDevice.id,
        sale.customer_name,
        sale.customer_email || "",
        sale.customer_phone,
        exchangeInv,
        sale.sale_price_cents + exchangeDifferenceCents,
        `Exchanged from ${originalDevice.serial}`,
        todayDate,
        todayDate,
        warrantyEnd,
        handoverToken,
        actor,
        now
      );

      db.prepare("UPDATE devices SET warranty_ends = ? WHERE id = ?").run(warrantyEnd, replacementDevice.id);
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return {
    id: returnId,
    originalDeviceId: originalDevice.id,
    originalDeviceName: originalDevice.name,
    originalSerial: originalDevice.serial,
    originalInvoiceReference: sale.invoice_reference,
    returnType: input.returnType,
    replacementDeviceId: replacementDevice?.id,
    replacementDeviceName: replacementDevice?.name,
    customerName: sale.customer_name,
    customerPhone: sale.customer_phone,
    reason,
    originalSalePriceCents: sale.sale_price_cents,
    formattedOriginalPrice: formatMinorUnitsToLkr(sale.sale_price_cents),
    exchangeDifferenceCents,
    formattedDifference: formatMinorUnitsToLkr(exchangeDifferenceCents),
    restockCondition,
    processedBy: actor,
    createdAt: now,
  };
}

export function listReturns(database?: DatabaseSync): ReturnRecord[] {
  const db = database || getDatabase();
  ensureReturnsSchema(db);

  const rows = db.prepare(`
    SELECT r.*,
      d1.name as orig_dev_name, d1.serial as orig_serial,
      d2.name as repl_dev_name
    FROM device_returns r
    LEFT JOIN devices d1 ON d1.id = r.original_device_id
    LEFT JOIN devices d2 ON d2.id = r.replacement_device_id
    ORDER BY r.created_at DESC
  `).all() as any[];

  return rows.map((r) => ({
    id: r.id,
    originalDeviceId: r.original_device_id,
    originalDeviceName: r.orig_dev_name || r.original_device_id,
    originalSerial: r.orig_serial || "",
    originalInvoiceReference: r.original_invoice_reference,
    returnType: r.return_type,
    replacementDeviceId: r.replacement_device_id || undefined,
    replacementDeviceName: r.repl_dev_name || undefined,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    reason: r.reason,
    originalSalePriceCents: r.original_sale_price_cents,
    formattedOriginalPrice: formatMinorUnitsToLkr(r.original_sale_price_cents),
    exchangeDifferenceCents: r.exchange_difference_cents,
    formattedDifference: formatMinorUnitsToLkr(r.exchange_difference_cents),
    restockCondition: r.restock_condition,
    processedBy: r.processed_by,
    createdAt: r.created_at,
  }));
}
