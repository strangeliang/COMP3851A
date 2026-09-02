import test from "node:test";
import assert from "node:assert/strict";
import { loadSource, memoryWindow, jsonReply } from "./helpers.mjs";

test("invalid browser cache data cannot grant login or break array-dependent pages", async () => {
  const window = memoryWindow({ "study-companion-app-data": JSON.stringify({ currentUser: { id: 99, role: "Admin" }, courses: null, materials: [null], users: "bad", summaryRecords: [{ id: 1, userId: 1, courseId: "test", summary: {} }], quizAttempts: [null] }) });
  const storage = await loadSource("src/services/storageService.js", {}, { window });
  const defaults = { currentUser: null, users: [], courses: [], materials: [], selectedMaterialIds: [], summaryRecords: [], chatRecords: [], quizAttempts: [], activities: [] };
  const data = storage.loadAppData(defaults);
  assert.equal(data.currentUser, null);
  assert.deepEqual(data.courses, []);
  assert.deepEqual(data.materials, []);
  assert.deepEqual(data.summaryRecords, []);
  assert.deepEqual(data.quizAttempts, []);
  storage.saveAppData({ ...data, currentUser: { role: "Admin" } });
  assert.equal(JSON.parse(window.localStorage.getItem(storage.STORAGE_KEY)).currentUser, null);
});

test("storage write failure is reported rather than silently claiming persistence", async () => {
  const storage = await loadSource("src/services/storageService.js", {}, { window: { localStorage: { setItem: () => { throw new Error("QuotaExceededError"); } } } });
  assert.equal(storage.saveAppData({}), false);
});

test("source scope includes user, course, and the whole selection; old partial files are rejected", async () => {
  const { getScopeKey, materialIsIncomplete, selectionError } = await loadSource("src/utils/studyScope.js");
  assert.equal(getScopeKey(1, "course", [1, 2]), getScopeKey(1, "course", [2, 1]));
  assert.notEqual(getScopeKey(1, "course", [1]), getScopeKey(3, "course", [1]));
  assert.notEqual(getScopeKey(1, "course", [1]), getScopeKey(1, "course", [1, 2]));
  const material = { id: 1, content: "Partial text", parseWarning: "OCR was applied to the first 8 pages only for demo performance." };
  assert.equal(materialIsIncomplete(material), true);
  assert.match(selectionError([material]), /upload/i);
  assert.match(selectionError([{ id: 1, content: "a".repeat(100001) }]), /100,000/);
});

test("frontend sends full sources to the backend and never manufactures answers on failure", async () => {
  const calls = [];
  const { generateAIAnswer } = await loadSource("src/services/aiService.js", {}, { window: memoryWindow(), fetch: async (url, options) => { calls.push({ url, options }); return jsonReply({ message: "Not configured", code: "AI_NOT_CONFIGURED" }, 503); } });
  const content = "a".repeat(20000) + "END FACT";
  await assert.rejects(generateAIAnswer({ materials: [{ id: 1, name: "notes.txt", content }], question: "Explain the last fact." }), (error) => error.code === "AI_NOT_CONFIGURED");
  assert.equal(calls[0].url, "/api/ai/qa");
  assert.equal(JSON.parse(calls[0].options.body).materials[0].content, content);
  assert.equal(Object.keys(calls[0].options.headers).some((key) => /key|authorization/i.test(key)), false);
});
