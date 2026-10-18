import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { validateUrl } from './catalog.mjs';
import { AstoraError } from './errors.mjs';

export function isPublicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) ||
      (a === 192 && b === 88 && c === 99) || (a === 198 && [18, 19].includes(b)) ||
      (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) === 6) {
    // Limit IPv6 to ordinary global unicast; exclude mapped, transition and documentation ranges.
    const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1).toLowerCase();
    return /^[23]/.test(normalized) && !/^(2001:(?::|0:|db8:|2:|10:|20:)|2002:|3fff:)/.test(normalized);
  }
  return false;
}

async function resolveTarget(url, allowLoopbackForTests) {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let addresses;
  try { addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await lookup(hostname, { all: true }); }
  catch { throw new AstoraError('NETWORK_ERROR'); }
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address) && !(allowLoopbackForTests && ['127.0.0.1', '::1'].includes(address)))) throw new AstoraError('PRIVATE_ADDRESS');
  return addresses[0];
}

export function createTransport({ allowLoopbackForTests = false, timeout = 15000 } = {}) {
  return async function request(urlText, { headers = {}, signal } = {}) {
    let current = validateUrl(urlText);
    for (let hop = 0; hop <= 5; hop++) {
      const pinned = await resolveTarget(current, allowLoopbackForTests);
      const response = await new Promise((resolve, reject) => {
        const client = current.protocol === 'https:' ? https : http;
        const req = client.get(current, {
          headers: { 'User-Agent': 'ASTORA/0.1 (+https://github.com/whyKaiser/ASTORA)', 'Accept-Encoding': 'identity', ...headers },
          signal, agent: false,
          // Pin the validated address; keep hostname for TLS verification and Host.
          lookup: (_host, options, done) => options?.all ? done(null, [pinned]) : done(null, pinned.address, pinned.family)
        }, resolve);
        req.setTimeout(timeout, () => req.destroy(new AstoraError('TIMEOUT')));
        req.on('error', error => reject(error.code === 'TIMEOUT' ? error : new AstoraError('NETWORK_ERROR')));
      });
      response.setTimeout(timeout, () => response.destroy(new AstoraError('TIMEOUT')));
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.destroy();
        if (!response.headers.location || hop === 5) throw new AstoraError('REDIRECT_LIMIT');
        const next = validateUrl(new URL(response.headers.location, current).href);
        if (current.protocol === 'https:' && next.protocol === 'http:') throw new AstoraError('HTTPS_DOWNGRADE');
        current = next;
        continue;
      }
      const status = response.statusCode;
      if (status !== 200 && status !== 206) {
        response.destroy();
        const code = [401, 403].includes(status) ? 'AUTH_REQUIRED' : status === 404 ? 'NOT_FOUND' : status === 429 ? 'RATE_LIMIT' : 'HTTP_ERROR';
        throw new AstoraError(code, { status });
      }
      if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {
        response.destroy();
        throw new AstoraError('INVALID_PACKAGE');
      }
      return { stream: response, status, headers: response.headers, url: current.href, host: current.hostname, encrypted: current.protocol === 'https:' };
    }
  };
}

export async function readPrefix(stream, limit) {
  const chunks = [];
  let total = 0;
  try {
    for await (const chunk of stream) {
      const part = chunk.subarray(0, limit - total);
      chunks.push(part); total += part.length;
      if (total >= limit) break;
    }
    return Buffer.concat(chunks, total);
  } finally { stream.destroy(); }
}

export function strongEtag(value) {
  return typeof value === 'string' && /^"[\x21\x23-\x7e\x80-\xff]*"$/.test(value) ? value : null;
}

export function remoteTotal(response, start = 0) {
  if (response.status === 206) {
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers['content-range'] || '');
    if (!match || Number(match[1]) !== start || Number(match[2]) < start || Number(match[2]) >= Number(match[3])) throw new AstoraError('RANGE_INVALID');
    return Number(match[3]);
  }
  if (start !== 0) throw new AstoraError('NO_RESUME');
  const length = response.headers['content-length'];
  return length && /^\d+$/.test(length) ? Number(length) : null;
}
