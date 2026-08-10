export const staffRoles = ["Owner", "Technician", "Support"] as const;
export type StaffRole = (typeof staffRoles)[number];

export type StaffAccount = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ShopSettings = {
  shopName: string;
  tagline: string;
  contactEmail: string;
  phone: string;
  address: string;
  warrantyMonths: number;
  warrantyTerms: string;
  logoDataUrl: string;
};

export type AuditEvent = {
  id: string;
  actor: string;
  action: string;
  summary: string;
  createdAt: string;
};

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && staffRoles.includes(value as StaffRole);
}

export function canCreatePassports(role: StaffRole) {
  return role === "Owner" || role === "Technician";
}

export function canActivateSales(role: StaffRole) {
  return role === "Owner" || role === "Technician";
}

export function canRecordServiceCosts(role: StaffRole) {
  return role === "Owner" || role === "Technician";
}

export function canViewFinance(role: StaffRole) {
  return role === "Owner";
}

export function canAccessProcurement(role: StaffRole) {
  return role === "Owner" || role === "Technician";
}

export function canManageProcurement(role: StaffRole) {
  return role === "Owner";
}

export function canManageStaff(role: StaffRole) {
  return role === "Owner";
}

export function canManageSettings(role: StaffRole) {
  return role === "Owner";
}
