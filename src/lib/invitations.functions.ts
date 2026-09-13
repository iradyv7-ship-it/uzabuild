import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { INVITABLE_ROLES, MANUFACTURER_INVITER_ROLES, type AppRole } from "@/constants/roles";

// Was a separately hardcoded list here, drifted from constants/roles.ts and
// silently rejected any role added to INVITABLE_ROLES without a matching edit
// in this file (e.g. china_sourcing: offered in the invite dropdown, rejected
// by this validator). Import the single source of truth instead.
const INVITABLE: AppRole[] = INVITABLE_ROLES;

export type InviteResult = {
  email: string;
  role: AppRole;
  /** true = a fresh sign-in invitation email was sent by the platform. */
  emailed: boolean;
  /** true = the person already had an account and was simply added. */
  existingAccount: boolean;
  note: string;
};

function normalise(email: string) {
  return email.trim().toLowerCase();
}

/**
 * Invite one outside specialist (architect, engineer, factory contact, client
 * team) into a single project with one role. The invitation is scoped to that
 * project only — it never grants access to the catalog cost base.
 */
export const inviteToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { projectId: string; email: string; role: AppRole; redirectTo: string }) => {
      const email = normalise(data.email ?? "");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new Error("Enter a valid email address.");
      if (!INVITABLE.includes(data.role))
        throw new Error("That role cannot be invited to a project.");
      if (!data.projectId) throw new Error("Missing project.");
      return { projectId: data.projectId, email, role: data.role, redirectTo: data.redirectTo };
    },
  )
  .handler(async ({ data, context }): Promise<InviteResult> => {
    const { data: project, error: projectError } = await context.supabase
      .from("projects")
      .select("id, name, owner_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("Project not found, or you cannot access it.");

    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (project.owner_id !== context.userId && !isAdmin) {
      throw new Error("Only the project owner can invite people to this project.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Does this person already have an account?
    const { data: existing } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    let userId =
      existing?.users.find((u) => (u.email ?? "").toLowerCase() === data.email)?.id ?? null;
    let emailed = false;
    let note = "";

    if (!userId) {
      const { data: invited, error: inviteError } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
          redirectTo: data.redirectTo,
          data: { invited_to_project: project.name, role: data.role },
        });
      if (inviteError || !invited?.user) {
        note = `We recorded the invitation but could not send the email: ${inviteError?.message ?? "unknown error"}.`;
      } else {
        userId = invited.user.id;
        emailed = true;
        note = "An invitation email with a sign-in link has been sent.";
      }
    } else {
      note = "This person already has an account, so they were added straight to the project.";
    }

    const { error: rowError } = await context.supabase.from("project_invitations").upsert(
      {
        project_id: data.projectId,
        email: data.email,
        role: data.role,
        invited_by: context.userId,
        status: userId ? (emailed ? "sent" : "accepted") : "pending",
        ...(userId && !emailed
          ? { accepted_by: userId, accepted_at: new Date().toISOString() }
          : {}),
      },
      { onConflict: "project_id,email" },
    );
    if (rowError) throw new Error(rowError.message);

    if (userId) {
      await supabaseAdmin
        .from("project_members")
        .upsert(
          { project_id: data.projectId, user_id: userId, role: data.role },
          { onConflict: "project_id,user_id,role" },
        );
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: userId, role: data.role }, { onConflict: "user_id,role" });
    }

    return {
      email: data.email,
      role: data.role,
      emailed,
      existingAccount: !emailed && !!userId,
      note,
    };
  });

/** Re-send the sign-in link to someone who was invited but has not signed in. */
export const resendProjectInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { projectId: string; email: string; redirectTo: string }) => ({
    projectId: data.projectId,
    email: normalise(data.email ?? ""),
    redirectTo: data.redirectTo,
  }))
  .handler(async ({ data, context }) => {
    const { data: project } = await context.supabase
      .from("projects")
      .select("id, owner_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project) throw new Error("Project not found, or you cannot access it.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      redirectTo: data.redirectTo,
    });
    if (error) throw new Error(error.message);
    return { sent: true };
  });

/**
 * Called once the invited person has set their password: marks every
 * invitation addressed to their email as accepted (name, time) and confirms
 * their project seat and role, so the inviter sees "Signed in" and the
 * client lands in a portal that already lists their project.
 */
export const acceptMyInvitations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = normalise(String(context.claims["email"] ?? ""));
    if (!email) return { accepted: 0, isClient: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pending } = await supabaseAdmin
      .from("project_invitations")
      .select("id, project_id, role")
      .eq("email", email)
      .is("accepted_at", null);

    for (const inv of pending ?? []) {
      await supabaseAdmin
        .from("project_members")
        .upsert(
          { project_id: inv.project_id, user_id: context.userId, role: inv.role },
          { onConflict: "project_id,user_id,role" },
        );
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: context.userId, role: inv.role }, { onConflict: "user_id,role" });
      await supabaseAdmin
        .from("project_invitations")
        .update({
          status: "accepted",
          accepted_by: context.userId,
          accepted_at: new Date().toISOString(),
        })
        .eq("id", inv.id);
    }

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const list = (roles ?? []).map((r) => r.role);
    return {
      accepted: pending?.length ?? 0,
      isClient: list.length > 0 && list.every((r) => r === "client"),
    };
  });

