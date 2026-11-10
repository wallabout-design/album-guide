import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkDefinition, LIMITS, type CollectionDefinition } from '../types';
import { FORM, searchText, validateRecord } from '../validate';
import { everything } from './fixtures';

const good = {
  title: 'Blue Lines',
  note: 'First line\nsecond line',
  link: 'https://example.com/a?b=1',
  year: 1991,
  day: '2026-03-14',
  featured: true,
  kind: 'a',
  photo: '/media/things/abc123.webp',
  ref: '0123abcd',
};

function errorsFor(input: unknown) {
  const result = validateRecord(everything, input);
  assert.equal(result.ok, false);
  return result.ok ? {} : result.errors;
}

test('a record with every field filled in passes, unchanged', () => {
  assert.deepEqual(validateRecord(everything, good), { ok: true, data: good });
});

test('only the required field is needed; an empty tick box is stored as false', () => {
  assert.deepEqual(validateRecord(everything, { title: 'Only this' }), { ok: true, data: { title: 'Only this', featured: false } });
  assert.deepEqual(validateRecord(everything, { title: 'x', note: '', link: null, year: '' }), {
    ok: true,
    data: { title: 'x', featured: false },
  });
});

test('a missing or blank required field is reported in plain words', () => {
  assert.deepEqual(errorsFor({}), { title: 'Title is needed.' });
  assert.deepEqual(errorsFor({ title: '   ' }), { title: 'Title is needed.' });
});

test('text is trimmed and its whitespace tidied; long text keeps line breaks', () => {
  const result = validateRecord(everything, { title: '  Blue \t Lines\n', note: ' a  \r\nb\n\n\n\nc ' });
  assert.deepEqual(result, { ok: true, data: { title: 'Blue Lines', note: 'a\nb\n\nc', featured: false } });
});

test('text over its limit is refused, counting characters not bytes', () => {
  assert.equal(validateRecord(everything, { title: 'é'.repeat(20) }).ok, true);
  assert.equal(validateRecord(everything, { title: '🎵'.repeat(20) }).ok, true);
  assert.deepEqual(errorsFor({ title: 'x'.repeat(21) }), { title: 'Title is too long: 21 characters, and the limit is 20.' });
  assert.match(errorsFor({ title: 'ok', note: 'x'.repeat(51) }).note, /too long: 51 characters, and the limit is 50/);
});

