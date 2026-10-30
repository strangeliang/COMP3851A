import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { loadSource, deferred, memoryWindow } from './helpers.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const text = node => typeof node === 'string' || typeof node === 'number' ? String(node)
  : (node?.children || []).map(text).join('');
const button = (root, label) => {
  const found = root.findAllByType('button').find(node => text(node) === label);
  assert.ok(found, `Missing button: ${label}`);
  return found;
};
const summary = (id = 'summary', course = 'course-a') => ({
  id, owner_id: 1, kind: 'summary', course_id: course, created_at: `2026-10-30 ${id}`,
  payload: { summary: { paragraph: `${id} unique summary paragraph`, concepts: [`${id} unique concept`] } },
});
const quiz = () => ({
  id: 'quiz', owner_id: 1, kind: 'quiz', course_id: 'course-a', created_at: '2026-10-30 quiz',
  payload: {
    score: 50,
    questions: [
      { id: 1, question: 'Already correct question', options: ['First', 'Second'], answerIndex: 0 },
      { id: 2, question: 'Choose both unique concepts', options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
        answerIndices: [0, 2], explanation: 'Alpha and Gamma are supported.' },
    ],
    answers: { 1: 0, 2: [1] },
  },
});
const details = root => root.findAll(node => typeof node.type === 'string'
  && String(node.props.className || '').split(' ').includes('history-details'));
const detailText = node => node.children.filter(child => child?.type !== 'h2').map(text).join('');
const dialogs = root => root.findAllByProps({ role: 'dialog' });
const options = root => root.findAllByType('label').filter(node => node.findAllByType('input').length);
const optionOrder = root => options(root).map(node => text(node).trim());
const choose = async (root, value) => {
  const label = options(root).find(node => text(node).trim() === value);
  assert.ok(label, `Missing option: ${value}`);
  await act(async () => label.findByType('input').props.onChange());
};
const submitEvent = () => ({ preventDefault() {} });

async function setup(t, { records = [summary()], reviews = [], review = false, language = 'en', handler } = {}) {
  const state = { records: structuredClone(records), reviews: structuredClone(reviews), deletedRecords: [] };
  const calls = [];
  const lifecycle = { active: 0, closed: 0 };
  function Dialog({ title, closeLabel, onClose, children }) {
    React.useEffect(() => {
      lifecycle.active++;
      return () => { lifecycle.active--; lifecycle.closed++; };
    }, []);
    return React.createElement('section', { role: 'dialog', 'aria-label': title },
      React.createElement('button', { type: 'button', onClick: onClose }, closeLabel), children);
  }
  const { default: History } = await loadSource("export {default} from './src/pages/student/HistoryPage.jsx';", {
    '../../layouts/StudentLayout': ({ children }) => React.createElement('main', null, children),
    '../../components/HistoryRecordDialog': Dialog,
    '../../state/LanguageContext': { useLanguage: () => ({ language }) },
    '../../state/AppDataContext': { useAppData: () => ({
      studentCourses: [{ id: 'course-a', code: 'A', name: 'Course A' }, { id: 'course-b', code: 'B', name: 'Course B' }],
      summaryRecords: [], currentChatRecords: [], quizAttempts: [], refreshStudyHistory: async () => {},
    }) },
    '../../services/apiClient': { apiRequest: async (url, request = {}) => {
      const call = { url, method: request.method || 'GET', body: request.body ? structuredClone(request.body) : undefined };
      calls.push(call);
      const custom = await handler?.(call, state);
      if (custom !== undefined) return custom;
      if (call.method === 'DELETE') {
        const id = decodeURIComponent(url.split('/').at(-1));
        state.deletedRecords.push(...state.records.filter(record => record.id === id));
        state.records = state.records.filter(record => record.id !== id);
        state.reviews = state.reviews.filter(record => record.record_id !== id);
        return { ok: true };
      }
      if (call.method === 'POST' && url.endsWith('/review')) {
        return { answers: call.body.answers, mode: call.body.mode, correct: 1, total: 1, score: 100 };
      }
      return structuredClone(state);
    } },
  }, { window: memoryWindow() });
  let renderer;
  await act(async () => { renderer = create(React.createElement(History, { review })); });
  let alive = true;
  const unmount = async () => {
    if (alive) { await act(async () => renderer.unmount()); alive = false; }
  };
  t.after(unmount);
  return {
    renderer, state, calls, lifecycle, unmount,
    open: async date => {
      const opener = renderer.root.findAllByProps({ className: 'history-record-open' })
        .find(node => !date || text(node).includes(date));
      assert.ok(opener, `Missing record: ${date || 'first'}`);
      await act(async () => opener.props.onClick());
    },
    close: async () => {
      assert.equal(dialogs(renderer.root).length, 1);
      await act(async () => dialogs(renderer.root)[0].findAllByType('button')[0].props.onClick());
    },
  };
}

