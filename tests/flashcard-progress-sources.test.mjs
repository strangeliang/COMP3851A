import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Message } from '@chatscope/chat-ui-kit-react';
import { loadSource, memoryWindow, deferred } from './helpers.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.children || []).map(text).join('');
const button = (root, label) => {
  const node = root.findAllByType('button').find(item => text(item) === label);
  assert.ok(node, `Missing button: ${label}`);
  return node;
};
const scopeKey = (userId, courseId, ids) => JSON.stringify([String(userId), courseId, ids.map(String).sort()]);
const cardsReply = (label = 'Original') => ({ mode: 'api', cards: Array.from({ length: 6 }, (_, index) => ({
  id: index + 1, front: `${label} front ${index + 1}`, back: `${label} back ${index + 1}`, source: '[S1]',
})) });
const flips = root => root.findAllByType('button').filter(node => String(node.props.className).split(' ').includes('revision-flashcard'));
const sourceGroups = root => root.findAllByProps({ className: 'qa-answer-sources' });

async function setup(t, { mode = 'flashcards', flashcards = async () => cardsReply(), answer = async () => ({ answer: 'Answer [S1]', mode: 'api' }) } = {}) {
  const window = memoryWindow();
  window.sessionStorage = memoryWindow().localStorage;
  const materials = [
    { id: 11, ownerId: 1, courseId: 'course', name: 'First.pdf', type: 'PDF', content: 'FIRST SOURCE complete extracted text', hasOriginal: false },
    { id: 12, ownerId: 1, courseId: 'course', name: 'Second.txt', type: 'TXT', content: 'SECOND SOURCE complete extracted text', hasOriginal: false },
  ];
  const saves = [], calls = [];
  const data = { currentUser: { id: 1, role: 'Student' },
    studentCourses: [{ id: 'course', code: 'COURSE', name: 'Learning course' }],
    currentCourse: { id: 'course', code: 'COURSE', name: 'Learning course' }, currentCourseId: 'course',
    courseMaterials: materials, selectedMaterials: materials, selectedMaterialIds: [11, 12], currentChatRecords: [],
    courseState: { loading: false, error: '' }, materialState: { loading: false, error: '' },
    aiStatus: { configured: true, loading: false }, summaryUses: 0, qaUses: 0,
    scope: { userId: 1, courseId: 'course', selectedMaterialIds: [11, 12], scopeKey: scopeKey(1, 'course', [11, 12]) },
    selectCourse() {}, setSelectedMaterialIds() {}, retryCourses() {}, retryMaterials() {}, recordQAUse() {}, notify() {},
    recordSummaryUse() {}, saveQuizAttempt() {}, persistStudy: (kind, result, scope) => saves.push({ kind, result, scope }),
  };
  let nextId = 0;
  data.addChatRecord = (role, message, details) => {
    if (details.scope.scopeKey !== data.scope.scopeKey) return;
    const record = { id: `message-${++nextId}`, ...details.scope, role, text: message, mode: details.mode };
    data.currentChatRecords.push(record);
    return { id: record.id, conversationId: 'test-conversation' };
  };
  const language = { useLanguage: () => ({ language: 'en' }) };
  const modules = await loadSource(`
    export { default as Workspace } from './src/pages/student/StudyWorkspacePage.jsx';
    export { resetWorkspaceSession } from './src/services/workspaceSession.js';
    export { answerSources } from './src/utils/answerSources.js';
  `, {
    '../../layouts/StudentLayout': ({ children }) => React.createElement('main', null, children),
    '../../state/AppDataContext': { useAppData: () => data }, '../state/AppDataContext': { useAppData: () => data },
    '../../state/LanguageContext': language, '../state/LanguageContext': language,
    './HistoryRecordDialog': ({ title, children, onClose, closeLabel }) => React.createElement('section', { role: 'dialog', 'aria-label': title },
      React.createElement('button', { onClick: onClose }, closeLabel), children),
    '@chatscope/chat-ui-kit-react': { Message, MainContainer: 'test-main', ChatContainer: 'test-chat', MessageList: 'test-list', MessageInput: 'test-input', TypingIndicator: 'test-typing' },
    '../../services/aiService': { generateAISummary: async () => ({}), generateAIQuiz: async () => ({}),
      generateAIFlashcards: input => { calls.push({ kind: 'flashcards', input }); return flashcards(input); } },
    '../services/aiService': { generateAIAnswer: input => { calls.push({ kind: 'qa', input }); return answer(input); } },
  }, { window });
  let renderer;
  function Root({ show = true }) {
    return React.createElement(MemoryRouter, { initialEntries: [`/student/workspace?mode=${mode}`] }, show ? React.createElement(modules.Workspace) : null);
  }
  await act(async () => { renderer = create(React.createElement(Root)); });
  t.after(() => act(() => renderer.unmount()));
  const update = async (show = true) => { await act(async () => renderer.update(React.createElement(Root, { show }))); };
  return { renderer, data, materials, calls, saves, modules, update,
    send: question => renderer.root.findByType('test-input').props.onSend('', question),
    switchScope: async (ids, userId = 1, courseId = 'course') => {
      data.currentUser = { id: userId, role: 'Student' };
      data.currentCourse = { id: courseId, code: 'COURSE', name: 'Learning course' };
      data.currentCourseId = courseId;
      data.selectedMaterialIds = ids;
      data.selectedMaterials = materials.filter(material => ids.includes(material.id)).map(material => ({ ...material, ownerId: userId, courseId }));
      data.currentChatRecords = [];
      data.scope = { userId, courseId, selectedMaterialIds: ids, scopeKey: scopeKey(userId, courseId, ids) };
      await update();
    },
  };
}

