import type { Metadata } from "next";
import { RevenuePage } from "./revenue-page";

export const metadata: Metadata = { title: "Monthly revenue" };

// Content waits for the signed-in user (loaded in the browser), so it cannot be instant. See (app)/layout.tsx.
export const instant = false;

export default function Page() {
  return <RevenuePage />;
}
