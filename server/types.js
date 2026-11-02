/** @typedef {{ id: string, name: string, username: string }} ConnectedAccount */

/**
 * @typedef {Object} ConnectionStatus
 * @property {boolean} configured Whether an app client ID has been saved.
 * @property {boolean} connected Whether an Outlook account is available from MSAL.
 * @property {ConnectedAccount|null} account Connected account identity, or null.
 * @property {boolean} signingIn Whether device-code sign-in is in progress.
 * @property {boolean} needsInteractiveSignIn Whether silent token acquisition needs user interaction.
 * @property {string|null} [error] Secure-cache initialization error, if present.
 */

/**
 * @typedef {Object} CollectionRun
 * @property {string} runId Stable ID for this server process's run.
 * @property {string} cutoff UTC timestamp; messages must be strictly newer.
 * @property {string|null} lastSuccessAt UTC time of the last complete Graph check.
 * @property {string|null} error Current collector error, if any.
 * @property {boolean} collecting Whether a Graph check is active.
 * @property {number} currentRunCount Number of messages saved since cutoff.
 */

/** @typedef {{ address: string }} SenderSetting */

/**
 * @typedef {Object} CollectedEmail
 * @property {string} id Immutable Graph message ID.
 * @property {string} senderAddress Exact From address.
 * @property {string} senderName Sender display name.
 * @property {{type: 'To'|'Cc'|'Bcc', name: string, address: string}[]} recipients Message recipients.
 * @property {string} subject Subject, possibly empty.
 * @property {string} receivedAt UTC received timestamp.
 * @property {string} preview Plain text preview.
 * @property {string} [body] Full plain-text message body on detail responses.
 * @property {number} hasAttachments Whether Outlook reported attachments.
 */

/** @template T @typedef {{ items: T[], total: number, limit: number, offset: number }} PaginatedResponse */
