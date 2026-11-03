# Local API

All routes are served from the same loopback origin as the dashboard. State-changing calls require a trusted browser `Origin`; the development Vite origins on ports 5173 are also allowed. JSON request bodies use `Content-Type: application/json`. Every route is scoped to the connected Gmail account.

| Method and route | Request | Response |
| --- | --- | --- |
| `GET /api/status` | None | `{ auth, collection, senders: string[], totalCount, counts: Record<string, number>, plantTimeZone, today, features: { clearSavedInbox: boolean } }` |
| `POST /api/setup` | `{ email: string, appPassword: string }` | `{ ok: true }` after Gmail IMAP connection succeeds |
| `POST /api/sign-out` | `{}` | `{ ok: true }` |
| `POST /api/senders` | `{ address: string }` | `{ ok: true }`; rejects invalid or duplicate addresses and promotes queued unauthorized mail into Pending Review |
| `DELETE /api/senders/:address` | URL-encoded exact address | `{ ok: true }` |
| `GET /api/emails` | `scope=current\|all`, `q`, `limit` (1–100), `offset` | `{ items: CollectedEmail[], total, limit, offset }`; PO records only |
| `DELETE /api/emails` | None | `{ ok: true, deletedCount: number }`; clears the connected account's saved POs and excludes mail received before the clear time from later polls; Gmail and incoming deliveries are unchanged |
| `GET /api/emails/:id` | Immutable message ID | `CollectedEmail` including `body` and recipients |
| `GET /api/pos` | `state=pending_review\|unverified\|approved\|ordered\|rejected\|all` (default `pending_review`), `sort=asc\|desc` (received time), `q`, `limit`, `offset` | `{ items: PurchaseOrder[], total, counts: Record<string, number> }`, each with an assessment summary |
| `GET /api/pos/:poId` | PO ID such as `PO-0001` | `PurchaseOrder` with full `assessment`, `events`, and linked `delivery` |
| `PATCH /api/pos/:poId` | `{ item, mappedSku, quantity, unit, etaDays, supplier }` | `{ ok: true, po }`; corrects an Unverified, Pending Review, or Rejected PO, preserving its identity and history |
| `POST /api/pos/:poId/approve` | `{}` | `{ ok: true, po }`; Pending Review → Approved |
| `POST /api/pos/:poId/reject` | `{ reason: string }` | `{ ok: true, po }`; Pending Review or Approved → Rejected; reason required |
| `POST /api/pos/:poId/order` | `{}` | `{ ok: true, po }`; Approved → Ordered / Incoming, fixes the arrival date, and creates exactly one linked delivery |
| `POST /api/pos/:poId/resubmit` | `{}` | `{ ok: true, po }`; Rejected → Pending Review after validation and sender authorization |
| `GET /api/inventory` | None | `{ items: InventoryItem[] }` for the connected account, sorted by item |
| `POST /api/inventory` | `{ item, sku, quantity, unit, supplier, reorderLevel, notes }` | `{ ok: true, item: InventoryItem }`; the SKU must be defined in Item definition, and its name/unit are taken from that definition |
| `PUT /api/inventory/:id` | Same body as create | `{ ok: true, item: InventoryItem }`; returns 404 when missing, 409 for a duplicate or changed SKU |
| `DELETE /api/inventory/:id` | None | `{ ok: true }`; returns 404 when missing or owned by another account |
| `GET /api/item-definitions` | None | `{ items: ItemDefinition[] }`; the account's SKU/item master |
| `POST /api/item-definitions` | `{ sku, item, unit }` | `{ ok: true, item: ItemDefinition }`; unique SKU per account (409 otherwise) |
| `PUT /api/item-definitions/:id` | `{ sku, item, unit }` | `{ ok: true, item: ItemDefinition }`; the SKU is immutable; item name/unit cascade to the inventory row |
| `DELETE /api/item-definitions/:id` | None | `{ ok: true }`; returns 409 while inventory, deliveries, demand, a production item, or a PO uses the SKU |
| `GET /api/production-items` | None | `{ items: ProductionItem[] }` with their requirement templates |
| `POST /api/production-items` | `{ name, unit, notes, requirements: [{ itemSku, quantity, unit }] }` | `{ ok: true, item: ProductionItem }`; requirement quantities are per unit of the produced item and must use defined SKUs and matching units |
| `PUT /api/production-items/:id` | Same body as create | `{ ok: true, item: ProductionItem }`; replaces its per-unit requirement template |
| `DELETE /api/production-items/:id` | None | `{ ok: true }`; returns 409 while a production run references it |
| `GET /api/deliveries` | None | `{ items: Delivery[] }`; incoming first, then received |
| `POST /api/deliveries` | `{ itemSku, quantity, unit, expectedArrival, supplier, notes }` | `{ ok: true, item: Delivery }`; the unit must match inventory |
| `PUT /api/deliveries/:id` | Same body as create | `{ ok: true, item: Delivery }`; unreceived only; linked deliveries keep their SKU and update the PO ETA |
| `POST /api/deliveries/:id/receive` | `{}` | `{ ok: true, delivery, alreadyReceived }`; adds stock once and removes the delivery from incoming supply |
| `GET /api/production-runs` | None | `{ items: ProductionRun[] }`, each with `requirements[]`, active work first and then by scheduled date |
| `GET /api/production-runs/next-number` | None | `{ runNumber: string }`; suggests the next sequential `PR-####` number |
| `POST /api/production-runs` | `{ runNumber, productionItemId, quantity, status, scheduledDate, notes }` | `{ ok: true, item: ProductionRun }`; `productionItemId` selects a defined item, and its per-unit template is multiplied by `quantity` and locked; client-supplied requirements are ignored. Rejects invalid dates/statuses, undefined SKUs, unit mismatches, and duplicate run numbers (409) |
| `PUT /api/production-runs/:id` | Same body as create | `{ ok: true, item: ProductionRun }`; replaces requirement rows; returns 404 when missing |
| `DELETE /api/production-runs/:id` | None | `{ ok: true }`; deletes the run and its requirement rows |
| `GET /api/settings` | None | `{ plantTimeZone, today }`; defaults to `Asia/Manila` |
| `PUT /api/settings` | `{ plantTimeZone: string }` | `{ ok: true, plantTimeZone, today }`; rejects invalid IANA zones |
| `POST /api/reset` | `{ confirm: true }` | `{ ok: true, counts, clearedAt }`; deletes the account's POs and event history, inventory, deliveries, production runs/requirements, production item definitions, SKU definitions, and senders; keeps the Gmail connection and plant time zone and records a cutoff so older Inbox mail stays excluded |

