import { useEffect, useState } from "react";
import { getApi } from "../api/client";

interface ApiResourceState<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

export function useApiResource<T>(path: string, fallback: T): ApiResourceState<T> {
  const [state, setState] = useState<ApiResourceState<T>>({
    data: fallback,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    setState((current) => ({ ...current, loading: true, error: null }));
    getApi<T>(path, controller.signal)
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error: Error) => {
        if (controller.signal.aborted) return;
        setState({ data: fallback, loading: false, error });
      });

    return () => controller.abort();
  }, [fallback, path]);

  return state;
}
