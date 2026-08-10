"use client";

import { useMemo, useState } from "react";
import type { NotificationChannel, NotificationItem } from "../../lib/notifications";

type NotificationFilter = "Active" | "Contactable" | "History" | "All";

type NotificationCenterProps = {
  initialNotifications: NotificationItem[];
  onNotificationsChange: (notifications: NotificationItem[]) => void;
};

export function NotificationCenter({ initialNotifications, onNotificationsChange }: NotificationCenterProps) {
  const firstActive = initialNotifications.find(isActiveNotification);
  const firstNotification = firstActive ?? initialNotifications[0];
  const notifications = initialNotifications;
  const [filter, setFilter] = useState<NotificationFilter>(firstActive ? "Active" : initialNotifications.length ? "History" : "All");
  const [selectedId, setSelectedId] = useState(firstNotification?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const visibleNotifications = useMemo(() => notifications.filter((notification) => matchesFilter(notification, filter)), [filter, notifications]);
  const selected = notifications.find((notification) => notification.id === selectedId) ?? visibleNotifications[0];
  const activeCount = notifications.filter(isActiveNotification).length;
  const urgentCount = notifications.filter((notification) => isActiveNotification(notification) && notification.severity === "Urgent").length;
  const contactableCount = notifications.filter((notification) => isActiveNotification(notification) && (notification.customerEmail || notification.customerPhone)).length;
  const completedCount = notifications.filter((notification) => notification.status === "Done").length;

  function updateLocal(updated: NotificationItem) {
    const next = notifications.map((notification) => notification.id === updated.id ? updated : notification);
    onNotificationsChange(next);
  }

  function chooseNotification(notification: NotificationItem) {
    setSelectedId(notification.id);
    setError("");
    setSuccess("");
  }

  function chooseFilter(nextFilter: NotificationFilter) {
    setFilter(nextFilter);
    const first = notifications.find((notification) => matchesFilter(notification, nextFilter));
    if (first) chooseNotification(first);
  }

  async function refreshQueue() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/notifications");
    const result = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    setBusy(false);
    if (!response.ok) {
      setError(result.error ?? "The notification queue could not be refreshed.");
      return;
    }
    const next = result.notifications as NotificationItem[];
    onNotificationsChange(next);
    setSuccess("Notification queue refreshed.");
  }

  async function changeStatus(status: "Pending" | "Done" | "Dismissed") {
    if (!selected) return;
    setBusy(true);
    setError("");
    setSuccess("");
    const response = await fetch(`/api/notifications/${encodeURIComponent(selected.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    setBusy(false);
    if (!response.ok) {
      setError(result.error ?? "The notification could not be updated.");
      return;
    }
    updateLocal(result.notification as NotificationItem);
    if (status !== "Pending") setFilter("History");
    setSuccess(status === "Done" ? "Marked as completed." : status === "Dismissed" ? "Notification dismissed." : "Notification reopened.");
  }

  async function openComposer(channel: NotificationChannel) {
    if (!selected) return;
    const composerWindow = window.open("about:blank", "_blank");
    if (composerWindow) composerWindow.opener = null;
    setBusy(true);
    setError("");
    setSuccess("");
    const response = await fetch(`/api/notifications/${encodeURIComponent(selected.id)}/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel }),
    });
    const result = await response.json().catch(() => ({ error: "The server returned an invalid response." }));
    setBusy(false);
    if (!response.ok) {
      composerWindow?.close();
      setError(result.error ?? "The message composer could not be opened.");
      return;
    }
    updateLocal(result.notification as NotificationItem);
    setSuccess(`${channel} composer opened. Mark Done only after you confirm the message was sent.`);
    if (composerWindow) composerWindow.location.href = result.href;
    else window.location.href = result.href;
  }

  async function copyMessage() {
    if (!selected) return;
    await navigator.clipboard.writeText(selected.message);
    setSuccess("Message copied to clipboard.");
    setError("");
  }

  return (
    <section className="page-section notification-page">
      <div className="section-head"><div><div className="eyebrow">Customer follow-up</div><h2>Notification centre</h2></div><button className="button secondary" type="button" disabled={busy} onClick={refreshQueue}>{busy ? "Refreshing…" : "Refresh alerts"}</button></div>
      <section className="stats"><NotificationStat label="Active alerts" value={activeCount} note={activeCount ? "Needs review" : "Clear"} /><NotificationStat label="Urgent" value={urgentCount} note={urgentCount ? "Prioritize" : "None"} /><NotificationStat label="Contactable" value={contactableCount} note="WhatsApp / email" /><NotificationStat label="Completed" value={completedCount} note="Action history" /></section>

      {notifications.length ? <div className="notification-workspace">
        <section className="panel notification-inbox">
          <div className="panel-head"><div><h3 className="panel-title">Follow-up queue</h3><p className="panel-subtitle">Generated from live shop events</p></div></div>
          <div className="notification-filters" aria-label="Notification filters">{(["Active", "Contactable", "History", "All"] as NotificationFilter[]).map((item) => <button type="button" key={item} className={filter === item ? "active" : ""} onClick={() => chooseFilter(item)}>{item}</button>)}</div>
          <div className="notification-list">{visibleNotifications.map((notification) => <button type="button" key={notification.id} className={`notification-list-item ${selected?.id === notification.id ? "selected" : ""}`} onClick={() => chooseNotification(notification)}><span className="notification-item-head"><span className={`notification-severity severity-${notification.severity.toLowerCase()}`}>{notification.severity}</span><span className={`notification-status notification-status-${notification.status.toLowerCase()}`}>{notification.status}</span></span><strong>{notification.title}</strong><span>{notification.customerName || notification.deviceName}</span><small>{notificationTypeLabel(notification.type)} · {formatDateTime(notification.updatedAt)}</small></button>)}</div>
          {!visibleNotifications.length && <div className="notification-empty-filter"><strong>Queue is clear</strong><span>No notifications match this filter.</span></div>}
        </section>

        {selected && <section className="panel notification-detail">
          <div className="notification-detail-head"><div><div className="eyebrow">{notificationTypeLabel(selected.type)}</div><h3>{selected.title}</h3><p>{selected.entityId} · {selected.deviceName}</p></div><span className={`notification-severity severity-${selected.severity.toLowerCase()}`}>{selected.severity}</span></div>
          <div className="notification-recipient-grid"><div><span>Recipient</span><strong>{selected.customerName || "Internal shop alert"}</strong></div><div><span>Phone</span><strong>{selected.customerPhone || "Not available"}</strong></div><div><span>Email</span><strong>{selected.customerEmail || "Not available"}</strong></div><div><span>Due / expiry</span><strong>{selected.dueDate ? formatDate(selected.dueDate) : "No deadline"}</strong></div></div>

          <div className="message-preview"><div><span>Prepared message</span><button className="text-link" type="button" onClick={copyMessage}>Copy message</button></div><p>{selected.message}</p></div>
          <div className="composer-note"><strong>Delivery confirmation</strong><p>Opening a composer is logged, but it does not prove delivery. Mark this alert Done only after the staff member confirms the message was sent.</p></div>

          <div className="notification-actions">
            <button className="button whatsapp-button" type="button" disabled={busy || !isActiveNotification(selected) || !selected.customerPhone} onClick={() => openComposer("WhatsApp")}>Open WhatsApp</button>
            <button className="button secondary" type="button" disabled={busy || !isActiveNotification(selected) || !selected.customerEmail} onClick={() => openComposer("Email")}>Open email</button>
            <a className="button secondary" href={selected.actionUrl} target="_blank" rel="noreferrer">Open related record</a>
          </div>

          <div className="notification-resolution">
            {isActiveNotification(selected) ? <><button className="button primary" type="button" disabled={busy} onClick={() => changeStatus("Done")}>Mark Done</button><button className="text-link danger-text" type="button" disabled={busy} onClick={() => changeStatus("Dismissed")}>Dismiss</button></> : <button className="button secondary" type="button" disabled={busy || selected.status === "Resolved"} onClick={() => changeStatus("Pending")}>Reopen notification</button>}
          </div>

          {error && <div className="error-box notification-feedback" role="alert">{error}</div>}
          {success && <div className="success-box notification-feedback" role="status">{success}</div>}

          <div className="notification-history"><div><h4>Activity history</h4><span>{selected.actions.length} event{selected.actions.length === 1 ? "" : "s"}</span></div>{selected.actions.length ? selected.actions.map((action) => <article key={action.id}><span>{action.channel ? action.channel.slice(0, 1) : "✓"}</span><div><strong>{action.action}{action.channel ? ` · ${action.channel}` : ""}</strong><small>{action.actor} · {formatDateTime(action.createdAt)}</small></div></article>) : <p>No staff action has been recorded yet.</p>}</div>
        </section>}
      </div> : <div className="panel empty-notifications"><span>N</span><h3>No follow-ups right now</h3><p>New claims, overdue service jobs, expiring warranties, and Ready stock will appear here automatically.</p><button className="button secondary" type="button" onClick={refreshQueue}>Check again</button></div>}
    </section>
  );
}

function NotificationStat({ label, value, note }: { label: string; value: number; note: string }) {
  return <article className="stat-card"><div className="stat-top"><span className="stat-label">{label}</span><span className="stat-indicator">{note}</span></div><div className="stat-value">{value}</div></article>;
}

function isActiveNotification(notification: NotificationItem) {
  return notification.status === "Pending" || notification.status === "Opened";
}

function matchesFilter(notification: NotificationItem, filter: NotificationFilter) {
  if (filter === "Active") return isActiveNotification(notification);
  if (filter === "Contactable") return isActiveNotification(notification) && Boolean(notification.customerEmail || notification.customerPhone);
  if (filter === "History") return !isActiveNotification(notification);
  return true;
}

function notificationTypeLabel(type: NotificationItem["type"]) {
  const labels: Record<NotificationItem["type"], string> = { NewClaim: "New claim", ClaimOverdue: "Overdue SLA", Warranty30: "30-day warranty reminder", Warranty7: "7-day warranty reminder", ReadyDevice: "Ready stock" };
  return labels[type];
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", { dateStyle: "medium" });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}
