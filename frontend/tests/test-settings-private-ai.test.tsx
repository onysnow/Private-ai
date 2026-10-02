// @vitest-environment jsdom
// The settings screen says which model answers and whether it runs on this
// computer (Foundation Fixes fix 4), from the same status the AI panel reads.
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {mockApi} from '../test-support/mock-api';
import {validSettingsStatus} from '../test-support/page-routes';

vi.mock('next/navigation', () => ({useRouter: () => ({push: vi.fn()}), usePathname: () => '/settings'}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function renderSettings(ai: Record<string, unknown>) {
  mockApi({
    'GET /api/settings/status': {...validSettingsStatus, ai: {...validSettingsStatus.ai, ...ai}},
    'GET /api/investigations': [],
  });
  vi.resetModules();
  const mod = await import('../app/settings/page');
  const Page = mod.default;
  render(<Page/>);
  await screen.findByText('Private AI');
}

describe('Settings: Private AI', () => {
  it('names the local model and says it runs on this computer', async () => {
    await renderSettings({enabled: true, provider: 'ollama', provider_key_configured: true, endpoints_callable: true, model: 'qwen2.5:7b', runs_on_this_computer: true,
      tas_spec: {present: true, version: '1.9', modules: {presentation_draft: {spec_file: 'PRESENTATION_DRAFT.md', available: true}}, control_surface: {spec_file: 'x', available: true, flags: {}}}});
    expect(screen.getByText('qwen2.5:7b')).toBeInTheDocument();
    expect(screen.getAllByText(/runs on this computer/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/remote endpoints allowed/)).not.toBeInTheDocument();
  });

  it('says when a cloud provider answers, and when remote endpoints are allowed', async () => {
    await renderSettings({enabled: true, provider: 'anthropic', provider_key_configured: true, endpoints_callable: true, model: 'claude-x', runs_on_this_computer: false, remote_endpoint_allowed: true,
      tas_spec: {present: true, version: '1.9', modules: {}, control_surface: {spec_file: 'x', available: true, flags: {}}}});
    expect(screen.getByText('claude-x')).toBeInTheDocument();
    expect(screen.getAllByText(/runs on the provider's servers/).length).toBeGreaterThan(0);
    expect(screen.getByText(/remote endpoints allowed/)).toBeInTheDocument();
  });

  it('explains when AI is off', async () => {
    await renderSettings({enabled: false, model: null});
    expect(screen.getByText(/AI reasoning is disabled on this deployment/)).toBeInTheDocument();
    expect(screen.queryByText(/Model:/)).not.toBeInTheDocument();
  });
});
