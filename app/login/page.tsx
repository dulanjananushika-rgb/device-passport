import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "../../lib/auth";
import { getShopSettings } from "../../lib/database";
import { ShopBrand } from "../ui/ShopBrand";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Shop sign in",
  description: "Sign in to your DevicePassport shop workspace.",
};

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  const settings = getShopSettings();

  return (
    <main className="login-page">
      <section className="login-visual">
        <div className="login-brand"><ShopBrand settings={settings} href="/login" inverse /></div>
        <div className="login-copy">
          <div className="hero-kicker">Independent shop software</div>
          <h1>Turn every laptop test into buyer confidence.</h1>
          <p>{settings.tagline}. Verified hardware health, public QR passports, and digital warranties—owned by {settings.shopName}.</p>
          <div className="login-proof-card">
            <span className="grade-badge">A</span>
            <span><strong>92 / 100</strong><small>Verified health score</small></span>
            <span className="verified-chip">Report verified</span>
          </div>
        </div>
      </section>
      <section className="login-panel">
        <LoginForm shopName={settings.shopName} />
      </section>
    </main>
  );
}
