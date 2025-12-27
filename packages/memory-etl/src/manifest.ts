import fs from "node:fs";
import path from "node:path";

import type { SqliteDb } from "./db/db.js";
import { shortHash } from "./util/hash.js";

export type Manifest = {
  packId: string;
  createdAt: string;
  source: "facebook";
  inputFingerprint: string;
  counts: {
    threads: number;
    messages: number;
    posts: number;
    comments: number;
    reactions: number;
    documents: number;
  };
  files: { store: "store.sqlite" };
};

export function computePackId(inputPath: string, nowMs = Date.now()) {
  const iso = new Date(nowMs).toISOString(); // 2025-12-27T...
  const stamp = iso.replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${stamp}-${shortHash(inputPath, 10)}`;
}

export function countTables(db: SqliteDb) {
  const q = (sql: string) => Number((db.prepare(sql).get() as any).c ?? 0);
  return {
    threads: q("SELECT COUNT(*) as c FROM threads"),
    messages: q("SELECT COUNT(*) as c FROM messages"),
    posts: q("SELECT COUNT(*) as c FROM posts"),
    comments: q("SELECT COUNT(*) as c FROM comments"),
    reactions: q("SELECT COUNT(*) as c FROM reactions"),
    documents: q("SELECT COUNT(*) as c FROM documents"),
  };
}

export function writeManifest(params: {
  packDir: string;
  inputDir: string;
  packId: string;
  inputFingerprint: string;
  db: SqliteDb;
}) {
  const counts = countTables(params.db);
  const manifest: Manifest = {
    packId: params.packId,
    createdAt: new Date().toISOString(),
    source: "facebook",
    inputFingerprint: params.inputFingerprint,
    counts,
    files: { store: "store.sqlite" },
  };
  fs.mkdirSync(params.packDir, { recursive: true });
  fs.writeFileSync(path.join(params.packDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}


