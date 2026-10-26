import test from "node:test";
import assert from "node:assert/strict";
import { formatCurrency, parseCurrencyAmountToCents, formatMinorUnitsWithSettings } from "../lib/finance.ts";
import { calculateTaxForSale } from "../lib/tax.ts";
import { getCarrierTrackingUrl, formatCarrierTrackingInfo } from "../lib/shipping.ts";
import {
  checkRefurbishedBatteryCompliance,
  R2V3_COSMETIC_GRADES,
  INTERNATIONAL_KEYBOARD_LAYOUTS,
  POWER_ADAPTER_PLUG_TYPES,
  LEGAL_DISCLAIMERS,
} from "../lib/international-standards.ts";
import { generateCode128Svg } from "../lib/barcode-stickers.ts";

test("Feature 1: Universal Multi-Currency & Locale Engine formats major world currencies", () => {
  // USD prefix
  assert.equal(formatCurrency(129900, { symbol: "$", position: "prefix" }), "$1,299.00");

  // GBP prefix
  assert.equal(formatCurrency(84900, { symbol: "£", position: "prefix" }), "£849.00");

  // EUR suffix
  assert.equal(formatCurrency(99900, { symbol: "€", position: "suffix" }), "999.00 €");

  // AED suffix
  assert.equal(formatCurrency(250000, { symbol: "AED", position: "suffix" }), "2,500.00 AED");

  // AUD prefix
  assert.equal(formatCurrency(145000, { symbol: "A$", position: "prefix" }), "A$1,450.00");

  // formatMinorUnitsWithSettings
  assert.equal(
    formatMinorUnitsWithSettings(75000, { currencySymbol: "£", currencyPosition: "prefix" }),
    "£750.00"
  );

  // Parsing decimal amounts to minor-unit integer cents
  assert.equal(parseCurrencyAmountToCents("1299.99", "Price"), 129999);
  assert.equal(parseCurrencyAmountToCents("0.50", "Fee"), 50);
  assert.equal(parseCurrencyAmountToCents("100", "Amount"), 10000);
});

test("Feature 2: International Tax Engine handles Standard VAT, US Sales Tax and UK/EU Margin Scheme", () => {
  // 1. Standard VAT Inclusive (20% on $1,200 total)
  const standardInclusive = calculateTaxForSale({
    salePriceCents: 120000,
    costPriceCents: 80000,
    taxRatePercent: 20,
    taxInclusive: true,
    taxMode: "standard",
  });
  assert.equal(standardInclusive.taxAmountCents, 20000); // 1200 - (1200 / 1.2) = 200
  assert.equal(standardInclusive.isCustomerVisible, true);

  // 2. US State Sales Tax (8.25% added to $1,000)
  const usSalesTax = calculateTaxForSale({
    salePriceCents: 100000,
    costPriceCents: 60000,
    taxRatePercent: 8.25,
    taxMode: "us_sales_tax",
  });
  assert.equal(usSalesTax.taxAmountCents, 8250); // $82.50
  assert.equal(usSalesTax.isCustomerVisible, true);
  assert.match(usSalesTax.taxLabel, /Sales Tax/);

  // 3. UK/EU Second-Hand Margin Scheme (Sale: £900, Intake Cost: £600 => Profit Margin: £300)
  // VAT is calculated strictly on the £300 margin: 300 * (20 / 120) = £50 VAT
  const marginScheme = calculateTaxForSale({
    salePriceCents: 90000,
    costPriceCents: 60000,
    taxRatePercent: 20,
    taxMode: "uk_eu_margin_scheme",
  });
  assert.equal(marginScheme.profitMarginCents, 30000);
  assert.equal(marginScheme.taxAmountCents, 5000); // £50.00 VAT on margin
  // Under EU Directive Art 226(11), VAT must NOT be displayed separately to retail customer
  assert.equal(marginScheme.isCustomerVisible, false);
  assert.match(marginScheme.mandatoryNotice, /Margin scheme — Second-hand goods/);
});

test("Feature 3: Global Courier Logistics generates verified 1-click tracking links", () => {
  // FedEx
  const fedex = formatCarrierTrackingInfo("FedEx", "794829381023");
  assert.equal(fedex.hasLiveTracking, true);
  assert.match(fedex.trackingUrl, /fedex\.com\/fedextrack\/\?trknbr=794829381023/);

  // UPS
  const ups = formatCarrierTrackingInfo("UPS", "1Z9999999999999999");
  assert.equal(ups.hasLiveTracking, true);
  assert.match(ups.trackingUrl, /ups\.com\/track\?tracknum=1Z9999999999999999/);

  // DHL Express
  const dhl = formatCarrierTrackingInfo("DHL Express", "1234567890");
  assert.equal(dhl.hasLiveTracking, true);
  assert.match(dhl.trackingUrl, /dhl\.com\/en\/express\/tracking\.html\?AWB=1234567890/);

  // Royal Mail
  const royalMail = formatCarrierTrackingInfo("Royal Mail", "GB123456789");
  assert.equal(royalMail.hasLiveTracking, true);
  assert.match(royalMail.trackingUrl, /royalmail\.com\/track-your-item#\/tracking-results\/GB123456789/);
});

test("Feature 4: International R2v3 Grading, Battery 80% Threshold, and Legal Standards", () => {
  // Battery health validation against international 80% threshold
  const pristine = checkRefurbishedBatteryCompliance(92);
  assert.equal(pristine.isCompliant, true);
  assert.equal(pristine.tier, "Pristine");

  const compliant = checkRefurbishedBatteryCompliance(81);
  assert.equal(compliant.isCompliant, true);
  assert.equal(compliant.tier, "Certified");

  const deficient = checkRefurbishedBatteryCompliance(74);
  assert.equal(deficient.isCompliant, false);
  assert.equal(deficient.tier, "Deficient");
  assert.match(deficient.badgeLabel, /Below 80% Threshold/);

  // R2v3 Cosmetic Grading
  assert.ok(R2V3_COSMETIC_GRADES["A+"]);
  assert.ok(R2V3_COSMETIC_GRADES["A"]);
  assert.ok(R2V3_COSMETIC_GRADES["B"]);
  assert.ok(R2V3_COSMETIC_GRADES["C"]);
  assert.ok(R2V3_COSMETIC_GRADES["D"]);

  // Keyboards & Plugs
  assert.ok(INTERNATIONAL_KEYBOARD_LAYOUTS.includes("US QWERTY"));
  assert.ok(INTERNATIONAL_KEYBOARD_LAYOUTS.includes("UK English"));
  assert.ok(INTERNATIONAL_KEYBOARD_LAYOUTS.includes("German QWERTZ"));
  assert.ok(INTERNATIONAL_KEYBOARD_LAYOUTS.includes("French AZERTY"));
  assert.ok(POWER_ADAPTER_PLUG_TYPES.some((p) => p.includes("US")));
  assert.ok(POWER_ADAPTER_PLUG_TYPES.some((p) => p.includes("UK")));

  // FTC Magnuson-Moss and EU Disclaimers
  assert.match(LEGAL_DISCLAIMERS.MAGNUSON_MOSS, /Magnuson-Moss Warranty Act/);
  assert.match(LEGAL_DISCLAIMERS.UK_EU_MARGIN_SCHEME, /Article 313/);

  // Code128 vector barcode generation
  const svg = generateCode128Svg("SN-US-2026-X1", 34);
  assert.match(svg, /<svg/);
  assert.match(svg, /<rect/);
});
