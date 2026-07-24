import AIChatBox from "../../components/AIChatBox";
import {
  AlertCircle,
  BookOpenText,
  CheckCircle2,
  MessageCircleQuestion,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Toolbar from "../../components/Toolbar";
import StudentLayout from "../../layouts/StudentLayout";
import { mockSummary, quizQuestions } from "../../data/mockData";
import { useAppData } from "../../state/AppDataContext";

const modeLabels = [
  ["summary", "Summary", BookOpenText],
  ["qa", "Q&A", MessageCircleQuestion],
  ["quiz", "Quiz", Sparkles],
];

export default function StudyWorkspacePage() {
  const [params] = useSearchParams();
  const initialMode = ["summary", "qa", "quiz"].includes(params.get("mode"))
    ? params.get("mode")
    : "summary";
  const {
    studentCourses,
    currentCourse,
    currentCourseId,
    selectCourse,
    courseMaterials,
    selectedMaterialIds,
    selectedMaterials,
    setSelectedMaterialIds,
    summaryUses,
    qaUses,
    recordSummaryUse,
    saveQuizAttempt,
  } = useAppData();

  const [mode, setMode] = useState(initialMode);
  const [search, setSearch] = useState("");
  const [summaryState, setSummaryState] = useState("idle");
  const [summaryError, setSummaryError] = useState("");
  const [quizIndex, setQuizIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [quizWarning, setQuizWarning] = useState("");
  const hasDefaultedMaterials = useRef(false);
  const [defaultedCourseId, setDefaultedCourseId] = useState(currentCourseId);

  const canUseAI = Boolean(currentCourse && selectedMaterials.length);
  const selectedMaterialNames = selectedMaterials.map((material) => material.name).join(", ");
  const materialSourceLabel = selectedMaterials.length
    ? `${selectedMaterials.length} material${selectedMaterials.length === 1 ? "" : "s"}: ${selectedMaterialNames}`
    : "No materials selected";

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (!hasDefaultedMaterials.current || defaultedCourseId !== currentCourseId) {
      setSelectedMaterialIds(courseMaterials.map((material) => material.id));
      hasDefaultedMaterials.current = true;
      setDefaultedCourseId(currentCourseId);
    }
  }, [courseMaterials, currentCourseId, defaultedCourseId, setSelectedMaterialIds]);

  const filteredMaterials = useMemo(() => {
    const query = search.trim().toLowerCase();
    return courseMaterials.filter((material) =>
      !query || material.name.toLowerCase().includes(query),
    );
  }, [courseMaterials, search]);

  function isMaterialSelected(materialId) {
    return selectedMaterialIds.some((id) => String(id) === String(materialId));
  }

  function toggleMaterial(materialId) {
    const nextIds = isMaterialSelected(materialId)
      ? selectedMaterialIds.filter((id) => String(id) !== String(materialId))
      : [...selectedMaterialIds, materialId];

    setSelectedMaterialIds(nextIds);
  }

  function selectAllMaterials() {
    setSelectedMaterialIds(courseMaterials.map((material) => material.id));
  }

  function clearAllMaterials() {
    setSelectedMaterialIds([]);
  }

  function fakeDelay(callback) {
    window.setTimeout(callback, 520);
  }

  function generateSummary() {
    if (!canUseAI) return;
    setSummaryError("");
    setSummaryState("loading");
    fakeDelay(() => {
      if (selectedMaterials.some((material) => material.name.toLowerCase().includes("error"))) {
        setSummaryError("Mock error: one selected material failed to generate a summary.");
        setSummaryState("error");
        return;
      }
      recordSummaryUse(mockSummary);
      setSummaryState("success");
    });
  }

  const selectedCount = Object.keys(answers).length;
  const quizComplete = selectedCount === quizQuestions.length;
  const scoreCount = quizQuestions.reduce(
    (sum, item) => sum + (answers[item.id] === item.answerIndex ? 1 : 0),
    0,
  );
  const scorePercent = Math.round((scoreCount / quizQuestions.length) * 100);
  const currentQuestion = quizQuestions[quizIndex];

  function submitQuiz() {
    if (!canUseAI) return;
    if (!quizComplete) {
      setQuizWarning("Please answer every question before submitting.");
      return;
    }
    setQuizWarning("");
    setSubmitted(true);
    saveQuizAttempt({
      score: scorePercent,
      total: quizQuestions.length,
      correct: scoreCount,
      answers,
      selectedMaterialIds,
    });
  }

  function retakeQuiz() {
    setQuizIndex(0);
    setAnswers({});
    setSubmitted(false);
    setQuizWarning("");
  }

  const profileContent = (
    <>
      <h3 className="side-heading">Workspace Scope</h3>
      <div className="side-list">
        <div className="side-item"><strong>Course</strong><span>{currentCourse ? `${currentCourse.code} ${currentCourse.name}` : "Not selected"}</span></div>
        <div className="side-item"><strong>Materials</strong><span>{selectedMaterials.length ? `${selectedMaterials.length} selected` : "Not selected"}</span></div>
        <div className="side-item"><strong>Summary Uses</strong><span>{summaryUses}</span></div>
        <div className="side-item"><strong>Q&A Uses</strong><span>{qaUses}</span></div>
      </div>
    </>
  );

  return (
    <StudentLayout
      profileProps={{
        title: "Study Workspace",
        initials: "AI",
        name: currentCourse?.code || "Select Course",
        subtitle: "Summary, Q&A, and Quiz use selected course materials.",
      }}
      profileContent={profileContent}
    >
      <Toolbar value={search} onChange={setSearch} placeholder="Search materials in current course..." />
      <header className="workspace-header">
        <h1>Study Workspace</h1>
        <p>Choose a course and the materials Summary, Q&A, and Quiz should use.</p>
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
      </div>

      <section className="user-card materials-ai-panel">
        <div className="materials-ai-header">
          <div>
            <p className="summary-source">Current course only</p>
            <h2>Materials for AI</h2>
          </div>
          <div className="materials-ai-actions">
            <button type="button" onClick={selectAllMaterials} disabled={!courseMaterials.length}>
              Select All
            </button>
            <button type="button" onClick={clearAllMaterials} disabled={!courseMaterials.length}>
              Clear All
            </button>
          </div>
        </div>

        {courseMaterials.length ? (
          <>
            <div className="materials-ai-list">
              {filteredMaterials.map((material) => (
                <label className="material-check-row" key={material.id}>
                  <input
                    type="checkbox"
                    checked={isMaterialSelected(material.id)}
                    onChange={() => toggleMaterial(material.id)}
                  />
                  <span>{material.name}</span>
                  <strong>{material.type}</strong>
                </label>
              ))}
            </div>
            {!filteredMaterials.length && (
              <div className="empty-state">No matching materials in this course.</div>
            )}
            <p className="materials-selected-count">
              Selected: {selectedMaterials.length} material{selectedMaterials.length === 1 ? "" : "s"}
            </p>
          </>
        ) : (
          <div className="empty-state">No materials available. Please upload materials first.</div>
        )}
      </section>

      {currentCourse && courseMaterials.length > 0 && !selectedMaterials.length && (
        <div className="state-banner error">
          <AlertCircle size={16} />
          Please select at least one material before using Summary, Q&A, or Quiz.
        </div>
      )}

      <div className="workspace-tabs">
        {modeLabels.map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            className={mode === key ? "active" : ""}
            onClick={() => setMode(key)}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {mode === "summary" && (
        <section className="user-card workspace-panel">
          <div className="panel-title-row">
            <div>
              <p className="summary-source">{materialSourceLabel}</p>
              <h2>Generate Summary</h2>
            </div>
            <button
              className="primary-button"
              type="button"
              disabled={!canUseAI || summaryState === "loading"}
              onClick={generateSummary}
            >
              {summaryState === "loading" ? "Generating..." : summaryState === "success" ? "Regenerate" : "Generate Summary"}
            </button>
          </div>
          <p className="demo-warning">AI content shown here is mock demo data only.</p>
          {summaryState === "idle" && <div className="empty-state">No summary generated yet.</div>}
          {summaryState === "loading" && <div className="state-banner">Loading mock summary...</div>}
          {summaryState === "error" && (
            <div className="state-banner error">
              {summaryError}
              <button type="button" onClick={generateSummary}>Retry</button>
            </div>
          )}
          {summaryState === "success" && (
            <div className="summary-result">
              <p>{mockSummary.paragraph}</p>
              <h3>Key Concepts</h3>
              <div className="key-concepts">
                {mockSummary.concepts.map((concept) => <span key={concept}>{concept}</span>)}
              </div>
            </div>
          )}
        </section>
      )}

      {mode === "qa" && (
        <section className="user-card workspace-panel">
          <div className="panel-title-row">
            <div>
              <p className="summary-source">{materialSourceLabel}</p>
              <h2>Q&A Chat</h2>
            </div>
          </div>
          <p className="demo-warning">Q&A uses the selected course materials. The AIChatBox component is kept as the active chat interface.</p>
          <AIChatBox selectedMaterials={selectedMaterials} currentCourse={currentCourse} />
        </section>
      )}

      {mode === "quiz" && (
        <section className="user-card workspace-panel">
          <div className="panel-title-row">
            <div>
              <p className="summary-source">{materialSourceLabel}</p>
              <h2>Quiz</h2>
            </div>
            {submitted && (
              <div className="score-card">
                <CheckCircle2 size={18} /> {scorePercent}% ({scoreCount}/{quizQuestions.length})
              </div>
            )}
          </div>
          <p className="demo-warning">Quiz questions are fixed mock data, but answer selection and scoring are real.</p>

          {!submitted ? (
            <div className="quiz-card">
              <div className="quiz-counter">Question {quizIndex + 1} of {quizQuestions.length}</div>
              <h3>{currentQuestion.question}</h3>
              <div className="quiz-options">
                {currentQuestion.options.map((option, optionIndex) => (
                  <label
                    key={option}
                    className={answers[currentQuestion.id] === optionIndex ? "selected" : ""}
                  >
                    <input
                      type="radio"
                      name={`question-${currentQuestion.id}`}
                      checked={answers[currentQuestion.id] === optionIndex}
                      onChange={() =>
                        setAnswers((current) => ({ ...current, [currentQuestion.id]: optionIndex }))
                      }
                      disabled={!canUseAI}
                    />
                    {option}
                  </label>
                ))}
              </div>
              {quizWarning && <p className="form-error">{quizWarning}</p>}
              <div className="quiz-actions">
                <button type="button" disabled={quizIndex === 0} onClick={() => setQuizIndex((index) => index - 1)}>
                  Previous
                </button>
                <button
                  type="button"
                  disabled={quizIndex === quizQuestions.length - 1}
                  onClick={() => setQuizIndex((index) => index + 1)}
                >
                  Next
                </button>
                <button className="primary-button" type="button" disabled={!canUseAI} onClick={submitQuiz}>
                  Submit
                </button>
              </div>
            </div>
          ) : (
            <div className="quiz-review">
              {quizQuestions.map((item) => (
                <article key={item.id}>
                  <h3>{item.question}</h3>
                  <p><strong>Your answer:</strong> {item.options[answers[item.id]]}</p>
                  <p><strong>Correct answer:</strong> {item.options[item.answerIndex]}</p>
                  <p><strong>Explanation:</strong> {item.explanation}</p>
                </article>
              ))}
              <button className="primary-button" type="button" onClick={retakeQuiz}>
                <RotateCcw size={16} /> Retake Quiz
              </button>
            </div>
          )}
        </section>
      )}
    </StudentLayout>
  );
}