test('history opens every record type in one dialog, then keeps the same details inline on close', async t => {
  const summaryRecord = summary();
  const qaBase = { owner_id: 1, kind: 'qa', course_id: 'course-a' };
  const qaQuestion = { ...qaBase, id: 'question', created_at: '2026-10-30 qa-1', payload: {
    role: 'User', text: 'Unique saved question', conversationId: 'a'.repeat(36), scopeKey: 'scope-a', messageOrder: 0,
  } };
  const qaAnswer = { ...qaBase, id: 'answer', created_at: '2026-10-30 qa-2', payload: {
    role: 'AI', text: 'Unique saved reply', conversationId: 'a'.repeat(36), scopeKey: 'scope-a', messageOrder: 1,
  } };
  const flashcards = { id: 'cards', owner_id: 1, kind: 'flashcards', course_id: 'course-a', created_at: '2026-10-30 cards',
    payload: { cards: [{ front: 'Unique card front', back: 'Unique card explanation', source: '[S1]' }] } };
  const quizRecord = quiz();
  const app = await setup(t, { records: [summaryRecord, qaQuestion, qaAnswer, flashcards, quizRecord] });
  const expected = [
    [summaryRecord.created_at, ['summary unique summary paragraph', 'summary unique concept']],
    [qaAnswer.created_at, ['Unique saved question', 'Unique saved reply']],
    [flashcards.created_at, ['Unique card front', 'Unique card explanation', '[S1]']],
    [quizRecord.created_at, ['Already correct question', 'Choose both unique concepts', 'Your answer:', 'Correct answer:']],
  ];
  let previousToken;
  for (const [date, tokens] of expected) {
    await app.open(date);
    assert.equal(dialogs(app.renderer.root).length, 1);
    assert.equal(details(app.renderer.root).length, 1, 'Never render a second background details form');
    assert.equal(details(dialogs(app.renderer.root)[0]).length, 1);
    const modalText = detailText(details(app.renderer.root)[0]);
    for (const token of tokens) assert.ok(modalText.includes(token), `Missing saved content: ${token}`);
    if (previousToken) assert.ok(!modalText.includes(previousToken), 'Selecting another record removes old details');
    await app.close();
    assert.equal(dialogs(app.renderer.root).length, 0);
    assert.equal(details(app.renderer.root).length, 1);
    assert.equal(detailText(details(app.renderer.root)[0]), modalText);
    await app.open(date);
    assert.equal(dialogs(app.renderer.root).length, 1, 'Clicking a record again reopens its dialog');
    await app.close();
    previousToken = tokens[0];
  }
  assert.equal(app.calls.filter(call => call.method !== 'GET').length, 0, 'Viewing and closing do not save new records');
  assert.deepEqual(app.state.records.find(record => record.id === 'quiz').payload, quizRecord.payload);
});

