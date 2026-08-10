"use client";

import { FormEvent, useMemo, useState } from "react";
import type { DeviceRecord } from "../data/devices";
import { QrCode } from "./QrCode";

type SalesPanelProps = {
  devices: DeviceRecord[];
  canActivate: boolean;
  warrantyMonths: number;
  onDeviceChange: (device: DeviceRecord) => void;
  onAuditChange: () => Promise<void>;
};

type ActivationForm = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  invoiceReference: string;
  soldAt: string;
};

export function SalesPanel({ devices, canActivate, warrantyMonths, onDeviceChange, onAuditChange }: SalesPanelProps) {
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(() => devices.find((device) => device.lifecycleStatus === "Ready")?.id ?? devices[0]?.id ?? "");
  const [form, setForm] = useState<ActivationForm>(() => emptyActivation(today));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [justActivated, setJustActivated] = useState(false);

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
  }

  function change(key: keyof ActivationForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
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
      body: JSON.stringify(form),
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
        <div><div className="eyebrow">Customer handover</div><h2>Sales and warranty activation</h2></div>
        <input className="search sale-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search phone, serial, invoice or passport" aria-label="Search sales and customers" />
      </div>

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
                <label className="full-field">Sale date<input type="date" max={today} required value={form.soldAt} onChange={(event) => change("soldAt", event.target.value)} /></label>
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
  return <div className="handover-card"><div className={`handover-success ${highlighted ? "highlighted" : ""}`}><span>✓</span><div><strong>{highlighted ? "Sale activated" : "Customer warranty"}</strong><small>{sale.invoiceReference}</small></div></div><div className="handover-customer"><span>Prepared for</span><h3>{sale.customerName}</h3><p>{device.name}<br />{device.id}</p></div><div className="handover-warranty"><div><span>Starts</span><strong>{formatSaleDate(sale.warrantyStarts)}</strong></div><div><span>Ends</span><strong>{formatSaleDate(sale.warrantyEnds)}</strong></div></div><div className="handover-qr"><QrCode path={path} label={`Warranty card QR for ${device.name}`} /><p>Customer can scan this private QR to reopen the warranty card and start a claim.</p></div><div className="handover-actions"><a className="button primary" href={path} target="_blank" rel="noreferrer">Open warranty card</a><a className="button secondary" href={`/passport/${device.id}`} target="_blank" rel="noreferrer">View passport</a><button className="button secondary small" type="button" onClick={() => shareWarranty(path, device.name, sale.customerEmail, "email")}>Email link</button><button className="button secondary small" type="button" onClick={() => shareWarranty(path, device.name, sale.customerEmail, "whatsapp")}>WhatsApp</button></div></div>;
}

function SaleStat({ label, value, note }: { label: string; value: number; note: string }) {
  return <div className="stat-card"><div className="stat-top"><span className="stat-label">{label}</span><span className="stat-indicator">{note}</span></div><div className="stat-value">{value}</div></div>;
}

function emptyActivation(today: string): ActivationForm {
  return { customerName: "", customerEmail: "", customerPhone: "", invoiceReference: "", soldAt: today };
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
