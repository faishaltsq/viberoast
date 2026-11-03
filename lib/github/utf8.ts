/**
 * Trims a buffer to at most `maxBytes` such that it ends on a valid UTF-8 code point boundary.
 * Prevents Node's .toString('utf8') from encountering trailing incomplete multi-byte sequences
 * that get replaced with the replacement character U+FFFD (which expands by up to 2 bytes).
 */
export function trimToValidUtf8Boundary(buf: Buffer, maxBytes: number): Buffer {
  if (buf.byteLength <= maxBytes) return buf
  if (maxBytes <= 0) return Buffer.alloc(0)

  let end = maxBytes
  // UTF-8 continuation bytes are 10xxxxxx (0x80..0xBF)
  let i = end - 1
  while (i >= 0 && i >= end - 4 && (buf[i] & 0xc0) === 0x80) {
    i--
  }

  if (i >= 0 && i >= end - 4) {
    const lead = buf[i]
    let needed = 1
    if ((lead & 0xe0) === 0xc0) needed = 2
    else if ((lead & 0xf0) === 0xe0) needed = 3
    else if ((lead & 0xf8) === 0xf0) needed = 4

    if (end - i < needed) {
      end = i
    }
  }

  return buf.subarray(0, end)
}

/**
 * Slices a UTF-8 string to fit within `maxBytes` without inserting replacement characters
 * or leaving trailing surrogate code units.
 */
export function sliceUtf8String(str: string, maxBytes: number): string {
  const buf = Buffer.from(str, 'utf8')
  if (buf.byteLength <= maxBytes) return str
  const trimmed = trimToValidUtf8Boundary(buf, maxBytes)
  let decoded = trimmed.toString('utf8')
  if (/[\uD800-\uDBFF]$/.test(decoded)) {
    decoded = decoded.slice(0, -1)
  }
  return decoded
}
