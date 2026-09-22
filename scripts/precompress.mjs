// Precompresses the built assets so the server can hand them over already
// compressed, at no per-request cost.
//
// Why this exists: a phone reaching the VPS over a Tailscale relay gets tens
// of KB/s, and the client ships ~4.4 MB of uncompressed JavaScript. At that
// rate the bundle does not arrive before something cuts the connection. Brotli
// at maximum quality is expensive once and free forever after, which is the
// right trade for files whose names already carry a content hash.
import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { brotliCompressSync, gzipSync, constants } from 'zlib';

const DIST = join(process.cwd(), 'dist');
const COMPRESSIBLE = new Set(['.js', '.css', '.svg', '.json', '.map']);
const MIN_BYTES = 1024; // below this the header overhead is not worth it

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

let files = 0;
let before = 0;
let after = 0;

for (const file of walk(DIST)) {
  if (!COMPRESSIBLE.has(extname(file))) continue;
  const source = readFileSync(file);
  if (source.length < MIN_BYTES) continue;

  const brotli = brotliCompressSync(source, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_SIZE_HINT]: source.length,
    },
  });
  writeFileSync(file + '.br', brotli);
  writeFileSync(file + '.gz', gzipSync(source, { level: 9 }));

  files += 1;
  before += source.length;
  after += brotli.length;
}

const mb = bytes => (bytes / 1024 / 1024).toFixed(2) + ' MB';
console.log(`precompress: ${files} archivos · ${mb(before)} → ${mb(after)} con brotli`);
