import type { Metadata } from "next";
import { CompanySettings } from "./company-settings";

export const metadata: Metadata = { title: "Company settings" };

// Content waits for the signed-in user (loaded in the browser), so it cannot be instant. See (app)/layout.tsx.
export const instant = false;

export default function Page() {
  return <CompanySettings />;
}
