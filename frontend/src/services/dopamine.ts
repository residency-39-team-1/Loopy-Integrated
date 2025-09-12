// src/services/dopamine.ts
import auth from '@react-native-firebase/auth';

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE?.replace(/\/+$/, '') ||
  'http://10.0.2.2:5001';

async function getIdToken(): Promise<string> {
  const user = auth().currentUser;
  if (!user) throw new Error('Not authenticated');
  
  // Expo 53 fix: Use getIdTokenResult instead of getIdToken
  const result = await user.getIdTokenResult(true);
  return result.token;
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = await getIdToken();
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = (json && (json.error || json.message)) || res.statusText;
    throw new Error(`${res.status} ${msg}`);
  }
  return json;
}

// ---- Types ----
export type DopamineLog = {
  id: string;
  userId: string;
  points: number;
  source: 'task_completed' | 'chaos_entry_created' | 'daily_session_review' | 'manual_reward' | 'plant_task_completed' | 'plant_phase_advanced' | 'plant_init' | 'plant_reset' | 'plant_deleted';
  context: Record<string, any>;
  note?: string;
  createdAt: string;
};

export type PlantState = {
  user_id: string;
  phase: number;
  variant: string;
  tasks_completed_since_phase: number;
  asset_filename: string;
  last_updated: string;
};

export type DopamineSummary = {
  total: number;
  count: number;
  bySource: Record<string, number>;
  window: 'day' | 'week' | 'month';
  start: string;
  end: string;
};

export type TaskCompleteResponse = {
  ok: boolean;
  advanced: boolean;
  plant: PlantState;
};

// ---- Dopamine Logs API ----
export async function createDopamineLog(data: {
  points: number;
  source: DopamineLog['source'];
  context?: Record<string, any>;
  note?: string;
}): Promise<DopamineLog> {
  return apiFetch('/dopamine-logs', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listDopamineLogs(params?: {
  start?: string;
  end?: string;
  limit?: number;
  startAfter?: string;
  source?: DopamineLog['source'];
}): Promise<DopamineLog[]> {
  const qs = new URLSearchParams();
  if (params?.start) qs.set('start', params.start);
  if (params?.end) qs.set('end', params.end);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.startAfter) qs.set('startAfter', params.startAfter);
  if (params?.source) qs.set('source', params.source);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/dopamine-logs${query}`);
}

export async function getDopamineSummary(params?: {
  window?: 'day' | 'week' | 'month';
  date?: string;
  start?: string;
  end?: string;
}): Promise<DopamineSummary> {
  const qs = new URLSearchParams();
  if (params?.window) qs.set('window', params.window);
  if (params?.date) qs.set('date', params.date);
  if (params?.start) qs.set('start', params.start);
  if (params?.end) qs.set('end', params.end);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/dopamine-logs/summary${query}`);
}

// ---- Dopamine Plant API ----
export async function initPlant(userId: string): Promise<{ ok: boolean; plant: PlantState; idempotent?: boolean }> {
  return apiFetch('/dopamine/init', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function getPlantState(userId: string): Promise<{ ok: boolean; plant: PlantState }> {
  return apiFetch(`/dopamine/state?user_id=${userId}`);
}

export async function trackTaskCompletion(
  userId: string,
  taskId?: string,
  points?: number
): Promise<TaskCompleteResponse> {
  return apiFetch('/dopamine/task-complete', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      task_id: taskId,
      points: points || 1,
    }),
  });
}

export async function resetPlant(
  userId: string,
  reason?: string
): Promise<{ ok: boolean; plant: PlantState }> {
  return apiFetch('/dopamine/reset', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      reason: reason,
    }),
  });
}

// ---- Helper Functions ----
export function getAssetPath(filename: string): any {
  // Map backend asset_filename to bundled assets
  const assetMap: Record<string, any> = {
    'plant_phase2_2A.png': require('../../assets/plant/plant_phase2_2A.png'),
    'plant_phase2_2B.png': require('../../assets/plant/plant_phase2_2B.png'),
    'plant_phase3_3A.png': require('../../assets/plant/plant_phase3_3A.png'),
    'plant_phase3_3B.png': require('../../assets/plant/plant_phase3_3B.png'),
    'plant_phase3_3C.png': require('../../assets/plant/plant_phase3_3C.png'),
    'plant_phase3_3D.png': require('../../assets/plant/plant_phase3_3D.png'),
    'plant_phase4_4A.png': require('../../assets/plant/plant_phase4_4A.png'),
    'plant_phase4_4B.png': require('../../assets/plant/plant_phase4_4B.png'),
    'plant_phase4_4C.png': require('../../assets/plant/plant_phase4_4C.png'),
    'plant_phase4_4D.png': require('../../assets/plant/plant_phase4_4D.png'),
    'plant_phase4_4E.png': require('../../assets/plant/plant_phase4_4E.png'),
    'plant_phase4_4F.png': require('../../assets/plant/plant_phase4_4F.png'),
    'plant_phase4_4G.png': require('../../assets/plant/plant_phase4_4G.png'),
    'plant_phase4_4H.png': require('../../assets/plant/plant_phase4_4H.png'),
  };

  // Default to first phase 2 image if not found (no phase 1 POT image available)
  return assetMap[filename] || assetMap['plant_phase2_2A.png'];
}
