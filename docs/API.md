# Local API

All routes are served from the same loopback origin as the dashboard. State-changing calls require a trusted browser `Origin`; the development Vite origins on ports 5173 are also allowed. JSON request bodies use `Content-Type: application/json`. Every route is scoped to the connected Gmail account.

| Method and route | Request | Response |
| --- | --- | --- |
| `GET /api/status` | None | `{ auth, collection, senders: string[], totalCount, counts: Record<string, number>, plantTimeZone, today, features: { clearSavedInbox: boolean } }` |
| `POST /api/setup` | `{ email: string, appPassword: string }` | `{ ok: true }` after Gmail IMAP connection succeeds |
| `POST /api/sign-out` | `{}` | `{ ok: true }` |
| `POST /api/senders` | `{ address: string }` | `{ ok: true }`; rejects invalid or duplicate addresses and promotes queued unauthorized mail into Pending Review |
| `DELETE /api/senders/:address` | URL-encoded exact address | `{ ok: true }` |
| `DELETE /api/emails` | None | `{ ok: true, deletedCount: number }`; clears the connected account's saved POs and proof pictures and excludes mail received before the clear time from later polls; Gmail and incoming deliveries are unchanged |
| `GET /api/pos` | `state=pending_review\|unverified\|approved\|ordered\|rejected\|all` (default `pending_review`), `sort=asc\|desc` (received time), `q`, `limit`, `offset` | `{ items: PurchaseOrder[], total, counts: Record<string, number> }`, each with an assessment summary |
| `POST /api/pos` | `{ item, mappedSku?, quantity, unit, etaDays, supplier }` | `{ ok: true, po }`; creates a manual Pending Review PO with a server-assigned PO ID; manager entries do not require an approved sender |
| `GET /api/pos/:poId` | PO ID such as `PO-0001` | `PurchaseOrder` with full `assessment`, `events`, linked `delivery`, and `proof` metadata |
| `PATCH /api/pos/:poId` | `{ item, mappedSku, quantity, unit, etaDays, supplier }` | `{ ok: true, po }`; corrects an Unverified, Pending Review, or Rejected PO, preserving its identity and history |
| `PATCH /api/pos/:poId/schedule` | `{ etaDays, note }` for Approved, or `{ expectedArrival, note }` for Ordered / Incoming | `{ ok: true, po }`; revises the ETA or delivery date, updates the linked delivery, and records the note in the PO history |
| `POST /api/pos/:poId/approve` | `{}` | `{ ok: true, po }`; Pending Review → Approved |
| `POST /api/pos/:poId/reject` | `{ reason: string }` | `{ ok: true, po }`; Pending Review or Approved → Rejected; reason required |
| `POST /api/pos/:poId/order` | Raw image body (`image/jpeg`, `image/png`, or `image/webp`, max 5 MB) with optional `X-File-Name` | `{ ok: true, po }`; requires a proof picture, Approved → Ordered / Incoming, fixes the arrival date, creates exactly one linked delivery, and stores the proof |
| `GET /api/pos/:poId/proof` | PO ID | The stored proof image bytes, or 404 |
| `PUT /api/pos/:poId/proof` | Raw image body (`image/jpeg`, `image/png`, or `image/webp`, max 5 MB) with optional `X-File-Name` | `{ ok: true, proof }`; replaces the proof for an Ordered / Incoming PO |
| `POST /api/pos/:poId/resubmit` | `{}` | `{ ok: true, po }`; Rejected → Pending Review after validation and sender authorization |
| `GET /api/inventory` | None | `{ items: InventoryItem[] }` for the connected account, sorted by item |
| `POST /api/inventory` | `{ item, sku, quantity, unit, supplier, reorderLevel, notes }` | `{ ok: true, item: InventoryItem }`; adding this row defines the item, and the SKU must be unique per account |
| `PUT /api/inventory/:id` | Same body as create | `{ ok: true, item: InventoryItem }`; the SKU is immutable; returns 404 when missing, 409 for a duplicate or changed SKU |
| `DELETE /api/inventory/:id` | None | `{ ok: true }`; returns 404 when missing, 409 while assemblies, production demand, deliveries, or POs still use the SKU |
| `GET /api/production-items` | None | `{ items: ProductionItem[] }`; assemblies with their per-unit materials |
| `POST /api/production-items` | `{ name, unit, notes, requirements: [{ itemSku, quantity, unit }] }` | `{ ok: true, item: ProductionItem }`; materials must be existing inventory SKUs with matching units, and quantities are per unit of the assembly |
| `PUT /api/production-items/:id` | Same body as create | `{ ok: true, item: ProductionItem }`; replaces its per-unit materials |
| `DELETE /api/production-items/:id` | None | `{ ok: true }`; returns 409 while a production run references the assembly |
| `GET /api/deliveries` | None | `{ items: Delivery[] }`; incoming first, then received |
| `POST /api/deliveries` | `{ itemSku, quantity, unit, expectedArrival, supplier, notes }` | `{ ok: true, item: Delivery }`; the unit must match inventory (low-level create without proof) |
| `POST /api/deliveries/manual` | Query `itemSku`, `quantity`, `unit`, `expectedArrival`, `supplier`, `notes`; raw image body with optional `X-File-Name` | `{ ok: true, item: Delivery }`; creates a manual delivery with its required incoming proof |
| `PUT /api/deliveries/:id/proof` | Raw image body (`image/jpeg`, `image/png`, or `image/webp`, max 5 MB) with optional `X-File-Name` | `{ ok: true, item: Delivery }`; replaces a manual delivery's incoming proof; linked deliveries use the PO proof endpoint |
| `GET /api/deliveries/:id/proof` | Delivery ID | The incoming proof bytes, falling back to the linked PO proof, or 404 |
| `PUT /api/deliveries/:id` | Same body as create, plus `correctionNote` when the expected arrival changes | `{ ok: true, item: Delivery }`; unreceived only; linked deliveries keep their SKU, update the PO ETA, and record the correction note |
| `POST /api/deliveries/:id/receive` | Raw image body (`image/jpeg`, `image/png`, or `image/webp`, max 5 MB) with `X-Received-Quantity` and optional `X-File-Name` | `{ ok: true, delivery, alreadyReceived }`; adds the confirmed quantity to stock once and stores the receipt picture |
| `GET /api/deliveries/:id/receipt` | Delivery ID | The stored receipt image bytes, or 404 |
| `GET /api/production-runs` | None | `{ items: ProductionRun[] }`, each with `requirements[]`, active work first and then by scheduled date |
| `GET /api/production-runs/next-number` | None | `{ runNumber: string }`; suggests the next sequential `PR-####` number |
| `POST /api/production-runs` | `{ runNumber, productionItemId?, quantity, status, scheduledDate, notes, requirements? }` | `{ ok: true, item: ProductionRun }`; `productionItemId` selects an assembly, and its per-unit materials are multiplied by `quantity` and locked; client-supplied `requirements` are ignored for assembly runs. A run without `productionItemId` is a legacy direct-run path that accepts its own requirement rows. Rejects invalid dates/statuses, undefined SKUs, unit mismatches, and duplicate run numbers (409) |
| `PUT /api/production-runs/:id` | Same body as create | `{ ok: true, item: ProductionRun }`; replaces requirement rows; returns 404 when missing |
| `DELETE /api/production-runs/:id` | None | `{ ok: true }`; deletes the run and its requirement rows |
| `GET /api/settings` | None | `{ plantTimeZone, today }`; defaults to `Asia/Manila` |
| `PUT /api/settings` | `{ plantTimeZone: string }` | `{ ok: true, plantTimeZone, today }`; rejects invalid IANA zones |
| `POST /api/reset` | `{ confirm: true }` | `{ ok: true, counts, clearedAt }`; deletes the account's POs, proof pictures, event history, inventory, deliveries and receipt pictures, production runs/requirements, and assembly definitions; keeps the Gmail connection, approved senders, and plant time zone and records a cutoff so older Inbox mail stays excluded |

