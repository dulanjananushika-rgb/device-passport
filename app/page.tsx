import type { Metadata } from "next";
import { Dashboard } from "./ui/Dashboard";

export const metadata: Metadata = {
  title: "DevicePassport | Verified device health",
  description:
    "Create transparent health reports, QR device passports, and track warranties for refurbished laptops.",
};

export default function Home() {
  return <Dashboard />;
}
