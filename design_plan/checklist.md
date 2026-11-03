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

## Item master and SKU update

- [x] Promote `inventory.sku` to the required item code used by POs, incoming deliveries, and production requirements, and keep `inventory.item` as the display name only.
- [x] Require a non-empty SKU on inventory create and edit and enforce a case-insensitive unique index per account, with a specific error for blank or duplicate SKUs.
- [x] Leave existing blank-SKU inventory rows unmapped rather than inventing codes, and flag them as *Manual Review Required — Unmapped Item* until the manager supplies a SKU.
- [x] Use SKU as the case-insensitive join key for PO mapping, deliveries, and requirements; never match records by display name.
- [x] Return the inventory last-update time with assessments and include it in the inventory API response.

## Production requirements update

- [x] Add a `production_requirements` table storing run ID, item SKU, quantity, unit, and demand status (`outstanding` or `completed`).
- [x] Migrate each existing production run's item, quantity, and unit into one requirement row and keep the run header (number, date, status).
- [x] Let the manager add and edit requirement rows per run, requiring a whole-number quantity above zero and a unit matching the item's inventory unit.
- [x] Count only outstanding requirements as demand; completed runs and completed requirements contribute nothing to projections.
- [x] Update `parseProductionInput`, the production form, and `tests/production.test.js` to cover requirement rows.
- [x] Block assessment for an item whose requirement unit mismatches inventory and show *Manual Review Required — Unit Mismatch* naming the run.

## Item definition update

- [x] Add an account-scoped SKU/item master with a required unique SKU, display name, and unit.
- [x] Seed item definitions from existing inventory, deliveries, production demand, and mapped POs during migration.
- [x] Limit inventory create and edit to defined SKUs and derive the item name and unit from the definition; reject undefined SKUs.
- [x] Keep the SKU fixed on existing definitions and inventory rows, and block deleting a definition that is still referenced.
- [x] Add production item definitions with material requirement templates validated against defined SKUs and units.
- [x] Add an Item definition view next to Production with sections for SKUs and for items to make.
- [x] Select a defined production item when creating a production run; take its name, unit, and default requirements from the definition.
- [x] Treat production item requirement templates as per-unit quantities, scale each run by its planned quantity, and lock the derived requirement rows against per-run edits.
- [x] Keep per-run requirement rows derived from the definition instead of accepting client-supplied quantities.
- [x] Block deleting a production item that is used by a production run.
- [x] Allow a PO to map to a defined SKU even before that SKU has an inventory record, showing *Manual Review Required — Missing Inventory* until stock is added.
- [x] Return correction validation errors to the correction form instead of reporting a successful save.
- [x] Add a regression test for mapping a PO to a defined SKU before inventory exists, the Missing Inventory assessment, the quantity decision after adding stock, and the unit-mismatch rejection.

## Purchase order intake update

- [x] Separate validation result (valid or unverified with a reason) from workflow state (Pending Review, Approved, Ordered/Incoming, Rejected, Unverified), and migrate existing `valid` and `needs_review` rows.
- [x] Add one ordered migration for PO ID, workflow state, mapped SKU, ETA days, expected arrival, and provisional flag; never edit an applied migration.
- [x] Assign a per-account sequential PO ID (`PO-0001`) at ingestion and keep it through correction, rejection, resubmission, and delivery linking.
- [x] Keep subject matching trimmed, case-insensitive, and exactly `PO`, and keep message ID as the only duplicate protection.
- [x] Fetch Inbox mail with subject `PO` from every sender, then match the allowlist locally so unauthorized mail is retained in the unverified queue with a reason instead of dropped.
- [x] Accept any unit label and any whole-number ETA in days or weeks, normalize weeks to seven calendar days, and update the parser tests that restrict units to `kg|units` and ETA to `1 week|2 weeks`.
- [x] Detect more than one ITEM block in one email and route it to unverified with "submit a separate email for each item"; never select or combine items.
- [x] Route missing fields, malformed values, unauthorized senders, and multi-item mail to unverified with the specific reason.
- [x] Keep unverified records out of Pending Review, assessments, and provisional coverage.
- [x] Map the email item to exactly one inventory SKU case-insensitively, and show *Manual Review Required — Unmapped Item* when no SKU matches.
- [x] Validate PO and delivery units against the mapped item's inventory unit, show *Manual Review Required — Unit Mismatch* naming the conflicting record and expected unit, and never convert units.
- [x] Preserve the original body, sender, message ID, receipt time, and PO ID through every correction and state change.

