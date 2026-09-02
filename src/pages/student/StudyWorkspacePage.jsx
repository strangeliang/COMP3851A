import AIChatBox from "../../components/AIChatBox";
import { AlertCircle, BookOpenText, CheckCircle2, MessageCircleQuestion, RotateCcw, Sparkles } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Toolbar from "../../components/Toolbar";
import StudentLayout from "../../layouts/StudentLayout";
import { useAppData } from "../../state/AppDataContext";
import useAIRequest from "../../hooks/useAIRequest";
import { generateAISummary, generateAIQuiz } from "../../services/aiService";
import { limits, materialIsIncomplete, sameId, selectionError } from "../../utils/studyScope";

const modeLabels = [["summary", "Summary", BookOpenText], ["qa", "Q&A", MessageCircleQuestion], ["quiz", "Quiz", Sparkles]];

function SummaryPanel({ canUseAI, materialSourceLabel }) {
  const { selectedMaterials, recordSummaryUse, currentSummaryRecord, scope } = useAppData();
  const request = useAIRequest(scope.scopeKey);
  const summary = request.data || currentSummaryRecord?.summary;
  async function generate() {
    if (!canUseAI || request.pending) return;
    const result = await request.run((signal) => generateAISummary({ materials: selectedMaterials, signal }));
    if (result) recordSummaryUse(result, scope);
  }
  return <section className="user-card workspace-panel">
    <div className="panel-title-row">
      <div><p className="summary-source">{materialSourceLabel}</p><h2>Generate Summary</h2></div>
      <button className="primary-button" type="button" disabled={!canUseAI || request.pending} onClick={generate}>
        {request.pending ? "Generating…" : summary ? "Regenerate" : "Generate Summary"}
      </button>
    </div>
    <p className="demo-warning">Summaries use the selected materials. Check important details against the original sources.</p>
    {request.pending && <div className="state-banner" role="status">Gemini is reading your materials… <button type="button" onClick={request.cancel}>Stop generating</button></div>}
    {request.error && <div className="state-banner error" role="alert">{request.error}</div>}
    {!summary && !request.pending && !request.error && <div className="empty-state">No summary generated for these materials yet.</div>}
    {summary && <div className="summary-result" aria-live="polite">
      <p style={{ whiteSpace: "pre-wrap" }}>{summary.paragraph}</p>
      <h3>Key Concepts</h3>
      <div className="key-concepts">{summary.concepts.map((concept, index) => <span key={index}>{concept}</span>)}</div>
    </div>}
  </section>;
}

