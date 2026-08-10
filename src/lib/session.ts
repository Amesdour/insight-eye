import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  camera_limit: number;
  storage_gb: number;
  seat_limit: number;
  subscription_status: string;
  billing_email: string | null;
  trial_ends_at: string;
  current_period_end: string | null;
};

export type Membership = {
  userId: string;
  email: string | null;
  fullName: string | null;
  tenant: Tenant | null;
  roles: string[];
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isAgent: boolean;
};

const TENANT_FIELDS =
  "id, name, slug, plan, camera_limit, storage_gb, seat_limit, subscription_status, billing_email, trial_ends_at, current_period_end";

export function useMembership() {
  return useQuery({
    queryKey: ["membership"],
    queryFn: async (): Promise<Membership | null> => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return null;

      const [{ data: profile }, { data: roleRows }] = await Promise.all([
        supabase
          .from("profiles")
          .select(`full_name, email, tenant_id, tenants(${TENANT_FIELDS})`)
          .eq("id", user.id)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);

      const roles = (roleRows ?? []).map((r) => String(r.role));
      const tenant = (profile?.tenants as Tenant | null) ?? null;

      return {
        userId: user.id,
        email: profile?.email ?? user.email ?? null,
        fullName: profile?.full_name ?? null,
        tenant,
        roles,
        isSuperAdmin: roles.includes("super_admin"),
        isAdmin: roles.includes("admin") || roles.includes("super_admin"),
        isAgent: roles.includes("agent"),
      };
    },
  });
}

/** Plan tiers with pricing and quotas, read from the catalog table. */
export function usePlanCatalog() {
  return useQuery({
    queryKey: ["plan-catalog"],
    staleTime: 5 * 60_000,
    queryFn: async () =>
      (await supabase.from("plan_catalog").select("*").order("sort_order")).data ?? [],
  });
}
