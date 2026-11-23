import type { Metadata } from "next";
import { QuotasPage } from "./quotas-page";

export const metadata: Metadata = { title: "Quotas" };

// Content waits for the signed-in user (loaded in the browser), so it cannot be instant. See (app)/layout.tsx.
export const instant = false;

export default function Page() {
  return <QuotasPage />;
}
