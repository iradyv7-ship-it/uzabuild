/**
 * Seat roles used across the platform.
 *
 * These names must stay identical to the `app_role` enum in the database —
 * the database, not the interface, is what actually enforces them.
 */
export type AppRole =
  | "admin"
  | "architect"
  | "qs"
  | "interior_designer"
  | "mep_engineer"
  | "client"
  | "procurement"
  | "project_manager"
  | "china_sourcing"
  // External, walled role: a Chinese manufacturer invited to a single
  // package/RFQ. Not staff, not a client — see manufacturer-access.ts and
  // the RLS in 20260913140500 for the actual wall. Never a SEAT_ROLES member
  // and never in INVITABLE_ROLES (see the note on inviteManufacturer below).
  | "manufacturer";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  architect: "Architect",
  qs: "Quantity Surveyor",
  interior_designer: "Interior Designer",
  mep_engineer: "MEP / Structural Engineer",
  client: "Client",
  procurement: "Procurement",
  project_manager: "Project Manager",
  // Deliberately the same string as UZA Nexus OS's `china_sourcing` role
  // (packages/contracts/src/permissions.ts) — same job, same name across the
  // UZA estate. The two systems are separate apps with separate databases;
  // this is a naming convention only, not an integration.
  china_sourcing: "China Sourcing",
  manufacturer: "Manufacturer",
};

/** Roles that sign off on a BOQ version, in sequence. */
export const SEAT_ROLES: AppRole[] = [
  "architect",
  "interior_designer",
  "mep_engineer",
  "qs",
  "project_manager",
];

/** Roles a project owner can invite an external specialist as. */
export const INVITABLE_ROLES: AppRole[] = [
  "architect",
  "interior_designer",
  "mep_engineer",
  "qs",
  "procurement",
  "project_manager",
  "client",
  // Sourcing/procurement coordination with Chinese manufacturers — deliberately
  // NOT a SEAT_ROLES member (that list is the BOQ sign-off chain), same as
  // `procurement` above.
  "china_sourcing",
  // 'manufacturer' is deliberately NOT here. A manufacturer is not a
  // project-wide seat like an architect or QS — it is walled to one
  // package/RFQ, invited only by china_sourcing or admin, through the
  // separate `inviteManufacturer` function (see invitations.functions.ts),
  // never through the general per-project inviteToProject path this list
  // drives.
];

/** Roles allowed to invite a manufacturer (scoped to one package/RFQ). */
export const MANUFACTURER_INVITER_ROLES: AppRole[] = ["china_sourcing", "admin"];

export function roleLabel(role: string): string {
  return ROLE_LABELS[role as AppRole] ?? role;
}
