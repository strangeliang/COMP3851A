import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { loadSource, deferred, memoryWindow } from './helpers.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.children || []).map(text).join('');
const summary = { paragraph: 'A supported explanation [S1].', concepts: ['First concept', 'Second concept'] };
const sources = [{ id: 4, name: 'Actual notes.pdf' }, { id: 5, name: 'Course outline.md' }];

test('copy summary includes the visible explanation, concepts and actual source names as plain text', async t => {
  const copied = [];
  const { default: Button } = await loadSource("export { default } from './src/components/CopySummaryButton.jsx'", {
    '../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) },
  }, { navigator: { clipboard: { writeText: async value => copied.push(value) } } });
  let renderer;
  await act(async () => { renderer = create(React.createElement(Button, { summary, materials: sources })); });
  t.after(() => act(async () => renderer.unmount()));
  await act(async () => renderer.root.findByType('button').props.onClick());
  assert.deepEqual(copied, ['A supported explanation [S1].\n\nKey Concepts\n• First concept\n• Second concept\n\nSources\n[S1] Actual notes.pdf\n[S2] Course outline.md']);
  assert.match(text(renderer.root), /Summary and sources copied/);
  assert.equal(summary.paragraph, 'A supported explanation [S1].');
});

test('clipboard denial keeps the summary usable, blocks duplicate clicks and can retry successfully', async t => {
  let pending = deferred(), calls = 0;
  const { default: Button } = await loadSource("export { default } from './src/components/CopySummaryButton.jsx'", {
    '../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) },
  }, { navigator: { clipboard: { writeText: () => { calls++; return pending.promise; } } } });
  let renderer;
  await act(async () => { renderer = create(React.createElement(Button, { summary, materials: sources })); });
  t.after(() => act(async () => renderer.unmount()));
  let copying;
  await act(async () => { copying = renderer.root.findByType('button').props.onClick(); renderer.root.findByType('button').props.onClick(); });
  assert.equal(calls, 1);
  assert.equal(renderer.root.findByType('button').props.disabled, true);
  await act(async () => { pending.reject(Error('Permission denied')); await copying; });
  assert.match(text(renderer.root), /Select the summary text and copy it manually/);
  assert.equal(renderer.root.findByType('button').props.disabled, false);
  pending = deferred();
  await act(async () => { copying = renderer.root.findByType('button').props.onClick(); pending.resolve(); await copying; });
  assert.equal(calls, 2);
  assert.match(text(renderer.root), /Summary and sources copied/);
});

test('copy feedback cannot leak from an old summary or account, and Chinese prompts remain localised', async t => {
  const pending = deferred();
  const { default: Button } = await loadSource("export { default } from './src/components/CopySummaryButton.jsx'", {
    '../state/LanguageContext': { useLanguage: () => ({ language: 'zh' }) },
  }, { navigator: { clipboard: { writeText: () => pending.promise } } });
  let renderer, copying;
  await act(async () => { renderer = create(React.createElement(Button, { key: 'account-one', summary, materials: sources })); });
  t.after(() => act(async () => renderer.unmount()));
  await act(async () => { copying = renderer.root.findByType('button').props.onClick(); });
  await act(async () => renderer.update(React.createElement(Button, { key: 'account-two', summary, materials: sources })));
  await act(async () => { pending.resolve(); await copying; });
  assert.equal(text(renderer.root), '复制总结');
  await act(async () => renderer.root.findByType('button').props.onClick());
  assert.match(text(renderer.root), /总结和资料来源已复制/);
});

test('unsupported clipboard shows a clear Chinese manual-copy fallback', async t => {
  const { default: Button } = await loadSource("export { default } from './src/components/CopySummaryButton.jsx'", {
    '../state/LanguageContext': { useLanguage: () => ({ language: 'zh' }) },
  }, { navigator: {} });
  let renderer;
  await act(async () => { renderer = create(React.createElement(Button, { summary, materials: sources })); });
  t.after(() => act(async () => renderer.unmount()));
  await act(async () => renderer.root.findByType('button').props.onClick());
  assert.match(text(renderer.root), /请选中总结文字后手动复制/);
});

