import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "architect" | "qs" | "interior_designer" | "mep_engineer";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  architect: "Architect",
  qs: "Quantity Surveyor",
  interior_designer: "Interior Designer",
  mep_engineer: "MEP / Structural Engineer",
};

export const SEAT_ROLES: AppRole[] = ["architect", "qs", "interior_designer", "mep_engineer"];

type AuthValue = {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  fullName: string;
  loading: boolean;
  hasRole: (role: AppRole) => boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setRoles([]);
        setFullName("");
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const [{ data: roleRows }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
      ]);
      if (cancelled) return;
      setRoles((roleRows ?? []).map((r) => r.role as AppRole));
      setFullName(profile?.full_name ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const value: AuthValue = {
    user: session?.user ?? null,
    session,
    roles,
    fullName,
    loading,
    hasRole: (role) => roles.includes(role),
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
