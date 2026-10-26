export const repairStatuses = [
  "Received",
  "Diagnosing",
  "Waiting for Parts",
  "Repairing",
  "Completed / Ready",
  "Delivered",
  "Unrepairable / Returned",
] as const;

export type RepairStatus = (typeof repairStatuses)[number];

export interface CustomerRepairJob {
  id: string;
  jobNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  deviceBrand: string;
  deviceModel: string;
  serial: string;
  devicePasswordPin: string;
  accessoriesReceived: string;
  reportedFault: string;
  physicalCondition: string;
  status: RepairStatus;
  assignedTechnician: string;
  technicianNotes: string;
  estimatedCostCents: number;
  advancePaidCents: number;
  partsCostCents: number;
  laborFeeCents: number;
  totalAmountCents: number;
  balanceDueCents: number;
  formattedTotalAmount: string;
  formattedBalanceDue: string;
  formattedAdvancePaid: string;
  receivedAt: string;
  completedAt: string | null;
  deliveredAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRepairInput {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deviceBrand: string;
  deviceModel: string;
  serial?: string;
  devicePasswordPin?: string;
  accessoriesReceived?: string;
  reportedFault: string;
  physicalCondition?: string;
  estimatedCostLkr?: string;
  advancePaidLkr?: string;
  assignedTechnician?: string;
}

export interface UpdateRepairInput {
  status?: RepairStatus;
  assignedTechnician?: string;
  technicianNotes?: string;
  partsCostLkr?: string;
  laborFeeLkr?: string;
  advancePaidLkr?: string;
  accessoriesReceived?: string;
}
