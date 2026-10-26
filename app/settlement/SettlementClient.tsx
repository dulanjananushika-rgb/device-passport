"use client";

import React, { useState, useEffect } from "react";
import type { DailySettlementData } from "../../lib/daily-settlement";

interface Props {
  initialData: DailySettlementData;
  initialDate: string;
}

export default function SettlementClient({ initialData, initialDate }: Props) {
  const [date, setDate] = useState(initialDate);
  const [data, setData] = useState<DailySettlementData>(initialData);
  const [loading, setLoading] = useState(false);
  const [actualCashInput, setActualCashInput] = useState("");
  
  // Petty cash modal & form state
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState("Staff Meals / Tea");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expensePaidTo, setExpensePaidTo] = useState("");
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseError, setExpenseError] = useState("");

  const fetchSettlement = async (targetDate: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/settlement?date=${targetDate}`);
      const json = await res.json();
      if (json.settlement) {
        setData(json.settlement);
      }
    } catch (err) {
      console.error("Failed to load settlement", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (date !== initialDate) {
      fetchSettlement(date);
    }
  }, [date, initialDate]);

  const expectedCashCents = typeof data.expectedDrawerCashCents === "number" ? data.expectedDrawerCashCents : data.totalCashCents;
  const actualCashCents = actualCashInput ? Math.round(Number(actualCashInput) * 100) : null;
  const varianceCents = actualCashCents !== null ? actualCashCents - expectedCashCents : null;

  const handlePrintSlip = () => {
    window.open(`/api/settlement?date=${date}&format=thermal`, "_blank", "width=420,height=700");
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingExpense(true);
    setExpenseError("");
    try {
      const res = await fetch("/api/settlement/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          settlementDate: date,
          category: expenseCategory,
          description: expenseDescription,
          amountLkr: expenseAmount,
          paidTo: expensePaidTo,
        }),
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Failed to log expense");
      
      setExpenseDescription("");
      setExpenseAmount("");
      setExpensePaidTo("");
      setExpenseModalOpen(false);
      await fetchSettlement(date);
    } catch (err: any) {
      setExpenseError(err.message || "Failed to save expense");
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm("Are you sure you want to delete this petty cash voucher?")) return;
    try {
      const res = await fetch(`/api/settlement/expenses?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        await fetchSettlement(date);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#090d16", color: "#f1f5f9", padding: "32px 24px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        {/* Header Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "28px", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <a href="/" style={{ color: "#94a3b8", textDecoration: "none", fontSize: "14px", display: "flex", alignItems: "center", gap: "4px" }}>
                ← Dashboard
              </a>
              <span style={{ color: "#334155" }}>/</span>
              <span style={{ color: "#10b981", fontSize: "13px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>Retail Settlement</span>
            </div>
            <h1 style={{ fontSize: "28px", fontWeight: "800", color: "#ffffff", marginTop: "6px", display: "flex", alignItems: "center", gap: "10px" }}>
              Day-End Z-Report
              <span style={{ fontSize: "12px", background: "#1e293b", color: "#10b981", border: "1px solid #10b98144", padding: "4px 10px", borderRadius: "999px" }}>
                {data.reportId}
              </span>
            </h1>
            <p style={{ color: "#94a3b8", fontSize: "14px", margin: 0 }}>
              Daily Cash Drawer Reconciliation, Petty Cash Outflows & Net Profit Audit for {data.shop.name}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ background: "#111827", border: "1px solid #1f293d", borderRadius: "10px", padding: "6px 12px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "13px", color: "#94a3b8" }}>Date:</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "14px",
                  fontWeight: "600",
                  outline: "none",
                  colorScheme: "dark",
                }}
              />
            </div>

            <button
              type="button"
              onClick={() => setExpenseModalOpen(true)}
              style={{
                background: "#1e293b",
                color: "#f8fafc",
                border: "1px solid #334155",
                borderRadius: "10px",
                padding: "10px 16px",
                fontSize: "14px",
                fontWeight: "600",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              💸 + Log Till Cash Out / Expense
            </button>

            <button
              onClick={handlePrintSlip}
              style={{
                background: "linear-gradient(135deg, #10b981, #059669)",
                color: "#ffffff",
                border: "none",
                borderRadius: "10px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: "700",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                boxShadow: "0 4px 12px rgba(16, 185, 129, 0.25)",
              }}
            >
              🖨️ Print 80mm Z-Slip
            </button>
          </div>
        </div>

        {/* Modal for Petty Cash Outflow */}
        {expenseModalOpen && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "20px" }}>
            <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "14px", padding: "24px", maxWidth: "480px", width: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "18px", fontWeight: "700", color: "#f8fafc", margin: 0 }}>💸 Record Till Cash Outflow</h3>
                <button type="button" onClick={() => setExpenseModalOpen(false)} style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: "18px", cursor: "pointer" }}>✕</button>
              </div>
              <p style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "16px" }}>
                Log cash taken out of the counter drawer (Staff tea/lunch, courier shipping fees, packaging, etc.) to keep the evening cash drawer balanced.
              </p>
              <form onSubmit={handleSaveExpense} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "#cbd5e1" }}>
                  Category
                  <select
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                    style={{ background: "#1e293b", border: "1px solid #334155", color: "#ffffff", padding: "8px 12px", borderRadius: "6px" }}
                  >
                    <option value="Staff Meals / Tea">Staff Meals / Tea (Rs. 500 - 2,000)</option>
                    <option value="Packaging & Tape">Packaging & Tape</option>
                    <option value="Courier Delivery Fee">Courier Delivery Fee (Domex / Prompt / Pronto)</option>
                    <option value="Shop Maintenance">Shop Maintenance / Cleaning</option>
                    <option value="Transport / Travel">Transport / Delivery Travel</option>
                    <option value="Supplier Cash Advance">Supplier Cash Advance</option>
                    <option value="Customer Refund">Customer Refund</option>
                    <option value="Other Expenses">Other Expenses</option>
                  </select>
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "#cbd5e1" }}>
                  Amount (LKR)
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 1500"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    style={{ background: "#1e293b", border: "1px solid #334155", color: "#ffffff", padding: "8px 12px", borderRadius: "6px", fontSize: "15px", fontWeight: "700" }}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "#cbd5e1" }}>
                  Paid To (Recipient)
                  <input
                    required
                    placeholder="e.g. Domex Courier Agent / Lunch Packet Shop"
                    value={expensePaidTo}
                    onChange={(e) => setExpensePaidTo(e.target.value)}
                    style={{ background: "#1e293b", border: "1px solid #334155", color: "#ffffff", padding: "8px 12px", borderRadius: "6px" }}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "#cbd5e1" }}>
                  Description / Justification
                  <input
                    required
                    placeholder="e.g. Lunch packets for workshop technicians"
                    value={expenseDescription}
                    onChange={(e) => setExpenseDescription(e.target.value)}
                    style={{ background: "#1e293b", border: "1px solid #334155", color: "#ffffff", padding: "8px 12px", borderRadius: "6px" }}
                  />
                </label>

                {expenseError && <div style={{ color: "#ef4444", fontSize: "12px" }}>{expenseError}</div>}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
                  <button type="button" onClick={() => setExpenseModalOpen(false)} style={{ background: "transparent", border: "1px solid #334155", color: "#94a3b8", padding: "8px 16px", borderRadius: "6px", cursor: "pointer" }}>Cancel</button>
                  <button type="submit" disabled={savingExpense} style={{ background: "#10b981", border: "none", color: "#ffffff", padding: "8px 18px", borderRadius: "6px", fontWeight: "700", cursor: "pointer" }}>
                    {savingExpense ? "Saving..." : "Record Till Outflow"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Top Summary Banner */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "28px" }}>
          <div style={{ background: "#111827", border: "1px solid #1f293d", borderRadius: "14px", padding: "20px" }}>
            <div style={{ fontSize: "12px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: "600" }}>Units Sold Today</div>
            <div style={{ fontSize: "28px", fontWeight: "800", color: "#ffffff", marginTop: "6px" }}>{data.totalUnitsSold} <span style={{ fontSize: "14px", color: "#64748b" }}>laptops</span></div>
            <div style={{ fontSize: "12px", color: "#10b981", marginTop: "6px" }}>All serials checked out</div>
          </div>

          <div style={{ background: "#111827", border: "1px solid #1f293d", borderRadius: "14px", padding: "20px" }}>
            <div style={{ fontSize: "12px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: "600" }}>Gross Revenue</div>
            <div style={{ fontSize: "28px", fontWeight: "800", color: "#38bdf8", marginTop: "6px" }}>{data.formattedGrossRevenue}</div>
            <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "6px" }}>Total retail invoices</div>
          </div>

          <div style={{ background: "#111827", border: "1px solid #1f293d", borderRadius: "14px", padding: "20px" }}>
            <div style={{ fontSize: "12px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: "600" }}>Total Cost (COGS + Parts)</div>
            <div style={{ fontSize: "28px", fontWeight: "800", color: "#f59e0b", marginTop: "6px" }}>
              {new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", minimumFractionDigits: 0 }).format((data.totalCostOfGoodsSoldCents + data.totalRefurbPartsCostCents) / 100)}
            </div>
            <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "6px" }}>Purchase {data.formattedCogs}</div>
          </div>

          <div style={{ background: "#111827", border: "1px solid #1f293d", borderRadius: "14px", padding: "20px" }}>
            <div style={{ fontSize: "12px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: "600" }}>Net Realized Profit</div>
            <div style={{ fontSize: "28px", fontWeight: "800", color: data.netRealizedProfitCents >= 0 ? "#10b981" : "#ef4444", marginTop: "6px" }}>
              {data.formattedNetProfit}
            </div>
            <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "6px" }}>After wholesale cost & parts</div>
          </div>
        </div>

        {/* Drawer Reconciliation & Tender Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "20px", marginBottom: "28px" }}>
          {/* Drawer Reconciliation Box */}
          <div style={{ background: "#111827", border: "1px solid #1f293d", borderRadius: "14px", padding: "24px" }}>
            <h3 style={{ fontSize: "18px", fontWeight: "700", color: "#ffffff", margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: "8px" }}>
              💵 Cash Drawer Settlement Audit
            </h3>
            <p style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "18px" }}>
              Count the physical currency notes in the cash drawer at day end and enter below to detect any cashier variance.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", background: "#0a0e17", borderRadius: "8px" }}>
                <span style={{ fontSize: "13px", color: "#94a3b8" }}>Gross Cash Collections:</span>
                <span style={{ fontSize: "14px", fontWeight: "600", color: "#ffffff" }}>{data.formattedCash}</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", background: "#0a0e17", borderRadius: "8px" }}>
                <span style={{ fontSize: "13px", color: "#f87171" }}>Less Petty Cash Paid Out:</span>
                <span style={{ fontSize: "14px", fontWeight: "600", color: "#ef4444" }}>- {data.formattedPettyCashOut || "Rs. 0"}</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }}>
                <span style={{ fontSize: "14px", fontWeight: "700", color: "#ffffff" }}>Expected Cash in Drawer:</span>
                <span style={{ fontSize: "17px", fontWeight: "800", color: "#10b981" }}>{data.formattedExpectedDrawerCash || data.formattedCash}</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#0a0e17", borderRadius: "8px" }}>
                <span style={{ fontSize: "14px", color: "#cbd5e1" }}>Actual Physical Count:</span>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "13px", color: "#94a3b8" }}>LKR</span>
                  <input
                    type="number"
                    placeholder="Enter counted LKR"
                    value={actualCashInput}
                    onChange={(e) => setActualCashInput(e.target.value)}
                    style={{
                      background: "#1f293d",
                      border: "1px solid #334155",
                      borderRadius: "6px",
                      color: "#ffffff",
                      padding: "6px 10px",
                      fontSize: "15px",
                      fontWeight: "700",
                      width: "140px",
                      textAlign: "right",
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              {actualCashCents !== null && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 14px",
                    background: varianceCents === 0 ? "#064e3b33" : varianceCents! > 0 ? "#1e3a5f33" : "#7f1d1d33",
                    border: `1px solid ${varianceCents === 0 ? "#10b981" : varianceCents! > 0 ? "#38bdf8" : "#ef4444"}`,
                    borderRadius: "8px",
                  }}
                >
                  <span style={{ fontSize: "14px", fontWeight: "600", color: "#ffffff" }}>
                    {varianceCents === 0 ? "✅ Drawer Balanced (Zero Variance)" : varianceCents! > 0 ? "Drawer Over / Surplus" : "Drawer Short / Deficit"}
                  </span>
                  <span
                    style={{
                      fontSize: "16px",
                      fontWeight: "800",
                      color: varianceCents === 0 ? "#10b981" : varianceCents! > 0 ? "#38bdf8" : "#ef4444",
                    }}
                  >
                    {new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", minimumFractionDigits: 0 }).format(Math.abs(varianceCents!) / 100)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Tender Breakdown Card */}
          <div style={{ background: "#111827", border: "1px solid #1f293d", borderRadius: "14px", padding: "24px" }}>
            <h3 style={{ fontSize: "18px", fontWeight: "700", color: "#ffffff", margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: "8px" }}>
              💳 Tender Breakdown
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#0a0e17", borderRadius: "8px" }}>
                <span style={{ color: "#94a3b8", fontSize: "14px" }}>Cash Collections:</span>
                <strong style={{ color: "#10b981", fontSize: "15px" }}>{data.formattedCash}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#0a0e17", borderRadius: "8px" }}>
                <span style={{ color: "#94a3b8", fontSize: "14px" }}>Card Swipes / POS:</span>
                <strong style={{ color: "#38bdf8", fontSize: "15px" }}>{data.formattedCard}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#0a0e17", borderRadius: "8px" }}>
                <span style={{ color: "#94a3b8", fontSize: "14px" }}>Direct Bank Transfers:</span>
                <strong style={{ color: "#a855f7", fontSize: "15px" }}>{data.formattedBankTransfer}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#0a0e17", borderRadius: "8px" }}>
                <span style={{ color: "#94a3b8", fontSize: "14px" }}>Installments / BNPL:</span>
                <strong style={{ color: "#f59e0b", fontSize: "15px" }}>{data.formattedInstallment}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Petty Cash Outflows List */}
        {data.pettyCashExpenses && data.pettyCashExpenses.length > 0 && (
          <div style={{ background: "#111827", border: "1px solid #1f293d", borderRadius: "14px", padding: "24px", marginBottom: "28px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: "700", color: "#ffffff", margin: 0 }}>
                  💸 Petty Cash & Till Outflows ({data.pettyCashExpenses.length})
                </h3>
                <p style={{ color: "#94a3b8", fontSize: "13px", margin: "4px 0 0 0" }}>
                  Expenses deducted from counter cash on {data.dateIso}
                </p>
              </div>
              <div style={{ fontSize: "16px", fontWeight: "700", color: "#ef4444" }}>
                Total Outflow: - {data.formattedPettyCashOut}
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8" }}>
                    <th style={{ padding: "8px 12px" }}>Voucher #</th>
                    <th style={{ padding: "8px 12px" }}>Category</th>
                    <th style={{ padding: "8px 12px" }}>Description</th>
                    <th style={{ padding: "8px 12px" }}>Paid To</th>
                    <th style={{ padding: "8px 12px" }}>Recorded By</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>Amount</th>
                    <th style={{ padding: "8px 12px", textAlign: "center" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pettyCashExpenses.map((exp) => (
                    <tr key={exp.id} style={{ borderBottom: "1px solid #1f293d" }}>
                      <td style={{ padding: "10px 12px", fontWeight: "600", color: "#38bdf8" }}>{exp.receiptVoucherRef}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ background: "#1e293b", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", color: "#f8fafc" }}>
                          {exp.category}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#cbd5e1" }}>{exp.description}</td>
                      <td style={{ padding: "10px 12px", color: "#94a3b8" }}>{exp.paidTo}</td>
                      <td style={{ padding: "10px 12px", color: "#94a3b8" }}>{exp.recordedBy}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: "700", color: "#ef4444" }}>- {exp.formattedAmount}</td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(exp.id)}
                          style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontSize: "13px" }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Itemized Sold Laptops Table */}
        <div style={{ background: "#111827", border: "1px solid #1f293d", borderRadius: "14px", padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h3 style={{ fontSize: "18px", fontWeight: "700", color: "#ffffff", margin: 0 }}>
                📋 Itemized Sales Log ({data.sales.length})
              </h3>
              <p style={{ color: "#94a3b8", fontSize: "13px", margin: "4px 0 0 0" }}>
                Every device sold on {data.dateIso} with tender method and invoice reference
              </p>
            </div>
          </div>

          {data.sales.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
              No laptop sales recorded on {data.dateIso}. Pick another date above.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8" }}>
                    <th style={{ padding: "10px 12px" }}>Invoice #</th>
                    <th style={{ padding: "10px 12px" }}>Laptop Model & Serial</th>
                    <th style={{ padding: "10px 12px" }}>Customer</th>
                    <th style={{ padding: "10px 12px" }}>Payment Method</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Sale Price</th>
                    <th style={{ padding: "10px 12px", textAlign: "center" }}>Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sales.map((sale) => (
                    <tr key={sale.invoiceReference} style={{ borderBottom: "1px solid #1f293d" }}>
                      <td style={{ padding: "12px", fontWeight: "700", color: "#38bdf8" }}>
                        {sale.invoiceReference}
                      </td>
                      <td style={{ padding: "12px" }}>
                        <div style={{ fontWeight: "600", color: "#ffffff" }}>{sale.deviceName}</div>
                        <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                          <code>{sale.serial}</code>
                        </div>
                      </td>
                      <td style={{ padding: "12px" }}>
                        <div style={{ color: "#cbd5e1" }}>{sale.customerName}</div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>{sale.customerPhone}</div>
                      </td>
                      <td style={{ padding: "12px" }}>
                        <span
                          style={{
                            background: "#1e293b",
                            color: sale.paymentMethod === "Cash" ? "#10b981" : "#38bdf8",
                            padding: "4px 8px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: "600",
                          }}
                        >
                          {sale.paymentMethod}
                        </span>
                        {sale.paymentReference && (
                          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>Ref: {sale.paymentReference}</div>
                        )}
                      </td>
                      <td style={{ padding: "12px", textAlign: "right", fontWeight: "700", color: "#ffffff", fontSize: "14px" }}>
                        {sale.formattedPrice}
                      </td>
                      <td style={{ padding: "12px", textAlign: "center" }}>
                        <a
                          href={`/receipt/${sale.invoiceReference}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: "#10b981",
                            textDecoration: "none",
                            fontSize: "12px",
                            background: "#064e3b33",
                            padding: "4px 8px",
                            borderRadius: "6px",
                            border: "1px solid #10b98144",
                          }}
                        >
                          80mm Slip
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
