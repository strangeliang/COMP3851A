import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { create, act } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { Message as ActualMessage } from "@chatscope/chat-ui-kit-react";
import { MemoryRouter } from "react-router-dom";
import {
  loadSource,
  memoryWindow,
  deferred,
  jsonReply,
} from "./helpers.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test('translation restores the latest React value, not stale dashboard counts or names', async () => {
  const { translatedValue } = await loadSource('src/utils/translationCache.js');
  const cache = new WeakMap(); const node = {};
  const translate = (s) => s.replace('shown', '显示');
  assert.equal(translatedValue(cache, node, 'text', '1 shown', translate, true), '1 显示');
  assert.equal(translatedValue(cache, node, 'text', '1 显示', translate, true), '1 显示');
  assert.equal(translatedValue(cache, node, 'text', '2 shown', translate, true), '2 显示');
  assert.equal(translatedValue(cache, node, 'text', '2 显示', translate, false), '2 shown');
  assert.equal(translatedValue(cache, node, 'text', 'New course', translate, false), 'New course');
  assert.equal(translatedValue(cache, node, 'title', '3 shown', translate, true), '3 显示');
  assert.equal(translatedValue(cache, node, 'title', '4 shown', translate, false), '4 shown');
});

test('study-save retry keeps its ID, survives browser storage and cannot cross accounts', async (t) => {
  let fail = true;
  const app = await harness(t, { courseApi: ({ url, options }) => url === '/api/history' && options.method === 'POST' && fail
    ? jsonReply({ message: 'Temporary failure' }, 503) : undefined });
  await act(async () => { app.data.recordSummaryUse({ paragraph: 'Stored summary', concepts: ['Concept'] }); });
  assert.equal(app.data.pendingStudyCount, 1);
  assert.match(app.data.historySync.error, /not yet saved to the server/);
  const stored = JSON.parse(app.window.localStorage.getItem('study-companion-app-data'));
  assert.equal(stored.studyOutbox.length, 1);
  const queuedId = stored.studyOutbox[0].id;
  await act(async () => { await app.data.logout(); await app.data.login(mia.email, 'test-password'); });
  assert.equal(app.data.pendingStudyCount, 0);
  assert.equal(app.data.summaryRecords.length, 0);
  assert.equal(app.requests.filter((r) => r.url === '/api/history' && r.options.method === 'POST').length, 1);
  fail = false;
  await act(async () => { await app.data.logout(); await app.data.login(student.email, 'test-password'); });
  await act(async () => { await app.data.refreshStudyHistory(); });
  assert.equal(app.data.pendingStudyCount, 0);
  assert.equal(app.data.summaryRecords.length, 1);
  assert.equal(app.data.summaryRecords[0].serverId, `1:${queuedId}`);
  assert.equal(app.server.history.length, 1);
  assert.deepEqual(app.requests.filter((r) => r.url === '/api/history' && r.options.method === 'POST').map((r) => r.body.id), [queuedId, queuedId]);
});

test('dashboard statistics hydrate from server history on a new browser without duplicates', async (t) => {
  const records = [
    { id: '1:remote-quiz', course_id: 'inft3050', kind: 'quiz', created_at: '2026-10-01', payload: { score: 75, questions: [], answers: {} } },
    { id: '1:remote-summary', course_id: 'inft3050', kind: 'summary', created_at: '2026-10-01', payload: { summary: { paragraph: 'Remote', concepts: [] } } },
  ];
  const app = await harness(t, { courseApi: ({ url, options }) => url === '/api/history' && options.method === 'GET'
    ? jsonReply({ records, reviews: [] }) : undefined });
  await act(async () => { await app.data.refreshStudyHistory(); });
  assert.equal(app.data.quizAttempts.length, 1);
  assert.equal(app.data.averageQuizScore, 75);
  assert.equal(app.data.summaryUses, 1);
  await act(async () => { await app.data.refreshStudyHistory(); });
  assert.equal(app.data.quizAttempts.length, 1);
});

test('a deleted outbox record cannot block later saves or resurrect deleted history', async (t) => {
  let firstId;
  const app = await harness(t, { courseApi: ({ url, options, body }) => {
    if (url !== '/api/history' || options.method !== 'POST') return;
    firstId ||= body.id;
    if (body.id === firstId) return jsonReply({ code: 'HISTORY_DELETED', message: 'Use Undo to restore.' }, 409);
  } });
  await act(async () => app.data.recordSummaryUse({ paragraph: 'Deleted result', concepts: [] }));
  await act(async () => app.data.recordSummaryUse({ paragraph: 'Later result', concepts: [] }));
  await act(async () => app.data.refreshStudyHistory());
  assert.equal(app.data.pendingStudyCount, 0);
  assert.equal(app.server.history.length, 1);
  assert.equal(app.server.history[0].payload.summary.paragraph, 'Later result');
  assert.equal(app.requests.filter(request => request.url === '/api/history' && request.options.method === 'POST' && request.body.id === firstId).length, 1);
  assert.equal(app.data.summaryRecords.length, 1);
});

test('invalid saves keep their payload locally, permit later records and can be retried explicitly', async (t) => {
  let firstId; let fail = true;
  const app = await harness(t, { courseApi: ({ url, options, body }) => {
    if (url !== '/api/history' || options.method !== 'POST') return;
    firstId ||= body.id;
    if (body.id === firstId && fail) return jsonReply({ code: 'INVALID_HISTORY', message: 'Invalid saved record' }, 400);
  } });
  await act(async () => app.data.recordSummaryUse({ paragraph: 'Preserved result', concepts: [] }));
  await act(async () => app.data.recordSummaryUse({ paragraph: 'Later result', concepts: [] }));
  assert.equal(app.server.history.length, 1);
  assert.equal(app.data.pendingStudyCount, 0);
  assert.match(app.data.historySync.error, /kept in this browser/);
  const stored = JSON.parse(app.window.localStorage.getItem('study-companion-app-data'));
  assert.equal(stored.studyOutbox.length, 1);
  assert.equal(stored.studyOutbox[0].blocked, true);
  assert.equal(stored.studyOutbox[0].payload.summary.paragraph, 'Preserved result');
  fail = false;
  await act(async () => app.data.retryStudyRecords());
  assert.equal(app.server.history.length, 2);
  assert.equal(app.data.historySync.error, '');
  assert.equal(JSON.parse(app.window.localStorage.getItem('study-companion-app-data')).studyOutbox.length, 0);
});

test('profile and review controls translate without changing learner text; toolbar has no inactive filter button', async (t) => {
  const { Profile, History, Toolbar } = await loadSource("export { default as Profile } from './src/pages/student/ProfilePage.jsx'; export { default as History } from './src/pages/student/HistoryPage.jsx'; export { default as Toolbar } from './src/components/Toolbar.jsx';", {
    '../../layouts/StudentLayout': ({ children }) => React.createElement('main', null, children),
    '../../state/LanguageContext': { useLanguage: () => ({ language: 'zh' }) },
    '../../state/AppDataContext': { useAppData: () => ({ currentUser: { name: 'Test User', email: 'test@invalid.test', role: 'Student' }, studentCourses: [], summaryRecords: [], currentChatRecords: [], quizAttempts: [] }) },
    '../../services/apiClient': { apiRequest: async () => ({ records: [{ id: 'quiz', kind: 'quiz', course_id: 'course', created_at: '2026-10-07', payload: { score: 0, questions: [{ id: 1, question: 'Source question unchanged', options: ['A', 'B'], answerIndex: 0 }], answers: { 1: 1 } } }], reviews: [] }) },
  });
  let renderer;
  await act(async () => { renderer = create(React.createElement(Profile)); });
  t.after(() => act(() => renderer.unmount()));
  for (const label of ['显示名称', '个人简介', '学习目标', '保存个人资料']) assert.ok(JSON.stringify(renderer.toJSON()).includes(label));
  await act(async () => renderer.update(React.createElement(History, { review: true })));
  await act(async () => renderer.root.findByProps({ className: 'history-record-open' }).props.onClick());
  const markup = JSON.stringify(renderer.toJSON());
  assert.ok(markup.includes('原始答案：')); assert.ok(markup.includes('提交练习')); assert.ok(markup.includes('Source question unchanged'));
  assert.ok(!markup.includes('Original answer:'));
  await act(async () => renderer.update(React.createElement(Toolbar, { value: '', onChange() {}, placeholder: 'Search' })));
  assert.equal(renderer.root.findAllByType('button').length, 0);
});

