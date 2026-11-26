"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Role } from "@bmerc/shared";
import { Avatar, RoleBadge, roleDoes, roleKey, roleLabel, roleStyle, workplace } from "./role";
import { SessionProvider, useSession } from "@/lib/session";
import { Icon, type IconName } from "./icons";
import { ButtonLink, Card } from "./ui";
import { useApi } from "@/lib/use-api";
import type { Me, Usage } from "@/lib/types";

interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  roles: Role[] | "all";
  /** Other pages that belong under this item (highlights it there). */
  also?: string[];
  /** Show the number of part requests waiting. */
  badge?: "partRequests";
}

// One "Main menu" group, as in the prototype: the company admin menu is Dashboard, Customers, Sites,
// Subscription (Reports comes later); technicians get My jobs, Scan QR, My team. Jobs, teams, technicians
// and stock open from the dashboard and the site detail tabs, as in the prototype.
const ADMIN: Role[] = ["company_admin", "site_manager"];
const BENCH: Role[] = ["head_technician", "technician"];
const NAV: Array<{ group: string; items: NavItem[] }> = [
  {
    group: "Main menu",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "grid", roles: [...ADMIN, "stock_keeper"], also: ["/jobs", "/board", "/devices", "/job-cards"] },
      { label: "My jobs", href: "/board", icon: "wrench", roles: BENCH, also: ["/jobs", "/devices", "/job-cards"] },
      { label: "Scan QR", href: "/scan", icon: "qr", roles: [...BENCH, "stock_keeper"] },
      { label: "My team", href: "/team", icon: "users", roles: BENCH },
      { label: "Customers", href: "/customers", icon: "users", roles: ADMIN },
      { label: "Part requests", href: "/stock/requests", icon: "box", roles: [...ADMIN, "stock_keeper", "head_technician"], badge: "partRequests" },
      { label: "Sites", href: "/sites", icon: "pin", roles: [...ADMIN, "stock_keeper"], also: ["/stock", "/parts", "/technicians"] },
      { label: "Teams", href: "/teams", icon: "wrench", roles: ADMIN },
      { label: "Staff", href: "/users", icon: "users", roles: ADMIN },
      { label: "Reports", href: "/reports", icon: "chart", roles: ADMIN },
      { label: "Subscription", href: "/subscription", icon: "doc", roles: ["company_admin"], also: ["/settings/company"] },
    ],
  },
];

// Platform owner menu (prototype OWNER_NAV). Shown only to platform owner accounts.
const OWNER_NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "grid", roles: "all", also: ["/platform/companies"] },
  { label: "Sites", href: "/platform/sites", icon: "pin", roles: "all" },
  { label: "Reports", href: "/platform/reports", icon: "chart", roles: "all" },
  { label: "Quotas", href: "/platform/quotas", icon: "shield", roles: "all" },
  { label: "Plans", href: "/platform/plans", icon: "doc", roles: "all" },
  { label: "Miner models", href: "/platform/models", icon: "box", roles: "all" },
  { label: "Revenue", href: "/platform/revenue", icon: "dollar", roles: "all" },
  { label: "Payments", href: "/platform/payments", icon: "dollar", roles: "all" },
  { label: "Pending payments", href: "/platform/pending", icon: "dollar", roles: "all" },
  { label: "Platform health", href: "/platform/health", icon: "heart", roles: "all" },
  { label: "Audit log", href: "/platform/audit", icon: "list", roles: "all" },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SessionProvider fallback={<div className="p-10 text-center text-muted">Loading…</div>}>
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}

/**
 * Menu: full width on wide screens, icon rail below 1024px.
 * The toggle flips that default: wide → rail, narrow → full menu over the page.
 */
