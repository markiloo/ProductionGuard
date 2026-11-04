# PO Checker — purchase order review

A local Windows dashboard that collects purchase orders from Gmail Inbox messages sent by approved addresses, then assesses each request against stock on hand, incoming deliveries, and outstanding production demand. A message qualifies when its subject is `PO` (ignoring case and surrounding spaces). It uses Gmail's IMAP service, so there is no Microsoft Graph, Microsoft account, or Google Cloud app registration.

Each PO email requests exactly one item:

```text
ITEM: ITEM-B
QUANTITY: 100
UNIT: pieces
ETA: 5 days
SUPPLIER: Example Materials Supplier
```

Labels are case-insensitive and extra whitespace is accepted. Quantity must be a positive whole number, the unit can be any label that matches the item's inventory unit, and ETA is a whole number of days or weeks (one week is seven calendar days). Emails with more than one ITEM block stay unverified with a request to submit a separate email for each item; the system never selects or combines items.

Complete POs from approved senders enter **Pending Review**. Unauthorized, incomplete, malformed, or multi-item PO mail goes to the **Unverified** queue with a reason so the manager can correct it. The item is mapped to the inventory SKU case-insensitively; unmapped items and unit mismatches show **Manual Review Required** and do not affect assessments or coverage.

## Review and assessment

The **Orders** view uses a side queue navigation for Pending Review, Unverified, Approved, Ordered / Incoming, Rejected, and all saved POs, newest-first or oldest-first, with search. Each Pending Review PO gets a deterministic assessment: **Recommended**, **Redundant / Overstock**, or **Adjust Quantity**, plus any **Timing Conflict / Expedite Needed**, **Arriving Early**, **Potential Duplicate**, or stockout warnings. Arrival exactly one day before the need date is the desired buffer and is not flagged as early; only arrivals more than one day early show **Arriving Early**. The detail sheet shows the current stock and its last update, incoming deliveries, outstanding demand, projected balances before and after the PO, net requirement, quantity difference, need date, planning end date, and provisional coverage from earlier Pending or Approved POs.

Approve keeps the ETA provisional; reject requires a reason and preserves the history. An Approved PO can be set to **Ordered / Incoming** by uploading a picture of proof that the order is incoming; the picture is stored locally and shown in the PO detail. Ordered POs keep a **Replace proof…** action in the Orders detail so mistakes can be corrected, and the same proof is editable from the linked delivery. Approved POs can **Revise ETA…**, and Ordered POs can **Reschedule delivery…** or change the expected arrival in the delivery edit view; every schedule change requires a correction note that is recorded in the PO history. This fixes the expected arrival (ordered date + ETA) and creates exactly one linked delivery. A Rejected PO can be corrected and resubmitted on the same record. Ordered POs cannot be moved backward.

## Inventory

The **Inventory** view is the item master and stock list for the connected Gmail account. Adding an inventory item defines its SKU, item name, unit, quantity, supplier, reorder level, and notes. The SKU is required and unique per account, becomes the join key for POs, deliveries, assemblies, and demand, and cannot be changed after the item is created. Items at or below their reorder level are marked **Low stock**. Inventory lives in the same local SQLite database and is never sent to Gmail.

## Assemblies

The **Assemblies** view, next to Production, defines what the plant assembles. Each assembly has a name, unit, and a per-unit material list selected from **Inventory**. Production runs scale that list by the planned quantity and lock the result. An assembly cannot be deleted while a production run references it, and an inventory item cannot be deleted while an assembly, run, delivery, or PO uses its SKU. Existing item-definition SKUs are copied into Inventory at zero quantity during the database upgrade, so existing assemblies keep their materials.

## Incoming deliveries

The **Deliveries** view lists incoming and received deliveries with their item SKU, quantity, expected arrival, supplier, and linked PO. Adding a delivery manually asks for an incoming proof picture, which is stored locally and can be replaced from the edit view. Ordering a PO creates one linked delivery automatically. The delivery edit view previews the linked incoming proof and lets you replace it; received linked deliveries keep a **Proof** action for corrections. **Receive** asks you to confirm the quantity physically received and requires a receipt picture; stock increases by the confirmed amount, so missing or extra items are recorded correctly. Received deliveries stay visible with their confirmed quantity and receipt, and their delivery fields cannot be edited; correct stock through inventory instead.

## Receiving station

Opening `http://127.0.0.1:4174/deliveries` loads a restricted receiving interface. It lists only incoming and received deliveries. The only actions are **Receive** (confirm the actual quantity and upload a receipt picture) and viewing a stored receipt. It has no access to add or edit deliveries, inventory, production, settings, or order review. Use the link in the Deliveries view to open it.

