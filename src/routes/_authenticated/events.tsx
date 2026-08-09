import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exportExcel, exportPdf, type ReportRow } from "@/lib/export";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/events")({
  head: () => ({
    meta: [
      { title: "Event timeline — Sentinel" },
      { name: "description", content: "Searchable detection log with filters and PDF/Excel incident export." },
      { property: "og:title", content: "Event timeline — Sentinel" },
      { property: "og:description", content: "Filter detections by date, camera and entity, then export reports." },
    ],
  }),
  component: EventsPage,
});

const ENTITIES = ["person", "vehicle", "animal", "object"] as const;

function EventsPage() {
  const { t, locale } = useI18n();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [camera, setCamera] = useState("");
  const [entity, setEntity] = useState("");

  const { data: cameras } = useQuery({
    queryKey: ["cameras-list"],
    queryFn: async () => (await supabase.from("cameras").select("id, name").order("name")).data ?? [],
  });

  const { data: events, isLoading } = useQuery({
    queryKey: ["events", from, to, camera, entity],
    queryFn: async () => {
      let query = supabase
        .from("events")
        .select("id, entity, subtype, description, confidence, severity, occurred_at, cameras(name)")
        .order("occurred_at", { ascending: false })
        .limit(500);
      if (from) query = query.gte("occurred_at", new Date(from).toISOString());
      if (to) query = query.lte("occurred_at", new Date(`${to}T23:59:59`).toISOString());
      if (camera) query = query.eq("camera_id", camera);
      if (entity) query = query.eq("entity", entity as "person");
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows: ReportRow[] = useMemo(
    () =>
      (events ?? []).map((e) => ({
        time: new Date(e.occurred_at).toLocaleString(locale),
        entity: t(`entity_${e.entity}` as "entity_person"),
        detail: e.subtype ? `${e.subtype} — ${e.description ?? ""}` : (e.description ?? ""),
        confidence: `${Math.round(Number(e.confidence) * 100)}%`,
        camera: (e.cameras as { name: string } | null)?.name ?? "—",
        severity: t(`sev_${e.severity}` as "sev_info"),
      })),
    [events, locale, t],
  );

  async function doExport(kind: "pdf" | "excel") {
    if (!rows.length) return toast.error(t("no_data"));
    const name = `sentinel-incidents-${new Date().toISOString().slice(0, 10)}`;
    if (kind === "excel") await exportExcel(rows, name);
    else await exportPdf(rows, name, "SENTINEL — Incident report", `${rows.length} events · ${new Date().toLocaleString(locale)}`);
  }

  return (
    <>
      <PageHeader
        title={t("events_title")}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => doExport("pdf")}>
              {t("export_pdf")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => doExport("excel")}>
              {t("export_excel")}
            </Button>
          </div>
        }
      />

      <div className="panel-surface mb-4 grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1">
          <span className="label-mono">{t("filter_from")}</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="label-mono">{t("filter_to")}</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="label-mono">{t("filter_camera")}</span>
          <select
            value={camera}
            onChange={(e) => setCamera(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{t("filter_all")}</option>
            {(cameras ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="label-mono">{t("filter_entity")}</span>
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{t("filter_all")}</option>
            {ENTITIES.map((en) => (
              <option key={en} value={en}>
                {t(`entity_${en}` as "entity_person")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="panel-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-start">
              {[t("col_time"), t("col_entity"), t("col_detail"), t("col_confidence"), t("col_camera"), t("col_severity")].map(
                (h) => (
                  <th key={h} className="label-mono px-4 py-3 text-start">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="px-4 py-4 text-muted-foreground" colSpan={6}>
                  {t("loading")}
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td className="px-4 py-4 text-muted-foreground" colSpan={6}>
                  {t("no_data")}
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={(events ?? [])[i]?.id ?? i} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">{r.time}</td>
                <td className="px-4 py-2.5 text-primary">{r.entity}</td>
                <td className="max-w-sm px-4 py-2.5">{r.detail}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{r.confidence}</td>
                <td className="px-4 py-2.5">{r.camera}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={cn(
                      "rounded-sm px-2 py-0.5 text-xs",
                      (events ?? [])[i]?.severity === "critical"
                        ? "bg-destructive/20 text-destructive"
                        : (events ?? [])[i]?.severity === "warning"
                          ? "bg-warning/20 text-warning"
                          : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {r.severity}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
