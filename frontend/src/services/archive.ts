// src/services/archive.ts
import auth from '@react-native-firebase/auth';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE?.replace(/\/+$/, '') || 'http://10.0.2.2:5001';

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

export type ArchivedEntry = {
  id: string;
  userId: string;
  refType: 'task' | 'chaos_entry' | 'dopamine_log' | 'daily_session';
  refId: string;
  snapshot: any;
  createdAt: string;
  restoreCount: number;
  restoredAt?: string;
};

export async function createArchive(input: {
  ref_type: string;
  ref_id: string;
  snapshot: any;
}): Promise<ArchivedEntry> {
  return apiFetch('/archive', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listArchived(params: {
  ref_type?: string;
  limit?: number;
  startAfter?: string;
} = {}): Promise<ArchivedEntry[]> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  });
  const query = qs.toString() ? `?${qs.toString()}` : '';
  const items = await apiFetch(`/archive${query}`);
  
  // Filter out items that have been restored
  return items.filter((item: ArchivedEntry) => !item.restoredAt);
}

export async function getArchived(id: string): Promise<ArchivedEntry> {
  return apiFetch(`/archive/${id}`);
}

export async function deleteArchived(id: string): Promise<{ deleted: true; id: string }> {
  return apiFetch(`/archive/${id}`, { method: 'DELETE' });
}

export async function restoreArchived(
  id: string,
  options: {
    mode?: 'merge' | 'replace';
    newId?: string;
    dryRun?: boolean;
  } = {}
): Promise<{
  restored: boolean;
  archiveId: string;
  targetCollection: string;
  targetId: string;
  mode: string;
  diff: {
    added: string[];
    removed: string[];
    changed: Record<string, { from: any; to: any }>;
    unchanged: string[];
  };
  dryRun?: boolean;
}> {
  return apiFetch(`/archive/${id}/restore`, {
    method: 'POST',
    body: JSON.stringify(options),
  });
}
