import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fixedAccounts, initialCourses, initialMaterials } from "../data/mockData";
import { loadAppData, saveAppData } from "../services/storageService";
import { apiRequest } from "../services/apiClient";
import { extractTextFromFile, getFileExtension, SUPPORTED_MATERIAL_EXTENSIONS } from "../utils/fileTextExtractor";
import { getRecordMaterialIds, getScopeKey, limits, recordScopeKey, sameId } from "../utils/studyScope";

const AppDataContext = createContext(null);
const now = () => new Date().toLocaleString();
const newId = () => crypto.randomUUID();
const ownedBy = (item, user) => Boolean(user && sameId(item.ownerId, user.id));
const courseFiles = (data, courseId, user) => data.materials.filter(
  (item) => sameId(item.courseId, courseId) && ownedBy(item, user),
);

function createDefaultData() {
  return {
    currentUser: null,
    users: fixedAccounts.map(({ id, name, email, role, status }) => ({ id, name, email, role, status })),
    courses: initialCourses,
    materials: initialMaterials,
    currentCourseId: initialCourses[0]?.id || "",
    sourceFileId: initialMaterials[0]?.id || "",
    selectedMaterialIds: initialMaterials.filter((item) => item.courseId === initialCourses[0]?.id).map((item) => item.id),
    summaryUses: 0, qaUses: 0,
    summaryRecords: [], chatRecords: [], quizAttempts: [], activities: [],
  };
}

