export const deviceLifecycleStatuses = ["Draft", "Ready", "Sold"] as const;
export type DeviceLifecycleStatus = (typeof deviceLifecycleStatuses)[number];

export type DeviceSale = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  invoiceReference: string;
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
};
