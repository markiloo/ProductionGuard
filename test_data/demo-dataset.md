# PO Checker — demo data set

A self-contained data set for exercising every assessment branch: Recommended, Adjust Quantity, Redundant / Overstock, timing conflict, early arrival, duplicate coverage, all Manual Review reasons, and the Unverified queue.

It uses three assemblies:

1. Packaging Box
2. Candle with a Case
3. Candle with no Case

Candle Wax and Candle Wick are shared by the two candle assemblies, so demand stacks and the second wax purchase order demonstrates duplicate coverage.

## 0. Isolation

`data/` may hold real records, so run the demo against its own data directory and port:

```powershell
$env:DATA_DIR = 'D:\Class\PO Checker\data\demo'
$env:PORT = '4175'
npm start          # http://127.0.0.1:4175
```

Setup order matters: **Inventory → Assemblies → Production runs → Delivery → POs**.

## 1. Conventions

- **D0** is the date shown in **Settings → Current plant date**, not the PC clock. The default plant time zone is `Asia/Manila`.
- Enter everything in one sitting: provisional ETAs advance at each plant-local date change.
- Emails must arrive after the server starts, land in Inbox, and come from an address on **Settings → Approved senders**.
- Email subject must be exactly `PO`, with one `ITEM` block per mail.
- `ITEM` must be an inventory **SKU**. The app maps PO items to inventory by SKU, case-insensitively.
- All quantities are whole numbers. PO units must match the inventory unit, case-insensitively.
- All reorder levels are `0`. Enter `0`, not a blank field: blank stores "unset", `0` is a real threshold. With `0`, low stock is only flagged when quantity reaches `0`, so no low-stock badges appear initially.

## 2. Inventory — 6 items

| Item name | SKU | Qty | Unit | Supplier | Reorder |
| --- | --- | --- | --- | --- | --- |
| Cardboard | `CARD` | 30 | units | BoxCo | 0 |
| Glue | `GLUE` | 8 | units | AdhesivePro | 0 |
| Candle Wax | `WAX` | 25 | units | WaxWorks | 0 |
| Glass Case | `CASE` | 4 | units | GlassWorks | 0 |
| Candle Wick | `WICK` | 40 | units | WickSupply | 0 |
| Packaging Tape | `TAPE` | 50 | units | TapeCo | 0 |

`TAPE` is intentionally outside every assembly; it drives the "No Scheduled Demand" case.

## 3. Assemblies — 3 definitions, 7 material lines

| Assembly | Unit | Materials per unit |
| --- | --- | --- |
| Packaging Box | units | `CARD` ×2, `GLUE` ×1 |
| Candle with a Case | units | `WAX` ×2, `CASE` ×1, `WICK` ×1 |
| Candle with no Case | units | `WAX` ×1, `WICK` ×1 |

Material quantities are per unit of the assembly. Choosing a SKU in the assembly dialog fills its inventory unit automatically.

## 4. Production runs — 3 runs, 7 locked requirement rows

| Run | Assembly | Planned qty | Scheduled date |
| --- | --- | --- | --- |
| `PR-0001` | Packaging Box | 20 | D+7 |
| `PR-0002` | Candle with a Case | 10 | D+10 |
| `PR-0003` | Candle with no Case | 15 | D+14 |

Scaled demand after multiplying the assembly materials by the planned quantity:

| Run | CARD | GLUE | WAX | CASE | WICK |
| --- | --- | --- | --- | --- | --- |
| PR-0001 | 40 | 20 | — | — | — |
| PR-0002 | — | — | 20 | 10 | 10 |
| PR-0003 | — | — | 15 | — | 15 |
| **Total** | **40** | **20** | **35** | **10** | **25** |

## 5. Incoming delivery — 1 record

Create it under **Deliveries → Add delivery**; an incoming proof image under 5 MB is required.

| SKU | Qty | Arrival | Supplier | State |
| --- | --- | --- | --- | --- |
| `GLUE` | 5 | D+5 | AdhesivePro | Incoming |

Leave it unreceived. It reduces the GLUE deficit from 12 to 7.

## 6. Purchase orders — 10 records

Send these as separate emails, in this order. The order determines receipt-time priority; E must precede F so the duplicate check can see it.

### A — Recommended, one-day buffer

```text
ITEM: GLUE
QUANTITY: 7
UNIT: units
ETA: 6 days
SUPPLIER: AdhesivePro
```

### B — Adjust Quantity + Arriving Early

```text
ITEM: CASE
QUANTITY: 9
UNIT: units
ETA: 5 days
SUPPLIER: GlassWorks
```

### C — Redundant / Overstock

```text
ITEM: WICK
QUANTITY: 10
UNIT: units
ETA: 5 days
SUPPLIER: WickSupply
```

### D — Recommended + Timing Conflict + Stockout

```text
ITEM: CARD
QUANTITY: 10
UNIT: units
ETA: 9 days
SUPPLIER: BoxCo
```

### E — Recommended + Arriving Early

```text
ITEM: WAX
QUANTITY: 10
UNIT: units
ETA: 12 days
SUPPLIER: WaxWorks
```

### F — Redundant + Potential Duplicate

