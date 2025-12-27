import fs from "node:fs";
import path from "node:path";

export const STREAMING_JSON_THRESHOLD_BYTES = 200 * 1024 * 1024;

export function toPosixPath(p: string): string {
  return p.replace(/\\/g, "/");
}

export function statFile(p: string) {
  const st = fs.statSync(p);
  return { sizeBytes: st.size, mtimeMs: Math.floor(st.mtimeMs) };
}

export function isJsonFile(p: string) {
  return p.toLowerCase().endsWith(".json");
}

export function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

export function readJsonSmallFile<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export function firstMediaUri(msg: any): string | null {
  const candidates: Array<any[] | undefined> = [
    msg?.photos,
    msg?.videos,
    msg?.gifs,
    msg?.audio_files,
    msg?.files,
  ];
  for (const arr of candidates) {
    if (!Array.isArray(arr)) continue;
    const first = arr.find((x) => x && typeof x === "object" && typeof x.uri === "string");
    if (first?.uri) return String(first.uri);
  }
  return null;
}

export function safeString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

export function safeNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim().length) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function hashInputFingerprint(args: { inputPath: string; fileCount: number; totalBytes: number }, shortHash: (s: string) => string) {
  return shortHash(`${args.inputPath}|${args.fileCount}|${args.totalBytes}`);
}


