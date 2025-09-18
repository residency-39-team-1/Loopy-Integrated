// src/services/plant.ts
import auth from '@react-native-firebase/auth';
import { apiFetch } from './api'; // export apiFetch in your api.ts if not already

export type PlantState = {
  user_id: string;
  phase: 1 | 2 | 3 | 4;
  variant: 'POT' | '2A' | '2B' | '3A' | '3B' | '3C' | '3D' |
           '4A' | '4B' | '4C' | '4D' | '4E' | '4F' | '4G' | '4H';
  tasks_completed_since_phase: number;
  asset_filename: string;
  last_updated: string;
};

function requireAuthUid(): string {
  const uid = auth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

export async function initPlant(): Promise<PlantState> {
  const user_id = requireAuthUid();
  const res = await apiFetch('/dopamine/init', {
    method: 'POST',
    body: JSON.stringify({ user_id }),
  });
  return res.plant as PlantState;
}

export async function getPlantState(): Promise<PlantState> {
  const user_id = requireAuthUid();
  const params = new URLSearchParams({ user_id });
  const res = await apiFetch(`/dopamine/state?${params.toString()}`);
  return res.plant as PlantState;
}

export async function completePlantTask(task_id?: string): Promise<{
  ok: boolean;
  advanced: boolean;
  plant: PlantState;
}> {
  const user_id = requireAuthUid();
  return apiFetch('/dopamine/task-complete', {
    method: 'POST',
    body: JSON.stringify({ user_id, task_id, points: 1 }),
  });
}

export async function resetPlant(reason?: string): Promise<PlantState> {
  const user_id = requireAuthUid();
  const res = await apiFetch('/dopamine/reset', {
    method: 'POST',
    body: JSON.stringify({ user_id, reason }),
  });
  return res.plant as PlantState;
}