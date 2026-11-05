import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { loadSource, memoryWindow, deferred, jsonReply } from './helpers.mjs';
import { recordIsNew, studyUnreadCounts } from '../src/utils/studyNotifications.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.children || []).map(text).join('');
const quiz = (id = '1:quiz') => ({ id, owner_id: 1, course_id: 'c', kind: 'quiz', created_at: '2026-11-05 00:00:00', payload: {
  questions: [{ id: 1, question: 'A question', options: ['Right', 'Wrong'], answerIndex: 0 }], answers: { 1: 1 }, score: 0,
} });

test('New counts group Q&A messages, separate History and Review, exclude correct-only reviews and isolate accounts', () => {
  const qa = id => ({ id, owner_id: 1, course_id: 'c', kind: 'qa', created_at: `2026-11-05 00:00:0${id.at(-1)}`,
    payload: { conversationId: 'conversation', scopeKey: 'scope', messageOrder: Number(id.at(-1)), role: 'AI', text: 'Answer' } });
  const correct = quiz('1:correct'); correct.payload.answers = { 1: 0 };
  const snapshot = { ownerId: 1, ready: true, records: [quiz(), correct, qa('1:q1'), qa('1:q2')],
    viewed: { history: ['1:q1', '1:quiz'], review: [] } };
  assert.deepEqual(studyUnreadCounts(snapshot, 1), { history: 2, review: 1 });
  assert.deepEqual(studyUnreadCounts(snapshot, 2), { history: 0, review: 0 });
  assert.equal(recordIsNew(quiz(), 'history', snapshot.viewed), false);
  assert.equal(recordIsNew(quiz(), 'review', snapshot.viewed), true);
  assert.equal(recordIsNew(quiz(), 'history'), false, 'Older API responses do not invent New flags');
});

async function progressSetup(t, handler, props = { recordId: '1:cards', userId: 1 }) {
  const window = memoryWindow();
  const calls = [];
  const { default: useProgress } = await loadSource("export {default} from './src/hooks/useFlashcardProgress.js';", {
    '../services/apiClient': { apiRequest: async (url, request = {}) => { calls.push({ url, request }); return handler(url, request); } },
  }, { window });
  let value, renderer;
  function Probe(input) { value = useProgress(input); return null; }
  await act(async () => { renderer = create(React.createElement(Probe, props)); });
  t.after(() => act(async () => renderer.unmount()));
  return { get value() { return value; }, calls, window,
    update: async input => act(async () => renderer.update(React.createElement(Probe, input))) };
}

test('card updates wait for server acknowledgement, reject duplicate clicks and preserve prior marks on failure', async t => {
  const waiting = deferred(); let fail = true;
  const app = await progressSetup(t, async (_url, request) => {
    if (request.method !== 'PATCH') return { mastered: ['1'] };
    if (fail) throw new Error('Temporary save failure');
    return waiting.promise;
  });
  assert.deepEqual(app.value.mastered, ['1']);
  await act(async () => app.value.toggle(2));
  assert.match(app.value.error, /save failure/);
  assert.deepEqual(app.value.mastered, ['1']);
  fail = false; let saving;
  await act(async () => { saving = app.value.toggle(2); app.value.toggle(2); });
  assert.equal(app.calls.filter(call => call.request.method === 'PATCH').length, 2, 'One failed attempt and one retry, no duplicate click');
  assert.deepEqual(app.value.mastered, ['1']);
  await act(async () => { waiting.resolve({ mastered: ['1', '2'] }); await saving; });
  assert.deepEqual(app.value.mastered, ['1', '2']);
  assert.equal(app.value.error, '');
});

test('an account switch during pending outbox save cannot fetch or overwrite another account progress', async t => {
  const ready = deferred();
  const app = await progressSetup(t, async () => ({ mastered: ['3'] }), { recordId: '1:cards', userId: 1, ensureSaved: () => ready.promise });
  assert.equal(app.calls.length, 0);
  await app.update({ recordId: '2:other', userId: 2 });
  assert.equal(app.calls.length, 1);
  assert.match(app.calls[0].url, /2%3Aother/);
  await act(async () => ready.resolve());
  assert.equal(app.calls.length, 1);
  assert.deepEqual(app.value.mastered, ['3']);
});

