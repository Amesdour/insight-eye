import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useMembership } from "@/lib/session";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/cameras")({
  head: () => ({
    meta: [
      { title: "Cameras & zones — Sentinel" },
      { name: "description", content: "Manage cameras, zones and ingestion sources for your organization." },
      { property: "og:title", content: "Cameras & zones — Sentinel" },
      { property: "og:description", content: "Register cameras, assign zones and choose upload or RTSP ingestion." },
    ],
  }),
  component: CamerasPage,
});

function CamerasPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data: membership } = useMembership();
  const [form, setForm] = useState({ name: "", zone: "", location: "", source_type: "upload", rtsp_url: "" });

  const { data: cameras } = useQuery({
    queryKey: ["cameras"],
    queryFn: async () =>
      (await supabase.from("cameras").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const tenantId = membership?.tenant?.id;
      if (!tenantId) throw new Error("No organization");
      const limit = membership?.tenant?.camera_limit ?? 0;
      if (limit && (cameras?.length ?? 0) >= limit) throw new Error(`Plan limit reached (${limit} cameras)`);
      const { error } = await supabase.from("cameras").insert({
        tenant_id: tenantId,
        name: form.name,
        zone: form.zone || null,
        location: form.location || null,
        source_type: form.source_type,
        rtsp_url: form.source_type === "rtsp" ? form.rtsp_url || null : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm({ name: "", zone: "", location: "", source_type: "upload", rtsp_url: "" });
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      queryClient.invalidateQueries({ queryKey: ["cameras-list"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cameras").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries(),
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <>
      <PageHeader title={t("cameras_title")} />

      {membership?.isAdmin && (
        <form
          className="panel-surface mb-4 grid gap-3 p-5 md:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <label className="space-y-1">
            <span className="label-mono">{t("camera_name")}</span>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="space-y-1">
            <span className="label-mono">{t("zone")}</span>
            <Input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} />
          </label>
          <label className="space-y-1">
            <span className="label-mono">{t("location")}</span>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </label>
          <label className="space-y-1">
            <span className="label-mono">{t("source")}</span>
            <select
              value={form.source_type}
              onChange={(e) => setForm({ ...form, source_type: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="upload">{t("source_upload")}</option>
              <option value="rtsp">{t("source_rtsp")}</option>
            </select>
          </label>
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={create.isPending}>
              {t("add_camera")}
            </Button>
          </div>
          {form.source_type === "rtsp" && (
            <div className="md:col-span-5">
              <Input
                placeholder="rtsp://…"
                value={form.rtsp_url}
                onChange={(e) => setForm({ ...form, rtsp_url: e.target.value })}
              />
              <p className="label-mono mt-2">{t("rtsp_note")}</p>
            </div>
          )}
        </form>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(cameras ?? []).length === 0 && <p className="text-sm text-muted-foreground">{t("no_data")}</p>}
        {(cameras ?? []).map((c) => (
          <div key={c.id} className="panel-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display text-lg font-semibold tracking-wide">{c.name}</p>
                <p className="label-mono mt-1">
                  {c.zone ?? "—"} · {c.location ?? "—"}
                </p>
              </div>
              {membership?.isAdmin && (
                <Button variant="ghost" size="icon" onClick={() => remove.mutate(c.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span
                className={cn(
                  "rounded-sm px-2 py-0.5 text-xs",
                  c.status === "active" ? "bg-success/20 text-success" : "bg-secondary text-muted-foreground",
                )}
              >
                {c.status}
              </span>
              <span className="label-mono">
                {c.source_type === "rtsp" ? t("source_rtsp") : t("source_upload")}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
