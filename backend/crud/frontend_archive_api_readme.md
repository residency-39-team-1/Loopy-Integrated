# README – Using `archive.py` (Frontend Integration)

**Context:**  
The archive API lets you *pause, hide, or later restore* user content (tasks, chaos entries, dopamine logs, daily sessions). It’s the backend equivalent of a “shelf” where things can be safely stored and brought back. This complements the **Flowboard** and **Task Creation Flows** from Sprint 1.

---

## 🔑 Auth
All calls need the Firebase **ID Token** from the signed-in user.

```ts
import auth from '@react-native-firebase/auth';
const token = await auth().currentUser?.getIdToken();
```

Use this in every request header:
```http
Authorization: Bearer <idToken>
Content-Type: application/json
```

---

## 📚 API Endpoints

### Create archive entry
`POST /archive`

Use when a user “shelves” something (e.g. long-pressing a TaskCard to archive it).

```json
{
  "ref_type": "task",
  "ref_id": "<originalDocId>",
  "snapshot": {
    "title": "Finish backend refactor",
    "state": "active"
  }
}
```

Response includes an `archiveId`.

---

### List archived items
`GET /archive?ref_type=task`

Used for the **Archived Items screen** (planned for Sprint 2).  
Supports pagination with `limit` + `startAfter`.

---

### Get specific archive entry
`GET /archive/:archiveId`

For detail views (if user taps into an archived item).

---

### Delete archive entry
`DELETE /archive/:archiveId`

Used for a permanent “Forget this” action.

---

### Restore an archive entry
`POST /archive/:archiveId/restore`

**Modes:**
- `"merge"` (default): keeps existing fields, updates others.
- `"replace"`: overwrites the document completely.

**Dry-run option** (preview diff):
```json
{
  "dryRun": true
}
```

Backend returns a **diff object** showing what would change:
```json
{
  "diff": {
    "added": ["deadline"],
    "removed": [],
    "changed": { "status": { "from": "active", "to": "complete" } },
    "unchanged": ["title", "userId"]
  }
}
```

This supports an **interactive “Review changes before restoring” modal** in the UI.

---

## 🎨 UI / UX Recommendations

- **Archive affordance:**  
  - Long-press on `TaskCard` → show `Archive` option in action sheet.  
  - Archived entries shouldn’t clutter the Flowboard (maintains “clean emotional space”).
  
- **Restore affordance:**  
  - From Archived screen, swipe right on an item → `Restore`.  
  - Show preview modal (diff table) if possible.  

- **Visual design:**  
  - Keep consistent with Flowboard styling (soft color palette, rounded corners, neutral copy).  
  - Use same modal layout pattern as TaskModal for diff/restore review.  

- **Accessibility:**  
  - Add ARIA labels to Archive/Restore buttons.  
  - Ensure color contrast of “Archived” label meets WCAG 2.1 AA.  
  - Respect motion toggle for any restore animations (confetti, etc.).

---

## 🚦 Error handling
- `401` Unauthorized → user must sign in again.  
- `403` Forbidden → archive entry isn’t owned by current user.  
- `404` → archive entry not found.  
- `400` → bad request (invalid type or missing fields).  

Frontend should gracefully show a toast/banner (emotion-neutral language, e.g. “Couldn’t restore item. Try again.”).

---

## 🔍 Next Steps
- [ ] Build **Archive List screen** (tab/filter by type).  
- [ ] Implement **long-press archive action** on TaskCard.  
- [ ] Add **Restore diff preview modal**.  
- [ ] Ensure Firestore rules are respected (owner-only access).  
