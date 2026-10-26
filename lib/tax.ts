/**
 * International Tax Engine for DevicePassport
 * Supports:
 * 1. Standard VAT / GST (Australia, Canada, India, UAE, Sri Lanka, etc.)
 * 2. US State & Local Sales Tax
 * 3. UK & EU Second-Hand Goods Margin Scheme (HMRC Notice 718 / EU VAT Directive 2006/112/EC Art 313)
 */

export type TaxMode = "standard" | "us_sales_tax" | "uk_eu_margin_scheme";

export interface TaxCalculationParams {
  salePriceCents: number;
  costPriceCents?: number;
  taxRatePercent: number;
  taxInclusive?: boolean;
  taxMode?: TaxMode;
}

export interface TaxCalculationResult {
  taxMode: TaxMode;
  taxRatePercent: number;
  taxAmountCents: number;
  taxableBaseCents: number;
  profitMarginCents: number;
  isCustomerVisible: boolean;
  taxLabel: string;
  mandatoryNotice: string;
}

/**
 * Calculates tax based on the store's selected tax jurisdiction mode.
 */
export function calculateTaxForSale(params: TaxCalculationParams): TaxCalculationResult {
  const {
    salePriceCents,
    costPriceCents = 0,
    taxRatePercent,
    taxInclusive = true,
    taxMode = "standard",
  } = params;

  if (taxRatePercent <= 0) {
    return {
      taxMode,
      taxRatePercent: 0,
      taxAmountCents: 0,
      taxableBaseCents: salePriceCents,
      profitMarginCents: Math.max(0, salePriceCents - costPriceCents),
      isCustomerVisible: false,
      taxLabel: "No Tax Applied (0%)",
      mandatoryNotice: "",
    };
  }

  // 1. UK / EU Second-Hand Goods Margin Scheme
  if (taxMode === "uk_eu_margin_scheme") {
    // Under the margin scheme, VAT is calculated strictly on the gross profit margin (selling price minus purchase cost).
    // If the item is sold at a loss or break-even, VAT is 0.
    const profitMarginCents = Math.max(0, salePriceCents - costPriceCents);
    
    // In UK (20% standard rate), VAT fraction is 1/6 (or rate / (100 + rate))
    const taxAmountCents = profitMarginCents > 0
      ? Math.round(profitMarginCents * (taxRatePercent / (100 + taxRatePercent)))
      : 0;

    return {
      taxMode: "uk_eu_margin_scheme",
      taxRatePercent,
      taxAmountCents,
      taxableBaseCents: profitMarginCents,
      profitMarginCents,
      // CRITICAL: EU Directive 2006/112/EC Art 226(11) and HMRC Notice 718 explicitly PROHIBIT
      // showing the VAT amount or rate separately to the consumer on a margin scheme invoice
      // so the dealer's purchase cost and profit margin remain confidential.
      isCustomerVisible: false,
      taxLabel: "Margin Scheme VAT (Internal)",
      mandatoryNotice: "Margin scheme — Second-hand goods (Article 313 of Council Directive 2006/112/EC / HMRC Notice 718)",
    };
  }

  // 2. US State & Local Sales Tax
  if (taxMode === "us_sales_tax") {
    // In the US, sales tax is calculated on the sale price and added to the total.
    const taxAmountCents = Math.round(salePriceCents * (taxRatePercent / 100));
    return {
      taxMode: "us_sales_tax",
      taxRatePercent,
      taxAmountCents,
      taxableBaseCents: salePriceCents,
      profitMarginCents: Math.max(0, salePriceCents - costPriceCents),
      isCustomerVisible: true,
      taxLabel: `Sales Tax (${taxRatePercent}%)`,
      mandatoryNotice: "State & Local Sales Tax applied to taxable electronics transaction.",
    };
  }

  // 3. Standard VAT / GST (Australia, Canada, UAE, etc.)
  let taxAmountCents = 0;
  let taxableBaseCents = salePriceCents;

  if (taxInclusive) {
    // Tax is included in the retail sale price
    taxAmountCents = Math.round(salePriceCents - (salePriceCents / (1 + taxRatePercent / 100)));
    taxableBaseCents = salePriceCents - taxAmountCents;
  } else {
    // Tax is added on top of the net price
    taxAmountCents = Math.round(salePriceCents * (taxRatePercent / 100));
    taxableBaseCents = salePriceCents;
  }

  return {
    taxMode: "standard",
    taxRatePercent,
    taxAmountCents,
    taxableBaseCents,
    profitMarginCents: Math.max(0, salePriceCents - costPriceCents),
    isCustomerVisible: true,
    taxLabel: `VAT / GST (${taxRatePercent}% ${taxInclusive ? "Included" : "Added"})`,
    mandatoryNotice: "",
  };
}
