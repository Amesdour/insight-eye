import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, LOCALES } from "@/lib/i18n";
import { useMembership, usePlanCatalog } from "@/lib/session";
import { createInvite, revokeInvite } from "@/lib/invites.functions";
import { changePlan } from "@/lib/billing.functions";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Organization settings — Sentinel" },
      { name: "description", content: "Manage members, invitations, per-camera access and your subscription plan." },
      { property: "og:title", content: "Organization settings — Sentinel" },
      { property: "og:description", content: "Team roles, invitations, camera permissions and plan tier limits." },
    ],
  }),
  component: SettingsPage,
});

const ROLES = ["admin", "agent", "viewer"] as const;

function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const queryClient = useQueryClient();
  const { data: membership } = useMembership();
  const { data: plans } = usePlanCatalog();
  const isAdmin = Boolean(membership?.isAdmin);

  const invite = useServerFn(createInvite);
  const revoke = useServerFn(revokeInvite);
  const switchPlan = useServerFn(changePlan);

  const [inviteForm, setInviteForm] = useState({ email: "", role: "agent" });
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: members } = useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      return (profiles ?? []).map((p) => ({
        ...p,
        role: (roles ?? []).find((r) => r.user_id === p.id)?.role ?? "viewer",
      }));
    },
  });

  const { data: cameras } = useQuery({
    queryKey: ["cameras-list"],
    queryFn: async () => (await supabase.from("cameras").select("id, name, zone").order("name")).data ?? [],
  });

  const { data: access } = useQuery({
    queryKey: ["camera-access"],
    queryFn: async () => (await supabase.from("camera_access").select("user_id, camera_id")).data ?? [],
  });

  const { data: invites } = useQuery({
    queryKey: ["invitations"],
    queryFn: async () =>
      (
        await supabase
          .from("invitations")
          .select("id, email, role, status, expires_at")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: role as "admin", tenant_id: membership?.tenant?.id ?? "" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members"] }),
    onError: (e) => toast.error((e as Error).message),
  });

  const toggleAccess = useMutation({
    mutationFn: async ({ userId, cameraId, on }: { userId: string; cameraId: string; on: boolean }) => {
      if (on) {
        const { error } = await supabase
          .from("camera_access")
          .insert({ user_id: userId, camera_id: cameraId, tenant_id: membership?.tenant?.id ?? "" });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("camera_access")
          .delete()
          .eq("user_id", userId)
          .eq("camera_id", cameraId);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["camera-access"] }),
    onError: (e) => toast.error((e as Error).message),
  });

  const sendInvite = useMutation({
    mutationFn: async () =>
      invite({ data: { email: inviteForm.email, role: inviteForm.role as "agent" } }),
    onSuccess: (res) => {
      setInviteForm({ email: "", role: "agent" });
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      toast.success(`${t("invite_sent")} — ${t(res.delivery as "sent")}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const revokeMut = useMutation({
    mutationFn: async (id: string) => revoke({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invitations"] }),
    onError: (e) => toast.error((e as Error).message),
  });

  const planMut = useMutation({
    mutationFn: async (tier: string) => switchPlan({ data: { tier: tier as "pro" } }),
    onSuccess: () => {
      toast.success(t("current_plan"));
      queryClient.invalidateQueries({ queryKey: ["membership"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const tenant = membership?.tenant;
  const statusKey = `status_${tenant?.subscription_status ?? "trialing"}` as "status_active";

  return (
    <>
      <PageHeader title={t("settings_title")} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="panel-surface p-5">
            <div className="flex items-center justify-between">
              <p className="label-mono">{t("members")}</p>
              <p className="label-mono">
                {t("seats")}: {members?.length ?? 0} / {tenant?.seat_limit ?? "—"}
              </p>
            </div>
            <div className="mt-4 divide-y divide-border">
              {(members ?? []).map((m) => {
                const own = (access ?? []).filter((a) => a.user_id === m.id);
                const open = expanded === m.id;
                return (
                  <div key={m.id} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{m.full_name ?? m.email}</p>
                        <p className="label-mono mt-0.5 truncate">
                          {m.email} · {own.length ? `${t("restricted")} (${own.length})` : t("all_cameras")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={m.role}
                          disabled={!isAdmin}
                          onChange={(e) => setRole.mutate({ userId: m.id, role: e.target.value })}
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {t(`role_${r}` as "role_admin")}
                            </option>
                          ))}
                        </select>
                        {isAdmin && (
                          <Button variant="ghost" size="icon" onClick={() => setExpanded(open ? null : m.id)}>
                            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
                          </Button>
                        )}
                      </div>
                    </div>

                    {open && (
                      <div className="mt-3 rounded-md border border-border bg-secondary/30 p-3">
                        <p className="label-mono">{t("camera_access")}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{t("camera_access_hint")}</p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {(cameras ?? []).map((c) => {
                            const on = own.some((a) => a.camera_id === c.id);
                            return (
                              <label key={c.id} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  className="size-4 accent-[hsl(var(--primary))]"
                                  checked={on}
                                  onChange={() => toggleAccess.mutate({ userId: m.id, cameraId: c.id, on: !on })}
                                />
                                <span className="truncate">
                                  {c.name}
                                  {c.zone ? ` · ${c.zone}` : ""}
                                </span>
                              </label>
                            );
                          })}
                          {(cameras ?? []).length === 0 && (
                            <p className="text-xs text-muted-foreground">{t("no_data")}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel-surface p-5">
            <p className="label-mono">{t("invites")}</p>
            {isAdmin && (
              <form
                className="mt-3 flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendInvite.mutate();
                }}
              >
                <Input
                  type="email"
                  required
                  placeholder="agent@example.com"
                  className="min-w-[12rem] flex-1"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                />
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t(`role_${r}` as "role_admin")}
                    </option>
                  ))}
                </select>
                <Button type="submit" disabled={sendInvite.isPending}>
                  {t("invite_member")}
                </Button>
              </form>
            )}
            <div className="mt-4 divide-y divide-border">
              {(invites ?? []).length === 0 && <p className="py-3 text-sm text-muted-foreground">{t("no_data")}</p>}
              {(invites ?? []).map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{i.email}</p>
                    <p className="label-mono mt-0.5">
                      {t(`role_${i.role}` as "role_admin")} · {t("expires")}{" "}
                      {new Date(i.expires_at).toLocaleDateString(locale)}
                    </p>
                  </div>
                  {isAdmin && (
                    <Button variant="ghost" size="icon" onClick={() => revokeMut.mutate(i.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel-surface p-5">
            <div className="flex items-center justify-between">
              <p className="label-mono">{t("subscription")}</p>
              <span
                className={cn(
                  "rounded-sm px-2 py-0.5 text-xs",
                  tenant?.subscription_status === "past_due"
                    ? "bg-destructive/20 text-destructive"
                    : tenant?.subscription_status === "active"
                      ? "bg-success/20 text-success"
                      : "bg-secondary text-muted-foreground",
                )}
              >
                {t(statusKey)}
              </span>
            </div>
            {tenant?.subscription_status === "trialing" && (
              <p className="label-mono mt-2">
                {t("trial_ends")} {new Date(tenant.trial_ends_at).toLocaleDateString(locale)}
              </p>
            )}

            <div className="mt-4 space-y-2">
              {(plans ?? []).map((p) => {
                const active = tenant?.plan === p.tier;
                return (
                  <div
                    key={p.tier}
                    className={cn(
                      "flex items-center justify-between rounded-md border p-3",
                      active ? "border-primary bg-primary/10" : "border-border",
                    )}
                  >
                    <div>
                      <p className="font-display text-base font-semibold tracking-wide uppercase">{p.label}</p>
                      <p className="label-mono mt-1">
                        {p.camera_limit} {t("camera_limit")} · {p.storage_gb} {t("storage_limit")} · {p.seat_limit}{" "}
                        {t("seats")}
                      </p>
                      <p className="label-mono mt-0.5 text-primary">
                        {p.price_eur_month} {t("price_month")}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={active ? "secondary" : "default"}
                      disabled={active || !isAdmin || planMut.isPending}
                      onClick={() => planMut.mutate(p.tier)}
                    >
                      {active ? t("current_plan") : t("upgrade")}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel-surface p-5">
            <p className="label-mono">{t("language")}</p>
            <div className="mt-3 flex gap-2">
              {LOCALES.map((l) => (
                <Button
                  key={l.code}
                  size="sm"
                  variant={l.code === locale ? "default" : "outline"}
                  onClick={() => setLocale(l.code)}
                >
                  {l.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
