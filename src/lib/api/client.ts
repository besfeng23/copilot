export type FetchJSONErrorShape = {
  message?: string;
  code?: string;
  error?: string;
};

export class FetchJSONError extends Error {
  status?: number;
  code?: string;

  constructor(message: string, opts?: { status?: number; code?: string }) {
    super(message);
    this.name = "FetchJSONError";
    this.status = opts?.status;
    this.code = opts?.code;
  }
}

async function safeReadText(res: Response) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function friendlyStatusMessage(status: number) {
  if (status === 401) return "Your session has expired. Please log in again.";
  if (status === 403) return "You don’t have permission to access this resource.";
  if (status === 404) return "We couldn’t find what you requested.";
  if (status >= 500) return "The server had an error. Please try again in a moment.";
  return "Request failed. Please try again.";
}

function looksLikeHTML(text: string) {
  const t = text.trim().toLowerCase();
  return t.startsWith("<!doctype html") || t.startsWith("<html") || t.includes("<body");
}

export async function fetchJSON<T>(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutMs = init?.timeoutMs ?? 30_000;
  const timeout =
    controller && typeof window !== "undefined"
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : null;

  try {
    const res = await fetch(input, {
      ...init,
      signal: controller?.signal ?? init?.signal,
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });

    const contentType = res.headers.get("content-type") || "";
    const isJSON = contentType.includes("application/json");

    if (!res.ok) {
      let code: string | undefined;
      let message = friendlyStatusMessage(res.status);

      if (isJSON) {
        try {
          const data = (await res.json()) as FetchJSONErrorShape;
          code = data.code;
          message =
            data.message ||
            data.error ||
            (res.status ? friendlyStatusMessage(res.status) : "Request failed.");
        } catch {
          // ignore parse error
        }
      } else {
        const text = await safeReadText(res);
        // Never dump raw HTML/text to the UI; keep message friendly.
        if (!looksLikeHTML(text) && text.trim().length > 0 && text.trim().length < 180) {
          message = text.trim();
        }
      }

      throw new FetchJSONError(message, { status: res.status, code });
    }

    if (res.status === 204) return undefined as T;
    if (!isJSON) {
      // Successful but non-JSON response; avoid returning HTML/text.
      throw new FetchJSONError("Unexpected server response.", { status: res.status });
    }
    return (await res.json()) as T;
  } finally {
    if (timeout && typeof window !== "undefined") window.clearTimeout(timeout);
  }
}