test('imported legacy history replaces its browser record without doubling statistics', async () => {
  const { mergeServerHistory } = await loadSource('src/utils/historySync.js');
  const old = { id: 'older-quiz', userId: 1, courseId: 'course', score: 40 };
  const state = { quizAttempts: [old], summaryRecords: [], chatRecords: [] };
  const server = [{ id: '1:legacy-older-quiz', course_id: 'course', kind: 'quiz', payload: old, created_at: 'today' }];
  const merged = mergeServerHistory(state, server, 1);
  assert.equal(merged.quizAttempts.length, 1);
  assert.equal(merged.quizAttempts[0].serverId, '1:legacy-older-quiz');
  assert.equal(mergeServerHistory(merged, server, 1).quizAttempts.length, 1);
  const concurrent = { ...merged, quizAttempts: [...merged.quizAttempts, { id: 'new', userId: 1, serverId: '1:new', score: 80 }] };
  const refreshed = mergeServerHistory(concurrent, [], 1, new Set(['1:legacy-older-quiz']));
  assert.equal(refreshed.quizAttempts.length, 1);
  assert.equal(refreshed.quizAttempts[0].id, 'new');
});

test("dashboard recent material never falls back to another course", async () => {
  const { recentCourseMaterial } = await loadSource("src/utils/studyScope.js");
  const currentCourse = { id: "empty-course" };
  const other = { id: 1, courseId: "other-course", name: "private-other-course.txt" };
  assert.equal(recentCourseMaterial(currentCourse, null, [other]), null);
  assert.equal(recentCourseMaterial(currentCourse, other, [other]), null);
  const own = { id: 2, courseId: "empty-course", name: "own.txt" };
  assert.equal(recentCourseMaterial(currentCourse, other, [other, own]), own);
  assert.equal(recentCourseMaterial(null, own, [own]), null);
});

test("workspace session restores generated results and answers after remount/reload, isolates scopes and clears on login", async () => {
  const window = memoryWindow();
  window.sessionStorage = memoryWindow().localStorage;
  const entry = `export { default as useRequest } from './src/hooks/useAIRequest.js';
    export { default as useDraft } from './src/hooks/useWorkspaceState.js';
    export * from './src/services/workspaceSession.js';`;
  let modules = await loadSource(entry, {}, { window });
  let exposed;
  function Probe({ scope = "user1:course1:file1", kind = "quiz" }) {
    const request = modules.useRequest(scope, kind);
    const [answers, setAnswers] = modules.useDraft('answers:' + scope, {});
    const [submitted, setSubmitted] = modules.useDraft('submitted:' + scope, false);
    exposed = { request, answers, setAnswers, submitted, setSubmitted };
    return null;
  }
  let renderer;
  await act(async () => { renderer = create(React.createElement(Probe)); });
  await act(async () => {
    await exposed.request.run(async () => ({ questions: [{ id: 'q1' }] }));
    exposed.setAnswers({ q1: 2 });
    exposed.setSubmitted(true);
  });
  await act(async () => { renderer.unmount(); });
  // Fresh module instance emulates a browser refresh: only sessionStorage survives.
  modules = await loadSource(entry, {}, { window });
  await act(async () => { renderer = create(React.createElement(Probe)); });
  assert.equal(exposed.request.data.questions[0].id, 'q1');
  assert.deepEqual(exposed.answers, { q1: 2 });
  assert.equal(exposed.submitted, true);
  await act(async () => { renderer.update(React.createElement(Probe, { scope: "user2:course1:file1" })); });
  assert.equal(exposed.request.data, null);
  assert.deepEqual(exposed.answers, {});
  await act(async () => { renderer.update(React.createElement(Probe, { kind: "flashcards" })); });
  assert.equal(exposed.request.data, null);
  await act(async () => { renderer.update(React.createElement(Probe)); });
  assert.equal(exposed.request.data.questions[0].id, 'q1');
  const previousSession = modules.workspaceSessionId();
  modules.resetWorkspaceSession();
  modules.writeWorkspaceState('quiz:user1:course1:file1', { data: 'stale' }, previousSession);
  await act(async () => { renderer.unmount(); renderer = create(React.createElement(Probe)); });
  assert.equal(exposed.request.data, null);
  assert.deepEqual(exposed.answers, {});
  assert.equal(exposed.submitted, false);
  await act(async () => { renderer.unmount(); });
});

const widgets = {
  ChatContainer: "test-chat",
  MainContainer: "test-main",
  Message: "test-message",
  MessageInput: "test-input",
  MessageList: "test-list",
  TypingIndicator: "test-typing",
};

const student = {
  id: 1,
  name: "Alex Chen",
  email: "student@example.com",
  role: "Student",
  status: "Active",
};

const mia = {
  id: 3,
  name: "Mia Tan",
  email: "mia@student.edu",
  role: "Student",
  status: "Active",
};

