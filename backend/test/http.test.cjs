const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { createApp } = require("../src/app");
const { createGeminiService } = require("../src/services/geminiService");

const users = [
  { id: 1, name: "Student A", email: "a@test.invalid", role: "Student", status: "Active", password_hash: bcrypt.hashSync("password-for-test", 4) },
  { id: 2, name: "Administrator", email: "admin@test.invalid", role: "Admin", status: "Active", password_hash: bcrypt.hashSync("password-for-test", 4) },
  { id: 3, name: "Disabled", email: "disabled@test.invalid", role: "Student", status: "Disabled", password_hash: bcrypt.hashSync("password-for-test", 4) },
  { id: 4, name: "Student B", email: "b@test.invalid", role: "Student", status: "Active", password_hash: bcrypt.hashSync("password-for-test", 4) },
];
const courses = [
  { id: "course-a", owner_id: 1, code: "A101", name: "Student A Course" },
  { id: "course-b", owner_id: 4, code: "B101", name: "Student B Course" },
];
const materials = [
  { id: 1, course_id: "course-a", owner_id: 1, name: "a.txt", type: "TXT", size_bytes: 1, status: "Ready", content: "A" },
  { id: 2, course_id: "course-b", owner_id: 4, name: "b.txt", type: "TXT", size_bytes: 1, status: "Ready", content: "B" },
];
const database = {
  getUserByEmail: async (email) => users.find((user) => user.email === email),
  getUserById: async (id) => users.find((user) => user.id === id),
  getDatabaseStatus: async () => ({ status: "ok" }),
  listCoursesByOwner: async (ownerId) => courses.filter((course) => course.owner_id === ownerId),
  createCourse: async (course) => ({ ...course, owner_id: course.ownerId }),
  deleteCourse: async (id, ownerId) => ({ changes: courses.some((course) => course.id === id && course.owner_id === ownerId) ? 1 : 0 }),
  courseBelongsToOwner: async (id, ownerId) => courses.find((course) => course.id === id && course.owner_id === ownerId),
  listMaterialsByCourseOwner: async (courseId, ownerId) => materials.filter((material) => material.course_id === courseId && material.owner_id === ownerId),
  createMaterialForOwner: async ({ courseId, ownerId, ...material }) => courses.some((course) => course.id === courseId && course.owner_id === ownerId) ? { id: 99, course_id: courseId, owner_id: ownerId, ...material } : null,
  deleteMaterialForOwner: async (id, ownerId) => ({ changes: materials.some((material) => material.id === id && material.owner_id === ownerId) ? 1 : 0 }),
};
const body = { materials: [{ id: "1", name: "notes.txt", content: "A source fact." }], question: "Explain this fact." };

