import { sameId } from "./studyScope";

export function answerSources(record, provenance, scope, materials) {
  if (record.role !== "AI" || record.mode !== "api" || typeof record.text !== "string"
    || !provenance || provenance.scopeKey !== scope.scopeKey || record.scopeKey !== scope.scopeKey
    || !sameId(record.userId, scope.userId) || !sameId(record.courseId, scope.courseId)) return [];
  const ids = provenance.materialIds;
  if (!Array.isArray(ids) || ids.length !== materials.length || new Set(ids.map(String)).size !== ids.length
    || !ids.every(id => materials.some(material => sameId(material.id, id)
      && sameId(material.courseId, scope.courseId) && (material.ownerId == null || sameId(material.ownerId, scope.userId))))) return [];
  const cited = [...record.text.matchAll(/\[S([1-9]\d*)\]/g)].map(match => Number(match[1]));
  return [...new Set(cited)].filter(index => Number.isSafeInteger(index) && index <= ids.length)
    .map(index => ({ label: `[S${index}]`, material: materials.find(material => sameId(material.id, ids[index - 1])) }));
}
