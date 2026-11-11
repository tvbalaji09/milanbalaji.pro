CREATE TABLE IF NOT EXISTS shanthi (
 id INTEGER PRIMARY KEY CHECK (id = 1),
 body TEXT NOT NULL CHECK (json_valid(body)),
 revision INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO shanthi (id,body,revision) VALUES
(1,'{"version":1,"target":1550,"days":{}}',0);
