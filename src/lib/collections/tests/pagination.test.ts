import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampLimit, decodeCursor, encodeCursor, sortKeyOf, toPage } from '../pagination';

test('a cursor survives the round trip, numbers and text alike', () => {
  for (const cursor of [{ key: 12, id: 'abc' }, { key: -3.5, id: 'x' }, { key: '2026-01-01T00:00:00.000Z', id: 'r-1' }, { key: 'Zoë 🎵', id: 'r2' }]) {
    const text = encodeCursor(cursor);
    assert.match(text, /^[A-Za-z0-9_-]+$/);
    assert.deepEqual(decodeCursor(text), cursor);
  }
});

test('anything that is not a cursor decodes to null', () => {
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const bad = ['', 'not a cursor', '!!!', 'a'.repeat(1_001), b64({ key: 1, id: 'a' }), b64([1]), b64([1, 2]), b64([null, 'a']), b64([true, 'a']), b64([1, '']), b64([1, 'a', 'b']), Buffer.from('{').toString('base64url'), Buffer.from([0xff, 0xfe]).toString('base64url')];
  for (const text of bad) assert.equal(decodeCursor(text), null, text);
});

test('a well-formed cursor longer than 1,000 characters is refused', () => {
  const long = encodeCursor({ key: 'k'.repeat(800), id: 'a' });
  assert.ok(long.length > 1_000);
  assert.equal(decodeCursor(long), null);
  const justUnder = encodeCursor({ key: 'k'.repeat(700), id: 'a' });
  assert.ok(justUnder.length <= 1_000);
  assert.deepEqual(decodeCursor(justUnder), { key: 'k'.repeat(700), id: 'a' });
});

test('the limit falls back when missing or nonsense, and is clamped to 1..max', () => {
  assert.equal(clampLimit(undefined, 20), 20);
  assert.equal(clampLimit(null, 20), 20);
  assert.equal(clampLimit('', 20), 20);
  assert.equal(clampLimit('abc', 20), 20);
  assert.equal(clampLimit('2.5', 20), 20);
  assert.equal(clampLimit('-4', 20), 20);
  assert.equal(clampLimit('7', 20), 7);
  assert.equal(clampLimit(7, 20), 7);
  assert.equal(clampLimit('0', 20), 1);
  assert.equal(clampLimit('9999', 20), 50);
  assert.equal(clampLimit('999999999999999999999', 20), 20);
  assert.equal(clampLimit(80, 20, 100), 80);
});

const row = (id: string, position: number) => ({ id, position, createdAt: `2026-01-0${position}`, data: { year: 2000 + position } });

test('a page has a next cursor only when there is one more row than asked for', () => {
  const rows = [row('a', 1), row('b', 2), row('c', 3)];
  const full = toPage(rows, 2, { by: 'position' });
  assert.deepEqual(full.items.map((r) => r.id), ['a', 'b']);
  assert.deepEqual(decodeCursor(full.nextCursor!), { key: 2, id: 'b' });
  assert.equal(toPage(rows, 3, { by: 'position' }).nextCursor, null);
  assert.deepEqual(toPage([], 3, { by: 'position' }), { items: [], nextCursor: null });
});

test('the sort key follows the sort order', () => {
  const record = row('a', 4);
  assert.equal(sortKeyOf(record, { by: 'position' }), 4);
  assert.equal(sortKeyOf(record, { by: 'created', direction: 'desc' }), '2026-01-04');
  assert.equal(sortKeyOf(record, { by: 'field', field: 'year', direction: 'asc' }), 2004);
});
