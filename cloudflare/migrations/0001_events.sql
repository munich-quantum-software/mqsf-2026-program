CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  audience TEXT NOT NULL,
  organizers TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
