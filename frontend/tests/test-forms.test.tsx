// @vitest-environment jsdom
// Issue #41: the shared way a form handles bad input (lib/forms.ts). What the
// server refuses field by field (FastAPI's 422) reads in words and lands on the
// field it names; anything else is one message for the whole form, which stays open.
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {z} from 'zod';

import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormRootError} from '../components/ui/form';
import {EntityForm} from '../components/entity-form';
import {ApiClient, ApiHttpError, fieldErrorsOf} from '../lib/api-client';
import {submitWith, useZodForm} from '../lib/forms';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const REFUSED = {detail: [
  {type: 'missing', loc: ['body', 'caption'], msg: 'Field required', input: {}},
  {type: 'value_error', loc: ['body', 'properties', 'amount', 0], msg: 'Value error, not a number', input: 'x'},
]};

function refusing(body: unknown, status = 422): void {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}}));
}

describe('a refused request', () => {
  it('names each field and what is wrong with it, without the request part', () => {
    expect(fieldErrorsOf(REFUSED.detail)).toEqual([
      {path: 'caption', message: 'Field required'},
      {path: 'properties.amount.0', message: 'not a number'},
    ]);
    expect(fieldErrorsOf(['plain words', {loc: 'not a list', msg: 'x'}])).toEqual([]);
  });

  it('reads in words, not as the JSON it came in', async () => {
    refusing(REFUSED);
    const error = await new ApiClient('http://api.test').fetchForGenerated(new Request('http://api.test/api/entities', {method: 'POST', body: '{}'}))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiHttpError);
    expect((error as ApiHttpError).detail).toBe('caption: Field required; properties.amount.0: not a number');
    expect((error as ApiHttpError).fieldErrors).toHaveLength(2);
  });

  it('keeps a string detail as it was, with no field errors', async () => {
    refusing({detail: 'Investigation not found'}, 404);
    const error = await new ApiClient('http://api.test').fetchForGenerated(new Request('http://api.test/api/x')).catch((e: unknown) => e);
    expect((error as ApiHttpError).detail).toBe('Investigation not found');
    expect((error as ApiHttpError).fieldErrors).toEqual([]);
  });
});

const schema = z.object({name: z.string().trim().min(1, 'Give it a name'), note: z.string()});
type Values = z.infer<typeof schema>;

function NameForm({save}: {save: (v: Values) => Promise<void>}) {
  const form = useZodForm<Values>(schema, {defaultValues: {name: '', note: ''}});
  return <Form {...form}>
    <form onSubmit={submitWith(form, save, 'Could not save.', {title: 'name'})} noValidate>
      <FormField control={form.control} name="name" render={({field}) => <FormItem>
        <FormLabel>Name</FormLabel><FormControl><input {...field}/></FormControl><FormMessage/></FormItem>}/>
      <FormRootError/>
      <button type="submit">Save</button>
    </form>
  </Form>;
}

const http = (fields: {path: string; message: string}[], detail = 'refused') => new ApiHttpError('/api/x', 422, detail, undefined, fields);

describe('a form on the shared layer', () => {
  it('checks what was typed before anything is sent', async () => {
    const save = vi.fn();
    render(<NameForm save={save}/>);
    await userEvent.setup().click(screen.getByRole('button', {name: 'Save'}));
    expect(await screen.findByText('Give it a name')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
    expect(save).not.toHaveBeenCalled();
  });

  it('puts a field the server refused on that field, through a renamed path, and focuses it', async () => {
    const user = userEvent.setup();
    render(<NameForm save={vi.fn().mockRejectedValue(http([{path: 'title', message: 'Already used in this case'}]))}/>);
    await user.type(screen.getByLabelText('Name'), 'Fernhill');
    await user.click(screen.getByRole('button', {name: 'Save'}));
    expect(await screen.findByText('Already used in this case')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveFocus();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('Name')).toHaveValue('Fernhill');
  });

  it('says a field the form does not have for the whole form', async () => {
    const user = userEvent.setup();
    render(<NameForm save={vi.fn().mockRejectedValue(http([{path: 'investigation_id', message: 'Field required'}]))}/>);
    await user.type(screen.getByLabelText('Name'), 'Fernhill');
    await user.click(screen.getByRole('button', {name: 'Save'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('investigation_id: Field required');
  });

  it('says a value the form has but shows no field for (a default only) for the whole form', async () => {
    const user = userEvent.setup();
    render(<NameForm save={vi.fn().mockRejectedValue(http([{path: 'note', message: 'Too long'}]))}/>);
    await user.type(screen.getByLabelText('Name'), 'Fernhill');
    await user.click(screen.getByRole('button', {name: 'Save'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('note: Too long');
  });

  it('says any other failure for the whole form, in the server\'s words or the fallback', async () => {
    const user = userEvent.setup();
    const {unmount} = render(<NameForm save={vi.fn().mockRejectedValue(new ApiHttpError('/api/x', 409, 'A party with that name exists'))}/>);
    await user.type(screen.getByLabelText('Name'), 'Fernhill');
    await user.click(screen.getByRole('button', {name: 'Save'}));
    expect(await screen.findByRole('alert')).toHaveTextContent(/^A party with that name exists$/);
    unmount();
    render(<NameForm save={vi.fn().mockRejectedValue('no reason')}/>);
    await user.type(screen.getByLabelText('Name'), 'Fernhill');
    await user.click(screen.getByRole('button', {name: 'Save'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save.');
  });
});

describe('EntityForm on the shared layer', () => {
  it('shows the server refusing its caption under the caption', async () => {
    const user = userEvent.setup();
    render(<EntityForm onSubmit={vi.fn().mockRejectedValue(http([{path: 'caption', message: 'String should have at most 255 characters'}]))}/>);
    await user.type(screen.getByLabelText('Caption'), 'Fernhill Ltd');
    await user.type(screen.getByLabelText('FollowTheMoney schema'), 'Company');
    await user.click(screen.getByRole('button', {name: 'Create entity'}));
    expect(await screen.findByText('String should have at most 255 characters')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says a refused property list, which has no message of its own, for the whole form', async () => {
    const user = userEvent.setup();
    render(<EntityForm onSubmit={vi.fn().mockRejectedValue(http([{path: 'properties', message: 'Input should be a valid dictionary'}]))}/>);
    await user.type(screen.getByLabelText('Caption'), 'Fernhill Ltd');
    await user.type(screen.getByLabelText('FollowTheMoney schema'), 'Company');
    await user.click(screen.getByRole('button', {name: 'Create entity'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('properties: Input should be a valid dictionary');
  });
});