test('focus refreshes are serialized and late old-record writes cannot replace current account progress', async t => {
  const refreshing = deferred(), saving = deferred(); let reads = 0;
  const app = await progressSetup(t, async (url, request) => {
    if (url.includes('2%3Aother')) return { mastered: ['4'] };
    if (request.method === 'PATCH') return saving.promise;
    reads++; return reads === 1 ? { mastered: ['1'] } : refreshing.promise;
  });
  await act(async () => { app.window.dispatchEvent(new Event('focus')); app.window.dispatchEvent(new Event('focus')); });
  assert.equal(reads, 2);
  await act(async () => app.value.toggle(2));
  assert.equal(app.calls.filter(call => call.request.method === 'PATCH').length, 0, 'A refresh cannot race a progress write');
  await act(async () => refreshing.resolve({ mastered: ['1', '3'] }));
  let pending;
  await act(async () => { pending = app.value.toggle(2); });
  await app.update({ recordId: '2:other', userId: 2 });
  await act(async () => { saving.resolve({ mastered: ['1', '2', '3'] }); await pending; });
  assert.deepEqual(app.value.mastered, ['4']);
});

async function historySetup(t, { records = [quiz()], review = false, viewed = { history: [], review: [] }, mark } = {}) {
  const state = { records, reviews: [], viewed };
  const calls = [];
  const { default: History } = await loadSource("export {default} from './src/pages/student/HistoryPage.jsx';", {
    '../../layouts/StudentLayout': ({ children }) => React.createElement('main', null, children),
    '../../components/HistoryRecordDialog': ({ children, onClose }) => React.createElement('section', { role: 'dialog' },
      React.createElement('button', { onClick: onClose }, 'Close'), children),
    '../../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) },
    '../../state/AppDataContext': { useAppData: () => ({ currentUser: { id: 1 }, studentCourses: [{ id: 'c', code: 'C', name: 'Course' }],
      summaryRecords: [], currentChatRecords: [], quizAttempts: [] }) },
    '../../services/apiClient': { apiRequest: async (url, request = {}) => {
      calls.push({ url, request });
      if (url.endsWith('/view')) return mark?.(url, request) ?? { ok: true };
      return structuredClone(state);
    } },
  }, { window: memoryWindow() });
  let renderer;
  await act(async () => { renderer = create(React.createElement(History, { review })); });
  t.after(() => act(async () => renderer.unmount()));
  return { renderer, calls };
}

test('opening a record clears only that page New flag after acknowledgement, not on page entry', async t => {
  const waiting = deferred();
  const app = await historySetup(t, { records: [quiz(), quiz('1:other')], mark: () => waiting.promise });
  const badges = () => app.renderer.root.findAllByProps({ className: 'study-new-badge history-new-badge' });
  assert.equal(badges().length, 2);
  assert.equal(app.calls.filter(call => call.url.endsWith('/view')).length, 0);
  await act(async () => app.renderer.root.findAllByProps({ className: 'history-record-open' })[0].props.onClick());
  assert.equal(badges().length, 2);
  await act(async () => waiting.resolve({ ok: true }));
  assert.equal(badges().length, 1);
  const sent = app.calls.find(call => call.url.endsWith('/view'));
  assert.deepEqual(sent.request.body, { page: 'history' });
  assert.match(sent.url, /1%3Aquiz/);
});

test('failed viewed writes keep New and expose a retry; Review writes do not acknowledge History', async t => {
  let failed = true;
  const app = await historySetup(t, { review: true, mark: () => { if (failed) throw new Error('Offline'); return { ok: true }; } });
  await act(async () => app.renderer.root.findByProps({ className: 'history-record-open' }).props.onClick());
  assert.equal(app.renderer.root.findAllByProps({ className: 'study-new-badge history-new-badge' }).length, 1);
  assert.match(text(app.renderer.root), /New badge is kept/);
  failed = false;
  await act(async () => app.renderer.root.findAllByType('button').find(node => text(node) === 'Retry viewed status').props.onClick());
  assert.equal(app.renderer.root.findAllByProps({ className: 'study-new-badge history-new-badge' }).length, 0);
  assert.ok(app.calls.filter(call => call.url.endsWith('/view')).every(call => call.request.body.page === 'review'));
});

