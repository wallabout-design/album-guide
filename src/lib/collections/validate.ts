// Checks what staff typed against a collection's definition. Every limit is
// enforced here, on the server; the admin form runs the same function in the
// browser only to show the messages sooner. Messages are for non-technical
// readers: plain words, no field names from the code, no jargon.
import { LIMITS, type CollectionDefinition, type FieldDefinition, type RecordData } from './types';

/** The key for a problem with the record as a whole rather than one field. */
export const FORM = '_form';

export type ValidationResult =
  | { ok: true; data: RecordData }
  | { ok: false; errors: Record<string, string> };

// Anything that could start a tag, a comment or a doctype. Records are plain
// text and are always rendered as text; refusing markup keeps them that way
// wherever they are shown later (an email, a feed, another site).
const HTML = /<\s*[A-Za-z/!?]/;
// Control characters (except tab and line feed, handled per field type), the
// Unicode line and paragraph separators, and the byte order mark.
// oxlint-disable-next-line no-control-regex
const CONTROL = new RegExp('[\\u0000-\\u0008\\u000B-\\u001F\\u007F-\\u009F\\u2028\\u2029\\uFEFF]', 'g');
const IMAGE_PATH = /^\/media\/[A-Za-z0-9][A-Za-z0-9_-]*(?:\/[A-Za-z0-9][A-Za-z0-9_-]*)*\.(?:jpg|png|webp)$/;

const characters = (text: string) => [...text].length;
const bytes = (text: string) => new TextEncoder().encode(text).length;

function oneLine(value: string): string {
  return value.normalize('NFC').replace(/\s+/g, ' ').replace(CONTROL, '').trim();
}

function manyLines(value: string): string {
  return value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(CONTROL, '')
    .replace(/[ ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

type Checked = { value: string | number | boolean } | { error: string };

function checkText(field: FieldDefinition, raw: unknown, max: number, clean: (v: string) => string): Checked {
  if (typeof raw !== 'string') return { error: `${field.label} must be text.` };
  const value = clean(raw);
  if (HTML.test(value)) {
    return { error: `${field.label} can't contain HTML tags (text like <b>). Please remove them.` };
  }
  const length = characters(value);
  if (length > max) {
    return { error: `${field.label} is too long: ${length} characters, and the limit is ${max}.` };
  }
  return { value };
}

function checkUrl(field: FieldDefinition & { type: 'url' }, raw: unknown): Checked {
  const schemes = field.schemes ?? ['https'];
  const hint = `${field.label} must be a full web address, starting with ${schemes.map((s) => (s === 'mailto' ? 'mailto:' : `${s}://`)).join(' or ')}.`;
  if (typeof raw !== 'string') return { error: hint };
  const text = raw.trim();
  if (/\s/.test(text) || text.replace(CONTROL, '') !== text) return { error: `${field.label} can't contain spaces.` };
  if (characters(text) > LIMITS.url) return { error: `${field.label} is too long for a web address.` };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { error: hint };
  }
  if (!schemes.includes(url.protocol.slice(0, -1))) return { error: hint };
  if (url.username || url.password) return { error: `${field.label} can't include a user name or password.` };
  return { value: url.href };
}

function checkNumber(field: FieldDefinition & { type: 'number' }, raw: unknown): Checked {
  const value = typeof raw === 'string' && /^-?\d+(\.\d+)?$/.test(raw.trim()) ? Number(raw.trim()) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value)) return { error: `${field.label} must be a number.` };
  if (field.integer && !Number.isInteger(value)) return { error: `${field.label} must be a whole number.` };
  const { min, max } = field;
  const outside = (min !== undefined && value < min) || (max !== undefined && value > max);
  if (outside) {
    if (min !== undefined && max !== undefined) return { error: `${field.label} must be from ${min} to ${max}.` };
    return { error: min !== undefined ? `${field.label} must be ${min} or more.` : `${field.label} must be ${max} or less.` };
  }
  return { value };
}

