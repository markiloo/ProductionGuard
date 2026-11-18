# Repository Guidelines

## Project Overview 

Prod. Guard is a local, Windows-only purchase order review system. It collects subject-`PO` mail from Gmail Inbox over IMAP (`imap.gmail.com:993`, TLS, Google app password) from an allowlist of exact sender addresses and stores it in SQLite as account-scoped purchase orders. Each valid PO is assessed deterministically against on-hand inventory, incoming deliveries, outstanding production demand, and earlier Pending or Approved POs, producing Recommended, Redundant / Overstock, Adjust Quantity, or a Manual Review Required reason, plus timing, early-arrival, duplicate-coverage, and stockout warnings.

The same database also holds inventory (the SKU item master), assemblies with per-unit material lists, production runs with scaled and locked requirements, incoming deliveries with proof and receipt pictures, and PO review history. Ordering an approved PO fixes its arrival date and creates exactly one linked delivery; receiving a delivery adds the confirmed quantity to stock exactly once.

Three screens share one Express server: the dashboard at `/`, the receiving station at `/deliveries`, and the production floor at `/production_runs`.

The stack is Node.js ES modules, Express 5, React 19, Vite 6, Tailwind CSS v4, better-sqlite3, and imapflow. Tailwind supplies the base reset; interface styling is the custom-property CSS in `client/src/style.css`. There is no Microsoft Graph, MSAL, or Google Cloud project; do not reintroduce them.

## Project Structure & Module Organization

- `server/index.js` — Express app, API routes, raw proof-image handling, static `dist/` serving, startup and graceful shutdown.
- `server/auth.js` — Gmail IMAP sign-in check and DPAPI credential encryption through PowerShell.
- `server/collector.js` — Singleton wiring that exposes the collector to the API and records the startup cutoff.
- `server/collector-core.js` — Collection engine: cutoff filtering, IMAP search, text-only MIME download, race checks, dedup, insert.
- `server/db.js` — SQLite connection, single-instance data-directory lock, ordered schema migrations.
- `server/pagination.js` — Clamped `limit`/`offset` parsing shared by list endpoints.
- `server/email-maintenance.js` — Clears an account's saved POs and records the clear cutoff.
- `server/assessment.js` — Pure time-phased balance and decision engine.
- `server/pos.js` — Account context, PO listing, detail, lifecycle transitions, corrections, manual POs, sender re-authorization.
- `server/po.js` — `PO` subject matching and PO field parsing.
- `server/inventory.js` — Account-scoped inventory validation, list, create, update, and delete guards.
- `server/production.js` — Account-scoped production run validation, list, create, update, progress, delete, and finished-good stock updates.
- `server/production-items.js` — Assembly definitions, their per-unit materials, and the linked finished-good Inventory item.
- `server/deliveries.js` — Incoming deliveries, incoming proof, receipt, and exactly-once receiving.
- `server/dashboard.js` — Home visualization CRUD, confirmed-supply stock projection, next arrivals, and active-run completion.
- `server/reset.js` — Full local business-data reset for one account.
- `server/rules.js` — Exact sender address normalization and validation.
- `server/time.js` — Plant time zone, calendar-date helpers, and day arithmetic.
- `server/types.js` — JSDoc typedefs for API and data shapes.
- `client/src/main.jsx` — Entry point and route selection for the dashboard, receiving station, and production floor.
- `client/src/DashboardApp.jsx` — Main dashboard state, data loading, and orchestration.
- `client/src/apps/` — `ReceivingApp.jsx` and `ProductionRunsApp.jsx` standalone screens.
- `client/src/views/` — `HomeView.jsx`, `OrdersView.jsx`, `InventoryView.jsx`, `ProductionView.jsx`, `AssembliesView.jsx`, `DeliveriesView.jsx`, and `SettingsView.jsx`.
- `client/src/dialogs/` — Sheet dialogs: `PoDetailDialog`, `ManualPoDialog`, `InventoryDialog`, `ProductionItemDialog`, `ProductionDialog`, `DeliveryDialog`, `ReceiveDeliveryDialog`, `FloorProgressDialog`, and `ProjectionDialog`.
- `client/src/components/` — Shared UI atoms such as Brand, ThemeToggle, chips, ToastStack, ProductionRow, RunStrip, SearchIcon, OrdersTopbar, and ProjectionChart.
- `client/src/lib/` — `api.js`, `format.js`, and `constants.js`; `client/src/hooks/useSheetDialog.js` holds shared modal behavior.
- `client/src/style.css` — Theme and layout CSS.
- `tests/` — `node:test` suites (`*.test.js`) beside each other, not beside modules.
- `design_plan/checklist.md` — Implementation checklist; `docs/API.md` — endpoint reference; `docs/VERIFICATION.md` — verification record; `README.md` — setup, privacy, troubleshooting.
- `dist/` is built output, `data/` holds the local database, lock, and encrypted credential, and `node_modules/` holds dependencies. All three are gitignored.

Database migrations are embedded in `server/db.js` as an ordered array; add new schema changes as a new array entry, never by editing an already-applied migration.

Production routes come in two families: hyphenated `/api/production-runs` routes manage the full schedule, while underscored `/api/production_runs` routes serve the production floor and record floor progress. Keep that split when adding routes.

## Build, Test, and Development Commands

Run everything from the repository root:

