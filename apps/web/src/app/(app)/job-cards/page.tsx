import type { Metadata } from "next";
import { JobCardsPage } from "./job-cards-page";

export const metadata: Metadata = { title: "Technician job cards" };

// Content waits for the signed-in user (loaded in the browser), so it cannot be instant. See (app)/layout.tsx.
export const instant = false;

export default function Page() {
  return <JobCardsPage />;
}
