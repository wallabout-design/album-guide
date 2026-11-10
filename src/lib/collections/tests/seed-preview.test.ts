// scripts/seed-preview.sql resets the preview's picks on every upload: what
// anyone wrote through a preview's admin (its sign-in code is public) is gone
// after the next run, and only the seeded rows are left.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

const ROOT = join(import.meta.dirname, '../../../..');
const MIGRATION = readFileSync(join(ROOT, 'migrations/0001_collections.sql'), 'utf8');
const SEED = readFileSync(join(ROOT, 'scripts/seed-preview.sql'), 'utf8');
const SEEDED = Array.from({ length: 26 }, (_, i) => `seed-${String(i + 1).padStart(2, '0')}`);

const ids = (db: DatabaseSync, collection: string) =>
  db
    .prepare('SELECT id FROM records WHERE collection = ? ORDER BY id')
    .all(collection)
    .map((row) => row.id);

test('running the seed again leaves only the seeded picks and no history', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(MIGRATION);
  db.exec(SEED);
  assert.deepEqual(ids(db, 'picks'), SEEDED);

  // What a visitor with the public code could leave behind: a new pick, an
  // edited seeded pick, and their history.
  db.exec(`
    INSERT INTO records (collection, id, data, search, status, position, created_at, updated_at, updated_by)
      VALUES ('picks', 'stray', '{"title": "spam"}', 'spam', 'published', 27, 'now', 'now', 'preview-staff@example.com');
    UPDATE records SET data = '{"title": "defaced"}' WHERE collection = 'picks' AND id = 'seed-01';
    INSERT INTO record_history (collection, record_id, action, data, status, at, by)
      VALUES ('picks', 'stray', 'create', '{"title": "spam"}', 'published', 'now', 'preview-staff@example.com');
  `);

  db.exec(SEED);
  assert.deepEqual(ids(db, 'picks'), SEEDED);
  const first = db.prepare("SELECT data FROM records WHERE collection = 'picks' AND id = 'seed-01'").get();
  assert.equal(JSON.parse(String(first?.data)).title, 'Malleable Monsters');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM record_history').get()?.n, 0);
});

test('the seed touches no collection but picks', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(MIGRATION);
  db.exec(`
    INSERT INTO records (collection, id, data, search, status, position, created_at, updated_at, updated_by)
      VALUES ('other', 'kept', '{}', '', 'draft', 1, 'now', 'now', 'staff@example.com');
  `);
  db.exec(SEED);
  assert.deepEqual(ids(db, 'other'), ['kept']);
});
