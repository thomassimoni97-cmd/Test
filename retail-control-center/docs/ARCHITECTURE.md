# Architecture — Retail Opening Control Center

This document covers steps 1–7 of the development process: information architecture, data model,
Google Sheets structure, component architecture, synchronization, meeting-minutes change detection
and the implementation plan. Field-level documentation lives in [`DATA_MODEL.md`](./DATA_MODEL.md).

---

## 1. Information architecture

Three information levels, deliberately kept apart:

| Level | Question it answers | Page |
|---|---|---|
| Program | *Where are we overall?* | **Program Overview** (`/`) |
| Opening (vertical SAL) | *What do we need to discuss for this opening?* | **Store SAL** (`/stores/[id]`) |
| Function (horizontal SAL) | *How is this function progressing across all openings?* | **Functional Areas** (`/areas`, `/areas/[id]`) |

Everything else is a *lens on tasks* (Action Log, Kanban, Calendar, Timeline) or a *lens on time*
(History, Meeting Minutes).

```
Program Overview ─┬─ KPI strip · Openings table ⇄ Program timeline · Attention panel
                  └─ click opening ───────────────▶ Store SAL
Store SAL ─ header (opening, days, %, risk) → indicators → Area progress → SAL Focus
          → Action Log (table ⇄ kanban) → Recent changes → GENERATE MEETING MINUTES
                                                            └▶ Minutes preview/editor → Confirm
Functional Areas ─ Stores × Areas heat-matrix → Area page (KPIs, stores, tasks)
Action Log / Kanban / Calendar / Timeline ─ shared task filters (session-persisted)
Meeting Minutes ─ store → confirmed SALs → minutes + snapshot + included changes
History ─ TASK_HISTORY feed with filters
Settings ─ areas, owners, statuses, risk, progress method, due-soon, SAL, Sheets, display, data quality
Task Detail ─ right drawer, available from every page (never navigates away)
```

Store SAL reading order (the meeting flow): store + opening date → overall % → days to opening →
factual risk indicators → area progress → blockers → overdue → due soon → decisions → action log →
recent changes → generate minutes.

## 2. Data model & relationships

```
STORES 1 ──── * TASKS 1 ──── * TASK_HISTORY
   │              │  └── Area (→ AREAS.Area_ID), Owner/Secondary_Owner (→ OWNERS.Name)
   │              └── Dependency (→ TASKS.Task_ID, comma separated)
   └── 1 ──── * SAL_HISTORY  (confirmed minutes + baseline snapshot)
SETTINGS (key/value) · AREAS · OWNERS  (configuration)
```

* IDs (`Store_ID`, `Task_ID`, `Area_ID`, `History_ID`, `SAL_ID`) are immutable.
* `Task_ID` = `{Store_ID}-{Area_ID}-{nnn}` generated server-side (e.g. `AMS-HR-008`).
* Tasks reference areas by `Area_ID` (short code) so an area can be renamed without touching tasks.
* Owners are referenced by name (what people type in Sheets); unknown names are reported as data-quality warnings, never as crashes.
* Store-level changes (opening date, risk, …) are written to TASK_HISTORY with an empty `Task_ID`.
* Derived values are never stored as truth: delay, days to opening, completion, overdue/blocked/due-soon counts
  are computed. `STORES.Overall_Progress` is written back as a *convenience copy* for Sheet readers only.

## 3. Google Sheets structure

One spreadsheet, seven tabs: `STORES`, `TASKS`, `TASK_HISTORY`, `AREAS`, `OWNERS`, `SAL_HISTORY`, `SETTINGS`.
Row 1 = headers (column order is free; the app maps by header name and preserves unknown columns).
Dates are written as ISO text `YYYY-MM-DD`; dates typed manually in Sheets (serial numbers,
`05/03/2027`, `5 Mar 2027`) are parsed too. Booleans accept `TRUE/FALSE/Yes/No/x/1/0`.
`npm run sheets:init` creates the tabs, headers and the demo dataset. CSV templates are in `sheets-template/`.

## 4. Frontend component architecture

