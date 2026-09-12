import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { INVITABLE_ROLES, type AppRole } from "@/constants/roles";

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