## Production schedule

The **Production** view shows existing production runs for the connected account. Each run selects a defined assembly and takes its name, unit, and per-unit materials from Assemblies. Set the planned quantity, status, scheduled date, and optional notes; materials are multiplied by the planned quantity and locked to the run. Change the planned quantity and save to re-derive them. Completing a run removes its demand. Run numbers are generated automatically as sequential `PR-####` values and are read-only. Only outstanding requirements from non-completed runs count as demand. Active work is ordered first, followed by scheduled, on-hold, and completed runs. Production runs are local and never sent to Gmail.

The header has an explicit **Light / Dark** selector. Light is the default, and the choice is remembered in the browser. The **Settings** view, opened from the header next to **Sign out**, holds the sender allowlist and the plant time zone. The plant time zone defaults to **Asia/Manila** and drives provisional ETAs and calendar-day checks.

## Gmail setup

1. Turn on [Google 2-Step Verification](https://myaccount.google.com/security).
2. Create a [Google app password](https://myaccount.google.com/apppasswords) for this local collector. Google may not offer app passwords for some managed or Advanced Protection accounts; see [Google's guidance](https://support.google.com/accounts/answer/185833?hl=en).
3. Install Node.js, run `npm install` and `npm run build` from this directory, then run `launch.bat`. In the dashboard enter your Gmail address and the app password. Do not enter your normal Google password.

Gmail IMAP is enabled automatically for personal accounts according to [Gmail Help](https://support.google.com/mail/answer/7126229?hl=en). The app connects only to `imap.gmail.com:993` over TLS and opens `INBOX` read-only.

## Commands

- `npm run dev`: Express API and Vite dashboard for development.
- `npm run lint`, `npm test`, `npm run build`: checks and production bundle.
- `npm start`: production server at `http://127.0.0.1:4174`.
- `launch.bat`: starts the production server and opens the dashboard after it is ready.

Closing the browser leaves collection running. Stop the server console to end the run. Each server start records a fresh UTC cutoff; only mail received strictly after it can be saved. Restarting excludes mail received while the server was stopped. Adding a sender checks the whole current-run window and promotes that sender's queued unverified mail back into Pending Review. Exact sender addresses are matched, not domains or display names. Inbox-only polling can miss messages moved out before a check.

## Local data and privacy

Saved mail, sender settings, inventory, incoming deliveries, production requirements, PO history, proof and receipt pictures, and assessments' source data live in `data/po-checker.db` (or `DATA_DIR` if set). The app password is in `data/gmail-credential.dpapi`, encrypted for the current Windows user with DPAPI and kept outside SQLite. Sign-out removes this encrypted credential and hides history until that same Gmail address reconnects. To erase all local data, stop the server and delete the `data` directory. These files are ignored by Git.

The **Clear saved orders** button deletes the connected account's locally saved purchase orders and their proof pictures after confirmation. It does not delete or change anything in Gmail. Mail received before the clear time stays excluded from later polls; newer eligible mail can still appear. Incoming deliveries are separate supply records and are not deleted by this action.

**Settings → Clear all data** is a full test reset for the account's business data. It deletes PO requests and review history, proof and receipt pictures, inventory, incoming deliveries, production runs and requirements, and assembly definitions. The Gmail connection, approved senders, and plant time zone are kept, and a fresh clear time prevents older Inbox mail from reappearing. Gmail is never changed. The action asks for confirmation first.

Unauthorized PO mail is stored locally in the unverified queue so the manager can see why it was rejected; it never enters Pending Review, assessments, or provisional coverage unless its sender is added to the allowlist. Attachments are never downloaded, and text is displayed as escaped text that cannot load remote content. The collector does not mark mail read, send mail, or modify messages.

## Troubleshooting

- For an app-password error, verify 2-Step Verification and create a new app password. A changed Google account password can revoke existing app passwords.
- Check that the message is still in Gmail Inbox, arrived after the current server run started, has subject `PO`, and its actual From address is on the allowlist.
- For a PO that stays in Unverified, open it, read the reason, correct the fields or map the SKU, and save. Adding the sender to the allowlist also promotes queued mail.
- For **Manual Review Required**, map the item to an inventory SKU, fix a unit mismatch, or add outstanding production demand for that item.
- A transient connection error is retried on later checks; verify network access to `imap.gmail.com:993`.

See [docs/API.md](docs/API.md) for endpoint shapes.
