import { apiRequest, APIError } from "./apiClient";

function userHeaders(userId) {
  if (!Number.isSafeInteger(userId) || userId < 1) {
    throw new APIError("Your user identity is unavailable. Please sign in again.", "INVALID_CURRENT_USER", 401);
  }
  return { "x-user-id": String(userId) };
}

function invalidResponse(resource) {
  throw new APIError(`The service returned an invalid ${resource} response. Please retry.`, "INVALID_SERVER_RESPONSE", 502);
}

export function adaptCourse(row, userId) {
  if (!row || typeof row.id !== "string" || !row.id || typeof row.code !== "string" || typeof row.name !== "string") {
    invalidResponse("course");
  }
  return {
    id: row.id,
    ownerId: userId,
    code: row.code,
    name: row.name,
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : row.created_at || "",
  };
}

export function adaptMaterial(row, userId, expectedCourseId = "") {
  if (!row || !Number.isSafeInteger(row.id) || row.id < 1 || typeof row.course_id !== "string" || !row.course_id
    || (expectedCourseId && row.course_id !== expectedCourseId) || typeof row.name !== "string" || typeof row.type !== "string"
    || !Number.isSafeInteger(row.size_bytes) || row.size_bytes < 0 || (row.content !== null && typeof row.content !== "string")) {
    invalidResponse("material");
  }
  return {
    id: row.id,
    courseId: row.course_id,
    ownerId: userId,
    name: row.name,
    type: row.type,
    size: row.size_bytes,
    status: typeof row.status === "string" ? row.status : "Ready",
    content: row.content || "",
    parseWarning: "",
    incomplete: false,
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    uploadedAt: typeof row.created_at === "string" ? row.created_at : "",
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : row.created_at || "",
  };
}

export async function getCourses(userId, { signal } = {}) {
  const result = await apiRequest("/courses", { headers: userHeaders(userId), signal, timeoutMs: 15000 });
  if (!Array.isArray(result?.courses)) invalidResponse("course list");
  return result.courses.map((course) => adaptCourse(course, userId));
}

export async function getCourseMaterials(courseId, userId, { signal } = {}) {
  const result = await apiRequest(`/courses/${encodeURIComponent(courseId)}/materials`, {
    headers: userHeaders(userId), signal, timeoutMs: 30000,
  });
  if (!Array.isArray(result?.materials)) invalidResponse("material list");
  return result.materials.map((material) => adaptMaterial(material, userId, courseId));
}

export async function createCourse(course, userId, { signal } = {}) {
  const result = await apiRequest("/courses", {
    method: "POST", body: { code: course.code, name: course.name }, signal, timeoutMs: 15000,
  });
  return adaptCourse(result?.course, userId);
}

export async function deleteCourse(courseId, { signal } = {}) {
  return apiRequest(`/courses/${encodeURIComponent(courseId)}`, { method: "DELETE", signal, timeoutMs: 15000 });
}

export async function createMaterial(courseId, material, userId, { signal } = {}) {
  const result = await apiRequest(`/courses/${encodeURIComponent(courseId)}/materials`, {
    method: "POST",
    headers: userHeaders(userId),
    body: { name: material.name, type: material.type, sizeBytes: material.size, content: material.content },
    signal,
    timeoutMs: 95000,
  });
  return adaptMaterial(result?.material, userId, courseId);
}

export async function deleteMaterial(materialId, userId, { signal } = {}) {
  return apiRequest(`/materials/${encodeURIComponent(materialId)}`, {
    method: "DELETE", headers: userHeaders(userId), signal, timeoutMs: 15000,
  });
}
