import { AstoraError } from './errors.mjs';

export const HEADER_BYTES = 8192;

export function inspectPackage(bytes, expected = {}) {
  const buffer = Buffer.from(bytes);
  const text = buffer.subarray(0, 256).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (/^(<!doctype\s+html|<html|<head|<body|<\?xml)/i.test(text)) throw new AstoraError('HTML_PAGE');
  const hex = buffer.subarray(0, 8).toString('hex');
  if (['526172211a07', '504b0304', '504b0506', '504b0708', '377abcaf271c', '1f8b'].some(magic => hex.startsWith(magic))) throw new AstoraError('ARCHIVE');
  if (!buffer.length || buffer.every(byte => byte === 0)) throw new AstoraError('EMPTY_FILE');
  if (buffer.length < HEADER_BYTES || buffer.readUInt32BE(0) !== 0x7f434e54) throw new AstoraError('INVALID_PACKAGE');
  const contentId = buffer.subarray(0x40, 0x64).toString('ascii');
  const match = /^[A-Z]{2}\d{4}-([A-Z]{4}\d{5})_\d{2}-[A-Z0-9_]{16}$/.exec(contentId);
  const size64 = buffer.readBigUInt64BE(0x430);
  if (!match || size64 < BigInt(HEADER_BYTES) || size64 > BigInt(Number.MAX_SAFE_INTEGER)) throw new AstoraError('INVALID_PACKAGE');
  const size = Number(size64);
  const type = buffer.readUInt32BE(0x74);
  const flags = buffer.readUInt32BE(0x78);
  if (![0x1a, 0x1b, 0x1c, 0x1e].includes(type)) throw new AstoraError('INVALID_PACKAGE');
  const kind = type === 0x1b || type === 0x1c ? 'dlc' : type === 0x1e || (flags & 0x60100000) !== 0 ? 'update' : 'base';
  if (expected.titleId && expected.titleId !== match[1]) throw new AstoraError('TITLE_MISMATCH', { expectedTitleId: expected.titleId, actualTitleId: match[1] });
  if (expected.kind && ((['app', 'game'].includes(expected.kind) && kind !== 'base') || (['update', 'dlc'].includes(expected.kind) && kind !== expected.kind))) throw new AstoraError('KIND_MISMATCH', { detectedKind: kind });
  if (expected.size && expected.size !== size) throw new AstoraError('SIZE_MISMATCH');
  return { contentId, titleId: match[1], size, kind, type, flags, validation: 'header-only' };
}
