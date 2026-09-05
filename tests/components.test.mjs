import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { create, act } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { Message as ActualMessage } from "@chatscope/chat-ui-kit-react";
import { MemoryRouter } from "react-router-dom";
import { loadSource, memoryWindow, deferred, jsonReply } from "./helpers.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const widgets = { ChatContainer: "test-chat", MainContainer: "test-main", Message: "test-message", MessageInput: "test-input", MessageList: "test-list", TypingIndicator: "test-typing" };
const student = { id: 1, name: "Alex Chen", email: "student@example.com", role: "Student", status: "Active" };
const mia = { id: 3, name: "Mia Tan", email: "mia@student.edu", role: "Student", status: "Active" };

async function harness(t, { ai = async () => jsonReply({ answer: "Grounded answer. [S1]", mode: "api" }), courseApi, stored, workspace = false } = {}) {
  const window = memoryWindow(stored ? { "study-companion-app-data": JSON.stringify(stored) } : {});
  const requests = [];
  let sessionUser = null;
  const server = {
    courses: [
      { id: "inft3050", owner_id: 1, code: "INFT3050", name: "Study Companion", created_at: "2026-01-01", updated_at: "2026-01-02" },
      { id: "hci", owner_id: 1, code: "HCI", name: "Prototype Review", created_at: "2026-01-01", updated_at: "2026-01-02" },
      { id: "inft3851a", owner_id: 1, code: "INFT3851A", name: "Study Project", created_at: "2026-01-01", updated_at: "2026-01-02" },
    ],
    materials: [
      { id: 1, course_id: "inft3050", owner_id: 1, name: "lecture_notes.txt", type: "TXT", size_bytes: 1830, status: "Ready", content: "Machine learning is a method that allows computers to learn patterns from data.", created_at: "2026-01-01", updated_at: "2026-01-02" },
      { id: 2, course_id: "inft3050", owner_id: 1, name: "tutorial_outline.md", type: "MD", size_bytes: 940, status: "Ready", content: "# Tutorial Outline\n- AI learning workflow\n- Source file selection\n- Quiz revision", created_at: "2026-01-01", updated_at: "2026-01-02" },
      { id: 3, course_id: "inft3851a", owner_id: 1, name: "project_scope.md", type: "MD", size_bytes: 1500, status: "Ready", content: "# Project Scope\nThis file explains course requirements and prototype scope.", created_at: "2026-01-01", updated_at: "2026-01-02" },
    ],
    nextMaterialId: 4,
  };
  const fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ url, body, options });
    if (url === "/api/auth/me") return sessionUser ? jsonReply({ user: sessionUser }) : jsonReply({ message: "Please log in." }, 401);
    if (url === "/api/auth/login") { sessionUser = body.email === mia.email ? mia : student; return jsonReply({ user: sessionUser }); }
    if (url === "/api/auth/logout") { sessionUser = null; return jsonReply({ ok: true }); }
    if (url === "/api/ai/status") return jsonReply({ configured: true, provider: "Gemini", model: "test-provider" });
    const overridden = await courseApi?.({ url, body, options, server, sessionUser });
    if (overridden) return overridden;
    const method = options.method || "GET";
    const userId = Number(options.headers?.["x-user-id"]);
    if (url === "/api/courses" && method === "GET") {
      return jsonReply({ courses: server.courses.filter((course) => course.owner_id === userId) });
    }
    if (url === "/api/courses" && method === "POST") {
      const course = { id: `created-${server.courses.length + 1}`, owner_id: sessionUser.id, code: body.code, name: body.name, created_at: "2026-01-03", updated_at: "2026-01-03" };
      server.courses.push(course); return jsonReply({ course }, 201);
    }
    const courseMaterials = url.match(/^\/api\/courses\/([^/]+)\/materials$/);
    if (courseMaterials && method === "GET") {
      const courseId = decodeURIComponent(courseMaterials[1]);
      const ownsCourse = server.courses.some((course) => course.id === courseId && course.owner_id === userId);
      return ownsCourse ? jsonReply({ materials: server.materials.filter((material) => material.course_id === courseId && material.owner_id === userId) })
        : jsonReply({ code: "COURSE_NOT_FOUND", message: "This course does not exist or does not belong to you." }, 404);
    }
    if (courseMaterials && method === "POST") {
      const courseId = decodeURIComponent(courseMaterials[1]);
      const material = { id: server.nextMaterialId++, course_id: courseId, owner_id: userId, name: body.name, type: body.type,
        size_bytes: body.sizeBytes, status: "Ready", content: body.content, created_at: "2026-01-03", updated_at: "2026-01-03" };
      server.materials.push(material); return jsonReply({ material }, 201);
    }
    const materialDelete = url.match(/^\/api\/materials\/(\d+)$/);
    if (materialDelete && method === "DELETE") {
      const index = server.materials.findIndex((material) => material.id === Number(materialDelete[1]) && material.owner_id === userId);
      if (index < 0) return jsonReply({ code: "MATERIAL_NOT_FOUND", message: "This material does not exist or does not belong to you." }, 404);
      server.materials.splice(index, 1); return jsonReply({ ok: true });
    }
    const courseDelete = url.match(/^\/api\/courses\/([^/]+)$/);
    if (courseDelete && method === "DELETE") {
      const courseId = decodeURIComponent(courseDelete[1]);
      server.courses = server.courses.filter((course) => !(course.id === courseId && course.owner_id === sessionUser.id));
      server.materials = server.materials.filter((material) => material.course_id !== courseId);
      return jsonReply({ ok: true });
    }
    return ai(url, body, options);
  };
  const modules = await loadSource(`export { AppDataProvider, useAppData } from './src/state/AppDataContext.jsx';
    export { default as AIChatBox } from './src/components/AIChatBox.jsx';
    export { default as Workspace } from './src/pages/student/StudyWorkspacePage.jsx';`, {
    "@chatscope/chat-ui-kit-react": widgets,
    "../../layouts/StudentLayout": ({ children }) => React.createElement("main", null, children),
  }, { window, fetch });
  let data;
  function Observer() { data = modules.useAppData(); return null; }
  function Chat() {
    const context = modules.useAppData();
    return React.createElement(modules.AIChatBox, { selectedMaterials: context.selectedMaterials, currentCourse: context.currentCourse });
  }
  function Root({ show = true }) {
    return React.createElement(modules.AppDataProvider, null, React.createElement(Observer),
      show && (workspace ? React.createElement(MemoryRouter, { initialEntries: ["/student/workspace?mode=summary"] }, React.createElement(modules.Workspace)) : React.createElement(Chat)));
  }
  let renderer;
  await act(async () => { renderer = create(React.createElement(Root)); });
  t.after(async () => { await act(async () => renderer.unmount()); });
  await act(async () => {
    assert.equal((await data.login(student.email, "test-password")).ok, true);
    await new Promise((resolve) => setImmediate(resolve));
  });
  return { get data() { return data; }, renderer, requests, window,
    server,
    show: async (show) => { await act(async () => renderer.update(React.createElement(Root, { show }))); },
    send: (plain) => renderer.root.findByType("test-input").props.onSend(`<p>${plain}</p>`, plain),
    messages: () => renderer.root.findAllByType("test-message").map((node) => node.props.model),
  };
}

