# README – Chaos Catcher (`chaos_entries`) Frontend Integration

This guide explains how the React Native app should call the Chaos Catcher API. It aligns with the backend blueprint `backend/api/chaos_entries.py` and supports create, read, update, delete, and list with filters/pagination.

---

## 🔑 Auth
All calls require a Firebase **ID token** in headers.

```ts
import auth from '@react-native-firebase/auth';
const token = await auth().currentUser?.getIdToken(true);
```

Headers for every request:
```http
Authorization: Bearer <token>
Content-Type: application/json
```

**Base URL**
- Dev: `http://127.0.0.1:8000`
- Prod: `https://<your-api-host>`

---

## 🧱 Data Model
**Collection:** `chaos_entries`

```json
{
  "id": "<docId>",
  "userId": "<uid>",
  "text": "Raw thought / capture",
  "tags": ["work", "idea"],
  "context": { "source": "quickCapture" },
  "pinned": false,
  "capturedAt": "<timestamp>",
  "createdAt": "<server time>",
  "updatedAt": "<server time>"
}
```

- `text` is **required** on create.
- `tags` is an array of strings.
- `capturedAt` accepts `YYYY-MM-DD` or ISO datetime; if omitted, server sets it.

---

## 🌐 Endpoints

### Create
`POST /chaos`

**Body**
```json
{ "text": "Idea: auto-sort tasks by energy", "tags": ["idea","energy"], "pinned": true }
```

**Response: 201**
```json
{ "id": "...", "text": "...", "pinned": true, "createdAt": "...", ... }
```

### Get by id
`GET /chaos/:id` → `200`

### Update (partial)
`PATCH /chaos/:id`

**Body**
```json
{ "text": "Refined idea", "tags": ["idea"], "pinned": false }
```

**Response: 200**

### Delete (soft delete → Archive)
`DELETE /chaos/:id`

**Response: 200**
```json
{ "deleted": true, "movedToArchiveId": "<archiveId>" }
```

### List (filters + paging)
`GET /chaos?limit=50&startAfter=<id>&start=2025-08-01&end=2025-08-31&pinned=true&tag=idea`

**Query params**
- `limit` (default 50, max 200)
- `startAfter` (doc id)
- `start`, `end` (YYYY-MM-DD or ISO)
- `pinned` = true|false
- `tag` → `array_contains` on tags

**Response: 200**
```json
[{ "id": "...", "text": "...", "tags": ["idea"] }]
```

---

## 🧪 RN Client Helpers

```ts
// src/services/chaos.ts
import auth from '@react-native-firebase/auth';

const API_BASE = __DEV__ ? 'http://127.0.0.1:8000' : 'https://<prod-host>';

async function authFetch(path: string, init: RequestInit = {}) {
  const u = auth().currentUser;
  if (!u) throw new Error('Not signed in');
  const token = await u.getIdToken(true);
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
}

export async function createChaos(input: { text: string; tags?: string[]; context?: Record<string, any>; pinned?: boolean; capturedAt?: string; }) {
  const res = await authFetch('/chaos', { method: 'POST', body: JSON.stringify(input) });
  if (!res.ok) throw new Error(`createChaos failed: ${res.status}`);
  return res.json();
}

export async function getChaos(id: string) {
  const res = await authFetch(`/chaos/${id}`);
  if (!res.ok) throw new Error(`getChaos failed: ${res.status}`);
  return res.json();
}

export async function updateChaos(id: string, updates: Partial<{ text: string; tags: string[]; context: Record<string, any>; pinned: boolean; capturedAt: string; }>) {
  const res = await authFetch(`/chaos/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
  if (!res.ok) throw new Error(`updateChaos failed: ${res.status}`);
  return res.json();
}

export async function deleteChaos(id: string) {
  const res = await authFetch(`/chaos/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteChaos failed: ${res.status}`);
  return res.json();
}

export async function listChaos(params: { limit?: number; startAfter?: string; start?: string; end?: string; pinned?: boolean; tag?: string } = {}) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null) p.set(k, String(v)); });
  const res = await authFetch(`/chaos?${p.toString()}`);
  if (!res.ok) throw new Error(`listChaos failed: ${res.status}`);
  return res.json();
}
```

---

## 🎨 UI/UX Notes
- Capture UX minimal friction (1-tap add).
- Pinning: expose star toggle.
- Tags: chips in composer, filter client-side.
- Archive: after delete, show “Moved to Archive” toast.
- Date filters: Today, 7 days, 30 days.

---

## 🚦 Errors
- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found`
- `400 Bad Request`
- `415 Unsupported Media Type`

All errors return `{ "error": "<message>" }`.

---

## ✅ FE Checklist
- [ ] Wire `src/services/chaos.ts` into app.
- [ ] Show archive result on delete.
- [ ] Add pinned/tag/date filters.
- [ ] Keep `text` required on create; allow partial updates.
