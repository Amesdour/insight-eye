/**
 * Pluggable detection layer.
 *
 * The rest of the app only knows about `DetectionProvider`. Today the cloud
 * vision provider (Lovable AI gateway) is used; an on-prem/edge inference
 * provider can be registered here later without touching any callers.
 */

export type EntityType = "person" | "vehicle" | "animal" | "object";
export type Severity = "info" | "warning" | "critical";

export type Frame = { offset: number; image: string };

export type Detection = {
  entity: EntityType;
  subtype: string | null;
  confidence: number;
  severity: Severity;
  description: string;
  offset_seconds: number;
  details: Record<string, unknown>;
};

export type DetectionContext = {
  cameraName?: string | null;
  zone?: string | null;
};

export type DetectionRun = {
  detections: Detection[];
  /** 'ok' | 'parse_error' | 'provider_error' — never treat a non-ok run as "all clear". */
  status: "ok" | "parse_error" | "provider_error";
  raw: string;
  error?: string;
};

export interface DetectionProvider {
  id: string;
  detect(frames: Frame[], ctx: DetectionContext): Promise<DetectionRun>;
}

const SYSTEM_PROMPT = `You are a video surveillance analytics engine for industrial and public sites.
You receive ordered still frames sampled from one CCTV clip. For each meaningful observation, emit one detection.

Detect and classify:
- person: count, entering, exiting, loitering, restricted_zone
- vehicle: car, truck, van, motorcycle, bus; note direction and any visible plate region
- animal: any animal on the perimeter
- object: unattended_bag, open_door, open_gate, debris, fire_smoke

Severity guide: info = routine, warning = policy-relevant (loitering, animal, open gate),
critical = intrusion, unattended bag, fire/smoke, restricted-zone entry.

Reply with ONLY a JSON object of this exact shape:
{"detections":[{"entity":"person|vehicle|animal|object","subtype":"string","confidence":0.0-1.0,"severity":"info|warning|critical","description":"one short sentence","offset_seconds":number,"details":{}}]}
Return an empty array when nothing of interest is visible. Never invent detections.`;

type GatewayChoice = { message?: { content?: string } };

type ParseOutcome = { ok: boolean; detections: Detection[]; error?: string };

function parseDetections(raw: string, frames: Frame[]): ParseOutcome {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { ok: false, detections: [], error: "no JSON object in model response" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch (e) {
    return { ok: false, detections: [], error: `invalid JSON: ${(e as Error).message}` };
  }
  const list = (parsed as { detections?: unknown }).detections;
  if (!Array.isArray(list)) return { ok: false, detections: [], error: "missing detections array" };
  const allowedEntities: EntityType[] = ["person", "vehicle", "animal", "object"];
  const allowedSeverity: Severity[] = ["info", "warning", "critical"];
  const maxOffset = frames.length ? Math.max(...frames.map((f) => f.offset)) : 0;

  return list.slice(0, 60).flatMap((item): Detection[] => {
    const d = item as Record<string, unknown>;
    const entity = String(d['entity'] ?? "") as EntityType;
    if (!allowedEntities.includes(entity)) return [];
    const severity = allowedSeverity.includes(String(d['severity']) as Severity)
      ? (String(d['severity']) as Severity)
      : "info";
    const confidence = Math.min(1, Math.max(0, Number(d['confidence']) || 0.5));
    const offset = Math.min(maxOffset, Math.max(0, Number(d['offset_seconds']) || 0));
    return [
      {
        entity,
        subtype: d['subtype'] ? String(d['subtype']).slice(0, 60) : null,
        confidence,
        severity,
        description: String(d['description'] ?? "").slice(0, 300),
        offset_seconds: offset,
        details: (d['details'] && typeof d['details'] === "object" ? (d['details'] as Record<string, unknown>) : {}),
      },
    ];
  });
}

function createCloudVisionProvider(apiKey: string): DetectionProvider {
  return {
    id: "cloud-vision",
    async detect(frames, ctx) {
      const content: unknown[] = [
        {
          type: "text",
          text: `Camera: ${ctx.cameraName ?? "unknown"} — zone: ${ctx.zone ?? "unspecified"}.
Frames are given in order with their timestamp offsets in seconds: ${frames.map((f) => f.offset.toFixed(1)).join(", ")}.`,
        },
        ...frames.map((f) => ({ type: "image_url", image_url: { url: f.image } })),
      ];

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
        body: JSON.stringify({
          model: "google/gemini-3.6-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content },
          ],
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        if (response.status === 429) throw new Error("AI rate limit reached, please retry shortly.");
        if (response.status === 402) throw new Error("AI credits exhausted for this workspace.");
        throw new Error(`Detection provider failed [${response.status}]: ${body}`);
      }

      const json = (await response.json()) as { choices?: GatewayChoice[] };
      const text = json.choices?.[0]?.message?.content ?? "";
      return parseDetections(text, frames);
    },
  };
}

function createOnPremProvider(endpoint: string): DetectionProvider {
  return {
    id: "on-prem",
    async detect(frames, ctx) {
      const response = await fetch(`${endpoint.replace(/\/$/, "")}/detect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames, context: ctx }),
      });
      if (!response.ok) {
        throw new Error(`On-prem inference failed [${response.status}]: ${await response.text()}`);
      }
      const json = (await response.json()) as { detections?: Detection[] };
      return Array.isArray(json.detections) ? json.detections : [];
    },
  };
}

/** Resolve the active provider from the environment (per deployment / tier). */
export function getDetectionProvider(): DetectionProvider {
  const endpoint = process.env['ONPREM_INFERENCE_URL'];
  if (endpoint) return createOnPremProvider(endpoint);

  const apiKey = process.env['LOVABLE_API_KEY'];
  if (!apiKey) throw new Error("No detection provider configured");
  return createCloudVisionProvider(apiKey);
}