function button(renderer, label) {
  const found = renderer.root.findAllByType("button").find((node) => node.children.includes(label));
  assert.ok(found, `Missing button: ${label}`);
  return found;
}

test("an answer finishing after the source changes cannot appear in or be saved to the new conversation", async (t) => {
  const response = deferred();
  const app = await harness(t, { ai: () => response.promise });
  await act(async () => app.data.setSelectedMaterialIds([1]));
  let sent;
  await act(async () => { sent = app.send("Explain source A."); });
  const oldRequest = app.requests.find((request) => request.url === "/api/ai/qa");
  await act(async () => app.data.setSelectedMaterialIds([2]));
  assert.equal(oldRequest.options.signal.aborted, true);
  await act(async () => { response.resolve(jsonReply({ answer: "ANSWER_FOR_SOURCE_A", mode: "api" })); await sent; });
  assert.equal(app.messages().some((message) => message.message.includes("ANSWER_FOR_SOURCE_A")), false);
  assert.equal(app.data.currentChatRecords.length, 0);
  await act(async () => app.data.setSelectedMaterialIds([1]));
  assert.equal(app.data.currentChatRecords.some((record) => record.text === "ANSWER_FOR_SOURCE_A"), false);
});

test("saved conversations return after leaving the chat and send recent history with follow-up questions", async (t) => {
  const app = await harness(t);
  await act(async () => app.data.setSelectedMaterialIds([1]));
  await act(async () => { await app.send("Explain energy."); });
  await app.show(false); await app.show(true);
  assert.ok(app.messages().some((message) => message.message === "Grounded answer. [S1]"));
  await act(async () => { await app.send("Explain it more simply."); });
  const latest = app.requests.filter((request) => request.url === "/api/ai/qa").at(-1);
  assert.deepEqual(latest.body.history.map((message) => message.role), ["user", "model"]);
  assert.equal(latest.body.question, "Explain it more simply.");
  assert.equal(app.data.currentChatRecords.length, 4);
});

