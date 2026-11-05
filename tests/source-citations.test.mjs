import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseSourceCitations, citationSourceNumbers, sourceSections, citedSectionIndex } from '../shared/sourceCitations.mjs';
import { loadSource } from './helpers.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const text = node => typeof node === 'string' ? node : (node?.children || []).map(text).join('');

test('citations support page, slide and multiple numbered locations without inventing unsafe targets', () => {
  assert.deepEqual(parseSourceCitations('[S1] [S1, Slide 39] [S1, Slides 47, 69] [S2, Page 2] [S1, Slide 39]'), [
    { source: 1, label: '[S1]', location: null },
    { source: 1, label: '[S1, Slide 39]', location: { kind: 'slide', number: 39 } },
    { source: 1, label: '[S1, Slide 47]', location: { kind: 'slide', number: 47 } },
    { source: 1, label: '[S1, Slide 69]', location: { kind: 'slide', number: 69 } },
    { source: 2, label: '[S2, Page 2]', location: { kind: 'page', number: 2 } },
  ]);
  assert.deepEqual(parseSourceCitations('[S0] [S01] [S9007199254740993]'), []);
  assert.deepEqual(parseSourceCitations('[S1, Slide 0, -2, 9007199254740993]'), [{ source: 1, label: '[S1]', location: null }]);
  assert.deepEqual(parseSourceCitations('[S1, Slide 2, bad, 3]'), [
    { source: 1, label: '[S1, Slide 2]', location: { kind: 'slide', number: 2 } },
    { source: 1, label: '[S1, Slide 3]', location: { kind: 'slide', number: 3 } },
  ]);
  assert.deepEqual(citationSourceNumbers('[S0] [S999, Slide 39] [s2, Page 2]'), [0, 999, 2]);
  assert.deepEqual(parseSourceCitations('[S1, S2] [S1, Slide 39; S2, Page 2]'), [
    { source: 1, label: '[S1]', location: null }, { source: 2, label: '[S2]', location: null },
    { source: 1, label: '[S1, Slide 39]', location: { kind: 'slide', number: 39 } },
    { source: 2, label: '[S2, Page 2]', location: { kind: 'page', number: 2 } },
  ]);
  assert.deepEqual(citationSourceNumbers('[S1, S999] [S1, Slide 39; S0, Page 2]'), [1, 999, 1, 0]);
});

test('section lookup preserves all original text and never confuses a page with a slide', () => {
  const content = 'Introduction\nPage 1\nFirst source.\n\nPage 2\nSecond source.\n';
  const sections = sourceSections(content);
  assert.equal(sections.map(section => section.text).join(''), content);
  assert.equal(sections[citedSectionIndex(sections, { kind: 'page', number: 2 })].text, 'Page 2\nSecond source.\n');
  assert.equal(citedSectionIndex(sections, { kind: 'slide', number: 2 }), -1);
  assert.equal(citedSectionIndex(sections, { kind: 'page', number: 999 }), -1);
  assert.deepEqual(sourceSections('No page headings here'), [{ text: 'No page headings here', kind: null, number: null }]);
});

test('answer citation locations stay attached to recorded source order and authenticated scope', async () => {
  const { answerSources } = await loadSource('src/utils/answerSources.js');
  const scope = { userId: 7, courseId: 'course-a', scopeKey: 'owned-scope' };
  const record = { ...scope, role: 'AI', mode: 'api', text: 'One fact [S1, Slide 39], two locations [S2, Page 2, 3], invalid [S999, Page 1].' };
  const materials = [{ id: 11, ownerId: 7, courseId: 'course-a' }, { id: 12, ownerId: 7, courseId: 'course-a' }];
  const manifest = { scopeKey: scope.scopeKey, materialIds: [11, 12] };
  const sources = answerSources(record, manifest, scope, [...materials].reverse());
  assert.deepEqual(sources.map(item => [item.label, item.material.id, item.location]), [
    ['[S1, Slide 39]', 11, { kind: 'slide', number: 39 }],
    ['[S2, Page 2]', 12, { kind: 'page', number: 2 }],
    ['[S2, Page 3]', 12, { kind: 'page', number: 3 }],
  ]);
  assert.deepEqual(answerSources({ ...record, userId: 8 }, manifest, scope, materials), []);
  assert.deepEqual(answerSources(record, manifest, scope, [{ ...materials[0], ownerId: 8 }, materials[1]]), []);
});

async function previewSetup(t, material, props = {}) {
  const calls = [];
  const { default: Preview } = await loadSource("export { default } from './src/components/MaterialSourcePreview.jsx';", {
    '../state/LanguageContext': { useLanguage: () => ({ language: 'en' }) },
    './HistoryRecordDialog': ({ children }) => React.createElement('section', { role: 'dialog' }, children),
  });
  let renderer;
  await act(async () => { renderer = create(React.createElement(Preview, { material, onClose() {}, ...props }), {
    createNodeMock: element => element.type === 'mark' ? { scrollIntoView: input => calls.push(input), focus: () => calls.push('focus') } : null,
  }); });
  t.after(() => act(async () => renderer.unmount()));
  return { renderer, calls, Preview };
}

test('PDF cited pages highlight the matching extracted section and target only a verified original page', async t => {
  const material = { id: 'owned', name: 'lecture.pdf', type: 'PDF', hasOriginal: true,
    content: 'Page 1\nFirst page.\n\nPage 2\nSecond page <script>not executable</script>.\n' };
  const app = await previewSetup(t, material, { sourceLabel: '[S1, Page 2]' });
  assert.match(text(app.renderer.root.findByType('mark')), /^Page 2/);
  assert.deepEqual(app.calls, [{ block: 'start', behavior: 'auto' }, 'focus']);
  assert.equal(app.renderer.root.findAllByType('a')[0].props.href, '/api/materials/owned/original?preview=1#page=2');
  const html = renderToStaticMarkup(React.createElement(app.Preview, { material, sourceLabel: '[S1, Page 2]', onClose() {} }));
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('missing pages fall back to complete text without a fabricated original-page target', async t => {
  const material = { id: 1, name: 'source.pdf', type: 'PDF', hasOriginal: true, content: 'Page 1\nComplete source.' };
  const app = await previewSetup(t, material, { location: { kind: 'page', number: 8 } });
  assert.equal(app.renderer.root.findAllByType('mark').length, 0);
  assert.equal(text(app.renderer.root.findByType('pre')), material.content);
  assert.match(text(app.renderer.root), /could not be located/);
  assert.equal(app.renderer.root.findAllByType('a')[0].props.href, '/api/materials/1/original?preview=1');
});

test('slide targets highlight extracted text and retain Office download-only handling', async t => {
  const app = await previewSetup(t, { id: 2, name: 'slides.pptx', type: 'PPTX', hasOriginal: true,
    content: 'Slide 47\nThe first referenced fact.\n\nSlide 69\nAnother fact.' }, { location: { kind: 'slide', number: 69 } });
  assert.match(text(app.renderer.root.findByType('mark')), /^Slide 69/);
  assert.equal(app.renderer.root.findAllByType('a').length, 1);
  assert.equal(app.renderer.root.findByType('a').props.href, '/api/materials/2/original');
});
