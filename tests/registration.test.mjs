import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { loadSource, deferred } from './helpers.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test('registration UI requires code confirmation, locks duplicate sends, and supports retry/resend', async t => {
  const calls = [];
  const sending = deferred();
  let tick;
  let failVerify = true;
  const { Page } = await loadSource("export { default as Page } from './src/pages/RegisterPage.jsx';", {
    '../hooks/useBodyClass': () => {},
    '../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) },
    '../services/apiClient': { apiRequest: async(url, options) => {
      calls.push({ url, ...options });
      if (url === '/auth/register') return sending.promise;
      if (url === '/auth/register/resend') return { challengeId: 'new-challenge', resendAfter: 60, expiresIn: 600 };
      if (failVerify) throw new Error('Invalid or expired code');
      return { ok: true };
    } },
  }, {
    FormData: class { constructor(form) { this.form = form; } get(key) { return this.form.values[key]; } },
    setInterval: callback => { tick = callback; return 1; },
    clearInterval: () => {},
  });
  let tree;
  await act(async() => { tree = create(React.createElement(MemoryRouter, null, React.createElement(Page))); });
  t.after(async() => { await act(async() => tree.unmount()); });
  const text = () => JSON.stringify(tree.toJSON());
  let reset = false;
  const event = { preventDefault() {}, currentTarget: { values: { name: 'Test', email: 'test@example.test', password: 'long-test-password', confirm: 'long-test-password' }, reset() { reset = true; } } };
  let initial;
  await act(async() => {
    const submit = tree.root.findByType('form').props.onSubmit;
    initial = submit(event);
    await submit(event);
  });
  assert.equal(calls.length, 1, 'double clicks cannot send two messages');
  await act(async() => { sending.resolve({ challengeId: 'initial-challenge', resendAfter: 60, expiresIn: 600 }); await initial; });
  assert.ok(reset, 'password fields are cleared after code request');
  assert.match(text(), /Verification code/);
  assert.doesNotMatch(text(), /Account created\./);
  assert.equal(tree.root.findByProps({ id: 'registration-code' }).props.autoComplete, 'one-time-code');
  assert.equal(tree.root.findAllByType('button').find(b => String(b.props.children).startsWith('Resend')).props.disabled, true);
  await act(async() => { tree.root.findByProps({ id: 'registration-code' }).props.onChange({ target: { value: '01a23456' } }); });
  assert.equal(tree.root.findByProps({ id: 'registration-code' }).props.value, '012345');
  await act(async() => { await tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  assert.match(text(), /Invalid or expired code/);
  assert.deepEqual(calls.at(-1).body, { challengeId: 'initial-challenge', code: '012345' });
  await act(async() => { for (let i = 0; i < 60; i++) tick(); });
  await act(async() => { await tree.root.findAllByType('button').find(b => b.props.children === 'Resend code').props.onClick(); });
  assert.equal(tree.root.findByProps({ id: 'registration-code' }).props.value, '');
  failVerify = false;
  await act(async() => { tree.root.findByProps({ id: 'registration-code' }).props.onChange({ target: { value: '987654' } }); });
  await act(async() => { await tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  assert.deepEqual(calls.at(-1).body, { challengeId: 'new-challenge', code: '987654' });
  assert.match(text(), /Email verified\. Account created\./);
  assert.equal(tree.root.findAllByType('form').length, 0);
});
