import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { UploadCloud } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useMembership } from "@/lib/session";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sampleFrames, videoDuration } from "@/lib/frames";
import { analyzeFootage } from "@/lib/analysis.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/footage")({
  head: () => ({
    meta: [
      { title: "Footage & analysis — Sentinel" },
      { name: "description", content: "Upload MP4/AVI footage and run AI detection to generate structured events." },
      { property: "og:title", content: "Footage & analysis — Sentinel" },
      { property: "og:description", content: "Upload clips, run detection, review resulting events." },
    ],
  }),
  component: FootagePage,
});

function FootagePage() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const { data: membership } = useMembership();
  const analyze = useServerFn(analyzeFootage);
  const [cameraId, setCameraId] = useState("");
  const [progress, setProgress] = useState<string | null>(null);

  const { data: cameras } = useQuery({
    queryKey: ["cameras-list"],
    queryFn: async () => (await supabase.from("cameras").select("id, name").order("name")).data ?? [],
  });

  const { data: clips } = useQuery({
    queryKey: ["footage"],
    queryFn: async () =>
      (
        await supabase
          .from("footage")
          .select("id, file_name, status, created_at, duration_seconds, cameras(name), events(id)")
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const tenantId = membership?.tenant?.id;
      if (!tenantId) throw new Error("No organization");

      setProgress(t("upload_video"));
      const path = `${tenantId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("footage").upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;

      const duration = await videoDuration(file);
      const { data: row, error } = await supabase
        .from("footage")
        .insert({
          tenant_id: tenantId,
          camera_id: cameraId || null,
          file_name: file.name,
          storage_path: path,
          size_bytes: file.size,
          duration_seconds: Math.round(duration),
          status: "uploaded",
          uploaded_by: membership.userId,
        })
        .select("id")
        .single();
      if (error) throw error;

      setProgress(t("analyzing"));
      const frames = await sampleFrames(file);
      const result = await analyze({ data: { footageId: row.id, cameraId: cameraId || null, frames } });
      return result;
    },
    onSuccess: (result) => {
      toast.success(`${result.detections} ${t("detections")}`);
      queryClient.invalidateQueries();
    },
    onError: (error) => toast.error((error as Error).message),
    onSettled: () => setProgress(null),
  });

  return (
    <>
      <PageHeader title={t("footage_title")} />

      <div className="panel-surface mb-4 grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="space-y-1">
          <span className="label-mono">{t("select_camera")}</span>
          <select
            value={cameraId}
            onChange={(e) => setCameraId(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">—</option>
            {(cameras ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className={cn("relative", upload.isPending && "pointer-events-none opacity-60")}>
          <Input
            type="file"
            accept="video/mp4,video/x-msvideo,video/avi,video/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
              e.target.value = "";
            }}
          />
          <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
            <UploadCloud className="size-4" />
            {progress ?? t("upload_video")}
          </span>
        </label>
      </div>

      <div className="panel-surface divide-y divide-border">
        {(clips ?? []).length === 0 && <p className="p-5 text-sm text-muted-foreground">{t("no_data")}</p>}
        {(clips ?? []).map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate text-sm">{c.file_name}</p>
              <p className="label-mono mt-1">
                {new Date(c.created_at).toLocaleString(locale)} ·{" "}
                {(c.cameras as { name: string } | null)?.name ?? "—"} ·{" "}
                {(c.events as { id: string }[] | null)?.length ?? 0} {t("detections")}
              </p>
            </div>
            <span
              className={cn(
                "rounded-sm px-2 py-0.5 text-xs",
                c.status === "analyzed"
                  ? "bg-success/20 text-success"
                  : c.status === "failed"
                    ? "bg-destructive/20 text-destructive"
                    : "bg-secondary text-muted-foreground",
              )}
            >
              {c.status === "analyzed" ? t("analyzed") : c.status === "uploaded" ? t("uploaded") : c.status}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
