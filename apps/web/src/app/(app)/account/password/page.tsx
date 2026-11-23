import type { Metadata } from "next";
import { ChangePasswordPage } from "./change-password";

export const metadata: Metadata = { title: "Change password" };

// Content waits for the signed-in user (loaded in the browser), so it cannot be instant. See (app)/layout.tsx.
export const instant = false;

export default function Page() {
  return <ChangePasswordPage />;
}
