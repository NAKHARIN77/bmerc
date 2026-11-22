import type { Metadata } from "next";
import { PartFormPage } from "../part-form";

export const metadata: Metadata = { title: "New part" };

// Content waits for the signed-in user (loaded in the browser), so it cannot be instant. See (app)/layout.tsx.
export const instant = false;

export default function Page() {
  return <PartFormPage mode="new" />;
}
