// How a test waits between polls of a background job (lib/jobs.ts waitForJob; review B3).
import {setJobPollSleep} from '../lib/jobs';

/** The default in tests (test-setup.ts): 10 ms between polls instead of a real second. */
export function fastJobPolls(): void {
  setJobPollSleep(ms => new Promise<void>(resolve => setTimeout(resolve, Math.min(ms, 10))));
}

/** Each poll waits until the test calls the returned step: a test sees the job's state after
 *  each poll, whatever the machine's speed. Put fastJobPolls back after the test. */
export function steppedJobPolls(): () => void {
  const waiting: (() => void)[] = [];
  setJobPollSleep(() => new Promise<void>(resolve => { waiting.push(resolve); }));
  return () => { waiting.splice(0).forEach(resolve => resolve()); };
}
