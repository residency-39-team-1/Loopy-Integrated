// src/services/api.ts
import auth from '@react-native-firebase/auth';
import { Platform } from 'react-native';

// Determine API base URL based on platform
const getApiBase = () => {
  const envBase = process.env.EXPO_PUBLIC_API_BASE;
  
  if (envBase) {
    return envBase.replace(/\/+$/, '');
  }
  
  // Default fallbacks based on platform
  if (Platform.OS === 'web') {
    return 'http://127.0.0.1:5001';
  } else if (Platform.OS === 'android') {
    // For Android emulator use 10.0.2.2
    // For physical device, this should be your PC's IP
    return 'http://10.0.2.2:5001';
  } else {
    // iOS simulator can use localhost
    return 'http://127.0.0.1:5001';
  }
};

const API_BASE = getApiBase();

async function getIdToken(): Promise<string> {
  const user = auth().currentUser;
  if (!user) throw new Error('Not authenticated');
  const token = await user.getIdToken(); // Remove forceRefresh to use cached token
  console.log('🔐 Token obtained for user:', user.email || user.uid);
  console.log('📍 API_BASE:', API_BASE);
  return token;
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = await getIdToken();
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };
  
  const fullUrl = `${API_BASE}${path}`;
  console.log('🌐 Fetching:', fullUrl);
  
  const res = await fetch(fullUrl, { ...options, headers });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = (json && (json.error || json.message)) || res.statusText;
    console.error('❌ API Error:', {
      status: res.status,
      message: msg,
      url: fullUrl,
      response: json
    });
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
  updates: Partial<Pick<BackendTask, 'title' | 'state' | 'notes' | 'priority' | 'dueDate'>>
): Promise<BackendTask> {
  return apiFetch(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteTask(id: string): Promise<{ deleted: true; id: string }> {
  return apiFetch(`/tasks/${id}`, { method: 'DELETE' });
}
