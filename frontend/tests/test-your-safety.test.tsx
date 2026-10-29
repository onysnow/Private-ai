// @vitest-environment jsdom
// Your safety (features/safety/your-safety.tsx, research §13): signs from the records with no made-up level, the
// questions answered in this browser only (nothing sent), the Textbook notice, the guides opened only after saying where.
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {SafetyNotice, YourSafety, planFrom, readKept, topSign} from '../features/safety/your-safety';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

const SOURCE = {title: 'Data methodology', publisher: 'Committee to Protect Journalists', url: 'https://cpj.org/data-methodology/'};
const question = (id: string, name: string, q: string) => ({id, name, definition: 'd', innocent: ['A rude message is not always a threat'], source: SOURCE, textbook: 't', question: q});
const BODY = {investigation_id: 'inv-1', levels_set: false,
  signs: [{id: 'SA-008', name: 'Story concerns corruption by officials or politically connected people', definition: 'd', innocent: ['Being a PEP is not wrongdoing'],
    source: SOURCE, textbook: 't', evidence: 'From your records: 1 party is a politically exposed person: Ann Example.', level: null, documents: []}],
  questions: [question('SA-013', 'Direct threats or warnings to the investigator', 'Have you been threatened?'),
    question('SA-014', 'Physical surveillance or being followed', 'Have you been followed?')],
  guides: [{title: 'Make a risk assessment', publisher: 'Rory Peck Trust', url: 'https://rorypecktrust.org/get-help/'}]};

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('your safety', () => {
  it('finds the top sign from a yes, and words the plan from the signs', () => {
    expect(topSign(BODY.questions, {'SA-013': 'no', 'SA-014': 'yes'})?.id).toBe('SA-014');
    expect(topSign(BODY.questions, {'SA-013': 'not_sure'})).toBeNull();
    expect(planFrom(BODY.signs, BODY.questions, {'SA-013': 'yes'})).toBe(
      'This plan answers: SA-008 Story concerns corruption by officials or politically connected people; SA-013 Direct threats or warnings to the investigator (you said yes).');
  });

  it('shows signs without a level, keeps answers in this browser only, and raises the notice on a yes', async () => {
    const api = mockApi({'GET /api/investigations/inv-1/your-safety': BODY});
    render(<QueryProvider><YourSafety investigationId="inv-1"/><SafetyNotice investigationId="inv-1" onOpen={() => undefined}/></QueryProvider>);
    expect(await screen.findByText('1 sign about danger to you or your sources')).toBeInTheDocument();
    expect(screen.getByText('level not set')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('radio', {name: 'Yes'})[0]);
    expect(await screen.findAllByRole('status')).toHaveLength(2);
    expect(screen.getByText('2 signs about danger to you or your sources')).toBeInTheDocument();
    expect(readKept('inv-1').answers).toEqual({'SA-013': 'yes'});
    expect(api.calls('POST /api/investigations/inv-1/your-safety')).toHaveLength(0);
    expect(api.unmatched()).toEqual([]);
  });

  it('says where a guide goes before opening it', async () => {
    mockApi({'GET /api/investigations/inv-1/your-safety': BODY});
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<QueryProvider><YourSafety investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Make a risk assessment ↗'}));
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByText(/This opens rorypecktrust.org in your browser/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Open it'}));
    expect(open).toHaveBeenCalledWith('https://rorypecktrust.org/get-help/', '_blank', 'noopener,noreferrer');
  });
});