async function harness(
  t,
  {
    ai = async () =>
      jsonReply({
        answer: "Grounded answer. [S1]",
        mode: "api",
      }),
    courseApi,
    stored,
    preferences,
    workspace = false,
  } = {}
) {
  const window = memoryWindow(
    stored
      ? {
          "study-companion-app-data": JSON.stringify(stored),
        }
      : {}
  );
  if (preferences) window.localStorage.setItem("study-interface-preferences", JSON.stringify(preferences));

  const requests = [];
  let sessionUser = null;

  const server = {
    courses: [
      {
        id: "inft3050",
        owner_id: 1,
        code: "INFT3050",
        name: "Study Companion",
        created_at: "2026-01-01",
        updated_at: "2026-01-02",
      },
      {
        id: "hci",
        owner_id: 1,
        code: "HCI",
        name: "Prototype Review",
        created_at: "2026-01-01",
        updated_at: "2026-01-02",
      },
      {
        id: "inft3851a",
        owner_id: 1,
        code: "INFT3851A",
        name: "Study Project",
        created_at: "2026-01-01",
        updated_at: "2026-01-02",
      },
    ],

    materials: [
      {
        id: 1,
        course_id: "inft3050",
        owner_id: 1,
        name: "lecture_notes.txt",
        type: "TXT",
        size_bytes: 1830,
        status: "Ready",
        content:
          "Machine learning is a method that allows computers to learn patterns from data.",
        created_at: "2026-01-01",
        updated_at: "2026-01-02",
      },
      {
        id: 2,
        course_id: "inft3050",
        owner_id: 1,
        name: "tutorial_outline.md",
        type: "MD",
        size_bytes: 940,
        status: "Ready",
        content:
          "# Tutorial Outline\n- AI learning workflow\n- Source file selection\n- Quiz revision",
        created_at: "2026-01-01",
        updated_at: "2026-01-02",
      },
      {
        id: 3,
        course_id: "inft3851a",
        owner_id: 1,
        name: "project_scope.md",
        type: "MD",
        size_bytes: 1500,
        status: "Ready",
        content:
          "# Project Scope\nThis file explains course requirements and prototype scope.",
        created_at: "2026-01-01",
        updated_at: "2026-01-02",
      },
    ],

    nextMaterialId: 4,
    history: [],
  };

  const fetch = async (url, options = {}) => {
    const body = options.body
      ? JSON.parse(options.body)
      : null;

    requests.push({
      url,
      body,
      options,
    });

    if (url === "/api/auth/me") {
      return sessionUser
        ? jsonReply({
            user: sessionUser,
          })
        : jsonReply(
            {
              message: "Please log in.",
            },
            401
          );
    }

    if (url === "/api/auth/login") {
      sessionUser =
        body.email === mia.email ? mia : student;

      return jsonReply({
        user: sessionUser,
      });
    }

    if (url === "/api/auth/logout") {
      sessionUser = null;

      return jsonReply({
        ok: true,
      });
    }

    if (url === "/api/ai/status") {
      return jsonReply({
        configured: true,
        provider: "Gemini",
        model: "test-provider",
      });
    }

    const overridden = await courseApi?.({
      url,
      body,
      options,
      server,
      sessionUser,
    });

    if (overridden) {
      return overridden;
    }

    const method = options.method || "GET";
    const userId = sessionUser?.id;

    if (url === '/api/history') {
      if (method === 'POST') {
        const id = `${userId}:${body.id}`;
        if (!server.history.some((r) => r.id === id)) server.history.push({ id, owner_id: userId,
          kind: body.kind, course_id: body.courseId, payload: body.payload, created_at: '2026-10-01' });
        return jsonReply({ ok: true });
      }
      return jsonReply({ records: server.history.filter((r) => r.owner_id === userId), reviews: [] });
    }

    if (
      url === "/api/courses" &&
      method === "GET"
    ) {
      return jsonReply({
        courses: server.courses.filter(
          (course) => course.owner_id === userId
        ),
      });
    }

    if (
      url === "/api/courses" &&
      method === "POST"
    ) {
      const course = {
        id: `created-${server.courses.length + 1}`,
        owner_id: sessionUser.id,
        code: body.code,
        name: body.name,
        created_at: "2026-01-03",
        updated_at: "2026-01-03",
      };

      server.courses.push(course);

      return jsonReply(
        {
          course,
        },
        201
      );
    }

    const courseMaterials = url.match(
      /^\/api\/courses\/([^/]+)\/materials$/
    );

    if (
      courseMaterials &&
      method === "GET"
    ) {
      const courseId = decodeURIComponent(
        courseMaterials[1]
      );

      const ownsCourse =
        server.courses.some(
          (course) =>
            course.id === courseId &&
            course.owner_id === userId
        );

      return ownsCourse
        ? jsonReply({
            materials: server.materials.filter(
              (material) =>
                material.course_id === courseId &&
                material.owner_id === userId
            ),
          })
        : jsonReply(
            {
              code: "COURSE_NOT_FOUND",
              message:
                "This course does not exist or does not belong to you.",
            },
            404
          );
    }

    if (
      courseMaterials &&
      method === "POST"
    ) {
      const courseId = decodeURIComponent(
        courseMaterials[1]
      );

      const material = {
        id: server.nextMaterialId++,
        course_id: courseId,
        owner_id: userId,
        name: body.name,
        type: body.type,
        size_bytes: body.sizeBytes,
        status: "Ready",
        content: body.content,
        created_at: "2026-01-03",
        updated_at: "2026-01-03",
      };

      server.materials.push(material);

      return jsonReply(
        {
          material,
        },
        201
      );
    }

    const materialDelete = url.match(
      /^\/api\/materials\/(\d+)$/
    );

    if (
      materialDelete &&
      method === "DELETE"
    ) {
      const index =
        server.materials.findIndex(
          (material) =>
            material.id ===
              Number(materialDelete[1]) &&
            material.owner_id === userId
        );

      if (index < 0) {
        return jsonReply(
          {
            code: "MATERIAL_NOT_FOUND",
            message:
              "This material does not exist or does not belong to you.",
          },
          404
        );
      }

      server.materials.splice(index, 1);

      return jsonReply({
        ok: true,
      });
    }

    const courseDelete = url.match(
      /^\/api\/courses\/([^/]+)$/
    );

    if (
      courseDelete &&
      method === "DELETE"
    ) {
      const courseId = decodeURIComponent(
        courseDelete[1]
      );

      server.courses =
        server.courses.filter(
          (course) =>
            !(
              course.id === courseId &&
              course.owner_id === sessionUser.id
            )
        );

      server.materials =
        server.materials.filter(
          (material) =>
            material.course_id !== courseId
        );

      return jsonReply({
        ok: true,
      });
    }

    return ai(url, body, options);
  };

  const modules = await loadSource(
    `
      export {
        AppDataProvider,
        useAppData
      } from './src/state/AppDataContext.jsx';

      export {
        default as AIChatBox
      } from './src/components/AIChatBox.jsx';

      export {
        default as Workspace
      } from './src/pages/student/StudyWorkspacePage.jsx';
    `,
    {
      "@chatscope/chat-ui-kit-react":
        widgets,
      "../../state/LanguageContext": { useLanguage: () => ({ language: "en" }) },

      "../../layouts/StudentLayout": ({
        children,
      }) =>
        React.createElement(
          "main",
          null,
          children
        ),
    },
    {
      window,
      fetch,
    }
  );

  let data;

  function Observer() {
    data = modules.useAppData();

    return null;
  }

  function Chat() {
    const context =
      modules.useAppData();

    return React.createElement(
      modules.AIChatBox,
      {
        selectedMaterials:
          context.selectedMaterials,
        currentCourse:
          context.currentCourse,
      }
    );
  }

  function Root({ show = true }) {
    return React.createElement(
      modules.AppDataProvider,
      null,

      React.createElement(Observer),

      show &&
        (workspace
          ? React.createElement(
              MemoryRouter,
              {
                initialEntries: [
                  "/student/workspace?mode=summary",
                ],
              },
              React.createElement(
                modules.Workspace
              )
            )
          : React.createElement(Chat))
    );
  }

  let renderer;

  await act(async () => {
    renderer = create(
      React.createElement(Root)
    );
  });

  t.after(async () => {
    await act(async () =>
      renderer.unmount()
    );
  });

  await act(async () => {
    assert.equal(
      (
        await data.login(
          student.email,
          "test-password"
        )
      ).ok,
      true
    );

    await new Promise((resolve) =>
      setImmediate(resolve)
    );
  });

  return {
    get data() {
      return data;
    },

    renderer,
    requests,
    window,
    server,

    show: async (show) => {
      await act(async () =>
        renderer.update(
          React.createElement(Root, {
            show,
          })
        )
      );
    },

    send: (plain) =>
      renderer.root
        .findByType("test-input")
        .props.onSend(
          `<p>${plain}</p>`,
          plain
        ),

    messages: () =>
      renderer.root
        .findAllByType("test-message")
        .map((node) => node.props.model),
  };
}

function button(renderer, label) {
  const found = renderer.root
    .findAllByType("button")
    .find((node) =>
      node.children.includes(label)
    );

  assert.ok(
    found,
    `Missing button: ${label}`
  );

  return found;
}

test(
  "an answer finishing after the source changes cannot appear in or be saved to the new conversation",
  async (t) => {
    const response = deferred();

    const app = await harness(t, {
      ai: () => response.promise,
    });

    await act(async () =>
      app.data.setSelectedMaterialIds([1])
    );

    let sent;

    await act(async () => {
      sent = app.send(
        "Explain source A."
      );
    });

    const oldRequest =
      app.requests.find(
        (request) =>
          request.url === "/api/ai/qa"
      );

    await act(async () =>
      app.data.setSelectedMaterialIds([2])
    );

    assert.equal(
      oldRequest.options.signal.aborted,
      true
    );

    await act(async () => {
      response.resolve(
        jsonReply({
          answer:
            "ANSWER_FOR_SOURCE_A",
          mode: "api",
        })
      );

      await sent;
    });

    assert.equal(
      app
        .messages()
        .some((message) =>
          message.message.includes(
            "ANSWER_FOR_SOURCE_A"
          )
        ),
      false
    );

    assert.equal(
      app.data.currentChatRecords.length,
      0
    );

    await act(async () =>
      app.data.setSelectedMaterialIds([1])
    );

    assert.equal(
      app.data.currentChatRecords.some(
        (record) =>
          record.text ===
          "ANSWER_FOR_SOURCE_A"
      ),
      false
    );
  }
);

test(
  "saved conversations return after leaving the chat and send recent history with follow-up questions",
  async (t) => {
    const app = await harness(t);

    await act(async () =>
      app.data.setSelectedMaterialIds([1])
    );

    await act(async () => {
      await app.send("Explain energy.");
    });

    await app.show(false);
    await app.show(true);

    assert.ok(
      app
        .messages()
        .some(
          (message) =>
            message.message ===
            "Grounded answer. [S1]"
        )
    );

    await act(async () => {
      await app.send(
        "Explain it more simply."
      );
    });

    const latest = app.requests
      .filter(
        (request) =>
          request.url === "/api/ai/qa"
      )
      .at(-1);

    assert.deepEqual(
      latest.body.history.map(
        (message) => message.role
      ),
      ["user", "model"]
    );

    assert.equal(
      latest.body.question,
      "Explain it more simply."
    );

    assert.equal(
      app.data.currentChatRecords.length,
      4
    );
  }
);

test(
  "user and AI messages use the chat kit's text mode so HTML remains literal text",
  async (t) => {
    const payload =
      '<img src=x onerror="alert(1)"><script>alert(2)</script>';

    const app = await harness(t, {
      ai: async () =>
        jsonReply({
          answer: payload,
          mode: "api",
        }),
    });

    await act(async () => {
      await app.send(payload);
    });

    for (const message of app.messages()) {
      assert.equal(
        message.type,
        "text"
      );

      const html =
        renderToStaticMarkup(
          React.createElement(
            ActualMessage,
            {
              model: message,
              type: "text",
            }
          )
        );

      assert.ok(
        html.includes("&lt;img")
      );

      assert.equal(
        html.includes("<img"),
        false
      );

      assert.equal(
        html.includes("<script>"),
        false
      );
    }
  }
);

test(
  "concurrent upload clicks accept one batch and cannot exceed the course limit",
  async (t) => {
    const app = await harness(t);

    const files = [1, 2].map(
      (id) => ({
        name: `material-${id}.txt`,
        size: 24,
        text: async () =>
          `Study material ${id}`,
      })
    );

    let results;

    await act(async () => {
      results = await Promise.all([
        app.data.addMaterials(
          files,
          "inft3050"
        ),
        app.data.addMaterials(
          files,
          "inft3050"
        ),
      ]);
    });

    assert.equal(
      results.filter(
        (result) => result.ok
      ).length,
      1
    );

    assert.equal(
      app.data.courseMaterials.length,
      4
    );

    await act(async () => {
      assert.equal(
        (
          await app.data.addMaterials(
            files,
            "inft3050"
          )
        ).ok,
        false
      );
    });

    assert.equal(
      app.data.courseMaterials.length,
      4
    );
  }
);

