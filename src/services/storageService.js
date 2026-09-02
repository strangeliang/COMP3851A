export const STORAGE_KEY = "study-companion-app-data";
const LEGACY_USER_KEY = "study-companion-user";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const hasId = (value) => typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
const recordIsValid = (value) => isObject(value) && hasId(value.id) && hasId(value.userId) && typeof value.courseId === "string";

export function loadAppData(defaultData) {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData;
    const stored = JSON.parse(raw);
    if (!isObject(stored)) return defaultData;
    const data = { ...defaultData, ...stored, currentUser: null };
    const arrays = ["users", "courses", "materials", "selectedMaterialIds", "summaryRecords", "chatRecords", "quizAttempts", "activities"];
    for (const key of arrays) if (!Array.isArray(data[key])) data[key] = defaultData[key];
    data.users = data.users.filter((user) => isObject(user) && hasId(user.id) && typeof user.email === "string" && typeof user.name === "string")
      .map(({ id, name, email, role, status }) => ({ id, name, email, role, status }));
    data.courses = data.courses.filter((course) => isObject(course) && typeof course.id === "string" && hasId(course.ownerId) && typeof course.code === "string" && typeof course.name === "string");
    data.materials = data.materials.filter((material) => isObject(material) && hasId(material.id) && hasId(material.ownerId) && typeof material.name === "string" && typeof material.content === "string" && data.courses.some((course) => course.id === material.courseId && String(course.ownerId) === String(material.ownerId)));
    data.chatRecords = data.chatRecords.filter((record) => recordIsValid(record) && typeof record.text === "string" && ["User", "AI"].includes(record.role));
    data.summaryRecords = data.summaryRecords.filter((record) => recordIsValid(record) && isObject(record.summary) && typeof record.summary.paragraph === "string" && Array.isArray(record.summary.concepts) && record.summary.concepts.every((concept) => typeof concept === "string"));
    data.quizAttempts = data.quizAttempts.filter((record) => recordIsValid(record) && Number.isFinite(record.score) && record.score >= 0 && record.score <= 100);
    data.activities = data.activities.filter((record) => recordIsValid(record) && typeof record.description === "string");
    data.selectedMaterialIds = data.selectedMaterialIds.filter(hasId);
    data.currentCourseId = typeof data.currentCourseId === "string" ? data.currentCourseId : "";
    data.sourceFileId = hasId(data.sourceFileId) ? data.sourceFileId : "";
    data.summaryUses = Number.isFinite(data.summaryUses) ? data.summaryUses : 0;
    data.qaUses = Number.isFinite(data.qaUses) ? data.qaUses : 0;
    return data;
  } catch {
    return defaultData;
  }
}

export function saveAppData(data) {
  try {
    // A browser cache can never grant an authenticated session.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, currentUser: null, schemaVersion: 2 }));
    window.localStorage.removeItem(LEGACY_USER_KEY);
    return true;
  } catch {
    return false;
  }
}
