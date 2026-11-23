import type { Metadata } from "next";
import { PaymentsPage } from "./payments-page";

export const metadata: Metadata = { title: "Payments" };

// Content waits for the signed-in user (loaded in the browser), so it cannot be instant. See (app)/layout.tsx.
export const instant = false;

export default function Page() {
  return <PaymentsPage />;
}
