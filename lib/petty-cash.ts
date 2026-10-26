import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { getDatabase, recordAuditEvent } from "./database";
import { formatMinorUnitsToLkr, parseLkrToCents } from "./finance";

export const pettyCashCategories = [
  "Staff Meals / Tea",
  "Packaging & Tape",
  "Courier Delivery Fee",
  "Shop Maintenance",
  "Transport / Travel",
  "Supplier Cash Advance",
  "Customer Refund",
  "Other Expenses",
] as const;

export type PettyCashCategory = (typeof pettyCashCategories)[number];

export interface PettyCashExpense {
  id: string;
  settlementDate: string; // YYYY-MM-DD
  category: PettyCashCategory;
  description: string;
  amountCents: number;
  formattedAmount: string;
  paidTo: string;
  receiptVoucherRef: string;
  recordedBy: string;
  createdAt: string;
}

export interface PettyCashInput {
  settlementDate?: string;
  category: PettyCashCategory;
  description: string;
  amountLkr: string;
  paidTo: string;
  receiptVoucherRef?: string;
}

export function ensurePettyCashSchema(database?: DatabaseSync) {
  const db = database || getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS petty_cash_expenses (
      id TEXT PRIMARY KEY,
      settlement_date TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      paid_to TEXT NOT NULL,
      receipt_voucher_ref TEXT NOT NULL DEFAULT '',
      recorded_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_petty_cash_date ON petty_cash_expenses(settlement_date);
  `);
}

export function recordPettyCashExpense(
  input: PettyCashInput,
  actor: string,
  database?: DatabaseSync
): PettyCashExpense {
  const db = database || getDatabase();
  ensurePettyCashSchema(db);

  const now = new Date().toISOString();
  const settlementDate = input.settlementDate || now.slice(0, 10);
  const description = (input.description || "").trim();
  const paidTo = (input.paidTo || "").trim();
  const amountCents = parseLkrToCents(input.amountLkr, "Expense amount", false);

  if (!description || description.length < 2) {
    throw new Error("Expense description is required.");
  }
  if (!paidTo || paidTo.length < 2) {
    throw new Error("Recipient name (paid to) is required.");
  }
  if (amountCents <= 0) {
    throw new Error("Amount must be greater than zero.");
  }

  const id = `EXP-${randomUUID().slice(0, 8).toUpperCase()}`;
  const receiptVoucherRef = input.receiptVoucherRef?.trim() || `VOU-${now.slice(2, 10).replace(/-/g, "")}-${id.slice(4, 8)}`;

  db.prepare(`
    INSERT INTO petty_cash_expenses (
      id, settlement_date, category, description, amount_cents,
      paid_to, receipt_voucher_ref, recorded_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    settlementDate,
    input.category,
    description,
    amountCents,
    paidTo,
    receiptVoucherRef,
    actor,
    now
  );

  recordAuditEvent(
    actor,
    "petty_cash.recorded",
    `Logged till cash-out of ${formatMinorUnitsToLkr(amountCents)} for ${input.category}: ${description} (Voucher #${receiptVoucherRef}).`
  );

  return {
    id,
    settlementDate,
    category: input.category,
    description,
    amountCents,
    formattedAmount: formatMinorUnitsToLkr(amountCents),
    paidTo,
    receiptVoucherRef,
    recordedBy: actor,
    createdAt: now,
  };
}

export function listPettyCashExpenses(
  settlementDate: string,
  database?: DatabaseSync
): PettyCashExpense[] {
  const db = database || getDatabase();
  ensurePettyCashSchema(db);

  const rows = db.prepare(`
    SELECT * FROM petty_cash_expenses
    WHERE settlement_date = ?
    ORDER BY created_at ASC
  `).all(settlementDate) as any[];

  return rows.map((r) => ({
    id: r.id,
    settlementDate: r.settlement_date,
    category: r.category as PettyCashCategory,
    description: r.description,
    amountCents: r.amount_cents,
    formattedAmount: formatMinorUnitsToLkr(r.amount_cents),
    paidTo: r.paid_to,
    receiptVoucherRef: r.receipt_voucher_ref,
    recordedBy: r.recorded_by,
    createdAt: r.created_at,
  }));
}

export function deletePettyCashExpense(
  id: string,
  actor: string,
  database?: DatabaseSync
): boolean {
  const db = database || getDatabase();
  ensurePettyCashSchema(db);

  const existing = db.prepare("SELECT * FROM petty_cash_expenses WHERE id = ?").get(id) as any;
  if (!existing) throw new Error("Petty cash expense record not found.");

  db.prepare("DELETE FROM petty_cash_expenses WHERE id = ?").run(id);
  recordAuditEvent(
    actor,
    "petty_cash.deleted",
    `Deleted petty cash expense ${id} of ${formatMinorUnitsToLkr(existing.amount_cents)}.`
  );

  return true;
}
