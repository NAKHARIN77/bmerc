"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";

interface Result<T> {
  key: string;
  data?: T;
  error?: ApiError | Error;
}

/**
 * GET a path and keep the result. Pass null to skip. `reload()` fetches again.
 * While reloading, the previous data stays on screen.
 */
export function useApi<T>(path: string | null) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<Result<T> | null>(null);
  const key = path === null ? null : `${path}#${version}`;

  useEffect(() => {
    if (path === null || key === null) return;
    let live = true;
    api<T>(path)
      .then((data) => live && setResult({ key, data }))
      .catch((error: Error) => live && setResult((prev) => ({ key, data: prev?.data, error })));
    return () => {
      live = false;
    };
  }, [path, key]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return {
    data: result?.data,
    error: result?.key === key ? (result?.error ?? null) : null,
    loading: key !== null && result?.key !== key,
    reload,
  };
}