test('flashcard mastery counts and review filtering preserve flip controls without nesting buttons or saving fake activity', async t => {
  const app = await setup(t);
  await act(async () => button(app.renderer.root, 'Generate Flashcards').props.onClick());
  assert.equal(flips(app.renderer.root).length, 6);
  await act(async () => flips(app.renderer.root)[0].props.onClick());
  await act(async () => app.renderer.root.findByProps({ 'aria-label': 'Mark card 1 as mastered' }).props.onClick());
  assert.match(text(app.renderer.root), /Mastered 1 \/ 6 · To review 5/);
  assert.equal(flips(app.renderer.root)[0].props['aria-pressed'], true);
  assert.match(text(flips(app.renderer.root)[0]), /Original back 1/);
  for (const node of app.renderer.root.findAllByType('button')) assert.equal(node.findAllByType('button').length, 1);
  const filter = () => app.renderer.root.findByProps({ className: 'flashcard-progress' }).findByType('input');
  await act(async () => filter().props.onChange({ target: { checked: true } }));
  assert.equal(flips(app.renderer.root).length, 5);
  await act(async () => filter().props.onChange({ target: { checked: false } }));
  await act(async () => app.renderer.root.findByProps({ 'aria-label': 'Review card 1 again' }).props.onClick());
  assert.match(text(app.renderer.root), /Mastered 0 \/ 6/);
  for (let index = 1; index <= 6; index++) await act(async () => app.renderer.root.findByProps({ 'aria-label': `Mark card ${index} as mastered` }).props.onClick());
  await act(async () => filter().props.onChange({ target: { checked: true } }));
  assert.equal(flips(app.renderer.root).length, 0);
  assert.match(text(app.renderer.root), /All cards in this set are marked as mastered/);
  await act(async () => button(app.renderer.root, 'Show all cards').props.onClick());
  assert.equal(flips(app.renderer.root).length, 6);
  assert.equal(app.saves.length, 1, 'Self-assessment marks do not create new study activity');
});

