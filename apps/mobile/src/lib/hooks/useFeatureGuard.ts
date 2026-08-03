import { router } from 'expo-router';
import { useEffect } from 'react';

import { showAlert } from '@/lib/ui/alertStore';

/** Defense-in-depth for the 4 restrictable feature groups (see staff.tsx's
 * permissions editor) — the More menu already hides the entry point for a
 * restricted cashier, but a direct route (deep link, stale nav state) should
 * still bounce out rather than render. The server enforces the same
 * restriction on every write endpoint regardless of whether this fires. */
export function useFeatureGuard(restricted: boolean | undefined) {
  useEffect(() => {
    if (restricted) {
      showAlert("Restricted", "You don't have access to this feature.");
      router.back();
    }
  }, [restricted]);
}
