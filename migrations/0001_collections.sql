-- Collections: one schema for every collection a site declares
-- (src/lib/collections). The fields of a record are JSON in `data`, checked
-- against the collection's definition in code before anything is written, so
-- adding a collection or a field needs no migration.

CREATE TABLE records (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  -- The record's fields, as a JSON object.
  data TEXT NOT NULL,
  -- The words the admin's search looks through, in lowercase.
  search TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  -- The order staff set by hand; ties are broken by id.
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- The email of whoever last changed it.
  updated_by TEXT NOT NULL,
  -- Set when staff remove the record. It can be restored until it is purged.
  deleted_at TEXT,
  PRIMARY KEY (collection, id)
);

-- The public list: published, not removed, in position order.
CREATE INDEX records_listing ON records (collection, deleted_at, status, position, id);

-- The record as it was after each change, so any edit or removal can be undone.
CREATE TABLE record_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'publish', 'unpublish', 'remove', 'restore', 'revert')),
  data TEXT NOT NULL,
  status TEXT NOT NULL,
  at TEXT NOT NULL,
  by TEXT NOT NULL
);

CREATE INDEX record_history_record ON record_history (collection, record_id, id);
