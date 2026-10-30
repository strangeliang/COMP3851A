import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { act, create } from "react-test-renderer";
import { deferred, jsonReply, loadSource, memoryWindow } from "./helpers.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const firstUser = { id: 1, name: "First student", email: "first@example.test", role: "Student", status: "Active" };
const secondUser = { id: 2, name: "Second student", email: "second@example.test", role: "Student", status: "Active" };

async function harness(t, statusReply, { language = "en", loginReply } = {}) {
  const requests = [];
  let data;
  const modules = await loadSource(`
    export { AppDataProvider, useAppData } from './src/state/AppDataContext.jsx';
    export { default as AIServiceStatus } from './src/components/AIServiceStatus.jsx';
  `, {
    "../state/LanguageContext": { useLanguage: () => ({ language }) },
  }, {
    window: memoryWindow(),
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url === "/api/auth/me") return jsonReply({ user: firstUser });
      if (url === "/api/auth/login") return loginReply ? loginReply(options) : jsonReply({ user: secondUser });
      if (url === "/api/auth/logout") return jsonReply({ ok: true });
      if (url === "/api/courses") return jsonReply({ courses: [] });
      if (url === "/api/history") return jsonReply({ records: [] });
      if (url === "/api/ai/status") return statusReply(options);
      throw new Error(`Unexpected request: ${url}`);
    },
  });
  function Observer() {
    data = modules.useAppData();
    return React.createElement(modules.AIServiceStatus);
  }
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(modules.AppDataProvider, null, React.createElement(Observer)));
  });
  t.after(() => act(() => renderer.unmount()));
  return {
    get data() { return data; },
    renderer,
    requests,
    statusRequests: () => requests.filter(({ url }) => url === "/api/ai/status"),
    text: () => JSON.stringify(renderer.toJSON()),
  };
}

test("a failed initial AI status check can recover through Retry without refreshing the page", async (t) => {
  const retry = deferred();
  let checks = 0;
  const app = await harness(t, () => ++checks === 1
    ? jsonReply({ message: "Temporary outage" }, 503) : retry.promise);

  assert.equal(app.data.aiStatus.configured, false);
  assert.equal(app.data.aiStatus.loading, false);
  assert.equal(app.data.aiStatus.error, true);
  assert.match(app.text(), /Could not check AI configuration/);
  assert.deepEqual(app.renderer.root.findByType("button").children, ["Retry"]);

  await act(async () => { app.renderer.root.findByType("button").props.onClick(); });
  assert.equal(app.data.aiStatus.loading, true);
  assert.equal(app.renderer.root.findByType("button").props.disabled, true);
  assert.match(app.text(), /Checking/);

  await act(async () => { retry.resolve(jsonReply({ configured: true, provider: "Gemini" })); });
  assert.equal(app.data.aiStatus.configured, true);
  assert.equal(app.data.aiStatus.loading, false);
  assert.equal(app.data.aiStatus.error, false);
  assert.match(app.data.aiStatus.message, /Availability is checked when you send a request/);
  assert.equal(app.renderer.toJSON(), null);
  assert.equal(app.statusRequests().length, 2);
  assert.equal(app.requests.some(({ url }) => /\/ai\/(?!status)/.test(url)), false);
});

test("rapid retries share one pending status request and the same result", async (t) => {
  const pending = deferred();
  let checks = 0;
  const app = await harness(t, () => ++checks === 1 ? jsonReply({ configured: false }) : pending.promise);
  let first;
  let second;
  await act(async () => {
    first = app.data.retryAIStatus();
    second = app.data.retryAIStatus();
  });
  assert.equal(first, second);
  assert.equal(app.statusRequests().length, 2);
  assert.equal(app.data.aiStatus.loading, true);
  await act(async () => {
    pending.resolve(jsonReply({ configured: true }));
    assert.equal(await first, true);
    assert.equal(await second, true);
  });
  assert.equal(app.data.aiStatus.configured, true);
});

