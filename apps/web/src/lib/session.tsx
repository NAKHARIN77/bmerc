"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Role } from "@bmerc/shared";
import { api } from "./api";
import type { Me } from "./types";

interface Session {
  me: Me;
  reload: () => Promise<void>;
  logout: () => Promise<void>;
  /** True when the user has one of these company roles. */
  can: (...roles: Role[]) => boolean;
}

const SessionContext = createContext<Session | null>(null);

/** Loads /me once for the signed-in area. Children render only after it arrives. */
export function SessionProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let live = true;
    api<Me>("/me")
      .then((m) => live && setMe(m))
      .catch(() => undefined); // a 401 already sent the browser to /login
    return () => {
      live = false;
    };
  }, []);

  const reload = useCallback(async () => setMe(await api<Me>("/me")), []);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    // Full page load on purpose: drops every bit of the signed-in user's data held in memory.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }, []);

  if (!me) return <>{fallback}</>;
  const can = (...roles: Role[]) => !!me.role && roles.includes(me.role);
  return <SessionContext value={{ me, reload, logout, can }}>{children}</SessionContext>;
}

export function useSession() {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession must be used inside SessionProvider");
  return s;
}
