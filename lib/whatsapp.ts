/**
 * DevicePassport - Enterprise WhatsApp Cloud Automation Engine
 * Supports Meta WhatsApp Cloud API (v21.0) with zero-cost 1,000 free service conversations/mo,
 * with intelligent Click-to-Chat fallback (wa.me) for zero-config offline/dev setups.
 */

export interface WhatsAppConfig {
  phoneNumberId?: string;
  accessToken?: string;
  apiVersion?: string;
  simulate?: boolean;
}

export interface WhatsAppSendResult {
  success: boolean;
  mode: "api" | "click_to_chat" | "simulated";
  messageId?: string;
  recipient: string;
  messageText: string;
  clickToChatUrl: string;
  error?: string;
}

export interface WarrantyActivationNotification {
  phone: string;
  customerName: string;
  deviceName: string;
  serialNumber: string;
  warrantyEnds: string;
  passportUrl: string;
  shopName?: string;
  shopPhone?: string;
}

export interface ClaimStatusNotification {
  phone: string;
  customerName: string;
  claimId: string;
  deviceName: string;
  status: string;
  technicianNote?: string;
  trackingUrl: string;
  shopName?: string;
}

export interface ClaimCompletedNotification {
  phone: string;
  customerName: string;
  claimId: string;
  deviceName: string;
  resolutionSummary?: string;
  pickupAddress: string;
  trackingUrl: string;
  googleReviewUrl?: string;
  shopName?: string;
}

export interface WarrantyExpiryReminderNotification {
  phone: string;
  customerName: string;
  deviceName: string;
  serialNumber: string;
  warrantyEnds: string;
  daysRemaining: number;
  tradeInUrl?: string;
  shopName?: string;
  shopPhone?: string;
}

/**
 * Standardizes phone numbers to international digits-only format.
 * Defaults Sri Lankan local formats (e.g. 0771234567, 771234567) to 94771234567.
 */
export function normalizeWhatsAppPhone(phone: string): string {
  if (!phone) return "";
  let cleaned = phone.replace(/[^0-9+]/g, "");
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }

  // Sri Lanka prefix handling
  if (cleaned.startsWith("0") && cleaned.length === 10) {
    return "94" + cleaned.substring(1);
  }
  if (cleaned.length === 9 && (cleaned.startsWith("7") || cleaned.startsWith("1") || cleaned.startsWith("2"))) {
    return "94" + cleaned;
  }

  return cleaned;
}

/**
 * Generates an instant Click-to-Chat URL for WhatsApp.
 */
