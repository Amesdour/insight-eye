import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const TIERS = ["starter", "pro", "enterprise", "on_prem"] as const;

/**
 * Switch the organization to another plan tier.
 * Downgrades are blocked while current usage exceeds the target quota.
 */
export const changePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ tier: z.enum(TIERS) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", userId).maybeSingle();
    const tenantId = profile?.tenant_id;
    if (!tenantId) throw new Error("No organization is linked to this account");

    const { data: isAdmin } = await supabase.rpc("is_tenant_admin");
    if (!isAdmin) throw new Error("Only administrators can change the subscription");

    const [{ data: plan }, { data: tenant }] = await Promise.all([
      supabase.from("plan_catalog").select("*").eq("tier", data.tier).maybeSingle(),
      supabase.from("tenants").select("plan").eq("id", tenantId).maybeSingle(),
    ]);
    if (!plan) throw new Error("Unknown plan");

    const [{ count: cameraCount }, { count: seatCount }] = await Promise.all([
      supabase.from("cameras").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    ]);

    if ((cameraCount ?? 0) > plan.camera_limit) {
      throw new Error(`This plan allows ${plan.camera_limit} cameras; you currently have ${cameraCount}.`);
    }
    if ((seatCount ?? 0) > plan.seat_limit) {
      throw new Error(`This plan allows ${plan.seat_limit} seats; you currently have ${seatCount}.`);
    }

    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const { error } = await supabase
      .from("tenants")
      .update({
        plan: data.tier,
        camera_limit: plan.camera_limit,
        storage_gb: plan.storage_gb,
        seat_limit: plan.seat_limit,
        subscription_status: "active",
        current_period_end: periodEnd.toISOString(),
      })
      .eq("id", tenantId);
    if (error) throw new Error(error.message);

    await supabase.from("subscription_events").insert({
      tenant_id: tenantId,
      from_tier: (tenant?.plan ?? null) as "starter" | null,
      to_tier: data.tier,
      amount_eur: plan.price_eur_month,
      note: `Switched to ${plan.label}`,
      created_by: userId,
    });

    return { tier: data.tier, price: plan.price_eur_month, periodEnd: periodEnd.toISOString() };
  });