test("user and AI messages use the chat kit's text mode so HTML remains literal text", async (t) => {
  const payload = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  const app = await harness(t, { ai: async () => jsonReply({ answer: payload, mode: "api" }) });
  await act(async () => { await app.send(payload); });
  for (const message of app.messages()) {
    assert.equal(message.type, "text");
    const html = renderToStaticMarkup(React.createElement(ActualMessage, { model: message, type: "text" }));
    assert.ok(html.includes("&lt;img"));
    assert.equal(html.includes("<img"), false);
    assert.equal(html.includes("<script>"), false);
  }
});

test("concurrent upload clicks accept one batch and cannot exceed the course limit", async (t) => {
  const app = await harness(t);
  const files = [1, 2].map((id) => ({ name: `material-${id}.txt`, size: 24, text: async () => `Study material ${id}` }));
  let results;
  await act(async () => { results = await Promise.all([app.data.addMaterials(files, "inft3050"), app.data.addMaterials(files, "inft3050")]); });
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(app.data.courseMaterials.length, 4);
  await act(async () => { assert.equal((await app.data.addMaterials(files, "inft3050")).ok, false); });
  assert.equal(app.data.courseMaterials.length, 4);
});

test("an upload cancelled by logout cannot commit files into another student's session", async (t) => {
  const app = await harness(t);
  const reading = deferred();
  let upload;
  await act(async () => { upload = app.data.addMaterials([{ name: "slow.txt", size: 30, text: () => reading.promise }], "inft3050"); });
  await act(async () => { await app.data.logout(); await app.data.login(mia.email, "test-password"); });
  await act(async () => { reading.resolve("Source from student A"); assert.equal((await upload).ok, false); });
  assert.equal(app.data.currentUser.id, 3);
  assert.equal(app.data.studentMaterials.length, 0);
});

test("uploads roll back if browser storage cannot persist the batch", async (t) => {
  const app = await harness(t);
  const before = app.data.courseMaterials.length;
  const original = app.window.localStorage.setItem;
  app.window.localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
  let result;
  await act(async () => { result = await app.data.addMaterials([{ name: "extra.txt", size: 20, text: async () => "Additional material" }], "inft3050"); });
  app.window.localStorage.setItem = original;
  assert.equal(result.ok, false);
  assert.match(result.message, /storage is full/);
  assert.equal(app.data.courseMaterials.length, before);
});

test("student scores and study records stay isolated after switching accounts", async (t) => {
  const app = await harness(t);
  await act(async () => app.data.saveQuizAttempt({ score: 100, correct: 3, total: 3, answers: {} }));
  assert.equal(app.data.averageQuizScore, 100);
  await act(async () => { await app.data.logout(); await app.data.login(mia.email, "test-password"); });
  assert.equal(app.data.quizAttempts.length, 0);
  assert.equal(app.data.averageQuizScore, 0);
  assert.equal(app.data.summaryUses, 0);
  assert.equal(app.data.qaUses, 0);
});

test("deleting any source in a multi-file selection removes its dependent records", async (t) => {
  const app = await harness(t);
  await act(async () => {
    app.data.recordSummaryUse({ paragraph: "Summary", concepts: ["Concept"] });
    app.data.addChatRecord("User", "A question");
    app.data.saveQuizAttempt({ score: 100, correct: 3, total: 3, answers: {} });
  });
  assert.equal(app.data.summaryRecords[0].sourceFileId, 1);
  await act(async () => app.data.deleteMaterial(2));
  assert.equal(app.data.summaryRecords.length, 0);
  assert.equal(app.data.quizAttempts.length, 0);
  assert.equal(app.data.currentChatRecords.length, 0);
});