Errors use `{ error: string }` JSON. Pagination defaults to 25 rows and clamps offsets to one million. PO search covers PO ID, item/SKU, supplier, sender address/name, subject, received date, expected arrival, and ETA. Inventory and production records are local to the connected account and are never read from or written to Gmail.

## Purchase order shape

`PurchaseOrder` includes `id` (message ID, or a generated ID for a manual PO), `poId` (`PO-0001`), `state` (`pending_review`, `unverified`, `approved`, `ordered`, or `rejected`), `poStatus` (`valid` or `needs_review`), `poError`, `manual` (true for a manager-entered PO), `item`, `sku` (effective mapped SKU), `mappedSku`, `quantity`, `unit`, `eta`, `etaDays`, `supplier`, `expectedArrival` (fixed once ordered), `orderedAt`, `senderAddress`, `senderName`, `receivedAt`, `body`, `events[]`, `delivery`, and `proof` (`{ mimeType, fileName, createdAt }` or null). List responses include an `assessment` summary; detail responses include the full assessment:

- `flag`: `recommended`, `redundant`, `adjust`, or `manual`
- `decision`: `Recommended`, `Redundant / Overstock`, `Adjust Quantity`, or a `Manual Review Required — …` reason
- `requirement`, `difference`, `arrival`, `provisional`, `planningEnd`, `needDate`, `daysEarly`
- `balances[]`: `{ date, before, after }` at the arrival date and each outstanding production date
- `warnings[]`: timing conflict, arriving early (only when more than one calendar day before the need date), potential duplicate with `coveredAmount`, and projected stockout entries
- `coverage[]`: earlier Pending or Approved POs supplying provisional coverage
- `inventory`: current stock, unit, and `updatedAt`
- `deliveries[]`, `demand[]`, `stockoutDates[]`, and a plain-language `note`

