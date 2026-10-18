// Wires the generated API client (lib/generated, from openapi.json) to the
// app's ApiClient: one place adds the login token and turns failures into
// readable errors, for generated and hand-written calls alike
// (Foundation Fixes fix 2). A reply that fails its generated Zod check
// becomes an ApiPayloadError, as the hand-written validators do.
import {ZodError} from 'zod';
import type {ZodType} from 'zod';

import type {ApiClient} from './api-client';
import {ApiPayloadError} from './api-validate';
import {client} from './generated/client.gen';

function payloadError(error: ZodError, endpoint: string): ApiPayloadError {
  const issue = error.issues[0];
  return new ApiPayloadError(endpoint, `${issue?.path.join('.') || 'reply'}: ${issue?.message || 'unexpected shape'}`);
}

export function connectGeneratedClient(api:ApiClient):void{
  // The generated client always calls fetch with a single Request.
  const viaApiClient=((input:RequestInfo|URL,init?:RequestInit)=>api.fetchForGenerated(input instanceof Request?input:new Request(input,init))) as typeof fetch;
  client.setConfig({baseUrl:api.baseUrl,fetch:viaApiClient,throwOnError:true});
  client.interceptors.error.use((error,_response,request)=>{
    if(error instanceof ZodError){
      return payloadError(error, request?new URL(request.url).pathname:'(unknown endpoint)');
    }
    return error;
  });
}

/** The reply check for a call made through ApiClient.parsed instead of the
 * generated client: the file uploads, written when the bridge above read a
 * request's body as text, which a zip or a PDF does not survive (it now passes
 * the bytes on, ApiClient.fetchForGenerated). The check is the same generated
 * Zod schema the client would run, and fails the same way. */
export function checkedReply<T>(schema: ZodType<T>): (value: unknown, endpoint: string) => T {
  return (value, endpoint) => {
    const parsed = schema.safeParse(value);
    if (parsed.success) return parsed.data;
    throw payloadError(parsed.error, endpoint);
  };
}

export {client as generatedClient};
