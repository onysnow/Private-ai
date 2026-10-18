// lib/jobs.ts: following a background job (ADR-0004) until it finishes.
import {describe, expect, it, vi} from 'vitest';
import {ApiClient} from '../lib/api-client';
import {isBackgroundJob} from '../lib/api-validate';
import {describeJob, waitForJob} from '../lib/jobs';
import type {BackgroundJob} from '../lib/api-types';

const base: BackgroundJob = {
  id: 'job-1', kind: 'extract_document', investigation_id: 'inv-1', subject_type: 'document', subject_id: 'doc-1',
  status: 'queued', finished: false, progress: null, message: 'Waiting to start', error: null, attempts: 0, runner: 'procrastinate',
};

const json = (body: unknown) => new Response(JSON.stringify(body), {status: 200, headers: {'content-type': 'application/json'}});

describe('waitForJob', () => {
  it('polls until the job finishes and reports every state', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(base))
      .mockResolvedValueOnce(json({...base, status: 'running', progress: 40, message: 'Reading'}))
      .mockResolvedValueOnce(json({...base, status: 'succeeded', finished: true, progress: 100, message: 'Document read', attempts: 1}));
    vi.stubGlobal('fetch', fetchMock);
    const seen: string[] = [];
    const sleep = vi.fn().mockResolvedValue(undefined);
    const job = await waitForJob(new ApiClient('http://api'), 'job-1', j => seen.push(j.status), {sleep, intervalMs: 5});
    expect(job.status).toBe('succeeded');
    expect(seen).toEqual(['queued', 'running', 'succeeded']);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe('http://api/api/jobs/job-1');
    vi.unstubAllGlobals();
  });

  it('gives up after the timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => json(base)));
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValueOnce(0).mockReturnValue(10_000);
    await expect(waitForJob(new ApiClient(''), 'job-1', undefined, {timeoutMs: 5_000, sleep: async () => {}})).rejects.toThrow('Still working');
    now.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe('describeJob and isBackgroundJob', () => {
  it('describes each state in plain words', () => {
    expect(describeJob(base)).toBe('Waiting to start');
    expect(describeJob({...base, status: 'running', progress: 0, message: 'Started'})).toBe('Started');
    expect(describeJob({...base, status: 'running', progress: 60, message: 'Reading'})).toBe('Reading (60%)');
    expect(describeJob({...base, status: 'failed', finished: true, error: 'scan unreadable'})).toBe('Failed: scan unreadable');
    expect(describeJob({...base, status: 'cancelled', finished: true})).toBe('Cancelled');
    expect(describeJob({...base, status: 'succeeded', finished: true, message: 'Document read'})).toBe('Document read');
  });

  it('rejects malformed jobs', () => {
    expect(isBackgroundJob(base)).toBe(true);
    expect(isBackgroundJob({...base, status: 'exploded'})).toBe(false);
    expect(isBackgroundJob({...base, finished: 'no'})).toBe(false);
    expect(isBackgroundJob({...base, progress: 'half'})).toBe(false);
    const {attempts: _attempts, ...missing} = base;
    expect(isBackgroundJob(missing)).toBe(false);
  });
});
