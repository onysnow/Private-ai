// STRUCT-0041 / issue #41: the first concrete Zod schema in the RHF+Zod
// adoption. Mirrors CanonicalEntity's shape from lib/api-types.ts
// ({caption, schema, properties: Record<string,string[]>}).
//
// The form works with one text field per property ("valuesText", one value
// per line or comma-separated) rather than a doubly-nested field array --
// react-hook-form's per-path generics can't cleanly type a field array
// nested inside another field array's dynamic index, and a single text
// field is also simpler for a reporter to use for the common case (most
// properties carry 1-3 values). entityFormValuesToProperties() does the
// split into the API's string[] shape at submit time; splitValuesText()
// and its min-one-usable-value .refine() are what still make this a
// genuine nested/structured-field validation case end to end.
import {z} from 'zod';

export function splitValuesText(raw: string): string[] {
  return raw
    .split(/\r?\n|,/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export const propertyEntrySchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'Property name is required')
    .max(200, 'Property name is too long')
    .regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Use letters, numbers, and underscores, starting with a letter'),
  valuesText: z
    .string()
    .trim()
    .min(1, 'At least one value is required')
    .refine((raw) => splitValuesText(raw).length > 0, 'At least one non-empty value is required'),
});

export const entityFormSchema = z.object({
  caption: z.string().trim().min(1, 'Caption is required').max(500, 'Caption is too long'),
  schema: z.string().trim().min(1, 'FollowTheMoney schema is required').max(200, 'Schema name is too long'),
  properties: z.array(propertyEntrySchema).default([]),
});

export type EntityFormValues = z.infer<typeof entityFormSchema>;
export type PropertyEntryValues = z.infer<typeof propertyEntrySchema>;

/** Converts CanonicalEntity.properties (Record<string,string[]>) into the
 * form's entry-array shape (one line per value). Used to build
 * defaultValues for edit mode. */
export function propertiesToEntityFormEntries(properties: Record<string, string[]> | undefined | null): PropertyEntryValues[] {
  if (!properties) return [];
  return Object.entries(properties)
    .map(([key, values]) => ({key, valuesText: (values || []).map((v) => v.trim()).filter(Boolean).join('\n')}))
    .filter((entry) => entry.valuesText.length > 0);
}

/** Converts the form's validated entry array back into the
 * Record<string,string[]> shape the API expects. Later entries with a
 * duplicate key overwrite earlier ones, matching how a plain object literal
 * with repeated keys behaves. */
export function entityFormValuesToProperties(values: EntityFormValues): {caption: string; schema: string; properties: Record<string, string[]>} {
  const properties: Record<string, string[]> = {};
  for (const entry of values.properties) {
    properties[entry.key] = splitValuesText(entry.valuesText);
  }
  return {caption: values.caption, schema: values.schema, properties};
}
