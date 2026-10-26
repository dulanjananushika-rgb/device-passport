/**
 * DevicePassport - Google Reviews Booster & Reputation Engine
 * Generates automated 5-star review request flows via WhatsApp to accelerate local business ranking on Google Maps.
 */

import { generateWhatsAppClickToChatUrl, sendWhatsAppMessage, type WhatsAppSendResult } from "./whatsapp";

export interface ReviewPromptOptions {
  customerName: string;
  shopName: string;
  deviceModel: string;
  serviceType: "purchase" | "repair" | "warranty_service";
  reviewUrl: string;
  offerIncentive?: boolean;
  incentiveText?: string;
}

/**
 * Normalizes a Google Place ID or review URL into a direct 5-star review submission link.
 */
export function buildGoogleReviewUrl(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  // Assume it is a Google Place ID (e.g. ChIJN1t_tDeuEmsRUsoyG83frY4)
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(trimmed)}`;
}

/**
 * Generates high-converting, friendly review request copy for WhatsApp.
 */
export function createReviewPromptMessage(options: ReviewPromptOptions): string {
  const serviceContext =
    options.serviceType === "repair"
      ? `repair on your ${options.deviceModel}`
      : options.serviceType === "warranty_service"
      ? `warranty service on your ${options.deviceModel}`
      : `certified ${options.deviceModel}`;

  const incentive = options.offerIncentive
    ? `\n🎁 *Thank You Bonus:* ${
        options.incentiveText || "Show your review on your next visit to receive 10% OFF accessories & free preventive cleaning!"
      }\n`
    : "";

  return (
    `⭐ *How was your experience with ${options.shopName}?* ⭐\n\n` +
    `Hi *${options.customerName}*,\n` +
    `We hope you are completely satisfied with the ${serviceContext}!\n\n` +
    `As an independent workshop, your feedback helps us grow and helps other buyers find trustworthy refurbished laptops.\n\n` +
    `Could you take 30 seconds to rate us on Google?\n` +
    `👉 ${options.reviewUrl}\n` +
    incentive +
    `\nThank you for supporting our local business! ❤️`
  );
}

/**
 * Generates a ready-to-click WhatsApp URL for staff to manually send with one click.
 */
export function createReviewPromptClickToChatUrl(phone: string, options: ReviewPromptOptions): string {
  const message = createReviewPromptMessage(options);
  return generateWhatsAppClickToChatUrl(phone, message);
}

/**
 * Automatically dispatches the Google Review request message via WhatsApp.
 */
export async function sendReviewPromptNotification(
  phone: string,
  options: ReviewPromptOptions
): Promise<WhatsAppSendResult> {
  const message = createReviewPromptMessage(options);
  return sendWhatsAppMessage(phone, message);
}
