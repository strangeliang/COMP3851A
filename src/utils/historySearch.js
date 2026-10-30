import { qaMessages } from "./qaHistory";

export function historyMatchesQuery(record, query, materials = [], courses = []) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const payload = record.payload || {};
  const selectedIds = Array.isArray(payload.selectedMaterialIds) ? payload.selectedMaterialIds : [payload.sourceFileId];
  const ids = new Set(selectedIds.filter(id => id != null).map(String));
  const course = courses.find(item => String(item.id) === String(record.course_id));
  const parts = [course?.name, course?.code, record.kind,
    ...materials.filter(item => ids.has(String(item.id)) && String(item.course_id ?? item.courseId) === String(record.course_id)).map(item => item.name)];
  if (record.kind === "qa") parts.push(...qaMessages(record).map(message => message.payload.text));
  if (record.kind === "summary") parts.push(payload.summary?.paragraph, ...(payload.summary?.concepts || []));
  if (record.kind === "quiz") for (const question of payload.questions || []) parts.push(question.question, question.explanation, ...question.options);
  if (record.kind === "flashcards") for (const card of payload.cards || []) parts.push(card.front, card.back, card.source);
  return parts.filter(part => typeof part === "string").join("\n").toLowerCase().includes(needle);
}
