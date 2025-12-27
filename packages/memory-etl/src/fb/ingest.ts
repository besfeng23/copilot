import fs from "node:fs";
import path from "node:path";

import { initSchema, openSqlite } from "../db/db.js";
import { computePackId, writeManifest } from "../manifest.js";
import { shortHash } from "../util/hash.js";
import { ensureDir, hashInputFingerprint } from "./helpers.js";
import { rebuildDocuments } from "./documents.js";
import { ingestGenericArrayFiles } from "./ingestGenericArrayJson.js";
import { ingestMessageFiles } from "./ingestMessages.js";
import { scanFacebookExport } from "./scan.js";

export async function ingestFacebookExport(params: {
  inputDir: string;
  outDir: string;
  force?: boolean;
  source?: string;
  log?: (msg: string) => void;
}) {
  const log = params.log ?? ((m: string) => console.log(m));
  const inputDir = path.resolve(params.inputDir);
  const outDir = path.resolve(params.outDir);
  const force = Boolean(params.force);

  ensureDir(outDir);
  const packId = computePackId(inputDir);

  const sqlitePath = path.join(outDir, "store.sqlite");
  const db = openSqlite(sqlitePath);
  initSchema(db);

  const scan = scanFacebookExport(inputDir);
  log(`scan: files=${scan.totalFiles} bytes=${scan.totalBytes}`);
  if (scan.htmlFiles.length && scan.messageFiles.length === 0) {
    log("warn: HTML export detected; HTML ingest not supported yet (continuing).");
  }

  const inputFingerprint = hashInputFingerprint(
    { inputPath: inputDir, fileCount: scan.totalFiles, totalBytes: scan.totalBytes },
    (s) => shortHash(s, 16)
  );

  // Ingest categories (best-effort; missing paths are fine)
  await ingestMessageFiles({ db, inputRoot: inputDir, messageFiles: scan.messageFiles, force, log });
  await ingestGenericArrayFiles({ db, inputRoot: inputDir, files: scan.postsFiles, category: "posts", force, log });
  await ingestGenericArrayFiles({ db, inputRoot: inputDir, files: scan.commentsFiles, category: "comments", force, log });
  await ingestGenericArrayFiles({ db, inputRoot: inputDir, files: scan.reactionsFiles, category: "reactions", force, log });

  rebuildDocuments(db, log);

  const manifest = writeManifest({ packDir: outDir, inputDir, packId, inputFingerprint, db });
  log(`wrote: ${path.join(outDir, "manifest.json")}`);
  log(`wrote: ${sqlitePath}`);
  log(`counts: ${JSON.stringify(manifest.counts)}`);

  return { packId, outDir };
}


