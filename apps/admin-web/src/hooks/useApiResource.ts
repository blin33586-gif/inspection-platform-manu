import { useEffect, useState } from "react";
import { getApi } from "../api/client";
import { ApiClientError } from "../api/api-client-error";
import { clearSession } from "../auth/session";

export interface ApiResourceState<T> {
  data: T;
  loading: boolean;
  hasLoaded: boolean;
  error: Error | null;
  reload: () => void;
}

export function useApiResource<T>(path: string, fallback: T, scopeKey = ""): ApiResourceState<T> {
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<ApiResourceState<T>>({
    data: fallback,
    loading: true,
    hasLoaded: false,
    error: null,
    reload: () => setReloadKey((key) => key + 1),
  });

  useEffect(() => {
    const controller = new AbortController();

    setState((current) => ({ ...current, loading: true, error: null }));
    getApi<T>(path, controller.signal)
      .then((data) => setState((current) => ({ ...current, data, loading: false, hasLoaded: true, error: null })))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const requestError = error instanceof Error ? error : new Error("请求失败");
        if (requestError instanceof ApiClientError && requestError.status === 401) clearSession();
        setState((current) => ({ ...current, loading: false, hasLoaded: false, error: requestError }));
      });

    return () => controller.abort();
  }, [fallback, path, reloadKey, scopeKey]);

  return state;
}
