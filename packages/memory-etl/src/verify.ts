import fs from "node:fs";
import path from "node:path";

import { openSqlite } from "./db/db.js";
import type { Manifest } from "./manifest.js";

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function tableExists(db: any, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ?")
    .get(name) as { name: string } | undefined;
  return Boolean(row?.name);
}

export async function verifyPack(params: { packDir: string; token?: string }) {
  const manifestPath = path.join(params.packDir, "manifest.json");
  const sqlitePath = path.join(params.packDir, "store.sqlite");

  assert(fs.existsSync(manifestPath), `Missing manifest.json at ${manifestPath}`);
  assert(fs.existsSync(sqlitePath), `Missing store.sqlite at ${sqlitePath}`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
  assert(manifest?.packId, "manifest.packId missing");

  const db = openSqlite(sqlitePath);

  const requiredTables = [
    "threads",
    "messages",
    "posts",
    "comments",
    "reactions",
    "documents",
    "documents_fts",
    "ingested_files",
  ];
  for (const t of requiredTables) {
    assert(tableExists(db, t), `Missing required table: ${t}`);
  }

  const qCount = (sql: string) => Number((db.prepare(sql).get() as any).c ?? 0);
  const counts = {
    threads: qCount("SELECT COUNT(*) as c FROM threads"),
    messages: qCount("SELECT COUNT(*) as c FROM messages"),
    posts: qCount("SELECT COUNT(*) as c FROM posts"),
    comments: qCount("SELECT COUNT(*) as c FROM comments"),
    reactions: qCount("SELECT COUNT(*) as c FROM reactions"),
    documents: qCount("SELECT COUNT(*) as c FROM documents"),
  };

  const mismatches: string[] = [];
  for (const k of Object.keys(counts) as Array<keyof typeof counts>) {
    const expected = (manifest.counts as any)?.[k];
    if (typeof expected === "number" && expected !== counts[k]) {
      mismatches.push(`${k}: expected ${expected} got ${counts[k]}`);
    }
  }
  assert(mismatches.length === 0, `Manifest count mismatch:\n${mismatches.join("\n")}`);

  const token = params.token ?? "test";
  // Ensure FTS query executes; if token exists, it should return at least one row.
  const row = db
    .prepare("SELECT doc_id FROM documents_fts WHERE documents_fts MATCH ? LIMIT 1")
    .get(token) as { doc_id: string } | undefined;
  // Not strict by default; just ensure query runs without throwing.

  return {
    ok: true as const,
    packId: manifest.packId,
    counts,
    ftsSampleDocId: row?.doc_id ?? null,
  };
}