export function AppDataProvider({ children }) {
  const [data, setData] = useState(() => loadAppData(createDefaultData()));
  // Every mutation updates this ref synchronously, including before an async upload starts.
  const dataRef = useRef(data);
  const [currentUser, setCurrentUser] = useState(null);
  const userRef = useRef(null);
  const sessionEpoch = useRef(0);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [aiStatus, setAIStatus] = useState({ configured: false, loading: true, message: "Checking AI service…" });
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const uploadRef = useRef(null);
  const [uploadState, setUploadState] = useState({ pending: false, progress: "" });

  function updateData(updater, requirePersistence = false) {
    const next = updater(dataRef.current);
    if (requirePersistence && !saveAppData(next)) throw new Error("Browser storage is full. Remove older materials or study records before uploading again. This batch was not saved.");
    dataRef.current = next;
    setData(next);
  }

  function notify(message) {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 4000);
  }

  function cancelUpload() {
    uploadRef.current?.controller.abort();
  }

  function acceptUser(user) {
    cancelUpload();
    userRef.current = user;
    setCurrentUser(user);
    if (!user) {
      updateData((current) => ({ ...current, selectedMaterialIds: [], sourceFileId: "" }));
      return;
    }
    updateData((current) => {
      const ownedCourses = current.courses.filter((course) => ownedBy(course, user));
      const courseId = ownedCourses.some((course) => sameId(course.id, current.currentCourseId))
        ? current.currentCourseId : ownedCourses[0]?.id || "";
      const available = courseFiles(current, courseId, user).map((item) => item.id);
      const previous = current.selectedMaterialIds.filter((id) => available.some((item) => sameId(item, id)));
      const selected = (previous.length ? previous : available).slice(0, limits.maxFilesPerAIRequest);
      return { ...current, currentCourseId: courseId, selectedMaterialIds: selected, sourceFileId: selected[0] || "" };
    });
  }

  useEffect(() => {
    const controller = new AbortController();
    const epoch = sessionEpoch.current;
    apiRequest("/auth/me", { signal: controller.signal, timeoutMs: 10000 })
      .then(({ user }) => { if (epoch === sessionEpoch.current && !controller.signal.aborted) acceptUser(user); })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setIsAuthLoading(false); });
    const expired = () => {
      sessionEpoch.current += 1;
      acceptUser(null);
      notify("Your session has expired. Please sign in again.");
    };
    window.addEventListener("study-session-expired", expired);
    return () => {
      controller.abort();
      cancelUpload();
      clearTimeout(toastTimer.current);
      window.removeEventListener("study-session-expired", expired);
    };
    // Initialization reads current state through refs; it runs once per provider mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (!currentUser) {
      setAIStatus({ configured: false, loading: false, message: "Sign in to use AI." });
      return () => controller.abort();
    }
    setAIStatus({ configured: false, loading: true, message: "Checking AI service…" });
    apiRequest("/ai/status", { signal: controller.signal, timeoutMs: 10000 })
      .then((status) => {
        if (!controller.signal.aborted) setAIStatus({ ...status, loading: false,
          message: status.configured ? "Gemini configured" : "AI is not configured. Ask the person running this app to configure the server." });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setAIStatus({ configured: false, loading: false, message: error.message });
      });
    return () => controller.abort();
  }, [currentUser]);

  useEffect(() => {
    if (!saveAppData(data)) setToast("Browser storage is full. Recent changes may not persist after refresh.");
  }, [data]);

  function scopeNow() {
    const current = dataRef.current;
    const user = userRef.current;
    const ids = courseFiles(current, current.currentCourseId, user)
      .filter((item) => current.selectedMaterialIds.some((id) => sameId(id, item.id))).map((item) => item.id);
    return { userId: user?.id, courseId: current.currentCourseId, selectedMaterialIds: ids,
      sourceFileId: ids[0] || "", scopeKey: getScopeKey(user?.id, current.currentCourseId, ids) };
  }

  function scopeIsCurrent(scope) {
    return Boolean(userRef.current && scope.selectedMaterialIds?.length && scope.scopeKey === scopeNow().scopeKey);
  }

  function activity(current, type, description, details = {}) {
    return [{ id: newId(), userId: userRef.current?.id, type, description,
      courseId: details.courseId ?? current.currentCourseId,
      sourceFileId: details.sourceFileId ?? current.sourceFileId, createdAt: now() }, ...current.activities].slice(0, 200);
  }

  async function login(email, password, remember = false) {
    const epoch = ++sessionEpoch.current;
    try {
      const { user } = await apiRequest("/auth/login", { method: "POST", body: { email, password, remember }, timeoutMs: 15000 });
      if (epoch !== sessionEpoch.current) return { ok: false, message: "Sign-in was cancelled." };
      acceptUser(user);
      setIsAuthLoading(false);
      return { ok: true, user };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  }

  async function logout() {
    sessionEpoch.current += 1;
    setIsAuthLoading(true);
    acceptUser(null);
    try { await apiRequest("/auth/logout", { method: "POST", timeoutMs: 10000 }); }
    catch { notify("Could not reach the server to end the session. Reconnect and sign out again, or close this browser session."); }
    finally { setIsAuthLoading(false); }
  }

  function setSelectedMaterialIds(nextIds) {
    const current = dataRef.current;
    const allowed = courseFiles(current, current.currentCourseId, userRef.current);
    const ids = allowed.filter((item) => nextIds.some((id) => sameId(id, item.id))).map((item) => item.id);
    if (ids.length > limits.maxFilesPerAIRequest) {
      notify(`Select at most ${limits.maxFilesPerAIRequest} files per AI request.`);
      return false;
    }
    updateData((state) => ({ ...state, selectedMaterialIds: ids, sourceFileId: ids[0] || "" }));
    return true;
  }

  function selectCourse(courseId) {
    const current = dataRef.current;
    const course = current.courses.find((item) => sameId(item.id, courseId) && ownedBy(item, userRef.current));
    if (!course) return;
    cancelUpload();
    const ids = courseFiles(current, courseId, userRef.current).slice(0, limits.maxFilesPerAIRequest).map((item) => item.id);
    updateData((state) => ({ ...state, currentCourseId: course.id, selectedMaterialIds: ids, sourceFileId: ids[0] || "" }));
  }

  function createCourse({ code, name }) {
    if (userRef.current?.role !== "Student") return { ok: false, message: "Please sign in as a student." };
    const trimmedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();
    if (!trimmedCode || !trimmedName || trimmedCode.length > 40 || trimmedName.length > 120) {
      return { ok: false, message: "Enter a course code (up to 40 characters) and name (up to 120 characters)." };
    }
    const current = dataRef.current;
    if (current.courses.some((course) => ownedBy(course, userRef.current) && course.code.toUpperCase() === trimmedCode)) {
      return { ok: false, message: "You already have a course with this code." };
    }
    cancelUpload();
    const course = { id: newId(), ownerId: userRef.current.id, code: trimmedCode, name: trimmedName, updatedAt: "Just now" };
    updateData((state) => ({ ...state, courses: [course, ...state.courses], currentCourseId: course.id,
      selectedMaterialIds: [], sourceFileId: "", activities: activity(state, "course", `Created course ${trimmedCode}`, { courseId: course.id, sourceFileId: "" }) }));
    notify("Course created");
    return { ok: true };
  }

  function deleteCourse(courseId) {
    if (!dataRef.current.courses.some((item) => sameId(item.id, courseId) && ownedBy(item, userRef.current))) return;
    if (sameId(uploadRef.current?.courseId, courseId)) cancelUpload();
    updateData((current) => {
      const courses = current.courses.filter((item) => !sameId(item.id, courseId));
      const materials = current.materials.filter((item) => !sameId(item.courseId, courseId));
      const nextCourseId = sameId(current.currentCourseId, courseId)
        ? courses.find((item) => ownedBy(item, userRef.current))?.id || "" : current.currentCourseId;
      const ids = sameId(current.currentCourseId, courseId)
        ? courseFiles({ materials }, nextCourseId, userRef.current).slice(0, limits.maxFilesPerAIRequest).map((item) => item.id)
        : current.selectedMaterialIds;
      const keep = (record) => !sameId(record.courseId, courseId);
      return { ...current, courses, materials, currentCourseId: nextCourseId, selectedMaterialIds: ids, sourceFileId: ids[0] || "",
        summaryRecords: current.summaryRecords.filter(keep), chatRecords: current.chatRecords.filter(keep),
        quizAttempts: current.quizAttempts.filter(keep), activities: activity(current, "course", "Deleted a course", { courseId, sourceFileId: "" }) };
    });
    notify("Course deleted");
  }

  function uploadError(files, courseId, user) {
    const current = dataRef.current;
    if (user?.role !== "Student" || !current.courses.some((item) => sameId(item.id, courseId) && ownedBy(item, user))) return "Please select one of your courses first.";
    if (!files.length) return "Please choose at least one file.";
    if (files.length > limits.maxFilesPerUpload) return `Upload at most ${limits.maxFilesPerUpload} files at a time.`;
    if (courseFiles(current, courseId, user).length + files.length > limits.maxFilesPerCourse) return `Each course can have at most ${limits.maxFilesPerCourse} files.`;
    if (current.materials.filter((item) => ownedBy(item, user)).length + files.length > limits.maxTotalFilesPerUser) return `Each student can store at most ${limits.maxTotalFilesPerUser} files in this browser.`;
    for (const file of files) {
      if (!SUPPORTED_MATERIAL_EXTENSIONS.includes(getFileExtension(file.name))) return `Unsupported file type: ${file.name}`;
      if (file.size > limits.maxFileBytes) return `Each file must be no larger than 10 MB: ${file.name}`;
      if (file.name.length > 255) return "File names must be no longer than 255 characters.";
    }
    return "";
  }

  async function addMaterials(fileList, courseId) {
    if (uploadRef.current) return { ok: false, message: "An upload is already in progress. Please wait or cancel it." };
    const files = Array.from(fileList || []);
    const user = userRef.current;
    const error = uploadError(files, courseId, user);
    if (error) return { ok: false, message: error };
    const request = { controller: new AbortController(), courseId, userId: user.id, epoch: sessionEpoch.current };
    uploadRef.current = request;
    setUploadState({ pending: true, progress: "Reading files…" });
    try {
      const created = [];
      for (const file of files) {
        request.controller.signal.throwIfAborted();
        const extracted = await extractTextFromFile(file, { signal: request.controller.signal,
          onProgress: (progress) => { if (!request.controller.signal.aborted) setUploadState({ pending: true, progress: `${file.name}: ${progress}` }); },
        });
        request.controller.signal.throwIfAborted();
        if (!extracted.text?.trim()) throw new Error(`${file.name} has no readable text.`);
        if (extracted.text.length > limits.maxStoredTextCharacters) throw new Error(`${file.name} exceeds 100,000 extracted characters. Split it into smaller documents and upload again.`);
        created.push({ id: newId(), courseId, ownerId: user.id, name: file.name, type: getFileExtension(file.name).toUpperCase(),
          size: file.size, content: extracted.text, parseWarning: extracted.warning || "", incomplete: false,
          status: extracted.warning ? "Ready with warning" : "Ready", uploadedAt: "Just now", updatedAt: "Just now" });
      }
      if (request.epoch !== sessionEpoch.current || !sameId(userRef.current?.id, user.id)) throw new DOMException("Upload cancelled", "AbortError");
      const finalError = uploadError(files, courseId, user);
      if (finalError) throw new Error(finalError);
      updateData((current) => {
        const ids = sameId(current.currentCourseId, courseId) && !current.selectedMaterialIds.length
          ? created.slice(0, limits.maxFilesPerAIRequest).map((item) => item.id) : current.selectedMaterialIds;
        return { ...current, materials: [...created, ...current.materials], selectedMaterialIds: ids, sourceFileId: ids[0] || "",
          activities: activity(current, "upload", `Uploaded ${created.length} material(s)`, { courseId, sourceFileId: created[0].id }) };
      }, true);
      notify(`${created.length} file(s) uploaded`);
      return { ok: true, message: `${created.length} file(s) uploaded.${created.some((item) => item.parseWarning) ? " Review the reading notes below." : ""}` };
    } catch (failure) {
      return { ok: false, message: failure?.name === "AbortError" ? "Upload cancelled. No files from this batch were added." : failure?.message || (typeof failure === "string" ? failure : "The file could not be read. Try a different file or format.") };
    } finally {
      if (uploadRef.current === request) {
        uploadRef.current = null;
        setUploadState({ pending: false, progress: "" });
      }
    }
  }

  function deleteMaterial(materialId) {
    const material = dataRef.current.materials.find((item) => sameId(item.id, materialId) && ownedBy(item, userRef.current));
    if (!material) return;
    updateData((current) => {
      const keep = (record) => !getRecordMaterialIds(record).some((id) => sameId(id, materialId));
      const ids = current.selectedMaterialIds.filter((id) => !sameId(id, materialId));
      return { ...current, materials: current.materials.filter((item) => !sameId(item.id, materialId)),
        selectedMaterialIds: ids, sourceFileId: ids[0] || "", summaryRecords: current.summaryRecords.filter(keep),
        chatRecords: current.chatRecords.filter(keep), quizAttempts: current.quizAttempts.filter(keep),
        activities: activity(current, "material", `Deleted material ${material.name}`, { courseId: material.courseId, sourceFileId: material.id }) };
    });
    notify("Material deleted");
  }

  function recordSummaryUse(summary, scope = scopeNow()) {
    if (!scopeIsCurrent(scope)) return;
    updateData((current) => ({ ...current, summaryUses: current.summaryUses + 1,
      summaryRecords: [{ id: newId(), ...scope, summary, mode: "api", createdAt: now() }, ...current.summaryRecords],
      activities: activity(current, "summary", "Generated a Gemini summary") }));
  }

  function recordQAUse(scope = scopeNow()) {
    if (!scopeIsCurrent(scope)) return;
    updateData((current) => ({ ...current, qaUses: current.qaUses + 1, activities: activity(current, "qa", "Asked a Q&A question") }));
  }

  function addChatRecord(role, text, details = {}) {
    const scope = details.scope || scopeNow();
    if (!scopeIsCurrent(scope) || !["User", "AI"].includes(role) || typeof text !== "string") return;
    updateData((current) => ({ ...current, chatRecords: [...current.chatRecords,
      { id: newId(), ...scope, role, text, mode: details.mode || "api", createdAt: now() }] }));
  }

  function saveQuizAttempt(attempt, scope = scopeNow()) {
    if (!scopeIsCurrent(scope) || !Number.isFinite(attempt.score) || attempt.score < 0 || attempt.score > 100) return;
    updateData((current) => ({ ...current, quizAttempts: [{ ...attempt, id: newId(), ...scope, completedAt: now() }, ...current.quizAttempts],
      activities: activity(current, "quiz", `Completed a quiz with score ${attempt.score}%`) }));
  }

  function toggleUserStatus(userId) {
    if (userRef.current?.role !== "Admin") return;
    updateData((current) => ({ ...current, users: current.users.map((user) => sameId(user.id, userId)
      ? { ...user, status: user.status === "Active" ? "Disabled" : "Active" } : user) }));
    notify("Demo user status updated locally; server accounts are managed separately.");
  }

  const studentCourses = data.courses.filter((item) => ownedBy(item, currentUser));
  const studentMaterials = data.materials.filter((item) => ownedBy(item, currentUser));
  const currentCourse = studentCourses.find((item) => sameId(item.id, data.currentCourseId)) || null;
  const courseMaterials = studentMaterials.filter((item) => sameId(item.courseId, currentCourse?.id));
  const selectedMaterials = courseMaterials.filter((item) => data.selectedMaterialIds.some((id) => sameId(id, item.id)));
  const scope = { userId: currentUser?.id, courseId: data.currentCourseId, selectedMaterialIds: selectedMaterials.map((item) => item.id),
    sourceFileId: selectedMaterials[0]?.id || "" };
  scope.scopeKey = getScopeKey(scope.userId, scope.courseId, scope.selectedMaterialIds);
  const visibleRecords = (records) => currentUser?.role === "Admin" ? records : records.filter((record) => sameId(record.userId, currentUser?.id));
  const summaryRecords = visibleRecords(data.summaryRecords);
  const quizAttempts = visibleRecords(data.quizAttempts);
  const chatRecords = visibleRecords(data.chatRecords);
  const currentChatRecords = useMemo(() => data.chatRecords.filter((record) => recordScopeKey(record) === scope.scopeKey), [data.chatRecords, scope.scopeKey]);
  const averageQuizScore = quizAttempts.length ? Math.round(quizAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / quizAttempts.length) : 0;
  const value = {
    currentUser, isAuthLoading, aiStatus, users: data.users,
    courses: currentUser?.role === "Admin" ? data.courses : studentCourses,
    materials: currentUser?.role === "Admin" ? data.materials : studentMaterials,
    currentCourse, currentCourseId: data.currentCourseId, courseMaterials,
    sourceFile: selectedMaterials[0] || null, sourceFileId: scope.sourceFileId,
    selectedMaterialIds: scope.selectedMaterialIds, selectedMaterials, studentCourses, studentMaterials,
    summaryUses: summaryRecords.length, qaUses: chatRecords.filter((record) => record.role === "User").length,
    summaryRecords, currentChatRecords, quizAttempts, activities: visibleRecords(data.activities), averageQuizScore,
    currentSummaryRecord: summaryRecords.find((record) => record.mode === "api" && recordScopeKey(record) === scope.scopeKey) || null,
    scope, toast, uploadState, login, logout, selectCourse, setSelectedMaterialIds,
    setSourceFileId: (id) => setSelectedMaterialIds(id ? [id] : []),
    createCourse, deleteCourse, addMaterials, cancelUpload, deleteMaterial,
    recordSummaryUse, recordQAUse, addChatRecord, saveQuizAttempt, toggleUserStatus, notify,
  };
  return <AppDataContext.Provider value={value}>{children}{toast && <div className="app-toast" role="status">{toast}</div>}</AppDataContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) throw new Error("useAppData must be used inside AppDataProvider");
  return context;
}
