export const notificationStatuses = ["Pending", "Opened", "Done", "Dismissed", "Resolved"] as const;
export type NotificationStatus = (typeof notificationStatuses)[number];

export const notificationTypes = ["NewClaim", "ClaimOverdue", "Warranty30", "Warranty7", "ReadyDevice"] as const;
export type NotificationType = (typeof notificationTypes)[number];

export const notificationChannels = ["WhatsApp", "Email"] as const;
export type NotificationChannel = (typeof notificationChannels)[number];

export type NotificationSeverity = "Info" | "Warning" | "Urgent";

export type NotificationAction = {
  id: string;
  action: string;
  channel: NotificationChannel | "";
  actor: string;
  createdAt: string;
};

export type NotificationItem = {
  id: string;
  key: string;
  type: NotificationType;
  severity: NotificationSeverity;
  status: NotificationStatus;
  entityId: string;
  title: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deviceName: string;
  message: string;
  actionUrl: string;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  actions: NotificationAction[];
};

export function isNotificationChannel(value: unknown): value is NotificationChannel {
  return typeof value === "string" && notificationChannels.includes(value as NotificationChannel);
}

export function isNotificationStatusAction(value: unknown): value is "Pending" | "Done" | "Dismissed" {
  return value === "Pending" || value === "Done" || value === "Dismissed";
}
