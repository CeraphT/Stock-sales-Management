import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { NetworkError } from '@/lib/api/client';
import { showAlert } from '@/lib/ui/alertStore';

/**
 * Offline-first read for a screen whose data is also in the local mirror.
 * On focus (and on reload()):
 *  1. `local()` — read the sync-pulled mirror and show it immediately;
 *  2. `remote()` — fetch the authoritative server answer and swap it in;
 *  3. on a NetworkError keep the local data and flag `offline` — no error alert.
 * Any other server error is shown with `errorTitle` (the local data stays).
 *
 * `loading` is true only until SOMETHING is on screen; `refreshing` stays true
 * while the server answer is still in flight on top of local data.
 */
export function useLocalFirst<T>(opts: {
  enabled: boolean;
  local: () => Promise<T>;
  remote: () => Promise<T>;
  errorTitle: string;
  deps: unknown[];
}) {
  const { enabled, errorTitle } = opts;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  // Latest fns without re-subscribing the focus effect on every render.
  const fns = useRef(opts);
  fns.current = opts;
  // Drop answers from a superseded run (e.g. the search text changed meanwhile).
  const runId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++runId.current;
    if (!enabled) {
      setLoading(false);
      return;
    }
    setRefreshing(true);
    let hadLocal = false;
    try {
      const local = await fns.current.local();
      if (id !== runId.current) return;
      setData(local);
      hadLocal = true;
      setLoading(false);
    } catch {
      /* local read failed — the server answer is all we have */
    }
    try {
      const remote = await fns.current.remote();
      if (id !== runId.current) return;
      setData(remote);
      setOffline(false);
    } catch (err) {
      if (id !== runId.current) return;
      if (err instanceof NetworkError) {
        setOffline(true);
      } else if (!hadLocal) {
        showAlert(errorTitle, err instanceof Error ? err.message : 'Something went wrong.');
      }
    } finally {
      if (id === runId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, errorTitle, ...opts.deps]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { data, setData, loading, refreshing, offline, reload };
}
