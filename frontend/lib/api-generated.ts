// Wires the generated API client (lib/generated, from openapi.json) to the
// app's ApiClient: one place adds the login token and turns failures into
// readable errors, for generated and hand-written calls alike
// (Foundation Fixes fix 2). A reply that fails its generated Zod check
// becomes an ApiPayloadError, as the hand-written validators do.
import {ZodError} from 'zod';

import type {ApiClient} from './api-client';
import {ApiPayloadError} from './api-validate';
import {client} from './generated/client.gen';

export function connectGeneratedClient(api:ApiClient):void{
  // The generated client always calls fetch with a single Request.
  const viaApiClient=((input:RequestInfo|URL,init?:RequestInit)=>api.fetchForGenerated(input instanceof Request?input:new Request(input,init))) as typeof fetch;
  client.setConfig({baseUrl:api.baseUrl,fetch:viaApiClient,throwOnError:true});
  client.interceptors.error.use((error,_response,request)=>{
    if(error instanceof ZodError){
      const path=request?new URL(request.url).pathname:'(unknown endpoint)';
      const issue=error.issues[0];
      return new ApiPayloadError(path,`${issue?.path.join('.')||'reply'}: ${issue?.message||'unexpected shape'}`);
    }
    return error;
  });
}

export {client as generatedClient};
