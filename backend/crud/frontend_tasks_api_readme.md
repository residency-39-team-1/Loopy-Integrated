# README – Using `tasks.py` (Frontend Integration)

**Context**  
This document shows React Native devs how to call the Tasks API exposed by the Flask backend. It maps to the Task flows/cards in the Flowboard. Fields are in **camelCase** to match the RN app.

---

## 🔑 Auth
All requests must include the signed-in user’s **Firebase ID token**:

```ts
import auth from '@react-native-firebase/auth';
const idToken = await auth().currentUser?.getIdToken();
```

Use it in the header for every call:
```http
Authorization: Bearer <idToken>
Content-Type: application/json
```

---

## 🧱 Data Model (client-facing)

**Task document (Firestore `tasks` collection)**

```json
{
  "id": "<docId>",           // returned by API
  "userId": "<uid>",
  "title": "Write unit tests",
  "notes": "Cover edge cases",
  "priority": 2,             // number or enum (your choice)
  "dueDate": "2025-08-20",   // ISO string or timestamp; keep consistent
  "state": "Exploring",      // Exploring | Planning | Doing | Done
  "createdAt": "<server time>",
  "updatedAt": "<server time>"
}
```

**Allowed `state` values:** `Exploring`, `Planning`, `Doing`, `Done`

---

## 🌐 Endpoints

### Create task
`POST /tasks`

**Body**
```json
{ "title": "Write unit tests", "notes": "cover edge cases", "priority": 2, "dueDate": "2025-08-20", "state": "Planning" }
```

**Response: 201**
```json
{ "id": "...", "userId": "...", "title": "...", "state": "Planning", "createdAt": "...", "updatedAt": "..." }
```

---

### Get task by id
`GET /tasks/:taskId`

**Response: 200**
```json
{ "id": "...", "userId": "...", "title": "...", "state": "Doing", ... }
```

---

### Update task (partial)
`PATCH /tasks/:taskId`

**Body (any subset)**
```json
{ "title": "Write unit tests (v2)", "state": "Doing", "priority": 3 }
```

**Response: 200**
```json
{ "id": "...", "title": "Write unit tests (v2)", "state": "Doing", "updatedAt": "..." }
```

---

### Delete task
`DELETE /tasks/:taskId`

**Response: 200**
```json
{ "deleted": true, "id": "<taskId>" }
```

---

### List my tasks (filters + pagination)
`GET /tasks?state=Doing&orderBy=createdAt&limit=25&startAfter=<taskId>&dueBefore=2025-08-31&dueAfter=2025-08-01`

**Query params**
- `state` *(optional)*: filter by state
- `orderBy` *(optional)*: one of `createdAt | updatedAt | priority | dueDate` (default `createdAt`)
- `limit` *(optional)*: default 50, max 100
- `startAfter` *(optional)*: for pagination; pass the **last task id** from the previous page
- `dueBefore` / `dueAfter` *(optional)*: ISO/timestamp range filters on `dueDate`

**Response: 200**
```json
[ { "id": "...", "title": "...", "state": "Doing" }, ... ]
```

---

## 🧪 Example RN calls

Shared helper:
```ts
// src/lib/api.ts
import auth from '@react-native-firebase/auth';
const API_BASE = __DEV__ ? 'http://127.0.0.1:8000' : 'https://<prod-host>';

export async function authFetch(path: string, init: RequestInit = {}) {
  const u = auth().currentUser;
  if (!u) throw new Error('Not signed in');
  const token = await u.getIdToken();
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
}
```

Create:
```ts
export async function createTask(input: Partial<{title: string; notes: string; priority: number; dueDate: string; state: string;}>) {
  const res = await authFetch('/tasks', { method: 'POST', body: JSON.stringify(input) });
  if (!res.ok) throw new Error(`createTask failed: ${res.status}`);
  return res.json();
}
```

Get:
```ts
export async function getTask(taskId: string) {
  const res = await authFetch(`/tasks/${taskId}`);
  if (!res.ok) throw new Error(`getTask failed: ${res.status}`);
  return res.json();
}
```

Update:
```ts
export async function updateTask(taskId: string, updates: Partial<{title: string; notes: string; priority: number; dueDate: string; state: string;}>) {
  const res = await authFetch(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(updates) });
  if (!res.ok) throw new Error(`updateTask failed: ${res.status}`);
  return res.json();
}
```

Delete:
```ts
export async function deleteTask(taskId: string) {
  const res = await authFetch(`/tasks/${taskId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteTask failed: ${res.status}`);
  return res.json();
}
```

List:
```ts
export async function listTasks(params: { state?: string; orderBy?: string; startAfter?: string; limit?: number; dueBefore?: string; dueAfter?: string } = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null) p.set(k, String(v));
  const res = await authFetch(`/tasks?${p.toString()}`);
  if (!res.ok) throw new Error(`listTasks failed: ${res.status}`);
  return res.json();
}
```

Optional React hook:
```ts
// src/hooks/useTasks.ts
import { useEffect, useState, useCallback } from 'react';
import { createTask, getTask, updateTask, deleteTask, listTasks } from '../services/tasks';

export function useTasks(initialState?: string) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    try { setLoading(true); setItems(await listTasks({ state: initialState })); }
    catch (e) { setError(e); }
    finally { setLoading(false); }
  }, [initialState]);

  useEffect(() => { refresh(); }, [refresh]);

  return {
    items, loading, error, refresh,
    add: async (title: string, notes = '') => { await createTask({ title, notes }); await refresh(); },
    update: async (id: string, updates: any) => { await updateTask(id, updates); await refresh(); },
    remove: async (id: string) => { await deleteTask(id); await refresh(); },
  };
}
```

---

## 🎨 UI/UX Notes
- **Create flow**: Task modal should at least require `title`; default `state = "Exploring"`.
- **State chips**: Use the 4 states consistently (Exploring/Planning/Doing/Done) in filters and badges.
- **Ordering**: Default lists to `orderBy=createdAt` ascending or descending based on your UI spec.
- **Pagination**: Infinite scroll → pass `startAfter` with the last `task.id` from the current page.
- **Dates**: If you send date strings, keep a single format (ISO `YYYY-MM-DD` recommended) and parse consistently in the UI.
- **Toasts**: show success/error banners on create/update/delete with non-judgmental copy (keep the emotional tone calm).

---

## 🚦 Errors & status codes
- `401 Unauthorized` – sign-in required or token expired.
- `403 Forbidden` – trying to access another user’s task.
- `404 Not Found` – task doesn’t exist.
- `400 Bad Request` – validation errors (empty title, invalid state, etc.).
- `415 Unsupported Media Type` – missing `Content-Type: application/json` on writes.

All errors return JSON: `{ "error": "<message>" }`.

---

## ✅ Checklist to integrate
- [ ] Hook up `authFetch` (or equivalent) in the RN app.
- [ ] Wire TaskCreate form to `POST /tasks`.
- [ ] Use `PATCH /tasks/:id` for edits (don’t overwrite unless intended).
- [ ] Implement `listTasks` with filters and infinite scroll.
- [ ] Show delete confirm, call `DELETE /tasks/:id`.
- [ ] Keep state values and date formats consistent across UI & API.
