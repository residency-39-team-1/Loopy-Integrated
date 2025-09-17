// src/api/dopamine.ts
import { getIdToken } from '../services/authToken'; // your helper to fetch Firebase ID token
const BASE = process.env.EXPO_PUBLIC_API_BASE || 'http://10.0.2.2:5001';

// Fetch current plant state
export async function getPlantState(userId: string) {
  const url = `${BASE}/dopamine/state?user_id=${encodeURIComponent(userId)}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`state ${res.status}`);
  const data = await res.json();
  return data; // { ok: true, plant: {...} }
}

// Notify backend of a completed task
export async function notifyTaskComplete(
  userId: string,
  taskId?: string,
  points = 1
) {
  const token = await getIdToken();
  const res = await fetch(`${BASE}/dopamine/task-complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`, // backend checks ID token if needed
    },
    body: JSON.stringify({ user_id: userId, task_id: taskId, points }),
  });
  if (!res.ok) throw new Error(`task-complete ${res.status}`);
  const data = await res.json();
  return data; // { ok: true, advanced: boolean, plant: {...} }
}

// Reset the plant to Phase 1
export async function resetPlant(userId: string) {
  const token = await getIdToken();
  const res = await fetch(`${BASE}/dopamine/reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) throw new Error(`reset ${res.status}`);
  const data = await res.json();
  return data; // { ok: true, plant: {...} }
}