- `npm install` installs dependencies from the lockfile.
- `npm run dev` runs the Express API (`node --watch`) and the Vite dashboard together on loopback.
- `npm run lint` lints `server`, `client/src`, and `vite.config.js`.
- `npm test` runs all suites with the built-in Node test runner.
- `npm run build` creates the production dashboard bundle in `dist/`.
- `npm start` serves the production app at `http://127.0.0.1:4174`.
- `npm run screenshots` regenerates `docs/screenshots/` from the read-only fixture preview in `scripts/visual-preview.mjs` using an installed Edge or Chrome; it never reads `data/` or Gmail.
- `launch.bat` starts the production server, waits for `/api/status`, then opens the dashboard.

`npm run lint` includes `eslint-plugin-react`'s `jsx-uses-vars`, so components referenced only in JSX are not reported as unused.

## Design Reviews

UI/UX work uses the imported `apple-design` skill at `.agents/skills/apple-design/SKILL.md`. Load it for design reviews and for animation or interaction-motion work, including reduced-motion accessibility. It is deliberately small: Apple's eight design principles plus Apple's motion guidance, sourced from `references/hig/design-principles.md` and `references/hig/motion.md`; it covers no other HIG topics. Treat those pages as read-only. `node .agents/skills/apple-design/scripts/pull-hig.mjs` refreshes only those two; add `--all` only when explicitly asked, because it restores the full 123-page set.

## Coding Style & Naming Conventions

- Use ES modules, `.js` for server code, `.jsx` for React components, and two-space indentation.
- Use `camelCase` for functions and variables, `PascalCase` for React components, and descriptive lowercase filenames.
- Document shared API and stored-data shapes with JSDoc in `server/types.js`.
- Keep SQL parameterized and scope every query to `account_id`.
- Prefix client API calls with `/api`; the Vite dev server proxies them to port 4174.
- Stored timestamps are UTC ISO strings; convert to local time only for display.
- Keep view components on the shared `.panel`, `.record-*`, `.button`, and `.field` patterns in `client/src/style.css`. Shared UI belongs in `client/src/components/`, standalone screens in `client/src/apps/`, and page orchestration stays in `client/src/DashboardApp.jsx`.
- UI styling lives in `client/src/style.css` and uses CSS custom properties for color, type, spacing, and focus. The dashboard has explicit light and dark themes selected from the header (light is the default and the choice persists in `localStorage`), plus `prefers-reduced-motion`, `prefers-reduced-transparency`, and `prefers-contrast: more`. Keep new controls on the shared `.button`, `.field`, and `.panel` patterns and preserve visible keyboard focus.
- Never log or commit credentials, tokens, or message bodies.

## Testing Guidelines

Tests use Node's built-in runner (`node --test`) and `node:assert/strict`. Name files `*.test.js` and run them with `npm test`.

- Suites must run on Windows because credential and API tests use DPAPI through `powershell.exe`.
- Use in-memory SQLite or a temporary `DATA_DIR`; never touch `data/` or a real Gmail account.
- `tests/api.test.js` spawns `server/index.js` on a random free port and always shuts it down; keep that cleanup.
- Cover the behaviors that matter most: strict cutoff boundaries, sender add/remove, duplicate messages, account isolation, sign-out and clear races during downloads, credential handling, migrations, PO parsing, PO lifecycle transitions, assessment scenarios, inventory and assembly validation, delivery receiving, production progress, and API validation/cross-origin rejection.
- Do not weaken tests to accommodate a behavior change without an explicit requirement.

### Regression tests for errors and fixes

Any error, failed workflow, or support report that gets fixed must come with a regression test in the same change.

- Reproduce the failure first when practical: add the test, confirm it fails against the unfixed code, then fix the code and confirm it passes. The test must fail for the original reason, not an unrelated setup error.
- Name the test after the user-visible behavior (for example, "PO correction maps a defined SKU without inventory"), not after the internal function.
- Assert the exact outcome that failed: HTTP status, error message, persisted fields, assessment decision/requirement, or rendered state. Asserting only that a call succeeds does not count.
- Start from the data shape that triggered the bug, using in-memory SQLite or a temporary `DATA_DIR`. Never depend on the contents of `data/`, a live Gmail account, or a specific machine clock.
- If the failure cannot be automated directly (real IMAP, DPAPI, or a browser-only interaction), record the manual reproduction steps in the test or PR and add an automated test at the closest seam that exercises the same logic.
- Keep the regression test alongside the fix; do not defer it to a separate change.

## Commits & Pull Requests

Use short, imperative commit subjects (for example, `Add sender settings`). Pull requests should explain the change, link related work, list the checks run (`npm run lint`, `npm test`, `npm run build`), and include screenshots for UI changes.

## Security & Local Data

- Use Gmail IMAP only. Sign-in uses a Google app password; the normal Google password is never stored or requested.
- The app password lives in `data/gmail-credential.dpapi`, encrypted for the current Windows user with DPAPI, outside SQLite. There is no plaintext fallback; non-Windows platforms must fail.
- Keep the server bound to `127.0.0.1`, validate state-changing requests, and require a trusted `Origin` for every non-read API request.
- Render message content as escaped text only; load no remote email resources or attachments.
- Never download attachments, mark mail read, send mail, or modify Gmail messages.
- Each server start records a fresh UTC cutoff; only mail received strictly after it is eligible. Restarting excludes mail received while stopped.
- Collection is Inbox-only, matches exact addresses (not domains or display names), and polls every 15 seconds without overlapping checks.
- "Clear saved orders" deletes only the connected account's local POs and suppresses older mail on later polls; Gmail is untouched.
- Inventory, assemblies, production runs, deliveries, proof pictures, and receipt pictures are local to the connected account, stored in the same SQLite database, and are never sent to Gmail.
- To erase local state, stop the server and delete `data/`.
