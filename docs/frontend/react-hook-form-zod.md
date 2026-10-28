# React Hook Form + Zod adoption (issue #41)

Status: infra landed 2026-09-24; the shared layer for bad input (`lib/forms.ts`)
landed 2026-10-19, and the same day the 20 hand-wired forms moved onto it: the
watchlist, before you run (question and theory, a premise, why the settings become
the default), watch the run (why reject), marks (new tag, note, new collection),
case home's question, story (version name, note, thesis, new section, a gate, ready
to run), red flags (set aside on the board, the card and the drawer; what ruled an
innocent explanation out), new-case setup and the record picker. The connections
picker has no typed field and is left as it is.

## What's here

- `components/ui/form.tsx` -- shadcn's standard `Form`/`FormField`/`FormItem`/
  `FormLabel`/`FormControl`/`FormDescription`/`FormMessage` primitives. They
  wrap react-hook-form's `FormProvider`/`Controller` and wire up label
  association, `aria-describedby`, and `aria-invalid` automatically so a call
  site never has to hand-derive ids.
- `components/ui/label.tsx` -- the Radix Label wrapper `form.tsx` depends on.
- `lib/forms.ts` -- the one way a form handles bad input: `useZodForm(schema,
  props)` (useForm with the Zod resolver, checked on leaving each field and on
  submit), `submitWith(form, save, fallback, paths?)` (the submit handler: a
  failed save comes back on the form, never thrown) and `showServerErrors`.
- `lib/api-client.ts` -- a 422 from FastAPI reads in words ("caption: Field
  required"), and `ApiHttpError.fieldErrors` keeps each refused field's path
  (the leading `body`/`query`/`path` dropped) and message.
- `FormRootError` in `components/ui/form.tsx` -- the message for the whole form.
- `lib/entity-schema.ts` + `components/entity-form.tsx` -- the first concrete,
  full-lifecycle example: entry, Zod validation (including a nested/
  structured field -- each property is `{key, valuesText}`, validated and
  then split into the API's `Record<string, string[]>` shape at submit time),
  edit mode via `defaultValues`/`reset()`, and create/update submit with
  error handling.

## The pattern for a new form

1. Define a Zod schema in `lib/<domain>-schema.ts`. Keep the *form's* schema
   shaped for what `<input>`/`<textarea>` elements naturally produce (plain
   strings); do any conversion to the API's request shape in a separate
   `<domain>FormValuesToPayload()` function, not inside the Zod schema itself.
   This keeps validation error messages attached to the field the reporter
   actually sees, even when the wire format is more structured (arrays,
   nested objects) than the form.
2. Build the form component with `useZodForm(schema, {defaultValues})`.
3. For edit mode, accept an optional prop carrying the existing record, derive
   `defaultValues` from it, and `useEffect(() => form.reset(deriveDefaults(entity)), [entity?.id])`
   so switching which record is being edited re-populates the form without
   remounting the component.
4. Wrap fields in `<FormField control={form.control} name="..." render={({field}) => (...)} />`,
   and put the actual input inside `<FormControl>` so it gets the automatic
   aria wiring.
5. Submit with `onSubmit={submitWith(form, save, 'Could not save …')}` and put
   `<FormRootError/>` above the buttons. A field the server refuses lands under
   that field (and takes focus); a field the request names differently is mapped
   with the fourth argument (`{title: 'name'}`); anything else is one message for
   the whole form, in the server's words or the fallback. The form stays open
   with the reporter's input intact.
6. A field array of repeatable structured entries (e.g. this file's
   `properties`) uses `useFieldArray({control: form.control, name: '...'})`.
   Avoid nesting a second `useFieldArray` inside a per-row component keyed off
   a template-literal path (`properties.${index}.values`) -- react-hook-form's
   generics can't cleanly infer that without explicit `useFieldArray<TFieldValues, `template.${number}.path`>`
   type arguments, and even then it's a worse UX than a single delimited text
   field with a `.refine()` that both validates and is later split into the
   array. `entity-form.tsx` took the single-field-plus-refine route for this
   reason.

## A compact form the app styles itself

Most of the converted forms are a field and a button or two in a row or grid of the
app's own CSS (`styles/`), not shadcn's stacked boxes. For those:

- Wrap the field in `FormItemBare` (`components/ui/form.tsx`) instead of `FormItem`:
  it draws no box (display: contents), so the input keeps its place in the form's
  row or grid and its CSS still applies.
- Give `FormMessage` and `FormRootError` the class `field-msg` (app/globals.css):
  plain words in the status red. Add `next-line` when the form is a row or a grid of
  columns: the message then takes a line of its own under the row, so nothing in
  the row moves when it shows.
- Pass `mode: 'onSubmit'` to `useZodForm`: checked on leaving the field, an empty
  box (often one that opens focused, a reason asked in place) would say "Write why
  first." as soon as the reporter clicks away, and the message could move Cancel
  under the pointer. After a first submit each change is checked again, so the
  message goes as soon as they type. A full form (new-case setup, EntityForm) keeps
  the default, checked on leaving each field.
- The submit button is not disabled when the field is empty (only while saving):
  pressing it is how the reporter finds out what is missing.
- Where a mutation's error was also shown elsewhere on the screen, the form's save
  resets that mutation on failure (or the other message leaves it out), so the
  failure shows once, in the form.

## Wiring a converted section into `page.tsx`

Not part of this issue. When that follow-on work happens, prefer converting
one panel at a time (matching the shadcn migration's own strategy), keep
existing state/handlers where reasonable, and reuse this file's pattern
rather than inventing a new one per form.
