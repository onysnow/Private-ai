'use client';

// STRUCT-0041 / issue #41: first concrete demonstration of the full RHF+Zod
// form lifecycle (entry, schema-driven validation incl. nested/structured
// fields, edit via defaultValues/reset, and create/update submit with error
// handling). Used in create mode by app/page.tsx's "Add an entity manually"
// panel, and in edit mode by the dossier panel's "Edit entity" toggle (both
// lazy-loaded). PATCH /api/entities/{id} can rename an entity and add new
// property values, but cannot change its FollowTheMoney schema -- the
// schema field is disabled in edit mode rather than silently discarding an
// edit to it.
import * as React from 'react';
import {useEffect} from 'react';
import {useFieldArray} from 'react-hook-form';

import type {CanonicalEntity} from '@/lib/api-types';
import {
  entityFormSchema,
  entityFormValuesToProperties,
  propertiesToEntityFormEntries,
  type EntityFormInput,
  type EntityFormValues,
} from '@/lib/entity-schema';
import {Button} from '@/components/ui/button';
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormRootError} from '@/components/ui/form';
import {submitWith, useZodForm} from '@/lib/forms';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';

export type EntityFormSubmitPayload = ReturnType<typeof entityFormValuesToProperties>;

export type EntityFormProps = {
  /** Present in edit mode; the form's defaultValues are derived from it and
   * reset() re-populates the form whenever a different entity is passed in
   * (e.g. the reporter selects a different row without the form unmounting). */
  entity?: CanonicalEntity | null;
  /** Called with the validated, API-shaped payload. May reject (e.g. an API
   * error) -- the rejection reason is surfaced as a root-level form error
   * rather than thrown, so the form stays open for the reporter to retry. */
  onSubmit: (payload: EntityFormSubmitPayload) => Promise<void>;
  onCancel?: () => void;
};

const emptyDefaults: EntityFormValues = {caption: '', schema: '', properties: []};

function entityToDefaults(entity: CanonicalEntity | null | undefined): EntityFormValues {
  if (!entity) return emptyDefaults;
  return {
    caption: entity.caption ?? '',
    schema: entity.schema ?? '',
    properties: propertiesToEntityFormEntries(entity.properties),
  };
}

export function EntityForm({entity, onSubmit, onCancel}: EntityFormProps): React.ReactElement {
  const isEdit = Boolean(entity);
  const form = useZodForm<EntityFormValues>(entityFormSchema, {defaultValues: entityToDefaults(entity)});
  const {fields, append, remove} = useFieldArray({control: form.control, name: 'properties'});

  // Edit workflow: re-populate the form from defaultValues whenever the
  // entity being edited changes (including switching from create to edit,
  // or between two different entities without the component remounting).
  useEffect(() => {
    form.reset(entityToDefaults(entity));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity?.id]);

  // A refused save comes back on the field the server names (caption, schema), else for the whole form.
  const handleSubmit = submitWith(form, values => onSubmit(entityFormValuesToProperties(values)),
    'Could not save this entity. Please try again.');

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="caption"
          render={({field}) => (
            <FormItem>
              <FormLabel>Caption</FormLabel>
              <FormControl>
                <Input placeholder="Entity name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="schema"
          render={({field}) => (
            <FormItem>
              <FormLabel>FollowTheMoney schema</FormLabel>
              <FormControl>
                <Input placeholder="Person, Organization, Company…" {...field} disabled={isEdit} />
              </FormControl>
              {isEdit && <p className="text-sm text-muted-foreground">Schema can&apos;t be changed after creation.</p>}
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Properties</span>
            <Button type="button" variant="outline" onClick={() => append({key: '', valuesText: ''})}>
              Add property
            </Button>
          </div>
          {fields.map((field, index) => (
            <div
              className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end"
              key={field.id}
            >
              <FormField
                control={form.control}
                name={`properties.${index}.key` as const}
                render={({field: keyField}) => (
                  <FormItem>
                    <FormLabel>Property name</FormLabel>
                    <FormControl>
                      <Input placeholder="incorporation_date" {...keyField} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`properties.${index}.valuesText` as const}
                render={({field: valuesField}) => (
                  <FormItem>
                    <FormLabel>Value(s)</FormLabel>
                    <FormControl>
                      <Textarea placeholder={'One value per line, or comma-separated'} rows={2} {...valuesField} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="button" variant="outline" onClick={() => remove(index)} aria-label={`Remove property ${index + 1}`}>
                Remove property
              </Button>
            </div>
          ))}
        </div>

        <FormRootError />

        <div className="flex gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {isEdit ? 'Save changes' : 'Create entity'}
          </Button>
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
