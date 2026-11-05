import { sameId } from "./studyScope";
import { parseSourceCitations } from "../../shared/sourceCitations.mjs";

export function answerSources(record, provenance, scope, materials) {
  if (record.role !== "AI" || record.mode !== "api" || typeof record.text !== "string"
    || !provenance || provenance.scopeKey !== scope.scopeKey || record.scopeKey !== scope.scopeKey
    || !sameId(record.userId, scope.userId) || !sameId(record.courseId, scope.courseId)) return [];
  const ids = provenance.materialIds;
  if (!Array.isArray(ids) || ids.length !== materials.length || new Set(ids.map(String)).size !== ids.length
    || !ids.every(id => materials.some(material => sameId(material.id, id)
      && sameId(material.courseId, scope.courseId) && (material.ownerId == null || sameId(material.ownerId, scope.userId))))) return [];
  return parseSourceCitations(record.text).filter(citation => citation.source <= ids.length)
    .map(citation => ({ label: citation.label, location: citation.location,
      material: materials.find(material => sameId(material.id, ids[citation.source - 1])) }));
}