function checkDate(field: FieldDefinition, raw: unknown): Checked {
  const error = `${field.label} must be a date, like 2026-03-14.`;
  if (typeof raw !== 'string') return { error };
  const text = raw.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return { error };
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  // Date rolls 2026-02-31 over to March; a real date comes back unchanged.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) return { error };
  return { value: text };
}

function checkField(field: FieldDefinition, raw: unknown): Checked {
  switch (field.type) {
    case 'text':
      return checkText(field, raw, field.maxLength ?? LIMITS.text.default, oneLine);
    case 'longtext':
      return checkText(field, raw, field.maxLength ?? LIMITS.longtext.default, manyLines);
    case 'url':
      return checkUrl(field, raw);
    case 'number':
      return checkNumber(field, raw);
    case 'date':
      return checkDate(field, raw);
    case 'boolean':
      return typeof raw === 'boolean' ? { value: raw } : { error: `${field.label} must be ticked or not ticked.` };
    case 'select':
      return typeof raw === 'string' && field.options.some((o) => o.value === raw)
        ? { value: raw }
        : { error: `Please choose one of the options for ${field.label}.` };
    case 'image':
      return typeof raw === 'string' && IMAGE_PATH.test(raw)
        ? { value: raw }
        : { error: `${field.label} must be an image uploaded here.` };
    case 'reference': {
      const error = `${field.label} doesn't look right. It should look like ${field.example}.`;
      if (typeof raw !== 'string') return { error };
      const value = raw.trim();
      if (characters(value) > LIMITS.reference) return { error };
      return new RegExp(`^(?:${field.pattern})$`).test(value) ? { value } : { error };
    }
  }
}

/**
 * Checks `input` against the definition. On success, `data` holds only the
 * declared fields, cleaned (trimmed, whitespace tidied, web addresses
 * normalised). On failure, `errors` has one plain-words message per field,
 * and `_form` for a problem with the whole record.
 */
export function validateRecord(def: CollectionDefinition, input: unknown): ValidationResult {
  const errors: Record<string, string> = {};
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: { [FORM]: 'The form could not be read. Please reload the page and try again.' } };
  }
  const given = input as Record<string, unknown>;
  const known = new Set(def.fields.map((f) => f.name));
  const unknown = Object.keys(given).filter((key) => !known.has(key));
  if (unknown.length) {
    errors[FORM] = 'The form is out of date. Please reload the page and try again.';
  }

  const data: RecordData = {};
  for (const field of def.fields) {
    const raw = given[field.name];
    if (isEmpty(raw)) {
      if (field.type === 'boolean') data[field.name] = false;
      else if (field.required) errors[field.name] = `${field.label} is needed.`;
      continue;
    }
    const checked = checkField(field, raw);
    if ('error' in checked) errors[field.name] = checked.error;
    else if (checked.value === '') {
      if (field.required) errors[field.name] = `${field.label} is needed.`;
    } else data[field.name] = checked.value;
  }

  if (Object.keys(errors).length === 0 && bytes(JSON.stringify(data)) > LIMITS.recordBytes) {
    errors[FORM] = 'This is too much to save in one record. Please shorten the longer fields.';
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}

/**
 * The words the admin's search looks through: every text, long text and
 * reference value and the chosen option labels, in lowercase.
 */
export function searchText(def: CollectionDefinition, data: RecordData): string {
  const parts: string[] = [];
  for (const field of def.fields) {
    const value = data[field.name];
    if (typeof value !== 'string') continue;
    if (field.type === 'text' || field.type === 'longtext' || field.type === 'reference') parts.push(value);
    if (field.type === 'select') parts.push(field.options.find((o) => o.value === value)?.label ?? value);
  }
  return parts.join(' ').toLowerCase().replace(/\s+/g, ' ').slice(0, 4_000);
}
