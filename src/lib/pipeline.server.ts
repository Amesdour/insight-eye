/**
 * Detection ingest pipeline (server-only).
 *
 * Shared by uploaded-footage analysis and the live RTSP edge bridge:
 * frames -> detection provider -> events (deduped into incidents) ->
 * alert-rule evaluation (with hysteresis) -> notifications.
 *
 * Every run is recorded in `pipeline_runs`, so a broken parser or a failing
 * provider is visibly different from "nothing happened" — the worst possible
 * silent failure for a security product.
 */
import { dispatchAlerts, type AlertDispatch, type Db } from "@/lib/notifications.server";
import { getDetectionProvider } from "@/lib/detection.server";

export type Frame = { offset: number; image: string };

export type IngestInput = {
  tenantId: string;
  cameraId: string | null;
  footageId?: string | null;
  baseTime: number;
  frames: Frame[];
  cameraName: string | null;
  zone: string | null;
  source?: "upload" | "live";
};

/** Detections of the same entity on the same camera inside this window merge into one incident. */
const DEDUP_WINDOW_SECONDS = 120;
/** Confidence band above a rule threshold in which a single sighting is not yet enough to alert. */
const HYSTERESIS_BAND = 0.05;
/** Rough per-frame cloud-vision cost, used for per-tenant spend visibility. */
const COST_PER_FRAME_USD = 0.0006;

type EventRow = {
  id: string;
  entity: string;
  subtype: string | null;
  confidence: number;
  camera_id: string | null;
  severity: string;
  description: string | null;
  occurred_at: string;
  occurrence_count: number;
};

