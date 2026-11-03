# Gmail Inbox Collector — Implementation Checklist

Build a local Windows application using Node.js, Express, React, JavaScript, Vite, and SQLite. Connect one Gmail account through IMAP with a Google app password and collect subject-`PO` Inbox emails from an editable list of exact sender addresses. No Microsoft Graph, Entra registration, or Microsoft sign-in is required.

## 1. Project foundation

- [x] Keep the Node.js ES module project, lockfile, Express API, React/Vite dashboard, lint, test, build, development, and production scripts.
- [x] Serve the production dashboard and API from one loopback origin.
- [x] Document connection, collection run, sender, email, and pagination shapes with JSDoc.
- [x] Validate configuration and requests, use structured errors, and keep credentials and message content out of logs.
- [x] Ignore dependencies, build output, local credentials, and databases in Git.

## 2. Local storage and security

- [x] Use versioned SQLite schema initialization for account identity, runs, sender settings, and saved emails.
- [x] Scope sender settings and saved emails to the connected Gmail address; preserve each account's history across restarts.
- [x] Enforce case-insensitive sender uniqueness and stable message-ID uniqueness per account.
- [x] Save UTC received time, sender, recipients, subject, preview, plain-text body, attachment indicator, and collection run; display times in the PC's timezone.
- [x] Store the Gmail app password outside SQLite with Windows current-user encryption; never fall back to plaintext storage.
- [x] Clear the saved credential on sign-out while retaining account-scoped history.

## 3. Gmail connection and setup

- [x] Replace Microsoft setup and device-code screens with Gmail address and app-password setup.
- [x] Explain Google 2-Step Verification and how to create an app password; do not ask for the normal Google password.
- [x] Connect to `imap.gmail.com:993` with TLS, verify access to `INBOX`, and show connection and recoverable error states.
- [x] Restore the encrypted credential after restart and begin collection when authenticated and senders are configured.
- [x] Remove Microsoft Graph and MSAL packages, code paths, API routes, and registration instructions.
- [x] Prevent account changes or in-flight requests from exposing another account's saved history or sender list.

## 4. Sender settings

- [x] List, add, and remove exact sender email addresses in the dashboard.
- [x] Trim and validate addresses, compare without regard to case, and reject duplicates.
- [x] Match the actual parsed `From` address, never the display name or domain.
- [x] Collect nothing for an empty allowlist and show “Add a sender to begin collecting.”
- [x] Persist settings and use them on later launches.
- [x] On addition, recheck the full current-run window; on removal, stop further collection without deleting saved mail.
- [x] Recheck active account and allowlist before inserting after an asynchronous IMAP request.

## 5. Collection lifecycle and IMAP

- [x] Record a new UTC cutoff when the server starts, before Gmail setup completes.
- [x] Collect only Inbox messages received strictly after the cutoff. Keep the cutoff through browser refreshes, reconnects, and sender changes; create a fresh one after restart.
- [x] Poll every 15 seconds without overlapping checks. Recheck the whole active-run window to recover delayed visibility, errors, and newly added senders.
- [x] Use IMAP date and sender search to limit results, then verify exact sender and received time locally. IMAP date search has day precision.
- [x] Use stable Gmail message IDs, follow all search results, and deduplicate in SQLite.
- [x] Fetch full text only for new eligible messages. Retrieve text MIME parts only, not attachments; show an attachment indicator.
- [x] Retry temporary connection failures with backoff and distinguish bad credentials from network errors.
- [x] Track last successful complete check and current error; cancel in-flight work on sign-out and shut down gracefully.
- [x] Prevent a second collector using the same data directory; retain saved messages when originals move or disappear.
- [x] Do not mark mail read, download attachments, send mail, or alter Gmail messages.

## 6. API and dashboard

