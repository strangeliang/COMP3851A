import AIChatBox from "../../components/AIChatBox";
import AIServiceStatus from "../../components/AIServiceStatus";
import MaterialSourcePreview from "../../components/MaterialSourcePreview";
import CopySummaryButton from "../../components/CopySummaryButton";
import { indices, correctIndices, isMultiple, validAnswer, isCorrect, toggleAnswer, answerText } from "../../../shared/quiz.mjs";
import {
  AlertCircle,
  BookOpenText,
  CheckCircle2,
  Layers,
  MessageCircleQuestion,
  RotateCcw,
  Sparkles,
  Lightbulb,
  MousePointerClick,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Toolbar from "../../components/Toolbar";
import StudentLayout from "../../layouts/StudentLayout";
import { useAppData } from "../../state/AppDataContext";
import useAIRequest from "../../hooks/useAIRequest";
import useWorkspaceState from "../../hooks/useWorkspaceState";
import useStudyPreferences from "../../hooks/useStudyPreferences";
import { useLanguage } from "../../state/LanguageContext";
import "./QuizPanel.css";
import "./FlashcardsPanel.css";
import { courseLabel } from "../../utils/courseDisplay";
import {
  generateAISummary,
  generateAIQuiz,
  generateAIFlashcards,
} from "../../services/aiService";
import {
  limits,
  materialIsIncomplete,
  sameId,
  selectionError,
} from "../../utils/studyScope";

const modeLabels = [
  ["summary", "Summary", BookOpenText],
  ["qa", "Q&A", MessageCircleQuestion],
  ["quiz", "Quiz", Sparkles],
  ["flashcards", "Flashcards", Layers],
];

function SummaryPanel({ canUseAI, materialSourceLabel }) {
  const {
    selectedMaterials,
    recordSummaryUse,
    scope,
  } = useAppData();

  const request = useAIRequest(scope.scopeKey, "summary", { retainData: true });
  const summary = request.data;

  async function generate() {
    if (!canUseAI || request.pending) return;

    const result = await request.run((signal) =>
      generateAISummary({
        materials: selectedMaterials,
        signal,
      })
    );

    if (result) {
      recordSummaryUse(result, scope);
    }
  }

  return (
    <section className="user-card workspace-panel">
      <div className="panel-title-row">
        <div>
          <p className="summary-source">{materialSourceLabel}</p>
          <h2>Generate Summary</h2>
        </div>

        <button
          className="primary-button"
          type="button"
          disabled={!canUseAI || request.pending}
          onClick={generate}
        >
          {request.pending
            ? "Generating…"
            : summary
            ? "Regenerate"
            : "Generate Summary"}
        </button>
      </div>

      <p className="demo-warning">
        Summaries use the selected materials. Check important details against the
        original sources.
      </p>

      {request.pending && (
        <div className="state-banner" role="status">
          Gemini is reading your materials…
          <button type="button" onClick={request.cancel}>
            Stop generating
          </button>
        </div>
      )}

      {request.error && (
        <div className="state-banner error" role="alert">
          {request.error}
        </div>
      )}

      {!summary && !request.pending && !request.error && (
        <div className="empty-state">
          No summary generated for these materials yet.
        </div>
      )}

      {summary && (
        <div className="summary-result" aria-live="polite">
          <CopySummaryButton key={scope.scopeKey} summary={summary} materials={selectedMaterials} />
          <p style={{ whiteSpace: "pre-wrap" }}>{summary.paragraph}</p>

          <h3>Key Concepts</h3>

          <div className="key-concepts">
            {summary.concepts.map((concept, index) => (
              <span key={index}>{concept}</span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function QuizPanel({ canUseAI, materialSourceLabel }) {
  const { selectedMaterials, saveQuizAttempt, scope } = useAppData();
  const [preferences] = useStudyPreferences();
  const { language } = useLanguage();
  const t = (en, zh) => language === "zh" ? zh : en;

  const request = useAIRequest(scope.scopeKey, "quiz", { retainData: true });

  const questions = request.data?.questions || [];

  const [index, setIndex] = useWorkspaceState(`quiz-index:${scope.scopeKey}`, 0);
  const [answers, setAnswers] = useWorkspaceState(`quiz-answers:${scope.scopeKey}`, {});
  const [submitted, setSubmitted] = useWorkspaceState(`quiz-submitted:${scope.scopeKey}`, false);
  const [warning, setWarning] = useState("");
  const [difficulty, setDifficulty] = useWorkspaceState(`quiz-difficulty:${scope.scopeKey}`, preferences.quizDifficulty);
  const [questionCount, setQuestionCount] = useWorkspaceState(`quiz-count:${scope.scopeKey}`, "5");
  const [quizType, setQuizType] = useWorkspaceState(`quiz-type:${scope.scopeKey}`, "mixed");
  const countValid = /^\d+$/.test(String(questionCount)) && Number(questionCount) >= 1 && Number(questionCount) <= 20;
  const typeValid = ["single", "multiple", "mixed"].includes(quizType);
  const mixedCountValid = quizType !== "mixed" || Number(questionCount) >= 2;
  const settingsValid = countValid && typeValid && mixedCountValid;

  const submittedRef = useRef(submitted);

  const complete =
    questions.length > 0 &&
    questions.every((question) =>
      validAnswer(question, answers[question.id])
    );

  const correct = questions.reduce(
    (sum, question) =>
      sum +
      (isCorrect(question, answers[question.id]) ? 1 : 0),
    0
  );

  const score = questions.length
    ? Math.round((correct / questions.length) * 100)
    : 0;

  const activeIndex = Math.min(Math.max(Number.isInteger(index) ? index : 0, 0), Math.max(0, questions.length - 1));
  const question = questions[activeIndex];
  const answeredCount = questions.filter(item => validAnswer(item, answers[item.id])).length;

  function resetAnswers() {
    setIndex(0);
    setAnswers({});
    setSubmitted(false);
    setWarning("");
    submittedRef.current = false;
  }

  async function generate() {
    if (!canUseAI || request.pending) return;
    if (!settingsValid) return;
    if (questions.length && !window.confirm(t(
      "Generate a new Quiz? The current questions and answers will be replaced only after the new Quiz is ready. Saved results in Study History are kept.",
      "生成新测验？新题目生成成功后才会替换当前题目与答案，学习历史中的已保存成绩会保留。",
    ))) return;

    const result = await request.run((signal) =>
      generateAIQuiz({
        materials: selectedMaterials,
        difficulty,
        questionCount: Number(questionCount),
        quizType,
        signal,
      })
    );
    if (result) resetAnswers();
  }

  function submit() {
    if (submittedRef.current || request.pending) return;

    if (!complete) {
      setWarning("Please answer every question before submitting.");
      return;
    }

    submittedRef.current = true;
    setSubmitted(true);
    setWarning("");

    saveQuizAttempt(
      {
        score,
        total: questions.length,
        correct,
        answers,
        questions,
        quizType: request.data?.quizType,
        mode: "api",
      },
      scope
    );
  }

  return (
    <section className="user-card workspace-panel">
      <div className="panel-title-row">
        <div>
          <p className="summary-source">{materialSourceLabel}</p>
          <h2>Quiz</h2>
        </div>

        {submitted && (
          <div className="score-card">
            <CheckCircle2 size={18} />
            {score}% ({correct}/{questions.length})
          </div>
        )}

        <label className="user-field" style={{ minWidth: 140 }}>
          Number of questions (1–20)
          <input type="number" min="1" max="20" step="1" required
            aria-label="Number of questions (1–20)" aria-invalid={!countValid || !mixedCountValid}
            value={questionCount} disabled={request.pending}
            onChange={(event) => setQuestionCount(event.target.value)} />
        </label>

        <label className="user-field quiz-type-field" style={{ minWidth: 170 }} data-react-i18n>
          {t("Question type", "题型")}
          <select aria-label="Question type" value={quizType} disabled={request.pending}
            onChange={(event) => setQuizType(event.target.value)}>
            <option value="single">{t("Single answer", "单选题")}</option>
            <option value="multiple">{t("Multiple answers", "多选题")}</option>
            <option value="mixed">{t("Mixed", "混合题型")}</option>
          </select>
        </label>

        <label
          className="user-field"
          style={{ minWidth: 140 }}
        >
          Difficulty

          <select
            value={difficulty}
            onChange={(event) =>
              setDifficulty(event.target.value)
            }
            disabled={request.pending}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>

        <button
          className="primary-button"
          type="button"
          onClick={generate}
          disabled={!canUseAI || request.pending || !settingsValid}
        >
          {request.pending
            ? "Generating…"
            : questions.length
            ? "Generate New Quiz"
            : "Generate Quiz"}
        </button>
      </div>

      <p className="demo-warning" data-react-i18n>
        {t("Choose a question type and 1–20 questions (at least 2 for Mixed). Single-answer questions have one correct option; multiple-answer questions have two or three. Select all correct options; no partial credit. Check AI explanations against the sources.", "请选择题型和 1–20 道题（混合题型至少 2 道）。单选题有 1 个正确答案，多选题有 2–3 个正确答案。多选题必须选全且无错选才得分。请对照原资料核对 AI 解析。")}
      </p>
      {!countValid && <p className="form-error" role="alert">Enter a whole number of questions from 1 to 20.</p>}
      {countValid && !mixedCountValid && <p className="form-error" role="alert" data-react-i18n>{t("Mixed quizzes need at least 2 questions. Choose Single answer or Multiple answers for a one-question quiz.", "混合题型至少需要 2 道题。生成 1 道题时，请选择单选题或多选题。")}</p>}
      {settingsValid && !questions.length && <p className="quiz-selection-count" data-react-i18n>{t(`Selected: ${questionCount} questions. Generate Quiz to begin.`, `已选择 ${questionCount} 道题，生成测验后即可开始。`)}</p>}

      {request.pending && (
        <div className="state-banner" role="status">
          Generating questions…
          <button type="button" onClick={request.cancel}>
            Stop generating
          </button>
        </div>
      )}

      {request.error && (
        <div className="state-banner error" role="alert">
          {request.error}
        </div>
      )}

      {!questions.length &&
        !request.pending &&
        !request.error && (
          <div className="empty-state">
            Generate a quiz to start practising.
          </div>
        )}

      {question && !submitted && (
        <div className="quiz-card">
          <div className="quiz-counter">
            Question {activeIndex + 1} of {questions.length}
          </div>

          <h3>{question.question}</h3>
          <p>{isMultiple(question) ? "Multiple answers — select all that apply" : "Single answer — select one option"}</p>

          <div className="quiz-options">
            {question.options.map(
              (option, optionIndex) => (
                <label
                  key={optionIndex}
                  className={
                    indices(answers[question.id]).includes(optionIndex)
                      ? "selected"
                      : ""
                  }
                >
                  <input
                    disabled={request.pending}
                    type={isMultiple(question) ? "checkbox" : "radio"}
                    name={`question-${question.id}`}
                    checked={
                      indices(answers[question.id]).includes(optionIndex)
                    }
                    onChange={() =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: toggleAnswer(question, current[question.id], optionIndex),
                      }))
                    }
                  />
                  {option}
                </label>
              )
            )}
          </div>

          {warning && (
            <p className="form-error" role="alert">
              {warning}
            </p>
          )}

          <div className="quiz-actions">
            <div className="quiz-navigation" data-react-i18n>
              <p role="status">{t(`${answeredCount}/${questions.length} answered · ${questions.length - answeredCount} remaining`, `已答 ${answeredCount}/${questions.length} 题 · 剩余 ${questions.length - answeredCount} 题`)}</p>
              <nav className="quiz-question-dots" aria-label={t("Jump to a question", "跳转到题目")}>{questions.map((item, questionIndex) => {
                const answered = validAnswer(item, answers[item.id]);
                return <button key={item.id} type="button" disabled={request.pending} className={`quiz-question-dot${answered ? " answered" : ""}${questionIndex === activeIndex ? " current" : ""}`} aria-current={questionIndex === activeIndex ? "step" : undefined} aria-label={t(`Question ${questionIndex + 1}: ${answered ? "answered" : "not answered"}`, `第 ${questionIndex + 1} 题：${answered ? "已答" : "未答"}`)} title={t(`Question ${questionIndex + 1}: ${answered ? "answered" : "not answered"}`, `第 ${questionIndex + 1} 题：${answered ? "已答" : "未答"}`)} onClick={() => setIndex(questionIndex)}>{questionIndex + 1}</button>;
              })}</nav>
              <small>{t("Filled = answered · Outline = not answered. Click a number to jump.", "实心表示已答，空心表示未答，点击编号可跳转。")}</small>
            </div>
            <div className="quiz-navigation-actions">
            {activeIndex > 0 && <button
              type="button"
              disabled={request.pending}
              onClick={() =>
                setIndex(activeIndex - 1)
              }
            >
              Previous
            </button>}

            {activeIndex < questions.length - 1 && <button
              type="button"
              disabled={request.pending}
              onClick={() =>
                setIndex(activeIndex + 1)
              }
            >
              Next
            </button>}

            <button
              className="primary-button"
              type="button"
              disabled={request.pending}
              onClick={submit}
            >
              Submit
            </button>
            </div>
          </div>
        </div>
      )}

      {submitted && (
        <div className="quiz-review">
          {questions.map((item, questionIndex) => (
            <article key={item.id} className={`quiz-result-card ${isCorrect(item, answers[item.id]) ? "quiz-result-correct" : "quiz-result-incorrect"}`}>
              <h3>{questionIndex + 1}. {item.question}</h3>
              <p className="quiz-result-status"><strong>{isCorrect(item, answers[item.id]) ? "Correct" : "Incorrect"}</strong></p>

              <p>
                <strong>Your answer:</strong>{" "}
                {answerText(item, answers[item.id])}
              </p>

              <p>
                <strong>Correct answer:</strong>{" "}
                {answerText(item, correctIndices(item))}
              </p>

              <p>
                <strong>Explanation:</strong>{" "}
                {item.explanation}
              </p>
            </article>
          ))}

          <button
            className="primary-button"
            type="button"
            disabled={request.pending}
            onClick={resetAnswers}
          >
            <RotateCcw size={16} />
            Retake Quiz
          </button>
        </div>
      )}
    </section>
  );
}

function FlashcardsPanel({
  canUseAI,
  materialSourceLabel,
}) {
  const { selectedMaterials, scope, persistStudy } =
    useAppData();
  const { language } = useLanguage();
  const t = (en, zh) => language === "zh" ? zh : en;

  const request = useAIRequest(scope.scopeKey, "flashcards", { retainData: true });

  const legacyCards = Boolean(request.data?.cards && request.data.cards.length !== 6);
  const cards = request.data?.cards?.length === 6 ? request.data.cards : [];

  const [flipped, setFlipped] =
    useWorkspaceState(`flashcards-flipped:${scope.scopeKey}`, {});
  const batchId = request.data?.revisionBatchId || "existing";
  const [progress, setProgress] = useWorkspaceState(`flashcards-progress:${scope.scopeKey}`, { batchId: "", mastered: {}, onlyReview: false });
  const activeProgress = progress.batchId === batchId ? progress : { mastered: {}, onlyReview: false };
  const masteredCount = cards.filter(card => activeProgress.mastered[card.id]).length;
  const visibleCards = cards.map((card, cardIndex) => ({ card, cardIndex }))
    .filter(({ card }) => !activeProgress.onlyReview || !activeProgress.mastered[card.id]);
  function updateProgress(update) {
    setProgress(current => ({ batchId, ...update(current.batchId === batchId ? current : { mastered: {}, onlyReview: false }) }));
  }

  async function generate() {
    if (!canUseAI || request.pending) return;

    const result = await request.run(async (signal) => {
      const generated = await generateAIFlashcards({
        materials: selectedMaterials,
        previousCards: cards.map(({ front, back }) => ({ front, back })),
        signal,
      });
      if (generated.cards?.length !== 6) throw new Error("The Flashcards service returned an outdated format. Please refresh the page or contact support.");
      return { ...generated, revisionBatchId: crypto.randomUUID() };
    });
    if (result) {
      setFlipped({});
      persistStudy("flashcards", result, scope);
    }
  }

  return (
    <section className="user-card workspace-panel flashcards-panel">
      <div className="panel-title-row">
        <div>
          <p className="summary-source">
            {materialSourceLabel}
          </p>

          <h2><Layers size={22} aria-hidden="true" /> AI Flashcards</h2>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={generate}
          disabled={!canUseAI || request.pending}
        >
          {request.pending
            ? "Generating…"
            : cards.length
            ? "Generate New Cards"
            : "Generate Flashcards"}
        </button>
      </div>

      <p className="demo-warning">
        Generate six revision cards from the selected
        materials. Click a card to reveal its answer.
      </p>
      {legacyCards && <p className="state-banner" role="status">These cards were generated by an older version. Generate Flashcards again to get six cards.</p>}

      {request.pending && (
        <div
          className="state-banner"
          role="status"
        >
          Generating flashcards…
          <button
            type="button"
            onClick={request.cancel}
          >
            Stop generating
          </button>
        </div>
      )}

      {request.error && (
        <div
          className="state-banner error"
          role="alert"
        >
          {request.error}
        </div>
      )}

      {!cards.length &&
        !request.pending &&
        !request.error && (
          <div className="empty-state">
            Generate flashcards to start revising.
          </div>
        )}

      {!!cards.length && (
        <div className="flashcard-progress" data-react-i18n>
          <p role="status">{t(`Mastered ${masteredCount} / ${cards.length} · To review ${cards.length - masteredCount}`, `已掌握 ${masteredCount} / ${cards.length} · 待复习 ${cards.length - masteredCount}`)}</p>
          <label><input type="checkbox" checked={activeProgress.onlyReview} disabled={request.pending}
            onChange={event => updateProgress(current => ({ ...current, onlyReview: event.target.checked }))} />{t("Only show cards to review", "只看待复习")}</label>
        </div>
      )}
      {!!cards.length && !visibleCards.length && <div className="empty-state" data-react-i18n>
        <p>{t("All cards in this set are marked as mastered.", "这组卡片已全部标记为掌握。")}</p>
        <button type="button" disabled={request.pending} onClick={() => updateProgress(current => ({ ...current, onlyReview: false }))}>{t("Show all cards", "查看全部卡片")}</button>
      </div>}
      {!!visibleCards.length && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "14px",
          }}
        >
          {visibleCards.map(({ card, cardIndex }) => {
            const isFlipped = Boolean(
              flipped[card.id]
            );

            return (
              <article key={card.id} className="flashcard-item">
              <button
                type="button"
                className={`revision-flashcard${isFlipped ? " is-flipped" : ""}`}
                aria-pressed={isFlipped}
                onClick={() =>
                  setFlipped((current) => ({
                    ...current,
                    [card.id]:
                      !current[card.id],
                  }))
                }
                style={{
                  minHeight: 180,
                  padding: "20px",
                  textAlign: "left",
                  border:
                    "1px solid #d8dcf8",
                  borderRadius: "16px",
                  background: isFlipped
                    ? "#eef2ff"
                    : "#ffffff",
                  color: "#1f2937",
                  cursor: "pointer",
                }}
              >
                <span className="flashcard-topline"><span className="flashcard-number"><Layers size={14} aria-hidden="true" /> {cardIndex + 1} / {cards.length}</span><span className="summary-source">
                  {card.source}
                </span></span>

                <h3
                  style={{
                    margin: "12px 0 8px",
                  }}
                >
                  {isFlipped ? <Lightbulb size={18} aria-hidden="true" /> : <MessageCircleQuestion size={18} aria-hidden="true" />}
                  {isFlipped
                    ? "Back"
                    : "Front"}
                </h3>

                <p
                  style={{
                    whiteSpace: "pre-wrap",
                    margin: 0,
                  }}
                >
                  <MousePointerClick size={14} aria-hidden="true" />
                  {isFlipped
                    ? card.back
                    : card.front}
                </p>

                <small
                  style={{
                    display: "block",
                    marginTop: "18px",
                    color: "#6366f1",
                  }}
                >
                  {isFlipped
                    ? "Click to show the front"
                    : "Click to reveal the answer"}
                </small>
              </button>
              <div className="flashcard-mastery-actions" data-react-i18n>
                <span>{activeProgress.mastered[card.id] ? t("Mastered", "已掌握") : t("To review", "待复习")}</span>
                <button type="button" disabled={request.pending} aria-pressed={Boolean(activeProgress.mastered[card.id])}
                  aria-label={activeProgress.mastered[card.id]
                    ? t(`Review card ${cardIndex + 1} again`, `再次复习第 ${cardIndex + 1} 张卡片`)
                    : t(`Mark card ${cardIndex + 1} as mastered`, `标记第 ${cardIndex + 1} 张卡片为已掌握`)}
                  onClick={() => updateProgress(current => ({ ...current, mastered: { ...current.mastered, [card.id]: !current.mastered[card.id] } }))}>
                  {activeProgress.mastered[card.id] ? t("Review again", "再复习") : t("Mark as mastered", "标记已掌握")}
                </button>
              </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function StudyWorkspacePage() {
  const { language } = useLanguage();
  const t = (en, zh) => language === "zh" ? zh : en;
  const [params, setParams] =
    useSearchParams();

  const mode = [
    "summary",
    "qa",
    "quiz",
    "flashcards",
  ].includes(params.get("mode"))
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
    aiStatus,
    scope,
    courseState,
    materialState,
    retryCourses,
    retryMaterials,
  } = useAppData();

  const [search, setSearch] =
    useState("");
  const [preview, setPreview] = useState(null);
  useEffect(() => { setPreview(null); }, [scope.scopeKey]);
  const previewMaterial = preview?.scopeKey === scope.scopeKey
    ? selectedMaterials.find(material => sameId(material.id, preview.materialId)) : null;

  const error =
    selectionError(selectedMaterials);

  const canUseAI = Boolean(
    currentCourse &&
      !error &&
      aiStatus.configured
  );

  const selectedCharacters =
    selectedMaterials.reduce(
      (total, material) =>
        total +
        (material.content?.length || 0),
      0
    );

  const materialSourceLabel = selectedMaterials.length ? selectedMaterials.map((material, index) => (
    <span key={material.id}>
      {index > 0 && " · "}
      <button type="button" className="material-source-link"
        aria-label={t(`View source [S${index + 1}]: ${material.name}`, `查看来源 [S${index + 1}]：${material.name}`)}
        onClick={() => setPreview({ materialId: material.id, scopeKey: scope.scopeKey })}>
        [S{index + 1}] {material.name}
      </button>
    </span>
  )) : t("No materials selected", "未选择学习材料");

  const filteredMaterials = useMemo(
    () =>
      courseMaterials.filter((material) =>
        material.name
          .toLowerCase()
          .includes(
            search
              .trim()
              .toLowerCase()
          )
      ),
    [courseMaterials, search]
  );

  const isSelected = (id) =>
    selectedMaterialIds.some((selected) =>
      sameId(selected, id)
    );

  function toggle(id) {
    setSelectedMaterialIds(
      isSelected(id)
        ? selectedMaterialIds.filter(
            (selected) =>
              !sameId(selected, id)
          )
        : [...selectedMaterialIds, id]
    );
  }

  function changeMode(next) {
    setParams((current) => {
      const updated =
        new URLSearchParams(current);

      updated.set("mode", next);

      return updated;
    });
  }

  const profileContent = (
    <>
      <h3 className="side-heading">
        Workspace Scope
      </h3>

      <div className="side-list">
        <div className="side-item">
          <strong>Course</strong>
          <span>
            {currentCourse
              ? courseLabel(currentCourse)
              : "Not selected"}
          </span>
        </div>

        <div className="side-item">
          <strong>Materials</strong>
          <span>
            {selectedMaterials.length}/
            {limits.maxFilesPerAIRequest} selected
          </span>
        </div>

        <div className="side-item">
          <strong>Summary Uses</strong>
          <span>{summaryUses}</span>
        </div>

        <div className="side-item">
          <strong>Q&A Uses</strong>
          <span>{qaUses}</span>
        </div>
      </div>
    </>
  );

  return (
    <StudentLayout
      profileProps={{
        title: "Study Workspace",
        initials: "AI",
        name:
          courseLabel(currentCourse) ||
          "Select Course",
        subtitle:
          "Summary, Q&A, Quiz, and Flashcards use selected course materials.",
      }}
      profileContent={profileContent}
    >
      <Toolbar
        value={search}
        onChange={setSearch}
        placeholder="Search materials in current course..."
      />

      {courseState.loading && (
        <div
          className="state-banner"
          role="status"
        >
          Loading your courses…
        </div>
      )}

      {courseState.error && (
        <div
          className="state-banner error"
          role="alert"
        >
          {courseState.error}
          <button
            type="button"
            onClick={retryCourses}
          >
            Retry
          </button>
        </div>
      )}

      {materialState.loading && (
        <div
          className="state-banner"
          role="status"
        >
          Loading course materials…
        </div>
      )}

      {materialState.error && (
        <div
          className="state-banner error"
          role="alert"
        >
          {materialState.error}
          <button
            type="button"
            onClick={retryMaterials}
          >
            Retry
          </button>
        </div>
      )}

      <header className="workspace-header">
        <h1>Study Workspace</h1>

        <p>
          Choose a course and up to{" "}
          {limits.maxFilesPerAIRequest} materials
          for Summary, Q&A, Quiz, or Flashcards.
        </p>
      </header>

      <div className="control-grid">
        <label className="user-field">
          Current Course

          <select
            value={currentCourseId}
            onChange={(event) =>
              selectCourse(event.target.value)
            }
            disabled={
              courseState.loading ||
              !studentCourses.length
            }
          >
            {!studentCourses.length && (
              <option value="">
                Create a course first
              </option>
            )}

            {studentCourses.map(
              (course) => (
                <option
                  key={course.id}
                  value={course.id}
                >
                  {courseLabel(course)}
                </option>
              )
            )}
          </select>
        </label>
      </div>

      <section className="user-card materials-ai-panel">
        <div className="materials-ai-header">
          <div>
            <p className="summary-source">
              Current course only
            </p>

            <h2>Materials for AI</h2>
          </div>

          <div className="materials-ai-actions">
            <button
              type="button"
              onClick={() =>
                setSelectedMaterialIds(
                  courseMaterials
                    .slice(
                      0,
                      limits.maxFilesPerAIRequest
                    )
                    .map(
                      (material) =>
                        material.id
                    )
                )
              }
              disabled={
                !courseMaterials.length
              }
            >
              {courseMaterials.length >
              limits.maxFilesPerAIRequest
                ? `Select First ${limits.maxFilesPerAIRequest}`
                : "Select All"}
            </button>

            <button
              type="button"
              onClick={() =>
                setSelectedMaterialIds([])
              }
              disabled={
                !selectedMaterials.length
              }
            >
              Clear All
            </button>
          </div>
        </div>

        {courseMaterials.length ? (
          <>
            <div className="materials-ai-list">
              {filteredMaterials.map(
                (material) => (
                  <label
                    className="material-check-row"
                    key={material.id}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected(
                        material.id
                      )}
                      onChange={() =>
                        toggle(material.id)
                      }
                      disabled={
                        !isSelected(
                          material.id
                        ) &&
                        selectedMaterialIds.length >=
                          limits.maxFilesPerAIRequest
                      }
                    />

                    <span>
                      {material.name}
                      {materialIsIncomplete(
                        material
                      )
                        ? " — re-upload required"
                        : ""}
                    </span>

                    <strong>
                      {material.type}
                    </strong>
                  </label>
                )
              )}
            </div>

            {!filteredMaterials.length && (
              <div className="empty-state">
                No matching materials in this
                course.
              </div>
            )}

            <p className="materials-selected-count">
              Selected:{" "}
              {selectedMaterials.length}/
              {limits.maxFilesPerAIRequest} files ·{" "}
              {selectedCharacters.toLocaleString()}
              /
              {limits.maxAIContextCharacters.toLocaleString()}{" "}
              characters
            </p>

            <p className="summary-source">
              If the total is too large, select
              fewer files or split the original
              documents.
            </p>

            {selectedMaterials
              .filter(
                (material) =>
                  material.parseWarning
              )
              .map((material) => (
                <details
                  key={material.id}
                  className="summary-source"
                >
                  <summary>
                    Reading notes:{" "}
                    {material.name}
                  </summary>

                  <p>
                    {material.parseWarning}
                  </p>
                </details>
              ))}
          </>
        ) : (
          !materialState.loading && (
            <div className="empty-state">
              No materials available. Please upload
              materials first.
            </div>
          )
        )}
      </section>

      {error && (
        <div
          className="state-banner error"
          role="alert"
        >
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <AIServiceStatus />

      <div className="workspace-tabs">
        {modeLabels.map(
          ([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              className={
                mode === key ? "active" : ""
              }
              onClick={() =>
                changeMode(key)
              }
            >
              <Icon size={16} />
              {label}
            </button>
          )
        )}
      </div>

      <div hidden={mode !== "summary"}>
        <SummaryPanel
          key={scope.scopeKey}
          canUseAI={canUseAI}
          materialSourceLabel={
            materialSourceLabel
          }
        />
      </div>

      <div hidden={mode !== "qa"}>
        <section className="user-card workspace-panel">
          <div className="panel-title-row">
            <div>
              <p className="summary-source">
                {materialSourceLabel}
              </p>

              <h2>Q&A Chat</h2>
            </div>
          </div>

          <p className="demo-warning">
            Ask follow-up questions about these
            materials. Check references and important
            details against the originals.
          </p>

          <AIChatBox
            key={scope.scopeKey}
            selectedMaterials={
              selectedMaterials
            }
            currentCourse={currentCourse}
            onPreviewSource={(materialId, sourceLabel) => {
              if (selectedMaterials.some(material => sameId(material.id, materialId))) setPreview({ materialId, sourceLabel, scopeKey: scope.scopeKey });
            }}
          />
        </section>
      </div>

      {/* Keep this scoped panel mounted across AI tabs so questions and answers survive. */}
      <div hidden={mode !== "quiz"}>
        <QuizPanel
          key={scope.scopeKey}
          canUseAI={canUseAI}
          materialSourceLabel={
            materialSourceLabel
          }
        />
      </div>

      <div hidden={mode !== "flashcards"}>
        <FlashcardsPanel
          key={scope.scopeKey}
          canUseAI={canUseAI}
          materialSourceLabel={
            materialSourceLabel
          }
        />
      </div>
      {previewMaterial && <MaterialSourcePreview material={previewMaterial}
        sourceLabel={preview.sourceLabel || `[S${selectedMaterials.findIndex(material => sameId(material.id, previewMaterial.id)) + 1}]`}
        onClose={() => setPreview(null)} />}
    </StudentLayout>
  );
}
