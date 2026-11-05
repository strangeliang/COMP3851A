import { groupQAHistory, historyRecordIds } from './qaHistory.js';
import { isCorrect } from '../../shared/quiz.mjs';

export function recordIsNew(record, page, viewed) {
  if (!viewed || !Array.isArray(viewed[page])) return false;
  const seen = new Set(viewed[page].map(String));
  return historyRecordIds(record).some(id => !seen.has(String(id)));
}

export function studyUnreadCounts(snapshot, userId) {
  if (!snapshot?.ready || String(snapshot.ownerId) !== String(userId)) return { history: 0, review: 0 };
  const records = groupQAHistory(snapshot.records || []);
  return {
    history: records.filter(record => recordIsNew(record, 'history', snapshot.viewed)).length,
    review: records.filter(record => record.kind === 'quiz' && record.payload.questions?.some(question => !isCorrect(question, record.payload.answers?.[question.id]))
      && recordIsNew(record, 'review', snapshot.viewed)).length,
  };
}
