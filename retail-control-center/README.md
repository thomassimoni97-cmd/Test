# Golden Goose — Retail Opening Control Center

Internal PMO application to manage, monitor and present the **Retail Opening Program** (New Companies and
New Stores), built around the recurring **SAL** (status meeting) workflow.

* **Program Overview** — where are we overall? KPI strip, program opening timeline (confirmed / tentative / TBD), opening overview, openings at risk, areas behind, decisions, recent changes.
* **Store SAL** — what do we need to discuss for this opening? Header readable in 5 seconds, clickable indicators, functional-area progress, **SAL Focus** (blockers, overdue, due soon, decisions, changes since last SAL), action log (table ⇄ kanban), recent changes, **Generate meeting minutes**.
* **Functional Areas** — horizontal SAL: stores × areas completion matrix and one page per function across all openings.
* **Action Log** (virtualized grid: frozen ID/Area/Title, sticky header, sort, group, hide/resize columns, inline edit, XLSX/CSV export), **Kanban** (drag & drop), **Calendar** (month/week), **Program Timeline** (Gantt by store or area), **History**, **Meeting Minutes** history, **Settings**.
* **Task detail** always opens in a right drawer: all fields, dated notes, full audit timeline.
* **Presentation mode** (`Shift+P`): chrome hidden, larger type, read-only (quick edit and notes still available), keyboard navigation `← →` areas, `[ ]` openings, `1–5` focus tabs.
* **Automatic meeting minutes**: deterministic change detection since the previous confirmed SAL → editable draft → copy (Outlook/Teams/Word) / print / PDF → **Confirm** creates the next baseline.

Google Sheets is the Single Source of Truth. The browser never talks to Google: a small server API holds
the credentials. Without credentials the app runs on a **local demo dataset** so the full journey can be
tested immediately.

---

## Quick start (demo data, no Google account needed)

Requirements: Node.js ≥ 20.

```bash
cd retail-control-center
npm install
npm run dev          # http://localhost:3000
```

On first start `.data/db.json` is created with the demo dataset (19 openings, ~410 tasks, ~640 history
rows, 3 confirmed SALs for Amsterdam Airport). Dates are generated **relative to today**, so the demo is
always “live”: go to **Store SAL → Amsterdam Airport → Generate meeting minutes** to see the minutes of
the current SAL compared with the one of 7 days ago.

Reset the demo at any time: *Settings › Google Sheets connection › Reset demo data* or `npm run demo:reset`.

## Claude artifact edition

`npm run artifact:build` bundles the same pages and components into one HTML file
(`artifact/dist/retail-control-center.html`) that runs inside Claude as a private artifact: routing in
memory, data in the artifact's private document store (`src/artifact/adapters.ts`, same `TableAdapter`
contract), exports through Claude's download prompt. No Google Sheets and no print dialog in that
edition (the artifact frame blocks both); *Copy minutes* works.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | Unit + integration tests (domain rules, minutes engine, repository, Google Sheets adapter against an in-memory Sheets API) |
| `npm run e2e` | End-to-end smoke test of the whole user journey (needs a running server in local mode and Playwright Chromium: `npx playwright install chromium`) |
| `npm run typecheck` / `npm run lint` | Type check / lint |
| `npm run sheets:init` | Creates the 7 tabs in the configured Google Sheet with headers, dropdown validation and demo data (`-- --empty` for structure only, `-- --yes` to skip confirmation) |
| `npm run template:export` | Regenerates the CSV template in `sheets-template/` |
| `npm run demo:reset` | Restores the local demo dataset |

---

## Connecting Google Sheets

1. **Create the spreadsheet** — an empty Google Sheet. Copy its ID from the URL
   `https://docs.google.com/spreadsheets/d/<THIS_IS_THE_ID>/edit`.
2. **Create a service account** — Google Cloud Console → *IAM & Admin → Service accounts* → create one
   (no roles needed) → *Keys → Add key → JSON*. Enable the **Google Sheets API** for the project
   (*APIs & Services → Library*).
3. **Share the spreadsheet** with the service account email (`…@….iam.gserviceaccount.com`) as **Editor**.
4. **Configure the server** — copy `.env.example` to `.env.local` and set:
   ```bash
   DATA_SOURCE=sheets
   GOOGLE_SHEETS_ID=1AbC…
   GOOGLE_SERVICE_ACCOUNT_EMAIL=roc@my-project.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE…\n-----END PRIVATE KEY-----\n"
   # or: GOOGLE_SERVICE_ACCOUNT_JSON=<the JSON key, raw or base64>
   ```
5. **Initialise the structure** — `npm run sheets:init` (demo data) or `npm run sheets:init -- --empty`.
   Alternatively import the CSVs of `sheets-template/` as tabs with the same names.
6. `npm run dev` → the sync badge shows **Google Sheets**. *Settings › Google Sheets connection* has a
   *Test connection* button (latency, row counts, data issues).

### How synchronization works

* Reads: one `batchGet` for all tabs, cached server-side for `SHEETS_CACHE_TTL_MS` (default 8 s) to protect
  the API quota. The browser refreshes every 60 s (configurable) using ETags, and on window focus;
  **Refresh** in the top bar forces a fresh read. Edits made directly in the Sheet appear on the next refresh.
* Writes: each edit updates only the affected row + appends TASK_HISTORY rows. The UI updates
  optimistically and shows *Syncing… / Synced 14:32 / Unsaved changes / Sync error*.
