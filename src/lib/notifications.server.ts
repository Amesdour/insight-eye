/**
 * Notification delivery layer (server-only).
 *
 * Pluggable like the detection layer: email and SMS each resolve a provider from
 * the environment. When no provider is configured the attempt is still recorded
 * in `notifications` with status `skipped`, so operators can see what *would*
 * have been sent before wiring a real gateway.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type Db = SupabaseClient<Database>;

export type DeliveryResult = { status: "sent" | "failed" | "skipped"; error?: string };

const GATEWAY = "https://connector-gateway.lovable.dev";

async function sendEmail(to: string, subject: string, body: string): Promise<DeliveryResult> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const resendKey = process.env["RESEND_API_KEY"];
  const from = process.env["ALERT_FROM_EMAIL"] ?? "Sentinel <alerts@sentinel.app>";

  if (!lovableKey || !resendKey) return { status: "skipped", error: "no_email_provider" };

  try {
    const res = await fetch(`${GATEWAY}/resend/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html: `<div style="font-family:system-ui,sans-serif"><h2 style="color:#F97316">${subject}</h2><p>${body}</p></div>`,
      }),
    });
    if (!res.ok) return { status: "failed", error: `[${res.status}] ${await res.text()}` };
    return { status: "sent" };
  } catch (error) {
    return { status: "failed", error: (error as Error).message };
  }
}

async function sendSms(to: string, body: string): Promise<DeliveryResult> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const smsKey = process.env["GATEWAYAPI_API_KEY"];
  const sender = process.env["ALERT_SMS_SENDER"] ?? "SENTINEL";

  if (!lovableKey || !smsKey) return { status: "skipped", error: "no_sms_provider" };

  const recipient = Number(to.replace(/[^0-9]/g, ""));
  if (!recipient) return { status: "failed", error: "invalid_number" };

  try {
    const res = await fetch(`${GATEWAY}/gatewayapi/mobile/single`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": smsKey,
      },
      body: JSON.stringify({ sender, recipient, message: body.slice(0, 480) }),
    });
    if (!res.ok) return { status: "failed", error: `[${res.status}] ${await res.text()}` };
    return { status: "sent" };
  } catch (error) {
    return { status: "failed", error: (error as Error).message };
  }
}

export async function deliver(
  channel: "email" | "sms",
  destination: string,
  subject: string,
  body: string,
): Promise<DeliveryResult> {
  return channel === "email" ? sendEmail(destination, subject, body) : sendSms(destination, body);
}

export type AlertDispatch = {
  alertId: string;
  ruleId: string;
  ruleName: string;
  channels: string[];
  emails: string[];
  phones: string[];
  summary: string;
  severity: string;
};

/** Fan out one batch of freshly created alerts across their rule's channels. */
export async function dispatchAlerts(db: Db, tenantId: string, dispatches: AlertDispatch[]) {
  const rows: Database["public"]["Tables"]["notifications"]["Insert"][] = [];

  for (const d of dispatches) {
    const targets: { channel: "email" | "sms"; destination: string }[] = [
      ...(d.channels.includes("email") ? d.emails.map((e) => ({ channel: "email" as const, destination: e })) : []),
      ...(d.channels.includes("sms") ? d.phones.map((p) => ({ channel: "sms" as const, destination: p })) : []),
    ];

    const subject = `[${d.severity.toUpperCase()}] ${d.ruleName}`;
    for (const target of targets) {
      const result = await deliver(target.channel, target.destination, subject, d.summary);
      rows.push({
        tenant_id: tenantId,
        alert_id: d.alertId,
        rule_id: d.ruleId,
        channel: target.channel,
        destination: target.destination,
        status: result.status,
        error: result.error ?? null,
        sent_at: result.status === "sent" ? new Date().toISOString() : null,
      });
    }
  }

  if (rows.length) await db.from("notifications").insert(rows);
  return rows.length;
}
