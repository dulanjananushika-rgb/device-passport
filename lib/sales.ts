export const deviceLifecycleStatuses = ["Draft", "Ready", "Reserved", "Sold"] as const;
export type DeviceLifecycleStatus = (typeof deviceLifecycleStatuses)[number];

export const paymentMethods = ["Cash", "Card", "Bank Transfer", "Installment", "Split"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const deliveryMethods = ["In-Store Pickup", "Courier COD"] as const;
export type DeliveryMethod = (typeof deliveryMethods)[number];

export interface WarrantyBreakdown {
  motherboardMonths: number;
  batteryMonths: number;
  screenMonths: number;
  adapterMonths: number;
}

export const defaultWarrantyBreakdown: WarrantyBreakdown = {
  motherboardMonths: 6,
  batteryMonths: 1,
  screenMonths: 3,
  adapterMonths: 1,
};

export const commonAccessories = [
  "Original AC Power Adapter",
  "Power Cable",
  "Laptop Backpack / Sleeve",
  "Wireless / Optical Mouse",
  "Pre-installed Genuine Windows & Office",
] as const;

export type DeviceSale = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  invoiceReference: string;
  salePriceCents?: number;
  paymentMethod?: PaymentMethod;
  cashReceivedCents?: number;
  cardAmountCents?: number;
  bankTransferCents?: number;
  installmentCents?: number;
  paymentReference?: string;
  warrantyBreakdown?: WarrantyBreakdown;
  bundledAccessories?: string[];
  deliveryMethod?: DeliveryMethod;
  courierName?: string;
  courierWaybill?: string;
  courierFeeCents?: number;
  codSettlementStatus?: "Not Applicable" | "In Transit" | "Collected" | "Remitted";
  discountCents?: number;
  discountReason?: string;
  soldAt: string;
  warrantyStarts: string;
  warrantyEnds: string;
  handoverToken: string;
  activatedBy: string;
  createdAt: string;
};

export type SaleActivationInput = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  invoiceReference: string;
  soldAt: string;
  salePriceLkr: string;
  paymentMethod?: PaymentMethod;
  cashReceivedLkr?: string;
  cardAmountLkr?: string;
  bankTransferLkr?: string;
  installmentLkr?: string;
  paymentReference?: string;
  upgradePartIds?: string[];
  warrantyBreakdown?: Partial<WarrantyBreakdown>;
  bundledAccessories?: string[];
  deliveryMethod?: DeliveryMethod;
  courierName?: string;
  courierWaybill?: string;
  courierFeeLkr?: string;
  discountLkr?: string;
  discountReason?: string;
  fromReservationId?: string;
  managerPin?: string;
};

export type SequenceType = "Day 7 Satisfaction" | "Day 30 Battery Care" | "Day 150 Expiry Alert";

export interface FollowUpCustomerItem {
  deviceId: string;
  deviceName: string;
  serial: string;
  invoiceReference: string;
  customerName: string;
  customerPhone: string;
  soldAt: string;
  warrantyEnds: string;
  daysSinceSale: number;
  daysUntilExpiry: number;
  sequenceType: SequenceType;
  messageText: string;
  whatsappUrl: string;
}
