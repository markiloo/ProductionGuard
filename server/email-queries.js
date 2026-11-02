/** Clamp public pagination inputs before using them in parameterized SQL. */
export function parsePagination(limitValue, offsetValue) {
  return {
    limit: Math.max(1, Math.min(100, Number.parseInt(limitValue, 10) || 25)),
    offset: Math.max(0, Math.min(1_000_000, Number.parseInt(offsetValue, 10) || 0)),
  };
}

/** Query account-scoped saved email pages, optionally restricted to this run and search text. */
export function listEmails(db, { accountId, cutoff, scope = 'current', query = '', limit = 25, offset = 0 }) {
  const clauses = ['account_id = ?'];
  const args = [accountId];
  if (scope !== 'all') { clauses.push('received_at > ?'); args.push(cutoff); }
  if (query) {
    clauses.push('(subject LIKE ? OR sender_address LIKE ? OR sender_name LIKE ? OR body LIKE ?)');
    args.push(...Array(4).fill(`%${query}%`));
  }
  const where = clauses.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS count FROM emails WHERE ${where}`).get(...args).count;
  const items = db.prepare(`SELECT message_id AS id,sender_address AS senderAddress,sender_name AS senderName,recipients,subject,received_at AS receivedAt,preview,has_attachments AS hasAttachments FROM emails WHERE ${where} ORDER BY received_at DESC LIMIT ? OFFSET ?`).all(...args, limit, offset).map((row) => ({ ...row, recipients: JSON.parse(row.recipients) }));
  return { items, total, limit, offset };
}

/** Fetch a single message only from the requested connected account. */
export function getEmail(db, accountId, messageId) {
  const row = db.prepare('SELECT message_id AS id,sender_address AS senderAddress,sender_name AS senderName,recipients,subject,received_at AS receivedAt,preview,body,has_attachments AS hasAttachments FROM emails WHERE account_id = ? AND message_id = ?').get(accountId, messageId);
  return row ? { ...row, recipients: JSON.parse(row.recipients) } : null;
}
