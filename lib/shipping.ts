/**
 * Global Courier Logistics & Tracking Engine for DevicePassport
 * Generates verified, 1-click live carrier tracking URLs for major global carriers
 * (FedEx, UPS, DHL, USPS, Royal Mail, DPD, Australia Post, etc.)
 */

export interface CarrierDefinition {
  id: string;
  name: string;
  region: string;
  trackingUrlTemplate: string;
}

export const GLOBAL_CARRIERS: CarrierDefinition[] = [
  {
    id: "fedex",
    name: "FedEx",
    region: "Global / USA",
    trackingUrlTemplate: "https://www.fedex.com/fedextrack/?trknbr={TRACKING}",
  },
  {
    id: "ups",
    name: "UPS",
    region: "Global / USA",
    trackingUrlTemplate: "https://www.ups.com/track?tracknum={TRACKING}",
  },
  {
    id: "dhl",
    name: "DHL Express",
    region: "Global / Europe / Middle East",
    trackingUrlTemplate: "https://www.dhl.com/en/express/tracking.html?AWB={TRACKING}",
  },
  {
    id: "usps",
    name: "USPS",
    region: "USA",
    trackingUrlTemplate: "https://tools.usps.com/go/TrackConfirmAction?tLabels={TRACKING}",
  },
  {
    id: "royal_mail",
    name: "Royal Mail",
    region: "United Kingdom",
    trackingUrlTemplate: "https://www.royalmail.com/track-your-item#/tracking-results/{TRACKING}",
  },
  {
    id: "dpd",
    name: "DPD",
    region: "Europe / UK",
    trackingUrlTemplate: "https://track.dpd.co.uk/search?parcel={TRACKING}",
  },
  {
    id: "auspost",
    name: "Australia Post",
    region: "Australia",
    trackingUrlTemplate: "https://auspost.com.au/mypost/track/#/details/{TRACKING}",
  },
  {
    id: "canadapost",
    name: "Canada Post",
    region: "Canada",
    trackingUrlTemplate: "https://www.canadapost-postescanada.ca/track-reperage/en#/resultList?searchFor={TRACKING}",
  },
  {
    id: "domex",
    name: "Domex",
    region: "Sri Lanka / South Asia",
    trackingUrlTemplate: "https://www.domex.lk/tracking?waybill={TRACKING}",
  },
  {
    id: "pronto",
    name: "Pronto",
    region: "Sri Lanka / South Asia",
    trackingUrlTemplate: "https://pronto.lk/tracking/?wb={TRACKING}",
  },
  {
    id: "other",
    name: "Other / Generic Carrier",
    region: "Universal",
    trackingUrlTemplate: "https://www.google.com/search?q={CARRIER}+tracking+{TRACKING}",
  },
];

/**
 * Returns a direct 1-click live tracking link for any supported global courier.
 */
export function getCarrierTrackingUrl(carrierName: string, trackingNumber: string): string {
  const cleanNumber = (trackingNumber || "").trim();
  if (!cleanNumber) return "";

  const normalized = (carrierName || "").trim().toLowerCase();
  const carrier = GLOBAL_CARRIERS.find(
    (c) => c.name.toLowerCase() === normalized || c.id.toLowerCase() === normalized
  ) || GLOBAL_CARRIERS.find((c) => normalized.includes(c.name.toLowerCase()));

  if (!carrier) {
    return `https://www.google.com/search?q=${encodeURIComponent(`${carrierName} tracking ${cleanNumber}`)}`;
  }

  return carrier.trackingUrlTemplate
    .replace("{TRACKING}", encodeURIComponent(cleanNumber))
    .replace("{CARRIER}", encodeURIComponent(carrier.name));
}

/**
 * Normalizes delivery & carrier display information with live tracking link.
 */
export function formatCarrierTrackingInfo(carrierName: string, trackingNumber: string) {
  const cleanCarrier = (carrierName || "Courier Dispatch").trim();
  const cleanNumber = (trackingNumber || "").trim();
  const trackingUrl = getCarrierTrackingUrl(cleanCarrier, cleanNumber);

  return {
    carrierName: cleanCarrier,
    trackingNumber: cleanNumber,
    trackingUrl,
    hasLiveTracking: Boolean(trackingUrl && cleanNumber),
  };
}
