import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { loadSource, deferred, memoryWindow } from './helpers.mjs';
import { formatStudyDate } from '../src/utils/dateTime.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.children || []).map(text).join('');
const matchingClass = (root, name) => root.findAll(node => typeof node.type === 'string' && String(node.props.className || '').split(' ').includes(name));
const button = (root, label) => root.findAllByType('button').find(node => text(node) === label);
const stat = (root, label) => root.findByProps({ 'aria-label': 'Preview ' + label });
const statValue = (root, label) => text(stat(root, label).findByType('strong'));
const event = () => ({ stopped: false, stopPropagation() { this.stopped = true; }, preventDefault() {} });
const courses = [
  { id: 'a', ownerId: 1, code: 'SCI', name: 'Science', updatedAt: '2099-01-01 00:00:00' },
  { id: 'b', ownerId: 1, code: 'MATH', name: 'Mathematics', updatedAt: '2099-01-02 00:00:00' },
];
const material = (id, courseId, name = 'notes-' + id + '.pdf') => ({ id, ownerId: 1, courseId, name, type: 'PDF', uploadedAt: '2026-10-01 00:00:00' });
const quiz = (id, score) => ({ id, owner_id: 1, kind: 'quiz', course_id: 'a', created_at: '2026-10-20 02:00:00', payload: { questions: [{ id: 1 }], score } });
const flashcard = { id: 'newest', owner_id: 1, kind: 'flashcards', course_id: 'b', created_at: '2026-10-30 03:45:00', payload: { selectedMaterialIds: [3], cards: [] } };

async function setup(t, { courseList = courses, records = [], materialGroups = { a: [material(1, 'a'), material(2, 'a')], b: [material(3, 'b')] }, materialHandler, historyHandler, deleteHandler, selectHandler } = {}) {
  const calls = [], selected = [], deleted = [], selectionRequests = [], navigations = [];
  const context = { currentUser: { id: 1, name: 'Student' }, studentCourses: structuredClone(courseList), currentCourseId: courseList[0]?.id || '',
    courseState: { ready: true, loading: false, error: '' }, materialState: { loading: false }, pendingStudyCount: 0,
    // Deliberately misleading browser caches: the dashboard must ignore these.
    studentMaterials: [material(999, 'cached-only')], quizAttempts: [{ score: 99 }], averageQuizScore: 99,
    selectCourse: (id, options) => { selected.push(id); selectionRequests.push({ id, options }); return selectHandler ? selectHandler(id, options) : Promise.resolve(true); }, createCourse: async () => ({ ok: true }),
    deleteCourse: async id => { deleted.push(id); return deleteHandler ? deleteHandler(id) : { ok: true }; }, retryCourses() {},
  };
  const { default: Dashboard } = await loadSource("export {default} from './src/pages/student/DashboardPage.jsx';", {
    '../../layouts/StudentLayout': ({ children, profileContent }) => React.createElement('main', null, children, React.createElement('aside', null, profileContent)),
    '../../components/HistoryRecordDialog': ({ title, children, onClose, closeLabel }) => React.createElement('section', { role: 'dialog', 'aria-label': title },
      React.createElement('button', { onClick: onClose }, closeLabel), children),
    '../../state/AppDataContext': { useAppData: () => context },
    '../../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) },
    'react-router-dom': { Link: ({ to, children, ...props }) => React.createElement('a', { ...props, href: to }, children), useNavigate: () => to => navigations.push(to) },
    '../../services/courseMaterialService': { getCourseMaterials: async (id, owner, options) => {
      const call = { type: 'materials', id, owner, signal: options.signal }; calls.push(call);
      return materialHandler ? materialHandler(call) : structuredClone(materialGroups[id] || []);
    } },
    '../../services/apiClient': { apiRequest: async (url, options = {}) => {
      const call = { type: 'history', url, method: options.method || 'GET', owner: context.currentUser.id, signal: options.signal }; calls.push(call);
      return historyHandler ? historyHandler(call) : { records: structuredClone(records), reviews: [{ payload: { score: 100 } }] };
    } },
  }, { window: memoryWindow() });
  let renderer;
  await act(async () => { renderer = create(React.createElement(Dashboard)); });
  let mounted = true;
  const unmount = async () => { if (mounted) { await act(async () => renderer.unmount()); mounted = false; } };
  t.after(unmount);
  return { renderer, calls, selected, deleted, selectionRequests, navigations, context, unmount, update: async () => { await act(async () => renderer.update(React.createElement(Dashboard))); } };
}

