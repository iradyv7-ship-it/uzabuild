import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { getSession, onSessionChange, updatePassword } from "@/services/authService";
import { acceptMyInvitations } from "@/lib/invitations.functions";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const acceptInvites = useServerFn(acceptMyInvitations);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void getSession().then((session) => {
      if (active) setReady(!!session);
    });
    const unsubscribe = onSessionChange((session) => {
      if (session) setReady(true);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
    } catch (error) {
      setBusy(false);
      toast.error(error instanceof Error ? error.message : "Could not save that password.");
      return;
    }
    // Invited people: confirm their project seat and record that they signed in.
    let isClient = false;
    try {
      const result = await acceptInvites({});
      isClient = result.isClient;
    } catch {
      // Not invited to anything — an ordinary password reset.
    }
    setBusy(false);
    toast.success("Password set. You are signed in.");
    navigate({ to: isClient ? "/portal" : "/dashboard", replace: true });
  }

  return (
    <AuthLayout
      title="Set your password"
      description={
        ready
          ? "Choose a password for your own seat. Nobody else can see it."
          : "Open this page from the link in your email. The link signs you in so you can set a password."
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={!ready}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Repeat password</Label>
          <Input
            id="confirm-password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={!ready}
          />
        </div>
        <Button type="submit" className="w-full" disabled={busy || !ready}>
          {busy ? "Saving…" : "Save password"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          <Link to="/auth" className="underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
