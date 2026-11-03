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
- `server/po.js` — `PO` subject matching and PO field parsing.
- `server/rules.js` — Exact sender address normalization and validation.
- `server/types.js` — JSDoc typedefs for API and data shapes.
- `client/src/main.jsx` — The whole dashboard UI; `client/src/style.css` holds theme and layout CSS.
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

`npm run lint` currently fails on the unused `client/src/components/ui/button.jsx` (`ButtonPrimitive` is only referenced in JSX, which the current ESLint config does not track). Fix or remove that file rather than ignoring the failure, or configure a React JSX plugin.

## Design Reviews

UI/UX work uses the imported `apple-design` skill at `.opencode/skills/apple-design/SKILL.md`. Load it for design reviews, HIG compliance and accessibility audits, dark-mode checks, and requests to make the dashboard feel less generic. The skill routes to Apple's guideline pages under `.opencode/skills/apple-design/references/hig/` and to the cross-platform translation in `references/cross-platform.md`. Treat the generated HIG pages as read-only references; refresh them with `node .opencode/skills/apple-design/scripts/pull-hig.mjs` only when explicitly asked.

## Coding Style & Naming Conventions

- Use ES modules, `.js` for server code, `.jsx` for React components, and two-space indentation.
- Use `camelCase` for functions and variables, `PascalCase` for React components, and descriptive lowercase filenames.
- Document shared API and stored-data shapes with JSDoc in `server/types.js`.
- Keep SQL parameterized and scope every query to `account_id`.
- Prefix client API calls with `/api`; the Vite dev server proxies them to port 4174.
- Stored timestamps are UTC ISO strings; convert to local time only for display.
- The dashboard is intentionally a single file using `React.createElement` for the root render. New UI work should stay consistent with that file and the existing CSS classes unless a refactor is explicitly requested.
- Never log or commit credentials, tokens, or message bodies.

## Testing Guidelines

Tests use Node's built-in runner (`node --test`) and `node:assert/strict`. Name files `*.test.js` and run them with `npm test`.

- Suites must run on Windows because credential and API tests use DPAPI through `powershell.exe`.
- Use in-memory SQLite or a temporary `DATA_DIR`; never touch `data/` or a real Gmail account.
- `tests/api.test.js` spawns `server/index.js` on a random free port and always shuts it down; keep that cleanup.
- Cover the behaviors that matter most: strict cutoff boundaries, sender add/remove, duplicate messages, account isolation, sign-out and clear races during downloads, credential handling, migrations, PO parsing, and API validation/cross-origin rejection.
- Do not weaken tests to accommodate a behavior change without an explicit requirement.

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
- To erase local state, stop the server and delete `data/`.
