// frontend/src/services/taskServiceHttp.ts
import auth from '@react-native-firebase/auth';
import type { Task } from '../types/task';
import type {
  TaskService as ITaskService,
  CreateTaskInput,
  UpdateTaskInput,
} from './TaskService.types'; // <-- or adjust to your actual path; see note below

const API_BASE = process.env.EXPO_PUBLIC_API_BASE || 'http://127.0.0.1:5001';

async function getToken(): Promise<string> {
  const user = auth().currentUser;
  if (!user) throw new Error('Not signed in');
  return user.getIdToken();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

function toApiCreate(input: CreateTaskInput) {
  // Backend derives userId from token. We just forward the fields it accepts.
  return {
    title: input.title,
    notes: input.notes ?? null,
    priority: input.priority ?? null,
    dueDate: input.dueDate ?? null, // number (epoch ms) is fine; backend stores as provided
    state: input.state ?? 'Exploring',
  };
}

function toApiUpdate(input: UpdateTaskInput) {
  const u: any = {};
  if (input.title !== undefined) u.title = input.title;
  if (input.notes !== undefined) u.notes = input.notes;
  if (input.priority !== undefined) u.priority = input.priority;
  if (input.dueDate !== undefined) u.dueDate = input.dueDate;
  if (input.state !== undefined) u.state = input.state;
  return u;
}

export const TaskServiceHttp: ITaskService = {
  // The backend uses the auth token to scope by user; userId param is ignored here but kept to satisfy the interface.
  async list(_userId: string): Promise<Task[]> {
    return request<Task[]>(`/tasks?orderBy=createdAt&limit=50`);
  },

  async get(id: string): Promise<Task | null> {
    try {
      return await request<Task>(`/tasks/${id}`);
    } catch (e: any) {
      if (String(e?.message || '').includes('404')) return null;
      throw e;
    }
  },

  async create(_userId: string, input: CreateTaskInput): Promise<Task> {
    const body = toApiCreate(input);
    return request<Task>(`/tasks`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async update(id: string, input: UpdateTaskInput): Promise<Task> {
    const body = toApiUpdate(input);
    return request<Task>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  async remove(id: string): Promise<void> {
    await request<{ deleted: true; id: string }>(`/tasks/${id}`, { method: 'DELETE' });
  },
};

export default TaskServiceHttp;
