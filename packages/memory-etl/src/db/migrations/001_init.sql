PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- Core entities
CREATE TABLE IF NOT EXISTS threads (
  thread_id TEXT PRIMARY KEY,
  title TEXT,
  participants_json TEXT NOT NULL,
  source_path TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  timestamp_ms INTEGER NOT NULL,
  sender_name TEXT,
  content TEXT,
  msg_type TEXT,
  is_unsent INTEGER NOT NULL DEFAULT 0,
  media_uri TEXT,
  reactions_json TEXT,
  FOREIGN KEY (thread_id) REFERENCES threads(thread_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_thread_ts ON messages(thread_id, timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(timestamp_ms);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  timestamp_ms INTEGER,
  title TEXT,
  content TEXT,
  attachments_json TEXT,
  place_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_posts_ts ON posts(timestamp_ms);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  timestamp_ms INTEGER,
  author TEXT,
  content TEXT,
  parent_ref TEXT
);

CREATE INDEX IF NOT EXISTS idx_comments_ts ON comments(timestamp_ms);

CREATE TABLE IF NOT EXISTS reactions (
  id TEXT PRIMARY KEY,
  timestamp_ms INTEGER,
  actor TEXT,
  reaction TEXT,
  target_ref TEXT
);

CREATE INDEX IF NOT EXISTS idx_reactions_ts ON reactions(timestamp_ms);

-- Retrieval docs
CREATE TABLE IF NOT EXISTS documents (
  doc_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_id TEXT,
  timestamp_ms INTEGER,
  text TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_ts ON documents(timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source, source_id);

-- Full-text index (names-only metadata; values stored in documents table)
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts
USING fts5(doc_id, text, metadata_json, tokenize = 'porter');

-- FTS sync triggers
CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
  INSERT INTO documents_fts (doc_id, text, metadata_json) VALUES (new.doc_id, new.text, new.metadata_json);
END;

CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
  INSERT INTO documents_fts (documents_fts, doc_id, text, metadata_json) VALUES ('delete', old.doc_id, old.text, old.metadata_json);
END;

CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
  INSERT INTO documents_fts (documents_fts, doc_id, text, metadata_json) VALUES ('delete', old.doc_id, old.text, old.metadata_json);
  INSERT INTO documents_fts (doc_id, text, metadata_json) VALUES (new.doc_id, new.text, new.metadata_json);
END;

-- Resumable ingest bookkeeping
CREATE TABLE IF NOT EXISTS ingested_files (
  path TEXT PRIMARY KEY,
  size_bytes INTEGER NOT NULL,
  mtime_ms INTEGER NOT NULL,
  ingested_at_ms INTEGER NOT NULL
);