async function setup(t, gemini = createGeminiService({ apiKey: "" })) {
  const server = createApp({ database, gemini }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, { cookie, origin, method = "GET", data } = {}) => fetch(`${base}${path}`, { method,
    headers: { ...(data ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  async function login(email = "a@test.invalid") {
    const response = await request("/auth/login", { method: "POST", data: { email, password: "password-for-test" } });
    assert.equal(response.status, 200);
    return response.headers.get("set-cookie").split(";")[0];
  }
  return { request, login, base };
}

test("AI endpoints require server authentication; browser-supplied user and role cannot authorize access", async (t) => {
  const { request } = await setup(t);
  const response = await request("/ai/qa", { method: "POST", data: { ...body, currentUser: users[0], role: "Student" } });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "AUTH_REQUIRED");
});

test("login uses an HttpOnly session cookie, returns no password, and logout invalidates the session", async (t) => {
  const { request } = await setup(t);
  const response = await request("/auth/login", { method: "POST", data: { email: "A@TEST.INVALID", password: "password-for-test", remember: true } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
  assert.match(response.headers.get("set-cookie"), /SameSite=Strict/);
  assert.match(response.headers.get("set-cookie"), /Max-Age=604800/);
  const payload = await response.json();
  assert.equal(payload.user.password_hash, undefined);
  assert.equal(payload.user.password, undefined);
  const cookie = response.headers.get("set-cookie").split(";")[0];
  assert.equal((await request("/auth/me", { cookie })).status, 200);
  assert.equal((await request("/auth/logout", { cookie, method: "POST" })).status, 200);
  assert.equal((await request("/auth/me", { cookie })).status, 401);
});

test("disabled accounts and wrong passwords cannot log in", async (t) => {
  const { request } = await setup(t);
  for (const credentials of [{ email: "disabled@test.invalid", password: "password-for-test" }, { email: "a@test.invalid", password: "wrong" }]) {
    assert.equal((await request("/auth/login", { method: "POST", data: credentials })).status, 401);
  }
});

test("AI status describes configuration without calling Gemini, and missing configuration is explicit", async (t) => {
  const { request, login } = await setup(t);
  const cookie = await login();
  assert.equal((await (await request("/ai/status", { cookie })).json()).configured, false);
  const response = await request("/ai/summary", { cookie, method: "POST", data: body });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "AI_NOT_CONFIGURED");
});

test("cross-site mutations and administrator study requests are rejected", async (t) => {
  const { request, login } = await setup(t);
  const cookie = await login();
  assert.equal((await request("/ai/qa", { cookie, origin: "https://untrusted.invalid", method: "POST", data: body })).status, 403);
  const admin = await login("admin@test.invalid");
  assert.equal((await request("/ai/qa", { cookie: admin, method: "POST", data: body })).status, 403);
});

test("course and material APIs isolate every record by the authenticated owner", async (t) => {
  const { request, login } = await setup(t);
  const studentA = await login("a@test.invalid");
  const studentB = await login("b@test.invalid");

  const aCourses = await (await request("/courses", { cookie: studentA })).json();
  const bCourses = await (await request("/courses", { cookie: studentB })).json();
  assert.deepEqual(aCourses.courses.map((course) => course.id), ["course-a"]);
  assert.deepEqual(bCourses.courses.map((course) => course.id), ["course-b"]);

  assert.equal((await request("/courses/course-b/materials", { cookie: studentA })).status, 404);
  assert.equal((await request("/courses/course-b/materials", { cookie: studentA, method: "POST", data: { name: "stolen.txt", type: "TXT", sizeBytes: 1, content: "x" } })).status, 404);
  assert.equal((await request("/materials/2", { cookie: studentA, method: "DELETE" })).status, 404);
  assert.equal((await request("/courses/course-b", { cookie: studentA, method: "DELETE" })).status, 404);

  const ownMaterials = await (await request("/courses/course-a/materials", { cookie: studentA })).json();
  assert.deepEqual(ownMaterials.materials.map((material) => material.id), [1]);
});

test("duplicate AI submissions cannot run concurrently for the same student", async (t) => {
  let complete;
  let started;
  const began = new Promise((resolve) => { started = resolve; });
  const gemini = { status: () => ({ configured: true }), generate: async () => { started(); return new Promise((resolve) => { complete = resolve; }); } };
  const { request, login } = await setup(t, gemini);
  const cookie = await login();
  const first = request("/ai/qa", { cookie, method: "POST", data: body });
  await began;
  const second = await request("/ai/qa", { cookie, method: "POST", data: body });
  assert.equal(second.status, 409);
  complete({ answer: "Answer", mode: "api" });
  assert.equal((await first).status, 200);
});

test("client cancellation aborts server generation and releases the student's request slot", async (t) => {
  let started; let stopped;
  const began = new Promise((resolve) => { started = resolve; });
  const aborted = new Promise((resolve) => { stopped = resolve; });
  let calls = 0;
  const gemini = { status: () => ({ configured: true }), generate: async (_mode, _input, { signal }) => {
    calls += 1;
    if (calls > 1) return { answer: "Next request", mode: "api" };
    started();
    return new Promise((_, reject) => signal.addEventListener("abort", () => { stopped(); reject(new DOMException("Aborted", "AbortError")); }, { once: true }));
  } };
  const { request, login, base } = await setup(t, gemini);
  const cookie = await login();
  const controller = new AbortController();
  const first = fetch(`${base}/ai/qa`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
  const rejected = assert.rejects(first, (error) => error.name === "AbortError");
  await began; controller.abort(); await rejected; await aborted;
  const next = await request("/ai/qa", { cookie, method: "POST", data: body });
  assert.equal(next.status, 200);
});
