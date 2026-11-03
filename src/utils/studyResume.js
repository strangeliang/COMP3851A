import { studyTimestamp } from "./dateTime";
import { limits, sameId } from "./studyScope";

const studyModes = new Set(["summary", "qa", "quiz", "flashcards"]);
const ownedBy = (item, userId) => item && userId != null
  && sameId(item.owner_id ?? item.ownerId, userId);

// Only resume complete, still-owned source selections. A partial selection would
// silently change the material behind the saved activity.
export function studyResumeTarget({ userId, courses = [], materials = [], records = [], reviews = [], currentCourseId, selectedMaterialIds = [] }) {
  if (userId == null) return null;
  const ownedCourses = courses.filter(course => ownedBy(course, userId));
  const available = materials.filter(material => ownedBy(material, userId)
    && ownedCourses.some(course => sameId(course.id, material.courseId ?? material.course_id)));
  const ownRecords = records.filter(record => ownedBy(record, userId) && studyModes.has(record.kind));
  const activities = [...ownRecords, ...reviews.flatMap(review => {
    if (!ownedBy(review, userId)) return [];
    const original = ownRecords.find(record => record.kind === "quiz" && sameId(record.id, review.record_id));
    return original ? [{ ...original, created_at: review.created_at }] : [];
  })].filter(record => Number.isFinite(studyTimestamp(record.created_at)))
    .sort((a, b) => studyTimestamp(b.created_at) - studyTimestamp(a.created_at));

  for (const record of activities) {
    const course = ownedCourses.find(item => sameId(item.id, record.course_id));
    if (!course) continue;
    const payload = record.payload || {};
    const sourceIds = Array.isArray(payload.selectedMaterialIds) && payload.selectedMaterialIds.length
      ? payload.selectedMaterialIds : [payload.sourceFileId];
    const ids = [...new Set(sourceIds.filter(id => id != null && id !== "").map(String))];
    if (!ids.length || ids.length > limits.maxFilesPerAIRequest) continue;
    const sources = ids.map(id => available.find(material => sameId(material.id, id)
      && sameId(material.courseId ?? material.course_id, course.id)));
    if (sources.some(source => !source)) continue;
    return { courseId: course.id, materialIds: sources.map(source => source.id), mode: record.kind,
      recordId: record.id, createdAt: record.created_at, fromHistory: true };
  }

  const current = ownedCourses.find(course => sameId(course.id, currentCourseId));
  const ordered = current ? [current, ...ownedCourses.filter(course => course !== current)] : ownedCourses;
  for (const course of ordered) {
    const sources = available.filter(material => sameId(material.courseId ?? material.course_id, course.id));
    if (!sources.length) continue;
    const selected = sameId(course.id, currentCourseId)
      ? sources.filter(material => selectedMaterialIds.some(id => sameId(id, material.id))) : [];
    return { courseId: course.id, materialIds: (selected.length ? selected : sources).slice(0, limits.maxFilesPerAIRequest).map(material => material.id),
      mode: "summary", recordId: null, createdAt: null, fromHistory: false };
  }
  return null;
}