function Shell({ children }: { children: ReactNode }) {
  const { me, logout } = useSession();
  const pathname = usePathname();
  const [flipped, setFlipped] = useState(false);
  const decider = !!me.role && ["stock_keeper", "company_admin", "site_manager", "head_technician"].includes(me.role);
  const pendingRequests = useApi<{ count: number }>(decider && me.company?.status === "active" ? "/part-requests/pending-count" : null);

  // A suspended company sees only this page, plus its subscription, invoices and billing details to pay.
  const billingPage = pathname === "/settings/company" || pathname === "/subscription" || pathname.startsWith("/subscription/");
  if (me.company && me.company.status !== "active" && !billingPage) {
    return <Suspended name={me.company.name} isAdmin={me.role === "company_admin"} logout={logout} />;
  }

  const visible = (i: NavItem) => i.roles === "all" || (!!me.role && i.roles.includes(me.role));
  const menu = me.isPlatformAdmin ? [{ group: "Main menu", items: OWNER_NAV }] : NAV;
  const rk = roleKey(me);
  // Only one menu item lights up: the one whose path matches the current page most closely
  // (e.g. /stock/requests is "Part requests", not "Sites", even though Sites also covers /stock).
  const matchLen = (i: NavItem) =>
    Math.max(-1, ...[i.href, ...(i.also ?? [])].filter((h) => pathname === h || pathname.startsWith(`${h}/`)).map((h) => h.length));
  const activeHref = menu
    .flatMap((g) => g.items.filter(visible))
    .reduce<{ href: string | null; len: number }>((best, i) => (matchLen(i) > best.len ? { href: i.href, len: matchLen(i) } : best), { href: null, len: -1 }).href;
  const home = pathname === "/dashboard" || (pathname === "/board" && (me.role === "technician" || me.role === "head_technician"));

  // Classes for "shown when the menu is expanded" and the aside width, per screen size.
  const whenExpanded = flipped ? "inline lg:hidden" : "hidden lg:inline";
  const labelWhenExpanded = flipped ? "block lg:hidden" : "hidden lg:block";
  const asideWidth = flipped ? "w-64 lg:w-[72px]" : "w-[72px] lg:w-64";
  const mainMargin = flipped ? "lg:ml-[72px]" : "lg:ml-64";
  // Icon rail: icons centred with no side padding, as in the prototype.
  const linkPad = flipped ? "px-5 lg:justify-center lg:px-0" : "justify-center px-0 lg:justify-start lg:px-5";

  return (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between bg-white px-4 sm:px-6">
        <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${roleStyle(rk).bar}`} />
        <div className="flex items-center gap-3">
          <button
            onClick={() => setFlipped((f) => !f)}
            aria-label="Show or hide menu"
            className="flex h-9 w-10 items-center justify-center rounded-lg bg-field text-navy shadow-[0_1px_2px_rgba(0,0,0,.05)]"
          >
            <Icon name="menu" />
          </button>
          <span className="text-base font-bold text-navy">BMERC</span>
          <RoleBadge k={rk} className="hidden sm:inline-flex" />
        </div>
        <div className="flex items-center gap-4">
          <Link href="/account/password" title="Your account" className="flex items-center gap-2.5">
            <Avatar name={me.fullName} k={rk} />
            <span className="hidden leading-tight md:block">
              <span className="block text-sm font-bold text-ink">{me.fullName}</span>
              <span className="block max-w-[380px] truncate text-xs text-muted">
                {roleLabel(rk)} · {workplace(me)}
              </span>
            </span>
          </Link>
          <Link href="/account/password" className="hidden text-sm font-semibold text-info hover:underline xl:inline">
            Change password
          </Link>
          <button onClick={() => void logout()} className="flex items-center gap-1 text-sm font-semibold text-info hover:underline">
            <Icon name="logout" size={16} />
            Log out
          </button>
        </div>
      </header>

      <aside className={`fixed bottom-0 left-0 top-16 z-20 overflow-y-auto bg-white px-2 py-5 transition-[width] ${asideWidth}`}>
        {menu.map(({ group, items }) => {
          const shown = items.filter(visible);
          if (!shown.length) return null;
          return (
            <div key={group}>
              <div className={`px-4 pb-3 text-[11px] font-bold uppercase tracking-[.04em] text-muted ${labelWhenExpanded}`}>{roleLabel(rk)} menu</div>
              {shown.map((i) => {
                const active = i.href === activeHref;
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    title={i.label}
                    aria-current={active ? "page" : undefined}
                    onClick={() => flipped && window.innerWidth < 1024 && setFlipped(false)}
                    className={`mb-1 flex h-11 items-center gap-2.5 rounded-lg text-sm ${linkPad} ${
                      active ? "bg-primary font-semibold text-white" : "text-muted hover:bg-field"
                    }`}
                  >
                    <span className="flex w-5 shrink-0 justify-center">
                      <Icon name={i.icon} />
                    </span>
                    <span className={`truncate ${whenExpanded}`}>{i.label}</span>
                    {i.badge && !!pendingRequests.data?.count && (
                      <span
                        aria-label={`${pendingRequests.data.count} waiting`}
                        className={`ml-auto min-w-[22px] rounded-full px-1.5 text-center text-xs font-bold ${active ? "bg-white text-primary" : "bg-danger text-white"} ${whenExpanded}`}
                      >
                        {pendingRequests.data.count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </aside>

      <main className={`ml-[72px] min-h-screen pt-16 transition-[margin] ${mainMargin}`}>
        <div className="px-4 pb-12 pt-6 sm:px-6">
          <QuotaBanner />
          {home && <Welcome me={me} />}
          {children}
        </div>
      </main>
    </div>
  );
}

/** On the home page: who is signed in, their role and what that role does. Can be hidden until the next sign-in. */
function Welcome({ me }: { me: Me }) {
  const key = `bmerc.welcome.${me.id}`;
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(key) === "hidden";
    } catch {
      return false;
    }
  });
  if (hidden) return null;
  const rk = roleKey(me);
  return (
    <div className="mb-5 flex items-center gap-4 rounded-xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,.05)]">
      <Avatar name={me.fullName} k={rk} size={48} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-lg text-navy">Hello, {me.fullName}</b>
          <RoleBadge k={rk} />
        </div>
        <div className="mt-0.5 text-[13px] text-muted">
          {me.email} · {workplace(me)}
        </div>
        <div className="mt-1 text-[13px] text-ink">{roleDoes(rk)}</div>
      </div>
      <button
        aria-label="Hide"
        title="Hide until next sign-in"
        className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-field"
        onClick={() => {
          try {
            sessionStorage.setItem(key, "hidden");
          } catch {
            /* private mode: hide for this page only */
          }
          setHidden(true);
        }}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

/** Prototype "Account suspended": the only page a suspended company sees, apart from its billing details. */
function Suspended({ name, isAdmin, logout }: { name: string; isAdmin: boolean; logout: () => Promise<void> }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-4">
      <div className="w-full max-w-[520px] rounded-xl bg-white p-8 shadow-[0_1px_2px_rgba(0,0,0,.05)]">
        <div className="mb-3 text-base font-bold text-navy">BMERC</div>
        <h1 className="mb-1.5 text-2xl font-semibold text-navy">Account suspended</h1>
        <p className="mb-5 text-muted">
          The subscription for {name} is not active. Pay the outstanding invoice to continue using the system. Your data is kept and nothing has been deleted.
        </p>
        {isAdmin ? (
          <ButtonLink href="/subscription" className="w-full">
            View payment details
          </ButtonLink>
        ) : (
          <p className="text-sm text-muted">Ask your company admin to settle the invoice.</p>
        )}
        <button onClick={() => void logout()} className="mt-4 block w-full text-center font-semibold text-info hover:underline">
          Back to log in
        </button>
      </div>
    </div>
  );
}

/**
 * Monthly credit quota (decided 2026-11-24): a warning from 80%, and at 100% new jobs are blocked
 * (the API refuses them) until next month or an upgrade. Shown to whoever receives devices.
 */
function QuotaBanner() {
  const { can } = useSession();
  const pathname = usePathname();
  const show = can("company_admin", "site_manager", "head_technician");
  // Keyed on the page so the numbers refresh after receiving a device (the API ignores the extra parameter).
  const usage = useApi<Usage>(show ? `/company/usage?on=${encodeURIComponent(pathname)}` : null);
  const j = usage.data?.creditsThisMonth;
  if (!j || j.limit === null || j.limit === 0 || j.used < j.limit * 0.8) return null;
  const full = j.used >= j.limit;
  const pct = Math.round((j.used * 100) / j.limit);
  return (
    <div role="status" className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium ${full ? "bg-[#fde8e8] text-danger" : "bg-[#fef3c7] text-warn"}`}>
      <span>
        {full
          ? `Your plan's ${j.limit} credits for this month are used up. New devices cannot be received until next month or until you upgrade. Jobs already open carry on as normal.`
          : `You have used ${j.used} of ${j.limit} credits this month (${pct}%). At ${j.limit}, new devices cannot be received.`}
      </span>
      {can("company_admin") && (
        <ButtonLink href="/subscription" variant="secondary" className="h-9 bg-white">
          Upgrade plan
        </ButtonLink>
      )}
    </div>
  );
}

/** Shown when a role opens a page that is not for them (the API refuses the data anyway). */
export function NoAccess() {
  return (
    <Card className="mx-auto mt-10 max-w-lg text-center">
      <h1 className="text-xl font-semibold text-navy">No access</h1>
      <p className="mt-2 text-muted">Your role cannot open this page. Ask your company admin if you need it.</p>
    </Card>
  );
}
