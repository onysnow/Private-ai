import {ApiPayloadError} from './api-validate';

type Guard<T>=(value:unknown)=>value is T;
type RequestOptions=Omit<RequestInit,'body'> & {body?:unknown, rawBody?:BodyInit};

export class ApiHttpError extends Error {
  constructor(
    public endpoint:string,
    public status:number,
    public detail:string,
    /** A structured detail as sent ({message, document, ...}: an upload's 409 names the document already there). */
    public body?:Record<string,unknown>,
  ){
    super(`${detail} (${status} ${endpoint})`);
    this.name='ApiHttpError';
  }
}

const normalizeEndpoint=(endpoint:string)=>endpoint.startsWith('/')?endpoint:`/${endpoint}`;

async function parseError(response:Response,endpoint:string):Promise<ApiHttpError>{
  let detail=`Request failed with HTTP ${response.status}`;
  let structured:Record<string,unknown>|undefined;
  const type=response.headers.get('content-type')||'';
  try{
    if(type.includes('application/json')){
      const body:unknown=await response.json();
      if(typeof body==='object'&&body!==null&&'detail' in body){
        const value=(body as {detail?:unknown}).detail;
        if(typeof value==='string'&&value.trim())detail=value.trim();
        else if(Array.isArray(value))detail=value.map(x=>typeof x==='string'?x:JSON.stringify(x)).join('; ');
        // A structured detail ({message, document, ...}: an upload's 409 or 422) says it in its message.
        else if(typeof value==='object'&&value!==null&&typeof (value as {message?:unknown}).message==='string'){
          detail=(value as {message:string}).message;
          structured=value as Record<string,unknown>;
        }
      }
    }else{
      const text=(await response.text()).trim();
      if(text)detail=text.slice(0,1000);
    }
  }catch{/* preserve status fallback */}
  return new ApiHttpError(endpoint,response.status,detail,structured);
}

export class ApiClient {
  private authToken='';

  constructor(public baseUrl:string){}

  private basePath():string{
    try{return new URL(this.baseUrl,'http://placeholder.invalid').pathname.replace(/\/+$/,'')}catch{return ''}
  }

  setAuthToken(token:string):void{this.authToken=token.trim()}
  clearAuthToken():void{this.authToken=''}
  hasAuthToken():boolean{return Boolean(this.authToken)}

  private async request(endpoint:string,options:RequestOptions={}):Promise<Response>{
    const path=normalizeEndpoint(endpoint);
    const headers=new Headers(options.headers||{});
    if(this.authToken&&!headers.has('authorization'))headers.set('authorization',`Bearer ${this.authToken}`);
    let body:BodyInit|undefined=options.rawBody;
    if(options.body!==undefined){
      headers.set('content-type','application/json');
      body=JSON.stringify(options.body);
    }
    const response=await fetch(`${this.baseUrl}${path}`,{...options,headers,body});
    if(!response.ok)throw await parseError(response,path);
    return response;
  }

  // The generated client (lib/generated, Foundation Fixes fix 2) sends every
  // call through here, so the login token and error messages work exactly as
  // they do for hand-written calls. See lib/api-generated.ts.
  fetchForGenerated=async(input:Request):Promise<Response>=>{
    const url=new URL(input.url);
    const method=input.method.toUpperCase();
    // The body goes on as the bytes it is (a FormData's too, with the boundary
    // its content-type names). It used to be read as text, which changes the
    // bytes of a zip or a PDF. An empty one is left out, as before.
    const bytes=method==='GET'||method==='HEAD'?undefined:await input.blob();
    // The generated client puts the configured base URL, path prefix and all, in front of each path; request() adds
    // it again, so the prefix comes off here (https://api.example/workbench must not become /workbench/workbench/api/...).
    const prefix=this.basePath();
    const pathname=prefix&&(url.pathname===prefix||url.pathname.startsWith(`${prefix}/`))?url.pathname.slice(prefix.length)||'/':url.pathname;
    return this.request(`${pathname}${url.search}`,{method,headers:new Headers(input.headers),rawBody:bytes&&bytes.size?bytes:undefined,signal:input.signal});
  };

  // The raw response, for a body read as it arrives (the AI run's Server-Sent Events, features/ai/run-stream.ts).
  async stream(endpoint:string,options:RequestOptions={}):Promise<Response>{
    return this.request(endpoint,options);
  }

  async blob(endpoint:string,options:RequestOptions={}):Promise<Blob>{
    return (await this.request(endpoint,options)).blob();
  }

  async unknown(endpoint:string,options:RequestOptions={}):Promise<unknown>{
    const response=await this.request(endpoint,options);
    try{return await response.json()}catch{throw new ApiPayloadError(normalizeEndpoint(endpoint),'response was not valid JSON')}
  }

  async object<T>(endpoint:string,name:string,guard:Guard<T>,options:RequestOptions={}):Promise<T>{
    const value=await this.unknown(endpoint,options);
    if(!guard(value))throw new ApiPayloadError(normalizeEndpoint(endpoint),`${name} has an unexpected shape`);
    return value;
  }

  async array<T>(endpoint:string,name:string,guard:Guard<T>,options:RequestOptions={}):Promise<T[]>{
    const value=await this.unknown(endpoint,options);
    if(!Array.isArray(value))throw new ApiPayloadError(normalizeEndpoint(endpoint),`${name} must be an array`);
    value.forEach((item,index)=>{if(!guard(item))throw new ApiPayloadError(normalizeEndpoint(endpoint),`${name}[${index}] has an unexpected shape`)});
    return value as T[];
  }

  async parsed<T>(endpoint:string,parser:(value:unknown,endpoint:string)=>T,options:RequestOptions={}):Promise<T>{
    const path=normalizeEndpoint(endpoint);
    return parser(await this.unknown(path,options),path);
  }

  async void(endpoint:string,options:RequestOptions={}):Promise<void>{
    await this.request(endpoint,options);
  }
}

export function errorMessage(error:unknown,fallback='Request failed'):string{
  if(error instanceof ApiHttpError||error instanceof ApiPayloadError)return error.message;
  if(error instanceof Error&&error.message)return error.message;
  return fallback;
}

export function isAbortError(error:unknown):boolean{
  return (typeof DOMException!=='undefined'&&error instanceof DOMException&&error.name==='AbortError')||(error instanceof Error&&error.name==='AbortError');
}

