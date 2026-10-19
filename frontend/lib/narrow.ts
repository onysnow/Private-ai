// A reply from the generated client, narrowed to a page's own type. The
// generated client checks every reply against the API schema (zod); where the
// schema leaves a part open (an extraction candidate's payload is a map of
// anything), a page that reads that part keeps its own guard
// (lib/api-validate.ts), so a reply it cannot read fails in plain words, as
// ApiClient.object and ApiClient.array did.
import {ApiPayloadError} from './api-validate';

type Guard<T> = (value: unknown) => value is T;

export function narrowed<T>(value: unknown, guard: Guard<T>, endpoint: string, name: string): T {
  if (!guard(value)) throw new ApiPayloadError(endpoint, `${name} has an unexpected shape`);
  return value;
}

export function narrowedList<T>(value: unknown[], guard: Guard<T>, endpoint: string, name: string): T[] {
  value.forEach((item, index) => { if (!guard(item)) throw new ApiPayloadError(endpoint, `${name}[${index}] has an unexpected shape`); });
  return value as T[];
}
