import type { Metadata } from "next";
import { LabelPage } from "./label-page";

export const metadata: Metadata = { title: "Print QR label" };

// Content waits for the signed-in user (loaded in the browser), so it cannot be instant. See (app)/layout.tsx.
export const instant = false;

export default function Page() {
  return <LabelPage />;
}
