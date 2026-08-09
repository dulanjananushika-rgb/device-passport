import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "devicepassport.lk";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    metadataBase: new URL(origin),
    title: {
      default: "DevicePassport",
      template: "%s | DevicePassport",
    },
    description:
      "Verified device health reports and digital warranties for refurbished laptops.",
    icons: {
      icon: "/og.png",
      shortcut: "/og.png",
    },
    openGraph: {
      type: "website",
      title: "DevicePassport",
      description: "Every refurbished laptop deserves proof.",
      images: [{ url: `${origin}/og.png`, width: 1734, height: 907, alt: "DevicePassport verified laptop health report" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "DevicePassport",
      description: "Every refurbished laptop deserves proof.",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
