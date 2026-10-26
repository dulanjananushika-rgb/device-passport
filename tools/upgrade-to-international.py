import os

print("Starting international upgrade script...")

# ----------------------------------------------------
# 1. Update lib/operations.ts (ShopSettings type)
# ----------------------------------------------------
ops_path = r"D:\Software_Projects\deploy\device-passport\lib\operations.ts"
with open(ops_path, "r", encoding="utf-8") as f:
    ops_code = f.read().replace("\r\n", "\n")

ops_target = """export type ShopSettings = {
  shopName: string;
  tagline: string;
  contactEmail: string;
  phone: string;
  address: string;
  warrantyMonths: number;
  warrantyTerms: string;
  logoDataUrl: string;
  currencyCode?: string;
  currencySymbol?: string;
  taxId?: string;
  taxRatePercent?: number;
  taxInclusive?: boolean;
};"""

ops_replacement = """export type ShopSettings = {
  shopName: string;
  tagline: string;
  contactEmail: string;
  phone: string;
  address: string;
  warrantyMonths: number;
  warrantyTerms: string;
  logoDataUrl: string;
  currencyCode?: string;
  currencySymbol?: string;
  currencyPosition?: "prefix" | "suffix";
  dateFormat?: "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
  taxMode?: "standard" | "us_sales_tax" | "uk_eu_margin_scheme";
  defaultShippingCarrier?: string;
  taxId?: string;
  taxRatePercent?: number;
  taxInclusive?: boolean;
};"""

if ops_target in ops_code:
    ops_code = ops_code.replace(ops_target, ops_replacement)
    with open(ops_path, "w", encoding="utf-8") as f:
        f.write(ops_code)
    print("lib/operations.ts updated successfully")
else:
    print("ops_target not found in lib/operations.ts")

# ----------------------------------------------------
# 2. Update lib/database.ts (SettingsRow & migrations)
# ----------------------------------------------------
db_path = r"D:\Software_Projects\deploy\device-passport\lib\database.ts"
with open(db_path, "r", encoding="utf-8") as f:
    db_code = f.read().replace("\r\n", "\n")

settings_row_target = """type SettingsRow = {
  id: number;
  shop_name: string;
  tagline: string;
  contact_email: string;
  phone: string;
  address: string;
  warranty_months: number;
  warranty_terms: string;
  logo_data_url: string;
  currency_code?: string;
  currency_symbol?: string;
  tax_id?: string;
  tax_rate_percent?: number;
  tax_inclusive?: number;
  updated_at: string;
};"""

settings_row_replacement = """type SettingsRow = {
  id: number;
  shop_name: string;
  tagline: string;
  contact_email: string;
  phone: string;
  address: string;
  warranty_months: number;
  warranty_terms: string;
  logo_data_url: string;
  currency_code?: string;
  currency_symbol?: string;
  currency_position?: string;
  date_format?: string;
  tax_mode?: string;
  default_shipping_carrier?: string;
  tax_id?: string;
  tax_rate_percent?: number;
  tax_inclusive?: number;
  updated_at: string;
};"""

if settings_row_target in db_code:
    db_code = db_code.replace(settings_row_target, settings_row_replacement)
    print("SettingsRow updated in database.ts")
else:
    print("settings_row_target not found in database.ts")

db_migrations_target = """  if (!settingsColumns.has("currency_code")) database.exec("ALTER TABLE shop_settings ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'LKR'");

  if (!settingsColumns.has("currency_symbol")) database.exec("ALTER TABLE shop_settings ADD COLUMN currency_symbol TEXT NOT NULL DEFAULT 'Rs.'");

  if (!settingsColumns.has("tax_id")) database.exec("ALTER TABLE shop_settings ADD COLUMN tax_id TEXT NOT NULL DEFAULT ''");

  if (!settingsColumns.has("tax_rate_percent")) database.exec("ALTER TABLE shop_settings ADD COLUMN tax_rate_percent REAL NOT NULL DEFAULT 0");

  if (!settingsColumns.has("tax_inclusive")) database.exec("ALTER TABLE shop_settings ADD COLUMN tax_inclusive INTEGER NOT NULL DEFAULT 1");"""

