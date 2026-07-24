import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  fixedAccounts,
  initialCourses,
  initialMaterials,
  MAX_FILES_PER_COURSE,
  MAX_FILE_SIZE,
  MAX_TOTAL_FILES,
} from "../data/mockData";
import { loadAppData, saveAppData } from "../services/storageService";
import {
  extractTextFromFile,
  getFileExtension,
  MAX_STORED_TEXT_CHARACTERS,
  SUPPORTED_MATERIAL_EXTENSIONS,
} from "../utils/fileTextExtractor";

const AppDataContext = createContext(null);

function getMaterialIdsForCourse(materialList, courseId) {
  return materialList
    .filter((material) => material.courseId === courseId)
    .map((material) => material.id);
}

function createDefaultData() {
  const defaultCourseId = initialCourses[0]?.id || "";
  const defaultMaterialIds = getMaterialIdsForCourse(initialMaterials, defaultCourseId);

  return {
    currentUser: null,
    users: fixedAccounts,
    courses: initialCourses,
    materials: initialMaterials,
    currentCourseId: defaultCourseId,
    sourceFileId: defaultMaterialIds[0] || "",
    selectedMaterialIds: defaultMaterialIds,
    summaryUses: 0,
    qaUses: 0,
    summaryRecords: [],
    chatRecords: [],
    quizAttempts: [],
    activities: [],
  };
}

function currentTime() {
  return new Date().toLocaleString();
}