export async function ingestFrames(db: Db, input: IngestInput) {
  const provider = getDetectionProvider();
  const startedAt = Date.now();
  const source = input.source ?? (input.footageId ? "upload" : "live");

  const logRun = async (fields: {
    status: string;
    detections: number;
    raw?: string | null;
    error?: string | null;
  }) => {
    await db.from("pipeline_runs").insert({
      tenant_id: input.tenantId,
      camera_id: input.cameraId,
      footage_id: input.footageId ?? null,
      source,
      provider: provider.id,
      frame_count: input.frames.length,
      status: fields.status,
      detections: fields.detections,
      raw_excerpt: fields.raw ? fields.raw.slice(0, 2000) : null,
      error: fields.error ?? null,
      latency_ms: Date.now() - startedAt,
      estimated_cost_usd: Number((input.frames.length * COST_PER_FRAME_USD).toFixed(6)),
    });
  };

  let run;
  try {
    run = await provider.detect(input.frames, { cameraName: input.cameraName, zone: input.zone });
  } catch (error) {
    await logRun({ status: "provider_error", detections: 0, error: (error as Error).message });
    throw error;
  }

  if (run.status !== "ok") {
    await logRun({
      status: run.status,
      detections: 0,
      raw: run.raw,
      error: run.error ?? "unreadable provider response",
    });
    throw new Error(`Detection response could not be read (${run.error ?? "parse error"})`);
  }

  const detections = run.detections;
  await logRun({ status: "ok", detections: detections.length, raw: run.raw });

  if (!detections.length) return { detections: 0, alerts: 0, notifications: 0, merged: 0 };

  // --- Dedup: merge repeat sightings into an open incident -------------------
  const windowStart = new Date(input.baseTime - DEDUP_WINDOW_SECONDS * 1000).toISOString();
  let openQuery = db
    .from("events")
    .select("id, entity, subtype, confidence, camera_id, severity, description, occurred_at, occurrence_count")
    .eq("tenant_id", input.tenantId)
    .gte("occurred_at", windowStart)
    .order("occurred_at", { ascending: false })
    .limit(200);
  openQuery = input.cameraId ? openQuery.eq("camera_id", input.cameraId) : openQuery.is("camera_id", null);
  const { data: openEvents } = await openQuery;

  const candidates: EventRow[] = [...((openEvents ?? []) as EventRow[])];
  const merged: EventRow[] = [];
  const fresh: typeof detections = [];

  for (const d of detections) {
    const match = candidates.find(
      (e) => e.entity === d.entity && (e.subtype ?? null) === (d.subtype ?? null),
    );
    if (match) {
      match.occurrence_count += 1;
      match.confidence = Math.max(Number(match.confidence), d.confidence);
      merged.push(match);
    } else {
      fresh.push(d);
    }
  }

  for (const m of merged) {
    await db
      .from("events")
      .update({
        occurrence_count: m.occurrence_count,
        confidence: m.confidence,
        ended_at: new Date(input.baseTime).toISOString(),
      })
      .eq("id", m.id);
  }

  let inserted: EventRow[] = [];
  if (fresh.length) {
    const rows = fresh.map((d) => ({
      tenant_id: input.tenantId,
      camera_id: input.cameraId,
      footage_id: input.footageId ?? null,
      occurred_at: new Date(input.baseTime + d.offset_seconds * 1000).toISOString(),
      offset_seconds: d.offset_seconds,
      entity: d.entity,
      subtype: d.subtype,
      confidence: d.confidence,
      severity: d.severity,
      description: d.description,
      details: d.details as Record<string, never>,
    }));
    const { data, error } = await db
      .from("events")
      .insert(rows)
      .select("id, entity, subtype, confidence, camera_id, severity, description, occurred_at, occurrence_count");
    if (error) throw new Error(error.message);
    inserted = (data ?? []) as EventRow[];
  }

  // Merged incidents are only re-considered for alerting if they never alerted.
  let alertableMerged: EventRow[] = [];
  if (merged.length) {
    const { data: existing } = await db
      .from("alerts")
      .select("event_id")
      .in("event_id", merged.map((m) => m.id));
    const alerted = new Set((existing ?? []).map((a) => a.event_id));
    alertableMerged = merged.filter((m) => !alerted.has(m.id));
  }

  const events = [...inserted, ...alertableMerged];
  const detectedCount = inserted.length + merged.length;

  const { data: rules } = await db
    .from("alert_rules")
    .select("id, name, entity, subtype, min_confidence, camera_id, enabled, channels, notify_emails, notify_phones, severity")
    .eq("tenant_id", input.tenantId)
    .eq("enabled", true);

  const matches = (rules ?? []).flatMap((rule) =>
    events
      .filter((event) => {
        if (rule.entity && rule.entity !== event.entity) return false;
        if (rule.subtype && rule.subtype !== event.subtype) return false;
        if (rule.camera_id && rule.camera_id !== event.camera_id) return false;
        const threshold = Number(rule.min_confidence);
        const confidence = Number(event.confidence);
        if (confidence < threshold) return false;
        // Hysteresis: a borderline single sighting waits for a second one.
        if (confidence < threshold + HYSTERESIS_BAND && (event.occurrence_count ?? 1) < 2) return false;
        return true;
      })
      .map((event) => ({ rule, event })),
  );

  if (!matches.length) {
    return { detections: detectedCount, alerts: 0, notifications: 0, merged: merged.length };
  }

  const { data: alerts } = await db
    .from("alerts")
    .insert(
      matches.map((m) => ({
        tenant_id: input.tenantId,
        rule_id: m.rule.id,
        event_id: m.event.id,
        status: "open",
      })),
    )
    .select("id, rule_id, event_id");

  const dispatches: AlertDispatch[] = (alerts ?? []).flatMap((alert) => {
    const match = matches.find((m) => m.rule.id === alert.rule_id && m.event.id === alert.event_id);
    if (!match) return [];
    const { rule, event } = match;
    if (!rule.channels.includes("email") && !rule.channels.includes("sms")) return [];
    return [
      {
        alertId: alert.id,
        ruleId: rule.id,
        ruleName: rule.name,
        channels: rule.channels,
        emails: rule.notify_emails ?? [],
        phones: rule.notify_phones ?? [],
        severity: String(event.severity ?? rule.severity),
        summary: `${event.description ?? event.entity} — ${input.cameraName ?? "camera"}${
          input.zone ? ` / ${input.zone}` : ""
        } at ${new Date(event.occurred_at).toISOString()} (confidence ${Math.round(Number(event.confidence) * 100)}%${
          (event.occurrence_count ?? 1) > 1 ? `, seen ${event.occurrence_count}×` : ""
        })`,
      },
    ];
  });

  const notifications = dispatches.length ? await dispatchAlerts(db, input.tenantId, dispatches) : 0;

  return {
    detections: detectedCount,
    alerts: alerts?.length ?? 0,
    notifications,
    merged: merged.length,
  };
}