## Incoming deliveries update

- [x] Add an account-scoped incoming delivery record: item SKU, quantity, unit, expected arrival, supplier, status, received time, and linked PO ID.
- [x] List, add, and edit unreceived deliveries, and show received deliveries read-only with their received time.
- [x] Create exactly one delivery when a PO becomes Ordered/Incoming and update that record on later edits instead of creating another.
- [x] Receive a delivery in one transaction that adds its quantity to on-hand stock and removes it from incoming supply.
- [x] Make receiving idempotent so retries, double clicks, and refreshes never add stock twice.
- [x] Block item, quantity, and status edits on received deliveries and direct stock corrections to inventory editing.
- [x] Validate delivery quantity, unit, and expected arrival date.

## PO workflow update

- [x] Allow Pending Review → Approved or Rejected.
- [x] Allow Approved → Ordered/Incoming or Rejected.
- [x] Require a non-empty rejection reason and store the reason, time, and history with the PO.
- [x] Allow Rejected → Pending Review after corrections pass validation, preserving PO ID, original email, receipt time, and rejection history.
- [x] Block every other transition, including Pending Review → Ordered/Incoming, with a clear error.
- [x] Keep approval provisional: no linked incoming supply and no fixed arrival.
- [x] Fix expected arrival as ordered date + ETA duration and create the single linked delivery on ordering.
- [x] Allow Pending Review field corrections with revalidation and reassessment, and require Approved revisions to be rejected and resubmitted.
- [x] Prevent Ordered/Incoming POs from being rejected or moved backward, tracking receipt separately.

## ETA and daily refresh update

- [x] Store a plant time zone setting, defaulting to Asia/Manila, and use it for every calendar-day decision.
- [x] Compute provisional arrivals as plant-local today plus ETA duration and label them as estimates until ordering.
- [x] Advance provisional arrivals at each plant-local date change and reassess Pending Review and Approved POs.
- [x] Apply any missed date change on startup before serving assessments, and keep ordered arrival dates fixed.
- [x] Reassess all remaining Pending Review POs after any inventory, delivery, requirement, PO-state, or ETA change, and include the updated decision in the API response.

## Assessment engine update

- [x] Add a pure, deterministic assessment module taking item stock and update time, unreceived deliveries, outstanding requirements, and earlier POs, and returning the decision, requirement, difference, balances, and warnings.
- [x] Compute assessments on read and inside every mutating request, and never persist decision flags.
- [x] Project the balance for one item at the evaluated PO's arrival and at every outstanding production date on or after it, adding supply due by the date and subtracting demand due by the date, and report the last outstanding run as the planning end date.
- [x] Include demand and supply due on or before arrival even when arrival follows the last run.
- [x] Compute net requirement as the largest cumulative deficit at arrival and later run dates, `max(0, -min B(t))`, keeping earlier deficits as timing warnings that never increase the requirement.
- [x] Decide *Redundant / Overstock* for a zero requirement, *Recommended* for an exact match, and *Adjust Quantity* otherwise, and report the requirement and PO quantity minus requirement.
- [x] Show *Manual Review Required — No Scheduled Demand* and skip requirement math when the item has no outstanding runs.
- [x] Apply a one-calendar-day arrival buffer, treating arrival on the run date or later as *Timing Conflict / Expedite Needed*.
- [x] Report the missed run date and the projected balance or stockout separately from the quantity decision.
- [x] Report *Arriving Early* with the first need date and days early when arrival precedes the first run needing the quantity.
- [x] Count earlier pending or approved POs as provisional coverage only on dates on or after their expected arrival, ordered by receipt time then ascending PO ID.
- [x] Report *Potential Duplicate / Covered by Pending or Approved PO* with the covered amount and count each PO once.
- [x] Show balances before and after the evaluated PO, with provisional contributions shown separately.
- [x] Give unmapped, invalid, or unit-mismatched records *Manual Review Required* and no provisional coverage.

