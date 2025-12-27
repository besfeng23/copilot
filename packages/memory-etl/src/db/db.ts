import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

export type SqliteDb = Database.Database;

export function openSqlite(dbPath: string): SqliteDb {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  // Some pragmas set in migration; repeat basics here for safety.
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  return db;
}

function readMigrationSql(): string {
  // IMPORTANT:
  // - This package can run from TS (`tsx`) OR from compiled JS (`dist/`).
  // - To avoid build-time asset copying, we always read migrations from `src/`.
  const here = path.dirname(fileURLToPath(import.meta.url)); // src/db or dist/db
  const packageRoot = path.resolve(here, "..", ".."); // src/.. or dist/..
  const sqlPath = path.join(packageRoot, "src", "db", "migrations", "001_init.sql");
  return fs.readFileSync(sqlPath, "utf8");
}

export function initSchema(db: SqliteDb) {
  // 001_init.sql is currently the canonical schema (safe to edit in early v1)
  const sql = readMigrationSql();
  db.exec(sql);
}



