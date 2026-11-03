import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { act, create } from "react-test-renderer";
import { loadSource } from "./helpers.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const courses = [
  { id: "course-a", code: "CS101", name: "Computer Science" },
  { id: "course-b", code: "BIO202", name: "Biology" },
];
const materials = [
  { id: 101, course_id: "course-a", name: "Lecture notes.txt" },
  { id: 102, course_id: "course-a", name: "Lecture discussion.md" },
  { id: 103, course_id: "course-a", name: "Lecture practice.pdf" },
  { id: 201, course_id: "course-b", name: "Seminar cards.txt" },
  { id: 202, course_id: "course-b", name: "Seminar assessment.txt" },
];
const record = (id, kind, course, payload) => ({ id, kind, owner_id: 1, course_id: course, created_at: "2026-10-30T10:00:00Z", payload });
const summary = record("summary", "summary", "course-a", {
  selectedMaterialIds: [101], summary: { paragraph: "Schedulers distribute processor time.", concepts: ["Round robin scheduling"] },
});
const chat = [
  ["qa-q1", "User", "Explain cache memory."],
  ["qa-a1", "AI", "A cache stores recent information."],
  ["qa-q2", "User", "How does eviction work in the follow-up example?"],
  ["qa-a2", "AI", "The least recently used entry is removed."],
].map(([id, role, text], messageOrder) => record(id, "qa", "course-a", {
  selectedMaterialIds: [102], role, text, conversationId: "conversation-1", scopeKey: "course-a-scope", messageOrder,
}));
const quiz = (id, course, material, answer) => record(id, "quiz", course, {
  selectedMaterialIds: [material], score: answer === 0 ? 100 : 0,
  questions: [{ id: 1, question: "Which capacity grows?", options: ["Throughput", "Latency"], answerIndex: 0, explanation: "Parallel workers handle more requests." }],
  answers: { 1: answer },
});
const wrongQuiz = quiz("wrong-quiz", "course-a", 103, 1);
const correctQuiz = quiz("correct-quiz", "course-b", 202, 0);
const flashcards = record("cards", "flashcards", "course-b", {
  sourceFileId: 201, cards: [{ front: "What is a mitochondrion?", back: "An organelle involved in cellular respiration.", source: "Chapter seven" }],
});
const allRecords = [summary, ...chat, wrongQuiz, correctQuiz, flashcards];

function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const text = node => typeof node === "string" ? node : (node?.children || []).map(text).join("");
const rows = app => app.renderer.root.findAllByProps({ className: "history-record-open" });
const button = (app, label) => {
  const found = app.renderer.root.findAllByType("button").find(node => text(node) === label);
  assert.ok(found, `Expected button: ${label}`);
  return found;
};
const search = (app, value) => act(async () => {
  app.renderer.root.findByProps({ id: "history-search" }).props.onChange({ target: { value } });
});
const select = (app, index, value) => act(async () => {
  app.renderer.root.findAllByType("select")[index].props.onChange({ target: { value } });
});

async function setup(t, { review = false } = {}) {
  const state = freeze(structuredClone({ records: allRecords, reviews: [], deletedRecords: [], sourceMaterials: materials }));
  const original = JSON.stringify(state);
  const calls = [];
  const { default: History } = await loadSource("export { default } from './src/pages/student/HistoryPage.jsx';", {
    "../../layouts/StudentLayout": ({ children }) => React.createElement("main", null, children),
    "../../components/HistoryRecordDialog": ({ children, onClose }) => React.createElement("section", { role: "dialog" },
      React.createElement("button", { type: "button", onClick: onClose }, "Close"), children),
    "../../state/LanguageContext": { useLanguage: () => ({ language: "en" }) },
    "../../state/AppDataContext": { useAppData: () => ({ studentCourses: courses, studentMaterials: [], summaryRecords: [], currentChatRecords: [], quizAttempts: [] }) },
    "../../services/apiClient": { apiRequest: async (url, options = {}) => {
      calls.push({ url, method: options.method || "GET" });
      assert.equal(url, "/history");
      assert.equal(options.method || "GET", "GET", "Searching and filtering must not write history");
      return state;
    } },
  });
  let renderer;
  await act(async () => { renderer = create(React.createElement(History, { review })); });
  t.after(() => act(() => renderer.unmount()));
  return { renderer, state, original, calls };
}

