# React Hook Form + Zod adoption (issue #41)

Status: infra landed 2026-09-24. `page.tsx`'s existing hand-rolled forms are
untouched -- converting them is separate, deliberately out-of-scope follow-on
work (see MIGRATION_NOTES.md's one-workflow-section-per-PR strategy for the
shadcn migration, which this follows the same way).

## What's here

- `components/ui/form.tsx` -- shadcn's standard `Form`/`FormField`/`FormItem`/
  `FormLabel`/`FormControl`/`FormDescription`/`FormMessage` primitives. They
  wrap react-hook-form's `FormProvider`/`Controller` and wire up label
  association, `aria-describedby`, and `aria-invalid` automatically so a call
  site never has to hand-derive ids.
- `components/ui/label.tsx` -- the Radix Label wrapper `form.tsx` depends on.
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
2. Build the form component with `useForm({resolver: zodResolver(schema),
   defaultValues, mode: 'onBlur'})`.
3. For edit mode, accept an optional prop carrying the existing record, derive
   `defaultValues` from it, and `useEffect(() => form.reset(deriveDefaults(entity)), [entity?.id])`
   so switching which record is being edited re-populates the form without
   remounting the component.
4. Wrap fields in `<FormField control={form.control} name="..." render={({field}) => (...)} />`,
   and put the actual input inside `<FormControl>` so it gets the automatic
   aria wiring.
5. On submit, call the caller-supplied `onSubmit(payload)` inside a try/catch;
   on rejection, `form.setError('root', {message})` rather than throwing, so
   the form stays open with the reporter's input intact and a visible error
   (`form.formState.errors.root?.message`) instead of losing their work.
6. A field array of repeatable structured entries (e.g. this file's
   `properties`) uses `useFieldArray({control: form.control, name: '...'})`.
   Avoid nesting a second `useFieldArray` inside a per-row component keyed off
   a template-literal path (`properties.${index}.values`) -- react-hook-form's
   generics can't cleanly infer that without explicit `useFieldArray<TFieldValues, `template.${number}.path`>`
   type arguments, and even then it's a worse UX than a single delimited text
   field with a `.refine()` that both validates and is later split into the
   array. `entity-form.tsx` took the single-field-plus-refine route for this
   reason.

## Wiring a converted section into `page.tsx`

Not part of this issue. When that follow-on work happens, prefer converting
one panel at a time (matching the shadcn migration's own strategy), keep
existing state/handlers where reasonable, and reuse this file's pattern
rather than inventing a new one per form.
