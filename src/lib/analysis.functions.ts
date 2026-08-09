import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const analyzeFootage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        footageId: z.string().uuid(),
        cameraId: z.string().uuid().nullable().optional(),
        frames: z
          .array(z.object({ offset: z.number().min(0), image: z.string().min(32).max(4_000_000) }))
          .min(1)
          .max(12),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { getDetectionProvider } = await import("@/lib/detection.server");

    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", userId).maybeSingle();
    const tenantId = profile?.tenant_id;
    if (!tenantId) throw new Error("No organization is linked to this account");

    const { data: footage, error: footageError } = await supabase
      .from("footage")
      .select("id, camera_id, created_at")
      .eq("id", data.footageId)
      .maybeSingle();
    if (footageError || !footage) throw new Error("Footage not found");

    const cameraId = data.cameraId ?? footage.camera_id ?? null;
    let cameraName: string | null = null;
    let zone: string | null = null;
    if (cameraId) {
      const { data: camera } = await supabase.from("cameras").select("name, zone").eq("id", cameraId).maybeSingle();
      cameraName = camera?.name ?? null;
      zone = camera?.zone ?? null;
    }

    await supabase.from("footage").update({ status: "analyzing" }).eq("id", data.footageId);

    let detections;
    try {
      detections = await getDetectionProvider().detect(data.frames, { cameraName, zone });
    } catch (error) {
      await supabase.from("footage").update({ status: "failed" }).eq("id", data.footageId);
      throw error;
    }

    const base = new Date(footage.created_at).getTime();
    const rows = detections.map((d) => ({
      tenant_id: tenantId,
      camera_id: cameraId,
      footage_id: data.footageId,
      occurred_at: new Date(base + d.offset_seconds * 1000).toISOString(),
      offset_seconds: d.offset_seconds,
      entity: d.entity,
      subtype: d.subtype,
      confidence: d.confidence,
      severity: d.severity,
      description: d.description,
      details: d.details,
    }));

    let inserted: { id: string; entity: string; subtype: string | null; confidence: number; camera_id: string | null }[] =
      [];
    if (rows.length) {
      const { data: insertedRows, error } = await supabase
        .from("events")
        .insert(rows)
        .select("id, entity, subtype, confidence, camera_id");
      if (error) throw new Error(error.message);
      inserted = insertedRows ?? [];
    }

    const { data: rules } = await supabase
      .from("alert_rules")
      .select("id, entity, subtype, min_confidence, camera_id, enabled")
      .eq("enabled", true);

    const alertRows = (rules ?? []).flatMap((rule) =>
      inserted
        .filter(
          (event) =>
            (!rule.entity || rule.entity === event.entity) &&
            (!rule.subtype || rule.subtype === event.subtype) &&
            (!rule.camera_id || rule.camera_id === event.camera_id) &&
            Number(event.confidence) >= Number(rule.min_confidence),
        )
        .map((event) => ({ tenant_id: tenantId, rule_id: rule.id, event_id: event.id, status: "open" })),
    );

    if (alertRows.length) await supabase.from("alerts").insert(alertRows);

    await supabase.from("footage").update({ status: "analyzed" }).eq("id", data.footageId);

    return { detections: inserted.length, alerts: alertRows.length };
  });
