// Follow a background job (ADR-0004) until it finishes. The API answers an
// upload as soon as the file is saved; reading it happens in a job, and the
// screen polls GET /api/jobs/{id} for progress and the outcome.
import type {ApiClient} from './api-client';
import type {BackgroundJob} from './api-types';
import {isBackgroundJob} from './api-validate';

export type WaitOptions={intervalMs?:number,timeoutMs?:number,signal?:AbortSignal,sleep?:(ms:number)=>Promise<void>};

const defaultSleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
// The wait between polls when a caller passes none. Tests set a short one so a page test does not
// wait a real second per poll (review B3); called with nothing it goes back to the real wait. Kept on
// globalThis under a registered symbol, so it holds for a copy of this module a test loads afresh.
const POLL_SLEEP=Symbol.for('journalism-workbench.job-poll-sleep');
type Sleep=(ms:number)=>Promise<void>;
export function setJobPollSleep(sleep?:Sleep):void{(globalThis as Record<symbol,Sleep|undefined>)[POLL_SLEEP]=sleep;}
const pollSleep:Sleep=ms=>((globalThis as Record<symbol,Sleep|undefined>)[POLL_SLEEP]??defaultSleep)(ms);

export async function waitForJob(client:ApiClient,jobId:string,onUpdate?:(job:BackgroundJob)=>void,options:WaitOptions={}):Promise<BackgroundJob>{
  const {intervalMs=1000,timeoutMs=30*60*1000,signal,sleep=pollSleep}=options;
  const endpoint=`/api/jobs/${encodeURIComponent(jobId)}`;
  const started=Date.now();
  for(;;){
    const job=await client.object(endpoint,'job',isBackgroundJob,{signal});
    onUpdate?.(job);
    if(job.finished)return job;
    if(Date.now()-started>timeoutMs)throw new Error('Still working after 30 minutes; check the document again later.');
    await sleep(intervalMs);
  }
}

// Plain-language line for a job's current state, for status text.
export function describeJob(job:BackgroundJob):string{
  if(job.status==='succeeded')return job.message||'Done';
  if(job.status==='failed')return `Failed: ${job.error||'unknown error'}`;
  if(job.status==='cancelled')return 'Cancelled';
  if(job.status==='queued')return 'Waiting to start';
  return job.progress!==null&&job.progress>0?`${job.message||'Working'} (${job.progress}%)`:(job.message||'Working');
}