function QuizPanel({ canUseAI, materialSourceLabel }) {
  const { selectedMaterials, saveQuizAttempt, scope } = useAppData();
  const request = useAIRequest(scope.scopeKey);
  const questions = request.data?.questions || [];
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [warning, setWarning] = useState("");
  const submittedRef = useRef(false);
  const complete = questions.length > 0 && questions.every((question) => Number.isInteger(answers[question.id]));
  const correct = questions.reduce((sum, question) => sum + (answers[question.id] === question.answerIndex ? 1 : 0), 0);
  const score = questions.length ? Math.round(correct / questions.length * 100) : 0;
  const question = questions[index];
  function resetAnswers() {
    setIndex(0); setAnswers({}); setSubmitted(false); setWarning(""); submittedRef.current = false;
  }
  async function generate() {
    if (!canUseAI || request.pending) return;
    resetAnswers();
    await request.run((signal) => generateAIQuiz({ materials: selectedMaterials, signal }));
  }
  function submit() {
    if (submittedRef.current) return;
    if (!complete) { setWarning("Please answer every question before submitting."); return; }
    submittedRef.current = true;
    setSubmitted(true); setWarning("");
    saveQuizAttempt({ score, total: questions.length, correct, answers, questions, mode: "api" }, scope);
  }
  return <section className="user-card workspace-panel">
    <div className="panel-title-row">
      <div><p className="summary-source">{materialSourceLabel}</p><h2>Quiz</h2></div>
      {submitted && <div className="score-card"><CheckCircle2 size={18} />{score}% ({correct}/{questions.length})</div>}
      <button className="primary-button" type="button" onClick={generate} disabled={!canUseAI || request.pending}>
        {request.pending ? "Generating…" : questions.length ? "Generate New Quiz" : "Generate Quiz"}
      </button>
    </div>
    <p className="demo-warning">Generate three practice questions from your materials. Check AI explanations against the sources.</p>
    {request.pending && <div className="state-banner" role="status">Generating questions… <button type="button" onClick={request.cancel}>Stop generating</button></div>}
    {request.error && <div className="state-banner error" role="alert">{request.error}</div>}
    {!questions.length && !request.pending && !request.error && <div className="empty-state">Generate a quiz to start practising.</div>}
    {question && !submitted && <div className="quiz-card">
      <div className="quiz-counter">Question {index + 1} of {questions.length}</div>
      <h3>{question.question}</h3>
      <div className="quiz-options">{question.options.map((option, optionIndex) => <label key={optionIndex} className={answers[question.id] === optionIndex ? "selected" : ""}>
        <input type="radio" name={`question-${question.id}`} checked={answers[question.id] === optionIndex}
          onChange={() => setAnswers((current) => ({ ...current, [question.id]: optionIndex }))} />{option}
      </label>)}</div>
      {warning && <p className="form-error" role="alert">{warning}</p>}
      <div className="quiz-actions">
        <button type="button" disabled={index === 0} onClick={() => setIndex((current) => current - 1)}>Previous</button>
        <button type="button" disabled={index === questions.length - 1} onClick={() => setIndex((current) => current + 1)}>Next</button>
        <button className="primary-button" type="button" onClick={submit}>Submit</button>
      </div>
    </div>}
    {submitted && <div className="quiz-review">
      {questions.map((item) => <article key={item.id}>
        <h3>{item.question}</h3><p><strong>Your answer:</strong> {item.options[answers[item.id]]}</p>
        <p><strong>Correct answer:</strong> {item.options[item.answerIndex]}</p><p><strong>Explanation:</strong> {item.explanation}</p>
      </article>)}
      <button className="primary-button" type="button" onClick={resetAnswers}><RotateCcw size={16} />Retake Quiz</button>
    </div>}
  </section>;
}

