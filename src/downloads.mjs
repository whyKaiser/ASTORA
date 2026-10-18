import { mkdir, readFile, writeFile, rename, stat, statfs, open } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { inspectSource } from './inspect.mjs';
import { inspectPackage, HEADER_BYTES } from './package.mjs';
import { remoteTotal, strongEtag } from './network.mjs';
import { AstoraError, publicError } from './errors.mjs';

const activeStates = ['checking', 'downloading', 'verifying'];

export class DownloadManager {
  constructor(directory, request) {
    this.directory = directory;
    this.request = request;
    this.jobs = [];
    this.active = null;
    this.saving = Promise.resolve();
  }

  async init() {
    await mkdir(this.directory, { recursive: true });
    try {
      const saved = JSON.parse(await readFile(join(this.directory, 'jobs.json'), 'utf8'));
      this.jobs = saved.filter(job => /^[a-f0-9-]{36}$/.test(job.id)).map(job => ({ ...job, state: activeStates.includes(job.state) ? 'paused' : job.state }));
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return this;
  }

  list() {
    return this.jobs.map(({ id, item, state, bytes, total, error, sha256, hashMatched, createdAt }) => ({
      id, title: item.title, state, bytes, total, error, sha256, hashMatched, createdAt,
      file: state === 'downloaded' ? `${id}.pkg` : null
    }));
  }

  save() {
    const snapshot = JSON.stringify(this.jobs, null, 2);
    this.saving = this.saving.catch(() => {}).then(async () => {
      await writeFile(join(this.directory, 'jobs.json.tmp'), snapshot);
      await rename(join(this.directory, 'jobs.json.tmp'), join(this.directory, 'jobs.json'));
    });
    return this.saving;
  }

  async start(item, sourceIndex = 0) {
    if (this.active) throw new AstoraError('BUSY');
    if (!Number.isInteger(sourceIndex) || !item.sources[sourceIndex]) throw new AstoraError('CATALOG_INVALID');
    const job = { id: randomUUID(), item, sourceIndex, state: 'checking', bytes: 0, total: null, createdAt: new Date().toISOString(), error: null };
    this.jobs.unshift(job);
    this.launch(job, false);
    return job.id;
  }

  async resume(id) {
    if (this.active) throw new AstoraError('BUSY');
    const job = this.jobs.find(entry => entry.id === id);
    if (!job || !['paused', 'failed'].includes(job.state)) throw new AstoraError('NOT_READY');
    this.launch(job, true);
  }

  async pause(id) {
    if (!this.active || this.active.job.id !== id || this.active.job.state === 'verifying') throw new AstoraError('NOT_READY');
    this.active.pause = true;
    this.active.controller.abort();
    await this.active.done;
  }

  launch(job, resume) {
    job.state = 'checking'; job.error = null;
    const active = { job, controller: new AbortController(), pause: false };
    this.active = active;
    active.done = this.run(job, resume, active).catch(error => {
      job.state = active.pause ? 'paused' : 'failed';
      job.error = active.pause ? null : publicError(error);
    }).finally(async () => {
      try { await this.save(); } catch { job.error = publicError(new AstoraError('IO_ERROR')); job.state = 'failed'; }
      this.active = null;
    });
  }

  async run(job, resume, active) {
    await this.save();
    const source = job.item.sources[job.sourceIndex];
    const partPath = join(this.directory, `${job.id}.part`);
    let offset = 0;
    if (resume) {
      try { offset = (await stat(partPath)).size; } catch (error) { if (error.code !== 'ENOENT') throw new AstoraError('IO_ERROR'); }
    }
    const probe = await inspectSource(source, job.item, this.request, active.controller.signal);
    if (active.pause) return void (job.state = 'paused');
    if (offset > 0 && (!job.etag || !probe.resumable)) throw new AstoraError('NO_RESUME');
    if (offset > 0 && (job.etag !== probe.etag || job.total !== probe.size)) throw new AstoraError('SOURCE_CHANGED');
    if (offset > probe.size) throw new AstoraError('SIZE_MISMATCH');
    job.etag = probe.etag; job.total = probe.size; job.bytes = offset;
    const space = await statfs(this.directory);
    if (space.bavail * space.bsize < probe.size - offset + 64 * 1024 * 1024) throw new AstoraError('DISK_SPACE');
    if (offset !== probe.size) {
      const response = await this.request(source.url, {
        headers: offset ? { Range: `bytes=${offset}-`, 'If-Range': job.etag } : {},
        signal: active.controller.signal
      });
      let file;
      try {
        if (offset && response.status !== 206) throw new AstoraError('NO_RESUME');
        if (offset && response.headers.etag !== job.etag) throw new AstoraError('SOURCE_CHANGED');
        const total = remoteTotal(response, offset);
        if (total !== null && total !== probe.size) throw new AstoraError('SIZE_MISMATCH');
        // Adopt the full response's validator, not the separate preflight's validator.
        if (!offset) job.etag = strongEtag(response.headers.etag);
        file = await open(partPath, offset ? 'a' : 'w');
        job.state = 'downloading';
        await this.save();
        let prefix = Buffer.alloc(0);
        let headerChecked = offset > 0;
        let lastSave = Date.now();
        for await (const chunk of response.stream) {
          if (active.pause) break;
          if (job.bytes + chunk.length > probe.size) throw new AstoraError('SIZE_MISMATCH');
          let writable = chunk;
          if (!headerChecked) {
            prefix = Buffer.concat([prefix, chunk]);
            if (prefix.length < HEADER_BYTES) continue;
            inspectPackage(prefix, { ...job.item, titleId: probe.titleId, size: probe.size });
            headerChecked = true; writable = prefix; prefix = null;
          }
          if (job.bytes + writable.length > probe.size) throw new AstoraError('SIZE_MISMATCH');
          await file.writeFile(writable);
          job.bytes += writable.length;
          if (Date.now() - lastSave > 2000) { await this.save(); lastSave = Date.now(); }
        }
        if (active.pause) return void (job.state = 'paused');
        if (!headerChecked || job.bytes !== probe.size) throw new AstoraError('SIZE_MISMATCH');
      } catch (error) {
        if (['ENOSPC', 'EACCES', 'EPERM', 'EIO'].includes(error.code)) throw new AstoraError('IO_ERROR');
        throw error;
      } finally { response.stream.destroy(); await file?.close(); }
    }
    job.state = 'verifying'; await this.save();
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(partPath)) hash.update(chunk);
    job.sha256 = hash.digest('hex');
    if (job.item.sha256 && job.item.sha256 !== job.sha256) throw new AstoraError('HASH_MISMATCH');
    job.hashMatched = Boolean(job.item.sha256);
    await rename(partPath, join(this.directory, `${job.id}.pkg`));
    job.state = 'downloaded';
  }
}
