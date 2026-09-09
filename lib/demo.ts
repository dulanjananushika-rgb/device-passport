// Intentionally public credentials for the disposable portfolio demo only.
export const DEMO_EMAIL = "demo@devicepassport.example";
export const DEMO_PASSWORD = "ExploreDevicePassport!";

export function isPortfolioDemo() {
  return process.env.DEVICEPASSPORT_DEMO === "true";
}