db_migrations_replacement = """  if (!settingsColumns.has("currency_code")) database.exec("ALTER TABLE shop_settings ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'USD'");

  if (!settingsColumns.has("currency_symbol")) database.exec("ALTER TABLE shop_settings ADD COLUMN currency_symbol TEXT NOT NULL DEFAULT '$'");

  if (!settingsColumns.has("currency_position")) database.exec("ALTER TABLE shop_settings ADD COLUMN currency_position TEXT NOT NULL DEFAULT 'prefix'");

  if (!settingsColumns.has("date_format")) database.exec("ALTER TABLE shop_settings ADD COLUMN date_format TEXT NOT NULL DEFAULT 'MM/DD/YYYY'");

  if (!settingsColumns.has("tax_mode")) database.exec("ALTER TABLE shop_settings ADD COLUMN tax_mode TEXT NOT NULL DEFAULT 'standard'");

  if (!settingsColumns.has("default_shipping_carrier")) database.exec("ALTER TABLE shop_settings ADD COLUMN default_shipping_carrier TEXT NOT NULL DEFAULT 'FedEx'");

  if (!settingsColumns.has("tax_id")) database.exec("ALTER TABLE shop_settings ADD COLUMN tax_id TEXT NOT NULL DEFAULT ''");

  if (!settingsColumns.has("tax_rate_percent")) database.exec("ALTER TABLE shop_settings ADD COLUMN tax_rate_percent REAL NOT NULL DEFAULT 0");

  if (!settingsColumns.has("tax_inclusive")) database.exec("ALTER TABLE shop_settings ADD COLUMN tax_inclusive INTEGER NOT NULL DEFAULT 1");

  const deviceColumns = new Set((database.prepare("PRAGMA table_info(devices)").all() as Array<{ name: string }>).map((column) => column.name));
  if (!deviceColumns.has("keyboard_layout")) database.exec("ALTER TABLE devices ADD COLUMN keyboard_layout TEXT NOT NULL DEFAULT 'US QWERTY'");
  if (!deviceColumns.has("power_adapter_type")) database.exec("ALTER TABLE devices ADD COLUMN power_adapter_type TEXT NOT NULL DEFAULT 'Type A/B (US 110V/240V)'");
  if (!deviceColumns.has("cosmetic_grade_standard")) database.exec("ALTER TABLE devices ADD COLUMN cosmetic_grade_standard TEXT NOT NULL DEFAULT 'R2v3 / SERI Certified'");

  if (!saleColumns.has("tracking_url")) database.exec("ALTER TABLE device_sales ADD COLUMN tracking_url TEXT NOT NULL DEFAULT ''");"""

if db_migrations_target in db_code:
    db_code = db_code.replace(db_migrations_target, db_migrations_replacement)
    print("Database migrations updated in database.ts")
else:
    print("db_migrations_target not found in database.ts")

row_to_settings_target = """function rowToSettings(row: SettingsRow): ShopSettings {
  return {
    shopName: row.shop_name,
    tagline: row.tagline,
    contactEmail: row.contact_email,
    phone: row.phone,
    address: row.address,
    warrantyMonths: row.warranty_months,
    warrantyTerms: row.warranty_terms,
    logoDataUrl: row.logo_data_url,
    currencyCode: row.currency_code || "LKR",
    currencySymbol: row.currency_symbol || "Rs.",
    taxId: row.tax_id || "",
    taxRatePercent: typeof row.tax_rate_percent === "number" ? row.tax_rate_percent : 0,
    taxInclusive: row.tax_inclusive !== undefined ? Boolean(row.tax_inclusive) : true,
  };
}"""

