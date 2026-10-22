// Intentionally public credentials for the disposable portfolio demo only.
export type DemoRole = "Owner" | "Technician" | "Support";

export interface DemoAccountInfo {
  role: DemoRole;
  name: string;
  email: string;
  password: string;
  title: string;
  badge: string;
  tagline: string;
  permissions: string;
}

export const DEMO_PASSWORD = "ExploreDevicePassport!";
export const DEMO_DEV_PASSWORD = "devicepass";

export const DEMO_ACCOUNTS: DemoAccountInfo[] = [
  {
    role: "Owner",
    name: "Demo Shop Owner",
    email: "owner@lapmart.lk",
    password: DEMO_DEV_PASSWORD,
    title: "Shop Owner",
    badge: "👑 Owner (Full Access)",
    tagline: "P&L Analytics, Intake, Settings",
    permissions: "Procurement, Intake, Settings, Staff, Device Tests, Warranties",
  },
  {
    role: "Technician",
    name: "Demo Lead Technician",
    email: "technician@devicepassport.example",
    password: DEMO_DEV_PASSWORD,
    title: "Lead Technician",
    badge: "🔧 Technician",
    tagline: "Workshop Bench & Diagnostics",
    permissions: "Intake Queue, Diagnostics, Hardware Tests, Repair Costs",
  },
  {
    role: "Support",
    name: "Demo Customer Support",
    email: "support@devicepassport.example",
    password: DEMO_DEV_PASSWORD,
    title: "Customer Support",
    badge: "🎧 Support Desk",
    tagline: "Customer Handover & Claims",
    permissions: "Handover Search, Warranty Claims Inbox, Status Tracking",
  },
];

export const DEMO_EMAIL = DEMO_ACCOUNTS[0].email;

export function isPortfolioDemo() {
  if (process.env.DEVICEPASSPORT_DEMO === "true") return true;
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return true;
  // Netlify or portfolio preview environments default to demo-friendly mode
  if (process.env.NETLIFY && process.env.DEVICEPASSPORT_PRODUCTION_SHOP !== "true") return true;
  if (process.env.VERCEL && process.env.DEVICEPASSPORT_PRODUCTION_SHOP !== "true") return true;
  return true;
}