test(
  "an upload cancelled by logout cannot commit files into another student's session",
  async (t) => {
    const app = await harness(t);

    const reading = deferred();

    let upload;

    await act(async () => {
      upload = app.data.addMaterials(
        [
          {
            name: "slow.txt",
            size: 30,
            text: () =>
              reading.promise,
          },
        ],
        "inft3050"
      );
    });

    await act(async () => {
      await app.data.logout();

      await app.data.login(
        mia.email,
        "test-password"
      );
    });

    await act(async () => {
      reading.resolve(
        "Source from student A"
      );

      assert.equal(
        (await upload).ok,
        false
      );
    });

    assert.equal(
      app.data.currentUser.id,
      3
    );

    assert.equal(
      app.data.studentMaterials.length,
      0
    );
  }
);

test(
  "uploads roll back if browser storage cannot persist the batch",
  async (t) => {
    const app = await harness(t);

    const before =
      app.data.courseMaterials.length;

    const original =
      app.window.localStorage.setItem;

    app.window.localStorage.setItem =
      () => {
        throw new Error(
          "QuotaExceededError"
        );
      };

    let result;

    await act(async () => {
      result =
        await app.data.addMaterials(
          [
            {
              name: "extra.txt",
              size: 20,
              text: async () =>
                "Additional material",
            },
          ],
          "inft3050"
        );
    });

    app.window.localStorage.setItem =
      original;

    assert.equal(
      result.ok,
      false
    );

    assert.match(
      result.message,
      /storage is full/
    );

    assert.equal(
      app.data.courseMaterials.length,
      before
    );
  }
);

test(
  "student scores and study records stay isolated after switching accounts",
  async (t) => {
    const app = await harness(t);

    await act(async () =>
      app.data.saveQuizAttempt({
        score: 100,
        correct: 3,
        total: 3,
        answers: {},
      })
    );

    assert.equal(
      app.data.averageQuizScore,
      100
    );

    await act(async () => {
      await app.data.logout();

      await app.data.login(
        mia.email,
        "test-password"
      );
    });

    assert.equal(
      app.data.quizAttempts.length,
      0
    );

    assert.equal(
      app.data.averageQuizScore,
      0
    );

    assert.equal(
      app.data.summaryUses,
      0
    );

    assert.equal(
      app.data.qaUses,
      0
    );
  }
);

test(
  "deleting any source in a multi-file selection removes its dependent records",
  async (t) => {
    const app = await harness(t);

    await act(async () => {
      app.data.recordSummaryUse({
        paragraph: "Summary",
        concepts: ["Concept"],
      });

      app.data.addChatRecord(
        "User",
        "A question"
      );

      app.data.saveQuizAttempt({
        score: 100,
        correct: 3,
        total: 3,
        answers: {},
      });
    });

    assert.equal(
      app.data.summaryRecords[0]
        .sourceFileId,
      1
    );

    await act(async () =>
      app.data.deleteMaterial(2)
    );

    assert.equal(
      app.data.summaryRecords.length,
      0
    );

    assert.equal(
      app.data.quizAttempts.length,
      0
    );

    assert.equal(
      app.data.currentChatRecords.length,
      0
    );
  }
);

test("review shows original numbering, multiple selections, answers and repeat practice", async (t) => {
  const record = { id: "attempt", kind: "quiz", course_id: "course", created_at: "today", payload: {
    questions: [
      { id: 1, question: "Already correct", options: ["A", "B"], answerIndex: 0 },
      { id: 2, question: "Choose both", options: ["Alpha", "Beta", "Gamma", "Delta"], answerIndices: [0, 2], explanation: "Alpha and Gamma apply." },
    ], answers: { 1: 0, 2: [1] }, score: 50,
  } };
  let submitted; let submittedMode;
  const { default: History } = await loadSource("export { default } from './src/pages/student/HistoryPage.jsx';", {
    "../../state/LanguageContext": { useLanguage: () => ({ language: "en" }) },
    "../../layouts/StudentLayout": ({ children }) => React.createElement("main", null, children),
    "../../state/AppDataContext": { useAppData: () => ({ studentCourses: [], summaryRecords: [], currentChatRecords: [], quizAttempts: [] }) },
    "../../services/apiClient": { apiRequest: async (_path, options) => {
      if (options?.method === "POST") { submitted = options.body.answers; submittedMode = options.body.mode; return { answers: submitted, mode: submittedMode, correct: submittedMode === "all" ? 2 : 1, total: submittedMode === "all" ? 2 : 1, score: 100 }; }
      return { records: [record], reviews: [] };
    } },
  });
  let renderer;
  await act(async () => { renderer = create(React.createElement(History, { review: true })); });
  t.after(() => act(() => renderer.unmount()));
  await act(async () => renderer.root.findAllByType("button").find((b) => b.children.join("").includes("Quiz")).props.onClick());
  assert.equal(renderer.root.findByType("h3").children.join(""), "2. Choose both");
  assert.ok(JSON.stringify(renderer.toJSON()).includes("Beta"));
  const inputs = renderer.root.findAllByType("input");
  assert.equal(inputs.length, 4); assert.equal(inputs[0].props.type, "checkbox");
  await act(async () => inputs[2].props.onChange());
  await act(async () => inputs[0].props.onChange());
  await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.deepEqual(submitted, { 2: [2, 0] });
  assert.equal(submittedMode, "wrong");
  assert.ok(JSON.stringify(renderer.toJSON()).includes("Gamma; Alpha"));
  assert.ok(JSON.stringify(renderer.toJSON()).includes("Alpha; Gamma"));
  assert.ok(JSON.stringify(renderer.toJSON()).includes("Alpha and Gamma apply."));
  await act(async () => button(renderer, "Practise again").props.onClick());
  assert.ok(renderer.root.findAllByType("input").every((i) => !i.props.checked));
  assert.deepEqual(record.payload.answers[2], [1]);
  await act(async () => renderer.root.findByProps({ "aria-label": "Practice mode" }).props.onChange({ target: { value: "all" } }));
  assert.equal(renderer.root.findAllByType("form").length, 0, "Changing practice mode clears the previous attempt");
  await act(async () => renderer.root.findAllByType("button").find((b) => b.children.join("").includes("Quiz")).props.onClick());
  assert.deepEqual(renderer.root.findAllByType("h3").map(node => node.children.join("")), ["1. Already correct", "2. Choose both"]);
  const allInputs = renderer.root.findAllByType("input");
  await act(async () => { allInputs[0].props.onChange(); allInputs[2].props.onChange(); allInputs[4].props.onChange(); });
  await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  assert.equal(submittedMode, "all");
  assert.deepEqual(submitted, { 1: 0, 2: [0, 2] });
  assert.equal(renderer.root.findAllByType("article").filter(node => node.props.className.includes("quiz-result-correct")).length, 2);
  assert.deepEqual(record.payload.answers, { 1: 0, 2: [1] }, "Retakes must not overwrite the original answers");
});

test("history deletion waits for server success and Undo restores the same record and reviews", async (t) => {
  const record = { id: '1:summary', kind: 'summary', course_id: 'course', created_at: '2026-10-07', payload: { summary: { paragraph: 'Saved', concepts: [] } } };
  let fail = true; let active = [record]; let deleted = []; let refreshes = 0;
  const calls = [];
  const { default: History } = await loadSource("export { default } from './src/pages/student/HistoryPage.jsx';", {
    '../../layouts/StudentLayout': ({ children }) => React.createElement('main', null, children),
    '../../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) },
    '../../state/AppDataContext': { useAppData: () => ({ studentCourses: [], summaryRecords: [], currentChatRecords: [], quizAttempts: [], refreshStudyHistory: async () => { refreshes++; } }) },
    '../../services/apiClient': { apiRequest: async (url, options) => {
      calls.push({ url, method: options?.method || 'GET' });
      if (options?.method === 'DELETE') {
        if (fail) throw new Error('Delete failed');
        active = []; deleted = [record]; return { ok: true };
      }
      if (url.endsWith('/restore')) { active = [record]; deleted = []; return { record, reviews: [] }; }
      return { records: active, deletedRecords: deleted, reviews: [] };
    } },
  });
  let renderer;
  await act(async () => { renderer = create(React.createElement(History)); });
  t.after(() => act(() => renderer.unmount()));
  const remove = () => renderer.root.findByProps({ className: 'history-delete-button' });
  await act(async () => remove().props.onClick());
  assert.equal(renderer.root.findAllByProps({ className: 'history-delete-button' }).length, 1);
  assert.match(JSON.stringify(renderer.toJSON()), /Delete failed/);
  assert.equal(refreshes, 0);
  fail = false;
  await act(async () => remove().props.onClick());
  assert.equal(renderer.root.findAllByProps({ className: 'history-delete-button' }).length, 0);
  assert.equal(refreshes, 1);
  await act(async () => renderer.root.findByProps({ className: 'history-undo-banner' }).findByType('button').props.onClick());
  assert.equal(renderer.root.findAllByProps({ className: 'history-delete-button' }).length, 1);
  assert.equal(refreshes, 2);
  assert.deepEqual(calls.filter(call => call.method !== 'GET').map(call => call.url), ['/history/1%3Asummary', '/history/1%3Asummary', '/history/1%3Asummary/restore']);
});

