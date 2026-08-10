import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InviteInput = z.object({
  email: z.string().trim().email().max(255),
  role: z.enum(["admin", "agent", "viewer"]),
});

export const createInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InviteInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { deliver } = await import("@/lib/notifications.server");

    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id, full_name, email, tenants(name, seat_limit)")
      .eq("id", userId)
      .maybeSingle();

    const tenantId = profile?.tenant_id;
    if (!tenantId) throw new Error("No organization is linked to this account");

    const { data: isAdmin } = await supabase.rpc("is_tenant_admin");
    if (!isAdmin) throw new Error("Only administrators can invite members");

    const tenant = profile?.tenants as { name: string; seat_limit: number } | null;

    const [{ count: memberCount }, { count: pendingCount }] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      supabase
        .from("invitations")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "pending"),
    ]);

    const used = (memberCount ?? 0) + (pendingCount ?? 0);
    if (tenant && used >= tenant.seat_limit) {
      throw new Error(`Seat limit reached (${tenant.seat_limit}). Upgrade your plan to invite more members.`);
    }

    const { data: invite, error } = await supabase
      .from("invitations")
      .insert({ tenant_id: tenantId, email: data.email.toLowerCase(), role: data.role, invited_by: userId })
      .select("id, email, role, expires_at")
      .single();
    if (error) throw new Error(error.message);

    const orgName = tenant?.name ?? "your organization";
    const result = await deliver(
      "email",
      invite.email,
      `You have been invited to ${orgName} on Sentinel`,
      `${profile?.full_name ?? profile?.email ?? "An administrator"} invited you to join <strong>${orgName}</strong> as <strong>${
        invite.role
      }</strong>. Create your account with this email address to join automatically.`,
    );

    await supabase.from("notifications").insert({
      tenant_id: tenantId,
      channel: "email",
      destination: invite.email,
      status: result.status,
      error: result.error ?? null,
      sent_at: result.status === "sent" ? new Date().toISOString() : null,
    });

    return { invite, delivery: result.status };
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("invitations")
      .update({ status: "revoked" })
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
