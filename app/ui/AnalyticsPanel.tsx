"use client";

import { useCallback, useMemo, useState } from "react";
import type { DeviceFinanceItem, FinanceAnalytics } from "../../lib/finance";

type CostForm = { purchase: string; refurbishment: string };

export function AnalyticsPanel({ analytics, onAnalyticsChange, onAuditChange }: { analytics: FinanceAnalytics; onAnalyticsChange: (analytics: FinanceAnalytics) => void; onAuditChange: () => Promise<void> }) {
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState("");
  const [costForm, setCostForm] = useState<CostForm>({ purchase: "", refurbishment: "" });
  const [saving, setSaving] = useState(false);

  const loadAnalytics = useCallback(async () => {
    const response = await fetch("/api/analytics", { cache: "no-store" });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    if (!response.ok) {
      setError(result.error ?? "Analytics could not be loaded.");
      return;
    }
    setError("");
    onAnalyticsChange(result.analytics as FinanceAnalytics);
  }, [onAnalyticsChange]);

  const visibleDevices = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return analytics.devices;
    return analytics.devices.filter((device) => [device.deviceId, device.deviceName, device.model, device.serial, device.lifecycleStatus].join(" ").toLowerCase().includes(needle));
  }, [analytics, query]);

  function edit(device: DeviceFinanceItem) {
    setEditingId(device.deviceId);
    setCostForm({ purchase: fromCents(device.purchaseCostCents), refurbishment: fromCents(device.refurbishmentCostCents) });
    setError("");
  }

  async function saveCosts(deviceId: string) {
    setSaving(true);
    setError("");
    const response = await fetch(`/api/finance/devices/${encodeURIComponent(deviceId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ purchaseCostLkr: costForm.purchase || "0", refurbishmentCostLkr: costForm.refurbishment || "0" }),
    });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    if (!response.ok) {
      setError(result.error ?? "Device costs could not be saved.");
      setSaving(false);
      return;
    }
    setEditingId("");
    await Promise.all([loadAnalytics(), onAuditChange()]);
    setSaving(false);
  }

  const { metrics, completeness } = analytics;
  const maxChartValue = Math.max(1, ...analytics.monthly.map((month) => Math.max(month.revenueCents, Math.abs(month.grossProfitCents))));
  const bestDevices = analytics.devices.filter((device) => device.grossProfitCents !== null && device.salePriceCents > 0 && device.purchaseCostCents > 0).sort((a, b) => (b.grossProfitCents ?? 0) - (a.grossProfitCents ?? 0)).slice(0, 5);

  return (
    <section className="page-section analytics-page">
      <div className="section-head analytics-section-head">
        <div><div className="eyebrow">Owner-only · live ledger</div><h2>Profit & reliability analytics</h2><p>Know what sold well, what failed, and what actually made money.</p></div>
        <a className="button secondary" href="/api/analytics/export">Export CSV</a>
      </div>

      {(completeness.missingPurchaseCosts > 0 || completeness.missingSalePrices > 0) && (
        <div className="data-quality-banner" role="status"><span>!</span><div><strong>Complete the cost book for accurate profit</strong><p>{completeness.missingPurchaseCosts} purchase cost{completeness.missingPurchaseCosts === 1 ? "" : "s"} and {completeness.missingSalePrices} legacy sale price{completeness.missingSalePrices === 1 ? "" : "s"} are missing. Profit totals treat missing values as zero.</p></div><em>{completeness.completeSoldRecords}/{completeness.soldRecords} sold records complete</em></div>
      )}

      <section className="stats analytics-kpis" aria-label="Financial summary">
        <AnalyticsStat label="Sales revenue" value={money(metrics.revenueCents)} note={`${metrics.soldDevices} sold`} />
        <AnalyticsStat label="Gross profit" value={money(metrics.grossProfitCents)} note={`${percent(metrics.grossMargin)} margin`} tone={metrics.grossProfitCents < 0 ? "negative" : "positive"} />
        <AnalyticsStat label="Stock investment" value={money(metrics.inventoryInvestmentCents)} note="Unsold devices" />
        <AnalyticsStat label="Warranty cost" value={money(metrics.warrantyCostCents)} note={`${percent(metrics.claimRate)} claim rate`} tone={metrics.warrantyCostCents > 0 ? "warning" : undefined} />
      </section>

      <section className="analytics-scorecard" aria-label="Reliability scorecard">
        <ScoreItem label="Gross margin" value={percent(metrics.grossMargin)} hint="Revenue after device, refurb & warranty costs" />
        <ScoreItem label="Warranty claim rate" value={percent(metrics.claimRate)} hint="Sold devices with at least one claim" />
        <ScoreItem label="SLA met" value={metrics.completedClaims ? percent(metrics.slaMetRate) : "—"} hint={`${metrics.completedClaims} completed service jobs`} />
        <ScoreItem label="Avg. turnaround" value={metrics.averageTurnaroundDays === null ? "—" : `${metrics.averageTurnaroundDays.toFixed(1)}d`} hint="Claim received to completion" />
      </section>

      <div className="analytics-grid">
        <section className="panel analytics-chart-card">
          <div className="panel-head"><div><h3 className="panel-title">Six-month performance</h3><p className="panel-subtitle">Revenue and gross profit by sale month</p></div><span className="chart-legend"><i /> Revenue <i /> Profit</span></div>
          <div className="finance-chart">
            {analytics.monthly.map((month) => (
              <div className="finance-chart-month" key={month.month}>
                <div className="finance-chart-bars" title={`${month.label}: ${money(month.revenueCents)} revenue, ${money(month.grossProfitCents)} profit`}>
                  <span className="revenue-bar" style={{ height: `${Math.max(month.revenueCents ? 5 : 0, (month.revenueCents / maxChartValue) * 100)}%` }} />
                  <span className={`profit-bar ${month.grossProfitCents < 0 ? "negative" : ""}`} style={{ height: `${Math.max(month.grossProfitCents ? 5 : 0, (Math.abs(month.grossProfitCents) / maxChartValue) * 100)}%` }} />
                </div>
                <strong>{month.label}</strong><small>{month.sales} sale{month.sales === 1 ? "" : "s"}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="panel profit-leaders">
          <div className="panel-head"><div><h3 className="panel-title">Profit leaders</h3><p className="panel-subtitle">Best realized device margins</p></div></div>
          <div className="profit-leader-list">{bestDevices.length ? bestDevices.map((device, index) => <div key={device.deviceId}><span>{index + 1}</span><p><strong>{device.deviceName}</strong><small>{device.deviceId} · {device.model}</small></p><b className={(device.grossProfitCents ?? 0) < 0 ? "negative-money" : ""}>{money(device.grossProfitCents ?? 0)}</b></div>) : <div className="mini-empty">Add sale prices and costs to rank devices.</div>}</div>
        </section>
      </div>

      <section className="panel reliability-card">
        <div className="panel-head"><div><h3 className="panel-title">Brand & model reliability</h3><p className="panel-subtitle">Health, warranty failures, and after-sales cost</p></div></div>
        <div className="table-wrap"><table className="analytics-table"><thead><tr><th>Model</th><th>Stock / sold</th><th>Avg. health</th><th>Claims</th><th>Failure rate</th><th>Warranty cost</th></tr></thead><tbody>{analytics.reliability.map((item) => <tr key={item.model}><td><strong>{item.model}</strong></td><td>{item.devices} / {item.sold}</td><td>{item.averageHealth.toFixed(1)}/100</td><td>{item.claims}</td><td><span className={`failure-chip ${item.claimRate > 20 ? "high" : ""}`}>{percent(item.claimRate)}</span></td><td>{money(item.warrantyCostCents)}</td></tr>)}</tbody></table></div>
      </section>

      <section className="panel cost-book-card">
        <div className="panel-head cost-book-head"><div><h3 className="panel-title">Device cost book</h3><p className="panel-subtitle">Purchase + parts/refurb + sale − warranty = real gross profit</p></div><input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search passport, model or serial" aria-label="Search device costs" /></div>
        {error && <div className="inline-finance-error error-box" role="alert">{error}</div>}
        <div className="table-wrap"><table className="analytics-table cost-book-table"><thead><tr><th>Device</th><th>Purchase</th><th>Parts / refurb</th><th>Sale</th><th>Warranty</th><th>Gross profit</th><th /></tr></thead><tbody>{visibleDevices.map((device) => {
          const editing = editingId === device.deviceId;
          return <tr key={device.deviceId}><td><strong>{device.deviceName}</strong><span>{device.deviceId} · {device.lifecycleStatus}</span></td><td>{editing ? <MoneyInput label="Purchase cost" value={costForm.purchase} onChange={(value) => setCostForm((current) => ({ ...current, purchase: value }))} /> : <MoneyValue cents={device.purchaseCostCents} missing />}</td><td>{editing ? <MoneyInput label="Refurbishment cost" value={costForm.refurbishment} onChange={(value) => setCostForm((current) => ({ ...current, refurbishment: value }))} /> : money(device.refurbishmentCostCents)}</td><td><MoneyValue cents={device.salePriceCents} missing={device.lifecycleStatus === "Sold"} /></td><td>{money(device.warrantyCostCents)}</td><td>{device.grossProfitCents === null ? <span className="not-sold">Not sold</span> : <strong className={device.grossProfitCents < 0 ? "negative-money" : "positive-money"}>{money(device.grossProfitCents)}</strong>}</td><td>{editing ? <span className="cost-row-actions"><button className="button primary small" type="button" disabled={saving} onClick={() => saveCosts(device.deviceId)}>{saving ? "Saving…" : "Save"}</button><button className="text-link" type="button" onClick={() => setEditingId("")}>Cancel</button></span> : <button className="button secondary small" type="button" onClick={() => edit(device)}>Edit costs</button>}</td></tr>;
        })}</tbody></table></div>
      </section>

      <section className="panel technician-card">
        <div className="panel-head"><div><h3 className="panel-title">Technician workload & turnaround</h3><p className="panel-subtitle">Current assignments and completed service speed</p></div></div>
        <div className="technician-grid">{analytics.technicians.map((technician) => <article key={technician.id}><div><span className="technician-avatar">{initials(technician.name)}</span><p><strong>{technician.name}</strong><small>{technician.role}</small></p></div><dl><div><dt>Assigned</dt><dd>{technician.assigned}</dd></div><div><dt>Open</dt><dd>{technician.open}</dd></div><div><dt>Overdue</dt><dd className={technician.overdue ? "negative-money" : ""}>{technician.overdue}</dd></div><div><dt>Avg. close</dt><dd>{technician.averageTurnaroundDays === null ? "—" : `${technician.averageTurnaroundDays.toFixed(1)}d`}</dd></div></dl></article>)}</div>
      </section>
    </section>
  );
}

function AnalyticsStat({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "positive" | "warning" | "negative" }) {
  return <div className={`stat-card analytics-stat ${tone ?? ""}`}><div className="stat-top"><span className="stat-label">{label}</span><span className="stat-indicator">{note}</span></div><div className="stat-value">{value}</div></div>;
}

function ScoreItem({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>;
}

function MoneyInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="money-input"><span className="sr-only">{label}</span><i>Rs.</i><input type="number" min="0" max="100000000" step="0.01" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function MoneyValue({ cents, missing = false }: { cents: number; missing?: boolean }) {
  return cents === 0 && missing ? <span className="missing-money">Missing</span> : <>{money(cents)}</>;
}

function money(cents: number) {
  return new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100);
}

function fromCents(cents: number) {
  return cents ? (cents / 100).toFixed(cents % 100 ? 2 : 0) : "0";
}

function percent(value: number) {
  return `${value.toFixed(1)}%`;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "DP";
}
