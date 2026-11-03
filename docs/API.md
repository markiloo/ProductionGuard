# Local API

All routes are served from the same loopback origin as the dashboard. State-changing calls require a trusted browser `Origin`; the development Vite origins on ports 5173 are also allowed. JSON request bodies use `Content-Type: application/json`.

| Method and route | Request | Response |
| --- | --- | --- |
| `GET /api/status` | None | `{ auth, collection, senders: string[], totalCount, features: { clearSavedInbox: boolean } }` |
| `POST /api/setup` | `{ email: string, appPassword: string }` | `{ ok: true }` after Gmail IMAP connection succeeds |
| `POST /api/sign-out` | `{}` | `{ ok: true }` |
| `POST /api/senders` | `{ address: string }` | `{ ok: true }`; rejects invalid or duplicate addresses |
| `DELETE /api/senders/:address` | URL-encoded exact address | `{ ok: true }` |
| `GET /api/emails` | `scope=current\|all`, `q`, `limit` (1–100), `offset` | `{ items: CollectedEmail[], total, limit, offset }`; PO records only |
| `DELETE /api/emails` | None | `{ ok: true, deletedCount: number }`; clears the connected account's saved POs and excludes mail received before the clear time from later polls; Gmail is unchanged |
| `GET /api/emails/:id` | Immutable message ID | `CollectedEmail` including `body` and recipients |
| `GET /api/inventory` | None | `{ items: InventoryItem[] }` for the connected account, sorted by item |
| `POST /api/inventory` | `{ item, sku, quantity, unit, supplier, reorderLevel, notes }` | `{ ok: true, item: InventoryItem }`; validates text lengths and whole-number quantities |
| `PUT /api/inventory/:id` | Same body as create | `{ ok: true, item: InventoryItem }`; returns 404 when the item is missing or belongs to another account |
| `DELETE /api/inventory/:id` | None | `{ ok: true }`; returns 404 when the item is missing or belongs to another account |
| `GET /api/production-runs` | None | `{ items: ProductionRun[] }` for the connected account, active work first and then by scheduled date |
| `GET /api/production-runs/next-number` | None | `{ runNumber: string }`; suggests the next sequential `PR-####` number for the account |
| `POST /api/production-runs` | `{ runNumber, item, quantity, unit, status, scheduledDate, notes }` | `{ ok: true, item: ProductionRun }`; rejects invalid dates/statuses and duplicate run numbers (409) |
| `PUT /api/production-runs/:id` | Same body as create | `{ ok: true, item: ProductionRun }`; returns 404 when the run is missing or belongs to another account |
| `DELETE /api/production-runs/:id` | None | `{ ok: true }`; returns 404 when the run is missing or belongs to another account |

Errors use `{ error: string }` JSON. Pagination defaults to 25 rows and clamps offsets to one million. Search covers item, supplier, subject, sender address/name, and saved body text. PO records include `item`, `quantity`, `unit`, `eta`, `supplier`, `poStatus` (`valid` or `needs_review`), and `poError` (null or a review message). Inventory records include `id`, `item`, `sku`, `quantity`, `unit`, `supplier`, `reorderLevel` (null when unset), `notes`, `createdAt`, and `updatedAt`. Production runs include `id`, `runNumber`, `item`, `quantity`, `unit`, `status` (`scheduled`, `in_progress`, `completed`, or `on_hold`), `scheduledDate` (`YYYY-MM-DD`), `notes`, `createdAt`, and `updatedAt`. The dashboard asks `GET /api/production-runs/next-number` for a generated `PR-####` run number and submits it as a read-only value. Inventory and production runs are local to the connected account and are never read from or written to Gmail. Status, connection, run, sender, email, inventory, production, and page shapes are documented with JSDoc in `server/types.js`.
