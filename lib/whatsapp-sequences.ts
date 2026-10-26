import { DatabaseSync } from "node:sqlite";
import { getDatabase, getShopSettings } from "./database";
import { generateWhatsAppClickToChatUrl } from "./whatsapp";

export type { SequenceType, FollowUpCustomerItem } from "./sales";
import type { SequenceType, FollowUpCustomerItem } from "./sales";

export function ensureSequenceSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_followup_logs (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      sequence_type TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      message_text TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      UNIQUE(device_id, sequence_type)
    );
  `);
}

/**
 * Finds customers eligible for Day 7, Day 30, or Day 150 proactive customer care WhatsApp sequences.
 */
export function getPendingFollowUpSequences(
  referenceDateIso?: string,
  database?: DatabaseSync
): FollowUpCustomerItem[] {
  const db = database || getDatabase();
  ensureSequenceSchema(db);
  const settings = getShopSettings();

  const refDate = referenceDateIso ? new Date(`${referenceDateIso}T12:00:00Z`) : new Date();
  const refTime = refDate.getTime();

  const sales = db.prepare(`
    SELECT s.*, d.name as dev_name, d.model, d.serial
    FROM device_sales s
    JOIN devices d ON d.id = s.device_id
    WHERE s.customer_phone != ''
    ORDER BY s.sold_at DESC
  `).all() as any[];

  // Fetch already sent logs to prevent duplicate messaging
  const sentLogs = new Set(
    (db.prepare("SELECT device_id || ':' || sequence_type as k FROM whatsapp_followup_logs").all() as any[]).map(
      (r) => r.k
    )
  );

  const eligible: FollowUpCustomerItem[] = [];

  for (const s of sales) {
    const soldDate = new Date(`${s.sold_at}T12:00:00Z`);
    const expiryDate = new Date(`${s.warranty_ends}T12:00:00Z`);

    const daysSinceSale = Math.round((refTime - soldDate.getTime()) / 86_400_000);
    const daysUntilExpiry = Math.round((expiryDate.getTime() - refTime) / 86_400_000);

    let sequenceType: SequenceType | null = null;
    let messageText = "";

    // 1. Day 7 Check-in (Between day 6 and 9)
    if (daysSinceSale >= 6 && daysSinceSale <= 9) {
      sequenceType = "Day 7 Satisfaction";
      messageText = `Hi ${s.customer_name}! 👋 It has been a week since you received your ${s.dev_name} from ${settings.shopName}. We hope everything is running smoothly! If you ever need technical help or tips, our workshop team is always here for you. Thank you for choosing verified refurbished! ✨`;
    }
    // 2. Day 30 Battery Care (Between day 28 and 33)
    else if (daysSinceSale >= 28 && daysSinceSale <= 33) {
      sequenceType = "Day 30 Battery Care";
      messageText = `Hi ${s.customer_name}! 💡 Pro-tip for your ${s.dev_name}: To keep your battery health optimal for years, try to avoid leaving it on the charger 24/7. Letting the battery discharge to ~20% and recharging helps keep the internal cells healthy. Best regards from ${settings.shopName}!`;
    }
    // 3. Day 150 Expiry Alert (12 to 16 days before 180-day expiry)
    else if (daysUntilExpiry >= 12 && daysUntilExpiry <= 16) {
      sequenceType = "Day 150 Expiry Alert";
      messageText = `Hi ${s.customer_name}! ⏳ Friendly reminder: The hardware warranty for your ${s.dev_name} (Invoice #${s.invoice_reference}) expires in 15 days on ${s.warranty_ends}. We invite you to bring it into ${settings.shopName} for a complimentary dust clean-out & health re-check before the warranty ends!`;
    }

    if (sequenceType && !sentLogs.has(`${s.device_id}:${sequenceType}`)) {
      const whatsappUrl = generateWhatsAppClickToChatUrl(s.customer_phone, messageText);

      eligible.push({
        deviceId: s.device_id,
        deviceName: s.dev_name,
        serial: s.serial,
        invoiceReference: s.invoice_reference,
        customerName: s.customer_name,
        customerPhone: s.customer_phone,
        soldAt: s.sold_at,
        warrantyEnds: s.warranty_ends,
        daysSinceSale,
        daysUntilExpiry,
        sequenceType,
        messageText,
        whatsappUrl,
      });
    }
  }

  return eligible;
}

export function markSequenceDispatched(
  deviceId: string,
  sequenceType: SequenceType,
  customerPhone: string,
  messageText: string,
  database?: DatabaseSync
) {
  const db = database || getDatabase();
  ensureSequenceSchema(db);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT OR REPLACE INTO whatsapp_followup_logs (id, device_id, sequence_type, customer_phone, message_text, sent_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(`${deviceId}-${sequenceType}`, deviceId, sequenceType, customerPhone, messageText, now);
}
