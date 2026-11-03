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
 */

/** @typedef {{ address: string }} SenderSetting */

/**
 * @typedef {Object} InventoryItem
 * @property {string} id Stable local inventory ID.
 * @property {string} item Item name.
 * @property {string} sku Optional SKU or part number.
 * @property {number} quantity Whole-number quantity on hand.
 * @property {string} unit Unit label, such as kg, units, or boxes.
 * @property {string} supplier Optional supplier name.
 * @property {number|null} reorderLevel Whole-number threshold, or null when unset.
 * @property {string} notes Optional local notes.
 * @property {string} createdAt UTC creation timestamp.
 * @property {string} updatedAt UTC last-edit timestamp.
 */

/**
 * @typedef {Object} ProductionRun
 * @property {string} id Stable local production run ID.
 * @property {string} runNumber Human-readable run number, unique per account.
 * @property {string} item Item or product being produced.
 * @property {number} quantity Whole-number planned quantity.
 * @property {string} unit Unit label, such as kg, units, or boxes.
 * @property {'scheduled'|'in_progress'|'completed'|'on_hold'} status Production status.
 * @property {string} scheduledDate Local calendar date in YYYY-MM-DD form.
 * @property {string} notes Optional local notes.
 * @property {string} createdAt UTC creation timestamp.
 * @property {string} updatedAt UTC last-edit timestamp.
 */

/**
 * @typedef {Object} CollectedEmail
 * @property {string} id Stable Gmail IMAP message ID.
 * @property {string} senderAddress Exact From address.
 * @property {string} senderName Sender display name.
 * @property {{type: 'To'|'Cc'|'Bcc', name: string, address: string}[]} recipients Message recipients.
 * @property {string} subject Subject, possibly empty.
 * @property {string} receivedAt UTC received timestamp.
 * @property {string} preview Plain text preview.
 * @property {string} [body] Full plain-text message body on detail responses.
 * @property {number} hasAttachments Whether MIME structure contains attachments.
 * @property {string|null} item Parsed item name.
 * @property {number|null} quantity Parsed positive whole-number quantity.
 * @property {'kg'|'units'|null} unit Parsed unit.
 * @property {'1 week'|'2 weeks'|null} eta Parsed ETA.
 * @property {string|null} supplier Parsed supplier name.
 * @property {'valid'|'needs_review'} poStatus Parsing result.
 * @property {string|null} poError Parsing problems for review.
 */

/** @template T @typedef {{ items: T[], total: number, limit: number, offset: number }} PaginatedResponse */
