"use client";

import { useState } from "react";
import Link from "next/link";
import type { CustomerPortalData } from "../../lib/customer-portal";

interface CustomerPortalClientProps {
  initialData: CustomerPortalData | null;
  shopPhone: string;
}

export function CustomerPortalClient({ initialData, shopPhone }: CustomerPortalClientProps) {
  const [data, setData] = useState<CustomerPortalData | null>(initialData);
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoCode, setDemoCode] = useState<string | null>(null);

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/portal/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Failed to send verification code.");
      }

      if (result.demoCode) {
        setDemoCode(result.demoCode);
      }
      setStep("otp");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/portal/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otpCode }),
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Invalid verification code.");
      }

      // Reload page to fetch authenticated server session
      window.location.reload();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/portal/logout", { method: "POST" });
    setData(null);
    setStep("phone");
    setOtpCode("");
    window.location.reload();
  }

  // -------------------------------------------------------------
  // Logged-in Customer View
  // -------------------------------------------------------------
  if (data) {
    return (
      <div className="space-y-8">
        {/* Welcome Banner */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              Verified Customer Account
            </span>
            <h1 className="text-2xl font-bold text-white mt-1">
              Welcome back, {data.customerName || "Customer"}!
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Linked Mobile: {data.phone}
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="self-start sm:self-auto text-xs font-semibold px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            Log Out
          </button>
        </div>

        {/* Laptops List */}
        <div>
          <h2 className="text-lg font-bold text-white mb-4">
            Your Registered Laptops ({data.devices.length})
          </h2>

          {data.devices.length === 0 ? (
            <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800 text-center">
              <p className="text-3xl">💻</p>
              <h3 className="mt-2 text-base font-bold text-white">No laptops found for this number</h3>
              <p className="text-xs text-slate-400 mt-1">
                Make sure you entered the same mobile number registered on your invoice at the store counter.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.devices.map((dev) => {
                const daysRemaining = Math.max(
                  0,
                  Math.ceil((new Date(dev.warrantyEnds).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                );
                return (
                  <div
                    key={dev.deviceId}
                    className="rounded-2xl bg-slate-900 border border-slate-800 p-6 flex flex-col justify-between"
                  >
                    <div>
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-base font-bold text-white">{dev.name}</h3>
                          <p className="text-xs text-slate-400 font-mono mt-0.5">
                            S/N: {dev.serial} • Invoice: {dev.invoiceReference}
                          </p>
                        </div>

                        <span
                          className={`text-xs font-extrabold px-2.5 py-1 rounded-full border ${
                            dev.isWarrantyActive
                              ? "bg-emerald-950/80 text-emerald-400 border-emerald-800"
                              : "bg-rose-950/80 text-rose-400 border-rose-800"
                          }`}
                        >
                          {dev.isWarrantyActive ? `Active (${daysRemaining}d left)` : "Expired"}
                        </span>
                      </div>

                      {/* Service / Claims Overview */}
                      <div className="mt-4 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs">
                        <span className="text-slate-400">Service Claims:</span>
                        <span className="font-semibold text-slate-200">
                          {dev.claimsCount} total ({dev.activeClaimsCount} in progress)
                        </span>
                      </div>

                      {/* Warranty Dates */}
                      <div className="mt-3 text-xs text-slate-400 space-y-1">
                        <div className="flex justify-between">
                          <span>Coverage Period:</span>
                          <span className="font-medium text-slate-200">
                            {dev.warrantyStarts} to {dev.warrantyEnds}
                          </span>
                        </div>
                      </div>
                    </div>

                  {/* Action Links */}
                  <div className="mt-6 pt-4 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-xs font-semibold">
                    <Link
                      href={`/passport/${dev.serial}`}
                      className="text-center px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                    >
                      Digital Passport
                    </Link>
                    <Link
                      href={`/receipt/${dev.deviceId}`}
                      className="text-center px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                    >
                      Thermal Receipt
                    </Link>
                    <Link
                      href={`/invoice/${dev.deviceId}`}
                      className="text-center px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                    >
                      A4 Tax Invoice
                    </Link>
                    <Link
                      href={`/passport/${dev.serial}/claim`}
                      className="text-center px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition font-bold"
                    >
                      Submit Claim
                    </Link>
                  </div>
                </div>
              );
            })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Passwordless Login Form (Phone -> OTP)
  // -------------------------------------------------------------
  return (
    <div className="max-w-md mx-auto">
      <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="text-center">
          <span className="text-3xl">📱</span>
          <h1 className="mt-3 text-xl font-bold text-white">Customer Self-Service Portal</h1>
          <p className="mt-1 text-xs text-slate-400">
            No password required. Log in using the mobile phone number registered on your purchase receipt.
          </p>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
            {error}
          </div>
        )}

        {demoCode && (
          <div className="mt-4 p-3 rounded-lg bg-cyan-950/60 border border-cyan-800 text-cyan-300 text-xs font-mono text-center">
            Demo Test OTP: <strong>{demoCode}</strong>
          </div>
        )}

        {step === "phone" ? (
          <form onSubmit={handleRequestOtp} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Mobile Phone Number
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 0771234567 or +94771234567"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm transition shadow-lg shadow-cyan-500/20 disabled:opacity-50"
            >
              {loading ? "Sending Code..." : "Send Verification Code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="mt-6 space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-semibold text-slate-300">
                  Enter 6-Digit OTP Code
                </label>
                <button
                  type="button"
                  onClick={() => setStep("phone")}
                  className="text-xs text-cyan-400 hover:underline"
                >
                  Change number
                </button>
              </div>
              <input
                type="text"
                required
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="123456"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-center tracking-widest text-lg font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify & Access Portal"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
