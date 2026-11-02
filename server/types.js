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
 */

/** @template T @typedef {{ items: T[], total: number, limit: number, offset: number }} PaginatedResponse */
