const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");

test("original bytes survive a real backend restart; sessions, ownership and deletion are enforced", { timeout: 45000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "study-originals-"));
  let child;
  let base;
  async function start() {
    child = spawn(process.execPath, ["-e", `
      const database = require('./src/config/database');
      const {createApp} = require('./src/app');
      database.initializeDatabase().then(() => {
        const server = createApp({database}).listen(0,'127.0.0.1', () => process.send(server.address().port));
      }).catch(e => { console.error(e); process.exit(1); });
    `], { cwd: path.join(__dirname, ".."), env: { ...process.env, STUDY_DATABASE_PATH: path.join(directory, "test.db"), STUDY_UPLOAD_PATH: path.join(directory, "originals") }, stdio: ["ignore", "ignore", "pipe", "ipc"] });
    const [port] = await Promise.race([once(child, "message"), once(child, "exit").then(() => { throw new Error("Test backend exited before listening"); })]);
    base = `http://127.0.0.1:${port}/api`;
  }
  async function stop() { if (child && child.exitCode === null) { const exited = once(child, "exit"); child.kill(); await exited; } }
  function request(url, { cookie, method = "GET", data, bytes } = {}) {
    return fetch(base + url, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(data ? { "Content-Type": "application/json" } : {}), ...(bytes ? { "Content-Type": "application/octet-stream" } : {}) }, body: bytes || (data ? JSON.stringify(data) : undefined) });
  }
  async function login(email = "student@example.com") {
    const res = await request("/auth/login", { method: "POST", data: { email, password: "student123" } });
    assert.equal(res.status, 200);
    return res.headers.get("set-cookie").split(";")[0];
  }
  try {
    await start();
    const signup = { name: "New Student", email: "new@example.test", password: "safe-test-password" };
    assert.equal((await request("/auth/register", { method: "POST", data: { ...signup, role: "Admin" } })).status, 400);
    assert.equal((await request("/auth/register", { method: "POST", data: { ...signup, password: "short" } })).status, 400);
    assert.equal((await request("/auth/register", { method: "POST", data: signup })).status, 201);
    assert.equal((await request("/auth/register", { method: "POST", data: signup })).status, 409);
    const registeredLogin = await request("/auth/login", { method: "POST", data: { email: signup.email, password: signup.password } });
    assert.equal(registeredLogin.status, 200);
    const newUser = (await registeredLogin.json()).user;
    assert.equal(newUser.role, "Student");
    assert.equal(newUser.password_hash, undefined);
    let cookie = await login();
    const other = await login("mia@student.edu");
    const courseRes = await request("/courses", { cookie, method: "POST", data: { code: "FILES", name: "Original tests" } });
    const course = (await courseRes.json()).course.id;
    const bytes = Buffer.from("%PDF-1.7\noriginal binary bytes\x00\xff\n%%EOF", "latin1");
    const created = await request(`/courses/${course}/materials`, { cookie, method: "POST", data: { name: "lecture.pdf", type: "PDF", sizeBytes: bytes.length, content: "Extracted text is not the original." } });
    const id = (await created.json()).material.id;
    const url = `/materials/${id}/original`;
    assert.equal((await request(url, { cookie })).status, 404);
    for (const auth of [undefined, other]) {
      assert.equal((await request(url, { cookie: auth })).status, auth ? 404 : 401);
      assert.equal((await request(url, { cookie: auth, method: "PUT", bytes })).status, auth ? 404 : 401);
    }
    assert.equal((await request(url, { cookie, method: "PUT", bytes: Buffer.alloc(bytes.length) })).status, 400);
    assert.equal((await request(url, { cookie, method: "PUT", bytes })).status, 201);
    assert.equal((await request(url, { cookie, method: "PUT", bytes })).status, 409);
    const preview = await request(url + "?preview=1", { cookie });
    assert.equal(preview.status, 200);
    assert.match(preview.headers.get("content-type"), /application\/pdf/);
    assert.match(preview.headers.get("content-disposition"), /^inline/);
    assert.match(preview.headers.get("cache-control"), /no-store/);
    assert.match(preview.headers.get("content-security-policy"), /sandbox/);
    assert.deepEqual(Buffer.from(await preview.arrayBuffer()), bytes);
    assert.equal((await request(url + "?preview=1", { cookie: other })).status, 404);
    assert.equal((await request(`/materials/${id}`, { cookie: other, method: "DELETE" })).status, 404);
    assert.equal((await request(`/courses/${course}`, { cookie: other, method: "DELETE" })).status, 404);
    assert.equal((await fs.readdir(path.join(directory, "originals"))).length, 1);
    await request("/auth/logout", { cookie, method: "POST" });
    assert.equal((await request(url, { cookie })).status, 401);
    cookie = await login();
    assert.deepEqual(Buffer.from(await (await request(url, { cookie })).arrayBuffer()), bytes);
    await stop();
    await start();
    assert.equal((await request(url, { cookie })).status, 401);
    cookie = await login();
    const download = await request(url, { cookie });
    assert.equal(download.status, 200);
    assert.match(download.headers.get("content-disposition"), /^attachment/);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
    const list = await (await request(`/courses/${course}/materials`, { cookie })).json();
    assert.equal(list.materials[0].has_original, 1);
    assert.equal(list.materials[0].storage_key, undefined);
    assert.equal((await request(`/materials/${id}`, { cookie, method: "DELETE" })).status, 200);
    assert.equal((await request(url, { cookie })).status, 404);
    assert.deepEqual(await fs.readdir(path.join(directory, "originals")), []);
    // Deleting a course also deletes its originals, not only extracted records.
    const second = await (await request(`/courses/${course}/materials`, { cookie, method: "POST", data: { name: "second.pdf", type: "PDF", sizeBytes: bytes.length, content: "text" } })).json();
    assert.equal((await request(`/materials/${second.material.id}/original`, { cookie, method: "PUT", bytes })).status, 201);
    assert.equal((await request(`/courses/${course}`, { cookie, method: "DELETE" })).status, 200);
    assert.deepEqual(await fs.readdir(path.join(directory, "originals")), []);
  } finally {
    await stop();
    // Only the explicitly created test directory is removed.
    await fs.rm(directory, { recursive: true, force: true });
  }
});