```text
ITEM: WAX
QUANTITY: 10
UNIT: units
ETA: 13 days
SUPPLIER: WaxWorks
```

### G — Manual Review: no scheduled demand

```text
ITEM: TAPE
QUANTITY: 5
UNIT: units
ETA: 5 days
SUPPLIER: TapeCo
```

### H — Manual Review: unmapped item

```text
ITEM: UNKNOWN-999
QUANTITY: 5
UNIT: units
ETA: 5 days
SUPPLIER: Unknown Supply
```

### I — Manual Review: unit mismatch

```text
ITEM: CARD
QUANTITY: 5
UNIT: boxes
ETA: 5 days
SUPPLIER: BoxCo
```

### J — Unverified queue: multiple items

```text
ITEM: WAX
QUANTITY: 2
UNIT: units
ITEM: WICK
QUANTITY: 4
UNIT: units
ETA: 5 days
SUPPLIER: WaxWorks
```

G, H, and I remain in **Pending Review** with a Manual Review flag; only J lands in **Unverified**, because parsing fails. The app never selects or combines items from a multi-item mail.

## 7. Expected assessments on D0

| PO | Arrival | Requirement | Difference | Decision | Warnings |
| --- | --- | --- | --- | --- | --- |
| A | D+6 | 7 | 0 | Recommended | none; note says "arriving one day early" |
| B | D+5 | 6 | +3 | Adjust Quantity | Arriving Early, 5 days |
| C | D+5 | 0 | +10 | Redundant / Overstock | none |
| D | D+9 | 10 | 0 | Recommended | Timing Conflict at D+7; Projected Stockout −10 |
| E | D+12 | 10 | 0 | Recommended | Arriving Early, 2 days |
| F | D+13 | 0 | +10 | Redundant / Overstock | Potential Duplicate, 10 covered |
| G | — | — | — | Manual Review Required — No Scheduled Demand | — |
| H | — | — | — | Manual Review Required — Unmapped Item | — |
| I | — | — | — | Manual Review Required — Unit Mismatch | — |
| J | — | — | — | Unverified queue | Duplicate item / one item per email |

Balances to spot-check in the detail sheet:

- **A:** D+6 `13 → 20`, D+7 `−7 → 0`
- **B:** D+5 `4 → 13`, D+10 `−6 → 3`
- **C:** D+5 `40 → 50`, D+10 `30 → 40`, D+14 `15 → 25`
- **D:** D+7 `−10 → −10`, D+9 `−10 → 0`
- **E:** D+10 `5 → 5`, D+12 `5 → 15`, D+14 `−10 → 0`
- **F:** D+10 `5 → 5`, D+13 `15 → 25`, D+14 `0 → 10`

While E is Pending or Approved, F shows the duplicate warning. Ordering E first replaces that warning with its linked incoming delivery; F stays Redundant.

## 8. Initial counts

- Inventory: 6 items
- Assemblies: 3, with 7 per-unit material lines
- Production: 3 runs, 7 requirement rows
- Deliveries: 1 incoming, 1 proof, 0 received
- Purchase orders: 10 total — 9 Pending Review, 1 Unverified
- PO proofs, receipts, rejection history: none yet
- Low stock: 0

## 9. Lifecycle checks

1. **Approve A** — approval keeps the ETA provisional; the assessment does not change.
2. **Order A** with a proof picture — arrival is fixed at order date + 6; exactly one linked `GLUE 7` delivery is created.
3. **Receive A's linked delivery** with quantity 7 and a receipt picture — GLUE stock rises 8 → 15; A flips to **Redundant** (+7) because stock now covers demand. A repeat receive does not add stock again.
4. **Receive the manual GLUE delivery** with quantity 5 and a receipt picture — stock 15 → 20; assessments stay stable, proving received stock is not double-counted.
5. **Reject B** with a reason, **correct** quantity 9 → 6, then **Resubmit** — same PO ID and history; decision becomes **Recommended**.
6. **Approve C**, then **Revise ETA** from 5 to 3 days with a note — arrival moves to D+3, still Redundant, history records the correction.
7. **Reschedule A's delivery** with a note — the linked delivery date updates and the PO history records why.
8. **Correct I's unit** from `boxes` to `units` — it leaves Manual Review and becomes **Adjust Quantity** (requirement 10, difference −5, 2 days early).
9. **Clear saved** — POs, PO proofs, and PO history disappear; inventory, assemblies, production runs, and the manual delivery remain; older Inbox mail stays suppressed.
10. **Settings → Clear all data** — all business data is removed; the Gmail connection, approved senders, and plant time zone are kept.

## 10. Date anchor

D0 is the date shown in **Settings → Current plant date**. For reference, if D0 is 2026-11-10:

| Offset | Date |
| --- | --- |
| D+5 | 2026-11-15 |
| D+6 | 2026-11-16 |
| D+7 | 2026-11-17 |
| D+9 | 2026-11-19 |
| D+10 | 2026-11-20 |
| D+12 | 2026-11-22 |
| D+13 | 2026-11-23 |
| D+14 | 2026-11-24 |

If the app's plant date is different, shift every date by the same offset. Enter the runs, delivery, and POs against that date so the expected arrivals, need dates, and warnings hold.
