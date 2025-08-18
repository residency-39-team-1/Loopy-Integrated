# README – Using `users.py` (Frontend Integration)

This guide shows React Native devs how to interact with the **Users API** in the Flask backend. It covers self-service endpoints (`/users/me`) and the admin list endpoint (for ad-sales, consented and least-privilege only).

---

## 🔑 Auth
All requests require a Firebase **ID token** in the `Authorization` header.

```ts
import auth from '@react-native-firebase/auth';
const idToken = await auth().currentUser?.getIdToken(true);
```

Header:
```http
Authorization: Bearer <idToken>
Content-Type: application/json
```

Base URLs:
- Dev: `http://127.0.0.1:8000`
- Prod: `https://<your-api-host>`

---

## 👤 Self endpoints (the signed-in user)

### Upsert my user profile
`POST /users/me`

Use this after sign-in or when updating display info locally (the backend sets timestamps).

**Body (any subset):**
```json
{
  "email": "user@example.com",
  "displayName": "Jane",
  "photoURL": "https://...",
  "isAnonymous": false
}
```

**Response: 201**
```json
{
  "id": "uid-123",
  "uid": "uid-123",
  "email": "user@example.com",
  "displayName": "Jane",
  "photoURL": "https://...",
  "isAnonymous": false,
  "createdAt": "...",
  "lastSignIn": "...",
  "updatedAt": "..."
}
```

### Get my user profile
`GET /users/me` → returns the document for the caller.

### Delete my account
`DELETE /users/me` → deletes the Firestore user document (does **not** delete Firebase Auth user; handle separately in app if needed).

---

## 🛡️ Admin endpoint (least-privilege, consent-only)

`GET /admin/users?limit=100&startAfter=<uid>&fields=country,ageBracket`

**Requirements**
- Caller must have custom claim `role=admin` **and** `scopes` includes `ads.read`.
- Only **consented** users (`marketingConsent=true`) are returned.
- Returns **minimal fields** by default: `uid, displayName, createdAt, lastSignIn`.
- You may request safe optional fields via `fields` (CSV): `country, ageBracket`.
- Requesting `email` requires explicit inclusion in `fields=email` and is still consent-gated.

**Response: 200**
```json
[
  {
    "id": "uid-123",
    "uid": "uid-123",
    "displayName": "Jane",
    "createdAt": "...",
    "lastSignIn": "...",
    "country": "US",
    "ageBracket": "25-34"
  }
]
```

---

## 🧪 Example RN helpers

```ts
// src/lib/api.ts
import auth from '@react-native-firebase/auth';
const API_BASE = __DEV__ ? 'http://127.0.0.1:8000' : 'https://<prod-host>';

export async function authFetch(path: string, init: RequestInit = {}) {
  const u = auth().currentUser;
  if (!u) throw new Error('Not signed in');
  const token = await u.getIdToken(true);
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
}
```

**Self:**
```ts
export async function upsertMe(input: Partial<{email: string; displayName: string; photoURL: string; isAnonymous: boolean;}>) {
  const res = await authFetch('/users/me', { method: 'POST', body: JSON.stringify(input) });
  if (!res.ok) throw new Error(`upsertMe failed: ${res.status}`);
  return res.json();
}

export async function getMe() {
  const res = await authFetch('/users/me');
  if (!res.ok) throw new Error(`getMe failed: ${res.status}`);
  return res.json();
}

export async function deleteMe() {
  const res = await authFetch('/users/me', { method: 'DELETE' });
  if (!res.ok) throw new Error(`deleteMe failed: ${res.status}`);
  return res.json();
}
```

**Admin list (dashboard):**
```ts
export async function adminListUsers(params: { limit?: number; startAfter?: string; fields?: string[] } = {}) {
  const p = new URLSearchParams();
  if (params.limit) p.set('limit', String(params.limit));
  if (params.startAfter) p.set('startAfter', params.startAfter);
  if (params.fields?.length) p.set('fields', params.fields.join(','));
  const res = await authFetch(`/admin/users?${p.toString()}`);
  if (!res.ok) throw new Error(`adminListUsers failed: ${res.status}`);
  return res.json();
}
```

---

## 🔒 Firestore document shape (for reference)

```json
{
  "uid": "uid-123",
  "email": "user@example.com",
  "displayName": "Jane",
  "photoURL": "https://...",
  "isAnonymous": false,
  "createdAt": "<server time>",
  "lastSignIn": "<server time>",
  "updatedAt": "<server time>",

  "marketingConsent": true,
  "marketingConsentUpdatedAt": "<server time>",

  "country": "US",
  "ageBracket": "25-34"
}
```

> If you don’t collect `country`/`ageBracket`, remove them from requests.

---

## ⚠️ Errors
- `401 Unauthorized`: missing/invalid token
- `403 Forbidden`: missing admin role/scope, or attempting to read another user
- `404 Not Found`: user doc missing
- `415 Unsupported Media Type`: missing `Content-Type: application/json` on POST

All errors return: `{ "error": "<message>" }`

---

## ✅ Checklist
- [ ] Call `upsertMe()` after successful Firebase sign-in.
- [ ] Use `getMe()` to hydrate the profile screen.
- [ ] Only admin dashboard calls `adminListUsers()` (role + scope required).
- [ ] Respect `marketingConsent` in UI and privacy flows.
