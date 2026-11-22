"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ROLE_LABEL, ROLES, type Role } from "@bmerc/shared";
import { SessionProvider, useSession } from "@/lib/session";
import { Icon, type IconName } from "./icons";
import { Card } from "./ui";

interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  roles: Role[] | "all";
}

const NAV: Array<{ group: string; items: NavItem[] }> = [
  { group: "Overview", items: [{ label: "Dashboard", href: "/dashboard", icon: "grid", roles: "all" }] },
  {
    group: "Work",
    items: [
      { label: "Jobs", href: "/jobs", icon: "wrench", roles: [...ROLES] },
      { label: "Customers", href: "/customers", icon: "mail", roles: ["company_admin", "site_manager", "head_technician"] },
      { label: "Parts", href: "/parts", icon: "box", roles: [...ROLES] },
    ],
  },
  {
    group: "Management",
    items: [
      { label: "Sites", href: "/sites", icon: "pin", roles: ["company_admin", "site_manager", "stock_keeper"] },
      { label: "Teams", href: "/teams", icon: "building", roles: ["company_admin", "site_manager", "head_technician"] },
      { label: "Users", href: "/users", icon: "users", roles: ["company_admin", "site_manager"] },
      { label: "Company settings", href: "/settings/company", icon: "settings", roles: ["company_admin"] },
    ],
  },
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

  const visible = (i: NavItem) => i.roles === "all" || (!!me.role && i.roles.includes(me.role));
  const who = me.isPlatformAdmin ? "Platform Owner" : me.role ? ROLE_LABEL[me.role] : "No role";

  // Classes for "shown when the menu is expanded" and the aside width, per screen size.
  const whenExpanded = flipped ? "inline lg:hidden" : "hidden lg:inline";
  const asideWidth = flipped ? "w-64 lg:w-[72px]" : "w-[72px] lg:w-64";
  const mainMargin = flipped ? "lg:ml-[72px]" : "lg:ml-64";

  return (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between bg-white px-4 shadow-[0_1px_0_#eef1f8] sm:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setFlipped((f) => !f)}
            aria-label="Show or hide menu"
            className="flex h-9 w-10 items-center justify-center rounded-lg bg-field text-navy"
          >
            <Icon name="menu" />
          </button>
          <span className="text-base font-bold text-navy">BMERC Admin</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm font-semibold text-muted sm:inline">
            {who}
            {me.company && <> · {me.company.name}</>}
          </span>
          <button onClick={() => void logout()} className="flex items-center gap-1 text-sm font-semibold text-info hover:underline">
            <Icon name="logout" size={16} />
            Log out
          </button>
        </div>
      </header>

      <aside className={`fixed bottom-0 left-0 top-16 z-20 overflow-y-auto bg-white px-2 py-5 shadow-[1px_0_0_#eef1f8] transition-[width] ${asideWidth}`}>
        {NAV.map(({ group, items }) => {
          const shown = items.filter(visible);
          if (!shown.length) return null;
          return (
            <div key={group} className="mb-4">
              <div className={`px-4 pb-2 text-[11px] font-bold uppercase tracking-wide text-muted ${whenExpanded}`}>{group}</div>
              {shown.map((i) => {
                const active = pathname === i.href || pathname.startsWith(`${i.href}/`);
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    title={i.label}
                    aria-current={active ? "page" : undefined}
                    onClick={() => flipped && window.innerWidth < 1024 && setFlipped(false)}
                    className={`mb-1 flex h-11 items-center gap-2.5 rounded-lg px-[15px] text-sm ${
                      active ? "bg-primary font-semibold text-white" : "text-muted hover:bg-field"
                    }`}
                  >
                    <Icon name={i.icon} className="shrink-0" />
                    <span className={`truncate ${whenExpanded}`}>{i.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </aside>

      <main className={`ml-[72px] pt-16 transition-[margin] ${mainMargin}`}>
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
          {me.company && me.company.status !== "active" ? <Suspended name={me.company.name} /> : children}
        </div>
      </main>
    </div>
  );
}

function Suspended({ name }: { name: string }) {
  return (
    <Card className="mx-auto mt-10 max-w-lg text-center">
      <h1 className="text-xl font-semibold text-navy">Account suspended</h1>
      <p className="mt-2 text-muted">
        The subscription for {name} is not active. Pay the outstanding invoice to continue. Your data is kept and nothing has been deleted.
      </p>
    </Card>
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
