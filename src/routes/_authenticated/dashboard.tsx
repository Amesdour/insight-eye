import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/app-shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Operations dashboard — Sentinel" },
      { name: "description", content: "Live overview of cameras, today's detections, alerts and activity heatmap." },
      { property: "og:title", content: "Operations dashboard — Sentinel" },
      { property: "og:description", content: "Cameras, detections, alerts and 24h activity at a glance." },
    ],
  }),
  component: Dashboard,
});

const ENTITIES = ["person", "vehicle", "animal", "object"] as const;

function Dashboard() {
  const { t, locale } = useI18n();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);

      const [cameras, footage, alerts, events] = await Promise.all([
        supabase.from("cameras").select("id, status"),
        supabase.from("footage").select("id, status"),
        supabase.from("alerts").select("id, status").eq("status", "open"),
        supabase
          .from("events")
          .select("id, entity, severity, description, occurred_at, confidence, cameras(name)")
          .gte("occurred_at", new Date(Date.now() - 86_400_000).toISOString())
          .order("occurred_at", { ascending: false }),
      ]);

      const evts = events.data ?? [];
      const today = evts.filter((e) => new Date(e.occurred_at) >= dayStart);

      const byCategory = ENTITIES.map((entity) => ({
        entity,
        count: today.filter((e) => e.entity === entity).length,
      }));

      const heat = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        count: evts.filter((e) => new Date(e.occurred_at).getHours() === hour).length,
      }));

      return {
        activeCameras: (cameras.data ?? []).filter((c) => c.status === "active").length,
        totalCameras: (cameras.data ?? []).length,
        analyzed: (footage.data ?? []).filter((f) => f.status === "analyzed").length,
        openAlerts: (alerts.data ?? []).length,
        todayCount: today.length,
        byCategory,
        heat,
        recent: evts.slice(0, 8),
      };
    },
  });

  const stats = [
    { label: t("dash_active_cams"), value: `${data?.activeCameras ?? 0}/${data?.totalCameras ?? 0}` },
    { label: t("dash_events_today"), value: data?.todayCount ?? 0 },
    { label: t("dash_open_alerts"), value: data?.openAlerts ?? 0, alert: (data?.openAlerts ?? 0) > 0 },
    { label: t("dash_storage"), value: data?.analyzed ?? 0 },
  ];

  const maxCat = Math.max(1, ...(data?.byCategory ?? []).map((c) => c.count));
  const maxHeat = Math.max(1, ...(data?.heat ?? []).map((h) => h.count));

  return (
    <>
      <PageHeader title={t("dash_title")} />

      {isLoading ? (
        <p className="label-mono">{t("loading")}</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className={cn("panel-surface p-4", s.alert && "border-destructive/60")}>
                <p className="label-mono">{s.label}</p>
                <p
                  className={cn(
                    "mt-2 font-display text-3xl font-semibold",
                    s.alert ? "text-destructive" : "text-foreground",
                  )}
                >
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="panel-surface p-5">
              <p className="label-mono">{t("dash_by_category")}</p>
              <div className="mt-4 space-y-3">
                {(data?.byCategory ?? []).map((c) => (
                  <div key={c.entity}>
                    <div className="flex justify-between text-sm">
                      <span>{t(`entity_${c.entity}` as "entity_person")}</span>
                      <span className="font-mono text-muted-foreground">{c.count}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-sm bg-secondary">
                      <div
                        className="h-2 rounded-sm bg-primary transition-all"
                        style={{ width: `${(c.count / maxCat) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel-surface p-5">
              <p className="label-mono">{t("dash_heatmap")}</p>
              <div className="mt-4 grid grid-cols-12 gap-1">
                {(data?.heat ?? []).map((h) => (
                  <div
                    key={h.hour}
                    title={`${h.hour}:00 — ${h.count}`}
                    className="aspect-square rounded-xs border border-border"
                    style={{
                      backgroundColor:
                        h.count === 0
                          ? "var(--color-secondary)"
                          : `color-mix(in oklab, var(--color-primary) ${Math.round((h.count / maxHeat) * 90) + 10}%, transparent)`,
                    }}
                  />
                ))}
              </div>
              <p className="label-mono mt-3">00h → 23h</p>
            </div>
          </div>

          <div className="panel-surface p-5">
            <p className="label-mono">{t("dash_recent")}</p>
            <div className="mt-3 divide-y divide-border">
              {(data?.recent ?? []).length === 0 && <p className="py-3 text-sm text-muted-foreground">{t("no_data")}</p>}
              {(data?.recent ?? []).map((e) => (
                <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      <span className="text-primary">{t(`entity_${e.entity}` as "entity_person")}</span>{" "}
                      {e.description}
                    </p>
                    <p className="label-mono mt-0.5">
                      {new Date(e.occurred_at).toLocaleString(locale)} ·{" "}
                      {(e.cameras as { name: string } | null)?.name ?? "—"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-sm px-2 py-0.5 text-xs",
                      e.severity === "critical"
                        ? "bg-destructive/20 text-destructive"
                        : e.severity === "warning"
                          ? "bg-warning/20 text-warning"
                          : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {t(`sev_${e.severity}` as "sev_info")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
