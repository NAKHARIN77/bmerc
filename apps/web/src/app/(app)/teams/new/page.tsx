import type { Metadata } from "next";
import { TeamFormPage } from "../team-form";

export const metadata: Metadata = { title: "New team" };

// Content waits for the signed-in user (loaded in the browser), so it cannot be instant. See (app)/layout.tsx.
export const instant = false;

export default function Page() {
  return <TeamFormPage mode="new" />;
}
