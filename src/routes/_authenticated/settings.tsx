import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, LOCALES } from "@/lib/i18n";
import { useMembership } from "@/lib/session";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Organization settings — Sentinel" },
      { name: "description", content: "Manage members, roles, language and your subscription plan." },
      { property: "og:title", content: "Organization settings — Sentinel" },
      { property: "og:description", content: "Team roles, plan tier limits and interface language." },
    ],
  }),
  component: SettingsPage,
});

const PLANS = [
  { id: "starter", cameras: 4, storage: 50 },
  { id: "pro", cameras: 20, storage: 500 },
  { id: "enterprise", cameras: 200, storage: 5000 },
];

const ROLES = ["admin", "agent", "viewer"] as const;

function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const queryClient = useQueryClient();
  const { data: membership } = useMembership();

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

  const setPlan = useMutation({
    mutationFn: async (plan: (typeof PLANS)[number]) => {
      const { error } = await supabase
        .from("tenants")
        .update({ plan: plan.id as "starter", camera_limit: plan.cameras, storage_gb: plan.storage })
        .eq("id", membership?.tenant?.id ?? "");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plan updated");
      queryClient.invalidateQueries({ queryKey: ["membership"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <>
      <PageHeader title={t("settings_title")} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel-surface p-5">
          <p className="label-mono">{t("members")}</p>
          <div className="mt-4 divide-y divide-border">
            {(members ?? []).map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{m.full_name ?? m.email}</p>
                  <p className="label-mono mt-0.5 truncate">{m.email}</p>
                </div>
                <select
                  value={m.role}
                  disabled={!membership?.isAdmin}
                  onChange={(e) => setRole.mutate({ userId: m.id, role: e.target.value })}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t(`role_${r}` as "role_admin")}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel-surface p-5">
            <p className="label-mono">{t("billing")}</p>
            <div className="mt-4 space-y-2">
              {PLANS.map((p) => {
                const active = membership?.tenant?.plan === p.id;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between rounded-md border p-3 ${active ? "border-primary bg-primary/10" : "border-border"}`}
                  >
                    <div>
                      <p className="font-display text-base font-semibold tracking-wide uppercase">{p.id}</p>
                      <p className="label-mono mt-1">
                        {p.cameras} {t("camera_limit")} · {p.storage} {t("storage_limit")}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={active ? "secondary" : "default"}
                      disabled={active || !membership?.isAdmin}
                      onClick={() => setPlan.mutate(p)}
                    >
                      {active ? "✓" : t("save")}
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
