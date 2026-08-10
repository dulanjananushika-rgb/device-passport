import Image from "next/image";
import Link from "next/link";
import type { ShopSettings } from "../../lib/operations";

export function ShopBrand({ settings, href = "/", inverse = false }: { settings: ShopSettings; href?: string; inverse?: boolean }) {
  return (
    <Link className={`shop-brand ${inverse ? "inverse" : ""}`} href={href}>
      {settings.logoDataUrl
        ? <Image className="shop-brand-logo" src={settings.logoDataUrl} alt={`${settings.shopName} logo`} width={34} height={34} unoptimized />
        : <span className="brand-mark">{settings.shopName.slice(0, 1).toUpperCase()}</span>}
      <span className="shop-brand-copy"><strong>{settings.shopName}</strong><small>DevicePassport</small></span>
    </Link>
  );
}