test("logging out cancels a status retry and discards even an ignored-abort response", async (t) => {
  const pending = deferred();
  let checks = 0;
  const app = await harness(t, () => ++checks === 1 ? jsonReply({ configured: false }) : pending.promise);
  let retry;
  await act(async () => { retry = app.data.retryAIStatus(); });
  const signal = app.statusRequests().at(-1).options.signal;
  await act(async () => { await app.data.logout(); });
  assert.equal(signal.aborted, true);
  assert.equal(app.data.currentUser, null);
  await act(async () => {
    pending.resolve(jsonReply({ configured: true }));
    assert.equal(await retry, false);
  });
  assert.equal(app.data.aiStatus.configured, false);
  assert.equal(app.data.aiStatus.loading, false);
  assert.match(app.data.aiStatus.message, /Sign in/);
  assert.equal(app.renderer.root.findAllByType("button").length, 0);
  await act(async () => { assert.equal(await app.data.retryAIStatus(), false); });
  assert.equal(app.statusRequests().length, 2);
});

for (const lateResult of ["success", "failure"]) {
  test(`switching accounts discards a previous account's late ${lateResult}`, async (t) => {
    const pending = deferred();
    let checks = 0;
    const app = await harness(t, () => ++checks === 1 ? pending.promise : jsonReply({ configured: false, provider: "Second account" }));
    const oldSignal = app.statusRequests()[0].options.signal;
    await act(async () => { assert.equal((await app.data.login(secondUser.email, "test-password")).ok, true); });
    assert.equal(oldSignal.aborted, true);
    assert.equal(app.data.currentUser.id, secondUser.id);
    assert.equal(app.data.aiStatus.provider, "Second account");
    const currentStatus = app.data.aiStatus;
    await act(async () => {
      if (lateResult === "success") pending.resolve(jsonReply({ configured: true, provider: "Old account" }));
      else pending.reject(new Error("Late connection failure"));
    });
    assert.equal(app.data.aiStatus, currentStatus);
    assert.equal(app.data.aiStatus.configured, false);
    assert.equal(app.data.aiStatus.error, false);
    assert.equal(app.statusRequests().length, 2);
  });
}

test("a status response from the old session is ignored while the next sign-in is pending", async (t) => {
  const pendingStatus = deferred();
  const pendingLogin = deferred();
  let checks = 0;
  const app = await harness(t, () => ++checks === 1 ? pendingStatus.promise : jsonReply({ configured: false }), {
    loginReply: () => pendingLogin.promise,
  });
  let login;
  await act(async () => { login = app.data.login(secondUser.email, "test-password"); });
  await act(async () => { pendingStatus.resolve(jsonReply({ configured: true })); });
  assert.equal(app.data.aiStatus.configured, false);
  await act(async () => {
    pendingLogin.resolve(jsonReply({ user: secondUser }));
    assert.equal((await login).ok, true);
  });
  assert.equal(app.data.currentUser.id, secondUser.id);
  assert.equal(app.data.aiStatus.loading, false);
  assert.equal(app.data.aiStatus.configured, false);
});

test("the retry banner localizes both failure and checking states", async (t) => {
  const pending = deferred();
  let checks = 0;
  const app = await harness(t, () => ++checks === 1 ? jsonReply({ message: "Offline" }, 503) : pending.promise, { language: "zh" });
  assert.match(app.text(), /暂时无法检查 AI 配置/);
  assert.deepEqual(app.renderer.root.findByType("button").children, ["重试"]);
  await act(async () => { app.renderer.root.findByType("button").props.onClick(); });
  assert.match(app.text(), /正在检查 AI 服务配置/);
  assert.equal(app.renderer.root.findByType("button").props.disabled, true);
  await act(async () => { pending.resolve(jsonReply({ configured: false })); });
  assert.match(app.text(), /AI 尚未配置/);
  assert.equal(app.renderer.root.findByType("button").props.disabled, false);
});
