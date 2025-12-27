import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ingestFacebookExport } from "../fb/ingest.js";
import { openSqlite } from "../db/db.js";
import { verifyPack } from "../verify.js";

function tmpDir(name: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), name));
  return dir;
}

describe("memory-etl ingest + verify", () => {
  it("ingest creates store.sqlite + manifest.json and documents are searchable via FTS", async () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const fixtureRoot = path.resolve(here, "../../fixtures/fb-mini");
    expect(fs.existsSync(fixtureRoot)).toBe(true);

    const outDir = tmpDir("memory-pack-");

    await ingestFacebookExport({
      inputDir: fixtureRoot,
      outDir,
      force: true,
      log: () => undefined,
    });

    expect(fs.existsSync(path.join(outDir, "store.sqlite"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "manifest.json"))).toBe(true);

    const db = openSqlite(path.join(outDir, "store.sqlite"));
    const msgCount = Number((db.prepare("SELECT COUNT(*) as c FROM messages").get() as any).c);
    expect(msgCount).toBeGreaterThan(0);

    const docCount = Number((db.prepare("SELECT COUNT(*) as c FROM documents").get() as any).c);
    expect(docCount).toBeGreaterThan(0);

    const fts = db
      .prepare("SELECT doc_id FROM documents_fts WHERE documents_fts MATCH ? LIMIT 1")
      .get("UNICORN") as any;
    expect(fts?.doc_id).toBeTruthy();

    const verified = await verifyPack({ packDir: outDir, token: "UNICORN" });
    expect(verified.ok).toBe(true);
    expect(verified.ftsSampleDocId).toBeTruthy();
  });
});