test('a new account receives three steps, honest empty scores and supported upload formats', async t => {
  const app = await setup(t, { courseList: [], records: [] });
  const root = app.renderer.root;
  assert.equal(matchingClass(root, 'dashboard-start-guide').length, 1);
  assert.equal(matchingClass(root, 'dashboard-start-guide')[0].findAllByType('li').length, 3);
  assert.equal(statValue(root, 'Courses'), '0');
  assert.equal(statValue(root, 'Materials'), '0');
  assert.equal(statValue(root, 'Completed Quiz'), '0');
  assert.equal(statValue(root, 'Average Score'), '—');
  assert.match(text(root), /No courses yet/);
  assert.match(text(root), /PDF, DOCX, PPTX/);
  assert.equal(button(root, 'Show Upload Hint'), undefined);
  await act(async () => stat(root, 'Average Score').props.onClick());
  assert.match(text(root.findByProps({ role: 'dialog' })), /No completed quizzes yet/);
  assert.ok(root.findAllByType('a').some(link => link.props.href === '#dashboard-course-form'));
});

test('cold-browser statistics cover every course and newest flashcard activity, not cached values', async t => {
  const app = await setup(t, { records: [quiz('one', 0), flashcard, quiz('two', 100)] });
  const root = app.renderer.root;
  assert.deepEqual(app.calls.filter(call => call.type === 'materials').map(call => call.id).sort(), ['a', 'b']);
  assert.equal(statValue(root, 'Materials'), '3');
  assert.equal(statValue(root, 'Completed Quiz'), '2');
  assert.equal(statValue(root, 'Average Score'), '50%');
  assert.equal(matchingClass(root, 'dashboard-start-guide').length, 0);
  const side = root.findByType('aside');
  assert.match(text(side), /Mathematics/);
  assert.match(text(side), /notes-3.pdf/);
  assert.ok(text(side).includes(formatStudyDate(flashcard.created_at, 'en')));
  assert.doesNotMatch(text(side), /2099/);
  const before = app.calls.length;
  for (const label of ['Courses', 'Materials', 'Completed Quiz', 'Average Score']) {
    await act(async () => stat(root, label).props.onClick());
    const dialog = root.findByProps({ role: 'dialog' });
    assert.equal(dialog.props['aria-label'], label);
    if (label === 'Materials') assert.match(text(dialog), /notes-1.pdf.*notes-2.pdf.*notes-3.pdf/);
    if (label === 'Average Score') assert.match(text(dialog), /Average of 2 completed quizzes: 50%/);
    await act(async () => button(dialog, 'Close').props.onClick());
  }
  assert.equal(app.calls.length, before, 'Opening previews must not fetch or save additional study records');
  assert.ok(app.calls.filter(call => call.type === 'history').every(call => call.method === 'GET'));
});

test('a zero-percent completed quiz is displayed as zero rather than no score', async t => {
  const app = await setup(t, { records: [quiz('zero', 0)] });
  assert.equal(statValue(app.renderer.root, 'Average Score'), '0%');
});

test('latest saved review updates recent study time without counting as a new quiz', async t => {
  const record = quiz('original-quiz', 40);
  const reviewTime = '2026-10-31 06:00:00';
  const app = await setup(t, { historyHandler: async () => ({ records: [record], reviews: [
    { id: 'review', record_id: record.id, created_at: reviewTime, payload: { score: 100 } },
  ] }) });
  assert.equal(statValue(app.renderer.root, 'Completed Quiz'), '1');
  assert.equal(statValue(app.renderer.root, 'Average Score'), '40%');
  assert.ok(text(app.renderer.root.findByType('aside')).includes(formatStudyDate(reviewTime, 'en')));
});

