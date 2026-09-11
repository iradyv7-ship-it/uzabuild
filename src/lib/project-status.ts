/**
 * Project status vocabulary.
 *
 * Status is derived in the database from the stage the project has reached
 * (see the `sync_project_status` trigger), so nothing here decides it — this
 * module only names it for the interface.
 */
export const PROJECT_STATUSES = [
  { value: "in_progress", label: "In progress" },
  { value: "awaiting_signoff", label: "Awaiting sign-off" },
  { value: "approved", label: "Approved" },
  { value: "delivering", label: "Delivering" },
  { value: "completed", label: "Completed" },
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]["value"];

export function statusLabel(status: string | null | undefined): string {
  return PROJECT_STATUSES.find((s) => s.value === status)?.label ?? "In progress";
}

/** Badge tone: approved/completed read as settled, awaiting sign-off as pending. */
export function statusVariant(
  status: string | null | undefined,
): "default" | "secondary" | "outline" {
  if (status === "approved" || status === "completed") return "default";
  if (status === "awaiting_signoff") return "outline";
  return "secondary";
}

/**
 * BOQ line reference: house.floor.room.line, zero padded on the line so a
 * printed BOQ sorts correctly — 1.1.2.03.
 */
export function boqItemNo(house: number, floor: number, room: number, line: number): string {
  return `${house}.${floor}.${room}.${String(line).padStart(2, "0")}`;
}
