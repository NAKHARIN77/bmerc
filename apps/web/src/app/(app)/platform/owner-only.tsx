"use client";

import type { ReactNode } from "react";
import { useSession } from "@/lib/session";
import { NoAccess } from "@/components/app-shell";

/** Platform owner pages: anyone else gets the "not for your role" page (the API refuses the data anyway). */
export function OwnerOnly({ children }: { children: ReactNode }) {
  const { me } = useSession();
  return me.isPlatformAdmin ? <>{children}</> : <NoAccess />;
}
