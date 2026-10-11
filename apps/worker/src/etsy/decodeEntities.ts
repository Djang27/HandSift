const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

const ENTITY = /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi;

/** Decodes the HTML entities Etsy uses in listing descriptions. Unknown entities are left as-is. */
export function decodeEntities(text: string): string {
  return text.replace(ENTITY, (match, body: string) => {
    if (body.startsWith("#")) {
      const code =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isInteger(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return NAMED[body.toLowerCase()] ?? match;
  });
}
