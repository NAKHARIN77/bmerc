import Link from "next/link";
import type { ReactNode } from "react";

// Public legal pages: a plain reading layout with a way back to the site.
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-page">
      <header className="flex h-16 items-center justify-between bg-white px-4 sm:px-10">
        <Link href="/" className="text-base font-bold text-navy">
          BMERC
        </Link>
        <nav className="flex gap-5 text-sm font-semibold text-info">
          <Link href="/privacy" className="hover:underline">
            Privacy
          </Link>
          <Link href="/terms" className="hover:underline">
            Terms
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-[760px] px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}
