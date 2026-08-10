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
    const { ingestFrames } = await import("@/lib/pipeline.server");

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

    try {
      const result = await ingestFrames(supabase, {
        tenantId,
        cameraId,
        footageId: data.footageId,
        baseTime: new Date(footage.created_at).getTime(),
        frames: data.frames,
        cameraName,
        zone,
      });
      await supabase.from("footage").update({ status: "analyzed" }).eq("id", data.footageId);
      return result;
    } catch (error) {
      await supabase.from("footage").update({ status: "failed" }).eq("id", data.footageId);
      throw error;
    }
  });
