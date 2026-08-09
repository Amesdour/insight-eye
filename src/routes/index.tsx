import { createFileRoute, Link } from "@tanstack/react-router";
import { Radar, Layers, Cpu, BellRing, FileSpreadsheet } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { LanguageSwitch } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sentinel — Video Surveillance Analytics for Critical Sites" },
      {
        name: "description",
        content:
          "Multi-tenant surveillance analytics: AI people, vehicle, animal and object detection, event timeline, alerts and incident reports.",
      },
      { property: "og:title", content: "Sentinel — Video Surveillance Analytics" },
      {
        property: "og:description",
        content: "AI detection, searchable event timeline, configurable alerts and PDF/Excel incident reports.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { t } = useI18n();

  const features = [
    { icon: Layers, title: t("feat_multi"), body: t("feat_multi_d") },
    { icon: Cpu, title: t("feat_ai"), body: t("feat_ai_d") },
    { icon: BellRing, title: t("feat_alerts"), body: t("feat_alerts_d") },
    { icon: FileSpreadsheet, title: t("feat_reports"), body: t("feat_reports_d") },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <Radar className="size-5 text-primary" />
          <span className="font-display text-lg font-semibold tracking-wide">SENTINEL</span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitch />
          <Button asChild size="sm">
            <Link to="/auth">{t("signin")}</Link>
          </Button>
        </div>
      </header>

      <section className="grid-backdrop border-b border-border">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <p className="label-mono">Fikra Studio</p>
          <h1 className="mt-4 font-display text-4xl leading-tight font-semibold tracking-wide uppercase md:text-6xl">
            {t("landing_title")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground">{t("landing_sub")}</p>
          <div className="mt-8">
            <Button asChild size="lg">
              <Link to="/auth">{t("landing_cta")}</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-6 py-16 sm:grid-cols-2">
        {features.map((f) => (
          <div key={f.title} className="panel-surface p-5">
            <f.icon className="size-5 text-primary" />
            <h2 className="mt-3 font-display text-lg font-semibold tracking-wide uppercase">{f.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
