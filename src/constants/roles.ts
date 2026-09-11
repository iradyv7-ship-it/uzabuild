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
  | "project_manager";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  architect: "Architect",
  qs: "Quantity Surveyor",
  interior_designer: "Interior Designer",
  mep_engineer: "MEP / Structural Engineer",
  client: "Client",
  procurement: "Procurement",
  project_manager: "Project Manager",
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
];

export function roleLabel(role: string): string {
  return ROLE_LABELS[role as AppRole] ?? role;
}
