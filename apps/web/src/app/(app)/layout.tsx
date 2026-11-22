import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";

// The shell reads the URL (active menu item) and loads the session in the browser,
// so it renders behind Suspense and the static part of the page stays prerendered.
// Every page here depends on that user (role decides what it shows), so pages and this layout
// opt out of instant-navigation validation. New pages under (app) need `export const instant = false` too.
export const instant = false;

export default function SignedInLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<div className="p-10 text-center text-muted">Loading…</div>}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
