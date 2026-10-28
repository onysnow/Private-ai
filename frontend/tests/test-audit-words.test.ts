import {describe, expect, it} from 'vitest';

import {describeRequest, wasRefused} from '../lib/audit-words';

describe('the security log in plain words', () => {
  it('says what a request did', () => {
    expect(describeRequest('GET', '/api/investigations/abc-123/export')).toBe('downloaded a backup of a case');
    expect(describeRequest('DELETE', '/api/investigations/abc-123')).toBe('deleted a case');
    expect(describeRequest('POST', '/api/connectors/opensanctions/search')).toBe('searched an outside service');
    expect(describeRequest('PUT', '/api/settings/connectors/aleph/credential')).toBe('saved a service key');
  });
  it('does not guess at a path it does not know', () => {
    expect(describeRequest('POST', '/api/something/new')).toBe('changed something in the app');
    expect(describeRequest('GET', '/api/something/new?x=1')).toBe('opened a page of the app');
  });
  it('knows a refusal by its event or its status', () => {
    expect(wasRefused('access_denied', 200)).toBe(true);
    expect(wasRefused('api_request', 403)).toBe(true);
    expect(wasRefused('api_request', 200)).toBe(false);
  });
});
