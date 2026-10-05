import { useState } from 'react';

import { useTranslation } from '@/lib/i18n/useTranslation';

/** State for a screen showing a cached server answer offline (offline B,
 * see core cachedFetch): pass `setStaleAt` as cachedFetch's onStale, render
 * <OfflineNotice visible={!!staleAt} message={staleMessage} />. */
export function useStaleNotice() {
  const { t } = useTranslation();
  const [staleAt, setStaleAt] = useState<string | null>(null);
  const staleMessage = staleAt ? t('offline.asOf').replace('{date}', new Date(staleAt).toLocaleString()) : undefined;
  return { staleAt, setStaleAt, staleMessage };
}
