// Keep › Safety & data: the plain-words formatting (features/safety/format.ts).
import {beforeAll, describe, expect, it} from 'vitest';

import {ago, bytes, dayLabel, lineLabel, lineState, logTime, plural, privateAiLine} from '../features/safety/format';

beforeAll(() => { process.env.TZ = 'UTC'; });

const NOW = new Date('2026-10-10T11:00:00Z');
const service = (over: Record<string, unknown> = {}) => ({key: 'opensanctions', label: 'OpenSanctions', role: '', host: 'https://api.opensanctions.org', mode: 'on_click', why: '', sent: 8,
  sends: ['name and details'], last: null, counted: true, ...over});

describe('sizes and dates', () => {
  it('writes sizes the way the mockup does', () => {
    expect([bytes(0), bytes(999), bytes(1_000), bytes(4_100_000), bytes(1_400_000_000), bytes(86_500_000)]).toEqual(['0 B', '999 B', '1 kB', '4.1 MB', '1.4 GB', '86.5 MB']);
  });
  it('says how long ago by calendar day', () => {
    expect([ago('2026-10-10T01:00:00', NOW), ago('2026-10-09T23:59:00Z', NOW), ago('2026-10-07T12:00:00', NOW), ago(null, NOW)]).toEqual(['today', 'yesterday', '3 days ago', 'never']);
  });
  it('reads a time with no offset as UTC', () => { expect(dayLabel('2026-10-07T09:15:00')).toBe('7 Oct 2026'); });
  it('shows the log time as the time today, the weekday this week, the date after that', () => {
    expect([logTime('2026-10-10T10:42:00', NOW), logTime('2026-10-07T09:15:00', NOW), logTime('2026-09-20T09:15:00', NOW)]).toEqual(['10:42', 'Wed', '20 Sep']);
  });
  it('pluralises', () => { expect([plural(1, 'stray file'), plural(2, 'stray file'), plural(4812, 'record')]).toEqual(['1 stray file', '2 stray files', '4,812 records']); });
});

describe('the lines to the services', () => {
  it('says what was sent and how many times', () => { expect(lineLabel(service())).toBe('name and details · 8'); });
  it('says why nothing is sent', () => {
    expect(lineLabel(service({mode: 'off', sent: 0, sends: []}))).toBe('nothing (off)');
    expect(lineLabel(service({mode: 'blocked', sent: 0, sends: []}))).toBe('blocked');
    expect(lineLabel(service({sent: 0, sends: []}))).toBe('nothing sent yet');
  });
  it('never shows a zero for a service whose traffic is not logged', () => { expect(lineLabel(service({counted: false, sent: 0, sends: []}))).toBe('not counted yet'); });
  it('draws a used line solid and the rest dotted', () => {
    expect([lineState(service()), lineState(service({sent: 0})), lineState(service({mode: 'off'})), lineState(service({mode: 'blocked'}))]).toEqual(['used', 'idle', 'off', 'blocked']);
  });
});

describe('Private AI', () => {
  const ai = {enabled: true, provider: 'ollama', model: 'qwen2.5', on_this_computer: true, remote_allowed: false};
  it('names where the model runs', () => {
    expect(privateAiLine(ai)).toEqual({title: 'Local model', detail: 'Outside AI is not used'});
    expect(privateAiLine({...ai, on_this_computer: false})).toEqual({title: 'Local model', detail: 'Outside AI not allowed on this server'});
    expect(privateAiLine({...ai, provider: 'anthropic', model: 'claude', on_this_computer: false})).toEqual({title: 'anthropic · claude', detail: 'Outside AI: only when you start a run'});
    expect(privateAiLine({...ai, enabled: false}).title).toBe('Off');
  });
});
