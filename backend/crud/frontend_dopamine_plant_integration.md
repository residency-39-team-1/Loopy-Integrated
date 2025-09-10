# Frontend Dopamine Plant Integration (React Native)

This guide shows how to wire the **Dopamine Plant** into the RN app
using the backend endpoints you have. It includes API contracts, a tiny
client SDK, UI patterns, animation, offline handling, and a QA
checklist.

------------------------------------------------------------------------

## 1) Concept & Data Flow

-   User completes a task → Frontend calls
    **`POST /dopamine/task-complete`**.
-   Backend updates growth state and returns the current **`phase`**,
    **`variant`**, and **`asset_filename`**.
-   Frontend renders the image from bundled assets (or CDN) using
    `asset_filename`.
-   Optional: show a quick animation if `advanced: true`.

**State shape returned from backend**

``` json
{
  "ok": true,
  "advanced": true,
  "plant": {
    "user_id": "UID",
    "phase": 3,
    "variant": "3B",
    "tasks_completed_since_phase": 0,
    "asset_filename": "plant_phase3_3B.png",
    "last_updated": "2025-09-09T20:45:00Z"
  }
}
```

------------------------------------------------------------------------

## 2) Endpoints (frontend contract)

-   `POST /dopamine/init` `{ user_id }` → creates plant if missing,
    returns plant.
-   `GET /dopamine/state?user_id=...` → returns plant.
-   `POST /dopamine/task-complete` `{ user_id, task_id?, points? }` →
    returns `{ advanced, plant }`.
-   `POST /dopamine/reset` `{ user_id, reason? }` → archives + re‑inits.
-   `DELETE /dopamine/delete?user_id=...` → archives + deletes.

**Auth**: Send `Authorization: Bearer <Firebase ID token>` with all
`/dopamine/*` routes.

------------------------------------------------------------------------

## 3) Asset Strategy

**Simple approach (recommended for MVP)** - Bundle images under
`assets/dopamine/` following the naming convention from
`manifest.json`: - `plant_phase1_POT.png` - `plant_phase2_2A.png`,
`plant_phase2_2B.png` - `plant_phase3_3A.png`...`plant_phase3_3D.png` -
`plant_phase4_4A.png`...`plant_phase4_4H.png` - Map `asset_filename` →
`require()` at build time.

------------------------------------------------------------------------

## 4) Tiny Client SDK (`services/dopamine.ts`)

(included in full doc)

------------------------------------------------------------------------

## 7) Animation with Lottie (recommended)

-   install via expo or yarn
-   put `confetti.json`, `glow.json`, `grow-pop.json` under
    `assets/lottie/`
-   updated `PlantCard` shows plant image with looping glow and one-shot
    confetti
-   hook usage example with `justAdvanced` state

------------------------------------------------------------------------

## 8) Offline & Error Handling

-   Cache last plant state (`AsyncStorage`) for fast startup and
    offline.
-   If `/task-complete` fails, show a toast and retry later; do **not**
    advance UI without server ack.
-   If `getPlant` returns 404, call `initPlant` once.

------------------------------------------------------------------------

## 9) QA / Test Checklist

-   [ ] `init → state` shows **Phase 1 (POT)**.
-   [ ] Completing 1st task advances to **Phase 2** and changes image.
-   [ ] Branching works (2A/2B → 3A..3D → 4A..4H) across multiple runs.
-   [ ] Reset returns to POT and image updates.
-   [ ] Token mismatch is rejected (403) by backend.
-   [ ] Assets load correctly on both iOS and Android (packager cache
    cleared).
-   [ ] Offline: cached image displays; API calls deferred.

------------------------------------------------------------------------

## 10) Environment / Config

-   `EXPO_PUBLIC_API_BASE_URL` for API host.
-   Firebase auth installed and working (`@react-native-firebase/auth`).
-   Assets placed under `assets/dopamine/` and imported via
    `manifest.ts`.

------------------------------------------------------------------------

## 11) Future Enhancements

-   Weighted branching (e.g., streaks influence final variants).
-   Micro-animations per phase (Lottie) while keeping images static for
    MVP.
-   CDN hosting of assets with remote `manifest.json` for live art
    swaps.
-   Accessibility: alt text per phase/variant, reduced motion mode.

------------------------------------------------------------------------

### Hand‑off Notes

-   Postman collection for all CRUD routes is available; set
    `{{baseUrl}}` and `{{authToken}}` to test.
-   Frontend only needs `asset_filename`; backend manages logic/state.
-   Keep the filenames in sync with design if art is updated.
