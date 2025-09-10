// src/services/api.ts
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

// Backend uses states: Exploring | Planning | Doing | Done
export type BackendTask = {
  id: string;
  userId: string;
  title: string;
  notes?: string;
  priority?: number | string;
  dueDate?: string;
  state: 'Exploring' | 'Planning' | 'Doing' | 'Done';
  createdAt?: any;
  updatedAt?: any;
  isArchived: boolean;
};

// ---- Tasks API ----
export async function listTasks(params?: {
  state?: BackendTask['state'];
  orderBy?: 'createdAt' | 'updatedAt' | 'priority' | 'dueDate';
  limit?: number;
  startAfter?: string;
  dueBefore?: string;
  dueAfter?: string;
}): Promise<BackendTask[]> {
  const qs = new URLSearchParams();
  if (params?.state) qs.set('state', params.state);
  if (params?.orderBy) qs.set('orderBy', params.orderBy);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.startAfter) qs.set('startAfter', params.startAfter);
  if (params?.dueBefore) qs.set('dueBefore', params.dueBefore);
  if (params?.dueAfter) qs.set('dueAfter', params.dueAfter);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/tasks${query}`);
}

export async function createTask(body: {
  title: string;
  state?: BackendTask['state'];
  notes?: string;
  priority?: number | string;
  dueDate?: string;
}): Promise<BackendTask> {
  return apiFetch('/tasks', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateTask(
  id: string,
  updates: Partial<Pick<BackendTask, 'title' | 'state' | 'notes' | 'priority' | 'dueDate' | 'isArchived'>>
): Promise<BackendTask> {
  return apiFetch(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteTask(id: string): Promise<{ deleted: true; id: string }> {
  return apiFetch(`/tasks/${id}`, { method: 'DELETE' });
}
