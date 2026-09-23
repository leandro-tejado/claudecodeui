import { useCallback, useEffect, useRef, useState } from 'react';

import { api, readApiJson } from '@/shared/api';
import type { SalidaInfo } from '@/shared/types';

type UseSalidasListArgs = {
  projectId: string | null;
  /** Bumped by the caller on a turn's `complete` event — see `openPanelSalidasOnce` for the panel-opening half of that same signal. */
  refreshSignal: number;
  /** Only fetches while the panel is actually visible — a closed panel does not poll. */
  enabled: boolean;
};

type UseSalidasListResult = {
  salidas: SalidaInfo[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

/**
 * Loads `GET /api/projects/:projectId/salidas` for the panel, refreshing on:
 * project/session change, the caller's `refreshSignal` (a turn's `complete`),
 * and a manual `refresh()` call (the panel's own button). Requests are
 * cancelled on rapid changes so a slow reply from a stale project can never
 * clobber a list already showing the new one.
 */
export function useSalidasList({ projectId, refreshSignal, enabled }: UseSalidasListArgs): UseSalidasListResult {
  const [salidas, setSalidas] = useState<SalidaInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualTrigger, setManualTrigger] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => setManualTrigger((value) => value + 1), []);

  useEffect(() => {
    if (!enabled || !projectId) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const response = await api.salidas.list(projectId);
        const payload = await readApiJson<{ success: true; data: SalidaInfo[] }>(response);
        if (!controller.signal.aborted) {
          setSalidas(payload.data);
        }
      } catch (loadError: unknown) {
        if (loadError instanceof Error && loadError.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshSignal/manualTrigger are pure re-fetch triggers, not data the effect reads.
  }, [projectId, enabled, refreshSignal, manualTrigger]);

  return { salidas, loading, error, refresh };
}
