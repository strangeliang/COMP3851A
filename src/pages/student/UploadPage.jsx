import { FileText, FolderOpen, UploadCloud } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import Toolbar from "../../components/Toolbar";
import StudentLayout from "../../layouts/StudentLayout";
import { MAX_FILES_PER_COURSE, MAX_FILE_SIZE, MAX_TOTAL_FILES } from "../../data/mockData";
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
  } = useAppData();
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const inputRef = useRef(null);

  const visibleMaterials = useMemo(() => {
    const query = search.trim().toLowerCase();
    return courseMaterials.filter((material) =>
      !query || `${material.name} ${material.type}`.toLowerCase().includes(query),
    );
  }, [courseMaterials, search]);

  function selectFiles(event) {
    setSelectedFiles(Array.from(event.target.files || []));
    setStatus("");
  }

  async function uploadAll() {
    const result = await addMaterials(selectedFiles, currentCourseId);
    setStatus(result.message || (result.ok ? "Files uploaded." : ""));
    if (result.ok) {
      setSelectedFiles([]);
      if (inputRef.current) inputRef.current.value = "";
    }
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
          <div><span>Current Course</span><strong>{courseMaterials.length}/{MAX_FILES_PER_COURSE}</strong></div>
        </div>
      </div>
      <h3 className="side-heading">Upload Rules</h3>
      <div className="side-list">
        <div className="side-item"><strong>Format</strong><span>TXT, MD, PDF, DOCX, PPTX, PNG, JPG</span></div>
        <div className="side-item"><strong>Single File</strong><span>{formatFileSize(MAX_FILE_SIZE)} maximum</span></div>
        <div className="side-item"><strong>Demo Limit</strong><span>{materials.length}/{MAX_TOTAL_FILES} total files</span></div>
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
          <select value={currentCourseId} onChange={(event) => selectCourse(event.target.value)}>
            {studentCourses.map((course) => (
              <option key={course.id} value={course.id}>{course.code} {course.name}</option>
            ))}
          </select>
        </label>
        <div className="rule-card">
          <strong>Course file limit</strong>
          <span>{courseMaterials.length}/{MAX_FILES_PER_COURSE} files in this course</span>
        </div>
      </div>

      <section className={`upload-dropzone${!currentCourse ? " disabled-zone" : ""}`}>
        <span className="upload-symbol"><UploadCloud size={28} /></span>
        <h2>{selectedFiles.length ? `${selectedFiles.length} file(s) selected` : "Choose study materials"}</h2>
        <p>Summary, Q&A, and Quiz use one or more materials selected in the Study Workspace.</p>
        <label className="file-picker-modern">
          Choose Files
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".txt,.md,.pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp,.bmp"
            onChange={selectFiles}
            disabled={!currentCourse}
          />
        </label>
        {!!selectedFiles.length && (
          <div className="selected-file-names">
            {selectedFiles.map((file) => (
              <span key={`${file.name}-${file.size}`}>{file.name}</span>
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
          disabled={!currentCourse || !selectedFiles.length}
        >
          Upload All
        </button>
      </div>
      {status && <p className={status.includes("uploaded") ? "state-banner success" : "state-banner error"}>{status}</p>}

      <div className="file-list-modern">
        {visibleMaterials.map((material) => (
          <div className="user-card file-row-modern" key={material.id}>
            <span className="file-type"><FileText size={16} /></span>
            <div><strong>{material.name}</strong><small>{currentCourse?.code} · {material.type}</small></div>
            <small>{material.updatedAt}</small>
            <span className="status-badge">{material.status}</span>
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
