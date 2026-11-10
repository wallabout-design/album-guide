// The form's values while it is being filled in, and how they turn into the
// record that is sent.
import type { CollectionDefinition, RecordData } from '../lib/collections/types';

/** Text as typed, tick boxes as booleans. */
export type FormValues = Record<string, string | boolean>;

export function valuesFrom(def: CollectionDefinition, data: RecordData = {}): FormValues {
  const values: FormValues = {};
  for (const field of def.fields) {
    const value = data[field.name];
    values[field.name] = field.type === 'boolean' ? value === true : value === undefined ? '' : String(value);
  }
  return values;
}

/** Empty optional fields are left out. */
export function recordFrom(def: CollectionDefinition, values: FormValues): Record<string, string | boolean> {
  const data: Record<string, string | boolean> = {};
  for (const field of def.fields) {
    const value = values[field.name];
    if (typeof value === 'boolean') data[field.name] = value;
    else if (typeof value === 'string' && value.trim() !== '') data[field.name] = value;
  }
  return data;
}
