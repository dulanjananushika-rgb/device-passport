import os

path = r"D:\Software_Projects\deploy\device-passport\app\ui\SalesPanel.tsx"
with open(path, "r", encoding="utf-8") as f:
    code = f.read().replace("\r\n", "\n")

target_block = """                {/* Batch A: Delivery Method & Courier COD */}
                <label>Fulfillment Mode
                  <select value={form.deliveryMethod} onChange={(e) => change("deliveryMethod", e.target.value)}>
                    <option value="In-Store Pickup">In-Store Counter Pickup</option>
                    <option value="Courier COD">Courier Doorstep Delivery (C.O.D.)</option>
                  </select>
                </label>

                {form.deliveryMethod === "Courier COD" ? (
                  <label>Courier Service
                    <input value={form.courierName} onChange={(e) => change("courierName", e.target.value)} placeholder="e.g. Prompt Xpress / Domex" />
                  </label>
                ) : (
                  <label>Discount Amount (LKR)
                    <input type="number" step="0.01" value={form.discountLkr} onChange={(e) => change("discountLkr", e.target.value)} placeholder="e.g. 5000" />
                  </label>
                )}

                {form.deliveryMethod === "Courier COD" && (
                  <label style={{ gridColumn: 'span 2' }}>Courier Tracking Waybill #
                    <input value={form.courierWaybill} onChange={(e) => change("courierWaybill", e.target.value)} placeholder="DOM-2026-99120" />
                  </label>
                )}
                <label>Payment Method
                  <select value={form.paymentMethod} onChange={(event) => change("paymentMethod", event.target.value)}>
                    <option value="Cash">Cash (Physical Drawer)</option>
                    <option value="Card">Credit / Debit Card (POS Terminal)</option>
                    <option value="Bank Transfer">Bank Transfer (Direct Deposit)</option>
                    <option value="Installment">Installment / BNPL (Koko, Mintpay)</option>
                    <option value="Split">Split Payment (Multiple Methods)</option>
                  </select>
                </label>"""

replacement_block = """                {/* Global Fulfillment Mode & Courier */}
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
                </label>"""

if target_block in code:
    code = code.replace(target_block, replacement_block)
    with open(path, "w", encoding="utf-8") as f:
        f.write(code)
    print("app/ui/SalesPanel.tsx updated successfully!")
else:
    print("target_block not found in app/ui/SalesPanel.tsx")
