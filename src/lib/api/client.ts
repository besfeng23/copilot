"use client";

import { getFirebaseAuth } from "@/lib/firebase";

type ApiErrorBody = {
  ok?: false;
  code?: string;
  message?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeErrorMessageFromResponseBody(body: unknown): string | null {
  if (!isPlainObject(body)) return null;
  const msg = body.message;
  if (typeof msg === "string" && msg.trim().length > 0) return msg.trim();
  return null;
}

async function readSafeErrorMessage(res: Response): Promise<string> {
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();

  // Prefer JSON error bodies.
  if (contentType.includes("application/json")) {
    try {
      const json = (await res.json()) as ApiErrorBody;
      return (
        safeErrorMessageFromResponseBody(json) ??
        `Request failed (${res.status} ${res.statusText}).`
      );
    } catch {
      return `Request failed (${res.status} ${res.statusText}).`;
    }
  }

  // Never surface raw HTML to the UI.
  if (contentType.includes("text/html")) {
    return `Request failed (${res.status} ${res.statusText}).`;
  }

  // Fall back to short plain text, if any.
  try {
    const text = (await res.text()).trim();
    if (text.length === 0) return `Request failed (${res.status} ${res.statusText}).`;
    return text.length > 300 ? `${text.slice(0, 300)}…` : text;
  } catch {
    return `Request failed (${res.status} ${res.statusText}).`;
  }
}

export async function fetchJSON<T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean }
): Promise<T> {
  const url = path.startsWith("/") ? path : `/${path}`;

  const headers = new Headers(init?.headers ?? {});
  headers.set("accept", "application/json");

  if (!init?.skipAuth) {
    const auth = getFirebaseAuth();
    const user = auth.currentUser;
    if (!user) {
      throw new Error("You must be signed in to perform this action.");
    }
    const idToken = await user.getIdToken();
    headers.set("authorization", `Bearer ${idToken}`);
  }

  // If caller passes an object body, they should stringify; we help by setting content-type when needed.
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch {
    throw new Error("Network error. Please check your connection and try again.");
  }

  if (!res.ok) {
    throw new Error(await readSafeErrorMessage(res));
  }

  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes("application/json")) {
    return (await res.json()) as T;
  }

  // Some endpoints may return empty responses.
  if (res.status === 204) return undefined as T;

  // For non-JSON success, return text.
  return (await res.text()) as T;
}

