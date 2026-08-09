import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useMembership } from "@/lib/session";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({
    meta: [
      { title: "Alerts & rules — Sentinel" },
      { name: "description", content: "Configure detection alert rules and triage open alerts for your team." },
      { property: "og:title", content: "Alerts & rules — Sentinel" },
      { property: "og:description", content: "Rule-based alerting on entity, zone and confidence threshold." },
    ],
  }),
  component: AlertsPage,
});

const ENTITIES = ["person", "vehicle", "animal", "object"] as const;
const CHANNELS = ["dashboard", "email", "sms"] as const;

function AlertsPage() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const { data: membership } = useMembership();
  const [form, setForm] = useState({
    name: "",
    entity: "person",
    subtype: "",
    min_confidence: 0.6,
    severity: "warning",
    channels: ["dashboard"] as string[],
  });

  const { data: rules } = useQuery({
    queryKey: ["alert-rules"],
    queryFn: async () =>
      (await supabase.from("alert_rules").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const { data: alerts } = useQuery({
    queryKey: ["alerts"],
    queryFn: async () =>
      (
        await supabase
          .from("alerts")
          .select("id, status, created_at, alert_rules(name), events(entity, description, severity, occurred_at)")
          .order("created_at", { ascending: false })
          .limit(100)
      ).data ?? [],
  });

  const createRule = useMutation({
    mutationFn: async () => {
      const tenantId = membership?.tenant?.id;
      if (!tenantId) throw new Error("No organization");
      const { error } = await supabase.from("alert_rules").insert({
        tenant_id: tenantId,
        name: form.name,
        entity: form.entity as "person",
        subtype: form.subtype || null,
        min_confidence: form.min_confidence,
        severity: form.severity as "warning",
        channels: form.channels,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm({ ...form, name: "", subtype: "" });
      queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("alert_rules").update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alert-rules"] }),
  });

  const ack = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("alerts").update({ status: "acknowledged" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });

  return (
    <>
      <PageHeader title={t("alerts_title")} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel-surface p-5">
          <p className="label-mono">{t("rules")}</p>

          {membership?.isAdmin && (
            <form
              className="mt-4 grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                createRule.mutate();
              }}
            >
              <label className="space-y-1 sm:col-span-2">
                <span className="label-mono">{t("rule_name")}</span>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </label>
              <label className="space-y-1">
                <span className="label-mono">{t("filter_entity")}</span>
                <select
                  value={form.entity}
                  onChange={(e) => setForm({ ...form, entity: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {ENTITIES.map((en) => (
                    <option key={en} value={en}>
                      {t(`entity_${en}` as "entity_person")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="label-mono">{t("min_confidence")}</span>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={form.min_confidence}
                  onChange={(e) => setForm({ ...form, min_confidence: Number(e.target.value) })}
                />
              </label>
              <div className="space-y-1 sm:col-span-2">
                <span className="label-mono">{t("channels")}</span>
                <div className="flex gap-2">
                  {CHANNELS.map((ch) => {
                    const on = form.channels.includes(ch);
                    return (
                      <button
                        type="button"
                        key={ch}
                        onClick={() =>
                          setForm({
                            ...form,
                            channels: on ? form.channels.filter((c) => c !== ch) : [...form.channels, ch],
                          })
                        }
                        className={cn(
                          "rounded-md border px-3 py-1 text-xs",
                          on ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground",
                        )}
                      >
                        {ch}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Button type="submit" className="sm:col-span-2" disabled={createRule.isPending}>
                {t("add_rule")}
              </Button>
            </form>
          )}

          <div className="mt-4 divide-y divide-border">
            {(rules ?? []).length === 0 && <p className="py-3 text-sm text-muted-foreground">{t("no_data")}</p>}
            {(rules ?? []).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm">{r.name}</p>
                  <p className="label-mono mt-0.5">
                    {r.entity ? t(`entity_${r.entity}` as "entity_person") : t("filter_all")} ·{" "}
                    {Math.round(Number(r.min_confidence) * 100)}% · {r.channels.join(", ")}
                  </p>
                </div>
                <Switch
                  checked={r.enabled}
                  onCheckedChange={(enabled) => toggleRule.mutate({ id: r.id, enabled })}
                  disabled={!membership?.isAdmin}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="panel-surface p-5">
          <p className="label-mono">{t("open_alerts")}</p>
          <div className="mt-4 divide-y divide-border">
            {(alerts ?? []).length === 0 && <p className="py-3 text-sm text-muted-foreground">{t("no_data")}</p>}
            {(alerts ?? []).map((a) => {
              const event = a.events as { description: string | null; severity: string; occurred_at: string } | null;
              return (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{event?.description ?? (a.alert_rules as { name: string } | null)?.name}</p>
                    <p className="label-mono mt-0.5">
                      {new Date(event?.occurred_at ?? a.created_at).toLocaleString(locale)}
                    </p>
                  </div>
                  {a.status === "open" ? (
                    <Button size="sm" variant="outline" onClick={() => ack.mutate(a.id)}>
                      {t("acknowledge")}
                    </Button>
                  ) : (
                    <span className="label-mono">{t("acknowledged")}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
