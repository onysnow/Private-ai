// Issue #41: the one way a form handles bad input. A Zod schema checks what the
// reporter typed before anything is sent (shown under the field, on leaving it);
// what the server still refuses comes back on the same fields (a 422 names them,
// lib/api-client.ts fieldErrorsOf), and anything else as one message for the whole
// form, which stays open with the reporter's input intact. The pattern, and when
// to use it: docs/frontend/react-hook-form-zod.md.
import {zodResolver} from '@hookform/resolvers/zod';
import {useForm} from 'react-hook-form';
import type {FieldPath, FieldValues, UseFormProps, UseFormReturn} from 'react-hook-form';
import type {BaseSyntheticEvent} from 'react';
import type {ZodType, ZodTypeDef} from 'zod';

import {ApiHttpError, errorMessage} from './api-client';

/** useForm checked by a Zod schema, on leaving each field and again on submit. */
export function useZodForm<T extends FieldValues>(schema: ZodType<T, ZodTypeDef, unknown>,
  props: Omit<UseFormProps<T>, 'resolver'> = {}): UseFormReturn<T> {
  return useForm<T>({mode: 'onBlur', ...props, resolver: zodResolver(schema)});
}

/** Has the form a value at this dotted path (so a server error can be shown on it)? */
function hasField<T extends FieldValues>(form: UseFormReturn<T>, path: string): path is FieldPath<T> {
  if (!path) return false;
  let at: unknown = form.getValues();
  for (const part of path.split('.')) {
    if (typeof at !== 'object' || at === null || !(part in at)) return false;
    at = (at as Record<string, unknown>)[part];
  }
  return true;
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
    if (hasField(form, path)) {
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
