import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { loadSource, memoryWindow, deferred } from './helpers.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const getScopeKey = (user, course, ids) => JSON.stringify([user, course, ids]);
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node)
  : (node?.children || []).map(text).join('');
const button = (root, label) => {
  const match = root.findAllByType('button').find(node => text(node) === label);
  assert.ok(match, `Missing button: ${label}`);
  return match;
};
const questions = label => [0, 1].map(index => ({ id: index + 1, question: `${label} question ${index + 1}`,
  options: [`${label} A`, `${label} B`, `${label} C`, `${label} D`], answerIndices: [0], explanation: 'Supported by [S1].' }));
const quizReply = label => ({ questions: questions(label), quizType: 'single', mode: 'api' });
const summaryReply = label => ({ paragraph: `${label} summary [S1] [S999]`, concepts: [`${label} concept`], mode: 'api' });

async function setup(t, handlers = {}) {
  const window = memoryWindow();
  window.sessionStorage = memoryWindow().localStorage;
  const confirmations = [];
  let confirm = true;
  window.confirm = message => { confirmations.push(message); return confirm; };
  const materials = [
    { id: 11, name: 'first.pdf', type: 'PDF', content: 'BEGIN SOURCE ' + 'real text '.repeat(300) + 'END SOURCE', hasOriginal: true, courseId: 'course' },
    { id: 12, name: 'older.txt', type: 'TXT', content: 'Complete older extracted source.', hasOriginal: false, courseId: 'course' },
  ];
  const saves = [], calls = [];
  let userId = 1, ids = [11], version = 0;
  const data = {
    studentCourses: [{ id: 'course', code: 'COURSE', name: 'Learning course' }],
    currentCourse: { id: 'course', code: 'COURSE', name: 'Learning course' }, currentCourseId: 'course',
    courseMaterials: materials, selectedMaterials: [materials[0]], selectedMaterialIds: ids,
    courseState: { loading: false, error: '' }, materialState: { loading: false, error: '' },
    aiStatus: { configured: true, loading: false }, summaryUses: 0, qaUses: 0,
    scope: { userId, courseId: 'course', selectedMaterialIds: ids, scopeKey: getScopeKey(userId, 'course', ids) },
    selectCourse() {}, setSelectedMaterialIds() {}, retryCourses() {}, retryMaterials() {},
    recordSummaryUse: (result, scope) => saves.push({ kind: 'summary', result: structuredClone(result), scope }),
    saveQuizAttempt: (result, scope) => saves.push({ kind: 'quiz', result: structuredClone(result), scope }),
    persistStudy: () => {},
  };
  function request(kind, input) {
    calls.push({ kind, input });
    return handlers[kind]?.(input) || Promise.resolve(kind === 'summary' ? summaryReply('Original') : quizReply('Original'));
  }
  const language = { useLanguage: () => ({ language: 'en' }) };
  const { default: Workspace } = await loadSource("export {default} from './src/pages/student/StudyWorkspacePage.jsx';", {
    '../../layouts/StudentLayout': ({ children }) => React.createElement('main', null, children),
    '../../components/AIChatBox': () => null,
    '../../components/AIServiceStatus': () => null,
    '../../state/AppDataContext': { useAppData: () => data },
    '../../state/LanguageContext': language, '../state/LanguageContext': language,
    './HistoryRecordDialog': ({ title, onClose, closeLabel, children }) => React.createElement('section', { role: 'dialog', 'aria-label': title },
      React.createElement('button', { onClick: onClose }, closeLabel), children),
    '../../services/aiService': {
      generateAISummary: input => request('summary', input), generateAIQuiz: input => request('quiz', input),
      generateAIFlashcards: input => request('flashcards', input),
    },
  }, { window });
  function Root() { return React.createElement(MemoryRouter, null, React.createElement(Workspace)); }
  let renderer;
  await act(async () => { renderer = create(React.createElement(Root)); });
  t.after(() => act(async () => renderer.unmount()));
  return { renderer, saves, calls, confirmations, materials,
    confirm: value => { confirm = value; },
    switchScope: async (nextIds, nextUser = userId) => {
      ids = nextIds; userId = nextUser;
      data.selectedMaterialIds = ids;
      data.selectedMaterials = materials.filter(material => ids.includes(material.id));
      data.scope = { userId, courseId: 'course', selectedMaterialIds: ids, scopeKey: getScopeKey(userId, 'course', ids) };
      await act(async () => { renderer.update(React.createElement(Root, { version: ++version })); });
    },
  };
}

