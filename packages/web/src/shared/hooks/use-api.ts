/**
 * [INPUT]: react useState/useEffect, shared/lib/fetcher
 * [OUTPUT]: useApi<T>(path) → { data, error, loading, refresh }
 * [POS]: shared/hooks — 轻量 fetch 状态机，避免引入 react-query
 * [RUNTIME]: client
 * [PROTOCOL]: 数据量增大或需缓存时再切 react-query / swr，本 hook 不引入 cache
 */
import { useCallback, useEffect, useState } from "react";
import { apiGet, ApiError } from "@/shared/lib/fetcher";

interface State<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
}

export function useApi<T>(path: string) {
  const [state, setState] = useState<State<T>>({
    data: null,
    error: null,
    loading: true,
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await apiGet<T>(path);
      setState({ data, error: null, loading: false });
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, "UNKNOWN", String(err));
      setState({ data: null, error: e, loading: false });
    }
  }, [path]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await apiGet<T>(path);
        if (alive) setState({ data, error: null, loading: false });
      } catch (err) {
        if (alive) {
          const e = err instanceof ApiError ? err : new ApiError(0, "UNKNOWN", String(err));
          setState({ data: null, error: e, loading: false });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [path]);

  return { ...state, refresh };
}
