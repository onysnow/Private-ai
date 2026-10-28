// Issue #41: the one way a form handles bad input. A Zod schema checks what the
// reporter typed before anything is sent (shown under the field, on leaving it);
// what the server still refuses comes back on the same fields (a 422 names them,
// lib/api-client.ts fieldErrorsOf), and anything else as one message for the whole
// form, which stays open with the reporter's input intact. The pattern, and when
// to use it: docs/frontend/react-hook-form-zod.md.
import {zodResolver} from '@hookform/resolvers/zod';
import {useForm} from 'react-hook-form';
import type {FieldPath, FieldValues, Resolver, UseFormProps, UseFormReturn} from 'react-hook-form';
import type {BaseSyntheticEvent} from 'react';
import type {ZodType} from 'zod';

import {ApiHttpError, errorMessage} from './api-client';

/** useForm checked by a Zod schema, on leaving each field and again on submit. */
export function useZodForm<T extends FieldValues>(schema: ZodType<T, FieldValues>,
  props: Omit<UseFormProps<T>, 'resolver'> = {}): UseFormReturn<T> {
  // zod 4's resolver types a schema's input apart from its output; the form holds the output (T) throughout.
  return useForm<T>({mode: 'onBlur', ...props, resolver: zodResolver(schema) as unknown as Resolver<T>});
}

/** Is a field rendered at this dotted path (a FormField registered it), so an error set on it is seen?
 * A value with no field of its own (a default no control shows, a list whose rows have the fields)
 * is not: its error goes to the form's own message. */
function isRendered<T extends FieldValues>(form: UseFormReturn<T>, path: string): path is FieldPath<T> {
  if (!path) return false;
  // react-hook-form keeps registered fields in control._fields, each leaf carrying _f.
  let at: unknown = (form.control as unknown as {_fields: unknown})._fields;
  for (const part of path.split('.')) {
    if (typeof at !== 'object' || at === null || !(part in at)) return false;
    at = (at as Record<string, unknown>)[part];
  }
  return typeof at === 'object' && at !== null && '_f' in at;
}

/** Puts a failed save back on the form: each field the server refused on that field
 * (renamed through `paths` where the request calls it something else), the rest as
 * the form's own message. Returns true when at least one field took its error. */
export function showServerErrors<T extends FieldValues>(form: UseFormReturn<T>, error: unknown, fallback: string,
  paths: Record<string, FieldPath<T>> = {}): boolean {
  const left: string[] = [];
  let placed = false;
  for (const f of error instanceof ApiHttpError ? error.fieldErrors : []) {
    const path = paths[f.path] ?? f.path;
    if (isRendered(form, path)) {
      form.setError(path, {type: 'server', message: f.message}, {shouldFocus: !placed});
      placed = true;
    } else {
      left.push(f.path ? `${f.path}: ${f.message}` : f.message);
    }
  }
  if (!placed || left.length) {
    form.setError('root', {type: 'server', message: left.length ? left.join('; ')
      : error instanceof ApiHttpError ? error.detail : errorMessage(error, fallback)});
  }
  return placed;
}

/** The submit handler: checks the form, calls `save` with its values, and on a
 * failure shows it on the form instead of throwing. */
export function submitWith<T extends FieldValues>(form: UseFormReturn<T>, save: (values: T) => Promise<void>,
  fallback: string, paths?: Record<string, FieldPath<T>>): (event?: BaseSyntheticEvent) => Promise<void> {
  return form.handleSubmit(async values => {
    try {
      await save(values);
    } catch (error) {
      showServerErrors(form, error, fallback, paths);
    }
  });
}