test('summary regeneration keeps the old summary through failure and cancellation and only saves successful replacements', async t => {
  const failed = deferred(), cancelled = deferred();
  let count = 0;
  const app = await setup(t, { summary: () => [Promise.resolve(summaryReply('Original')), failed.promise,
    cancelled.promise, Promise.resolve(summaryReply('Fresh'))][count++] });
  await act(async () => button(app.renderer.root, 'Generate Summary').props.onClick());
  let generating;
  await act(async () => { generating = button(app.renderer.root, 'Regenerate').props.onClick(); });
  assert.match(text(app.renderer.root), /Original summary/);
  await act(async () => { failed.reject(new Error('Provider temporarily unavailable')); await generating; });
  assert.match(text(app.renderer.root), /Original summary/);
  assert.match(text(app.renderer.root), /Provider temporarily unavailable/);
  assert.equal(app.saves.length, 1);
  await act(async () => { generating = button(app.renderer.root, 'Regenerate').props.onClick(); });
  await act(async () => button(app.renderer.root, 'Stop generating').props.onClick());
  assert.equal(app.calls.at(-1).input.signal.aborted, true);
  await act(async () => { cancelled.resolve(summaryReply('Cancelled')); await generating; });
  assert.match(text(app.renderer.root), /Original summary/);
  assert.doesNotMatch(text(app.renderer.root), /Cancelled summary/);
  assert.equal(app.saves.length, 1);
  await act(async () => button(app.renderer.root, 'Regenerate').props.onClick());
  assert.match(text(app.renderer.root), /Fresh summary/);
  assert.equal(app.saves.length, 2);
});

test('Quiz requires replacement confirmation and retains its questions, answer and position until generation succeeds', async t => {
  const failed = deferred(), cancelled = deferred();
  let count = 0;
  const app = await setup(t, { quiz: () => [Promise.resolve(quizReply('Original')), failed.promise,
    cancelled.promise, Promise.resolve(quizReply('Fresh'))][count++] });
  await act(async () => button(app.renderer.root, 'Quiz').props.onClick());
  await act(async () => button(app.renderer.root, 'Generate Quiz').props.onClick());
  assert.equal(app.confirmations.length, 0);
  await act(async () => button(app.renderer.root, 'Next').props.onClick());
  const answerInputs = () => app.renderer.root.findAllByType('input').filter(node => node.props.name === 'question-2');
  await act(async () => answerInputs()[1].props.onChange());
  app.confirm(false);
  await act(async () => button(app.renderer.root, 'Generate New Quiz').props.onClick());
  assert.equal(app.calls.filter(call => call.kind === 'quiz').length, 1);
  assert.equal(answerInputs()[1].props.checked, true);
  app.confirm(true);
  let generating;
  await act(async () => { generating = button(app.renderer.root, 'Generate New Quiz').props.onClick(); });
  assert.match(text(app.renderer.root), /Original question 2/);
  assert.equal(answerInputs()[1].props.checked, true);
  assert.equal(answerInputs()[1].props.disabled, true);
  await act(async () => { failed.reject(new Error('Quiz generation failed')); await generating; });
  assert.match(text(app.renderer.root), /Question 2 of 2/);
  assert.equal(answerInputs()[1].props.checked, true);
  await act(async () => { generating = button(app.renderer.root, 'Generate New Quiz').props.onClick(); });
  await act(async () => button(app.renderer.root, 'Stop generating').props.onClick());
  await act(async () => { cancelled.resolve(quizReply('Cancelled')); await generating; });
  assert.match(text(app.renderer.root), /Original question 2/);
  assert.equal(answerInputs()[1].props.checked, true);
  await act(async () => button(app.renderer.root, 'Generate New Quiz').props.onClick());
  assert.match(text(app.renderer.root), /Fresh question 1/);
  assert.match(text(app.renderer.root), /Question 1 of 2/);
  assert.ok(app.renderer.root.findAllByType('input').filter(node => node.props.name === 'question-1').every(node => !node.props.checked));
  assert.equal(app.saves.length, 0, 'Generating replacements does not submit a Quiz attempt');
});

test('a failed replacement also preserves an already submitted Quiz and its saved result', async t => {
  let count = 0;
  const app = await setup(t, { quiz: () => count++ ? Promise.reject(new Error('Try later')) : Promise.resolve(quizReply('Original')) });
  await act(async () => button(app.renderer.root, 'Quiz').props.onClick());
  await act(async () => button(app.renderer.root, 'Generate Quiz').props.onClick());
  for (let index = 1; index <= 2; index++) {
    await act(async () => app.renderer.root.findAllByType('input').filter(node => node.props.name === `question-${index}`)[0].props.onChange());
    if (index === 1) await act(async () => button(app.renderer.root, 'Next').props.onClick());
  }
  await act(async () => button(app.renderer.root, 'Submit').props.onClick());
  const saved = structuredClone(app.saves[0]);
  await act(async () => button(app.renderer.root, 'Generate New Quiz').props.onClick());
  assert.match(text(app.renderer.root), /100% \(2\/2\)/);
  assert.ok(button(app.renderer.root, 'Retake Quiz'));
  assert.equal(app.saves.length, 1);
  assert.deepEqual(app.saves[0], saved);
});