test('HTML is refused in text and long text', () => {
  for (const bad of ['<b>bold</b>', 'x <script>alert(1)</script>', '</p>', '<!-- hi -->', '< img src=x>', '<?php']) {
    assert.match(errorsFor({ title: 'ok', note: bad }).note, /can't contain HTML tags/, bad);
    assert.match(errorsFor({ title: bad.slice(0, 20) }).title, /can't contain HTML tags/, bad);
  }
  // A lone "<" in ordinary writing is fine.
  assert.equal(validateRecord(everything, { title: '3 < 4', note: 'I <3 this & that > most' }).ok, true);
});

test('control characters are dropped, and odd line breaks become spaces in one-line text', () => {
  const result = validateRecord(everything, { title: 'a\u0000b\u0007c d\u0085e' });
  assert.deepEqual(result.ok && result.data.title, 'abc de');
  const long = validateRecord(everything, { title: 'ok', note: 'a\u0000b c\td' });
  assert.deepEqual(long.ok && long.data.note, 'abc d');
});

test('a web address must be https, complete, and without a password', () => {
  for (const bad of ['http://example.com', 'javascript:alert(1)', 'data:text/html,x', 'example.com', '//example.com', 'ftp://example.com', 'https://a b.com']) {
    assert.ok(errorsFor({ title: 'ok', link: bad }).link, bad);
  }
  assert.equal(errorsFor({ title: 'ok', link: 'http://example.com' }).link, 'Link must be a full web address, starting with https://.');
  assert.match(errorsFor({ title: 'ok', link: 'https://user:pw@example.com' }).link, /user name or password/);
  assert.match(errorsFor({ title: 'ok', link: `https://example.com/${'a'.repeat(LIMITS.url)}` }).link, /too long/);
});

test('a url field can allow other schemes', () => {
  const def: CollectionDefinition = {
    ...everything,
    fields: [everything.fields[0], { name: 'link', label: 'Link', type: 'url', schemes: ['https', 'mailto'] }],
  };
  assert.equal(validateRecord(def, { title: 'ok', link: 'mailto:someone@example.com' }).ok, true);
  assert.equal(validateRecord(def, { title: 'ok', link: 'javascript:alert(1)' }).ok, false);
});

test('a number is checked for type, wholeness and range; a form may send it as text', () => {
  assert.deepEqual(validateRecord(everything, { title: 'ok', year: '1991' }), { ok: true, data: { title: 'ok', year: 1991, featured: false } });
  assert.equal(errorsFor({ title: 'ok', year: 'ninety' }).year, 'Year must be a number.');
  assert.equal(errorsFor({ title: 'ok', year: '1e3' }).year, 'Year must be a number.');
  assert.equal(errorsFor({ title: 'ok', year: Number.NaN }).year, 'Year must be a number.');
  assert.equal(errorsFor({ title: 'ok', year: 1991.5 }).year, 'Year must be a whole number.');
  assert.equal(errorsFor({ title: 'ok', year: 1899 }).year, 'Year must be from 1900 to 2100.');
  assert.equal(errorsFor({ title: 'ok', year: 2101 }).year, 'Year must be from 1900 to 2100.');
});

test('a date must be a real calendar date', () => {
  for (const bad of ['14/03/2026', '2026-3-14', '2026-02-31', '2026-13-01', 'tomorrow', 20260314]) {
    assert.equal(errorsFor({ title: 'ok', day: bad }).day, 'Day must be a date, like 2026-03-14.', String(bad));
  }
  assert.equal(validateRecord(everything, { title: 'ok', day: '2028-02-29' }).ok, true);
});

test('a tick box, a choice, an image and a reference each take only their own values', () => {
  assert.equal(errorsFor({ title: 'ok', featured: 'yes' }).featured, 'Featured must be ticked or not ticked.');
  assert.equal(errorsFor({ title: 'ok', kind: 'c' }).kind, 'Please choose one of the options for Kind.');
  for (const bad of ['https://evil.example/x.png', '/media/../secret.png', '/media/a.svg', 'media/a.png', '/media/a b.png']) {
    assert.equal(errorsFor({ title: 'ok', photo: bad }).photo, 'Photo must be an image uploaded here.', bad);
  }
  assert.equal(errorsFor({ title: 'ok', ref: 'XYZ' }).ref, "Reference doesn't look right. It should look like 0123abcd.");
  assert.equal(errorsFor({ title: 'ok', ref: '0123abcd\nextra' }).ref, "Reference doesn't look right. It should look like 0123abcd.");
});

test('a field the collection does not declare is refused, not saved', () => {
  assert.deepEqual(errorsFor({ title: 'ok', admin: true }), { [FORM]: 'The form is out of date. Please reload the page and try again.' });
});

test('anything but an object is refused', () => {
  for (const bad of [null, 'text', 5, ['title'], undefined]) assert.ok(errorsFor(bad)[FORM]);
});

test('every problem is reported at once', () => {
  assert.deepEqual(Object.keys(errorsFor({ note: '<b>', year: 5, kind: 'z' })).sort(), ['kind', 'note', 'title', 'year']);
});

test('a record over the size limit is refused as a whole', () => {
  const fields = Array.from({ length: 3 }, (_, i) => ({ name: `f${i}`, label: `F${i}`, type: 'longtext' as const, maxLength: 10_000 }));
  const def: CollectionDefinition = { ...everything, fields: [everything.fields[0], ...fields] };
  checkDefinition(def);
  const big = 'x'.repeat(6_000);
  assert.equal(validateRecord(def, { title: 'ok', f0: big, f1: big }).ok, true);
  const result = validateRecord(def, { title: 'ok', f0: big, f1: big, f2: big });
  assert.deepEqual(result, { ok: false, errors: { [FORM]: 'This is too much to save in one record. Please shorten the longer fields.' } });
});

test('search text is the lowercase words of the text fields and chosen labels', () => {
  assert.equal(searchText(everything, { ...good, title: 'Blue  Lines' }), 'blue lines first line second line alpha 0123abcd');
});

test('checkDefinition accepts the fixtures and names every problem in a bad one', () => {
  checkDefinition(everything);
  const bad: CollectionDefinition = {
    name: 'Bad Name',
    label: '',
    singular: 'x',
    titleField: 'note',
    sort: { by: 'field', field: 'missing', direction: 'asc' },
    pageSize: 500,
    maxRecords: 1_000_000,
    fields: [
      { name: 'note', label: 'Note', type: 'longtext', maxLength: 99_999 },
      { name: 'note', label: 'Again', type: 'text' },
      { name: 'Bad-Name', label: 'x', type: 'text' },
      { name: 'pick', label: 'Pick', type: 'select', options: [] },
      { name: 'ref', label: 'Ref', type: 'reference', pattern: '[0-9]+', example: 'abc' },
      { name: 'link', label: 'Link', type: 'url', schemes: ['https:'] },
    ],
  };
  assert.throws(() => checkDefinition(bad), (error: Error) => {
    for (const part of ['name "Bad Name"', 'label is missing', 'declared twice', 'maxLength must be', 'no options', "example doesn't match", 'without the colon', 'titleField', 'sort field', 'pageSize', 'maxRecords']) {
      assert.ok(error.message.includes(part), `${part} in: ${error.message}`);
    }
    return true;
  });
});
