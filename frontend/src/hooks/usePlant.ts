// src/hooks/usePlant.ts
import { useEffect, useState, useCallback } from 'react';
import { getPlantState, initPlant, completePlantTask } from '../services/plant';

export type PlantState = {
  user_id: string;
  phase: 1 | 2 | 3 | 4;
  variant: 'POT' | '2A' | '2B' | '3A' | '3B' | '3C' | '3D' |
           '4A' | '4B' | '4C' | '4D' | '4E' | '4F' | '4G' | '4H';
  tasks_completed_since_phase: number;
  asset_filename: string;
  last_updated: string;
};

export function usePlant() {
  const [plant, setPlant] = useState<PlantState | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setErr(null);
      const p = await getPlantState();
      setPlant(p);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load plant');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await initPlant(); // idempotent
      } catch {
        /* ignore */
      }
      await refresh();
    })();
  }, [refresh]);

  const markTaskComplete = useCallback(async (taskId?: string) => {
    const res = await completePlantTask(taskId);
    setPlant(res.plant);
    return res.advanced;
  }, []);

  return { plant, loading, err, refresh, markTaskComplete };
}
