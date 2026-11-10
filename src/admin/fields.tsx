// One input per field of a collection's definition. The form is generated
// from the definition: this file is the only place that knows how each field
// type is shown.
import { LIMITS, type FieldDefinition } from '../lib/collections/types';

const maxOf = (field: FieldDefinition) =>
  field.type === 'text' ? (field.maxLength ?? LIMITS.text.default) : field.type === 'longtext' ? (field.maxLength ?? LIMITS.longtext.default) : null;

interface FieldProps {
  field: FieldDefinition;
  value: string | boolean;
  error?: string;
  onChange: (value: string | boolean) => void;
}

export function Field({ field, value, error, onChange }: FieldProps) {
  const id = `field-${field.name}`;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const max = maxOf(field);
  const text = typeof value === 'string' ? value : '';
  const length = [...text].length;
  const example = field.type === 'reference' ? `For example: ${field.example}` : field.type === 'url' ? 'A full address, like https://example.com/page' : null;
  const hints = [field.help, example].filter(Boolean).join(' ');
  const described = [hints ? helpId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  const common = { id, name: field.name, 'aria-describedby': described, 'aria-invalid': error ? true : undefined } as const;

  if (field.type === 'image') {
    // Uploads arrive with the image field's own change; until then say so plainly.
    return (
      <div className="field">
        <span className="field__label">{field.label}</span>
        <p className="field__help">Pictures can't be added here yet.</p>
      </div>
    );
  }

  if (field.type === 'boolean') {
    return (
      <div className="field field--tick">
        <input {...common} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        <label htmlFor={id}>{field.label}</label>
        {hints && <p className="field__help" id={helpId}>{hints}</p>}
        {error && <p className="field__error" id={errorId}>{error}</p>}
      </div>
    );
  }

  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {field.label}
        {!field.required && <span className="field__optional"> (optional)</span>}
      </label>
      {hints && <p className="field__help" id={helpId}>{hints}</p>}
      {field.type === 'longtext' ? (
        <textarea {...common} rows={4} value={text} onChange={(e) => onChange(e.target.value)} />
      ) : field.type === 'select' ? (
        <select {...common} value={text} onChange={(e) => onChange(e.target.value)}>
          <option value="">{field.required ? 'Choose one' : 'None'}</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      ) : (
        <input
          {...common}
          type={field.type === 'date' ? 'date' : 'text'}
          inputMode={field.type === 'number' ? 'numeric' : field.type === 'url' ? 'url' : undefined}
          autoComplete="off"
          spellCheck={field.type === 'text'}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {max !== null && (
        <p className={length > max ? 'field__count field__count--over' : 'field__count'}>
          {length} of {max} characters
        </p>
      )}
      {error && <p className="field__error" id={errorId}>{error}</p>}
    </div>
  );
}
