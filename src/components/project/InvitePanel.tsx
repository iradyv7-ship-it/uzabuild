import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mail, RotateCcw, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, QueryState } from "@/components/DataState";
import { INVITABLE_ROLES, ROLE_LABELS, type AppRole } from "@/context/AuthContext";
import { inviteToProject, resendProjectInvite, revokeProjectInvite } from "@/lib/invitations.functions";

const STATUS_TONE: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  sent: "bg-warning/15 text-warning-foreground",
  accepted: "bg-success/15 text-success-foreground",
};

export function InvitePanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("architect");

  const invite = useServerFn(inviteToProject);
  const resend = useServerFn(resendProjectInvite);
  const revoke = useServerFn(revokeProjectInvite);

  const invitations = useQuery({
    queryKey: ["project-invitations", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_invitations")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const redirectTo = typeof window === "undefined" ? "" : `${window.location.origin}/auth/reset`;

  const send = useMutation({
    mutationFn: () => invite({ data: { projectId, email, role, redirectTo } }),
    onSuccess: (result) => {
      toast.success(`${result.email} added as ${ROLE_LABELS[result.role]}. ${result.note}`);
      setEmail("");
      void queryClient.invalidateQueries({ queryKey: ["project-invitations", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resendOne = useMutation({
    mutationFn: (address: string) => resend({ data: { projectId, email: address, redirectTo } }),
    onSuccess: () => toast.success("Sign-in link sent again."),
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeOne = useMutation({
    mutationFn: (invitationId: string) => revoke({ data: { invitationId } }),
    onSuccess: () => {
      toast.success("Access withdrawn.");
      void queryClient.invalidateQueries({ queryKey: ["project-invitations", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="size-5" aria-hidden /> Invite someone to this project
          </CardTitle>
          <CardDescription>
            An architect, engineer, factory contact or the client&apos;s own team. Access is scoped
            to this project only — nobody invited here can see the catalog cost base or any other
            project. They receive an email with a link to set their own password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-[1fr_14rem_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              send.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                id="invite-email"
                type="email"
                required
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Role on this project</Label>
              <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVITABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={send.isPending || !email}>
              <Mail className="size-4" aria-hidden />
              {send.isPending ? "Sending…" : "Send invitation"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>People invited</CardTitle>
          <CardDescription>
            Everyone who has been given access to this project, and whether they have signed in yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QueryState
            isLoading={invitations.isLoading}
            error={invitations.error}
            isEmpty={(invitations.data ?? []).length === 0}
            onRetry={() => void invitations.refetch()}
            empty={
              <EmptyState
                title="Nobody invited yet"
                description="Invitations you send will be listed here with their role, the date sent and whether the person has signed in."
              />
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Invited</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(invitations.data ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.email}</TableCell>
                    <TableCell>{ROLE_LABELS[row.role as AppRole]}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={STATUS_TONE[row.status] ?? ""}>
                        {row.accepted_at ? "Signed in" : row.status === "sent" ? "Email sent" : "Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular text-muted-foreground">
                      {new Date(row.created_at).toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={resendOne.isPending}
                          onClick={() => resendOne.mutate(row.email)}
                        >
                          <RotateCcw className="size-4" aria-hidden /> Resend
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={revokeOne.isPending}
                          onClick={() => revokeOne.mutate(row.id)}
                        >
                          <Trash2 className="size-4" aria-hidden /> Remove
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </QueryState>
        </CardContent>
      </Card>
    </div>
  );
}