test("profile actions open real navigation, support conversations and account-scoped progress", async (t) => {
  const window = memoryWindow();
  let logouts = 0; let ticketLoads = 0; let historyRecords = [];
  const trigger = { focus() {} };
  const data = { currentUser: { id: 1, name: 'Alex', role: 'Student' }, logout: async () => { logouts++; },
    studentCourses: [{ id: 'course', code: 'C101' }], studentMaterials: [{ id: 1 }, { id: 2 }],
    quizAttempts: [{ id: 'quiz', courseId: 'course', score: 80, completedAt: '2026-10-07' }], averageQuizScore: 80,
    summaryRecords: [{ id: 'summary', courseId: 'course', createdAt: '2026-10-07' }] };
  const { Profile, Help } = await loadSource("export { default as Profile } from './src/components/StudentProfilePanel.jsx'; export { default as Help } from './src/components/HelpAssistant.jsx';", {
    '../state/AppDataContext': { useAppData: () => data },
    '../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) },
    './AvatarPicker': () => React.createElement('div', null, 'Avatar'),
    './SupportTickets': ({ initialTicketId }) => React.createElement('div', { className: 'profile-test-inbox', ticketId: initialTicketId }),
    '../services/ticketApiService': { listServerTickets: async () => { ticketLoads++; return { tickets: [
      { id: 'ticket-1', status: 'Open', hasMessages: true }, { id: 'empty', status: 'Open', hasMessages: false },
    ] }; } },
    '../services/apiClient': { apiRequest: async () => ({ records: historyRecords }) },
  }, { window, document: { hidden: false, addEventListener() {}, removeEventListener() {} } });
  let renderer;
  await act(async () => { renderer = create(React.createElement(MemoryRouter, null, React.createElement(React.Fragment, null, React.createElement(Profile), React.createElement(Help)))); });
  t.after(() => act(() => renderer.unmount()));
  const action = label => renderer.root.findAllByType('button').find(button => button.props['aria-label'] === label);
  await act(async () => action('Profile options').props.onClick({ currentTarget: trigger }));
  assert.deepEqual(renderer.root.findAllByType('a').filter(link => link.props.role === 'menuitem').map(link => link.props.href), ['/student/profile', '/student/settings']);
  await act(async () => action('Study progress').props.onClick({ currentTarget: trigger }));
  assert.deepEqual(renderer.root.findAllByType('dd').map(node => node.children.join('')), ['1', '2', '1', '80%']);
  await act(async () => action('Notifications').props.onClick({ currentTarget: trigger }));
  assert.equal(ticketLoads, 1);
  assert.equal(renderer.root.findAllByType('a').filter(link => link.props.className === 'profile-update-item').length, 0, 'No placeholder study notifications from local sample data');
  assert.equal(renderer.root.findAllByType('button').filter(button => button.props.className === 'profile-update-item').length, 1);
  await act(async () => renderer.root.findAllByType('button').find(button => button.props.className === 'profile-update-item').props.onClick());
  assert.equal(renderer.root.findByProps({ className: 'profile-test-inbox' }).props.ticketId, 'ticket-1');
  await act(async () => action('Support messages').props.onClick());
  assert.equal(renderer.root.findByProps({ className: 'profile-test-inbox' }).props.ticketId, null);
  historyRecords = [
    { id: 'completed-quiz', kind: 'quiz', course_id: 'course', created_at: '2026-10-07 09:00:00', payload: { score: 80, correct: 4, total: 5 } },
    { id: 'generated-summary', kind: 'summary', course_id: 'course', created_at: '2026-10-07 08:00:00', payload: {} },
    { id: 'generated-cards', kind: 'flashcards', course_id: 'course', created_at: '2026-10-07 07:00:00', payload: { cards: Array.from({ length: 6 }, () => ({})) } },
    { id: 'user-question', kind: 'qa', course_id: 'course', created_at: '2026-10-07 06:00:00', payload: { role: 'User' } },
  ];
  await act(async () => action('Notifications').props.onClick({ currentTarget: trigger }));
  assert.deepEqual(renderer.root.findAllByType('a').filter(link => link.props.className === 'profile-update-item').map(link => link.findByType('strong').children.join('')), ['Quiz completed · 80% (4/5)', 'Summary generated', 'Flashcards generated · 6 cards']);
  assert.equal(renderer.root.findAllByType('time').length, 3);
  await act(async () => action('Profile options').props.onClick({ currentTarget: trigger }));
  await act(async () => renderer.root.findByProps({ className: 'profile-menu-logout' }).props.onClick());
  assert.equal(logouts, 1);
});

test("bulk history deletion requires confirmation, survives failures and restores all records", async (t) => {
  const records = [
    { id: "one", kind: "summary", course_id: "course", created_at: "2026-10-07", payload: { summary: { paragraph: "One", concepts: [] } } },
    { id: "two", kind: "summary", course_id: "course", created_at: "2026-10-06", payload: { summary: { paragraph: "Two", concepts: [] } } },
  ];
  let active = [...records]; let deleted = []; let confirmed = false; let fail = false; let refreshes = 0;
  const calls = [];
  const window = memoryWindow(); window.confirm = () => confirmed;
  const { default: History } = await loadSource("export { default } from './src/pages/student/HistoryPage.jsx';", {
    '../../layouts/StudentLayout': ({ children }) => React.createElement('main', null, children),
    '../../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) },
    '../../state/AppDataContext': { useAppData: () => ({ studentCourses: [], summaryRecords: [], currentChatRecords: [], quizAttempts: [], refreshStudyHistory: async () => { refreshes++; } }) },
    '../../services/apiClient': { apiRequest: async (url, options) => {
      if (options?.method === 'POST') {
        calls.push(url);
        if (fail) throw new Error('Temporary bulk failure');
        if (url === '/history/delete-all') { deleted = active; active = []; return { ok: true, count: deleted.length }; }
        if (url === '/history/restore-all') { active = deleted; deleted = []; return { ok: true, count: active.length }; }
      }
      return { records: active, deletedRecords: deleted, reviews: [] };
    } },
  }, { window });
  let renderer;
  await act(async () => { renderer = create(React.createElement(History)); });
  t.after(() => act(() => renderer.unmount()));
  assert.equal(button(renderer, 'Undo all').props.disabled, true);
  await act(async () => button(renderer, 'Delete all').props.onClick());
  assert.equal(calls.length, 0, 'Cancelling the confirmation sends no mutation');
  confirmed = true; fail = true;
  await act(async () => button(renderer, 'Delete all').props.onClick());
  assert.equal(renderer.root.findAllByProps({ className: 'history-record-open' }).length, 2);
  assert.match(JSON.stringify(renderer.toJSON()), /Temporary bulk failure/);
  fail = false;
  await act(async () => button(renderer, 'Delete all').props.onClick());
  assert.equal(renderer.root.findAllByProps({ className: 'history-record-open' }).length, 0);
  assert.equal(button(renderer, 'Delete all').props.disabled, true);
  assert.equal(button(renderer, 'Undo all').props.disabled, false);
  await act(async () => button(renderer, 'Undo all').props.onClick());
  assert.equal(renderer.root.findAllByProps({ className: 'history-record-open' }).length, 2);
  assert.equal(button(renderer, 'Undo all').props.disabled, true);
  assert.equal(refreshes, 2);
});