test('mastery survives a failed replacement and remount, resets on each successful batch, and stays isolated by source, course, account and login session', async t => {
  let fail = false;
  const app = await setup(t, { flashcards: async () => { if (fail) throw new Error('Generation failed'); return cardsReply(); } });
  await act(async () => button(app.renderer.root, 'Generate Flashcards').props.onClick());
  const originalBatch = app.saves[0].result.revisionBatchId;
  await act(async () => app.renderer.root.findByProps({ 'aria-label': 'Mark card 1 as mastered' }).props.onClick());
  fail = true;
  await act(async () => button(app.renderer.root, 'Generate New Cards').props.onClick());
  assert.match(text(app.renderer.root), /Mastered 1 \/ 6/);
  await app.update(false); await app.update(true);
  assert.match(text(app.renderer.root), /Mastered 1 \/ 6/);
  fail = false;
  await act(async () => button(app.renderer.root, 'Generate New Cards').props.onClick());
  assert.notEqual(app.saves.at(-1).result.revisionBatchId, originalBatch);
  assert.match(text(app.renderer.root), /Mastered 0 \/ 6/);
  assert.ok(flips(app.renderer.root).every(node => !node.props['aria-pressed']));
  await act(async () => app.renderer.root.findByProps({ 'aria-label': 'Mark card 2 as mastered' }).props.onClick());
  for (const [ids, userId, courseId] of [[[11], 1, 'course'], [[11, 12], 1, 'other-course'], [[11, 12], 2, 'course']]) {
    await app.switchScope(ids, userId, courseId);
    assert.equal(flips(app.renderer.root).length, 0);
    await act(async () => button(app.renderer.root, 'Generate Flashcards').props.onClick());
    assert.match(text(app.renderer.root), /Mastered 0 \/ 6/);
  }
  await app.switchScope([11, 12], 1, 'course');
  assert.match(text(app.renderer.root), /Mastered 1 \/ 6/);
  app.modules.resetWorkspaceSession();
  await app.update();
  assert.equal(flips(app.renderer.root).length, 0);
});

test('cancelling replacement keeps mastery and filtering for the displayed batch and ignores the late cards', async t => {
  const pending = deferred();
  let count = 0;
  const app = await setup(t, { flashcards: () => count++ ? pending.promise : Promise.resolve(cardsReply()) });
  await act(async () => button(app.renderer.root, 'Generate Flashcards').props.onClick());
  await act(async () => app.renderer.root.findByProps({ 'aria-label': 'Mark card 1 as mastered' }).props.onClick());
  const filter = () => app.renderer.root.findByProps({ className: 'flashcard-progress' }).findByType('input');
  await act(async () => filter().props.onChange({ target: { checked: true } }));
  let generation;
  await act(async () => { generation = button(app.renderer.root, 'Generate New Cards').props.onClick(); });
  assert.equal(filter().props.disabled, true);
  assert.equal(app.renderer.root.findByProps({ 'aria-label': 'Mark card 2 as mastered' }).props.disabled, true);
  await act(async () => button(app.renderer.root, 'Stop generating').props.onClick());
  await act(async () => { pending.resolve(cardsReply('Cancelled')); await generation; });
  assert.match(text(app.renderer.root), /Mastered 1 \/ 6/);
  assert.equal(filter().props.checked, true);
  assert.equal(flips(app.renderer.root).length, 5);
  assert.doesNotMatch(text(app.renderer.root), /Cancelled front/);
  assert.equal(app.saves.length, 1);
});