test('review closes to a compact prompt and reopening from either control preserves answers, option order and saved results', async t => {
  const original = quiz();
  const app = await setup(t, { records: [original], review: true });
  await app.open();
  const order = optionOrder(app.renderer.root);
  assert.equal(app.renderer.root.findByType('h3').children.join(''), '2. Choose both unique concepts');
  await choose(app.renderer.root, 'Gamma');
  await choose(app.renderer.root, 'Alpha');
  await app.close();
  assert.equal(details(app.renderer.root).length, 0, 'Review never repeats the full practice below the list');
  assert.equal(app.renderer.root.findAllByType('form').length, 0);
  assert.equal(options(app.renderer.root).length, 0);
  assert.equal(button(app.renderer.root, 'Open practice').props['aria-haspopup'], 'dialog');
  assert.match(text(app.renderer.root), /Your current answers are kept/);
  await act(async () => button(app.renderer.root, 'Open practice').props.onClick());
  assert.deepEqual(optionOrder(app.renderer.root), order);
  assert.deepEqual(options(app.renderer.root).filter(node => node.findByType('input').props.checked)
    .map(node => text(node).trim()).sort(), ['Alpha', 'Gamma']);
  await act(async () => button(app.renderer.root, 'Close practice').props.onClick());
  await app.open();
  assert.deepEqual(optionOrder(app.renderer.root), order, 'Clicking the same record resumes the existing practice');
  assert.deepEqual(options(app.renderer.root).filter(node => node.findByType('input').props.checked)
    .map(node => text(node).trim()).sort(), ['Alpha', 'Gamma']);
  await act(async () => app.renderer.root.findByType('form').props.onSubmit(submitEvent()));
  const post = app.calls.find(call => call.method === 'POST');
  assert.deepEqual(post.body.answers, { 2: [2, 0] });
  assert.equal(post.body.mode, 'wrong');
  assert.match(text(dialogs(app.renderer.root)[0]), /Saved: 1\/1 correct/);
  await app.close();
  assert.equal(details(app.renderer.root).length, 0);
  assert.match(text(app.renderer.root), /Your practice has been saved/);
  await act(async () => button(app.renderer.root, 'Open practice').props.onClick());
  assert.match(text(dialogs(app.renderer.root)[0]), /Saved: 1\/1 correct/);
  assert.equal(app.calls.filter(call => call.method === 'POST').length, 1, 'Reopening a saved result does not submit again');
  await act(async () => button(app.renderer.root, 'Practise again').props.onClick());
  assert.ok(options(app.renderer.root).every(node => !node.findByType('input').props.checked));
  assert.ok(!text(dialogs(app.renderer.root)[0]).includes('Saved: 1/1 correct'));
  assert.deepEqual(app.state.records[0].payload, original.payload);
});

test('review validation and save failures are visible inside the dialog, and unchanged retries retain their ID', async t => {
  let fail = true;
  const app = await setup(t, { records: [quiz()], review: true, handler: call => {
    if (call.method === 'POST' && fail) throw new Error('Practice could not be saved');
  } });
  await app.open();
  await act(async () => app.renderer.root.findByType('form').props.onSubmit(submitEvent()));
  assert.match(text(dialogs(app.renderer.root)[0]), /Answer every practice question/);
  assert.equal(app.calls.filter(call => call.method === 'POST').length, 0);
  await choose(app.renderer.root, 'Alpha');
  await choose(app.renderer.root, 'Gamma');
  await act(async () => app.renderer.root.findByType('form').props.onSubmit(submitEvent()));
  assert.match(text(dialogs(app.renderer.root)[0]), /Practice could not be saved/);
  assert.equal(options(app.renderer.root).filter(node => node.findByType('input').props.checked).length, 2);
  await app.close();
  assert.match(text(app.renderer.root.findByProps({ role: 'alert' })), /Practice could not be saved/);
  await act(async () => button(app.renderer.root, 'Open practice').props.onClick());
  assert.match(text(dialogs(app.renderer.root)[0]), /Practice could not be saved/);
  assert.equal(options(app.renderer.root).filter(node => node.findByType('input').props.checked).length, 2);
  fail = false;
  await act(async () => app.renderer.root.findByType('form').props.onSubmit(submitEvent()));
  const posts = app.calls.filter(call => call.method === 'POST');
  assert.equal(posts.length, 2);
  assert.equal(posts[0].body.clientId, posts[1].body.clientId);
  assert.match(text(dialogs(app.renderer.root)[0]), /Saved: 1\/1 correct/);
});

