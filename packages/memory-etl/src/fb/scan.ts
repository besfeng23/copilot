import fs from "node:fs";
import path from "node:path";

import { isJsonFile, toPosixPath } from "./helpers.js";

export type ScanResults = {
  messageFiles: string[];
  postsFiles: string[];
  commentsFiles: string[];
  reactionsFiles: string[];
  htmlFiles: string[];
  totalFiles: number;
  totalBytes: number;
};

function walk(dir: string, out: string[]) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(p, out);
    } else if (e.isFile()) {
      out.push(p);
    }
  }
}

function fileSize(p: string): number {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

export function scanFacebookExport(rootDir: string): ScanResults {
  const all: string[] = [];
  walk(rootDir, all);

  const messageFiles: string[] = [];
  const postsFiles: string[] = [];
  const commentsFiles: string[] = [];
  const reactionsFiles: string[] = [];
  const htmlFiles: string[] = [];

  for (const f of all) {
    const rel = toPosixPath(path.relative(rootDir, f)).toLowerCase();
    if (rel.endsWith(".html")) {
      htmlFiles.push(f);
      continue;
    }
    if (!isJsonFile(f)) continue;

    // Messages: multiple layouts; best-effort.
    const isInboxMessage =
      rel.includes("messages/inbox/") && /\/message_\d+\.json$/.test(rel);
    const isArchivedMessage =
      rel.includes("messages/archived_threads/") && /\/message_\d+\.json$/.test(rel);
    if (isInboxMessage || isArchivedMessage) {
      messageFiles.push(f);
      continue;
    }

    // Generic discovery: recursively find json with tokens.
    // We keep "best effort" and allow overlap; caller can dedupe if needed.
    if (rel.includes("posts") || rel.includes("your_posts") || rel.includes("your_activity_across_facebook/posts")) {
      postsFiles.push(f);
      continue;
    }
    if (rel.includes("comments")) {
      commentsFiles.push(f);
      continue;
    }
    if (rel.includes("reactions")) {
      reactionsFiles.push(f);
      continue;
    }
  }

  const totalBytes = all.reduce((sum, p) => sum + fileSize(p), 0);
  return {
    messageFiles,
    postsFiles,
    commentsFiles,
    reactionsFiles,
    htmlFiles,
    totalFiles: all.length,
    totalBytes,
  };
}