export type InviteManufacturerResult = {
  email: string;
  emailed: boolean;
  existingAccount: boolean;
  note: string;
};

/**
 * Invite a Chinese manufacturer directly into the system — walled to ONE
 * package/RFQ, never a general project-wide seat. Deliberately a sibling
 * function rather than reusing `inviteToProject`: that path grants a
 * project-wide `project_members` row (the same reach as an architect or QS),
 * which is exactly what a manufacturer must never get (see
 * src/lib/manufacturer-access.ts and the RLS in
 * 20260913140500_...manufacturer wall). Only `china_sourcing` or `admin` may
 * call this — a project owner who is neither cannot invite a manufacturer at
 * all, even to their own project (MANUFACTURER_INVITER_ROLES).
 */
export const inviteManufacturer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { packageId: string; supplierId: string; email: string; redirectTo: string }) => {
      const email = normalise(data.email ?? "");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new Error("Enter a valid email address.");
      if (!data.packageId) throw new Error("Missing package.");
      if (!data.supplierId) throw new Error("Missing manufacturer.");
      return {
        packageId: data.packageId,
        supplierId: data.supplierId,
        email,
        redirectTo: data.redirectTo,
      };
    },
  )
  .handler(async ({ data, context }): Promise<InviteManufacturerResult> => {
    const { data: roleRows, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleError) throw new Error(roleError.message);
    const callerRoles: string[] = (roleRows ?? []).map((r) => r.role);
    const allowed = (MANUFACTURER_INVITER_ROLES as string[]).some((r) => callerRoles.includes(r));
    if (!allowed) throw new Error("Only China Sourcing or an admin may invite a manufacturer.");

    const { data: pkg, error: pkgError } = await context.supabase
      .from("product_packages")
      .select("id, project_id, title")
      .eq("id", data.packageId)
      .maybeSingle();
    if (pkgError) throw new Error(pkgError.message);
    if (!pkg) throw new Error("Package not found, or you cannot access it.");

    const { data: supplier, error: supplierError } = await context.supabase
      .from("suppliers")
      .select("id, name")
      .eq("id", data.supplierId)
      .maybeSingle();
    if (supplierError) throw new Error(supplierError.message);
    if (!supplier) throw new Error("Manufacturer not found.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // This upsert IS the scope grant: a manufacturer's whole reach is
    // "supplier_id has a package_manufacturers row for this package_id"
    // (see is_invited_manufacturer() in the wall migration).
    const { error: shortlistError } = await supabaseAdmin.from("package_manufacturers").upsert(
      {
        package_id: data.packageId,
        project_id: pkg.project_id,
        supplier_id: data.supplierId,
        status: "rfq_sent",
        created_by: context.userId,
      },
      { onConflict: "package_id,supplier_id" },
    );
    if (shortlistError) throw new Error(shortlistError.message);

    const { data: existing } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    let userId =
      existing?.users.find((u) => (u.email ?? "").toLowerCase() === data.email)?.id ?? null;
    let emailed = false;
    let note = "";

    if (!userId) {
      const { data: invited, error: inviteError } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
          redirectTo: data.redirectTo,
          data: { role: "manufacturer", invited_to_package: pkg.title },
        });
      if (inviteError || !invited?.user) {
        note = `We recorded the invitation but could not send the email: ${inviteError?.message ?? "unknown error"}.`;
      } else {
        userId = invited.user.id;
        emailed = true;
        note = "An invitation email with a sign-in link has been sent.";
      }
    } else {
      note = "This person already has an account, so it was linked to this manufacturer directly.";
    }

    if (userId) {
      // Deliberately NOT a project_members row — that would grant
      // can_access_project(), the same reach as a real project seat. Scope
      // comes only from manufacturer_users + the package_manufacturers row
      // above.
      const { error: linkError } = await supabaseAdmin
        .from("manufacturer_users")
        .upsert(
          { user_id: userId, supplier_id: data.supplierId, invited_by: context.userId },
          { onConflict: "user_id" },
        );
      if (linkError) throw new Error(linkError.message);
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: userId, role: "manufacturer" }, { onConflict: "user_id,role" });
    }

    return {
      email: data.email,
      emailed,
      existingAccount: !emailed && !!userId,
      note,
    };
  });

/** Withdraw an invitation and remove that person's access to this project. */
export const revokeProjectInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { invitationId: string }) => ({ invitationId: data.invitationId }))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("project_invitations")
      .select("id, project_id, accepted_by")
      .eq("id", data.invitationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Invitation not found.");

    if (row.accepted_by) {
      await context.supabase
        .from("project_members")
        .delete()
        .eq("project_id", row.project_id)
        .eq("user_id", row.accepted_by);
    }
    const { error: delError } = await context.supabase
      .from("project_invitations")
      .delete()
      .eq("id", data.invitationId);
    if (delError) throw new Error(delError.message);
    return { revoked: true };
  });
