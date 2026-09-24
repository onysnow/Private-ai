// @vitest-environment jsdom
// Issue #41: full RHF+Zod form lifecycle coverage for the first concrete
// component built on it (EntityForm) -- entry/validation, edit via
// defaultValues+reset, and create/update submit including the
// error-handling path when onSubmit rejects.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {EntityForm} from '../components/entity-form';
import type {CanonicalEntity} from '../lib/api-types';

afterEach(() => {
  cleanup();
});

describe('EntityForm', () => {
  it('rejects an empty submit with field-level validation messages and does not call onSubmit', async () => {
    const onSubmit = vi.fn();
    render(<EntityForm onSubmit={onSubmit} />);

    await userEvent.setup().click(screen.getByRole('button', {name: 'Create entity'}));

    expect(await screen.findByText('Caption is required')).toBeInTheDocument();
    expect(screen.getByText('FollowTheMoney schema is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('creates an entity from scratch, splitting a multi-line property value into an array', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<EntityForm onSubmit={onSubmit} />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('Entity name'), 'Kestrelwood Holdings Ltd');
    await user.type(screen.getByPlaceholderText('Person, Organization, Company…'), 'Company');
    await user.click(screen.getByRole('button', {name: 'Add property'}));
    await user.type(screen.getByPlaceholderText('incorporation_date'), 'aliases');
    await user.type(screen.getByPlaceholderText('One value per line, or comma-separated'), 'Kestrelwood Holdings LLC\nKestrelwood Ltd');

    await user.click(screen.getByRole('button', {name: 'Create entity'}));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      caption: 'Kestrelwood Holdings Ltd',
      schema: 'Company',
      properties: {aliases: ['Kestrelwood Holdings LLC', 'Kestrelwood Ltd']},
    });
  });

  it('rejects a property with an empty value list', async () => {
    const onSubmit = vi.fn();
    render(<EntityForm onSubmit={onSubmit} />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('Entity name'), 'Kestrelwood Holdings Ltd');
    await user.type(screen.getByPlaceholderText('Person, Organization, Company…'), 'Company');
    await user.click(screen.getByRole('button', {name: 'Add property'}));
    await user.type(screen.getByPlaceholderText('incorporation_date'), 'aliases');
    // Leave the value textarea empty.
    await user.click(screen.getByRole('button', {name: 'Create entity'}));

    expect(await screen.findByText('At least one value is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('populates edit mode from defaultValues and submits an update with the existing id-less payload', async () => {
    const entity: CanonicalEntity = {
      id: 'ent-1',
      caption: 'Kestrelwood Holdings Ltd',
      schema: 'Company',
      properties: {aliases: ['Kestrelwood Holdings LLC']},
    };
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<EntityForm entity={entity} onSubmit={onSubmit} />);

    expect(screen.getByPlaceholderText('Entity name')).toHaveValue('Kestrelwood Holdings Ltd');
    expect(screen.getByPlaceholderText('Person, Organization, Company…')).toHaveValue('Company');
    expect(screen.getByPlaceholderText('incorporation_date')).toHaveValue('aliases');
    expect(screen.getByPlaceholderText('One value per line, or comma-separated')).toHaveValue('Kestrelwood Holdings LLC');
    expect(screen.getByRole('button', {name: 'Save changes'})).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', {name: 'Save changes'}));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      caption: 'Kestrelwood Holdings Ltd',
      schema: 'Company',
      properties: {aliases: ['Kestrelwood Holdings LLC']},
    });
  });

  it('re-populates the form when a different entity is passed in without remounting', async () => {
    const entityA: CanonicalEntity = {id: 'ent-1', caption: 'Entity A', schema: 'Person', properties: {}};
    const entityB: CanonicalEntity = {id: 'ent-2', caption: 'Entity B', schema: 'Organization', properties: {}};
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const {rerender} = render(<EntityForm entity={entityA} onSubmit={onSubmit} />);
    expect(screen.getByPlaceholderText('Entity name')).toHaveValue('Entity A');

    rerender(<EntityForm entity={entityB} onSubmit={onSubmit} />);

    await waitFor(() => expect(screen.getByPlaceholderText('Entity name')).toHaveValue('Entity B'));
    expect(screen.getByPlaceholderText('Person, Organization, Company…')).toHaveValue('Organization');
  });

  it('surfaces a rejected submit as a root-level error and keeps the form open for retry', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Entity caption already exists in this investigation'));
    render(<EntityForm onSubmit={onSubmit} />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('Entity name'), 'Kestrelwood Holdings Ltd');
    await user.type(screen.getByPlaceholderText('Person, Organization, Company…'), 'Company');
    await user.click(screen.getByRole('button', {name: 'Create entity'}));

    expect(await screen.findByRole('alert')).toHaveTextContent('Entity caption already exists in this investigation');
    // The form stays populated/open -- not reset or unmounted on failure.
    expect(screen.getByPlaceholderText('Entity name')).toHaveValue('Kestrelwood Holdings Ltd');
  });

  it('calls onCancel when the Cancel button is clicked and does not call onSubmit', async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(<EntityForm onSubmit={onSubmit} onCancel={onCancel} />);

    await userEvent.setup().click(screen.getByRole('button', {name: 'Cancel'}));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('removes a property row via its Remove button', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<EntityForm onSubmit={onSubmit} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', {name: 'Add property'}));
    expect(screen.getByPlaceholderText('incorporation_date')).toBeInTheDocument();

    await user.click(screen.getByRole('button', {name: 'Remove property 1'}));

    expect(screen.queryByPlaceholderText('incorporation_date')).not.toBeInTheDocument();
  });
});
