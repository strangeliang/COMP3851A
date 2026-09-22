import { FileText, FolderOpen, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Toolbar from "../../components/Toolbar";
import StudentLayout from "../../layouts/StudentLayout";
import { limits } from "../../utils/studyScope";
import { useAppData } from "../../state/AppDataContext";
import { formatFileSize, getFileExtension, SUPPORTED_MATERIAL_EXTENSIONS } from "../../utils/fileTextExtractor";
import { useLanguage } from "../../state/LanguageContext";
import './UploadDropzone.css';

export default function UploadPage() {
  const { language } = useLanguage();
  const t = (en, zh) => language === 'zh' ? zh : en;
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
    courseState,
    materialState,
    retryCourses,
    retryMaterials,
  } = useAppData();
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const inputRef = useRef(null);
  const pageScope = useRef(currentCourseId);
  pageScope.current = currentCourseId;
  useEffect(() => {
    setSelectedFiles([]); setStatus(null); setDragging(false); dragDepth.current = 0;
    if (inputRef.current) inputRef.current.value = "";
  }, [currentCourseId]);

  const visibleMaterials = useMemo(() => {
    const query = search.trim().toLowerCase();
    return courseMaterials.filter((material) =>
      !query || `${material.name} ${material.type}`.toLowerCase().includes(query),
    );
  }, [courseMaterials, search]);

  const selectionDisabled = !currentCourse || uploadState.pending || materialState.loading || courseState.loading;
  function acceptFiles(incoming) {
    if (selectionDisabled) {
      setStatus({ ok: false, message: t('Select a course and wait for the current operation to finish before adding files.', '请先选择课程，并等待当前操作完成后再添加文件。') });
      return;
    }
    const files = Array.from(incoming || []);
    if (!files.length) return;
    const unsupported = files.find(file => !SUPPORTED_MATERIAL_EXTENSIONS.includes(getFileExtension(file.name)));
    if (unsupported) {
      setStatus({ ok: false, message: t(`${unsupported.name}: unsupported format. Use PDF, PPTX, DOCX, TXT, MD or supported images. Save old PPT/DOC files as PPTX/DOCX first.`, `${unsupported.name}：不支持此格式。请使用 PDF、PPTX、DOCX、TXT、MD 或支持的图片格式。旧版 PPT/DOC 请先另存为 PPTX/DOCX。`) });
      return;
    }
    if (files.some(file => file.size <= 0 || file.size > limits.maxFileBytes)) {
      setStatus({ ok: false, message: t(`Each file must be non-empty and at most ${formatFileSize(limits.maxFileBytes)}.`, `文件不能为空，且每个文件不能超过 ${formatFileSize(limits.maxFileBytes)}。`) });
      return;
    }
    const unique = new Map(selectedFiles.map(file => [JSON.stringify([file.name,file.size,file.lastModified]), file]));
    for (const file of files) unique.set(JSON.stringify([file.name,file.size,file.lastModified]),file);
    const next = [...unique.values()];
    if (next.length > limits.maxFilesPerUpload || courseMaterials.length + next.length > limits.maxFilesPerCourse || materials.length + next.length > limits.maxTotalFilesPerUser) {
      setStatus({ ok: false, message: t(`You can select up to ${limits.maxFilesPerUpload} files per upload, within the course and account limits. Remove a selected file before adding more.`, `每批最多选择 ${limits.maxFilesPerUpload} 个文件，且不能超过课程和账号文件上限。请先移除部分待上传文件。`) });
      return;
    }
    setSelectedFiles(next); setStatus(null);
  }
  function selectFiles(event) { acceptFiles(event.target.files); event.target.value = ''; }
  function dropFiles(event) {
    event.preventDefault(); event.stopPropagation(); dragDepth.current = 0; setDragging(false);
    const transfer = event.dataTransfer;
    const entries = Array.from(transfer.items || []);
    if (entries.some(item => item.webkitGetAsEntry?.()?.isDirectory)) {
      setStatus({ ok: false, message: t('Drop individual files, not folders.', '请拖入单个文件，不要拖入文件夹。') }); return;
    }
    if (!transfer.files?.length) {
      setStatus({ ok: false, message: t('This is a browser link or text, not a file. Download the document first, then drag the downloaded file here or choose it with Choose Files.', '拖入的是浏览器链接或文字，不是文件。请先下载文档，再拖入下载后的文件，或点击“选择文件”。') }); return;
    }
    acceptFiles(transfer.files);
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

  async function removeMaterial(material) {
    if (!window.confirm(`Delete ${material.name} and the study records that use it?`)) return;
    const result = await deleteMaterial(material.id);
    if (pageScope.current !== currentCourseId) return;
    setStatus(result);
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
      {courseState.loading && <div className="state-banner" role="status">Loading your courses…</div>}
      {courseState.error && <div className="state-banner error" role="alert">{courseState.error} <button type="button" onClick={retryCourses}>Retry</button></div>}
      {materialState.loading && <div className="state-banner" role="status">Loading course materials…</div>}
      {materialState.error && <div className="state-banner error" role="alert">{materialState.error} <button type="button" onClick={retryMaterials}>Retry</button></div>}
      <header className="workspace-header">
        <h1>Upload Study Materials</h1>
        <p>Upload text, PDF, Office, or image files. Files are grouped by the selected course.</p>
      </header>

      <div className="control-grid">
        <label className="user-field">
          Current Course
          <select value={currentCourseId} onChange={(event) => selectCourse(event.target.value)} disabled={uploadState.pending || courseState.loading || !studentCourses.length}>
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

      <section data-react-i18n aria-label={t('Choose study materials', '选择学习材料')} aria-disabled={selectionDisabled}
        className={`upload-dropzone${selectionDisabled ? " disabled-zone" : ""}${dragging ? " drag-active" : ""}`}
        onDragEnter={event=>{event.preventDefault(); event.stopPropagation(); dragDepth.current++; if (!selectionDisabled) setDragging(true);}}
        onDragOver={event=>{event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect=selectionDisabled?'none':'copy';}}
        onDragLeave={event=>{event.preventDefault(); event.stopPropagation(); dragDepth.current=Math.max(0,dragDepth.current-1); if (!dragDepth.current) setDragging(false);}}
        onDrop={dropFiles}>
        <span className="upload-symbol"><UploadCloud size={28} /></span>
        <h2>{dragging ? t('Drop files here', '松开即可添加文件') : selectedFiles.length ? t(`${selectedFiles.length} file(s) selected`, `已选择 ${selectedFiles.length} 个文件`) : t('Choose study materials', '选择学习材料')}</h2>
        <p className="upload-drag-hint">{t('Drag files here, or choose files below. Then click Upload All to upload.', '将文件拖到此处，或点击下方选择文件。确认后点击“全部上传”。')}</p>
        <p>Choose up to {limits.maxFilesPerUpload} files per upload. Each file must contain no more than {limits.maxStoredTextCharacters.toLocaleString()} extracted characters.</p>
        <p>PDF: up to {limits.maxPDFPages} pages and {limits.maxPDFOCRPages} pages needing OCR. OCR supports English and Simplified Chinese.</p>
        <label className="file-picker-modern">
          {t('Choose Files', '选择文件')}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".txt,.md,.pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp,.bmp"
            onChange={selectFiles}
            disabled={selectionDisabled}
          />
        </label>
        {!!selectedFiles.length && (
          <div className="upload-queue" aria-label={t('Files waiting to upload', '待上传文件')}>
            {selectedFiles.map((file, index) => (
              <div className="upload-queue-item" key={`${file.name}-${index}`}>
                <span className="upload-queue-name">{file.name}<small>{formatFileSize(file.size)}</small></span>
                <button className="upload-queue-remove" type="button" disabled={uploadState.pending} aria-label={t(`Remove ${file.name}`, `移除 ${file.name}`)} onClick={()=>{setSelectedFiles(old=>old.filter((_,i)=>i!==index));setStatus(null);}}><Trash2 size={16} aria-hidden="true" />{t('Remove', '移除')}</button>
              </div>
            ))}
            <button className="upload-queue-clear" type="button" disabled={uploadState.pending} onClick={()=>{setSelectedFiles([]);setStatus(null);if(inputRef.current)inputRef.current.value='';}}>{t('Clear pending files', '清空待上传')}</button>
            <p className="upload-queue-note">{t('Removing here only clears the upload queue. Files on your computer and already uploaded materials are not deleted.', '这里只移除待上传文件，不会删除电脑原文件或已上传的材料。')}</p>
          </div>
        )}
      </section>

      <div className="content-heading section-gap">
        <h2>Current Course Materials</h2>
        <button
          className="primary-button"
          type="button"
          onClick={uploadAll}
          disabled={!currentCourse || !selectedFiles.length || uploadState.pending || materialState.loading}
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
              {material.hasOriginal ? <p style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {["PDF", "PNG", "JPG", "JPEG", "WEBP", "BMP"].includes(material.type) && <a href={`/api/materials/${material.id}/original?preview=1`} target="_blank" rel="noopener noreferrer">Preview original</a>}
                <a href={`/api/materials/${material.id}/original`}>Download original</a>
              </p> : <small>Original not saved — upload this file again to enable preview/download.</small>}
              <details><summary>Review extracted text (first 2,000 characters)</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 240, overflow: "auto" }}>{material.content.slice(0, 2000)}</pre></details>
            </div>
            <small>{material.updatedAt}</small>
            <span className="status-badge">{material.status}</span>
            <button className="icon-danger" type="button" title={`Delete ${material.name}`} onClick={() => removeMaterial(material)}><Trash2 size={16} /></button>
          </div>
        ))}
        {!visibleMaterials.length && !materialState.loading && (
          <div className="empty-state">
            No materials in this course yet. Upload study files before using AI modes.
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
