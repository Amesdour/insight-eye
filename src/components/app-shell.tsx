import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  ListFilter,
  Video,
  Cctv,
  BellRing,
  Settings2,
  ShieldCheck,
  LogOut,
  Languages,
  Radar,
} from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n, LOCALES, type TranslationKey } from "@/lib/i18n";
import { useMembership } from "@/lib/session";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const NAV: { to: string; key: TranslationKey; icon: typeof Radar; adminOnly?: boolean; superOnly?: boolean }[] = [
  { to: "/dashboard", key: "nav_dashboard", icon: LayoutDashboard },
  { to: "/events", key: "nav_events", icon: ListFilter },
  { to: "/footage", key: "nav_footage", icon: Video },
  { to: "/cameras", key: "nav_cameras", icon: Cctv },
  { to: "/alerts", key: "nav_alerts", icon: BellRing },
  { to: "/settings", key: "nav_settings", icon: Settings2 },
  { to: "/admin", key: "nav_admin", icon: ShieldCheck, superOnly: true },
];

export function LanguageSwitch() {
  const { locale, setLocale } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 label-mono">
          <Languages className="size-4" />
          {locale.toUpperCase()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LOCALES.map((l) => (
          <DropdownMenuItem key={l.code} onClick={() => setLocale(l.code)}>
            {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: membership } = useMembership();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const items = NAV.filter((item) => !item.superOnly || membership?.isSuperAdmin);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-e border-border bg-card md:flex">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <Radar className="size-5 text-primary" />
          <div>
            <p className="font-display text-lg leading-none font-semibold tracking-wide">SENTINEL</p>
            <p className="label-mono mt-1">{t("brand_tagline")}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {items.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary/15 text-primary border-s-2 border-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <item.icon className="size-4" />
                {t(item.key)}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <p className="label-mono">{membership?.tenant?.name ?? "—"}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{membership?.email}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
          <div className="flex items-center gap-3 md:hidden">
            <Radar className="size-5 text-primary" />
            <span className="font-display text-base font-semibold">SENTINEL</span>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <span className="size-2 animate-pulse rounded-full bg-success" />
            <span className="label-mono">{membership?.tenant?.plan?.toUpperCase() ?? "—"}</span>
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitch />
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-2">
              <LogOut className="size-4" />
              <span className="hidden sm:inline">{t("signout")}</span>
            </Button>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-card px-2 py-2 md:hidden">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs whitespace-nowrap",
                pathname.startsWith(item.to) ? "bg-primary/15 text-primary" : "text-muted-foreground",
              )}
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-display text-2xl font-semibold tracking-wide uppercase">{title}</h1>
      {action}
    </div>
  );
}
