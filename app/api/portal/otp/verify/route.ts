import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyCustomerOtp } from "../../../../../lib/customer-portal";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const phone = body.phone?.trim();
    const otpCode = body.otpCode?.trim();

    if (!phone || !otpCode) {
      return NextResponse.json({ error: "Phone number and 6-digit OTP code are required." }, { status: 400 });
    }

    const session = verifyCustomerOtp(phone, otpCode);
    const cookieStore = await cookies();

    // Set 30-day customer session cookie
    cookieStore.set("devicepassport_customer_session", session.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });

    return NextResponse.json({
      success: true,
      sessionToken: session.sessionToken,
      phone: session.phone,
      customerName: session.customerName,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Invalid or expired OTP code." }, { status: 400 });
  }
}
