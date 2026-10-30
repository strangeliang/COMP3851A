import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { loadSource, memoryWindow, deferred } from './helpers.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const text = renderer => JSON.stringify(renderer.toJSON());
const initialTicket = { id: 'SESSION-first', version: 1, status: 'Open', createdAt: '2026-10-30T10:00:00Z', replies: [] };

async function helpSetup(t, send = async () => ({ ticket: initialTicket })) {
  const browser = memoryWindow(); browser.sessionStorage = memoryWindow().localStorage;
  let user = { id: 7, role: 'Student' }, ticket = initialTicket, getTicket;
  const modules = await loadSource("export {default as Help} from './src/components/HelpAssistant.jsx'; export * from './src/services/workspaceSession.js';", {
    '../state/AppDataContext': { useAppData: () => ({ currentUser: user }) },
    '../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) },
    './SupportTickets': { default: () => null },
    '../services/ticketApiService': { getLoginConversation: async () => getTicket ? getTicket() : { ticket }, sendLoginMessage: send },
  }, { window: browser });
  let renderer;
  const mount = async () => act(async () => { renderer = create(React.createElement(modules.Help)); });
  await mount();
  t.after(async () => { if (renderer) await act(async () => renderer.unmount()); });
  return { modules, browser, get renderer() { return renderer; },
    field: () => renderer.root.findByProps({ 'aria-label': 'Describe your problem without credentials' }),
    open: () => act(async () => renderer.root.findByProps({ className: 'help-assistant-launcher' }).props.onClick()),
    type: value => act(async () => renderer.root.findByProps({ 'aria-label': 'Describe your problem without credentials' }).props.onChange({ target: { value } })),
    submit: () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }),
    remount: async () => { await act(async () => renderer.unmount()); await mount(); },
    updateUser: async value => { user = value; await act(async () => renderer.update(React.createElement(modules.Help))); },
    setTicket: value => { ticket = value; },
    delayTicket: value => { getTicket = value; },
  };
}

test('Ask Me keeps same-session drafts across page remount and first ticket loading, without persisting draft text', async t => {
  const app = await helpSetup(t);
  await app.open(); await app.type('An unfinished question about my upload');
  const fetch = deferred(); app.delayTicket(() => fetch.promise);
  await app.remount(); await app.open();
  assert.equal(app.field().props.value, 'An unfinished question about my upload');
  await act(async () => fetch.resolve({ ticket: initialTicket }));
  assert.equal(app.field().props.value, 'An unfinished question about my upload', 'Initial server ticket loading must not erase restored text');
  await app.type('password=private-value-123');
  assert.doesNotMatch(app.browser.sessionStorage.getItem('study-workspace-session-v1') || '', /private-value|unfinished question/);
  assert.equal(app.browser.localStorage.getItem('help-draft:7'), null);
  app.delayTicket(null); app.setTicket({ ...initialTicket, id: 'SESSION-replaced' });
  await app.remount(); await app.open();
  assert.equal(app.field().props.value, '', 'A different server conversation must not inherit the previous session draft');
});

test('a pending Ask Me send stays locked after navigation; failure restores the draft and retry keeps its ID', async t => {
  const calls = []; let pending = deferred();
  const app = await helpSetup(t, (...args) => { calls.push(args); return pending.promise; });
  await app.open(); await app.type('Please explain the file limit');
  await act(async () => { app.submit(); });
  await app.remount(); await app.open();
  assert.equal(app.field().props.disabled, true);
  await act(async () => { app.submit(); });
  assert.equal(calls.length, 1);
  await act(async () => pending.reject(Error('Network unavailable')));
  assert.equal(app.field().props.value, 'Please explain the file limit');
  assert.match(text(app.renderer), /Network unavailable/);
  assert.equal(app.field().props.disabled, false);
  await app.remount(); await app.open();
  pending = deferred(); await act(async () => { app.submit(); });
  assert.equal(calls[0][3], calls[1][3], 'A remount must retain the idempotency key for the same failed send');
  await act(async () => pending.resolve({ ticket: initialTicket }));
  assert.equal(app.field().props.value, '');
  await app.remount(); await app.open(); assert.equal(app.field().props.value, '');
});

test('logout clears Ask Me drafts and a late failed send cannot overwrite another login', async t => {
  const pending = deferred();
  const app = await helpSetup(t, () => pending.promise);
  await app.open(); await app.type('Old login question');
  await act(async () => { app.submit(); });
  const oldSession = app.modules.workspaceSessionId();
  await act(async () => app.modules.resetWorkspaceSession());
  await app.updateUser(null); await app.updateUser({ id: 7, role: 'Student' }); await app.open();
  assert.notEqual(app.modules.workspaceSessionId(), oldSession);
  assert.equal(app.field().props.value, '');
  await app.type('New login draft');
  await act(async () => pending.reject(Error('Old request failed')));
  assert.equal(app.field().props.value, 'New login draft');
  assert.doesNotMatch(text(app.renderer), /Old request failed/);
  await app.updateUser({ id: 8, role: 'Student' }); await app.open();
  assert.equal(app.field().props.value, '');
});

