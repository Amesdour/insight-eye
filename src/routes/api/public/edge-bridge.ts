/**
 * Sentinel Edge bridge — public ingestion endpoint for live RTSP cameras.
 *
 * The on-site agent pulls the RTSP stream (which cannot be read from the cloud
 * runtime), then POSTs a heartbeat and, optionally, sampled frames here.
 * Authentication is a shared bridge secret compared in constant time.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Payload = z.object({
  camera_id: z.string().uuid(),
  status: z.enum(["live", "offline", "connecting", "idle"]).default("live"),
  latency_ms: z.number().int().min(0).max(600_000).optional(),
  message: z.string().max(500).optional(),
  frames: z
    .array(z.object({ offset: z.number().min(0), image: z.string().min(32).max(4_000_000) }))
    .max(8)
    .optional(),
});

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/edge-bridge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["EDGE_BRIDGE_SECRET"];
        if (!expected) return new Response("Bridge not configured", { status: 503 });

        const provided = request.headers.get("x-bridge-secret") ?? "";
        if (!safeEqual(provided, expected)) return new Response("Invalid bridge secret", { status: 401 });

        let payload: z.infer<typeof Payload>;
        try {
          payload = Payload.parse(await request.json());
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: camera } = await supabaseAdmin
          .from("cameras")
          .select("id, tenant_id, name, zone, source_type")
          .eq("id", payload.camera_id)
          .maybeSingle();
        if (!camera) return new Response("Unknown camera", { status: 404 });

        const now = new Date().toISOString();
        await Promise.all([
          supabaseAdmin
            .from("cameras")
            .update({
              stream_status: payload.status,
              is_live: payload.status === "live",
              last_seen_at: now,
              last_error: payload.status === "offline" ? (payload.message ?? "stream unreachable") : null,
              status: payload.status === "offline" ? "offline" : "online",
            })
            .eq("id", camera.id),
          supabaseAdmin.from("camera_health").insert({
            tenant_id: camera.tenant_id,
            camera_id: camera.id,
            status: payload.status,
            latency_ms: payload.latency_ms ?? null,
            message: payload.message ?? null,
          }),
        ]);

        let analysis = { detections: 0, alerts: 0, notifications: 0 };
        if (payload.frames?.length) {
          const { ingestFrames } = await import("@/lib/pipeline.server");
          analysis = await ingestFrames(supabaseAdmin, {
            tenantId: camera.tenant_id,
            cameraId: camera.id,
            baseTime: Date.now(),
            frames: payload.frames,
            cameraName: camera.name,
            zone: camera.zone,
          });
        }

        return Response.json({ ok: true, ...analysis });
      },
    },
  },
});
