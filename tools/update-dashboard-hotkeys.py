import os

path = r"D:\Software_Projects\deploy\device-passport\app\ui\Dashboard.tsx"
with open(path, "r", encoding="utf-8") as f:
    code = f.read().replace("\r\n", "\n")

# 1. State & Hotkeys Listener Injection
target_state = """  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);"""

replacement_state = """  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  // Cashier & Workshop Dark Mode State
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("devicepassport_theme");
    if (saved) return saved === "dark";
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.setAttribute("data-theme", "dark");
      root.classList.add("dark");
      document.body.classList.add("dark");
      localStorage.setItem("devicepassport_theme", "dark");
    } else {
      root.setAttribute("data-theme", "light");
      root.classList.remove("dark");
      document.body.classList.remove("dark");
      localStorage.setItem("devicepassport_theme", "light");
    }
  }, [isDarkMode]);

  function toggleTheme() {
    setIsDarkMode((prev) => !prev);
  }

  // Quick POS Hotkeys & Modals
  const [showHotkeysModal, setShowHotkeysModal] = useState(false);
  const [showQuickStickerModal, setShowQuickStickerModal] = useState(false);
  const [stickerSearch, setStickerSearch] = useState("");
  const [repairTrigger, setRepairTrigger] = useState(0);

  // Global Keyboard Shortcuts (F1, F2, F4, F9, Ctrl+D, Esc)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;

      if (e.key === "F2") {
        e.preventDefault();
        setView("sales");
      } else if (e.key === "F4") {
        e.preventDefault();
        setShowQuickStickerModal(true);
      } else if (e.key === "F9") {
        e.preventDefault();
        setView("repairs");
        setRepairTrigger((prev) => prev + 1);
      } else if (e.key === "F1") {
        e.preventDefault();
        setShowHotkeysModal((prev) => !prev);
      } else if ((e.key === "d" || e.key === "D") && (e.ctrlKey || e.altKey) && !isInput) {
        e.preventDefault();
        toggleTheme();
      } else if (e.key === "Escape") {
        setShowHotkeysModal(false);
        setShowQuickStickerModal(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);"""

if target_state in code:
    code = code.replace(target_state, replacement_state)
    print("State & Hotkeys listener injected into Dashboard.tsx")
else:
    print("ERROR: target_state not found in Dashboard.tsx")

# 2. Topbar Actions Update
target_topbar = """        <header className="topbar">
          <div><div className="eyebrow">{title.eyebrow}</div><h1>{title.title}</h1></div>
          <div className="top-actions">
            <button className="icon-button" aria-label={`Notifications${activeNotificationCount ? ` (${activeNotificationCount})` : ""}`} onClick={openNotifications}>N{activeNotificationCount > 0 && <small>{activeNotificationCount > 9 ? "9+" : activeNotificationCount}</small>}</button>
            {canTestDevices && <button className="button primary" onClick={() => setModalOpen(true)}>+ New device test</button>}
          </div>
        </header>"""

replacement_topbar = """        <header className="topbar">
          <div><div className="eyebrow">{title.eyebrow}</div><h1>{title.title}</h1></div>
          <div className="top-actions">
            {/* Quick POS Hotkeys pill bar */}
            <div className="hotkeys-quick-bar">
              <button className="hotkey-pill" type="button" onClick={() => setView("sales")} title="Quick Hotkey: F2">
                <kbd>F2</kbd> Sale
              </button>
              <button className="hotkey-pill" type="button" onClick={() => setShowQuickStickerModal(true)} title="Quick Hotkey: F4">
                <kbd>F4</kbd> Sticker
              </button>
              <button className="hotkey-pill" type="button" onClick={() => { setView("repairs"); setRepairTrigger((p) => p + 1); }} title="Quick Hotkey: F9">
                <kbd>F9</kbd> Repair
              </button>
              <button className="hotkey-pill" type="button" onClick={() => setShowHotkeysModal(true)} title="Shortcuts Cheat-Sheet (F1)">
                <kbd>F1</kbd> ⌨️
              </button>
              <button className="theme-toggle-button" type="button" onClick={toggleTheme} title="Toggle Dark/Light Mode (Ctrl+D)">
                {isDarkMode ? "☀️ Light" : "🌙 Dark"}
              </button>
            </div>

            <button className="icon-button" aria-label={`Notifications${activeNotificationCount ? ` (${activeNotificationCount})` : ""}`} onClick={openNotifications}>N{activeNotificationCount > 0 && <small>{activeNotificationCount > 9 ? "9+" : activeNotificationCount}</small>}</button>
            {canTestDevices && <button className="button primary" onClick={() => setModalOpen(true)}>+ New device test</button>}
          </div>
        </header>"""

if target_topbar in code:
    code = code.replace(target_topbar, replacement_topbar)
    print("Topbar actions updated in Dashboard.tsx")
else:
    print("ERROR: target_topbar not found in Dashboard.tsx")

# 3. Add view === "repairs" rendering
target_warranties_view = """{view === "warranties" && <Warranties records={records} claims={claims} assignees={initialClaimAssignees} currentStaffId={session.id} canRecordCosts={session.role === "Owner" || session.role === "Technician"} onClaimUpdate={(updated) => setClaims((current) => current.map((claim) => claim.id === updated.id ? updated : claim))} />}"""

replacement_warranties_view = """{view === "warranties" && <Warranties records={records} claims={claims} assignees={initialClaimAssignees} currentStaffId={session.id} canRecordCosts={session.role === "Owner" || session.role === "Technician"} onClaimUpdate={(updated) => setClaims((current) => current.map((claim) => claim.id === updated.id ? updated : claim))} />}
        {view === "repairs" && <RepairsPanel canManage={isOwner || session.role === "Technician"} onAuditChange={refreshAudit} openCreateTrigger={repairTrigger} />}"""

