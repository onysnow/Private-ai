import {ApiClient} from '../lib/api-client';

type Seen={authorization:string|null, body:string|null};
const seen:Seen[]=[];
(globalThis as unknown as {fetch:typeof fetch}).fetch=async (_input:RequestInfo|URL, init?:RequestInit)=>{
  const headers=new Headers(init?.headers||{});
  seen.push({authorization:headers.get('authorization'),body:typeof init?.body==='string'?init.body:null});
  return new Response(JSON.stringify({ok:true}),{status:200,headers:{'content-type':'application/json'}});
};

async function run(){
  const client=new ApiClient('https://example.test');
  await client.unknown('/api/one');
  if(seen[0].authorization!==null)throw new Error('unauthenticated request unexpectedly had auth');
  client.setAuthToken('  secret-token  ');
  if(!client.hasAuthToken())throw new Error('token was not retained in memory');
  await client.unknown('/api/two',{method:'POST',body:{x:1}});
  if(seen[1].authorization!=='Bearer secret-token')throw new Error(`missing centralized auth header: ${seen[1].authorization}`);
  await client.unknown('/api/three',{headers:{authorization:'Bearer explicit'}});
  if(seen[2].authorization!=='Bearer explicit')throw new Error('explicit authorization header was overwritten');
  client.clearAuthToken();
  if(client.hasAuthToken())throw new Error('clearAuthToken did not clear token');
  await client.unknown('/api/four');
  if(seen[3].authorization!==null)throw new Error('cleared token still leaked into request');
  console.log('api-client auth fixtures: 4/4 passed');
}
void run();
