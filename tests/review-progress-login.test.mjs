import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { loadSource } from './helpers.mjs';
import { formatStudyDate } from '../src/utils/dateTime.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.children || []).map(text).join('');
const original = { id: 'quiz-a', kind: 'quiz', course_id: 'course-a', created_at: '2026-10-01 00:00:00', payload: {
  score: 40, questions: [{ id: 1, question: 'Question kept unchanged', options: ['Right', 'Wrong'], answerIndex: 0 }], answers: { 1: 1 },
} };
const attempt = (id, date, mode = 'wrong', correct = 1, total = 2) => ({ id, record_id: original.id, created_at: date, payload: { mode, correct, total } });

test('latest practice uses dates rather than input order and never changes original grades or review data', async () => {
  const { latestPractice } = await loadSource('src/utils/reviewDisplay.js');
  const older = attempt('older', '2026-10-05 01:00:00', 'wrong', 2, 2);
  const newest = attempt('new', '2026-10-06 01:00:00', 'all', 0, 4);
  const unrelated = { ...attempt('unrelated', '2026-10-30 01:00:00'), record_id: 'another-quiz' };
  const invalid = attempt('invalid', '2026-10-29 01:00:00', 'wrong', 5, 2);
  const reviews = [older, newest, unrelated, invalid], before = structuredClone(reviews);
  assert.equal(latestPractice(reviews, original.id), newest);
  assert.deepEqual(reviews, before);
  assert.equal(original.payload.score, 40);
  assert.equal(latestPractice(reviews, 'no-saved-review'), null);
});

async function historySetup(t, { language = 'en', review = true, reviews = [] } = {}) {
  const state = { records: [structuredClone(original)], reviews };
  const { default: History } = await loadSource("export {default} from './src/pages/student/HistoryPage.jsx'", {
    '../../layouts/StudentLayout': ({ children }) => React.createElement('main', null, children),
    '../../state/LanguageContext': { useLanguage: () => ({ language }) },
    '../../state/AppDataContext': { useAppData: () => ({ studentCourses: [{ id: 'course-a', code: 'A', name: 'Course A' }], studentMaterials: [], summaryRecords: [], currentChatRecords: [], quizAttempts: [] }) },
    '../../services/apiClient': { apiRequest: async () => structuredClone(state) },
  });
  let renderer;
  await act(async () => { renderer = create(React.createElement(History, { review })); });
  t.after(() => act(async () => renderer.unmount()));
  return { renderer, state };
}

test('review rows show a zero-score latest full retake separately from the unchanged original score', async t => {
  const app = await historySetup(t, { reviews: [attempt('new', '2026-10-30 03:00:00', 'all', 0, 4)] });
  const row = app.renderer.root.findByProps({ className: 'history-latest-practice' });
  assert.match(text(row), /Latest full retake/);
  assert.match(text(row), /0\/4 correct \(0%\)/);
  assert.equal(row.findByType('time').props.dateTime, '2026-10-30 03:00:00');
  assert.match(text(app.renderer.root.findByProps({ className: 'history-record-open' })), /40%/);
  assert.equal(app.state.records[0].payload.score, 40);
});

test('latest wrong-question progress is labelled in Chinese and refresh displays the newer saved attempt', async t => {
  const app = await historySetup(t, { language: 'zh', reviews: [attempt('old', '2026-10-29 03:00:00', 'wrong', 1, 2)] });
  let row = app.renderer.root.findByProps({ className: 'history-latest-practice' });
  assert.match(text(row), /最近错题练习1\/2 题正确/);
  assert.equal(text(row.findByType('time')), formatStudyDate('2026-10-29 03:00:00', 'zh'));
  app.state.reviews.push(attempt('new', '2026-10-30 03:00:00', 'wrong', 2, 2));
  await act(async () => app.renderer.root.findAllByType('button').find(node => text(node) === '刷新记录').props.onClick());
  row = app.renderer.root.findByProps({ className: 'history-latest-practice' });
  assert.match(text(row), /2\/2 题正确/);
  assert.doesNotMatch(text(row), /1\/2/);
});

test('no review means no invented latest result, and Study History keeps its original presentation', async t => {
  const review = await historySetup(t);
  assert.equal(review.renderer.root.findAllByProps({ className: 'history-latest-practice' }).length, 0);
  const history = await historySetup(t, { review: false, reviews: [attempt('new', '2026-10-30 03:00:00')] });
  assert.equal(history.renderer.root.findAllByProps({ className: 'history-latest-practice' }).length, 0);
  assert.match(text(history.renderer.root), /40%/);
});

async function loginSetup(t, language = 'en') {
  const requests = [];
  const { default: Login } = await loadSource("export {default} from './src/pages/LoginPage.jsx'", {
    '../hooks/useBodyClass': () => {},
    '../components/GoogleLogin': () => null,
    '../state/LanguageContext': { useLanguage: () => ({ language }) },
    '../state/AppDataContext': { useAppData: () => ({ currentUser: null, isAuthLoading: false,
      login: async (...args) => { requests.push(args); return { ok: false, message: 'Invalid email or password.' }; },
    }) },
  });
  let renderer;
  await act(async () => { renderer = create(React.createElement(MemoryRouter, null, React.createElement(Login))); });
  t.after(() => act(async () => renderer.unmount()));
  return { renderer, requests };
}

test('password visibility exposes its current action and pressed state in English and Chinese', async t => {
  for (const language of ['en', 'zh']) {
    const app = await loginSetup(t, language), root = app.renderer.root;
    const toggle = () => root.findByProps({ className: 'login-password-toggle' });
    assert.equal(toggle().props['aria-label'], language === 'zh' ? '显示密码' : 'Show password');
    assert.equal(toggle().props['aria-pressed'], false);
    assert.equal(toggle().props['aria-controls'], 'password');
    assert.equal(root.findByProps({ id: 'password' }).props.type, 'password');
    await act(async () => toggle().props.onClick());
    assert.equal(toggle().props['aria-label'], language === 'zh' ? '隐藏密码' : 'Hide password');
    assert.equal(toggle().props['aria-pressed'], true);
    assert.equal(root.findByProps({ id: 'password' }).props.type, 'text');
    await act(async () => toggle().props.onClick());
    assert.equal(root.findByProps({ id: 'password' }).props.type, 'password');
    assert.equal(app.requests.length, 0);
  }
});

test('failed login is announced and associated with both fields without changing authentication submission', async t => {
  const app = await loginSetup(t), root = app.renderer.root;
  for (const [name, value] of [['email', 'learner@example.com'], ['password', 'A-test-password']]) {
    await act(async () => root.findByProps({ name }).props.onChange({ target: { name, value, type: name === 'email' ? 'email' : 'password' } }));
  }
  await act(async () => root.findByType('form').props.onSubmit({ preventDefault() {} }));
  const alert = root.findByProps({ role: 'alert' });
  assert.equal(alert.props.id, 'login-error');
  assert.equal(text(alert), 'Invalid email or password.');
  assert.equal(root.findByProps({ id: 'email' }).props['aria-describedby'], 'login-error');
  assert.equal(root.findByProps({ id: 'password' }).props['aria-describedby'], 'login-error');
  assert.deepEqual(app.requests, [['learner@example.com', 'A-test-password', false]]);
});
