export const procurementStatuses = ["Awaiting test", "In refurbishment", "Ready", "Sold", "Archived"] as const;
export type ProcurementStatus = (typeof procurementStatuses)[number];
export const refurbishmentCategories = ["Inspection", "Part", "Repair", "Cleaning", "Other"] as const;
export type RefurbishmentCategory = (typeof refurbishmentCategories)[number];

export type Supplier = {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  active: boolean;
  createdAt: string;
};

export type RefurbishmentTask = {
  id: string;
  category: RefurbishmentCategory;
  description: string;
  costCents: number;
  completed: boolean;
  createdBy: string;
  completedBy: string;
  createdAt: string;
  completedAt: string;
};

export type StockIntake = {
  id: string;
  supplierId: string;
  supplierName: string;
  deviceId: string;
  deviceName: string;
  model: string;
  serial: string;
  supplierInvoice: string;
  purchasedAt: string;
  purchaseCostCents: number;
  refurbishmentCostCents: number;
  salePriceCents: number;
  warrantyCostCents: number;
  grossProfitCents: number | null;
  status: ProcurementStatus;
  notes: string;
  ageDays: number;
  openTaskCount: number;
  tasks: RefurbishmentTask[];
  createdAt: string;
  updatedAt: string;
};

export type SupplierPerformance = {
  supplierId: string;
  supplierName: string;
  intakes: number;
  linked: number;
  sold: number;
  claims: number;
  affectedDevices: number;
  failureRate: number;
  averagePurchaseCostCents: number;
  stockValueCents: number;
  grossProfitCents: number;
};

export type ProcurementDashboard = {
  generatedAt: string;
  financialsVisible: boolean;
  metrics: {
    totalIntakes: number;
    awaitingTest: number;
    inRefurbishment: number;
    ready: number;
    agedStock: number;
    openTasks: number;
    inventoryValueCents: number;
  };
  suppliers: Supplier[];
  supplierPerformance: SupplierPerformance[];
  intakes: StockIntake[];
};