test('closing during a pending review keeps one submission and offers the saved result only when reopened', async t => {
  const response = deferred();
  const app = await setup(t, { records: [quiz()], review: true, handler: call =>
    call.method === 'POST' ? response.promise : undefined });
  await app.open();
  await choose(app.renderer.root, 'Alpha');
  await choose(app.renderer.root, 'Gamma');
  let saving;
  await act(async () => { saving = app.renderer.root.findByType('form').props.onSubmit(submitEvent()); });
  assert.ok(app.renderer.root.findAllByType('input').every(node => node.props.disabled));
  assert.ok(app.renderer.root.findAllByType('select').every(node => node.props.disabled));
  await app.close();
  assert.equal(dialogs(app.renderer.root).length, 0);
  assert.equal(details(app.renderer.root).length, 0);
  assert.equal(app.renderer.root.findAllByType('form').length, 0);
  assert.equal(button(app.renderer.root, 'Open practice').props.disabled, true);
  assert.ok(app.renderer.root.findAllByProps({ className: 'history-record-open' }).every(node => node.props.disabled));
  assert.match(text(app.renderer.root.findByProps({ role: 'status' })), /Loading/);
  await act(async () => button(app.renderer.root, 'Open practice').props.onClick());
  assert.equal(dialogs(app.renderer.root).length, 0, 'Pending guard also blocks programmatic reopen');
  assert.equal(app.calls.filter(call => call.method === 'POST').length, 1);
  await act(async () => {
    response.resolve({ answers: { 2: [0, 2] }, mode: 'wrong', correct: 1, total: 1, score: 100 });
    await saving;
  });
  assert.equal(dialogs(app.renderer.root).length, 0);
  assert.equal(details(app.renderer.root).length, 0);
  assert.match(text(app.renderer.root), /Your practice has been saved/);
  assert.equal(button(app.renderer.root, 'Open practice').props.disabled, false);
  await act(async () => button(app.renderer.root, 'Open practice').props.onClick());
  assert.match(text(dialogs(app.renderer.root)[0]), /Saved: 1\/1 correct/);
  assert.equal(app.calls.filter(call => call.method === 'POST').length, 1);
});

test('course, type and practice-mode changes clear both dialog and inline selection', async t => {
  const app = await setup(t, { records: [summary(), summary('other', 'course-b')] });
  await app.open('2026-10-30 summary');
  await act(async () => app.renderer.root.findAllByType('select')[0].props.onChange({ target: { value: 'course-b' } }));
  assert.equal(dialogs(app.renderer.root).length, 0);
  assert.equal(details(app.renderer.root).length, 0);
  await app.open('2026-10-30 other');
  await app.close();
  await act(async () => app.renderer.root.findAllByType('select')[1].props.onChange({ target: { value: 'quiz' } }));
  assert.equal(details(app.renderer.root).length, 0);
  const review = await setup(t, { records: [quiz()], review: true });
  await review.open();
  await choose(review.renderer.root, 'Alpha');
  await act(async () => review.renderer.root.findByProps({ 'aria-label': 'Practice mode' }).props.onChange({ target: { value: 'all' } }));
  assert.equal(dialogs(review.renderer.root).length, 0);
  assert.equal(details(review.renderer.root).length, 0);
  assert.equal(review.renderer.root.findAllByProps({ className: 'history-practice-prompt' }).length, 0);
  await review.open();
  assert.equal(dialogs(review.renderer.root).length, 1);
  assert.ok(review.renderer.root.findAllByType('input').every(node => !node.props.checked));
  assert.deepEqual(review.renderer.root.findAllByType('h3').map(text), ['1. Already correct question', '2. Choose both unique concepts']);
});

