import { BookOpenCheck, BookOpenText, Check, Files, FolderPlus, GraduationCap, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Toolbar from "../../components/Toolbar";
import HistoryRecordDialog from "../../components/HistoryRecordDialog";
import StudentLayout from "../../layouts/StudentLayout";
import { useAppData } from "../../state/AppDataContext";
import { useLanguage } from "../../state/LanguageContext";
import { apiRequest } from "../../services/apiClient";
import { getCourseMaterials } from "../../services/courseMaterialService";
import { courseName, courseLabel } from "../../utils/courseDisplay";
import { sameId } from "../../utils/studyScope";
import { formatStudyDate, studyTimestamp } from "../../utils/dateTime";
import { SUPPORTED_MATERIAL_EXTENSIONS } from "../../utils/fileTextExtractor";
import { studyResumeTarget } from "../../utils/studyResume";
import "./DashboardPage.css";

const emptyOverview = (key = "") => ({
  key, materials: [], records: [], reviews: [], materialsReady: false, historyReady: false, materialError: "", historyError: "",
});

export default function DashboardPage() {
  const { currentUser, studentCourses, currentCourseId, selectCourse, createCourse, updateCourse, deleteCourse,
    courseState, materialState, retryCourses, selectedMaterialIds = [], pendingStudyCount = 0 } = useAppData();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const t = (en, zh) => language === "zh" ? zh : en;
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ code: "", name: "" });
  const [formError, setFormError] = useState("");
  const [courseActionPending, setCourseActionPending] = useState(false);
  const [edit, setEdit] = useState(null);
  const [editNotice, setEditNotice] = useState(null);
  const editRequest = useRef(null);
  const [preview, setPreview] = useState(null);
  const [reload, setReload] = useState(0);
  const [overview, setOverview] = useState(emptyOverview);
  const [resumeState, setResumeState] = useState({ key: "", pending: false, error: "" });
  const resumeRequest = useRef(null);
  const userId = currentUser?.id;
  const currentOwner = useRef(userId);
  currentOwner.current = userId;
  const editor = edit && sameId(edit.ownerId, userId) && studentCourses.some(course => sameId(course.id, edit.id)) ? edit : null;
  useEffect(() => { setEdit(null); setEditNotice(null); return () => { editRequest.current = null; }; }, [userId]);
  const courseReady = Boolean(courseState.ready && !courseState.loading && !courseState.error);
  const courseIds = JSON.stringify(studentCourses.map(course => course.id).sort());
  const requestKey = JSON.stringify([userId, courseIds]);
  const currentRequestKey = useRef(requestKey);
  currentRequestKey.current = requestKey;

  useEffect(() => () => { resumeRequest.current = null; }, [requestKey]);

  useEffect(() => {
    if (!courseReady || userId === undefined || userId === null) return;
    const controller = new AbortController();
    setOverview(emptyOverview(requestKey));
    // Include courses that this browser has never opened; do not count cached files.
    Promise.all(JSON.parse(courseIds).map(id => getCourseMaterials(id, userId, { signal: controller.signal })))
      .then(groups => {
        if (!controller.signal.aborted) setOverview(current => ({ ...current, materials: groups.flat(), materialsReady: true }));
      }).catch(error => {
        if (!controller.signal.aborted) setOverview(current => ({ ...current, materialError: error.message }));
      });
    apiRequest("/history", { signal: controller.signal }).then(result => {
      if (!Array.isArray(result?.records)) throw new Error("The service returned invalid study history.");
      if (!controller.signal.aborted) setOverview(current => ({ ...current, records: result.records,
        reviews: Array.isArray(result.reviews) ? result.reviews : [], historyReady: true }));
    }).catch(error => {
      if (!controller.signal.aborted) setOverview(current => ({ ...current, historyError: error.message }));
    });
    return () => controller.abort();
  }, [courseReady, courseIds, userId, requestKey, reload, pendingStudyCount]);

  const scoped = courseReady && overview.key === requestKey ? overview : emptyOverview();
  const allMaterials = scoped.materials;
  const records = scoped.records;
  const quizRecords = records.filter(record => record.kind === "quiz" && Array.isArray(record.payload?.questions)
    && record.payload.questions.length > 0 && Number.isFinite(record.payload.score)
    && record.payload.score >= 0 && record.payload.score <= 100);
  const averageScore = quizRecords.length ? Math.round(quizRecords.reduce((sum, record) => sum + record.payload.score, 0) / quizRecords.length) : null;
  const activities = [...records, ...scoped.reviews.flatMap(review => {
    const original = records.find(record => record.id === review.record_id);
    return original ? [{ ...original, created_at: review.created_at }] : [];
  })];
  const lastRecord = activities.sort((a, b) => {
    const first = studyTimestamp(a.created_at), second = studyTimestamp(b.created_at);
    return (Number.isFinite(second) ? second : 0) - (Number.isFinite(first) ? first : 0);
  })[0];
  const recentCourse = lastRecord && studentCourses.find(course => sameId(course.id, lastRecord.course_id));
  const recentIds = lastRecord?.payload?.selectedMaterialIds || [lastRecord?.payload?.sourceFileId];
  const recentMaterials = allMaterials.filter(material => sameId(material.ownerId, userId)
    && sameId(material.courseId, lastRecord?.course_id) && recentIds.some(id => sameId(id, material.id)));
  const resumePending = resumeState.key === requestKey && resumeState.pending;
  const courseBusy = resumePending || courseActionPending || Boolean(editor?.pending) || !courseReady || Boolean(materialState?.loading);
  const overviewPending = courseReady && ((!scoped.materialsReady && !scoped.materialError) || (!scoped.historyReady && !scoped.historyError));
  const overviewError = [scoped.materialError, scoped.historyError].filter(Boolean).join(" ");
  const hasCourses = studentCourses.length > 0;
  const hasMaterials = scoped.materialsReady && allMaterials.length > 0;
  const showGuide = courseReady && scoped.historyReady && scoped.materialsReady && records.length === 0;
  const historyPlaceholder = scoped.historyError ? t("Unavailable", "暂不可用") : t("Loading…", "加载中…");
  const resumeTarget = scoped.materialsReady && scoped.historyReady ? studyResumeTarget({ userId,
    courses: studentCourses, materials: allMaterials, records, reviews: scoped.reviews, currentCourseId, selectedMaterialIds }) : null;
  const studyBusy = courseBusy || !scoped.materialsReady || !scoped.historyReady || !resumeTarget;
  const date = value => formatStudyDate(value, language);
  const recordCourse = record => courseLabel(studentCourses.find(course => sameId(course.id, record.course_id))) || t("Course unavailable", "课程不可用");
  const courseMaterialCount = courseId => scoped.materialsReady ? allMaterials.filter(material => sameId(material.courseId, courseId)).length : "—";
  const filteredCourses = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? studentCourses.filter(course => `${course.code} ${course.name} ${courseName(course)}`.toLowerCase().includes(query)) : studentCourses;
  }, [search, studentCourses]);
  const stats = [
    { id: "courses", label: t("Courses", "课程"), value: courseReady ? studentCourses.length : "—", Icon: GraduationCap },
    { id: "materials", label: t("Materials", "资料"), value: scoped.materialsReady ? allMaterials.length : "—", Icon: Files },
    { id: "quiz", label: t("Completed Quiz", "已完成测验"), value: scoped.historyReady ? quizRecords.length : "—", Icon: BookOpenCheck },
    { id: "score", label: t("Average Score", "平均分"), value: scoped.historyReady && averageScore !== null ? `${averageScore}%` : "—", Icon: BookOpenText },
  ];

  function chooseCourse(courseId) { if (!courseBusy) selectCourse(courseId); }
  async function prepareStudy(event) {
    event.preventDefault();
    if (studyBusy || resumeRequest.current) return;
    const request = { key: requestKey };
    resumeRequest.current = request;
    setResumeState({ key: requestKey, pending: true, error: "" });
    const active = () => resumeRequest.current === request && currentRequestKey.current === request.key;
    try {
      const ready = await selectCourse(resumeTarget.courseId, { preferredMaterialIds: resumeTarget.materialIds });
      if (!active()) return;
      if (!ready) {
        setResumeState({ key: requestKey, pending: false,
          error: t("Could not restore that study selection. Refresh statistics and try again.", "无法恢复该学习资料选择，请刷新统计后重试。") });
        return;
      }
      setPreview(null);
      navigate(`/student/workspace?mode=${resumeTarget.mode}`);
    } catch {
      if (active()) setResumeState({ key: requestKey, pending: false,
        error: t("Could not restore that study selection. Refresh statistics and try again.", "无法恢复该学习资料选择，请刷新统计后重试。") });
    } finally {
      if (active()) {
        resumeRequest.current = null;
        setResumeState(current => ({ ...current, pending: false }));
      }
    }
  }
  async function submitCourse(event) {
    event.preventDefault();
    if (courseBusy) return;
    setCourseActionPending(true); setFormError("");
    try {
      const result = await createCourse(form);
      if (!result.ok) setFormError(result.message);
      else { setForm({ code: "", name: "" }); setSearch(""); }
    } catch (error) { setFormError(error.message); }
    finally { setCourseActionPending(false); }
  }
  async function removeCourse(course) {
    if (courseBusy || !window.confirm(t(`Delete ${courseLabel(course)}? Its materials and dependent study records will be removed.`,
      `删除 ${courseLabel(course)}？相关资料和学习记录也会删除。`))) return;
    setCourseActionPending(true); setFormError("");
    try {
      const result = await deleteCourse(course.id);
      if (!result.ok) setFormError(result.message);
    } catch (error) { setFormError(error.message); }
    finally { setCourseActionPending(false); }
  }
  function openEdit(course) {
    if (courseBusy || editRequest.current) return;
    setPreview(null); setEditNotice(null);
    setEdit({ id: course.id, ownerId: userId, code: course.code, name: courseName(course), pending: false, error: "" });
  }
  function closeEdit() { if (!editRequest.current) setEdit(null); }
  async function saveEdit(event) {
    event.preventDefault();
    if (!editor || courseBusy || editRequest.current) return;
    const request = { ownerId: userId, id: editor.id };
    editRequest.current = request;
    setEdit(current => ({ ...current, pending: true, error: "" }));
    const active = () => editRequest.current === request && sameId(currentOwner.current, request.ownerId);
    try {
      const result = await updateCourse(editor.id, { code: editor.code, name: editor.name });
      if (!active()) return;
      if (result.ok) {
        setEdit(null); setSearch("");
        setEditNotice({ ownerId: userId, text: t("Course updated.", "课程已更新。") });
      } else {
        const messages = {
          INVALID_COURSE: t("Enter a course code (up to 32 characters) and name (up to 120 characters).", "请输入课程代号（最多 32 个字符）和名称（最多 120 个字符）。"),
          INVALID_INPUT: t("Enter a course code (up to 32 characters) and name (up to 120 characters).", "请输入课程代号（最多 32 个字符）和名称（最多 120 个字符）。"),
          DUPLICATE_RECORD: t("You already have a course with this code.", "已有课程使用这个代号，请使用其他代号。"),
          COURSE_NOT_FOUND: t("This course is no longer available. Refresh your courses and try again.", "该课程已不可用，请刷新课程后重试。"),
          COURSE_UPDATE_CANCELLED: t("The update was cancelled. Your entries are kept; try again when ready.", "更新已取消，输入内容已保留，可以稍后重试。"),
          COURSE_PENDING: t("Wait for the current course operation to finish.", "请等待当前课程操作完成。"),
        };
        setEdit(current => ({ ...current, error: messages[result.code] || t("Could not save this course. Your entries are kept; please try again.", "暂时无法保存课程，输入内容已保留，请重试。") }));
      }
    } catch {
      if (active()) setEdit(current => ({ ...current, error: t("Could not save this course. Your entries are kept; please try again.", "暂时无法保存课程，输入内容已保留，请重试。") }));
    } finally {
      if (active()) {
        editRequest.current = null;
        setEdit(current => current ? { ...current, pending: false } : null);
      }
    }
  }
  const createLink = <a href="#dashboard-course-form" onClick={() => setPreview(null)}>{t("Create a course", "创建课程")}</a>;
  const uploadLink = hasCourses ? <Link to="/student/upload">{t("Upload Materials", "上传资料")}</Link> : createLink;
  const studyButton = (label, className = "primary-button") => <button type="button" className={className}
    onClick={prepareStudy} disabled={studyBusy} aria-busy={resumePending}>{label}</button>;
  const studyLink = hasMaterials ? studyButton(t("Start studying", "开始学习")) : uploadLink;
  const profileContent = <>
    <h3 className="side-heading">{t("Recent Study", "最近学习")}</h3>
    <div className="side-list">
      <div className="side-item"><strong>{t("Course", "课程")}</strong><span>{!scoped.historyReady ? historyPlaceholder : lastRecord ? courseLabel(recentCourse) || t("Course unavailable", "课程不可用") : t("No study activity yet", "暂无学习活动")}</span></div>
      <div className="side-item"><strong>{t("Material", "资料")}</strong><span>{!scoped.historyReady ? historyPlaceholder : recentMaterials.length ? recentMaterials.map(material => material.name).join(", ") : lastRecord ? t("See the study record for sources", "查看学习记录中的来源") : t("No material studied yet", "尚未学习资料")}</span></div>
      <div className="side-item"><strong>{t("Last Study Time", "上次学习时间")}</strong><span>{!scoped.historyReady ? historyPlaceholder : lastRecord ? date(lastRecord.created_at) : t("No activity yet", "暂无学习活动")}</span></div>
    </div>
    <h3 className="side-heading">{t("Quick Entry", "快捷入口")}</h3>
    <div className="profile-actions-stack">{uploadLink}{hasCourses && (hasMaterials || !scoped.materialsReady) && studyButton(t("Continue Studying", "继续学习"))}</div>
  </>;
  const quizPreview = !scoped.historyReady ? <p role="status">{courseState.error || scoped.historyError || t("Loading saved quizzes…", "正在加载已保存测验…")}</p>
    : !quizRecords.length ? <div className="dashboard-preview-empty"><p>{t("No completed quizzes yet. Submit a quiz to see your results here.", "暂无已完成测验。提交测验后，可在这里查看结果。")}</p>{studyLink}</div>
      : <><p className="dashboard-preview-note">{preview === "score" ? t(`Average of ${quizRecords.length} completed ${quizRecords.length === 1 ? "quiz" : "quizzes"}: ${averageScore}%.`, `${quizRecords.length} 次已完成测验的平均分：${averageScore}%。`) : t("These are saved quiz submissions. Review attempts are kept separately.", "这里显示已保存的测验提交，复习练习记录单独保存。")}</p>
        <ul className="dashboard-preview-list">{quizRecords.map(record => <li key={record.id}><BookOpenCheck size={20} aria-hidden="true" /><div><strong>{recordCourse(record)}</strong><span>{date(record.created_at)}</span><small>{record.payload.questions.length} {t(record.payload.questions.length === 1 ? "question" : "questions", "题")}</small></div><strong className="dashboard-preview-score">{record.payload.score}%</strong></li>)}</ul>
        <Link to="/student/history">{t("Open Study History", "打开学习历史")}</Link></>;

  return <StudentLayout profileProps={{ title: t("Your Profile", "个人资料"), name: `${t("Welcome", "欢迎")}, ${currentUser?.name || t("Student", "同学")}`,
    subtitle: t("Courses keep your materials and learning activities together.", "课程让资料和学习活动井然有序。") }} profileContent={profileContent}>
    <div className="dashboard-page" data-react-i18n>
      <Toolbar value={search} onChange={setSearch} placeholder={t("Search your courses…", "搜索课程…")} />
      {courseState.loading && <div className="state-banner" role="status">{t("Loading your courses…", "正在加载课程…")}</div>}
      {courseState.error && <div className="state-banner error" role="alert">{courseState.error} <button type="button" onClick={retryCourses}>{t("Retry", "重试")}</button></div>}
      <section className="purple-hero"><p className="hero-kicker">{t("Student Dashboard", "学习首页")}</p><h1>{t("Welcome back", "欢迎回来")}, {currentUser?.name || t("Student", "同学")}</h1>
        <p>{t("Select a course, upload your materials, then use Summary, Q&A, Quiz or Flashcards to study.", "选择课程并上传资料，然后使用总结、问答、测验或记忆卡开始学习。")}</p>
        {hasCourses ? hasMaterials || !scoped.materialsReady
          ? studyButton(t("Continue Studying", "继续学习"), "button-link hero-action")
          : <Link className="button-link hero-action" to="/student/upload">{t("Upload Materials", "上传资料")}</Link>
          : <a className="button-link hero-action" href="#dashboard-course-form">{t("Create your first course", "创建第一门课程")}</a>}
      </section>
      {resumePending && <p role="status">{t("Restoring your course and selected materials…", "正在恢复课程和所选资料…")}</p>}
      {resumeState.key === requestKey && resumeState.error && <p className="form-error" role="alert">{resumeState.error}</p>}
      {showGuide && <section className="dashboard-start-guide user-card" aria-label={t("Getting started", "入门引导")}><h2>{t("Start in three steps", "三步开始学习")}</h2><ol>
        <li className={hasCourses ? "is-complete" : "is-current"}><span className="dashboard-step-number">{hasCourses ? <Check size={17} aria-hidden="true" /> : "1"}</span><div><strong>{t("Create a course", "创建课程")}</strong><p>{t("Give your subject a clear name.", "为学习科目取一个清晰的名称。")}</p>{createLink}</div></li>
        <li className={hasMaterials ? "is-complete" : hasCourses ? "is-current" : ""}><span className="dashboard-step-number">{hasMaterials ? <Check size={17} aria-hidden="true" /> : "2"}</span><div><strong>{t("Upload materials", "上传资料")}</strong><p>{t("Add notes, documents or images to your course.", "为课程添加笔记、文档或图片。")}</p>{hasCourses ? uploadLink : <span>{t("Create a course first", "请先创建课程")}</span>}</div></li>
        <li className={hasMaterials ? "is-current" : ""}><span className="dashboard-step-number">3</span><div><strong>{t("Start studying", "开始学习")}</strong><p>{t("Generate a summary, ask a question or try a quiz.", "生成总结、提出问题或尝试测验。")}</p>{hasMaterials ? studyLink : <span>{t("Upload materials first", "请先上传资料")}</span>}</div></li>
      </ol></section>}
      <div className="quick-stats">{stats.map(({ id, label, value, Icon }) => <button type="button" className="quick-stat dashboard-stat-button" key={id} aria-label={t(`Preview ${label}`, `预览${label}`)} aria-describedby={`dashboard-stat-value-${id}`} onClick={() => setPreview(id)}>
        <span className="stat-icon"><Icon size={18} aria-hidden="true" /></span><span className="dashboard-stat-content"><span>{label}</span><strong id={`dashboard-stat-value-${id}`}>{value}</strong></span>
      </button>)}</div>
      <div className="dashboard-data-status"><span>{overviewPending ? t("Loading saved account data…", "正在加载账户数据…") : t("Statistics use saved account records.", "统计基于账户中已保存的记录。")}</span><button type="button" disabled={!courseReady || overviewPending} onClick={() => setReload(value => value + 1)}><RefreshCw size={14} aria-hidden="true" />{t("Refresh statistics", "刷新统计")}</button></div>
      {overviewError && <p className="form-error" role="alert">{t("Some statistics are unavailable. Refresh statistics to try again.", "部分统计暂不可用，请刷新统计重试。")} {overviewError}</p>}
      <section className="course-manager user-card">
        <div className="content-heading"><div><h2>{t("Courses", "课程")}</h2><p>{t("Create, select, and keep materials separated by course.", "创建、选择课程，并按课程整理资料。")}</p></div><span className="text-link">{filteredCourses.length} {t("shown", "项")}</span></div>
        <form id="dashboard-course-form" className="course-form" onSubmit={submitCourse}>
          <label>{t("Course Code", "课程代号")}<input value={form.code} disabled={courseBusy} onChange={event => setForm({ ...form, code: event.target.value })} placeholder={t("e.g. CS101", "例如 CS101")} /></label>
          <label>{t("Course Name", "课程名称")}<input value={form.name} disabled={courseBusy} onChange={event => setForm({ ...form, name: event.target.value })} placeholder={t("e.g. Introduction to Computing", "例如 计算机导论")} /></label>
          <button className="primary-button" type="submit" disabled={courseBusy}><FolderPlus size={16} aria-hidden="true" /> {courseActionPending ? t("Saving…", "保存中…") : t("Create Course", "创建课程")}</button>
        </form>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        {editNotice && sameId(editNotice.ownerId, userId) && <p role="status">{editNotice.text}</p>}
        <div className="course-list">{filteredCourses.map(course => {
          const active = sameId(course.id, currentCourseId);
          return <article className={`course-row dashboard-course-row${active ? " active" : ""}${courseBusy ? " is-busy" : ""}`} key={course.id} onClick={() => chooseCourse(course.id)}>
            <button className="dashboard-course-select" type="button" disabled={courseBusy} aria-pressed={active} onClick={event => { event.stopPropagation(); chooseCourse(course.id); }}>
              <span className="dashboard-course-text"><strong>{courseName(course)}</strong><span>{course.code}</span><small>{courseMaterialCount(course.id)} {t(courseMaterialCount(course.id) === 1 ? "material" : "materials", "份资料")} · {t("Updated", "更新于")} {date(course.updatedAt)}</small></span><span className="dashboard-course-choice">{active ? t("Selected", "已选择") : t("Select", "选择")}</span>
            </button>
            <button className="dashboard-course-edit" type="button" disabled={courseBusy} aria-haspopup="dialog" title={t("Edit course", "编辑课程")} aria-label={t(`Edit ${courseName(course)}`, `编辑${courseName(course)}`)}
              onClick={event => { event.stopPropagation(); openEdit(course); }}><Pencil size={15} aria-hidden="true" />{t("Edit", "编辑")}</button>
            <button className="icon-danger dashboard-course-delete" type="button" disabled={courseBusy} title={t("Delete course", "删除课程")} aria-label={t(`Delete ${courseName(course)}`, `删除${courseName(course)}`)}
              onClick={event => { event.stopPropagation(); removeCourse(course); }}><Trash2 size={16} aria-hidden="true" /></button>
          </article>;
        })}
          {courseReady && !filteredCourses.length && <div className="empty-state">{studentCourses.length ? <><p>{t("No courses match your search.", "没有与搜索内容匹配的课程。")}</p><button type="button" onClick={() => setSearch("")}>{t("Clear search", "清除搜索")}</button></> : <p>{t("No courses yet. Create your first course above, then upload its materials.", "暂无课程。请先在上方创建第一门课程，再上传资料。")}</p>}</div>}
        </div>
      </section>
      {courseReady && scoped.materialsReady && !allMaterials.length && <div className="empty-state section-gap"><p>{t("No materials yet. Upload files to a course to start learning.", "暂无资料。请为课程上传文件，开始学习。")}</p><p>{t("Supported formats:", "支持格式：")} {SUPPORTED_MATERIAL_EXTENSIONS.map(extension => extension.toUpperCase()).join(", ")}.</p>{uploadLink}</div>}
      {editor && <HistoryRecordDialog key={`edit:${userId}:${editor.id}`} title={t("Edit course", "编辑课程")}
        subtitle={t("Your materials and study records stay in this course.", "课程中的资料和学习记录会保留。")}
        closeLabel={t("Cancel editing", "取消编辑")} onClose={closeEdit}>
        <form className="dashboard-course-editor" onSubmit={saveEdit} aria-busy={editor.pending} data-react-i18n>
          <fieldset disabled={editor.pending}>
            <label htmlFor="course-edit-code">{t("Course Code", "课程代号")}<input id="course-edit-code" required maxLength={32} value={editor.code}
              onChange={event => setEdit(current => ({ ...current, code: event.target.value, error: "" }))} /></label>
            <label htmlFor="course-edit-name">{t("Course Name", "课程名称")}<input id="course-edit-name" required maxLength={120} value={editor.name}
              onChange={event => setEdit(current => ({ ...current, name: event.target.value, error: "" }))} /></label>
            <div className="dashboard-course-editor-actions"><button type="button" onClick={closeEdit}>{t("Cancel", "取消")}</button>
              <button type="submit" className="primary-button">{editor.pending ? t("Saving…", "保存中…") : t("Save changes", "保存修改")}</button></div>
          </fieldset>
          {editor.pending && <p role="status">{t("Saving course changes…", "正在保存课程修改…")}</p>}
          {editor.error && <p role="alert" className="form-error">{editor.error}</p>}
        </form>
      </HistoryRecordDialog>}
      {preview && <HistoryRecordDialog key={`${userId}:${preview}`} title={stats.find(stat => stat.id === preview)?.label} subtitle={t("Saved data for your account", "账户中已保存的数据")} closeLabel={t("Close", "关闭")} onClose={() => setPreview(null)}>
        <div className="dashboard-preview">
          {preview === "courses" && (!courseReady ? <p role="status">{courseState.error || t("Loading courses…", "正在加载课程…")}</p> : !studentCourses.length ? <div className="dashboard-preview-empty"><p>{t("No courses yet. Create your first course to organise your learning.", "暂无课程，创建第一门课程以整理学习内容。")}</p>{createLink}</div>
            : <ul className="dashboard-preview-list">{studentCourses.map(course => <li key={course.id}><GraduationCap size={20} aria-hidden="true" /><div><strong>{courseLabel(course)}</strong><span>{courseMaterialCount(course.id)} {t(courseMaterialCount(course.id) === 1 ? "material" : "materials", "份资料")}</span></div><button type="button" disabled={courseBusy} onClick={() => { chooseCourse(course.id); setPreview(null); }}>{t("Select course", "选择课程")}</button></li>)}</ul>)}
          {preview === "materials" && (!scoped.materialsReady ? <p role="status">{courseState.error || scoped.materialError || t("Loading materials…", "正在加载资料…")}</p> : !allMaterials.length ? <div className="dashboard-preview-empty"><p>{t("No materials uploaded yet.", "尚未上传资料。")}</p>{uploadLink}</div>
            : <><ul className="dashboard-preview-list">{allMaterials.map(material => <li key={material.id}><Files size={20} aria-hidden="true" /><div><strong>{material.name}</strong><span>{courseLabel(studentCourses.find(course => sameId(course.id, material.courseId)))}</span><small>{material.type} · {date(material.uploadedAt || material.createdAt)}</small></div></li>)}</ul>{uploadLink}</>)}
          {(preview === "quiz" || preview === "score") && quizPreview}
        </div>
      </HistoryRecordDialog>}
    </div>
  </StudentLayout>;
}
