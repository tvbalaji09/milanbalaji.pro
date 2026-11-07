-- One family document: each update/restore is a single atomic SQL statement.
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  body TEXT NOT NULL CHECK (json_valid(body)),
  revision INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO activities (id, body, revision) VALUES
(1, '{"version":1,"children":[{"id":"child-1","name":"Child 1","days":{}},{"id":"child-2","name":"Child 2","days":{}}]}', 0);
