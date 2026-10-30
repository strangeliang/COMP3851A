import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { deferred, jsonReply, loadSource, memoryWindow } from './helpers.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const user = { id: 1, name: 'Student', email: 'student@example.test', role: 'Student', status: 'Active' };
const courses = [{ id: 'a', code: 'A', name: 'Course A' }, { id: 'b', code: 'B', name: 'Course B' }];
const material = id => ({ id, course_id: 'a', name: `material-${id}.txt`, type: 'TXT', size_bytes: 12, content: 'Study content', status: 'Ready' });

async function harness(t, handler) {
  let data;
  const calls = [];
  const modules = await loadSource("export {AppDataProvider, useAppData} from './src/state/AppDataContext.jsx';", {}, {
    window: memoryWindow(),
    fetch: async (url, options = {}) => {
      const call = { url, method: options.method || 'GET', signal: options.signal };
      calls.push(call);
      const custom = await handler?.(call);
      if (custom !== undefined) return custom;
      if (url === '/api/auth/me') return jsonReply({ user });
      if (url === '/api/ai/status') return jsonReply({ configured: false });
      if (url === '/api/history') return jsonReply({ records: [] });
      if (url === '/api/courses') return jsonReply({ courses });
      if (url === '/api/courses/a/materials') return jsonReply({ materials: [material(1), material(2)] });
      if (url === '/api/courses/b/materials') return jsonReply({ materials: [] });
      if (call.method === 'DELETE') return jsonReply({ ok: true });
      throw new Error(`Unexpected request: ${url}`);
    },
  });
  function Observer() { data = modules.useAppData(); return null; }
  let renderer;
  await act(async () => { renderer = create(React.createElement(modules.AppDataProvider, null, React.createElement(Observer))); });
  t.after(() => act(() => renderer.unmount()));
  return { get data() { return data; }, calls };
}

test('deleting another course preserves the active material selection and workspace scope', async t => {
  const app = await harness(t);
  await act(() => app.data.setSelectedMaterialIds([2]));
  const before = app.data.scope;
  const reads = app.calls.filter(call => call.url === '/api/courses/a/materials').length;
  await act(async () => { assert.equal((await app.data.deleteCourse('b')).ok, true); });
  assert.equal(app.data.currentCourseId, 'a');
  assert.deepEqual(app.data.selectedMaterialIds, [2]);
  assert.equal(app.data.scope.scopeKey, before.scopeKey);
  assert.equal(app.calls.filter(call => call.url === '/api/courses/a/materials').length, reads, 'An unrelated deletion should not reload or reset the active course');
});

test('a material read started during deletion cannot restore the deleted material', async t => {
  const deletion = deferred(), staleRead = deferred();
  let reads = 0, deleted = false;
  const app = await harness(t, call => {
    if (call.url === '/api/materials/1' && call.method === 'DELETE') return deletion.promise;
    if (call.url === '/api/courses/a/materials') {
      reads++;
      if (reads === 2) return staleRead.promise;
      return jsonReply({ materials: deleted ? [material(2)] : [material(1), material(2)] });
    }
  });
  let remove;
  await act(async () => { remove = app.data.deleteMaterial(1); });
  await act(async () => { app.data.selectCourse('a'); });
  deleted = true;
  await act(async () => { deletion.resolve(jsonReply({ ok: true })); assert.equal((await remove).ok, true); });
  await act(async () => { staleRead.resolve(jsonReply({ materials: [material(1), material(2)] })); });
  assert.deepEqual(app.data.courseMaterials.map(item => item.id), [2]);
  assert.equal(app.data.materialState.loading, false);
  assert.equal(app.data.materialState.ready, true);
});

for (const resource of ['material', 'course']) {
  test(`a late history refresh cannot restore records removed with a ${resource}`, async t => {
    const oldHistory = deferred();
    let reads = 0;
    const app = await harness(t, call => {
      if (call.url === '/api/history' && call.method === 'GET') {
        return ++reads === 1 ? oldHistory.promise : jsonReply({ records: [] });
      }
    });
    await act(async () => {
      const result = resource === 'material' ? await app.data.deleteMaterial(1) : await app.data.deleteCourse('a');
      assert.equal(result.ok, true);
    });
    await act(async () => {
      oldHistory.resolve(jsonReply({ records: [{ id: '1:old-summary', owner_id: 1, course_id: 'a', kind: 'summary', created_at: '2026-10-30 12:00:00',
        payload: { selectedMaterialIds: [1], summary: { paragraph: 'Removed material summary', concepts: [] } } }] }));
    });
    assert.deepEqual(app.data.summaryRecords, []);
  });
}
