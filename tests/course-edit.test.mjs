import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { deferred, jsonReply, loadSource, memoryWindow } from './helpers.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.children || []).map(text).join('');
const button = (root, name) => root.findAllByType('button').find(node => text(node) === name);
const event = () => ({ stopped: false, stopPropagation() { this.stopped = true; }, preventDefault() {} });
const initialCourses = [{ id: 'a', ownerId: 1, code: 'SCI', name: 'Science' }, { id: 'b', ownerId: 1, code: 'MATH', name: 'Math' }];

async function dashboard(t, { handler, language = 'en' } = {}) {
  const calls = [], selected = [], deleted = [];
  const data = { currentUser: { id: 1, name: 'Reader' }, studentCourses: structuredClone(initialCourses), currentCourseId: 'a',
    selectedMaterialIds: [1], courseState: { ready: true }, materialState: {}, pendingStudyCount: 0,
    selectCourse: id => selected.push(id), createCourse: async () => ({ ok: true }), deleteCourse: id => deleted.push(id), retryCourses() {},
    updateCourse: async (id, fields) => {
      calls.push({ id, fields });
      return handler ? handler(id, fields) : { ok: true };
    },
  };
  const { default: Dashboard } = await loadSource("export {default} from './src/pages/student/DashboardPage.jsx';", {
    '../../state/AppDataContext': { useAppData: () => data },
    '../../state/LanguageContext': { useLanguage: () => ({ language }) },
    '../../layouts/StudentLayout': ({ children }) => React.createElement('main', null, children),
    '../../components/Toolbar': () => null,
    '../../components/HistoryRecordDialog': ({ children, title, closeLabel, onClose }) => React.createElement('section', { role: 'dialog', 'aria-label': title }, React.createElement('button', { onClick: onClose }, closeLabel), children),
    'react-router-dom': { Link: ({ to, children }) => React.createElement('a', { href: to }, children), useNavigate: () => () => {} },
    '../../services/apiClient': { apiRequest: async () => ({ records: [], reviews: [] }) },
    '../../services/courseMaterialService': { getCourseMaterials: async () => [] },
  }, { window: memoryWindow() });
  let renderer, mounted = true;
  await act(async () => { renderer = create(React.createElement(Dashboard)); });
  const unmount = async () => { if (mounted) { await act(async () => renderer.unmount()); mounted = false; } };
  t.after(unmount);
  return { renderer, data, calls, selected, deleted, unmount,
    update: async () => act(async () => renderer.update(React.createElement(Dashboard))),
    open: async (index = 0) => { const click = event(); await act(async () => renderer.root.findAllByProps({ className: 'dashboard-course-edit' })[index].props.onClick(click)); return click; },
    field: async (id, value) => act(async () => renderer.root.findByProps({ id }).props.onChange({ target: { value } })),
  };
}

test('each course has an independent editor; cancel keeps saved fields and does not select or delete a course', async t => {
  const app = await dashboard(t);
  const original = structuredClone(app.data.studentCourses);
  assert.equal(app.renderer.root.findAllByProps({ className: 'dashboard-course-edit' }).length, 2);
  const click = await app.open(1);
  assert.equal(click.stopped, true);
  assert.equal(app.renderer.root.findByProps({ id: 'course-edit-code' }).props.value, 'MATH');
  assert.equal(app.renderer.root.findByProps({ id: 'course-edit-name' }).props.maxLength, 120);
  await app.field('course-edit-name', 'Unsubmitted draft');
  await act(async () => button(app.renderer.root, 'Cancel').props.onClick());
  assert.equal(app.renderer.root.findAllByProps({ role: 'dialog' }).length, 0);
  await app.open(1);
  assert.equal(app.renderer.root.findByProps({ id: 'course-edit-name' }).props.value, 'Math');
  assert.deepEqual(app.data.studentCourses, original);
  assert.deepEqual(app.calls, []); assert.deepEqual(app.selected, []); assert.deepEqual(app.deleted, []);
});

