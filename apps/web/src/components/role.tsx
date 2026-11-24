"use client";

import { ROLE_LABEL, type Role } from "@bmerc/shared";
import type { Me } from "@/lib/types";

// Each role has its own colour, used on the header badge, the avatar and the welcome card,
// so people can tell at a glance whose screen they are looking at.
type RoleKey = Role | "platform_owner";
const STYLE: Record<RoleKey, { badge: string; avatar: string; bar: string }> = {
  platform_owner: { badge: "bg-[#1e293b] text-white", avatar: "bg-[#1e293b] text-white", bar: "bg-[#1e293b]" },
  company_admin: { badge: "bg-[#ede9fe] text-[#5b21b6]", avatar: "bg-[#7c3aed] text-white", bar: "bg-[#7c3aed]" },
  site_manager: { badge: "bg-[#dbeafe] text-[#1d4ed8]", avatar: "bg-[#2563eb] text-white", bar: "bg-[#2563eb]" },
  head_technician: { badge: "bg-[#ccfbf1] text-[#0f766e]", avatar: "bg-[#0d9488] text-white", bar: "bg-[#0d9488]" },
  technician: { badge: "bg-[#ffedd5] text-[#c2410c]", avatar: "bg-[#ea580c] text-white", bar: "bg-[#ea580c]" },
  stock_keeper: { badge: "bg-[#fce7f3] text-[#be185d]", avatar: "bg-[#db2777] text-white", bar: "bg-[#db2777]" },
};

/** What each role does, in one line (welcome card). */
const DOES: Record<RoleKey, string> = {
  platform_owner: "You run BMERC for every company: plans, quotas, payments and the miner model list. You do not see their repair work.",
  company_admin: "You run the whole company: every site, customers, staff, invoices, reports and the subscription.",
  site_manager: "You run your sites: receive devices, hand out jobs, return devices, invoices and reports.",
  head_technician: "You lead your team: receive devices, hand jobs to your technicians, repair and return devices.",
  technician: "Take jobs from To Do, repair them, record tests and the parts you used.",
  stock_keeper: "You keep the spare parts at your sites: stock in and out, transfers and the parts list.",
};

export const roleKey = (me: Pick<Me, "isPlatformAdmin" | "role">): RoleKey | null => (me.isPlatformAdmin ? "platform_owner" : me.role);
export const roleLabel = (k: RoleKey | null) => (k === "platform_owner" ? "Platform Owner" : k ? ROLE_LABEL[k] : "No role");
export const roleStyle = (k: RoleKey | null) => STYLE[k ?? "technician"];
export const roleDoes = (k: RoleKey | null) => (k ? DOES[k] : "");

export const initials = (name: string) =>
  name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/** Where this person works: team and site, or their sites, or the company. */
export function workplace(me: Me) {
  if (me.isPlatformAdmin) return "BMERC";
  const parts = [me.team ? `${me.team.name} · ${me.team.site}` : me.siteNames.length ? me.siteNames.join(", ") : me.role === "company_admin" ? "All sites" : null, me.company?.name];
  return parts.filter(Boolean).join(" · ");
}

export function RoleBadge({ k, className = "" }: { k: RoleKey | null; className?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${roleStyle(k).badge} ${className}`}>{roleLabel(k)}</span>;
}

export function Avatar({ name, k, size = 36 }: { name: string; k: RoleKey | null; size?: number }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${roleStyle(k).avatar}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  );
}
