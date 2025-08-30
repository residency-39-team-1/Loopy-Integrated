# README – Using `dopamine_logs` (Frontend Integration)

The dopamine API provides **reward events** and **tallies**. Use it to log points when users complete tasks or actions, list a user’s dopamine activity, and fetch totals for day/week/month.

---

## 🔑 Auth
Every call requires the Firebase **ID token** in the `Authorization` header.

```ts
import auth from '@react-native-firebase/auth';
const token = await auth().currentUser?.getIdToken(true);
```

Headers:
```http
Authorization: Bearer <token>
Content-Type: application/json
```

Base URL:
- Dev: `http://127.0.0.1:8000`
- Prod: `https://<your-api-host>`

---

## 📦 Data model

**dopamine_logs/{id}**
```json
{
  "id": "<docId>",
  "userId": "<uid>",
  "points": 15,
  "source": "task_completed",
  "context": { "taskId": "..." },
  "note": "Finished API draft",
  "createdAt": "<server time>"
}
```

**Allowed `source` values (initial):**  
`task_completed | chaos_entry_created | daily_session_review | manual_reward`

> You can add more later. FE should treat `source` as a string union.

---

## 🌐 Endpoints

### Create a dopamine log
`POST /dopamine-logs`
```json
{ "points": 15, "source": "task_completed", "context": { "taskId": "123" }, "note": "..." }
```

### Get a single log
`GET /dopamine-logs/:logId`

### Delete a log
`DELETE /dopamine-logs/:logId`

### List my logs (filters + paging)
`GET /dopamine-logs?start=2025-08-01&end=2025-08-17&limit=100&startAfter=<docId>&source=task_completed`

### My summary (tally)
`GET /dopamine-logs/summary?window=day`  
Options: `window=day|week|month` and optional `date=YYYY-MM-DD`  
Or pass explicit `start` and `end` ISO timestamps.

---

## 🧪 Example RN client (installed as `src/services/dopamine.ts`)

```ts
import {
  createDopamineLog,
  listDopamineLogs,
  getDopamineLog,
  deleteDopamineLog,
  getDopamineSummary,
} from '../services/dopamine';

// Create
await createDopamineLog({ points: 10, source: 'task_completed', context: { taskId: 'abc' } });

// List (last week)
await listDopamineLogs({ start: '2025-08-10', end: '2025-08-17', limit: 100 });

// Summary (this month)
await getDopamineSummary({ window: 'month' });
```

---

## 🛡️ Admin (dashboard only; role=admin + scope=ads.read)
- `GET /admin/dopamine-logs?userId=<uid>&start=...&end=...&limit=200`
- `GET /admin/dopamine-logs/summary?start=...&end=...&userId=<optional>`

Returns **consented users only** and **audits** every access.

---

## 🎨 UI Notes
- Show “+N” point chip when a reward is created.
- A compact “Today’s dopamine” tally can call `/dopamine-logs/summary?window=day` on screen focus.
- Treat delete as an optional affordance (long-press to remove). Keep logs mostly **append-only**.

---

## ✅ Checklist
- [ ] Import and use `src/services/dopamine.ts` in the RN app.
- [ ] Attach reward creation to task completion flows.
- [ ] Build a basic dopamine activity list with infinite scroll (use `startAfter`).
- [ ] Add a small “today/this week” tally widget using `/summary`.