test('review selection starts another quiz cleanly and removes the compact prompt on search, course changes or refreshed removal', async t => {
  const other = { ...quiz(), id: 'other-quiz', created_at: '2026-10-30 other-quiz' };
  const app = await setup(t, { records: [quiz(), other], review: true });
  const prompts = () => app.renderer.root.findAllByProps({ className: 'history-practice-prompt' });
  assert.equal(prompts().length, 0, 'No reopen prompt before selecting a quiz');
  await app.open('2026-10-30 quiz');
  await choose(app.renderer.root, 'Alpha');
  await app.close();
  await app.open('2026-10-30 other-quiz');
  assert.ok(options(app.renderer.root).every(node => !node.findByType('input').props.checked));
  await app.close();
  await act(async () => app.renderer.root.findByProps({ id: 'history-search' }).props.onChange({ target: { value: 'unmatched' } }));
  assert.equal(prompts().length, 0);
  await act(async () => button(app.renderer.root, 'Clear search').props.onClick());
  assert.equal(prompts().length, 0, 'Clearing a filter does not restore an abandoned selection');
  await app.open('2026-10-30 quiz');
  await app.close();
  await act(async () => app.renderer.root.findAllByType('select')[0].props.onChange({ target: { value: 'course-b' } }));
  assert.equal(prompts().length, 0);
  await act(async () => app.renderer.root.findAllByType('select')[0].props.onChange({ target: { value: 'All' } }));
  await app.open('2026-10-30 other-quiz');
  await app.close();
  app.state.records = [];
  await act(async () => button(app.renderer.root, 'Refresh records').props.onClick());
  assert.equal(prompts().length, 0);
  assert.equal(dialogs(app.renderer.root).length, 0);
});

test('review prompt and modal controls translate without replacing the saved question text', async t => {
  const app = await setup(t, { records: [quiz()], review: true, language: 'zh' });
  await app.open();
  assert.match(text(dialogs(app.renderer.root)[0]), /Choose both unique concepts/);
  await act(async () => button(app.renderer.root, '关闭练习').props.onClick());
  assert.equal(details(app.renderer.root).length, 0);
  assert.match(text(app.renderer.root), /当前测验中已选择的答案会保留/);
  assert.equal(button(app.renderer.root, '展开练习').props['aria-haspopup'], 'dialog');
  await act(async () => button(app.renderer.root, '展开练习').props.onClick());
  assert.equal(dialogs(app.renderer.root)[0].props['aria-label'], '错题练习');
  assert.match(text(dialogs(app.renderer.root)[0]), /Choose both unique concepts/);
});

test('failed deletion keeps the selected details, while successful deletion and missing refreshed records clear them', async t => {
  let fail = true;
  const app = await setup(t, { records: [summary(), summary('other')], handler: call => {
    if (call.method === 'DELETE' && fail) throw new Error('Delete failed');
  } });
  await app.open('2026-10-30 summary');
  await app.close();
  const remove = () => app.renderer.root.findAllByProps({ className: 'history-delete-button' })
    .find(node => node.props['aria-label'].includes('2026-10-30 summary'));
  await act(async () => remove().props.onClick());
  assert.equal(details(app.renderer.root).length, 1);
  assert.match(text(details(app.renderer.root)[0]), /summary unique summary paragraph/);
  fail = false;
  await act(async () => remove().props.onClick());
  assert.equal(dialogs(app.renderer.root).length, 0);
  assert.equal(details(app.renderer.root).length, 0);
  await app.open('2026-10-30 other');
  app.state.records = [];
  await act(async () => button(app.renderer.root, 'Refresh records').props.onClick());
  assert.equal(dialogs(app.renderer.root).length, 0);
  assert.equal(details(app.renderer.root).length, 0);
});

test('unmounting closes a pending review dialog and its late response does not refresh an abandoned page', async t => {
  const response = deferred();
  const app = await setup(t, { records: [quiz()], review: true, handler: call =>
    call.method === 'POST' ? response.promise : undefined });
  await app.open();
  await choose(app.renderer.root, 'Alpha');
  let saving;
  await act(async () => { saving = app.renderer.root.findByType('form').props.onSubmit(submitEvent()); });
  assert.equal(app.lifecycle.active, 1);
  const callsBeforeUnmount = app.calls.length;
  await app.unmount();
  assert.equal(app.lifecycle.active, 0);
  assert.equal(app.lifecycle.closed, 1);
  await act(async () => {
    response.resolve({ answers: { 2: [0] }, mode: 'wrong', correct: 0, total: 1, score: 0 });
    await saving;
  });
  assert.equal(app.calls.length, callsBeforeUnmount, 'No follow-up history request after unmount');
});
