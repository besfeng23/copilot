export type ApiErrorResponse = {
  ok: false;
  code: string;
  message: string;
};

export function isApiErrorResponse(v: unknown): v is ApiErrorResponse {
  if (!v || typeof v !== "object") return false;
  const r = v as any;
  return r.ok === false && typeof r.code === "string" && typeof r.message === "string";
}

export class ApiError extends Error {
  status: number;
  code: string;
  payload?: unknown;

  constructor(params: { status: number; code: string; message: string; payload?: unknown }) {
    super(params.message);
    this.name = "ApiError";
    this.status = params.status;
    this.code = params.code;
    this.payload = params.payload;
  }
}

