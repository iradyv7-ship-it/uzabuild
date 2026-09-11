/**
 * Everything the interface is allowed to do with a session.
 *
 * No screen talks to the auth API directly — it goes through here, so the
 * rules (what a signup may claim, where a reset link points) live in one
 * place. The seat a person actually holds is decided in the database, never
 * by what the browser sends.
 */
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/constants/roles";

export type Credentials = { email: string; password: string };

function fail(message: string): never {
  throw new Error(message);
}

export async function signIn({ email, password }: Credentials): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error || !data.session) fail(error?.message ?? "Could not sign you in.");
  return data.session!;
}

export async function signUp(input: {
  email: string;
  password: string;
  fullName: string;
  role: AppRole;
}): Promise<{ session: Session | null }> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: {
      emailRedirectTo: window.location.origin,
      // Requested seat only. The database decides what is actually granted.
      data: { full_name: input.fullName.trim(), role: input.role },
    },
  });
  if (error) fail(error.message);
  return { session: data.session };
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/auth/reset`,
  });
  if (error) fail(error.message);
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) fail(error.message);
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onSessionChange(handler: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => handler(session));
  return () => data.subscription.unsubscribe();
}

export async function fetchRoles(userId: string): Promise<AppRole[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r) => r.role as AppRole);
}

export async function fetchFullName(userId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  return data?.full_name ?? "";
}

export type { Session, User };