test("course display clarifies demo titles and preserves custom names and IDs", async () => {
  const { courseName, courseLabel } = await loadSource('src/utils/courseDisplay.js');
  const demos = [
    [{ id: 'inft3050', code: 'INFT3050', name: 'Study Companion' }, 'AI-Assisted Learning'],
    [{ id: 'hci', code: 'HCI', name: 'Prototype Review' }, 'User Interface Design'],
    [{ id: 'inft3851a', code: 'INFT3851A', name: 'Study Project' }, 'Applied Computing Project'],
  ];
  for (const [course, name] of demos) {
    const original = { ...course };
    assert.equal(courseName(course), name);
    assert.equal(courseLabel(course), `${name} (${course.code})`);
    assert.deepEqual(course, original);
  }
  assert.equal(courseLabel({ code: 'HCI', name: 'My Research Seminar' }), 'My Research Seminar (HCI)');
  assert.equal(courseLabel(null), '');
});

test("quiz accepts custom counts, toggles multiple answers and preserves them across tabs", async (t) => {
  let sent;
  const questions = [
    { id: 1, question: "Select two", options: ["A", "B", "C", "D"], answerIndices: [0, 2], explanation: "Both apply" },
    { id: 2, question: "Select one", options: ["A", "B", "C", "D"], answerIndices: [1], explanation: "B applies" },
  ];
  const app = await harness(t, { workspace: true, ai: async (_url, body) => {
    sent = body;
    return jsonReply({ questions, mode: "api" });
  } });
  await act(async () => button(app.renderer, "Quiz").props.onClick());
  const countInput = () => app.renderer.root.findByProps({ "aria-label": "Number of questions (1–20)" });
  for (const value of ["", "0", "21", "1.5"]) {
    await act(async () => countInput().props.onChange({ target: { value } }));
    assert.equal(button(app.renderer, "Generate Quiz").props.disabled, true);
  }
  await act(async () => countInput().props.onChange({ target: { value: "2" } }));
  await act(async () => button(app.renderer, "Generate Quiz").props.onClick());
  assert.equal(sent.questionCount, 2);
  const dots = () => app.renderer.root.findAllByType("button").filter(node => String(node.props.className || "").split(" ").includes("quiz-question-dot"));
  assert.equal(dots().length, 2);
  assert.ok(JSON.stringify(app.renderer.toJSON()).includes("0/2 answered · 2 remaining"));
  const checks = () => app.renderer.root.findAllByType("input").filter((n) => n.props.type === "checkbox" && n.props.name === "question-1");
  assert.equal(checks().length, 4);
  await act(async () => checks()[0].props.onChange());
  await act(async () => checks()[2].props.onChange());
  await act(async () => checks()[0].props.onChange());
  assert.equal(checks()[0].props.checked, false);
  await act(async () => checks()[0].props.onChange());
  await act(async () => button(app.renderer, "Q&A").props.onClick());
  await act(async () => button(app.renderer, "Quiz").props.onClick());
  assert.equal(checks()[0].props.checked, true);
  assert.equal(checks()[2].props.checked, true);
  assert.equal(countInput().props.value, "2");
  await act(async () => button(app.renderer, "Submit").props.onClick());
  assert.equal(app.data.quizAttempts.length, 0);
  await act(async () => button(app.renderer, "Next").props.onClick());
  assert.equal(app.renderer.root.findAllByType("button").filter(node => node.children.join("") === "Next").length, 0, "The final question has no Next button");
  assert.ok(JSON.stringify(app.renderer.toJSON()).includes("1/2 answered · 1 remaining"));
  await act(async () => dots()[0].props.onClick());
  assert.equal(checks()[0].props.checked, true, "Jumping back preserves the answer");
  assert.equal(dots()[0].props["aria-current"], "step");
  assert.match(dots()[0].props.className, /answered/);
  await act(async () => dots()[1].props.onClick());
  const radios = app.renderer.root.findAllByType("input").filter((n) => n.props.type === "radio");
  await act(async () => radios[0].props.onChange());
  await act(async () => button(app.renderer, "Submit").props.onClick());
  assert.equal(app.data.quizAttempts[0].score, 50);
  assert.deepEqual(app.data.quizAttempts[0].answers[1], [2, 0]);
  assert.equal(app.renderer.root.findAllByType("article").filter(node => node.props.className.includes("quiz-result-correct")).length, 1);
  assert.equal(app.renderer.root.findAllByType("article").filter(node => node.props.className.includes("quiz-result-incorrect")).length, 1);
  assert.ok(JSON.stringify(app.renderer.toJSON()).includes("C; A"));
});

test("study defaults persist, synchronize and initialize Q&A and Quiz without overriding drafts", async (t) => {
  const window = memoryWindow({ "study-interface-preferences": JSON.stringify({ answerStyle: "unknown", quizDifficulty: "easy", readingSize: "large" }) });
  const { default: usePreferences } = await loadSource("export { default } from './src/hooks/useStudyPreferences.js';", {}, { window });
  let left; let right;
  function Probe({ side }) { const state = usePreferences(); if (side === "left") left = state; else right = state; return null; }
  let renderer;
  await act(async () => { renderer = create(React.createElement(React.Fragment, null, React.createElement(Probe, { side: "left" }), React.createElement(Probe, { side: "right" }))); });
  t.after(() => act(() => renderer.unmount()));
  assert.deepEqual(left[0], { answerStyle: "simple", quizDifficulty: "easy", readingSize: "large" });
  await act(async () => left[1]("answerStyle", "detailed"));
  await act(async () => right[1]("quizDifficulty", "hard"));
  assert.deepEqual(left[0], right[0]);
  assert.deepEqual(JSON.parse(window.localStorage.getItem("study-interface-preferences")), { answerStyle: "detailed", quizDifficulty: "hard", readingSize: "large" });
  const app = await harness(t, { workspace: true, preferences: left[0] });
  await act(async () => button(app.renderer, "Q&A").props.onClick());
  const styles = () => app.renderer.root.findAllByType("select").find(node => node.findAllByType("option").some(option => option.props.value === "detailed"));
  assert.equal(styles().props.value, "detailed");
  await act(async () => styles().props.onChange({ target: { value: "hint" } }));
  await act(async () => button(app.renderer, "Quiz").props.onClick());
  const difficulty = app.renderer.root.findAllByType("select").find(node => node.findAllByType("option").some(option => option.props.value === "hard"));
  assert.equal(difficulty.props.value, "hard");
  await act(async () => button(app.renderer, "Q&A").props.onClick());
  assert.equal(styles().props.value, "hint", "Existing workspace choice takes priority over the default");
});

test(
  "summary and quiz buttons generate results from the API; scoring follows the returned questions",
  async (t) => {
    const questions = [1, 3, 0, 2, 1].map(
      (answerIndex, index) => ({
        id: index + 1,
        question: `Course fact ${
          index + 1
        }?`,
        options: [
          "A",
          "B",
          "C",
          "D",
        ],
        answerIndex,
        explanation:
          "Explanation from [S1].",
      })
    );

    const app = await harness(t, {
      workspace: true,

      ai: async (url) =>
        url.endsWith("summary")
          ? jsonReply({
              paragraph:
                "A summary returned by the API.",
              concepts: [
                "A course concept [S1].",
              ],
              mode: "api",
            })
          : jsonReply({
              questions,
              mode: "api",
            }),
    });

    await act(async () => {
      await button(
        app.renderer,
        "Generate Summary"
      ).props.onClick();
    });

    assert.equal(
      app.data.summaryRecords[0]
        .summary.paragraph,
      "A summary returned by the API."
    );

    assert.ok(
      JSON.stringify(
        app.renderer.toJSON()
      ).includes(
        "A summary returned by the API."
      )
    );

    await act(async () =>
      button(
        app.renderer,
        "Quiz"
      ).props.onClick()
    );

    await act(async () => {
      await button(
        app.renderer,
        "Generate Quiz"
      ).props.onClick();
    });

    for (
      let index = 0;
      index < questions.length;
      index += 1
    ) {
      const radios =
        app.renderer.root
          .findAllByType("input")
          .filter(
            (node) =>
              node.props.type === "radio"
          );

      await act(async () =>
        radios[
          questions[index].answerIndex
        ].props.onChange()
      );

      if (index === 0) {
        await act(async () => button(app.renderer, 'Q&A').props.onClick());
        await act(async () => button(app.renderer, 'Quiz').props.onClick());
        const restored = app.renderer.root.findAllByType('input').filter(node => node.props.type === 'radio');
        assert.equal(restored[questions[0].answerIndex].props.checked, true, 'Switching to Q&A must preserve the selected quiz answer');
        assert.ok(button(app.renderer, 'Generate New Quiz'), 'Generated questions survive switching AI tabs');
      }

      if (
        index <
        questions.length - 1
      ) {
        await act(async () =>
          button(
            app.renderer,
            "Next"
          ).props.onClick()
        );
      }
    }

    await act(async () => {
      const submit = button(
        app.renderer,
        "Submit"
      ).props.onClick;

      submit();
      submit();
    });

    assert.equal(
      app.data.quizAttempts.length,
      1
    );

    assert.equal(
      app.data.quizAttempts[0].score,
      100
    );

    await act(async () =>
      app.data.setSelectedMaterialIds([2])
    );

    assert.ok(
      button(
        app.renderer,
        "Generate Quiz"
      )
    );

    assert.equal(
      app.renderer.root
        .findAllByType("input")
        .filter(
          (node) =>
            node.props.type === "radio"
        ).length,
      0
    );
  }
);

