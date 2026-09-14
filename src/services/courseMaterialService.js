import { apiRequest, APIError } from "./apiClient";

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
    hasOriginal: Boolean(row.has_original),
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
  const result = await apiRequest("/courses", { signal, timeoutMs: 15000 });
  if (!Array.isArray(result?.courses)) invalidResponse("course list");
  return result.courses.map((course) => adaptCourse(course, userId));
}

export async function getCourseMaterials(courseId, userId, { signal } = {}) {
  const result = await apiRequest(`/courses/${encodeURIComponent(courseId)}/materials`, {
    signal, timeoutMs: 30000,
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
    body: { name: material.name, type: material.type, sizeBytes: material.size, content: material.content },
    signal,
    timeoutMs: 95000,
  });
  const saved = adaptMaterial(result?.material, userId, courseId);
  if (material.originalFile) {
    try {
      await apiRequest(`/materials/${saved.id}/original`, {
        method: "PUT", body: material.originalFile,
        headers: { "Content-Type": "application/octet-stream" }, signal,
      });
      saved.hasOriginal = true;
    } catch (error) {
      // Use a fresh request even if the upload was cancelled, to remove partial records.
      try { await deleteMaterial(saved.id, userId); }
      catch { throw new APIError("Original upload failed and cleanup could not be confirmed. Refresh Upload before retrying.", "UPLOAD_CLEANUP_FAILED"); }
      throw error;
    }
  }
  return saved;
}

export async function deleteMaterial(materialId, _userId, { signal } = {}) {
  return apiRequest(`/materials/${encodeURIComponent(materialId)}`, {
    method: "DELETE", signal, timeoutMs: 15000,
  });
}
