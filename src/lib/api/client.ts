"use client";

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json?.message as string | undefined) ?? ;
    throw new Error(msg);
  }
  return json as T;
}
