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
  | "china_sourcing";

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
];

export function roleLabel(role: string): string {
  return ROLE_LABELS[role as AppRole] ?? role;
}
