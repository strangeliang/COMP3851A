import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { deferred, loadSource, memoryWindow } from './helpers.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.children || []).map(text).join('');
const button = (renderer, label) => {
  const found = renderer.root.findAllByType('button').find(node => text(node) === label);
  assert.ok(found, `Missing button: ${label}`);
  return found;
};
const history = id => ({ records: [{ id, owner_id: 1, course_id: 'course', kind: 'summary', created_at: id, payload: { summary: { paragraph: id, concepts: [] } } }], reviews: [] });

async function historyHarness(t, handler) {
  const context = { currentUser: { id: 1 }, studentCourses: [{ id: 'course', code: 'CS', name: 'Course' }], summaryRecords: [], currentChatRecords: [], quizAttempts: [] };
  const calls = [];
  const { default: History } = await loadSource("export {default} from './src/pages/student/HistoryPage.jsx';", {
    '../../layouts/StudentLayout': ({ children }) => React.createElement('main', null, children),
    '../../components/HistoryRecordDialog': ({ children }) => React.createElement('section', { role: 'dialog' }, children),
    '../../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) },
    '../../state/AppDataContext': { useAppData: () => context },
    '../../services/apiClient': { apiRequest: (url, options = {}) => { calls.push({ url, ...options }); return handler(calls.length, options); } },
  }, { window: memoryWindow() });
  let renderer;
  await act(async () => { renderer = create(React.createElement(History)); });
  t.after(() => act(() => renderer.unmount()));
  return { renderer, context, calls, render: () => act(async () => renderer.update(React.createElement(History))) };
}

test('history ignores a superseded initial response and keeps Refresh pending until the current read finishes', async t => {
  const initial = deferred(), latest = deferred();
  const app = await historyHarness(t, number => number === 1 ? initial.promise : latest.promise);
  assert.equal(button(app.renderer, 'Refresh records').props.disabled, true, 'The first read must block conflicting actions');
  await act(async () => { button(app.renderer, 'Refresh records').props.onClick(); });
  assert.equal(app.calls[0].signal.aborted, true);
  await act(async () => { initial.resolve(history('STALE_RECORD')); });
  assert.equal(button(app.renderer, 'Refresh records').props.disabled, true, 'An old response must not unlock a newer read');
  await act(async () => { latest.resolve(history('LATEST_RECORD')); });
  assert.match(text(app.renderer.toJSON()), /LATEST_RECORD/);
  assert.doesNotMatch(text(app.renderer.toJSON()), /STALE_RECORD/);
});

test('history clears the previous account immediately and ignores its late response', async t => {
  const oldRead = deferred(), newRead = deferred();
  const app = await historyHarness(t, number => number === 1 ? oldRead.promise : newRead.promise);
  app.context.currentUser = { id: 2 };
  await app.render();
  assert.equal(app.calls.length, 2);
  assert.equal(app.calls[0].signal.aborted, true);
  await act(async () => { newRead.resolve(history('SECOND_ACCOUNT')); });
  await act(async () => { oldRead.resolve(history('FIRST_ACCOUNT')); });
  assert.match(text(app.renderer.toJSON()), /SECOND_ACCOUNT/);
  assert.doesNotMatch(text(app.renderer.toJSON()), /FIRST_ACCOUNT/);
});

test('history recovers from an initial read failure using Refresh', async t => {
  const app = await historyHarness(t, number => number === 1 ? Promise.reject(new Error('Temporary history outage')) : Promise.resolve(history('RECOVERED_RECORD')));
  assert.match(text(app.renderer.toJSON()), /Temporary history outage/);
  assert.equal(button(app.renderer, 'Refresh records').props.disabled, false);
  await act(async () => { await button(app.renderer, 'Refresh records').props.onClick(); });
  assert.match(text(app.renderer.toJSON()), /RECOVERED_RECORD/);
  assert.doesNotMatch(text(app.renderer.toJSON()), /Temporary history outage/);
});

test('switching accounts stops the remaining browser-history imports', async t => {
  const save = deferred();
  const app = await historyHarness(t, (_number, options) => options.method === 'POST' ? save.promise : Promise.resolve({ records: [], reviews: [] }));
  app.context.summaryRecords = [{ id: 'first', courseId: 'course' }, { id: 'second', courseId: 'course' }];
  await app.render();
  await act(async () => { button(app.renderer, 'Import older browser records').props.onClick(); });
  assert.equal(app.calls.filter(call => call.method === 'POST').length, 1);
  app.context.currentUser = { id: 2 };
  app.context.summaryRecords = [];
  await app.render();
  await act(async () => { save.resolve({ ok: true }); });
  assert.equal(app.calls.filter(call => call.method === 'POST').length, 1, 'The next request must not send the old account payload using the new session');
});

test('an abandoned upload cannot clear a new queue after leaving and returning to the same course', async t => {
  const upload = deferred();
  const state = { currentUser: { id: 1 }, studentCourses: [{ id: 'course', code: 'CS', name: 'Course' }], materials: [], currentCourse: { id: 'course' }, currentCourseId: 'course', courseMaterials: [],
    selectCourse() {}, deleteMaterial() {}, cancelUpload() {}, retryCourses() {}, retryMaterials() {},
    uploadState: { pending: false }, courseState: { loading: false }, materialState: { loading: false }, addMaterials: () => upload.promise };
  const { default: Upload } = await loadSource("export {default} from './src/pages/student/UploadPage.jsx';", {
    '../../state/AppDataContext': { useAppData: () => state },
    '../../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) },
    '../../layouts/StudentLayout': ({ children }) => React.createElement('main', null, children),
    '../../components/Toolbar': () => null,
  });
  let renderer;
  await act(async () => { renderer = create(React.createElement(Upload)); });
  t.after(() => act(() => renderer.unmount()));
  const pick = name => act(() => renderer.root.findByProps({ type: 'file' }).props.onChange({ target: { value: '', files: [{ name, size: 50, lastModified: 1 }] } }));
  await pick('old.txt');
  await act(async () => { button(renderer, 'Upload All').props.onClick(); });
  state.currentCourseId = 'other';
  await act(() => renderer.update(React.createElement(Upload)));
  state.currentCourseId = 'course';
  await act(() => renderer.update(React.createElement(Upload)));
  await pick('new.txt');
  await act(async () => { upload.resolve({ ok: true, message: 'Old upload completed' }); });
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Remove new.txt' }).length, 1, 'The new queue belongs to this visit, not the abandoned upload');
  assert.doesNotMatch(text(renderer.toJSON()), /Old upload completed/);
  state.currentUser = { id: 2 };
  await act(() => renderer.update(React.createElement(Upload)));
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Remove new.txt' }).length, 0, 'Account changes must also clear local file selections');
});
