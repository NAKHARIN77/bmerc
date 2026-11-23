import type { Metadata } from "next";
import { LimitsPage } from "./limits-page";

export const metadata: Metadata = { title: "Plan and limits" };

// Content waits for the signed-in user (loaded in the browser), so it cannot be instant. See (app)/layout.tsx.
export const instant = false;

export default function Page() {
  return <LimitsPage />;
}
