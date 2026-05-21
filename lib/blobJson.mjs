import { brotliCompressSync, brotliDecompressSync, gunzipSync, constants } from 'zlib';

// Blobs are stored Brotli-compressed to cut storage/transfer (~6x smaller than
// raw JSON, ~1.7x better than gzip). Filenames keep the .json extension; the
// compression is internal and handled here on read/write.
// Quality 10 is the size/speed knee: near-max ratio at ~2x faster encode than 11.
export function compressJson(obj) {
  return brotliCompressSync(Buffer.from(JSON.stringify(obj)), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 10 },
  });
}

// Drop payload the app never reads: top-level compareData/compareSites and
// per-row compactHHs (~82% of the raw export). Source snap JSON still has them
// if ever needed. Idempotent — safe to run on already-pruned bodies.
export function prune(body) {
  const { compareData, compareSites, ...rest } = body;
  if (Array.isArray(rest.data)) {
    rest.data = rest.data.map(({ compactHHs, ...row }) => row);
  }
  return rest;
}

// Reads a fetch() Response for a blob and returns the parsed JSON. Handles
// Brotli (current), gzip (transitional), and plain JSON (legacy) blobs.
export async function parseBlobResponse(response) {
  const buf = Buffer.from(await response.arrayBuffer());
  let text;
  if (buf.length > 1 && buf[0] === 0x1f && buf[1] === 0x8b) {
    text = gunzipSync(buf).toString();
  } else {
    try {
      text = brotliDecompressSync(buf).toString();
    } catch {
      text = buf.toString();
    }
  }
  return JSON.parse(text);
}
