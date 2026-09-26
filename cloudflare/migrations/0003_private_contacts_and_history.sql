ALTER TABLE events ADD COLUMN contact_email TEXT NOT NULL DEFAULT '';

-- Private history and notification outbox. Never expose these rows through the public API.
CREATE TABLE event_changes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  event_id TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  before_json TEXT,
  after_json TEXT,
  notified_at TEXT,
  notify_attempts INTEGER NOT NULL DEFAULT 0,
  notify_after INTEGER NOT NULL DEFAULT 0,
  notify_lease_until INTEGER NOT NULL DEFAULT 0,
  notify_error TEXT
);
CREATE INDEX event_changes_pending ON event_changes(notified_at, notify_after);
CREATE INDEX event_changes_event ON event_changes(event_id, created_at);

CREATE TRIGGER events_created_history AFTER INSERT ON events BEGIN
  INSERT INTO event_changes(event_id, action, before_json, after_json)
  VALUES (NEW.id, 'created', NULL, json_object('id', NEW.id, 'date', NEW.date, 'start', NEW.start, 'end', NEW.end, 'title', NEW.title, 'description', NEW.description, 'audience', NEW.audience, 'organizers', NEW.organizers, 'version', NEW.version, 'updated_at', NEW.updated_at, 'contact_email', NEW.contact_email));
END;

CREATE TRIGGER events_updated_history AFTER UPDATE ON events BEGIN
  INSERT INTO event_changes(event_id, action, before_json, after_json)
  VALUES (NEW.id, 'updated', json_object('id', OLD.id, 'date', OLD.date, 'start', OLD.start, 'end', OLD.end, 'title', OLD.title, 'description', OLD.description, 'audience', OLD.audience, 'organizers', OLD.organizers, 'version', OLD.version, 'updated_at', OLD.updated_at, 'contact_email', OLD.contact_email), json_object('id', NEW.id, 'date', NEW.date, 'start', NEW.start, 'end', NEW.end, 'title', NEW.title, 'description', NEW.description, 'audience', NEW.audience, 'organizers', NEW.organizers, 'version', NEW.version, 'updated_at', NEW.updated_at, 'contact_email', NEW.contact_email));
END;

CREATE TRIGGER events_deleted_history AFTER DELETE ON events BEGIN
  INSERT INTO event_changes(event_id, action, before_json, after_json)
  VALUES (OLD.id, 'deleted', json_object('id', OLD.id, 'date', OLD.date, 'start', OLD.start, 'end', OLD.end, 'title', OLD.title, 'description', OLD.description, 'audience', OLD.audience, 'organizers', OLD.organizers, 'version', OLD.version, 'updated_at', OLD.updated_at, 'contact_email', OLD.contact_email), NULL);
END;