## Assessment verification update

- [ ] Add unit tests that run each PRD scenario from its exact stated data and assert balances, requirement, difference, decision, and warnings.
- [ ] Worked shortage: 50 on Day 4 and 30 on Day 10 → requirement 80; an 80-unit PO on Day 3 → balances 30 and 0, *Recommended* + *Arriving Early*, Day 4 need, one day early.
- [ ] T-02: 100 stock, 50 due Day 3, demand 120 Day 4 and 80 Day 10 → 30 and −50 before; 50-unit PO on Day 5 → 30 and 0, Day 10 need, five days early.
- [ ] T-03: requirement 100 with 100, 50, and 150-unit POs → *Recommended*, *Adjust −50*, *Adjust +50*; zero requirement → *Redundant*; no runs → *Manual Review — No Scheduled Demand*.
- [ ] T-03 late supply: zero stock, 100 demand Day 4, 100 delivery Day 5, 100-unit PO Day 6 → requirement 0, difference +100, *Redundant*, Day 4 conflict warning, Day 6 balance +100.
- [ ] T-04: Day 2 demand of 100 with a five-day PO from Day 0 → *Recommended* + conflict at Day 2, balance −100; Day 9 arrival passes, Day 10 warns, Day 11 conflicts at −100.
- [ ] T-05: zero stock, Day 10 demand 100, two 100-unit POs due Day 9 → first *Recommended*, second *Redundant* with 100 coverage; approving or ordering keeps that, and rejecting the first makes the second *Recommended*.
- [ ] Verify unit mismatch blocks classification and coverage, receiving twice adds stock once, and a daily ETA change triggers a new warning while ordered dates stay fixed.

## Functional API update

- [x] Add account-scoped endpoints for Pending Review and unverified lists with ascending and descending received-time sort, PO detail with its assessment breakdown, and PO corrections.
- [x] Assign PO IDs server-side, reject client-supplied IDs, and enforce per-account uniqueness.
- [x] Add approve, reject, order, and resubmit endpoints that enforce allowed transitions, the rejection reason, and current state.
- [x] Add incoming-delivery list, create, update, and receive endpoints, plus SKU mapping and SKU validation.
- [x] Recompute affected assessments inside the same request and return the updated decision so the dashboard never shows stale flags.
- [x] Keep request validation, trusted-origin checks, and account scoping on every new endpoint, with tests for cross-account access and invalid transitions.

## Functional dashboard update

- [x] Show workflow status and assessment decision as separate labelled values on each PO, with warnings and the last inventory update.
- [x] Add an assessment breakdown to PO detail: on-hand, incoming with ETA and a provisional or fixed label, demand by date, balances before and after, need date, requirement, difference, and coverage.
- [x] Add Approve and Reject actions with confirmation and a mandatory rejection reason, showing success or error feedback and the updated status.
- [x] Add an Order action for approved POs and a Receive action for incoming deliveries.
- [x] Add an unverified queue with reasons and a correction form that can map a SKU and revalidate the same record.
- [x] Add an incoming-deliveries view with add, edit, and receive.
- [x] Add received-time sort order plus status, item, and date search and filter for POs and inventory, and refresh assessments after any save without a full reload.
- [x] Add a manual Refresh action that recomputes and reloads the PO assessment list.
- [x] Add a confirmed Clear all data action in Settings that removes account business data and senders, keeps the Gmail connection and plant time zone, and suppresses older Inbox mail.
- [x] Replace the Orders status dropdown with a side queue nav listing Pending Review, Unverified, Approved, Ordered / Incoming, Rejected, and All orders with counts.
- [x] Keep edit sheets open when clicking the backdrop; close them only through Cancel, the close button, or Escape.
- [x] Align the Orders queue nav and PO list panel on their top and bottom edges, with the nav footer and list pagination pinned to the shared bottom.
- [x] Animate the active-view underline so it slides between Orders, Deliveries, Inventory, Production, and Item definition.
- [x] Replace the Run started metric with a live countdown to the next Gmail inbox check, showing seconds until the collector's 15-second poll.
- [x] Move the sender allowlist and plant time zone into a Settings view opened from a header button next to Sign out.
