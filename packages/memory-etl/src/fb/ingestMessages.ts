import path from "node:path";
import fs from "node:fs";

import { chain } from "stream-chain";
import StreamJson from "stream-json";
import Pick from "stream-json/filters/Pick.js";
import StreamArray from "stream-json/streamers/StreamArray.js";
import StreamValues from "stream-json/streamers/StreamValues.js";

import type { SqliteDb } from "../db/db.js";
import { sha1Hex } from "../util/hash.js";
import { STREAMING_JSON_THRESHOLD_BYTES, firstMediaUri, readJsonSmallFile, safeString, statFile, toPosixPath } from "./helpers.js";
import { upsertIngestedFile, wasFileIngested } from "./ingestedFiles.js";

type MessageFile = {
  title?: string;
  participants?: unknown[];
  messages?: unknown[];
};

function computeThreadId(inputRoot: string, messageFilePath: string): string {
  // thread_id = relative folder path from export root (stable, forward slashes)
  const dir = path.dirname(messageFilePath);
  return toPosixPath(path.relative(inputRoot, dir));
}

export async function ingestMessageFiles(params: {
  db: SqliteDb;
  inputRoot: string;
  messageFiles: string[];
  force: boolean;
  log: (msg: string) => void;
}) {
  const { db, inputRoot, messageFiles, force, log } = params;

  const upsertThread = db.prepare(
    "INSERT INTO threads(thread_id, title, participants_json, source_path) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(thread_id) DO UPDATE SET title=excluded.title, participants_json=excluded.participants_json, source_path=excluded.source_path"
  );

  const upsertMsg = db.prepare(
    "INSERT OR REPLACE INTO messages(id, thread_id, timestamp_ms, sender_name, content, msg_type, is_unsent, media_uri, reactions_json) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );

  for (const filePath of messageFiles) {
    const relPath = toPosixPath(path.relative(inputRoot, filePath));
    const { sizeBytes, mtimeMs } = statFile(filePath);
    if (!force && wasFileIngested(db, { path: relPath, sizeBytes, mtimeMs })) {
      log(`skip (unchanged): ${relPath}`);
      continue;
    }

    log(`ingest messages: ${relPath}`);
    const threadId = computeThreadId(inputRoot, filePath);
    const ingestedAtMs = Date.now();

    if (sizeBytes <= STREAMING_JSON_THRESHOLD_BYTES) {
      db.transaction(() => {
        const data = readJsonSmallFile<MessageFile>(filePath);
        const title = safeString((data as any)?.title);
        const participants = Array.isArray((data as any)?.participants) ? (data as any).participants : [];
        upsertThread.run(threadId, title, JSON.stringify(participants ?? []), relPath);
        const msgs = Array.isArray((data as any)?.messages) ? ((data as any).messages as any[]) : [];
        for (let i = 0; i < msgs.length; i++) {
          const m = msgs[i] ?? {};
          const timestampMs = Number(m.timestamp_ms ?? 0);
          const senderName = safeString(m.sender_name);
          const content = safeString(m.content);
          const msgType = safeString(m.type);
          const isUnsent = m.is_unsent === true ? 1 : 0;
          const mediaUri = firstMediaUri(m);
          const reactionsJson = Array.isArray(m.reactions) ? JSON.stringify(m.reactions) : null;
          const id = sha1Hex(`${threadId}|${relPath}|${i}|${timestampMs}|${senderName ?? ""}|${content ?? ""}`);
          upsertMsg.run(id, threadId, timestampMs, senderName, content, msgType, isUnsent, mediaUri, reactionsJson);
        }
        upsertIngestedFile(db, { path: relPath, sizeBytes, mtimeMs, ingestedAtMs });
      })();
      continue;
    }

    // Streaming path (async): explicit transaction.
    db.exec("BEGIN");
    try {
      // Title
      let title: string | null = null;
      {
        const pipeline = chain([
          fs.createReadStream(filePath),
          (StreamJson as any).parser(),
          (Pick as any).pick({ filter: "title" }),
          (StreamValues as any).streamValues(),
        ]);
        for await (const v of pipeline as any) {
          title = safeString(v?.value);
          break;
        }
      }

      // Participants
      let participants: unknown[] = [];
      {
        const pipeline = chain([
          fs.createReadStream(filePath),
          (StreamJson as any).parser(),
          (Pick as any).pick({ filter: "participants" }),
          (StreamValues as any).streamValues(),
        ]);
        for await (const v of pipeline as any) {
          if (Array.isArray(v?.value)) participants = v.value;
          break;
        }
      }

      upsertThread.run(threadId, title, JSON.stringify(participants ?? []), relPath);

      // Messages array
      {
        const pipeline = chain([
          fs.createReadStream(filePath),
          (StreamJson as any).parser(),
          (Pick as any).pick({ filter: "messages" }),
          (StreamArray as any).streamArray(),
        ]);
        let i = 0;
        for await (const v of pipeline as any) {
          const m = v?.value;
          if (!m || typeof m !== "object") continue;
          const timestampMs = Number((m as any).timestamp_ms ?? 0);
          const senderName = safeString((m as any).sender_name);
          const content = safeString((m as any).content);
          const msgType = safeString((m as any).type);
          const isUnsent = (m as any).is_unsent === true ? 1 : 0;
          const mediaUri = firstMediaUri(m);
          const reactionsJson = Array.isArray((m as any).reactions) ? JSON.stringify((m as any).reactions) : null;
          const id = sha1Hex(`${threadId}|${relPath}|${i}|${timestampMs}|${senderName ?? ""}|${content ?? ""}`);
          upsertMsg.run(id, threadId, timestampMs, senderName, content, msgType, isUnsent, mediaUri, reactionsJson);
          i++;
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


