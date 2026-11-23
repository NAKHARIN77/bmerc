import type { Metadata } from "next";
import { SetupPage } from "./setup-page";

export const metadata: Metadata = { title: "Set up your company" };

// Content waits for the signed-in user (loaded in the browser), so it cannot be instant. See (app)/layout.tsx.
export const instant = false;

export default function Page() {
  return <SetupPage />;
}
