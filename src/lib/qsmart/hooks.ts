"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import type { Branch, ServiceType, Teller } from "./types";

/** Tiny generic async-data hook (no external provider required). */
function useAsync<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    loader()
      .then((d) => {
        if (active) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, deps);

  return { data, error, loading };
}

export function useBranches(refreshKey?: number) {
  return useAsync<Branch[]>(() => api.listBranches(), [refreshKey]);
}

export function useServiceTypes(refreshKey?: number) {
  return useAsync<ServiceType[]>(() => api.listServiceTypes(), [refreshKey]);
}

export function useTellers(branchId?: string, refreshKey?: number) {
  return useAsync<Teller[]>(
    () => (branchId ? api.listTellersByBranch(branchId) : api.listTellers()),
    [branchId, refreshKey]
  );
}
