// Opt-in network smoke check. Not run by CI; reads headers, not full packages.
import { readFile } from 'node:fs/promises';
import { normalizeCatalog } from '../src/catalog.mjs';
import { inspectMirrors } from '../src/inspect.mjs';
import { createTransport } from '../src/network.mjs';

const catalog = normalizeCatalog(JSON.parse(await readFile(new URL('../catalogs/homebrew.json', import.meta.url), 'utf8')));
const request = createTransport();
for (const item of catalog.items) {
  const results = await inspectMirrors(item, request);
  console.log(JSON.stringify({ title: item.title, results }, null, 2));
  if (!results.some(result => result.ok)) process.exitCode = 1;
}
