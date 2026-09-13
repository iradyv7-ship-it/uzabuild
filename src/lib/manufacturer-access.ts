/**
 * Who a manufacturer account is, what it may see, and how it is refused.
 *
 * Pure functions, no Supabase client, mirroring the shape of
 * uza-mobility-bn's `lender-access.ts` ("a lender sees only its own
 * borrowers, identical-404 for anything outside scope, never a
 * filtered-but-visible list") — adapted to this repo's own convention: the
 * actual enforcement is Postgres RLS (see the migration
 * 20260913140500_..._manufacturer-wall.sql), where "outside scope" means the
 * row is simply never returned, not a distinguishable error. These functions
 * exist so the SAME rule is readable and testable on its own, since RLS
 * itself is not unit-testable in this repo's setup.
 *
 * ── THE RULES ──────────────────────────────────────────────────────────
 *   1. A manufacturer sees its OWN invited package(s). Not another
 *      manufacturer's package, not the fact that one exists.
 *   2. On a shared package (up to MANUFACTURERS_PER_PACKAGE_MAX factories
 *      shortlisted), a manufacturer sees general RFQ documents UZA
 *      addressed to everyone, plus its OWN submissions — never a rival
 *      manufacturer's quote/drawing on the same package.
 *   3. The client's identity and the client-facing USD price never reach a
 *      manufacturer-facing payload at all — stripped by construction here,
 *      same "remove from a copy" philosophy as `redactForLender`.
 */

export const MANUFACTURER_REFUSAL = "No record available for that reference.";

export interface ManufacturerScopeInput {
  /** The supplier (factory) this manufacturer's account represents. Null if the account is not linked to a supplier at all. */
  supplierId: string | null;
  /** Every supplier id actually shortlisted/invited on the package being requested. */
  invitedSupplierIds: readonly string[];
}

/** May this manufacturer account see/act on this package at all? */
export function isPackageInScope(input: ManufacturerScopeInput): boolean {
  return input.supplierId !== null && input.invitedSupplierIds.includes(input.supplierId);
}

export function assertPackageInScope(input: ManufacturerScopeInput): void {
  if (!isPackageInScope(input)) throw new Error(MANUFACTURER_REFUSAL);
}

export interface AttachmentScopeInput {
  supplierId: string | null;
  /** null = a general RFQ document UZA addressed to every invited manufacturer. */
  uploadedForSupplierId: string | null;
}

/**
 * May this manufacturer see this one attachment? True for a general RFQ
 * document (drawing/spec UZA sent to everyone shortlisted) or its own
 * submission; false for a rival manufacturer's private quote/drawing on the
 * same package, even though both are attached to a package this manufacturer
 * is genuinely invited to.
 */
export function canSeeAttachment(input: AttachmentScopeInput): boolean {
  if (input.supplierId === null) return false;
  return input.uploadedForSupplierId === null || input.uploadedForSupplierId === input.supplierId;
}

/** May this manufacturer upload/edit an attachment tagged for this supplier? */
export function canWriteAttachment(input: AttachmentScopeInput): boolean {
  return input.supplierId !== null && input.uploadedForSupplierId === input.supplierId;
}

/**
 * Strip everything a manufacturer-facing payload must never carry: the
 * client's identity and the client-facing USD price. Written as
 * remove-from-a-copy, like `redactForLender` — a build-up function silently
 * drops a field added to the interface later, which fails safe here too, but
 * the one thing that must never leak deserves an explicit, named, tested
 * deletion rather than an implicit omission nobody notices when the shape
 * changes.
 */
export function redactForManufacturer<
  T extends { clientName?: unknown; clientContact?: unknown; usdPriceMinor?: unknown; proformaReference?: unknown },
>(payload: T): Omit<T, "clientName" | "clientContact" | "usdPriceMinor" | "proformaReference"> {
  const out = { ...payload };
  delete out.clientName;
  delete out.clientContact;
  delete out.usdPriceMinor;
  delete out.proformaReference;
  return out;
}