```
app/layout ─ AppShell (Sidebar · TopBar[GlobalSearch, SyncBadge, PresentationToggle]) · TaskDrawer · Toaster
lib/domain      pure, isomorphic TS: types, schema (parse/serialize/validate), metrics, ids, seed, minutes/*
lib/server      adapters (TableAdapter: GoogleSheets | JsonFile) → repository (business ops, versioning, history, locking)
lib/client      zustand store (snapshot, sync state, filters, UI), api client, sync engine, selectors/hooks
components      ui/* primitives · shell/* · overview/* · store/* · tasks/* (ActionLog grid, Kanban, Drawer)
                areas/* · gantt/* · calendar/* · minutes/* · settings/*
```

All business rules (delay, overdue, progress method, change detection) live in `lib/domain` and are
shared by server and client — the UI never re-implements a rule.

## 5. Synchronization architecture

```
Browser ──fetch──▶ Next.js route handlers (/api/*) ──▶ Repository ──▶ TableAdapter ──▶ Google Sheets API
                     (secrets server-side only)          (mutex, validation,        (service account)
                                                          versioning, history)  or JSON file (demo)
```

* **Read**: `GET /api/snapshot` returns all entities + data-quality issues + an ETag. The server caches the
  Sheets read for a few seconds; the client polls (default 60 s, configurable) with `If-None-Match` → `304`
  when nothing changed. Manual refresh bypasses the cache.
* **Write**: every edit is a small `PATCH`/`POST`. The client applies it optimistically, marks the sync badge
  *Syncing…*, then replaces the record with the server version and appends the returned history rows —
  no full reload after an edit.
* **Optimistic concurrency**: every record carries `Version` and a server-computed `rev` (fingerprint of the
  whole row as parsed). The client sends the `rev` it edited; the server re-reads that single row from the
  source and rejects with `409` if it changed (including direct edits in Sheets that did not bump `Version`).
  The UI reverts, shows the newer values and asks the user to re-apply.
* **No silent loss**: failed writes stay in a pending queue (badge: *Unsaved changes* / *Sync error*) with
  Retry; leaving the page with pending writes triggers a browser confirmation.
* **Replaceability**: the frontend only knows `/api/*`. Swapping Sheets for Postgres means writing one new
  `TableAdapter` (or a new repository) — no UI change.

## 6. Meeting-minutes change detection

```
TASKS (current) + TASK_HISTORY + previous confirmed SAL (baseline timestamp + task snapshot)
   ▼ detectChanges()            lib/domain/minutes/detect.ts      — pure, deterministic
StructuredMinutes (per task: net field changes, notes, flags, priority rank; store changes; open points)
   ▼ template.build()           lib/domain/minutes/templates/*    — the only place that knows wording/format
MinutesDoc (sections → groups → bullets)
   ▼ MinutesEditor (user edits, reorders, adds, deletes)
   ▼ render → plain text / clean HTML / print
CONFIRM → SAL_HISTORY row (final text + doc JSON + baseline snapshot) = new baseline
```

* **Baseline** = `Confirmation_Timestamp` of the last confirmed SAL of the store. Preview never writes.
* **Net changes**: when the baseline has a task snapshot, fields are diffed snapshot → current (this also
  catches edits made directly in Google Sheets); otherwise TASK_HISTORY after the baseline is folded into
  first-previous → last-new per field. Changes that net to zero are dropped.
* **Signals**: created, completed, status, progress, due date, owner, risk, priority, new/resolved blocker,
  new/resolved decision, new notes, newly overdue, store opening-date / risk / status changes.
* **One bullet per task**: all signals of a task are consolidated in one sentence; bullets are ordered by the
  task's most important signal: new blocker → overdue → decision → deadline → status → completed → note →
  progress → created.
* **First SAL**: pick a start date (history-based comparison) or produce a current-state recap.
* **AI-ready**: an optional rewriting layer would take `StructuredMinutes` and return a `MinutesDoc`
  — same contract as the deterministic template. Not implemented in the MVP by design.

## 7. Implementation plan (as executed)

1. Domain core: types, schema/validation, metrics, ids, seed generator (event-sourced demo history).
2. Storage: `TableAdapter` (JSON file + Google Sheets), repository with mutex/versioning/history, API routes.
3. Client core: store, sync engine, api client, filters, toasts.
4. Shell: sidebar, top bar, search, sync badge, presentation mode, task drawer.
5. Pages: Store SAL → Action Log/Kanban → Program Overview/Timeline → Functional Areas → Calendar → Gantt
   → History → Minutes generator/editor/history → Settings.
6. Tests: domain + repository (vitest), Sheets adapter against an in-memory fake of the Sheets API, UI smoke
   run with Playwright.
