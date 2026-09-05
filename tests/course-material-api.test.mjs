import test from "node:test";
import assert from "node:assert/strict";
import { jsonReply, loadSource, memoryWindow } from "./helpers.mjs";

test("the four Course and Material APIs carry the signed-in user ID and adapt server fields once", async () => {
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({ url, options, body: options.body ? JSON.parse(options.body) : undefined });
    if (url === "/api/courses") return jsonReply({ courses: [{ id: "course-7", code: "TEST7", name: "Testing", created_at: "created", updated_at: "updated" }] });
    if (url === "/api/courses/course-7/materials" && options.method === "POST") return jsonReply({ material: {
      id: 72, course_id: "course-7", name: "complete.txt", type: "TXT", size_bytes: 12, status: "Ready",
      content: "complete source text", created_at: "created", updated_at: "updated",
    } }, 201);
    if (url === "/api/courses/course-7/materials") return jsonReply({ materials: [{
      id: 71, course_id: "course-7", name: "notes.txt", type: "TXT", size_bytes: 11, status: "Ready",
      content: "all source text", created_at: "created", updated_at: "updated",
    }] });
    return jsonReply({ ok: true });
  };
  const service = await loadSource("src/services/courseMaterialService.js", {}, { window: memoryWindow(), fetch });
  const courses = await service.getCourses(7);
  const materials = await service.getCourseMaterials("course-7", 7);
  const created = await service.createMaterial("course-7", { name: "complete.txt", type: "TXT", size: 12, content: "complete source text", ownerId: 999 }, 7);
  await service.deleteMaterial(72, 7);

  assert.deepEqual(courses[0], { id: "course-7", ownerId: 7, code: "TEST7", name: "Testing", createdAt: "created", updatedAt: "updated" });
  assert.equal(materials[0].courseId, "course-7");
  assert.equal(materials[0].size, 11);
  assert.equal(materials[0].content, "all source text");
  assert.equal(created.id, 72);
  assert.deepEqual(calls.map((call) => call.options.headers["x-user-id"]), ["7", "7", "7", "7"]);
  assert.deepEqual(calls[2].body, { name: "complete.txt", type: "TXT", sizeBytes: 12, content: "complete source text" });
  assert.equal("ownerId" in calls[2].body || "owner_id" in calls[2].body, false);
});

test("AI requests keep their cookie-session contract and never receive the test identity header", async () => {
  const calls = [];
  const { generateAISummary, generateAIAnswer, generateAIQuiz } = await loadSource("src/services/aiService.js", {}, {
    window: memoryWindow(),
    fetch: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      if (url.endsWith("/summary")) return jsonReply({ paragraph: "Summary", concepts: ["One"], mode: "api" });
      if (url.endsWith("/quiz")) return jsonReply({ questions: [], mode: "api" });
      return jsonReply({ answer: "Answer", mode: "api" });
    },
  });
  const material = { id: 1, name: "long.txt", content: `${"x".repeat(25000)}END` };
  await generateAISummary({ materials: [material] });
  await generateAIAnswer({ materials: [material], question: "What is at the end?", history: [] });
  await generateAIQuiz({ materials: [material] });
  for (const call of calls) {
    assert.equal(call.options.credentials, "same-origin");
    assert.equal(Object.keys(call.options.headers).some((key) => key.toLowerCase() === "x-user-id"), false);
    assert.equal(call.body.materials[0].content, material.content);
  }
});

test("Course and Material API errors remain readable for JSON, non-JSON, and network failures", async () => {
  const responses = [
    jsonReply({ code: "COURSE_NOT_FOUND", message: "This course is unavailable." }, 404),
    new Response("bad gateway", { status: 502, headers: { "Content-Type": "text/plain" } }),
  ];
  const service = await loadSource("src/services/courseMaterialService.js", {}, {
    window: memoryWindow(), fetch: async () => responses.shift() || Promise.reject(new Error("offline")),
  });
  await assert.rejects(service.getCourseMaterials("missing", 1), (error) => error.status === 404 && error.message === "This course is unavailable.");
  await assert.rejects(service.getCourses(1), /invalid response/i);
  await assert.rejects(service.getCourses(1), /Cannot reach the service/i);
});