* **Optimistic concurrency**: before writing, the server re-reads the row and compares its fingerprint with
  the one the browser loaded (this also catches edits made directly in the Sheet that did not bump
  `Version`). On mismatch the edit is rejected, the newest values are shown and nothing is overwritten.
* **No silent loss**: failed writes (network / Google errors) are kept in a retry queue; leaving the page
  with unsaved changes asks for confirmation.
* Edit the Sheet by hand freely: the app is tolerant to blank cells, typed dates, `68%`, reordered columns
  and extra columns. Problems are listed in *Settings › Data quality*. Direct edits in the Sheet do not
  create TASK_HISTORY rows, but they **are** picked up by the next meeting minutes (the SAL snapshot diff).

Data model: see [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md). Architecture and design decisions:
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Meeting minutes

There is no *Start SAL / End SAL*. Run the meeting normally, then **Generate meeting minutes**:

1. The engine compares the current state and TASK_HISTORY with the **previous confirmed SAL** of the store
   (first SAL: choose a start date or an initial current-state recap).
2. Changes are consolidated per task into one sentence and ordered by importance
   (new blockers → overdue → decisions → deadlines → statuses → completed → notes → progress → new tasks),
   grouped by functional area (IT sub-areas nested), followed by *Next steps / open points* and
   *Blockers / decisions required*.
3. The draft is fully editable (rewrite, add/delete bullets, sub-headings and sections, reorder, comments).
   It is kept in the browser session, so navigating away does not lose edits.
4. **Copy** (rich text + plain text for Outlook/Teams/Word), **Print**, **PDF** (print → *Save as PDF*).
5. **Confirm meeting minutes** writes SAL_HISTORY (generated + final text, structured doc, snapshot) and
   becomes the baseline for the next SAL. Previews never change the baseline.

The pipeline is modular: `detect.ts` (change detection) → `StructuredMinutes` → `templates.ts`
(wording/layout) → editable `MinutesDoc` → `render.ts`. A future AI rewriting layer would implement the
same `MinutesTemplate` contract; changing the minutes format never touches tasks, history, baselines or
detection. Two templates ship today: *Standard SAL minutes* and *Executive summary*.

---

## Deployment

The app is a standard Next.js 15 application (Node runtime).

**Vercel (recommended for a quick internal deployment)**
1. Import the repository, set *Root Directory* = `retail-control-center`.
2. Add the environment variables (`DATA_SOURCE=sheets`, `GOOGLE_SHEETS_ID`, credentials). Paste the private
   key with `\n` escapes, or use `GOOGLE_SERVICE_ACCOUNT_JSON` (base64 of the JSON key avoids quoting issues).
3. Protect the deployment: Vercel SSO / password protection, or set `BASIC_AUTH_USER` +
   `BASIC_AUTH_PASSWORD` (HTTP Basic auth built into the app's middleware).
   Local demo mode on Vercel writes to `/tmp` and is **not persistent** — use Google Sheets in production.

**Any Node host / container**
```bash
npm ci && npm run build
PORT=3000 npm start
```
Put it behind your SSO / reverse proxy (Google IAP, Cloudflare Access, Azure App Proxy…).

---

## Project structure

```
retail-control-center/
├── docs/                      ARCHITECTURE.md (IA, sync, minutes engine) · DATA_MODEL.md
├── sheets-template/           CSV template, one file per tab (with demo data)
├── scripts/                   sheets:init · template:export · demo:reset
├── e2e/smoke.mjs              end-to-end journey test (Playwright)
├── tests/                     vitest: schema, metrics, mutations, minutes, repository, sheets adapter
└── src/
    ├── app/                   pages (App Router) + api/* route handlers
    │   ├── page.tsx           Program Overview
    │   ├── stores/[storeId]/  Store SAL · minutes/ (generator + editor)
    │   ├── areas/             matrix · [areaId] horizontal SAL
    │   ├── actions · kanban · calendar · timeline · minutes · history · settings
    │   └── api/               snapshot · tasks · stores · areas · owners · settings · sal · health · admin/reset
    ├── components/            shell · ui · tasks (grid, kanban, drawer, filters) · store · overview · minutes
    ├── lib/domain/            pure business rules shared by server & client
    │   ├── types.ts schema.ts metrics.ts mutations.ts dates.ts seed.ts
    │   └── minutes/           detect.ts (engine) · templates.ts (wording) · render.ts (text/HTML)
    ├── lib/server/            adapters (Google Sheets | JSON file) · repository (rules, concurrency, history)
    ├── lib/client/            zustand store + sync engine · api · model/selectors · export · clipboard
    └── middleware.ts          optional Basic auth
```

Replacing Google Sheets with a database later means implementing `TableAdapter`
(`src/lib/server/adapters/types.ts`) — or a new repository — without changing the frontend.

## Keyboard shortcuts

`⌘K` / `/` search · `Shift+P` presentation · `Esc` close panel / exit presentation ·
Store SAL: `← →` functional areas, `[ ]` previous/next opening, `1–5` SAL Focus tabs ·
Functional area: `← →` previous/next area · Task note: `⌘/Ctrl+Enter` save.

## Known limits of the MVP

* Single-tenant, no user accounts: the “user” shown in history is the name set in *Settings › Display*.
  Put the app behind SSO; per-user identity can come from the SSO header later.
* Google Sheets API quotas (~60 requests/min/user) are fine for one PMO team; the server cache and ETags
  keep polling cheap. Beyond a few concurrent editors, move to a database adapter.
* Owners are referenced by name (as typed in the Sheet); renaming an owner does not rewrite existing tasks.
* PDF export uses the browser print dialog (*Save as PDF*).
