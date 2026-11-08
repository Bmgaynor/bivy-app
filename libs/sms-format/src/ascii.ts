// One character outside 7-bit ASCII switches an SMS from GSM-7 (160 chars per
// segment) to UCS-2 (70), so both the server's replies and the composer's
// outgoing messages are kept to plain ASCII.
export function isPlainAscii(s: string): boolean {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ASCII range check is intentional
  return /^[\x00-\x7F]*$/.test(s);
}

// What phone keyboards substitute for plain punctuation (iOS "smart
// punctuation" in particular), mapped back to ASCII.
const REPLACEMENTS: [RegExp, string][] = [
  // Tabs and line breaks first, so dropping control characters can't join words
  [/[\t\n\v\f\r]/g, " "],
  [/[‘’‚‛′]/g, "'"],
  [/[“”„‟″]/g, '"'],
  [/[‐-―−]/g, "-"],
  [/…/g, "..."],
  [/[  -​  　]/g, " "],
  [/°/g, " deg "],
];

/**
 * Replaces typographic punctuation with ASCII equivalents and drops any other
 * non-ASCII character (emoji, accents the keyboard added), so a composed
 * message always stays in the 160-char GSM-7 encoding.
 */
export function toAscii(s: string): string {
  let out = s;
  for (const [pattern, replacement] of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out.normalize("NFKD").replace(/[^\x20-\x7E]/g, "");
}
