import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useMembership } from "@/lib/session";
import { PageHeader } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Super-admin — Sentinel" },
      { name: "description", content: "Fikra Studio super-admin view of all client organizations." },
      { property: "og:title", content: "Super-admin — Sentinel" },
      { property: "og:description", content: "Tenant-wide overview of cameras, events and plans." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { t, locale } = useI18n();
  const { data: membership } = useMembership();

  const { data: tenants } = useQuery({
    enabled: !!membership?.isSuperAdmin,
    queryKey: ["tenants"],
    queryFn: async () =>
      (
        await supabase
          .from("tenants")
          .select("id, name, slug, plan, camera_limit, storage_gb, created_at, cameras(id), events(id)")
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  if (!membership?.isSuperAdmin) {
    return (
      <>
        <PageHeader title={t("admin_title")} />
        <p className="text-sm text-muted-foreground">403</p>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("admin_title")} />
      <div className="panel-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {[t("org"), t("plan"), t("cameras"), t("events"), t("storage_limit"), t("created")].map((h) => (
                <th key={h} className="label-mono px-4 py-3 text-start">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(tenants ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-muted-foreground">
                  {t("no_data")}
                </td>
              </tr>
            )}
            {(tenants ?? []).map((tn) => (
              <tr key={tn.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2.5">{tn.name}</td>
                <td className="px-4 py-2.5 text-primary uppercase">{tn.plan}</td>
                <td className="px-4 py-2.5 font-mono text-xs">
                  {(tn.cameras as { id: string }[] | null)?.length ?? 0}/{tn.camera_limit}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">{(tn.events as { id: string }[] | null)?.length ?? 0}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{tn.storage_gb}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{new Date(tn.created_at).toLocaleDateString(locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
