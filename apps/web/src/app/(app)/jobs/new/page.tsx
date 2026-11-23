import type { Metadata } from "next";
import { ReceivePage } from "./receive-page";

export const metadata: Metadata = { title: "Receive device" };

// Content waits for the signed-in user (loaded in the browser), so it cannot be instant. See (app)/layout.tsx.
export const instant = false;

export default function Page() {
  return <ReceivePage />;
}
