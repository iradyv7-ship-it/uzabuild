import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { useAuth } from "@/context/AuthContext";
import { ROLE_LABELS, SEAT_ROLES, type AppRole } from "@/constants/roles";
import { requestPasswordReset, signIn, signUp } from "@/services/authService";

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

export function AuthPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AppRole>("qs");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  async function handleSignIn(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    try {
      await signIn({ email, password });
      navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      toast.error(message(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(): Promise<void> {
    if (!email) {
      toast.error("Enter your email address first, then choose Forgot password.");
      return;
    }
    setBusy(true);
    try {
      await requestPasswordReset(email);
      toast.success("If that email has a seat, a reset link is on its way.");
    } catch (error) {
      toast.error(message(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignUp(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    try {
      const { session: created } = await signUp({ email, password, fullName, role });
      if (!created) {
        toast.success("Check your email to confirm your account.");
        return;
      }
      navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      toast.error(message(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Workspace access" description="Each professional signs in to their own seat.">
      <Tabs defaultValue="signin">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signin">Sign in</TabsTrigger>
          <TabsTrigger value="signup">Create account</TabsTrigger>
        </TabsList>

        <TabsContent value="signin">
          <form className="space-y-4 pt-4" onSubmit={handleSignIn}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            <Button
              type="button"
              variant="link"
              className="w-full"
              disabled={busy}
              onClick={() => void handleReset()}
            >
              Forgot password?
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="signup">
          <form className="space-y-4 pt-4" onSubmit={handleSignUp}>
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                required
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="seat">Seat</Label>
              <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                <SelectTrigger id="seat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEAT_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email2">Email</Label>
              <Input
                id="email2"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password2">Password</Label>
              <Input
                id="password2"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Creating…" : "Create account"}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </AuthLayout>
  );
}
