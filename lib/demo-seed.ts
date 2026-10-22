import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { hashPassword } from "./passwords";
import { DEMO_DEV_PASSWORD } from "./demo";

// Runs once on each fresh disposable database. All people and records below
// are fictional; normal shop deployments never call this initializer.
export function seedPortfolioDemo(database: DatabaseSync) {
  if (database.prepare("SELECT value FROM app_meta WHERE key = 'portfolio_demo_v2'").get()) return;
  const now = new Date().toISOString();
  const date = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const deviceIds = ["DVP-LK-240831", "DVP-LK-240830", "DVP-LK-240829", "DVP-LK-240828"];
  const ownerId = "demo-owner";
  const technicianId = "demo-technician";
  const supportId = "demo-support";
  const defaultHash = hashPassword(DEMO_DEV_PASSWORD);

  database.exec("BEGIN");
  try {
    database.prepare(`
      UPDATE shop_settings SET shop_name = 'DevicePassport Demo',
        tagline = 'A portfolio demo for refurbished laptop shops',
        contact_email = 'shop@devicepassport.example', phone = '',
        address = 'Sample shop — Colombo, Sri Lanka', updated_at = ? WHERE id = 1
    `).run(now);

    // Seed/refresh the 3 demo roles with the standard demo password
    database.prepare(`
      INSERT INTO staff_users (id, name, email, role, password_hash, active, created_at, updated_at)
      VALUES (?, 'Demo Shop Owner', 'owner@lapmart.lk', 'Owner', ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET email = 'owner@lapmart.lk', role = 'Owner', password_hash = excluded.password_hash, active = 1, updated_at = excluded.updated_at
    `).run(ownerId, defaultHash, now, now);

    database.prepare(`
      INSERT INTO staff_users (id, name, email, role, password_hash, active, created_at, updated_at)
      VALUES (?, 'Demo Shop Owner', 'demo@devicepassport.example', 'Owner', ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET role = 'Owner', password_hash = excluded.password_hash, active = 1, updated_at = excluded.updated_at
    `).run("demo-owner-alias", defaultHash, now, now);

    database.prepare(`
      INSERT INTO staff_users (id, name, email, role, password_hash, active, created_at, updated_at)
      VALUES (?, 'Demo Technician', 'technician@devicepassport.example', 'Technician', ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET role = 'Technician', password_hash = excluded.password_hash, active = 1, updated_at = excluded.updated_at
    `).run(technicianId, defaultHash, now, now);

    database.prepare(`
      INSERT INTO staff_users (id, name, email, role, password_hash, active, created_at, updated_at)
      VALUES (?, 'Demo Customer Support', 'support@devicepassport.example', 'Support', ?, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET role = 'Support', password_hash = excluded.password_hash, active = 1, updated_at = excluded.updated_at
    `).run(supportId, defaultHash, now, now);

    database.prepare(`
      INSERT OR IGNORE INTO suppliers (id, name, contact_name, email, phone, active, created_by, created_at, updated_at)
      VALUES ('demo-supplier', 'Sample Laptop Supplier', 'Sample Vendor', 'vendor@devicepassport.example', '', 1, 'Demo seed', ?, ?)
    `).run(now, now);

    for (const [index, deviceId] of deviceIds.entries()) {
      const device = database.prepare("SELECT name, model, serial FROM devices WHERE id = ?").get(deviceId) as { name: string; model: string; serial: string } | undefined;
      if (!device) continue;
      const sold = index < 2;
      const purchased = date(-40 - index * 8);
      const cost = [8500000, 10500000, 6200000, 13500000][index];
      const intakeId = `demo-intake-${index + 1}`;
      database.prepare(`
        INSERT OR REPLACE INTO stock_intakes (
          id, supplier_id, device_id, device_name, model, serial, supplier_invoice,
          purchased_at, purchase_cost_cents, status, notes, created_by, created_at, updated_at
        ) VALUES (?, 'demo-supplier', ?, ?, ?, ?, ?, ?, ?, ?, 'Fictional portfolio stock record.', 'Demo seed', ?, ?)
      `).run(intakeId, deviceId, device.name, device.model, device.serial, `DEMO-PURCHASE-${index + 1}`, purchased, cost,
        sold ? "Sold" : index === 2 ? "In refurbishment" : "Ready", now, now);
      database.prepare(`
        INSERT OR REPLACE INTO device_finance (device_id, purchase_cost_cents, refurbishment_cost_cents, updated_by, updated_at)
        VALUES (?, ?, 0, 'Demo seed', ?)
      `).run(deviceId, cost, now);
      database.prepare(`
        INSERT OR REPLACE INTO refurbishment_tasks (
          id, intake_id, category, description, cost_cents, completed, created_by, completed_by, created_at, completed_at, updated_at
        ) VALUES (?, ?, 'Repair', ?, 250000, ?, 'Demo seed', ?, ?, ?, ?)
      `).run(`demo-task-${index + 1}`, intakeId, index === 2 ? "Replace worn battery and repeat health check" : "Clean, service, and inspect the laptop",
        index === 2 ? 0 : 1, index === 2 ? "" : "Demo Technician", now, index === 2 ? "" : now, now);

      if (sold) {
        database.prepare(`
          UPDATE device_sales SET customer_name = ?, customer_email = ?, customer_phone = '',
            invoice_reference = ?, sale_price_cents = ?, activated_by = 'Demo seed'
          WHERE device_id = ?
        `).run(`Sample Customer ${index + 1}`, `customer${index + 1}@devicepassport.example`, `DEMO-SALE-${index + 1}`,
          cost + 2200000, deviceId);
        database.prepare("UPDATE devices SET technician = 'Demo Technician' WHERE id = ?").run(deviceId);
      } else {
        database.prepare("DELETE FROM device_sales WHERE device_id = ? AND invoice_reference LIKE 'LEGACY-%'").run(deviceId);
        database.prepare("UPDATE devices SET warranty_ends = '', tested_at = ?, technician = 'Demo Technician' WHERE id = ?")
          .run(`${date(-3)}T12:00:00.000Z`, deviceId);
      }
    }

    for (let index = 0; index < 2; index++) {
      const claimId = `DEMO-CLAIM-${index + 1}`;
      const createdAt = `${date(-8 - index * 4)}T09:00:00.000Z`;
      const completed = index === 1;
      const status = completed ? "Completed" : "Reviewing";
      database.prepare(`
        INSERT OR REPLACE INTO warranty_claims (
          id, tracking_token, device_id, customer_name, customer_email, customer_phone,
          category, description, status, priority, assigned_to_id, due_date, service_cost_cents,
          warranty_valid, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, 'Normal', ?, ?, ?, 1, ?, ?)
      `).run(claimId, randomBytes(18).toString("base64url"), deviceIds[index], `Sample Customer ${index + 1}`,
        `customer${index + 1}@devicepassport.example`, completed ? "Keyboard" : "Battery",
        completed ? "Sample case: keyboard intermittently missed key presses." : "Sample case: battery drains faster than expected during video calls.",
        status, technicianId, date(completed ? -4 : 2), completed ? 150000 : 0, createdAt, now);
      database.prepare(`INSERT OR IGNORE INTO claim_events (id, claim_id, status, note, actor, created_at) VALUES (?, ?, 'New', 'Sample warranty request received.', 'Customer', ?)`)
        .run(`${claimId}-new`, claimId, createdAt);
      database.prepare(`INSERT OR IGNORE INTO claim_events (id, claim_id, status, note, actor, created_at) VALUES (?, ?, ?, ?, 'Demo Technician', ?)`)
        .run(`${claimId}-update`, claimId, status, completed ? "Keyboard serviced, tested, and handed back to the sample customer." : "Battery diagnostic check is in progress.", `${date(-2)}T14:00:00.000Z`);
      database.prepare(`INSERT OR IGNORE INTO claim_internal_notes (id, claim_id, note, actor, created_at) VALUES (?, ?, 'Fictional repair-bench note for the portfolio demonstration.', 'Demo Technician', ?)`)
        .run(`${claimId}-note`, claimId, now);
    }
    database.prepare("INSERT OR REPLACE INTO audit_events (id, actor, action, summary, created_at) VALUES ('demo-seed', 'Demo seed', 'demo.created', 'Loaded fictional devices, sales, claims, and stock for the portfolio demo.', ?)").run(now);
    database.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('portfolio_demo_v2', ?)").run(now);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