test('demo course editing starts from its visible title and cancel never rewrites the stored original', async t => {
  const app = await dashboard(t);
  app.data.studentCourses[0] = { id: 'a', ownerId: 1, code: 'INFT3050', name: 'Study Companion' };
  await app.update();
  await app.open();
  assert.equal(app.renderer.root.findByProps({ id: 'course-edit-name' }).props.value, 'AI-Assisted Learning');
  await act(async () => button(app.renderer.root, 'Cancel').props.onClick());
  assert.equal(app.data.studentCourses[0].name, 'Study Companion');
  assert.deepEqual(app.calls, []);
});

test('course save keeps failed input, prevents duplicate requests and closes only after confirmed success', async t => {
  let pending = deferred();
  const app = await dashboard(t, { handler: () => pending.promise });
  await app.open();
  await app.field('course-edit-code', 'EDIT'); await app.field('course-edit-name', 'Edited science');
  let saving;
  await act(async () => {
    const submit = app.renderer.root.findByProps({ className: 'dashboard-course-editor' }).props.onSubmit;
    saving = submit(event()); await submit(event());
  });
  assert.equal(app.calls.length, 1);
  assert.equal(app.renderer.root.findByProps({ className: 'dashboard-course-editor' }).findByType('fieldset').props.disabled, true);
  await act(async () => button(app.renderer.root, 'Cancel editing').props.onClick());
  assert.equal(app.renderer.root.findAllByProps({ role: 'dialog' }).length, 1, 'A pending server write cannot be presented as cancelled');
  await act(async () => { pending.resolve({ ok: false, code: 'DUPLICATE_RECORD' }); await saving; });
  assert.match(text(app.renderer.root.findByProps({ role: 'alert' })), /already have a course/);
  assert.equal(app.renderer.root.findByProps({ id: 'course-edit-name' }).props.value, 'Edited science');
  assert.equal(app.data.studentCourses[0].name, 'Science');
  pending = deferred();
  await act(async () => { saving = app.renderer.root.findByProps({ className: 'dashboard-course-editor' }).props.onSubmit(event()); });
  await act(async () => { pending.resolve({ ok: true }); await saving; });
  assert.equal(app.calls.length, 2);
  assert.equal(app.renderer.root.findAllByProps({ role: 'dialog' }).length, 0);
  assert.match(text(app.renderer.root), /Course updated/);
  assert.deepEqual(app.selected, []); assert.deepEqual(app.deleted, []);
});

test('Chinese course controls keep learner text and account changes discard late editor feedback', async t => {
  const pending = deferred();
  const app = await dashboard(t, { language: 'zh', handler: () => pending.promise });
  await app.open();
  assert.equal(app.renderer.root.findByProps({ role: 'dialog' }).props['aria-label'], '编辑课程');
  assert.equal(app.renderer.root.findByProps({ id: 'course-edit-name' }).props.value, 'Science');
  await app.field('course-edit-name', '用户课程名称');
  let saving;
  await act(async () => { saving = app.renderer.root.findByProps({ className: 'dashboard-course-editor' }).props.onSubmit(event()); });
  app.data.currentUser = { id: 2, name: 'Other reader' };
  app.data.studentCourses = [{ id: 'other', ownerId: 2, name: 'Other course', code: 'OTHER' }];
  await app.update();
  assert.equal(app.renderer.root.findAllByProps({ role: 'dialog' }).length, 0);
  await act(async () => { pending.resolve({ ok: true }); await saving; });
  assert.doesNotMatch(text(app.renderer.root), /课程已更新|用户课程名称/);
});

test('the course service uses PATCH with the session cookie and rejects a different returned course ID', async () => {
  let mismatch = false; const calls = [];
  const service = await loadSource('src/services/courseMaterialService.js', {}, { window: memoryWindow(), fetch: async (url, options) => {
    calls.push({ url, options }); return jsonReply({ course: { id: mismatch ? 'wrong' : 'course/id', code: 'NEW', name: 'New name' } });
  } });
  const result = await service.updateCourse('course/id', { code: 'NEW', name: 'New name', ownerId: 99 }, 1);
  assert.equal(result.ownerId, 1); assert.equal(result.id, 'course/id');
  assert.equal(calls[0].url, '/api/courses/course%2Fid');
  assert.equal(calls[0].options.method, 'PATCH'); assert.equal(calls[0].options.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(calls[0].options.body), { code: 'NEW', name: 'New name' });
  mismatch = true;
  await assert.rejects(service.updateCourse('course/id', { code: 'NEW', name: 'New name' }, 1), error => error.code === 'INVALID_SERVER_RESPONSE');
});

