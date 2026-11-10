// Collections: structured records that a site's staff add, edit and remove.
// A collection is declared in code (a CollectionDefinition); its records live
// in the database. This folder is plain TypeScript with no framework or Worker
// imports, so it can be lifted into a shared package unchanged.

/** What every field has. `name` is the key in the stored record; `label` is what staff see. */
interface FieldBase {
  name: string;
  label: string;
  required?: boolean;
  /** One line under the input, in plain words. */
  help?: string;
}

/** One line of text. */
export interface TextField extends FieldBase {
  type: 'text';
  /** Characters. Default 200, at most 1,000. */
  maxLength?: number;
}

/** Several lines of plain text. Line breaks are kept; HTML is refused. */
export interface LongTextField extends FieldBase {
  type: 'longtext';
  /** Characters. Default 2,000, at most 10,000. */
  maxLength?: number;
}

/** A full web address. */
export interface UrlField extends FieldBase {
  type: 'url';
  /** Allowed schemes, without the colon. Default `['https']`. */
  schemes?: string[];
}

export interface NumberField extends FieldBase {
  type: 'number';
  min?: number;
  max?: number;
  /** Whole numbers only. */
  integer?: boolean;
}

/** A calendar date, stored as `YYYY-MM-DD`. */
export interface DateField extends FieldBase {
  type: 'date';
}

/** A tick box. Stored as true or false; never missing. */
export interface BooleanField extends FieldBase {
  type: 'boolean';
}

/** One choice from a fixed list. */
export interface SelectField extends FieldBase {
  type: 'select';
  options: { value: string; label: string }[];
}

/** An uploaded image, stored as the site path it is served from (`/media/...`). */
export interface ImageField extends FieldBase {
  type: 'image';
}

/** An id in another system, such as a MusicBrainz id. */
export interface ReferenceField extends FieldBase {
  type: 'reference';
  /** A regular expression the whole value must match. */
  pattern: string;
  /** A valid value, shown when the one entered doesn't match. */
  example: string;
}

export type FieldDefinition =
  | TextField
  | LongTextField
  | UrlField
  | NumberField
  | DateField
  | BooleanField
  | SelectField
  | ImageField
  | ReferenceField;

export type FieldType = FieldDefinition['type'];

/**
 * The order records are listed in, publicly and in the admin.
 * - `position`: staff set the order by moving records up and down.
 * - `created`: by when the record was added.
 * - `field`: by one required text, number or date field.
 */
export type SortOrder =
  | { by: 'position' }
  | { by: 'created'; direction: 'asc' | 'desc' }
  | { by: 'field'; field: string; direction: 'asc' | 'desc' };

export interface CollectionDefinition {
  /** The name in URLs: `/api/collections/<name>`. Lowercase letters, digits and dashes. */
  name: string;
  /** What staff see: "Staff picks". */
  label: string;
  /** One record, in lowercase: "pick". */
  singular: string;
  /** The field that names a record in lists. A required text field. */
  titleField: string;
  fields: FieldDefinition[];
  sort: SortOrder;
  /** With `sort: position`, where a new record goes. Default `last`. */
  newRecords?: 'first' | 'last';
  /** Records per page on the public list. Default 20, at most 50. */
  pageSize?: number;
  /** How many records the collection may hold. Default 500, at most 5,000. */
  maxRecords?: number;
}

/** A record's field values, keyed by field name. Optional fields left empty are absent. */
export type RecordData = Record<string, string | number | boolean>;

export type RecordStatus = 'draft' | 'published';

export interface StoredRecord {
  collection: string;
  id: string;
  data: RecordData;
  status: RecordStatus;
  position: number;
  createdAt: string;
  updatedAt: string;
  /** The email of whoever last changed it. Never sent to the public. */
  updatedBy: string;
  /** Set when the record was removed. A removed record can be restored. */
  deletedAt: string | null;
}

/** What the public list returns for one record. */
export interface PublicRecord {
  id: string;
  data: RecordData;
  updatedAt: string;
}

export type HistoryAction = 'create' | 'update' | 'publish' | 'unpublish' | 'remove' | 'restore' | 'revert';

/** The record as it was after one change. */
export interface HistoryEntry {
  id: number;
  collection: string;
  recordId: string;
  action: HistoryAction;
  data: RecordData;
  status: RecordStatus;
  at: string;
  by: string;
}

