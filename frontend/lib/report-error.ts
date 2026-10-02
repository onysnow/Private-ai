// A failure a panel did not ask to show in its own status line (an API
// reply of the wrong shape, a request that failed outside a form): logged
// for the developer, shown to the reporter as a toast. Shared by the panels
// that moved out of app/page.tsx, which reported these the same way.
import {toast} from 'sonner';

import {errorMessage} from './api-client';

export function reportPayloadError(error: unknown): void {
  console.error(error);
  toast.error(errorMessage(error, 'Unexpected API response error'));
}
