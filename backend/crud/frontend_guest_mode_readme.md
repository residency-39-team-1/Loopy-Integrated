# README – Guest Mode & Bootstrap Import (Frontend Integration)

This guide explains how guest users work in Loopy, and how to transition their **local-only data** into Firestore once they sign in. Backend provides a single `/bootstrap/import` endpoint to help with this.

---

## 🎯 Purpose
- **Guest mode:** allow users to create tasks, archive items, and capture chaos entries **offline**, without an account.
- **Upgrade flow:** when the guest signs in with Google/email, the app uploads those local items to the backend → Firestore.

> Dopamine logs are **full-user only** and not available in guest mode.

---

## 🔑 Auth
- **Guest mode:** no auth, everything is stored on-device.
- **After sign-in:** frontend obtains a Firebase ID token as usual, then calls `/bootstrap/import` with local items.

---

## 🧱 Local storage (guest)
Frontend is responsible for:
- Storing tasks, archives, and chaos entries in **device storage** (e.g., AsyncStorage, SQLite, Realm).
- Each item should have a **`localId`** (temporary unique string) for reconciliation later.

Example guest task:
```json
{
  "localId": "t_123",
  "title": "Buy milk",
  "notes": "2%",
  "state": "Exploring",
  "priority": 2,
  "dueDate": "2025-09-01T00:00:00Z"
}
```

---

## 🌐 Import endpoint (backend)
`POST /bootstrap/import`

Headers:
```http
Authorization: Bearer <idToken>
Content-Type: application/json
```

**Body (example):**
```json
{
  "clientSchemaVersion": 1,
  "tasks": [
    { "localId": "t_123", "title": "Buy milk", "state": "Exploring" }
  ],
  "archived_entries": [
    { "localId": "a_1", "refType": "task", "snapshot": { "title": "Old thing", "state": "Done" } }
  ],
  "chaos_entries": [
    { "localId": "c_99", "text": "Random thought", "capturedAt": "2025-08-29T13:20:00Z" }
  ]
}
```

**Response (maps local → server ids):**
```json
{
  "tasks": { "t_123": "9oFy2a..." },
  "archived_entries": { "a_1": "A7Qk5u..." },
  "chaos_entries": { "c_99": "Chs_2P..." }
}
```

---

## 🔄 Frontend flow
1. **During guest mode:**
   - Save tasks, archives, chaos locally only (no backend calls).
   - Assign each item a `localId`.

2. **On sign-in:**
   - Get Firebase ID token (`auth().currentUser?.getIdToken(true)`).
   - Collect all guest items from local storage.
   - Call `POST /bootstrap/import` with those arrays.

3. **On response:**
   - Update local items by replacing `localId` with the returned Firestore ID.
   - Switch data source to normal API endpoints (`/tasks`, `/archive`, `/chaos_entries`).

4. **Optional:** clear guest storage to avoid duplicates.

---

## 🚦 Notes & rules
- Only **Tasks**, **Archived entries**, and **Chaos entries** are supported in guest mode.
- **Dopamine logs**: not available until user has a full account.
- Backend enforces ownership via Firestore rules—guest import only works after a user signs in.
- Payloads are capped (~2MB) to protect the API.

---

## ✅ Frontend Checklist
- [ ] Store guest items locally with `localId` fields.
- [ ] On sign-in, call `/bootstrap/import` once with all local data.
- [ ] Replace localIds with returned serverIds in app state.
- [ ] Switch to using server-backed CRUD services after import.
- [ ] Hide or disable dopamine logs until user is signed in.
