import type { Metadata } from "next";
import { ReportDetail } from "./report-detail";

export const metadata: Metadata = { title: "Report" };

// Content waits for the signed-in user (loaded in the browser), so it cannot be instant. See (app)/layout.tsx.
export const instant = false;

export default function Page() {
  return <ReportDetail />;
}
