import { FileText, FolderOpen, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Toolbar from "../../components/Toolbar";
import StudentLayout from "../../layouts/StudentLayout";
import { limits } from "../../utils/studyScope";
import { useAppData } from "../../state/AppDataContext";
import { formatFileSize } from "../../utils/fileTextExtractor";

export default function UploadPage() {
  const {
    studentCourses,
    materials,
    currentCourse,
    currentCourseId,
    courseMaterials,
    selectCourse,
    addMaterials,
    deleteMaterial,
    uploadState,
    cancelUpload,
  } = useAppData();
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(null);
  const inputRef = useRef(null);
  const pageScope = useRef(currentCourseId);
  pageScope.current = currentCourseId;
  useEffect(() => {
    setSelectedFiles([]); setStatus(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [currentCourseId]);

  const visibleMaterials = useMemo(() => {
    const query = search.trim().toLowerCase();
    return courseMaterials.filter((material) =>
      !query || `${material.name} ${material.type}`.toLowerCase().includes(query),
    );
  }, [courseMaterials, search]);

  function selectFiles(event) {
    const files = Array.from(event.target.files || []);
    if (files.length > limits.maxFilesPerUpload) {
      setSelectedFiles([]);
      setStatus({ ok: false, message: `Choose at most ${limits.maxFilesPerUpload} files at a time.` });
      event.target.value = "";
      return;
    }
    setSelectedFiles(files); setStatus(null);
  }

  async function uploadAll() {
    const courseId = currentCourseId;
    const result = await addMaterials(selectedFiles, courseId);
    if (pageScope.current !== courseId) return;
    setStatus(result);
    if (result.ok) {
      setSelectedFiles([]);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeMaterial(material) {
    if (window.confirm(`Delete ${material.name} and the study records that use it?`)) deleteMaterial(material.id);
  }

  const profileContent = (
    <>
      <div className="quick-stats profile-stack">
        <div className="quick-stat">
          <span className="stat-icon">{selectedFiles.length}</span>
          <div><span>Selected</span><strong>{selectedFiles.length} file(s)</strong></div>
        </div>
        <div className="quick-stat">
          <span className="stat-icon"><FolderOpen size={17} /></span>
          <div><span>Current Course</span><strong>{courseMaterials.length}/{limits.maxFilesPerCourse}</strong></div>
        </div>
      </div>
      <h3 className="side-heading">Upload Rules</h3>
      <div className="side-list">
        <div className="side-item"><strong>Format</strong><span>TXT, MD, PDF, DOCX, PPTX, PNG, JPG, JPEG, WEBP, BMP</span></div>
        <div className="side-item"><strong>Each upload</strong><span>{limits.maxFilesPerUpload} files maximum</span></div>
        <div className="side-item"><strong>Single File</strong><span>{formatFileSize(limits.maxFileBytes)} maximum</span></div>
        <div className="side-item"><strong>Your file limit</strong><span>{materials.length}/{limits.maxTotalFilesPerUser} total files</span></div>
      </div>
    </>
  );

  return (
    <StudentLayout
      profileProps={{
        title: "Upload Overview",
        name: currentCourse ? currentCourse.code : "No Course",
        subtitle: "Files are stored under the selected course only.",
      }}
      profileContent={profileContent}
    >
      <Toolbar value={search} onChange={setSearch} placeholder="Search current course materials..." />
      <header className="workspace-header">
        <h1>Upload Study Materials</h1>
        <p>Upload text, PDF, Office, or image files. Files are grouped by the selected course.</p>
      </header>

      <div className="control-grid">
        <label className="user-field">
          Current Course
          <select value={currentCourseId} onChange={(event) => selectCourse(event.target.value)} disabled={uploadState.pending || !studentCourses.length}>
            {!studentCourses.length && <option value="">Create a course first</option>}
            {studentCourses.map((course) => (
              <option key={course.id} value={course.id}>{course.code} {course.name}</option>
            ))}
          </select>
        </label>
        <div className="rule-card">
          <strong>Course file limit</strong>
          <span>{courseMaterials.length}/{limits.maxFilesPerCourse} files in this course</span>
        </div>
      </div>

      <section className={`upload-dropzone${!currentCourse ? " disabled-zone" : ""}`}>
        <span className="upload-symbol"><UploadCloud size={28} /></span>
        <h2>{selectedFiles.length ? `${selectedFiles.length} file(s) selected` : "Choose study materials"}</h2>
        <p>Choose up to {limits.maxFilesPerUpload} files per upload. Each file must contain no more than {limits.maxStoredTextCharacters.toLocaleString()} extracted characters.</p>
        <p>PDF: up to {limits.maxPDFPages} pages and {limits.maxPDFOCRPages} pages needing OCR. OCR supports English and Simplified Chinese.</p>
        <label className="file-picker-modern">
          Choose Files
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".txt,.md,.pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp,.bmp"
            onChange={selectFiles}
            disabled={!currentCourse || uploadState.pending}
          />
        </label>
        {!!selectedFiles.length && (
          <div className="selected-file-names">
            {selectedFiles.map((file, index) => (
              <span key={`${file.name}-${index}`}>{file.name}</span>
            ))}
          </div>
        )}
      </section>

      <div className="content-heading section-gap">
        <h2>Current Course Materials</h2>
        <button
          className="primary-button"
          type="button"
          onClick={uploadAll}
          disabled={!currentCourse || !selectedFiles.length || uploadState.pending}
        >
          {uploadState.pending ? "Reading files…" : "Upload All"}
        </button>
      </div>
      {uploadState.pending && <div className="state-banner" role="status">{uploadState.progress}<button type="button" onClick={cancelUpload}>Cancel upload</button></div>}
      {status && <p role={status.ok ? "status" : "alert"} className={status.ok ? "state-banner success" : "state-banner error"}>{status.message}</p>}

      <div className="file-list-modern">
        {visibleMaterials.map((material) => (
          <div className="user-card file-row-modern" key={material.id}>
            <span className="file-type"><FileText size={16} /></span>
            <div style={{ minWidth: 0 }}><strong>{material.name}</strong><small>{currentCourse?.code} · {material.type} · {material.content.length.toLocaleString()} characters</small>
              {material.parseWarning && <p className="summary-source">{material.parseWarning}</p>}
              <details><summary>Review extracted text (first 2,000 characters)</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 240, overflow: "auto" }}>{material.content.slice(0, 2000)}</pre></details>
            </div>
            <small>{material.updatedAt}</small>
            <span className="status-badge">{material.status}</span>
            <button className="icon-danger" type="button" title={`Delete ${material.name}`} onClick={() => removeMaterial(material)}><Trash2 size={16} /></button>
          </div>
        ))}
        {!visibleMaterials.length && (
          <div className="empty-state">
            No materials in this course yet. Upload study files before using AI modes.
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