test("summary and quiz buttons generate results from the API; scoring follows the returned questions", async (t) => {
  const questions = [1, 3, 0].map((answerIndex, index) => ({ id: index + 1, question: `Course fact ${index + 1}?`, options: ["A", "B", "C", "D"], answerIndex, explanation: "Explanation from [S1]." }));
  const app = await harness(t, { workspace: true, ai: async (url) => url.endsWith("summary")
    ? jsonReply({ paragraph: "A summary returned by the API.", concepts: ["A course concept [S1]."], mode: "api" })
    : jsonReply({ questions, mode: "api" }) });
  await act(async () => { await button(app.renderer, "Generate Summary").props.onClick(); });
  assert.equal(app.data.summaryRecords[0].summary.paragraph, "A summary returned by the API.");
  assert.ok(JSON.stringify(app.renderer.toJSON()).includes("A summary returned by the API."));
  await act(async () => button(app.renderer, "Quiz").props.onClick());
  await act(async () => { await button(app.renderer, "Generate Quiz").props.onClick(); });
  for (let index = 0; index < questions.length; index += 1) {
    const radios = app.renderer.root.findAllByType("input").filter((node) => node.props.type === "radio");
    await act(async () => radios[questions[index].answerIndex].props.onChange());
    if (index < questions.length - 1) await act(async () => button(app.renderer, "Next").props.onClick());
  }
  await act(async () => { const submit = button(app.renderer, "Submit").props.onClick; submit(); submit(); });
  assert.equal(app.data.quizAttempts.length, 1);
  assert.equal(app.data.quizAttempts[0].score, 100);
  await act(async () => app.data.setSelectedMaterialIds([2]));
  assert.ok(button(app.renderer, "Generate Quiz"));
  assert.equal(app.renderer.root.findAllByType("input").filter((node) => node.props.type === "radio").length, 0);
});

test("server courses are authoritative, retryable, and never reused across student accounts", async (t) => {
  let failCourses = true;
  const app = await harness(t, { courseApi: ({ url, options }) => {
    if (url === "/api/courses" && (options.method || "GET") === "GET" && failCourses) {
      return jsonReply({ code: "SERVICE_UNAVAILABLE", message: "Courses are temporarily unavailable." }, 503);
    }
    return null;
  } });
  assert.match(app.data.courseState.error, /temporarily unavailable/i);
  assert.equal(app.data.studentCourses.length, 0);
  failCourses = false;
  await act(async () => { app.data.retryCourses(); await new Promise((resolve) => setImmediate(resolve)); });
  assert.equal(app.data.studentCourses.length, 3);
  app.window.localStorage.setItem("unrelated-ui-preference", "keep-me");
  await act(async () => { await app.data.logout(); await app.data.login(mia.email, "test-password"); await new Promise((resolve) => setImmediate(resolve)); });
  assert.equal(app.data.currentUser.id, 3);
  assert.equal(app.data.studentCourses.length, 0);
  assert.equal(app.data.studentMaterials.length, 0);
  assert.equal(app.window.localStorage.getItem("unrelated-ui-preference"), "keep-me");
  const courseRequests = app.requests.filter((request) => request.url === "/api/courses" && (request.options.method || "GET") === "GET");
  assert.equal(courseRequests.at(-1).options.headers["x-user-id"], "3");
});

test("a slower materials response cannot overwrite the course selected afterwards", async (t) => {
  const old = deferred();
  const app = await harness(t, { courseApi: ({ url, options }) => {
    if (url === "/api/courses/hci/materials" && (options.method || "GET") === "GET") return old.promise;
    return null;
  } });
  await act(async () => app.data.selectCourse("hci"));
  const oldRequest = app.requests.find((request) => request.url === "/api/courses/hci/materials");
  await act(async () => { app.data.selectCourse("inft3851a"); await new Promise((resolve) => setImmediate(resolve)); });
  assert.equal(oldRequest.options.signal.aborted, true);
  await act(async () => { old.resolve(jsonReply({ materials: [{ id: 99, course_id: "hci", name: "late.txt", type: "TXT", size_bytes: 1, status: "Ready", content: "late", created_at: "x", updated_at: "x" }] })); await new Promise((resolve) => setImmediate(resolve)); });
  assert.equal(app.data.currentCourseId, "inft3851a");
  assert.deepEqual(app.data.courseMaterials.map((material) => material.id), [3]);
  assert.equal(app.data.studentMaterials.some((material) => material.id === 99), false);
});

