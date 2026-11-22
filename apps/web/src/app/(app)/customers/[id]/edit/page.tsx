import type { Metadata } from "next";
import { CustomerFormPage } from "../../customer-form";

export const metadata: Metadata = { title: "Edit customer" };

// Content waits for the signed-in user (loaded in the browser), so it cannot be instant. See (app)/layout.tsx.
export const instant = false;

export default function Page() {
  return <CustomerFormPage mode="edit" />;
}
