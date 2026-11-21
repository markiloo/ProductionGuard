/** @typedef {{ id: string, name: string, username: string }} ConnectedAccount */

/**
 * @typedef {Object} ConnectionStatus
 * @property {boolean} configured Whether an encrypted Gmail credential is saved.
 * @property {boolean} connected Whether a Gmail address and app password are available.
 * @property {ConnectedAccount|null} account Connected account identity, or null.
 * @property {boolean} signingIn Reserved for dashboard compatibility.
 * @property {boolean} needsInteractiveSignIn Reserved for dashboard compatibility.
 * @property {string|null} [error] Credential restoration error, if present.
 */

/**
 * @typedef {Object} CollectionRun
 * @property {string} runId Stable ID for this server process's run.
 * @property {string} cutoff UTC timestamp; messages must be strictly newer.
 * @property {string|null} lastSuccessAt UTC time of the last complete IMAP check.
 * @property {string|null} error Current collector error, if any.
 * @property {boolean} collecting Whether an IMAP check is active.
 * @property {number} currentRunCount Number of messages saved since cutoff.
 * @property {number|null} nextCheckAt Epoch milliseconds of the next scheduled Inbox check, or null when polling is stopped.
 */

/** @typedef {{ address: string }} SenderSetting */

/**
 * @typedef {Object} ProductionItemRequirement
 * @property {string} id Stable material template ID.
 * @property {string} productionItemId Owning assembly ID.
 * @property {string} itemSku Material inventory SKU.
 * @property {number} quantity Whole-number quantity per unit of the assembly.
 * @property {string} unit Unit matching the inventory item.
 */

/**
 * @typedef {Object} ProductionItem
 * @property {string} id Stable assembly ID.
 * @property {string} name Assembly name, unique per account.
 * @property {string} sku Finished-good inventory SKU, unique per account.
 * @property {string|null} inventoryId Linked Inventory item that receives completed units.
 * @property {number} stock Current finished-good quantity on hand.
 * @property {string} unit Unit of the assembly.
 * @property {string} notes Optional notes.
 * @property {ProductionItemRequirement[]} requirements Materials required per unit, selected from inventory.
 * @property {string} createdAt UTC creation timestamp.
 * @property {string} updatedAt UTC last-edit timestamp.
 */

/**
 * @typedef {Object} InventoryItem
 * @property {string} id Stable local inventory ID.
 * @property {string} item Display name.
 * @property {string} sku Required per-account unique item code; adding this row defines the item.
 * @property {number} quantity Whole-number quantity on hand.
 * @property {string} unit Inventory unit used for every quantity of this item.
 * @property {string} supplier Optional supplier name.
 * @property {number|null} reorderLevel Whole-number threshold, or null when unset.
 * @property {string} notes Optional local notes.
 * @property {string} createdAt UTC creation timestamp.
 * @property {string} updatedAt UTC last-edit timestamp.
 */

/**
 * @typedef {Object} ProductionRequirement
 * @property {string} id Stable requirement ID.
 * @property {string} runId Owning production run ID.
 * @property {string} itemSku Required material inventory SKU.
 * @property {number} quantity Whole-number required quantity.
 * @property {string} unit Unit matching the item's inventory unit.
 * @property {'outstanding'|'completed'} status Outstanding demand or consumed demand.
 * @property {string} createdAt UTC creation timestamp.
 * @property {string} updatedAt UTC last-edit timestamp.
 */

/**
 * @typedef {Object} ProductionRun
 * @property {string} id Stable local production run ID.
 * @property {string} runNumber Human-readable run number, unique per account.
 * @property {string|null} productionItemId Assembly selected for the run.
 * @property {string} item Assembly name.
 * @property {number} quantity Whole-number planned quantity of the assembly.
 * @property {number} completedQuantity Recorded completed units, between zero and the planned quantity.
 * @property {string} unit Unit of the assembly.
 * @property {'scheduled'|'in_progress'|'completed'|'on_hold'} status Production status.
 * @property {string} scheduledDate Local calendar date in YYYY-MM-DD form.
 * @property {string} notes Optional local notes.
 * @property {ProductionRequirement[]} [requirements] Material demand rows, scaled from the assembly's per-unit materials by the planned quantity and locked to the run.
 * @property {string} createdAt UTC creation timestamp.
 * @property {string} updatedAt UTC last-edit timestamp.
 */

/**
 * @typedef {Object} DeliveryReceipt
 * @property {string} id Stable batch receipt ID.
 * @property {number} quantity Stock added by this batch.
 * @property {string} mimeType Stored receipt image MIME type.
 * @property {string} fileName Original file name, or an empty string.
 * @property {string} createdAt UTC upload time.
 */

