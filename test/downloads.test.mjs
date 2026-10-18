import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DownloadManager } from '../src/downloads.mjs';
import { createTransport } from '../src/network.mjs';
import { fixtureServer, itemFor, hash, until } from './helpers.mjs';

async function setup(t) {
  const fixture = await fixtureServer();
  const directory = await mkdtemp(join(tmpdir(), 'astora-test-'));
  const manager = await new DownloadManager(directory, createTransport({ allowLoopbackForTests: true })).init();
  t.after(async () => { if (manager.active) await manager.active.done; await fixture.close(); await rm(directory, { recursive: true, force: true }); });
  return { fixture, directory, manager };
}
test('download completes with full SHA-256 verification; never reports installed', async t => {
  const { fixture, directory, manager } = await setup(t);
  const id = await manager.start(itemFor(fixture.url + '/good', { sha256: hash(fixture.bytes) }));
  await manager.active.done;
  assert.equal(manager.list()[0].state, 'downloaded'); assert.equal(manager.list()[0].hashMatched, true);
  assert.deepEqual(await readFile(join(directory, `${id}.pkg`)), fixture.bytes);
  assert.equal(manager.list()[0].bytes, fixture.bytes.length);
  assert.ok(!JSON.stringify(manager.list()).includes(fixture.url));
});
test('pause and restart recovery resumes exact bytes with a stable validator', async t => {
  const { fixture, directory, manager } = await setup(t);
  const id = await manager.start(itemFor(fixture.url + '/slow', { sha256: hash(fixture.bytes) }));
  await until(() => manager.jobs[0].bytes >= 16384);
  await manager.pause(id);
  const offset = (await stat(join(directory, `${id}.part`))).size;
  assert.ok(offset > 0 && offset < fixture.bytes.length);
  const reloaded = await new DownloadManager(directory, createTransport({ allowLoopbackForTests: true })).init();
  await reloaded.resume(id); await reloaded.active.done;
  assert.equal(reloaded.list()[0].state, 'downloaded');
  assert.ok(fixture.state.ranges.includes(`bytes=${offset}-`));
  assert.deepEqual(await readFile(join(directory, `${id}.pkg`)), fixture.bytes);
});
test('changed source validator cannot append different file to partial data', async t => {
  const { fixture, directory, manager } = await setup(t);
  const id = await manager.start(itemFor(fixture.url + '/slow'));
  await until(() => manager.jobs[0].bytes >= 16384); await manager.pause(id);
  const before = await readFile(join(directory, `${id}.part`));
  fixture.state.etag = '"fixture-v2"'; await manager.resume(id); await manager.active.done;
  assert.equal(manager.list()[0].error.code, 'SOURCE_CHANGED');
  assert.deepEqual(await readFile(join(directory, `${id}.part`)), before);
});
test('no strong ETag means no unsafe resume', async t => {
  const { fixture, manager } = await setup(t);
  const id = await manager.start(itemFor(fixture.url + '/no-etag'));
  await until(() => manager.jobs[0].bytes >= 16384); await manager.pause(id);
  await manager.resume(id); await manager.active.done;
  assert.equal(manager.list()[0].error.code, 'NO_RESUME');
});
test('hash mismatch keeps file unapproved and blocks a misleading completed state', async t => {
  const { fixture, directory, manager } = await setup(t);
  const id = await manager.start(itemFor(fixture.url + '/good', { sha256: 'a'.repeat(64) }));
  await manager.active.done;
  assert.equal(manager.list()[0].state, 'failed'); assert.equal(manager.list()[0].error.code, 'HASH_MISMATCH');
  await assert.rejects(stat(join(directory, `${id}.pkg`)), { code: 'ENOENT' });
});
test('busy download is rejected instead of registering a duplicate concurrent task', async t => {
  const { fixture, manager } = await setup(t);
  const item = itemFor(fixture.url + '/slow'); await manager.start(item);
  await assert.rejects(manager.start(item), { code: 'BUSY' }); await manager.active.done;
  assert.equal(manager.jobs.length, 1);
});