test('late Summary and Quiz replacements cannot overwrite another material scope or account', async t => {
  for (const kind of ['summary', 'quiz']) {
    const pending = deferred();
    let count = 0;
    const app = await setup(t, { [kind]: () => count++ ? pending.promise
      : Promise.resolve(kind === 'summary' ? summaryReply('Original') : quizReply('Original')) });
    if (kind === 'quiz') await act(async () => button(app.renderer.root, 'Quiz').props.onClick());
    await act(async () => button(app.renderer.root, kind === 'summary' ? 'Generate Summary' : 'Generate Quiz').props.onClick());
    let generating;
    await act(async () => { generating = button(app.renderer.root, kind === 'summary' ? 'Regenerate' : 'Generate New Quiz').props.onClick(); });
    const old = app.calls.at(-1);
    await app.switchScope(kind === 'summary' ? [12] : [11], kind === 'summary' ? 1 : 2);
    assert.equal(old.input.signal.aborted, true);
    await act(async () => { pending.resolve(kind === 'summary' ? summaryReply('Late') : quizReply('Late')); await generating; });
    assert.doesNotMatch(text(app.renderer.root), /Late (summary|question)/);
    assert.doesNotMatch(text(app.renderer.root), /Original (summary|question)/);
    assert.equal(app.saves.length, kind === 'summary' ? 1 : 0);
  }
});

test('source buttons preview complete selected text and authenticated relative original links, never model-invented sources', async t => {
  const app = await setup(t);
  await act(async () => button(app.renderer.root, 'Generate Summary').props.onClick());
  const sourceButtons = () => app.renderer.root.findAllByType('button').filter(node => node.props.className === 'material-source-link');
  assert.ok(sourceButtons().length > 0);
  assert.ok(sourceButtons().every(node => text(node) === '[S1] first.pdf'));
  assert.ok(sourceButtons().every(node => !text(node).includes('S999')));
  await act(async () => sourceButtons()[0].props.onClick());
  const modal = app.renderer.root.findByProps({ role: 'dialog' });
  assert.equal(modal.props['aria-label'], '[S1] first.pdf');
  assert.equal(modal.findByType('pre').children.join(''), app.materials[0].content);
  assert.match(text(modal), /not the original file/);
  assert.deepEqual(modal.findAllByType('a').map(node => node.props.href), ['/api/materials/11/original?preview=1', '/api/materials/11/original']);
  await act(async () => button(modal, 'Close source preview').props.onClick());
  assert.equal(app.renderer.root.findAllByProps({ role: 'dialog' }).length, 0);
  await app.switchScope([11, 12]);
  await act(async () => sourceButtons().find(node => text(node) === '[S2] older.txt').props.onClick());
  const legacy = app.renderer.root.findByProps({ role: 'dialog' });
  assert.equal(legacy.props['aria-label'], '[S2] older.txt');
  assert.match(text(legacy), /original file was not saved/);
  assert.equal(legacy.findAllByType('a').length, 0);
  assert.equal(legacy.findByType('pre').children.join(''), app.materials[1].content);
  await app.switchScope([11]);
  assert.equal(app.renderer.root.findAllByProps({ role: 'dialog' }).length, 0);
  await app.switchScope([11, 12]);
  assert.equal(app.renderer.root.findAllByProps({ role: 'dialog' }).length, 0, 'Returning to earlier materials does not reopen an old preview');
  await act(async () => sourceButtons().find(node => text(node) === '[S2] older.txt').props.onClick());
  await app.switchScope([11, 12], 2);
  assert.equal(app.renderer.root.findAllByProps({ role: 'dialog' }).length, 0, 'A source preview cannot survive an account change');
});

test('Office originals offer download without pretending the extracted text is an original-file preview', async t => {
  const app = await setup(t);
  Object.assign(app.materials[1], { name: 'lecture.docx', type: 'DOCX', hasOriginal: true });
  await app.switchScope([12]);
  await act(async () => app.renderer.root.findAllByType('button').find(node => node.props.className === 'material-source-link').props.onClick());
  const modal = app.renderer.root.findByProps({ role: 'dialog' });
  assert.equal(modal.findAllByType('a').length, 1);
  assert.equal(modal.findByType('a').props.href, '/api/materials/12/original');
  assert.equal(text(modal.findByType('a')), 'Download original');
  assert.match(text(modal), /Full extracted text/);
  assert.match(text(modal), /not the original file/);
});