/**
 * @typedef {Object} Delivery
 * @property {string} id Stable delivery ID.
 * @property {string} itemSku Item code matching an inventory SKU.
 * @property {number} quantity Whole-number planned delivery quantity.
 * @property {number|null} receivedQuantity Cumulative quantity received, or null before the first batch.
 * @property {number} remainingQuantity Balance still expected as incoming supply.
 * @property {number} canceledQuantity Quantity removed from expected supply when the balance was closed.
 * @property {string} unit Unit matching the item's inventory unit.
 * @property {string} expectedArrival YYYY-MM-DD expected arrival date.
 * @property {string} supplier Optional supplier name.
 * @property {'incoming'|'received'|'canceled'} status Incoming includes deliveries with an open partial balance.
 * @property {string|null} receivedAt UTC time of the latest receipt, or null before any batches.
 * @property {string|null} closedAt UTC closure time, or null.
 * @property {string|null} closeReason Reason the balance was closed, or null.
 * @property {string|null} scheduleNote Most recent rescheduling note, or null.
 * @property {string|null} poId Linked PO ID for an ordered PO, or null for a manual delivery.
 * @property {string} notes Optional local notes.
 * @property {PoProof|null} proof Incoming proof metadata for a manual delivery or its linked PO, or null.
 * @property {DeliveryReceipt[]} receipts Batch receipt metadata in recording order.
 * @property {DeliveryReceipt|null} receipt Latest batch receipt metadata, or null.
 * @property {string} createdAt UTC creation timestamp.
 * @property {string} updatedAt UTC last-edit timestamp.
 */

/**
 * @typedef {Object} PoWarning
 * @property {'timing'|'early'|'duplicate'|'stockout'} type Warning kind.
 * @property {string} label Human-readable label.
 * @property {string} [runDate] Affected production date.
 * @property {string} [runNumber] Affected production run.
 * @property {string} [needDate] First need date for an early arrival.
 * @property {number} [daysEarly] Calendar days between arrival and need date.
 * @property {number} [coveredAmount] Quantity covered by earlier pending or approved POs.
 * @property {number} [balance] Projected balance at the affected run.
 */

/**
 * @typedef {Object} PoAssessment
 * @property {'assessed'|'manual'} status Whether a quantity decision was possible.
 * @property {'recommended'|'redundant'|'adjust'|'manual'} flag Decision key.
 * @property {string} decision Recommended, Redundant / Overstock, Adjust Quantity, or a Manual Review reason.
 * @property {string|null} reason Manual-review reason when unclassified.
 * @property {number|null} requirement Largest cumulative deficit after arrival.
 * @property {number|null} difference PO quantity minus requirement.
 * @property {string|null} arrival Expected arrival date (provisional until ordered).
 * @property {boolean} provisional Whether the arrival date is an estimate.
 * @property {string|null} planningEnd Last outstanding production date.
 * @property {string|null} needDate First production date needing the quantity.
 * @property {number|null} daysEarly Days between arrival and need date.
 * @property {{date: string, before: number, after: number}[]} balances Projected balances.
 * @property {PoWarning[]} warnings Applicable warnings.
 * @property {{runDate: string, runNumber: string, source: string, sourceLabel: string, sourceArrival: string, stockout: boolean, balance: number}[]} timingConflicts Late-supply conflicts.
 * @property {{runDate: string, runNumber: string, balance: number}[]} stockoutDates Runs with a negative projected balance.
 * @property {number} coveredAmount Quantity covered by earlier Pending or Approved POs.
 * @property {{poId: string, quantity: number, arrival: string, state: string}[]} coverage Earlier POs supplying provisional coverage.
 * @property {{quantity: number, unit: string, updatedAt: string}|null} inventory Stock used by the assessment.
 * @property {Delivery[]} deliveries Incoming deliveries for the item.
 * @property {{id: string, runId: string, runNumber: string, quantity: number, unit: string, scheduledDate: string}[]} demand Outstanding demand rows.
 * @property {string} note Plain-language explanation.
 */

/**
 * @typedef {Object} PoEvent
 * @property {string} id Stable event ID.
 * @property {'approved'|'rejected'|'ordered'|'resubmitted'|'corrected'} type Lifecycle event.
 * @property {string} reason Rejection or correction note, or an empty string.
 * @property {string} createdAt UTC event time.
 */

/**
 * @typedef {Object} PoProof
 * @property {string} mimeType Stored proof image MIME type.
 * @property {string} fileName Original file name, or an empty string.
 * @property {string} createdAt UTC upload time.
 */

