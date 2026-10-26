import { NextResponse } from "next/server";
import { generateCustomerOtp } from "../../../../../lib/customer-portal";
import { sendWhatsAppMessage } from "../../../../../lib/whatsapp";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const phone = body.phone?.trim();

    if (!phone) {
      return NextResponse.json({ error: "Please enter your mobile phone number." }, { status: 400 });
    }

    const otpRecord = generateCustomerOtp(phone);

    if (otpRecord.devCode) {
      // Send OTP via WhatsApp Cloud / fallback
      const message =
        `🔐 *Your DevicePassport Login Code: ${otpRecord.devCode}*\n\n` +
        `Use this 6-digit verification code to access your laptops, warranty cards, and invoices. Valid for 10 minutes.\n` +
        `If you did not request this code, please ignore this message.`;

      await sendWhatsAppMessage(phone, message);
    }

    return NextResponse.json({
      success: true,
      phone: otpRecord.phone,
      expiresInSeconds: otpRecord.expiresInSeconds,
      demoCode: otpRecord.devCode,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to generate login OTP." }, { status: 400 });
  }
}
