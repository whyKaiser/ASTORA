import { HEADER_BYTES, inspectPackage } from './package.mjs';
import { readPrefix, remoteTotal, strongEtag } from './network.mjs';
import { AstoraError, publicError } from './errors.mjs';

export async function inspectSource(source, item, request, signal) {
  if (item.platform && !['PS1', 'PS2', 'PSP', 'PS4'].includes(item.platform)) throw new AstoraError('UNSUPPORTED_PLATFORM');
  const response = await request(source.url, { headers: { Range: `bytes=0-${HEADER_BYTES - 1}` }, signal });
  try {
    const total = remoteTotal(response);
    const bytes = await readPrefix(response.stream, HEADER_BYTES);
    const info = inspectPackage(bytes, item);
    if (total !== null && total !== info.size) throw new AstoraError('SIZE_MISMATCH');
    const etag = strongEtag(response.headers.etag);
    return {
      ok: true, ...info, source: source.name, host: response.host,
      encrypted: response.encrypted, rangeSupported: response.status === 206,
      resumable: response.status === 206 && Boolean(etag),
      // Internal only: never expose resolved signed URL in reports or browser state.
      etag,
      checkedAt: new Date().toISOString()
    };
  } finally { response.stream.destroy(); }
}

export function safeInspection(result) {
  const { etag, ...safe } = result;
  return safe;
}

export async function inspectMirrors(item, request, signal) {
  const results = [];
  for (let index = 0; index < item.sources.length; index++) {
    try {
      const result = await inspectSource(item.sources[index], item, request, signal);
      results.push({ index, ...safeInspection(result) });
    } catch (error) {
      results.push({ index, ok: false, source: item.sources[index].name, ...publicError(error) });
    }
  }
  return results;
}
