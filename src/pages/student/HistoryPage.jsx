import { useEffect, useRef, useState } from "react";
import StudentLayout from "../../layouts/StudentLayout";
import { useAppData } from "../../state/AppDataContext";
import { apiRequest } from "../../services/apiClient";
import { useLanguage } from "../../state/LanguageContext";
import "./HistoryPage.css";
import "./QuizPanel.css";
import { BookOpenText, History, Layers, ListChecks, MessageCircleQuestion, RefreshCw, RotateCcw, Trash2, Upload } from "lucide-react";
import { courseLabel } from "../../utils/courseDisplay";
import { indices, correctIndices, isMultiple, isCorrect, validAnswer, toggleAnswer, answerText } from "../../../shared/quiz.mjs";

export default function HistoryPage({ review = false }) {
  const { studentCourses, summaryRecords, currentChatRecords, quizAttempts, refreshStudyHistory } = useAppData();
  const { language } = useLanguage();
  const t = (en, zh) => language === "zh" ? zh : en;
  const kindLabel = (value) => ({ All: t("All", "全部"), summary: t("Summary", "总结"), qa: t("Q&A", "问答"), quiz: t("Quiz", "测验"), flashcards: t("Flashcards", "记忆卡") })[value] || value;
  const [data, setData] = useState({ records: [], reviews: [] });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [kind, setKind] = useState("All");
  const [course, setCourse] = useState("All");
  const [selected, setSelected] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [lastDeleted, setLastDeleted] = useState(null);
  const [notice, setNotice] = useState("");
  const [practiceMode, setPracticeMode] = useState("wrong");
  const saving = useRef(false);
  const attemptId = useRef(null);
  const mounted = useRef(true);
  async function load() { setPending(true); setError(""); try { setData(await apiRequest("/history")); setLoaded(true); } catch (e) { setError(e.message); } finally { setPending(false); } }
  useEffect(() => { mounted.current = true; const controller = new AbortController(); apiRequest("/history", { signal: controller.signal }).then((value) => { setData(value); setLoaded(true); }).catch((e) => { if (!controller.signal.aborted) setError(e.message); }); return () => { mounted.current = false; controller.abort(); }; }, []);
  const wrong = (r) => r.kind === "quiz" ? r.payload.questions.filter((q) => !isCorrect(q, r.payload.answers[q.id])) : [];
  const records = data.records.filter((r) => (course === "All" || r.course_id === course) && (review ? r.kind === "quiz" && (practiceMode === "all" || wrong(r).length > 0) : kind === "All" || r.kind === kind));
  const practiceQuestions = selected ? practiceMode === "all" ? selected.payload.questions || [] : wrong(selected) : [];
  const deletedRecords = data.deletedRecords || [];
  const kindIcon = { summary: BookOpenText, qa: MessageCircleQuestion, quiz: ListChecks, flashcards: Layers };
  async function bulkHistory(action) {
    if (saving.current || pending) return;
    if (action === "delete-all" && !window.confirm(t(`Delete all ${data.records.length} study records in this account, including records hidden by filters? Courses and materials are kept. You can Undo all afterwards.`, `删除当前账户的全部 ${data.records.length} 条学习记录（包括筛选隐藏的记录）？课程和材料会保留，之后可全部撤销。`))) return;
    saving.current = true; setPending(true); setError(""); setNotice("");
    try {
      const response = await apiRequest(`/history/${action}`, { method: "POST" });
      const latest = await apiRequest("/history");
      if (!mounted.current) return;
      setData(latest); setSelected(null); setLastDeleted(null); setAnswers({}); setResult(null);
      setNotice(action === "delete-all" ? t(`${response.count} study records deleted. Use Undo all to restore them.`, `已删除 ${response.count} 条学习记录，可点击全部撤销恢复。`) : t(`${response.count} study records restored.`, `已恢复 ${response.count} 条学习记录。`));
      await refreshStudyHistory?.();
    } catch (err) { if (mounted.current) setError(err.message); }
    finally { saving.current = false; if (mounted.current) setPending(false); }
  }
  async function deleteRecord(record) {
    if (saving.current) return;
    saving.current = true; setPending(true); setError(""); setNotice("");
    try {
      await apiRequest(`/history/${encodeURIComponent(record.id)}`, { method: "DELETE" });
      if (!mounted.current) return;
      setData(current => ({ ...current,
        records: current.records.filter(r => r.id !== record.id),
        reviews: current.reviews.filter(r => r.record_id !== record.id),
        deletedRecords: [record, ...(current.deletedRecords || []).filter(r => r.id !== record.id)],
      }));
      setSelected(current => current?.id === record.id ? null : current);
      setLastDeleted(record.id); setNotice(t("Study record deleted. You can undo this below.", "学习记录已删除，可在下方撤销。"));
      await refreshStudyHistory?.();
    } catch (err) { if (mounted.current) setError(err.message); }
    finally { saving.current = false; if (mounted.current) setPending(false); }
  }
  async function restoreRecord(record) {
    if (saving.current) return;
    saving.current = true; setPending(true); setError(""); setNotice("");
    try {
      const restored = await apiRequest(`/history/${encodeURIComponent(record.id)}/restore`, { method: "POST" });
      if (!mounted.current) return;
      setData(current => ({ ...current,
        records: [restored.record, ...current.records.filter(r => r.id !== record.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)),
        reviews: [...current.reviews.filter(r => r.record_id !== record.id), ...restored.reviews],
        deletedRecords: (current.deletedRecords || []).filter(r => r.id !== record.id),
      }));
      setLastDeleted(current => current === record.id ? null : current);
      setNotice(t("Study record restored.", "学习记录已恢复。"));
      await refreshStudyHistory?.();
    } catch (err) { if (mounted.current) setError(err.message); }
    finally { saving.current = false; if (mounted.current) setPending(false); }
  }
  async function importLocal() {
    if (saving.current) return;
    saving.current = true; setPending(true); setError("");
    try {
      for (const [type, list] of [["summary", summaryRecords], ["qa", currentChatRecords], ["quiz", quizAttempts]]) for (const item of list) {
        if (item.serverId || item.syncId || !studentCourses.some((c) => c.id === item.courseId)) continue;
        await apiRequest("/history", { method: "POST", body: { id: `legacy-${item.id}`, kind: type, courseId: item.courseId, payload: item } });
      }
      await load();
      await refreshStudyHistory?.();
    } catch (e) { setError(t(`Import stopped: ${e.message} Saved items remain available; retry safely.`, `导入已停止：${e.message} 已保存内容仍然保留，可以重试。`)); } finally { saving.current = false; setPending(false); }
  }
  async function submitPractice(event) {
    event.preventDefault();
    if (saving.current) return;
    if (!practiceQuestions.every((q) => validAnswer(q, answers[q.id]))) {
      setError(t("Answer every practice question before submitting.", "请回答所有练习题后再提交。")); return;
    }
    saving.current = true; setPending(true); setError('');
    attemptId.current ||= crypto.randomUUID();
    try {
      const saved = await apiRequest(`/history/${encodeURIComponent(selected.id)}/review`, {
        method: 'POST', body: { answers, clientId: attemptId.current, mode: practiceMode },
      });
      if (!mounted.current) return;
      setResult(saved);
      const latest = await apiRequest('/history');
      if (mounted.current) setData(latest);
    } catch (err) { if (mounted.current) setError(err.message); }
    finally { saving.current = false; if (mounted.current) setPending(false); }
  }
  return <StudentLayout><div data-react-i18n className={`study-history-page${review ? " study-review-page" : ""}`}><header className="workspace-header history-heading"><span className="history-heading-icon">{review ? <ListChecks size={25} /> : <History size={25} />}</span><div><h1>{review ? t("Review Centre", "复习中心") : t("Study History", "学习历史")}</h1><p data-react-i18n>{review ? t("Practise wrong questions or retake a complete Quiz. Your original results are kept.", "可以只练错题或重新练习整份测验，原始成绩会保留。") : t("Study records saved to your account on the server.", "学习记录保存在服务器上的个人账户中。")}</p></div></header>
    <div className="user-card history-content">
      <div className="history-toolbar" data-react-i18n>
      <button type="button" disabled={pending} onClick={load}><RefreshCw size={15} />{t("Refresh records", "刷新记录")}</button>
      {!review && <><button type="button" disabled={pending} onClick={importLocal}><Upload size={15} />{t("Import older browser records", "导入旧浏览器记录")}</button><div className="history-bulk-actions"><button type="button" className="history-bulk-delete" disabled={pending || !loaded || !data.records.length} onClick={() => bulkHistory("delete-all")}><Trash2 size={15} />{t("Delete all", "全部删除")}</button><button type="button" disabled={pending || !loaded || !deletedRecords.length} onClick={() => bulkHistory("restore-all")}><RotateCcw size={15} />{t("Undo all", "全部撤销")}</button></div></>}
      </div>
      {!review && <p className="history-import-hint">{t("Imports summaries, quizzes and the currently selected Q&A conversation. Select other conversations in Q&A to import them separately.", "导入旧浏览器中的总结、测验和当前问答会话。其他问答会话需分别选择后导入。")}</p>}
      {error && <p role="alert" className="form-error">{error}</p>}{(!loaded && !error || pending) && <p role="status">{t("Loading…", "加载中…")}</p>}
      {notice && <div className="history-undo-banner" role="status" data-react-i18n><span>{notice}</span>{deletedRecords.some(r => r.id === lastDeleted) && <button type="button" disabled={pending} onClick={() => restoreRecord(deletedRecords.find(r => r.id === lastDeleted))}>{t("Undo", "撤销")}</button>}</div>}
      <div className="history-filters"><label className="user-field">{t("Course", "课程")}<select disabled={pending} value={course} onChange={(e) => { setCourse(e.target.value); setSelected(null); }}><option value="All">{t("All", "全部")}</option>{studentCourses.map((c) => <option key={c.id} value={c.id}>{courseLabel(c)}</option>)}</select></label>
      {review && <label className="user-field" data-react-i18n>{t("Practice mode", "练习模式")}<select value={practiceMode} disabled={pending} aria-label={t("Practice mode", "练习模式")} onChange={event => { setPracticeMode(event.target.value); setSelected(null); setAnswers({}); setResult(null); setError(""); attemptId.current = null; }}><option value="wrong">{t("Wrong questions only", "只练错题")}</option><option value="all">{t("Retake all questions", "全部重新练习")}</option></select></label>}
      {!review && <label className="user-field">{t("Record type", "记录类型")}<select data-react-i18n disabled={pending} value={kind} onChange={(e) => { setKind(e.target.value); setSelected(null); }}>{["All", "summary", "qa", "quiz", "flashcards"].map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}</select></label>}
      </div>
      {loaded && <p className="history-record-count" data-react-i18n>{t(`${records.length} ${review ? "quizzes available for practice" : "study records shown"}`, `${records.length} ${review ? "份测验可供练习" : "条学习记录"}`)}</p>}
      {loaded && !records.length && <p>{review ? practiceMode === "all" ? t("No saved quizzes for this filter.", "当前筛选条件下没有测验记录。") : t("No saved wrong questions for this filter.", "当前筛选条件下没有错题记录。") : t("No saved records for this filter yet.", "当前筛选条件下暂无学习记录。")}</p>}
      {records.map((r) => { const Icon = kindIcon[r.kind] || History; return <div key={r.id} className={`history-record-row history-kind-${r.kind}${selected?.id === r.id ? " is-selected" : ""}`}><div><button className="history-record-open" type="button" data-react-i18n aria-pressed={selected?.id === r.id} disabled={pending} onClick={() => { setSelected(r); setAnswers({}); setResult(null); setError(''); attemptId.current = null; }}><Icon size={17} aria-hidden="true" />{kindLabel(r.kind)} · {r.created_at} · {courseLabel(studentCourses.find((c) => c.id === r.course_id)) || t("Archived course", "已归档课程")}{r.kind === "quiz" ? ` · ${r.payload.score}% · ${wrong(r).length} ${t("wrong", "道错题")}` : ""}</button>{review && <small className="history-practice-count">{t(`${data.reviews.filter((a) => a.record_id === r.id).length} practice attempt(s)`, `已练习 ${data.reviews.filter((a) => a.record_id === r.id).length} 次`)}</small>}</div>{!review && <button type="button" className="history-delete-button" data-react-i18n disabled={pending} aria-label={`${t("Delete", "删除")} ${kindLabel(r.kind)} · ${r.created_at}`} onClick={() => deleteRecord(r)}><Trash2 size={14} aria-hidden="true" />{t("Delete", "删除")}</button>}</div>; })}
      {!review && deletedRecords.length > 0 && <details className="history-deleted-records" data-react-i18n><summary>{t("Deleted records", "已删除的记录")} ({deletedRecords.length})</summary><p>{t("Undo restores the record and its saved practice attempts. Records cannot be restored after their course or source material is deleted.", "撤销会恢复原记录及关联练习。课程或来源材料被删除后，对应记录无法恢复。")}</p>{deletedRecords.map(r => <div className="history-record-row" key={r.id}><span>{kindLabel(r.kind)} · {r.created_at}</span><button type="button" disabled={pending} aria-label={`${t("Undo deletion of", "撤销删除")} ${kindLabel(r.kind)} · ${r.created_at}`} onClick={() => restoreRecord(r)}>{t("Undo", "撤销")}</button></div>)}</details>}
      {selected && <section className="history-details"><h2>{review ? practiceMode === "all" ? t("Retake Quiz", "重新练习全部题目") : t("Wrong question practice", "错题练习") : t("Record details", "记录详情")}</h2>
        {selected.kind === "quiz" ? <form onSubmit={submitPractice}>
          {(review ? practiceQuestions : selected.payload.questions).map((q) => <article key={q.id} className={(!review || result) ? `quiz-result-card ${isCorrect(q, (result?.answers || selected.payload.answers)[q.id]) ? "quiz-result-correct" : "quiz-result-incorrect"}` : undefined} style={{ marginBottom: 20 }}><h3>{selected.payload.questions.indexOf(q) + 1}. {q.question}</h3>
            <p>{isMultiple(q) ? t("Multiple answers — select all that apply", "多选题——请选择所有正确选项") : t("Single answer — select one option", "单选题——请选择一个选项")}</p>
            {(!review || result) && <p className="quiz-result-status"><strong>{isCorrect(q, (result?.answers || selected.payload.answers)[q.id]) ? t("Correct", "正确") : t("Incorrect", "错误")}</strong></p>}
            {review && <p>{t("Original answer:", "原始答案：")} {answerText(q, selected.payload.answers[q.id])}</p>}
            {review && !result ? q.options.map((o, i) => <label key={i} style={{ display: "block", padding: 6 }}><input disabled={pending} required={!isMultiple(q)} type={isMultiple(q) ? "checkbox" : "radio"} name={String(q.id)} checked={indices(answers[q.id]).includes(i)} onChange={() => { attemptId.current = null; setAnswers((current) => ({ ...current, [q.id]: toggleAnswer(q, current[q.id], i) })); }} /> {o}</label>) : <><p>{t("Your answer:", "你的答案：")} {answerText(q, (result?.answers || selected.payload.answers)[q.id])}</p><p>{t("Correct answer:", "正确答案：")} {answerText(q, correctIndices(q))}</p><p>{q.explanation}</p></>}
          </article>)}
          {review && !result && <button className="primary-button" disabled={pending}>{t("Submit practice", "提交练习")}</button>}{result && <><p role="status">{t(`Saved: ${result.correct}/${result.total} correct (${result.score}%).`, `已保存：答对 ${result.correct}/${result.total} 题（${result.score}%）。`)}</p><button type="button" disabled={pending} onClick={() => { setAnswers({}); setResult(null); attemptId.current = null; }}>{t("Practise again", "再次练习")}</button></>}
          {data.reviews.filter((a) => a.record_id === selected.id).map((a) => <details key={a.id}><summary>{t("Practice", "练习")} · {a.created_at} · {a.payload.correct}/{a.payload.total} {t("correct", "题正确")}</summary>
            {(a.payload.mode === "all" ? selected.payload.questions : wrong(selected)).map((q) => <div key={q.id}><h4>{selected.payload.questions.indexOf(q) + 1}. {q.question}</h4>
              <p>{isCorrect(q, a.payload.answers[q.id]) ? t('Correct', '正确') : t('Incorrect', '错误')} · {t("Your answer:", "你的答案：")} {answerText(q, a.payload.answers[q.id])}</p>
              <p>{t("Correct answer:", "正确答案：")} {answerText(q, correctIndices(q))}</p></div>)}
          </details>)}
        </form> : <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{selected.kind === "qa" ? `${selected.payload.role}: ${selected.payload.text}` : selected.kind === "summary" ? <><p>{selected.payload.summary?.paragraph}</p><ul>{selected.payload.summary?.concepts?.map((c, i) => <li key={i}>{c}</li>)}</ul></> : selected.payload.cards?.map((c, i) => <details key={i}><summary>{c.front}</summary><p>{c.back}</p><small>{c.source}</small></details>)}</div>}
      </section>}
    </div></div></StudentLayout>;
}
