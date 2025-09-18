// src/services/chaos.ts
import auth from '@react-native-firebase/auth';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE?.replace(/\/+$/, '') || 'http://10.0.2.2:5001';

async function getIdToken(): Promise<string> {
  const user = auth().currentUser;
  if (!user) throw new Error('Not authenticated');
  const token = await user.getIdToken();
  return token;
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

export type ChaosEntry = {
  id: string;
  userId: string;
  text: string;
  tags: string[];
  context?: Record<string, any>;
  pinned: boolean;
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
};

export async function createChaos(input: {
  text: string;
  tags?: string[];
  context?: Record<string, any>;
  pinned?: boolean;
  capturedAt?: string;
}): Promise<ChaosEntry> {
  return apiFetch('/chaos', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getChaos(id: string): Promise<ChaosEntry> {
  return apiFetch(`/chaos/${id}`);
}

export async function updateChaos(
  id: string,
  updates: Partial<{
    text: string;
    tags: string[];
    context: Record<string, any>;
    pinned: boolean;
    capturedAt: string;
  }>
): Promise<ChaosEntry> {
  return apiFetch(`/chaos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteChaos(id: string): Promise<{ deleted: true; movedToArchiveId: string }> {
  return apiFetch(`/chaos/${id}`, { method: 'DELETE' });
}

export async function listChaos(params: {
  limit?: number;
  startAfter?: string;
  start?: string;
  end?: string;
  pinned?: boolean;
  tag?: string;
} = {}): Promise<ChaosEntry[]> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  });
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch(`/chaos${query}`);
}