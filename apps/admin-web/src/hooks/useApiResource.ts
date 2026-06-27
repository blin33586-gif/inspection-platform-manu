import { useEffect, useState } from "react";
import { getApi } from "../api/client";

interface ApiResourceState<T> {
  data: T;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

export function useApiResource<T>(path: string, fallback: T): ApiResourceState<T> {
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<ApiResourceState<T>>({
    data: fallback,
    loading: true,
    error: null,
    reload: () => setReloadKey((key) => key + 1),
  });

  useEffect(() => {
    const controller = new AbortController();

    setState((current) => ({ ...current, loading: true, error: null }));
    getApi<T>(path, controller.signal)
      .then((data) => setState((current) => ({ ...current, data, loading: false, error: null })))
      .catch((error: Error) => {
        if (controller.signal.aborted) return;
        setState((current) => ({ ...current, data: fallback, loading: false, error }));
      });

    return () => controller.abort();
  }, [fallback, path, reloadKey]);

  return state;
}