export function AppDataProvider({ children }) {
  const [initialData] = useState(() => loadAppData(createDefaultData()));
  const [currentUser, setCurrentUser] = useState(initialData.currentUser);
  const [users, setUsers] = useState(initialData.users);
  const [courses, setCourses] = useState(initialData.courses);
  const [materials, setMaterials] = useState(initialData.materials);
  const [currentCourseId, setCurrentCourseId] = useState(initialData.currentCourseId);
  const [sourceFileId, setSourceFileId] = useState(initialData.sourceFileId);
  const [selectedMaterialIds, setSelectedMaterialIdsState] = useState(
    initialData.selectedMaterialIds ||
      getMaterialIdsForCourse(initialData.materials, initialData.currentCourseId),
  );
  const [summaryUses, setSummaryUses] = useState(initialData.summaryUses);
  const [qaUses, setQaUses] = useState(initialData.qaUses);
  const [summaryRecords, setSummaryRecords] = useState(initialData.summaryRecords);
  const [chatRecords, setChatRecords] = useState(initialData.chatRecords);
  const [quizAttempts, setQuizAttempts] = useState(initialData.quizAttempts);
  const [activities, setActivities] = useState(initialData.activities);
  const [toast, setToast] = useState("");

  const currentCourse = courses.find((course) => course.id === currentCourseId) || null;
  const courseMaterials = materials.filter((material) => material.courseId === currentCourseId);
  const selectedMaterials = useMemo(
    () =>
      courseMaterials.filter((material) =>
        selectedMaterialIds.some((id) => String(id) === String(material.id)),
      ),
    [courseMaterials, selectedMaterialIds],
  );
  const sourceFile =
    selectedMaterials[0] ||
    courseMaterials.find((material) => String(material.id) === String(sourceFileId)) ||
    null;
  const currentChatRecords = useMemo(
    () =>
      chatRecords.filter(
        (record) =>
          record.courseId === currentCourseId &&
          String(record.sourceFileId) === String(sourceFileId),
      ),
    [chatRecords, currentCourseId, sourceFileId],
  );

  useEffect(() => {
    const saved = saveAppData({
      currentUser,
      users,
      courses,
      materials,
      currentCourseId,
      sourceFileId,
      selectedMaterialIds,
      summaryUses,
      qaUses,
      summaryRecords,
      chatRecords,
      quizAttempts,
      activities,
    });
    if (!saved) {
      setToast("Browser storage is full. Recent changes may not persist after refresh.");
    }
  }, [
    currentUser,
    users,
    courses,
    materials,
    currentCourseId,
    sourceFileId,
    selectedMaterialIds,
    summaryUses,
    qaUses,
    summaryRecords,
    chatRecords,
    quizAttempts,
    activities,
  ]);

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function recordActivity(type, description, details = {}) {
    setActivities((current) =>
      [
        {
          id: Date.now() + Math.random(),
          userId: currentUser?.id || 1,
          type,
          description,
          courseId: details.courseId ?? currentCourseId,
          sourceFileId: details.sourceFileId ?? sourceFileId,
          createdAt: currentTime(),
        },
        ...current,
      ].slice(0, 50),
    );
  }

  function setSelectedMaterialIds(nextIds, courseId = currentCourseId, materialList = materials) {
    const allowedIds = getMaterialIdsForCourse(materialList, courseId);
    const filteredIds = allowedIds.filter((id) =>
      nextIds.some((nextId) => String(nextId) === String(id)),
    );

    setSelectedMaterialIdsState(filteredIds);
    setSourceFileId(filteredIds[0] || "");
  }

  function login(email, password) {
    const account = users.find(
      (user) =>
        user.email.toLowerCase() === email.trim().toLowerCase() &&
        user.password === password,
    );
    if (!account) {
      return { ok: false, message: "Invalid email or password." };
    }
    if (account.status !== "Active") {
      return { ok: false, message: "This account is disabled." };
    }
    const safeUser = {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
      status: account.status,
    };
    setCurrentUser(safeUser);
    if (safeUser.role === "Student") {
      const ownedCourses = courses.filter((course) => course.ownerId === safeUser.id);
      const nextCourseId = ownedCourses.some((course) => course.id === currentCourseId)
        ? currentCourseId
        : ownedCourses[0]?.id || "";
      const nextMaterialIds = materials
        .filter(
          (material) =>
            material.ownerId === safeUser.id && material.courseId === nextCourseId,
        )
        .map((material) => material.id);
      setCurrentCourseId(nextCourseId);
      setSelectedMaterialIdsState(nextMaterialIds);
      setSourceFileId(nextMaterialIds[0] || "");
    }
    return { ok: true, user: safeUser };
  }

  function logout() {
    setCurrentUser(null);
  }

  function selectCourse(courseId) {
    const nextMaterialIds = getMaterialIdsForCourse(materials, courseId);
    setCurrentCourseId(courseId);
    setSelectedMaterialIdsState(nextMaterialIds);
    setSourceFileId(nextMaterialIds[0] || "");
    setCourses((current) =>
      current.map((course) =>
        course.id === courseId ? { ...course, updatedAt: "Just now" } : course,
      ),
    );
    recordActivity("course", "Selected a course", {
      courseId,
      sourceFileId: nextMaterialIds[0] || "",
    });
  }

  function createCourse({ code, name }) {
    const trimmedCode = code.trim().toUpperCase();
    const trimmedName = name.trim();
    if (!trimmedCode || !trimmedName) {
      return { ok: false, message: "Course code and name are required." };
    }
    const id = `${trimmedCode}-${Date.now()}`.toLowerCase();
    const nextCourse = {
      id,
      ownerId: currentUser?.id || 1,
      code: trimmedCode,
      name: trimmedName,
      updatedAt: "Just now",
    };
    setCourses((current) => [nextCourse, ...current]);
    setCurrentCourseId(id);
    setSelectedMaterialIdsState([]);
    setSourceFileId("");
    recordActivity("course", `Created course ${trimmedCode}`, {
      courseId: id,
      sourceFileId: "",
    });
    notify("Course created");
    return { ok: true };
  }

  function deleteCourse(courseId) {
    const remainingCourses = courses.filter((course) => course.id !== courseId);
    const currentOwnerId = currentUser?.role === "Student" ? currentUser.id : 1;
    const remainingOwnedCourses = remainingCourses.filter(
      (course) => course.ownerId === currentOwnerId,
    );
    const nextCourseId =
      courseId === currentCourseId ? remainingOwnedCourses[0]?.id || "" : currentCourseId;
    const nextMaterial =
      courseId === currentCourseId
        ? materials.find((material) => material.courseId === nextCourseId)
        : sourceFile;
    const nextMaterialIds =
      courseId === currentCourseId
        ? getMaterialIdsForCourse(materials, nextCourseId)
        : selectedMaterialIds;

    setCourses(remainingCourses);
    setMaterials((current) => current.filter((material) => material.courseId !== courseId));
    setSummaryRecords((current) => current.filter((record) => record.courseId !== courseId));
    setChatRecords((current) => current.filter((record) => record.courseId !== courseId));
    setQuizAttempts((current) => current.filter((attempt) => attempt.courseId !== courseId));
    setCurrentCourseId(nextCourseId);
    setSelectedMaterialIdsState(nextMaterialIds);
    setSourceFileId(nextMaterial?.id || "");
    recordActivity("course", "Deleted a course", { courseId, sourceFileId: "" });
    notify("Course deleted");
  }

  async function addMaterials(fileList, courseId) {
    const selectedFiles = Array.from(fileList || []);
    if (!courseId) return { ok: false, message: "Please select a course first." };
    if (!selectedFiles.length) return { ok: false, message: "Please choose at least one file." };

    const currentCourseFiles = materials.filter((material) => material.courseId === courseId);
    if (currentCourseFiles.length + selectedFiles.length > MAX_FILES_PER_COURSE) {
      return { ok: false, message: "Each course can have at most 5 files." };
    }
    if (materials.length + selectedFiles.length > MAX_TOTAL_FILES) {
      return { ok: false, message: "The demo system can have at most 10 files." };
    }

    const created = [];
    const warnings = [];

    for (const file of selectedFiles) {
      const extension = getFileExtension(file.name);
      if (!SUPPORTED_MATERIAL_EXTENSIONS.includes(extension)) {
        return {
          ok: false,
          message: "Only TXT, MD, PDF, DOCX, PPTX, PNG, JPG, WEBP, and BMP files are supported.",
        };
      }
      if (file.size > MAX_FILE_SIZE) {
        return { ok: false, message: "Each file must be no larger than 10 MB." };
      }

      let extracted;
      try {
        extracted = await extractTextFromFile(file);
      } catch (error) {
        const message = error instanceof Error ? error.message : "The file could not be read.";
        return { ok: false, message: `Could not read ${file.name}: ${message}` };
      }

      const textWasTruncated = extracted.text.length > MAX_STORED_TEXT_CHARACTERS;
      const storageWarning = textWasTruncated
        ? `Extracted text was limited to ${MAX_STORED_TEXT_CHARACTERS.toLocaleString()} characters for browser storage.`
        : "";
      const parseWarning = [extracted.warning, storageWarning].filter(Boolean).join(" ");
      if (parseWarning) warnings.push(`${file.name}: ${parseWarning}`);

      created.push({
        id: Date.now() + created.length,
        courseId,
        ownerId: currentUser?.id || 1,
        name: file.name,
        type: extension.toUpperCase(),
        size: file.size,
        content: extracted.text.slice(0, MAX_STORED_TEXT_CHARACTERS),
        parseWarning,
        status: parseWarning ? "Ready with warning" : "Ready",
        uploadedAt: "Just now",
        updatedAt: "Just now",
      });
    }

    setMaterials((current) => [...created, ...current]);
    if (!sourceFileId && created[0]) setSourceFileId(created[0].id);
    if (courseId === currentCourseId && !selectedMaterialIds.length) {
      setSelectedMaterialIdsState(created.map((material) => material.id));
    }
    recordActivity("upload", `Uploaded ${created.length} material(s)`, {
      courseId,
      sourceFileId: created[0]?.id || "",
    });
    notify(`${created.length} file(s) uploaded`);

    const warningMessage = warnings.length ? ` Warning: ${warnings.join(" ")}` : "";
    return { ok: true, message: `${created.length} file(s) uploaded.${warningMessage}` };
  }


  function deleteMaterial(materialId) {
    const material = materials.find((item) => String(item.id) === String(materialId));
    if (!material) return;

    const remaining = materials.filter((item) => String(item.id) !== String(materialId));
    setMaterials(remaining);
    setSummaryRecords((current) =>
      current.filter((record) => String(record.sourceFileId) !== String(materialId)),
    );
    setChatRecords((current) =>
      current.filter((record) => String(record.sourceFileId) !== String(materialId)),
    );
    setQuizAttempts((current) =>
      current.filter((attempt) => String(attempt.sourceFileId) !== String(materialId)),
    );

    const nextSelectedMaterialIds = selectedMaterialIds.filter(
      (id) => String(id) !== String(materialId),
    );
    setSelectedMaterialIdsState(nextSelectedMaterialIds);
    if (String(sourceFileId) === String(materialId)) {
      setSourceFileId(nextSelectedMaterialIds[0] || "");
    }

    recordActivity("material", `Deleted material ${material.name}`, {
      courseId: material.courseId,
      sourceFileId: material.id,
    });
    notify("Material deleted");
  }

  function recordSummaryUse(summary) {
    setSummaryUses((count) => count + 1);
    setSummaryRecords((current) => [
      {
        id: Date.now(),
        userId: currentUser?.id || 1,
        courseId: currentCourseId,
        sourceFileId,
        summary,
        createdAt: currentTime(),
      },
      ...current,
    ]);
    recordActivity("summary", "Generated a mock summary");
  }

  function recordQAUse() {
    setQaUses((count) => count + 1);
    recordActivity("qa", "Asked a Q&A question");
  }

  function addChatRecord(role, text) {
    setChatRecords((current) => [
      ...current,
      {
        id: Date.now() + Math.random(),
        userId: currentUser?.id || 1,
        courseId: currentCourseId,
        sourceFileId,
        role,
        text,
        createdAt: currentTime(),
      },
    ]);
  }

  function saveQuizAttempt(attempt) {
    setQuizAttempts((current) => [
      {
        id: Date.now(),
        userId: currentUser?.id || 1,
        courseId: currentCourseId,
        sourceFileId,
        completedAt: currentTime(),
        ...attempt,
      },
      ...current,
    ]);
    recordActivity("quiz", `Completed a quiz with score ${attempt.score}%`);
  }

  function toggleUserStatus(userId) {
    setUsers((current) =>
      current.map((user) =>
        user.id === userId
          ? { ...user, status: user.status === "Active" ? "Disabled" : "Active" }
          : user,
      ),
    );
    notify("User status updated");
  }

  const studentCourses = useMemo(
    () => {
      const ownerId = currentUser?.role === "Student" ? currentUser.id : 1;
      return courses.filter((course) => course.ownerId === ownerId);
    },
    [courses, currentUser],
  );
  const studentMaterials = useMemo(
    () => {
      const ownerId = currentUser?.role === "Student" ? currentUser.id : 1;
      return materials.filter((material) => material.ownerId === ownerId);
    },
    [materials, currentUser],
  );
  const averageQuizScore = quizAttempts.length
    ? Math.round(
        quizAttempts.reduce((sum, attempt) => sum + attempt.score, 0) /
          quizAttempts.length,
      )
    : 0;

  const value = {
    currentUser,
    users,
    courses,
    materials,
    currentCourse,
    currentCourseId,
    courseMaterials,
    sourceFile,
    sourceFileId,
    selectedMaterialIds,
    selectedMaterials,
    studentCourses,
    studentMaterials,
    summaryUses,
    qaUses,
    summaryRecords,
    currentChatRecords,
    quizAttempts,
    activities,
    averageQuizScore,
    toast,
    login,
    logout,
    selectCourse,
    setSelectedMaterialIds,
    setSourceFileId,
    createCourse,
    deleteCourse,
    addMaterials,
    deleteMaterial,
    recordSummaryUse,
    recordQAUse,
    addChatRecord,
    saveQuizAttempt,
    toggleUserStatus,
    notify,
  };

  return (
    <AppDataContext.Provider value={value}>
      {children}
      {toast && <div className="app-toast">{toast}</div>}
    </AppDataContext.Provider>
  );
}

// The provider and its hook intentionally share one module in this small prototype.
// eslint-disable-next-line react-refresh/only-export-components
export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error("useAppData must be used inside AppDataProvider");
  }
  return context;
}
