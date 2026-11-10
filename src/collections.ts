// The collections this site's staff manage (src/lib/collections). Declared
// here, stored in D1, edited at /admin and read at /api/collections/<name>.
// Adding a field or a collection is a change to this file; it needs no migration.
import type { CollectionDefinition } from './lib/collections/types';

/** Staff picks: albums the people behind the site recommend, with a line on why. */
export const picks: CollectionDefinition = {
  name: 'picks',
  label: 'Staff picks',
  singular: 'pick',
  titleField: 'title',
  sort: { by: 'position' },
  newRecords: 'first',
  pageSize: 12,
  maxRecords: 200,
  fields: [
    {
      name: 'album',
      label: 'MusicBrainz id',
      type: 'reference',
      required: true,
      pattern: '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
      example: '8b6f133a-2fdf-3cc2-b84d-1c889adc0939',
      help: 'Find the album on musicbrainz.org and copy the last part of its address (the release group). The cover comes from this.',
    },
    { name: 'title', label: 'Album title', type: 'text', required: true, maxLength: 200 },
    { name: 'artist', label: 'Artist', type: 'text', required: true, maxLength: 200 },
    { name: 'year', label: 'Year', type: 'number', integer: true, min: 1900, max: 2100, help: 'The year it first came out.' },
    {
      name: 'note',
      label: 'Why we picked it',
      type: 'longtext',
      required: true,
      maxLength: 500,
      help: 'A sentence or two, in your own words.',
    },
    {
      name: 'kind',
      label: 'Kind of pick',
      type: 'select',
      options: [
        { value: 'new', label: 'New find' },
        { value: 'classic', label: 'Old favourite' },
        { value: 'deep', label: 'Deep cut' },
      ],
    },
    { name: 'link', label: 'Read more', type: 'url', help: 'A page about the album, if there is a good one.' },
    { name: 'pickedOn', label: 'Picked on', type: 'date' },
    { name: 'featured', label: 'Show it larger', type: 'boolean' },
  ],
};

export const collections: CollectionDefinition[] = [picks];
