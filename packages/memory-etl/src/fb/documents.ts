import type { SqliteDb } from "../db/db.js";
import { safeString } from "./helpers.js";

type ThreadRow = { thread_id: string; title: string | null; participants_json: string; source_path: string | null };
type MessageRow = { sender_name: string | null; content: string | null; timestamp_ms: number; media_uri: string | null };

function chunkLines(lines: string[], opts: { minChars: number; maxChars: number }): string[] {
  const out: string[] = [];
  let buf: string[] = [];
  let len = 0;

  function flush() {
    if (!buf.length) return;
    out.push(buf.join("\n"));
    buf = [];
    len = 0;
  }

  for (const line of lines) {
    const addLen = line.length + (buf.length ? 1 : 0);
    if (len + addLen > opts.maxChars && len >= opts.minChars) {
      flush();
    }
    buf.push(line);
    len += addLen;
  }
  flush();
  return out;
}

export function rebuildDocuments(db: SqliteDb, log: (msg: string) => void) {
  log("rebuild documents + FTS");

  // Clear docs (FTS triggers handle deletes)
  db.exec("DELETE FROM documents;");

  const insertDoc = db.prepare(
    "INSERT OR REPLACE INTO documents(doc_id, source, source_id, timestamp_ms, text, metadata_json) VALUES (?, ?, ?, ?, ?, ?)"
  );

  // Messages -> documents
  const threads = db.prepare("SELECT thread_id, title, participants_json, source_path FROM threads").all() as ThreadRow[];
  const getMsgs = db.prepare(
    "SELECT sender_name, content, timestamp_ms, media_uri FROM messages WHERE thread_id = ? ORDER BY timestamp_ms ASC"
  );

  for (const t of threads) {
    const msgs = getMsgs.all(t.thread_id) as MessageRow[];
    if (!msgs.length) continue;
    const lines: string[] = [];
    let startTs: number | null = null;
    let endTs: number | null = null;
    for (const m of msgs) {
      const content = safeString(m.content);
      const sender = safeString(m.sender_name) ?? "Unknown";
      if (content) {
        lines.push(`${sender}: ${content}`);
        if (startTs === null) startTs = m.timestamp_ms;
        endTs = m.timestamp_ms;
      } else if (m.media_uri) {
        lines.push(`${sender}: [media] ${m.media_uri}`);
        if (startTs === null) startTs = m.timestamp_ms;
        endTs = m.timestamp_ms;
      }
    }
    const chunks = chunkLines(lines, { minChars: 1000, maxChars: 1500 });
    for (let i = 0; i < chunks.length; i++) {
      const docId = `messages:${t.thread_id}:${i}`;
      const meta = {
        thread_id: t.thread_id,
        title: t.title,
        participants: JSON.parse(t.participants_json || "[]"),
        chunk_index: i,
        start_ts: startTs,
        end_ts: endTs,
        source_file: t.source_path,
      };
      insertDoc.run(docId, "messages", t.thread_id, startTs, chunks[i], JSON.stringify(meta));
    }
  }

  // Posts -> documents
  const posts = db
    .prepare("SELECT id, timestamp_ms, title, content, attachments_json, place_json FROM posts")
    .all() as Array<{ id: string; timestamp_ms: number | null; title: string | null; content: string | null; attachments_json: string | null; place_json: string | null }>;
  for (const p of posts) {
    const text = safeString(p.content) ?? safeString(p.title);
    if (!text) continue;
    const chunks = chunkLines([text], { minChars: 0, maxChars: 1500 });
    for (let i = 0; i < chunks.length; i++) {
      const docId = `posts:${p.id}:${i}`;
      const meta = {
        post_id: p.id,
        title: p.title,
        attachments: p.attachments_json ? JSON.parse(p.attachments_json) : null,
        place: p.place_json ? JSON.parse(p.place_json) : null,
        chunk_index: i,
      };
      insertDoc.run(docId, "posts", p.id, p.timestamp_ms, chunks[i], JSON.stringify(meta));
    }
  }

  // Comments -> documents
  const comments = db
    .prepare("SELECT id, timestamp_ms, author, content, parent_ref FROM comments")
    .all() as Array<{ id: string; timestamp_ms: number | null; author: string | null; content: string | null; parent_ref: string | null }>;
  for (const c of comments) {
    const text = safeString(c.content);
    if (!text) continue;
    const chunks = chunkLines([text], { minChars: 0, maxChars: 1500 });
    for (let i = 0; i < chunks.length; i++) {
      const docId = `comments:${c.id}:${i}`;
      const meta = { comment_id: c.id, author: c.author, parent_ref: c.parent_ref, chunk_index: i };
      insertDoc.run(docId, "comments", c.id, c.timestamp_ms, chunks[i], JSON.stringify(meta));
    }
  }
}