export default function StudyWorkspacePage() {
  const [params, setParams] = useSearchParams();
  const mode = ["summary", "qa", "quiz"].includes(params.get("mode")) ? params.get("mode") : "summary";
  const { studentCourses, currentCourse, currentCourseId, selectCourse, courseMaterials, selectedMaterialIds,
    selectedMaterials, setSelectedMaterialIds, summaryUses, qaUses, aiStatus, scope } = useAppData();
  const [search, setSearch] = useState("");
  const error = selectionError(selectedMaterials);
  const canUseAI = Boolean(currentCourse && !error && aiStatus.configured);
  const selectedCharacters = selectedMaterials.reduce((total, material) => total + (material.content?.length || 0), 0);
  const materialSourceLabel = selectedMaterials.length ? selectedMaterials.map((material, index) => `[S${index + 1}] ${material.name}`).join(" · ") : "No materials selected";
  const filteredMaterials = useMemo(() => courseMaterials.filter((material) => material.name.toLowerCase().includes(search.trim().toLowerCase())), [courseMaterials, search]);
  const isSelected = (id) => selectedMaterialIds.some((selected) => sameId(selected, id));
  function toggle(id) { setSelectedMaterialIds(isSelected(id) ? selectedMaterialIds.filter((selected) => !sameId(selected, id)) : [...selectedMaterialIds, id]); }
  function changeMode(next) { setParams((current) => { const updated = new URLSearchParams(current); updated.set("mode", next); return updated; }); }
  const profileContent = <>
    <h3 className="side-heading">Workspace Scope</h3>
    <div className="side-list">
      <div className="side-item"><strong>Course</strong><span>{currentCourse ? `${currentCourse.code} ${currentCourse.name}` : "Not selected"}</span></div>
      <div className="side-item"><strong>Materials</strong><span>{selectedMaterials.length}/{limits.maxFilesPerAIRequest} selected</span></div>
      <div className="side-item"><strong>Summary Uses</strong><span>{summaryUses}</span></div>
      <div className="side-item"><strong>Q&A Uses</strong><span>{qaUses}</span></div>
    </div>
  </>;
  return <StudentLayout profileProps={{ title: "Study Workspace", initials: "AI", name: currentCourse?.code || "Select Course", subtitle: "Summary, Q&A, and Quiz use selected course materials." }} profileContent={profileContent}>
    <Toolbar value={search} onChange={setSearch} placeholder="Search materials in current course..." />
    <header className="workspace-header"><h1>Study Workspace</h1><p>Choose a course and up to {limits.maxFilesPerAIRequest} materials for Summary, Q&A, or Quiz.</p></header>
    <div className="control-grid"><label className="user-field">Current Course
      <select value={currentCourseId} onChange={(event) => selectCourse(event.target.value)} disabled={!studentCourses.length}>
        {!studentCourses.length && <option value="">Create a course first</option>}
        {studentCourses.map((course) => <option key={course.id} value={course.id}>{course.code} {course.name}</option>)}
      </select>
    </label></div>
    <section className="user-card materials-ai-panel">
      <div className="materials-ai-header"><div><p className="summary-source">Current course only</p><h2>Materials for AI</h2></div>
        <div className="materials-ai-actions">
          <button type="button" onClick={() => setSelectedMaterialIds(courseMaterials.slice(0, limits.maxFilesPerAIRequest).map((material) => material.id))} disabled={!courseMaterials.length}>
            {courseMaterials.length > limits.maxFilesPerAIRequest ? `Select First ${limits.maxFilesPerAIRequest}` : "Select All"}
          </button>
          <button type="button" onClick={() => setSelectedMaterialIds([])} disabled={!selectedMaterials.length}>Clear All</button>
        </div>
      </div>
      {courseMaterials.length ? <>
        <div className="materials-ai-list">{filteredMaterials.map((material) => <label className="material-check-row" key={material.id}>
          <input type="checkbox" checked={isSelected(material.id)} onChange={() => toggle(material.id)} disabled={!isSelected(material.id) && selectedMaterialIds.length >= limits.maxFilesPerAIRequest} />
          <span>{material.name}{materialIsIncomplete(material) ? " — re-upload required" : ""}</span><strong>{material.type}</strong>
        </label>)}</div>
        {!filteredMaterials.length && <div className="empty-state">No matching materials in this course.</div>}
        <p className="materials-selected-count">Selected: {selectedMaterials.length}/{limits.maxFilesPerAIRequest} files · {selectedCharacters.toLocaleString()}/{limits.maxAIContextCharacters.toLocaleString()} characters</p>
        <p className="summary-source">If the total is too large, select fewer files or split the original documents.</p>
        {selectedMaterials.filter((material) => material.parseWarning).map((material) => <details key={material.id} className="summary-source"><summary>Reading notes: {material.name}</summary><p>{material.parseWarning}</p></details>)}
      </> : <div className="empty-state">No materials available. Please upload materials first.</div>}
    </section>
    {error && <div className="state-banner error" role="alert"><AlertCircle size={16} />{error}</div>}
    {!aiStatus.configured && <div className="state-banner" role="status">{aiStatus.message}</div>}
    <div className="workspace-tabs">{modeLabels.map(([key, label, Icon]) => <button key={key} type="button" className={mode === key ? "active" : ""} onClick={() => changeMode(key)}><Icon size={16} />{label}</button>)}</div>
    {mode === "summary" && <SummaryPanel key={scope.scopeKey} canUseAI={canUseAI} materialSourceLabel={materialSourceLabel} />}
    {mode === "qa" && <section className="user-card workspace-panel"><div className="panel-title-row"><div><p className="summary-source">{materialSourceLabel}</p><h2>Q&A Chat</h2></div></div>
      <p className="demo-warning">Ask follow-up questions about these materials. Check references and important details against the originals.</p>
      <AIChatBox key={scope.scopeKey} selectedMaterials={selectedMaterials} currentCourse={currentCourse} />
    </section>}
    {mode === "quiz" && <QuizPanel key={scope.scopeKey} canUseAI={canUseAI} materialSourceLabel={materialSourceLabel} />}
  </StudentLayout>;
}
