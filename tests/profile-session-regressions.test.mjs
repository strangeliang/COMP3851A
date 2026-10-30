import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { loadSource, memoryWindow, deferred } from './helpers.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.children || []).map(text).join('');
const user = id => ({ id, name: `Learner ${id}`, email: `learner-${id}@example.invalid`, role: 'Student', bio: '', learningGoal: '' });

test('a failed sessionStorage write cannot resurrect the previous login or its workspace values', async () => {
  const browser = memoryWindow();
  const storage = memoryWindow().localStorage;
  browser.sessionStorage = storage;
  const modules = await loadSource('src/services/workspaceSession.js', {}, { window: browser });
  const originalSession = modules.workspaceSessionId();
  modules.writeWorkspaceState('answer', 'Original private answer', originalSession);
  const staleRaw = storage.getItem('study-workspace-session-v1');
  let blocked = true;
  browser.sessionStorage = { getItem: storage.getItem, setItem: (...args) => { if (blocked) throw Error('Quota exceeded'); storage.setItem(...args); } };
  modules.resetWorkspaceSession();
  const nextSession = modules.workspaceSessionId();
  assert.notEqual(nextSession, originalSession);
  assert.equal(storage.getItem('study-workspace-session-v1'), staleRaw);
  assert.equal(modules.readWorkspaceState('answer', null), null);
  modules.writeWorkspaceState('answer', 'New session answer', nextSession);
  modules.writeWorkspaceState('answer', 'Late old response', originalSession);
  assert.equal(modules.readWorkspaceState('answer', null), 'New session answer');
  blocked = false;
  assert.equal(modules.workspaceSessionId(), nextSession);
  assert.equal(JSON.parse(storage.getItem('study-workspace-session-v1')).id, nextSession);
});

test('a read failure retains the last successfully read workspace snapshot', async () => {
  const browser = memoryWindow();
  browser.sessionStorage = memoryWindow({ 'study-workspace-session-v1': JSON.stringify({ id: 'saved-session', values: { answer: 'Saved answer' } }) }).localStorage;
  const modules = await loadSource('src/services/workspaceSession.js', {}, { window: browser });
  assert.equal(modules.readWorkspaceState('answer', null), 'Saved answer');
  browser.sessionStorage = { getItem() { throw Error('Storage blocked'); }, setItem() { throw Error('Storage blocked'); } };
  assert.equal(modules.readWorkspaceState('answer', null), 'Saved answer');
  assert.equal(modules.workspaceSessionId(), 'saved-session');
});

async function setup(t, { bitmap, saveProfile = async () => {}, canvasFails = false } = {}) {
  const browser = memoryWindow(); browser.sessionStorage = memoryWindow().localStorage;
  const state = { currentUser: user(1), saveProfile };
  let canvases = 0;
  const modules = await loadSource("export {default as Profile} from './src/pages/student/ProfilePage.jsx'; export {default as Avatar} from './src/components/AvatarPicker.jsx'; export {resetWorkspaceSession} from './src/services/workspaceSession.js';", {
    '../../state/AppDataContext': { useAppData: () => state }, '../state/AppDataContext': { useAppData: () => state },
    '../../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) }, '../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) },
    '../../layouts/StudentLayout': ({ children }) => React.createElement('main', null, children),
  }, { window: browser, createImageBitmap: () => bitmap?.promise || Promise.resolve({ width: 256, height: 256, close() {} }),
    document: { createElement: () => { canvases++; return { getContext: () => ({ drawImage() { if (canvasFails) throw Error('Canvas unavailable'); } }), toDataURL: () => 'data:image/png;base64,NEW_AVATAR' }; } },
  });
  const renderers = [];
  t.after(async () => { for (const renderer of renderers) await act(async () => renderer.unmount()); });
  return { modules, state, canvases: () => canvases, render: async Component => {
    let renderer; await act(async () => { renderer = create(React.createElement(Component)); }); renderers.push(renderer); return renderer;
  } };
}

test('profile form resets on account or login-session changes instead of saving another learner drafts', async t => {
  const app = await setup(t), renderer = await app.render(app.modules.Profile);
  const nameField = () => renderer.root.findAllByType('input').find(node => node.props.maxLength === 80);
  await act(async () => nameField().props.onChange({ target: { value: 'Unsubmitted learner one edit' } }));
  app.state.currentUser = user(2);
  await act(async () => renderer.update(React.createElement(app.modules.Profile)));
  assert.equal(nameField().props.value, 'Learner 2');
  await act(async () => nameField().props.onChange({ target: { value: 'Old session draft' } }));
  app.modules.resetWorkspaceSession();
  await act(async () => renderer.update(React.createElement(app.modules.Profile)));
  assert.equal(nameField().props.value, 'Learner 2');
});

test('pending avatar decodes from another account are discarded and their bitmap is released', async t => {
  for (const kind of ['Profile', 'Avatar']) {
    const bitmap = deferred(); let closed = 0;
    const app = await setup(t, { bitmap }), Component = app.modules[kind], renderer = await app.render(Component);
    let reading;
    await act(async () => { reading = renderer.root.findByProps({ type: 'file' }).props.onChange({ target: { files: [{ name: 'old-account.png', type: 'image/png', size: 100 }], value: 'file' } }); });
    app.state.currentUser = user(2);
    await act(async () => renderer.update(React.createElement(Component)));
    await act(async () => { bitmap.resolve({ width: 256, height: 256, close() { closed++; } }); await reading; });
    assert.equal(closed, 1);
    assert.equal(app.canvases(), 0);
    assert.doesNotMatch(text(renderer.root), /old-account\.png|Save photo|NEW_AVATAR/);
  }
});

test('avatar bitmap is closed even when drawing fails, and the form recovers from processing state', async t => {
  for (const kind of ['Profile', 'Avatar']) {
    const bitmap = deferred(); let closed = 0;
    const app = await setup(t, { bitmap, canvasFails: true }), renderer = await app.render(app.modules[kind]);
    let reading;
    await act(async () => { reading = renderer.root.findByProps({ type: 'file' }).props.onChange({ target: { files: [{ name: 'valid.png', type: 'image/png', size: 100 }], value: 'file' } }); });
    await act(async () => { bitmap.resolve({ width: 256, height: 256, close() { closed++; } }); await reading; });
    assert.equal(closed, 1);
    assert.match(text(renderer.root), /Canvas unavailable/);
    assert.doesNotMatch(text(renderer.root), /Preparing image|Please wait/);
  }
});

test('profile save cannot be submitted twice before React renders the disabled state', async t => {
  const response = deferred(); let saves = 0;
  const app = await setup(t, { saveProfile: () => { saves++; return response.promise; } }), renderer = await app.render(app.modules.Profile);
  let saving;
  await act(async () => { const submit = renderer.root.findByType('form').props.onSubmit; saving = submit({ preventDefault() {} }); submit({ preventDefault() {} }); });
  assert.equal(saves, 1);
  await act(async () => { response.resolve(); await saving; });
  assert.match(text(renderer.root), /Profile saved/);
});
