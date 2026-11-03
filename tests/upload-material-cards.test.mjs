import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { loadSource, memoryWindow } from './helpers.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node)
  : (node?.children || []).map(text).join('');
const button = (root, label) => {
  const found = root.findAllByType('button').find(node => text(node) === label);
  assert.ok(found, `Missing button: ${label}`);
  return found;
};
const cardNodes = root => root.findAllByType('article').filter(node => String(node.props.className || '').split(' ').includes('upload-material-card'));

async function setup(t) {
  const longName = 'Long course introduction and revision material '.repeat(5) + '.pdf';
  const first = { id: 10, ownerId: 1, courseId: 'a', name: longName, type: 'PDF', size: 10240,
    content: 'START ' + 'Source paragraph. '.repeat(200) + 'END OF FULL SOURCE', hasOriginal: true,
    status: 'Ready', updatedAt: '2026-10-30 10:15:00' };
  const legacy = { id: 11, ownerId: 1, courseId: 'a', name: 'older-notes.txt', type: 'TXT', size: 234,
    content: 'Full legacy text.', hasOriginal: false, status: 'Ready with warning', updatedAt: 'Just now',
    parseWarning: 'No readable text was found on page 3. Check the original.' };
  const other = { ...first, id: 20, courseId: 'b', name: 'other-course.pdf', content: 'Other course source.' };
  const courses = [{ id: 'a', code: 'A', name: 'First course' }, { id: 'b', code: 'B', name: 'Second course' }];
  const all = [first, legacy, other];
  const state = {
    currentUser: { id: 1, role: 'Student' }, studentCourses: courses, materials: all,
    currentCourse: courses[0], currentCourseId: 'a', courseMaterials: [first, legacy],
    selectCourse() {}, addMaterials: async () => ({ ok: true }), deleteMaterial: async () => ({ ok: true }),
    cancelUpload() {}, retryCourses() {}, retryMaterials() {},
    courseState: { loading: false }, materialState: { loading: false }, uploadState: { pending: false },
  };
  const language = { useLanguage: () => ({ language: 'en' }) };
  const { default: Upload } = await loadSource("export {default} from './src/pages/student/UploadPage.jsx';", {
    '../../state/AppDataContext': { useAppData: () => state },
    '../../state/LanguageContext': language, '../state/LanguageContext': language,
    '../../layouts/StudentLayout': ({ children }) => React.createElement('main', null, children),
    '../../components/Toolbar': ({ value, onChange }) => React.createElement('input', {
      'aria-label': 'Search materials', value, onChange: event => onChange(event.target.value),
    }),
    './HistoryRecordDialog': ({ title, closeLabel, onClose, children }) => React.createElement('section', {
      role: 'dialog', 'aria-label': title,
    }, React.createElement('button', { type: 'button', onClick: onClose }, closeLabel), children),
  }, { window: memoryWindow() });
  let renderer, revision = 0;
  await act(async () => { renderer = create(React.createElement(Upload)); });
  t.after(() => act(async () => renderer.unmount()));
  const rerender = () => act(async () => { renderer.update(React.createElement(Upload, { revision: ++revision })); });
  return { renderer, first, legacy, other, state,
    open: async material => {
      await act(async () => renderer.root.findByProps({ 'aria-label': `View material ${material.name}` }).props.onClick());
    },
    rerender,
    changeCourse: async id => {
      state.currentCourseId = id;
      state.currentCourse = courses.find(course => course.id === id);
      state.courseMaterials = all.filter(material => material.courseId === id);
      await rerender();
    },
  };
}

test('material cards retain full filenames and actions while complete source text opens only in the preview', async t => {
  const app = await setup(t);
  const cards = cardNodes(app.renderer.root);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].findByType('h3').children.join(''), app.first.name);
  assert.equal(cards[0].findAllByType('pre').length, 0, 'Full text must not expand every card');
  assert.equal(cards[0].findAllByType('details').length, 0);
  assert.ok(cards[0].findByProps({ 'aria-label': `View material ${app.first.name}` }));
  assert.ok(cards[0].findByProps({ 'aria-label': `Delete ${app.first.name}` }));
  assert.equal(cards[0].findByProps({ 'aria-label': `Download original ${app.first.name}` }).props.href, '/api/materials/10/original');
  await app.open(app.first);
  const preview = app.renderer.root.findByProps({ role: 'dialog' });
  assert.equal(preview.props['aria-label'], app.first.name);
  assert.equal(preview.findByType('pre').children.join(''), app.first.content, 'Preview includes content beyond the former 2,000-character excerpt');
  assert.deepEqual(preview.findAllByType('a').map(node => node.props.href), ['/api/materials/10/original?preview=1', '/api/materials/10/original']);
  assert.equal(preview.findAllByType('a')[0].props.rel, 'noopener noreferrer');
  await act(async () => button(preview, 'Close source preview').props.onClick());
  assert.equal(app.renderer.root.findAllByProps({ role: 'dialog' }).length, 0);
  assert.equal(cardNodes(app.renderer.root).length, 2);
});

test('older materials offer extracted text without fake original links and keep their exact reading warning visible', async t => {
  const app = await setup(t);
  const legacyCard = cardNodes(app.renderer.root).find(node => text(node).includes(app.legacy.name));
  assert.equal(legacyCard.findAllByType('a').length, 0);
  assert.match(text(legacyCard), /Extracted text available/);
  await app.open(app.legacy);
  const preview = app.renderer.root.findByProps({ role: 'dialog' });
  assert.match(text(preview), /original file was not saved/);
  assert.match(text(preview), /not the original file/);
  assert.ok(text(preview).includes(app.legacy.parseWarning));
  assert.equal(preview.findAllByType('a').length, 0);
  assert.equal(preview.findByType('pre').children.join(''), app.legacy.content);
});

test('no search match offers Clear search and restores cards without pretending the course has no materials', async t => {
  const app = await setup(t);
  const search = () => app.renderer.root.findByProps({ 'aria-label': 'Search materials' });
  await act(async () => search().props.onChange({ target: { value: 'not-a-material-name' } }));
  assert.equal(cardNodes(app.renderer.root).length, 0);
  assert.match(text(app.renderer.root), /No materials match your search/);
  assert.doesNotMatch(text(app.renderer.root), /No materials in this course yet/);
  await act(async () => button(app.renderer.root, 'Clear search').props.onClick());
  assert.equal(search().props.value, '');
  assert.equal(cardNodes(app.renderer.root).length, 2);
  await act(async () => search().props.onChange({ target: { value: 'txt' } }));
  assert.equal(cardNodes(app.renderer.root).length, 1);
  assert.ok(text(cardNodes(app.renderer.root)[0]).includes(app.legacy.name));
});

test('changing courses or removing the material from current data closes the preview without displaying another source', async t => {
  const app = await setup(t);
  await app.open(app.first);
  await app.changeCourse('b');
  assert.equal(app.renderer.root.findAllByProps({ role: 'dialog' }).length, 0);
  assert.doesNotMatch(text(app.renderer.root), /END OF FULL SOURCE/);
  await app.changeCourse('a');
  assert.equal(app.renderer.root.findAllByProps({ role: 'dialog' }).length, 0, 'Returning to the first course does not reopen a stale preview');
  await app.open(app.legacy);
  app.state.courseMaterials = [app.first];
  app.state.materials = app.state.materials.filter(material => material.id !== app.legacy.id);
  await app.rerender();
  assert.equal(app.renderer.root.findAllByProps({ role: 'dialog' }).length, 0);
  assert.equal(cardNodes(app.renderer.root).length, 1);
});
