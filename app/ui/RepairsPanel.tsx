"use client";

import React, { useState, useEffect, useMemo, FormEvent } from "react";
import {
  repairStatuses,
  type RepairStatus,
  type CustomerRepairJob,
  type CreateRepairInput,
} from "../../lib/repair-types";

interface Props {
  canManage: boolean;
  onAuditChange?: () => Promise<void>;
  openCreateTrigger?: number;
}

export function RepairsPanel({ canManage, onAuditChange, openCreateTrigger }: Props) {
  const [repairs, setRepairs] = useState<CustomerRepairJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Active");

  // Create Job Modal State
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (openCreateTrigger && openCreateTrigger > 0) {
      setCreateOpen(true);
    }
  }, [openCreateTrigger]);

  const [createForm, setCreateForm] = useState<CreateRepairInput>({
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    deviceBrand: "Dell",
    deviceModel: "",
    serial: "",
    devicePasswordPin: "",
    accessoriesReceived: "Original 65W AC Adapter, Laptop Sleeve",
    reportedFault: "",
    physicalCondition: "Normal wear & tear",
    estimatedCostLkr: "12500",
    advancePaidLkr: "2000",
    assignedTechnician: "",
  });

  // Update Status / Charges Modal State
  const [selectedRepair, setSelectedRepair] = useState<CustomerRepairJob | null>(null);
  const [updateStatus, setUpdateStatus] = useState<RepairStatus>("Diagnosing");
  const [updatePartsCost, setUpdatePartsCost] = useState("");
  const [updateLaborFee, setUpdateLaborFee] = useState("");
  const [updateAdvancePaid, setUpdateAdvancePaid] = useState("");
  const [updateTechNotes, setUpdateTechNotes] = useState("");
  const [updateTechnician, setUpdateTechnician] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadRepairs() {
    setLoading(true);
    try {
      const res = await fetch("/api/repairs");
      if (res.ok) {
        const data = await res.json();
        setRepairs(data.repairs || []);
      }
    } catch {
      // silent fallback
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRepairs();
  }, []);

  async function handleCreateJob(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/repairs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create repair job");

      setCreateOpen(false);
      setCreateForm({
        customerName: "",
        customerPhone: "",
        customerEmail: "",
        deviceBrand: "Dell",
        deviceModel: "",
        serial: "",
        devicePasswordPin: "",
        accessoriesReceived: "Original 65W AC Adapter, Laptop Sleeve",
        reportedFault: "",
        physicalCondition: "Normal wear & tear",
        estimatedCostLkr: "12500",
        advancePaidLkr: "2000",
        assignedTechnician: "",
      });
      await loadRepairs();
      if (onAuditChange) await onAuditChange();
      setSuccess(`Repair job #${data.repair.jobNumber} registered. Job sheet ready.`);

      // Automatically open 80mm printable job sheet
      window.open(`/api/repairs/${data.repair.id}/jobsheet`, "_blank");
    } catch (err: any) {
      setError(err.message || "Failed to create repair job");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateJob(e: FormEvent) {
    e.preventDefault();
    if (!selectedRepair) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/repairs/${selectedRepair.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: updateStatus,
          partsCostLkr: updatePartsCost || undefined,
          laborFeeLkr: updateLaborFee || undefined,
          advancePaidLkr: updateAdvancePaid || undefined,
          technicianNotes: updateTechNotes || undefined,
          assignedTechnician: updateTechnician || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update repair job");

      setSelectedRepair(null);
      await loadRepairs();
      if (onAuditChange) await onAuditChange();
      setSuccess(`Job #${data.repair.jobNumber} updated to ${data.repair.status}.`);
    } catch (err: any) {
      setError(err.message || "Failed to update repair job");
    } finally {
      setSaving(false);
    }
  }

  const visibleRepairs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return repairs.filter((r) => {
      const matchesFilter =
        statusFilter === "All"
          ? true
          : statusFilter === "Active"
          ? r.status !== "Delivered" && r.status !== "Unrepairable / Returned"
          : r.status === statusFilter;

      const matchesSearch =
        !q ||
        [r.jobNumber, r.customerName, r.customerPhone, r.deviceBrand, r.deviceModel, r.serial, r.reportedFault]
          .join(" ")
          .toLowerCase()
          .includes(q);

      return matchesFilter && matchesSearch;
    });
  }, [repairs, query, statusFilter]);

  const activeCount = repairs.filter((r) => r.status !== "Delivered" && r.status !== "Unrepairable / Returned").length;
  const readyCount = repairs.filter((r) => r.status === "Completed / Ready").length;
  const diagnosingCount = repairs.filter((r) => r.status === "Diagnosing" || r.status === "Repairing").length;

  return (
    <section className="page-section repair-page" style={{ padding: "0 0 32px 0" }}>
      {/* Section Head */}
      <div className="section-head" style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div className="eyebrow" style={{ color: "var(--forest-2)", fontWeight: "700" }}>Workshop & Customer Service Desk</div>
          <h2 style={{ fontSize: "24px", fontWeight: "800", color: "var(--ink)", margin: "4px 0" }}>Customer Laptop Repairs & Job Sheets</h2>
          <p style={{ color: "var(--muted)", fontSize: "14px", margin: 0 }}>
            Intake outside laptops for chip-level repair, issue 80mm job sheets, track parts & labor, and print tax invoices upon collection.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            className="button primary"
            onClick={() => { setCreateOpen(true); setError(""); setSuccess(""); }}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <span>+ New Repair Intake Job</span>
          </button>
        </div>
      </div>

      {/* Workshop Stats Banner */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px", marginBottom: "24px" }}>
        <div className="stat-card" style={{ padding: "16px", borderRadius: "12px" }}>
          <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Total Workshop Jobs</span>
          <div style={{ fontSize: "24px", fontWeight: "800", color: "var(--ink)", marginTop: "4px" }}>{repairs.length}</div>
        </div>
        <div className="stat-card" style={{ padding: "16px", borderRadius: "12px", borderLeft: "3px solid #0284c7" }}>
          <span style={{ fontSize: "11px", color: "#0284c7", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>In Progress / Diagnosing</span>
          <div style={{ fontSize: "24px", fontWeight: "800", color: "#0284c7", marginTop: "4px" }}>{diagnosingCount}</div>
        </div>
        <div className="stat-card" style={{ padding: "16px", borderRadius: "12px", borderLeft: "3px solid #10b981" }}>
          <span style={{ fontSize: "11px", color: "#10b981", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Ready for Customer Pickup</span>
          <div style={{ fontSize: "24px", fontWeight: "800", color: "#10b981", marginTop: "4px" }}>{readyCount}</div>
        </div>
        <div className="stat-card" style={{ padding: "16px", borderRadius: "12px", borderLeft: "3px solid #f59e0b" }}>
          <span style={{ fontSize: "11px", color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Active Queue</span>
          <div style={{ fontSize: "24px", fontWeight: "800", color: "#f59e0b", marginTop: "4px" }}>{activeCount} <small style={{ fontSize: "12px", color: "var(--muted)" }}>units</small></div>
        </div>
      </div>

      {success && <div className="success-box" style={{ marginBottom: "16px" }}>{success}</div>}
      {error && <div className="error-box" style={{ marginBottom: "16px" }}>{error}</div>}

      {/* Modal: Create Repair Job */}
      {createOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setCreateOpen(false)}>
          <section className="modal" role="dialog" aria-modal="true" style={{ maxWidth: "640px", width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="modal-head">
              <div>
                <div className="eyebrow" style={{ color: "var(--forest-2)" }}>Intake Workflow</div>
                <h2>🔧 Customer Laptop Intake Job Sheet</h2>
              </div>
              <button className="close-button" type="button" onClick={() => setCreateOpen(false)} aria-label="Close dialog">✕</button>
            </div>
            <p style={{ fontSize: "13px", color: "var(--muted)", margin: "0 0 16px" }}>
              Record customer device details, accessories received, fault symptoms and deposit. An 80mm job sheet receipt will be generated.
            </p>
            <form onSubmit={handleCreateJob} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label className="form-label" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--ink)", fontWeight: 600 }}>
                  Customer Name *
                  <input
                    required
                    placeholder="e.g. Kasun Chamara"
                    value={createForm.customerName}
                    onChange={(e) => setCreateForm({ ...createForm, customerName: e.target.value })}
                    className="form-input"
                    style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)", padding: "8px 12px", borderRadius: "8px", outline: "none" }}
                  />
                </label>
                <label className="form-label" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--ink)", fontWeight: 600 }}>
                  Phone Number *
                  <input
                    required
                    placeholder="e.g. 0771234567"
                    value={createForm.customerPhone}
                    onChange={(e) => setCreateForm({ ...createForm, customerPhone: e.target.value })}
                    className="form-input"
                    style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)", padding: "8px 12px", borderRadius: "8px", outline: "none" }}
                  />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <label className="form-label" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--ink)", fontWeight: 600 }}>
                  Brand *
                  <select
                    value={createForm.deviceBrand}
                    onChange={(e) => setCreateForm({ ...createForm, deviceBrand: e.target.value })}
                    className="form-select"
                    style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)", padding: "8px 12px", borderRadius: "8px", outline: "none" }}
                  >
                    <option value="Dell">Dell</option>
                    <option value="Lenovo">Lenovo</option>
                    <option value="HP">HP</option>
                    <option value="Apple">Apple MacBook</option>
                    <option value="Asus">Asus</option>
                    <option value="Acer">Acer</option>
                    <option value="MSI">MSI</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
                <label className="form-label" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--ink)", fontWeight: 600 }}>
                  Model *
                  <input
                    required
                    placeholder="e.g. Latitude 5400"
                    value={createForm.deviceModel}
                    onChange={(e) => setCreateForm({ ...createForm, deviceModel: e.target.value })}
                    className="form-input"
                    style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)", padding: "8px 12px", borderRadius: "8px", outline: "none" }}
                  />
                </label>
                <label className="form-label" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--ink)", fontWeight: 600 }}>
                  Serial / Service Tag
                  <input
                    placeholder="e.g. 8K9L1M2"
                    value={createForm.serial}
                    onChange={(e) => setCreateForm({ ...createForm, serial: e.target.value })}
                    className="form-input"
                    style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)", padding: "8px 12px", borderRadius: "8px", outline: "none" }}
                  />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label className="form-label" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--ink)", fontWeight: 600 }}>
                  Windows Password / PIN
                  <input
                    placeholder="e.g. 1234 or None"
                    value={createForm.devicePasswordPin}
                    onChange={(e) => setCreateForm({ ...createForm, devicePasswordPin: e.target.value })}
                    className="form-input"
                    style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)", padding: "8px 12px", borderRadius: "8px", outline: "none" }}
                  />
                </label>
                <label className="form-label" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--ink)", fontWeight: 600 }}>
                  Accessories Left with Laptop
                  <input
                    placeholder="e.g. Original 65W AC Adapter, Laptop Sleeve"
                    value={createForm.accessoriesReceived}
                    onChange={(e) => setCreateForm({ ...createForm, accessoriesReceived: e.target.value })}
                    className="form-input"
                    style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)", padding: "8px 12px", borderRadius: "8px", outline: "none" }}
                  />
                </label>
              </div>

              <label className="form-label" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--ink)", fontWeight: 600 }}>
                Reported Fault Description *
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. No power when charging, charging light blinks amber, fan spins then immediately stops"
                  value={createForm.reportedFault}
                  onChange={(e) => setCreateForm({ ...createForm, reportedFault: e.target.value })}
                  className="form-input"
                  style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)", padding: "8px 12px", borderRadius: "8px", resize: "none", outline: "none" }}
                />
              </label>

              <label className="form-label" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--ink)", fontWeight: 600 }}>
                Physical Condition (Scratches, Dents, Loose Hinges)
                <input
                  placeholder="e.g. Scratches on top cover, bottom rubber foot missing, right hinge slightly stiff"
                  value={createForm.physicalCondition}
                  onChange={(e) => setCreateForm({ ...createForm, physicalCondition: e.target.value })}
                  className="form-input"
                  style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)", padding: "8px 12px", borderRadius: "8px", outline: "none" }}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <label className="form-label" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--ink)", fontWeight: 600 }}>
                  Estimated Cost (LKR)
                  <input
                    type="number"
                    placeholder="e.g. 12500"
                    value={createForm.estimatedCostLkr}
                    onChange={(e) => setCreateForm({ ...createForm, estimatedCostLkr: e.target.value })}
                    className="form-input"
                    style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)", padding: "8px 12px", borderRadius: "8px", outline: "none" }}
                  />
                </label>
                <label className="form-label" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--ink)", fontWeight: 600 }}>
                  Advance Paid (LKR)
                  <input
                    type="number"
                    placeholder="e.g. 2000"
                    value={createForm.advancePaidLkr}
                    onChange={(e) => setCreateForm({ ...createForm, advancePaidLkr: e.target.value })}
                    className="form-input"
                    style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)", padding: "8px 12px", borderRadius: "8px", outline: "none" }}
                  />
                </label>
                <label className="form-label" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--ink)", fontWeight: 600 }}>
                  Assign Technician
                  <input
                    placeholder="e.g. Nuwan"
                    value={createForm.assignedTechnician}
                    onChange={(e) => setCreateForm({ ...createForm, assignedTechnician: e.target.value })}
                    className="form-input"
                    style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)", padding: "8px 12px", borderRadius: "8px", outline: "none" }}
                  />
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "14px" }}>
                <button type="button" className="button secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
                <button type="submit" disabled={saving} className="button primary">
                  {saving ? "Creating..." : "Print Job Sheet & Save Intake"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Modal: Update Repair Job */}
      {selectedRepair && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setSelectedRepair(null)}>
          <section className="modal" role="dialog" aria-modal="true" style={{ maxWidth: "560px", width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="modal-head">
              <div>
                <div className="eyebrow" style={{ color: "#0284c7" }}>Workshop Service Update</div>
                <h2>Update Job #{selectedRepair.jobNumber} ({selectedRepair.deviceBrand} {selectedRepair.deviceModel})</h2>
              </div>
              <button className="close-button" type="button" onClick={() => setSelectedRepair(null)} aria-label="Close dialog">✕</button>
            </div>

            <form onSubmit={handleUpdateJob} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <label className="form-label" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--ink)", fontWeight: 600 }}>
                Repair Status
                <select
                  value={updateStatus}
                  onChange={(e) => setUpdateStatus(e.target.value as RepairStatus)}
                  className="form-select"
                  style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)", padding: "8px 12px", borderRadius: "8px", outline: "none" }}
                >
                  {repairStatuses.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label className="form-label" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--ink)", fontWeight: 600 }}>
                  Parts Cost (LKR)
                  <input
                    type="number"
                    placeholder="e.g. 7500"
                    value={updatePartsCost}
                    onChange={(e) => setUpdatePartsCost(e.target.value)}
                    className="form-input"
                    style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)", padding: "8px 12px", borderRadius: "8px", outline: "none" }}
                  />
                </label>
                <label className="form-label" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--ink)", fontWeight: 600 }}>
                  Technician Labor Fee (LKR)
                  <input
                    type="number"
                    placeholder="e.g. 3500"
                    value={updateLaborFee}
                    onChange={(e) => setUpdateLaborFee(e.target.value)}
                    className="form-input"
                    style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)", padding: "8px 12px", borderRadius: "8px", outline: "none" }}
                  />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <label className="form-label" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--ink)", fontWeight: 600 }}>
                  Advance Deducted (LKR)
                  <input
                    type="number"
                    placeholder="e.g. 2000"
                    value={updateAdvancePaid}
                    onChange={(e) => setUpdateAdvancePaid(e.target.value)}
                    className="form-input"
                    style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)", padding: "8px 12px", borderRadius: "8px", outline: "none" }}
                  />
                </label>
                <label className="form-label" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--ink)", fontWeight: 600 }}>
                  Assigned Technician
                  <input
                    placeholder="e.g. Nuwan"
                    value={updateTechnician}
                    onChange={(e) => setUpdateTechnician(e.target.value)}
                    className="form-input"
                    style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)", padding: "8px 12px", borderRadius: "8px", outline: "none" }}
                  />
                </label>
              </div>

              <label className="form-label" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--ink)", fontWeight: 600 }}>
                Technician Notes / Repair Log
                <textarea
                  rows={3}
                  placeholder="e.g. Replaced 19V shorted ceramic capacitor near charging IC. Cleaned dust and applied Arctic MX-4 thermal paste. Stress tested for 3 hours."
                  value={updateTechNotes}
                  onChange={(e) => setUpdateTechNotes(e.target.value)}
                  className="form-input"
                  style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)", padding: "8px 12px", borderRadius: "8px", resize: "none", outline: "none" }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "14px" }}>
                <button type="button" className="button secondary" onClick={() => setSelectedRepair(null)}>Cancel</button>
                <button type="submit" disabled={saving} className="button primary">
                  {saving ? "Saving..." : "Save Status & Billing"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {["Active", "All", ...repairStatuses].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              style={{
                background: statusFilter === st ? "var(--forest-2)" : "var(--card)",
                color: statusFilter === st ? "#ffffff" : "var(--muted)",
                border: "1px solid var(--line)",
                borderRadius: "8px",
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {st}
            </button>
          ))}
        </div>

        <input
          placeholder="Search job #, customer phone, brand or serial..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="search"
          style={{
            background: "var(--card)",
            border: "1px solid var(--line)",
            borderRadius: "10px",
            color: "var(--ink)",
            padding: "8px 14px",
            fontSize: "13px",
            width: "320px",
            outline: "none",
          }}
        />
      </div>

      {/* Repairs Table */}
      <div className="panel" style={{ borderRadius: "14px", padding: "16px", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--line)", color: "var(--muted)" }}>
              <th style={{ padding: "10px 12px" }}>Job #</th>
              <th style={{ padding: "10px 12px" }}>Customer</th>
              <th style={{ padding: "10px 12px" }}>Device & Serial</th>
              <th style={{ padding: "10px 12px" }}>Fault Description</th>
              <th style={{ padding: "10px 12px" }}>Status</th>
              <th style={{ padding: "10px 12px" }}>Technician</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>Total / Due</th>
              <th style={{ padding: "10px 12px", textAlign: "center" }}>Documents & Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRepairs.map((r) => {
              const statusColor =
                r.status === "Completed / Ready"
                  ? "#10b981"
                  : r.status === "Delivered"
                  ? "#0284c7"
                  : r.status === "Waiting for Parts"
                  ? "#f59e0b"
                  : r.status === "Unrepairable / Returned"
                  ? "#ef4444"
                  : "var(--muted)";

              return (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "12px", fontWeight: "700", color: "var(--forest-2)" }}>
                    {r.jobNumber}
                    <div style={{ fontSize: "11px", color: "var(--muted)" }}>{r.receivedAt.slice(0, 10)}</div>
                  </td>
                  <td style={{ padding: "12px" }}>
                    <div style={{ fontWeight: "600", color: "var(--ink)" }}>{r.customerName}</div>
                    <div style={{ fontSize: "12px", color: "var(--muted)" }}>{r.customerPhone}</div>
                  </td>
                  <td style={{ padding: "12px" }}>
                    <div style={{ fontWeight: "600", color: "var(--ink)" }}>{r.deviceBrand} {r.deviceModel}</div>
                    <div style={{ fontSize: "11px", color: "var(--muted)" }}>SN: {r.serial}</div>
                  </td>
                  <td style={{ padding: "12px", maxWidth: "220px" }}>
                    <div style={{ fontSize: "12px", color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.reportedFault}>
                      {r.reportedFault}
                    </div>
                    {r.technicianNotes && (
                      <div style={{ fontSize: "11px", color: "#0284c7", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        Note: {r.technicianNotes}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "12px" }}>
                    <span style={{ background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}44`, padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: "700" }}>
                      {r.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px", color: "var(--ink)" }}>
                    {r.assignedTechnician || <span style={{ color: "var(--muted)" }}>Unassigned</span>}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right" }}>
                    <strong style={{ color: "var(--ink)" }}>{r.formattedTotalAmount}</strong>
                    <div style={{ fontSize: "11px", color: r.balanceDueCents > 0 ? "#ef4444" : "#10b981", fontWeight: 600 }}>
                      Due: {r.formattedBalanceDue}
                    </div>
                  </td>
                  <td style={{ padding: "12px", textAlign: "center" }}>
                    <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                      <a
                        href={`/api/repairs/${r.id}/jobsheet`}
                        target="_blank"
                        rel="noreferrer"
                        title="Print 80mm Job Sheet"
                        className="button secondary small"
                        style={{ padding: "4px 8px", fontSize: "11px", textDecoration: "none" }}
                      >
                        📄 Job Sheet
                      </a>
                      <a
                        href={`/api/repairs/${r.id}/invoice`}
                        target="_blank"
                        rel="noreferrer"
                        title="Print Repair Tax Invoice"
                        className="button secondary small"
                        style={{ padding: "4px 8px", fontSize: "11px", textDecoration: "none", color: "#10b981" }}
                      >
                        🧾 Invoice
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRepair(r);
                          setUpdateStatus(r.status);
                          setUpdatePartsCost(r.partsCostCents ? (r.partsCostCents / 100).toFixed(0) : "");
                          setUpdateLaborFee(r.laborFeeCents ? (r.laborFeeCents / 100).toFixed(0) : "");
                          setUpdateAdvancePaid(r.advancePaidCents ? (r.advancePaidCents / 100).toFixed(0) : "");
                          setUpdateTechNotes(r.technicianNotes || "");
                          setUpdateTechnician(r.assignedTechnician || "");
                        }}
                        className="button secondary small"
                        style={{ padding: "4px 8px", fontSize: "11px" }}
                      >
                        ✏️ Update
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!visibleRepairs.length && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "36px", color: "var(--muted)" }}>
                  {loading ? "Loading workshop repairs..." : "No customer repair jobs match the selected filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
