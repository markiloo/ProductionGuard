# Outlook Email Collector — Implementation Checklist

Build a local Windows application using Node.js, Express, React, TypeScript, Vite, and SQLite. Connect one personal Outlook.com account and collect Inbox emails from an editable list of exact sender addresses.

## 1. Project foundation

- [ ] Initialize the Node.js project with a lockfile and TypeScript configuration.
- [ ] Set up Express for the local API and React with Vite for the dashboard.
- [ ] Define shared types for connection status, collection runs, sender settings, emails, and paginated responses.
- [ ] Add development, test, production build, and production start scripts.
- [ ] Serve the production React build and API from the same loopback origin.
- [ ] Add configuration validation, structured error handling, and logs that exclude tokens and message contents.
- [ ] Ignore dependencies, build output, local configuration, databases, and token caches in Git.

## 2. Local storage

- [ ] Set up SQLite using `better-sqlite3` and versioned schema initialization.
- [ ] Store account identity, collection runs, allowed sender addresses, and collected emails.
- [ ] Associate saved emails and sender settings with their Microsoft account.
- [ ] Store UTC timestamps; convert them to the PC's timezone for display.
- [ ] Enforce uniqueness for normalized sender addresses per account and immutable message IDs per account.
- [ ] Store sender, recipients, subject, received time, preview, plain-text body, attachment indicator, and collecting run for each saved email.
- [ ] Retain history and sender settings across restarts; keep Microsoft tokens outside SQLite.

## 3. Microsoft sign-in and first-run setup

- [ ] Create setup screens for entering and saving a Microsoft application client ID.
- [ ] Document application registration for personal Microsoft accounts, public-client flows, and delegated `Mail.Read` permission. Do not require a client secret.
- [ ] Implement device-code sign-in with `@azure/msal-node`, including verification link, user code, expiry, cancellation, and error states.
- [ ] Persist tokens using `@azure/msal-node-extensions` with Windows encryption scoped to the current user; do not fall back to plaintext storage.
- [ ] Restore sign-in silently when possible and show when interactive sign-in is required.
- [ ] Implement sign-out, cancel active collection, and hide saved history until the same account reconnects.
- [ ] Ensure account changes cannot expose another account's history or reuse its sender list.

## 4. Sender settings

- [ ] Add a dashboard panel to list, add, and remove exact sender email addresses.
- [ ] Trim input, validate address format, normalize for case-insensitive comparison, and reject duplicates.
- [ ] Match the actual message `from.emailAddress.address`; never match by display name.
- [ ] Treat multiple addresses as an allowlist: a message may match any listed address.
- [ ] Collect nothing when the list is empty and display “Add a sender to begin collecting.”
- [ ] Persist settings and use them automatically on subsequent launches.
- [ ] Adding an address triggers a collection check covering the current run's full time window.
- [ ] Removing an address stops further collection from it without deleting saved messages.
- [ ] Recheck the current account and allowlist before inserting fetched messages so an in-flight request cannot save mail after sign-out or sender removal.

## 5. Collection lifecycle and Microsoft Graph

- [ ] Record a fresh UTC cutoff immediately when the server starts, before authentication or first-run setup completes.
- [ ] Collect only messages with `receivedDateTime` strictly greater than the current startup cutoff.
- [ ] Keep that cutoff unchanged through browser refreshes, reconnects, and sender changes.
- [ ] Establish a new cutoff after every server restart; exclude emails received while the server was stopped.
- [ ] Begin collection automatically when authenticated and at least one sender is configured.
- [ ] Poll Microsoft Graph's Inbox endpoint every 15 seconds without overlapping polls.
- [ ] Apply received-time and exact sender filters in Graph queries; split sender queries if necessary to avoid oversized requests.
- [ ] Follow every result page and request immutable message IDs consistently.
- [ ] Recheck the active run's time window so temporary failures, delayed visibility, and newly added senders can be recovered.
- [ ] Verify received time and sender locally before saving; retrieve full plain-text content only for newly discovered eligible messages.
- [ ] Deduplicate repeated results and overlapping sender queries using the database constraint.
- [ ] Respect `Retry-After`, retry transient failures with backoff, and distinguish authentication failures from connection errors.
- [ ] Track the last successful complete collection check and current error state.
- [ ] Shut down gracefully and prevent a second collector process from running against the same local app instance.
- [ ] Keep saved messages when their Outlook originals are moved or deleted.
- [ ] Do not download attachments, mark messages read, send mail, or modify Outlook messages.

