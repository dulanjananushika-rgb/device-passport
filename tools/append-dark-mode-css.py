import os

css_path = r"D:\Software_Projects\deploy\device-passport\app\globals.css"
with open(css_path, "r", encoding="utf-8") as f:
    content = f.read()

dark_mode_css = """

/* ========================================================
   FULL CASHIER & WORKSHOP DARK MODE ENGINE
   ======================================================== */
[data-theme="dark"],
html.dark,
body.dark {
  --ink: #f1f5f9;
  --muted: #94a3b8;
  --paper: #0b0f15;
  --card: #141c26;
  --line: #222f3f;
  --forest: #10b981;
  --forest-2: #059669;
  --lime: #34d399;
  --lime-soft: #064e3b;
  --amber: #fbbf24;
  --red: #f87171;
  --shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
  background-color: #0b0f15 !important;
  color: #f1f5f9 !important;
}

[data-theme="dark"] body {
  background:
    radial-gradient(circle at 75% -10%, rgba(16, 185, 129, 0.08), transparent 32rem),
    #0b0f15 !important;
  color: #f1f5f9 !important;
}

[data-theme="dark"] .sidebar {
  background: #080c10 !important;
  border-right: 1px solid #1c2635 !important;
}

[data-theme="dark"] .topbar {
  border-bottom: 1px solid #1c2635 !important;
}

[data-theme="dark"] .panel,
[data-theme="dark"] .card,
[data-theme="dark"] .modal,
[data-theme="dark"] .overview-panel,
[data-theme="dark"] .summary-card,
[data-theme="dark"] .device-row,
[data-theme="dark"] .stepper,
[data-theme="dark"] .wizard-body,
[data-theme="dark"] .settings-card,
[data-theme="dark"] .account-card,
[data-theme="dark"] .claim-card,
[data-theme="dark"] .repair-card {
  background: #141c26 !important;
  border-color: #222f3f !important;
  color: #f1f5f9 !important;
}

[data-theme="dark"] input,
[data-theme="dark"] select,
[data-theme="dark"] textarea {
  background: #1b2533 !important;
  border-color: #334155 !important;
  color: #f8fafc !important;
}

[data-theme="dark"] input::placeholder,
[data-theme="dark"] textarea::placeholder {
  color: #64748b !important;
}

[data-theme="dark"] .icon-button {
  background: #1b2533 !important;
  border-color: #334155 !important;
  color: #f8fafc !important;
}

[data-theme="dark"] table {
  color: #f1f5f9 !important;
}

[data-theme="dark"] th {
  background: #1a2533 !important;
  color: #94a3b8 !important;
  border-color: #222f3f !important;
}

[data-theme="dark"] td {
  border-color: #1e293b !important;
}

[data-theme="dark"] .button.secondary {
  background: #1e293b !important;
  border-color: #334155 !important;
  color: #f1f5f9 !important;
}

[data-theme="dark"] .button.secondary:hover {
  background: #334155 !important;
}

[data-theme="dark"] .button.primary {
  background: #10b981 !important;
  color: #042f2e !important;
  font-weight: 800;
}

[data-theme="dark"] .modal-backdrop {
  background: rgba(0, 0, 0, 0.75) !important;
}

/* Quick POS Hotkeys & Theme Toggle Styles */
.hotkeys-quick-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: 12px;
}

.hotkey-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(21, 34, 29, 0.05);
  border: 1px solid rgba(21, 34, 29, 0.12);
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 700;
  color: var(--forest);
  cursor: pointer;
  transition: all 0.15s ease;
}

.hotkey-pill:hover {
  background: rgba(21, 34, 29, 0.12);
  transform: translateY(-1px);
}

.hotkey-pill kbd {
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-bottom: 2px solid rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  padding: 1px 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10px;
  color: #0f172a;
}

.theme-toggle-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 5px 11px;
  font-size: 12px;
  font-weight: 750;
  color: var(--ink);
  cursor: pointer;
  transition: all 0.15s ease;
}

.theme-toggle-button:hover {
  background: rgba(0, 0, 0, 0.05);
  transform: translateY(-1px);
}

[data-theme="dark"] .hotkey-pill {
  background: #1e293b;
  border-color: #334155;
  color: #38bdf8;
}

[data-theme="dark"] .hotkey-pill:hover {
  background: #334155;
}

[data-theme="dark"] .hotkey-pill kbd {
  background: #0f172a;
  border-color: #475569;
  border-bottom-color: #64748b;
  color: #f8fafc;
}

[data-theme="dark"] .theme-toggle-button {
  background: #1e293b;
  border-color: #334155;
  color: #f1f5f9;
}

[data-theme="dark"] .theme-toggle-button:hover {
  background: #334155;
}
"""

if "FULL CASHIER & WORKSHOP DARK MODE ENGINE" not in content:
    with open(css_path, "w", encoding="utf-8") as f:
        f.write(content.rstrip() + dark_mode_css)
    print("Dark mode & Hotkeys CSS appended to app/globals.css!")
else:
    print("Dark mode CSS already present.")