test("history matching searches all learning formats, follow-ups, source names and course labels without mutating records", async () => {
  const { historyMatchesQuery, groupQAHistory } = await loadSource(`
    export { historyMatchesQuery } from './src/utils/historySearch.js';
    export { groupQAHistory } from './src/utils/qaHistory.js';
  `);
  const records = freeze(structuredClone(allRecords));
  const original = JSON.stringify(records);
  const conversation = groupQAHistory(records).find(item => item.messageRecords);
  for (const [item, queries] of [
    [records[0], ["  SCHEDULERS  ", "round robin", "lecture NOTES", "CS101", "computer science"]],
    [conversation, ["cache memory", "eviction", "least recently used", "lecture discussion"]],
    [records.find(item => item.id === "wrong-quiz"), ["capacity", "THROUGHPUT", "parallel workers", "lecture practice"]],
    [records.find(item => item.id === "cards"), ["mitochondrion", "cellular respiration", "chapter seven", "seminar cards", "Biology", "BIO202"]],
  ]) {
    for (const query of queries) assert.equal(historyMatchesQuery(item, query, materials, courses), true, query);
    assert.equal(historyMatchesQuery(item, "no such keyword", materials, courses), false);
    assert.equal(historyMatchesQuery(item, "   ", materials, courses), true);
  }
  assert.equal(historyMatchesQuery(records[0], "Seminar cards", materials, courses), false);
  assert.equal(historyMatchesQuery(records[0], "Unrelated secret filename", [{ id: 101, course_id: "course-b", name: "Unrelated secret filename" }], courses), false);
  assert.equal(JSON.stringify(records), original);
});

test("search uses server source metadata and combines with course and type filters; clearing never changes saved history", async (t) => {
  const app = await setup(t);
  assert.equal(rows(app).length, 5);
  await search(app, "Lecture");
  assert.equal(rows(app).length, 3, "Source names come from GET /history even when studentMaterials is empty");
  await select(app, 0, "course-b");
  assert.equal(rows(app).length, 0);
  assert.match(JSON.stringify(app.renderer.toJSON()), /No records match your search/);
  await select(app, 0, "course-a");
  await select(app, 1, "summary");
  assert.equal(rows(app).length, 1);
  await act(async () => { button(app, "Clear search").props.onClick(); });
  assert.equal(app.renderer.root.findByProps({ id: "history-search" }).props.value, "");
  assert.equal(rows(app).length, 1, "Clearing search keeps the chosen course and type filters");
  await select(app, 1, "All");
  assert.equal(rows(app).length, 3);
  await select(app, 0, "All");
  assert.equal(rows(app).length, 5);
  await search(app, "BIO202");
  assert.equal(rows(app).length, 2);
  await search(app, "Lecture notes");
  assert.equal(rows(app).length, 1);
  await act(async () => { rows(app)[0].props.onClick(); });
  assert.match(JSON.stringify(app.renderer.toJSON()), /Schedulers distribute processor time/);
  assert.equal(JSON.stringify(app.state), app.original);
  assert.deepEqual(app.calls, [{ url: "/history", method: "GET" }]);
});

test("a follow-up keyword retains the whole Q&A conversation and clearing restores all record types", async (t) => {
  const app = await setup(t);
  await search(app, "eviction");
  assert.equal(rows(app).length, 1);
  await act(async () => { rows(app)[0].props.onClick(); });
  const messages = app.renderer.root.findAllByProps({ className: "history-qa-message" });
  assert.equal(messages.length, 4);
  assert.deepEqual(messages.map(node => node.findByType("p").children.join("")), chat.map(item => item.payload.text));
  await search(app, "least recently used");
  assert.equal(rows(app).length, 1);
  assert.equal(app.renderer.root.findAllByProps({ role: "dialog" }).length, 0);
  await select(app, 1, "quiz");
  assert.equal(rows(app).length, 0, "A Q&A match must not bypass the record-type filter");
  await select(app, 1, "All");
  await act(async () => { button(app, "Clear search").props.onClick(); });
  assert.equal(rows(app).length, 5);
  assert.equal(JSON.stringify(app.state), app.original);
  assert.deepEqual(app.calls, [{ url: "/history", method: "GET" }]);
});

test("Review Centre search combines with wrong-only, retake-all and course filters without altering original answers", async (t) => {
  const app = await setup(t, { review: true });
  await search(app, "capacity");
  assert.equal(rows(app).length, 1, "Default wrong-only mode excludes an entirely correct quiz");
  await select(app, 1, "all");
  assert.equal(rows(app).length, 2);
  await select(app, 0, "course-b");
  assert.equal(rows(app).length, 1);
  await select(app, 1, "wrong");
  assert.equal(rows(app).length, 0);
  await act(async () => { button(app, "Clear search").props.onClick(); });
  assert.equal(rows(app).length, 0, "Clear search must preserve wrong-only and course filters");
  await select(app, 0, "All");
  assert.equal(rows(app).length, 1);
  await search(app, "Lecture practice");
  assert.equal(rows(app).length, 1);
  assert.equal(JSON.stringify(app.state), app.original);
  assert.deepEqual(app.calls, [{ url: "/history", method: "GET" }]);
});
