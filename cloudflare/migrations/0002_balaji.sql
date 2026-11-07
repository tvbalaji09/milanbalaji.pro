-- Balaji is independent of Milan and the archived second-child records.
CREATE TABLE IF NOT EXISTS balaji (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  body TEXT NOT NULL CHECK (json_valid(body)),
  revision INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO balaji (id, body, revision) VALUES
(1, '{"version":1,"name":"Balaji","days":{},"entries":{}}', 0);
