export function mergeServerHistory(current, records, userId, knownSyncedIds = null) {
  const next = { ...current };
  for (const [kind, key] of [['summary', 'summaryRecords'], ['qa', 'chatRecords'], ['quiz', 'quizAttempts']]) {
    const server = records.filter((r) => r.kind === kind).map((r) => ({
      ...r.payload, id: r.id.startsWith(`${userId}:legacy-`) && r.payload.id !== undefined
        ? r.payload.id : r.id.slice(String(userId).length + 1), serverId: r.id,
      userId, courseId: r.course_id, createdAt: r.created_at, mode: 'api',
      ...(kind === 'quiz' ? { completedAt: r.created_at } : {}),
    }));
    const byId = new Map(server.map((r) => [String(r.id), r]));
    // Keep unsent/legacy local data, and retain the active Q&A session metadata.
    const local = current[key].filter((r) => String(r.userId) !== String(userId) || !r.serverId || byId.has(String(r.id))
      || (knownSyncedIds && !knownSyncedIds.has(r.serverId)));
    next[key] = local.map((r) => {
      const saved = String(r.userId) === String(userId) && byId.get(String(r.id));
      if (!saved) return r;
      byId.delete(String(r.id));
      return { ...r, ...saved, workspaceSession: r.workspaceSession };
    }).concat([...byId.values()]);
  }
  return next;
}
