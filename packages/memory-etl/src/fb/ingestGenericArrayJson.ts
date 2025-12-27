import fs from "node:fs";
import path from "node:path";

import { chain } from "stream-chain";
import StreamJson from "stream-json";
import Pick from "stream-json/filters/Pick.js";
import StreamArray from "stream-json/streamers/StreamArray.js";

import type { SqliteDb } from "../db/db.js";
import { sha1Hex } from "../util/hash.js";
import { STREAMING_JSON_THRESHOLD_BYTES, readJsonSmallFile, safeNumber, safeString, statFile, toPosixPath } from "./helpers.js";
import { upsertIngestedFile, wasFileIngested } from "./ingestedFiles.js";

type Category = "posts" | "comments" | "reactions";

type CandidatePath = { label: string; path: string[] | null }; // null => root array

const CANDIDATES: CandidatePath[] = [
  { label: "root[]", path: null },
  { label: "posts.item[]", path: ["posts", "item"] },
  { label: "comments.item[]", path: ["comments", "item"] },
  { label: "reactions.item[]", path: ["reactions", "item"] },
  { label: "data.item[]", path: ["data", "item"] },
];

function detectArraySmall(json: any): any[] | null {
  if (Array.isArray(json)) return json;
  const tries = [
    json?.posts?.item,
    json?.comments?.item,
    json?.reactions?.item,
    json?.data?.item,
  ];
  for (const t of tries) {
    if (Array.isArray(t)) return t;
  }
  return null;
}

async function* streamItems(filePath: string, candidate: CandidatePath): AsyncGenerator<any> {
  const parts: any[] = [fs.createReadStream(filePath), (StreamJson as any).parser()];
  if (candidate.path) {
    parts.push((Pick as any).pick({ filter: candidate.path.join(".") }));
  }
  parts.push((StreamArray as any).streamArray());
  const pipeline = chain(parts);
  for await (const chunk of pipeline as any) {
    yield chunk?.value;
  }
}

function bestText(item: any): string | null {
  return (
    safeString(item?.text) ??
    safeString(item?.content) ??
    safeString(item?.title) ??
    safeString(item?.name) ??
    safeString(item?.data?.text) ??
    null
  );
}

function bestTimestampMs(item: any): number | null {
  const ts = safeNumber(item?.timestamp_ms) ?? safeNumber(item?.timestamp) ?? safeNumber(item?.creation_timestamp);
  if (ts === null) return null;
  // Some exports store seconds.
  if (ts < 10_000_000_000) return Math.floor(ts * 1000);
  return Math.floor(ts);
}

export async function ingestGenericArrayFiles(params: {
  db: SqliteDb;
  inputRoot: string;
  files: string[];
  category: Category;
  force: boolean;
  log: (msg: string) => void;
}) {
  const { db, inputRoot, files, category, force, log } = params;

  const upsertPost = db.prepare(
    "INSERT OR REPLACE INTO posts(id, timestamp_ms, title, content, attachments_json, place_json) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const upsertComment = db.prepare(
    "INSERT OR REPLACE INTO comments(id, timestamp_ms, author, content, parent_ref) VALUES (?, ?, ?, ?, ?)"
  );
  const upsertReaction = db.prepare(
    "INSERT OR REPLACE INTO reactions(id, timestamp_ms, actor, reaction, target_ref) VALUES (?, ?, ?, ?, ?)"
  );

  for (const absPath of files) {
    const relPath = toPosixPath(path.relative(inputRoot, absPath));
    const { sizeBytes, mtimeMs } = statFile(absPath);
    if (!force && wasFileIngested(db, { path: relPath, sizeBytes, mtimeMs })) {
      log(`skip (unchanged): ${relPath}`);
      continue;
    }

    log(`ingest ${category}: ${relPath}`);
    const ingestedAtMs = Date.now();

    if (sizeBytes <= STREAMING_JSON_THRESHOLD_BYTES) {
      db.transaction(() => {
        const json = readJsonSmallFile<any>(absPath);
        const arr = detectArraySmall(json);
        if (!arr) {
          log(`warn: no array detected in ${relPath}`);
        } else {
          for (let i = 0; i < arr.length; i++) {
            const item = arr[i];
            ingestOne({ db, category, relPath, index: i, item, upsertPost, upsertComment, upsertReaction });
          }
        }
        upsertIngestedFile(db, { path: relPath, sizeBytes, mtimeMs, ingestedAtMs });
      })();
      continue;
    }

    // Streaming: explicit transaction (async).
    db.exec("BEGIN");
    try {
      // Probe candidates; stop at the first that yields at least one object.
      let chosen: CandidatePath | null = null;
      for (const c of CANDIDATES) {
        let seen = 0;
        for await (const item of streamItems(absPath, c)) {
          if (item && typeof item === "object") {
            chosen = c;
            break;
          }
          if (++seen > 1000) break;
        }
        if (chosen) break;
      }

      if (!chosen) {
        log(`warn: no array stream detected in ${relPath}`);
      } else {
        let i = 0;
        for await (const item of streamItems(absPath, chosen)) {
          if (!item || typeof item !== "object") continue;
          ingestOne({ db, category, relPath, index: i++, item, upsertPost, upsertComment, upsertReaction });
        }
      }

      upsertIngestedFile(db, { path: relPath, sizeBytes, mtimeMs, ingestedAtMs });
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}

function ingestOne(args: {
  db: SqliteDb;
  category: Category;
  relPath: string;
  index: number;
  item: any;
  upsertPost: any;
  upsertComment: any;
  upsertReaction: any;
}) {
  const { category, relPath, index, item, upsertPost, upsertComment, upsertReaction } = args;

  const ts = bestTimestampMs(item);

  if (category === "posts") {
    const title = safeString(item?.title) ?? safeString(item?.name) ?? null;
    const content = bestText(item);
    const attachmentsJson = item?.attachments ? JSON.stringify(item.attachments) : null;
    const placeJson = item?.place ? JSON.stringify(item.place) : null;
    const id = sha1Hex(`posts|${relPath}|${index}|${ts ?? ""}|${title ?? ""}|${content ?? ""}`);
    upsertPost.run(id, ts, title, content, attachmentsJson, placeJson);
    return;
  }

  if (category === "comments") {
    const author = safeString(item?.author) ?? safeString(item?.name) ?? null;
    const content = bestText(item);
    const parentRef = safeString(item?.parent_ref) ?? safeString(item?.target) ?? safeString(item?.post) ?? safeString(item?.uri) ?? null;
    const id = sha1Hex(`comments|${relPath}|${index}|${ts ?? ""}|${author ?? ""}|${content ?? ""}`);
    upsertComment.run(id, ts, author, content, parentRef);
    return;
  }

  if (category === "reactions") {
    const actor = safeString(item?.actor) ?? safeString(item?.name) ?? null;
    const reaction = safeString(item?.reaction) ?? safeString(item?.title) ?? null;
    const targetRef = safeString(item?.target_ref) ?? safeString(item?.target) ?? safeString(item?.uri) ?? null;
    const id = sha1Hex(`reactions|${relPath}|${index}|${ts ?? ""}|${actor ?? ""}|${reaction ?? ""}|${targetRef ?? ""}`);
    upsertReaction.run(id, ts, actor, reaction, targetRef);
  }
}