/**
 * @typedef {Object} PurchaseOrder
 * @property {string} id Gmail message ID, or a generated ID for a manual PO.
 * @property {string} poId Sequential per-account PO ID such as `PO-0001`.
 * @property {'pending_review'|'unverified'|'approved'|'ordered'|'rejected'} state Workflow state.
 * @property {'valid'|'needs_review'} poStatus Validation state.
 * @property {string|null} poError Validation or authorization reasons.
 * @property {string|null} item Item code from the email.
 * @property {string|null} sku Effective mapped inventory SKU.
 * @property {string|null} mappedSku Explicit SKU selected during correction.
 * @property {number|null} quantity Requested quantity.
 * @property {string|null} unit Requested unit.
 * @property {string|null} eta Original ETA text.
 * @property {number|null} etaDays ETA duration in whole days.
 * @property {string|null} supplier Supplier name.
 * @property {string|null} expectedArrival Fixed arrival date after ordering.
 * @property {string|null} orderedAt UTC ordering time.
 * @property {string} senderAddress Exact sender address, or an empty string for a manual PO.
 * @property {string} senderName Sender display name, or `Manual entry`.
 * @property {boolean} manual Whether the manager entered this PO instead of collecting it from Gmail.
 * @property {string} receivedAt UTC received timestamp.
 * @property {string} [body] Full plain-text body on detail responses.
 * @property {PoAssessment} [assessment] Deterministic assessment.
 * @property {PoEvent[]} [events] Lifecycle history on detail responses.
 * @property {Delivery|null} [delivery] Linked delivery after ordering.
 * @property {PoProof|null} [proof] Incoming proof picture metadata on detail responses.
 */

/** @template T @typedef {{ items: T[], total: number, limit: number, offset: number }} PaginatedResponse */

/**
 * @typedef {Object} InventoryHistoryEntry
 * @property {number} id Stable ordered event ID.
 * @property {string} kind Starting balance, Item added, Quantity edited, Delivery received, Assembly completed, or Completion corrected.
 * @property {number} before_quantity Stock before the event.
 * @property {number} after_quantity Stock after the event.
 * @property {string} before_unit Previous unit snapshot.
 * @property {string} unit Resulting unit snapshot.
 * @property {string|null} delivery_id Source delivery.
 * @property {string|null} po_id Source PO.
 * @property {string} supplier Supplier snapshot.
 * @property {string} created_at UTC timestamp.
 */

/**
 * @typedef {Object} StockProjection
 * @property {string} sku Inventory SKU.
 * @property {string} item Inventory display name.
 * @property {string} unit Inventory unit.
 * @property {string} startDate Plant-local start date.
 * @property {string} endDate Plant-local horizon end date.
 * @property {number} horizonDays Number of days in the projection.
 * @property {number} currentBalance Balance at the end of the start date.
 * @property {number} endBalance Balance at the horizon end.
 * @property {number} minBalance Lowest projected balance.
 * @property {number|null} reorderLevel Inventory reorder threshold, or null.
 * @property {string|null} nextArrival Earliest unreceived delivery date, including overdue ones.
 * @property {{date: string, balance: number}[]} stockoutDates Days with a negative balance.
 * @property {{deliveries: number, requirements: number}} excluded Records skipped for a unit mismatch.
 * @property {{date: string, balance: number}[]} points One balance per day, inclusive of start and end.
 */

/**
 * @typedef {Object} DashboardWidget
 * @property {string} id Stable visualization ID.
 * @property {'inventory_projection'} type Visualization kind.
 * @property {string} sku Inventory SKU being projected.
 * @property {number} horizonDays Projection length in days.
 * @property {number} position Display order.
 * @property {string} createdAt UTC creation timestamp.
 * @property {string} updatedAt UTC last-edit timestamp.
 * @property {StockProjection} projection Computed projection.
 */

/**
 * @typedef {Object} HomeDashboard
 * @property {string} today Plant-local current date.
 * @property {DashboardWidget[]} widgets Saved inventory visualizations with projections.
 * @property {{id: string, itemSku: string, itemName: string|null, quantity: number, unit: string, expectedArrival: string, supplier: string, poId: string|null, overdue: boolean}[]} incoming All unreceived deliveries, ordered by arrival; Home filters and paginates them.
 * @property {{id: string, runNumber: string, item: string, quantity: number, unit: string, status: string, scheduledDate: string, completedQuantity: number, percent: number}[]} runs In-progress runs plus runs scheduled today.
 */
