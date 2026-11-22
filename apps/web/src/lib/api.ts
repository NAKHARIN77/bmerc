"use client";

/** Error shape from the API: { code, message, details } (design doc section 8). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }

  /** Zod issues from VALIDATION_FAILED, keyed by the first path segment. */
  fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    const out: Record<string, string> = {};
    for (const d of this.details as Array<{ path?: unknown[]; message?: string }>) {
      const key = String(d.path?.[0] ?? "");
      if (key && d.message && !out[key]) out[key] = d.message;
    }
    return out;
  }
}

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time, however many requests hit 401 together. */
function refreshSession() {
  refreshing ??= fetch("/api/v1/auth/refresh", { method: "POST", credentials: "same-origin" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function sessionExpired() {
  await fetch("/api/v1/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
  const next = window.location.pathname + window.location.search;
  // Full page load on purpose: clears the expired user's data from memory.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

interface Options {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
}

/** Calls the API through this origin. Refreshes the access token once on 401. */
export async function api<T>(path: string, opts: Options = {}, retried = false): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method: opts.method ?? "GET",
    headers: opts.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    credentials: "same-origin",
    cache: "no-store",
  });

  if (res.status === 401 && !retried && !path.startsWith("/auth/")) {
    if (await refreshSession()) return api<T>(path, opts, true);
    await sessionExpired();
    throw new ApiError(401, "UNAUTHORIZED", "Please log in again");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string; details?: unknown };
    throw new ApiError(res.status, body.code ?? "ERROR", body.message ?? res.statusText, body.details);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const errorMessage = (e: unknown) =>
  e instanceof ApiError ? e.message : "Something went wrong. Check your connection and try again.";