test('the study entry selects a course that has saved materials if the current one is empty', async t => {
  const app = await setup(t, { materialGroups: { a: [], b: [material(3, 'b')] } });
  const hero = app.renderer.root.findByProps({ className: 'button-link hero-action' });
  assert.equal(hero.type, 'button');
  await act(async () => hero.props.onClick(event()));
  assert.deepEqual(app.selected, ['b']);
  assert.deepEqual(app.selectionRequests, [{ id: 'b', options: { preferredMaterialIds: [3] } }]);
  assert.deepEqual(app.navigations, ['/student/workspace?mode=summary']);
});

for (const mode of ['summary', 'qa', 'quiz', 'flashcards']) {
  test(`continue studying restores the latest ${mode} course and exact source selection before navigating`, async t => {
    const pending = deferred();
    const record = { id: 'latest', owner_id: 1, kind: mode, course_id: 'b', created_at: '2026-10-31 10:00:00', payload: { selectedMaterialIds: [4, 3] } };
    const app = await setup(t, { records: [record], materialGroups: { a: [material(1, 'a')], b: [material(3, 'b'), material(4, 'b'), material(5, 'b')] },
      selectHandler: () => pending.promise });
    const hero = app.renderer.root.findByProps({ className: 'button-link hero-action' });
    let first;
    await act(async () => {
      first = hero.props.onClick(event());
      hero.props.onClick(event());
    });
    assert.deepEqual(app.selectionRequests, [{ id: 'b', options: { preferredMaterialIds: [4, 3] } }]);
    assert.deepEqual(app.navigations, [], 'Selection must finish before entering the workspace');
    assert.equal(hero.props.disabled, true);
    assert.match(text(app.renderer.root), /Restoring your course and selected materials/);
    await act(async () => { pending.resolve(true); await first; });
    assert.deepEqual(app.navigations, [`/student/workspace?mode=${mode}`]);
  });
}

test('a recent review resumes its original quiz and sources rather than the most recent generated mode', async t => {
  const original = { ...quiz('original', 40), payload: { ...quiz('original', 40).payload, selectedMaterialIds: [2] } };
  const app = await setup(t, { historyHandler: async () => ({ records: [original, flashcard], reviews: [
    { id: 'latest-review', owner_id: 1, record_id: original.id, created_at: '2026-11-01 10:00:00', payload: { score: 100 } },
  ] }) });
  await act(async () => app.renderer.root.findByProps({ className: 'button-link hero-action' }).props.onClick(event()));
  assert.deepEqual(app.selectionRequests, [{ id: 'a', options: { preferredMaterialIds: [2] } }]);
  assert.deepEqual(app.navigations, ['/student/workspace?mode=quiz']);
});

test('deleted or foreign source selections fall back to an older valid activity, then to current course materials', async () => {
  const { studyResumeTarget } = await loadSource('src/utils/studyResume.js');
  const older = { id: 'older', owner_id: 1, kind: 'qa', course_id: 'a', created_at: '2026-10-10 01:00:00', payload: { selectedMaterialIds: [2] } };
  const invalid = [
    { ...flashcard, payload: { selectedMaterialIds: [3, 404] } },
    { ...flashcard, id: 'foreign-record', owner_id: 2 },
    { ...flashcard, id: 'foreign-material', payload: { selectedMaterialIds: [8] } },
    { ...flashcard, id: 'wrong-course-source', payload: { selectedMaterialIds: [2] } },
    { ...flashcard, id: 'removed-course', course_id: 'removed' },
  ];
  const input = { userId: 1, courses, materials: [material(1, 'a'), material(2, 'a'), material(3, 'b'), { ...material(8, 'b'), ownerId: 2 }],
    records: [...invalid, older], reviews: [{ owner_id: 2, record_id: older.id, created_at: '2099-01-01 00:00:00' }], currentCourseId: 'a', selectedMaterialIds: [1] };
  const snapshot = structuredClone(input);
  assert.deepEqual(studyResumeTarget(input), { courseId: 'a', materialIds: [2], mode: 'qa', recordId: 'older', createdAt: older.created_at, fromHistory: true });
  assert.deepEqual(studyResumeTarget({ ...input, records: invalid }), { courseId: 'a', materialIds: [1], mode: 'summary', recordId: null, createdAt: null, fromHistory: false });
  assert.equal(studyResumeTarget({ ...input, userId: 2 }), null);
  assert.equal(studyResumeTarget({ ...input, userId: null }), null);
  assert.equal(studyResumeTarget({ ...input, courses: [], records: [] }), null);
  assert.deepEqual(input, snapshot, 'Resolving a resume target must not mutate saved records or source lists');
});