if target_warranties_view in code:
    code = code.replace(target_warranties_view, replacement_warranties_view)
    print("view === repairs view added to Dashboard.tsx")
else:
    print("ERROR: target_warranties_view not found in Dashboard.tsx")

# 4. Append Quick Sticker & Hotkeys Modals before final return close
target_close_div = """      {modalOpen && ("""

modals_markup = """      {/* Quick Shelf Price Tag Sticker Modal (F4) */}
      {showQuickStickerModal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setShowQuickStickerModal(false)}>
          <section className="modal" role="dialog" style={{ maxWidth: "540px" }}>
            <div className="modal-head">
              <div>
                <div className="eyebrow">Quick Barcode & Shelf Label (F4)</div>
                <h2>🏷️ Direct Thermal Price Sticker (50x30mm)</h2>
              </div>
              <button className="close-button" onClick={() => setShowQuickStickerModal(false)}>x</button>
            </div>
            <div className="modal-body" style={{ padding: "20px" }}>
              <label style={{ display: "block", marginBottom: "12px", fontWeight: "bold" }}>
                Scan Barcode or Search Serial / Model:
                <input
                  type="text"
                  autoFocus
                  placeholder="Scan serial or type e.g. DELL-5420..."
                  value={stickerSearch}
                  onChange={(e) => setStickerSearch(e.target.value)}
                  style={{ width: "100%", padding: "10px", marginTop: "6px", fontSize: "14px" }}
                />
              </label>

              <div style={{ maxHeight: "280px", overflowY: "auto", border: "1px solid var(--line)", borderRadius: "8px" }}>
                {records
                  .filter((d) => {
                    if (!stickerSearch.trim()) return d.lifecycleStatus === "Ready";
                    const q = stickerSearch.toLowerCase();
                    return d.serial.toLowerCase().includes(q) || d.name.toLowerCase().includes(q) || d.model.toLowerCase().includes(q);
                  })
                  .slice(0, 8)
                  .map((device) => (
                    <div
                      key={device.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 14px",
                        borderBottom: "1px solid var(--line)",
                      }}
                    >
                      <div>
                        <strong>{device.name}</strong>
                        <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                          SN: <code>{device.serial}</code> | Grade {device.grade} | {device.processor}
                        </div>
                      </div>
                      <a
                        className="button primary small"
                        href={`/sticker/${device.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ padding: "6px 12px", fontSize: "12px", textDecoration: "none" }}
                      >
                        🖨️ Print Label
                      </a>
                    </div>
                  ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* POS Shortcuts Cheat-Sheet Modal (F1) */}
      {showHotkeysModal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setShowHotkeysModal(false)}>
          <section className="modal" role="dialog" style={{ maxWidth: "500px" }}>
            <div className="modal-head">
              <div>
                <div className="eyebrow">Keyboard Accelerators</div>
                <h2>⌨️ POS & Workshop Hotkeys</h2>
              </div>
              <button className="close-button" onClick={() => setShowHotkeysModal(false)}>x</button>
            </div>
            <div className="modal-body" style={{ padding: "20px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <tr style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "10px 0" }}><kbd className="hotkey-pill"><kbd>F1</kbd></kbd></td>
                    <td style={{ padding: "10px 0" }}><strong>Toggle Hotkeys Help</strong><br/><small style={{ color: "var(--muted)" }}>Open or close this shortcuts guide</small></td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "10px 0" }}><kbd className="hotkey-pill"><kbd>F2</kbd></kbd></td>
                    <td style={{ padding: "10px 0" }}><strong>Cashier POS Sales</strong><br/><small style={{ color: "var(--muted)" }}>Jump straight to sale activation & invoicing</small></td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "10px 0" }}><kbd className="hotkey-pill"><kbd>F4</kbd></kbd></td>
                    <td style={{ padding: "10px 0" }}><strong>Quick Price Sticker (50x30mm)</strong><br/><small style={{ color: "var(--muted)" }}>Scan serial and print Code128 thermal tag</small></td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "10px 0" }}><kbd className="hotkey-pill"><kbd>F9</kbd></kbd></td>
                    <td style={{ padding: "10px 0" }}><strong>Customer Repair Workshop</strong><br/><small style={{ color: "var(--muted)" }}>Open New Repair Job Sheet intake modal</small></td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "10px 0" }}><kbd className="hotkey-pill"><kbd>Ctrl</kbd> + <kbd>D</kbd></kbd></td>
                    <td style={{ padding: "10px 0" }}><strong>Toggle Dark / Light Mode</strong><br/><small style={{ color: "var(--muted)" }}>Protect eyes during long workshop shifts</small></td>
                  </tr>
                  <tr>
                    <td style={{ padding: "10px 0" }}><kbd className="hotkey-pill"><kbd>Esc</kbd></kbd></td>
                    <td style={{ padding: "10px 0" }}><strong>Close Active Dialog</strong><br/><small style={{ color: "var(--muted)" }}>Dismiss any open popup or modal</small></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {modalOpen && ("""

if target_close_div in code:
    code = code.replace(target_close_div, modals_markup)
    print("Quick Sticker & Hotkeys modals injected into Dashboard.tsx")
else:
    print("ERROR: target_close_div not found in Dashboard.tsx")

with open(path, "w", encoding="utf-8") as f:
    f.write(code)

print("Dashboard.tsx update complete!")
