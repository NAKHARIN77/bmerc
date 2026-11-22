import type { Metadata } from "next";
import { SiteFormPage } from "../../site-form";

export const metadata: Metadata = { title: "Edit site" };

// Content waits for the signed-in user (loaded in the browser), so it cannot be instant. See (app)/layout.tsx.
export const instant = false;

export default function Page() {
  return <SiteFormPage mode="edit" />;
}
