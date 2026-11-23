/**
 * Multi-frame zstd decoding for DSH session logs.
 *
 * A session transcript is an append-only log where every record is its own
 * zstd frame. Node's `zstdDecompressSync` decodes only the first frame, so we
 * walk the frame headers ourselves and decompress each frame separately.
 */
import zlib from "node:zlib";

const FRAME_MAGIC = 0xfd2fb528;
const SKIPPABLE_MIN = 0x184d2a50;
const SKIPPABLE_MAX = 0x184d2a5f;

/** Byte length of one zstd frame starting at `offset`, or -1 when unreadable. */
function frameLength(buf, offset) {
  if (offset + 4 > buf.length) return -1;
  const magic = buf.readUInt32LE(offset);
  if (magic >= SKIPPABLE_MIN && magic <= SKIPPABLE_MAX) {
    if (offset + 8 > buf.length) return -1;
    return 8 + buf.readUInt32LE(offset + 4);
  }
  if (magic !== FRAME_MAGIC) return -1;

  let p = offset + 4;
  if (p >= buf.length) return -1;
  const descriptor = buf[p];
  p += 1;

  const fcsFlag = descriptor >> 6;
  const singleSegment = (descriptor >> 5) & 1;
  const checksum = (descriptor >> 2) & 1;
  const didFlag = descriptor & 3;

  if (!singleSegment) p += 1;
  p += [0, 1, 2, 4][didFlag];
  p += [singleSegment ? 1 : 0, 2, 4, 8][fcsFlag];

  for (;;) {
    if (p + 3 > buf.length) return -1;
    const header = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16);
    p += 3;
    const last = header & 1;
    const type = (header >> 1) & 3;
    const size = header >> 3;
    if (type === 3) return -1;
    p += size;
    if (p > buf.length) return -1;
    if (last) break;
  }
  if (checksum) p += 4;
  return p - offset;
}

/** Decompress every frame in `buf` and return the concatenated text. */
export function decodeAll(buf) {
  const parts = [];
  let offset = 0;
  while (offset < buf.length) {
    const length = frameLength(buf, offset);
    if (length <= 0) break;
    try {
      parts.push(zlib.zstdDecompressSync(buf.subarray(offset, offset + length)));
    } catch {
      break;
    }
    offset += length;
  }
  return Buffer.concat(parts).toString("utf8");
}
