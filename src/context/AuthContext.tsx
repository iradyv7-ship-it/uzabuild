import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  fetchFullName,
  fetchRoles,
  getSession,
  onSessionChange,
  signOut as signOutRequest,
} from "@/services/authService";
import { ROLE_LABELS, SEAT_ROLES, INVITABLE_ROLES, type AppRole } from "@/constants/roles";

// Re-exported so screens can pull the seat vocabulary from one place.
export { ROLE_LABELS, SEAT_ROLES, INVITABLE_ROLES };
export type { AppRole };

type AuthValue = {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  fullName: string;
  loading: boolean;
  hasRole: (role: AppRole) => boolean;
  /** Clients never see cost build-up, margin or the catalog cost base. */
  isCostBlind: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSessionChange((next) => {
      setSession(next);
      if (!next) {
        setRoles([]);
        setFullName("");
      }
    });
    void getSession().then((current) => {
      setSession(current);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const [nextRoles, name] = await Promise.all([fetchRoles(userId), fetchFullName(userId)]);
      if (cancelled) return;
      setRoles(nextRoles);
      setFullName(name);
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
    isCostBlind: roles.length > 0 && roles.every((r) => r === "client"),
    signOut: signOutRequest,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