/* =========================================================
   DATABASE / USER ISOLATION TESTS
   ========================================================= */

test(
  "server courses are authoritative, retryable, and never reused across student accounts",
  async (t) => {
    let failCourses = true;

    const app = await harness(t, {
      courseApi: ({
        url,
        options,
      }) => {
        if (
          url === "/api/courses" &&
          (options.method || "GET") ===
            "GET" &&
          failCourses
        ) {
          return jsonReply(
            {
              code:
                "SERVICE_UNAVAILABLE",
              message:
                "Courses are temporarily unavailable.",
            },
            503
          );
        }

        return null;
      },
    });

    assert.match(
      app.data.courseState.error,
      /temporarily unavailable/i
    );

    assert.equal(
      app.data.studentCourses.length,
      0
    );

    failCourses = false;

    await act(async () => {
      app.data.retryCourses();

      await new Promise((resolve) =>
        setImmediate(resolve)
      );
    });

    assert.equal(
      app.data.studentCourses.length,
      3
    );

    app.window.localStorage.setItem(
      "unrelated-ui-preference",
      "keep-me"
    );

    await act(async () => {
      await app.data.logout();

      await app.data.login(
        mia.email,
        "test-password"
      );

      await new Promise((resolve) =>
        setImmediate(resolve)
      );
    });

    assert.equal(
      app.data.currentUser.id,
      3
    );

    assert.equal(
      app.data.studentCourses.length,
      0
    );

    assert.equal(
      app.data.studentMaterials.length,
      0
    );

    assert.equal(
      app.window.localStorage.getItem(
        "unrelated-ui-preference"
      ),
      "keep-me"
    );

    const courseRequests =
      app.requests.filter(
        (request) =>
          request.url ===
            "/api/courses" &&
          (request.options.method ||
            "GET") === "GET"
      );

    assert.equal(
      courseRequests.at(-1).options.credentials,
      "same-origin"
    );
  }
);

test(
  "a slower materials response cannot overwrite the course selected afterwards",
  async (t) => {
    const old = deferred();

    const app = await harness(t, {
      courseApi: ({
        url,
        options,
      }) => {
        if (
          url ===
            "/api/courses/hci/materials" &&
          (options.method || "GET") ===
            "GET"
        ) {
          return old.promise;
        }

        return null;
      },
    });

    await act(async () =>
      app.data.selectCourse("hci")
    );

    const oldRequest =
      app.requests.find(
        (request) =>
          request.url ===
          "/api/courses/hci/materials"
      );

    await act(async () => {
      app.data.selectCourse(
        "inft3851a"
      );

      await new Promise((resolve) =>
        setImmediate(resolve)
      );
    });

    assert.equal(
      oldRequest.options.signal.aborted,
      true
    );

    await act(async () => {
      old.resolve(
        jsonReply({
          materials: [
            {
              id: 99,
              course_id: "hci",
              name: "late.txt",
              type: "TXT",
              size_bytes: 1,
              status: "Ready",
              content: "late",
              created_at: "x",
              updated_at: "x",
            },
          ],
        })
      );

      await new Promise((resolve) =>
        setImmediate(resolve)
      );
    });

    assert.equal(
      app.data.currentCourseId,
      "inft3851a"
    );

    assert.deepEqual(
      app.data.courseMaterials.map(
        (material) => material.id
      ),
      [3]
    );

    assert.equal(
      app.data.studentMaterials.some(
        (material) =>
          material.id === 99
      ),
      false
    );
  }
);

test(
  "upload persists complete extracted text and a failed POST cannot create false UI success",
  async (t) => {
    let failPost = false;

    const app = await harness(t, {
      courseApi: ({
        url,
        options,
      }) => {
        if (
          failPost &&
          url ===
            "/api/courses/inft3050/materials" &&
          options.method === "POST"
        ) {
          return jsonReply(
            {
              code: "SAVE_FAILED",
              message:
                "Material could not be saved.",
            },
            500
          );
        }

        return null;
      },
    });

    const fullText = `${"complete ".repeat(
      3000
    )}END OF SOURCE`;

    let result;

    await act(async () => {
      result =
        await app.data.addMaterials(
          [
            {
              name: "complete.txt",
              size: 24013,
              text: async () =>
                fullText,
            },
          ],
          "inft3050"
        );
    });

    assert.equal(
      result.ok,
      true
    );

    const post =
      app.requests.find(
        (request) =>
          request.url ===
            "/api/courses/inft3050/materials" &&
          request.options.method ===
            "POST"
      );

    assert.equal(
      post.body.content,
      fullText
    );

    assert.equal(
      "owner_id" in post.body ||
        "ownerId" in post.body,
      false
    );

    assert.equal(
      app.data.courseMaterials.some(
        (material) =>
          material.content ===
          fullText
      ),
      true
    );

    const before =
      app.data.courseMaterials.length;

    failPost = true;

    await act(async () => {
      result =
        await app.data.addMaterials(
          [
            {
              name: "failed.txt",
              size: 8,
              text: async () =>
                "not saved",
            },
          ],
          "inft3050"
        );
    });

    assert.equal(
      result.ok,
      false
    );

    assert.match(
      result.message,
      /could not be saved/i
    );

    assert.equal(
      app.data.courseMaterials.length,
      before
    );

    assert.equal(
      app.data.courseMaterials.some(
        (material) =>
          material.name ===
          "failed.txt"
      ),
      false
    );
  }
);

test(
  "failed deletion retains the material and selection; successful deletion cleans every dependent scope",
  async (t) => {
    let failDelete = true;

    const app = await harness(t, {
      courseApi: ({
        url,
        options,
      }) => {
        if (
          failDelete &&
          url ===
            "/api/materials/1" &&
          options.method === "DELETE"
        ) {
          return jsonReply(
            {
              code:
                "DELETE_FAILED",
              message:
                "Material could not be deleted.",
            },
            500
          );
        }

        return null;
      },
    });

    await act(async () => {
      app.data.setSelectedMaterialIds([
        1,
        2,
      ]);

      app.data.recordSummaryUse({
        paragraph: "Summary",
        concepts: [],
      });

      app.data.addChatRecord(
        "User",
        "Question"
      );

      app.data.saveQuizAttempt({
        score: 100,
        correct: 1,
        total: 1,
        answers: {},
      });
    });

    let result;

    await act(async () => {
      result =
        await app.data.deleteMaterial(1);
    });

    assert.equal(
      result.ok,
      false
    );

    assert.equal(
      app.data.courseMaterials.some(
        (material) =>
          material.id === 1
      ),
      true
    );

    assert.deepEqual(
      app.data.selectedMaterialIds,
      [1, 2]
    );

    assert.equal(
      app.data.summaryRecords.length,
      1
    );

    failDelete = false;

    await act(async () => {
      result =
        await app.data.deleteMaterial(1);
    });

    assert.equal(
      result.ok,
      true
    );

    assert.equal(
      app.data.courseMaterials.some(
        (material) =>
          material.id === 1
      ),
      false
    );

    assert.deepEqual(
      app.data.selectedMaterialIds,
      [2]
    );

    assert.equal(
      app.data.summaryRecords.length,
      0
    );

    assert.equal(
      app.data.currentChatRecords.length,
      0
    );

    assert.equal(
      app.data.quizAttempts.length,
      0
    );
  }
);

test(
  "logout aborts resource loads and a late response cannot repopulate the signed-out UI",
  async (t) => {
    const slow = deferred();

    const app = await harness(t, {
      courseApi: ({
        url,
        options,
      }) => {
        if (
          url ===
            "/api/courses/hci/materials" &&
          (options.method || "GET") ===
            "GET"
        ) {
          return slow.promise;
        }

        return null;
      },
    });

    await act(async () =>
      app.data.selectCourse("hci")
    );

    const request =
      app.requests.find(
        (item) =>
          item.url ===
          "/api/courses/hci/materials"
      );

    await act(async () =>
      app.data.logout()
    );

    assert.equal(
      request.options.signal.aborted,
      true
    );

    await act(async () => {
      slow.resolve(
        jsonReply({
          materials: [
            {
              id: 101,
              course_id: "hci",
              name: "late.txt",
              type: "TXT",
              size_bytes: 1,
              status: "Ready",
              content: "late",
              created_at: "x",
              updated_at: "x",
            },
          ],
        })
      );

      await new Promise((resolve) =>
        setImmediate(resolve)
      );
    });

    assert.equal(
      app.data.currentUser,
      null
    );

    assert.equal(
      app.data.studentCourses.length,
      0
    );

    assert.equal(
      app.data.studentMaterials.length,
      0
    );
  }
);

