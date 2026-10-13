import { Bell, Check, Mail, MoreHorizontal, Settings, UserRound, LogOut, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAppData } from "../state/AppDataContext";
import { useLanguage } from "../state/LanguageContext";
import { listServerTickets } from "../services/ticketApiService";
import { apiRequest } from "../services/apiClient";
import AvatarPicker from "./AvatarPicker";
import { courseLabel } from "../utils/courseDisplay";
import "./StudentProfilePanel.css";

export default function StudentProfilePanel({
  title = "Your Profile",
  initials = "AC",
  name = "Good Morning, Alex",
  subtitle = "Continue your learning journey and achieve your target.",
  children,
}) {
  const { currentUser, logout, studentCourses = [], studentMaterials = [], quizAttempts = [], averageQuizScore = 0, pendingStudyCount = 0, historySync } = useAppData();
  const { language } = useLanguage();
  const t = (en, zh) => language === "zh" ? zh : en;
  const navigate = useNavigate();
  const [panel, setPanel] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [studyUpdates, setStudyUpdates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const root = useRef(null);
  const trigger = useRef(null);
  const menuId = useId();
  useEffect(() => { setPanel(null); setTickets([]); setStudyUpdates([]); setError(""); }, [currentUser?.id]);
  useEffect(() => {
    if (!panel || typeof document === "undefined") return;
    const outside = event => { if (!root.current?.contains(event.target)) setPanel(null); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [panel]);
  useEffect(() => {
    if (panel !== "updates") return;
    const controller = new AbortController();
    setLoading(true); setError(""); setTickets([]); setStudyUpdates([]);
    Promise.allSettled([listServerTickets(controller.signal), apiRequest("/history", { signal: controller.signal })]).then(([support, study]) => {
      if (controller.signal.aborted) return;
      if (support.status === "fulfilled") setTickets(support.value.tickets.filter(ticket => ticket.hasMessages).slice(0, 4));
      if (study.status === "fulfilled") setStudyUpdates([...new Map(study.value.records.filter(record => ["summary", "quiz", "flashcards"].includes(record.kind) || record.kind === "qa" && record.payload.role === "AI").map(record => [record.id, record])).values()].slice(0, 5));
      setError([support, study].filter(result => result.status === "rejected").map(result => result.reason.message).join(" "));
      setLoading(false);
    });
    return () => controller.abort();
  }, [panel, retry, currentUser?.id]);
  function toggle(value, event) { trigger.current = event.currentTarget; setPanel(current => current === value ? null : value); }
  function close() { setPanel(null); trigger.current?.focus(); }
  function openMessages(ticketId) {
    setPanel(null);
    window.dispatchEvent(new CustomEvent("study-open-help", { detail: { view: "history", ticketId } }));
  }
  const updateLabel = record => ({ summary: t("Summary generated", "总结已生成"), qa: t("Q&A answered", "问答已完成"), quiz: t("Quiz completed", "测验已完成"), flashcards: t("Flashcards generated", "记忆卡已生成") })[record.kind];
  function updateTime(value) {
    const date = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:/.test(value) ? value.replace(" ", "T") + "Z" : value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(language === "zh" ? "zh-CN" : "en-GB");
  }
  return (
    <aside className="user-profile" ref={root} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); close(); } }}>
      <div className="profile-title"><span>{title}</span><div className="profile-menu-anchor" data-react-i18n>
        <button type="button" className="profile-more-button" aria-label={t("Profile options", "个人资料选项")} aria-haspopup="menu" aria-expanded={panel === "menu"} aria-controls={panel === "menu" ? menuId : undefined} onClick={event => toggle("menu", event)}><MoreHorizontal size={20} /></button>
        {panel === "menu" && <div className="profile-options-menu" id={menuId} role="menu" aria-label={t("Profile options", "个人资料选项")} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) setPanel(null); }}>
          <Link role="menuitem" to="/student/profile" onClick={close} autoFocus><UserRound size={16} />{t("Edit Profile", "编辑个人资料")}</Link>
          <Link role="menuitem" to="/student/settings" onClick={close}><Settings size={16} />{t("Settings", "设置")}</Link>
          <button role="menuitem" type="button" className="profile-menu-logout" onClick={async () => { await logout(); navigate("/"); }}><LogOut size={16} />{t("Logout", "退出登录")}</button>
        </div>}
      </div></div>
      <div className="profile-card">
        <AvatarPicker initials={initials} />
        <h2>{currentUser?.name || name}</h2>
        <p>{subtitle}</p>
        <Link to="/student/profile">Edit Profile</Link>
        <div className="profile-actions">
          <button type="button" data-react-i18n aria-label={t("Notifications", "通知")} title={t("Notifications", "通知")} aria-expanded={panel === "updates"} onClick={event => toggle("updates", event)}><Bell size={16} /></button>
          <button type="button" data-react-i18n aria-label={t("Support messages", "支持会话")} title={t("Support messages", "支持会话")} onClick={() => openMessages()}><Mail size={16} /></button>
          <button type="button" data-react-i18n aria-label={t("Study progress", "学习进度")} title={t("Study progress", "学习进度")} aria-expanded={panel === "progress"} onClick={event => toggle("progress", event)}><Check size={16} /></button>
        </div>
      </div>
      {(panel === "updates" || panel === "progress") && <section className="profile-widget" data-react-i18n aria-label={panel === "updates" ? t("Notifications", "通知") : t("Study progress", "学习进度")}>
        <header><h3>{panel === "updates" ? t("Notifications", "通知") : t("Study progress", "学习进度")}</h3><button type="button" aria-label={t("Close panel", "关闭面板")} onClick={close}><X size={16} /></button></header>
        {panel === "updates" ? <>
          {historySync?.error && <p role="alert">{historySync.error}</p>}
          {pendingStudyCount > 0 && <p role="status">{t(`${pendingStudyCount} study record(s) waiting to save.`, `${pendingStudyCount} 条学习记录等待保存。`)}</p>}
          {studyUpdates.map(record => <Link className="profile-update-item" key={record.id} to="/student/history" onClick={close}><strong>{updateLabel(record)}{record.kind === "quiz" ? ` · ${record.payload.score}% (${record.payload.correct}/${record.payload.total})` : record.kind === "flashcards" ? ` · ${record.payload.cards.length} ${t("cards", "张")}` : ""}</strong><small>{courseLabel(studentCourses.find(course => String(course.id) === String(record.course_id))) || t("Study History", "学习历史")}</small><time dateTime={record.created_at}>{updateTime(record.created_at)}</time></Link>)}
          {loading && <p role="status">{t("Loading support updates…", "正在加载支持会话更新…")}</p>}
          {error && <p role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>{t("Retry", "重试")}</button></p>}
          {!loading && !error && tickets.map(ticket => <button type="button" className="profile-update-item" key={ticket.id} onClick={() => openMessages(ticket.id)}><strong>{t("Support conversation", "支持会话")}</strong><small>{t("Status: ", "状态：")}{({ Open: t("Open", "待处理"), "In progress": t("In progress", "处理中"), Resolved: t("Resolved", "已解决") })[ticket.status]}</small></button>)}
          {!loading && !error && !tickets.length && !studyUpdates.length && !pendingStudyCount && <p>{t("No updates yet. Complete a study activity to see its notification here.", "暂无更新，完成学习活动后，对应通知才会显示在这里。")}</p>}
        </> : <>
          <dl><div><dt>{t("Courses", "课程")}</dt><dd>{studentCourses.length}</dd></div><div><dt>{t("Materials", "学习材料")}</dt><dd>{studentMaterials.length}</dd></div><div><dt>{t("Completed quizzes", "已完成测验")}</dt><dd>{quizAttempts.length}</dd></div><div><dt>{t("Average score", "平均分数")}</dt><dd>{quizAttempts.length ? `${averageQuizScore}%` : "—"}</dd></div></dl>
          <Link to="/student/history" onClick={close}>{t("View Study History", "查看学习历史")}</Link>
          <Link to="/student/review" onClick={close}>{t("Review wrong answers", "练习错题")}</Link>
        </>}
      </section>}
      {children}
    </aside>
  );
}
