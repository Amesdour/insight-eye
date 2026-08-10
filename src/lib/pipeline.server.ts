/**
 * Detection ingest pipeline (server-only).
 *
 * Shared by uploaded-footage analysis and the live RTSP edge bridge:
 * frames -> detection provider -> events -> alert-rule evaluation -> notifications.
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
};

export async function ingestFrames(db: Db, input: IngestInput) {
  const detections = await getDetectionProvider().detect(input.frames, {
    cameraName: input.cameraName,
    zone: input.zone,
  });

  const rows = detections.map((d) => ({
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

  if (!rows.length) return { detections: 0, alerts: 0, notifications: 0 };

  const { data: inserted, error } = await db
    .from("events")
    .insert(rows)
    .select("id, entity, subtype, confidence, camera_id, severity, description, occurred_at");
  if (error) throw new Error(error.message);

  const events = inserted ?? [];

  const { data: rules } = await db
    .from("alert_rules")
    .select("id, name, entity, subtype, min_confidence, camera_id, enabled, channels, notify_emails, notify_phones, severity")
    .eq("tenant_id", input.tenantId)
    .eq("enabled", true);

  const matches = (rules ?? []).flatMap((rule) =>
    events
      .filter(
        (event) =>
          (!rule.entity || rule.entity === event.entity) &&
          (!rule.subtype || rule.subtype === event.subtype) &&
          (!rule.camera_id || rule.camera_id === event.camera_id) &&
          Number(event.confidence) >= Number(rule.min_confidence),
      )
      .map((event) => ({ rule, event })),
  );

  if (!matches.length) return { detections: events.length, alerts: 0, notifications: 0 };

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
        } at ${new Date(event.occurred_at).toISOString()} (confidence ${Math.round(Number(event.confidence) * 100)}%)`,
      },
    ];
  });

  const notifications = dispatches.length ? await dispatchAlerts(db, input.tenantId, dispatches) : 0;

  return { detections: events.length, alerts: alerts?.length ?? 0, notifications };
}