test('a new Q&A message makes its grouped conversation New and opening acknowledges the unseen message only', async t => {
  const messages = [1, 2].map(index => ({ id: `1:qa${index}`, owner_id: 1, course_id: 'c', kind: 'qa', created_at: `2026-11-05 00:00:0${index}`,
    payload: { conversationId: 'qa', scopeKey: 'scope', role: index === 1 ? 'User' : 'AI', messageOrder: index, text: 'Saved message' } }));
  const app = await historySetup(t, { records: messages, viewed: { history: ['1:qa1'], review: [] } });
  assert.equal(app.renderer.root.findAllByProps({ className: 'history-record-open' }).length, 1);
  await act(async () => app.renderer.root.findByProps({ className: 'history-record-open' }).props.onClick());
  assert.deepEqual(app.calls.filter(call => call.url.endsWith('/view')).map(call => call.url), ['/history/1%3Aqa2/view']);
});

test('a record saved during an older history read queues a fresh snapshot instead of losing New and restored cards', async t => {
  const stale = deferred();
  const saved = [];
  let reads = 0;
  const window = memoryWindow();
  window.sessionStorage = memoryWindow().localStorage;
  const { AppDataProvider, useAppData } = await loadSource('src/state/AppDataContext.jsx', {}, {
    window, fetch: async (url, request = {}) => {
      if (url === '/api/auth/me') return jsonReply({ user: { id: 1, name: 'Learner', role: 'Student' } });
      if (url === '/api/ai/status') return jsonReply({ configured: true });
      if (url === '/api/courses') return jsonReply({ courses: [{ id: 'c', code: 'C', name: 'Course' }] });
      if (url === '/api/courses/c/materials') return jsonReply({ materials: [{ id: 1, course_id: 'c', name: 'notes.txt', type: 'TXT', size_bytes: 1, content: 'Source', status: 'Ready' }] });
      if (url === '/api/history' && request.method === 'POST') {
        const body = JSON.parse(request.body);
        saved.push({ id: `1:${body.id}`, owner_id: 1, kind: body.kind, course_id: 'c', created_at: '2026-11-05 00:00:00', payload: body.payload });
        return jsonReply({ ok: true, id: saved.at(-1).id });
      }
      if (url === '/api/history') {
        reads++;
        if (reads === 2) return stale.promise;
        return jsonReply({ records: structuredClone(saved), reviews: [], viewed: { history: [], review: [] } });
      }
      throw new Error(`Unexpected provider request ${url}`);
    },
  });
  let value, renderer;
  function Probe() { value = useAppData(); return null; }
  await act(async () => { renderer = create(React.createElement(AppDataProvider, null, React.createElement(Probe))); });
  t.after(() => act(async () => renderer.unmount()));
  assert.equal(reads, 1);
  let refreshing;
  await act(async () => { refreshing = value.refreshStudyHistory(); });
  assert.equal(reads, 2);
  await act(async () => value.persistStudy('flashcards', { revisionBatchId: 'batch', cards: [{ id: 1, front: 'Question', back: 'Answer', source: '[S1]' }] }, value.scope));
  assert.equal(saved.length, 1);
  assert.equal(reads, 2, 'The active older read owns the request slot until it finishes');
  await act(async () => { stale.resolve(jsonReply({ records: [], reviews: [], viewed: { history: [], review: [] } })); await refreshing; });
  assert.equal(reads, 3, 'A later save forces exactly one follow-up history read');
  assert.deepEqual(value.serverStudyHistory.records.map(record => record.id), [saved[0].id]);
  assert.deepEqual(studyUnreadCounts(value.serverStudyHistory, 1), { history: 1, review: 0 });
});
