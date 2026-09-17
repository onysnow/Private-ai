import {ApiClient} from '../lib/api-client';
import {expect, test} from 'vitest';

type Seen={authorization:string|null, body:string|null};
const seen:Seen[]=[];
(globalThis as unknown as {fetch:typeof fetch}).fetch=async (_input:RequestInfo|URL, init?:RequestInit)=>{
  const headers=new Headers(init?.headers||{});
  seen.push({authorization:headers.get('authorization'),body:typeof init?.body==='string'?init.body:null});
  return new Response(JSON.stringify({ok:true}),{status:200,headers:{'content-type':'application/json'}});
};

test('ApiClient auth fixtures', async ()=>{
  seen.length=0;
  const explicitAuthorization='custom-auth-header';
  const token='unit-test-token';
  const client=new ApiClient('https://example.test');
  await client.unknown('/api/one');
  expect(seen[0].authorization).toBeNull();
  client.setAuthToken(`  ${token}  `);
  expect(client.hasAuthToken()).toBe(true);
  await client.unknown('/api/two',{method:'POST',body:{x:1}});
  const [scheme, receivedToken, ...extraParts]=(seen[1].authorization??'').split(' ');
  expect(scheme.toLowerCase()).toBe('bearer');
  expect(receivedToken).toBe(token);
  expect(extraParts.length).toBe(0);
  await client.unknown('/api/three',{headers:{authorization:explicitAuthorization}});
  expect(seen[2].authorization).toBe(explicitAuthorization);
  client.clearAuthToken();
  expect(client.hasAuthToken()).toBe(false);
  await client.unknown('/api/four');
  expect(seen[3].authorization).toBeNull();
});
