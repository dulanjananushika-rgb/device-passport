import os

path = r"D:\Software_Projects\deploy\device-passport\app\ui\Dashboard.tsx"
with open(path, "r", encoding="utf-8") as f:
    code = f.read().replace("\r\n", "\n")

target_section = """            <section className="panel settings-card" style={{ marginTop: '20px' }}>
              <div className="panel-head">
                <div>
                  <h3 className="panel-title">Tax & Multi-Currency Configuration</h3>
                  <p className="panel-subtitle">National tax registration (TIN/VAT) & international currency display</p>
                </div>
              </div>
              <div className="settings-fields">
                <label>
                  Currency code
                  <select
                    value={form.currencyCode || "LKR"}
                    onChange={(event) => {
                      const code = event.target.value;
                      const symbols: Record<string, string> = {
                        LKR: "Rs.",
                        USD: "$",
                        EUR: "€",
                        GBP: "£",
                        INR: "₹",
                        AED: "AED",
                      };
                      change("currencyCode", code);
                      change("currencySymbol", symbols[code] || code);
                    }}
                  >
                    <option value="LKR">LKR (Sri Lankan Rupee)</option>
                    <option value="USD">USD (US Dollar)</option>
                    <option value="EUR">EUR (Euro)</option>
                    <option value="GBP">GBP (British Pound)</option>
                    <option value="INR">INR (Indian Rupee)</option>
                    <option value="AED">AED (UAE Dirham)</option>
                  </select>
                </label>
                <label>
                  Currency symbol
                  <input
                    value={form.currencySymbol || "Rs."}
                    onChange={(event) => change("currencySymbol", event.target.value)}
                    maxLength={10}
                    placeholder="Rs. or $"
                  />
                </label>
                <label>
                  TIN / VAT Registration #
                  <input
                    value={form.taxId || ""}
                    onChange={(event) => change("taxId", event.target.value)}
                    maxLength={50}
                    placeholder="e.g. 102938475-7000"
                  />
                </label>
                <label>
                  Tax / VAT rate (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={form.taxRatePercent !== undefined ? form.taxRatePercent : 0}
                    onChange={(event) => change("taxRatePercent", Number(event.target.value))}
                  />
                </label>
                <label className="full-field" style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", marginTop: "8px" }}>
                  <input
                    type="checkbox"
                    checked={form.taxInclusive !== false}
                    onChange={(event) => change("taxInclusive", event.target.checked)}
                  />
                  <span>Prices in shop are VAT inclusive (standard retail display)</span>
                </label>
              </div>
            </section>"""

replacement_section = """            <section className="panel settings-card" style={{ marginTop: '20px' }}>
              <div className="panel-head">
                <div>
                  <h3 className="panel-title">🌍 Global Multi-Currency & International Tax Engine</h3>
                  <p className="panel-subtitle">Multi-currency formatting, UK/EU Margin Scheme, US Sales Tax, and carrier tracking</p>
                </div>
              </div>
              <div className="settings-fields">
                <label>
                  Currency code
                  <select
                    value={form.currencyCode || "USD"}
                    onChange={(event) => {
                      const code = event.target.value;
                      const symbols: Record<string, string> = {
                        USD: "$",
                        EUR: "€",
                        GBP: "£",
                        AUD: "A$",
                        CAD: "C$",
                        AED: "AED",
                        JPY: "¥",
                        INR: "₹",
                        LKR: "Rs.",
                      };
                      change("currencyCode", code);
                      change("currencySymbol", symbols[code] || code);
                    }}
                  >
                    <option value="USD">USD - United States Dollar ($)</option>
                    <option value="EUR">EUR - Euro (€)</option>
                    <option value="GBP">GBP - British Pound (£)</option>
                    <option value="AUD">AUD - Australian Dollar (A$)</option>
                    <option value="CAD">CAD - Canadian Dollar (C$)</option>
                    <option value="AED">AED - United Arab Emirates Dirham</option>
                    <option value="JPY">JPY - Japanese Yen (¥)</option>
                    <option value="INR">INR - Indian Rupee (₹)</option>
                    <option value="LKR">LKR - Sri Lankan Rupee (Rs.)</option>
                  </select>
                </label>
                <label>
                  Currency symbol
                  <input
                    value={form.currencySymbol || "$"}
                    onChange={(event) => change("currencySymbol", event.target.value)}
                    maxLength={10}
                    placeholder="$ or €"
                  />
                </label>
                <label>
                  Symbol position
                  <select
                    value={form.currencyPosition || "prefix"}
                    onChange={(event) => change("currencyPosition", event.target.value as "prefix" | "suffix")}
                  >
                    <option value="prefix">Prefix (e.g. $1,299.00 / £850.00)</option>
                    <option value="suffix">Suffix (e.g. 1.299,00 € / 2500 AED)</option>
                  </select>
                </label>
                <label>
                  Date format
                  <select
                    value={form.dateFormat || "MM/DD/YYYY"}
                    onChange={(event) => change("dateFormat", event.target.value as any)}
                  >
                    <option value="MM/DD/YYYY">MM/DD/YYYY (USA & Canada)</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY (UK, Europe, Australia)</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD (ISO 8601 Standard)</option>
                  </select>
                </label>
                <label>
                  Tax Compliance Engine
                  <select
                    value={form.taxMode || "standard"}
                    onChange={(event) => change("taxMode", event.target.value as any)}
                  >
                    <option value="standard">Standard VAT / GST (Australia, Canada, UAE)</option>
                    <option value="us_sales_tax">US State & Local Sales Tax</option>
                    <option value="uk_eu_margin_scheme">UK / EU Second-Hand Margin Scheme (HMRC / Art 313)</option>
                  </select>
                </label>
                <label>
                  Default Courier / Carrier
                  <select
                    value={form.defaultShippingCarrier || "FedEx"}
                    onChange={(event) => change("defaultShippingCarrier", event.target.value)}
                  >
                    <option value="FedEx">FedEx Express</option>
                    <option value="UPS">UPS (United Parcel Service)</option>
                    <option value="DHL">DHL Express</option>
                    <option value="USPS">USPS (United States Postal Service)</option>
                    <option value="Royal Mail">Royal Mail (UK)</option>
                    <option value="DPD">DPD (Europe)</option>
                    <option value="Australia Post">Australia Post</option>
                    <option value="Domex">Domex (South Asia)</option>
                  </select>
                </label>
                <label>
                  Tax ID / VAT / EIN / ABN #
                  <input
                    value={form.taxId || ""}
                    onChange={(event) => change("taxId", event.target.value)}
                    maxLength={50}
                    placeholder="e.g. US EIN 12-3456789 or GB 123 4567 89"
                  />
                </label>
                <label>
                  Tax / VAT rate (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={form.taxRatePercent !== undefined ? form.taxRatePercent : 0}
                    onChange={(event) => change("taxRatePercent", Number(event.target.value))}
                  />
                </label>
                <label className="full-field" style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", marginTop: "8px" }}>
                  <input
                    type="checkbox"
                    checked={form.taxInclusive !== false}
                    onChange={(event) => change("taxInclusive", event.target.checked)}
                  />
                  <span>Retail prices are tax inclusive (applies to Standard VAT/GST)</span>
                </label>
              </div>
            </section>"""

if target_section in code:
    code = code.replace(target_section, replacement_section)
    with open(path, "w", encoding="utf-8") as f:
        f.write(code)
    print("Dashboard.tsx settings panel updated successfully!")
else:
    print("ERROR: target_section not found in Dashboard.tsx")
