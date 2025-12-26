"use client";

import { ApiError, isApiErrorResponse } from "@/lib/api/errors";

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (isApiErrorResponse(json)) {
      throw new ApiError({ status: res.status, code: json.code, message: json.message, payload: json });
    }
    const message = (json?.message as string | undefined) ?? `Request failed (${res.status})`;
    const code = (json?.code as string | undefined) ?? "HTTP_ERROR";
    throw new ApiError({ status: res.status, code, message, payload: json });
  }
  return json as T;
}
