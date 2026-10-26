import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { getDatabase } from "./database";
import { parseLkrToCents } from "./finance";

export interface BulkImportRow {
  model: string;
  serial: string;
  costLkr: string | number;
  deviceName?: string;
  processor?: string;
  ram?: string;
  storage?: string;
  grade?: "A" | "B" | "C";
  supplierName?: string;
  supplierInvoice?: string;
  notes?: string;
}

export interface BulkImportResult {
  success: boolean;
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  errors: Array<{ row: number; serial: string; error: string }>;
  createdIntakeIds: string[];
}

/**
 * Parses raw CSV or Tab-Delimited (TSV) text from Excel.
 */
export function parseRawDelimitedText(rawText: string): Array<Record<string, string>> {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  // Detect delimiter: tab or comma
  const firstLine = lines[0];
  const delimiter = firstLine.includes("\t") ? "\t" : ",";

  const splitLine = (line: string): string[] => {
    if (delimiter === "\t") {
      return line.split("\t").map((c) => c.trim().replace(/^["']|["']$/g, ""));
    }
    // Simple CSV parser supporting quotes
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim().replace(/^["']|["']$/g, ""));
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^["']|["']$/g, ""));
    return result;
  };

  const headers = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));

  const records: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitLine(lines[i]);
    const record: Record<string, string> = {};
    headers.forEach((header, idx) => {
      record[header] = values[idx] || "";
    });
    records.push(record);
  }

  return records;
}

/**
 * Normalizes header keys to standardized property names.
 */
function normalizeRecord(rec: Record<string, string>): BulkImportRow {
  const getField = (keys: string[]): string => {
    for (const k of keys) {
      if (rec[k] !== undefined && rec[k] !== "") return rec[k];
    }
    return "";
  };

  const model = getField(["model", "laptopmodel", "itemmodel", "devicemodel"]);
  const serial = getField(["serial", "serialnumber", "sn", "serialno", "servicetag"]);
  const cost = getField(["cost", "unitcost", "purchasecost", "costlkr", "costusd", "costeur", "costgbp", "costaud", "price", "buyprice", "unitprice"]);
  const deviceName = getField(["name", "devicename", "title", "laptopname"]) || model;
  const processor = getField(["processor", "cpu", "specs"]);
  const ram = getField(["ram", "memory"]);
  const storage = getField(["storage", "ssd", "hdd", "disk"]);
  const gradeRaw = getField(["grade", "condition"]).toUpperCase();
  const grade: "A" | "B" | "C" = gradeRaw === "A" || gradeRaw === "B" || gradeRaw === "C" ? gradeRaw : "A";
  const supplierName = getField(["supplier", "suppliername", "vendor", "source"]);
  const supplierInvoice = getField(["invoice", "supplierinvoice", "invoiceno", "billno"]);
  const notes = getField(["notes", "remark", "comments"]);

  return {
    model,
    serial,
    costLkr: cost,
    deviceName,
    processor,
    ram,
    storage,
    grade,
    supplierName,
    supplierInvoice,
    notes,
  };
}

/**
 * Bulk imports wholesale laptop shipments into the inventory system.
 */
export function bulkImportStockIntakes(
  input: string | BulkImportRow[],
  defaultSupplierId = "default_supplier",
  defaultSupplierInvoice = "CONTAINER-IMPORT",
  actor = "Admin",
  database?: DatabaseSync
): BulkImportResult {
  const db = database || getDatabase();
  const rows: BulkImportRow[] = typeof input === "string" 
    ? parseRawDelimitedText(input).map(normalizeRecord)
    : input;

  if (rows.length === 0) {
    return { success: true, totalRows: 0, importedCount: 0, skippedCount: 0, errors: [], createdIntakeIds: [] };
  }

  const errors: BulkImportResult["errors"] = [];
  const createdIntakeIds: string[] = [];
  const now = new Date().toISOString();
  const todayDate = now.slice(0, 10);

  // Cache existing serial numbers to avoid database round-trips
  const existingSerials = new Set(
    (db.prepare("SELECT LOWER(serial) as s FROM stock_intakes").all() as Array<{ s: string }>).map((r) => r.s)
  );
  const existingDeviceSerials = new Set(
    (db.prepare("SELECT LOWER(serial) as s FROM devices").all() as Array<{ s: string }>).map((r) => r.s)
  );

  // Supplier cache
  const supplierCache = new Map<string, string>();
  const allSuppliers = db.prepare("SELECT id, LOWER(name) as name FROM suppliers").all() as Array<{ id: string; name: string }>;
  for (const s of allSuppliers) {
    supplierCache.set(s.name, s.id);
  }

  // Ensure default supplier exists
  let fallbackSupplierId = defaultSupplierId;
  const defSupp = db.prepare("SELECT id FROM suppliers LIMIT 1").get() as { id: string } | undefined;
  if (defSupp) {
    fallbackSupplierId = defSupp.id;
  } else {
    fallbackSupplierId = "SUP-WHOLESALE-DEFAULT";
    db.prepare(`
      INSERT OR IGNORE INTO suppliers (id, name, contact_name, email, phone, active, created_by, created_at, updated_at)
      VALUES (?, 'Wholesale Container Importer', 'Warehouse Manager', 'procurement@lapmart.lk', '+94 11 000 0000', 1, ?, ?, ?)
    `).run(fallbackSupplierId, actor, now, now);
    supplierCache.set("wholesale container importer", fallbackSupplierId);
  }

  const seenBatchSerials = new Set<string>();

  db.exec("BEGIN");
  try {
    const insertIntakeStmt = db.prepare(`
      INSERT INTO stock_intakes (
        id, supplier_id, device_id, device_name, model, serial, supplier_invoice,
        purchased_at, purchase_cost_cents, status, notes, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Awaiting test', ?, ?, ?, ?)
    `);

    const insertDeviceStmt = db.prepare(`
      INSERT INTO devices (
        id, name, model, serial, grade, score, battery_health, storage_health,
        memory, storage, processor, tested_at, technician, warranty_ends, status, created_at
      ) VALUES (?, ?, ?, ?, ?, 90, 85, 100, ?, ?, ?, ?, ?, '', 'Draft', ?)
    `);

    const insertFinanceStmt = db.prepare(`
      INSERT INTO device_finance (device_id, purchase_cost_cents, refurbishment_cost_cents, parts_cost_cents, repair_cost_cents, updated_by, updated_at)
      VALUES (?, ?, 0, 0, 0, ?, ?)
    `);

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 1;
      const row = rows[i];

      const serial = (row.serial || "").trim();
      const model = (row.model || "").trim();

      if (!serial) {
        errors.push({ row: rowNum, serial: "", error: "Missing Serial Number." });
        continue;
      }

      const lowerSerial = serial.toLowerCase();

      if (seenBatchSerials.has(lowerSerial)) {
        errors.push({ row: rowNum, serial, error: `Duplicate serial '${serial}' within current import batch.` });
        continue;
      }
      seenBatchSerials.add(lowerSerial);

      if (existingSerials.has(lowerSerial) || existingDeviceSerials.has(lowerSerial)) {
        errors.push({ row: rowNum, serial, error: `Serial '${serial}' already exists in database.` });
        continue;
      }

      if (!model) {
        errors.push({ row: rowNum, serial, error: "Missing Laptop Model." });
        continue;
      }

      let costCents = 0;
      try {
        costCents = parseLkrToCents(row.costLkr || "0", "Purchase cost", true);
      } catch (err: any) {
        errors.push({ row: rowNum, serial, error: `Invalid cost: ${err.message}` });
        continue;
      }

      // Resolve supplier
      let supplierId = fallbackSupplierId;
      if (row.supplierName && row.supplierName.trim()) {
        const sNameLower = row.supplierName.trim().toLowerCase();
        if (supplierCache.has(sNameLower)) {
          supplierId = supplierCache.get(sNameLower)!;
        } else {
          // Auto create supplier
          const newSuppId = `SUP-${randomUUID().slice(0, 8).toUpperCase()}`;
          db.prepare(`
            INSERT INTO suppliers (id, name, contact_name, email, phone, active, created_by, created_at, updated_at)
            VALUES (?, ?, 'Direct Representative', '', '', 1, ?, ?, ?)
          `).run(newSuppId, row.supplierName.trim(), actor, now, now);
          supplierCache.set(sNameLower, newSuppId);
          supplierId = newSuppId;
        }
      }

      const intakeId = `INT-${randomUUID().slice(0, 8).toUpperCase()}`;
      const deviceId = `DEV-${serial.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) || randomUUID().slice(0, 8).toUpperCase()}`;
      const deviceName = row.deviceName?.trim() || model;
      const invoiceRef = (row.supplierInvoice || defaultSupplierInvoice).trim();

      // Create draft device record
      insertDeviceStmt.run(
        deviceId,
        deviceName,
        model,
        serial,
        row.grade || "A",
        row.ram || "8 GB DDR4",
        row.storage || "256 GB NVMe SSD",
        row.processor || "Intel Core i5",
        todayDate,
        actor,
        now
      );

      // Create intake record linked to device
      insertIntakeStmt.run(
        intakeId,
        supplierId,
        deviceId,
        deviceName,
        model,
        serial,
        invoiceRef,
        todayDate,
        costCents,
        row.notes || "Bulk wholesale container intake",
        actor,
        now,
        now
      );

      // Create finance record
      insertFinanceStmt.run(
        deviceId,
        costCents,
        actor,
        now
      );

      createdIntakeIds.push(intakeId);
      existingSerials.add(lowerSerial);
      existingDeviceSerials.add(lowerSerial);
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return {
    success: errors.length === 0,
    totalRows: rows.length,
    importedCount: createdIntakeIds.length,
    skippedCount: errors.length,
    errors,
    createdIntakeIds,
  };
}
