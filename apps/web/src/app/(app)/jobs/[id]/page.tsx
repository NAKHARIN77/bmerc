import type { Metadata } from "next";
import { JobPage } from "./job-page";

export const metadata: Metadata = { title: "Job" };

// Content waits for the signed-in user (loaded in the browser), so it cannot be instant. See (app)/layout.tsx.
export const instant = false;

export default function Page() {
  return <JobPage />;
}
