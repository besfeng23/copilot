import type { SqliteDb } from "../db/db.js";

export function wasFileIngested(db: SqliteDb, args: { path: string; sizeBytes: number; mtimeMs: number }): boolean {
  const row = db
    .prepare("SELECT path, size_bytes, mtime_ms FROM ingested_files WHERE path = ?")
    .get(args.path) as { path: string; size_bytes: number; mtime_ms: number } | undefined;
  if (!row) return false;
  return row.size_bytes === args.sizeBytes && row.mtime_ms === args.mtimeMs;
}

export function upsertIngestedFile(db: SqliteDb, args: { path: string; sizeBytes: number; mtimeMs: number; ingestedAtMs: number }) {
  db.prepare(
    "INSERT INTO ingested_files(path, size_bytes, mtime_ms, ingested_at_ms) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(path) DO UPDATE SET size_bytes=excluded.size_bytes, mtime_ms=excluded.mtime_ms, ingested_at_ms=excluded.ingested_at_ms"
  ).run(args.path, args.sizeBytes, args.mtimeMs, args.ingestedAtMs);
}


