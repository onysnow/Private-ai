// The security log in plain words (research Part 3 §15): a request's method and path become a sentence a reporter can read
// ("downloaded a backup of a case"). The raw method and path stay available under "Technical". A path the table does not know
// is still said honestly ("changed something in the app"), never guessed at.
type Rule = [method: string | null, pattern: RegExp, words: string];

const RULES: Rule[] = [
  ['GET', /^\/api\/investigations\/[^/]+\/export$/, 'downloaded a backup of a case'],
  ['GET', /^\/api\/investigations\/[^/]+\/deletion-preview$/, 'previewed deleting a case'],
  ['DELETE', /^\/api\/investigations\/[^/]+$/, 'deleted a case'],
  ['POST', /^\/api\/investigations$/, 'started a new case'],
  ['PATCH', /^\/api\/investigations\/[^/]+$/, 'changed a case’s name or question'],
  ['POST', /^\/api\/backups\/(inspect|preview)$/, 'looked inside a backup file'],
  ['POST', /^\/api\/backups\/restore$/, 'restored a backup as a separate case'],
  ['POST', /^\/api\/connectors\/[^/]+\/search$/, 'searched an outside service'],
  ['POST', /^\/api\/entities\/[^/]+\/enrich/, 'looked a record up at an outside service'],
  ['PUT', /^\/api\/settings\/connectors\/[^/]+\/credential$/, 'saved a service key'],
  ['DELETE', /^\/api\/settings\/connectors\/[^/]+\/credential$/, 'removed a service key'],
  ['POST', /^\/api\/settings\/security\/users\/[^/]+\/token\/(rotate|revoke)$/, 'changed someone’s access token'],
  ['POST', /^\/api\/settings\/security\/users/, 'added a person who can reach this computer'],
  ['POST', /^\/api\/settings\/security\/audit\/retention$/, 'removed old entries from this log'],
  ['POST', /^\/api\/investigations\/[^/]+\/assistant\//, 'asked the AI about a case'],
  ['POST', /^\/api\/investigations\/[^/]+\/documents|^\/api\/documents/, 'brought a file into a case'],
  ['POST', /^\/api\/investigations\/[^/]+\/drop/, 'brought files into a case'],
  ['POST', /^\/api\/demo/, 'loaded a demo case'],
  ['DELETE', /^\/api\/documents\//, 'removed a file from a case'],
  ['POST', /^\/api\/claims\//, 'changed a claim'],
  ['PATCH', /^\/api\/claims\//, 'changed a claim'],
  ['POST', /^\/api\/leads/, 'added a lead'],
  ['GET', /^\/api\/investigations\/[^/]+\/(stories|writeups)/, 'opened a story'],
];

const READS: Rule[] = [['GET', /^\/api\/investigations$/, 'opened the case list']];

export function describeRequest(method: string, path: string): string {
  const m = method.toUpperCase();
  const bare = path.split('?')[0];
  for (const [rm, pattern, words] of [...RULES, ...READS]) if ((rm === null || rm === m) && pattern.test(bare)) return words;
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS' ? 'opened a page of the app' : 'changed something in the app';
}

/** A request was refused: an access denial, a rate limit, a browser write blocked, a request rejected, or a 401/403/429. */
export function wasRefused(event: string, status: number): boolean {
  return ['access_denied', 'auth_rate_limited', 'browser_write_denied', 'request_rejected'].includes(event) || [401, 403, 429].includes(status);
}