test('changing the summary during a pending copy keeps the button locked until the old write finishes', async t => {
  const pending = deferred(), copied = [];
  const { default: Button } = await loadSource("export { default } from './src/components/CopySummaryButton.jsx'", {
    '../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) },
  }, { navigator: { clipboard: { writeText: value => { copied.push(value); return pending.promise; } } } });
  let renderer, copying;
  await act(async () => { renderer = create(React.createElement(Button, { summary, materials: sources })); });
  t.after(() => act(async () => renderer.unmount()));
  await act(async () => { copying = renderer.root.findByType('button').props.onClick(); });
  const fresh = { ...summary, paragraph: 'A newly generated summary.' };
  await act(async () => renderer.update(React.createElement(Button, { summary: fresh, materials: sources })));
  assert.equal(renderer.root.findByType('button').props.disabled, true);
  assert.match(text(renderer.root), /Copying/);
  await act(async () => renderer.root.findByType('button').props.onClick());
  assert.equal(copied.length, 1);
  await act(async () => { pending.resolve(); await copying; });
  assert.equal(renderer.root.findByType('button').props.disabled, false);
  assert.doesNotMatch(text(renderer.root), /Summary and sources copied/);
  await act(async () => renderer.root.findByType('button').props.onClick());
  assert.match(copied[1], /^A newly generated summary\./);
});

test('Chinese upload limits and deletion confirmation translate without changing filenames', async t => {
  let language = 'zh';
  const name = 'Original 学习资料.pdf', prompts = [], removed = [];
  const material = { id: 7, courseId: 'a', name, type: 'PDF', content: 'Source content', status: 'Ready' };
  const data = { studentCourses: [{ id: 'a', code: 'SCI', name: 'Science' }], currentCourse: { id: 'a', code: 'SCI', name: 'Science' }, currentCourseId: 'a',
    courseMaterials: [material], materials: [material], uploadState: {}, courseState: {}, materialState: {},
    deleteMaterial: async id => { removed.push(id); return { ok: true }; }, selectCourse() {}, addMaterials() {}, cancelUpload() {}, retryCourses() {}, retryMaterials() {} };
  const window = memoryWindow(); window.confirm = value => { prompts.push(value); return false; };
  const { default: Upload } = await loadSource("export { default } from './src/pages/student/UploadPage.jsx'", {
    '../../state/AppDataContext': { useAppData: () => data },
    '../../state/LanguageContext': { useLanguage: () => ({ language }) },
    '../../layouts/StudentLayout': ({ children, profileContent }) => React.createElement('main', null, children, profileContent),
    '../../components/Toolbar': () => null,
  }, { window });
  let renderer;
  await act(async () => { renderer = create(React.createElement(Upload)); });
  t.after(() => act(async () => renderer.unmount()));
  assert.match(text(renderer.root), /每批最多上传 3 个文件/);
  assert.match(text(renderer.root), /OCR 支持英语和简体中文/);
  assert.ok(renderer.root.findAllByType('h3').some(node => text(node) === name));
  await act(async () => renderer.root.findByProps({ 'aria-label': `删除 ${name}` }).props.onClick());
  assert.equal(prompts[0], `删除 ${name} 及使用该资料的学习记录？`);
  assert.equal(removed.length, 0);
  language = 'en'; await act(async () => renderer.update(React.createElement(Upload)));
  assert.match(text(renderer.root), /Choose up to 3 files per upload/);
  await act(async () => renderer.root.findByProps({ 'aria-label': `Delete ${name}` }).props.onClick());
  assert.equal(prompts[1], `Delete ${name} and the study records that use it?`);
});

test('both profile avatar entry points show Chinese file validation without calling profile save', async t => {
  let saved = 0;
  const data = { currentUser: { id: 1, name: 'Test User', email: 'test@example.com', role: 'Student' }, saveProfile: async () => saved++ };
  const { Profile, Picker } = await loadSource("export {default as Profile} from './src/pages/student/ProfilePage.jsx'; export {default as Picker} from './src/components/AvatarPicker.jsx';", {
    '../../state/AppDataContext': { useAppData: () => data }, '../state/AppDataContext': { useAppData: () => data },
    '../../state/LanguageContext': { useLanguage: () => ({ language: 'zh' }) }, '../state/LanguageContext': { useLanguage: () => ({ language: 'zh' }) },
    '../../layouts/StudentLayout': ({ children }) => React.createElement('main', null, children),
  });
  for (const Component of [Profile, Picker]) {
    let renderer;
    await act(async () => { renderer = create(React.createElement(Component)); });
    t.after(() => act(async () => renderer.unmount()));
    await act(async () => renderer.root.findByProps({ type: 'file' }).props.onChange({ target: { files: [{ type: 'image/gif', size: 100 }], value: 'file' } }));
    assert.match(text(renderer.root), /请选择 PNG、JPG 或 WEBP 图片，大小不超过 5 MB/);
  }
  assert.equal(saved, 0);
});