export function generateWhatsAppClickToChatUrl(phone: string, message: string): string {
  const normalized = normalizeWhatsAppPhone(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

/**
 * Resolves active WhatsApp configuration from environment or explicit overrides.
 */
export function getWhatsAppConfig(overrides?: WhatsAppConfig): WhatsAppConfig {
  return {
    phoneNumberId: overrides?.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: overrides?.accessToken || process.env.WHATSAPP_ACCESS_TOKEN,
    apiVersion: overrides?.apiVersion || process.env.WHATSAPP_API_VERSION || "v21.0",
    simulate:
      overrides?.simulate !== undefined
        ? overrides.simulate
        : process.env.WHATSAPP_SIMULATE === "true" || process.env.NODE_ENV === "test",
  };
}

/**
 * Dispatches an automated WhatsApp text message using Meta Cloud API,
 * or safely falls back to Click-to-Chat mode if credentials are unconfigured or in simulation.
 */
export async function sendWhatsAppMessage(
  phone: string,
  messageText: string,
  configOverrides?: WhatsAppConfig
): Promise<WhatsAppSendResult> {
  const config = getWhatsAppConfig(configOverrides);
  const normalizedRecipient = normalizeWhatsAppPhone(phone);
  const clickToChatUrl = generateWhatsAppClickToChatUrl(phone, messageText);

  if (!normalizedRecipient) {
    return {
      success: false,
      mode: "click_to_chat",
      recipient: phone,
      messageText,
      clickToChatUrl,
      error: "Invalid phone number provided.",
    };
  }

  // If simulation is enabled or credentials missing, return fallback without crashing
  if (config.simulate || !config.phoneNumberId || !config.accessToken) {
    return {
      success: true,
      mode: config.simulate ? "simulated" : "click_to_chat",
      messageId: `sim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      recipient: normalizedRecipient,
      messageText,
      clickToChatUrl,
    };
  }

  try {
    const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizedRecipient,
        type: "text",
        text: {
          preview_url: true,
          body: messageText,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        mode: "api",
        recipient: normalizedRecipient,
        messageText,
        clickToChatUrl,
        error: data?.error?.message || `WhatsApp API error (${response.status})`,
      };
    }

    const messageId = data?.messages?.[0]?.id || `wa_${Date.now()}`;
    return {
      success: true,
      mode: "api",
      messageId,
      recipient: normalizedRecipient,
      messageText,
      clickToChatUrl,
    };
  } catch (err: any) {
    return {
      success: false,
      mode: "api",
      recipient: normalizedRecipient,
      messageText,
      clickToChatUrl,
      error: err.message || "Network error while connecting to Meta WhatsApp API.",
    };
  }
}

/**
 * 1. Automated Warranty Activation Notification
 * Dispatched immediately upon laptop sale & digital passport creation.
 */
export async function sendWarrantyActivationMessage(
  payload: WarrantyActivationNotification,
  config?: WhatsAppConfig
): Promise<WhatsAppSendResult> {
  const shop = payload.shopName || "Lapmart";
  const text =
    `🌟 *Official Warranty Activated!* 🌟\n\n` +
    `Hello *${payload.customerName}*,\n` +
    `Thank you for purchasing your certified laptop from *${shop}*!\n\n` +
    `💻 *Device:* ${payload.deviceName}\n` +
    `🔢 *Serial:* \`${payload.serialNumber}\`\n` +
    `🛡️ *Warranty Valid Until:* *${payload.warrantyEnds}*\n\n` +
    `View your tamper-evident Digital Passport, inspection benchmarks, and warranty terms:\n` +
    `👉 ${payload.passportUrl}\n\n` +
    `Need support? Keep this message handy or reply directly. Have a great experience! ✨`;

  return sendWhatsAppMessage(payload.phone, text, config);
}

/**
 * 2. Real-Time Repair Claim Status Update
 * Dispatched on every milestone change (Diagnosing, Parts Ordered, In Repair, QA).
 */
export async function sendClaimStatusMessage(
  payload: ClaimStatusNotification,
  config?: WhatsAppConfig
): Promise<WhatsAppSendResult> {
  const shop = payload.shopName || "Lapmart Service Center";
  const noteSection = payload.technicianNote ? `\n📝 *Technician Note:* ${payload.technicianNote}\n` : "";

  const text =
    `🔧 *Repair Status Update* [Ticket: #${payload.claimId}]\n\n` +
    `Hi *${payload.customerName}*,\n` +
    `Here is an update on your *${payload.deviceName}* undergoing service at *${shop}*:\n\n` +
    `📌 *Current Status:* *${payload.status.toUpperCase()}*` +
    noteSection +
    `\nTrack real-time progress and technician inspection photos:\n` +
    `👉 ${payload.trackingUrl}\n\n` +
    `We will notify you immediately once your device is ready for collection.`;

  return sendWhatsAppMessage(payload.phone, text, config);
}

/**
 * 3. Repair Complete & Pickup Notification with Google Review Request
 */
export async function sendClaimCompletedMessage(
  payload: ClaimCompletedNotification,
  config?: WhatsAppConfig
): Promise<WhatsAppSendResult> {
  const shop = payload.shopName || "Lapmart Service Center";
  const summary = payload.resolutionSummary ? `\n🛠️ *Resolution:* ${payload.resolutionSummary}\n` : "";
  const reviewPrompt = payload.googleReviewUrl
    ? `\n⭐ *How was our service?* Please take 30 seconds to rate us on Google:\n👉 ${payload.googleReviewUrl}\n`
    : "";

  const text =
    `✅ *Your Laptop is Ready for Pickup!* ✅\n\n` +
    `Hi *${payload.customerName}*,\n` +
    `Repairs on your *${payload.deviceName}* (Ticket #${payload.claimId}) have passed our 100% QA stress test.` +
    summary +
    `\n📍 *Workshop Collection Address:*\n${payload.pickupAddress}\n` +
    `\nView complete service report & seal verification:\n` +
    `👉 ${payload.trackingUrl}\n` +
    reviewPrompt +
    `\nThank you for choosing *${shop}*!`;

  return sendWhatsAppMessage(payload.phone, text, config);
}

/**
 * 4. Automated Warranty Expiry Reminder (7 / 14 Days Before End)
 * Offers extended warranty or VIP trade-in quote.
 */
export async function sendWarrantyExpiryReminder(
  payload: WarrantyExpiryReminderNotification,
  config?: WhatsAppConfig
): Promise<WhatsAppSendResult> {
  const shop = payload.shopName || "Lapmart";
  const tradeInText = payload.tradeInUrl
    ? `\n💡 *Want an upgrade?* Get an instant trade-in valuation for your next laptop:\n👉 ${payload.tradeInUrl}\n`
    : "";

  const text =
    `⏳ *Warranty Notice: ${payload.daysRemaining} Days Remaining*\n\n` +
    `Hi *${payload.customerName}*,\n` +
    `This is a courtesy notice that the warranty for your *${payload.deviceName}* (S/N: \`${payload.serialNumber}\`) with *${shop}* will conclude on *${payload.warrantyEnds}*.\n` +
    tradeInText +
    `\nIf you are experiencing any performance issues, please contact us before your coverage ends so our team can service it free of charge under warranty. 🛡️\n\n` +
    `Hotline: ${payload.shopPhone || "+94 11 234 5678"}`;

  return sendWhatsAppMessage(payload.phone, text, config);
}
