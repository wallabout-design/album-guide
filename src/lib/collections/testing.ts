// A collection with one field of every type, a small page and a low cap, for
// tests: the unit tests here, and a site's end-to-end tests, which can give
// each test its own collection so no test sees another's records.
import type { CollectionDefinition } from './types';

export function exampleCollection(name: string): CollectionDefinition {
  return {
    name,
    label: 'Things',
    singular: 'thing',
    titleField: 'title',
    sort: { by: 'position' },
    pageSize: 3,
    maxRecords: 8,
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true, maxLength: 20 },
      { name: 'note', label: 'Note', type: 'longtext', maxLength: 50, help: 'A line or two.' },
      { name: 'link', label: 'Link', type: 'url' },
      { name: 'year', label: 'Year', type: 'number', integer: true, min: 1900, max: 2100 },
      { name: 'day', label: 'Day', type: 'date' },
      { name: 'featured', label: 'Featured', type: 'boolean' },
      { name: 'kind', label: 'Kind', type: 'select', options: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }] },
      { name: 'photo', label: 'Photo', type: 'image' },
      { name: 'ref', label: 'Reference', type: 'reference', pattern: '[a-f0-9]{8}', example: '0123abcd' },
    ],
  };
}
