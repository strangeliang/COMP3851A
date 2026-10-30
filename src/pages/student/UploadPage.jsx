import { Download, Eye, FileText, FolderOpen, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Toolbar from "../../components/Toolbar";
import StudentLayout from "../../layouts/StudentLayout";
import MaterialSourcePreview from "../../components/MaterialSourcePreview";
import { formatStudyDate } from "../../utils/dateTime";
import "./UploadPage.css";
import { limits } from "../../utils/studyScope";
import { useAppData } from "../../state/AppDataContext";
import { formatFileSize, getFileExtension, SUPPORTED_MATERIAL_EXTENSIONS } from "../../utils/fileTextExtractor";
import { useLanguage } from "../../state/LanguageContext";
import './UploadDropzone.css';
import { courseLabel } from "../../utils/courseDisplay";

export default function UploadPage() {
  const { language } = useLanguage();
  const t = (en, zh) => language === 'zh' ? zh : en;
  const {
    currentUser,
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
  const [previewMaterialId, setPreviewMaterialId] = useState(null);
  const previewMaterial = courseMaterials.find(item => String(item.id) === String(previewMaterialId));
  const [status, setStatus] = useState(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const inputRef = useRef(null);
  const pageScope = useRef({ userId: currentUser?.id, courseId: currentCourseId });
  if (pageScope.current.userId !== currentUser?.id || pageScope.current.courseId !== currentCourseId) {
    pageScope.current = { userId: currentUser?.id, courseId: currentCourseId };
  }
  useEffect(() => {
    setSelectedFiles([]); setStatus(null); setDragging(false); setPreviewMaterialId(null); dragDepth.current = 0;
    if (inputRef.current) inputRef.current.value = "";
  }, [currentCourseId, currentUser?.id]);

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
    const scope = pageScope.current;
    const result = await addMaterials(selectedFiles, scope.courseId);
    if (pageScope.current !== scope) return;
    setStatus(result);
    if (result.ok) {
      setSelectedFiles([]);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeMaterial(material) {
    if (!window.confirm(t(`Delete ${material.name} and the study records that use it?`, `删除 ${material.name} 及使用该资料的学习记录？`))) return;
    const scope = pageScope.current;
    const result = await deleteMaterial(material.id);
    if (pageScope.current !== scope) return;
    setStatus(result);
  }

  const profileContent = (
    <>
      <div className="quick-stats profile-stack">
        <div className="quick-stat">
          <span className="stat-icon">{selectedFiles.length}</span>
          <div><span>{t("Selected", "已选择")}</span><strong>{t(`${selectedFiles.length} ${selectedFiles.length === 1 ? "file" : "files"}`, `${selectedFiles.length} 个文件`)}</strong></div>
        </div>
        <div className="quick-stat">
          <span className="stat-icon"><FolderOpen size={17} /></span>
          <div><span>{t("Current Course", "当前课程")}</span><strong>{courseMaterials.length}/{limits.maxFilesPerCourse}</strong></div>
        </div>
      </div>
      <h3 className="side-heading">{t("Upload Rules", "上传规则")}</h3>
      <div className="side-list">
        <div className="side-item"><strong>{t("Format", "文件格式")}</strong><span>TXT, MD, PDF, DOCX, PPTX, PNG, JPG, JPEG, WEBP, BMP</span></div>
        <div className="side-item"><strong>{t("Each upload", "每批上传")}</strong><span>{t(`${limits.maxFilesPerUpload} files maximum`, `最多 ${limits.maxFilesPerUpload} 个文件`)}</span></div>
        <div className="side-item"><strong>{t("Single File", "单个文件")}</strong><span>{t(`${formatFileSize(limits.maxFileBytes)} maximum`, `最大 ${formatFileSize(limits.maxFileBytes)}`)}</span></div>
        <div className="side-item"><strong>{t("Your file limit", "账号文件上限")}</strong><span>{t(`${materials.length}/${limits.maxTotalFilesPerUser} total files`, `共 ${materials.length}/${limits.maxTotalFilesPerUser} 个文件`)}</span></div>
      </div>
    </>
  );

  return (
    <StudentLayout
      profileProps={{
        title: t("Upload Overview", "上传概览"),
        name: currentCourse ? courseLabel(currentCourse) : t("No Course", "未选择课程"),
        subtitle: t("Files are stored under the selected course only.", "文件只保存在所选课程中。"),
      }}
      profileContent={profileContent}
    >
      <Toolbar value={search} onChange={setSearch} placeholder={t("Search current course materials...", "搜索当前课程资料…")} />
      {courseState.loading && <div className="state-banner" role="status">{t("Loading your courses…", "正在加载课程…")}</div>}
      {courseState.error && <div className="state-banner error" role="alert">{courseState.error} <button type="button" onClick={retryCourses}>{t("Retry", "重试")}</button></div>}
      {materialState.loading && <div className="state-banner" role="status">{t("Loading course materials…", "正在加载课程资料…")}</div>}
      {materialState.error && <div className="state-banner error" role="alert">{materialState.error} <button type="button" onClick={retryMaterials}>{t("Retry", "重试")}</button></div>}
      <header className="workspace-header">
        <h1>{t("Upload Study Materials", "上传学习资料")}</h1>
        <p>{t("Upload text, PDF, Office, or image files. Files are grouped by the selected course.", "上传文本、PDF、Office 文档或图片，文件会归入所选课程。")}</p>
      </header>

      <div className="control-grid">
        <label className="user-field">
          {t("Current Course", "当前课程")}
          <select value={currentCourseId} onChange={(event) => selectCourse(event.target.value)} disabled={uploadState.pending || courseState.loading || !studentCourses.length}>
            {!studentCourses.length && <option value="">{t("Create a course first", "请先创建课程")}</option>}
            {studentCourses.map((course) => (
              <option key={course.id} value={course.id}>{courseLabel(course)}</option>
            ))}
          </select>
        </label>
        <div className="rule-card">
          <strong>{t("Course file limit", "课程文件上限")}</strong>
          <span>{t(`${courseMaterials.length}/${limits.maxFilesPerCourse} files in this course`, `当前课程 ${courseMaterials.length}/${limits.maxFilesPerCourse} 个文件`)}</span>
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
        <p>{t(`Choose up to ${limits.maxFilesPerUpload} files per upload. Each file must contain no more than ${limits.maxStoredTextCharacters.toLocaleString()} extracted characters.`, `每批最多上传 ${limits.maxFilesPerUpload} 个文件，每个文件提取的文字不能超过 ${limits.maxStoredTextCharacters.toLocaleString()} 个字符。`)}</p>
        <p>{t(`PDF: up to ${limits.maxPDFPages} pages and ${limits.maxPDFOCRPages} pages needing OCR. OCR supports English and Simplified Chinese.`, `PDF 最多 ${limits.maxPDFPages} 页，其中需要 OCR 识别的页面最多 ${limits.maxPDFOCRPages} 页；OCR 支持英语和简体中文。`)}</p>
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
        <h2>{t("Current Course Materials", "当前课程资料")}</h2>
        <button
          className="primary-button"
          type="button"
          onClick={uploadAll}
          disabled={!currentCourse || !selectedFiles.length || uploadState.pending || materialState.loading}
        >
          {uploadState.pending ? t("Reading files…", "正在读取文件…") : t("Upload All", "全部上传")}
        </button>
      </div>
      {uploadState.pending && <div className="state-banner" role="status">{uploadState.progress}<button type="button" onClick={cancelUpload}>{t("Cancel upload", "取消上传")}</button></div>}
      {status && <p role={status.ok ? "status" : "alert"} className={status.ok ? "state-banner success" : "state-banner error"}>{status.message}</p>}

      <div className="file-list-modern">
        {visibleMaterials.map((material) => (
          <article className="user-card upload-material-card" key={material.id} data-react-i18n>
            <div className="upload-material-heading">
              <span className="file-type"><FileText size={20} aria-hidden="true" /></span>
              <div className="upload-material-title"><h3>{material.name}</h3>
                <p className="upload-material-meta"><span>{material.type}</span><span>{formatFileSize(material.size || 0)}</span><span>{t(`${material.content.length.toLocaleString()} characters`, `${material.content.length.toLocaleString()} 字符`)}</span></p>
              </div>
              <span className="status-badge">{material.status === "Ready" ? t("Ready", "就绪") : material.status === "Ready with warning" ? t("Reading note", "有读取提示") : material.status}</span>
            </div>
            <div className="upload-material-footer">
              <p className="upload-material-updated">{t("Updated", "更新于")} {formatStudyDate(material.updatedAt, language)}{!material.hasOriginal && <span>{t("Extracted text available", "可查看提取文字")}</span>}</p>
              <div className="upload-material-actions">
                <button type="button" onClick={() => setPreviewMaterialId(material.id)} aria-label={`${t("View material", "查看资料")} ${material.name}`}><Eye size={15} aria-hidden="true" />{t("View material", "查看资料")}</button>
                {material.hasOriginal && <a href={`/api/materials/${encodeURIComponent(material.id)}/original`} aria-label={`${t("Download original", "下载原文件")} ${material.name}`}><Download size={15} aria-hidden="true" />{t("Download", "下载")}</a>}
                <button className="upload-material-delete" type="button" title={`${t("Delete", "删除")} ${material.name}`} aria-label={`${t("Delete", "删除")} ${material.name}`} onClick={() => removeMaterial(material)}><Trash2 size={15} aria-hidden="true" />{t("Delete", "删除")}</button>
              </div>
            </div>
          </article>
        ))}
        {!visibleMaterials.length && !materialState.loading && (
          <div className="empty-state" data-react-i18n>
            {search.trim() ? <><p>{t("No materials match your search.", "没有匹配的资料。")}</p><button type="button" onClick={() => setSearch("")}>{t("Clear search", "清除搜索")}</button></>
              : <p>{currentCourse ? t("No materials in this course yet. Choose files above to begin.", "该课程还没有资料，请在上方选择文件开始上传。") : t("Select or create a course on Dashboard before uploading materials.", "请先在首页选择或创建课程，再上传资料。")}</p>}
          </div>
        )}
      </div>
      {previewMaterial && <MaterialSourcePreview material={previewMaterial} onClose={() => setPreviewMaterialId(null)} />}
    </StudentLayout>
  );
}
