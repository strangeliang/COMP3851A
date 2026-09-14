import { useEffect, useState } from "react";
import StudentLayout from "../../layouts/StudentLayout";
import { useAppData } from "../../state/AppDataContext";
import { apiRequest } from "../../services/apiClient";

export default function HistoryPage({ review = false }) {
  const { studentCourses, summaryRecords, currentChatRecords, quizAttempts } = useAppData();
  const [data, setData] = useState({ records: [], reviews: [] });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [kind, setKind] = useState("All");
  const [course, setCourse] = useState("All");
  const [selected, setSelected] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  async function load() { setPending(true); setError(""); try { setData(await apiRequest("/history")); setLoaded(true); } catch (e) { setError(e.message); } finally { setPending(false); } }
  useEffect(() => { const controller = new AbortController(); apiRequest("/history", { signal: controller.signal }).then((value) => { setData(value); setLoaded(true); }).catch((e) => { if (!controller.signal.aborted) setError(e.message); }); return () => controller.abort(); }, []);
  const wrong = (r) => r.kind === "quiz" ? r.payload.questions.filter((q) => r.payload.answers[q.id] !== q.answerIndex) : [];
  const records = data.records.filter((r) => (course === "All" || r.course_id === course) && (review ? wrong(r).length > 0 : kind === "All" || r.kind === kind));
  async function importLocal() {
    setPending(true); setError("");
    try {
      for (const [type, list] of [["summary", summaryRecords], ["qa", currentChatRecords], ["quiz", quizAttempts]]) for (const item of list) {
        if (!studentCourses.some((c) => c.id === item.courseId)) continue;
        await apiRequest("/history", { method: "POST", body: { id: `legacy-${item.id}`, kind: type, courseId: item.courseId, payload: item } });
      }
      await load();
    } catch (e) { setError(`Import stopped: ${e.message} Saved items remain available; retry safely.`); } finally { setPending(false); }
  }
  return <StudentLayout><header className="workspace-header"><h1>{review ? "Review Centre" : "Study History"}</h1><p>{review ? "Practise the questions you originally answered incorrectly. Your original results are kept." : "Study records saved to your account on the server."}</p></header>
    <div className="user-card" style={{ padding: 24 }}>
      <button disabled={pending} onClick={load}>Refresh records</button>
      {!review && <><button disabled={pending} onClick={importLocal}>Import older browser records</button><p>Imports summaries, quizzes and the currently selected Q&A conversation. Select other conversations in Q&A to import them separately.</p></>}
      {error && <p role="alert" className="form-error">{error}</p>}{(!loaded && !error || pending) && <p role="status">Loading…</p>}
      <label className="user-field">Course<select value={course} onChange={(e) => { setCourse(e.target.value); setSelected(null); }}><option>All</option>{studentCourses.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}</select></label>
      {!review && <label className="user-field">Record type<select value={kind} onChange={(e) => { setKind(e.target.value); setSelected(null); }}>{["All", "summary", "qa", "quiz", "flashcards"].map((k) => <option key={k}>{k}</option>)}</select></label>}
      {loaded && !records.length && <p>{review ? "No saved wrong questions for this filter." : "No saved records for this filter yet."}</p>}
      {records.map((r) => <div key={r.id} style={{ padding: 12, borderBottom: "1px solid #eee" }}><button onClick={() => { setSelected(r); setAnswers({}); setResult(null); }}>{r.kind.toUpperCase()} · {r.created_at} · {studentCourses.find((c) => c.id === r.course_id)?.code || "Archived course"}{r.kind === "quiz" ? ` · ${r.payload.score}% · ${wrong(r).length} wrong` : ""}</button>{review && <small> · {data.reviews.filter((a) => a.record_id === r.id).length} practice attempt(s)</small>}</div>)}
      {selected && <section style={{ marginTop: 24 }}><h2>{review ? "Wrong question practice" : "Record details"}</h2>
        {selected.kind === "quiz" ? <form onSubmit={async (e) => { e.preventDefault(); setPending(true); setError(""); try { setResult(await apiRequest(`/history/${encodeURIComponent(selected.id)}/review`, { method: "POST", body: { answers } })); await load(); } catch (err) { setError(err.message); } finally { setPending(false); } }}>
          {(review ? wrong(selected) : selected.payload.questions).map((q) => <article key={q.id} style={{ marginBottom: 20 }}><h3>{q.question}</h3>
            {review && !result ? q.options.map((o, i) => <label key={i} style={{ display: "block", padding: 6 }}><input required type="radio" name={String(q.id)} checked={answers[q.id] === i} onChange={() => setAnswers({ ...answers, [q.id]: i })} /> {o}</label>) : <><p>Your answer: {q.options[(result?.answers || selected.payload.answers)[q.id]]}</p><p>Correct answer: {q.options[q.answerIndex]}</p><p>{q.explanation}</p></>}
          </article>)}
          {review && !result && <button className="primary-button" disabled={pending}>Submit practice</button>}{result && <p role="status">Saved: {result.correct}/{result.total} correct ({result.score}%).</p>}
          {review && data.reviews.filter((a) => a.record_id === selected.id).map((a) => <p key={a.id}>Practice · {a.created_at} · {a.payload.correct}/{a.payload.total} correct</p>)}
        </form> : <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{selected.kind === "qa" ? `${selected.payload.role}: ${selected.payload.text}` : selected.kind === "summary" ? <><p>{selected.payload.summary?.paragraph}</p><ul>{selected.payload.summary?.concepts?.map((c, i) => <li key={i}>{c}</li>)}</ul></> : selected.payload.cards?.map((c, i) => <details key={i}><summary>{c.front}</summary><p>{c.back}</p><small>{c.source}</small></details>)}</div>}
      </section>}
    </div></StudentLayout>;
}
