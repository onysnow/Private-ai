// @vitest-environment jsdom
// The settings screen says which model answers and whether it runs on this
// computer (Foundation Fixes fix 4), from the same status the AI panel reads.
import {cleanup, render, screen, within} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {mockApi} from '../test-support/mock-api';
import {settingsPaneRoutes, validSettingsStatus} from '../test-support/page-routes';

vi.mock('next/navigation', () => ({useRouter: () => ({push: vi.fn()}), usePathname: () => '/settings'}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function renderSettings(ai: Record<string, unknown>) {
  mockApi({
    'GET /api/settings/status': {...validSettingsStatus, ai: {...validSettingsStatus.ai, ...ai}},
    'GET /api/investigations': [],
    ...settingsPaneRoutes(),
    'GET /api/settings/research': {...(settingsPaneRoutes()['GET /api/settings/research'] as object), ai_enabled: Boolean(ai.enabled)},
  });
  window.history.replaceState(null, '', '/settings#ai');
  vi.resetModules();
  const mod = await import('../app/settings/page');
  const Page = mod.default;
  render(<Page/>);
  await screen.findByRole('heading', {name: 'The model'});
  // The status has arrived once the sidebar shows its value (the page reads it
  // through TanStack Query, which answers a moment after the render).
  await screen.findByRole('button', {name: /^AI and research: /});
}

describe('Settings: AI and research', () => {
  it('names the local model and says it runs on this computer', async () => {
    await renderSettings({enabled: true, provider: 'ollama', provider_key_configured: true, endpoints_callable: true, model: 'qwen2.5:7b', runs_on_this_computer: true,
      authority_suite: {present: true, source: 'onysnow/Authority-System-Suite@b1c71e8', tas_version: '1.12', modules: {presentation_draft: {spec_file: 'PRESENTATION_DRAFT.md', available: true, vendored_tas: false}}, control_surface: {spec_file: 'x', available: true, flags: {}}}});
    expect(within(document.getElementById('st-ai')!).getByText('qwen2.5:7b')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'AI and research: ask first'})).toBeInTheDocument();
    expect(screen.getAllByText(/runs on this computer/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/remote endpoints allowed/)).not.toBeInTheDocument();
    // The rules' name shows; source, version and tier floor are revealed on it.
    expect(within(screen.getByTestId('authority-suite')).getByText('the Authority System Suite').closest('.rv'))
      .toHaveAccessibleDescription('Source b1c71e8 · TAS v1.12. Default source floor: tier D; tier C never counts toward corroboration.');
  });

  it('says when a cloud provider answers, and when remote endpoints are allowed', async () => {
    await renderSettings({enabled: true, provider: 'anthropic', provider_key_configured: true, endpoints_callable: true, model: 'claude-x', runs_on_this_computer: false, remote_endpoint_allowed: true,
      authority_suite: {present: true, source: 'onysnow/Authority-System-Suite@b1c71e8', tas_version: '1.12', modules: {}, control_surface: {spec_file: 'x', available: true, flags: {}}}});
    expect(within(document.getElementById('st-ai')!).getByText('claude-x')).toBeInTheDocument();
    expect(screen.getAllByText(/runs on the provider's servers/).length).toBeGreaterThan(0);
    expect(screen.getByText(/remote endpoints allowed/)).toBeInTheDocument();
  });

  it('explains when AI is off', async () => {
    await renderSettings({enabled: false, model: null});
    expect(screen.getByText(/AI reasoning is disabled on this deployment/)).toBeInTheDocument();
    expect(screen.queryByText(/Model:/)).not.toBeInTheDocument();
  });
});