row_to_settings_replacement = """function rowToSettings(row: SettingsRow): ShopSettings {
  return {
    shopName: row.shop_name,
    tagline: row.tagline,
    contactEmail: row.contact_email,
    phone: row.phone,
    address: row.address,
    warrantyMonths: row.warranty_months,
    warrantyTerms: row.warranty_terms,
    logoDataUrl: row.logo_data_url,
    currencyCode: row.currency_code || "USD",
    currencySymbol: row.currency_symbol || "$",
    currencyPosition: (row.currency_position as any) || "prefix",
    dateFormat: (row.date_format as any) || "MM/DD/YYYY",
    taxMode: (row.tax_mode as any) || "standard",
    defaultShippingCarrier: row.default_shipping_carrier || "FedEx",
    taxId: row.tax_id || "",
    taxRatePercent: typeof row.tax_rate_percent === "number" ? row.tax_rate_percent : 0,
    taxInclusive: row.tax_inclusive !== undefined ? Boolean(row.tax_inclusive) : true,
  };
}"""

if row_to_settings_target in db_code:
    db_code = db_code.replace(row_to_settings_target, row_to_settings_replacement)
    print("rowToSettings updated in database.ts")
else:
    print("row_to_settings_target not found in database.ts")

update_settings_target = """  const currencyCode = (settings.currencyCode || "LKR").trim().toUpperCase();
  const currencySymbol = (settings.currencySymbol || "Rs.").trim();
  const taxId = (settings.taxId || "").trim();
  const taxRatePercent = Math.max(0, Math.min(100, Number(settings.taxRatePercent || 0)));
  const taxInclusive = settings.taxInclusive !== false ? 1 : 0;

  const database = getDatabase();
  database.prepare(`
    UPDATE shop_settings SET shop_name = ?, tagline = ?, contact_email = ?, phone = ?, address = ?,
      warranty_months = ?, warranty_terms = ?, logo_data_url = ?,
      currency_code = ?, currency_symbol = ?, tax_id = ?, tax_rate_percent = ?, tax_inclusive = ?,
      updated_at = ? WHERE id = 1
  `).run(shopName, tagline, contactEmail, phone, address, warrantyMonths, warrantyTerms, logoDataUrl, currencyCode, currencySymbol, taxId, taxRatePercent, taxInclusive, new Date().toISOString());"""

update_settings_replacement = """  const currencyCode = (settings.currencyCode || "USD").trim().toUpperCase();
  const currencySymbol = (settings.currencySymbol || "$").trim();
  const currencyPosition = settings.currencyPosition === "suffix" ? "suffix" : "prefix";
  const dateFormat = settings.dateFormat === "DD/MM/YYYY" ? "DD/MM/YYYY" : settings.dateFormat === "YYYY-MM-DD" ? "YYYY-MM-DD" : "MM/DD/YYYY";
  const taxMode = settings.taxMode === "us_sales_tax" || settings.taxMode === "uk_eu_margin_scheme" ? settings.taxMode : "standard";
  const defaultShippingCarrier = (settings.defaultShippingCarrier || "FedEx").trim();
  const taxId = (settings.taxId || "").trim();
  const taxRatePercent = Math.max(0, Math.min(100, Number(settings.taxRatePercent || 0)));
  const taxInclusive = settings.taxInclusive !== false ? 1 : 0;

  const database = getDatabase();
  database.prepare(`
    UPDATE shop_settings SET shop_name = ?, tagline = ?, contact_email = ?, phone = ?, address = ?,
      warranty_months = ?, warranty_terms = ?, logo_data_url = ?,
      currency_code = ?, currency_symbol = ?, currency_position = ?, date_format = ?, tax_mode = ?, default_shipping_carrier = ?,
      tax_id = ?, tax_rate_percent = ?, tax_inclusive = ?,
      updated_at = ? WHERE id = 1
  `).run(shopName, tagline, contactEmail, phone, address, warrantyMonths, warrantyTerms, logoDataUrl, currencyCode, currencySymbol, currencyPosition, dateFormat, taxMode, defaultShippingCarrier, taxId, taxRatePercent, taxInclusive, new Date().toISOString());"""

if update_settings_target in db_code:
    db_code = db_code.replace(update_settings_target, update_settings_replacement)
    print("updateShopSettings updated in database.ts")
else:
    print("update_settings_target not found in database.ts")

with open(db_path, "w", encoding="utf-8") as f:
    f.write(db_code)
print("lib/database.ts rewrite complete.")
