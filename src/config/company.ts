/**
 * UZA issuer identity used on every client-facing commercial document.
 * CONFIRMED — group letterhead details. Proformas are issued by UZA only,
 * never by a factory directly.
 */
export const UZA_ISSUER = {
  legalName: "UZA Solutions Ltd",
  division: "UZA Finishing Solutions",
  addressLines: ["UNIFY House, Kiyovu", "Kigali, Rwanda"],
  email: "info@uzasolutions.com",
  phone: "+250 788 371 081",
} as const;

/** ASSUMED — default commercial terms carried on a new proforma until agreed per client. */
export const PROFORMA_DEFAULTS = {
  incoterm: "FOB China",
  paymentTerms: "50% on order confirmation, 50% before shipment",
  validityDays: 15,
  leadTimeNote: "Lead time confirmed per item after sample approval.",
} as const;
