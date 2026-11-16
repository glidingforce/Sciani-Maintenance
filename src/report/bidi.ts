import bidiFactory from 'bidi-js';

const bidi = bidiFactory();

/** True when the text's first strong character is right-to-left (e.g. Hebrew). */
export function isRtl(text: string): boolean {
  const lv = bidi.getEmbeddingLevels(text);
  return (lv.paragraphs[0]?.level ?? 0) % 2 === 1;
}

/**
 * Converts one already-wrapped line from logical order (as typed) to visual
 * order (left to right, as drawn), using the Unicode bidi algorithm with the
 * paragraph's own base direction. Hebrew needs no letter shaping, so
 * reordering plus bracket mirroring is enough for correct display.
 */
export function toVisual(line: string, rtlBase: boolean): string {
  if (!line) return line;
  const levels = bidi.getEmbeddingLevels(line, rtlBase ? 'rtl' : 'ltr');
  const chars = line.split('');
  bidi.getMirroredCharactersMap(line, levels.levels).forEach((ch, i) => (chars[i] = ch));
  for (const [start, end] of bidi.getReorderSegments(line, levels)) {
    const seg = chars.slice(start, end + 1).reverse();
    chars.splice(start, seg.length, ...seg);
  }
  return chars.join('');
}