test('continue waits for both material and history loading instead of navigating to a default selection', async t => {
  const history = deferred(), materialLoad = deferred();
  const app = await setup(t, { historyHandler: () => history.promise,
    materialHandler: call => call.id === 'b' ? materialLoad.promise : [material(1, 'a')] });
  const hero = () => app.renderer.root.findByProps({ className: 'button-link hero-action' });
  assert.equal(hero().props.disabled, true);
  await act(async () => hero().props.onClick(event()));
  assert.deepEqual(app.selectionRequests, []);
  await act(async () => { history.resolve({ records: [flashcard], reviews: [] }); });
  assert.equal(hero().props.disabled, true);
  await act(async () => { materialLoad.resolve([material(3, 'b')]); });
  assert.equal(hero().props.disabled, false);
  await act(async () => hero().props.onClick(event()));
  assert.deepEqual(app.navigations, ['/student/workspace?mode=flashcards']);
});

test('a source removed during restoration does not open the old mode; refreshed statistics permit a safe fallback', async t => {
  let removed = false;
  const app = await setup(t, { records: [flashcard],
    materialHandler: call => call.id === 'a' ? [material(1, 'a')] : removed ? [] : [material(3, 'b')],
    selectHandler: id => { if (id === 'b') { removed = true; return false; } return true; },
  });
  const hero = () => app.renderer.root.findByProps({ className: 'button-link hero-action' });
  await act(async () => hero().props.onClick(event()));
  assert.deepEqual(app.navigations, []);
  assert.match(text(app.renderer.root), /Could not restore that study selection/);
  await act(async () => button(app.renderer.root, 'Refresh statistics').props.onClick());
  await act(async () => hero().props.onClick(event()));
  assert.deepEqual(app.selectionRequests.map(call => [call.id, call.options.preferredMaterialIds]), [['b', [3]], ['a', [1]]]);
  assert.deepEqual(app.navigations, ['/student/workspace?mode=summary']);
});

test('hero, profile, guide and quiz preview use the same course and selected-material restoration', async t => {
  const app = await setup(t);
  app.context.selectedMaterialIds = [2];
  await app.update();
  await act(async () => stat(app.renderer.root, 'Completed Quiz').props.onClick());
  const entries = app.renderer.root.findAllByType('button').filter(node => ['Continue Studying', 'Start studying'].includes(text(node)));
  assert.equal(entries.length, 4);
  const openers = [
    () => button(app.renderer.root.findByProps({ role: 'dialog' }), 'Start studying'),
    () => button(matchingClass(app.renderer.root, 'dashboard-start-guide')[0], 'Start studying'),
    () => button(app.renderer.root.findByType('aside'), 'Continue Studying'),
    () => app.renderer.root.findByProps({ className: 'button-link hero-action' }),
  ];
  for (const opener of openers) await act(async () => opener().props.onClick(event()));
  assert.deepEqual(app.selectionRequests, Array.from({ length: 4 }, () => ({ id: 'a', options: { preferredMaterialIds: [2] } })));
  assert.deepEqual(app.navigations, Array(4).fill('/student/workspace?mode=summary'));
});

test('an old pending restoration cannot navigate after an account change or page unmount', async t => {
  const pending = deferred();
  const app = await setup(t, { records: [flashcard], selectHandler: () => pending.promise });
  let restoring;
  await act(async () => { restoring = app.renderer.root.findByProps({ className: 'button-link hero-action' }).props.onClick(event()); });
  app.context.currentUser = { id: 2, name: 'Other student' };
  app.context.studentCourses = [];
  app.context.currentCourseId = '';
  await app.update();
  await act(async () => { pending.resolve(true); await restoring; });
  assert.deepEqual(app.navigations, []);
  assert.doesNotMatch(text(app.renderer.root), /Restoring your course/);

  const leaving = deferred();
  const second = await setup(t, { records: [flashcard], selectHandler: () => leaving.promise });
  let task;
  await act(async () => { task = second.renderer.root.findByProps({ className: 'button-link hero-action' }).props.onClick(event()); });
  await second.unmount();
  await act(async () => { leaving.resolve(true); await task; });
  assert.deepEqual(second.navigations, []);
});