test('context edits preserve material selection and history, reject duplicates, and ignore a response after login changes', async t => {
  const first = { id: 1, name: 'First', email: 'first@edit.invalid', role: 'Student' };
  const second = { id: 2, name: 'Second', email: 'second@edit.invalid', role: 'Student' };
  let user = first, pending = deferred(); const patches = [];
  const courses = { 1: [{ id: 'a', code: 'SCI', name: 'Science' }, { id: 'b', code: 'MATH', name: 'Math' }], 2: [{ id: 'other', code: 'OTHER', name: 'Other course' }] };
  const material = { id: 1, course_id: 'a', name: 'notes.txt', type: 'TXT', size_bytes: 10, content: 'Exact text', reading_notes: 'Original reading note' };
  const record = { id: 'saved', kind: 'summary', course_id: 'a', payload: { selectedMaterialIds: [1], summary: { paragraph: 'Saved summary', concepts: [] } } };
  const { AppDataProvider, useAppData } = await loadSource('src/state/AppDataContext.jsx', {}, { window: memoryWindow(), fetch: async (url, options = {}) => {
    if (url === '/api/auth/me') return jsonReply({ user });
    if (url === '/api/auth/login') { user = second; return jsonReply({ user }); }
    if (url === '/api/ai/status') return jsonReply({ configured: false });
    if (url === '/api/history') return jsonReply({ records: user.id === 1 ? [record] : [], reviews: [] });
    if (url === '/api/courses') return jsonReply({ courses: courses[user.id] });
    if (url.endsWith('/materials')) return jsonReply({ materials: user.id === 1 ? [material] : [] });
    if (options.method === 'PATCH') { patches.push(options); return pending.promise; }
    throw new Error(`Unexpected request: ${url}`);
  } });
  let data, renderer;
  function Probe() { data = useAppData(); return null; }
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Probe))); });
  t.after(() => act(() => renderer.unmount()));
  const before = structuredClone({ materials: data.courseMaterials, ids: data.selectedMaterialIds, history: data.summaryRecords, scope: data.scope });
  let result;
  await act(async () => { result = await data.updateCourse('a', { code: 'math', name: 'Duplicate' }); });
  assert.equal(result.code, 'DUPLICATE_RECORD'); assert.equal(patches.length, 0);
  await act(async () => { result = await data.updateCourse('a', { code: 'ß'.repeat(17), name: 'Too long' }); });
  assert.equal(result.code, 'INVALID_COURSE'); assert.equal(patches.length, 0);
  let saving;
  await act(async () => { saving = data.updateCourse('a', { code: ' new ', name: ' New course ' }); });
  await act(async () => { result = await data.updateCourse('a', { code: 'SECOND', name: 'Concurrent' }); });
  assert.equal(result.code, 'COURSE_PENDING'); assert.equal(patches.length, 1);
  assert.equal(data.currentCourse.name, 'Science');
  assert.deepEqual(JSON.parse(patches[0].body), { code: 'NEW', name: 'New course' });
  await act(async () => { pending.resolve(jsonReply({ course: { id: 'a', code: 'NEW', name: 'New course' } })); result = await saving; });
  assert.equal(result.ok, true); assert.equal(data.currentCourse.name, 'New course');
  assert.deepEqual({ materials: data.courseMaterials, ids: data.selectedMaterialIds, history: data.summaryRecords, scope: data.scope }, before);
  pending = deferred();
  await act(async () => { saving = data.updateCourse('a', { code: 'LATE', name: 'Late first-account course' }); });
  await act(async () => { await data.login(second.email, 'test-password'); });
  assert.equal(patches.at(-1).signal.aborted, true);
  await act(async () => { pending.resolve(jsonReply({ course: { id: 'a', code: 'LATE', name: 'Late first-account course' } })); result = await saving; });
  assert.equal(result.ok, false);
  assert.equal(data.currentUser.id, 2);
  assert.deepEqual(data.studentCourses.map(course => course.id), ['other']);
  assert.equal(data.courses.some(course => course.name === 'Late first-account course'), false);
});