## Supporting shapes

`InventoryItem` includes `id`, `item`, `sku`, `quantity`, `unit`, `supplier`, `reorderLevel` (null when unset), `notes`, `createdAt`, and `updatedAt`; adding an inventory row defines the item. `ProductionItem` (an assembly) includes `id`, `name`, `unit`, `notes`, timestamps, and `requirements[]` (`id`, `productionItemId`, `itemSku`, `quantity`, `unit`), where each material is an inventory SKU and its quantity is per unit of the assembly. `Delivery` includes `id`, `itemSku`, `quantity`, `receivedQuantity` (the confirmed count after receipt, or null), `unit`, `expectedArrival`, `supplier`, `status` (`incoming` or `received`), `receivedAt`, `poId` (null for manual deliveries), `notes`, `proof` (`{ mimeType, fileName, createdAt }` or null; a manual delivery's own proof or the linked PO's proof), `receipt` (`{ mimeType, fileName, createdAt }` or null for the receipt picture), `createdAt`, and `updatedAt`. `ProductionRun` includes `id`, `runNumber`, `productionItemId`, `item`, `quantity`, `unit`, `status` (`scheduled`, `in_progress`, `completed`, or `on_hold`), `scheduledDate`, `notes`, `createdAt`, `updatedAt`, and `requirements[]` (`id`, `runId`, `itemSku`, `quantity`, `unit`, `status`, timestamps); run requirement quantities are the assembly's per-unit material quantities multiplied by the planned quantity and are maintained by the server. Status, connection, run, sender, inventory, assembly, production, delivery, PO, and page shapes are documented with JSDoc in `server/types.js`.

## Production route families

Two route families exist on purpose. The hyphenated routes manage the full production schedule; the underscored routes serve the production floor.

- `GET /api/production-runs` returns every run for the connected account, each with `requirements[]`.
- `GET /api/production_runs` returns `{ items: ProductionRun[], today }` for the production floor: scheduled runs on the plant-local current day plus all in-progress runs. Requires a connected account.
- `PATCH /api/production_runs/:id` accepts `{ completedQuantity }` and returns `{ ok: true, item }`. It records floor progress; reaching the planned quantity automatically marks the run `completed`. It does not otherwise change the run status. Completed units must be an integer from zero through planned quantity. Updates are account-scoped and require a trusted Origin. Progress does not adjust inventory or scale locked material demand.

### Inventory history
`GET /api/inventory/:id/history?limit=25&offset=0` returns `{ item, items, total, limit, offset }`, newest first. Entries include kind, before_quantity, after_quantity, before_unit, unit, delivery_id, po_id, supplier, and created_at. Requires a connected account; missing or other-account items return 404.
