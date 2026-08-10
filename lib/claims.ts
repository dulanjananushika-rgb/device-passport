export const claimStatuses = ["New", "Reviewing", "Approved", "Rejected", "Completed"] as const;
export type ClaimStatus = (typeof claimStatuses)[number];

export const claimPriorities = ["Low", "Normal", "High", "Urgent"] as const;
export type ClaimPriority = (typeof claimPriorities)[number];

export const claimCategories = ["Battery", "Display", "Keyboard", "Storage", "Ports", "Connectivity", "Other"] as const;
export type ClaimCategory = (typeof claimCategories)[number];

export type ClaimPhotoInput = {
  name: string;
  dataUrl: string;
};

export type WarrantyClaimInput = {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  category: ClaimCategory;
  description: string;
  photos: ClaimPhotoInput[];
};

export type WarrantyClaimSummary = {
  id: string;
  trackingToken: string;
  deviceId: string;
  deviceName: string;
  serial: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  category: ClaimCategory;
  description: string;
  status: ClaimStatus;
  priority: ClaimPriority;
  assignedToId: string;
  assignedToName: string;
  dueDate: string;
  warrantyValid: boolean;
  warrantyEnds: string;
  createdAt: string;
  updatedAt: string;
  photoCount: number;
  internalNotes: ClaimInternalNote[];
};

export type ClaimEvent = {
  id: string;
  status: ClaimStatus;
  note: string;
  actor: string;
  createdAt: string;
};

export type ClaimInternalNote = {
  id: string;
  note: string;
  actor: string;
  createdAt: string;
};

export type ClaimAssignee = {
  id: string;
  name: string;
  role: "Owner" | "Technician" | "Support";
};

export type WarrantyClaimUpdate = {
  status?: ClaimStatus;
  publicNote?: string;
  priority?: ClaimPriority;
  assignedToId?: string;
  dueDate?: string;
  internalNote?: string;
};

export type PublicWarrantyClaim = Omit<WarrantyClaimSummary, "trackingToken" | "customerEmail" | "customerPhone" | "priority" | "assignedToId" | "assignedToName" | "dueDate" | "internalNotes"> & {
  photos: Array<{ id: string; name: string; mimeType: string }>;
  events: ClaimEvent[];
};

export function isClaimStatus(value: unknown): value is ClaimStatus {
  return typeof value === "string" && claimStatuses.includes(value as ClaimStatus);
}

export function isClaimPriority(value: unknown): value is ClaimPriority {
  return typeof value === "string" && claimPriorities.includes(value as ClaimPriority);
}

export function isClaimCategory(value: unknown): value is ClaimCategory {
  return typeof value === "string" && claimCategories.includes(value as ClaimCategory);
}