test("upload persists complete extracted text and a failed POST cannot create false UI success", async (t) => {
  let failPost = false;
  const app = await harness(t, { courseApi: ({ url, options }) => {
    if (failPost && url === "/api/courses/inft3050/materials" && options.method === "POST") {
      return jsonReply({ code: "SAVE_FAILED", message: "Material could not be saved." }, 500);
    }
    return null;
  } });
  const fullText = `${"complete ".repeat(3000)}END OF SOURCE`;
  let result;
  await act(async () => { result = await app.data.addMaterials([{ name: "complete.txt", size: 24013, text: async () => fullText }], "inft3050"); });
  assert.equal(result.ok, true);
  const post = app.requests.find((request) => request.url === "/api/courses/inft3050/materials" && request.options.method === "POST");
  assert.equal(post.body.content, fullText);
  assert.equal("owner_id" in post.body || "ownerId" in post.body, false);
  assert.equal(app.data.courseMaterials.some((material) => material.content === fullText), true);
  const before = app.data.courseMaterials.length;
  failPost = true;
  await act(async () => { result = await app.data.addMaterials([{ name: "failed.txt", size: 8, text: async () => "not saved" }], "inft3050"); });
  assert.equal(result.ok, false);
  assert.match(result.message, /could not be saved/i);
  assert.equal(app.data.courseMaterials.length, before);
  assert.equal(app.data.courseMaterials.some((material) => material.name === "failed.txt"), false);
});

test("failed deletion retains the material and selection; successful deletion cleans every dependent scope", async (t) => {
  let failDelete = true;
  const app = await harness(t, { courseApi: ({ url, options }) => {
    if (failDelete && url === "/api/materials/1" && options.method === "DELETE") {
      return jsonReply({ code: "DELETE_FAILED", message: "Material could not be deleted." }, 500);
    }
    return null;
  } });
  await act(async () => {
    app.data.setSelectedMaterialIds([1, 2]);
    app.data.recordSummaryUse({ paragraph: "Summary", concepts: [] });
    app.data.addChatRecord("User", "Question");
    app.data.saveQuizAttempt({ score: 100, correct: 1, total: 1, answers: {} });
  });
  let result;
  await act(async () => { result = await app.data.deleteMaterial(1); });
  assert.equal(result.ok, false);
  assert.equal(app.data.courseMaterials.some((material) => material.id === 1), true);
  assert.deepEqual(app.data.selectedMaterialIds, [1, 2]);
  assert.equal(app.data.summaryRecords.length, 1);
  failDelete = false;
  await act(async () => { result = await app.data.deleteMaterial(1); });
  assert.equal(result.ok, true);
  assert.equal(app.data.courseMaterials.some((material) => material.id === 1), false);
  assert.deepEqual(app.data.selectedMaterialIds, [2]);
  assert.equal(app.data.summaryRecords.length, 0);
  assert.equal(app.data.currentChatRecords.length, 0);
  assert.equal(app.data.quizAttempts.length, 0);
});

test("logout aborts resource loads and a late response cannot repopulate the signed-out UI", async (t) => {
  const slow = deferred();
  const app = await harness(t, { courseApi: ({ url, options }) => {
    if (url === "/api/courses/hci/materials" && (options.method || "GET") === "GET") return slow.promise;
    return null;
  } });
  await act(async () => app.data.selectCourse("hci"));
  const request = app.requests.find((item) => item.url === "/api/courses/hci/materials");
  await act(async () => app.data.logout());
  assert.equal(request.options.signal.aborted, true);
  await act(async () => { slow.resolve(jsonReply({ materials: [{ id: 101, course_id: "hci", name: "late.txt", type: "TXT", size_bytes: 1, status: "Ready", content: "late", created_at: "x", updated_at: "x" }] })); await new Promise((resolve) => setImmediate(resolve)); });
  assert.equal(app.data.currentUser, null);
  assert.equal(app.data.studentCourses.length, 0);
  assert.equal(app.data.studentMaterials.length, 0);
});