## 6. Local API and dashboard

- [ ] Add typed API endpoints for connection status, setup, sign-in/sign-out, sender management, email listing/search, and email details.
- [ ] Validate requests and bound pagination parameters.
- [ ] Bind only to loopback and protect state-changing requests against cross-origin access.
- [ ] Display connection status, startup cutoff, last successful check, current-run email count, and total saved count.
- [ ] Show a paginated newest-first email list with sender, subject, received time, preview, and attachment indicator.
- [ ] Search saved subjects, sender addresses/names, and message text.
- [ ] Provide current-run and all-history filters scoped to the connected account.
- [ ] Show full plain-text body and recipient details in a message detail panel.
- [ ] Render email content as escaped text without executing HTML or loading remote email resources.
- [ ] Refresh status and email results automatically while preserving active search, pagination, and message selection where possible.
- [ ] Include first-run, loading, empty, disconnected, expired sign-in, and recoverable error states.
- [ ] Make the dashboard responsive and keyboard accessible, with labeled controls and visible focus states.

## 7. Windows launch and documentation

- [ ] Provide a Windows launcher that starts the production server and opens the dashboard once it is ready.
- [ ] Explain that closing the browser leaves collection running and stopping the server ends the run.
- [ ] Document prerequisites, dependency installation, Microsoft registration, development, build, launch, and troubleshooting.
- [ ] Document local data locations, retained history, sign-out behavior, and how to remove stored local data manually.
- [ ] Explain that Inbox-only polling may miss messages moved elsewhere before a check.
- [ ] State that sender matching uses exact addresses, not domains, and newly added senders include eligible messages from the current run.

## 8. Automated verification

- [ ] Test that messages before or exactly at startup are excluded and messages after startup are eligible.
- [ ] Test that reconnecting and refreshing preserve the cutoff, while restarting creates a new one and retains history.
- [ ] Test the empty allowlist, multiple senders, case differences, whitespace, invalid addresses, duplicates, and misleading display names.
- [ ] Test adding a sender includes current-run messages but excludes earlier messages.
- [ ] Test sender removal and sign-out during an active poll prevent stale results from being inserted.
- [ ] Test pagination, duplicate results, delayed visibility, and retrieval of full text only for new eligible messages.
- [ ] Test connection loss, throttling, transient server errors, authentication expiry, and recovery without duplicate inserts.
- [ ] Test account isolation, persistence after restart, API validation, and cross-origin request protection.
- [ ] Test dashboard search, current-run/history filters, message details, local time display, and safe text rendering.
- [ ] Run TypeScript checks, automated tests, and a production build.

## 9. Live acceptance check

- [ ] Complete application registration and sign in with a personal Outlook.com account.
- [ ] Confirm an existing message is not collected.
- [ ] Add an allowed sender and confirm a new message from that address appears with readable full text.
- [ ] Confirm a new message from an unlisted address is excluded.
- [ ] Add that previously unlisted address and confirm its message from the current run is collected.
- [ ] Remove a sender and confirm saved history remains while later mail from it is excluded.
- [ ] Restart the app and confirm history and sender settings remain, with a fresh cutoff.
- [ ] Confirm mail received while the app was stopped stays excluded.
- [ ] Confirm closing and reopening the browser does not start a new collection run.
- [ ] Verify the Windows launcher and built dashboard work together.

## Completion boundaries

- One personal Outlook.com account connected at a time.
- Inbox only; exact sender addresses only.
- Local application and retained local history.
- Attachment indicators only; no attachment downloads.
- No hosted deployment, sending, Outlook modifications, or purchase-order processing.
