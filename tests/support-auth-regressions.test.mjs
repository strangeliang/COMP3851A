import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { loadSource, deferred, memoryWindow } from './helpers.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const ticket = { id: 'ASK-first', title: 'First request', name: 'Student', description: 'An upload problem', category: 'upload', status: 'Open', version: 1, hasMessages: true, humanSupport: 'Waiting', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', replies: [] };
const ticketOptions = { ticketCategories: ['account', 'upload', 'quiz', 'review', 'other'], ticketStatuses: ['Open', 'In progress', 'Resolved'] };
const stringify = renderer => JSON.stringify(renderer.toJSON());
const rows = renderer => renderer.root.findAll(node => node.type === 'button' && String(node.props.className).startsWith('support-ticket-row'));
const link = ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children);

test('finishing a ticket reply refreshes the current search rather than the search at submission', async () => {
  let renderer;
  const pending = deferred(), queries = [];
  const matching = { ...ticket, id: 'ASK-match', title: 'Current search result' };
  const { default: Inbox } = await loadSource("export {default} from './src/components/SupportTickets.jsx'", {
    '../state/AppDataContext': { useAppData: () => ({ currentUser: { id: 1, role: 'Admin' } }) },
    '../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) },
    '../services/ticketApiService': { ...ticketOptions,
      listServerTickets: async (_signal, _cursor, filters) => { queries.push(filters.q); return { tickets: filters.q ? [matching] : [ticket], hasMore: false }; },
      getServerTicket: async () => ({ ticket }), replyServerTicket: () => pending.promise,
    },
  });
  try {
    await act(async () => { renderer = create(React.createElement(Inbox)); });
    await act(async () => rows(renderer)[0].props.onClick());
    await act(async () => renderer.root.findByType('textarea').props.onChange({ target: { value: 'Please try the upload again.' } }));
    await act(async () => renderer.root.findByProps({ className: 'support-chat-composer' }).props.onSubmit({ preventDefault() {} }));
    await act(async () => renderer.root.findByProps({ type: 'search' }).props.onChange({ target: { value: 'Current' } }));
    assert.equal(queries.at(-1), 'Current');
    await act(async () => pending.resolve({ ticket: { ...ticket, version: 2 } }));
    assert.equal(queries.at(-1), 'Current');
    assert.equal(rows(renderer).length, 1);
    assert.equal(rows(renderer)[0].findByType('strong').children.join(''), 'Current search result');
    assert.equal(renderer.root.findByType('textarea').props.value, '');
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('reselecting a ticket preserves the unsent reply and failed-send retry ID', async () => {
  let renderer, fail = true;
  const sends = [];
  const { default: Inbox } = await loadSource("export {default} from './src/components/SupportTickets.jsx'", {
    '../state/AppDataContext': { useAppData: () => ({ currentUser: { id: 1, role: 'Student' } }) },
    '../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) },
    '../services/ticketApiService': { ...ticketOptions, listServerTickets: async () => ({ tickets: [ticket], hasMore: false }),
      getServerTicket: async () => ({ ticket }), replyServerTicket: async (id, text, clientId) => { sends.push({ id, text, clientId }); if (fail) throw Error('Offline'); return { ticket }; },
    },
  });
  try {
    await act(async () => { renderer = create(React.createElement(Inbox)); });
    await act(async () => rows(renderer)[0].props.onClick());
    await act(async () => renderer.root.findByType('textarea').props.onChange({ target: { value: 'My unsent reply' } }));
    await act(async () => rows(renderer)[0].props.onClick());
    assert.equal(renderer.root.findByType('textarea').props.value, 'My unsent reply');
    const send = () => renderer.root.findByProps({ className: 'support-chat-composer' }).props.onSubmit({ preventDefault() {} });
    await act(async () => send());
    await act(async () => rows(renderer)[0].props.onClick());
    assert.equal(renderer.root.findByType('textarea').props.value, 'My unsent reply');
    fail = false;
    await act(async () => send());
    assert.equal(sends.length, 2); assert.deepEqual(sends[0], sends[1]);
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('notification history failure keeps successfully loaded support updates visible and retryable', async () => {
  let renderer, fail = true, reads = 0;
  const { default: Profile } = await loadSource("export {default} from './src/components/StudentProfilePanel.jsx'", {
    '../state/AppDataContext': { useAppData: () => ({ currentUser: { id: 1, role: 'Student' } }) },
    '../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) },
    './AvatarPicker': () => null,
    'react-router-dom': { Link: link, useNavigate: () => () => {} },
    '../services/ticketApiService': { listServerTickets: async () => ({ tickets: [ticket] }) },
    '../services/apiClient': { apiRequest: async () => { reads++; if (fail) throw Error('History unavailable'); return { records: [] }; } },
  });
  try {
    await act(async () => { renderer = create(React.createElement(Profile)); });
    await act(async () => renderer.root.findByProps({ 'aria-label': 'Notifications' }).props.onClick({ currentTarget: { focus() {} } }));
    assert.match(stringify(renderer), /History unavailable/);
    assert.equal(renderer.root.findByProps({ className: 'profile-update-item' }).findByType('strong').children.join(''), 'Support conversation');
    assert.doesNotMatch(stringify(renderer), /No updates yet/);
    fail = false;
    await act(async () => renderer.root.findAllByType('button').find(button => button.children.includes('Retry')).props.onClick());
    assert.equal(reads, 2); assert.doesNotMatch(stringify(renderer), /History unavailable/);
    assert.equal(renderer.root.findAllByProps({ className: 'profile-update-item' }).length, 1);
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('profile material statistics count all server metadata and isolate failures and switched accounts', async () => {
  let renderer, user = { id: 1, role: 'Student' }, pending = deferred();
  const calls = [];
  const { default: Profile } = await loadSource("export {default} from './src/components/StudentProfilePanel.jsx'", {
    '../state/AppDataContext': { useAppData: () => ({ currentUser: user, studentMaterials: [{ id: 'only-cached-file' }] }) },
    '../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) },
    './AvatarPicker': () => null,
    'react-router-dom': { Link: link, useNavigate: () => () => {} },
    '../services/apiClient': { apiRequest: (path, options) => { calls.push({ path, ...options }); return pending.promise; } },
  });
  const open = () => renderer.root.findAllByType('button').find(button => button.props['aria-label'] === 'Study progress').props.onClick({ currentTarget: { focus() {} } });
  const materialCount = () => renderer.root.findAllByType('dd')[1].children.join('');
  try {
    await act(async () => { renderer = create(React.createElement(Profile)); });
    await act(async () => open());
    assert.equal(materialCount(), '—', 'Do not present the single cached file as the account total');
    await act(async () => pending.resolve({ sourceMaterials: [{ id: 1 }, { id: 2 }, { id: 3 }] }));
    assert.equal(materialCount(), '3');
    assert.equal(calls[0].path, '/history');
    await act(async () => open());
    pending = deferred(); await act(async () => open());
    await act(async () => pending.reject(Error('Statistics unavailable')));
    assert.equal(materialCount(), '—'); assert.match(stringify(renderer), /Statistics unavailable/);
    pending = deferred();
    await act(async () => renderer.root.findAllByType('button').find(button => button.children.includes('Retry')).props.onClick());
    const oldRequest = pending;
    user = { id: 2, role: 'Student' };
    await act(async () => renderer.update(React.createElement(Profile)));
    assert.equal(calls[2].signal.aborted, true);
    pending = deferred(); await act(async () => open());
    await act(async () => oldRequest.resolve({ sourceMaterials: Array.from({ length: 50 }, (_, id) => ({ id })) }));
    assert.equal(materialCount(), '—');
    await act(async () => pending.resolve({ sourceMaterials: [] }));
    assert.equal(materialCount(), '0', 'A new account has no materials, regardless of cached browser state');
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('unmounted Google sign-in aborts its request and cannot reset a later workspace session', async () => {
  let renderer, callback, resets = 0, authSignal;
  const pending = deferred(), navigations = [];
  const browser = { google: { accounts: { id: { initialize(options) { callback = options.callback; }, renderButton() {} } } }, location: { assign(path) { navigations.push(path); } } };
  const { default: GoogleLogin } = await loadSource("export {default} from './src/components/GoogleLogin.jsx'", {
    '../services/apiClient': { apiRequest: async (path, options) => {
      if (path.endsWith('/config')) return { enabled: true, clientId: 'client', nonce: 'nonce' };
      authSignal = options.signal; return pending.promise;
    } },
    '../services/workspaceSession': { resetWorkspaceSession() { resets++; } },
  }, { window: browser });
  try {
    await act(async () => { renderer = create(React.createElement(GoogleLogin)); });
    await act(async () => { callback({ credential: 'mock-credential' }); });
    await act(async () => renderer.unmount()); renderer = null;
    assert.equal(authSignal.aborted, true);
    await act(async () => pending.resolve({ ok: true }));
    assert.equal(resets, 0); assert.deepEqual(navigations, []);
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('current Google sign-in resets the workspace and retains the allowed ticket return path', async () => {
  let renderer, callback, resets = 0;
  const navigations = [];
  const browser = { google: { accounts: { id: { initialize(options) { callback = options.callback; }, renderButton() {} } } }, location: { assign(path) { navigations.push(path); } } };
  const { default: GoogleLogin } = await loadSource("export {default} from './src/components/GoogleLogin.jsx'", {
    '../services/apiClient': { apiRequest: async path => path.endsWith('/config') ? { enabled: true, clientId: 'client', nonce: 'nonce' } : { ok: true } },
    '../services/workspaceSession': { resetWorkspaceSession() { resets++; } },
  }, { window: browser });
  try {
    await act(async () => { renderer = create(React.createElement(GoogleLogin, { returnPath: '/student/support/ASK-example' })); });
    await act(async () => callback({ credential: 'mock-credential' }));
    assert.equal(resets, 1); assert.deepEqual(navigations, ['/student/support/ASK-example']);
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

for (const purpose of ['reset', 'verify']) {
  test(`${purpose} email page accepts a replacement hash link without accepting a stale result`, async () => {
    let renderer;
    const pending = deferred(), calls = [];
    const browser = memoryWindow();
    browser.location = { hash: '#token=first-link', pathname: purpose === 'reset' ? '/reset-password' : '/verify-email', search: '?source=email' };
    browser.history = { state: { idx: 2 }, replaceState(state, _unused, path) { assert.deepEqual(state, { idx: 2 }); assert.equal(path, `${browser.location.pathname}?source=email`); browser.location.hash = ''; } };
    const { default: EmailPage } = await loadSource("export {default} from './src/pages/EmailAccessPage.jsx'", {
      '../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) },
      '../hooks/useBodyClass': () => {},
      'react-router-dom': { Link: link },
      '../services/apiClient': { apiRequest: async (path, options) => { calls.push({ path, ...options }); return calls.length === 1 ? pending.promise : { message: 'New link completed.' }; } },
    }, { window: browser, FormData: class { constructor(values) { this.values = values; } get(name) { return this.values[name]; } } });
    const submit = () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {}, currentTarget: { password: 'Long-password-123', confirm: 'Long-password-123' } });
    try {
      await act(async () => { renderer = create(React.createElement(React.StrictMode, null, React.createElement(EmailPage, { purpose }))); });
      assert.equal(browser.location.hash, ''); assert.equal(calls.length, 0);
      await act(async () => { submit(); });
      assert.equal(calls[0].body.token, 'first-link');
      browser.location.hash = '#token=second-link';
      await act(async () => browser.dispatchEvent(new Event('hashchange')));
      assert.equal(calls[0].signal.aborted, true);
      assert.equal(browser.location.hash, ''); assert.equal(calls.length, 1, 'Reading a replacement link must not consume it');
      assert.equal(renderer.root.findByProps({ className: 'recovery-submit' }).props.disabled, false);
      await act(async () => pending.resolve({ message: 'Old link completed.' }));
      assert.doesNotMatch(stringify(renderer), /Old link completed/);
      await act(async () => submit());
      assert.equal(calls[1].body.token, 'second-link'); assert.equal(calls[1].body.purpose, purpose);
      assert.match(stringify(renderer), /New link completed/);
      browser.location.hash = '#token=third-link';
      await act(async () => browser.dispatchEvent(new Event('hashchange')));
      assert.equal(renderer.root.findAllByType('form').length, 1, 'A new link replaces the completed form state too');
      assert.doesNotMatch(stringify(renderer), /New link completed/);
    } finally { if (renderer) await act(async () => renderer.unmount()); }
  });
}