/** The limits every collection is held to, whatever its definition says. */
export const LIMITS = {
  pageSize: { default: 20, max: 50 },
  /** Bytes of JSON for one record's data. */
  recordBytes: 16_384,
  records: { default: 500, max: 5_000 },
  text: { default: 200, max: 1_000 },
  longtext: { default: 2_000, max: 10_000 },
  /** Characters in a web address or a reference. */
  url: 2_000,
  reference: 200,
  fields: 40,
  /** Characters of a search in the admin. */
  search: 100,
  /** Past versions kept per record. */
  history: 50,
  /** Days a removed record can still be restored. */
  removedDays: 90,
} as const;

const NAME = /^[a-z][a-z0-9-]{0,39}$/;
const FIELD_NAME = /^[a-z][A-Za-z0-9_]{0,39}$/;

/** True for a name a field may have. Field names reach SQL, so they are held to this. */
export function isFieldName(name: string): boolean {
  return FIELD_NAME.test(name);
}

/**
 * Throws if a definition is wrong, with every problem listed. Run when the
 * site starts and in its tests, so a bad definition never reaches staff.
 */
export function checkDefinition(def: CollectionDefinition): void {
  const problems: string[] = [];
  if (!NAME.test(def.name)) problems.push(`name "${def.name}" must be lowercase letters, digits and dashes`);
  if (!def.label) problems.push('label is missing');
  if (!def.singular) problems.push('singular is missing');
  if (def.fields.length === 0) problems.push('there are no fields');
  if (def.fields.length > LIMITS.fields) problems.push(`more than ${LIMITS.fields} fields`);

  const seen = new Set<string>();
  for (const field of def.fields) {
    const where = `field "${field.name}"`;
    if (!isFieldName(field.name)) problems.push(`${where}: the name must start with a lowercase letter and use letters, digits and _`);
    if (seen.has(field.name)) problems.push(`${where} is declared twice`);
    seen.add(field.name);
    if (!field.label) problems.push(`${where} has no label`);
    if (field.type === 'text' || field.type === 'longtext') {
      const max = field.maxLength;
      if (max !== undefined && (!Number.isInteger(max) || max < 1 || max > LIMITS[field.type].max)) {
        problems.push(`${where}: maxLength must be from 1 to ${LIMITS[field.type].max}`);
      }
    }
    if (field.type === 'select') {
      if (field.options.length === 0) problems.push(`${where} has no options`);
      if (new Set(field.options.map((o) => o.value)).size !== field.options.length) {
        problems.push(`${where} has the same option twice`);
      }
    }
    if (field.type === 'number' && field.min !== undefined && field.max !== undefined && field.min > field.max) {
      problems.push(`${where}: min is above max`);
    }
    if (field.type === 'url' && field.schemes?.some((s) => !/^[a-z][a-z0-9+.-]*$/.test(s))) {
      problems.push(`${where}: schemes are written without the colon, like "https"`);
    }
    if (field.type === 'reference') {
      try {
        if (!new RegExp(`^(?:${field.pattern})$`).test(field.example)) problems.push(`${where}: the example doesn't match the pattern`);
      } catch {
        problems.push(`${where}: the pattern isn't a valid regular expression`);
      }
    }
  }

  const title = def.fields.find((f) => f.name === def.titleField);
  if (!title || title.type !== 'text' || !title.required) {
    problems.push(`titleField "${def.titleField}" must be a required text field`);
  }
  if (def.sort.by === 'field') {
    const name = def.sort.field;
    const field = def.fields.find((f) => f.name === name);
    if (!field || !field.required || !['text', 'number', 'date'].includes(field.type)) {
      problems.push(`sort field "${name}" must be a required text, number or date field`);
    }
  }
  if (def.newRecords && def.sort.by !== 'position') problems.push('newRecords only applies with sort by position');
  const page = def.pageSize;
  if (page !== undefined && (!Number.isInteger(page) || page < 1 || page > LIMITS.pageSize.max)) {
    problems.push(`pageSize must be from 1 to ${LIMITS.pageSize.max}`);
  }
  const cap = def.maxRecords;
  if (cap !== undefined && (!Number.isInteger(cap) || cap < 1 || cap > LIMITS.records.max)) {
    problems.push(`maxRecords must be from 1 to ${LIMITS.records.max}`);
  }

  if (problems.length) throw new Error(`Collection "${def.name}" is not declared correctly: ${problems.join('; ')}.`);
}
