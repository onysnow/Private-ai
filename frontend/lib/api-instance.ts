import {ApiClient} from './api-client';
import {connectGeneratedClient} from './api-generated';

// Single shared client instance, used by the workbench (app/page.tsx) and by
// app/settings/page.tsx. Factored out of page.tsx so a settings-page auth
// change (api.setAuthToken/clearAuthToken) affects the exact same instance
// the workbench fetches through, without pulling the whole workbench page
// module into the /settings route's bundle.
// ?? (not ||): an empty value is meaningful -- it means "same origin", which
// is what the static production build uses (see next.config.mjs).
export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
export const api = new ApiClient(API);

const DEFAULT_API_AUTH_TOKEN = process.env.NEXT_PUBLIC_API_AUTH_TOKEN?.trim() || '';
if (DEFAULT_API_AUTH_TOKEN) api.setAuthToken(DEFAULT_API_AUTH_TOKEN);

// Generated calls (lib/generated) go through this same client.
connectGeneratedClient(api);
