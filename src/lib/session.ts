import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Membership = {
  userId: string;
  email: string | null;
  fullName: string | null;
  tenant: { id: string; name: string; slug: string; plan: string; camera_limit: number; storage_gb: number } | null;
  roles: string[];
  isSuperAdmin: boolean;
  isAdmin: boolean;
};

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
          .select("full_name, email, tenant_id, tenants(id, name, slug, plan, camera_limit, storage_gb)")
          .eq("id", user.id)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);

      const roles = (roleRows ?? []).map((r) => String(r.role));
      const tenant = (profile?.tenants as Membership["tenant"]) ?? null;

      return {
        userId: user.id,
        email: profile?.email ?? user.email ?? null,
        fullName: profile?.full_name ?? null,
        tenant,
        roles,
        isSuperAdmin: roles.includes("super_admin"),
        isAdmin: roles.includes("admin") || roles.includes("super_admin"),
      };
    },
  });
}
