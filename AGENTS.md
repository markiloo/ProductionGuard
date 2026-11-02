# Repository Guidelines

## Project Structure & Module Organization

This repository currently contains the implementation plan in `design_plan/checklist.md`; application source, tests, and package scripts have not yet been created. The planned app uses Node.js, Express, React, JavaScript, Vite, and SQLite. Organize the API and collector in `server/`, React code in `client/src/`, tests in `tests/` or as `*.test.js` beside modules, and migrations in `server/db/migrations/`. Keep generated output, local databases, and credentials out of source control.

## Build, Test, and Development Commands

No `package.json` or runnable commands exist yet. Add npm scripts during scaffolding; intended commands are:

- `npm install` installs dependencies from the lockfile.
- `npm run dev` starts the local development server and Vite dashboard.
- `npm test` runs automated tests.
- `npm run build` creates the production dashboard bundle.
- `npm start` serves the production app on loopback.

Run from the repository root; these commands become available after their scripts are added.

## Coding Style & Naming Conventions

Use JavaScript ES modules, `.js` for server code, and `.jsx` for React components. Use two-space indentation, `camelCase` for functions and variables, `PascalCase` for React components, and descriptive lowercase filenames. Document shared data shapes with JSDoc. Never commit secrets; add a JavaScript/React linter when scaffolding.

## Testing Guidelines

The test framework and coverage target are not yet selected. Test collection cutoffs, sender changes, duplicate messages, account isolation, and API behavior. Name tests `*.test.js` and run them with `npm test`.

## Commits & Pull Requests

Git history contains only initialization commits; no convention is established. Use short, imperative commit subjects (for example, `Add sender settings`). Pull requests should explain changes, link related work, list checks run, and include screenshots for UI changes.

## Security & Local Data

The app reads Outlook mail through Microsoft Graph. Request only necessary delegated permissions; keep tokens in the Windows-protected cache. Never log or commit tokens or message bodies. Bind the server to loopback, validate state-changing requests, render email content as text, and ignore local configuration, caches, and databases.