- [x] Add a confirmed Clear saved inbox action for the connected account; remove local saved mail without changing Gmail.
- [x] Keep messages received before the clear time from reappearing during later polls while collecting newer eligible mail.
- [x] Provide documented local endpoints for status, Gmail connection/sign-out, sender settings, email list/search, and message details.
- [x] Validate requests, bound pagination, bind to loopback, and reject cross-origin writes.
- [x] Display connection status, startup cutoff, last check, current-run count, and total saved count.
- [x] Show newest-first paginated emails with sender, subject, received time, preview, and attachment indicator.
- [x] Search saved subjects, sender addresses/names, and body text; filter current run or all history for the connected account.
- [x] Show full plain-text body and recipient details with escaped rendering; load no remote email resources.
- [x] Refresh automatically while preserving search, page, and selection; include loading, empty, disconnected, and recoverable error states.
- [x] Keep the dashboard responsive and keyboard accessible with labels and visible focus.

## 7. Windows launch and documentation

- [x] Keep a Windows launcher that starts the production server and opens the dashboard when ready.
- [x] Document prerequisites, installation, Google app-password setup, development, build, launch, and troubleshooting.
- [x] Document local data, encrypted credential location, history retention, sign-out, and manual data removal.
- [x] Explain browser close versus server stop and the possibility of missing mail moved from Inbox before a check.
- [x] State exact sender matching and how adding a sender includes eligible mail from the current run.

## 8. Automated verification

- [ ] Cover strict cutoff, refresh/reconnect versus restart, and persistence of history and sender settings.
- [ ] Cover empty and multiple sender lists, case, whitespace, invalid addresses, duplicates, and misleading display names.
- [ ] Cover adding/removing senders during an active poll and sign-out/account switch during token or IMAP work.
- [ ] Cover IMAP search, all results, stable IDs, duplicate results, delayed visibility, and text-only MIME retrieval.
- [ ] Cover connection loss, bad credentials, transient errors, recovery, and no duplicate inserts.
- [ ] Cover API validation, cross-origin protection, pagination, search, run/history filters, message details, local time, and safe text rendering.
- [x] Run lint, automated tests, and production build.

## 9. Live acceptance

- [x] Connect a personal Gmail account using a Google app password.
- [x] Confirm an existing Inbox message is excluded.
- [x] Add an allowed sender and confirm a new message appears with readable full text.
- [x] Confirm an unlisted sender's new message is excluded, then add that sender and confirm the current-run message appears.
- [x] Remove a sender and confirm saved history remains while later mail from it is excluded.
- [x] Restart and confirm retained history/settings, a fresh cutoff, and exclusion of mail received while stopped.
- [x] Confirm closing and reopening the browser preserves the run; verify the Windows launcher with the built dashboard.

## Completion boundaries

- One Gmail account connected at a time; Inbox only; exact sender addresses only.
- Local retained history and attachment indicators only.
- No hosted deployment, sending, mailbox changes, or attachment downloads.

## Purchase order update

- [x] Save approved-sender Gmail Inbox messages only when the trimmed, case-insensitive subject is `PO`.
- [x] Parse `ITEM`, `QUANTITY`, `UNIT`, `ETA`, and `SUPPLIER`; retain malformed PO mail with a review reason.
- [x] Convert previously saved PO messages, hide unrelated legacy mail from the PO view, and show structured fields in the dashboard and API.
- [x] Clear locally saved POs without changing Gmail, and document the new behavior.

## Inventory update

- [x] Add an account-scoped Inventory view with add and edit forms.
- [x] Store item name, SKU, quantity, unit, supplier, reorder level, and notes in SQLite.
- [x] Validate inventory input and scope inventory API access to the connected account.
- [x] Document the inventory endpoints, fields, and local-storage behavior.

## Production update

- [x] Add an account-scoped Production view for existing schedules and runs.
- [x] Store run number, item, quantity, unit, status, scheduled date, and notes in SQLite.
- [x] Allow adding and editing production runs with unique run numbers per account.
- [x] Document the production endpoints, fields, and local-storage behavior.
- [x] Delete inventory items and production runs from their edit sheets after confirmation.
- [x] Auto-generate sequential `PR-####` production run numbers.
