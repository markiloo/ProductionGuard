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

Errors use `{ error: string }` JSON. Pagination defaults to 25 rows and clamps offsets to one million. Search covers item, subject, sender address/name, and saved body text. PO records include `item`, `quantity`, `unit`, `eta`, `poStatus` (`valid` or `needs_review`), and `poError` (null or a review message). Status counts include only POs. Status, connection, run, sender, email, and page shapes are documented with JSDoc in `server/types.js`.
