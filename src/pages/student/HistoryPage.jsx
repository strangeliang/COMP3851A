import { useEffect, useRef, useState } from "react";
import StudentLayout from "../../layouts/StudentLayout";
import { useAppData } from "../../state/AppDataContext";
import { apiRequest } from "../../services/apiClient";
import { indices, correctIndices, isMultiple, isCorrect, validAnswer, toggleAnswer, answerText } from "../../../shared/quiz.mjs";

export default function HistoryPage({ review = false }) {
  const { studentCourses, summaryRecords, currentChatRecords, quizAttempts, refreshStudyHistory } = useAppData();
  const [data, setData] = useState({ records: [], reviews: [] });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [kind, setKind] = useState("All");
  const [course, setCourse] = useState("All");
  const [selected, setSelected] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const saving = useRef(false);
  const attemptId = useRef(null);
  const mounted = useRef(true);
  async function load() { setPending(true); setError(""); try { setData(await apiRequest("/history")); setLoaded(true); } catch (e) { setError(e.message); } finally { setPending(false); } }
  useEffect(() => { mounted.current = true; const controller = new AbortController(); apiRequest("/history", { signal: controller.signal }).then((value) => { setData(value); setLoaded(true); }).catch((e) => { if (!controller.signal.aborted) setError(e.message); }); return () => { mounted.current = false; controller.abort(); }; }, []);
  const wrong = (r) => r.kind === "quiz" ? r.payload.questions.filter((q) => !isCorrect(q, r.payload.answers[q.id])) : [];
  const records = data.records.filter((r) => (course === "All" || r.course_id === course) && (review ? wrong(r).length > 0 : kind === "All" || r.kind === kind));
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
    } catch (e) { setError(`Import stopped: ${e.message} Saved items remain available; retry safely.`); } finally { saving.current = false; setPending(false); }
  }
  async function submitPractice(event) {
    event.preventDefault();
    if (saving.current) return;
    if (!wrong(selected).every((q) => validAnswer(q, answers[q.id]))) {
      setError('Answer every wrong question before submitting.'); return;
    }
    saving.current = true; setPending(true); setError('');
    attemptId.current ||= crypto.randomUUID();
    try {
      const saved = await apiRequest(`/history/${encodeURIComponent(selected.id)}/review`, {
        method: 'POST', body: { answers, clientId: attemptId.current },
      });
      if (!mounted.current) return;
      setResult(saved);
      const latest = await apiRequest('/history');
      if (mounted.current) setData(latest);
    } catch (err) { if (mounted.current) setError(err.message); }
    finally { saving.current = false; if (mounted.current) setPending(false); }
  }
  return <StudentLayout><header className="workspace-header"><h1>{review ? "Review Centre" : "Study History"}</h1><p>{review ? "Practise the questions you originally answered incorrectly. Your original results are kept." : "Study records saved to your account on the server."}</p></header>
    <div className="user-card" style={{ padding: 24 }}>
      <button disabled={pending} onClick={load}>Refresh records</button>
      {!review && <><button disabled={pending} onClick={importLocal}>Import older browser records</button><p>Imports summaries, quizzes and the currently selected Q&A conversation. Select other conversations in Q&A to import them separately.</p></>}
      {error && <p role="alert" className="form-error">{error}</p>}{(!loaded && !error || pending) && <p role="status">Loading…</p>}
      <label className="user-field">Course<select disabled={pending} value={course} onChange={(e) => { setCourse(e.target.value); setSelected(null); }}><option>All</option>{studentCourses.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}</select></label>
      {!review && <label className="user-field">Record type<select disabled={pending} value={kind} onChange={(e) => { setKind(e.target.value); setSelected(null); }}>{["All", "summary", "qa", "quiz", "flashcards"].map((k) => <option key={k}>{k}</option>)}</select></label>}
      {loaded && !records.length && <p>{review ? "No saved wrong questions for this filter." : "No saved records for this filter yet."}</p>}
      {records.map((r) => <div key={r.id} style={{ padding: 12, borderBottom: "1px solid #eee" }}><button disabled={pending} onClick={() => { setSelected(r); setAnswers({}); setResult(null); setError(''); attemptId.current = null; }}>{r.kind.toUpperCase()} · {r.created_at} · {studentCourses.find((c) => c.id === r.course_id)?.code || "Archived course"}{r.kind === "quiz" ? ` · ${r.payload.score}% · ${wrong(r).length} wrong` : ""}</button>{review && <small> · {data.reviews.filter((a) => a.record_id === r.id).length} practice attempt(s)</small>}</div>)}
      {selected && <section style={{ marginTop: 24 }}><h2>{review ? "Wrong question practice" : "Record details"}</h2>
        {selected.kind === "quiz" ? <form onSubmit={submitPractice}>
          {(review ? wrong(selected) : selected.payload.questions).map((q) => <article key={q.id} style={{ marginBottom: 20 }}><h3>{selected.payload.questions.indexOf(q) + 1}. {q.question}</h3>
            <p>{isMultiple(q) ? "Multiple answers — select all that apply" : "Single answer — select one option"}</p>
            {(!review || result) && <p><strong>{isCorrect(q, (result?.answers || selected.payload.answers)[q.id]) ? "Correct" : "Incorrect"}</strong></p>}
            {review && <p>Original answer: {answerText(q, selected.payload.answers[q.id])}</p>}
            {review && !result ? q.options.map((o, i) => <label key={i} style={{ display: "block", padding: 6 }}><input disabled={pending} required={!isMultiple(q)} type={isMultiple(q) ? "checkbox" : "radio"} name={String(q.id)} checked={indices(answers[q.id]).includes(i)} onChange={() => { attemptId.current = null; setAnswers((current) => ({ ...current, [q.id]: toggleAnswer(q, current[q.id], i) })); }} /> {o}</label>) : <><p>Your answer: {answerText(q, (result?.answers || selected.payload.answers)[q.id])}</p><p>Correct answer: {answerText(q, correctIndices(q))}</p><p>{q.explanation}</p></>}
          </article>)}
          {review && !result && <button className="primary-button" disabled={pending}>Submit practice</button>}{result && <><p role="status">Saved: {result.correct}/{result.total} correct ({result.score}%).</p><button type="button" disabled={pending} onClick={() => { setAnswers({}); setResult(null); attemptId.current = null; }}>Practise again</button></>}
          {data.reviews.filter((a) => a.record_id === selected.id).map((a) => <details key={a.id}><summary>Practice · {a.created_at} · {a.payload.correct}/{a.payload.total} correct</summary>
            {wrong(selected).map((q) => <div key={q.id}><h4>{selected.payload.questions.indexOf(q) + 1}. {q.question}</h4>
              <p>{isCorrect(q, a.payload.answers[q.id]) ? 'Correct' : 'Incorrect'} · Your answer: {answerText(q, a.payload.answers[q.id])}</p>
              <p>Correct answer: {answerText(q, correctIndices(q))}</p></div>)}
          </details>)}
        </form> : <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{selected.kind === "qa" ? `${selected.payload.role}: ${selected.payload.text}` : selected.kind === "summary" ? <><p>{selected.payload.summary?.paragraph}</p><ul>{selected.payload.summary?.concepts?.map((c, i) => <li key={i}>{c}</li>)}</ul></> : selected.payload.cards?.map((c, i) => <details key={i}><summary>{c.front}</summary><p>{c.back}</p><small>{c.source}</small></details>)}</div>}
      </section>}
    </div></StudentLayout>;
}
