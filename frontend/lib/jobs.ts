// Follow a background job (ADR-0004) until it finishes. The API answers an
// upload as soon as the file is saved; reading it happens in a job, and the
// screen polls GET /api/jobs/{id} for progress and the outcome.
import type {ApiClient} from './api-client';
import type {BackgroundJob} from './api-types';
import {isBackgroundJob} from './api-validate';

export type WaitOptions={intervalMs?:number,timeoutMs?:number,signal?:AbortSignal,sleep?:(ms:number)=>Promise<void>};

const defaultSleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));

export async function waitForJob(client:ApiClient,jobId:string,onUpdate?:(job:BackgroundJob)=>void,options:WaitOptions={}):Promise<BackgroundJob>{
  const {intervalMs=1000,timeoutMs=30*60*1000,signal,sleep=defaultSleep}=options;
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
