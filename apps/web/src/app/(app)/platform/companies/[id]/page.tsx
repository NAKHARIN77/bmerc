import type { Metadata } from "next";
import { CompanyPage } from "./company-page";

export const metadata: Metadata = { title: "Company" };

// Content waits for the signed-in user (loaded in the browser), so it cannot be instant. See (app)/layout.tsx.
export const instant = false;

export default function Page() {
  return <CompanyPage />;
}