test('a successful Ask Me send completing after navigation does not reuse its ID for a new message', async t => {
  const calls = [], pending = deferred();
  const app = await helpSetup(t, (...args) => { calls.push(args); return calls.length === 1 ? pending.promise : { ticket: initialTicket }; });
  await app.open(); await app.type('Please explain the file limit');
  await act(async () => { app.submit(); });
  await app.remount(); await app.open();
  await act(async () => pending.resolve({ ticket: initialTicket }));
  assert.equal(app.field().props.value, '');
  await app.type('Please explain the file limit');
  await act(async () => { app.submit(); });
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0][3], calls[1][3], 'A completed send is not a failed request to retry');
});

async function routeApp(role, language = 'en', entry = '/missing-page') {
  const data = { currentUser: role ? { id: 1, role } : null, isAuthLoading: false };
  const mocks = {
    './state/AppDataContext': { useAppData: () => data }, '../state/AppDataContext': { useAppData: () => data },
    './state/LanguageContext': { useLanguage: () => ({ language }) }, '../state/LanguageContext': { useLanguage: () => ({ language }) },
  };
  for (const name of ['LoginPage', 'RegisterPage', 'ForgotPasswordPage', 'EmailAccessPage', 'student/HistoryPage', 'student/ProfilePage', 'student/SettingsPage', 'student/DashboardPage', 'student/UploadPage', 'student/SummaryPage', 'student/QAPage', 'admin/AdminSupportPage', 'student/StudyWorkspacePage', 'student/SupportPage']) {
    mocks[`./pages/${name}`] = () => React.createElement('p', null, `Opened ${name}`);
  }
  const { default: App } = await loadSource("export {default} from './src/App.jsx'", mocks);
  let renderer;
  await act(async () => { renderer = create(React.createElement(MemoryRouter, { initialEntries: [entry] }, React.createElement(App))); });
  return renderer;
}

test('unknown routes display a neutral 404 with the correct guest, student or administrator home', async () => {
  for (const [role, href] of [[null, '/'], ['Student', '/student/dashboard'], ['Admin', '/admin/support']]) {
    const renderer = await routeApp(role);
    try {
      assert.match(text(renderer), /Page not found/);
      assert.doesNotMatch(text(renderer), /Opened/);
      assert.equal(renderer.root.findByType('a').props.href, href);
    } finally { await act(async () => renderer.unmount()); }
  }
  const chinese = await routeApp('Student', 'zh');
  try { assert.match(text(chinese), /找不到这个页面/); assert.match(text(chinese), /返回主页/); }
  finally { await act(async () => chinese.unmount()); }
  const protectedRoute = await routeApp(null, 'en', '/admin/missing-page');
  try { assert.match(text(protectedRoute), /Opened LoginPage/); assert.doesNotMatch(text(protectedRoute), /AdminSupportPage/); }
  finally { await act(async () => protectedRoute.unmount()); }
});

test('render errors show a safe localized recovery page and retry without deleting application storage', async t => {
  t.mock.method(console, 'error', () => {});
  const browser = memoryWindow({ 'study-language': 'zh', 'keep-records': 'saved-data' });
  const { default: Boundary } = await loadSource("export {default} from './src/components/ErrorBoundary.jsx'", {}, { localStorage: browser.localStorage });
  let fails = true, renderer;
  function Content() { if (fails) throw new Error('Internal stack and secret-token must stay hidden'); return React.createElement('p', null, 'Recovered page'); }
  try {
    await act(async () => { renderer = create(React.createElement(Boundary, { homeHref: '/student/dashboard' }, React.createElement(Content))); });
    assert.match(text(renderer), /页面暂时无法显示/); assert.doesNotMatch(text(renderer), /secret-token|Internal stack/);
    assert.equal(renderer.root.findByType('a').props.href, '/student/dashboard');
    fails = false; await act(async () => renderer.root.findByType('button').props.onClick());
    assert.match(text(renderer), /Recovered page/);
    assert.equal(browser.localStorage.getItem('keep-records'), 'saved-data');
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('error recovery supports in-app home navigation and resets on a changed route', async t => {
  t.mock.method(console, 'error', () => {});
  const { default: Boundary } = await loadSource("export {default} from './src/components/ErrorBoundary.jsx'");
  let renderer, fails = true, homeCalls = 0;
  function Content() { if (fails) throw Error('Private failure'); return React.createElement('p', null, 'Home content'); }
  const render = key => React.createElement(Boundary, { language: 'en', homeHref: '/', resetKey: key, onHome() { homeCalls++; fails = false; } }, React.createElement(Content));
  try {
    await act(async () => { renderer = create(render('/broken')); });
    assert.match(text(renderer), /This page could not be displayed/);
    let prevented = false; await act(async () => renderer.root.findByType('a').props.onClick({ preventDefault() { prevented = true; } }));
    assert.equal(prevented, true); assert.equal(homeCalls, 1); assert.match(text(renderer), /Home content/);
    fails = true; await act(async () => renderer.update(render('/broken-again')));
    assert.match(text(renderer), /This page could not be displayed/);
    fails = false; await act(async () => renderer.update(render('/new-route')));
    assert.match(text(renderer), /Home content/);
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});