test('real chat-kit text messages render only cited source buttons in their footer and open the existing source preview', async t => {
  const payload = '<img src=x onerror="alert(1)"><script>alert(2)</script> Answer [S2] [S2] [S999] https://untrusted.invalid/path';
  let count = 0;
  const app = await setup(t, { mode: 'qa', answer: async () => ({ answer: count++ ? 'Follow-up answer [S1]' : payload, mode: 'api' }) });
  app.data.currentChatRecords.push({ id: 'legacy', ...app.data.scope, role: 'AI', mode: 'api', text: 'Older answer [S1]' });
  await app.update();
  assert.equal(sourceGroups(app.renderer.root).length, 0, 'Old answers without recorded source order have no verified source buttons');
  await act(async () => app.send('Please explain [S1].'));
  assert.equal(sourceGroups(app.renderer.root).length, 1);
  const group = sourceGroups(app.renderer.root)[0];
  assert.deepEqual(group.findAllByType('button').map(text), ['[S2]']);
  const actual = app.renderer.root.findAllByType(Message).find(node => node.props.model.message === payload);
  assert.equal(actual.props.type, 'text');
  assert.ok(actual.findAllByType('div').some(node => String(node.props.className).includes('cs-message__footer')));
  const html = renderToStaticMarkup(React.createElement(Message, actual.props));
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;script/);
  assert.doesNotMatch(html, /<img|<script|<a[ >]/);
  await act(async () => app.send('Please clarify the first source.'));
  assert.deepEqual(sourceGroups(app.renderer.root).map(node => node.findAllByType('button').map(text)), [['[S2]'], ['[S1]']]);
  app.data.selectedMaterials = [...app.data.selectedMaterials].reverse();
  await app.update();
  await act(async () => sourceGroups(app.renderer.root)[0].findByType('button').props.onClick());
  const preview = app.renderer.root.findByProps({ role: 'dialog' });
  assert.equal(preview.props['aria-label'], '[S2] Second.txt', 'Labels keep the source order used for this answer, even after display order changes');
  assert.match(text(preview), /SECOND SOURCE complete extracted text/);
  await act(async () => button(app.renderer.root, 'Close source preview').props.onClick());
  await app.update(false); await app.update(true);
  assert.deepEqual(sourceGroups(app.renderer.root).map(node => node.findAllByType('button').map(text)), [['[S2]'], ['[S1]']], 'Current-login source manifests survive returning to the page');
  await app.switchScope([11]);
  assert.equal(sourceGroups(app.renderer.root).length, 0);
  assert.equal(app.renderer.root.findAllByProps({ role: 'dialog' }).length, 0);
});

test('source manifests reject wrong scope, foreign ownership, absent labels and old unverified answers', async t => {
  const app = await setup(t, { mode: 'qa' });
  const record = { id: 'answer', ...app.data.scope, role: 'AI', mode: 'api', text: '[S1] [S2] [S2] [S0] [S01] [S999]' };
  const provenance = { scopeKey: app.data.scope.scopeKey, materialIds: [11, 12] };
  const match = (answer = record, mapping = provenance, materials = app.materials) => app.modules.answerSources(answer, mapping, app.data.scope, materials);
  assert.deepEqual(match().map(item => [item.label, item.material.id]), [['[S1]', 11], ['[S2]', 12]]);
  assert.deepEqual(match({ ...record, mode: 'legacy' }), []);
  assert.deepEqual(match({ ...record, role: 'User' }), []);
  assert.deepEqual(match({ ...record, scopeKey: 'different' }), []);
  assert.deepEqual(match({ ...record, userId: 2 }), []);
  assert.deepEqual(match({ ...record, courseId: 'other-course' }), []);
  assert.deepEqual(match(record, null), []);
  assert.deepEqual(match(record, { ...provenance, scopeKey: 'different' }), []);
  assert.deepEqual(match(record, provenance, [{ ...app.materials[0], ownerId: 2 }, app.materials[1]]), []);
  assert.deepEqual(match({ ...record, text: 'No citation in this answer' }), []);
});

test('a cancelled or old-scope Q&A response cannot create source buttons in the new scope', async t => {
  const pending = deferred();
  const app = await setup(t, { mode: 'qa', answer: () => pending.promise });
  let sending;
  await act(async () => { sending = app.send('Explain this.'); });
  await app.switchScope([11], 2);
  assert.equal(app.calls[0].input.signal.aborted, true);
  await act(async () => { pending.resolve({ answer: 'Late source [S1]', mode: 'api' }); await sending; });
  assert.equal(sourceGroups(app.renderer.root).length, 0);
  assert.equal(app.data.currentChatRecords.length, 0);
});