Errors use `{ error: string }` JSON. Pagination defaults to 25 rows and clamps offsets to one million. PO search covers PO ID, item/SKU, supplier, sender address/name, subject, received date, expected arrival, and ETA. Inventory and production records are local to the connected account and are never read from or written to Gmail.

## Purchase order shape

`PurchaseOrder` includes `id` (message ID), `poId` (`PO-0001`), `state` (`pending_review`, `unverified`, `approved`, `ordered`, or `rejected`), `poStatus` (`valid` or `needs_review`), `poError`, `item`, `sku` (effective mapped SKU), `mappedSku`, `quantity`, `unit`, `eta`, `etaDays`, `supplier`, `expectedArrival` (fixed once ordered), `orderedAt`, `senderAddress`, `senderName`, `receivedAt`, `body`, `events[]`, and `delivery`. List responses include an `assessment` summary; detail responses include the full assessment:

- `flag`: `recommended`, `redundant`, `adjust`, or `manual`
- `decision`: `Recommended`, `Redundant / Overstock`, `Adjust Quantity`, or a `Manual Review Required — …` reason
- `requirement`, `difference`, `arrival`, `provisional`, `planningEnd`, `needDate`, `daysEarly`
- `balances[]`: `{ date, before, after }` at the arrival date and each outstanding production date
- `warnings[]`: timing conflict, arriving early, potential duplicate with `coveredAmount`, and projected stockout entries
- `coverage[]`: earlier Pending or Approved POs supplying provisional coverage
- `inventory`: current stock, unit, and `updatedAt`
- `deliveries[]`, `demand[]`, `stockoutDates[]`, and a plain-language `note`

## Supporting shapes

`ItemDefinition` includes `id`, `sku`, `item`, `unit`, `createdAt`, and `updatedAt`. `ProductionItem` includes `id`, `name`, `unit`, `notes`, timestamps, and `requirements[]` (`id`, `productionItemId`, `itemSku`, `quantity`, `unit`), where each requirement quantity is per unit of the produced item. `InventoryItem` includes `id`, `item`, `sku`, `quantity`, `unit`, `supplier`, `reorderLevel` (null when unset), `notes`, `createdAt`, and `updatedAt`. `Delivery` includes `id`, `itemSku`, `quantity`, `unit`, `expectedArrival`, `supplier`, `status` (`incoming` or `received`), `receivedAt`, `poId` (null for manual deliveries), `notes`, `createdAt`, and `updatedAt`. `ProductionRun` includes `id`, `runNumber`, `productionItemId`, `item`, `quantity`, `unit`, `status` (`scheduled`, `in_progress`, `completed`, or `on_hold`), `scheduledDate`, `notes`, `createdAt`, `updatedAt`, and `requirements[]` (`id`, `runId`, `itemSku`, `quantity`, `unit`, `status`, timestamps); run requirement quantities are the definition template multiplied by the planned quantity and are maintained by the server. Status, connection, run, sender, email, item definition, production item, inventory, production, delivery, PO, and page shapes are documented with JSDoc in `server/types.js`.
