"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  procurementStatuses,
  refurbishmentCategories,
  type ProcurementDashboard,
  type ProcurementStatus,
  type RefurbishmentCategory,
  type StockIntake,
  rmaStatuses,
  type SupplierRmaRecord,
  type RmaStatus,
} from "../../lib/procurement-types";

type IntakeFilter = "Active" | ProcurementStatus | "All";
type IntakeForm = { supplierId: string; deviceName: string; model: string; serial: string; supplierInvoice: string; purchasedAt: string; purchaseCostLkr: string; notes: string };

export function ProcurementPanel({ procurement, canManage, onProcurementChange, onAuditChange, onStartTest }: {
  procurement: ProcurementDashboard;
  canManage: boolean;
  onProcurementChange: (value: ProcurementDashboard) => void;
  onAuditChange: () => Promise<void>;
  onStartTest: () => void;
}) {
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<IntakeFilter>("Active");
  const [selectedId, setSelectedId] = useState(procurement.intakes.find((item) => item.status !== "Sold" && item.status !== "Archived")?.id ?? procurement.intakes[0]?.id ?? "");
  const initialSelected = procurement.intakes.find((item) => item.id === selectedId) ?? procurement.intakes[0];
  const [status, setStatus] = useState<ProcurementStatus>(initialSelected?.status ?? "Awaiting test");
  const [notes, setNotes] = useState(initialSelected?.notes ?? "");
  const [purchaseCostLkr, setPurchaseCostLkr] = useState(initialSelected ? fromCents(initialSelected.purchaseCostCents) : "0");
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCsvText, setBulkCsvText] = useState("");
  const [bulkInvoice, setBulkInvoice] = useState("CONTAINER-BATCH");
  const [bulkResult, setBulkResult] = useState<{ totalRows: number; importedCount: number; errors: Array<{ row: number; serial: string; error: string }> } | null>(null);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [intakeForm, setIntakeForm] = useState<IntakeForm>(() => emptyIntake(today, procurement.suppliers[0]?.id ?? ""));
  const [supplierForm, setSupplierForm] = useState({ name: "", contactName: "", email: "", phone: "" });
  const [taskForm, setTaskForm] = useState<{ category: RefurbishmentCategory; description: string; costLkr: string }>({ category: "Inspection", description: "", costLkr: "0" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [rmaOpen, setRmaOpen] = useState(false);
  const [rmas, setRmas] = useState<SupplierRmaRecord[]>([]);
  const [rmaMetrics, setRmaMetrics] = useState<{ totalCount: number; pendingCount: number; resolvedCount: number; totalCreditCents: number; formattedCredit: string } | null>(null);
  const [rmaFilter, setRmaFilter] = useState("All");
  const [newRmaOpen, setNewRewOpen] = useState(false);
  const [rmaForm, setRmaForm] = useState({
    supplierId: procurement.suppliers[0]?.id || "",
    itemType: "Spare Part" as "Spare Part" | "Device / Laptop",
    itemName: "",
    serial: "",
    faultDescription: "",
    notes: "",
  });
  const [selectedRmaForUpdate, setSelectedRmaForUpdate] = useState<SupplierRmaRecord | null>(null);
  const [updateStatus, setUpdateStatus] = useState<RmaStatus>("Dispatched");
  const [updateCreditLkr, setUpdateCreditLkr] = useState("");
  const [updateReplacementSerial, setUpdateReplacementSerial] = useState("");
  const [updateNotes, setUpdateNotes] = useState("");

  async function loadRmas() {
    try {
      const res = await fetch("/api/procurement/rmas");
      if (res.ok) {
        const data = await res.json();
        setRmas(data.rmas || []);
        setRmaMetrics(data.metrics || null);
      }
    } catch {}
  }

  async function submitRma(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/procurement/rmas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(rmaForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to log RMA");
      setNewRewOpen(false);
      setRmaForm({
        supplierId: procurement.suppliers[0]?.id || "",
        itemType: "Spare Part",
        itemName: "",
        serial: "",
        faultDescription: "",
        notes: "",
      });
      await loadRmas();
      await onAuditChange();
      setSuccess(`Logged supplier RMA #${data.rma.rmaNumber} successfully.`);
    } catch (err: any) {
      setError(err.message || "Failed to log RMA");
    } finally {
      setSaving(false);
    }
  }

  async function submitRmaUpdate(rmaId: string) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/procurement/rmas/${rmaId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: updateStatus,
          creditLkr: updateCreditLkr || undefined,
          replacementSerial: updateReplacementSerial || undefined,
          notes: updateNotes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update RMA");
      setSelectedRmaForUpdate(null);
      await loadRmas();
      await onAuditChange();
      setSuccess(`Updated RMA #${data.rma.rmaNumber} to ${data.rma.status}.`);
    } catch (err: any) {
      setError(err.message || "Failed to update RMA");
    } finally {
      setSaving(false);
    }
  }

  const visibleRmas = useMemo(() => {
    return rmas.filter((r) => rmaFilter === "All" || r.status === rmaFilter);
  }, [rmas, rmaFilter]);

  const visibleIntakes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return procurement.intakes.filter((item) => {
      const filterMatch = filter === "All" || (filter === "Active" ? item.status !== "Sold" && item.status !== "Archived" : item.status === filter);
      const searchMatch = !needle || [item.id, item.deviceId, item.deviceName, item.model, item.serial, item.supplierName, item.supplierInvoice].join(" ").toLowerCase().includes(needle);
      return filterMatch && searchMatch;
    });
  }, [filter, procurement.intakes, query]);
  const selected = procurement.intakes.find((item) => item.id === selectedId) ?? visibleIntakes[0] ?? procurement.intakes[0];

  function syncDetail(item: StockIntake) {
    setSelectedId(item.id);
    setStatus(item.status);
    setNotes(item.notes);
    setPurchaseCostLkr(fromCents(item.purchaseCostCents));
    setError("");
    setSuccess("");
  }

  async function refresh(preferredId = selectedId) {
    const response = await fetch("/api/procurement", { cache: "no-store" });
    if (!response.ok) return null;
    const result = await response.json();
    const next = result.procurement as ProcurementDashboard;
    onProcurementChange(next);
    const preferred = next.intakes.find((item) => item.id === preferredId) ?? next.intakes[0];
    if (preferred) syncDetail(preferred);
    return next;
  }

  async function submitBulkImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bulkCsvText.trim()) return;
    setSaving(true);
    setError("");
    setBulkResult(null);
    try {
      const response = await fetch("/api/procurement/intakes/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csvContent: bulkCsvText, supplierInvoice: bulkInvoice }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Bulk import failed");
      setBulkResult(data.result);
      if (data.result.importedCount > 0) {
        setSuccess(`Successfully imported ${data.result.importedCount} laptops!`);
        await Promise.all([refresh(), onAuditChange()]);
      }
    } catch (err: any) {
      setError(err.message || "Failed to process bulk import");
    } finally {
      setSaving(false);
    }
  }

  async function submitSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const response = await fetch("/api/procurement/suppliers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(supplierForm) });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    if (!response.ok) {
      setError(result.error ?? "Supplier could not be created.");
      setSaving(false);
      return;
    }
    setSupplierForm({ name: "", contactName: "", email: "", phone: "" });
    setSupplierOpen(false);
    const next = await refresh();
    setIntakeForm((current) => ({ ...current, supplierId: result.supplier.id }));
    if (next) setSuccess(`${result.supplier.name} added to the supplier book.`);
    await onAuditChange();
    setSaving(false);
  }

  async function submitIntake(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    const response = await fetch("/api/procurement", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(intakeForm) });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    if (!response.ok) {
      setError(result.error ?? "Stock intake could not be created.");
      setSaving(false);
      return;
    }
    setIntakeForm(emptyIntake(today, intakeForm.supplierId));
    setCreateOpen(false);
    await Promise.all([refresh(result.intake.id), onAuditChange()]);
    setSuccess(`${result.intake.id} is ready for diagnostic testing.`);
    setSaving(false);
  }

  async function saveIntake() {
    if (!selected) return;
    setSaving(true);
    setError("");
    setSuccess("");
    const response = await fetch(`/api/procurement/intakes/${encodeURIComponent(selected.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, notes, ...(canManage ? { purchaseCostLkr } : {}) }),
    });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    if (!response.ok) {
      setError(result.error ?? "Stock intake could not be saved.");
      setSaving(false);
      return;
    }
    await Promise.all([refresh(selected.id), onAuditChange()]);
    setSuccess("Intake details saved.");
    setSaving(false);
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError("");
    const response = await fetch(`/api/procurement/intakes/${encodeURIComponent(selected.id)}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(taskForm),
    });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    if (!response.ok) {
      setError(result.error ?? "Refurbishment task could not be added.");
      setSaving(false);
      return;
    }
    setTaskForm({ category: "Inspection", description: "", costLkr: "0" });
    await Promise.all([refresh(selected.id), onAuditChange()]);
    setSuccess("Refurbishment task added and cost ledger updated.");
    setSaving(false);
  }

  async function toggleTask(taskId: string, completed: boolean) {
    if (!selected) return;
    setSaving(true);
    setError("");
    const response = await fetch(`/api/procurement/tasks/${encodeURIComponent(taskId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ completed }) });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    if (!response.ok) setError(result.error ?? "Task could not be updated.");
    else await Promise.all([refresh(selected.id), onAuditChange()]);
    setSaving(false);
  }

  const activeCount = procurement.intakes.filter((item) => item.status !== "Sold" && item.status !== "Archived").length;

  return (
    <section className="page-section procurement-page">
      <div className="section-head procurement-section-head">
        <div><div className="eyebrow">Purchase → proof → profit</div><h2>Supplier & inventory intake</h2><p>Track every device from supplier invoice to customer handover.</p></div>
        {canManage && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="button secondary" type="button" onClick={() => { setBulkOpen((b) => !b); setCreateOpen(false); setError(""); }}>
              {bulkOpen ? "Close bulk import" : "📋 Bulk Excel / CSV Import"}
            </button>
            <button className="button secondary" type="button" onClick={() => { setRmaOpen((r) => !r); setCreateOpen(false); setBulkOpen(false); setError(""); if (!rmaOpen) loadRmas(); }}>
              {rmaOpen ? "Close RMAs" : "🛡️ Supplier RMAs"}
            </button>
            <button className="button primary" type="button" onClick={() => { setCreateOpen((open) => !open); setBulkOpen(false); setError(""); }}>
              {createOpen ? "Close intake form" : "+ New stock intake"}
            </button>
          </div>
        )}
      </div>

      <section className="stats procurement-stats" aria-label="Procurement summary">
        <ProcurementStat label="Active stock" value={activeCount} note={`${procurement.metrics.totalIntakes} total`} />
        <ProcurementStat label="Awaiting test" value={procurement.metrics.awaitingTest} note="Diagnostic queue" />
        <ProcurementStat label="Refurbishment" value={procurement.metrics.inRefurbishment} note={`${procurement.metrics.openTasks} open tasks`} />
        <ProcurementStat label={canManage ? "Stock investment" : "Ready to sell"} value={canManage ? money(procurement.metrics.inventoryValueCents) : String(procurement.metrics.ready)} note={procurement.metrics.agedStock ? `${procurement.metrics.agedStock} aged 90d+` : "Aging clear"} />
      </section>

      {rmaOpen && canManage && (
        <section className="panel rma-panel" style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '14px', padding: '24px', marginBottom: '24px' }}>
          <div className="panel-head" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>🛡️</span>
                <h3 className="panel-title" style={{ fontSize: '18px', fontWeight: '700', color: '#f8fafc' }}>Supplier RMA & Defective Parts Tracker</h3>
              </div>
              <p className="panel-subtitle" style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>
                Track bad NVMe SSDs, swollen batteries, and dead screens returned to wholesale importers for replacement or credit notes.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="button primary small"
                onClick={() => setNewRewOpen((o) => !o)}
              >
                {newRmaOpen ? "Cancel" : "+ Log Defective Return / RMA"}
              </button>
            </div>
          </div>

          {rmaMetrics && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
              <div style={{ background: '#1e293b', padding: '12px 16px', borderRadius: '8px', border: '1px solid #334155' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>Total RMAs</span>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#f8fafc', marginTop: '4px' }}>{rmaMetrics.totalCount}</div>
              </div>
              <div style={{ background: '#1e293b', padding: '12px 16px', borderRadius: '8px', border: '1px solid #f59e0b44' }}>
                <span style={{ fontSize: '11px', color: '#f59e0b', textTransform: 'uppercase' }}>Pending / In Review</span>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#fbbf24', marginTop: '4px' }}>{rmaMetrics.pendingCount}</div>
              </div>
              <div style={{ background: '#1e293b', padding: '12px 16px', borderRadius: '8px', border: '1px solid #10b98144' }}>
                <span style={{ fontSize: '11px', color: '#10b981', textTransform: 'uppercase' }}>Resolved / Replaced</span>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#34d399', marginTop: '4px' }}>{rmaMetrics.resolvedCount}</div>
              </div>
              <div style={{ background: '#1e293b', padding: '12px 16px', borderRadius: '8px', border: '1px solid #38bdf844' }}>
                <span style={{ fontSize: '11px', color: '#38bdf8', textTransform: 'uppercase' }}>Credit Recovered</span>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#38bdf8', marginTop: '4px' }}>{rmaMetrics.formattedCredit}</div>
              </div>
            </div>
          )}

          {newRmaOpen && (
            <form onSubmit={submitRma} style={{ background: '#1e293b', border: '1px solid #475569', borderRadius: '10px', padding: '18px', marginBottom: '20px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', marginBottom: '12px' }}>New Supplier Defect Return</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#cbd5e1' }}>
                  Supplier
                  <select
                    style={{ background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', padding: '8px', borderRadius: '6px' }}
                    value={rmaForm.supplierId}
                    onChange={(e) => setRmaForm({ ...rmaForm, supplierId: e.target.value })}
                  >
                    {procurement.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#cbd5e1' }}>
                  Item Category
                  <select
                    style={{ background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', padding: '8px', borderRadius: '6px' }}
                    value={rmaForm.itemType}
                    onChange={(e) => setRmaForm({ ...rmaForm, itemType: e.target.value as any })}
                  >
                    <option value="Spare Part">Spare Part (SSD, Battery, Screen, RAM)</option>
                    <option value="Device / Laptop">Device / Whole Laptop</option>
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#cbd5e1' }}>
                  Item Description
                  <input
                    required
                    style={{ background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', padding: '8px', borderRadius: '6px' }}
                    placeholder="e.g. Kingston NV2 500GB NVMe"
                    value={rmaForm.itemName}
                    onChange={(e) => setRmaForm({ ...rmaForm, itemName: e.target.value })}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#cbd5e1' }}>
                  Serial Number
                  <input
                    required
                    style={{ background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', padding: '8px', borderRadius: '6px' }}
                    placeholder="e.g. 50026B7685D12345"
                    value={rmaForm.serial}
                    onChange={(e) => setRmaForm({ ...rmaForm, serial: e.target.value })}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#cbd5e1', gridColumn: '1 / -1' }}>
                  Fault Description
                  <input
                    required
                    style={{ background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', padding: '8px', borderRadius: '6px' }}
                    placeholder="e.g. Unreadable bad sectors on crystaldiskinfo / BSOD on boot"
                    value={rmaForm.faultDescription}
                    onChange={(e) => setRmaForm({ ...rmaForm, faultDescription: e.target.value })}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#cbd5e1', gridColumn: '1 / -1' }}>
                  Notes / Courier Ref
                  <input
                    style={{ background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', padding: '8px', borderRadius: '6px' }}
                    placeholder="Handed over to supplier agent / Waybill #58219"
                    value={rmaForm.notes}
                    onChange={(e) => setRmaForm({ ...rmaForm, notes: e.target.value })}
                  />
                </label>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                <button type="submit" className="button primary small" disabled={saving}>
                  {saving ? "Saving..." : "Dispatched & Log RMA"}
                </button>
              </div>
            </form>
          )}

          {selectedRmaForUpdate && (
            <div style={{ background: '#1e293b', border: '1px solid #38bdf8', borderRadius: '10px', padding: '18px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#38bdf8' }}>Update RMA #{selectedRmaForUpdate.rmaNumber} ({selectedRmaForUpdate.itemName})</h4>
                <button type="button" className="text-link" onClick={() => setSelectedRmaForUpdate(null)}>Cancel</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#cbd5e1' }}>
                  Status
                  <select
                    style={{ background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', padding: '8px', borderRadius: '6px' }}
                    value={updateStatus}
                    onChange={(e) => setUpdateStatus(e.target.value as any)}
                  >
                    {rmaStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#cbd5e1' }}>
                  Credit Amount (LKR)
                  <input
                    type="number"
                    step="0.01"
                    style={{ background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', padding: '8px', borderRadius: '6px' }}
                    placeholder="e.g. 14500"
                    value={updateCreditLkr}
                    onChange={(e) => setUpdateCreditLkr(e.target.value)}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#cbd5e1' }}>
                  Replacement Serial (if replaced)
                  <input
                    style={{ background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', padding: '8px', borderRadius: '6px' }}
                    placeholder="New replacement unit serial"
                    value={updateReplacementSerial}
                    onChange={(e) => setUpdateReplacementSerial(e.target.value)}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#cbd5e1', gridColumn: '1 / -1' }}>
                  Resolution Notes
                  <input
                    style={{ background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', padding: '8px', borderRadius: '6px' }}
                    placeholder="Supplier accepted under warranty, credit note CN-8941 deducted from invoice"
                    value={updateNotes}
                    onChange={(e) => setUpdateNotes(e.target.value)}
                  />
                </label>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                <button type="button" className="button primary small" disabled={saving} onClick={() => submitRmaUpdate(selectedRmaForUpdate.id)}>
                  {saving ? "Updating..." : "Save RMA Resolution"}
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
            {["All", ...rmaStatuses].map((st) => (
              <button
                key={st}
                type="button"
                className={`button small ${rmaFilter === st ? "primary" : "secondary"}`}
                style={{ fontSize: '11px', padding: '4px 10px' }}
                onClick={() => setRmaFilter(st)}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="table-wrap">
            <table className="analytics-table" style={{ width: '100%', fontSize: '13px' }}>
              <thead>
                <tr>
                  <th>RMA #</th>
                  <th>Supplier</th>
                  <th>Item & Serial</th>
                  <th>Fault</th>
                  <th>Status</th>
                  <th>Dispatched</th>
                  <th>Resolution</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleRmas.map((r) => (
                  <tr key={r.id}>
                    <td><strong style={{ color: '#38bdf8' }}>{r.rmaNumber}</strong></td>
                    <td>{r.supplierName}</td>
                    <td>
                      <div><strong>{r.itemName}</strong></div>
                      <small style={{ color: '#94a3b8' }}>{r.serial} ({r.itemType})</small>
                    </td>
                    <td style={{ maxWidth: '200px' }}><small>{r.faultDescription}</small></td>
                    <td>
                      <span className={`status-badge ${r.status === 'Replaced' || r.status === 'Credit Note Issued' ? 'ready' : r.status === 'Rejected' ? 'needs-review' : 'awaiting'}`} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px' }}>
                        {r.status}
                      </span>
                    </td>
                    <td><small>{r.dispatchedAt.slice(0, 10)}</small></td>
                    <td>
                      {r.creditAmountCents > 0 && <strong style={{ color: '#10b981' }}>{r.formattedCredit}</strong>}
                      {r.replacementSerial && <div><small style={{ color: '#38bdf8' }}>Repl: {r.replacementSerial}</small></div>}
                      {!r.creditAmountCents && !r.replacementSerial && <small style={{ color: '#64748b' }}>-</small>}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button secondary small"
                        style={{ fontSize: '11px', padding: '3px 8px' }}
                        onClick={() => {
                          setSelectedRmaForUpdate(r);
                          setUpdateStatus(r.status);
                          setUpdateCreditLkr(r.creditAmountCents ? (r.creditAmountCents / 100).toFixed(0) : "");
                          setUpdateReplacementSerial(r.replacementSerial || "");
                          setUpdateNotes(r.notes || "");
                        }}
                      >
                        Update
                      </button>
                    </td>
                  </tr>
                ))}
                {!visibleRmas.length && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                      No supplier RMAs matching filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="procurement-flow" aria-label="Inventory workflow">{["Supplier purchase", "Intake label", "Diagnostic test", "Refurbishment", "Ready / sold"].map((step, index) => <div key={step}><span>{index + 1}</span><strong>{step}</strong>{index < 4 && <i>→</i>}</div>)}</div>

      {bulkOpen && canManage && (
        <section className="panel bulk-importer" style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '14px', padding: '24px', marginBottom: '24px' }}>
          <div className="panel-head" style={{ marginBottom: '16px' }}>
            <div>
              <h3 className="panel-title" style={{ fontSize: '18px', fontWeight: '700', color: '#38bdf8' }}>Wholesale Container Excel / CSV Bulk Ingestion</h3>
              <p className="panel-subtitle" style={{ color: '#94a3b8', fontSize: '13px' }}>
                Copy-paste rows directly from Microsoft Excel or paste standard CSV text. 50+ laptops import in seconds.
              </p>
            </div>
            <button
              type="button"
              className="button secondary small"
              onClick={() => {
                setBulkCsvText(`Model,Serial,CostLkr,Processor,RAM,Storage,Grade,SupplierName,SupplierInvoice\nDell Latitude 7490,DEL7490-001,85000,Intel Core i5-8350U,8GB DDR4,256GB SSD,A,Tokyo Global Exports,TK-2026-99\nLenovo ThinkPad T480,TP480-002,92000,Intel Core i5-8250U,16GB DDR4,512GB SSD,A,Dubai Wholesale IT,DXB-771\nHP EliteBook 840 G5,HP840-003,89000,Intel Core i7-8550U,16GB DDR4,256GB SSD,B,Singapore IT Hub,SG-8812`);
              }}
            >
              Paste Sample Template
            </button>
          </div>

          <form onSubmit={submitBulkImport}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#cbd5e1', marginBottom: '6px' }}>
                Batch Supplier Invoice Ref:
              </label>
              <input
                style={{ width: '300px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#fff', padding: '8px 12px', fontSize: '14px' }}
                value={bulkInvoice}
                onChange={(e) => setBulkInvoice(e.target.value)}
                required
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#cbd5e1', marginBottom: '6px' }}>
                CSV / Excel TSV Data (Header row required):
              </label>
              <textarea
                style={{ width: '100%', height: '180px', background: '#0a0e17', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9', fontFamily: 'monospace', fontSize: '12px', padding: '12px' }}
                value={bulkCsvText}
                onChange={(e) => setBulkCsvText(e.target.value)}
                placeholder="Model,Serial,CostLkr,Processor,RAM,Storage,Grade,SupplierName,SupplierInvoice\n..."
                required
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button className="button primary" type="submit" disabled={saving}>
                {saving ? "Importing container batch..." : "🚀 Ingest Wholesale Batch"}
              </button>
              {bulkCsvText && (
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                  ~{bulkCsvText.split('\n').filter(Boolean).length - 1} rows detected
                </span>
              )}
            </div>
          </form>

          {bulkResult && (
            <div style={{ marginTop: '18px', padding: '14px', borderRadius: '8px', background: bulkResult.errors.length === 0 ? '#064e3b33' : '#7f1d1d33', border: `1px solid ${bulkResult.errors.length === 0 ? '#10b981' : '#ef4444'}` }}>
              <div style={{ fontWeight: 'bold', color: bulkResult.errors.length === 0 ? '#10b981' : '#f87171' }}>
                Import Summary: {bulkResult.importedCount} of {bulkResult.totalRows} laptops imported successfully.
              </div>
              {bulkResult.errors.length > 0 && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#fca5a5' }}>
                  <div style={{ fontWeight: 'bold' }}>Skipped / Errors:</div>
                  <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                    {bulkResult.errors.map((err, idx) => (
                      <li key={idx}>Row {err.row} ({err.serial}): {err.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {createOpen && canManage && (
        <section className="panel intake-composer">
          <div className="panel-head"><div><h3 className="panel-title">Record supplier stock</h3><p className="panel-subtitle">The serial will auto-link when its diagnostic report is published</p></div><button className="text-link" type="button" onClick={() => setSupplierOpen((open) => !open)}>{supplierOpen ? "Close supplier form" : "+ Add supplier"}</button></div>
          {supplierOpen && <form className="supplier-quick-form" onSubmit={submitSupplier}><label>Supplier name<input required minLength={2} maxLength={100} value={supplierForm.name} onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))} /></label><label>Contact person<input maxLength={100} value={supplierForm.contactName} onChange={(event) => setSupplierForm((current) => ({ ...current, contactName: event.target.value }))} /></label><label>Email<input type="email" value={supplierForm.email} onChange={(event) => setSupplierForm((current) => ({ ...current, email: event.target.value }))} /></label><label>Phone<input maxLength={30} value={supplierForm.phone} onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))} /></label><button className="button secondary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save supplier"}</button></form>}
          <form className="intake-create-form" onSubmit={submitIntake}>
            <label>Supplier<select required value={intakeForm.supplierId} onChange={(event) => setIntakeForm((current) => ({ ...current, supplierId: event.target.value }))}><option value="">Choose supplier</option>{procurement.suppliers.filter((supplier) => supplier.active).map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}</select></label>
            <label>Device name<input required minLength={2} maxLength={120} value={intakeForm.deviceName} onChange={(event) => setIntakeForm((current) => ({ ...current, deviceName: event.target.value }))} placeholder="Lenovo ThinkPad T14 Gen 2" /></label>
            <label>Model<input required maxLength={100} value={intakeForm.model} onChange={(event) => setIntakeForm((current) => ({ ...current, model: event.target.value }))} placeholder="20W0S4KD00" /></label>
            <label>Serial number<input required minLength={3} maxLength={100} value={intakeForm.serial} onChange={(event) => setIntakeForm((current) => ({ ...current, serial: event.target.value }))} placeholder="PF3K9L2A" /></label>
            <label>Supplier invoice<input required minLength={2} maxLength={80} value={intakeForm.supplierInvoice} onChange={(event) => setIntakeForm((current) => ({ ...current, supplierInvoice: event.target.value }))} placeholder="SUP-INV-001" /></label>
            <label>Purchase date<input type="date" max={today} required value={intakeForm.purchasedAt} onChange={(event) => setIntakeForm((current) => ({ ...current, purchasedAt: event.target.value }))} /></label>
            <label>Purchase cost (LKR)<input type="number" min="0" max="100000000" step="0.01" required value={intakeForm.purchaseCostLkr} onChange={(event) => setIntakeForm((current) => ({ ...current, purchaseCostLkr: event.target.value }))} /></label>
            <label className="intake-notes-field">Intake notes<textarea maxLength={800} value={intakeForm.notes} onChange={(event) => setIntakeForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Condition received, included accessories, supplier promise…" /></label>
            <button className="button primary" type="submit" disabled={saving || !procurement.suppliers.length}>{saving ? "Recording…" : "Record stock intake"}</button>
          </form>
          {!procurement.suppliers.length && <div className="data-quality-banner compact"><span>!</span><div><strong>Add the first supplier before recording stock</strong><p>Supplier history makes later failure-rate and profit comparisons possible.</p></div></div>}
          {error && <div className="error-box inline-procurement-message" role="alert">{error}</div>}
        </section>
      )}

      <div className="procurement-workspace">
        <section className="panel intake-queue">
          <div className="panel-head"><div><h3 className="panel-title">Stock intake queue</h3><p className="panel-subtitle">Serial-controlled inventory before and after testing</p></div><span className="sale-result-count">{visibleIntakes.length}</span></div>
          <div className="intake-toolbar"><input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search serial, supplier or invoice" aria-label="Search stock intake" /><div className="intake-filters">{(["Active", "Awaiting test", "In refurbishment", "Ready", "Sold", "All"] as IntakeFilter[]).map((item) => <button type="button" className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)}>{item}</button>)}</div></div>
          <div className="intake-list">{visibleIntakes.map((item) => <button type="button" key={item.id} className={`intake-list-item ${selected?.id === item.id ? "selected" : ""}`} onClick={() => syncDetail(item)}><span className={`intake-status-dot status-${slug(item.status)}`} /><p><strong>{item.deviceName}</strong><span>{item.serial} · {item.supplierName}</span><small>{item.id} · {ageLabel(item.ageDays)}</small></p><span className={`intake-status status-${slug(item.status)}`}>{item.status}</span></button>)}{!visibleIntakes.length && <div className="empty-state">No stock matches this filter.</div>}</div>
        </section>

        <section className="panel intake-detail">
          {selected ? <>
            <div className="intake-detail-head"><div><div className="eyebrow">{selected.id}</div><h3>{selected.deviceName}</h3><p>{selected.model} · Serial {selected.serial}</p></div><div className="intake-head-actions"><span className={`aging-chip ${selected.ageDays >= 90 ? "aged" : ""}`}>{ageLabel(selected.ageDays)}</span><a className="button secondary small" href={`/intake-label/${encodeURIComponent(selected.id)}`} target="_blank" rel="noreferrer">Print intake label</a></div></div>
            <div className="intake-meta-grid"><div><span>Supplier</span><strong>{selected.supplierName}</strong></div><div><span>Invoice</span><strong>{selected.supplierInvoice}</strong></div><div><span>Purchased</span><strong>{formatDate(selected.purchasedAt)}</strong></div><div><span>Passport</span>{selected.deviceId ? <a href={`/passport/${selected.deviceId}`} target="_blank" rel="noreferrer">{selected.deviceId} ↗</a> : <strong>Awaiting diagnostic</strong>}</div>{canManage && <><div><span>Purchase</span><strong>{money(selected.purchaseCostCents)}</strong></div><div><span>Invested</span><strong>{money(selected.purchaseCostCents + selected.refurbishmentCostCents)}</strong></div></>}</div>
            {!selected.deviceId && <div className="intake-link-callout"><span>QC</span><div><strong>Publish the matching diagnostic report</strong><p>Serial <b>{selected.serial}</b> will link automatically and carry its purchase cost into Analytics.</p></div><button className="button primary small" type="button" onClick={onStartTest}>Start test</button></div>}
            <div className="intake-update-box"><div><h4>Intake control</h4><p>Keep receiving notes and operational status private to staff.</p></div><div className="intake-update-fields"><label>Status<select value={status} onChange={(event) => setStatus(event.target.value as ProcurementStatus)}>{procurementStatuses.map((item) => <option key={item}>{item}</option>)}</select></label>{canManage && <label>Purchase cost (LKR)<input type="number" min="0" max="100000000" step="0.01" value={purchaseCostLkr} onChange={(event) => setPurchaseCostLkr(event.target.value)} /></label>}<label className="intake-notes-field">Internal intake notes<textarea maxLength={800} value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div><button className="button secondary" type="button" disabled={saving} onClick={saveIntake}>{saving ? "Saving…" : "Save intake"}</button></div>
            <div className="refurbishment-box"><div className="refurbishment-head"><div><h4>Refurbishment checklist</h4><p>Every task cost feeds the device&apos;s real profit automatically.</p></div><strong>{money(selected.refurbishmentCostCents)}</strong></div><div className="refurbishment-tasks">{selected.tasks.map((task) => <label className={`refurbishment-task ${task.completed ? "completed" : ""}`} key={task.id}><input type="checkbox" checked={task.completed} disabled={saving} onChange={(event) => toggleTask(task.id, event.target.checked)} /><span><b>{task.description}</b><small>{task.category} · {money(task.costCents)} · {task.completed ? `Completed by ${task.completedBy}` : `Added by ${task.createdBy}`}</small></span></label>)}{!selected.tasks.length && <div className="mini-empty">No refurbishment tasks recorded yet.</div>}</div>{selected.status !== "Sold" && selected.status !== "Archived" && <form className="refurbishment-form" onSubmit={addTask}><select value={taskForm.category} onChange={(event) => setTaskForm((current) => ({ ...current, category: event.target.value as RefurbishmentCategory }))}>{refurbishmentCategories.map((item) => <option key={item}>{item}</option>)}</select><input required minLength={3} maxLength={240} value={taskForm.description} onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))} placeholder="Battery replacement, deep clean, port repair…" /><label><span>Rs.</span><input type="number" min="0" max="100000000" step="0.01" value={taskForm.costLkr} onChange={(event) => setTaskForm((current) => ({ ...current, costLkr: event.target.value }))} aria-label="Task cost in LKR" /></label><button className="button primary small" type="submit" disabled={saving}>Add task</button></form>}</div>
            {error && <div className="error-box inline-procurement-message" role="alert">{error}</div>}{success && <div className="success-box inline-procurement-message" role="status">{success}</div>}
          </> : <div className="empty-intake-detail"><span>IN</span><h3>No stock intake yet</h3><p>{canManage ? "Add a supplier and record the first purchased device." : "The Owner has not added stock to the intake queue yet."}</p></div>}
        </section>
      </div>

      {procurement.supplierPerformance.length > 0 && <section className="panel supplier-performance"><div className="panel-head"><div><h3 className="panel-title">Supplier performance</h3><p className="panel-subtitle">Volume, warranty reliability, stock exposure, and realized profit</p></div></div><div className="table-wrap"><table className="analytics-table"><thead><tr><th>Supplier</th><th>Intakes / sold</th><th>Claims</th><th>Failure rate</th>{canManage && <><th>Avg. purchase</th><th>Stock value</th><th>Gross profit</th></>}</tr></thead><tbody>{procurement.supplierPerformance.map((supplier) => <tr key={supplier.supplierId}><td><strong>{supplier.supplierName}</strong><span>{supplier.linked}/{supplier.intakes} passports linked</span></td><td>{supplier.intakes} / {supplier.sold}</td><td>{supplier.claims}</td><td><span className={`failure-chip ${supplier.failureRate > 20 ? "high" : ""}`}>{supplier.failureRate.toFixed(1)}%</span></td>{canManage && <><td>{money(supplier.averagePurchaseCostCents)}</td><td>{money(supplier.stockValueCents)}</td><td><strong className={supplier.grossProfitCents < 0 ? "negative-money" : "positive-money"}>{money(supplier.grossProfitCents)}</strong></td></>}</tr>)}</tbody></table></div></section>}
    </section>
  );
}

function ProcurementStat({ label, value, note }: { label: string; value: string | number; note: string }) {
  return <div className="stat-card"><div className="stat-top"><span className="stat-label">{label}</span><span className="stat-indicator">{note}</span></div><div className="stat-value">{value}</div></div>;
}

function emptyIntake(today: string, supplierId: string): IntakeForm {
  return { supplierId, deviceName: "", model: "", serial: "", supplierInvoice: "", purchasedAt: today, purchaseCostLkr: "", notes: "" };
}

function money(cents: number) {
  return new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100);
}

function fromCents(cents: number) {
  return cents ? (cents / 100).toFixed(cents % 100 ? 2 : 0) : "0";
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00.000Z`).toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "UTC" });
}

function ageLabel(days: number) {
  if (days >= 90) return `${days} days · aged`;
  if (days >= 60) return `${days} days · 60+`;
  if (days >= 30) return `${days} days · 30+`;
  return `${days} day${days === 1 ? "" : "s"} in stock`;
}

function slug(value: string) {
  return value.toLowerCase().replaceAll(" ", "-");
}
