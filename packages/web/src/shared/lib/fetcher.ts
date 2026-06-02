/**
 * [INPUT]: 浏览器 fetch
 * [OUTPUT]: apiGet<T>(path, init?) — 统一处理 /api/* JSON + 错误抛出
 * [POS]: shared/lib，所有 module/<x>/data.ts 经此走 /api/*
 * [RUNTIME]: client
 * [PROTOCOL]: 改超时 / header / 重试逻辑时更新本文件头部
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { Accept: "application/json" },
    ...init,
  });
  if (!res.ok) {
    let body: { error?: string; code?: string } = {};
    try {
      body = await res.json();
    } catch {
      // ignore parse error
    }
    throw new ApiError(
      res.status,
      body.code ?? `HTTP_${res.status}`,
      body.error ?? res.statusText,
    );
  }
  return (await res.json()) as T;
}
