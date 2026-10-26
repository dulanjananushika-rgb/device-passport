"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { DeviceRecord } from "../data/devices";
import { QrCode } from "./QrCode";
import type { FollowUpCustomerItem } from "../../lib/sales";

type SalesPanelProps = {
  devices: DeviceRecord[];
  canActivate: boolean;
  warrantyMonths: number;
  onDeviceChange: (device: DeviceRecord) => void;
  onAuditChange: () => Promise<void>;
  selectedDeviceId?: string;
};

type ActivationForm = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  invoiceReference: string;
  soldAt: string;
  salePriceLkr: string;
  paymentMethod: "Cash" | "Card" | "Bank Transfer" | "Installment" | "Split";
  cashReceivedLkr: string;
  cardAmountLkr: string;
  bankTransferLkr: string;
  installmentLkr: string;
  paymentReference: string;
  upgradePartIds: string[];
  motherboardMonths: number;
  batteryMonths: number;
  screenMonths: number;
  bundledAccessories: string[];
  deliveryMethod: "In-Store Pickup" | "Courier COD";
  courierName: string;
  courierWaybill: string;
  discountLkr: string;
  discountReason: string;
};

export function SalesPanel({ devices, canActivate, warrantyMonths, onDeviceChange, onAuditChange, selectedDeviceId }: SalesPanelProps) {
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(() => devices.find((device) => device.lifecycleStatus === "Ready")?.id ?? devices[0]?.id ?? "");
  const [form, setForm] = useState<ActivationForm>(() => emptyActivation(today));

  // Auto-select when a barcode scanner fires anywhere on dashboard
  useEffect(() => {
    if (selectedDeviceId && devices.some((d) => d.id === selectedDeviceId)) {
      setSelectedId(selectedDeviceId);
    }
  }, [selectedDeviceId, devices]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [justActivated, setJustActivated] = useState(false);
  const [availableUpgrades, setAvailableUpgrades] = useState<Array<{ id: string; name: string; category: string; formattedCost: string }>>([]);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [reserveForm, setReserveForm] = useState({ advanceLkr: "5000", heldDays: 3, paymentMethod: "Cash", notes: "" });
  const [activeReservation, setActiveReservation] = useState<any>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [sequencesOpen, setSequencesOpen] = useState(false);
  const [sequences, setSequences] = useState<FollowUpCustomerItem[]>([]);
  const [loadingSequences, setLoadingSequences] = useState(false);

  async function loadSequences() {
    setLoadingSequences(true);
    try {
      const res = await fetch("/api/marketing/sequences");
      if (res.ok) {
        const data = await res.json();
        setSequences(data.sequences || []);
      }
    } catch {}
    finally {
      setLoadingSequences(false);
    }
  }

  async function dispatchSequence(item: FollowUpCustomerItem) {
    window.open(item.whatsappUrl, "_blank");
    try {
      await fetch("/api/marketing/sequences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId: item.deviceId,
          sequenceType: item.sequenceType,
          customerPhone: item.customerPhone,
          messageText: item.messageText,
        }),
      });
      setSequences((curr) => curr.filter((s) => !(s.deviceId === item.deviceId && s.sequenceType === item.sequenceType)));
    } catch {}
  }
  const [returnForm, setReturnForm] = useState({ returnType: "Exchange" as "Exchange" | "Refund", replacementDeviceId: "", reason: "" });

  useState(() => {
    fetch("/api/parts/upgrades")
      .then((r) => r.json())
      .then((d) => { if (d.upgrades) setAvailableUpgrades(d.upgrades); })
      .catch(() => {});
  });

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return devices;
    return devices.filter((device) => [
      device.name,
      device.id,
      device.serial,
      device.model,
      device.lifecycleStatus,
      device.sale?.customerName,
      device.sale?.customerEmail,
      device.sale?.customerPhone,
      device.sale?.invoiceReference,
    ].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [devices, query]);

  const selected = devices.find((device) => device.id === selectedId) ?? filtered[0] ?? devices[0];
  const readyCount = devices.filter((device) => device.lifecycleStatus === "Ready").length;
  const soldDevices = devices.filter((device) => device.sale);
  const todayTime = Date.parse(today);
  const expiringSoon = soldDevices.filter((device) => {
    const expiry = Date.parse(device.sale?.warrantyEnds ?? "");
    const days = (expiry - todayTime) / 86_400_000;
    return days >= 0 && days <= 30;
  }).length;
  const monthPrefix = today.slice(0, 7);
  const thisMonth = soldDevices.filter((device) => device.sale?.soldAt.startsWith(monthPrefix)).length;

  function chooseDevice(device: DeviceRecord) {
    setSelectedId(device.id);
    setJustActivated(false);
    setError("");
    if (!device.sale) setForm(emptyActivation(today));
    fetch(`/api/reservations?status=Active`)
      .then((r) => r.json())
      .then((d) => {
        const found = d.reservations?.find((res: any) => res.deviceId === device.id);
        setActiveReservation(found || null);
      })
      .catch(() => {});
  }

  function change(key: keyof ActivationForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submitReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deviceId: selected.id,
          customerName: form.customerName || "Customer Reservation",
          customerPhone: form.customerPhone || "0770000000",
          customerEmail: form.customerEmail,
          advanceLkr: reserveForm.advanceLkr,
          heldDays: Number(reserveForm.heldDays),
          paymentMethod: reserveForm.paymentMethod,
          notes: reserveForm.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reservation failed");
      setActiveReservation(data.reservation);
      setReserveOpen(false);
      await onAuditChange();
      window.open(`/api/reservations/${data.reservation.id}/receipt`, "_blank", "width=420,height=600");
    } catch (err: any) {
      setError(err.message || "Failed to reserve device");
    } finally {
      setSaving(false);
    }
  }

  async function submitReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/returns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          originalDeviceId: selected.id,
          returnType: returnForm.returnType,
          replacementDeviceId: returnForm.replacementDeviceId || undefined,
          reason: returnForm.reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Return failed");
      setReturnOpen(false);
      await onAuditChange();
      window.location.reload();
    } catch (err: any) {
      setError(err.message || "Failed to process return");
    } finally {
      setSaving(false);
    }
  }

  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    if (!form.customerEmail.trim() && !form.customerPhone.trim()) {
      setError("Enter an email address or phone number for the buyer.");
      return;
    }
    setSaving(true);
    setError("");
    const response = await fetch(`/api/devices/${encodeURIComponent(selected.id)}/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...form,
        warrantyBreakdown: {
          motherboardMonths: Number(form.motherboardMonths),
          batteryMonths: Number(form.batteryMonths),
          screenMonths: Number(form.screenMonths),
        },
      }),
    });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    if (!response.ok) {
      setError(result.error ?? "The sale could not be activated.");
      setSaving(false);
      return;
    }
    onDeviceChange(result.device as DeviceRecord);
    setJustActivated(true);
    setSaving(false);
    await onAuditChange();
  }

  return (
    <section className="page-section sales-page">
      <div className="section-head">
        <div>
          <div className="eyebrow">Customer handover</div>
          <h2>Sales and warranty activation</h2>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="button secondary"
            style={{ fontSize: '13px' }}
            onClick={() => {
              setSequencesOpen((prev) => !prev);
              if (!sequencesOpen) loadSequences();
            }}
          >
            💬 Proactive WhatsApp Care {sequences.length > 0 && <span style={{ background: '#0284c7', color: '#fff', padding: '1px 6px', borderRadius: '10px', fontSize: '11px', marginLeft: '4px' }}>{sequences.length}</span>}
          </button>
          <a href="/settlement" target="_blank" rel="noreferrer" className="button secondary" style={{ fontSize: '13px', textDecoration: 'none' }}>
            📊 Day-End Z-Report
          </a>
        </div>
        <input className="search sale-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search phone, serial, invoice or passport" aria-label="Search sales and customers" />
      </div>

      {sequencesOpen && (
        <section className="panel" style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '14px', padding: '24px', marginBottom: '24px' }}>
          <div className="panel-head" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>💬</span>
                <h3 className="panel-title" style={{ fontSize: '18px', fontWeight: '700', color: '#f8fafc' }}>
                  Proactive WhatsApp Customer Care Sequences
                </h3>
              </div>
              <p className="panel-subtitle" style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>
                Proactive customer retention: Day 7 (Satisfaction check-in), Day 30 (Battery care pro-tip), and Day 150 (Warranty expiring in 15 days).
              </p>
            </div>
            <button
              type="button"
              className="button secondary small"
              onClick={loadSequences}
              disabled={loadingSequences}
            >
              {loadingSequences ? "Checking..." : "Check Eligible Customers"}
            </button>
          </div>

          {sequences.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
              {sequences.map((seq) => {
                const badgeColor =
                  seq.sequenceType === "Day 7 Satisfaction"
                    ? "#10b981"
                    : seq.sequenceType === "Day 30 Battery Care"
                    ? "#38bdf8"
                    : "#f59e0b";
                return (
                  <div key={`${seq.deviceId}-${seq.sequenceType}`} style={{ background: '#1e293b', border: `1px solid ${badgeColor}44`, borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', padding: '2px 8px', borderRadius: '4px', background: `${badgeColor}22`, color: badgeColor }}>
                          {seq.sequenceType}
                        </span>
                        <small style={{ color: '#94a3b8' }}>
                          {seq.daysSinceSale}d since sale
                        </small>
                      </div>
                      <div style={{ fontWeight: '600', color: '#f8fafc', fontSize: '14px' }}>{seq.customerName}</div>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>
                        {seq.customerPhone} &bull; {seq.deviceName} (Inv: {seq.invoiceReference})
                      </div>
                      <div style={{ background: '#0f172a', padding: '10px', borderRadius: '6px', fontSize: '12px', color: '#cbd5e1', fontStyle: 'italic', border: '1px solid #334155', marginBottom: '12px', lineHeight: '1.4' }}>
                        &ldquo;{seq.messageText}&rdquo;
                      </div>
                    </div>
                    <button
                      type="button"
                      className="button primary small"
                      style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}
                      onClick={() => dispatchSequence(seq)}
                    >
                      <span>💬 Open WhatsApp & Mark Sent</span>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px', color: '#64748b', fontSize: '13px' }}>
              {loadingSequences ? "Scanning sold devices..." : "✨ No customer follow-ups pending right now! All Day 7, Day 30, and Day 150 milestones are up to date."}
            </div>
          )}
        </section>
      )}

      <section className="stats" aria-label="Sales summary">
        <SaleStat label="Ready to sell" value={readyCount} note="Verified stock" />
        <SaleStat label="Activated" value={soldDevices.length} note="Customer handovers" />
        <SaleStat label="Expiring in 30 days" value={expiringSoon} note={expiringSoon ? "Follow up" : "Clear"} />
        <SaleStat label="Sold this month" value={thisMonth} note={monthPrefix} />
      </section>

      <div className="sales-workspace">
        <section className="panel sale-inventory">
          <div className="panel-head"><div><h3 className="panel-title">Device lifecycle</h3><p className="panel-subtitle">Draft → Ready → Sold</p></div><span className="sale-result-count">{filtered.length} results</span></div>
          <div className="sale-device-list">
            {filtered.length ? filtered.map((device) => (
              <button type="button" className={`sale-device ${selected?.id === device.id ? "selected" : ""}`} key={device.id} onClick={() => chooseDevice(device)}>
                <span className={`lifecycle-dot lifecycle-${device.lifecycleStatus.toLowerCase()}`} />
                <span className="sale-device-copy"><strong>{device.name}</strong><small>{device.id} · {device.serial}</small>{device.sale && <span>{device.sale.customerName} · {device.sale.invoiceReference}</span>}</span>
                <span className={`lifecycle-pill lifecycle-${device.lifecycleStatus.toLowerCase()}`}>{device.lifecycleStatus}</span>
              </button>
            )) : <div className="empty-state">No devices or customers match &quot;{query}&quot;.</div>}
          </div>
        </section>

        <aside className="panel activation-panel">
          {!selected ? (
            <div className="activation-empty"><span>↗</span><h3>Select a device</h3><p>Choose verified stock to activate its customer warranty.</p></div>
          ) : selected.sale ? (
            <HandoverCard device={selected} highlighted={justActivated} />
          ) : selected.lifecycleStatus === "Ready" && canActivate ? (
            <form className="activation-form" onSubmit={activate}>
              <div className="activation-heading"><div><span className="eyebrow">Ready to sell</span><h3>Activate customer warranty</h3></div><span className="grade-badge">{selected.grade}</span></div>
              <div className="activation-device-summary"><strong>{selected.name}</strong><span>{selected.id} · Serial {selected.serial}</span><small>{selected.score}/100 health · {warrantyMonths}-month warranty</small></div>
              <div className="activation-fields">
                <label>Buyer name<input required minLength={2} maxLength={100} value={form.customerName} onChange={(event) => change("customerName", event.target.value)} placeholder="Customer full name" /></label>
                <label>Invoice reference<input required minLength={2} maxLength={80} value={form.invoiceReference} onChange={(event) => change("invoiceReference", event.target.value)} placeholder="INV-2026-001" /></label>
                <label>Email address<input type="email" value={form.customerEmail} onChange={(event) => change("customerEmail", event.target.value)} placeholder="buyer@example.com" /></label>
                <label>Phone number<input type="tel" maxLength={30} value={form.customerPhone} onChange={(event) => change("customerPhone", event.target.value)} placeholder="+94 77 123 4567" /></label>
                <label>Sale price (LKR)<input type="number" min="0.01" max="100000000" step="0.01" inputMode="decimal" required value={form.salePriceLkr} onChange={(event) => change("salePriceLkr", event.target.value)} placeholder="185000" /></label>
                <label>Sale date<input type="date" max={today} required value={form.soldAt} onChange={(event) => change("soldAt", event.target.value)} /></label>

                {/* Batch A: Component Warranty Breakdown */}
                <div style={{ gridColumn: 'span 2', background: '#0a0e17', padding: '12px 14px', borderRadius: '8px', border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#38bdf8', marginBottom: '8px' }}>🛡️ Component-Wise Warranty Fine-Print:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    <label style={{ fontSize: '11px' }}>Motherboard (Mo)
                      <input type="number" min="1" max="36" value={form.motherboardMonths} onChange={(e) => setForm((c) => ({ ...c, motherboardMonths: Number(e.target.value) }))} />
                    </label>
                    <label style={{ fontSize: '11px' }}>Battery & Adapter (Mo)
                      <input type="number" min="1" max="12" value={form.batteryMonths} onChange={(e) => setForm((c) => ({ ...c, batteryMonths: Number(e.target.value) }))} />
                    </label>
                    <label style={{ fontSize: '11px' }}>Screen Panel (Mo)
                      <input type="number" min="1" max="12" value={form.screenMonths} onChange={(e) => setForm((c) => ({ ...c, screenMonths: Number(e.target.value) }))} />
                    </label>
                  </div>
                </div>

                {/* Batch A: Bundled Accessories Checklist */}
                <div style={{ gridColumn: 'span 2', background: '#0a0e17', padding: '12px 14px', borderRadius: '8px', border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#10b981', marginBottom: '8px' }}>🎒 Bundled Accessories & Free Gifts:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {["Original 65W AC Adapter", "Power Cable", "Laptop Backpack / Sleeve", "Wireless / Optical Mouse", "Genuine OS & Utilities"].map((acc) => {
                      const isChecked = form.bundledAccessories.includes(acc);
                      return (
                        <label key={acc} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', background: isChecked ? '#064e3b44' : '#1e293b', border: `1px solid ${isChecked ? '#10b981' : '#334155'}`, padding: '4px 8px', borderRadius: '6px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...form.bundledAccessories, acc]
                                : form.bundledAccessories.filter((a) => a !== acc);
                              setForm((c) => ({ ...c, bundledAccessories: next }));
                            }}
                          />
                          <span>{acc}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Global Fulfillment Mode & Courier */}
                <label>Fulfillment Mode
                  <select value={form.deliveryMethod} onChange={(e) => change("deliveryMethod", e.target.value)}>
                    <option value="In-Store Pickup">In-Store Counter Pickup</option>
                    <option value="Express Shipping">Express Courier (FedEx, UPS, DHL, Royal Mail)</option>
                    <option value="Courier COD">Doorstep Delivery (C.O.D.)</option>
                  </select>
                </label>

                {form.deliveryMethod !== "In-Store Pickup" ? (
                  <label>Carrier / Courier Service
                    <input list="carriers-list" value={form.courierName} onChange={(e) => change("courierName", e.target.value)} placeholder="e.g. FedEx / UPS / DHL" />
                    <datalist id="carriers-list">
                      <option value="FedEx" />
                      <option value="UPS" />
                      <option value="DHL" />
                      <option value="USPS" />
                      <option value="Royal Mail" />
                      <option value="DPD" />
                      <option value="Australia Post" />
                      <option value="Domex" />
                    </datalist>
                  </label>
                ) : (
                  <label>Discount Amount
                    <input type="number" step="0.01" value={form.discountLkr} onChange={(e) => change("discountLkr", e.target.value)} placeholder="e.g. 50.00" />
                  </label>
                )}

                {form.deliveryMethod !== "In-Store Pickup" && (
                  <label style={{ gridColumn: 'span 2' }}>Tracking # / Waybill
                    <input value={form.courierWaybill} onChange={(e) => change("courierWaybill", e.target.value)} placeholder="e.g. 794829381023" />
                  </label>
                )}
                <label>Payment Method
                  <select value={form.paymentMethod} onChange={(event) => change("paymentMethod", event.target.value)}>
                    <option value="Cash">Cash (Physical Drawer)</option>
                    <option value="Card">Credit / Debit Card (Stripe, Square, POS)</option>
                    <option value="Bank Transfer">Bank Wire / ACH / SEPA Transfer</option>
                    <option value="Installment">Installment / BNPL (Klarna, Affirm, Afterpay)</option>
                    <option value="Split">Split Payment (Multiple Methods)</option>
                  </select>
                </label>
                {(form.paymentMethod === "Card" || form.paymentMethod === "Bank Transfer" || form.paymentMethod === "Installment") && (
                  <label>Slip / Payment Ref
                    <input value={form.paymentReference} onChange={(event) => change("paymentReference", event.target.value)} placeholder="Card Approval code or Bank Ref #" />
                  </label>
                )}
                {form.paymentMethod === "Split" && (
                  <div style={{ gridColumn: 'span 2', background: '#0f172a', padding: '12px', borderRadius: '8px', border: '1px solid #334155' }}>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#38bdf8', marginBottom: '8px' }}>Split Payment Distribution (Sum must match Sale Price):</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <label style={{ fontSize: '12px' }}>Cash Amount (LKR)
                        <input type="number" step="0.01" value={form.cashReceivedLkr} onChange={(e) => change("cashReceivedLkr", e.target.value)} placeholder="0.00" />
                      </label>
                      <label style={{ fontSize: '12px' }}>Card Amount (LKR)
                        <input type="number" step="0.01" value={form.cardAmountLkr} onChange={(e) => change("cardAmountLkr", e.target.value)} placeholder="0.00" />
                      </label>
                      <label style={{ fontSize: '12px' }}>Bank Transfer (LKR)
                        <input type="number" step="0.01" value={form.bankTransferLkr} onChange={(e) => change("bankTransferLkr", e.target.value)} placeholder="0.00" />
                      </label>
                      <label style={{ fontSize: '12px' }}>Installment (LKR)
                        <input type="number" step="0.01" value={form.installmentLkr} onChange={(e) => change("installmentLkr", e.target.value)} placeholder="0.00" />
                      </label>
                    </div>
                  </div>
                )}
                {availableUpgrades.length > 0 && (
                  <div style={{ gridColumn: 'span 2', background: '#0a0e17', padding: '10px 14px', borderRadius: '8px', border: '1px solid #1e293b' }}>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#10b981', marginBottom: '6px' }}>POS Hardware Upgrades at Handover (RAM / SSD):</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      {availableUpgrades.slice(0, 6).map((up) => {
                        const isChecked = form.upgradePartIds.includes(up.id);
                        return (
                          <label key={up.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', background: isChecked ? '#064e3b44' : '#1e293b', border: `1px solid ${isChecked ? '#10b981' : '#334155'}`, padding: '4px 8px', borderRadius: '6px' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const nextIds = e.target.checked
                                  ? [...form.upgradePartIds, up.id]
                                  : form.upgradePartIds.filter((id) => id !== up.id);
                                setForm((curr) => ({ ...curr, upgradePartIds: nextIds }));
                              }}
                            />
                            <span>{up.name} ({up.formattedCost})</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div className="activation-note"><strong>Warranty starts on the sale date.</strong><span>The customer receives a secure QR warranty card and claim link.</span></div>
              {error && <div className="error-box" role="alert">{error}</div>}
              <button className="button primary" type="submit" disabled={saving}>{saving ? "Activating warranty…" : "Activate sale & warranty"}</button>
            </form>
          ) : (
            <div className="activation-empty review-needed"><span>!</span><h3>Review required</h3><p>{canActivate ? "Resolve the hardware review before selling this device." : "This device is not ready for customer handover."}</p><a className="button secondary small" href={`/passport/${selected.id}`} target="_blank" rel="noreferrer">Open passport</a></div>
          )}
        </aside>
      </div>

      {soldDevices.length > 0 && (
        <section className="panel recent-handovers">
          <div className="panel-head"><div><h3 className="panel-title">Recent customer handovers</h3><p className="panel-subtitle">Warranty expiry alerts and secure cards</p></div></div>
          <div className="handover-table-wrap"><table className="handover-table"><thead><tr><th>Customer</th><th>Device</th><th>Invoice</th><th>Warranty ends</th><th>Card</th></tr></thead><tbody>{soldDevices.slice(0, 8).map((device) => <tr key={device.id}><td><strong>{device.sale?.customerName}</strong><span>{device.sale?.customerPhone || device.sale?.customerEmail || "Legacy record"}</span></td><td><strong>{device.name}</strong><span>{device.id}</span></td><td>{device.sale?.invoiceReference}</td><td>{formatSaleDate(device.sale?.warrantyEnds ?? "")}</td><td><a className="button secondary small" href={`/warranty/${device.sale?.handoverToken}`} target="_blank" rel="noreferrer">Open</a></td></tr>)}</tbody></table></div>
        </section>
      )}
    </section>
  );
}

function HandoverCard({ device, highlighted }: { device: DeviceRecord; highlighted: boolean }) {
  const sale = device.sale;
  if (!sale) return null;
  const path = `/warranty/${sale.handoverToken}`;
  return <div className="handover-card"><div className={`handover-success ${highlighted ? "highlighted" : ""}`}><span>✓</span><div><strong>{highlighted ? "Sale activated" : "Customer warranty"}</strong><small>{sale.invoiceReference}</small></div></div><div className="handover-customer"><span>Prepared for</span><h3>{sale.customerName}</h3><p>{device.name}<br />{device.id}</p></div><div className="handover-warranty"><div><span>Starts</span><strong>{formatSaleDate(sale.warrantyStarts)}</strong></div><div><span>Ends</span><strong>{formatSaleDate(sale.warrantyEnds)}</strong></div></div><div className="handover-qr"><QrCode path={path} label={`Warranty card QR for ${device.name}`} /><p>Customer can scan this private QR to reopen the warranty card and start a claim.</p></div><div className="handover-actions"><a className="button primary" href={path} target="_blank" rel="noreferrer">Open warranty card</a><a className="button secondary" href={`/passport/${device.id}`} target="_blank" rel="noreferrer">View passport</a><a className="button secondary small" href={`/receipt/${device.id}`} target="_blank" rel="noreferrer">🖨️ 80mm Receipt</a><a className="button secondary small" href={`/invoice/${device.id}`} target="_blank" rel="noreferrer">📄 A4 Invoice</a><a className="button secondary small" href={`/social-card/${device.id}`} target="_blank" rel="noreferrer">🎨 Social Card</a><a className="button secondary small" href={`/sticker/${device.id}`} target="_blank" rel="noreferrer">🏷️ Price Sticker</a><button className="button secondary small" type="button" onClick={() => shareWarranty(path, device.name, sale.customerEmail, "email")}>Email link</button><button className="button secondary small" type="button" onClick={() => shareWarranty(path, device.name, sale.customerEmail, "whatsapp")}>WhatsApp</button></div></div>;
}

function SaleStat({ label, value, note }: { label: string; value: number; note: string }) {
  return <div className="stat-card"><div className="stat-top"><span className="stat-label">{label}</span><span className="stat-indicator">{note}</span></div><div className="stat-value">{value}</div></div>;
}

function emptyActivation(today: string): ActivationForm {
  return {
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    invoiceReference: "",
    soldAt: today,
    salePriceLkr: "",
    paymentMethod: "Cash",
    cashReceivedLkr: "",
    cardAmountLkr: "",
    bankTransferLkr: "",
    installmentLkr: "",
    paymentReference: "",
    upgradePartIds: [],
    motherboardMonths: 6,
    batteryMonths: 1,
    screenMonths: 3,
    bundledAccessories: ["Original AC Power Adapter", "Power Cable", "Laptop Backpack / Sleeve", "Optical Mouse"],
    deliveryMethod: "In-Store Pickup",
    courierName: "Prompt Xpress",
    courierWaybill: "",
    discountLkr: "",
    discountReason: "",
  };
}

function formatSaleDate(value: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "UTC" });
}

function shareWarranty(path: string, deviceName: string, customerEmail: string, channel: "email" | "whatsapp") {
  const url = new URL(path, window.location.origin).toString();
  const message = `Your digital warranty for ${deviceName}: ${url}`;
  if (channel === "whatsapp") {
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.href = `mailto:${encodeURIComponent(customerEmail)}?subject=${encodeURIComponent(`Digital warranty for ${deviceName}`)}&body=${encodeURIComponent(message)}`;
}
