export type APIErrorShape = {
  message?: string;
  code?: string;
};

export class APIError extends Error {
  status?: number;
  code?: string;

  constructor(message: string, opts?: { status?: number; code?: string }) {
    super(message);
    this.name = "APIError";
    this.status = opts?.status;
    this.code = opts?.code;
  }
}

function safeMessage(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  return "Something went wrong. Please try again.";
}

async function readJsonSafely(res: Response): Promise<unknown> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchJSON<T>(
  url: string,
  opts: {
    method?: string;
    body?: unknown;
    headers?: HeadersInit;
    idToken?: string;
    signal?: AbortSignal;
    cache?: RequestCache;
    next?: NextFetchRequestConfig;
  } = {}
): Promise<T> {
  const headers = new Headers(opts.headers);
  headers.set("accept", "application/json");

  if (opts.idToken) {
    headers.set("authorization", `Bearer ${opts.idToken}`);
  }

  const hasBody = typeof opts.body !== "undefined";
  if (hasBody) headers.set("content-type", "application/json");

  const res = await fetch(url, {
    method: opts.method ?? (hasBody ? "POST" : "GET"),
    headers,
    body: hasBody ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
    cache: opts.cache,
    next: opts.next,
  });

  const json = await readJsonSafely(res);

  if (!res.ok) {
    const maybe = (json ?? {}) as APIErrorShape;
    throw new APIError(safeMessage(maybe.message), {
      status: res.status,
      code: typeof maybe.code === "string" ? maybe.code : undefined,
    });
  }

  return json as T;
}

