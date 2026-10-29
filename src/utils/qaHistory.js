// Keep immutable message records for reliable retries, but show one history item
// per explicitly identified conversation. Never guess links for legacy messages.
export function groupQAHistory(records) {
  const groups = new Map();
  const result = [];
  for (const record of records) {
    const p = record.payload || {};
    if (record.kind !== 'qa' || !p.conversationId) { result.push(record); continue; }
    const key = JSON.stringify([record.owner_id, record.course_id, p.scopeKey, p.conversationId]);
    let group = groups.get(key);
    if (!group) {
      group = { ...record, messageRecords: [] };
      groups.set(key, group); result.push(group);
    }
    group.messageRecords.push(record);
    if (record.created_at > group.created_at) group.created_at = record.created_at;
  }
  for (const group of groups.values()) {
    group.messageRecords.sort((a, b) => a.payload.messageOrder - b.payload.messageOrder || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    group.id = group.messageRecords[0].id;
  }
  return result.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export const qaMessages = record => record.messageRecords || [record];
export const historyRecordIds = record => qaMessages(record).map(message => message.id);
