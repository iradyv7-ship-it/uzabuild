import { Link, Navigate, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LayoutDashboard, Package, FolderKanban, SlidersHorizontal, LogOut, HardHat, Brain, Building2, LifeBuoy, Factory, ClipboardList } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { acceptMyInvitations } from "@/lib/invitations.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

/** Clients see only their own portal — never the catalog, cost base or team screens. */
const CLIENT_NAV = [
  { to: "/portal", label: "My projects", icon: LifeBuoy },
  { to: "/settings", label: "Settings", icon: SlidersHorizontal },
];

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/clients", label: "Clients", icon: Building2 },
  { to: "/catalog", label: "Materials Catalog", icon: Package },
  { to: "/sourcing", label: "Sourcing Board", icon: ClipboardList },
  { to: "/manufacturers", label: "Manufacturers", icon: Factory },
  { to: "/learning", label: "Takeoff Accuracy", icon: Brain },
  { to: "/settings", label: "Settings", icon: SlidersHorizontal },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { fullName, roles, user, signOut, isCostBlind } = useAuth();
  const nav = isCostBlind ? CLIENT_NAV : NAV;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const acceptInvites = useServerFn(acceptMyInvitations);

  // First sign-in after an email invitation: confirm the project seat and mark
  // the invitation accepted (name + time) so the inviter sees "Signed in".
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    void acceptInvites({})
      .then((r) => {
        if (r.accepted > 0) void queryClient.invalidateQueries();
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  // A client seat only ever lands on its portal. The database already refuses
  // cost data to clients; this keeps them from even seeing the internal shells.
  const clientAllowed = CLIENT_NAV.some((n) => pathname === n.to || pathname.startsWith(`${n.to}/`));
  if (isCostBlind && !clientAllowed) return <Navigate to="/portal" replace />;

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar px-4 py-6 text-sidebar-foreground md:flex">
        <Link to={isCostBlind ? "/portal" : "/dashboard"} className="mb-8 flex items-center gap-2 px-2">
          <HardHat className="size-6 text-sidebar-primary" />
          <span className="font-display text-lg font-semibold tracking-tight">UZA Build</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent",
                pathname.startsWith(to) && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 space-y-3 border-t border-sidebar-border pt-4">
          <div className="px-2">
            <p className="truncate text-sm font-medium">{fullName || user?.email}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {roles.length === 0 && <span className="text-xs opacity-70">No seat assigned</span>}
              {roles.map((r) => (
                <Badge key={r} variant="secondary" className="text-[10px]">
                  {ROLE_LABELS[r]}
                </Badge>
              ))}
            </div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start hover:bg-sidebar-accent" onClick={handleSignOut}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-card px-4 py-3 md:hidden">
          <Link to="/dashboard" className="flex items-center gap-2 font-display font-semibold">
            <HardHat className="size-5" /> UZA Build
          </Link>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="size-4" />
          </Button>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b bg-card px-2 py-2 md:hidden">
          {nav.map(({ to, label }) => (
            <Link key={to} to={to} className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm hover:bg-muted">
              {label}
            </Link>
          ))}
        </nav>
        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