test('search emptiness is distinct from no courses and clears without changing the account', async t => {
  const app = await setup(t);
  const root = app.renderer.root;
  await act(async () => root.findByProps({ type: 'search' }).props.onChange({ target: { value: 'no-such-course' } }));
  assert.match(text(root), /No courses match your search/);
  assert.doesNotMatch(text(root), /No courses yet/);
  await act(async () => button(root, 'Clear search').props.onClick());
  assert.equal(matchingClass(root, 'dashboard-course-row').length, 2);
  assert.equal(root.findByProps({ type: 'search' }).props.value, '');
});

test('course content is a native select button; delete does not select and busy rows stay disabled', async t => {
  const pending = deferred();
  const app = await setup(t, { deleteHandler: () => pending.promise });
  const root = app.renderer.root;
  let select = matchingClass(root, 'dashboard-course-select')[1];
  assert.equal(select.type, 'button');
  assert.equal(select.props.type, 'button');
  assert.equal(select.findAllByType('button').length, 1, 'No nested interactive buttons');
  await act(async () => select.props.onClick(event()));
  assert.deepEqual(app.selected, ['b']);
  await act(async () => matchingClass(root, 'dashboard-course-row')[0].props.onClick());
  assert.deepEqual(app.selected, ['b', 'a']);
  const deleteEvent = event();
  await act(async () => matchingClass(root, 'dashboard-course-delete')[1].props.onClick(deleteEvent));
  assert.equal(deleteEvent.stopped, true);
  assert.deepEqual(app.deleted, ['b']);
  assert.deepEqual(app.selected, ['b', 'a']);
  assert.ok(matchingClass(root, 'dashboard-course-select').every(node => node.props.disabled));
  await act(async () => matchingClass(root, 'dashboard-course-row')[0].props.onClick());
  assert.deepEqual(app.selected, ['b', 'a']);
  await act(async () => pending.resolve({ ok: true }));
  app.context.materialState.loading = true;
  await app.update();
  assert.ok(matchingClass(root, 'dashboard-course-select').every(node => node.props.disabled));
});

test('failed material loading is unavailable, not a partial count, and refresh can recover', async t => {
  let fail = true;
  const app = await setup(t, { records: [quiz('one', 50)], materialHandler: async call => {
    if (fail && call.id === 'b') throw new Error('Temporary materials failure');
    return [material(call.id === 'a' ? 1 : 2, call.id)];
  } });
  const root = app.renderer.root;
  assert.equal(statValue(root, 'Materials'), '—');
  assert.equal(statValue(root, 'Completed Quiz'), '1');
  assert.equal(matchingClass(root, 'dashboard-start-guide').length, 0);
  assert.match(text(root), /Some statistics are unavailable/);
  fail = false;
  await act(async () => button(root, 'Refresh statistics').props.onClick());
  assert.equal(statValue(root, 'Materials'), '2');
});

test('changing accounts aborts stale requests and cannot show old material or history results', async t => {
  const oldMaterial = deferred(), oldHistory = deferred();
  const app = await setup(t, { courseList: [courses[0]],
    materialHandler: call => call.owner === 1 ? oldMaterial.promise : [],
    historyHandler: call => call.owner === 1 ? oldHistory.promise : { records: [] },
  });
  await act(async () => stat(app.renderer.root, 'Materials').props.onClick());
  app.context.currentUser = { id: 2, name: 'New account' };
  app.context.studentCourses = [];
  app.context.currentCourseId = '';
  await app.update();
  assert.ok(app.calls.filter(call => call.owner === 1).every(call => call.signal.aborted));
  await act(async () => {
    oldMaterial.resolve([material(88, 'a', 'Private previous-account notes')]);
    oldHistory.resolve({ records: [quiz('private', 99), flashcard] });
  });
  assert.doesNotMatch(text(app.renderer.root), /Private previous-account|99%|notes-3/);
  assert.equal(statValue(app.renderer.root, 'Materials'), '0');
  assert.equal(statValue(app.renderer.root, 'Completed Quiz'), '0');
  assert.equal(statValue(app.renderer.root, 'Average Score'), '—');
});
