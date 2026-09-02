import limits from "../../shared/studyLimits.json";

export { limits };
export const sameId = (left, right) => String(left) === String(right);

export function getScopeKey(userId, courseId, materialIds = []) {
  return JSON.stringify([String(userId ?? ""), String(courseId || ""), [...new Set(materialIds.map(String))].sort()]);
}

export function getRecordMaterialIds(record) {
  return Array.isArray(record.selectedMaterialIds) ? record.selectedMaterialIds : record.sourceFileId ? [record.sourceFileId] : [];
}

export function recordScopeKey(record) {
  return getScopeKey(record.userId, record.courseId, getRecordMaterialIds(record));
}

export function materialIsIncomplete(material) {
  return Boolean(material.incomplete || /first \d+ pages only|limited to [\d,]+ characters/i.test(material.parseWarning || ""));
}

export function selectionError(materials) {
  if (!materials.length) return "Select at least one material first.";
  if (materials.length > limits.maxFilesPerAIRequest) return `Select at most ${limits.maxFilesPerAIRequest} materials for one AI request.`;
  if (materials.some(materialIsIncomplete)) return "A selected file was only partially read by an older version. Please upload it again.";
  if (materials.some((material) => !material.content?.trim())) return "Every selected material needs readable text.";
  if (materials.reduce((total, material) => total + material.content.length, 0) > limits.maxAIContextCharacters) {
    return `Selected text exceeds ${limits.maxAIContextCharacters.toLocaleString()} characters. Select fewer files or split a long document. Nothing will be silently cut off.`;
  }
  return "";
}

export function recentHistory(records) {
  const selected = [];
  let size = 0;
  for (const record of [...records].reverse()) {
    if (record.mode !== "api" || !["User", "AI"].includes(record.role)) continue;
    if (selected.length >= limits.maxHistoryMessages || size + record.text.length > limits.maxHistoryCharacters) break;
    selected.unshift({ role: record.role === "User" ? "user" : "model", text: record.text });
    size += record.text.length;
  }
  // Avoid starting a supplied conversation with an orphaned model response.
  while (selected[0]?.role === "model") selected.shift();
  return selected;
}
