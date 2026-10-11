// Text helpers for signals. Pure.

/** Lowercases and normalizes punctuation so patterns can stay simple. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\ba\.i\.?(?=\W|$)/g, "ai")
    .replace(/\bleonardo\.ai\b/g, "leonardo ai")
    .replace(/[ \t]+/g, " ");
}

/** Splits text into sentences (and title segments like "a | b"). */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|[\n\r;|•]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
