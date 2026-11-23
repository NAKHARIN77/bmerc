import type { Metadata } from "next";
import { AuditPage } from "./audit-page";

export const metadata: Metadata = { title: "Audit log" };

// Content waits for the signed-in user (loaded in the browser), so it cannot be instant. See (app)/layout.tsx.
export const instant = false;

export default function Page() {
  return <AuditPage />;
}