/* =========================================================
   CHEN TINGSHU AI FEATURE TESTS
   ========================================================= */

test(
  "Q&A answer style, quiz difficulty, and flashcards reach the existing AI workflow",
  async (t) => {
    const questions = [
      0,
      1,
      2,
    ].map((answerIndex, index) => ({
      id: index + 1,
      question: `Question ${
        index + 1
      }?`,
      options: [
        "A",
        "B",
        "C",
        "D",
      ],
      answerIndex,
      explanation:
        "Explanation [S1].",
    }));

    const cards = Array.from(
      {
        length: 6,
      },
      (_, index) => ({
        id: index + 1,
        front: `Card front ${
          index + 1
        }`,
        back: `Card back ${
          index + 1
        }`,
        source: "[S1]",
      })
    );

    const app = await harness(t, {
      workspace: true,

      ai: async (url) => {
        if (
          url.endsWith("/qa")
        ) {
          return jsonReply({
            answer:
              "Styled answer [S1].",
            mode: "api",
          });
        }

        if (
          url.endsWith("/quiz")
        ) {
          return jsonReply({
            questions,
            mode: "api",
          });
        }

        if (
          url.endsWith("/flashcards")
        ) {
          return jsonReply({
            cards,
            mode: "api",
          });
        }

        return jsonReply({
          paragraph: "Summary",
          concepts: [
            "Concept [S1]",
          ],
          mode: "api",
        });
      },
    });

    /* -------------------------
       Q&A Answer Style
       ------------------------- */

    await act(async () =>
      button(
        app.renderer,
        "Q&A"
      ).props.onClick()
    );

    const answerStyle =
      app.renderer.root
        .findAllByType("select")
        .find(
          (node) =>
            node.props.value ===
            "simple"
        );

    assert.ok(
      answerStyle,
      "Missing Q&A answer style selector"
    );

    await act(async () =>
      answerStyle.props.onChange({
        target: {
          value: "example",
        },
      })
    );

    await act(async () => {
      await app.send(
        "Explain this topic."
      );
    });

    assert.equal(
      app.requests
        .filter(
          (request) =>
            request.url ===
            "/api/ai/qa"
        )
        .at(-1).body.answerStyle,
      "example"
    );

    /* -------------------------
       Quiz Difficulty
       ------------------------- */

    await act(async () =>
      button(
        app.renderer,
        "Quiz"
      ).props.onClick()
    );

    const difficulty =
      app.renderer.root
        .findAllByType("select")
        .find(
          (node) =>
            node.props.value ===
            "medium"
        );

    assert.ok(
      difficulty,
      "Missing quiz difficulty selector"
    );

    await act(async () =>
      difficulty.props.onChange({
        target: {
          value: "hard",
        },
      })
    );

    await act(async () => {
      await button(
        app.renderer,
        "Generate Quiz"
      ).props.onClick();
    });

    assert.equal(
      app.requests
        .filter(
          (request) =>
            request.url ===
            "/api/ai/quiz"
        )
        .at(-1).body.difficulty,
      "hard"
    );

    /* -------------------------
       AI Flashcards
       ------------------------- */

    await act(async () =>
      button(
        app.renderer,
        "Flashcards"
      ).props.onClick()
    );

    await act(async () => {
      await button(
        app.renderer,
        "Generate Flashcards"
      ).props.onClick();
    });

    assert.ok(
      JSON.stringify(
        app.renderer.toJSON()
      ).includes(
        "Card front 1"
      )
    );

    const firstCard =
      app.renderer.root
        .findAllByType("button")
        .find(
          (node) =>
            node.props[
              "aria-pressed"
            ] === false
        );

    assert.ok(
      firstCard,
      "Missing generated flashcard"
    );

    await act(async () =>
      firstCard.props.onClick()
    );

    assert.ok(
      JSON.stringify(
        app.renderer.toJSON()
      ).includes(
        "Card back 1"
      )
    );
  }
);

test(
  "workspace blocks Summary, Q&A, and Quiz when no material is selected",
  async (t) => {
    const app = await harness(t, {
      workspace: true,
    });

    await act(async () =>
      app.data.setSelectedMaterialIds([])
    );

    const summary = button(
      app.renderer,
      "Generate Summary"
    );
    assert.equal(summary.props.disabled, true);

    await act(async () =>
      summary.props.onClick()
    );

    assert.equal(
      app.requests.some((request) =>
        /^\/api\/ai\/(summary|qa|quiz)$/.test(
          request.url
        )
      ),
      false
    );
    assert.match(
      JSON.stringify(app.renderer.toJSON()),
      /Select at least one material/i
    );

    await act(async () =>
      button(app.renderer, "Q&A").props.onClick()
    );
    assert.equal(
      app.renderer.root.findByType("test-input")
        .props.disabled,
      true
    );

    await act(async () =>
      button(app.renderer, "Quiz").props.onClick()
    );
    assert.equal(
      button(app.renderer, "Generate Quiz").props
        .disabled,
      true
    );
  }
);

test(
  "repeated Summary clicks send one request and store one result",
  async (t) => {
    const response = deferred();
    const app = await harness(t, {
      workspace: true,
      ai: () => response.promise,
    });
    const generate = button(
      app.renderer,
      "Generate Summary"
    ).props.onClick;
    let first;
    let second;

    await act(async () => {
      first = generate();
      second = generate();
      await new Promise((resolve) =>
        setImmediate(resolve)
      );
    });

    assert.equal(
      app.requests.filter(
        (request) =>
          request.url === "/api/ai/summary"
      ).length,
      1
    );
    assert.equal(
      button(app.renderer, "Generating…").props
        .disabled,
      true
    );

    await act(async () => {
      response.resolve(
        jsonReply({
          paragraph: "One accepted summary. [S1]",
          concepts: ["One concept [S1]"],
          mode: "api",
        })
      );
      await Promise.all([first, second]);
    });

    assert.equal(app.data.summaryRecords.length, 1);
    assert.equal(
      app.data.summaryRecords[0].summary.paragraph,
      "One accepted summary. [S1]"
    );
  }
);

test(
  "switching course during Summary generation aborts and discards the old result",
  async (t) => {
    const response = deferred();
    const app = await harness(t, {
      workspace: true,
      ai: () => response.promise,
    });
    let generation;

    await act(async () => {
      generation = button(
        app.renderer,
        "Generate Summary"
      ).props.onClick();
      await new Promise((resolve) =>
        setImmediate(resolve)
      );
    });

    const oldRequest = app.requests.find(
      (request) =>
        request.url === "/api/ai/summary"
    );

    await act(async () => {
      app.data.selectCourse("inft3851a");
      await new Promise((resolve) =>
        setImmediate(resolve)
      );
    });

    assert.equal(
      oldRequest.options.signal.aborted,
      true
    );

    await act(async () => {
      response.resolve(
        jsonReply({
          paragraph: "STALE COURSE SUMMARY",
          concepts: ["Stale"],
          mode: "api",
        })
      );
      await generation;
    });

    assert.equal(
      app.data.currentCourseId,
      "inft3851a"
    );
    assert.equal(
      app.data.summaryRecords.some(
        (record) =>
          record.summary.paragraph ===
          "STALE COURSE SUMMARY"
      ),
      false
    );
  }
);

test(
  "Summary failure is visible, records no success, and allows a retry",
  async (t) => {
    let fail = true;
    const app = await harness(t, {
      workspace: true,
      ai: async () =>
        fail
          ? jsonReply(
              {
                code: "AI_UNAVAILABLE",
                message:
                  "AI service is temporarily unavailable.",
              },
              503
            )
          : jsonReply({
              paragraph: "Recovered summary. [S1]",
              concepts: ["Recovery [S1]"],
              mode: "api",
            }),
    });

    await act(async () => {
      await button(
        app.renderer,
        "Generate Summary"
      ).props.onClick();
    });

    assert.match(
      JSON.stringify(app.renderer.toJSON()),
      /AI service is temporarily unavailable/i
    );
    assert.equal(app.data.summaryRecords.length, 0);
    assert.ok(button(app.renderer, "Generate Summary"));

    fail = false;

    await act(async () => {
      await button(
        app.renderer,
        "Generate Summary"
      ).props.onClick();
    });

    assert.equal(app.data.summaryRecords.length, 1);
    assert.equal(
      app.data.summaryRecords[0].summary.paragraph,
      "Recovered summary. [S1]"
    );
  }
);
