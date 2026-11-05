# Repository Guidelines

## Project Overview

PO Checker is a local, Windows-only dashboard that collects purchase orders from Gmail Inbox messages. It connects to `imap.gmail.com:993` over TLS using a Google app password, watches an allowlist of exact sender addresses, keeps messages whose trimmed, case-insensitive subject is `PO`, and parses `ITEM`, `QUANTITY`, `UNIT`, `ETA`, and `SUPPLIER` into SQLite. Malformed PO mail is retained with `po_status = 'needs_review'`.

The stack is Node.js ES modules, Express 5, React 19, Vite 6, Tailwind CSS v4 with shadcn tokens, better-sqlite3, and imapflow. There is no Microsoft Graph, MSAL, or Google Cloud project; do not reintroduce them.

## Project Structure & Module Organization

- `server/index.js` — Express app, API routes, static `dist/` serving, startup and graceful shutdown.
- `server/auth.js` — Gmail IMAP sign-in check and DPAPI credential encryption through PowerShell.
- `server/collector.js` — Singleton wiring that exposes the collector to the API and records the startup cutoff.
- `server/collector-core.js` — Collection engine: cutoff filtering, IMAP search, text-only MIME download, race checks, dedup, insert.
- `server/db.js` — SQLite connection, single-instance data-directory lock, ordered schema migrations.
- `server/email-queries.js` — Account-scoped list/search/pagination, detail lookup, and clear.
- `server/inventory.js` — Account-scoped inventory validation, list, create, and update.
- `server/production.js` — Account-scoped production run validation, list, create, and update.
- `server/po.js` — `PO` subject matching and PO field parsing.
- `server/rules.js` — Exact sender address normalization and validation.
- `server/types.js` — JSDoc typedefs for API and data shapes.
- `client/src/main.jsx` — Entry point and route selection for the dashboard, receiving station, and production floor.
- `client/src/DashboardApp.jsx` — Main dashboard state, data loading, and orchestration.
- `client/src/apps/` — `ReceivingApp.jsx` and `ProductionRunsApp.jsx` standalone screens.
- `client/src/views/` — Orders, Inventory, Production, Assemblies, Deliveries, and Settings panels.
- `client/src/dialogs/` — Sheet dialogs for orders, inventory, production, deliveries, and floor progress.
- `client/src/components/` — Shared UI atoms such as Brand, ThemeToggle, chips, ToastStack, ProductionRow, RunStrip, and SearchIcon.
- `client/src/lib/` — `api.js`, `format.js`, and `constants.js`; `client/src/hooks/useSheetDialog.js` holds shared modal behavior.
- `client/src/style.css` — Theme and layout CSS.
- `tests/` — `node:test` suites (`*.test.js`) beside each other, not beside modules.
- `design_plan/checklist.md` — Implementation checklist; `docs/API.md` — endpoint reference; `README.md` — setup, privacy, troubleshooting.
- `dist/` is built output, `data/` holds the local database, lock, and encrypted credential, and `node_modules/` holds dependencies. All three are gitignored.

Database migrations are embedded in `server/db.js` as an ordered array; add new schema changes as a new array entry, never by editing an already-applied migration.

## Build, Test, and Development Commands

Run everything from the repository root:

- `npm install` installs dependencies from the lockfile.
- `npm run dev` runs the Express API (`node --watch`) and the Vite dashboard together on loopback.
- `npm run lint` lints `server`, `client/src`, and `vite.config.js`.
- `npm test` runs all suites with the built-in Node test runner.
- `npm run build` creates the production dashboard bundle in `dist/`.
- `npm start` serves the production app at `http://127.0.0.1:4174`.
- `launch.bat` starts the production server, waits for `/api/status`, then opens the dashboard.

`npm run lint` includes `eslint-plugin-react`'s `jsx-uses-vars`, so components referenced only in JSX are not reported as unused.

## Design Reviews

UI/UX work uses the imported `apple-design` skill at `.agents/skills/apple-design/SKILL.md`. Load it for design reviews, HIG compliance and accessibility audits, dark-mode checks, and requests to make the dashboard feel less generic. The skill routes to Apple's guideline pages under `.agents/skills/apple-design/references/hig/` and to the cross-platform translation in `references/cross-platform.md`. Treat the generated HIG pages as read-only references; refresh them with `node .agents/skills/apple-design/scripts/pull-hig.mjs` only when explicitly asked.

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
- Cover the behaviors that matter most: strict cutoff boundaries, sender add/remove, duplicate messages, account isolation, sign-out and clear races during downloads, credential handling, migrations, PO parsing, and API validation/cross-origin rejection.
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
- Inventory and production runs are local to the connected account, stored in the same SQLite database, and are never sent to Gmail.
- To erase local state, stop the server and delete `data/`.
